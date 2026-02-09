/**
 * Edge 2 tests: computeCurve with all three CurveMethod variants,
 * plus round-trip through applyCurve.
 *
 * Run: npx tsx v3-effect/compute-curve-test.ts
 */

import { Schema, Either } from "effect";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  type EventConfig,
  type JSONScores,
  type CurveMethod,
  Curve as CurveSchema,
  DIMENSIONS,
  decodeEventConfig,
  decodeJSONScores,
} from "./schemas.js";
import { samplePromptSnapshotStored } from "./fixtures.js";
import { initPool, addScore } from "./score-pool-builder.js";
import { applyCurve, checkCompatibility } from "./apply-curve.js";
import { computeCurve } from "./compute-curve.js";

// =============================================================================
// Shared fixture data (same structure as score-pool-builder-test.ts)
// =============================================================================

const NOW = "2024-06-10T00:00:00.000Z";

const dimMapRaw = {
  map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
  label: "2024 Spring Assessment v2",
  created_at: NOW,
  entries: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Expression-Translation",
        "Exploratory-Discovery",
      ],
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Verification-Confirmation",
        "Iterative-Optimization",
      ],
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Expression-Translation",
        "Exploratory-Discovery",
        "Verification-Confirmation",
        "Iterative-Optimization",
      ],
    },
  ],
};

const problemIds = [
  { digit: "000340", name: "meeting-verify" },
  { digit: "000500", name: "thinking-traps" },
  { digit: "001001", name: "ling-bing" },
];

/**
 * Build a JSONScores with varied scores per-problem and per-dimension.
 * dimScaleFactors: per-dimension multiplier [disc, expr, expl, verif, iter]
 * so each student has a distinct ability profile.
 */
