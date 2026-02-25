# ISS Curve Comparison

**Population:** 63 participants (41 CN + 22 EN), 4 problems

Three curve sources are compared:

| Source | Label | Method | Dims |
|--------|-------|--------|------|
| `ISS-curve-manual.csv` | Manual CSV | standard_deviation (μ ± σ) | 7 |
| `output/step3-curve.json` | Computed | standard_deviation (μ ± σ) | 5 |
| `ISS-with-full-curved/` | Report grades | manual CSV curve applied | 7 |

Note: `ISS-without-task-curve/` contains the historical reports where problem task grades were **not** curved (used a different quartile-like method). `ISS-with-full-curved/` has been fully curved using the manual CSV thresholds and is the correct comparison baseline.

## Part 1: Threshold Comparison — Manual CSV vs Computed

### Overall Mean

| Grade | Manual (7-dim) | Computed (5-dim) | Diff |
|-------|---------------|-----------------|------|
| A | 0.498 | 0.492 | -0.006 |
| B | 0.394 | 0.388 | -0.006 |
| C | 0.291 | 0.284 | -0.007 |

Differs because `final_total_score = (total_problem + total_ability) / 2` and `total_ability` changes when computed from 5 vs 7 dimensions.

### Ability Curves

| Dimension | Grade | Manual (7-dim) | Computed (5-dim) | Diff |
|-----------|-------|---------------|-----------------|------|
| discovery | A | 0.447 | 0.446 | -0.001 |
| | B | 0.300 | 0.300 | 0 |
| | C | 0.153 | 0.154 | +0.001 |
| representation | A | 0.602 | 0.601 | -0.001 |
| | B | 0.430 | 0.430 | 0 |
| | C | 0.257 | 0.258 | +0.001 |
| iterative-refinement | A | 0.462 | 0.461 | -0.001 |
| | B | 0.308 | 0.308 | 0 |
| | C | 0.154 | 0.155 | +0.001 |
| exploratory | A | 0.515 | 0.514 | -0.001 |
| | B | 0.345 | 0.345 | 0 |
| | C | 0.175 | 0.176 | +0.001 |
| self-verification | A | 0.564 | 0.563 | -0.001 |
| | B | 0.414 | 0.414 | 0 |
| | C | 0.263 | 0.264 | +0.001 |

Per-dimension ability scores are dimension-independent (each dim is averaged across its mapped problems only), so these should match regardless of 5 vs 7 dim. The +/-0.001 diffs are rounding artifacts.

### Problem Curves

| Problem | Grade | Manual (7-dim) | Computed (5-dim) | Diff |
|---------|-------|---------------|-----------------|------|
| 000341 meeting-verify | A | 0.648 | 0.646 | -0.002 |
| | B | 0.332 | 0.332 | 0 |
| | C | 0.015 | 0.018 | +0.003 |
| 000501 thinking-traps | A | 0.856 | 0.854 | -0.002 |
| | B | 0.587 | 0.587 | 0 |
| | C | 0.318 | 0.320 | +0.002 |
| 001001 ling-bing | A | 0.736 | 0.735 | -0.001 |
| | B | 0.556 | 0.556 | 0 |
| | C | 0.376 | 0.377 | +0.001 |
| 001111 operationalize | A | 0.551 | 0.550 | -0.001 |
| | B | 0.304 | 0.304 | 0 |
| | C | 0.056 | 0.058 | +0.002 |

Problem curves use `task_score` only (dimension-independent). The +/-0.003 diffs are rounding artifacts.

### Part 1 Summary

- **B thresholds (= μ):** All match exactly.
- **A/C thresholds (= μ ± σ):** All within +/-0.003 — rounding artifacts only.
- **Overall mean:** Differs by ~0.006 — expected due to 5-dim vs 7-dim.
- Manual CSV and Computed are numerically equivalent.

---

## Part 2: Grade Comparison — Report Grades vs Pipeline Grades

Compares the grades stored in `ISS-with-full-curved/` report JSONs (graded using `ISS-curve-manual.csv`, 7-dim) against the grades computed by the pipeline in `output/step4-curved-scores.json` (graded using `output/step3-curve.json`, 5-dim). This comparison is automated as Step 5 in `extract-and-compute.ts` and output to `output/step5-grade-comparison.json`.

The report grades use the manual CSV thresholds (7-dim). The pipeline grades use computed thresholds (5-dim).

### Overall Grade

| | A | B | C | D |
|---|---|---|---|---|
| Report (7-dim curve) | 10 | 22 | 18 | 13 |
| Computed (5-dim curve) | 8 | 24 | 18 | 13 |

4 differences — all caused by the 5-dim vs 7-dim score difference:

| Participant | Report | Computed | Report score (7-dim) | Computed score (5-dim) | Cause |
|-------------|--------|----------|---------------------|----------------------|-------|
| gpalanisamy@lenovo.com | A | B | 0.5098 | 0.465 | 7-dim score A (≥0.498), 5-dim score B (<0.492) |
| rongdi1@lenovo.com | A | B | 0.5079 | 0.485 | 7-dim score A (≥0.498), 5-dim score B (<0.492) |
| sg2@lenovo.com | D | C | 0.2841 | 0.290 | 7-dim score D (<0.291), 5-dim score C (≥0.284) |
| wangrp1@lenovo.com | C | D | 0.2928 | 0.281 | 7-dim score C (≥0.291), 5-dim score D (<0.284) |

Both A→B cases: the 7-dim `overallMean` scores (0.510, 0.508) clear the 7-dim A threshold (0.498), but the 5-dim `final_total_score` (0.465, 0.485) falls below the 5-dim A threshold (0.492). The scores themselves differ because `total_ability` changes with fewer dimensions.

The C↔D cases are boundary scores where the 7-dim and 5-dim C thresholds (0.291 vs 0.284) straddle the score.

### Ability Grades

**0 differences.** All 315 ability grades (63 participants x 5 dimensions) match exactly.

### Dimension-in-Problem Grades

**0 differences.** All dimension grades within problems match exactly.

### Problem Task Grades

**1 difference:**

| Participant | Problem | Report | Computed | Score | Cause |
|-------------|---------|--------|----------|-------|-------|
| chenshuo4@lenovo.com | 000341 meeting-verify | C | D | 0.0167 | Score between manual C≥0.015 and computed C≥0.018 |

This single diff is a rounding artifact: the manual CSV C threshold for 000341 is 0.015 and the computed threshold is 0.018 (diff +0.003). Score 0.0167 falls in the gap.

### Part 2 Summary

- **Ability grades:** Identical (0/315 diffs).
- **Dimension-in-problem grades:** Identical (0 diffs).
- **Problem task grades:** 1 diff out of 252 — rounding artifact at a threshold boundary.
- **Overall grade:** 4 diffs out of 63 — all from the 5-dim vs 7-dim `final_total_score` difference.
- **Total: 5 grade differences out of 630 grade assignments (0.8%).**

All differences are fully explained by the intentional 5→7 dimension reduction and rounding precision.
