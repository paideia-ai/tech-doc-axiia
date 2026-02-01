import { z } from 'zod'

// =============================================================================
// Common Types
// =============================================================================

/**
 * Problem ID format: "6digits-title"
 * - Numeric part: exactly 6 digits
 * - The last digit indicates language: 0=Chinese, 1=English
 * - The second last digit indicates minor version
 * - The third last digit and above indicate major version
 */
export const ProblemIdSchema = z
  .string()
  .regex(/^\d{6}-.+$/, 'Problem ID must be "6digits-title"')
  .superRefine((value: string, ctx: z.ZodSuperRefineContext) => {
    const match = value.match(/^(\d{6})-(.+)$/)
    if (!match) return

    const [, digits, title] = match

    if (!title.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Problem ID title part must be non-empty',
      })
    }

    const langDigit = digits[5]
    if (langDigit !== '0' && langDigit !== '1') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Problem ID last digit must be 0 (zh) or 1 (en)',
      })
    }
  })
export type ProblemId = z.infer<typeof ProblemIdSchema>

export const EventIdSchema = z.string().min(1)
export type EventId = z.infer<typeof EventIdSchema>

/**
 * Letter grades: A, B, C, D
 */
export const LetterGradeSchema = z.enum(['A', 'B', 'C', 'D'])
export type LetterGrade = z.infer<typeof LetterGradeSchema>

/**
 * Uncurved grade: X
 */
export const UncurvedGradeSchema = z.literal('X')
export type UncurvedGrade = z.infer<typeof UncurvedGradeSchema>

/**
 * Git commit hash for prompt versioning
 */
export const PromptVersionHashSchema = z
  .string()
  .regex(/^[a-f0-9]{7,40}$/, 'Must be a valid git commit hash (short or full)')
export type PromptVersionHash = z.infer<typeof PromptVersionHashSchema>

/**
 * SHA-256 hex digest (64 lowercase hex chars)
 */
export const Sha256HexSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'Must be a lowercase SHA-256 hex digest')
export type Sha256Hex = z.infer<typeof Sha256HexSchema>

export const PromptSnapshotEntrySchema = z.object({
  /**
   * Logical prompt key, e.g.:
   * - framework:zh:task-eval
   * - problem:001111:scoring
   */
  key: z.string().min(1),
  /**
   * SHA-256 of the prompt file content
   */
  sha256: Sha256HexSchema,
})
export type PromptSnapshotEntry = z.infer<typeof PromptSnapshotEntrySchema>

export const PromptSnapshotEntriesSchema = z
  .array(PromptSnapshotEntrySchema)
  .superRefine((entries: PromptSnapshotEntry[], ctx: z.ZodSuperRefineContext) => {
    const keys = entries.map((e) => e.key)
    const sorted = [...keys].sort((a, b) => a.localeCompare(b))
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== sorted[i]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'entries must be sorted by key (stable order)',
        })
        break
      }
    }

    const unique = new Set(keys)
    if (unique.size !== keys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'entries keys must be unique',
      })
    }
  })
export type PromptSnapshotEntries = z.infer<typeof PromptSnapshotEntriesSchema>

/**
 * Score value: normalized 0-1 range
 */
export const ScoreValueSchema = z.number().min(0).max(1)
export type ScoreValue = z.infer<typeof ScoreValueSchema>

export const LangSchema = z.enum(['en', 'zh'])
export type Lang = z.infer<typeof LangSchema>

export const DimensionSchema = z.enum([
  'representation',
  'self-verification',
  'iterative-refinement',
  'discovery',
  'exploratory',
])
export type Dimension = z.infer<typeof DimensionSchema>

export const DimensionProblemDependencySchema = z.object({
  problemId: ProblemIdSchema,
  problemVersion: z.number().int().nonnegative(),
  dimensions: z.array(DimensionSchema),
})
export type DimensionProblemDependency = z.infer<
  typeof DimensionProblemDependencySchema
>

export const DimensionProblemDependencyListSchema = z.array(
  DimensionProblemDependencySchema,
)
export type DimensionProblemDependencyList = z.infer<
  typeof DimensionProblemDependencyListSchema
>


// =============================================================================
// 1. LLM Report JSON Schema (原始报告 - letter grades 为 X)
// =============================================================================

export const MetadataSchema = z
  .object({
    lang: LangSchema,
    reportId: z.string().uuid(),
    eventId: EventIdSchema,
    participantId: z.string().min(1),
    /**
     * Hash of the entire prompt set, computed after sorting `entries` by `key`
     */
    promptSetHash: Sha256HexSchema,
    /**
     * Prompt file fingerprints, sorted by `key` (stable order)
     */
    entries: PromptSnapshotEntriesSchema,
    /**
     * Problem ↔ dimension dependency mapping for this run.
     */
    dimensionProblemDependency: DimensionProblemDependencyListSchema,
    // report generation timestamp
    createdAt: z.string().datetime(),
  })
