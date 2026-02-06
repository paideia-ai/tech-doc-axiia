# Deprecated Scripts

These pipeline scripts are broken and need rewriting to align with the current schema architecture.

## Files

- `pipeline-functions.ts` - Core pipeline transformation functions
- `generate-synthetic-data.ts` - Test data generator
- `run-pipeline.ts` - Pipeline execution entry point
- `test-pipeline.ts` - Pipeline tests

## What Needs to be Fixed

### 1. Update Schema Imports

Replace removed types with current schemas:
- `ReportJSON` → `JSONScoresSchema`
- `CurvedLetterGrades` → `CurvedScoresSchema`
- `CurvedReport` → (removed, use `CurvedScoresSchema` directly)

### 2. Fix Property References

The schema structure changed:
- `curve.overall` → `curve.totals.final_total`
- `rawScores.total` → `rawScores.totals.raw_total`
- Individual dimension scores now nested under `dimensions`

### 3. Consolidate Duplicate Functions

`pipeline-functions.ts` has duplicate implementations that should be merged:
- Two versions of `curveScores` function
- Redundant type definitions

### 4. Align with Current Architecture

Reference these working files for patterns:
- `schemas.ts` - Current type definitions
- `generate-schema-docs.ts` - Working script example

## Why These Were Deprecated

The schema was refactored in ip-02.md to:
1. Consolidate `CurvedLetterGrades` and `CurvedReport` into single `CurvedScoresSchema`
2. Add `totals` object for aggregated scores
3. Remove redundant type aliases
