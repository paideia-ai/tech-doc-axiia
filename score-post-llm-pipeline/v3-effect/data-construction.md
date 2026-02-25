# Constructing Input Data

How to build valid JSONScores and assemble them into a ScorePool.

---

## 1. Build a PromptSnapshot

A PromptSnapshot records exactly which prompt files were used to score a student. Three fields:

```
PromptSnapshot
├── git_hash      "a3f8b2c"                    ← git commit where prompts live
├── set_hash      "aabbccddee001122..."         ← SHA-256 of the entries array (for O(1) equality)
└── entries[]     sorted by key, no duplicates
    ├── { key: "framework:zh:ability-summary",  sha256: "..." }
    ├── { key: "framework:zh:expert-review",    sha256: "..." }
    ├── { key: "framework:zh:task-eval",        sha256: "..." }
    ├── { key: "problem:000340:scoring",        sha256: "..." }
    ├── { key: "problem:000340:task-eval",      sha256: "..." }
    └── ...
```

### Step by step

1. **Collect prompt files.** Two tiers:
   - 6 framework prompts: `packages/eval/materials/prompts/framework/{zh,en}/*.liquid`
   - 2 per problem: `packages/eval/materials/prompts/problems/{digitId}/scoring.md` and `task-eval.md`

2. **Hash each file.** For every prompt file, compute `SHA-256(file_contents)` → 64 lowercase hex chars.

3. **Assign keys.** Convention (not schema-enforced):
   - Framework: `framework:{lang}:{name}` — e.g. `framework:zh:task-eval`
   - Problem: `problem:{digitId}:{name}` — e.g. `problem:001001:scoring`

4. **Sort entries by key** (lexicographic, ascending). The schema rejects unsorted or duplicate keys.

5. **Compute `set_hash`.** This is the crucial step for O(1) equality:

   ```
   set_hash = SHA-256( JSON.stringify(entries) )
   ```

   where `entries` is the sorted array of `{ key, sha256 }` objects, serialized with the default `JSON.stringify` (no extra whitespace, keys in declaration order: `key` then `sha256`).

   Concretely:
   ```js
   const entries = [
     { key: "framework:zh:ability-summary", sha256: "1000...0001" },
     { key: "framework:zh:expert-review",   sha256: "1000...0002" },
     // ... all entries, already sorted
   ];
   const json = JSON.stringify(entries);
   // json = '[{"key":"framework:zh:ability-summary","sha256":"1000...0001"},{"key":...}]'
   const set_hash = sha256(json);  // 64 hex chars
   ```

6. **Record `git_hash`.** The git commit hash (7–40 hex chars) of the repo when these files were snapshotted. For traceability, not equality.

### Why set_hash matters

Two PromptSnapshots are equal iff their `set_hash` values match — one string comparison instead of iterating all entries. If they differ, the entry-level diffs tell you *which* file changed.

---

## 2. Build a ProblemDimensionMap

Defines which of the 5 dimensions each problem tests.

```
ProblemDimensionMap
├── map_id       UUID
├── label        "2024 Spring Assessment v2"
├── created_at   ISO timestamp
└── entries[]
    ├── { problem_id: { digit: "000340", name: "meeting-verify" },
    │     dimensions: ["Discovery-Self-Understanding", "Expression-Translation", "Exploratory-Discovery"] }
    ├── { problem_id: { digit: "000500", name: "thinking-traps" },
    │     dimensions: ["Discovery-Self-Understanding", "Verification-Confirmation", "Iterative-Optimization"] }
    └── ...
```

The 5 possible dimensions:
- `Discovery-Self-Understanding`
- `Expression-Translation`
- `Exploratory-Discovery`
- `Verification-Confirmation`
- `Iterative-Optimization`

Each problem tests a subset of these. The map is created once per assessment design and embedded directly in every JSONScores (self-contained, no lookup needed).

---

## 3. Build JSONScores

One JSONScores = one student's scores for one assessment event.

### Stored fields (what goes into JSON)

```json
{
  "scores_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "event_id": "spring-2024-final",
  "prompt_snapshot": { ... },          // ← from step 1
  "dimension_map": { ... },            // ← from step 2
  "generated_at": "2024-06-10T00:00:00.000Z",
  "participant_id": "student-0042",
  "problem_scores": [
    {
      "problem_id": { "digit": "000340", "name": "meeting-verify" },
      "task_score": 0.80,
      "dimension_scores": {
        "Discovery-Self-Understanding": 0.85,
        "Expression-Translation": 0.78,
        "Exploratory-Discovery": 0.72,
        "Verification-Confirmation": null,
        "Iterative-Optimization": null
      }
    }
  ]
}
```

### Rules

