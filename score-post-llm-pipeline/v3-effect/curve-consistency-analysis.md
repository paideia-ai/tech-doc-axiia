# Curve Consistency: Parent Grade from Child Grades

## Problem Statement

Given:
```
A = avg(B, C, D)
```

How to curve A, B, C, D while maintaining consistency? Can we only curve B, C, D and derive A's grade, instead of curving A separately?

## How This Repo Handles the Same Problem

The repo has an analogous hierarchy:

```
final_total_score  = √(total_problem × total_ability)    ← aggregate ("A")
total_problem      = mean(per-problem task_scores)         ← intermediate
total_ability      = mean(per-dimension ability_scores)    ← intermediate
ability_score[dim] = mean(dim scores across problems)      ← leaf
task_score[prob]   = per-problem score                     ← leaf
```

### What gets curved vs. what doesn't

| Score level | Independently curved? | Notes |
|-------------|----------------------|-------|
| Per-problem task_score (leaf) | **Yes** | `curve.problem_curves[digit]` |
| Per-dimension ability_score (leaf) | **Yes** | `curve.ability_curves[dim]` |
| total_problem (intermediate aggregate) | **No** | Parser ignores it; no grade |
| total_ability (intermediate aggregate) | **No** | Parser ignores it; no grade |
| final_total_score (top-level aggregate) | **Yes** | `curve.overall_mean` — independent thresholds |

Key design: **intermediate aggregates are not curved**. Only leaves and the final aggregate get grades. The final aggregate uses its **own independently-computed thresholds** — not derived from child thresholds.

### Why independent thresholds at each level?

The distribution of an average differs from the distribution of its components.

If B, C, D each have μ=0.6, σ=0.2 and are independent:
- Child threshold (std dev method): A-grade ≥ μ+σ = **0.80**
- avg(B,C,D) has σ_avg ≈ σ/√3 ≈ 0.115
- Parent threshold: A-grade ≥ μ+σ_avg = **0.715**

Using child thresholds (0.80) on the parent score (which has lower variance) systematically deflates the parent grade.

### No parent-child consistency enforced

The repo explicitly does **not** enforce that a parent grade matches its children. From `apply-curve.ts`, each grade is independently assigned:

```typescript
// Children: each uses its own threshold set
ability_grades[dim] = assignGrade(abilities[dim], curve.ability_curves[dim]);

// Parent: uses its own independent threshold set
overall_grade = assignGrade(scores.totals.final_total_score, curve.overall_mean);
```

A student can get ability grades of [A, A, B, A, A] but overall grade B — this is valid because the overall score might fall just below the overall A threshold.

## Feasible Approaches

### Approach 1 (Recommended): Curve children + independently curve parent

```
B, C, D  → curve each with its own thresholds → B_grade, C_grade, D_grade
A_score = avg(B, C, D)
A_score  → curve with A's own thresholds      → A_grade
```

- A's thresholds are computed from the distribution of A_score values across the cohort
- Parent and child grades are **independent** — no forced consistency
- Statistically sound: each level's grade distribution matches its score distribution
- **This is what the repo does** (`compute-curve.ts:128-154`)

### Approach 2: Only curve children, skip parent grade

```
B, C, D → curve each → B_grade, C_grade, D_grade
A = avg(B, C, D) → no grade assigned
```

This is how the repo treats `total_problem` and `total_ability` — no grade, just a number. If a parent grade is required, it can optionally be derived from children via majority vote or conservative rule (take the lowest), but this loses score-level precision.

### Approach 3: Derive parent thresholds mathematically

If A = avg(B, C, D) and B, C, D share the same threshold set {tA, tB, tC}:

- A ≥ tA ⟺ avg(B,C,D) ≥ tA

Applying the same thresholds to the parent is mathematically valid but statistically problematic: the parent score's lower variance means grade distributions compress toward the middle (most students get B or C for the parent).

**Not recommended** unless the threshold set is explicitly designed for the parent distribution.

## Summary

| Approach | Curve B,C,D? | Curve A? | Consistency | Statistical soundness |
|----------|-------------|---------|-------------|----------------------|
| 1 (Recommended) | Yes, independently | Yes, independently | Not enforced | High |
| 2 | Yes, independently | No grade | N/A | High |
| 3 | Yes, shared thresholds | Same thresholds | Forced | Low (grade compression) |

