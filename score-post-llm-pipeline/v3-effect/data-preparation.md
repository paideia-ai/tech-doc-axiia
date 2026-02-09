# Data Preparation Guide

How to prepare raw JSON data for the v3-effect pipeline. All data enters as plain JSON objects — the schema layer handles validation and transformation via `decodeXxx()`.

## 1. JSONScores (per-student scores)

```json
{
  "scores_id": "aaaaaaaa-0001-4000-8000-000000000002",
  "event_id": "spring-2024-final",
  "prompt_snapshot": { "..." },
  "dimension_map": { "..." },
  "generated_at": "2024-06-10T00:00:00.000Z",
  "participant_id": "student-aaaa",
  "problem_scores": [
    {
      "problem_id": { "digit": "000340", "name": "meeting-verify" },
      "task_score": 0.80,
      "dimension_scores": {
        "discovery": 0.85,
        "representation": 0.78,
        "iterative-refinement": null,
        "exploratory": 0.72,
        "self-verification": null
      }
    }
  ]
}
```

**Rules:**
- `task_score` and dimension scores: `number ∈ [0, 1]` or `null` (untested)
- `problem_id.digit`: exactly 6 digits, last char `0` or `1`
- `dimension_scores` must include **all 5 dimensions** — use `null` for untested ones
- Problems must match what's in the `dimension_map`

## 2. PromptSnapshot (provenance)

```json
{
  "git_hash": "a3f8b2c",
  "set_hash": "aabbccdd...aabb",
  "entries": [
    { "key": "framework:zh:ability-summary", "sha256": "1000...0001" },
    { "key": "framework:zh:task-eval",       "sha256": "1000...0006" },
    { "key": "problem:000340:scoring",       "sha256": "2000...0001" },
    { "key": "problem:000340:task-eval",     "sha256": "2000...0002" }
  ]
}
```

**Rules:** entries **sorted alphabetically by `key`**, no duplicate keys, `sha256` values are 64-char hex strings.

## 3. ProblemDimensionMap

```json
{
  "map_id": "d4e5f6a7-b8c9-4d0e-af12-345678901234",
  "label": "2024 Spring Assessment v2",
  "created_at": "2024-06-10T00:00:00.000Z",
  "entries": [
    {
      "problem_id": { "digit": "000340", "name": "meeting-verify" },
      "dimensions": ["discovery", "exploratory", "representation"]
    }
  ]
}
```

Each entry lists which of the 5 dimensions a problem tests.

## 4. EventConfig (for pool building)

```json
{
  "event_id": "spring-2024-final",
  "problem_ids": [
    { "digit": "000340", "name": "meeting-verify" },
    { "digit": "000500", "name": "thinking-traps" }
  ],
  "prompt_snapshot": { "..." },
  "dimension_map": { "..." },
  "event_date": "2024-06-10T00:00:00.000Z"
}
```

## The 3-Step Load Pattern

Every schema type follows the same pattern:

```typescript
// 1. Load → unknown
const raw = JSON.parse(fs.readFileSync("scores.json", "utf-8"));

// 2. Decode → validated, branded, typed instance
const scores = decodeJSONScores(raw);

// 3. Encode back → plain JSON (strips derived getters, converts DateTimeUtc → ISO string)
const encoded = encodeJSONScores(scores);
```

## What Decode Does

| JSON form | Decoded form |
|-----------|-------------|
| `0.85` (number) | `ScoreValue` (branded, guaranteed ∈ [0,1]) |
| `"000340"` (string) | `ProblemDigitId` (branded, guaranteed 6-digit) |
| `null` | `Option.None` |
| `0.78` (in dimension_scores) | `Option.Some(ScoreValue)` |
| ISO string | `DateTimeUtc` |

Invalid data (e.g. `task_score: 1.5`) throws a `ParseError` at decode time.

## Derived Getters (not in JSON)

After decoding, `JSONScores` has two computed properties that exist only on the decoded instance:

- **`ability_scores`** — per-dimension mean across mapped problems (skips `Option.None`)
- **`totals`** — `total_problem_score` (mean of task_scores), `total_ability_score` (mean of 5 ability scores), `final_total_score` (geometric mean: √(problem × ability))

These are **stripped on encode** — they never appear in stored JSON.

## Re-encoding Gotcha: DateTimeUtc

When re-encoding decoded objects that contain `DateTimeUtc` fields (e.g. `PromptSnapshot`, `ProblemDimensionMap`), always use `Schema.encodeSync`:

```typescript
const rawSnapshot = encodePromptSnapshot(decodedSnapshot);
const rawDimMap = encodeProblemDimensionMap(decodedDimMap);
```

Never use `.toString()` on `DateTimeUtc` — it produces `DateTime.Utc(...)` format which fails decoding.
