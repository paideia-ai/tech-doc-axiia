/**
 * Score Post-LLM Pipeline Schemas
 * All schemas defined with Zod for runtime validation
 *
 * KEY DESIGN PRINCIPLES (from ip-02.md, ip-03.md, ip-04.md):
 * 1. Scores are separate from reports (extract → curve → merge back)
 * 2. Creating a curve requires MULTIPLE scores (ScorePool, multi-event)
 * 3. Applying a curve requires only ONE score (JSONScores)
 * 4. Before curve: NO letter grade field at all
 * 5. After curve: letter grades are A, B, C, D only
 * 6. Use record format for curves (O(1) lookup)
 * 7. Embed dependency in Curve for compatibility checking
 */

import { z } from "zod";

// =============================================================================
// 1. Common Types
// =============================================================================

/**
 * Problem ID format: exactly 6 digits
 * - Last digit indicates language: 0=Chinese, 1=English
 * - Second last digit indicates minor version
 * - Remaining digits indicate major version
 */
export const ProblemIdSchema = z
  .string()
  .regex(/^\d{6}$/, "Problem ID must be exactly 6 digits")
  .superRefine((value, ctx) => {
    const langDigit = value[5];
    if (langDigit !== "0" && langDigit !== "1") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Problem ID last digit must be 0 (zh) or 1 (en)",
      });
    }
  });

export type ProblemId = z.infer<typeof ProblemIdSchema>;

/**
 * 5 Core Dimensions of AI Collaboration (enum)
 * 1. Discovery-Self-Understanding (发现与自我理解)
 * 2. Expression-Translation (表达与转译)
 * 3. Exploratory-Discovery (探索式发现)
 * 4. Verification-Confirmation (验证与确认)
 * 5. Iterative-Optimization (迭代优化与反馈)
 */
export const DimensionSchema = z.enum([
  "Discovery-Self-Understanding",
  "Expression-Translation",
  "Exploratory-Discovery",
  "Verification-Confirmation",
  "Iterative-Optimization",
]);

export type Dimension = z.infer<typeof DimensionSchema>;

export const EventIdSchema = z.string().min(1);
export type EventId = z.infer<typeof EventIdSchema>;

export const LangSchema = z.enum(["zh", "en"]);
export type Lang = z.infer<typeof LangSchema>;

export const PromptVersionHashSchema = z
  .string()
  .regex(/^[a-f0-9]{7,40}$/, "Must be a valid git commit hash");

export type PromptVersionHash = z.infer<typeof PromptVersionHashSchema>;

export const LetterGradeSchema = z.enum(["A", "B", "C", "D"]);
export type LetterGrade = z.infer<typeof LetterGradeSchema>;

export const ScoreValueSchema = z.number().min(0).max(1);
export type ScoreValue = z.infer<typeof ScoreValueSchema>;

// =============================================================================
// 2. Dimension-Problem Dependency Schema
// =============================================================================

/**
 * Maps which problems contribute to each dimension's score.
 * Embedded in both Curve and ScorePool for compatibility checking.
 */
export const DimensionProblemDependencySchema = z.object({
  problem_id: ProblemIdSchema,
  problem_version: z.number().int().nonnegative(),
  dimensions: z.array(DimensionSchema),
});

export type DimensionProblemDependency = z.infer<typeof DimensionProblemDependencySchema>;

export const DimensionProblemDependencyListSchema = z.array(DimensionProblemDependencySchema);
export type DimensionProblemDependencyList = z.infer<typeof DimensionProblemDependencyListSchema>;

// =============================================================================
// 3. Total Scores Schema
// =============================================================================

/**
 * Total scores breakdown:
 * - total_problem_score: average of all problem objective scores
 * - total_ability_score: average of all dimension scores
 * - final_total_score: geometric mean of (total_problem_score, total_ability_score)
 */
export const TotalScoresSchema = z.object({
  total_problem_score: ScoreValueSchema,
  total_ability_score: ScoreValueSchema,
  final_total_score: ScoreValueSchema,
});

export type TotalScores = z.infer<typeof TotalScoresSchema>;

