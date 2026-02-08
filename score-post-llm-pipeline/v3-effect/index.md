# v3-effect/

Effect Schema implementation of the score post-LLM pipeline data types.

| File | Description |
|------|-------------|
| `schemas.ts` | Effect Schema definitions for JSONScores (Schema.Class with derived getters), CurvedScores, ProblemDimensionMap, PromptSnapshot (multi-prompt provenance), and branded primitives |
| `schema-explanation.md` | Plain-English walkthrough of every type, field, and design decision in schemas.ts |
| `fixtures.ts` | Runnable examples showing stored JSON vs decoded forms, derived getters, and encode round-trip |
| `report-fixture.ts` | Sample Report JSON matching the axiia-website Report type, with realistic text + scores |
| `report-to-scores.ts` | Transform: axiia-website Report → JSONScores stored form, with verification that derived values match |
| `curve-fixture.ts` | Builder functions (buildCompatibleCurve, buildIncompatibleCurve) that derive Curve fixtures from JSONScores; prints full encoded form when run directly |
| `apply-curve.ts` | Compatibility check (checkCompatibility with swappable PromptComparisonStrategy) and curve application (applyCurve) demonstrating the full JSONScores → CurvedScores flow |
| `apply-curve-test.ts` | End-to-end test: loads JSON scores + curve from test-data/, applies curve, writes curved-scores.json |
| `test-data/scores.json` | Encoded JSONScores fixture (3 problems, 5 dimensions) |
| `test-data/curve.json` | Encoded Curve fixture matching the scores (A≥0.85, B≥0.72, C≥0.55) |
| `test-data/curved-scores.json` | Generated output: full CurvedScores with problem grades, ability grades, overall grade |
| `curve-application-analysis.md` | Analysis of how axiia-website currently applies curves: which scores get thresholds, execution order, what's not curved |
| `prompt-locations.md` | Reference doc: where scoring prompts live in axiia-website, key naming convention for PromptSnapshot entries |
| `open-questions.md` | Design questions: ScorePool assembly validation (Q1) and Curve–Score compatibility requirements (Q2), with proposed validation tiers |
| `score-pool-builder.ts` | ScorePool construction functions (initPool, addScore, addEvent) with prompt snapshot and dimension map compatibility checks using Either for error handling |
| `score-pool-builder-test.ts` | Runnable tests for score-pool-builder: happy path (init + addEvent + addScore), prompt mismatch rejection, dimmap mismatch rejection, duplicate score rejection |
| `partial-application-scenarios.md` | Catalog of all curve–score mismatch scenarios (S1–S8): which crash, which are meaningful for partial application, and what changes are needed |
| `data-construction.md` | Step-by-step guide to constructing valid JSONScores (including PromptSnapshot set_hash computation) and assembling a ScorePool |

```mermaid
graph LR
    S[schemas.ts] -. "documented by" .-> E[schema-explanation.md]
    S -. "validated by" .-> F[fixtures.ts]
    RF[report-fixture.ts] --> RT[report-to-scores.ts]
    RT -. "decodes through" .-> S
    CF[curve-fixture.ts] --> AC[apply-curve.ts]
    RF --> AC
    AC -. "checks & applies" .-> S
    SJ[test-data/scores.json] --> ACT[apply-curve-test.ts]
    CJ[test-data/curve.json] --> ACT
    ACT -. "writes" .-> CSJ[test-data/curved-scores.json]
    ACT --> AC
    PL[prompt-locations.md] -. "documents key convention for" .-> S
    DC[data-construction.md] -. "construction guide for" .-> S
    DC -. "references" .-> SPB
    SPB[score-pool-builder.ts] --> S
    SPB -. "reuses strategy from" .-> AC
    F --> SPBT[score-pool-builder-test.ts]
    SPBT --> SPB
```
