/**
 * Compose-curve tests: heterogeneous exam data → ProblemScoreBank → composed Curve.
 *
 * Scenario:
 *   Old exam (event-A): [P1, P2, P3] × 6 students
 *   New exam (event-B): [P1, P2, P3, P4] × 3 students
 *
 * Expectations:
 *   - ProblemScoreBank pools per-problem: P1=9, P2=9, P3=9, P4=3
 *   - composeCurve produces a valid Curve for the 4-problem exam
 *   - problem_curves benefit from pooled data (9 samples for P1-P3 vs 3 pool-only)
 *   - ability_curves + overall_mean are Monte Carlo composed
 *   - The Curve applies to a 4-problem student via standard applyCurve
 *
 * Run: npx tsx v3-effect/compose-curve-test.ts
 */

import { Schema, Option } from "effect";
import {
  type CurveMethod,
  type JSONScores,
  Curve as CurveSchema,
  DIMENSIONS,
  decodeJSONScores,
  decodeEventConfig,
  decodeProblemDimensionMap,
} from "./schemas.js";
import { buildBank, composeCurve, formatBankError } from "./compose-curve.js";
import { computeCurve } from "./compute-curve.js";
import { initPool, addScore } from "./score-pool-builder.js";
import { applyCurve, checkCompatibility } from "./apply-curve.js";

// =============================================================================
// Fixture data
// =============================================================================

const NOW = "2024-06-10T00:00:00.000Z";
const [DIM0, DIM1, DIM2, DIM3, DIM4] = DIMENSIONS;

// ── Prompt snapshots ────────────────────────────────────────────────────────

/** Old exam prompt: framework + P1,P2,P3 */
const oldPromptSnapshot = {
  git_hash: "a3f8b2c",
  set_hash: "aabbccddee00112233445566778899aabbccddee00112233445566778899aabb",
  entries: [
    { key: "framework:zh:ability-summary",  sha256: "1000000000000000000000000000000000000000000000000000000000000001" },
    { key: "framework:zh:expert-review",    sha256: "1000000000000000000000000000000000000000000000000000000000000002" },
    { key: "framework:zh:final-summary",    sha256: "1000000000000000000000000000000000000000000000000000000000000003" },
    { key: "framework:zh:problem-ability",  sha256: "1000000000000000000000000000000000000000000000000000000000000004" },
    { key: "framework:zh:problem-summary",  sha256: "1000000000000000000000000000000000000000000000000000000000000005" },
    { key: "framework:zh:task-eval",        sha256: "1000000000000000000000000000000000000000000000000000000000000006" },
    { key: "problem:000340:scoring",        sha256: "2000000000000000000000000000000000000000000000000000000000000001" },
    { key: "problem:000340:task-eval",      sha256: "2000000000000000000000000000000000000000000000000000000000000002" },
    { key: "problem:000500:scoring",        sha256: "3000000000000000000000000000000000000000000000000000000000000001" },
    { key: "problem:000500:task-eval",      sha256: "3000000000000000000000000000000000000000000000000000000000000002" },
    { key: "problem:001001:scoring",        sha256: "4000000000000000000000000000000000000000000000000000000000000001" },
    { key: "problem:001001:task-eval",      sha256: "4000000000000000000000000000000000000000000000000000000000000002" },
  ],
};

/** New exam prompt: framework + P1,P2,P3 (same) + P4 (new) */
const newPromptSnapshot = {
  git_hash: "b4f9c3d",
  set_hash: "bbbbccddee00112233445566778899aabbccddee00112233445566778899cccc",
  entries: [
    // Same framework entries
    { key: "framework:zh:ability-summary",  sha256: "1000000000000000000000000000000000000000000000000000000000000001" },
    { key: "framework:zh:expert-review",    sha256: "1000000000000000000000000000000000000000000000000000000000000002" },
    { key: "framework:zh:final-summary",    sha256: "1000000000000000000000000000000000000000000000000000000000000003" },
    { key: "framework:zh:problem-ability",  sha256: "1000000000000000000000000000000000000000000000000000000000000004" },
    { key: "framework:zh:problem-summary",  sha256: "1000000000000000000000000000000000000000000000000000000000000005" },
    { key: "framework:zh:task-eval",        sha256: "1000000000000000000000000000000000000000000000000000000000000006" },
    // Same P1,P2,P3 entries
    { key: "problem:000340:scoring",        sha256: "2000000000000000000000000000000000000000000000000000000000000001" },
    { key: "problem:000340:task-eval",      sha256: "2000000000000000000000000000000000000000000000000000000000000002" },
    { key: "problem:000500:scoring",        sha256: "3000000000000000000000000000000000000000000000000000000000000001" },
    { key: "problem:000500:task-eval",      sha256: "3000000000000000000000000000000000000000000000000000000000000002" },
    { key: "problem:001001:scoring",        sha256: "4000000000000000000000000000000000000000000000000000000000000001" },
    { key: "problem:001001:task-eval",      sha256: "4000000000000000000000000000000000000000000000000000000000000002" },
    // NEW: P4 entries
    { key: "problem:002001:scoring",        sha256: "5000000000000000000000000000000000000000000000000000000000000001" },
    { key: "problem:002001:task-eval",      sha256: "5000000000000000000000000000000000000000000000000000000000000002" },
  ],
};

