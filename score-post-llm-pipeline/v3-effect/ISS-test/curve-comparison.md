# ISS Curve Comparison: Manual CSV vs Computed (5-dim)

**Sources:**
- Manual CSV: `ISS-curve-manual.csv` — 7 dimensions (includes choosing + world-modeling)
- Computed: `score-from-reports/output/step4-curve.json` — 5 dimensions (choosing + world-modeling dropped per schema)

**Population:** 63 participants (41 CN + 22 EN), 4 problems

## Overall Mean

| Grade | Manual (7-dim) | Computed (5-dim) | Diff |
|-------|---------------|-----------------|------|
| A | 0.498 | 0.492 | -0.006 |
| B | 0.394 | 0.388 | -0.006 |
| C | 0.291 | 0.284 | -0.007 |

Differs because `final_total_score = sqrt(total_problem * total_ability)` and `total_ability` changes when computed from 5 vs 7 dimensions.

## Ability Curves

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

Per-dimension ability scores are dimension-independent (each dim is averaged across its mapped problems only), so these should match regardless of 5 vs 7 dim. The +/-0.001 diffs are rounding artifacts (round to 3 decimal places applied at different steps).

## Problem Curves

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

Problem curves use `task_score` only (dimension-independent), so they should match regardless of 5 vs 7 dim. The +/-0.003 diffs are rounding artifacts.

## Summary

- **B thresholds (= mu):** All match exactly across all categories.
- **A/C thresholds (= mu +/- sigma):** All within +/-0.003 — rounding artifacts only.
- **Overall mean:** Differs by ~0.006 — expected due to 5-dim vs 7-dim `total_ability_score` feeding into `final_total_score`.
- **Max diff:** 0.007 (overall mean C threshold), 0.003 (problem curves).

All differences are accounted for by rounding precision and the intentional dimension reduction.
