/**
 * Edge 2b — COMPOSE: ProblemScoreBank + CurveMethod → Curve
 *
 * Enables per-problem score pooling across different exam versions,
 * then composes ability_curves and overall_mean via parametric decomposition.
 *
 * Key difference from computeCurve (pool-based):
 *   computeCurve:  all students must have the same problem set (homogeneous pool)
 *   composeCurve:  students can have different problem sets; data is pooled per-problem
 *
 * Compositional approach (Option D — parametric):
 *   problem_curves  — computed directly from per-problem raw scores (larger samples)
 *   ability_curves  — parametric: μ and σ from linear combination formula
 *   overall_mean    — parametric: μ and σ from linear combination formula
 *
 * For std_dev method, all aggregates are linear combinations of per-problem scores,
 * so μ and σ can be computed exactly (no distributional assumption) using:
 *   - Per-problem means & variances from pooled data (large samples)
 *   - Cross-problem covariances from overlapping students (students who took both problems)
 *
 * For percentile/absolute methods, falls back to complete students (Option A).
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
  type ScoreValue,
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
  readonly participant_id: string;
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
 *
 * Each entry retains participant_id for cross-problem covariance estimation.
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

      // Extract sample entry (task_score + tested dimension scores + participant_id)
      const dimScores: Partial<Record<Dimension, number>> = {};
      for (const dim of DIMENSIONS) {
        const opt = ps.dimension_scores[dim];
        if (Option.isSome(opt)) {
          dimScores[dim] = opt.value;
        }
      }

      slots[digit].entries.push({
        participant_id: score.participant_id,
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
// Pure statistics helpers
// =============================================================================

const encodeSnapshot = Schema.encodeSync(PromptSnapshotSchema);
const encodeDimMap = Schema.encodeSync(ProblemDimensionMapSchema);

const toScoreValue = Schema.decodeSync(
  Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1),
    Schema.brand("ScoreValue"),
  ),
);

/** Clamp to [0, 1] for ScoreValue validity. */
const clampScore = (n: number): number => Math.max(0, Math.min(1, n));

/** Arithmetic mean. Returns 0 for empty input. */
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/** Population variance. */
const popVariance = (values: readonly number[], mu: number): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / values.length;
};

/** Population covariance from paired observations. */
const popCovariance = (
  xs: readonly number[],
  ys: readonly number[],
  muX: number,
  muY: number,
): number => {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += (xs[i] - muX) * (ys[i] - muY);
  }
  return sum / xs.length;
};

/** Dot product of two vectors. */
const dot = (a: readonly number[], b: readonly number[]): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

/** Quadratic form: w^T * Sigma * w */
const quadForm = (w: readonly number[], cov: readonly (readonly number[])[]): number => {
  let sum = 0;
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < w.length; j++) {
      sum += w[i] * w[j] * cov[i][j];
    }
  }
  return sum;
};

// =============================================================================
// Parametric decomposition types
// =============================================================================

/** Identifies a single random variable in the per-problem score space. */
type VarSpec =
  | { kind: "task"; problem: string }
  | { kind: "dim"; problem: string; dim: Dimension };

/** Extract the numeric value for a VarSpec from a sample entry. */
function getValue(v: VarSpec, entry: ProblemSampleEntry): number {
  if (v.kind === "task") return entry.task_score;
  return entry.dimension_scores[v.dim!] ?? 0;
}

// =============================================================================
// composeCurve — parametric composition from ProblemScoreBank
// =============================================================================

/**
 * Compose a Curve from per-problem data via parametric decomposition.
 *
 * How it works:
 *   1. problem_curves: computed directly from per-problem raw scores.
 *      Each problem uses ALL available data (pooled across exam versions).
 *
 *   2. ability_curves + overall_mean (standard_deviation method):
 *      Each aggregate (ability per dimension, final_total) is a linear
 *      combination of per-problem scores. For linear combinations:
 *        μ(aggregate) = Σ wᵢ μ(Xᵢ)           — exact, any distribution
 *        σ²(aggregate) = Σᵢⱼ wᵢwⱼ Cov(Xᵢ,Xⱼ) — exact, any distribution
 *      Per-problem μ and σ² come from pooled data (large n).
 *      Cross-problem Cov comes from overlapping students.
 *      When no overlapping students exist for a pair, Cov defaults to 0.
 *
 *   3. ability_curves + overall_mean (percentile method):
 *      Falls back to complete students (those who took all target problems).
 *
 * @param bank           Per-problem score data, built via buildBank
 * @param target         Target exam config: dimension_map + prompt_snapshot
 * @param method         CurveMethod (standard_deviation, percentile, absolute)
 * @param label          Human-readable label for the curve
 */
