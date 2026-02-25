/**
 * Edge 2b — COMPOSE: ProblemScoreBank + CurveMethod → Curve
 *
 * Enables per-problem score pooling across different exam versions,
 * then composes ability_curves and overall_mean via Monte Carlo simulation.
 *
 * Key difference from computeCurve (pool-based):
 *   computeCurve:  all students must have the same problem set (homogeneous pool)
 *   composeCurve:  students can have different problem sets; data is pooled per-problem
 *
 * Compositional approach:
 *   problem_curves  — computed directly from per-problem raw scores (larger samples)
 *   ability_curves  — Monte Carlo: sample per-problem, compute ability, collect distribution
 *   overall_mean    — Monte Carlo: sample per-problem, compute final_total, collect distribution
 *
 * Run: npx tsx v3-effect/compose-curve.ts
 */

import { Option, Schema } from "effect";
import {
  type CurveMethod,
  type Dimension,
  type GradeThresholds,
  type JSONScores,
  type ProblemDimensionMap,
  type ProblemDigitId,
  type PromptSnapshot,
  type EventId,
  Curve as CurveSchema,
  DIMENSIONS,
  ProblemDimensionMap as ProblemDimensionMapSchema,
  PromptSnapshot as PromptSnapshotSchema,
  decodeCurve,
} from "./schemas.js";
import { thresholdsFromMethod } from "./compute-curve.js";

// =============================================================================
// Types
// =============================================================================

/** A single student's scores for one problem. */
export interface ProblemSampleEntry {
  readonly task_score: number;
  /** Keyed by Dimension. Only tested dimensions have values. */
  readonly dimension_scores: Readonly<Partial<Record<Dimension, number>>>;
}

/** All student data for one problem, pooled across events. */
export interface ProblemSlot {
  readonly problem_digit: ProblemDigitId;
  readonly problem_name: string;
  readonly tested_dimensions: readonly Dimension[];
  readonly source_event_ids: readonly EventId[];
  readonly entries: readonly ProblemSampleEntry[];
}

/**
 * Per-problem score bank: pools data at the problem level, not the exam level.
 *
 * Unlike ScorePool (which requires all students to have the same problem set),
 * ProblemScoreBank accepts students from different exam versions. Data is
 * organized per-problem, so P1 data from a 3-problem exam and P1 data from
 * a 4-problem exam are pooled together.
 */
export interface ProblemScoreBank {
  readonly label: string;
  readonly source_event_ids: readonly EventId[];
  readonly prompt_snapshot: PromptSnapshot;
  readonly slots: Readonly<Record<string, ProblemSlot>>;
}

// =============================================================================
// BankError — tagged union
// =============================================================================

export type BankError =
  | { readonly _tag: "no_scores" }
  | {
      readonly _tag: "dimmap_mismatch_for_problem";
      readonly problem_digit: string;
      readonly existing_dims: readonly string[];
      readonly new_dims: readonly string[];
    }
  | {
      readonly _tag: "prompt_mismatch_for_problem";
      readonly problem_digit: string;
      readonly diffs: readonly string[];
    };

export const formatBankError = (e: BankError): string => {
  switch (e._tag) {
    case "no_scores":
      return "No scores provided";
    case "dimmap_mismatch_for_problem":
      return `Dimension mismatch for problem ${e.problem_digit}: existing=[${e.existing_dims.join(",")}] new=[${e.new_dims.join(",")}]`;
    case "prompt_mismatch_for_problem":
      return `Prompt mismatch for problem ${e.problem_digit}: ${e.diffs.join("; ")}`;
  }
};

// =============================================================================
// buildBank — construct a ProblemScoreBank from heterogeneous JSONScores
// =============================================================================