export type Metadata = z.infer<typeof MetadataSchema>

export const DimensionCardSchema = z.object({
  dimension: DimensionSchema,
  phrases: z.string(),
  grade: UncurvedGradeSchema,
})
export type DimensionCard = z.infer<typeof DimensionCardSchema>

export const ProblemSchema = z.object({
  problemId: ProblemIdSchema,
  phrases: z.string(),
  grade: UncurvedGradeSchema,
})
export type Problem = z.infer<typeof ProblemSchema>

export const DimensionProblemCardSchema = ProblemSchema
export type DimensionProblemCard = z.infer<typeof DimensionProblemCardSchema>

export const DimensionReportSchema = z.object({
  dimension: DimensionSchema,
  problems: z.array(ProblemSchema),
  summary: z.string(),
  score: ScoreValueSchema.nullable(), // Average ability score of all problems in this dimension
  grade: UncurvedGradeSchema,
})
export type DimensionReport = z.infer<typeof DimensionReportSchema>

export const OverallItemSchema = z.object({
  title: z.string(),
  description: z.string(),
})
export type OverallItem = z.infer<typeof OverallItemSchema>

export const OverallSchema = z.object({
  bad: z.array(OverallItemSchema),
  good: z.array(OverallItemSchema),
  improvements: z.array(OverallItemSchema),
  overview: z.string(),
})
export type Overall = z.infer<typeof OverallSchema>

export const ProblemCardSchema = z.object({
  problemId: ProblemIdSchema,
  grade: UncurvedGradeSchema,
})

export type ProblemCard = z.infer<typeof ProblemCardSchema>

export const ProofSchema = z.object({
  comment: z.string(),
  isStrength: z.boolean(),
  observation: z.string(),
})
export type Proof = z.infer<typeof ProofSchema>

export const DimensionDetailSchema = z.object({
  dimension: DimensionSchema,
  proofs: z.array(ProofSchema),
  summary: z.string(),
  score: ScoreValueSchema.nullable(), // ability score of this dimension for the problem
  grade: UncurvedGradeSchema,
})
export type DimensionDetail = z.infer<typeof DimensionDetailSchema>

export const ProblemReportSchema = z.object({
  bad: z.array(z.string()),
  dimensionDetails: z.array(DimensionDetailSchema),
  good: z.array(z.string()),
  problemId: ProblemIdSchema,
  overview: z.string(),
  score: ScoreValueSchema.nullable(), // task score for this problem
  grade: UncurvedGradeSchema,
})
export type ProblemReport = z.infer<typeof ProblemReportSchema>

export const LLMReportSchema = z.object({
  metadata: MetadataSchema,
  dimensionCards: z.array(DimensionCardSchema),
  dimensionReports: z.array(DimensionReportSchema),
  overall: OverallSchema,
  problemCards: z.array(ProblemCardSchema),
  problemReports: z.array(ProblemReportSchema),
  taskEvalMean: ScoreValueSchema.nullable(),
  abilityMean: ScoreValueSchema.nullable(),
  overallMean: ScoreValueSchema.nullable(),
  grade: UncurvedGradeSchema,
})

export type LLMReport = z.infer<typeof LLMReportSchema>



// =============================================================================
// 2. JSON Scores Schema (提取的分数)
// =============================================================================

export const AbilityScoreSchema = z.object({
  dimensionId: DimensionSchema,
  /** Source: Report.dimensionReports[].score */
  score: ScoreValueSchema,
})

export const ProblemScoreSchema = z.object({
  problemId: ProblemIdSchema,
  /** Source: Report.problemReports[].score (task score for the problem) */
  score: ScoreValueSchema,
})

/**
 * JSON Scores: Extracted scores from Report JSON
 * - Separate entity for curve computation and application
 * - Contains all score data in a flat, processable structure
 */
export const JSONScoresSchema = z.object({
  abilityScores: z.array(AbilityScoreSchema),
  problemScores: z.array(ProblemScoreSchema),
  /** Source: Report.overallMean */
  overallMean: ScoreValueSchema,
})

export type JSONScores = z.infer<typeof JSONScoresSchema>


// =============================================================================
// 3. Curve Schema
// =============================================================================

/**
 * Curve computation method
 * - This records how thresholds were computed (for audit/reproducibility)
 * e.g., [1, 0, -1] means A > mean+1σ, B > mean, C > mean-1σ, D <= mean-1σ
 */
export const CurveMethodSchema =  z.literal('standard_deviation')
export type CurveMethod = z.infer<typeof CurveMethodSchema>

/**
 * Grade thresholds
 *
 * A/B/C represent the minimum score needed to get that grade.
 * D is implied: score < C.
 */
