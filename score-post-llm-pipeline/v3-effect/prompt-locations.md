# Prompt Locations in axiia-website

Reference: where scoring prompts live and how they map to `PromptSnapshot` entry keys.

## Two tiers of prompts

The scoring system uses 20+ prompt files organized in two tiers:

### 1. Framework prompts (shared, per-language)

Located at `packages/eval/materials/prompts/framework/{en,zh}/`.

6 `.liquid` templates that define the general evaluation framework. These affect **all** problems in a given language.

| File | PromptSnapshot key | Role |
|------|-------------------|------|
| `task-eval.liquid` | `framework:{lang}:task-eval` | Main task evaluation prompt |
| `expert-review.liquid` | `framework:{lang}:expert-review` | Expert review stage |
| `problem-ability.liquid` | `framework:{lang}:problem-ability` | Problem-to-ability scoring |
| `problem-summary.liquid` | `framework:{lang}:problem-summary` | Problem-level summary |
| `ability-summary.liquid` | `framework:{lang}:ability-summary` | Ability-level summary |
| `final-summary.liquid` | `framework:{lang}:final-summary` | Final summary/report |

### 2. Problem-specific prompts (unique per problem)

Located at `packages/eval/materials/prompts/problems/{problemId}/`.

Each problem has 2 files that define its specific rubric and evaluation criteria:

| File | PromptSnapshot key | Role |
|------|-------------------|------|
| `task-eval.md` | `problem:{digitId}:task-eval` | Problem-specific evaluation instructions |
| `scoring.md` | `problem:{digitId}:scoring` | Scoring rubric for this problem |

## Selection logic

Prompt selection happens in `packages/eval/src/prompt-library.ts`:

1. Language is determined from the problem's `ProblemDigitId` (last digit: 0=zh, 1=en)
2. Framework prompts: select the language-specific set (`en/` or `zh/`)
3. Problem prompts: select by the problem's digit ID

## Key naming convention

The `PromptSnapshotEntry.key` field uses a colon-separated format:

```
{tier}:{scope}:{name}
```

- **Framework**: `framework:{lang}:{name}` — e.g. `framework:zh:task-eval`
- **Problem**: `problem:{digitId}:{name}` — e.g. `problem:001001:scoring`

This convention is not enforced in the Effect schema (keys are just non-empty strings with a sort constraint). The convention exists so that comparison strategies in `apply-curve.ts` can distinguish framework entries from problem entries and apply the right matching rules.

## Why this matters for curve compatibility

Changing a **framework** prompt affects all problems in that language — any curve computed under the old framework is potentially invalid for all problems.

Changing a **problem-specific** prompt only affects that one problem. With the `perProblemComparison` strategy, scores for other problems remain valid against an existing curve.

This is the core motivation for replacing the single `prompt_version_hash` with the multi-file `PromptSnapshot`.