/** Internal mutable builder state for a slot. */
interface SlotBuilder {
  problem_digit: ProblemDigitId;
  problem_name: string;
  tested_dimensions: Dimension[];
  source_event_ids: Set<string>;
  entries: ProblemSampleEntry[];
  /** Per-problem prompt entries for validation (key → sha256). */
  prompt_entries: Map<string, string>;
}

/**
 * Build a ProblemScoreBank from an array of JSONScores.
 *
 * Accepts scores from different exam versions (different problem sets).
 * For each problem, validates:
 *   - Same dimension set across all contributing scores
 *   - Same prompt entries (framework + problem-specific) across all scores
 *
 * Returns the bank or a BankError on validation failure.
 */
export function buildBank(
  label: string,
  allScores: readonly JSONScores[],
): ProblemScoreBank | BankError {
  if (allScores.length === 0) {
    return { _tag: "no_scores" };
  }

  const slots: Record<string, SlotBuilder> = {};
  const allEventIds = new Set<string>();

  // Framework entries from first score (reference)
  const frameworkRef = new Map<string, string>();
  for (const entry of allScores[0].prompt_snapshot.entries) {
    if (entry.key.startsWith("framework:")) {
      frameworkRef.set(entry.key, entry.sha256);
    }
  }

  for (const score of allScores) {
    allEventIds.add(score.event_id);

    // Check framework entries match reference
    const frameworkDiffs: string[] = [];
    for (const entry of score.prompt_snapshot.entries) {
      if (!entry.key.startsWith("framework:")) continue;
      const refHash = frameworkRef.get(entry.key);
      if (refHash !== undefined && refHash !== entry.sha256) {
        frameworkDiffs.push(
          `${entry.key}: ref=${refHash.slice(0, 8)}… score=${entry.sha256.slice(0, 8)}…`,
        );
      }
    }
    // Framework mismatch reported on first problem (it affects all problems)
    if (frameworkDiffs.length > 0) {
      const firstDigit =
        score.problem_scores[0]?.problem_id.digit ?? "unknown";
      return {
        _tag: "prompt_mismatch_for_problem",
        problem_digit: firstDigit,
        diffs: frameworkDiffs,
      };
    }

    for (const ps of score.problem_scores) {
      const digit = ps.problem_id.digit;

      // Get tested dimensions from the score's dimmap for this problem
      const scoreDims = score.dimension_map.entries
        .filter((e) => e.problem_id.digit === digit)
        .flatMap((e) => [...e.dimensions])
        .sort() as Dimension[];

      if (!slots[digit]) {
        // First time seeing this problem: create slot
        const promptEntries = new Map<string, string>();
        for (const entry of score.prompt_snapshot.entries) {
          if (entry.key.startsWith(`problem:${digit}:`)) {
            promptEntries.set(entry.key, entry.sha256);
          }
        }

        slots[digit] = {
          problem_digit: ps.problem_id.digit,
          problem_name: ps.problem_id.name,
          tested_dimensions: scoreDims,
          source_event_ids: new Set([score.event_id]),
          entries: [],
          prompt_entries: promptEntries,
        };
      } else {
        const existing = slots[digit];

        // Validate dimension set match
        const existingSorted = [...existing.tested_dimensions].sort();
        if (
          existingSorted.length !== scoreDims.length ||
          !existingSorted.every((d, i) => d === scoreDims[i])
        ) {
          return {
            _tag: "dimmap_mismatch_for_problem",
            problem_digit: digit,
            existing_dims: existingSorted,
            new_dims: scoreDims,
          };
        }

        // Validate problem-specific prompt entries match
        const promptDiffs: string[] = [];
        for (const entry of score.prompt_snapshot.entries) {
          if (!entry.key.startsWith(`problem:${digit}:`)) continue;
          const existingHash = existing.prompt_entries.get(entry.key);
          if (existingHash !== undefined && existingHash !== entry.sha256) {
            promptDiffs.push(
              `${entry.key}: existing=${existingHash.slice(0, 8)}… new=${entry.sha256.slice(0, 8)}…`,
            );
          }
        }
        if (promptDiffs.length > 0) {
          return {
            _tag: "prompt_mismatch_for_problem",
            problem_digit: digit,
            diffs: promptDiffs,
          };
        }

        existing.source_event_ids.add(score.event_id);
      }

      // Extract sample entry (task_score + tested dimension scores)
      const dimScores: Partial<Record<Dimension, number>> = {};
      for (const dim of DIMENSIONS) {
        const opt = ps.dimension_scores[dim];
        if (Option.isSome(opt)) {
          dimScores[dim] = opt.value;
        }
      }

      slots[digit].entries.push({
        task_score: ps.task_score as number,
        dimension_scores: dimScores,
      });
    }
  }

  // Build final immutable bank
  const finalSlots: Record<string, ProblemSlot> = {};
  for (const [digit, builder] of Object.entries(slots)) {
    finalSlots[digit] = {
      problem_digit: builder.problem_digit,
      problem_name: builder.problem_name,
      tested_dimensions: builder.tested_dimensions,
      source_event_ids: [...builder.source_event_ids] as EventId[],
      entries: builder.entries,
    };
  }

  return {
    label,
    source_event_ids: [...allEventIds] as EventId[],
    prompt_snapshot: allScores[0].prompt_snapshot,
    slots: finalSlots,
  };
}

