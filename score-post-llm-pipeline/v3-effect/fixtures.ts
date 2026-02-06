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
// 1. ProblemDimensionMap (embedded in JSONScores)
// =============================================================================

const dimMap = {
  map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
  label: "2024 Spring Assessment v2",
  created_at: "2024-03-01T00:00:00Z",
  entries: [
    {
      problem_id: "100010",
      problem_version: "2.1",
      dimensions: [
        "Discovery-Self-Understanding",
        "Expression-Translation",
        "Exploratory-Discovery",
      ],
    },
    {
      problem_id: "100020",
      problem_version: "1.0",
      dimensions: [
        "Discovery-Self-Understanding",
        "Verification-Confirmation",
        "Iterative-Optimization",
      ],
    },
    {
      problem_id: "100031",
      problem_version: "3.0",
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

// =============================================================================
// 2. JSONScores — STORED form (what lives in JSON)
//
//    No ability_scores, no totals — just problem_scores + metadata.
// =============================================================================

export const jsonScoresStored = {
  scores_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  event_id: "spring-2024-final",
  prompt_version_hash: "a3f8b2c",
  dimension_map: dimMap,
  generated_at: "2024-03-15T14:30:00Z",
  participant_id: "student-0042",
  problem_scores: [
    {
      // Problem 100010: tests Discovery, Expression, Exploratory
      problem_id: "100010",
      task_score: 0.8,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.85,
        "Expression-Translation": 0.78,
        "Exploratory-Discovery": 0.72,
        "Verification-Confirmation": null,
        "Iterative-Optimization": null,
      },
    },
    {
      // Problem 100020: tests Discovery, Verification, Iterative
      problem_id: "100020",
      task_score: 0.75,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.9,
        "Expression-Translation": null,
        "Exploratory-Discovery": null,
        "Verification-Confirmation": 0.65,
        "Iterative-Optimization": 0.7,
      },
    },
    {
      // Problem 100031: tests all 5
      problem_id: "100031",
      task_score: 0.82,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.88,
        "Expression-Translation": 0.82,
        "Exploratory-Discovery": 0.79,
        "Verification-Confirmation": 0.71,
        "Iterative-Optimization": 0.68,
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
//      final_total_score   = √(0.79 × 0.7603) = 0.7750
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
      problem_id: "100010",
      task_grade: "B",
      dimension_grades: {
        "Discovery-Self-Understanding": "A",
        "Expression-Translation": "B",
        "Exploratory-Discovery": "B",
        "Verification-Confirmation": null,
        "Iterative-Optimization": null,
      },
    },
    {
      problem_id: "100020",
      task_grade: "B",
      dimension_grades: {
        "Discovery-Self-Understanding": "A",
        "Expression-Translation": null,
        "Exploratory-Discovery": null,
        "Verification-Confirmation": "C",
        "Iterative-Optimization": "B",
      },
    },
    {
      problem_id: "100031",
      task_grade: "A",
      dimension_grades: {
        "Discovery-Self-Understanding": "A",
        "Expression-Translation": "A",
        "Exploratory-Discovery": "B",
        "Verification-Confirmation": "B",
        "Iterative-Optimization": "B",
      },
    },
  ],
  ability_grades: {
    "Discovery-Self-Understanding": "A",
    "Expression-Translation": "B",
    "Exploratory-Discovery": "B",
    "Verification-Confirmation": "C",
    "Iterative-Optimization": "B",
  },
  total_grades: {
    total_problem_grade: "B",
    total_ability_grade: "B",
    final_total_grade: "B",
  },
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
console.log("total_grades:", curved.total_grades);

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
