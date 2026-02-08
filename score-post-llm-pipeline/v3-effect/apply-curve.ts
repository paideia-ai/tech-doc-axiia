/**
 * Compatibility check + curve application for JSONScores → CurvedScores.
 *
 * checkCompatibility(curve, scores) → CompatibilityResult
 *   Reports exactly what passed/failed across three severity tiers.
 *
 * applyCurve(curve, scores, options?) → CurvedScores
 *   Runs the check first; throws on "incompatible", requires explicit
 *   opt-in for "requires_override".
 *
 * Run: npx tsx v3-effect/apply-curve.ts
 */

import { Option, Schema } from "effect";
import {
  type CheckOutcome,
  type CompatibilityResult,
  type Curve,
  type CurvedScores,
  type Dimension,
  type GradeThresholds,
  type LetterGrade,
  type ProblemDigitId,
  type ScoreValue,
  DIMENSIONS,
  JSONScores,
  decodeCurvedScores,
  decodeJSONScores,
} from "./schemas.js";
import { sampleReport } from "./report-fixture.js";
import {
  buildCompatibleCurve,
  buildIncompatibleCurve,
} from "./curve-fixture.js";

// =============================================================================
// Helpers
// =============================================================================

const pass = (): CheckOutcome => ({ status: "pass" });

const fail = (message: string, items: string[] = []): CheckOutcome => ({
  status: "fail",
  message,
  items,
});

const isPass = (c: CheckOutcome): boolean => c.status === "pass";

/** Assign a letter grade given a score and thresholds: A ≥ t.A, B ≥ t.B, C ≥ t.C, else D */
const assignGrade = (score: number, t: GradeThresholds): LetterGrade =>
  score >= t.A ? "A" : score >= t.B ? "B" : score >= t.C ? "C" : "D";

// =============================================================================
// checkCompatibility
// =============================================================================