// =============================================================================
// composeCurve — Monte Carlo composition from ProblemScoreBank
// =============================================================================

const encodeSnapshot = Schema.encodeSync(PromptSnapshotSchema);
const encodeDimMap = Schema.encodeSync(ProblemDimensionMapSchema);

/** Arithmetic mean. Returns 0 for empty input. */
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Compose a Curve from per-problem data via Monte Carlo simulation.
 *
 * How it works:
 *   1. problem_curves: computed directly from per-problem raw scores.
 *      Each problem uses ALL available data (pooled across exam versions).
 *
 *   2. ability_curves + overall_mean: Monte Carlo simulation.
 *      For each trial:
 *        - Sample one student's full data per problem (task_score + dim_scores)
 *        - This preserves within-problem correlations
 *        - Between problems, samples are independent
 *        - Compute derived values (ability, total_problem, final_total)
 *      After N trials: compute thresholds from simulated distributions.
 *
 * @param bank           Per-problem score data, built via buildBank
 * @param target         Target exam config: dimension_map + prompt_snapshot
 * @param method         CurveMethod (standard_deviation, percentile, absolute)
 * @param label          Human-readable label for the curve
 * @param options.nTrials  Number of Monte Carlo trials (default 10,000)
 * @param options.rng      Random number generator () => [0,1) (default Math.random)
 */
