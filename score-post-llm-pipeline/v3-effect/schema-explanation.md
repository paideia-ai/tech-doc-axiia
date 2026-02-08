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

Distinct types at compile time — can't accidentally pass a ProblemDigitId where an EventId is expected.

`ProblemId` is a struct with two fields: `digit: ProblemDigitId` (stable key) + `name: string` (mutable human label). The digit never changes; the name can be updated without breaking references.

| Type | Underlying | Constraint |
|------|-----------|------------|
| `ProblemDigitId` | string | 6 digits; last digit `0` (zh) or `1` (en) |
| `Sha256Hex` | string | Exactly 64 lowercase hex chars |
| `GitHash` | string | 7–40 lowercase hex chars (git short/full hash) |
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
    ├── problem_id      : { digit: ProblemDigitId, name: string }
    └── dimensions[]    : Dimension      ← subset of the 5
```

---

## PromptSnapshot — multi-prompt provenance tracking

A single git hash can't express which of 20+ prompt files changed. `PromptSnapshot` replaces the old `PromptVersionHash` with per-file tracking.

```
PromptSnapshot
├── git_hash    : GitHash     ← repo commit for traceability
├── set_hash    : Sha256Hex   ← SHA-256 of sorted entries JSON (O(1) equality)
└── entries[]   : PromptSnapshotEntry   (sorted by key, no duplicates)
    ├── key      : string     ← e.g. "framework:zh:task-eval" or "problem:001001:scoring"
    └── sha256   : Sha256Hex  ← SHA-256 of the file's content
```

**Key naming convention** (not enforced in schema, just a convention):
- Framework prompts: `framework:{lang}:{name}` — e.g. `framework:zh:task-eval`
- Problem-specific: `problem:{digitId}:{name}` — e.g. `problem:001001:scoring`

**Why both git_hash and sha256?** Git hash gives traceability (which commit). SHA-256 per-file gives content equality (did this specific file change?). The `set_hash` is a quick O(1) check: if set_hashes match, all entries match — no need to iterate.

**Comparison strategies** in `apply-curve.ts`:
- `strictSetHash` (default): set_hash must match. On mismatch, enumerates per-entry diffs for diagnostics.
- `perProblemComparison`: framework entries must all match; problem entries only checked for scored problems. Enables: "changing problem A's rubric doesn't invalidate problem B's scores."

---

## JSONScores — `Schema.Class` with derived getters

The class has two layers:

**Declared fields (stored in JSON):** metadata + problem_scores.
**Getters (computed on access):** `ability_scores` + `totals`.

```
JSONScores (decoded type)
├── scores_id            : UUID
├── event_id             : EventId
├── prompt_snapshot      : PromptSnapshot       ← per-file prompt tracking
│   ├── git_hash          : GitHash
│   ├── set_hash          : Sha256Hex           ← O(1) equality check
│   └── entries[]         : PromptSnapshotEntry  (sorted by key, no duplicates)
│       ├── key            : string              ← e.g. "framework:zh:task-eval"
│       └── sha256         : Sha256Hex
├── dimension_map        : ProblemDimensionMap   ← embedded, self-contained
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
└── overall_grade     : LetterGrade         ← from final_total_score
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

`EventConfig` fields remain a stub (only `event_id`).