export function checkCompatibility(
  curve: Curve,
  scores: JSONScores,
): CompatibilityResult {
  // ── Structural checks ──────────────────────────────────────────────

  // problem_coverage: every scores problem digit must exist in curve.problem_curves
  const scoreDigits = scores.problem_scores.map((ps) => ps.problem_id.digit);
  const curveDigits = new Set(Object.keys(curve.problem_curves));
  const missingDigits = scoreDigits.filter((d) => !curveDigits.has(d));
  const problem_coverage =
    missingDigits.length === 0
      ? pass()
      : fail(
          `Curve missing ${missingDigits.length} problem(s) present in scores`,
          missingDigits,
        );

  // dimmap_structural: per-problem dimension sets must match
  const dimmapMismatches: string[] = [];
  for (const ps of scores.problem_scores) {
    const digit = ps.problem_id.digit;
    const scoreDims = new Set(
      scores.dimension_map.entries
        .filter((e) => e.problem_id.digit === digit)
        .flatMap((e) => e.dimensions),
    );
    const curveDims = new Set(
      curve.dimension_map.entries
        .filter((e) => e.problem_id.digit === digit)
        .flatMap((e) => e.dimensions),
    );
    if (scoreDims.size !== curveDims.size || ![...scoreDims].every((d) => curveDims.has(d))) {
      dimmapMismatches.push(
        `${digit}: curve=[${[...curveDims].join(",")}] scores=[${[...scoreDims].join(",")}]`,
      );
    }
  }
  const dimmap_structural =
    dimmapMismatches.length === 0
      ? pass()
      : fail("Dimension sets differ between curve and scores", dimmapMismatches);

  // threshold_ordering: A ≥ B ≥ C in every GradeThresholds
  const orderingViolations: string[] = [];
  function checkOrdering(name: string, t: GradeThresholds) {
    if (!(t.A >= t.B && t.B >= t.C)) {
      orderingViolations.push(name);
    }
  }
  checkOrdering("overall_mean", curve.overall_mean);
  for (const dim of DIMENSIONS) {
    checkOrdering(`ability_curves.${dim}`, curve.ability_curves[dim]);
  }
  for (const [digit, t] of Object.entries(curve.problem_curves)) {
    checkOrdering(`problem_curves.${digit}`, t as GradeThresholds);
  }
  const threshold_ordering =
    orderingViolations.length === 0
      ? pass()
      : fail("Thresholds not ordered A ≥ B ≥ C", orderingViolations);

  // ── Provenance checks ─────────────────────────────────────────────

  const prompt_version =
    curve.prompt_version_hash === scores.prompt_version_hash
      ? pass()
      : fail(
          `Prompt version mismatch: curve=${curve.prompt_version_hash} scores=${scores.prompt_version_hash}`,
        );

  const event_membership = curve.source_event_ids.includes(
    scores.event_id as any,
  )
    ? pass()
    : fail(
        `scores.event_id "${scores.event_id}" not in curve.source_event_ids`,
        [scores.event_id],
      );

  const dimmap_identity =
    curve.dimension_map.map_id === scores.dimension_map.map_id
      ? pass()
      : fail(
          `DimMap ID mismatch: curve=${curve.dimension_map.map_id} scores=${scores.dimension_map.map_id}`,
        );

  // ── Advisory checks ───────────────────────────────────────────────

  const extraDigits = [...curveDigits].filter(
    (d) => !scoreDigits.includes(d as ProblemDigitId),
  );
  const extra_curve_problems =
    extraDigits.length === 0
      ? pass()
      : fail(
          `Curve has ${extraDigits.length} problem(s) not in scores (harmless)`,
          extraDigits,
        );

  const sample_size =
    curve.method.type === "standard_deviation" && curve.sample_size < 30
      ? fail(
          `Sample size ${curve.sample_size} < 30 for standard_deviation method`,
        )
      : pass();

  // staleness: |computed_at - generated_at| > 90 days
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const curveTime = new Date(curve.computed_at.toString()).getTime();
  const scoresTime = new Date(scores.generated_at.toString()).getTime();
  const gap = Math.abs(curveTime - scoresTime);
  const staleness =
    gap > NINETY_DAYS_MS
      ? fail(
          `Time gap ${Math.round(gap / (24 * 60 * 60 * 1000))} days exceeds 90-day threshold`,
        )
      : pass();

  // score_range: any score entirely above all A thresholds or below all C
  const outOfRange: string[] = [];
  for (const ps of scores.problem_scores) {
    const digit = ps.problem_id.digit;
    const t = curve.problem_curves[digit];
    if (!t) continue; // skip if not covered (already flagged in structural)
    if (ps.task_score > t.A + 0.0001) {
      // well above highest threshold — informational
    }
    if (ps.task_score < t.C) {
      outOfRange.push(`${digit}:task_score=${ps.task_score}`);
    }
  }
  const score_range =
    outOfRange.length === 0
      ? pass()
      : fail("Some scores fall below all C thresholds", outOfRange);

  // ── Derive status ─────────────────────────────────────────────────

  const structuralChecks = [problem_coverage, dimmap_structural, threshold_ordering];
  const provenanceChecks = [prompt_version, event_membership, dimmap_identity];

  const status: CompatibilityResult["status"] = structuralChecks.some(
    (c) => !isPass(c),
  )
    ? "incompatible"
    : provenanceChecks.some((c) => !isPass(c))
      ? "requires_override"
      : "compatible";

  return {
    status,
    structural: { problem_coverage, dimmap_structural, threshold_ordering },
    provenance: { prompt_version, event_membership, dimmap_identity },
    advisory: { extra_curve_problems, sample_size, staleness, score_range },
  };
}

// =============================================================================
// applyCurve
// =============================================================================

export function applyCurve(
  curve: Curve,
  scores: JSONScores,
  options?: { allowOverride?: boolean },
): CurvedScores {
  const compat = checkCompatibility(curve, scores);

  if (compat.status === "incompatible") {
    throw new Error(
      `Cannot apply curve: incompatible.\n${JSON.stringify(compat.structural, null, 2)}`,
    );
  }
  if (compat.status === "requires_override" && !options?.allowOverride) {
    throw new Error(
      `Cannot apply curve: requires_override (pass { allowOverride: true } to proceed).\n${JSON.stringify(compat.provenance, null, 2)}`,
    );
  }

  // Build problem_grades
  const problem_grades = scores.problem_scores.map((ps) => {
    const digit = ps.problem_id.digit;
    const t = curve.problem_curves[digit];
    const task_grade = assignGrade(ps.task_score, t);

    const dimension_grades: Record<string, LetterGrade | null> = {};
    for (const dim of DIMENSIONS) {
      const opt = ps.dimension_scores[dim];
      if (Option.isSome(opt)) {
        dimension_grades[dim] = assignGrade(opt.value, curve.ability_curves[dim]);
      } else {
        dimension_grades[dim] = null;
      }
    }

    return {
      problem_id: { digit: ps.problem_id.digit, name: ps.problem_id.name },
      task_grade,
      dimension_grades,
    };
  });

  // Build ability_grades from derived ability_scores
  const abilities = scores.ability_scores;
  const ability_grades: Record<string, LetterGrade> = {};
  for (const dim of DIMENSIONS) {
    ability_grades[dim] = assignGrade(abilities[dim], curve.ability_curves[dim]);
  }

  // Assign single overall grade from final_total_score
  const overall_grade = assignGrade(scores.totals.final_total_score, curve.overall_mean);

  const raw = {
    curved_scores_id: crypto.randomUUID(),
    source: Schema.encodeSync(JSONScores)(scores),
    applied_curve_id: curve.curve_id,
    curved_at: new Date().toISOString(),
    problem_grades,
    ability_grades,
    overall_grade,
  };

  return decodeCurvedScores(raw);
}

