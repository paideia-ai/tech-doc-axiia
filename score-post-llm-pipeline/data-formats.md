# Data Formats: Source and Target

This document describes the input and output of the score post-LLM pipeline, plus the standalone **ProblemDimensionMap** entity that governs which dimensions apply to which problems. Intermediate structures (ScorePool, Curve) are omitted.

For the full pipeline context, see [`pipeline-phases.md`](pipeline-phases.md).

---

## ProblemDimensionMap

A ProblemDimensionMap defines, for a given set of problems, which of the five ability dimensions each problem tests. This is a **scoring-phase input** — it tells the LLM which dimensions to evaluate per problem and propagates downstream as provenance metadata.

### Fields

| Field | Type | Meaning |
|-------|------|---------|
| `map_id` | UUID | Unique identifier for this mapping |
| `label` | string | Human-readable label (e.g. "2025-spring-standard") |
| `created_at` | ISO 8601 datetime | When this mapping was created |
| `entries` | array | One entry per problem (see below) |

### Entry fields

| Field | Type | Meaning |
|-------|------|---------|
| `problem_id` | string (6-digit) | Which problem |
| `problem_version` | string | Version of the problem definition |
| `dimensions` | array of strings | Which dimensions this problem tests (subset of all 5) |

### Relationship to prompt_version

The map and `prompt_version` are **related but independent** parameters of the LLM scoring phase. You can iterate the prompt template without changing the dimension mapping, and vice versa. Both are recorded in JSONScores as provenance.

### Effect on downstream data

- Per-problem `dimension_scores` arrays contain **only the dimensions listed in the map** for that problem — not all five.
- `ability_scores` still has all five dimensions (aggregated across all problems).
- `letter_grades.dimension_details` keys match the map: each problem's grade breakdown only includes its mapped dimensions.

---

## Source: JSONScores (pre-curve)

A JSONScores object holds one participant's raw scores from a single LLM evaluation. It contains **no letter grades** — only numeric scores between 0 and 1.

### Fields

| Field | Type | Meaning |
|-------|------|---------|
| `scores_id` | UUID | Unique identifier for this score record |
| `event_id` | string | Which assessment event produced this score |
| `prompt_version_hash` | git hash (7–40 hex chars) | Version of the LLM prompt used to generate the evaluation |
| `dimension_map_id` | UUID | Which ProblemDimensionMap was used during LLM scoring |
| `generated_at` | ISO 8601 datetime | When the LLM produced this score |
| `participant_id` | string | Who was assessed |
| `totals` | TotalScores | Three summary numbers (see below) |
| `ability_scores` | array of 5 | One score per dimension (always all 5, aggregated across problems) |
| `problem_scores` | array | One entry per problem, each with a task score and per-dimension breakdown |

### TotalScores

| Field | Meaning |
|-------|---------|
| `total_problem_score` | Average of all per-problem task scores |
| `total_ability_score` | Average of all five dimension scores |
| `final_total_score` | Geometric mean of the above two |

### The five dimensions

1. Discovery-Self-Understanding
2. Expression-Translation
3. Exploratory-Discovery
4. Verification-Confirmation
5. Iterative-Optimization

### Problem IDs

A problem ID is a 6-digit string. The last digit encodes language (0 = Chinese, 1 = English). The second-to-last digit is the minor version. The remaining digits are the major version.

### Per-problem scores

Each entry in `problem_scores` contains:
- `problem_id` — which problem
- `task_score` — how well the participant met the problem's objective (0–1)
- `dimension_scores` — an array of `{dimension, score}` pairs for the dimensions **listed in the ProblemDimensionMap** for this problem (not necessarily all 5)

---

## Target: CurvedScores (post-curve)

A CurvedScores object is the pipeline's final output. It carries the **same numeric scores** as the source JSONScores, plus **letter grades (A/B/C/D)** assigned by applying a curve.

### Fields

| Field | Type | Meaning |
|-------|------|---------|
| `curved_scores_id` | UUID | Unique identifier for this curved record |
| `source_scores_id` | UUID | Which JSONScores this was derived from |
| `event_id` | string | Assessment event |
| `prompt_version_hash` | git hash | Prompt version (must match the curve's) |
| `dimension_map_id` | UUID | Which ProblemDimensionMap was used (inherited from source JSONScores) |
| `applied_curve_id` | UUID | Which curve was used |
| `curved_at` | ISO 8601 datetime | When the curve was applied |
| `participant_id` | string | Who was assessed |
| `totals` | TotalScores | Same three summary numbers as the source |
| `ability_scores` | array | Same five dimension scores as the source |
| `problem_scores` | array | Same per-problem scores as the source |
| `letter_grades` | object | All letter grades (see below) |

### Letter grades structure

The `letter_grades` object contains four sections:

| Section | Key type | Value | Meaning |
|---------|----------|-------|---------|
| `totals` | — | three grades | Grades for total_problem, total_ability, and final_total |
| `abilities` | dimension name | A/B/C/D | One grade per dimension (all 5) |
| `problems` | problem ID | A/B/C/D | One grade per problem |
| `dimension_details` | problem ID → dimension name | A/B/C/D | One grade per **mapped dimension** within each problem (keys follow the ProblemDimensionMap) |

---

## Summary

| | JSONScores (source) | CurvedScores (target) |
|---|---|---|
| Numeric scores | Yes | Yes (copied from source) |
| Letter grades | No | Yes (A/B/C/D) |
| Curve reference | No | Yes (`applied_curve_id`) |
| Dimension map reference | Yes (`dimension_map_id`) | Yes (`dimension_map_id`) |
| Traceability | `scores_id` | `curved_scores_id` + `source_scores_id` |
