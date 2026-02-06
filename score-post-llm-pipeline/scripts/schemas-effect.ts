/**
 * Score Post-LLM Pipeline — Effect Schema (FP-native)
 *
 * Key differences from the Zod version (schemas.ts):
 *
 * 1. BRANDED TYPES — ProblemId, PromptVersionHash, ScoreValue, EventId are
 *    distinct types at compile time. No accidental mixing.
 *
 * 2. COMPOSITION OVER DUPLICATION — CurvedScores wraps JSONScores (via source),
 *    it doesn't copy all its fields. Single source of truth for numeric scores.
 *
 * 3. STANDALONE DimMap — ProblemDimensionMap is a first-class entity, referenced
 *    by dimension_map_id in JSONScores and CurvedScores.
 *
 * 4. ARRAYS OVER PARTIAL RECORDS — Grades use array-of-structs (like scores do)
 *    instead of nested Record<Dimension, Grade>. This naturally handles per-problem
 *    dimension subsets without partial-key hacks.
 *
 * 5. DECODE/ENCODE — Each schema defines both directions.
 *
 * Scope: JSONScores, CurvedScores, ProblemDimensionMap, and their dependencies.
 * Curve, ScorePool, EventConfig are not yet ported.
 */

import { Schema } from "effect";

// =============================================================================
// 1. Branded Primitives
// =============================================================================

/** 6-digit string, last digit 0|1 (language), second-to-last is minor version */
export const ProblemId = Schema.String.pipe(
  Schema.pattern(/^\d{6}$/),
  Schema.filter((s) => s[5] === "0" || s[5] === "1", {
    message: () => "Last digit must be 0 (zh) or 1 (en)",
  }),
  Schema.brand("ProblemId")
);
export type ProblemId = typeof ProblemId.Type;

/** Git commit hash, 7–40 hex chars */
export const PromptVersionHash = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]{7,40}$/),
  Schema.brand("PromptVersionHash")
);
export type PromptVersionHash = typeof PromptVersionHash.Type;

/** Score value clamped to [0, 1] */
export const ScoreValue = Schema.Number.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(1),
  Schema.brand("ScoreValue")
);
export type ScoreValue = typeof ScoreValue.Type;

export const EventId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("EventId")
);
export type EventId = typeof EventId.Type;

// =============================================================================
// 2. Enums
// =============================================================================

export const Dimension = Schema.Literal(
  "Discovery-Self-Understanding",
  "Expression-Translation",
  "Exploratory-Discovery",
  "Verification-Confirmation",
  "Iterative-Optimization"
);
export type Dimension = typeof Dimension.Type;

export const LetterGrade = Schema.Literal("A", "B", "C", "D");
export type LetterGrade = typeof LetterGrade.Type;

// =============================================================================
// 3. ProblemDimensionMap — standalone entity
// =============================================================================

export const DimMapEntry = Schema.Struct({
  problem_id: ProblemId,
  problem_version: Schema.String,
  dimensions: Schema.Array(Dimension),
});
export type DimMapEntry = typeof DimMapEntry.Type;

export const ProblemDimensionMap = Schema.Struct({
  map_id: Schema.UUID,
  label: Schema.String,
  created_at: Schema.DateTimeUtc,
  entries: Schema.Array(DimMapEntry),
});
export type ProblemDimensionMap = typeof ProblemDimensionMap.Type;

// =============================================================================
// 4. Score Components
// =============================================================================

export const TotalScores = Schema.Struct({
  total_problem_score: ScoreValue,
  total_ability_score: ScoreValue,
  final_total_score: ScoreValue,
});
export type TotalScores = typeof TotalScores.Type;

/** One dimension score — used in both ability_scores and problem dimension breakdowns */
export const DimensionScore = Schema.Struct({
  dimension: Dimension,
  score: ScoreValue,
});
export type DimensionScore = typeof DimensionScore.Type;

