/**
 * Score Post-LLM Pipeline — Effect Schema (FP-native) v3
 *
 * 1. RECORD + OPTION — Per-problem dimension scores/grades use
 *    Record<Dimension, Option>. All 5 keys present; untested dims = None.
 *
 * 2. SCHEMA-LEVEL DERIVATION — ability_scores and totals are computed getters
 *    on the JSONScores class. They're part of the decoded type but NOT stored
 *    in JSON (Schema.Class only encodes declared fields).
 *
 * 3. EMBEDDED DimMap — ProblemDimensionMap is embedded directly (not by UUID).
 *    JSONScores is self-contained.
 *
 * 4. COMPOSITION — CurvedScores wraps JSONScores (via source).
 *
 * Scope: JSONScores, CurvedScores, ProblemDimensionMap, and their dependencies.
 * Curve, ScorePool, EventConfig are not yet ported.
 */

import { Schema, Option } from "effect";

// =============================================================================
// 1. Branded Primitives
// =============================================================================

/** 6-digit string, last digit 0|1 (language) */
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

export const DIMENSIONS = [
  "Discovery-Self-Understanding",
  "Expression-Translation",
  "Exploratory-Discovery",
  "Verification-Confirmation",
  "Iterative-Optimization",
] as const;

export const Dimension = Schema.Literal(...DIMENSIONS);
export type Dimension = typeof Dimension.Type;

export const LetterGrade = Schema.Literal("A", "B", "C", "D");
export type LetterGrade = typeof LetterGrade.Type;

// =============================================================================
// 3. ProblemDimensionMap — standalone entity
// =============================================================================

export const DimMapEntry = Schema.Struct({
  problem_id: ProblemId,
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

/**
 * Per-problem scores. All 5 dimension keys present;
 * untested dimensions are None (null in JSON).
 */
export const ProblemScore = Schema.Struct({
  problem_id: ProblemId,
  task_score: ScoreValue,
  dimension_scores: Schema.Record({
    key: Dimension,
    value: Schema.OptionFromNullOr(ScoreValue),
  }),
});
export type ProblemScore = typeof ProblemScore.Type;

// =============================================================================
// 5. JSONScores — Schema.Class with derived getters
//
// Stored fields (JSON): scores_id, event_id, ..., problem_scores
// Derived getters:      ability_scores, totals
//
// Getters are part of the decoded type but NOT serialized.
// Schema.Class only encodes declared fields.
//
// Formulas:
//   ability_scores[dim]  = arithmetic mean of that dim across mapped problems
//   total_problem_score  = arithmetic mean of task_scores
//   total_ability_score  = arithmetic mean of the 5 ability scores
//   final_total_score    = geometric mean: √(problem × ability)
// =============================================================================

/** Arithmetic mean. Returns 0 for empty input. */
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/** Geometric mean of two non-negative numbers: √(a × b) */
const geoMean2 = (a: number, b: number): number => Math.sqrt(a * b);

const toScoreValue = Schema.decodeSync(ScoreValue);

export class JSONScores extends Schema.Class<JSONScores>("JSONScores")({
  scores_id: Schema.UUID,
  event_id: EventId,
  prompt_version_hash: PromptVersionHash,
  dimension_map: ProblemDimensionMap,
  generated_at: Schema.DateTimeUtc,
  participant_id: Schema.String.pipe(Schema.minLength(1)),
  problem_scores: Schema.Array(ProblemScore),
}) {
  /** Per-dimension arithmetic mean across mapped problems (skip None) */
  get ability_scores(): { readonly [K in Dimension]: ScoreValue } {
    const entries = DIMENSIONS.map((dim) => {
      const values = this.problem_scores
        .map((p) => p.dimension_scores[dim])
        .filter(Option.isSome)
        .map((o) => o.value);
      return [dim, toScoreValue(mean(values))] as const;
    });
    return Object.fromEntries(entries) as {
      readonly [K in Dimension]: ScoreValue;
    };
  }

  /** Derived totals from problem_scores */
  get totals() {
    const abilities = this.ability_scores;
    const totalProblem = toScoreValue(
      mean(this.problem_scores.map((p) => p.task_score))
    );
    const totalAbility = toScoreValue(mean(Object.values(abilities)));
    const finalTotal = toScoreValue(geoMean2(totalProblem, totalAbility));
    return {
      total_problem_score: totalProblem,
      total_ability_score: totalAbility,
      final_total_score: finalTotal,
    } as const;
  }
}

// =============================================================================
// 6. Grades — per-problem grades use Record + Option (mirrors scores)
//
// Aggregates (ability_grades, total_grades) ARE stored because
// computing them requires the curve function, not simple averaging.
// =============================================================================

/** Per-problem grades. Mirrors ProblemScore structure. */
export const ProblemGrade = Schema.Struct({
  problem_id: ProblemId,
  task_grade: LetterGrade,
  dimension_grades: Schema.Record({
    key: Dimension,
    value: Schema.OptionFromNullOr(LetterGrade),
  }),
});
export type ProblemGrade = typeof ProblemGrade.Type;

export const TotalGrades = Schema.Struct({
  total_problem_grade: LetterGrade,
  total_ability_grade: LetterGrade,
  final_total_grade: LetterGrade,
});
export type TotalGrades = typeof TotalGrades.Type;

// =============================================================================
// 7. CurvedScores — composes JSONScores, adds grades
// =============================================================================

export const CurvedScores = Schema.Struct({
  curved_scores_id: Schema.UUID,
  source: JSONScores,
  applied_curve_id: Schema.UUID,
  curved_at: Schema.DateTimeUtc,
  problem_grades: Schema.Array(ProblemGrade),
  /** Stored because computing these requires the curve function */
  ability_grades: Schema.Record({ key: Dimension, value: LetterGrade }),
  total_grades: TotalGrades,
});
export type CurvedScores = typeof CurvedScores.Type;

// =============================================================================
// Decode / Encode helpers
// =============================================================================

export const decodeJSONScores = Schema.decodeUnknownSync(JSONScores);
export const decodeCurvedScores = Schema.decodeUnknownSync(CurvedScores);
export const decodeProblemDimensionMap =
  Schema.decodeUnknownSync(ProblemDimensionMap);
