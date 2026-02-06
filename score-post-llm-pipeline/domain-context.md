# Domain Context: Test Scoring System

> This document captures the business logic and domain knowledge for how the assessment scoring system works.

## Key Design Decisions

1. **Only scores matter, not reports** - merged report and scores schemas (ip-03.md)
2. **To create a curve, we need multiple scores** - curve is computed from a pool of participants
3. **To apply a curve, we need only one score** - curve is applied to individual participants
4. **Before curve: NO letter grade field** - not even null, the field doesn't exist (ip-03.md)
5. **After curve: letter grades are A/B/C/D only** - no X option (ip-03.md)

### Two Core Output Schemas

| Schema | Description | Has Letter Grades? |
|--------|-------------|-------------------|
| `JSONScores` | Pre-curve scores | No (field doesn't exist) |
| `CurvedScores` | Post-curve scores + letter grades | Yes (A/B/C/D only) |

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TEST EVENT                                     │
│  (e.g., "Group A Assessment - Jan 2024")                                │
│                                                                          │
│  ┌──────────────┐      ┌──────────────────────────────────────────┐     │
│  │  PROBLEMS    │      │            DIMENSIONS                    │     │
│  │  (selected)  │      │  (ability to iterate, verify, etc.)     │     │
│  │              │◄────►│                                          │     │
│  │  • Problem 1 │      │  Many-to-Many relationship               │     │
│  │  • Problem 2 │      │  (injection/surjection)                  │     │
│  │  • Problem 3 │      │                                          │     │
│  └──────────────┘      └──────────────────────────────────────────┘     │
│                                                                          │
│  PARTICIPANTS: ~100 people take the test                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## 1. Test Structure

### 1.1 Problems

Each problem has a two-part identifier:
- **`digit`** — stable 6-digit ID (last digit: `0`=zh, `1`=en). Never changes.
- **`name`** — human-readable slug (e.g., `meeting-verify`). Can be renamed.

Example: `{ digit: "000340", name: "meeting-verify" }`

Problems are selected from a large pool for each test event.

### 1.2 Dimensions

Fixed set of 5 ability dimensions:

| ID | Description |
|----|-------------|
| `Discovery-Self-Understanding` | 发现与自我理解 |
| `Expression-Translation` | 表达与转译 |
| `Exploratory-Discovery` | 探索式发现 |
| `Verification-Confirmation` | 验证与确认 |
| `Iterative-Optimization` | 迭代优化 |

### 1.3 Problem-Dimension Relationship

- **Customizable** many-to-many mapping (ProblemDimensionMap)
- Not all dimensions apply to all problems
- A problem may relate to multiple dimensions
- A dimension may be measured across multiple problems
- This can be an injection or surjection (flexible relationship)

```
Problems                    Dimensions
┌────────────────────┐      ┌──────────────────────────────┐
│ 000340             │─────►│ Discovery-Self-Understanding │
│ meeting-verify     │─────►│ Expression-Translation       │
├────────────────────┤      ├──────────────────────────────┤
│ 000500             │─────►│ Discovery-Self-Understanding │
│ thinking-traps     │─────►│ Verification-Confirmation    │
│                    │─────►│ Iterative-Optimization       │
├────────────────────┤      ├──────────────────────────────┤
│ 001001             │─────►│ (all 5 dimensions)           │
│ ling-bing          │      │                              │
└────────────────────┘      └──────────────────────────────┘
```

## 2. Scoring Structure

### 2.1 Raw Scores (Per Participant)

For each participant, we compute:

#### Problem-Level Scores
```
For each Problem:
  ├── task_score (objective): Score for final submission [0, 1]
  └── dimension_scores: Record<Dimension, Option<ScoreValue>>
        All 5 keys present; untested dims = None (null in JSON)
```

#### Aggregated Scores (derived, not stored)
```
ability_scores[dim]  = arithmetic mean of that dim across mapped problems
total_problem_score  = arithmetic mean of all task_scores
total_ability_score  = arithmetic mean of the 5 ability scores
final_total_score    = geometric mean: √(problem × ability)
```

### 2.2 Score Hierarchy

```
Participant
├── Per-Problem
│   ├── 000340 meeting-verify
│   │   ├── task_score: 0.80
│   │   └── dimension_scores:
│   │       ├── Discovery-Self-Understanding: 0.85
│   │       ├── Expression-Translation: 0.78
│   │       ├── Exploratory-Discovery: 0.72
│   │       ├── Verification-Confirmation: null  ← not tested
│   │       └── Iterative-Optimization: null     ← not tested
│   ├── 000500 thinking-traps
│   │   ├── task_score: 0.75
│   │   └── dimension_scores:
│   │       ├── Discovery-Self-Understanding: 0.90
│   │       ├── Expression-Translation: null
│   │       ├── Exploratory-Discovery: null
│   │       ├── Verification-Confirmation: 0.65
│   │       └── Iterative-Optimization: 0.70
│   └── 001001 ling-bing
│       ├── task_score: 0.82
│       └── dimension_scores:
│           ├── Discovery-Self-Understanding: 0.88
│           ├── Expression-Translation: 0.82
│           ├── Exploratory-Discovery: 0.79
│           ├── Verification-Confirmation: 0.71
│           └── Iterative-Optimization: 0.68
│
├── Ability Scores (derived: mean per dim across problems)
│   ├── Discovery-Self-Understanding: mean(0.85, 0.90, 0.88) = 0.877
│   ├── Expression-Translation: mean(0.78, 0.82) = 0.800
│   ├── Exploratory-Discovery: mean(0.72, 0.79) = 0.755
│   ├── Verification-Confirmation: mean(0.65, 0.71) = 0.680
│   └── Iterative-Optimization: mean(0.70, 0.68) = 0.690
│
├── Totals (derived)
│   ├── total_problem_score: mean(0.80, 0.75, 0.82) = 0.790
│   ├── total_ability_score: mean(0.877, 0.800, 0.755, 0.680, 0.690) = 0.760
│   └── final_total_score: √(0.790 × 0.760) = 0.775 (geometric mean)
```

## 3. Curve Computation

### 3.1 Method: Standard Deviation Based

Curve thresholds are computed using standard deviation from the mean:

```
Grade Boundaries (using mean μ and standard deviation σ):

     A          B          C          D
   ←───────|─────────|─────────|──────────→
         μ+σ       μ        μ-σ

A: score ≥ μ + σ    (1+ standard deviations above mean)
B: μ ≤ score < μ+σ  (above mean, within 1 std dev)
C: μ-σ ≤ score < μ  (below mean, within 1 std dev)
D: score < μ - σ    (1+ standard deviations below mean)
```

### 3.2 What Gets Curved

Curves are computed and applied to:

1. **Each dimension score** → Letter grade per dimension
2. **Each problem score** → Letter grade per problem
3. **Total scores** → Letter grade for overall

### 3.3 Curve Computation Input

```
All participants' raw scores from the same test event:
  - All problem scores (for problem curves)
  - All dimension scores (for dimension curves)
  - All total scores (for overall curve)
```

## 4. Curve Application

### 4.1 Common Case: Self-Application

Most common scenario: compute curve from Group A, apply curve to Group A.

```
Group A (100 people)
    │
    ▼
┌──────────────────┐
│ Compute Curve    │
│ from Group A     │
│ scores           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Apply Curve      │
│ to Group A       │
│ (same people)    │
└──────────────────┘
```

### 4.2 Cross-Application: Different Group

Possible to apply an existing curve to a different group, but **conditions must be met**:

```
Group A Curve ──────► Group B
                      │
                      ▼
              ┌───────────────────────────────────┐
              │ COMPATIBILITY CONDITIONS:          │
              │                                    │
              │ ✓ Similar problems (problem IDs)   │
              │ ✓ Similar dimensions covered       │
              │ ✓ Similar scoring prompts          │
              │ ✓ (Prompt version should match)    │
              └───────────────────────────────────┘
```

**Why these conditions matter:**
- Different problems → different difficulty → curve doesn't fit
- Different dimensions → measuring different things
- Different prompts → scoring criteria changed → scores not comparable

## 5. Summary: Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          COMPLETE FLOW                                   │
└─────────────────────────────────────────────────────────────────────────┘

1. TEST SETUP
   ┌─────────────────────────────────────────────────────────────┐
   │ Event Config: Select problems, define dimension mappings    │
   └─────────────────────────────────────────────────────────────┘
                                │
                                ▼
2. ASSESSMENT (LLM Scoring)
   ┌─────────────────────────────────────────────────────────────┐
   │ For each participant:                                       │
   │   → Score each problem (task_score)                         │
   │   → Score each related dimension per problem                │
   │   → Ability scores + totals are derived (not stored)        │
   │                                                             │
   │ Output: JSONScores (no letter_grades field)                 │
   └─────────────────────────────────────────────────────────────┘
                                │
                                ▼
3. CURVE COMPUTATION
   ┌─────────────────────────────────────────────────────────────┐
   │ Collect all participants' scores                            │
   │   → Compute μ and σ for each score type                     │
   │   → Set thresholds: [μ+σ, μ, μ-σ]                          │
   │                                                             │
   │ Output: Curve (thresholds for problems, dimensions, total)  │
   └─────────────────────────────────────────────────────────────┘
                                │
                                ▼
4. CURVE APPLICATION
   ┌─────────────────────────────────────────────────────────────┐
   │ For each participant (same or compatible group):            │
   │   → Check compatibility (if different group)                │
   │   → Apply thresholds to get letter grades (A/B/C/D)         │
   │                                                             │
   │ Output: CurvedScores (with letter_grades A/B/C/D)           │
   └─────────────────────────────────────────────────────────────┘
```

---

## Schema Alignment Check

Based on this domain context, verify the v3-effect schemas capture:

| Domain Concept | Schema Location (v3-effect) | Status |
|----------------|----------------------------|--------|
| Problem identifier (digit + name) | `ProblemId` struct | ✅ |
| Problem-Dimension mapping | `ProblemDimensionMap` (embedded in JSONScores) | ✅ |
| Problem score (objective) | `ProblemScore.task_score` | ✅ |
| Dimension scores per problem | `ProblemScore.dimension_scores` (Record + Option) | ✅ |
| Aggregated dimension scores | `JSONScores.ability_scores` (derived getter) | ✅ |
| Total problem score | `JSONScores.totals.total_problem_score` (derived getter) | ✅ |
| Total ability score | `JSONScores.totals.total_ability_score` (derived getter) | ✅ |
| Final total (geometric mean) | `JSONScores.totals.final_total_score` (derived getter) | ✅ |
| Prompt version tracking | `JSONScores.prompt_version_hash` | ✅ |
| Pre-curve output (no grades) | `JSONScores` (Schema.Class) | ✅ |
| Post-curve output (A/B/C/D) | `CurvedScores` | ✅ |
| Curve method (std dev) | Not yet ported | ⬜ |
| Compatibility check | Not yet ported | ⬜ |

## Schema Source of Truth

**v3-effect (current):** `v3-effect/schemas.ts` — Effect Schema with Schema.Class, branded types, derived getters.

Previous versions: `v2-zod/schemas.ts` (Zod), `v1-vitest/` (Vitest-based).
