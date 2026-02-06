# Score Post-LLM Pipeline Scripts

Scripts for testing and demonstrating the score post-LLM pipeline with synthetic data.

## Setup

```bash
cd score-post-llm-pipeline/scripts
npm install
```

## Scripts

### 1. Generate Synthetic Data

```bash
npx tsx generate-synthetic-data.ts
```

Generates sample data for each pipeline stage:
- `synthetic-data/00-event-config.json` - Event configuration
- `synthetic-data/01-report-jsons.json` - Multiple LLM outputs
- `synthetic-data/02-json-scores.json` - Extracted scores
- `synthetic-data/03-curve.json` - Computed curve
- `synthetic-data/04-curved-letter-grades.json` - Applied grades
- `synthetic-data/05-curved-reports.json` - Final reports

### 2. Run Full Pipeline

```bash
npx tsx run-pipeline.ts
```

Demonstrates the complete data flow with schema validation at each step.
Outputs to `pipeline-output/` directory.

### 3. Run Tests

```bash
npx tsx test-pipeline.ts
```

Tests all pipeline functions including:
- Schema validation (valid and invalid inputs)
- Score extraction
- Curve computation
- Compatibility checking
- Curve application
- Report merging
- Edge cases

## Pipeline Function Schemas

Each pipeline function has clearly defined input/output schemas:

| Stage | Function | Input Schema | Output Schema |
|-------|----------|--------------|---------------|
| 1 | `validateReportJSON` | `unknown` | `ReportJSONSchema` |
| 2 | `extractScores` | `ReportJSONSchema` | `JSONScoresSchema` |
| 3a | `createScorePool` | `{ scores: JSONScores[], config: EventConfig }` | `ScorePoolSchema` |
| 3b | `computeCurve` | `ScorePoolSchema` | `CurveSchema` |
| 4a | `checkCompatibility` | `{ scores: JSONScores, curve: Curve }` | `CompatibilityResultSchema` |
| 4b | `applyCurve` | `{ scores: JSONScores, curve: Curve }` | `CurvedLetterGradesSchema` |
| 5 | `mergeIntoCurvedReport` | `{ report: ReportJSON, grades: CurvedLetterGrades }` | `CurvedReportSchema` |

## File Structure

```
scripts/
├── package.json              # Dependencies (zod, tsx)
├── schemas.ts                # All Zod schema definitions
├── generate-synthetic-data.ts # Data generators
├── pipeline-functions.ts     # Pipeline processing functions
├── run-pipeline.ts           # Full pipeline demonstration
├── test-pipeline.ts          # Test suite
├── synthetic-data/           # Generated test data
└── pipeline-output/          # Pipeline run output
```

## Key Design Patterns

1. **Schema Validation**: Every function validates inputs and outputs with Zod
2. **No In-Place Modification**: Original data is never mutated
3. **Traceability**: All outputs reference their sources
4. **Compatibility Check**: Required before applying curves
5. **Explicit Errors**: Clear error messages on validation failures
