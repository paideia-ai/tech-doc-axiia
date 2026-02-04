# Schema Comparison: master vs v1 (Anna)

This document compares the two schema designs and elaborates on KS's comments.

---

## KS Comments (with examples)

### 1. ProblemId format

**KS**: Anna's `^\d{6}-.+$` is more human-friendly. Title part doesn't need validation.

| master | v1 (Anna) |
|--------|-----------|
| `^\d{6}$` | `^\d{6}-.+$` |
| `"001234"` | `"001234-quadratic-equations"` |

```ts
// master
ProblemIdSchema = z.string().regex(/^\d{6}$/)

// v1
ProblemIdSchema = z.string().regex(/^\d{6}-.+$/)
```

**Tradeoff**: Title aids debugging/logging but adds coupling if titles change.

---

### 2. Language digit validation

**KS**: Anna validates last digit must be 0 (zh) or 1 (en). Should add this.

| master | v1 (Anna) |
|--------|-----------|
| No validation | Last digit must be `0` or `1` |

```ts
// v1 only
const langDigit = digits[5]
if (langDigit !== '0' && langDigit !== '1') {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Problem ID last digit must be 0 (zh) or 1 (en)',
  })
}
```

**Example**: `001230` = Chinese, `001231` = English

---

### 3. DimensionId: enum vs string

**KS**: Enum is better. If dimensions change, update schema.

| master | v1 (Anna) |
|--------|-----------|
| `z.string().min(1)` | Fixed enum |

```ts
// master - accepts anything
DimensionIdSchema = z.string().min(1)

// v1 - strict enum
DimensionSchema = z.enum([
  'representation',
  'self-verification',
  'iterative-refinement',
  'discovery',
  'exploratory',
])
```

**Tradeoff**: Enum catches typos at validation; string allows runtime flexibility.

---

### 4. PromptVersionHash: git hash vs SHA-256

**KS**: Git hash can't detect identical prompts across commits. Use both git hash (for traceability) and SHA-256 (for equality check). Anna uses SHA-256 only.

| master | v1 (Anna) |
|--------|-----------|
| Git hash only | SHA-256 per file, no git hash |

```ts
// master
PromptVersionHashSchema = z.string().regex(/^[a-f0-9]{7,40}$/)

// v1
Sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/)
PromptSnapshotEntrySchema = z.object({
  key: z.string().min(1),      // "framework:zh:task-eval"
  sha256: Sha256HexSchema,
})
promptSetHash: Sha256HexSchema  // hash of sorted entries
```

**KS recommendation**: Use both.

---

### 5. Letter grade: split Curved vs Uncurved

**KS**: Anna's approach is better.

| master | v1 (Anna) |
|--------|-----------|
| Single schema; no field pre-curve | Two schemas; `"X"` placeholder pre-curve |

```ts
// master
LetterGradeSchema = z.enum(["A", "B", "C", "D"])
// JSONScores has no grade field

// v1
CurvedGradeSchema = z.enum(['A', 'B', 'C', 'D'])
UncurvedGradeSchema = z.literal('X')
// LLMReport.grade = 'X', CurvedReport.grade = 'A'|'B'|'C'|'D'
```

**Benefit**: Frontend renders same structure pre/post curve; `"X"` shows as "pending".

---

### 6. ReportJSON schema: full structure needed

**KS**: Schema should match existing LLM report format. See Anna's approach.

| master | v1 (Anna) |
|--------|-----------|
| Scores only, no report structure | Full `LLMReportSchema` |

```ts
// master - no narratives
JSONScoresSchema = z.object({
  scores_id, event_id, participant_id,
  totals, ability_scores, problem_scores
})

// v1 - full report
LLMReportSchema = z.object({
  metadata: MetadataSchema,
  dimensionCards: z.array(DimensionCardSchema),
  dimensionReports: z.array(DimensionReportSchema),
  overall: OverallSchema,  // good/bad/improvements
  problemCards: z.array(ProblemCardSchema),
  problemReports: z.array(ProblemReportSchema),  // with proofs
  taskEvalMean, abilityMean, overallMean,
  grade: UncurvedGradeSchema
})
```

---

### 7. JSONScores: only overallMean needed

**KS**: Only final total needed for curve. Keeping problem/ability totals is optional.

| master | v1 (Anna) |
|--------|-----------|
| 3 explicit totals | `overallMean` only |

```ts
// master
TotalScoresSchema = z.object({
  total_problem_score: ScoreValueSchema,
  total_ability_score: ScoreValueSchema,
  final_total_score: ScoreValueSchema,
})

// v1
JSONScoresSchema = z.object({
  abilityScores: z.array(AbilityScoreSchema),
  problemScores: z.array(ProblemScoreSchema),
  overallMean: ScoreValueSchema,  // only total needed
})
```