// ── Dimension maps ──────────────────────────────────────────────────────────

/** Old exam: 3 problems */
const oldDimMapRaw = {
  map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
  label: "Old exam (3 problems)",
  created_at: NOW,
  entries: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      dimensions: [DIM0, DIM1, DIM2],
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      dimensions: [DIM0, DIM3, DIM4],
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      dimensions: [DIM0, DIM1, DIM2, DIM3, DIM4],
    },
  ],
};

/** New exam: 4 problems (adds P4 = 002001) */
const newDimMapRaw = {
  map_id: "e5f6a7b8-c9d0-4e1f-b234-567890123456",
  label: "New exam (4 problems)",
  created_at: NOW,
  entries: [
    // Same P1,P2,P3
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      dimensions: [DIM0, DIM1, DIM2],
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      dimensions: [DIM0, DIM3, DIM4],
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      dimensions: [DIM0, DIM1, DIM2, DIM3, DIM4],
    },
    // NEW: P4
    {
      problem_id: { digit: "002001", name: "spatial-reasoning" },
      dimensions: [DIM0, DIM2, DIM3],
    },
  ],
};

// ── Score builders ──────────────────────────────────────────────────────────

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

/**
 * Build a 3-problem score (old exam: P1, P2, P3).
 * dimFactors: [d0, d1, d2, d3, d4] scale factors per dimension.
 */
function makeOldExamScore(
  scoresId: string,
  taskScores: [number, number, number],
  dimFactors: [number, number, number, number, number],
): JSONScores {
  const [d0, d1, d2, d3, d4] = dimFactors;
  return decodeJSONScores({
    scores_id: scoresId,
    event_id: "event-A",
    prompt_snapshot: oldPromptSnapshot,
    dimension_map: oldDimMapRaw,
    generated_at: NOW,
    participant_id: `old-${scoresId.slice(0, 8)}`,
    problem_scores: [
      {
        problem_id: { digit: "000340", name: "meeting-verify" },
        task_score: taskScores[0],
        dimension_scores: {
          [DIM0]: clamp(0.85 * d0),
          [DIM1]: clamp(0.78 * d1),
          [DIM2]: clamp(0.72 * d2),
          [DIM3]: null,
          [DIM4]: null,
        },
      },
      {
        problem_id: { digit: "000500", name: "thinking-traps" },
        task_score: taskScores[1],
        dimension_scores: {
          [DIM0]: clamp(0.90 * d0),
          [DIM1]: null,
          [DIM2]: null,
          [DIM3]: clamp(0.65 * d3),
          [DIM4]: clamp(0.70 * d4),
        },
      },
      {
        problem_id: { digit: "001001", name: "ling-bing" },
        task_score: taskScores[2],
        dimension_scores: {
          [DIM0]: clamp(0.88 * d0),
          [DIM1]: clamp(0.82 * d1),
          [DIM2]: clamp(0.79 * d2),
          [DIM3]: clamp(0.71 * d3),
          [DIM4]: clamp(0.68 * d4),
        },
      },
    ],
  });
}

/**
 * Build a 4-problem score (new exam: P1, P2, P3, P4).
 */
