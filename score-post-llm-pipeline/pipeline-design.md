# Score Post-LLM Pipeline Design

## Key Design Decisions (from ip-02.md)

1. **A report that has not been curved does not have letter grades** - `letter_grades` must be `null` for uncurved reports
2. **To create a curve, we need multiple scores** - curve is computed from a pool of participants
3. **To apply a curve, we need only one score** - curve is applied to individual participants
4. **Start from report-scores, not full report** - the full report has comments, pros/cons, etc. We extract just the scores first

### Two Core Schemas

| Schema | Description | Has Letter Grades? |
|--------|-------------|-------------------|
| `JSONScores` | Non-curved extracted scores | No |
| `CurvedReport` | Scores + letter grades | Yes |

## Pipeline Overview

```mermaid
flowchart TD
    subgraph Inputs["Input Sources"]
        LM["Language Model"]
        EventData["Event Data<br/>(people selection)"]
        ProblemSchema["Problem Schema<br/>(题目 schema)"]
    end

    subgraph LLM_Stage["LLM Generation Stage"]
        LM --> |"generates"| FullReport["Full Report<br/>(comments, pros/cons, scores)"]
    end

    subgraph Extraction["Score Extraction"]
        FullReport --> |"extract scores only"| JSONScores["JSON Scores<br/>(non-curved)"]
    end

    subgraph CurveGeneration["Curve Generation"]
        EventData --> |"select people"| ScorePool["Score Pool<br/>(multiple JSONScores)"]
        ProblemSchema --> |"select problems"| ScorePool
        ScorePool --> |"compute std dev"| Curve["Curve<br/>(thresholds for 3 totals)"]
    end

    subgraph CurveApplication["Curve Application"]
        JSONScores --> |"single score"| ApplyCurve{"Apply Curve<br/>(compatibility check)"}
        Curve --> |"thresholds"| ApplyCurve
        ApplyCurve --> |"generate"| CurvedLetterGrades["Letter Grades<br/>(3 total grades)"]
    end

    subgraph FinalOutput["Final Output"]
        CurvedLetterGrades --> |"merge"| MergeReport{"Merge"}
        JSONScores --> |"scores"| MergeReport
        MergeReport --> |"output"| CurvedReport["Curved Report<br/>(scores + letter grades)"]
    end

    style JSONScores fill:#fff3e0
    style Curve fill:#f3e5f5
    style CurvedLetterGrades fill:#e8f5e9
    style CurvedReport fill:#ffebee
```

## Data Schema Definitions

### 1. JSON Scores Schema (Non-curved - Pipeline Input)

The pipeline starts from extracted scores, not the full report. This keeps the pipeline focused on scoring logic.

```mermaid
classDiagram
    class JSONScores {
        +uuid source_report_id
        +string event_id
        +string participant_id
        +TotalScores totals
        +AbilityScore[] ability_scores
        +ProblemScore[] problem_scores
    }

    class TotalScores {
        +float total_problem_score
        +float total_ability_score
        +float final_total_score
    }

    class AbilityScore {
        +string dimension_id
        +float score
    }

    class ProblemScore {
        +string problem_id
        +float objective_score
        +AbilityScore[] dimension_scores
    }

    JSONScores --> TotalScores
    JSONScores --> AbilityScore
    JSONScores --> ProblemScore
```

**Key Fields:**
- `totals.total_problem_score`: Average of all problem objective scores
- `totals.total_ability_score`: Average of all dimension scores
- `totals.final_total_score`: Geometric mean √(total_problem × total_ability)

### 2. Score Pool Schema (Curve Computation Input)

```mermaid
classDiagram
    class ScorePool {
        +string event_id
        +string prompt_version_hash
        +string[] problem_ids
        +string[] dimension_ids
        +JSONScores[] scores
    }

    ScorePool --> JSONScores : contains many
```

**Requirement:** Need multiple participants' scores to compute a meaningful curve.

### 3. Curve Schema

```mermaid
classDiagram
    class Curve {
        +uuid curve_id
        +string source_event_id
        +string prompt_version_hash
        +string[] problem_ids
        +string[] dimension_ids
        +CurveMethod method
        +int sample_size
        +datetime computed_at
        +TotalCurves totals
        +AbilityCurve[] ability_curves
        +ProblemCurve[] problem_curves
    }

    class TotalCurves {
        +ThresholdDef total_problem
        +ThresholdDef total_ability
        +ThresholdDef final_total
    }

    class CurveMethod {
        +string type
        +number[] sigma_boundaries
    }

    class ThresholdDef {
        +float[] thresholds
        +string[] grades
    }

    Curve --> TotalCurves
    Curve --> CurveMethod
```

