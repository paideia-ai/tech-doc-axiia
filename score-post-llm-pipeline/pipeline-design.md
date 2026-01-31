# Score Post-LLM Pipeline Design

## Pipeline Overview

```mermaid
flowchart TD
    subgraph Inputs["Input Sources"]
        LM["Language Model"]
        EventData["Event Data<br/>(people selection)"]
        ProblemSchema["Problem Schema<br/>(题目 schema)"]
    end

    subgraph LLM_Stage["LLM Generation Stage"]
        LM --> |"generates"| ReportJSON["Report JSON<br/>(no letter grades)"]
    end

    subgraph Extraction["Score Extraction"]
        ReportJSON --> |"extract"| JSONScores["JSON Scores<br/>(extracted scores)"]
    end

    subgraph CurveGeneration["Curve Generation"]
        EventData --> |"select people"| ScorePool["Score Pool"]
        ProblemSchema --> |"select problems"| ScorePool
        ScorePool --> |"compute"| Curve["Curve<br/>(curve thresholds)"]
    end

    subgraph CurveApplication["Curve Application"]
        JSONScores --> |"input"| ApplyCurve{"Apply Curve<br/>(compatibility check)"}
        Curve --> |"input"| ApplyCurve
        ApplyCurve --> |"generate"| CurvedLetterGrades["Curved Letter Grades"]
    end

    subgraph FinalOutput["Final Output"]
        CurvedLetterGrades --> |"merge"| MergeReport{"Merge<br/>(schema match)"}
        ReportJSON --> |"input"| MergeReport
        MergeReport --> |"output"| CurvedReport["Curved Report<br/>(with letter grades)"]
    end

    style ReportJSON fill:#e1f5fe
    style JSONScores fill:#fff3e0
    style Curve fill:#f3e5f5
    style CurvedLetterGrades fill:#e8f5e9
    style CurvedReport fill:#ffebee
```

## Data Schema Definitions

### 1. Report JSON Schema (原始报告 - 无 letter grades)

```mermaid
classDiagram
    class ReportJSON {
        +string event_id
        +string prompt_version_hash
        +Problem[] problems
        +AbilityDimension[] abilities
        +null|"X" letter_grades
    }

    class Problem {
        +string problem_id
        +float[] dimension_scores
        +string objective_score
    }

    class AbilityDimension {
        +string dimension_id
        +float score
    }

    ReportJSON --> Problem
    ReportJSON --> AbilityDimension
```

**Key Fields:**
- `event_id`: 事件标识符
- `prompt_version_hash`: Git commit hash (运行时的 prompt 版本)
- `problems`: 每道题目的分数
- `abilities`: 每个能力维度的分数
- `letter_grades`: 默认为 `null` 或 `"X"`，表示未 curve

### 2. JSON Scores Schema (提取的分数)

```mermaid
classDiagram
    class JSONScores {
        +string source_report_id
        +string event_id
        +float overall_score
        +AbilityScore[] ability_scores
        +ProblemScore[] problem_scores
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

    JSONScores --> AbilityScore
    JSONScores --> ProblemScore
```

### 3. Curve Schema

```mermaid
classDiagram
    class Curve {
        +string curve_id
        +string source_event_id
        +string prompt_version_hash
        +string[] problem_ids
        +string[] dimension_ids
        +CurveMethod method
        +OverallCurve overall
        +AbilityCurve[] ability_curves
        +ProblemCurve[] problem_curves
    }

    class CurveMethod {
        +string type
        +object parameters
    }

    class OverallCurve {
        +float[] thresholds
        +string[] grades
    }

    class AbilityCurve {
        +string dimension_id
        +float[] thresholds
        +string[] grades
    }

    class ProblemCurve {
        +string problem_id
        +float[] thresholds
        +string[] grades
    }

    Curve --> CurveMethod
    Curve --> OverallCurve
    Curve --> AbilityCurve
    Curve --> ProblemCurve
```

