# Partial Curve Application — Scenario Analysis

When applying a Curve to JSONScores, the current implementation requires full structural match. This document catalogs every mismatch scenario, whether it mechanically breaks, and where partial application is meaningful. Reference for future relaxation of `checkCompatibility` and `applyCurve`.

## How grading works mechanically

The `applyCurve` grading code does three lookups:

```typescript
// Per-problem: lookup threshold by digit
const t = curve.problem_curves[digit];           // line 240
const task_grade = assignGrade(ps.task_score, t); // line 241

// Per-dimension: lookup threshold by dimension name
dimension_grades[dim] = assignGrade(opt.value, curve.ability_curves[dim]); // line 247

// Overall: single threshold
const overall_grade = assignGrade(scores.totals.final_total_score, curve.overall_mean); // line 268
```

Key observations:
- `problem_curves[digit]` can be **undefined** if the curve doesn't cover that problem → **crashes** (`undefined.A`)
- `ability_curves[dim]` always has all 5 dimensions (schema: `Record<Dimension, GradeThresholds>`) → **never crashes**
- Untested dimensions are already `None` and skipped (`Option.isSome` check) → **already partial**
- The grading code **never consults the dimmap** — it uses `problem_curves` and `ability_curves` keys directly

## Scenario catalog

### S1: Curve ⊇ Scores (superset — curve has extra problems)

```
Curve:  [P1, P2, P3, P4, P5]
Scores: [P1, P2, P3]
```

| Aspect | Value |
|--------|-------|
| Current status | `compatible` (advisory: `extra_curve_problems`) |
| Crashes? | No — only score problems are iterated |
| Already works? | Yes |

The normal case. Curve was computed from a pool with more problems than this student attempted. Extra curve entries are simply unused.

### S2: Curve ⊂ Scores (subset — curve missing some score problems)

```
Curve:  [P1, P2, P3]
Scores: [P1, P2, P3, P4, P5]
```

| Aspect | Value |
|--------|-------|
| Current status | `incompatible` (structural: `problem_coverage` fails for P4, P5) |
| Crashes? | Yes — `curve.problem_curves[P4]` is `undefined` |
| Partial meaningful? | **Yes** — grade P1–P3 normally, leave P4–P5 ungraded |

Use case: student attempted problems the curve doesn't cover (e.g., optional problems, or curve computed from a narrower pool).

### S3: Partial overlap (different problem sets with intersection)

```
Curve:  [P1, P2, P3]
Scores: [P2, P3, P4]
Overlap: [P2, P3]
```

| Aspect | Value |
|--------|-------|
| Current status | `incompatible` (structural: `problem_coverage` fails for P4) |
| Crashes? | Yes — same as S2 |
| Partial meaningful? | **Yes** — grade P2–P3 (the overlap), leave P4 ungraded |

Mechanically identical to S2. The fix is the same: skip problems without curve entries.

### S4: Dimmap mismatch — score has extra dimensions for a problem

```
Curve dimmap:  P1 → [D1, D2]
Score dimmap:  P1 → [D1, D2, D3]
```

| Aspect | Value |
|--------|-------|
| Current status | `incompatible` (structural: `dimmap_structural`) |
| Crashes? | **No** — `ability_curves` has all 5 dimensions, grading works fine |
| Partial meaningful? | **Yes** — all dimensions with scores get graded. The dimmap discrepancy is metadata-only; the grading code doesn't consult it. |

The dimmap says "P1 should test [D1, D2]" but the score also has D3. Since `ability_curves` has thresholds for all 5 dimensions, D3 gets graded too. The `dimmap_structural` check catches a metadata inconsistency, not a mechanical one.

### S5: Dimmap mismatch — curve has extra dimensions for a problem

```
Curve dimmap:  P1 → [D1, D2, D3]
Score dimmap:  P1 → [D1, D2]
```

| Aspect | Value |
|--------|-------|
| Current status | `incompatible` (structural: `dimmap_structural`) |
| Crashes? | **No** — D3 is `None` in the score, skipped by `Option.isSome` check |
| Partial meaningful? | **Yes** — already handled by the Option pattern. D3 stays null in grades. |

