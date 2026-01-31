/**
 * Score Post-LLM Pipeline Schemas
 * All schemas defined with Zod for runtime validation
 */

import { z } from "zod";

// =============================================================================
// Common Types
// =============================================================================

export const ProblemIdSchema = z
  .string()
  .regex(/^\d{6,8}$/, "Problem ID must be 6-8 digits");

export const DimensionIdSchema = z.string().min(1);

export const EventIdSchema = z.string().min(1);

export const PromptVersionHashSchema = z
  .string()
  .regex(/^[a-f0-9]{7,40}$/, "Must be a valid git commit hash");

export const LetterGradeSchema = z.enum(["A", "B", "C", "D", "X"]);

export const ScoreValueSchema = z.number().min(0).max(1);

// =============================================================================
// 1. Report JSON Schema (原始报告 - 无 letter grades)
// =============================================================================

export const ProblemInReportSchema = z.object({
  problem_id: ProblemIdSchema,
  dimension_scores: z.record(DimensionIdSchema, ScoreValueSchema),
  objective_score: ScoreValueSchema,
});

export const AbilityDimensionInReportSchema = z.object({
  dimension_id: DimensionIdSchema,
  score: ScoreValueSchema,
});

export const ReportJSONSchema = z.object({
  report_id: z.string().uuid(),
  event_id: EventIdSchema,
  prompt_version_hash: PromptVersionHashSchema,
  generated_at: z.string().datetime(),
  participant_id: z.string().min(1),
  problems: z.array(ProblemInReportSchema),
  abilities: z.array(AbilityDimensionInReportSchema),
  overall_score: ScoreValueSchema.nullable(),
  letter_grades: z.null(),
});

export type ReportJSON = z.infer<typeof ReportJSONSchema>;

// =============================================================================
// 2. JSON Scores Schema (提取的分数)
// =============================================================================

export const AbilityScoreSchema = z.object({
  dimension_id: DimensionIdSchema,
  score: ScoreValueSchema,
});

export const ProblemScoreSchema = z.object({
  problem_id: ProblemIdSchema,
  objective_score: ScoreValueSchema,
  dimension_scores: z.array(AbilityScoreSchema),
});

export const JSONScoresSchema = z.object({
  source_report_id: z.string().uuid(),
  event_id: EventIdSchema,
  participant_id: z.string().min(1),
  overall_score: ScoreValueSchema.nullable(),
  ability_scores: z.array(AbilityScoreSchema),
  problem_scores: z.array(ProblemScoreSchema),
});

export type JSONScores = z.infer<typeof JSONScoresSchema>;

// =============================================================================
// 3. Curve Schema
// =============================================================================

export const CurveMethodSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("percentile"),
    percentiles: z.array(z.number().min(0).max(1)),
  }),
  z.object({
    type: z.literal("standard_deviation"),
    sigma_boundaries: z.array(z.number()),
  }),
  z.object({
    type: z.literal("absolute"),
    thresholds: z.array(ScoreValueSchema),
  }),
]);

export type CurveMethod = z.infer<typeof CurveMethodSchema>;

export const ThresholdDefinitionSchema = z.object({
  thresholds: z.array(ScoreValueSchema),
  grades: z.array(LetterGradeSchema.exclude(["X"])),
});

export const OverallCurveSchema = ThresholdDefinitionSchema;

export const AbilityCurveSchema = z.object({
  dimension_id: DimensionIdSchema,
  thresholds: z.array(ScoreValueSchema),
  grades: z.array(LetterGradeSchema.exclude(["X"])),
});

export const ProblemCurveSchema = z.object({
  problem_id: ProblemIdSchema,
  thresholds: z.array(ScoreValueSchema),
  grades: z.array(LetterGradeSchema.exclude(["X"])),
});

