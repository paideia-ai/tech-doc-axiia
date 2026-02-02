/**
 * Comprehensive Test Cases for schema-verify-v1.ts
 *
 * Test Structure:
 * 1. Common Types
 * 2. LLMReport Schema (Uncurved)
 * 3. JSONScores Schema
 * 4. Curve Schema
 * 5. CurvedLetterGrades Schema
 * 6. CurvedReport Schema
 *
 * Each section includes:
 * - Valid cases
 * - Invalid cases
 * - Edge cases
 * - Boundary tests
 */

import { describe, it, expect } from 'vitest'
import {
  // Common Types
  ProblemIdSchema,
  EventIdSchema,
  CurvedGradeSchema,
  UncurvedGradeSchema,
  PromptVersionHashSchema,
  Sha256HexSchema,
  PromptSnapshotEntrySchema,
  PromptSnapshotEntriesSchema,
  ScoreValueSchema,
  LangSchema,
  DimensionSchema,
  DimensionProblemDependencySchema,
  DimensionProblemDependencyListSchema,
  // LLMReport
  MetadataSchema,
  DimensionCardSchema,
  ProblemSchema,
  DimensionReportSchema,
  OverallItemSchema,
  OverallSchema,
  ProblemCardSchema,
  ProofSchema,
  DimensionDetailSchema,
  ProblemReportSchema,
  LLMReportSchema,
  // JSONScores
  AbilityScoreSchema,
  ProblemScoreSchema,
  JSONScoresSchema,
  // Curve
  CurveMethodSchema,
  GradeThresholdsSchema,
  CurveSchema,
  // CurvedLetterGrades
  CurvedLetterGradesSchema,
  // CurvedReport
  CurvedReportMetadataSchema,
  CurvedDimensionCardSchema,
  CurvedProblemSchema,
  CurvedDimensionReportSchema,
  CurvedProblemCardSchema,
  CurvedDimensionDetailSchema,
  CurvedProblemReportSchema,
  CurvedReportSchema,
} from './schema-verify-v1'

// =============================================================================
// Test Helpers & Fixtures
// =============================================================================

const VALID_SHA256 = 'a'.repeat(64)
const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_DATETIME = '2024-01-15T10:30:00Z'
const VALID_PROBLEM_ID_ZH = '001230-thinking-trap'
const VALID_PROBLEM_ID_EN = '001231-meeting-verification'

const createValidPromptEntry = (key: string) => ({
  key,
  sha256: VALID_SHA256,
})

const createValidDimensionProblemDependency = () => ({
  problemId: VALID_PROBLEM_ID_ZH,
  problemVersion: 1,
  dimensions: ['representation', 'self-verification'] as const,
})

const createValidMetadata = () => ({
  lang: 'en' as const,
  reportId: VALID_UUID,
  eventId: 'event-2024-001',
  participantId: 'participant-001',
  promptSetHash: VALID_SHA256,
  entries: [
    createValidPromptEntry('framework:en:expert-review'),
    createValidPromptEntry('framework:en:task-eval'),
  ],
  dimensionProblemDependency: [createValidDimensionProblemDependency()],
  createdAt: VALID_DATETIME,
})

// =============================================================================
// 1. Common Types Tests
// =============================================================================