**Curve Method:** Standard deviation based
- A: score ≥ μ + σ
- B: score ≥ μ
- C: score ≥ μ - σ
- D: score < μ - σ

### 4. Curved Letter Grades Schema

```mermaid
classDiagram
    class CurvedLetterGrades {
        +uuid source_scores_id
        +uuid curve_id
        +datetime computed_at
        +TotalGrades total_grades
        +AbilityGrade[] ability_grades
        +ProblemGrade[] problem_grades
    }

    class TotalGrades {
        +string total_problem_grade
        +string total_ability_grade
        +string final_total_grade
    }

    class AbilityGrade {
        +string dimension_id
        +string grade
    }

    class ProblemGrade {
        +string problem_id
        +string grade
    }

    CurvedLetterGrades --> TotalGrades
    CurvedLetterGrades --> AbilityGrade
    CurvedLetterGrades --> ProblemGrade
```

### 5. Curved Report Schema (Final Output)

```mermaid
classDiagram
    class CurvedReport {
        +uuid curved_report_id
        +uuid source_report_id
        +string event_id
        +string prompt_version_hash
        +uuid applied_curve_id
        +datetime curved_at
        +string participant_id
        +Problem[] problems
        +AbilityDimension[] abilities
        +TotalScores totals
        +LetterGradesInReport letter_grades
    }

    class LetterGradesInReport {
        +TotalLetterGrades totals
        +map~string,string~ abilities
        +map~string,string~ problems
    }

    class TotalLetterGrades {
        +string total_problem
        +string total_ability
        +string final_total
    }

    CurvedReport --> LetterGradesInReport
```

**Key Addition:**
- `applied_curve_id`: Records which curve was applied (traceability)
- `letter_grades.totals`: Three letter grades for the three total scores

## Compatibility Rules (兼容性规则)

```mermaid
flowchart TD
    subgraph CompatibilityCheck["Compatibility Check"]
        Start["Check Compatibility"] --> PID["Problem IDs Match?"]
        PID -->|"Yes"| DIM["Dimension IDs Match?"]
        PID -->|"No"| FAIL["❌ Incompatible"]
        DIM -->|"Yes"| VER["Prompt Version Match?"]
        DIM -->|"No"| FAIL
        VER -->|"Yes"| PASS["✅ Compatible"]
        VER -->|"No"| WARN["⚠️ Manual Override Required"]
    end
```

### Compatibility Conditions

| Condition | Requirement | Notes |
|-----------|-------------|-------|
| Problem IDs | Must match | Language suffix (0/1) may differ |
| Dimension IDs | Must match | Same ability dimensions |
| Prompt Version | Should match | Different versions require manual override |
| Event ID | Can differ | Curve can apply to different events |

### Problem ID Structure

```
Problem ID: XXXXXX (exactly 6 digits)
            │    │
            │    └─ Language: 0=EN, 1=ZH
            └────── Base ID: Problem identifier (5 digits)
```

**Example:** `003401` → Problem 00340, Chinese version

## Design Principles (设计原则)

1. **No In-Place Modification (不进行原地修改)**
   - Original data and processed data stored separately
   - Modified data is a new entity, never overwrites original

2. **Start from Scores, Not Full Reports**
   - Full reports contain comments, pros/cons, etc.
   - Pipeline only needs scores for curving
   - Separation of concerns

3. **Explicit Metadata (显式元数据)**
   - All critical info recorded explicitly
   - Schema-defined, not convention-based

4. **JSON over CSV (JSON 优于 CSV)**
   - JSON supports hierarchical structure
   - Stricter validation

5. **Validation at Every Step (每步都校验)**
   - Each transformation requires validation
   - Ensures data correctness

6. **Traceability (可追溯性)**
   - Any Curved Report traces back to its Curve
   - Any Curve traces back to source Event and Prompt version

## The 5 Ability Dimensions

| Dimension ID | Chinese Name | Description |
|--------------|--------------|-------------|
| `discovery` | 发现与自我理解 | Discovery and self-understanding |
| `representation` | 表达与转译 | Expression and translation |
| `iterative-refinement` | 迭代与反馈 | Iteration and feedback |
| `exploratory` | 探索式发现 | Exploratory discovery |
| `self-verification` | 验证 | Verification |

## Schema Location

**Single source of truth:** `scripts/schemas.ts`

All Zod schemas are defined in this file. Other files import from here.
