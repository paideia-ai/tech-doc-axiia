# Effect Schema Explanation

The pipeline transforms raw LLM scores into curved letter grades. This file (`schemas.ts`) defines the data shapes using [Effect Schema](https://effect.website/docs/schema/introduction) with branded types and bidirectional encode/decode.

## Design principle: store source data, compute the rest

```
problem_scores (stored)  ──→  ability_scores (computed)  ──→  totals (computed)
       │
       └──  curve function  ──→  grades (stored, because curve is lossy)
```

Numeric aggregations (ability scores, totals) are **not stored** — they're derived from per-problem data via pure functions. Grade aggregations (ability grades, total grades) **are stored** because they require the curve function, which can't be replayed from scores alone.

---

## Three top-level entities

**ProblemDimensionMap** — which dimensions each problem tests.
**JSONScores** — per-problem numeric scores. No grades, no totals.
**CurvedScores** — wraps JSONScores, adds all grades (per-problem + aggregates).

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

Standalone lookup table. Referenced by UUID, not embedded.

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

## JSONScores (stored — minimal)

Only per-problem data is stored. No totals, no ability_scores.

```
JSONScores
├── scores_id            : UUID
├── event_id             : EventId
├── prompt_version_hash  : PromptVersionHash
├── dimension_map_id     : UUID             ← links to ProblemDimensionMap
├── generated_at         : DateTimeUtc
├── participant_id       : string
└── problem_scores[]     : ProblemScore
    ├── problem_id        : ProblemId
    ├── task_score        : ScoreValue
    └── dimension_scores  : Record<Dimension, Option<ScoreValue>>
                            ├── "Discovery-Self-Understanding": 0.85
                            ├── "Expression-Translation": null     ← not tested
                            ├── "Exploratory-Discovery": 0.72
                            ├── "Verification-Confirmation": null  ← not tested
                            └── "Iterative-Optimization": 0.61
```

All 5 dimension keys are always present. `null` (decoded as `Option.None`) means the problem doesn't test that dimension. A present value (decoded as `Option.Some`) means it does.

### What's derived (not stored)

| Value | Computed by | Logic |
|-------|-------------|-------|
| `ability_scores` | `computeAbilityScores()` | For each dimension, mean of `Some` values across all problems |
| `total_problem_score` | `computeScoreTotals()` | Mean of all `task_score` values |
| `total_ability_score` | `computeScoreTotals()` | Mean of the 5 ability scores |
| `final_total_score` | `computeScoreTotals()` | Mean of problem total and ability total |

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

**Why are grade aggregates stored but score aggregates aren't?**

Score aggregation is a pure numeric mean — lossless and trivially recomputable. Grade aggregation requires the curve function (percentile, standard deviation, etc.), which is an external dependency. Storing them avoids needing the curve at read time.

---

## Decode helpers

```ts
decodeJSONScores(input)           // unknown → JSONScores (throws on invalid)
decodeCurvedScores(input)         // unknown → CurvedScores
decodeProblemDimensionMap(input)  // unknown → ProblemDimensionMap
```

## Not yet ported

`Curve`, `ScorePool`, and `EventConfig` remain in the Zod version (`v2-zod/schemas.ts`).