**The repo's answer**: Curve children independently, curve the final aggregate independently, don't enforce cross-level consistency. This is the most statistically principled approach.

The key insight: **"only curve B, C, D and compute A" works perfectly** — as long as A's grade threshold is computed from A's own score distribution, not borrowed from the children.

---

## Adding a New Problem: What Happens to the Overall Curve?

### Scenario

```
Old exam:  P1, P2, P3       → curve_v1 covers problem_curves[P1,P2,P3] + overall_mean
New exam:  P1, P2, P3, P4   → P1,P2,P3 curves still valid, P4 has no curve
```

Per-problem curves for P1, P2, P3 are still valid — each problem's score distribution hasn't changed. But `overall_mean` was computed from `avg(P1,P2,P3)`. Now total is `avg(P1,P2,P3,P4)` — different distribution, old threshold is invalid.

### Solution: Lock the overall score's scope to the curve's coverage

The overall score should be computed from **only the problems the curve covers**, not all problems in the exam.

```
New exam: P1, P2, P3, P4
                │
                ▼
        Apply old curve_v1
                │
        ┌───────┴───────┐
        │               │
  P1,P2,P3: has curve  P4: no curve
  → grade each ✓       → grade = null
        │
        ▼
  A_score = avg(P1, P2, P3)     ← only graded subset
  Apply old overall_mean threshold
  → A_grade ✓   (scope matches: threshold was computed from same 3-problem avg)
```

This is the approach proposed in `partial-application-scenarios.md:171-175`:

> With partial application, [aggregates] should be computed from the **graded subset** only (problems that had curve entries). Same formulas, narrower input.

### Why this is valid

The old `overall_mean` threshold was computed from the distribution of `avg(P1,P2,P3)` values across the cohort. As long as we still compute the overall score as `avg(P1,P2,P3)` at apply time, the threshold and score are **semantically matched** — they correspond to the same scope of aggregation.

P4 simply doesn't participate in the overall grade yet. It has a raw score but no grade.

### CurvedScores must record scope

The result needs to explicitly declare which problems the overall grade is based on:

```typescript
{
  overall_grade: "B",
  overall_scope: ["P1", "P2", "P3"],    // overall grade based on these
  skipped_problems: ["P4"],              // not covered by curve
  problem_grades: {
    P1: { task_grade: "A", ... },
    P2: { task_grade: "B", ... },
    P3: { task_grade: "C", ... },
    P4: { task_grade: null, ... },       // no curve → no grade
  }
}
```

### Lifecycle: from old curve to new curve

```
Phase 1: Old exam [P1,P2,P3]
  → Accumulate data → compute curve_v1 (P1,P2,P3 + overall_mean)
  → Apply curve_v1 → all problems graded, overall normal

Phase 2: New exam adds P4 [P1,P2,P3,P4], not enough P4 data yet
  → Apply curve_v1 (partial):
    P1,P2,P3 → graded ✓
    P4       → null
    overall  → avg(P1,P2,P3) with old threshold ✓ (scope matches)

Phase 3: Enough P4 data accumulated
  → Option A: Compute curve_v2 covering all [P1,P2,P3,P4]
    overall_mean recomputed from avg(P1,P2,P3,P4) distribution
    → Full apply, all graded, overall based on 4 problems

  → Option B: Only add P4's problem_curve, keep overall scoped to P1-P3
    Suitable when P4 is supplementary and shouldn't affect overall grade
```

### Connection to the intersection pool model

This scenario is exactly what the `future-todos.md` intersection model (v2) is designed for:

```
Event A (old exam): [P1, P2, P3]
Event B (new exam): [P1, P2, P3, P4]
                      ─────────
Intersection:         [P1, P2, P3]  ← curve only covers these
```

When both events' data is pooled:
- v1 (strict): rejects — problem sets differ
- v2 (intersection): accepts — uses overlap [P1,P2,P3] for curve computation

The intersection-produced curve naturally covers only P1-P3. Applying it is inherently partial. The two features are designed as a unit:

```
Pool (intersection) → Curve (subset) → applyCurve (partial) → CurvedScores (P4=null, overall scoped)
```
