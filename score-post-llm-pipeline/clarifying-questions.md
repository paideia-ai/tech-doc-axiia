# Clarifying Questions - Score Post-LLM Pipeline

These questions arose from ambiguities or incomplete decisions in the meeting discussion.

## Schema Design Questions

### Q1: Total Score Computation Location
**Context (lines 425-445):** Discussion about whether total score is "original" or "computed"

- Total score = geometric mean of ability scores = geometric mean of problem objective scores
- Currently computed at report generation time

**Question:** Should total score be:
1. Stored in Report JSON (computed once at LLM stage)?
2. Computed on-the-fly from ability/problem scores?
3. Stored separately in JSON Scores (extracted and computed together)?

### Q2: Curve Threshold Format
**Context (lines 683-685):** Mention of "平均分以上一个标准差两分" as default curve method

**Question:** What is the exact format for curve thresholds?
- Is it percentile-based (0.8, 0.6, 0.4)?
- Is it standard deviation based (mean ± 1σ, mean ± 2σ)?
- Should both be supported with a method specification?

### Q3: Default Curve Method Configuration
**Context (lines 683-686):** Discussion about having a default curve method

**Question:** Where should the default curve method be configured?
1. Hardcoded in the system?
2. In a separate configuration file?
3. Per-event configuration?

## Compatibility Questions

### Q4: Language Compatibility Exact Rules
**Context (lines 591, 611, 639-643):** Problem ID last digit indicates language (0=Chinese, 1=English)

**Question:** When comparing problem IDs for compatibility:
1. Should we strip the language suffix and compare base IDs?
2. Should we have an explicit "language-agnostic" compatibility mode?
3. How do we handle cases where Chinese and English versions have different scoring behavior?

### Q5: Prompt Version Mismatch Handling
**Context (lines 536-559):** Discussion about what happens when prompt versions differ

**Question:** When prompt versions don't match during curve application:
1. Should it be a hard block requiring manual override?
2. Should there be a "diff" mechanism to show what changed?
3. How do we record manual overrides in the audit trail?

### Q6: Partial Problem Match
**Context (lines 373-383):** Discussion about curve containing more problems than report

**Initial decision:** Require exact match (subset/superset not allowed)
**Question:** Future extension - when we allow partial matches:
1. How do we handle dimension scores that depend on missing problems?
2. Should there be a minimum coverage threshold?

## Data Flow Questions

### Q7: Event-Specific Metadata
**Context (lines 260-270):** Mention of "event-specific metadata" that might affect schema

**Question:** What event-specific metadata needs to be captured?
- Language of the event?
- Date/time of the event?
- Participant count?
- Any other metadata that affects scoring?

### Q8: Dimension-Problem Dependency Recording
**Context (lines 405-420):** This dependency info is currently implicit in code

**Question:** Where should dimension-problem dependencies be explicitly recorded?
1. In a separate configuration file?
2. In the prompt definitions?
3. In the Curve schema?
4. All of the above with validation between them?

### Q9: Report JSON vs Curved Report Storage
**Context (lines 566-573):** Discussion about where to store curves and reports

**Question:** Storage strategy:
1. Both in the same repo?
2. Report JSON in one location, Curved Report in another?
3. How to prevent accidental confusion between curved and uncurved reports?

## Validation Questions

### Q10: What Constitutes a Valid Score?
**Context (lines 91-92):** Mention of missing scores (空在那儿)

**Question:** What are the validation rules for scores?
1. Can scores be null/missing?
2. Valid score range (0-1? 0-100?)?
3. How to handle LLM failing to produce a score?

### Q11: Schema Version Management
**Context:** Not explicitly discussed

**Question:** As schemas evolve:
1. How do we version schemas?
2. How do we handle backward compatibility?
3. Can old curves be applied to reports generated with new schemas?

## Process Questions

### Q12: Manual Override Audit Trail
**Context (lines 543-559):** Manual override when versions don't match

**Question:** What information should be captured when manual override is performed?
1. Who performed the override?
2. Reason for override?
3. Timestamp?
4. Original incompatibility details?

### Q13: Curve Generation Trigger
**Context (lines 676-682):** Discussion about automation

**Question:** When is curve generation triggered?
1. Automatically after event completion?
2. Manual trigger only?
3. Threshold-based (e.g., when N participants complete)?

### Q14: Existing Data Migration
**Context:** Not explicitly discussed

**Question:** How do we handle existing data that was processed with the old in-place modification approach?
1. Do we need to migrate historical data?
2. How do we identify which historical reports have been curved?

## Technical Implementation Questions

### Q15: Validation Library Choice
**Context (lines 169-173, 209-213):** JSON validation preference

**Question:** What validation library/approach to use?
1. JSON Schema?
2. Pydantic (Python)?
3. Zod (TypeScript)?
4. Custom validation functions?

### Q16: Curve Storage Format
**Context (lines 565-570):** Discussion about where curves are stored

**Question:** Exact storage format and location:
1. JSON file in repo?
2. Database entry?
3. Both with sync mechanism?
