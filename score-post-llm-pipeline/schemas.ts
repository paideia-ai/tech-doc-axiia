import { z } from "zod";

// =============================================================================
// Common Types
// =============================================================================

/**
 * Problem ID format: XXXXXX[V][L]
 * - Base ID: 6 digits
 * - V: Version digit (major version changes)
 * - L: Language digit (0=Chinese, 1=English)
 */
export const ProblemIdSchema = z
  .string()
  .regex(/^\d{6,8}$/, "Problem ID must be 6-8 digits");

export const DimensionIdSchema = z.string().min(1);

export const EventIdSchema = z.string().min(1);

/**
 * Git commit hash for prompt versioning
 */
export const PromptVersionHashSchema = z
  .string()
  .regex(/^[a-f0-9]{7,40}$/, "Must be a valid git commit hash (short or full)");

/**
 * Letter grades: A, B, C, D, or X (uncurved)
 */
export const LetterGradeSchema = z.enum(["A", "B", "C", "D", "X"]);

/**
 * Score value: normalized 0-1 range
 */
export const ScoreValueSchema = z.number().min(0).max(1);

// =============================================================================
// 1. Report JSON Schema (原始报告 - 无 letter grades)
// =============================================================================

export const ProblemInReportSchema = z.object({
  problem_id: ProblemIdSchema,
  /** Scores for each ability dimension within this problem */
  dimension_scores: z.record(DimensionIdSchema, ScoreValueSchema),
  /** Objective score for the problem */
  objective_score: ScoreValueSchema,
});

export const AbilityDimensionInReportSchema = z.object({
  dimension_id: DimensionIdSchema,
  /** Aggregated score for this dimension across all problems */
  score: ScoreValueSchema,
});

/**
 * Report JSON: Output from LLM generation stage
 * - Contains scores but NO letter grades (or all set to null/"X")
 * - Must record prompt version for traceability
 */
export const ReportJSONSchema = z.object({
  /** Unique identifier for this report */
  report_id: z.string().uuid(),
  /** Event this report belongs to */
  event_id: EventIdSchema,
  /** Git commit hash of prompts used during generation */
  prompt_version_hash: PromptVersionHashSchema,
  /** Timestamp when report was generated */
  generated_at: z.string().datetime(),
  /** Participant/user identifier */
  participant_id: z.string().min(1),
  /** Per-problem scores */
  problems: z.array(ProblemInReportSchema),
  /** Per-dimension aggregated scores */
  abilities: z.array(AbilityDimensionInReportSchema),
  /** Overall/total score (geometric mean) */
  overall_score: ScoreValueSchema.nullable(),
  /**
   * Letter grades: MUST be null for uncurved reports
   * This field explicitly indicates the report has NOT been curved
   */
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
  /** Per-dimension scores within this problem */
  dimension_scores: z.array(AbilityScoreSchema),
});

/**
 * JSON Scores: Extracted scores from Report JSON
 * - Separate entity for curve computation and application
 * - Contains all score data in a flat, processable structure
 */
export const JSONScoresSchema = z.object({
  /** Reference to source report */
  source_report_id: z.string().uuid(),
  /** Event ID (copied from source report) */
  event_id: EventIdSchema,
  /** Participant ID (copied from source report) */
  participant_id: z.string().min(1),
  /** Overall/total score */
  overall_score: ScoreValueSchema.nullable(),
  /** Per-dimension scores */
  ability_scores: z.array(AbilityScoreSchema),
  /** Per-problem scores with nested dimension scores */
  problem_scores: z.array(ProblemScoreSchema),
});

export type JSONScores = z.infer<typeof JSONScoresSchema>;

// =============================================================================
// 3. Curve Schema
// =============================================================================

/**
 * Curve computation method
 */
