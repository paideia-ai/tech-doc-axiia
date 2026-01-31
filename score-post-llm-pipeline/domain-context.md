# Domain Context: Test Scoring System

> This document captures the business logic and domain knowledge for how the assessment scoring system works.

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

### 1.1 Problems and Dimensions

- **Problems**: Selected from a large pool for each test event
  - Each problem has a unique `problem_id`
  - Problems are the actual tasks/challenges participants complete

- **Dimensions**: Fixed set of 5 ability dimensions
  - `discovery` - 发现与自我理解
  - `representation` - 表达与转译
  - `iterative-refinement` - 迭代与反馈
  - `exploratory` - 探索式发现
  - `self-verification` - 验证

- **Problem-Dimension Relationship**:
  - **Customizable** many-to-many mapping
  - Not all dimensions apply to all problems
  - A problem may relate to multiple dimensions
  - A dimension may be measured across multiple problems
  - This can be an injection or surjection (flexible relationship)

```
Problems          Dimensions
┌─────────┐       ┌─────────────────────────┐
│ Prob 1  │──────►│ discovery               │
│         │──────►│ representation          │
├─────────┤       ├─────────────────────────┤
│ Prob 2  │──────►│ iterative-refinement    │
│         │──────►│ exploratory             │
├─────────┤       ├─────────────────────────┤
│ Prob 3  │──────►│ exploratory             │
│         │──────►│ self-verification       │
│         │──────►│ representation          │
└─────────┘       └─────────────────────────┘
```

## 2. Scoring Structure

### 2.1 Raw Scores (Per Participant)

For each participant, we compute:

#### Problem-Level Scores
```
For each Problem:
  ├── Problem Score (objective): Score for final submission
  └── Ability Scores (per related dimension only):
        ├── Dimension A score (if Problem relates to Dim A)
        ├── Dimension B score (if Problem relates to Dim B)
        └── ... (only related dimensions)
```

#### Aggregated Scores
```
Total Problem Score = Average of all Problem Scores
Total Ability Score = Average of all Dimension Scores (across all problems)
Final Total Score   = Geometric Mean(Total Problem Score, Total Ability Score)
```

### 2.2 Score Hierarchy

```
Participant
├── Per-Problem
│   ├── Problem 1
│   │   ├── problem_score: 0.75 (objective score)
│   │   └── dimension_scores:
│   │       ├── verification: 0.80
│   │       └── critical_thinking: 0.70
│   ├── Problem 2
│   │   ├── problem_score: 0.65
│   │   └── dimension_scores:
│   │       ├── verification: 0.60
│   │       └── communication: 0.70
│   └── Problem 3
│       ├── problem_score: 0.85
│       └── dimension_scores:
│           ├── critical_thinking: 0.90
│           ├── communication: 0.80
│           └── collaboration: 0.85
│
├── Per-Dimension (aggregated across problems)
│   ├── verification: avg(0.80, 0.60) = 0.70
│   ├── critical_thinking: avg(0.70, 0.90) = 0.80
│   ├── communication: avg(0.70, 0.80) = 0.75
│   └── collaboration: 0.85 (only one problem)
│
├── Totals
│   ├── total_problem_score: avg(0.75, 0.65, 0.85) = 0.75
│   ├── total_ability_score: avg(0.70, 0.80, 0.75, 0.85) = 0.775
│   └── final_total_score: √(0.75 × 0.775) = 0.762 (geometric mean)
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
   │   → Score each problem (objective score)                    │
   │   → Score each related dimension per problem                │
   │   → Aggregate to dimension totals                           │
   │   → Compute total_problem_score, total_ability_score        │
   │   → Compute final_total_score (geometric mean)              │
   │                                                             │
   │ Output: ReportJSON (with letter_grades = null)              │
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
   │   → Apply thresholds to get letter grades                   │
   │                                                             │
   │ Output: CurvedReport (with letter_grades populated)         │
   └─────────────────────────────────────────────────────────────┘
```

---

## Schema Alignment Check

Based on this domain context, verify the schemas capture:

| Domain Concept | Schema Location | Status |
|----------------|-----------------|--------|
| Problem-Dimension mapping | `DimensionDependencyConfig` | ✅ |
| Problem score (objective) | `Problem.objective_score` | ✅ |
| Dimension scores per problem | `Problem.dimension_scores` | ✅ |
| Aggregated dimension scores | `abilities[]` | ✅ |
| Total problem score | `totals.total_problem_score` | ✅ |
| Total ability score | `totals.total_ability_score` | ✅ |
| Final total (geometric mean) | `totals.final_total_score` | ✅ |
| Curve method (std dev) | `CurveMethod.standard_deviation` | ✅ |
| Compatibility check | `CompatibilityResult` | ✅ |
| Prompt version tracking | `prompt_version_hash` | ✅ |

All schemas are now aligned with the domain model.