- **All 5 dimension keys must be present** in every `dimension_scores` record. Dimensions the problem doesn't test → `null`.
- **Scores are [0, 1]** inclusive.
- **`problem_id.digit`**: 6 digits, last digit `0` (Chinese) or `1` (English).
- **`prompt_snapshot`** and **`dimension_map`** are the same for every student in the same event.

### Derived fields (not stored, computed on decode)

When you decode the JSON into the `JSONScores` class, three getters become available:

| Field | Formula |
|-------|---------|
| `ability_scores[dim]` | Mean of non-null values for that dimension across all problems |
| `totals.total_problem_score` | Mean of all `task_score` values |
| `totals.total_ability_score` | Mean of the 5 ability scores |
| `totals.final_total_score` | Arithmetic mean: `(total_problem + total_ability) / 2` |

Example for student-0042 (3 problems):

```
Discovery-Self-Understanding:  mean(0.85, 0.90, 0.88) = 0.877
Expression-Translation:        mean(0.78, 0.82)        = 0.800   ← 000500 is null, skipped
Exploratory-Discovery:         mean(0.72, 0.79)         = 0.755
Verification-Confirmation:     mean(0.65, 0.71)         = 0.680
Iterative-Optimization:        mean(0.70, 0.68)         = 0.690

total_problem = mean(0.80, 0.75, 0.82)   = 0.790
total_ability = mean(0.877, 0.800, 0.755, 0.680, 0.690) = 0.760
final_total   = (0.790 + 0.760) / 2       = 0.775
```

These are **not** stored in JSON. The class recomputes them on access.

---

## 4. Assemble a ScorePool

A ScorePool collects JSONScores from multiple students (potentially across events) so a Curve can be computed from the population statistics.

### The rule: all scores must be comparable

For a curve to be meaningful, every score in the pool must have been produced under the same conditions:
- **Same prompts** (same `prompt_snapshot.set_hash`)
- **Same problem-dimension mapping** (structurally identical `dimension_map`)

### Construction API

Three functions in `score-pool-builder.ts`:

#### `initPool(label, event, scores)` — start from the first event

```
initPool("Spring 2024 Pool", eventConfig, [student1, student2, ...])
  → ScorePool
```

The first event's `prompt_snapshot` and `dimension_map` become the pool's **reference**. All future additions are checked against this reference. Always succeeds.

#### `addScore(pool, score)` — add one student

```
addScore(pool, student99)
  → Either<ScorePool, PoolError>
```

Checks the score against the pool reference:

| Check | Rejects when |
|-------|-------------|
| Prompt snapshot match | `score.prompt_snapshot.set_hash ≠ pool.prompt_snapshot.set_hash` |
| Dimmap structural match | Score's problems have different dimension sets than pool's |
| No duplicate | `score.scores_id` already in pool |

If the score's `event_id` is new, it's implicitly registered in `source_event_ids`.

#### `addEvent(pool, event, scores)` — add a whole event

```
addEvent(pool, eventB, [student50, student51, ...])
  → Either<ScorePool, PoolError>
```

Same compatibility checks, applied to the EventConfig first (fast fail before iterating scores), then to each score.

### Example: building a pool

```
1. initPool("Spring 2024", eventA, [s1, s2, ..., s60])
   → pool with 60 scores, reference = eventA's prompt_snapshot + dimmap

2. addEvent(pool, eventB, [s61, s62, ..., s120])
   → checks eventB.prompt_snapshot vs pool reference
   → checks eventB.dimension_map vs pool reference
   → if compatible: pool now has 120 scores from 2 events
   → if incompatible: Left({ _tag: "prompt_snapshot_mismatch", diffs: [...] })

3. Pool is ready for curve computation (120 scores, μ and σ per category)
```

### What makes a score incompatible

A score is rejected if it was produced under different conditions:

- **Prompt changed**: A framework prompt was updated between events. The `set_hash` values differ. The slow-path diagnostic lists exactly which file changed (e.g. `framework:zh:task-eval: sha256 differs`).
- **Dimension map changed**: A problem was reassigned to different dimensions. The structural check catches this per-problem (e.g. `000340: pool=[Discovery,Expression,Exploratory] score=[Discovery,Expression]`).
- **Duplicate**: The same `scores_id` appears twice — data error.

---

## Summary: data flow

```
  prompt files → hash each → sort → compute set_hash → PromptSnapshot
                                                              │
  assessment design → ProblemDimensionMap ─────────────────────┤
                                                              │
  LLM evaluation → per-problem scores ────────────────────────┤
                                                              ▼
                                                         JSONScores (one per student)
                                                              │
                                         initPool / addEvent / addScore
                                                              │
                                                              ▼
                                                          ScorePool
                                                              │
                                                         compute curve
                                                              │
                                                              ▼
                                                            Curve
```