export function composeCurve(
  bank: ProblemScoreBank,
  target: {
    dimension_map: ProblemDimensionMap;
    prompt_snapshot: PromptSnapshot;
  },
  method: CurveMethod,
  label: string,
  options?: { nTrials?: number; rng?: () => number },
): typeof CurveSchema.Type {
  const nTrials = options?.nTrials ?? 10_000;
  const rng = options?.rng ?? Math.random;

  // Extract target problem digits from the dimension map
  const targetDigits = [
    ...new Set(target.dimension_map.entries.map((e) => e.problem_id.digit)),
  ];

  // Validate: all target problems must exist in bank
  for (const digit of targetDigits) {
    if (!bank.slots[digit]) {
      throw new Error(
        `composeCurve: target problem ${digit} not found in bank. ` +
          `Bank has: [${Object.keys(bank.slots).join(", ")}]`,
      );
    }
  }

  // ── 1. problem_curves: directly from per-problem raw scores ──────────

  const problem_curves: Record<string, GradeThresholds> = {};
  for (const digit of targetDigits) {
    const slot = bank.slots[digit];
    const taskScores = slot.entries.map((e) => e.task_score);
    problem_curves[digit] = thresholdsFromMethod(taskScores, method);
  }

  // ── 2. Monte Carlo simulation for ability_curves + overall_mean ──────

  // Build dim → [problems that test this dim] mapping from target dimension_map
  const dimToProblems: Record<string, string[]> = {};
  for (const dim of DIMENSIONS) {
    dimToProblems[dim] = target.dimension_map.entries
      .filter(
        (e) =>
          targetDigits.includes(e.problem_id.digit) &&
          e.dimensions.includes(dim),
      )
      .map((e) => e.problem_id.digit);
  }

  // Pre-allocate simulation result arrays
  const simAbilities: Record<string, number[]> = {};
  for (const dim of DIMENSIONS) {
    simAbilities[dim] = new Array(nTrials);
  }
  const simFinals = new Array<number>(nTrials);

  for (let trial = 0; trial < nTrials; trial++) {
    // Sample one student per problem (preserves within-problem correlation)
    const sampled: Record<string, ProblemSampleEntry> = {};
    for (const digit of targetDigits) {
      const slot = bank.slots[digit];
      const idx = Math.floor(rng() * slot.entries.length);
      sampled[digit] = slot.entries[idx];
    }

    // total_problem = mean of sampled task_scores
    const taskScores = targetDigits.map((d) => sampled[d].task_score);
    const totalProblem = mean(taskScores);

    // ability_scores per dimension = mean of tested dim scores across problems
    const abilities: number[] = new Array(DIMENSIONS.length);
    for (let di = 0; di < DIMENSIONS.length; di++) {
      const dim = DIMENSIONS[di];
      const problemsForDim = dimToProblems[dim];
      const values: number[] = [];
      for (const digit of problemsForDim) {
        const v = sampled[digit].dimension_scores[dim];
        if (v !== undefined) {
          values.push(v);
        }
      }
      const ability = values.length > 0 ? mean(values) : 0;
      abilities[di] = ability;
      simAbilities[dim][trial] = ability;
    }

    // total_ability = mean of ability scores
    const totalAbility = mean(abilities);

    // final_total = geometric mean = √(total_problem × total_ability)
    simFinals[trial] = Math.sqrt(totalProblem * totalAbility);
  }

  // ── 3. Compute thresholds from simulated distributions ───────────────

  const ability_curves: Record<string, GradeThresholds> = {};
  for (const dim of DIMENSIONS) {
    ability_curves[dim] = thresholdsFromMethod(simAbilities[dim], method);
  }
  const overall_mean = thresholdsFromMethod(simFinals, method);

  // ── 4. Build the Curve ───────────────────────────────────────────────

  // sample_size = min per-problem sample count (the statistical bottleneck)
  const minSampleSize = Math.min(
    ...targetDigits.map((d) => bank.slots[d].entries.length),
  );

  // Collect all contributing event IDs
  const allEventIds = new Set<string>();
  for (const digit of targetDigits) {
    for (const eid of bank.slots[digit].source_event_ids) {
      allEventIds.add(eid);
    }
  }

  const methodRaw =
    method.type === "standard_deviation"
      ? {
          type: "standard_deviation" as const,
          sigma_boundaries: [...method.sigma_boundaries],
        }
      : method.type === "percentile"
        ? {
            type: "percentile" as const,
            percentiles: [...method.percentiles],
          }
        : {
            type: "absolute" as const,
            thresholds: [...method.thresholds],
          };

  return decodeCurve({
    curve_id: crypto.randomUUID(),
    label,
    source_event_ids: [...allEventIds],
    prompt_snapshot: encodeSnapshot(target.prompt_snapshot),
    dimension_map: encodeDimMap(target.dimension_map),
    method: methodRaw,
    sample_size: minSampleSize,
    computed_at: new Date().toISOString(),
    overall_mean,
    ability_curves,
    problem_curves,
  });
}

// =============================================================================
// Exports for testing
// =============================================================================

export { mean };