// =============================================================================
// 4. JSONScores Schema (PRE-CURVE - no letter grades)
// =============================================================================

export const AbilityScoreSchema = z.object({
  dimension: DimensionSchema,
  score: ScoreValueSchema,
});

export type AbilityScore = z.infer<typeof AbilityScoreSchema>;

/**
 * Per-problem per-dimension score
 */
export const DimensionDetailScoreSchema = z.object({
  dimension: DimensionSchema,
  score: ScoreValueSchema,
});

export type DimensionDetailScore = z.infer<typeof DimensionDetailScoreSchema>;

export const ProblemScoreSchema = z.object({
  problem_id: ProblemIdSchema,
  /** Task/objective score for this problem */
  task_score: ScoreValueSchema,
  /** Per-dimension scores within this problem */
  dimension_scores: z.array(DimensionDetailScoreSchema),
});

export type ProblemScore = z.infer<typeof ProblemScoreSchema>;

/**
 * JSONScores: Pre-curve scores extracted from LLM report.
 * NO letter grade field - grades are computed after curving.
 */
export const JSONScoresSchema = z.object({
  scores_id: z.string().uuid(),
  event_id: EventIdSchema,
  prompt_version_hash: PromptVersionHashSchema,
  generated_at: z.string().datetime(),
  participant_id: z.string().min(1),
  /** Breakdown of total scores */
  totals: TotalScoresSchema,
  /** 5 ability scores (one per dimension) */
  ability_scores: z.array(AbilityScoreSchema).length(5),
  /** Per-problem scores with nested dimension scores */
  problem_scores: z.array(ProblemScoreSchema),
  // NOTE: No letter_grades field - this is pre-curve
});

export type JSONScores = z.infer<typeof JSONScoresSchema>;

// =============================================================================
// 5. Curve Schema
// =============================================================================

/**
 * Curve computation method (discriminated union for extensibility)
 * Currently only standard_deviation is implemented.
 */
export const CurveMethodSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("percentile"),
    percentiles: z.array(z.number().min(0).max(1)),
  }),
  z.object({
    type: z.literal("standard_deviation"),
    /** e.g., [1, 0, -1] means A > μ+1σ, B > μ, C > μ-1σ, D ≤ μ-1σ */
    sigma_boundaries: z.array(z.number()),
  }),
  z.object({
    type: z.literal("absolute"),
    thresholds: z.array(ScoreValueSchema),
  }),
]);

export type CurveMethod = z.infer<typeof CurveMethodSchema>;

/**
 * Grade thresholds (v1 format)
 * A/B/C are minimum scores for each grade.
 * D is implied: score < C threshold.
 */
export const GradeThresholdsSchema = z.object({
  A: ScoreValueSchema,
  B: ScoreValueSchema,
  C: ScoreValueSchema,
});

export type GradeThresholds = z.infer<typeof GradeThresholdsSchema>;

/**
 * Curves for total scores
 */
export const TotalCurvesSchema = z.object({
  total_problem: GradeThresholdsSchema,
  total_ability: GradeThresholdsSchema,
  final_total: GradeThresholdsSchema,
});

export type TotalCurves = z.infer<typeof TotalCurvesSchema>;

/**
 * Curve: Computed from ScorePool, used to assign letter grades.
 * - Supports multiple source events
 * - Embeds dependency for compatibility checking
 * - Uses record format for O(1) lookup
 */
export const CurveSchema = z.object({
  curve_id: z.string().uuid(),
  label: z.string().min(1),
  /** Multiple source events allowed */
  source_event_ids: z.array(EventIdSchema).min(1),
  prompt_version_hash: PromptVersionHashSchema,
  /** Embedded dependency for compatibility check when applying curve */
  dimension_problem_dependency: DimensionProblemDependencyListSchema,
  method: CurveMethodSchema,
  sample_size: z.number().int().positive(),
  computed_at: z.string().datetime(),
  /** Curves for the three total score types */
  totals: TotalCurvesSchema,
  /** Per-dimension curves (record for O(1) lookup) */
  ability_curves: z.record(DimensionSchema, GradeThresholdsSchema),
  /** Per-problem curves (record for O(1) lookup) */
  problem_curves: z.record(ProblemIdSchema, GradeThresholdsSchema),
});

