/**
 * Fixtures: stored (JSON) vs decoded (in-memory) forms.
 * Run: npx tsx v3-effect/fixtures.ts
 */

import { Schema, Option } from "effect";
import {
  JSONScores,
  CurvedScores,
  decodeJSONScores,
  decodeCurvedScores,
} from "./schemas.js";

// =============================================================================
// 0. PromptSnapshot — reusable stored form
//
// Realistic snapshot: 6 framework templates (zh) + 3 problem-specific files.
// All SHA-256 values are distinct 64-char hex strings.
// =============================================================================

export const samplePromptSnapshotStored = {
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

// =============================================================================
// 1. ProblemDimensionMap (embedded in JSONScores)
// =============================================================================

const dimMap = {
  map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
  label: "2024 Spring Assessment v2",
  created_at: "2024-03-01T00:00:00Z",
  entries: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      dimensions: [
        "discovery",
        "representation",
        "exploratory",
      ],
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      dimensions: [
        "discovery",
        "self-verification",
        "iterative-refinement",
      ],
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      dimensions: [
        "discovery",
        "representation",
        "exploratory",
        "self-verification",
        "iterative-refinement",
      ],
    },
  ],
};

// =============================================================================
// 2. JSONScores — STORED form (what lives in JSON)
//
//    No ability_scores, no totals — just problem_scores + metadata.
// =============================================================================

export const jsonScoresStored = {
  scores_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  event_id: "spring-2024-final",
  prompt_snapshot: samplePromptSnapshotStored,
  dimension_map: dimMap,
  generated_at: "2024-03-15T14:30:00Z",
  participant_id: "student-0042",
  problem_scores: [
    {
      // meeting-verify: tests Discovery, Expression, Exploratory
      problem_id: { digit: "000340", name: "meeting-verify" },
      task_score: 0.8,
      dimension_scores: {
        "discovery": 0.85,
        "representation": 0.78,
        "exploratory": 0.72,
        "self-verification": null,
        "iterative-refinement": null,
      },
    },
    {
      // thinking-traps: tests Discovery, Verification, Iterative
      problem_id: { digit: "000500", name: "thinking-traps" },
      task_score: 0.75,
      dimension_scores: {
        "discovery": 0.9,
        "representation": null,
        "exploratory": null,
        "self-verification": 0.65,
        "iterative-refinement": 0.7,
      },
    },
    {
      // ling-bing: tests all 5
      problem_id: { digit: "001001", name: "ling-bing" },
      task_score: 0.82,
      dimension_scores: {
        "discovery": 0.88,
        "representation": 0.82,
        "exploratory": 0.79,
        "self-verification": 0.71,
        "iterative-refinement": 0.68,
      },
    },
  ],
};

// =============================================================================
// 3. Decode — derived getters are now available
//
//    ability_scores derivation:
//      Discovery:    mean(0.85, 0.90, 0.88) = 0.8767
//      Expression:   mean(0.78, 0.82)        = 0.8000
//      Exploratory:  mean(0.72, 0.79)        = 0.7550
//      Verification: mean(0.65, 0.71)        = 0.6800
//      Iterative:    mean(0.70, 0.68)        = 0.6900
//
//    totals derivation:
//      total_problem_score = mean(0.80, 0.75, 0.82) = 0.7900
//      total_ability_score = mean(0.8767, 0.80, 0.755, 0.68, 0.69) = 0.7603
//      final_total_score   = (0.79 + 0.7603) / 2 = 0.7752
// =============================================================================

const scores = decodeJSONScores(jsonScoresStored);

// =============================================================================
// 4. CurvedScores — STORED form
// =============================================================================

export const curvedScoresStored = {
  curved_scores_id: "c1d2e3f4-a5b6-47c8-9d0e-f12345678901",
  source: jsonScoresStored,
  applied_curve_id: "b2c3d4e5-f6a7-48b9-0c1d-e23456789012",
  curved_at: "2024-03-15T15:00:00Z",
  problem_grades: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      task_grade: "B",
      dimension_grades: {
        "discovery": "A",
        "representation": "B",
        "exploratory": "B",
        "self-verification": null,
        "iterative-refinement": null,
      },
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      task_grade: "B",
      dimension_grades: {
        "discovery": "A",
        "representation": null,
        "exploratory": null,
        "self-verification": "C",
        "iterative-refinement": "B",
      },
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      task_grade: "A",
      dimension_grades: {
        "discovery": "A",
        "representation": "A",
        "exploratory": "B",
        "self-verification": "B",
        "iterative-refinement": "B",
      },
    },
  ],
  ability_grades: {
    "discovery": "A",
    "representation": "B",
    "exploratory": "B",
    "self-verification": "C",
    "iterative-refinement": "B",
  },
  overall_grade: "B",
};

const curved = decodeCurvedScores(curvedScoresStored);

// =============================================================================
// 5. Print stored vs decoded
// =============================================================================

const optionToJson = (v: unknown): unknown =>
  Option.isOption(v) ? (Option.isSome(v) ? v.value : null) : v;

const dimRecordToJson = (rec: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, optionToJson(v)]));

console.log("=== JSONScores: STORED (what's in JSON) ===\n");
console.log(JSON.stringify(jsonScoresStored, null, 2));

console.log("\n=== JSONScores: DECODED (Schema.Class instance) ===\n");
console.log("ability_scores:", dimRecordToJson(scores.ability_scores));
console.log("totals:", scores.totals);
console.log(
  "problem_scores[0].dimension_scores:",
  dimRecordToJson(scores.problem_scores[0].dimension_scores)
);

console.log("\n=== CurvedScores: DECODED ===\n");
console.log(
  "source.ability_scores:",
  dimRecordToJson(curved.source.ability_scores)
);
console.log("source.totals:", curved.source.totals);
console.log("ability_grades:", dimRecordToJson(curved.ability_grades));
console.log("overall_grade:", curved.overall_grade);

// =============================================================================
// 6. Round-trip: encode strips derived getters
// =============================================================================

const encodeJSONScores = Schema.encodeSync(JSONScores);
const reEncoded = encodeJSONScores(scores);

console.log("\n=== Round-trip: encode strips derived getters ===\n");
console.log(
  "has ability_scores?",
  "ability_scores" in (reEncoded as Record<string, unknown>)
);
console.log("has totals?", "totals" in (reEncoded as Record<string, unknown>));
console.log("has problem_scores?", "problem_scores" in reEncoded);
