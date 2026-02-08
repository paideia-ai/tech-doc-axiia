/**
 * End-to-end test: load JSON files → decode → apply curve → write graded JSON.
 *
 * Inputs:  test-data/scores.json, test-data/curve.json
 * Output:  test-data/curved-scores.json
 *
 * Run: npx tsx v3-effect/apply-curve-test.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { Schema } from "effect";
import {
  JSONScores,
  CurvedScores,
  decodeJSONScores,
  decodeCurve,
} from "./schemas.js";
import { checkCompatibility, applyCurve } from "./apply-curve.js";

const DIR = "v3-effect/test-data";

// ── 1. Load & decode ──────────────────────────────────────────────────
const scoresRaw = JSON.parse(readFileSync(`${DIR}/scores.json`, "utf-8"));
const curveRaw = JSON.parse(readFileSync(`${DIR}/curve.json`, "utf-8"));

const scores = decodeJSONScores(scoresRaw);
const curve = decodeCurve(curveRaw);

console.log("Decoded scores:", scores.scores_id);
console.log("Decoded curve: ", curve.curve_id);
console.log(
  `  ${scores.problem_scores.length} problems, ${Object.keys(curve.problem_curves).length} curve entries`,
);

// ── 2. Compatibility check ────────────────────────────────────────────
const compat = checkCompatibility(curve, scores);
console.log(`\nCompatibility: ${compat.status}`);
if (compat.status === "incompatible") {
  console.error("Cannot apply — structural failures:");
  console.error(JSON.stringify(compat.structural, null, 2));
  process.exit(1);
}

// ── 3. Apply curve ────────────────────────────────────────────────────
const curved = applyCurve(curve, scores, { allowOverride: true });

// ── 4. Encode & write ─────────────────────────────────────────────────
const encoded = Schema.encodeSync(CurvedScores)(curved);
const outPath = `${DIR}/curved-scores.json`;
writeFileSync(outPath, JSON.stringify(encoded, null, 2) + "\n");
console.log(`\nWrote ${outPath}`);

// ── 5. Summary ────────────────────────────────────────────────────────
console.log("\n--- Grading summary ---");
for (const pg of curved.problem_grades) {
  console.log(`  ${pg.problem_id.digit} (${pg.problem_id.name}): task=${pg.task_grade}`);
}
console.log(`  Overall grade: ${curved.overall_grade}`);
console.log("\nDone.");
