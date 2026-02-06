# Effect Schema Explanation

The pipeline transforms raw LLM scores into curved letter grades. This file (`schemas.ts`) defines the data shapes using [Effect Schema](https://effect.website/docs/schema/introduction) with branded types and `Schema.Class` for derived getters.

## Design principle: store source data, derive the rest as class getters

```
                     Schema.Class getters
                    ┌─────────────────────────────┐
problem_scores ────►│ ability_scores  (get)        │
    (stored)        │ totals          (get)        │
                    └─────────────────────────────┘
                     encode only includes declared fields
```

Derived values are **computed getters** on the `JSONScores` class. Consumers access `scores.ability_scores` and `scores.totals` like regular properties. On encode, only declared schema fields are serialized — getters are excluded automatically.

Grade aggregates (ability_grades, total_grades) **are stored** in CurvedScores because they require the curve function, which can't be replayed from scores alone.

---

## Three top-level entities

**ProblemDimensionMap** — which dimensions each problem tests. Embedded directly in JSONScores (not referenced by UUID).
**JSONScores** — per-problem numeric scores + derived ability_scores and totals.
**CurvedScores** — wraps JSONScores, adds all grades.

---

## Branded primitives

Distinct types at compile time — can't accidentally pass a ProblemId where an EventId is expected.

| Type | Underlying | Constraint |
|------|-----------|------------|
| `ProblemId` | string | 6 digits; last digit `0` (zh) or `1` (en) |
| `PromptVersionHash` | string | 7–40 hex chars (git short/full hash) |
| `ScoreValue` | number | `[0, 1]` inclusive |
| `EventId` | string | non-empty |

## Enums

| Type | Values |
|------|--------|
| `Dimension` | 5 ability dimensions (Discovery-Self-Understanding, Expression-Translation, Exploratory-Discovery, Verification-Confirmation, Iterative-Optimization) |
| `LetterGrade` | `"A"`, `"B"`, `"C"`, `"D"` |

`DIMENSIONS` is also exported as a `const` array for iteration.

---

## ProblemDimensionMap

Standalone lookup table. Embedded directly in JSONScores.

```
ProblemDimensionMap
├── map_id          : UUID
├── label           : string
├── created_at      : DateTimeUtc
└── entries[]       : DimMapEntry
    ├── problem_id      : ProblemId
    ├── problem_version : string
    └── dimensions[]    : Dimension      ← subset of the 5
```

---

## JSONScores — `Schema.Class` with derived getters

The class has two layers:

**Declared fields (stored in JSON):** metadata + problem_scores.
**Getters (computed on access):** `ability_scores` + `totals`.

```
JSONScores (decoded type)
├── scores_id            : UUID
├── event_id             : EventId
├── prompt_version_hash  : PromptVersionHash
├── dimension_map        : ProblemDimensionMap  ← embedded, self-contained
├── generated_at         : DateTimeUtc
├── participant_id       : string
├── problem_scores[]     : ProblemScore                          ← STORED
│   ├── problem_id        : ProblemId
│   ├── task_score        : ScoreValue
│   └── dimension_scores  : Record<Dimension, Option<ScoreValue>>
│                           ├── "Discovery-Self-Understanding": 0.85
│                           ├── "Expression-Translation": null     ← not tested
│                           ├── "Exploratory-Discovery": 0.72
│                           ├── "Verification-Confirmation": null  ← not tested
│                           └── "Iterative-Optimization": 0.61
├── ability_scores       : Record<Dimension, ScoreValue>         ← DERIVED
└── totals               : TotalScores                           ← DERIVED
    ├── total_problem_score  : ScoreValue
    ├── total_ability_score  : ScoreValue
    └── final_total_score    : ScoreValue
```

All 5 dimension keys are always present. `null` (decoded as `Option.None`) means the problem doesn't test that dimension.

### Derivation formulas

| Field | Formula |
|-------|---------|
| `ability_scores[dim]` | Arithmetic mean of `Some` values for that dimension across all problems |
| `totals.total_problem_score` | Arithmetic mean of all `task_score` values |
| `totals.total_ability_score` | Arithmetic mean of the 5 ability scores |
| `totals.final_total_score` | **Geometric mean**: `√(problem_total × ability_total)` |

### Encode behavior

`Schema.Class` only encodes declared fields. Getters (`ability_scores`, `totals`) are excluded automatically — only `problem_scores` and metadata are serialized.

---

## CurvedScores (stored)

Wraps JSONScores. Grades mirror the score structure using the same Record + Option pattern.

```
CurvedScores
├── curved_scores_id  : UUID
├── source            : JSONScores          ← composition, not duplication
├── applied_curve_id  : UUID
├── curved_at         : DateTimeUtc
├── problem_grades[]  : ProblemGrade        ← per-problem, mirrors ProblemScore
│   ├── problem_id        : ProblemId
│   ├── task_grade        : LetterGrade
│   └── dimension_grades  : Record<Dimension, Option<LetterGrade>>
├── ability_grades    : Record<Dimension, LetterGrade>   ← all 5, no Option
└── total_grades      : TotalGrades
    ├── total_problem_grade  : LetterGrade
    ├── total_ability_grade  : LetterGrade
    └── final_total_grade    : LetterGrade
```

**Why are grade aggregates stored but score aggregates derived?**

Score aggregation is a pure numeric mean — lossless, trivially recomputable, so it lives as a class getter. Grade aggregation requires the curve function (percentile, standard deviation, etc.) — an external dependency that can't be replayed from scores alone.

---

## Decode helpers

```ts
decodeJSONScores(input)           // unknown → JSONScores (with derived fields)
decodeCurvedScores(input)         // unknown → CurvedScores
decodeProblemDimensionMap(input)  // unknown → ProblemDimensionMap
```

## Not yet ported

`Curve`, `ScorePool`, and `EventConfig` remain in the Zod version (`v2-zod/schemas.ts`).