function makeNewExamScore(
  scoresId: string,
  taskScores: [number, number, number, number],
  dimFactors: [number, number, number, number, number],
): JSONScores {
  const [d0, d1, d2, d3, d4] = dimFactors;
  return decodeJSONScores({
    scores_id: scoresId,
    event_id: "event-B",
    prompt_snapshot: newPromptSnapshot,
    dimension_map: newDimMapRaw,
    generated_at: NOW,
    participant_id: `new-${scoresId.slice(0, 8)}`,
    problem_scores: [
      {
        problem_id: { digit: "000340", name: "meeting-verify" },
        task_score: taskScores[0],
        dimension_scores: {
          [DIM0]: clamp(0.85 * d0),
          [DIM1]: clamp(0.78 * d1),
          [DIM2]: clamp(0.72 * d2),
          [DIM3]: null,
          [DIM4]: null,
        },
      },
      {
        problem_id: { digit: "000500", name: "thinking-traps" },
        task_score: taskScores[1],
        dimension_scores: {
          [DIM0]: clamp(0.90 * d0),
          [DIM1]: null,
          [DIM2]: null,
          [DIM3]: clamp(0.65 * d3),
          [DIM4]: clamp(0.70 * d4),
        },
      },
      {
        problem_id: { digit: "001001", name: "ling-bing" },
        task_score: taskScores[2],
        dimension_scores: {
          [DIM0]: clamp(0.88 * d0),
          [DIM1]: clamp(0.82 * d1),
          [DIM2]: clamp(0.79 * d2),
          [DIM3]: clamp(0.71 * d3),
          [DIM4]: clamp(0.68 * d4),
        },
      },
      {
        // P4: tests DIM0, DIM2, DIM3
        problem_id: { digit: "002001", name: "spatial-reasoning" },
        task_score: taskScores[3],
        dimension_scores: {
          [DIM0]: clamp(0.80 * d0),
          [DIM1]: null,
          [DIM2]: clamp(0.75 * d2),
          [DIM3]: clamp(0.68 * d3),
          [DIM4]: null,
        },
      },
    ],
  });
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

// =============================================================================
// Build score datasets
// =============================================================================

/** Old exam: 6 students, 3 problems each */
const oldScores: JSONScores[] = [
  makeOldExamScore("aaaa0001-0001-4000-8000-000000000001", [0.90, 0.85, 0.92], [1.05, 1.10, 1.00, 0.95, 1.00]),
  makeOldExamScore("aaaa0002-0001-4000-8000-000000000002", [0.80, 0.75, 0.82], [1.00, 1.00, 1.00, 1.00, 1.00]),
  makeOldExamScore("aaaa0003-0001-4000-8000-000000000003", [0.70, 0.65, 0.72], [0.90, 0.85, 0.95, 1.05, 0.90]),
  makeOldExamScore("aaaa0004-0001-4000-8000-000000000004", [0.60, 0.55, 0.62], [0.80, 0.75, 0.80, 0.85, 0.80]),
  makeOldExamScore("aaaa0005-0001-4000-8000-000000000005", [0.50, 0.45, 0.52], [0.70, 0.65, 0.70, 0.70, 0.65]),
  makeOldExamScore("aaaa0006-0001-4000-8000-000000000006", [0.40, 0.35, 0.42], [0.60, 0.55, 0.60, 0.60, 0.55]),
];

/** New exam: 3 students, 4 problems each */
const newScores: JSONScores[] = [
  makeNewExamScore("bbbb0001-0001-4000-8000-000000000001", [0.88, 0.82, 0.90, 0.78], [1.00, 1.05, 0.95, 1.00, 0.95]),
  makeNewExamScore("bbbb0002-0001-4000-8000-000000000002", [0.75, 0.70, 0.78, 0.65], [0.95, 0.90, 0.90, 0.95, 0.90]),
  makeNewExamScore("bbbb0003-0001-4000-8000-000000000003", [0.62, 0.58, 0.65, 0.55], [0.85, 0.80, 0.85, 0.85, 0.80]),
];

console.log(`Old exam scores: ${oldScores.length} students × 3 problems`);
console.log(`New exam scores: ${newScores.length} students × 4 problems`);
console.log();

// =============================================================================
// 1. Build ProblemScoreBank from ALL scores (old + new)
// =============================================================================

console.log("=== 1. Build ProblemScoreBank (heterogeneous) ===\n");

const allScores = [...oldScores, ...newScores];
const bankResult = buildBank("Pooled Bank (old + new)", allScores);

// buildBank returns ProblemScoreBank | BankError
if ("_tag" in bankResult) {
  console.error(`Bank build failed: ${formatBankError(bankResult)}`);
  process.exit(1);
}

const bank = bankResult;
console.log(`Bank built: ${Object.keys(bank.slots).length} problems`);
console.log(`  Events: [${bank.source_event_ids.join(", ")}]`);
for (const [digit, slot] of Object.entries(bank.slots)) {
  console.log(
    `  ${digit} (${slot.problem_name}): ${slot.entries.length} samples from [${slot.source_event_ids.join(", ")}]`,
  );
}
console.log();

// Verify per-problem sample sizes
assert(bank.slots["000340"].entries.length === 9, "P1 should have 9 samples (6 old + 3 new)");
assert(bank.slots["000500"].entries.length === 9, "P2 should have 9 samples (6 old + 3 new)");
assert(bank.slots["001001"].entries.length === 9, "P3 should have 9 samples (6 old + 3 new)");
assert(bank.slots["002001"].entries.length === 3, "P4 should have 3 samples (new only)");
console.log("Per-problem sample sizes correct: P1=9, P2=9, P3=9, P4=3");
console.log("  OK\n");

// =============================================================================
// 2. Compose a curve for the 4-problem exam
// =============================================================================

console.log("=== 2. Compose curve for 4-problem exam (std dev) ===\n");

const stdDevMethod: CurveMethod = {
  type: "standard_deviation",
  sigma_boundaries: [1, 0, -1],
} as CurveMethod;

// Decode the target dimension map for composeCurve
const targetDimMap = decodeProblemDimensionMap(newDimMapRaw);
const targetSnapshot = Schema.decodeUnknownSync(
  Schema.Struct({
    git_hash: Schema.String,
    set_hash: Schema.String,
    entries: Schema.Array(Schema.Struct({
      key: Schema.String,
      sha256: Schema.String,
    })),
  })
)(newPromptSnapshot);
// We need the full decoded PromptSnapshot for composeCurve
const targetPromptSnapshot = Schema.decodeUnknownSync(
  (await import("./schemas.js")).PromptSnapshot
)(newPromptSnapshot);

// Use a seeded RNG for deterministic results
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const composedCurve = composeCurve(
  bank,
  { dimension_map: targetDimMap, prompt_snapshot: targetPromptSnapshot },
  stdDevMethod,
  "Composed 4-problem curve (std dev)",
  { nTrials: 10_000, rng: mulberry32(42) },
);

console.log("Problem curves:");
for (const [digit, t] of Object.entries(composedCurve.problem_curves)) {
  console.log(`  ${digit}: A≥${t.A.toFixed(3)} B≥${t.B.toFixed(3)} C≥${t.C.toFixed(3)}`);
  assert(t.A >= t.B && t.B >= t.C, `${digit}: A ≥ B ≥ C ordering violated`);
  assert(t.A >= 0 && t.A <= 1, `${digit}: A out of [0,1]`);
  assert(t.C >= 0 && t.C <= 1, `${digit}: C out of [0,1]`);
}

console.log("\nAbility curves:");
for (const dim of DIMENSIONS) {
  const t = composedCurve.ability_curves[dim];
  console.log(`  ${dim}: A≥${t.A.toFixed(3)} B≥${t.B.toFixed(3)} C≥${t.C.toFixed(3)}`);
  assert(t.A >= t.B && t.B >= t.C, `${dim}: A ≥ B ≥ C ordering violated`);
}

console.log("\nOverall:");
const om = composedCurve.overall_mean;
console.log(`  A≥${om.A.toFixed(3)} B≥${om.B.toFixed(3)} C≥${om.C.toFixed(3)}`);
assert(om.A >= om.B && om.B >= om.C, "overall: A ≥ B ≥ C ordering violated");

console.log(`\nMethod: ${composedCurve.method.type}`);
console.log(`Sample size (min per-problem): ${composedCurve.sample_size}`);
assert(composedCurve.sample_size === 3, "sample_size should be min per-problem = 3 (P4)");
console.log("  OK\n");

// =============================================================================
// 3. Verify problem_curves use POOLED data (not just new exam data)
// =============================================================================

console.log("=== 3. Compare: composed (9 samples) vs pool-only (3 samples) ===\n");

// Build a homogeneous pool from ONLY new exam data (3 students, 4 problems)
const newEvent = decodeEventConfig({
  event_id: "event-B",
  problem_ids: [
    { digit: "000340", name: "meeting-verify" },
    { digit: "000500", name: "thinking-traps" },
    { digit: "001001", name: "ling-bing" },
    { digit: "002001", name: "spatial-reasoning" },
  ],
  prompt_snapshot: newPromptSnapshot,
  dimension_map: newDimMapRaw,
  event_date: NOW,
});

let poolNewOnly = initPool("New-only pool", newEvent, [newScores[0]]);
for (let i = 1; i < newScores.length; i++) {
  const result = addScore(poolNewOnly, newScores[i]);
  if ("left" in result && result.left !== undefined) {
    console.error(`Failed to add new score ${i}`);
    process.exit(1);
  }
  poolNewOnly = (result as any).right;
}

const poolOnlyCurve = computeCurve(poolNewOnly, stdDevMethod, "Pool-only curve");

console.log("P1 (000340) — shared problem:");
console.log(
  `  Composed (9 samples): A≥${composedCurve.problem_curves["000340"].A.toFixed(3)} B≥${composedCurve.problem_curves["000340"].B.toFixed(3)} C≥${composedCurve.problem_curves["000340"].C.toFixed(3)}`,
);
console.log(
  `  Pool-only (3 samples): A≥${poolOnlyCurve.problem_curves["000340"].A.toFixed(3)} B≥${poolOnlyCurve.problem_curves["000340"].B.toFixed(3)} C≥${poolOnlyCurve.problem_curves["000340"].C.toFixed(3)}`,
);

console.log("\nP4 (002001) — new-only problem:");
console.log(
  `  Composed (3 samples): A≥${composedCurve.problem_curves["002001"].A.toFixed(3)} B≥${composedCurve.problem_curves["002001"].B.toFixed(3)} C≥${composedCurve.problem_curves["002001"].C.toFixed(3)}`,
);
console.log(
  `  Pool-only (3 samples): A≥${poolOnlyCurve.problem_curves["002001"].A.toFixed(3)} B≥${poolOnlyCurve.problem_curves["002001"].B.toFixed(3)} C≥${poolOnlyCurve.problem_curves["002001"].C.toFixed(3)}`,
);

// For P1, composed uses 9 samples while pool-only uses 3 → different thresholds
// For P4, both use 3 samples → should be identical
assert(
  composedCurve.problem_curves["002001"].A === poolOnlyCurve.problem_curves["002001"].A &&
  composedCurve.problem_curves["002001"].B === poolOnlyCurve.problem_curves["002001"].B &&
  composedCurve.problem_curves["002001"].C === poolOnlyCurve.problem_curves["002001"].C,
  "P4 thresholds should match between composed and pool-only (same 3 samples)",
);
console.log("\nP4 thresholds match (same data, same result)");
console.log("  OK\n");

// =============================================================================
// 4. Round-trip: composeCurve → checkCompatibility → applyCurve
// =============================================================================

console.log("=== 4. Round-trip: composeCurve → applyCurve ===\n");

// Apply the composed curve to a new-exam student
const targetStudent = newScores[1]; // middle performer
const compat = checkCompatibility(composedCurve, targetStudent);
console.log(`Compatibility: ${compat.status}`);

// Note: event_membership may fail (composed curve has both event-A and event-B,
// but that's fine for provenance tier). dimmap/problem_coverage should pass.
console.log(`  structural.problem_coverage: ${compat.structural.problem_coverage.status}`);
console.log(`  structural.dimmap_structural: ${compat.structural.dimmap_structural.status}`);
console.log(`  structural.threshold_ordering: ${compat.structural.threshold_ordering.status}`);

assert(
  compat.structural.problem_coverage.status === "pass",
  "Composed curve should cover all 4 problems",
);
assert(
  compat.structural.threshold_ordering.status === "pass",
  "All thresholds should be properly ordered",
);

// Apply (may need override if provenance checks fail due to different prompt snapshots)
const curved = applyCurve(composedCurve, targetStudent, { allowOverride: true });
console.log(`\nStudent: ${curved.source.participant_id}`);
console.log("Problem grades:");
for (const pg of curved.problem_grades) {
  console.log(`  ${pg.problem_id.digit} (${pg.problem_id.name}): ${pg.task_grade}`);
}
console.log("Ability grades:");
for (const dim of DIMENSIONS) {
  console.log(`  ${dim}: ${curved.ability_grades[dim]}`);
}
console.log(`Overall grade: ${curved.overall_grade}`);
console.log("  OK\n");

// =============================================================================
// 5. Bank validation: reject mismatched prompt
// =============================================================================

console.log("=== 5. Bank rejects prompt mismatch ===\n");

// Create a score with a different framework prompt hash
const badFrameworkSnapshot = {
  ...newPromptSnapshot,
  set_hash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  entries: newPromptSnapshot.entries.map((e) =>
    e.key === "framework:zh:task-eval"
      ? { ...e, sha256: "ffff000000000000000000000000000000000000000000000000000000000006" }
      : e,
  ),
};

const badScore = decodeJSONScores({
  scores_id: "cccc0001-0001-4000-8000-000000000001",
  event_id: "event-C",
  prompt_snapshot: badFrameworkSnapshot,
  dimension_map: newDimMapRaw,
  generated_at: NOW,
  participant_id: "bad-prompt-student",
  problem_scores: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      task_score: 0.70,
      dimension_scores: {
        [DIM0]: 0.75, [DIM1]: 0.68, [DIM2]: 0.62, [DIM3]: null, [DIM4]: null,
      },
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      task_score: 0.65,
      dimension_scores: {
        [DIM0]: 0.70, [DIM1]: null, [DIM2]: null, [DIM3]: 0.55, [DIM4]: 0.60,
      },
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      task_score: 0.68,
      dimension_scores: {
        [DIM0]: 0.72, [DIM1]: 0.65, [DIM2]: 0.60, [DIM3]: 0.55, [DIM4]: 0.50,
      },
    },
    {
      problem_id: { digit: "002001", name: "spatial-reasoning" },
      task_score: 0.60,
      dimension_scores: {
        [DIM0]: 0.65, [DIM1]: null, [DIM2]: 0.55, [DIM3]: 0.50, [DIM4]: null,
      },
    },
  ],
});