**Key Fields:**
- `source_event_id`: Curve 计算来源的 event
- `prompt_version_hash`: 生成分数时使用的 prompt 版本
- `problem_ids`: 包含的题目 ID 列表
- `dimension_ids`: 包含的能力维度 ID 列表
- `method`: Curve 计算方法（如：平均分 ± 标准差）

### 4. Curved Letter Grades Schema

```mermaid
classDiagram
    class CurvedLetterGrades {
        +string source_scores_id
        +string curve_id
        +string overall_grade
        +AbilityGrade[] ability_grades
        +ProblemGrade[] problem_grades
    }

    class AbilityGrade {
        +string dimension_id
        +string grade
    }

    class ProblemGrade {
        +string problem_id
        +string grade
    }

    CurvedLetterGrades --> AbilityGrade
    CurvedLetterGrades --> ProblemGrade
```

### 5. Curved Report Schema (最终报告)

```mermaid
classDiagram
    class CurvedReport {
        +string event_id
        +string prompt_version_hash
        +string applied_curve_id
        +Problem[] problems
        +AbilityDimension[] abilities
        +LetterGrades letter_grades
    }

    class LetterGrades {
        +string overall
        +map~string,string~ abilities
        +map~string,string~ problems
    }

    CurvedReport --> LetterGrades
```

**Key Addition:**
- `applied_curve_id`: 记录应用了哪个 curve（可追溯）

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
Problem ID: XXXXXX[V][L]
            │     │  │
            │     │  └─ Language: 0=Chinese, 1=English
            │     └─── Version: Major version changes
            └───────── Base ID: Problem identifier
```

**Example:** `9034943[1]` → Problem 903494, Version 3, English

## Transformation Rules (转换规则)

```mermaid
flowchart LR
    subgraph Validations["每个箭头的校验"]
        V1["LM → Report JSON<br/>✓ Schema validation<br/>✓ Record prompt hash"]
        V2["Report JSON → JSON Scores<br/>✓ Extract all scores<br/>✓ Validate completeness"]
        V3["Scores + Config → Curve<br/>✓ Validate people selection<br/>✓ Validate problem selection"]
        V4["Scores + Curve → Letter Grades<br/>✓ Compatibility check<br/>✓ Apply thresholds"]
        V5["Report + Letter → Curved Report<br/>✓ Schema match<br/>✓ Record curve_id"]
    end
```

## Design Principles (设计原则)

1. **No In-Place Modification (不进行原地修改)**
   - 原始数据和处理后数据分开存储
   - 改过的数据是新的实体，不覆盖原数据

2. **Explicit Metadata (显式元数据)**
   - 所有关键信息必须显式记录
   - 不依赖约定，依赖 schema 定义

3. **JSON over CSV (JSON 优于 CSV)**
   - JSON 支持层级结构
   - JSON 校验更严格、更方便

4. **Validation at Every Step (每步都校验)**
   - 每个数据转换都需要校验
   - 确保数据正确性

5. **Traceability (可追溯性)**
   - 任何 Curved Report 都能追溯到使用的 Curve
   - 任何 Curve 都能追溯到来源 Event 和 Prompt 版本

## Prompt Versioning Strategy (Prompt 版本策略)

### Current Approach (当前方案)
- 使用统一的 Git commit hash 标识所有 prompt 的版本
- 任何 prompt 变化都会产生新的 commit hash

### Future Approach (未来方案)
- 每个 prompt 单独版本化
- Prompts 包括:
  - Ability Summary
  - Problem Summary
  - Final Summary
  - Expert Review
  - Per-ability Expert Review
  - Per-problem Scoring Criteria

## Dimension-Problem Dependency (维度-题目依赖关系)

```mermaid
flowchart TD
    subgraph DimensionDependency["Dimension Dependency Tracking"]
        D1["Verification 维度"] --> P1["Thinking Trap"]
        D1 --> P2["Meeting Verification"]
        D2["其他维度"] --> P2
        D2 --> P3["Prompt Optimization"]
    end
```

**重要:** 需要显式记录每个维度依赖哪些题目，以便：
- 确定题目子集是否能产生有意义的维度分数
- 支持跨 Event 的题目复用