---

### 8. Curve: multi-event, no totals curves, embedded dependency

**KS**: Anna's improvements: (1) multiple source events, (2) no curves for ability/problem totals, (3) embedded dependency.

| Aspect | master | v1 (Anna) |
|--------|--------|-----------|
| Source events | Single `source_event_id` | `sourceEventIds` array |
| Total curves | 3 curves (problem, ability, final) | Only `overall` |
| Dependency | Separate schema | Embedded in curve |

```ts
// master
CurveSchema = z.object({
  source_event_id: EventIdSchema,
  totals: TotalCurvesSchema,  // 3 curves
  ability_curves, problem_curves,
})

// v1
CurveSchema = z.object({
  sourceEventIds: z.array(EventIdSchema),
  dimensionProblemDependency: DimensionProblemDependencyListSchema,
  abilityCurves: z.record(DimensionSchema, GradeThresholdsSchema),
  problemCurves: z.record(ProblemIdSchema, GradeThresholdsSchema),
  overall: GradeThresholdsSchema,  // only final
})
```

---

### 9. DimensionProblemDependency in both curve and report

**KS**: Needed in both for compatibility check when applying curve. Anna does this.

| master | v1 (Anna) |
|--------|-----------|
| Separate config schema | Embedded in both `MetadataSchema` and `CurveSchema` |

```ts
// master - separate entity
DimensionDependencyConfigSchema = z.object({
  version, updated_at, dependencies
})

// v1 - embedded in report
MetadataSchema = z.object({
  dimensionProblemDependency: DimensionProblemDependencyListSchema,
})

// v1 - also embedded in curve
CurveSchema = z.object({
  dimensionProblemDependency: DimensionProblemDependencyListSchema,
})
```

**Use case**: Compare `report.metadata.dimensionProblemDependency` with `curve.dimensionProblemDependency` when applying.

---

### 10. Per-problem per-dimension grades

**KS**: Need ABCD for dimension X in problem Y (e.g., verification in problem 000341).

| master | v1 (Anna) |
|--------|-----------|
| Not modeled | `dimensionDetailGrades` |

```ts
// master - missing
CurvedScoresSchema.letter_grades = {
  totals, abilities, problems
  // no problem → dimension → grade
}

// v1 - has it
CurvedLetterGradesSchema = z.object({
  dimensionDetailGrades: z.record(
    ProblemIdSchema,
    z.record(DimensionSchema, CurvedGradeSchema)
  ),
})
// e.g., dimensionDetailGrades["000341"]["self-verification"] = "B"
```

---

## Structural Differences

### 11. Pre-curve grade handling

| master | v1 (Anna) |
|--------|-----------|
| No grade field exists pre-curve | Grade field = `"X"` placeholder |

**Implicit assumption**:
- master: Pre-curve data has no grade concept
- v1: Frontend needs grade placeholder for rendering

---

### 12. Curve methods supported

| master | v1 (Anna) |
|--------|-----------|
| `percentile`, `standard_deviation`, `absolute` | `standard_deviation` only |

```ts
// master - discriminated union
CurveMethodSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("percentile"), percentiles: [...] }),
  z.object({ type: z.literal("standard_deviation"), sigma_boundaries: [...] }),
  z.object({ type: z.literal("absolute"), thresholds: [...] }),
])

// v1 - single method
CurveMethodSchema = z.literal('standard_deviation')
```

---

### 13. Grade threshold format

| master | v1 (Anna) |
|--------|-----------|
| Array: `thresholds[]` + `grades[]` | Named object: `{ A, B, C }` |

```ts
// master
ThresholdDefinitionSchema = z.object({
  thresholds: z.array(ScoreValueSchema),  // [0.9, 0.7, 0.5]
  grades: z.array(LetterGradeSchema),     // ["A", "B", "C", "D"]
})

// v1
GradeThresholdsSchema = z.object({
  A: ScoreValueSchema,  // 0.9
  B: ScoreValueSchema,  // 0.7
  C: ScoreValueSchema,  // 0.5
})
// D implied: score < C
```

---

### 14. Report content modeling

| master | v1 (Anna) |
|--------|-----------|
| Scores only (no narratives) | Full report with proofs, summaries, cards |

**v1 includes**: `phrases`, `proofs`, `summary`, `overview`, `good`, `bad`, `improvements`

---

### 15. Post-curve output structure

| master | v1 (Anna) |
|--------|-----------|
| `CurvedScores` (scores + grades) | `CurvedReport` (extends full report) |