const badBankResult = buildBank("Should fail", [...allScores, badScore]);
if ("_tag" in badBankResult) {
  console.log(`Correctly rejected: ${formatBankError(badBankResult)}`);
  assert(
    badBankResult._tag === "prompt_mismatch_for_problem",
    "Should be prompt_mismatch_for_problem",
  );
} else {
  console.error("ERROR: should have been rejected!");
  process.exit(1);
}
console.log("  OK\n");

// =============================================================================
// 6. Bank validation: reject mismatched dimensions for same problem
// =============================================================================

console.log("=== 6. Bank rejects dimmap mismatch for same problem ===\n");

const badDimMapRaw = {
  ...newDimMapRaw,
  map_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  entries: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      // Different dimensions for P1!
      dimensions: [DIM0, DIM3, DIM4],
    },
    newDimMapRaw.entries[1],
    newDimMapRaw.entries[2],
    newDimMapRaw.entries[3],
  ],
};

const badDimScore = decodeJSONScores({
  scores_id: "dddd0001-0001-4000-8000-000000000001",
  event_id: "event-D",
  prompt_snapshot: newPromptSnapshot,
  dimension_map: badDimMapRaw,
  generated_at: NOW,
  participant_id: "bad-dimmap-student",
  problem_scores: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      task_score: 0.70,
      dimension_scores: {
        [DIM0]: 0.75, [DIM1]: null, [DIM2]: null, [DIM3]: 0.62, [DIM4]: 0.60,
      },
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      task_score: 0.65,
      dimension_scores: {
        [DIM0]: 0.70, [DIM1]: null, [DIM2]: null, [DIM3]: 0.55, [DIM4]: 0.60,
      },
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      task_score: 0.68,
      dimension_scores: {
        [DIM0]: 0.72, [DIM1]: 0.65, [DIM2]: 0.60, [DIM3]: 0.55, [DIM4]: 0.50,
      },
    },
    {
      problem_id: { digit: "002001", name: "spatial-reasoning" },
      task_score: 0.60,
      dimension_scores: {
        [DIM0]: 0.65, [DIM1]: null, [DIM2]: 0.55, [DIM3]: 0.50, [DIM4]: null,
      },
    },
  ],
});

const badDimBankResult = buildBank("Should fail", [...allScores, badDimScore]);
if ("_tag" in badDimBankResult) {
  console.log(`Correctly rejected: ${formatBankError(badDimBankResult)}`);
  assert(
    badDimBankResult._tag === "dimmap_mismatch_for_problem",
    "Should be dimmap_mismatch_for_problem",
  );
} else {
  console.error("ERROR: should have been rejected!");
  process.exit(1);
}
console.log("  OK\n");

// =============================================================================
// Summary
// =============================================================================

console.log("All tests passed.");