export function composeCurve(
  bank: ProblemScoreBank,
  target: {
    dimension_map: ProblemDimensionMap;
    prompt_snapshot: PromptSnapshot;
  },
  method: CurveMethod,
  label: string,
): typeof CurveSchema.Type {
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

  // ── 2. ability_curves + overall_mean ─────────────────────────────────

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

  let ability_curves: Record<string, GradeThresholds>;
  let overall_mean: GradeThresholds;

  if (method.type === "standard_deviation") {
    ({ ability_curves, overall_mean } = computeParametric(
      bank,
      targetDigits,
      dimToProblems,
      method,
    ));
  } else {
    // Percentile or absolute: fall back to complete students
    ({ ability_curves, overall_mean } = computeFromCompleteStudents(
      bank,
      targetDigits,
      dimToProblems,
      method,
    ));
  }

  // ── 3. Build the Curve ───────────────────────────────────────────────

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
// Parametric approach (Option D) — for standard_deviation method
//
// All aggregates are linear combinations of per-problem random variables.
// We enumerate every variable (task_score and dimension_scores per problem),
// build the covariance matrix, and compute aggregate μ and σ via:
//   μ = w^T · μ_vec        (exact)
//   σ² = w^T · Σ · w       (exact for linear combinations)
// =============================================================================

function computeParametric(
  bank: ProblemScoreBank,
  targetDigits: readonly string[],
  dimToProblems: Record<string, string[]>,
  method: { type: "standard_deviation"; sigma_boundaries: readonly number[] },
): { ability_curves: Record<string, GradeThresholds>; overall_mean: GradeThresholds } {
  const nProblems = targetDigits.length;

  // ── Enumerate all random variables ────────────────────────────────
  const vars: VarSpec[] = [];
  for (const digit of targetDigits) {
    vars.push({ kind: "task", problem: digit });
    for (const dim of bank.slots[digit].tested_dimensions) {
      vars.push({ kind: "dim", problem: digit, dim });
    }
  }
  const nVars = vars.length;

  // ── Compute mean vector from pooled per-problem data ──────────────
  const muVec: number[] = vars.map((v) => {
    const entries = bank.slots[v.problem].entries;
    return mean(entries.map((e) => getValue(v, e)));
  });

  // ── Build covariance matrix ───────────────────────────────────────
  // Same-problem pairs: from full pooled data (large n)
  // Cross-problem pairs: from overlapping participants (smaller n)
  const covMatrix: number[][] = Array.from({ length: nVars }, () =>
    new Array(nVars).fill(0),
  );

  // Index overlapping participants across all problem pairs
  // participantMap[digit] = Map<participant_id, entry_index>
  const participantMap: Record<string, Map<string, number>> = {};
  for (const digit of targetDigits) {
    const map = new Map<string, number>();
    const entries = bank.slots[digit].entries;
    for (let k = 0; k < entries.length; k++) {
      map.set(entries[k].participant_id, k);
    }
    participantMap[digit] = map;
  }

  for (let i = 0; i < nVars; i++) {
    for (let j = i; j < nVars; j++) {
      const vi = vars[i];
      const vj = vars[j];

      let c: number;
      if (vi.problem === vj.problem) {
        // Same problem: use full pooled data
        const entries = bank.slots[vi.problem].entries;
        const xs = entries.map((e) => getValue(vi, e));
        const ys = entries.map((e) => getValue(vj, e));
        c = popCovariance(xs, ys, mean(xs), mean(ys));
      } else {
        // Different problems: find overlapping participants
        const mapI = participantMap[vi.problem];
        const mapJ = participantMap[vj.problem];
        const entriesI = bank.slots[vi.problem].entries;
        const entriesJ = bank.slots[vj.problem].entries;

        const xs: number[] = [];
        const ys: number[] = [];
        for (const [pid, idxI] of mapI) {
          const idxJ = mapJ.get(pid);
          if (idxJ !== undefined) {
            xs.push(getValue(vi, entriesI[idxI]));
            ys.push(getValue(vj, entriesJ[idxJ]));
          }
        }

        // No overlap → assume independence (Cov = 0)
        c = xs.length > 0 ? popCovariance(xs, ys, mean(xs), mean(ys)) : 0;
      }

      covMatrix[i][j] = c;
      covMatrix[j][i] = c;
    }
  }

  // ── Helper: compute thresholds from weight vector ─────────────────
  function thresholdsFromWeights(w: readonly number[]): GradeThresholds {
    const mu = dot(w, muVec);
    const variance = Math.max(0, quadForm(w, covMatrix));
    const sigma = Math.sqrt(variance);
    return {
      A: toScoreValue(clampScore(mu + method.sigma_boundaries[0] * sigma)),
      B: toScoreValue(clampScore(mu + method.sigma_boundaries[1] * sigma)),
      C: toScoreValue(clampScore(mu + method.sigma_boundaries[2] * sigma)),
    } as GradeThresholds;
  }

  // ── ability_curves ────────────────────────────────────────────────
  // ability_d = mean(D_{p,d} for p in problems testing d)
  // weight = 1/|P_d| for each D_{p,d} variable where p tests d
  const ability_curves: Record<string, GradeThresholds> = {};
  for (const dim of DIMENSIONS) {
    const problemsForDim = dimToProblems[dim];
    if (problemsForDim.length === 0) {
      ability_curves[dim] = {
        A: toScoreValue(0),
        B: toScoreValue(0),
        C: toScoreValue(0),
      } as GradeThresholds;
      continue;
    }
    const w = vars.map((v) =>
      v.kind === "dim" && v.dim === dim && problemsForDim.includes(v.problem)
        ? 1 / problemsForDim.length
        : 0,
    );
    ability_curves[dim] = thresholdsFromWeights(w);
  }

  // ── overall_mean ──────────────────────────────────────────────────
  // final_total = (total_problem + total_ability) / 2
  // = (1/2) * [(1/n) Σ T_p + (1/5) Σ_d (1/|P_d|) Σ_{p∈P_d} D_{p,d}]
  // = Σ_p (1/(2n)) T_p + Σ_{p,d} (1/(10|P_d|)) D_{p,d}
  const wFinal = vars.map((v) => {
    if (v.kind === "task") {
      return 1 / (2 * nProblems);
    } else {
      const problemsForDim = dimToProblems[v.dim!];
      if (problemsForDim.includes(v.problem)) {
        return 1 / (2 * 5 * problemsForDim.length);
      }
      return 0;
    }
  });
  const overall_mean = thresholdsFromWeights(wFinal);

  return { ability_curves, overall_mean };
}

// =============================================================================
// Fallback: complete students (Option A) — for percentile/absolute methods
// =============================================================================

function computeFromCompleteStudents(
  bank: ProblemScoreBank,
  targetDigits: readonly string[],
  dimToProblems: Record<string, string[]>,
  method: CurveMethod,
): { ability_curves: Record<string, GradeThresholds>; overall_mean: GradeThresholds } {
  // Find participants who appear in ALL target problem slots
  const participantSets = targetDigits.map((digit) =>
    new Set(bank.slots[digit].entries.map((e) => e.participant_id)),
  );
  const completeParticipants = [...participantSets[0]].filter((pid) =>
    participantSets.every((s) => s.has(pid)),
  );

  if (completeParticipants.length === 0) {
    throw new Error(
      `composeCurve: no complete students found for ${method.type} method. ` +
        `Need students who took all target problems: [${targetDigits.join(", ")}]`,
    );
  }

  // For each complete participant, compute their derived values
  const abilityValues: Record<string, number[]> = {};
  for (const dim of DIMENSIONS) {
    abilityValues[dim] = [];
  }
  const finalValues: number[] = [];

  for (const pid of completeParticipants) {
    // Gather entries for this participant across all target problems
    const entries: Record<string, ProblemSampleEntry> = {};
    for (const digit of targetDigits) {
      const entry = bank.slots[digit].entries.find(
        (e) => e.participant_id === pid,
      );
      entries[digit] = entry!;
    }

    // total_problem
    const totalProblem = mean(targetDigits.map((d) => entries[d].task_score));

    // ability per dimension
    const abilities: number[] = [];
    for (const dim of DIMENSIONS) {
      const problemsForDim = dimToProblems[dim];
      const vals: number[] = [];
      for (const digit of problemsForDim) {
        const v = entries[digit]?.dimension_scores[dim];
        if (v !== undefined) vals.push(v);
      }
      const ability = vals.length > 0 ? mean(vals) : 0;
      abilityValues[dim].push(ability);
      abilities.push(ability);
    }

    // total_ability
    const totalAbility = mean(abilities);

    // final_total = arithmetic mean
    finalValues.push((totalProblem + totalAbility) / 2);
  }

  const ability_curves: Record<string, GradeThresholds> = {};
  for (const dim of DIMENSIONS) {
    ability_curves[dim] = thresholdsFromMethod(abilityValues[dim], method);
  }
  const overall_mean = thresholdsFromMethod(finalValues, method);

  return { ability_curves, overall_mean };
}

// =============================================================================
// Exports for testing
// =============================================================================

export { mean, popVariance, popCovariance, dot, quadForm };