```ts
// master - flat scores
CurvedScoresSchema = z.object({
  totals, ability_scores, problem_scores,
  letter_grades: { totals, abilities, problems }
})

// v1 - full report with grades
CurvedReportSchema = LLMReportSchema.extend({
  metadata: CurvedReportMetadataSchema,
  dimensionCards: z.array(CurvedDimensionCardSchema),
  // ... all fields with CurvedGrade instead of UncurvedGrade
})
```

---

### 16. ScorePool schema

| master | v1 (Anna) |
|--------|-----------|
| Explicit `ScorePoolSchema` wrapper | Conceptual only; no schema |

```ts
// master
ScorePoolSchema = z.object({
  event_id, prompt_version_hash,
  problem_ids, dimension_ids,
  scores: z.array(JSONScoresSchema),
})

// v1 - no schema, just JSONScores[]
```

**Implicit assumption**:
- master: Pool-level metadata enforces homogeneity upfront
- v1: Homogeneity validated at curve-compute time via compatibility check

---

### 17. Compatibility checking

| master | v1 (Anna) |
|--------|-----------|
| Explicit `CompatibilityResultSchema` | Out of scope |

```ts
// master
CompatibilityResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("compatible") }),
  z.object({ status: z.literal("incompatible"), reasons: [...] }),
  z.object({ status: z.literal("requires_override"), warnings: [...], differences: {...} }),
])

// v1 - not modeled
```

---

### 18. EventConfig schema

| master | v1 (Anna) |
|--------|-----------|
| Explicit `EventConfigSchema` | Embedded in report metadata |

```ts
// master
EventConfigSchema = z.object({
  event_id, name, problem_ids, dimension_ids, language, prompt_version_hash
})

// v1 - no separate schema; data lives in MetadataSchema
```

---

## Schemas unique to each branch

### 19. Schemas only in master

| Schema | Purpose |
|--------|---------|
| `TotalScoresSchema` | 3-field totals structure |
| `TotalCurvesSchema` | Curves for each total type |
| `TotalGradesSchema` | Grades for each total type |
| `ThresholdDefinitionSchema` | Threshold + grades arrays |
| `AbilityCurveSchema` | Per-dimension curve |
| `ProblemCurveSchema` | Per-problem curve |
| `AbilityGradeSchema` | Per-dimension grade |
| `ProblemGradeSchema` | Per-problem grade |
| `CurvedScoresSchema` | Post-curve scores only |
| `ScorePoolSchema` | Collection wrapper |
| `CompatibilityResultSchema` | Validation result |
| `EventConfigSchema` | Event definition |
| `DimensionDependencyConfigSchema` | Dependency config wrapper |

---

### 20. Schemas only in v1 (Anna)

| Schema | Purpose |
|--------|---------|
| `UncurvedGradeSchema` | Literal `"X"` placeholder |
| `Sha256HexSchema` | 64-char hex validation |
| `PromptSnapshotEntrySchema` | Per-file key + SHA-256 |
| `PromptSnapshotEntriesSchema` | Sorted, unique entries |
| `LangSchema` | `"en"` / `"zh"` enum |
| `DimensionSchema` | Fixed 5-dimension enum |
| `MetadataSchema` | Report metadata with prompt snapshot |
| `LLMReportSchema` | Full LLM-generated report |
| `DimensionCardSchema` | UI card with phrases |
| `DimensionReportSchema` | Dimension summary |
| `ProblemCardSchema` | UI card for problem |
| `ProblemReportSchema` | Problem detail |
| `DimensionDetailSchema` | Dimension section in problem |
| `ProofSchema` | Observation + comment |
| `OverallSchema` | Good/bad/improvements |
| `GradeThresholdsSchema` | Named `{ A, B, C }` object |
| `CurvedLetterGradesSchema` | Intermediate grades artifact |
| `CurvedReportSchema` | Full report with grades |
| `Curved*Schema` (6 variants) | Extended with `CurvedGrade` |

---

## Summary table

| # | Aspect | master | v1 (Anna) | KS preference |
|---|--------|--------|-----------|---------------|
| 1 | ProblemId format | 6 digits | 6 digits + title | v1 |
| 2 | Language digit validation | No | Yes | v1 |
| 3 | DimensionId | String | Enum | v1 |
| 4 | Prompt versioning | Git hash | SHA-256 | Both |
| 5 | Pre-curve grade | Absent | `"X"` | v1 |
| 6 | Report structure | None | Full | v1 |
| 7 | Totals in JSONScores | 3 fields | 1 field | v1 |
| 8 | Curve source events | Single | Multiple | v1 |
| 9 | Dependency location | Separate | Embedded | v1 |
| 10 | Per-problem-dimension grades | Missing | Present | v1 |
| 11-20 | Various structural | — | — | See above |