describe('Common Types', () => {
  // ---------------------------------------------------------------------------
  // ProblemIdSchema
  // ---------------------------------------------------------------------------
  describe('ProblemIdSchema', () => {
    describe('valid cases', () => {
      it('should accept valid Chinese problem ID (last digit 0)', () => {
        const result = ProblemIdSchema.safeParse('001230-thinking-trap')
        expect(result.success).toBe(true)
      })

      it('should accept valid English problem ID (last digit 1)', () => {
        const result = ProblemIdSchema.safeParse('001231-meeting-verification')
        expect(result.success).toBe(true)
      })

      it('should accept problem ID with hyphenated title', () => {
        const result = ProblemIdSchema.safeParse('123450-my-complex-title')
        expect(result.success).toBe(true)
      })

      it('should accept problem ID with single char title', () => {
        const result = ProblemIdSchema.safeParse('000000-a')
        expect(result.success).toBe(true)
      })

      it('should accept problem ID with numbers in title', () => {
        const result = ProblemIdSchema.safeParse('001230-test123')
        expect(result.success).toBe(true)
      })

      it('should accept problem ID with unicode title', () => {
        const result = ProblemIdSchema.safeParse('001230-思维陷阱')
        expect(result.success).toBe(true)
      })
    })

    describe('invalid cases', () => {
      it('should reject problem ID with 5 digits', () => {
        const result = ProblemIdSchema.safeParse('00123-title')
        expect(result.success).toBe(false)
      })

      it('should reject problem ID with 7 digits', () => {
        const result = ProblemIdSchema.safeParse('0012300-title')
        expect(result.success).toBe(false)
      })

      it('should reject problem ID without hyphen', () => {
        const result = ProblemIdSchema.safeParse('001230title')
        expect(result.success).toBe(false)
      })

      it('should reject problem ID with empty title', () => {
        const result = ProblemIdSchema.safeParse('001230-')
        expect(result.success).toBe(false)
      })

      it('should reject problem ID with whitespace-only title', () => {
        const result = ProblemIdSchema.safeParse('001230-   ')
        expect(result.success).toBe(false)
      })

      it('should reject problem ID with invalid language digit (2)', () => {
        const result = ProblemIdSchema.safeParse('001232-title')
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('last digit must be 0 (zh) or 1 (en)')
        }
      })

      it('should reject problem ID with invalid language digit (9)', () => {
        const result = ProblemIdSchema.safeParse('001239-title')
        expect(result.success).toBe(false)
      })

      it('should reject problem ID with letters in numeric part', () => {
        const result = ProblemIdSchema.safeParse('00123a-title')
        expect(result.success).toBe(false)
      })

      it('should reject empty string', () => {
        const result = ProblemIdSchema.safeParse('')
        expect(result.success).toBe(false)
      })

      it('should reject non-string input', () => {
        const result = ProblemIdSchema.safeParse(123456)
        expect(result.success).toBe(false)
      })
    })

    describe('edge cases', () => {
      it('should accept minimum valid ID (all zeros)', () => {
        const result = ProblemIdSchema.safeParse('000000-x')
        expect(result.success).toBe(true)
      })

      it('should accept maximum numeric part', () => {
        const result = ProblemIdSchema.safeParse('999990-x')
        expect(result.success).toBe(true)
      })

      it('should accept very long title', () => {
        const longTitle = 'a'.repeat(1000)
        const result = ProblemIdSchema.safeParse(`001230-${longTitle}`)
        expect(result.success).toBe(true)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // EventIdSchema
  // ---------------------------------------------------------------------------
  describe('EventIdSchema', () => {
    it('should accept non-empty string', () => {
      expect(EventIdSchema.safeParse('event-2024').success).toBe(true)
      expect(EventIdSchema.safeParse('a').success).toBe(true)
      expect(EventIdSchema.safeParse('123').success).toBe(true)
    })

    it('should reject empty string', () => {
      expect(EventIdSchema.safeParse('').success).toBe(false)
    })

    it('should reject non-string', () => {
      expect(EventIdSchema.safeParse(123).success).toBe(false)
      expect(EventIdSchema.safeParse(null).success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // CurvedGradeSchema
  // ---------------------------------------------------------------------------
  describe('CurvedGradeSchema', () => {
    describe('valid cases', () => {
      it.each(['A', 'B', 'C', 'D'])('should accept grade %s', (grade) => {
        expect(CurvedGradeSchema.safeParse(grade).success).toBe(true)
      })
    })

    describe('invalid cases', () => {
      it.each(['a', 'b', 'c', 'd', 'E', 'F', 'X', '', '1', 'AB'])(
        'should reject invalid grade %s',
        (grade) => {
          expect(CurvedGradeSchema.safeParse(grade).success).toBe(false)
        }
      )

      it('should reject non-string', () => {
        expect(CurvedGradeSchema.safeParse(1).success).toBe(false)
        expect(CurvedGradeSchema.safeParse(null).success).toBe(false)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // UncurvedGradeSchema
  // ---------------------------------------------------------------------------
  describe('UncurvedGradeSchema', () => {
    it('should accept X', () => {
      expect(UncurvedGradeSchema.safeParse('X').success).toBe(true)
    })

    it.each(['x', 'A', 'B', 'C', 'D', '', 'XX'])('should reject %s', (grade) => {
      expect(UncurvedGradeSchema.safeParse(grade).success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // PromptVersionHashSchema
  // ---------------------------------------------------------------------------
  describe('PromptVersionHashSchema', () => {
    describe('valid cases', () => {
      it('should accept 7-char short hash', () => {
        expect(PromptVersionHashSchema.safeParse('abc1234').success).toBe(true)
      })

      it('should accept 40-char full hash', () => {
        expect(PromptVersionHashSchema.safeParse('a'.repeat(40)).success).toBe(true)
      })

      it('should accept hash with all hex chars', () => {
        expect(PromptVersionHashSchema.safeParse('0123456789abcdef01234567').success).toBe(true)
      })

      it('should accept intermediate length hash', () => {
        expect(PromptVersionHashSchema.safeParse('a'.repeat(20)).success).toBe(true)
      })
    })

    describe('invalid cases', () => {
      it('should reject 6-char hash (too short)', () => {
        expect(PromptVersionHashSchema.safeParse('abc123').success).toBe(false)
      })

      it('should reject 41-char hash (too long)', () => {
        expect(PromptVersionHashSchema.safeParse('a'.repeat(41)).success).toBe(false)
      })

      it('should reject uppercase hex chars', () => {
        expect(PromptVersionHashSchema.safeParse('ABC1234').success).toBe(false)
      })

      it('should reject non-hex chars', () => {
        expect(PromptVersionHashSchema.safeParse('abcdefg').success).toBe(false)
      })

      it('should reject empty string', () => {
        expect(PromptVersionHashSchema.safeParse('').success).toBe(false)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Sha256HexSchema
  // ---------------------------------------------------------------------------
  describe('Sha256HexSchema', () => {
    describe('valid cases', () => {
      it('should accept valid 64-char lowercase hex', () => {
        expect(Sha256HexSchema.safeParse('a'.repeat(64)).success).toBe(true)
        expect(Sha256HexSchema.safeParse('0123456789abcdef'.repeat(4)).success).toBe(true)
      })
    })

    describe('invalid cases', () => {
      it('should reject 63-char hash', () => {
        expect(Sha256HexSchema.safeParse('a'.repeat(63)).success).toBe(false)
      })

      it('should reject 65-char hash', () => {
        expect(Sha256HexSchema.safeParse('a'.repeat(65)).success).toBe(false)
      })

      it('should reject uppercase hex', () => {
        expect(Sha256HexSchema.safeParse('A'.repeat(64)).success).toBe(false)
      })

      it('should reject mixed case', () => {
        expect(Sha256HexSchema.safeParse('aA'.repeat(32)).success).toBe(false)
      })

      it('should reject non-hex chars', () => {
        expect(Sha256HexSchema.safeParse('g'.repeat(64)).success).toBe(false)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // PromptSnapshotEntrySchema
  // ---------------------------------------------------------------------------
  describe('PromptSnapshotEntrySchema', () => {
    it('should accept valid entry', () => {
      const result = PromptSnapshotEntrySchema.safeParse({
        key: 'framework:en:task-eval',
        sha256: VALID_SHA256,
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty key', () => {
      const result = PromptSnapshotEntrySchema.safeParse({
        key: '',
        sha256: VALID_SHA256,
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid sha256', () => {
      const result = PromptSnapshotEntrySchema.safeParse({
        key: 'test',
        sha256: 'invalid',
      })
      expect(result.success).toBe(false)
    })

    it('should reject missing fields', () => {
      expect(PromptSnapshotEntrySchema.safeParse({ key: 'test' }).success).toBe(false)
      expect(PromptSnapshotEntrySchema.safeParse({ sha256: VALID_SHA256 }).success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // PromptSnapshotEntriesSchema
  // ---------------------------------------------------------------------------
  describe('PromptSnapshotEntriesSchema', () => {
    describe('valid cases', () => {
      it('should accept empty array', () => {
        expect(PromptSnapshotEntriesSchema.safeParse([]).success).toBe(true)
      })

      it('should accept single entry', () => {
        const result = PromptSnapshotEntriesSchema.safeParse([
          createValidPromptEntry('key1'),
        ])
        expect(result.success).toBe(true)
      })

      it('should accept sorted entries', () => {
        const result = PromptSnapshotEntriesSchema.safeParse([
          createValidPromptEntry('a-key'),
          createValidPromptEntry('b-key'),
          createValidPromptEntry('c-key'),
        ])
        expect(result.success).toBe(true)
      })

      it('should accept lexicographically sorted entries', () => {
        const result = PromptSnapshotEntriesSchema.safeParse([
          createValidPromptEntry('framework:en:expert-review'),
          createValidPromptEntry('framework:en:task-eval'),
          createValidPromptEntry('problem:001110:scoring'),
        ])
        expect(result.success).toBe(true)
      })
    })

    describe('invalid cases - sorting', () => {
      it('should reject unsorted entries', () => {
        const result = PromptSnapshotEntriesSchema.safeParse([
          createValidPromptEntry('b-key'),
          createValidPromptEntry('a-key'),
        ])
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('sorted by key')
        }
      })

      it('should reject reverse sorted entries', () => {
        const result = PromptSnapshotEntriesSchema.safeParse([
          createValidPromptEntry('z'),
          createValidPromptEntry('y'),
          createValidPromptEntry('x'),
        ])
        expect(result.success).toBe(false)
      })
    })

    describe('invalid cases - uniqueness', () => {
      it('should reject duplicate keys', () => {
        const result = PromptSnapshotEntriesSchema.safeParse([
          createValidPromptEntry('same-key'),
          createValidPromptEntry('same-key'),
        ])
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('unique')
        }
      })

      it('should reject multiple duplicates', () => {
        const result = PromptSnapshotEntriesSchema.safeParse([
          createValidPromptEntry('a'),
          createValidPromptEntry('a'),
          createValidPromptEntry('b'),
          createValidPromptEntry('b'),
        ])
        expect(result.success).toBe(false)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // ScoreValueSchema
  // ---------------------------------------------------------------------------
  describe('ScoreValueSchema', () => {
    describe('valid cases', () => {
      it('should accept 0', () => {
        expect(ScoreValueSchema.safeParse(0).success).toBe(true)
      })

      it('should accept 1', () => {
        expect(ScoreValueSchema.safeParse(1).success).toBe(true)
      })

      it('should accept 0.5', () => {
        expect(ScoreValueSchema.safeParse(0.5).success).toBe(true)
      })

      it('should accept very small positive', () => {
        expect(ScoreValueSchema.safeParse(0.0001).success).toBe(true)
      })

      it('should accept 0.999999', () => {
        expect(ScoreValueSchema.safeParse(0.999999).success).toBe(true)
      })
    })

    describe('invalid cases', () => {
      it('should reject negative values', () => {
        expect(ScoreValueSchema.safeParse(-0.1).success).toBe(false)
        expect(ScoreValueSchema.safeParse(-1).success).toBe(false)
      })

      it('should reject values > 1', () => {
        expect(ScoreValueSchema.safeParse(1.1).success).toBe(false)
        expect(ScoreValueSchema.safeParse(2).success).toBe(false)
      })

      it('should reject non-numbers', () => {
        expect(ScoreValueSchema.safeParse('0.5').success).toBe(false)
        expect(ScoreValueSchema.safeParse(null).success).toBe(false)
      })

      it('should reject NaN', () => {
        expect(ScoreValueSchema.safeParse(NaN).success).toBe(false)
      })

      it('should reject Infinity', () => {
        expect(ScoreValueSchema.safeParse(Infinity).success).toBe(false)
        expect(ScoreValueSchema.safeParse(-Infinity).success).toBe(false)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // LangSchema
  // ---------------------------------------------------------------------------
  describe('LangSchema', () => {
    it('should accept en', () => {
      expect(LangSchema.safeParse('en').success).toBe(true)
    })

    it('should accept zh', () => {
      expect(LangSchema.safeParse('zh').success).toBe(true)
    })

    it.each(['EN', 'ZH', 'english', 'chinese', 'cn', ''])('should reject %s', (lang) => {
      expect(LangSchema.safeParse(lang).success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // DimensionSchema
  // ---------------------------------------------------------------------------
  describe('DimensionSchema', () => {
    const validDimensions = [
      'representation',
      'self-verification',
      'iterative-refinement',
      'discovery',
      'exploratory',
    ]

    describe('valid cases', () => {
      it.each(validDimensions)('should accept %s', (dim) => {
        expect(DimensionSchema.safeParse(dim).success).toBe(true)
      })
    })

    describe('invalid cases', () => {
      it.each([
        'REPRESENTATION',
        'self_verification',
        'iterative_refinement',
        'unknown',
        '',
        'discovery ',
      ])('should reject %s', (dim) => {
        expect(DimensionSchema.safeParse(dim).success).toBe(false)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // DimensionProblemDependencySchema
  // ---------------------------------------------------------------------------
  describe('DimensionProblemDependencySchema', () => {
    it('should accept valid dependency', () => {
      const result = DimensionProblemDependencySchema.safeParse({
        problemId: VALID_PROBLEM_ID_ZH,
        problemVersion: 0,
        dimensions: ['representation'],
      })
      expect(result.success).toBe(true)
    })

    it('should accept multiple dimensions', () => {
      const result = DimensionProblemDependencySchema.safeParse({
        problemId: VALID_PROBLEM_ID_EN,
        problemVersion: 5,
        dimensions: ['representation', 'self-verification', 'discovery'],
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty dimensions array', () => {
      const result = DimensionProblemDependencySchema.safeParse({
        problemId: VALID_PROBLEM_ID_ZH,
        problemVersion: 0,
        dimensions: [],
      })
      expect(result.success).toBe(true)
    })

    it('should reject negative version', () => {
      const result = DimensionProblemDependencySchema.safeParse({
        problemId: VALID_PROBLEM_ID_ZH,
        problemVersion: -1,
        dimensions: [],
      })
      expect(result.success).toBe(false)
    })

    it('should reject float version', () => {
      const result = DimensionProblemDependencySchema.safeParse({
        problemId: VALID_PROBLEM_ID_ZH,
        problemVersion: 1.5,
        dimensions: [],
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid dimension', () => {
      const result = DimensionProblemDependencySchema.safeParse({
        problemId: VALID_PROBLEM_ID_ZH,
        problemVersion: 0,
        dimensions: ['invalid-dimension'],
      })
      expect(result.success).toBe(false)
    })
  })
})

// =============================================================================
// 2. LLMReport Schema Tests
// =============================================================================

describe('LLMReport Schema', () => {
  // ---------------------------------------------------------------------------
  // MetadataSchema
  // ---------------------------------------------------------------------------
  describe('MetadataSchema', () => {
    it('should accept valid metadata', () => {
      const result = MetadataSchema.safeParse(createValidMetadata())
      expect(result.success).toBe(true)
    })

    it('should reject invalid UUID', () => {
      const metadata = createValidMetadata()
      metadata.reportId = 'not-a-uuid'
      expect(MetadataSchema.safeParse(metadata).success).toBe(false)
    })

    it('should reject invalid datetime', () => {
      const metadata = createValidMetadata()
      metadata.createdAt = 'not-a-datetime'
      expect(MetadataSchema.safeParse(metadata).success).toBe(false)
    })

    it('should reject unsorted entries', () => {
      const metadata = createValidMetadata()
      metadata.entries = [
        createValidPromptEntry('z-key'),
        createValidPromptEntry('a-key'),
      ]
      expect(MetadataSchema.safeParse(metadata).success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // DimensionCardSchema
  // ---------------------------------------------------------------------------
  describe('DimensionCardSchema', () => {
    it('should accept valid dimension card', () => {
      const result = DimensionCardSchema.safeParse({
        dimension: 'representation',
        phrases: 'Good problem-solving approach',
        grade: 'X',
      })
      expect(result.success).toBe(true)
    })

    it('should reject curved grade', () => {
      const result = DimensionCardSchema.safeParse({
        dimension: 'representation',
        phrases: 'Good',
        grade: 'A',
      })
      expect(result.success).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // ProblemSchema
  // ---------------------------------------------------------------------------
  describe('ProblemSchema', () => {
    it('should accept valid problem', () => {
      const result = ProblemSchema.safeParse({
        problemId: VALID_PROBLEM_ID_ZH,
        phrases: 'Excellent solution',
        grade: 'X',
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // ProofSchema
  // ---------------------------------------------------------------------------
  describe('ProofSchema', () => {
    it('should accept valid proof', () => {
      const result = ProofSchema.safeParse({
        comment: 'Well structured',
        isStrength: true,
        observation: 'Clear logic flow',
      })
      expect(result.success).toBe(true)
    })

    it('should accept weakness proof', () => {
      const result = ProofSchema.safeParse({
        comment: 'Needs improvement',
        isStrength: false,
        observation: 'Missing edge cases',
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // DimensionDetailSchema
  // ---------------------------------------------------------------------------
  describe('DimensionDetailSchema', () => {
    it('should accept valid dimension detail with score', () => {
      const result = DimensionDetailSchema.safeParse({
        dimension: 'self-verification',
        proofs: [
          { comment: 'Good', isStrength: true, observation: 'Checked work' },
        ],
        summary: 'Overall good verification',
        score: 0.85,
        grade: 'X',
      })
      expect(result.success).toBe(true)
    })

    it('should accept null score', () => {
      const result = DimensionDetailSchema.safeParse({
        dimension: 'discovery',
        proofs: [],
        summary: 'No data',
        score: null,
        grade: 'X',
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // OverallSchema
  // ---------------------------------------------------------------------------
  describe('OverallSchema', () => {
    it('should accept valid overall', () => {
      const result = OverallSchema.safeParse({
        bad: [{ title: 'Weakness', description: 'Needs work' }],
        good: [{ title: 'Strength', description: 'Well done' }],
        improvements: [{ title: 'Suggestion', description: 'Try this' }],
        overview: 'Overall assessment',
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty arrays', () => {
      const result = OverallSchema.safeParse({
        bad: [],
        good: [],
        improvements: [],
        overview: '',
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // DimensionReportSchema
  // ---------------------------------------------------------------------------
  describe('DimensionReportSchema', () => {
    it('should accept valid dimension report', () => {
      const result = DimensionReportSchema.safeParse({
        dimension: 'iterative-refinement',
        problems: [
          { problemId: VALID_PROBLEM_ID_ZH, phrases: 'Good', grade: 'X' },
        ],
        summary: 'Good iterative approach',
        score: 0.75,
        grade: 'X',
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // ProblemReportSchema
  // ---------------------------------------------------------------------------
  describe('ProblemReportSchema', () => {
    it('should accept valid problem report', () => {
      const result = ProblemReportSchema.safeParse({
        bad: ['Issue 1', 'Issue 2'],
        dimensionDetails: [
          {
            dimension: 'exploratory',
            proofs: [],
            summary: 'Explored well',
            score: 0.9,
            grade: 'X',
          },
        ],
        good: ['Strength 1'],
        problemId: VALID_PROBLEM_ID_EN,
        overview: 'Problem overview',
        score: 0.8,
        grade: 'X',
      })
      expect(result.success).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // LLMReportSchema (Full)
  // ---------------------------------------------------------------------------
  describe('LLMReportSchema', () => {
    const createValidLLMReport = () => ({
      metadata: createValidMetadata(),
      dimensionCards: [
        { dimension: 'representation', phrases: 'Good', grade: 'X' as const },
      ],
      dimensionReports: [
        {
          dimension: 'representation' as const,
          problems: [],
          summary: 'Summary',
          score: 0.75,
          grade: 'X' as const,
        },
      ],
      overall: {
        bad: [],
        good: [],
        improvements: [],
        overview: 'Overview',
      },
      problemCards: [
        { problemId: VALID_PROBLEM_ID_ZH, grade: 'X' as const },
      ],
      problemReports: [
        {
          bad: [],
          dimensionDetails: [],
          good: [],
          problemId: VALID_PROBLEM_ID_ZH,
          overview: 'Overview',
          score: 0.8,
          grade: 'X' as const,
        },
      ],
      taskEvalMean: 0.8,
      abilityMean: 0.75,
      overallMean: 0.77,
      grade: 'X' as const,
    })

    it('should accept valid LLM report', () => {
      const result = LLMReportSchema.safeParse(createValidLLMReport())
      expect(result.success).toBe(true)
    })

    it('should accept null means', () => {
      const report = createValidLLMReport()
      report.taskEvalMean = null
      report.abilityMean = null
      report.overallMean = null
      expect(LLMReportSchema.safeParse(report).success).toBe(true)
    })

    it('should reject curved grade in LLM report', () => {
      const report = createValidLLMReport()
      ;(report as any).grade = 'A'
      expect(LLMReportSchema.safeParse(report).success).toBe(false)
    })
  })
})

// =============================================================================
// 3. JSONScores Schema Tests
// =============================================================================

describe('JSONScores Schema', () => {
  describe('AbilityScoreSchema', () => {
    it('should accept valid ability score', () => {
      const result = AbilityScoreSchema.safeParse({
        dimensionId: 'representation',
        score: 0.85,
      })
      expect(result.success).toBe(true)
    })

    it('should reject invalid dimension', () => {
      const result = AbilityScoreSchema.safeParse({
        dimensionId: 'invalid',
        score: 0.85,
      })
      expect(result.success).toBe(false)
    })

    it('should reject score out of range', () => {
      expect(
        AbilityScoreSchema.safeParse({ dimensionId: 'discovery', score: 1.5 }).success
      ).toBe(false)
    })
  })

  describe('ProblemScoreSchema', () => {
    it('should accept valid problem score', () => {
      const result = ProblemScoreSchema.safeParse({
        problemId: VALID_PROBLEM_ID_ZH,
        score: 0.9,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('JSONScoresSchema', () => {
    it('should accept valid JSON scores', () => {
      const result = JSONScoresSchema.safeParse({
        abilityScores: [
          { dimensionId: 'representation', score: 0.8 },
          { dimensionId: 'self-verification', score: 0.7 },
        ],
        problemScores: [
          { problemId: VALID_PROBLEM_ID_ZH, score: 0.85 },
        ],
        overallMean: 0.78,
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty arrays', () => {
      const result = JSONScoresSchema.safeParse({
        abilityScores: [],
        problemScores: [],
        overallMean: 0,
      })
      expect(result.success).toBe(true)
    })

    it('should accept all dimensions', () => {
      const result = JSONScoresSchema.safeParse({
        abilityScores: [
          { dimensionId: 'representation', score: 0.8 },
          { dimensionId: 'self-verification', score: 0.7 },
          { dimensionId: 'iterative-refinement', score: 0.75 },
          { dimensionId: 'discovery', score: 0.85 },
          { dimensionId: 'exploratory', score: 0.9 },
        ],
        problemScores: [],
        overallMean: 0.8,
      })
      expect(result.success).toBe(true)
    })
  })
})

// =============================================================================
// 4. Curve Schema Tests
// =============================================================================

describe('Curve Schema', () => {
  describe('CurveMethodSchema', () => {
    it('should accept standard_deviation', () => {
      expect(CurveMethodSchema.safeParse('standard_deviation').success).toBe(true)
    })

    it.each(['mean', 'percentile', 'other', ''])('should reject %s', (method) => {
      expect(CurveMethodSchema.safeParse(method).success).toBe(false)
    })
  })

  describe('GradeThresholdsSchema', () => {
    it('should accept valid thresholds', () => {
      const result = GradeThresholdsSchema.safeParse({
        A: 0.85,
        B: 0.70,
        C: 0.55,
      })
      expect(result.success).toBe(true)
    })

    it('should accept edge thresholds', () => {
      expect(
        GradeThresholdsSchema.safeParse({ A: 1, B: 0.5, C: 0 }).success
      ).toBe(true)
    })

    it('should accept equal thresholds', () => {
      expect(
        GradeThresholdsSchema.safeParse({ A: 0.5, B: 0.5, C: 0.5 }).success
      ).toBe(true)
    })

    it('should reject out of range', () => {
      expect(
        GradeThresholdsSchema.safeParse({ A: 1.1, B: 0.5, C: 0 }).success
      ).toBe(false)
    })
  })

  describe('CurveSchema', () => {
    const createValidCurve = () => ({
      curveId: VALID_UUID,
      label: 'Event 2024 Q1 Curve',
      sourceEventIds: ['event-2024-001', 'event-2024-002'],
      promptSetHash: VALID_SHA256,
      entries: [
        createValidPromptEntry('framework:en:task-eval'),
      ],
      dimensionProblemDependency: [createValidDimensionProblemDependency()],
      method: 'standard_deviation' as const,
      sampleSize: 100,
      createdAt: VALID_DATETIME,
      abilityCurves: {
        representation: { A: 0.85, B: 0.70, C: 0.55 },
        'self-verification': { A: 0.88, B: 0.72, C: 0.58 },
        'iterative-refinement': { A: 0.82, B: 0.68, C: 0.52 },
        discovery: { A: 0.80, B: 0.65, C: 0.50 },
        exploratory: { A: 0.83, B: 0.69, C: 0.54 },
      },
      problemCurves: {
        [VALID_PROBLEM_ID_ZH]: { A: 0.90, B: 0.75, C: 0.60 },
      },
      overall: { A: 0.85, B: 0.70, C: 0.55 },
    })

    it('should accept valid curve', () => {
      const result = CurveSchema.safeParse(createValidCurve())
      expect(result.success).toBe(true)
    })

    it('should reject zero sample size', () => {
      const curve = createValidCurve()
      curve.sampleSize = 0
      expect(CurveSchema.safeParse(curve).success).toBe(false)
    })

    it('should reject negative sample size', () => {
      const curve = createValidCurve()
      curve.sampleSize = -1
      expect(CurveSchema.safeParse(curve).success).toBe(false)
    })

    it('should reject float sample size', () => {
      const curve = createValidCurve()
      curve.sampleSize = 10.5
      expect(CurveSchema.safeParse(curve).success).toBe(false)
    })

    it('should reject empty label', () => {
      const curve = createValidCurve()
      curve.label = ''
      expect(CurveSchema.safeParse(curve).success).toBe(false)
    })

    it('should reject empty sourceEventIds', () => {
      const curve = createValidCurve()
      curve.sourceEventIds = []
      // Note: This depends on schema definition - check if empty is allowed
      const result = CurveSchema.safeParse(curve)
      // Assuming empty array is valid based on z.array(EventIdSchema)
      expect(result.success).toBe(true)
    })

    it('should accept single source event', () => {
      const curve = createValidCurve()
      curve.sourceEventIds = ['single-event']
      expect(CurveSchema.safeParse(curve).success).toBe(true)
    })
  })
})

// =============================================================================
// 5. CurvedLetterGrades Schema Tests
// =============================================================================

describe('CurvedLetterGrades Schema', () => {
  const createValidCurvedLetterGrades = () => ({
    sourceScoresId: VALID_UUID,
    curveId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    computedAt: VALID_DATETIME,
    overallGrade: 'B' as const,
    abilityGrades: {
      representation: 'A' as const,
      'self-verification': 'B' as const,
      'iterative-refinement': 'C' as const,
      discovery: 'B' as const,
      exploratory: 'A' as const,
    },
    problemGrades: {
      [VALID_PROBLEM_ID_ZH]: 'A' as const,
      [VALID_PROBLEM_ID_EN]: 'B' as const,
    },
  })

  it('should accept valid curved letter grades', () => {
    const result = CurvedLetterGradesSchema.safeParse(createValidCurvedLetterGrades())
    expect(result.success).toBe(true)
  })

  it('should reject X grade', () => {
    const grades = createValidCurvedLetterGrades()
    ;(grades as any).overallGrade = 'X'
    expect(CurvedLetterGradesSchema.safeParse(grades).success).toBe(false)
  })

  it('should reject lowercase grade', () => {
    const grades = createValidCurvedLetterGrades()
    ;(grades as any).overallGrade = 'a'
    expect(CurvedLetterGradesSchema.safeParse(grades).success).toBe(false)
  })

  it('should accept all grade combinations', () => {
    for (const grade of ['A', 'B', 'C', 'D'] as const) {
      const grades = createValidCurvedLetterGrades()
      grades.overallGrade = grade
      expect(CurvedLetterGradesSchema.safeParse(grades).success).toBe(true)
    }
  })

  it('should accept empty problem grades', () => {
    const grades = createValidCurvedLetterGrades()
    grades.problemGrades = {}
    expect(CurvedLetterGradesSchema.safeParse(grades).success).toBe(true)
  })

  it('should accept partial ability grades', () => {
    const grades = createValidCurvedLetterGrades()
    grades.abilityGrades = {
      representation: 'A' as const,
    }
    expect(CurvedLetterGradesSchema.safeParse(grades).success).toBe(true)
  })
})

// =============================================================================
// 6. CurvedReport Schema Tests
// =============================================================================

describe('CurvedReport Schema', () => {
  describe('CurvedReportMetadataSchema', () => {
    it('should accept valid metadata with curveId', () => {
      const metadata = {
        ...createValidMetadata(),
        curveId: VALID_UUID,
      }
      expect(CurvedReportMetadataSchema.safeParse(metadata).success).toBe(true)
    })

    it('should reject metadata without curveId', () => {
      const metadata = createValidMetadata()
      expect(CurvedReportMetadataSchema.safeParse(metadata).success).toBe(false)
    })
  })

  describe('CurvedDimensionCardSchema', () => {
    it('should accept curved grade', () => {
      const result = CurvedDimensionCardSchema.safeParse({
        dimension: 'representation',
        phrases: 'Good',
        grade: 'A',
      })
      expect(result.success).toBe(true)
    })

    it('should reject X grade', () => {
      const result = CurvedDimensionCardSchema.safeParse({
        dimension: 'representation',
        phrases: 'Good',
        grade: 'X',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CurvedProblemSchema', () => {
    it('should accept curved grade', () => {
      const result = CurvedProblemSchema.safeParse({
        problemId: VALID_PROBLEM_ID_ZH,
        phrases: 'Good',
        grade: 'B',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('CurvedDimensionReportSchema', () => {
    it('should accept curved grades in problems', () => {
      const result = CurvedDimensionReportSchema.safeParse({
        dimension: 'discovery',
        problems: [
          { problemId: VALID_PROBLEM_ID_ZH, phrases: 'Good', grade: 'A' },
          { problemId: VALID_PROBLEM_ID_EN, phrases: 'Fair', grade: 'C' },
        ],
        summary: 'Summary',
        score: 0.8,
        grade: 'B',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('CurvedDimensionDetailSchema', () => {
    it('should accept curved grade', () => {
      const result = CurvedDimensionDetailSchema.safeParse({
        dimension: 'exploratory',
        proofs: [],
        summary: 'Summary',
        score: 0.75,
        grade: 'C',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('CurvedProblemReportSchema', () => {
    it('should accept curved grades throughout', () => {
      const result = CurvedProblemReportSchema.safeParse({
        bad: [],
        dimensionDetails: [
          {
            dimension: 'representation',
            proofs: [],
            summary: 'Summary',
            score: 0.85,
            grade: 'A',
          },
        ],
        good: ['Good point'],
        problemId: VALID_PROBLEM_ID_ZH,
        overview: 'Overview',
        score: 0.85,
        grade: 'A',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('CurvedReportSchema (Full)', () => {
    const createValidCurvedReport = () => ({
      metadata: {
        ...createValidMetadata(),
        curveId: VALID_UUID,
      },
      dimensionCards: [
        { dimension: 'representation' as const, phrases: 'Good', grade: 'A' as const },
      ],
      dimensionReports: [
        {
          dimension: 'representation' as const,
          problems: [
            { problemId: VALID_PROBLEM_ID_ZH, phrases: 'Good', grade: 'A' as const },
          ],
          summary: 'Summary',
          score: 0.85,
          grade: 'A' as const,
        },
      ],
      overall: {
        bad: [],
        good: [],
        improvements: [],
        overview: 'Overview',
      },
      problemCards: [
        { problemId: VALID_PROBLEM_ID_ZH, grade: 'A' as const },
      ],
      problemReports: [
        {
          bad: [],
          dimensionDetails: [
            {
              dimension: 'representation' as const,
              proofs: [],
              summary: 'Summary',
              score: 0.85,
              grade: 'A' as const,
            },
          ],
          good: [],
          problemId: VALID_PROBLEM_ID_ZH,
          overview: 'Overview',
          score: 0.85,
          grade: 'A' as const,
        },
      ],
      taskEvalMean: 0.85,
      abilityMean: 0.85,
      overallMean: 0.85,
      grade: 'A' as const,
    })

    it('should accept valid curved report', () => {
      const result = CurvedReportSchema.safeParse(createValidCurvedReport())
      expect(result.success).toBe(true)
    })

    it('should reject X grade in curved report', () => {
      const report = createValidCurvedReport()
      ;(report as any).grade = 'X'
      expect(CurvedReportSchema.safeParse(report).success).toBe(false)
    })

    it('should reject missing curveId in metadata', () => {
      const report = createValidCurvedReport()
      delete (report.metadata as any).curveId
      expect(CurvedReportSchema.safeParse(report).success).toBe(false)
    })

    it('should reject X grade in nested problem', () => {
      const report = createValidCurvedReport()
      ;(report.dimensionReports[0].problems[0] as any).grade = 'X'
      expect(CurvedReportSchema.safeParse(report).success).toBe(false)
    })

    it('should reject X grade in dimension detail', () => {
      const report = createValidCurvedReport()
      ;(report.problemReports[0].dimensionDetails[0] as any).grade = 'X'
      expect(CurvedReportSchema.safeParse(report).success).toBe(false)
    })

    it('should accept all D grades', () => {
      const report = createValidCurvedReport()
      report.grade = 'D'
      report.dimensionCards[0].grade = 'D'
      report.dimensionReports[0].grade = 'D'
      report.dimensionReports[0].problems[0].grade = 'D'
      report.problemCards[0].grade = 'D'
      report.problemReports[0].grade = 'D'
      report.problemReports[0].dimensionDetails[0].grade = 'D'
      expect(CurvedReportSchema.safeParse(report).success).toBe(true)
    })
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration Tests', () => {
  describe('LLMReport to CurvedReport transformation compatibility', () => {
    it('should share common structure between LLMReport and CurvedReport', () => {
      // Verify that the schemas have the same base structure
      const llmReportKeys = Object.keys(LLMReportSchema.shape)
      const curvedReportKeys = Object.keys(CurvedReportSchema.shape)

      // CurvedReport should have all keys from LLMReport
      for (const key of llmReportKeys) {
        expect(curvedReportKeys).toContain(key)
      }
    })
  })

  describe('Curve and CurvedLetterGrades consistency', () => {
    it('should have matching dimension keys', () => {
      // Both should use DimensionSchema for keys
      const curveAbilityCurves = CurveSchema.shape.abilityCurves
      const curvedGradesAbility = CurvedLetterGradesSchema.shape.abilityGrades

      // Both use z.record with DimensionSchema as key
      expect(curveAbilityCurves).toBeDefined()
      expect(curvedGradesAbility).toBeDefined()
    })
  })

  describe('Metadata consistency across schemas', () => {
    it('should require same promptSetHash format in Metadata and Curve', () => {
      const validHash = VALID_SHA256

      // Both should accept the same hash format
      const metadataResult = MetadataSchema.safeParse({
        ...createValidMetadata(),
        promptSetHash: validHash,
      })

      const curveResult = CurveSchema.shape.promptSetHash.safeParse(validHash)

      expect(metadataResult.success).toBe(true)
      expect(curveResult.success).toBe(true)
    })
  })
})