export type Curve = z.infer<typeof CurveSchema>;

// =============================================================================
// 6. CurvedScores Schema (POST-CURVE - with letter grades A/B/C/D)
// =============================================================================

/**
 * Letter grades for total scores
 */
export const TotalGradesSchema = z.object({
  total_problem_grade: LetterGradeSchema,
  total_ability_grade: LetterGradeSchema,
  final_total_grade: LetterGradeSchema,
});

export type TotalGrades = z.infer<typeof TotalGradesSchema>;

/**
 * CurvedScores: Post-curve output with scores + letter grades.
 * Includes dimensionDetailGrades for per-problem per-dimension grades.
 */
export const CurvedScoresSchema = z.object({
  curved_scores_id: z.string().uuid(),
  source_scores_id: z.string().uuid(),
  event_id: EventIdSchema,
  prompt_version_hash: PromptVersionHashSchema,
  applied_curve_id: z.string().uuid(),
  curved_at: z.string().datetime(),
  participant_id: z.string().min(1),
  /** Original scores (copied from source JSONScores) */
  totals: TotalScoresSchema,
  ability_scores: z.array(AbilityScoreSchema),
  problem_scores: z.array(ProblemScoreSchema),
  /** Letter grades (A/B/C/D, computed from curve) */
  letter_grades: z.object({
    totals: TotalGradesSchema,
    /** Per-dimension grades */
    abilities: z.record(DimensionSchema, LetterGradeSchema),
    /** Per-problem grades */
    problems: z.record(ProblemIdSchema, LetterGradeSchema),
    /** Per-problem per-dimension grades (#10 from ip-04) */
    dimension_details: z.record(
      ProblemIdSchema,
      z.record(DimensionSchema, LetterGradeSchema)
    ),
  }),
});

export type CurvedScores = z.infer<typeof CurvedScoresSchema>;

// =============================================================================
// 7. Score Pool Schema (for curve computation input)
// =============================================================================

/**
 * ScorePool: Collection of scores for curve computation.
 * - Allows scores from multiple events
 * - All scores must contain the specified problem_ids and dimensions
 * - Embeds dependency for consistency
 */
export const ScorePoolSchema = z.object({
  pool_id: z.string().uuid(),
  label: z.string().min(1),
  /** Multiple source events allowed */
  source_event_ids: z.array(EventIdSchema).min(1),
  prompt_version_hash: PromptVersionHashSchema,
  /** Required problems - must be present in all scores */
  problem_ids: z.array(ProblemIdSchema),
  /** Embedded dependency */
  dimension_problem_dependency: DimensionProblemDependencyListSchema,
  created_at: z.string().datetime(),
  scores: z.array(JSONScoresSchema),
});

export type ScorePool = z.infer<typeof ScorePoolSchema>;

// =============================================================================
// 8. Compatibility Result Schema
// =============================================================================

export const CompatibilityResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("compatible"),
  }),
  z.object({
    status: z.literal("incompatible"),
    reasons: z.array(z.string()),
  }),
  z.object({
    status: z.literal("requires_override"),
    warnings: z.array(z.string()),
    differences: z.object({
      prompt_version_mismatch: z.boolean(),
      problem_id_differences: z.array(z.string()).optional(),
      dimension_differences: z.array(z.string()).optional(),
    }),
  }),
]);

export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

// =============================================================================
// 9. Event Config Schema
// =============================================================================

export const EventConfigSchema = z.object({
  event_id: EventIdSchema,
  name: z.string().min(1),
  /** Human-readable problem names (keyed by problem_id) */
  problem_names: z.record(ProblemIdSchema, z.string()),
  problem_ids: z.array(ProblemIdSchema),
  language: LangSchema,
  prompt_version_hash: PromptVersionHashSchema,
});

export type EventConfig = z.infer<typeof EventConfigSchema>;
