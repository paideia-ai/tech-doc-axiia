# IP-04 Changelog: Schema Updates

Summary of changes to `schemas.ts` based on ip-04.md decisions.

---

## Changes Applied

### 1. ProblemId (#1, #2)
- **Kept**: 6 digits only (`^\d{6}$`)
- **Added**: Language digit validation (last digit must be 0=zh or 1=en)
- **Added**: `problem_names` record in EventConfigSchema for human-readable names

### 2. DimensionId → DimensionSchema (#3)
Changed from `z.string().min(1)` to enum:
```ts
z.enum([
  "Discovery-Self-Understanding",
  "Expression-Translation",
  "Exploratory-Discovery",
  "Verification-Confirmation",
  "Iterative-Optimization",
])
```

### 3. Pre-curve Grade (#5, #11)
- **Kept**: No letter grade field pre-curve (master approach)
- JSONScores and reports have no grade field until curving

### 4. JSONScores (#7)
- **Kept**: All three totals (`total_problem_score`, `total_ability_score`, `final_total_score`)
- **Enforced**: `ability_scores` must have exactly 5 entries (one per dimension)
- **Added**: `dimension_scores` nested in each `ProblemScoreSchema`

### 5. Curve Schema (#8, #9, #12, #13)
- **Changed**: `source_event_id` → `source_event_ids` (array, multi-event support)
- **Changed**: Array format → Record format for `ability_curves` and `problem_curves` (O(1) lookup)
- **Changed**: Threshold format from `{ thresholds: [], grades: [] }` to `{ A, B, C }` (GradeThresholdsSchema)
- **Kept**: All three total curves (TotalCurvesSchema)
- **Kept**: Discriminated union for CurveMethodSchema (extensible)
- **Added**: Embedded `dimension_problem_dependency`
- **Added**: `label` field

### 6. CurvedScores (#10)
- **Changed**: `abilities` and `problems` from array to record format
- **Added**: `dimension_details` for per-problem per-dimension grades
  ```ts
  dimension_details: z.record(
    ProblemIdSchema,
    z.record(DimensionSchema, LetterGradeSchema)
  )
  ```

### 7. ScorePool (#16)
- **Changed**: `event_id` → `source_event_ids` (array, multi-event support)
- **Added**: `pool_id`, `label`, `created_at`
- **Added**: Embedded `dimension_problem_dependency`

### 8. Other (#17, #18)
- **Kept**: CompatibilityResultSchema
- **Kept**: EventConfigSchema (explicit, with added `problem_names` record)

---

## Schema Structure Summary

```
JSONScores (pre-curve)
├── scores_id, event_id, participant_id, generated_at
├── prompt_version_hash
├── totals: { total_problem_score, total_ability_score, final_total_score }
├── ability_scores[5]: { dimension, score }
└── problem_scores[]: { problem_id, task_score, dimension_scores[] }

Curve
├── curve_id, label, computed_at, sample_size
├── source_event_ids[], prompt_version_hash
├── dimension_problem_dependency[]
├── method: percentile | standard_deviation | absolute
├── totals: { total_problem, total_ability, final_total } → { A, B, C }
├── ability_curves: Record<Dimension, { A, B, C }>
└── problem_curves: Record<ProblemId, { A, B, C }>

CurvedScores (post-curve)
├── curved_scores_id, source_scores_id, applied_curve_id, curved_at
├── (all JSONScores fields)
└── letter_grades
    ├── totals: { total_problem_grade, total_ability_grade, final_total_grade }
    ├── abilities: Record<Dimension, Grade>
    ├── problems: Record<ProblemId, Grade>
    └── dimension_details: Record<ProblemId, Record<Dimension, Grade>>

ScorePool
├── pool_id, label, created_at
├── source_event_ids[], prompt_version_hash
├── problem_ids[], dimension_problem_dependency[]
└── scores: JSONScores[]
```

---

## Data Flow

```
LLM Report → extract → JSONScores (no grades)
                           ↓
                      ScorePool (multi-event)
                           ↓
                    computeCurve()
                           ↓
                        Curve
                           ↓
JSONScores + Curve → applyCurve() → CurvedScores (with grades)
                                          ↓
                                    merge → CurvedReport
```