export const CurveMethodSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("percentile"),
    /** Percentile thresholds, e.g., [0.8, 0.6, 0.4] for A/B/C/D */
    percentiles: z.array(z.number().min(0).max(1)),
  }),
  z.object({
    type: z.literal("standard_deviation"),
    /** Number of standard deviations for each grade boundary */
    /** e.g., [1, 0, -1] means A > mean+1σ, B > mean, C > mean-1σ, D <= mean-1σ */
    sigma_boundaries: z.array(z.number()),
  }),
  z.object({
    type: z.literal("absolute"),
    /** Absolute score thresholds */
    thresholds: z.array(ScoreValueSchema),
  }),
]);

export type CurveMethod = z.infer<typeof CurveMethodSchema>;

/**
 * Threshold definition for a single score type
 */
export const ThresholdDefinitionSchema = z.object({
  /** Score thresholds in descending order [A_threshold, B_threshold, C_threshold] */
  thresholds: z.array(ScoreValueSchema),
  /** Corresponding grades ["A", "B", "C", "D"] */
  grades: z.array(LetterGradeSchema.exclude(["X"])),
});

export const OverallCurveSchema = ThresholdDefinitionSchema;

export const AbilityCurveSchema = z.object({
  dimension_id: DimensionIdSchema,
  ...ThresholdDefinitionSchema.shape,
});

export const ProblemCurveSchema = z.object({
  problem_id: ProblemIdSchema,
  ...ThresholdDefinitionSchema.shape,
});

/**
 * Curve: Computed thresholds for grading
 * - Computed from a pool of scores (event + problem selection)
 * - Can be applied to any compatible report
 */
export const CurveSchema = z.object({
  /** Unique identifier for this curve */
  curve_id: z.string().uuid(),
  /** Event ID from which scores were sourced */
  source_event_id: EventIdSchema,
  /** Prompt version used to generate the source scores */
  prompt_version_hash: PromptVersionHashSchema,
  /** Problem IDs included in this curve */
  problem_ids: z.array(ProblemIdSchema),
  /** Dimension IDs included in this curve */
  dimension_ids: z.array(DimensionIdSchema),
  /** Method used to compute the curve */
  method: CurveMethodSchema,
  /** Number of participants used to compute the curve */
  sample_size: z.number().int().positive(),
  /** Timestamp when curve was computed */
  computed_at: z.string().datetime(),
  /** Overall score curve */
  overall: OverallCurveSchema,
  /** Per-dimension curves */
  ability_curves: z.array(AbilityCurveSchema),
  /** Per-problem curves */
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

/**
 * Curved Letter Grades: Result of applying curve to scores
 * - Intermediate result before merging with report
 * - Links scores to the curve used
 */
export const CurvedLetterGradesSchema = z.object({
  /** Reference to source scores */
  source_scores_id: z.string().uuid(),
  /** Reference to curve used */
  curve_id: z.string().uuid(),
  /** Timestamp when grades were computed */
  computed_at: z.string().datetime(),
  /** Overall grade */
  overall_grade: LetterGradeSchema.exclude(["X"]),
  /** Per-dimension grades */
  ability_grades: z.array(AbilityGradeSchema),
  /** Per-problem grades */
  problem_grades: z.array(ProblemGradeSchema),
});

export type CurvedLetterGrades = z.infer<typeof CurvedLetterGradesSchema>;

// =============================================================================
// 5. Curved Report Schema (最终报告)
// =============================================================================

export const LetterGradesInReportSchema = z.object({
  overall: LetterGradeSchema.exclude(["X"]),
  /** Map of dimension_id -> grade */
  abilities: z.record(DimensionIdSchema, LetterGradeSchema.exclude(["X"])),
  /** Map of problem_id -> grade */
  problems: z.record(ProblemIdSchema, LetterGradeSchema.exclude(["X"])),
});

/**
 * Curved Report: Final report with letter grades applied
 * - Created by merging Report JSON with Curved Letter Grades
 * - MUST record which curve was applied (traceability)
 * - Never modifies the original Report JSON
 */
export const CurvedReportSchema = z.object({
  /** Unique identifier for this curved report */
  curved_report_id: z.string().uuid(),
  /** Reference to original report */
  source_report_id: z.string().uuid(),
  /** Event this report belongs to */
  event_id: EventIdSchema,
  /** Prompt version (copied from source report) */
  prompt_version_hash: PromptVersionHashSchema,
  /** ID of the curve that was applied */
  applied_curve_id: z.string().uuid(),
  /** Timestamp when curve was applied */
  curved_at: z.string().datetime(),
  /** Participant/user identifier */
  participant_id: z.string().min(1),
  /** Per-problem scores (copied from source) */
  problems: z.array(ProblemInReportSchema),
  /** Per-dimension aggregated scores (copied from source) */
  abilities: z.array(AbilityDimensionInReportSchema),
  /** Overall/total score (copied from source) */
  overall_score: ScoreValueSchema.nullable(),
  /** Letter grades (now populated) */
  letter_grades: LetterGradesInReportSchema,
});

export type CurvedReport = z.infer<typeof CurvedReportSchema>;

// =============================================================================
// Compatibility Types
// =============================================================================

/**
 * Result of compatibility check between curve and report/scores
 */
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
    /** Details about what differs */
    differences: z.object({
      prompt_version_mismatch: z.boolean(),
      problem_id_differences: z.array(z.string()).optional(),
      dimension_id_differences: z.array(z.string()).optional(),
    }),
  }),
]);