### S6: Prompt version mismatch

```
Curve prompt:  abc1234
Score prompt:  def5678
```

| Aspect | Value |
|--------|-------|
| Current status | `requires_override` (provenance) |
| Crashes? | No |
| Partial meaningful? | Risky — different prompt means different rubric. But sometimes necessary (minor prompt tweak between events). Override mechanism already exists. |

### S7: Score event not in curve's source events

```
Curve source_event_ids: [event-A, event-B]
Score event_id: event-C
```

| Aspect | Value |
|--------|-------|
| Current status | `requires_override` (provenance) |
| Crashes? | No |
| Partial meaningful? | **Yes** — applying last semester's curve to this semester's early submissions before enough data for a new curve. Common in practice. |

### S8: DimMap ID mismatch, structure matches

```
Curve dimmap map_id:  aaa-bbb
Score dimmap map_id:  ccc-ddd
(but entries are structurally identical)
```

| Aspect | Value |
|--------|-------|
| Current status | `requires_override` (provenance) |
| Crashes? | No |
| Partial meaningful? | **Yes** — same structure, different provenance. Independently created maps that happen to be identical. Fine. |

## Summary matrix

| Scenario | Crashes? | Current tier | Partial meaningful? | Fix complexity |
|----------|----------|-------------|--------------------:|----------------|
| S1: curve superset | No | advisory | Already works | — |
| S2: curve subset | **Yes** | structural | Yes | Low — skip missing problems |
| S3: partial overlap | **Yes** | structural | Yes | Low — same as S2 |
| S4: score extra dims | No | structural | Yes | Low — just relax the check |
| S5: curve extra dims | No | structural | Yes | Already works (Option) |
| S6: prompt mismatch | No | provenance | Risky | — (override exists) |
| S7: event not in source | No | provenance | Yes | — (override exists) |
| S8: dimmap ID mismatch | No | provenance | Yes | — (override exists) |

## What changes for partial application

### The grading loop (S2/S3 fix)

```typescript
// Current: crashes if curve doesn't have the problem
const t = curve.problem_curves[digit];
const task_grade = assignGrade(ps.task_score, t);

// Partial: skip problems without curve entries
const t = curve.problem_curves[digit];
if (!t) return { ...ps, task_grade: null, dimension_grades: all_null };
const task_grade = assignGrade(ps.task_score, t);
```

### Aggregates from graded subset only

`ability_scores`, `total_problem_score`, `final_total_score` — currently computed from ALL problems. With partial application, they should be computed from the **graded subset** only (problems that had curve entries). Same formulas, narrower input.

Open question: should `overall_grade` reflect only the graded subset, or should it be withheld if too few problems were graded?

### CurvedScores schema impact

Currently `task_grade: LetterGrade` (always present). Partial application needs one of:

1. **Make grades nullable**: `task_grade: OptionFromNullOr(LetterGrade)` — ungraded problems have null
2. **Only include graded problems**: `problem_grades` contains only problems that were curved, plus a `skipped_problems` field listing what was left out
3. **Separate field**: `graded_problem_ids: ProblemDigitId[]` declaring which problems were curved

Option 1 is simplest and mirrors the existing `dimension_grades` pattern (already nullable for untested dimensions).

### Dimmap checks (S4/S5 relaxation)

S4 and S5 don't need code changes — the grading logic already works. The change is purely in `checkCompatibility`: move `dimmap_structural` from structural to provenance (or advisory), since it doesn't reflect a mechanical constraint.

## Connection to ScorePool intersection model

The ScorePool v2 (intersection-based) design produces curves that only cover the overlapping problems. Applying such a curve to scores is exactly scenario S2/S3 — curve covers a subset, rest is ungraded. So partial application is a prerequisite for the intersection pool model.

```
Pool (intersection) → Curve (subset of problems) → applyCurve (partial) → CurvedScores (some grades null)
```

The two features are designed to be implemented together.