export const CurveSchema = z.object({
  curve_id: z.string().uuid(),
  source_event_id: EventIdSchema,
  prompt_version_hash: PromptVersionHashSchema,
  problem_ids: z.array(ProblemIdSchema),
  dimension_ids: z.array(DimensionIdSchema),
  method: CurveMethodSchema,
  sample_size: z.number().int().positive(),
  computed_at: z.string().datetime(),
  overall: OverallCurveSchema,
  ability_curves: z.array(AbilityCurveSchema),
  problem_curves: z.array(ProblemCurveSchema),
});

export type Curve = z.infer<typeof CurveSchema>;

// =============================================================================
// 4. Curved Letter Grades Schema
// =============================================================================

export const AbilityGradeSchema = z.object({
  dimension_id: DimensionIdSchema,
  grade: LetterGradeSchema.exclude(["X"]),
});

export const ProblemGradeSchema = z.object({
  problem_id: ProblemIdSchema,
  grade: LetterGradeSchema.exclude(["X"]),
});

export const CurvedLetterGradesSchema = z.object({
  source_scores_id: z.string().uuid(),
  curve_id: z.string().uuid(),
  computed_at: z.string().datetime(),
  overall_grade: LetterGradeSchema.exclude(["X"]),
  ability_grades: z.array(AbilityGradeSchema),
  problem_grades: z.array(ProblemGradeSchema),
});

export type CurvedLetterGrades = z.infer<typeof CurvedLetterGradesSchema>;

// =============================================================================
// 5. Curved Report Schema (最终报告)
// =============================================================================

export const LetterGradesInReportSchema = z.object({
  overall: LetterGradeSchema.exclude(["X"]),
  abilities: z.record(DimensionIdSchema, LetterGradeSchema.exclude(["X"])),
  problems: z.record(ProblemIdSchema, LetterGradeSchema.exclude(["X"])),
});

export const CurvedReportSchema = z.object({
  curved_report_id: z.string().uuid(),
  source_report_id: z.string().uuid(),
  event_id: EventIdSchema,
  prompt_version_hash: PromptVersionHashSchema,
  applied_curve_id: z.string().uuid(),
  curved_at: z.string().datetime(),
  participant_id: z.string().min(1),
  problems: z.array(ProblemInReportSchema),
  abilities: z.array(AbilityDimensionInReportSchema),
  overall_score: ScoreValueSchema.nullable(),
  letter_grades: LetterGradesInReportSchema,
});

export type CurvedReport = z.infer<typeof CurvedReportSchema>;

// =============================================================================
// 6. Score Pool Schema (for curve computation input)
// =============================================================================

export const ScorePoolSchema = z.object({
  event_id: EventIdSchema,
  prompt_version_hash: PromptVersionHashSchema,
  problem_ids: z.array(ProblemIdSchema),
  dimension_ids: z.array(DimensionIdSchema),
  scores: z.array(JSONScoresSchema),
});

export type ScorePool = z.infer<typeof ScorePoolSchema>;

// =============================================================================
// 7. Compatibility Result Schema
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
      dimension_id_differences: z.array(z.string()).optional(),
    }),
  }),
]);

export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

// =============================================================================
// 8. Event Config Schema
// =============================================================================

export const EventConfigSchema = z.object({
  event_id: EventIdSchema,
  name: z.string().min(1),
  problem_ids: z.array(ProblemIdSchema),
  dimension_ids: z.array(DimensionIdSchema),
  language: z.enum(["zh", "en"]),
  prompt_version_hash: PromptVersionHashSchema,
});

export type EventConfig = z.infer<typeof EventConfigSchema>;

// =============================================================================
// 9. Dimension-Problem Dependency Schema
// =============================================================================

export const DimensionProblemDependencySchema = z.object({
  dimension_id: DimensionIdSchema,
  contributing_problem_ids: z.array(ProblemIdSchema),
});

export const DimensionDependencyConfigSchema = z.object({
  version: z.string(),
  updated_at: z.string().datetime(),
  dependencies: z.array(DimensionProblemDependencySchema),
});

export type DimensionDependencyConfig = z.infer<typeof DimensionDependencyConfigSchema>;
