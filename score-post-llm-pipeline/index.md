# Score Post-LLM Pipeline

Documentation and implementation for the score processing pipeline that transforms raw LLM evaluation scores into curved letter grades.

## Directory Structure

### Active Documentation

| File | Description |
|------|-------------|
| `domain-context.md` | Core domain model explaining the score transformation pipeline concepts |
| `pipeline-phases.md` | Documents the 6 pipeline phases (Test Event → LLM Scoring → Score Extraction → Curve Computation → Curve Application → Merge Back) with data flow and where ProblemDimensionMap enters |
| `pipeline-diagram.html` | Visual diagram of the pipeline flow |
| `data-format-fixtures.json` | Example ProblemDimensionMap + source/target JSON pair with per-problem dimension subsets |

### Historical Documentation

| File | Description |
|------|-------------|
| `schema-comparison.md` | Comparison of v1/v2/v3 schema approaches (snapshot of a past decision point) |

### Subdirectories

| Directory | Description |
|-----------|-------------|
| `v1-vitest/` | Attempt 1: standalone vitest-based schema verification (own package.json) |
| `v2-zod/` | Attempt 2: Zod schemas, docs generator, Playwright e2e tests, synthetic data |
| `v3-effect/` | Attempt 3: Effect Schema FP-native port of the pipeline schemas |
| `ip/` | Iteration plans documenting design decisions and changes |
| `comment/` | Review comments and feedback |
| `archive/` | Historical documents from initial design phase |

## Historical Files

The following files have historical value documenting early design decisions:

- `ip/ip-01.md` – First iteration plan (historical, superseded by ip-02)
- `ip/ip-04.md` – Design decisions for PromptSnapshot, CurvedScores overall_grade
- `ip/ip-04-changelog.md` – Schema structure summary (reflects pre-PromptSnapshot state)
- `comment/cm-01.md` – Initial design feedback
- `ks-comment.md` – KS's feedback on initial design

## Archive

The `archive/` folder contains early design documents that are no longer current but preserved for reference:

- `design-anna-v0.md` – Original design proposal
- `clarifying-questions.md` – Questions from initial requirements gathering
- `meeting-for-design.txt` – Meeting notes from design sessions
- `pipeline-design.md` – Initial pipeline design (ip-02 era); field names and schemas outdated
- `data-formats.md` – Earlier field-level data format spec; field names outdated

## File Relationships

```mermaid
graph TD
    subgraph "Active Documentation"
        DC[domain-context.md] --> PP[pipeline-phases.md]
        PP --> DIAG[pipeline-diagram.html]
    end

    subgraph "Current Implementation"
        ESCH[v3-effect/schemas.ts]
        ESCH --> EXP[v3-effect/schema-explanation.md]
        ESCH --> AC[v3-effect/apply-curve.ts]
    end

    subgraph "Historical"
        PD[archive/pipeline-design.md]
        DF[archive/data-formats.md]
        SCH[v2-zod/schemas.ts]
        SCH -. "ported to" .-> ESCH
    end

    subgraph "Planning"
        IP1[ip/ip-01.md] --> IP2[ip/ip-02.md]
        IP2 --> IP3[ip/ip-03.md]
        IP3 --> IP4[ip/ip-04.md]
    end

    DC --> ESCH
```
