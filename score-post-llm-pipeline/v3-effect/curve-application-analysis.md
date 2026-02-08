# How Curves Are Applied in axiia-website

Source: `packages/test-events/src/curve/apply.ts` and `parser.ts`

## CurveThresholds shape

From `packages/sdk-test-events/src/types.ts:15-19`:

```ts
interface CurveThresholds {
  ability: Record<string, GradeThresholds>   // keyed by dimension name
  problem: Record<string, GradeThresholds>   // keyed by problem name
  overallMean?: GradeThresholds              // single set
}
```

Three buckets. That's it. No `totalAbility` or `totalProblem` — only `overallMean`.

## What the CSV actually contains vs what gets parsed

Example: `packages/web-test/curve/ISS.csv`

```
Grade, overallMean, overallAbilityScore, overallTaskScore, abilitySummaryScores.discovery, ..., problemTaskScores.meeting-verify, ...
A,     0.498,       0.498,               0.599,            0.447,                          ..., 0.648,                            ...
B,     0.394,       0.369,               0.445,            0.3,                            ..., 0.332,                            ...
C,     0.291,       0.239,               0.29,             0.153,                          ..., 0.015,                            ...
```

The CSV has columns `overallAbilityScore` and `overallTaskScore`, but **the parser ignores them**. From `parser.ts:51-67`, only three prefixes are recognized:

```ts
if (header === 'overallMean')                    → curve.overallMean
if (header.startsWith('abilitySummaryScores.'))  → curve.ability[dimension]
if (header.startsWith('problemTaskScores.'))     → curve.problem[problemId]
```

Everything else is silently dropped.

## Which scores get directly curved

Exactly **three types** of scores have thresholds applied via `determineGrade()`:

### 1. Per-dimension ability scores → `curve.ability[dimension]`

`apply.ts:167-188` — `updateDimensionSections`:

```ts
const thresholds = curve.ability[dimensionReport.dimension]
const newGrade = determineGrade(dimensionReport.score, thresholds)
```

Input score: `dimensionReport.score` (the mean of that dimension across all problems).

### 2. Per-problem task scores → `curve.problem[problemId]`

`apply.ts:190-215` — `updateProblemSections`:

```ts
const thresholds = curve.problem[problemReport.problemId]
    ?? curve.problem[normalizedProblemId]
const newGrade = determineGrade(problemReport.score, thresholds)
```

Input score: `problemReport.score` (the task-level score for one problem).

### 3. Overall mean → `curve.overallMean`

`apply.ts:157-165` — `applyOverallGrade`:

```ts
const newGrade = determineGrade(report.overallMean, curve.overallMean)
```

Input score: `report.overallMean` (geometric mean of totalProblem × totalAbility).

## What is NOT directly curved

- **`totalProblem`** (mean of task scores) — no thresholds, no grade assigned. CSV column `overallTaskScore` exists but parser ignores it.
- **`totalAbility`** (mean of ability scores) — same. CSV column `overallAbilityScore` exists but parser ignores it.

These two sub-totals have no independent grade. Only their geometric mean (`overallMean`) gets curved.

## Grades that are derived (not independently curved)

After the three direct curves are applied, **four more passes** re-grade using the **same `curve.ability` thresholds**:

### 4. Per-problem dimension detail grades → `curve.ability[dimension]`

`apply.ts:133-155` — `updateProblemDimensionDetails`:

```ts
const thresholds = dimensionThresholds[detail.dimension]
const newGrade = determineGrade(detail.score, thresholds)
```

Input score: `problemReport.dimensionDetails[].score` (one dimension's score within one problem).
Thresholds: reuses `curve.ability[dimension]` — the same thresholds used for the aggregate dimension score.

### 5. Dimension report → per-problem grades → `curve.ability[dimension]`

`apply.ts:102-131` — `updateDimensionReportProblemGrades`:

Same score and thresholds as #4, but updating the mirror view: `dimensionReport.problems[].grade`.

### 6. Dimension cards ← copied from dimensionReport grades

`apply.ts:62-75` — `updateDimensionCards`: copies the grade from step 1.

### 7. Problem cards ← copied from problemReport grades

`apply.ts:87-100` — `updateProblemCards`: copies the grade from step 2.

## Execution order

From `applyCurveToReport` (`apply.ts:217-233`):

```ts
export function applyCurveToReport(report, curve) {
  updateDimensionSections(report, curve)        // 1. dimension ability grades
  updateProblemSections(report, curve)           // 2. problem task grades
  applyOverallGrade(report, curve)              // 3. overall grade

  const problemDimensionScores = buildProblemDimensionScoreMap(report)

  updateProblemDimensionDetails(report, curve.ability)           // 4. per-problem dim details
  updateDimensionReportProblemGrades(report, curve.ability, ...) // 5. dim report problem grades
}
```

Steps 1–3 are the three direct curves. Steps 4–5 are derived re-grades.
Card updates (6–7) happen inside steps 1 and 2.

## Grade assignment rule

`apply.ts:13-27`:

```ts
function determineGrade(score, thresholds) {
  for (const grade of ['A', 'B', 'C']) {
    if (score >= thresholds[grade]) return grade
  }
  return 'D'
}
```

Checks A first, then B, then C. First match wins. Below C → D.

## Summary

| Score | Threshold source | Directly curved? |
|-------|-----------------|-----------------|
| `dimensionReport.score` | `curve.ability[dim]` | Yes |
| `problemReport.score` | `curve.problem[problemId]` | Yes |
| `report.overallMean` | `curve.overallMean` | Yes |
| `problemReport.dimensionDetails[].score` | `curve.ability[dim]` (reused) | Derived |
| `dimensionReport.problems[].grade` | `curve.ability[dim]` (reused) | Derived |
| `report.taskEvalMean` (totalProblem) | — | **Not curved** |
| `report.abilityMean` (totalAbility) | — | **Not curved** |

The curve has three independent threshold sets. Everything else either reuses `curve.ability` or is a card copy.