export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

/**
 * Manual override record for audit trail
 */
export const ManualOverrideSchema = z.object({
  /** Who performed the override */
  overridden_by: z.string().min(1),
  /** When the override was performed */
  overridden_at: z.string().datetime(),
  /** Reason for the override */
  reason: z.string().min(1),
  /** Original compatibility result that was overridden */
  original_result: CompatibilityResultSchema,
});

export type ManualOverride = z.infer<typeof ManualOverrideSchema>;

// =============================================================================
// Dimension-Problem Dependency Schema
// =============================================================================

/**
 * Records which problems contribute to which dimensions
 * Important for determining if a subset of problems can produce meaningful dimension scores
 */
export const DimensionProblemDependencySchema = z.object({
  dimension_id: DimensionIdSchema,
  /** Problem IDs that contribute to this dimension's score */
  contributing_problem_ids: z.array(ProblemIdSchema),
  /** Minimum number of problems required for meaningful dimension score */
  min_required_problems: z.number().int().positive().optional(),
});

export const DimensionDependencyConfigSchema = z.object({
  /** Version of this configuration */
  version: z.string(),
  /** Last updated timestamp */
  updated_at: z.string().datetime(),
  /** Dependencies for each dimension */
  dependencies: z.array(DimensionProblemDependencySchema),
});

export type DimensionDependencyConfig = z.infer<
  typeof DimensionDependencyConfigSchema
>;

// =============================================================================
// Event Schema
// =============================================================================

/**
 * Event configuration schema
 */
export const EventConfigSchema = z.object({
  event_id: EventIdSchema,
  /** Human-readable name */
  name: z.string().min(1),
  /** Problems included in this event */
  problem_ids: z.array(ProblemIdSchema),
  /** Dimensions scored in this event */
  dimension_ids: z.array(DimensionIdSchema),
  /** Language of the event */
  language: z.enum(["zh", "en"]),
  /** Event metadata */
  metadata: z
    .object({
      date: z.string().datetime().optional(),
      participant_count: z.number().int().nonnegative().optional(),
      description: z.string().optional(),
    })
    .optional(),
});

export type EventConfig = z.infer<typeof EventConfigSchema>;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract base problem ID (without language suffix)
 */
export function extractBaseProblemId(problemId: string): string {
  // Remove last digit (language indicator)
  return problemId.slice(0, -1);
}

/**
 * Extract language from problem ID
 */
export function extractLanguage(problemId: string): "zh" | "en" {
  const lastDigit = problemId.slice(-1);
  return lastDigit === "0" ? "zh" : "en";
}

/**
 * Check if two problem IDs are language-equivalent
 * (same problem, different language versions)
 */
