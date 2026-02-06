# Score Post-LLM Pipeline

Documentation and implementation for the score processing pipeline that transforms raw LLM evaluation scores into curved letter grades.

## Directory Structure

### Active Documentation

| File | Description |
|------|-------------|
| `domain-context.md` | Core domain model explaining the score transformation pipeline concepts |
| `pipeline-design.md` | Technical design document for pipeline architecture |
| `pipeline-diagram.html` | Visual diagram of the pipeline flow |
| `pipeline-phases.md` | Documents the 6 pipeline phases (Test Event → LLM Scoring → Score Extraction → Curve Computation → Curve Application → Merge Back) with data flow and where ProblemDimensionMap enters |
| `data-formats.md` | Plain-English description of ProblemDimensionMap, source (JSONScores), and target (CurvedScores) data formats |
| `data-format-fixtures.json` | Example ProblemDimensionMap + source/target JSON pair with per-problem dimension subsets |

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

- `ip/ip-01.md` - First iteration plan (historical, superseded by ip-02)
- `comment/cm-01.md` - Initial design feedback

## Archive

The `archive/` folder contains early design documents that are no longer current but preserved for reference:

- `design-anna-v0.md` - Original design proposal
- `clarifying-questions.md` - Questions from initial requirements gathering
- `meeting-for-design.txt` - Meeting notes from design sessions

## File Relationships

```mermaid
graph TD
    subgraph "Documentation"
        DC[domain-context.md] --> PD[pipeline-design.md]
        PD --> DIAG[pipeline-diagram.html]
        PP[pipeline-phases.md] --> DF[data-formats.md]
        DF --> FIX[data-format-fixtures.json]
    end

    subgraph "Implementation"
        SCH[v2-zod/schemas.ts] --> GEN[v2-zod/generate-schema-docs.ts]
        GEN --> HTML[v2-zod/schema-docs-generated.html]
        ESCH[v3-effect/schemas.ts]
        SCH -. "FP-native port" .-> ESCH
    end

    subgraph "Planning"
        IP1[ip/ip-01.md] --> IP2[ip/ip-02.md]
        IP2 --> IP3[ip/ip-03.md]
    end

    DC --> SCH
    IP2 --> SCH
    PD --> PP
```
