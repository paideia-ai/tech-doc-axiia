# Notes / Design Rationale (v1)

This file captures a few implementation decisions and open questions around the `schema-v1` report and post-processing pipeline.

## 1) Front-end report shape: `grade` placeholder

### Problem
The front-end report renderer expects a `grade` field on several objects.

### Decision
Construct the *front-end display report structure* up front and have the LLM output include a `grade` placeholder.

### Rationale
After curve adjustment, the report can be used directly without an additional restructuring step.

### Current behavior
- The LLM-generated report includes `grade`, but the initial value is `"X"` (placeholder).

## 2) Prompt versioning: avoid relying on `gitSha`

### Problem
Writing `prompts.gitSha` (e.g., `git rev-parse HEAD`) at report-generation time does **not** guarantee version consistency:
- The runtime working tree may be dirty (uncommitted changes).
- Prompts may come from packaged artifacts, copied files, or multiple repositories.

### Decision
Write a runtime *prompt snapshot* into the report JSON metadata for all prompt templates actually used.

### Snapshot contents (auditable fingerprints only)
The snapshot does **not** include the full prompt text. It includes:
- A logical key per prompt (examples: `framework:zh:task-eval`, `problem:001111:scoring`)
- A content hash per prompt (example: `SHA-256`)
- A `promptSetHash` for the full set, computed in a stable order (sorted by key/path)

### Benefits
The report becomes:
- Traceable (you can see exactly which prompt fingerprints were used)
- Comparable (two runs can be compared by prompt fingerprints)
- Reproducible (given the same prompt files)

## 3) Compatibility: explicitly out of scope (for now)

### Decision
Compatibility is not addressed in v1.

### Rationale
Supporting multiple, inconsistent data sources significantly complicates the model and downstream usage.

### Example ambiguity
If several sources disagree:
- Which one should be saved as authoritative?
- If all are saved, do consumers need a manual confirmation step?

## 4) Open edge case: curving events for “same-type” problems

### Question
How should curve events be represented when they apply to different problems of the same type (as proposed by Sina)?

slot: [
  { candidates: [{ problem_id, problem_version /* ... */ }, /* ... */] },
  /* ... */
]