export const ProblemScore = Schema.Struct({
  problem_id: ProblemId,
  task_score: ScoreValue,
  /** Only the dimensions listed in the DimMap for this problem */
  dimension_scores: Schema.Array(DimensionScore),
});
export type ProblemScore = typeof ProblemScore.Type;

// =============================================================================
// 5. JSONScores — pre-curve, no letter grades
// =============================================================================

export const JSONScores = Schema.Struct({
  scores_id: Schema.UUID,
  event_id: EventId,
  prompt_version_hash: PromptVersionHash,
  dimension_map_id: Schema.UUID,
  generated_at: Schema.DateTimeUtc,
  participant_id: Schema.String.pipe(Schema.minLength(1)),

  totals: TotalScores,
  /** Always all 5 dimensions (aggregated across problems) */
  ability_scores: Schema.Array(DimensionScore).pipe(Schema.itemsCount(5)),
  /** Per-problem scores; dimension_scores follow the DimMap */
  problem_scores: Schema.Array(ProblemScore),
});
export type JSONScores = typeof JSONScores.Type;

// =============================================================================
// 6. Letter Grades — array-of-structs (mirrors score structure)
//
// Why arrays instead of Record<Dimension, Grade>?
// - Record with literal keys requires ALL keys present
// - Per-problem dimension grades are a SUBSET (governed by DimMap)
// - Arrays naturally handle variable-length subsets
// - Mirrors how scores are already represented (ability_scores, dimension_scores)
// =============================================================================

export const TotalGrades = Schema.Struct({
  total_problem_grade: LetterGrade,
  total_ability_grade: LetterGrade,
  final_total_grade: LetterGrade,
});
export type TotalGrades = typeof TotalGrades.Type;

/** Grade for one dimension (aggregated across problems) */
export const AbilityGrade = Schema.Struct({
  dimension: Dimension,
  grade: LetterGrade,
});
export type AbilityGrade = typeof AbilityGrade.Type;

/** Grade for one problem's task score */
export const ProblemGrade = Schema.Struct({
  problem_id: ProblemId,
  grade: LetterGrade,
});
export type ProblemGrade = typeof ProblemGrade.Type;

/** Grade for one dimension within one problem */
export const DimensionDetailGrade = Schema.Struct({
  problem_id: ProblemId,
  dimension: Dimension,
  grade: LetterGrade,
});
export type DimensionDetailGrade = typeof DimensionDetailGrade.Type;

export const LetterGrades = Schema.Struct({
  totals: TotalGrades,
  /** All 5 dimensions — always complete */
  abilities: Schema.Array(AbilityGrade).pipe(Schema.itemsCount(5)),
  /** One grade per problem */
  problems: Schema.Array(ProblemGrade),
  /** Per-problem per-dimension — only mapped dimensions (flat list) */
  dimension_details: Schema.Array(DimensionDetailGrade),
});
export type LetterGrades = typeof LetterGrades.Type;

// =============================================================================
// 7. CurvedScores — COMPOSES JSONScores, doesn't duplicate
// =============================================================================

/**
 * CurvedScores wraps the source JSONScores by reference.
 * Numeric scores live in `source` — single source of truth.
 * This struct only adds what the curve step produces: grades + metadata.
 */
export const CurvedScores = Schema.Struct({
  curved_scores_id: Schema.UUID,
  source: JSONScores,
  applied_curve_id: Schema.UUID,
  curved_at: Schema.DateTimeUtc,
  grades: LetterGrades,
});
export type CurvedScores = typeof CurvedScores.Type;

// =============================================================================
// Decode / Encode helpers
// =============================================================================

export const decodeJSONScores = Schema.decodeUnknownSync(JSONScores);
export const decodeCurvedScores = Schema.decodeUnknownSync(CurvedScores);
export const decodeProblemDimensionMap =
  Schema.decodeUnknownSync(ProblemDimensionMap);