export const GradeThresholdsSchema = z.object({
  A: ScoreValueSchema,
  B: ScoreValueSchema,
  C: ScoreValueSchema,
})
export type GradeThresholds = z.infer<typeof GradeThresholdsSchema>

export const CurveSchema = z.object({
  /** Unique identifier for this curve */
  curveId: z.string().uuid(),
  /** Human-readable label for this curve */
  label: z.string().min(1),
  /** Event ID from which scores were sourced */
  sourceEventIds: z.array(EventIdSchema),
  /**
   * Hash of the entire prompt set, computed after sorting `entries` by `key`
   */
  promptSetHash: Sha256HexSchema,
  /**
   * Prompt file fingerprints, sorted by `key` (stable order)
   */
  entries: PromptSnapshotEntriesSchema,
  /**
   * Problem ↔ dimension dependency mapping used when generating the source scores.
   */
  dimensionProblemDependency: DimensionProblemDependencyListSchema,
  /** Method used to compute the curve */
  method: CurveMethodSchema,
  /** Number of participants used to compute the curve */
  sampleSize: z.number().int().positive(),
  /** Timestamp when curve was computed */
  createdAt: z.string().datetime(),
  /** Ability (dimension) score thresholds */
  abilityCurves: z.record(DimensionSchema, GradeThresholdsSchema),
  /** Problem (task) score thresholds */
  problemCurves: z.record(ProblemIdSchema, GradeThresholdsSchema),
    /** Overall score thresholds */
  overall: GradeThresholdsSchema,
})
export type Curve = z.infer<typeof CurveSchema>


// =============================================================================
// 4. Curved Letter Grades Schema
// =============================================================================

export const CurvedGradeSchema = LetterGradeSchema.exclude(['X'])
export type CurvedGrade = z.infer<typeof CurvedGradeSchema>

/**
 * Curved Letter Grades: result of applying curve to scores.
 * This is a traceable intermediate artifact (before merging into the report).
 */
export const CurvedLetterGradesSchema = z.object({
  /** Reference to source scores */
  sourceScoresId: z.string().uuid(),
  /** Reference to curve used */
  curveId: z.string().uuid(),
  /** Timestamp when grades were computed */
  computedAt: z.string().datetime(),
  /** Overall grade */
  overallGrade: CurvedGradeSchema,
  /** Per-dimension grades */
  abilityGrades: z.record(DimensionSchema, CurvedGradeSchema),
  /** Per-problem grades */
  problemGrades: z.record(ProblemIdSchema, CurvedGradeSchema),
})
export type CurvedLetterGrades = z.infer<typeof CurvedLetterGradesSchema>


// =============================================================================
// 5. Curved Report Schema (最终报告)
// =============================================================================

export const CurvedReportMetadataSchema = MetadataSchema.extend({
  /** Curve identifier used for grading */
  curveId: z.string().uuid(),
})
export type CurvedReportMetadata = z.infer<typeof CurvedReportMetadataSchema>

export const CurvedDimensionCardSchema = DimensionCardSchema.extend({
  grade: CurvedGradeSchema,
})
export type CurvedDimensionCard = z.infer<typeof CurvedDimensionCardSchema>

export const CurvedProblemSchema = ProblemSchema.extend({
  grade: CurvedGradeSchema,
})
export type CurvedProblem = z.infer<typeof CurvedProblemSchema>

export const CurvedDimensionReportSchema = DimensionReportSchema.extend({
  problems: z.array(CurvedProblemSchema),
  grade: CurvedGradeSchema,
})
export type CurvedDimensionReport = z.infer<typeof CurvedDimensionReportSchema>

export const CurvedProblemCardSchema = ProblemCardSchema.extend({
  grade: CurvedGradeSchema,
})
export type CurvedProblemCard = z.infer<typeof CurvedProblemCardSchema>

export const CurvedDimensionDetailSchema = DimensionDetailSchema.extend({
  grade: CurvedGradeSchema,
})
export type CurvedDimensionDetail = z.infer<typeof CurvedDimensionDetailSchema>

export const CurvedProblemReportSchema = ProblemReportSchema.extend({
  dimensionDetails: z.array(CurvedDimensionDetailSchema),
  grade: CurvedGradeSchema,
})
export type CurvedProblemReport = z.infer<typeof CurvedProblemReportSchema>

export const CurvedReportSchema = LLMReportSchema.extend({
  metadata: CurvedReportMetadataSchema,
  dimensionCards: z.array(CurvedDimensionCardSchema),
  dimensionReports: z.array(CurvedDimensionReportSchema),
  problemCards: z.array(CurvedProblemCardSchema),
  problemReports: z.array(CurvedProblemReportSchema),
  grade: CurvedGradeSchema,
})
export type CurvedReport = z.infer<typeof CurvedReportSchema>