// =============================================================================
// Fixture: reuse sampleReport → JSONScores, import Curve fixtures
// =============================================================================

function buildScoresFromReport(): JSONScores {
  const now = "2024-06-10T00:00:00.000Z";
  const problem_scores = sampleReport.problemReports.map((pr) => {
    const [digit, ...nameParts] = pr.problemId.split("-");
    const dimension_scores: Record<string, number | null> = {};
    for (const dim of DIMENSIONS) {
      const detail = pr.dimensionDetails.find((d) => d.dimension === dim);
      dimension_scores[dim] = detail?.score ?? null;
    }
    return {
      problem_id: { digit, name: nameParts.join("-") },
      task_score: pr.score!,
      dimension_scores,
    };
  });
  const entries = sampleReport.problemReports.map((pr) => {
    const [digit, ...nameParts] = pr.problemId.split("-");
    return {
      problem_id: { digit, name: nameParts.join("-") },
      dimensions: pr.dimensionDetails.map((d) => d.dimension),
    };
  });
  return decodeJSONScores({
    scores_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    event_id: "spring-2024-final",
    prompt_version_hash: "a3f8b2c",
    participant_id: "student-0042",
    dimension_map: {
      map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
      label: "2024 Spring Assessment v2",
      created_at: now,
      entries,
    },
    generated_at: now,
    problem_scores,
  });
}

// =============================================================================
// Run (only when executed directly)
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const scores = buildScoresFromReport();
  const compatibleCurve = buildCompatibleCurve(scores);
  const incompatibleCurve = buildIncompatibleCurve(scores);

  // ── 1. Compatible check ──────────────────────────────────────────────
  console.log("=== 1. Compatible Curve: checkCompatibility ===\n");
  const compatResult = checkCompatibility(compatibleCurve, scores);
  console.log(JSON.stringify(compatResult, null, 2));
  console.log(`\nStatus: ${compatResult.status}`);

  // ── 2. Apply the compatible curve ────────────────────────────────────
  console.log("\n=== 2. applyCurve → CurvedScores ===\n");
  const curved = applyCurve(compatibleCurve, scores);
  console.log("Problem grades:");
  for (const pg of curved.problem_grades) {
    const dimGrades = DIMENSIONS.map((d) => {
      const opt = pg.dimension_grades[d];
      return `${d}=${Option.isSome(opt) ? opt.value : "-"}`;
    }).join(", ");
    console.log(`  ${pg.problem_id.digit} (${pg.problem_id.name}): task=${pg.task_grade}  [${dimGrades}]`);
  }
  console.log("\nAbility grades:");
  for (const dim of DIMENSIONS) {
    console.log(`  ${dim}: ${curved.ability_grades[dim]}`);
  }
  console.log(`\nOverall grade: ${curved.overall_grade}`);

  // ── 3. Incompatible check ────────────────────────────────────────────
  console.log("\n=== 3. Incompatible Curve: checkCompatibility ===\n");
  const incompatResult = checkCompatibility(incompatibleCurve, scores);
  console.log(JSON.stringify(incompatResult, null, 2));
  console.log(`\nStatus: ${incompatResult.status}`);

  // Verify applyCurve throws on incompatible
  console.log("\n=== 4. applyCurve on incompatible curve → expected error ===\n");
  try {
    applyCurve(incompatibleCurve, scores);
    console.log("ERROR: should have thrown!");
  } catch (e) {
    console.log(`Caught expected error: ${(e as Error).message.split("\n")[0]}`);
  }

  console.log("\nDone.");
}