export function areLanguageEquivalent(id1: string, id2: string): boolean {
  return extractBaseProblemId(id1) === extractBaseProblemId(id2);
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate that a Report JSON is properly uncurved
 */
export function validateUncurvedReport(report: unknown): ReportJSON {
  const parsed = ReportJSONSchema.parse(report);
  if (parsed.letter_grades !== null) {
    throw new Error("Report JSON must have null letter_grades (uncurved)");
  }
  return parsed;
}

/**
 * Check compatibility between a curve and scores
 */
export function checkCompatibility(
  curve: Curve,
  scores: JSONScores,
  options?: { allowLanguageDifference?: boolean }
): CompatibilityResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Extract problem IDs from scores
  const scoreProblemIds = new Set(scores.problem_scores.map((p) => p.problem_id));
  const curveProblemIds = new Set(curve.problem_ids);

  // Check problem ID match
  const problemIdDifferences: string[] = [];

  for (const pid of curveProblemIds) {
    const baseId = options?.allowLanguageDifference
      ? extractBaseProblemId(pid)
      : pid;
    const hasMatch = options?.allowLanguageDifference
      ? [...scoreProblemIds].some(
          (spid) => extractBaseProblemId(spid) === baseId
        )
      : scoreProblemIds.has(pid);

    if (!hasMatch) {
      problemIdDifferences.push(`Curve has ${pid} but scores missing it`);
    }
  }

  for (const pid of scoreProblemIds) {
    const baseId = options?.allowLanguageDifference
      ? extractBaseProblemId(pid)
      : pid;
    const hasMatch = options?.allowLanguageDifference
      ? [...curveProblemIds].some(
          (cpid) => extractBaseProblemId(cpid) === baseId
        )
      : curveProblemIds.has(pid);

    if (!hasMatch) {
      problemIdDifferences.push(`Scores has ${pid} but curve missing it`);
    }
  }

  if (problemIdDifferences.length > 0) {
    reasons.push(...problemIdDifferences);
  }

  // Check dimension ID match
  const scoreDimensionIds = new Set(
    scores.ability_scores.map((a) => a.dimension_id)
  );
  const curveDimensionIds = new Set(curve.dimension_ids);
  const dimensionIdDifferences: string[] = [];

  for (const did of curveDimensionIds) {
    if (!scoreDimensionIds.has(did)) {
      dimensionIdDifferences.push(`Curve has ${did} but scores missing it`);
    }
  }

  for (const did of scoreDimensionIds) {
    if (!curveDimensionIds.has(did)) {
      dimensionIdDifferences.push(`Scores has ${did} but curve missing it`);
    }
  }

  if (dimensionIdDifferences.length > 0) {
    reasons.push(...dimensionIdDifferences);
  }

  // If there are hard incompatibilities, return incompatible
  if (reasons.length > 0) {
    return {
      status: "incompatible",
      reasons,
    };
  }

  // Note: prompt version check would require access to the original report
  // This is a simplified version

  return { status: "compatible" };
}

// =============================================================================
// Export all schemas for external use
// =============================================================================

export const Schemas = {
  // Common
  ProblemId: ProblemIdSchema,
  DimensionId: DimensionIdSchema,
  EventId: EventIdSchema,
  PromptVersionHash: PromptVersionHashSchema,
  LetterGrade: LetterGradeSchema,
  ScoreValue: ScoreValueSchema,

  // Main entities
  ReportJSON: ReportJSONSchema,
  JSONScores: JSONScoresSchema,
  Curve: CurveSchema,
  CurvedLetterGrades: CurvedLetterGradesSchema,
  CurvedReport: CurvedReportSchema,

  // Supporting types
  CurveMethod: CurveMethodSchema,
  CompatibilityResult: CompatibilityResultSchema,
  ManualOverride: ManualOverrideSchema,
  DimensionDependencyConfig: DimensionDependencyConfigSchema,
  EventConfig: EventConfigSchema,
} as const;
