# ISS Curve Comparison

Three-way comparison of curve thresholds computed from the same 63 participants:

| Source | Input | Script |
|--------|-------|--------|
| **score-from-reports** | Raw report JSONs (CN/ + EN/) | `score-from-reports/extract-and-compute.ts` |
| **score-from-csv** | Summary CSV (`ISS-socres.csv`) | `score-from-csv/extract-and-compute.ts` |
| **ISS-curve-manual** | Previously computed by hand | `ISS-curve-manual.csv` |

Method: standard deviation, sigma boundaries `[1, 0, -1]` — A ≥ μ+σ, B ≥ μ, C ≥ μ−σ, D < μ−σ.

Sample size: 63 (all three sources).

---

## Overall Mean (final_total_score = √(total_problem × total_ability))

| Grade | from-reports | from-csv | manual |
|-------|-------------|----------|--------|
| A ≥ | 0.497 | 0.497 | 0.498 |
| B ≥ | 0.394 | 0.394 | 0.394 |
| C ≥ | 0.292 | 0.292 | 0.291 |

Population: μ = 0.394, σ = 0.103

---

## Ability Curves (per-dimension, from ability_scores = mean of non-null dim values across problems)

| Dimension | Grade | from-reports | from-csv | manual |
|-----------|-------|-------------|----------|--------|
| choosing | A ≥ | 0.609 | 0.609 | 0.610 |
| | B ≥ | 0.449 | 0.449 | 0.449 |
| | C ≥ | 0.290 | 0.290 | 0.289 |
| discovery | A ≥ | 0.446 | 0.446 | 0.447 |
| | B ≥ | 0.300 | 0.300 | 0.300 |
| | C ≥ | 0.154 | 0.154 | 0.153 |
| exploratory | A ≥ | 0.514 | 0.514 | 0.515 |
| | B ≥ | 0.345 | 0.345 | 0.345 |
| | C ≥ | 0.176 | 0.176 | 0.175 |
| iterative-refinement | A ≥ | 0.461 | 0.461 | 0.462 |
| | B ≥ | 0.308 | 0.308 | 0.308 |
| | C ≥ | 0.155 | 0.155 | 0.154 |
| representation | A ≥ | 0.601 | 0.601 | 0.602 |
| | B ≥ | 0.430 | 0.430 | 0.430 |
| | C ≥ | 0.258 | 0.258 | 0.257 |
| self-verification | A ≥ | 0.563 | 0.563 | 0.564 |
| | B ≥ | 0.414 | 0.414 | 0.414 |
| | C ≥ | 0.264 | 0.264 | 0.263 |
| world-modeling | A ≥ | 0.480 | 0.480 | 0.481 |
| | B ≥ | 0.334 | 0.334 | 0.334 |
| | C ≥ | 0.189 | 0.189 | 0.188 |

---

## Problem Curves (per-problem task_score)

| Problem | Grade | from-reports | from-csv | manual |
|---------|-------|-------------|----------|--------|
| 000341 meeting-verify | A ≥ | 0.646 | 0.646 | 0.648 |
| | B ≥ | 0.332 | 0.332 | 0.332 |
| | C ≥ | 0.018 | 0.018 | 0.015 |
| 000501 thinking-traps | A ≥ | 0.854 | 0.854 | 0.856 |
| | B ≥ | 0.587 | 0.587 | 0.587 |
| | C ≥ | 0.320 | 0.320 | 0.318 |
| 001001 ling-bing | A ≥ | 0.735 | 0.735 | 0.736 |
| | B ≥ | 0.556 | 0.556 | 0.556 |
| | C ≥ | 0.377 | 0.377 | 0.376 |
| 001111 operationalize | A ≥ | 0.550 | 0.550 | 0.551 |
| | B ≥ | 0.304 | 0.304 | 0.304 |
| | C ≥ | 0.058 | 0.058 | 0.056 |

---

## Observations

1. **from-reports and from-csv are identical.** Both computation paths — extracting from raw report JSONs vs parsing the summary CSV — produce exactly the same curve thresholds. This confirms the CSV was correctly exported from the same underlying data.

2. **Manual curve differs by at most 0.003.** All differences between the computed results and the manual CSV are ≤ 0.003 (i.e., within the last digit of 3-decimal rounding). This is consistent with the manual curve being computed with the same μ±σ formula but rounded slightly differently (e.g., rounding before vs after clamping, or using a different intermediate precision).

3. **The two columns not used by the production parser** — `overallAbilityScore` and `overallTaskScore` in the manual CSV — have thresholds that don't appear in either computed curve. As documented in [curve-application-analysis.md](../curve-application-analysis.md), the production system only grades three categories directly: `overallMean`, `ability[dim]`, and `problem[id]`. The sub-totals have no independent curve.

---

## Population Statistics

| Category | μ | σ | n |
|----------|------|------|-----|
| overall (final_total_score) | 0.394 | 0.103 | 63 |
| choosing | 0.449 | 0.160 | 63 |
| discovery | 0.300 | 0.146 | 63 |
| exploratory | 0.345 | 0.169 | 63 |
| iterative-refinement | 0.308 | 0.153 | 63 |
| representation | 0.430 | 0.171 | 63 |
| self-verification | 0.414 | 0.149 | 63 |
| world-modeling | 0.334 | 0.146 | 63 |
| problem 000341 meeting-verify | 0.332 | 0.314 | 63 |
| problem 000501 thinking-traps | 0.587 | 0.267 | 63 |
| problem 001001 ling-bing | 0.556 | 0.179 | 63 |
| problem 001111 operationalize | 0.304 | 0.246 | 63 |
