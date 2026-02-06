# Pipeline Phases

The score post-LLM pipeline transforms raw LLM evaluations into curved letter grades through six sequential phases. This document describes what happens at each phase, what data flows in and out, and where key parameters like **ProblemDimensionMap** and **prompt_version** enter the process.

For data format details, see [`data-formats.md`](data-formats.md).

---

## Phase Overview

```
1. Test Event         → participants take test, submit answers
2. LLM Scoring        → LLM generates complete report (text + scores)
3. Score Extraction    → extract JSONScores from the complete report
4. Curve Computation   → collect JSONScores into ScorePool → compute Curve
5. Curve Application   → Curve + one JSONScores → CurvedScores
6. Merge Back          → put curved scores/grades back into report
```

---

## Phase Details

### 1. Test Event

Participants take a test and submit their answers.

| | |
|---|---|
| **Input** | Test problems, participant answers |
| **Output** | Raw submissions per participant |
| **Key decisions** | Which problems are included in this event |

### 2. LLM Scoring

The LLM evaluates each participant's submission and produces a **complete report** — narrative text and numeric scores together in one generation. Two key parameters govern what the LLM produces:

- **`prompt_version`** — the version of the evaluation prompt template
- **`ProblemDimensionMap`** — tells the LLM which dimensions to score for each problem

These are independent: you can iterate the prompt without changing the dimension mapping, and vice versa.

| | |
|---|---|
| **Input** | Participant submission, prompt template (`prompt_version`), `ProblemDimensionMap` |
| **Output** | Complete LLM report (narrative text + embedded scores) |
| **Key decisions** | Prompt design, which dimensions apply to which problems |

### 3. Score Extraction

Parse the complete LLM report to extract structured numeric scores into a **JSONScores** object. The extracted object records `prompt_version_hash` and embeds the full `dimension_map` (ProblemDimensionMap) as provenance metadata — these are the parameters that shaped the LLM's scoring.

| | |
|---|---|
| **Input** | Complete LLM report |
| **Output** | JSONScores (structured numeric scores) |
| **Key decisions** | Extraction/parsing logic |

### 4. Curve Computation

Collect multiple JSONScores (from many participants in the same event, scored with the same prompt version and dimension map) into a **ScorePool**, then compute statistical **Curve** boundaries.

Both ScorePool and Curve embed a snapshot of the ProblemDimensionMap for consistency verification — ensuring all pooled scores were generated against the same mapping.

| | |
|---|---|
| **Input** | Multiple JSONScores → ScorePool |
| **Output** | Curve (grade boundaries per score category) |
| **Key decisions** | Which scores to include, statistical method for boundaries |

### 5. Curve Application

Apply the Curve to a single JSONScores to produce **CurvedScores** — the same numeric scores plus letter grades (A/B/C/D) for every score category.

The `dimension_map` is inherited from the source JSONScores. Grade keys in `dimension_grades` match exactly the dimensions listed in the map for each problem.

| | |
|---|---|
| **Input** | One JSONScores + Curve |
| **Output** | CurvedScores (numeric scores + letter grades) |
| **Key decisions** | Grade assignment logic |

### 6. Merge Back

Insert the curved scores and letter grades back into the original report, producing a final report with both narrative text and graded results.

| | |
|---|---|
| **Input** | CurvedScores + original LLM report |
| **Output** | Final graded report |
| **Key decisions** | Report formatting |

---

## Where ProblemDimensionMap Enters

The ProblemDimensionMap is a **scoring-phase input** — it tells the LLM which dimensions to evaluate for each problem. From there, its influence propagates downstream:

```
Phase 2 (LLM Scoring)
  ↓ shapes what dimension_scores the LLM produces per problem
Phase 3 (Score Extraction)
  ↓ dimension_map embedded as provenance in JSONScores
Phase 4 (Curve Computation)
  ↓ snapshot embedded in ScorePool and Curve for compatibility checks
Phase 5 (Curve Application)
  ↓ dimension_map inherited by CurvedScores; dimension_grades keys follow the map
```

### Key invariant

Per-problem `dimension_scores` use Record + Option: all 5 dimension keys are present, but untested dimensions are `None` (null in JSON). `ability_scores` always has all 5 dimensions because it aggregates across all problems (skipping `None` values).