function makeScore(
  scoresId: string,
  eventId: string,
  taskScores: [number, number, number],
  dimScaleFactors: [number, number, number, number, number],
): JSONScores {
  const [disc, expr, expl, verif, iter] = dimScaleFactors;
  return decodeJSONScores({
    scores_id: scoresId,
    event_id: eventId,
    prompt_snapshot: samplePromptSnapshotStored,
    dimension_map: dimMapRaw,
    generated_at: NOW,
    participant_id: `student-${scoresId.slice(0, 4)}`,
    problem_scores: [
      {
        problem_id: { digit: "000340", name: "meeting-verify" },
        task_score: taskScores[0],
        dimension_scores: {
          "Discovery-Self-Understanding": clamp(0.85 * disc),
          "Expression-Translation": clamp(0.78 * expr),
          "Exploratory-Discovery": clamp(0.72 * expl),
          "Verification-Confirmation": null,
          "Iterative-Optimization": null,
        },
      },
      {
        problem_id: { digit: "000500", name: "thinking-traps" },
        task_score: taskScores[1],
        dimension_scores: {
          "Discovery-Self-Understanding": clamp(0.90 * disc),
          "Expression-Translation": null,
          "Exploratory-Discovery": null,
          "Verification-Confirmation": clamp(0.65 * verif),
          "Iterative-Optimization": clamp(0.70 * iter),
        },
      },
      {
        problem_id: { digit: "001001", name: "ling-bing" },
        task_score: taskScores[2],
        dimension_scores: {
          "Discovery-Self-Understanding": clamp(0.88 * disc),
          "Expression-Translation": clamp(0.82 * expr),
          "Exploratory-Discovery": clamp(0.79 * expl),
          "Verification-Confirmation": clamp(0.71 * verif),
          "Iterative-Optimization": clamp(0.68 * iter),
        },
      },
    ],
  });
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function makeEvent(eventId: string): EventConfig {
  return decodeEventConfig({
    event_id: eventId,
    problem_ids: problemIds,
    prompt_snapshot: samplePromptSnapshotStored,
    dimension_map: dimMapRaw,
    event_date: NOW,
  });
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

// =============================================================================
// Build a pool with 6 students having varied scores
// =============================================================================

const event = makeEvent("event-A");
const students: JSONScores[] = [
  makeScore("aaaaaaaa-0001-4000-8000-000000000001", "event-A", [0.90, 0.85, 0.92], [1.05, 1.10, 1.00, 0.95, 1.00]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000002", "event-A", [0.80, 0.75, 0.82], [1.00, 1.00, 1.00, 1.00, 1.00]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000003", "event-A", [0.70, 0.65, 0.72], [0.90, 0.85, 0.95, 1.05, 0.90]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000004", "event-A", [0.60, 0.55, 0.62], [0.80, 0.75, 0.80, 0.85, 0.80]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000005", "event-A", [0.50, 0.45, 0.52], [0.70, 0.65, 0.70, 0.70, 0.65]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000006", "event-A", [0.40, 0.35, 0.42], [0.60, 0.55, 0.60, 0.60, 0.55]),
];

let pool = initPool("Compute Curve Test Pool", event, [students[0]]);
for (let i = 1; i < students.length; i++) {
  const result = addScore(pool, students[i]);
  if (Either.isLeft(result)) {
    console.error(`Failed to add student ${i}:`, result.left);
    process.exit(1);
  }
  pool = result.right;
}

console.log(`Pool built: ${pool.scores.length} students\n`);

// =============================================================================
// 1. standard_deviation method
// =============================================================================

console.log("=== 1. standard_deviation method ===\n");

const stdDevMethod: CurveMethod = {
  type: "standard_deviation",
  sigma_boundaries: [1, 0, -1],
} as CurveMethod;

const stdDevCurve = computeCurve(pool, stdDevMethod, "StdDev Curve");

console.log("Problem curves:");
for (const [digit, t] of Object.entries(stdDevCurve.problem_curves)) {
  console.log(`  ${digit}: A≥${t.A.toFixed(3)} B≥${t.B.toFixed(3)} C≥${t.C.toFixed(3)}`);
  assert(t.A >= t.B && t.B >= t.C, `${digit}: A ≥ B ≥ C ordering violated`);
  assert(t.A >= 0 && t.A <= 1, `${digit}: A out of [0,1]`);
  assert(t.C >= 0 && t.C <= 1, `${digit}: C out of [0,1]`);
}

console.log("\nAbility curves:");
for (const dim of DIMENSIONS) {
  const t = stdDevCurve.ability_curves[dim];
  console.log(`  ${dim}: A≥${t.A.toFixed(3)} B≥${t.B.toFixed(3)} C≥${t.C.toFixed(3)}`);
  assert(t.A >= t.B && t.B >= t.C, `${dim}: A ≥ B ≥ C ordering violated`);
}

console.log("\nOverall:");
const om = stdDevCurve.overall_mean;
console.log(`  A≥${om.A.toFixed(3)} B≥${om.B.toFixed(3)} C≥${om.C.toFixed(3)}`);
assert(om.A >= om.B && om.B >= om.C, "overall: A ≥ B ≥ C ordering violated");

console.log(`\nMethod: ${stdDevCurve.method.type}, sample_size: ${stdDevCurve.sample_size}`);
console.log("  OK\n");

// =============================================================================
// 2. percentile method
// =============================================================================

console.log("=== 2. percentile method ===\n");

const percentileMethod: CurveMethod = {
  type: "percentile",
  percentiles: [0.75, 0.50, 0.25],
} as CurveMethod;

const percentileCurve = computeCurve(pool, percentileMethod, "Percentile Curve");

console.log("Problem curves:");
for (const [digit, t] of Object.entries(percentileCurve.problem_curves)) {
  console.log(`  ${digit}: A≥${t.A.toFixed(3)} B≥${t.B.toFixed(3)} C≥${t.C.toFixed(3)}`);
  assert(t.A >= t.B && t.B >= t.C, `percentile ${digit}: A ≥ B ≥ C ordering violated`);
}

console.log("\nOverall:");
const pm = percentileCurve.overall_mean;
console.log(`  A≥${pm.A.toFixed(3)} B≥${pm.B.toFixed(3)} C≥${pm.C.toFixed(3)}`);
assert(pm.A >= pm.B && pm.B >= pm.C, "percentile overall: ordering violated");
console.log("  OK\n");

// =============================================================================
// 3. absolute method
// =============================================================================

console.log("=== 3. absolute method ===\n");

const absoluteMethod: CurveMethod = {
  type: "absolute",
  thresholds: [0.85, 0.72, 0.55],
} as CurveMethod;

const absoluteCurve = computeCurve(pool, absoluteMethod, "Absolute Curve");

// All thresholds should be exactly the fixed values
for (const [digit, t] of Object.entries(absoluteCurve.problem_curves)) {
  assert(t.A === 0.85, `absolute ${digit}: A should be 0.85, got ${t.A}`);
  assert(t.B === 0.72, `absolute ${digit}: B should be 0.72, got ${t.B}`);
  assert(t.C === 0.55, `absolute ${digit}: C should be 0.55, got ${t.C}`);
}
for (const dim of DIMENSIONS) {
  const t = absoluteCurve.ability_curves[dim];
  assert(t.A === 0.85, `absolute ${dim}: A should be 0.85, got ${t.A}`);
}
assert(absoluteCurve.overall_mean.A === 0.85, "absolute overall: A should be 0.85");
console.log("All absolute thresholds correct (A=0.85, B=0.72, C=0.55)");
console.log("  OK\n");

// =============================================================================
// 4. Round-trip: computeCurve → checkCompatibility → applyCurve
// =============================================================================

console.log("=== 4. Round-trip: computeCurve → checkCompatibility → applyCurve ===\n");

// Pick student[1] (middle performer) and apply the stdDev curve
const targetStudent = students[1];
const compat = checkCompatibility(stdDevCurve, targetStudent);
console.log(`Compatibility status: ${compat.status}`);
assert(compat.status === "compatible", `Expected compatible, got ${compat.status}`);

const curved = applyCurve(stdDevCurve, targetStudent);
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
// 5. Verify thresholds are NOT uniform (unlike the fixture's hardcoded values)
// =============================================================================

console.log("=== 5. Verify thresholds vary across categories ===\n");

const problemThresholds = Object.values(stdDevCurve.problem_curves).map((t) => t.A);
const allSame = problemThresholds.every((v) => v === problemThresholds[0]);
console.log(`Problem A-thresholds: [${problemThresholds.map((v) => v.toFixed(3)).join(", ")}]`);
console.log(`All identical? ${allSame}`);
assert(!allSame, "Problem thresholds should vary (not hardcoded)");

const abilityThresholds = DIMENSIONS.map((d) => stdDevCurve.ability_curves[d].A);
const allAbilitySame = abilityThresholds.every((v) => v === abilityThresholds[0]);
console.log(`Ability A-thresholds: [${abilityThresholds.map((v) => v.toFixed(3)).join(", ")}]`);
console.log(`All identical? ${allAbilitySame}`);
assert(!allAbilitySame, "Ability thresholds should vary");
console.log("  OK\n");

// =============================================================================
// 6. Write computed curve to test-data/
// =============================================================================

console.log("=== 6. Write computed-curve.json ===\n");

const encodeCurve = Schema.encodeSync(CurveSchema);
const encoded = encodeCurve(stdDevCurve);
const outDir = path.join(import.meta.dirname!, "test-data");
const outPath = path.join(outDir, "computed-curve.json");
fs.writeFileSync(outPath, JSON.stringify(encoded, null, 2) + "\n");
console.log(`Wrote: ${outPath}`);
console.log("  OK\n");

// =============================================================================
// Summary
// =============================================================================

console.log("All tests passed.");
