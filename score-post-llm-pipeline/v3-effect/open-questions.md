# Open Questions

## Q1: ScorePool Assembly Validation

When assembling a ScorePool from scores across different events, how do we ensure the pool is **legitimate** — that computing a curve from it is meaningful?

Context: ScorePool collects JSONScores from a cohort. A Curve is then computed from the pool (μ, σ per dimension/problem). If the scores aren't comparable — different prompts, different dimension mappings, different problem sets — the resulting curve is garbage.

**Status**: Under design. See analysis below.

## Q2: Curve–Score Compatibility Checks

When applying a Curve to a JSONScores, what are the compatibility check requirements?

Context: Already implemented in `apply-curve.ts` as `checkCompatibility()`. Three severity tiers:

| Tier | Checks | Effect |
|------|--------|--------|
| **Structural** | problem_coverage, dimmap_structural, threshold_ordering | Any fail → `incompatible` (blocked) |
| **Provenance** | prompt_version, event_membership, dimmap_identity | Any fail → `requires_override` (opt-in) |
| **Advisory** | extra_curve_problems, sample_size, staleness, score_range | Informational only |

**Status**: Implemented. See `apply-curve.ts` lines 57–213.

---

## Q1 Analysis: ScorePool Assembly — Event-Centric Construction

### Key insight: the event is the unit of coherence

Within a single event, all scores already share the same `prompt_snapshot`, `dimension_map`, and problem set — that's what makes it one event. So validation doesn't happen per-score; it happens **at the event boundary** when you add a new event to the pool.

### Construction model

```
  empty pool
      │
      ▼
  addEvent(Event A + its scores)     ← first event: sets the reference
      │                                 pool adopts A's prompt_snapshot,
      │                                 dimension_map as its own
      ▼
  addEvent(Event B + its scores)     ← check B against reference
      │                                 prompt_version match? dimmap match?
      ▼
  addEvent(Event C + its scores)     ← check C against reference
      │
      ▼
  ScorePool ready for curve computation
```

The first event **establishes** the pool's properties. Each subsequent event is checked for compatibility against those established properties. This is a fold: each step either succeeds (pool grows) or fails (with a clear error pointing to the incompatible event).

### What this means for EventConfig

EventConfig (currently a stub) must carry the properties that define an event's scoring context — the same properties that make scores within the event comparable:

```typescript
export class EventConfig extends Schema.Class<EventConfig>("EventConfig")({
  event_id: EventId,
  prompt_snapshot: PromptSnapshot,
  dimension_map: ProblemDimensionMap,
  event_date: Schema.DateTimeUtc,
}) {}
```

EventConfig is the **metadata** about a scoring event. It tells you the conditions under which scores were produced, without containing the scores themselves. When you "add an event" to a pool, you provide the EventConfig + the scores from that event.

### Event compatibility check: `checkEventCompatibility`

When adding Event B to a pool that already has Event A's properties as reference:

#### Compatibility levels: strict now, intersection later

The compatibility check is designed to evolve. Start strict, relax later.

**v1 (now): Full match — all or nothing**

Every event must have the same prompt and the same dimension map. The pool's "scope" equals each event's full scope.

| Check | What it verifies |
|-------|-----------------|
| `prompt_snapshot_match` | Event's `prompt_snapshot` equals pool's. Different prompt = different rubric = scores not comparable. |
| `dimmap_structural_match` | Event's `dimension_map` has the same problems with the same dimensions per problem. Full structural equivalence. |

Only two checks. The event is already a coherent unit internally.

**v2 (future): Intersection-based — partial overlap is usable**

Events may have different problem sets or different dimension mappings, but if they *overlap* on some problems with the same prompt for those problems, the overlapping subset is still comparable.

```
Event A:  problems [P1, P2, P3]    prompt=abc    dims: P1→[D1,D2], P2→[D1,D3], P3→[D2,D3]
Event B:  problems [P2, P3, P4]    prompt=abc    dims: P2→[D1,D3], P3→[D2,D3], P4→[D1,D2]
                          ──────
Overlap:  problems [P2, P3]  ← same prompt, same dims per problem → comparable
Pool effective scope: curve computed only for P2, P3 and their dimensions
```

What changes:
- Compatibility becomes a **spectrum**, not binary. The result is "compatible on this subset" rather than "compatible or not."
- The pool gets an `effective_dimension_map` — the intersection of all events' maps, containing only problems/dimensions that are comparable across all events.
- Curve computation uses the effective map, not any single event's full map.
- Scores for problems outside the effective map are *present in the pool* but *excluded from curve computation*.

Further relaxation:
- Per-problem prompt matching: Event A uses prompt `abc` for P2 but prompt `xyz` for P3. Event B uses prompt `abc` for both. P2 is still comparable (same prompt), P3 is not. The effective scope shrinks to just P2.
- Dimension-level intersection: same problem, same prompt, but different dimension subsets. Keep only the common dimensions.

**Why v1 first**: The strict version is a special case of the intersection model where overlap == 100%. The code structure doesn't need to change later — the "full match" check is just an intersection check that rejects any non-total intersection. When we relax, we replace the rejection with a narrowing of scope.

#### Advisory checks (both v1 and v2)

| Check | What it verifies |
|-------|-----------------|
| `dimmap_identity` | `map_id` matches. Structure can match even if IDs differ. Identity mismatch with structural match is worth noting. |
| `temporal_proximity` | Event dates aren't wildly apart. Different populations may have different score distributions. |

### Pool-level checks (after assembly, before curve computation)

Event compatibility ensures structural soundness. Pool-level checks are about **statistical quality** — can a meaningful curve be computed from this data?

| Check | Tier | What it verifies |
|-------|------|-----------------|
| `adequate_sample_size` | Statistical | `scores.length >= N` for intended curve method (≥30 for std dev). |
| `per_problem_coverage` | Statistical | Each problem in the effective scope has enough scores. A problem scored by 2 of 100 participants → useless μ/σ. |
| `non_degenerate_distribution` | Statistical | Score distributions not pathological (σ=0 collapses the curve). |
| `no_duplicate_participants` | Advisory | Same `participant_id` appearing twice across events — re-take or data error? |
| `balanced_event_representation` | Advisory | No single event dominates (95%/5% split biases curve toward one cohort). |

In v2, `per_problem_coverage` becomes more important: intersection may leave some problems with fewer scores than others (a problem only in 2 of 5 events has fewer data points).

### Construction API: two ways to add scores

Scores don't always arrive in neat per-event batches. Two operations:

1. **`addEvent`** — bulk: "here's an event and all its scores"
2. **`addScore`** — incremental: "here's one score" (e.g., as participants finish)

#### Why both are needed

| Scenario | Operation |
|----------|-----------|
| Import historical event data from a database dump | `addEvent` — you have the full batch |
| Live assessment: scores arrive as participants submit | `addScore` — one at a time |
| Mix: import one event, then stream scores from another | `addEvent` then `addScore` |

#### How `addScore` handles event membership

A JSONScores already carries `event_id`, `prompt_snapshot`, and `dimension_map`. When adding a single score, two cases:

```
addScore(pool, score)
  │
  ├─ score.event_id already in pool's source_event_ids?
  │   YES → event is known-compatible. Just check no duplicate scores_id, add.
  │
  └─ score.event_id is NEW?
      → Score carries enough provenance to check compatibility:
        check score.prompt_snapshot against pool reference
        check score.dimension_map structural match against pool reference
        If compatible → register event_id in source_event_ids, add score.
        If not → reject with clear error.
```

A single score can implicitly introduce a new event. The score has all the info needed — no separate EventConfig registration required.

#### Should we still validate scores from known-compatible events?

Yes. Always check `prompt_snapshot` and `dimmap` structural match, even for known events. It's two comparisons (cheap), and catches data errors where a score is tagged with the wrong event_id or has corrupted metadata. "Trust but verify."

#### What about EventConfig?

EventConfig becomes **optional metadata**, not a gating requirement. If you have it, you can register events explicitly before scores arrive. If you don't, the first score from that event implicitly registers it.

```typescript
// Register an event explicitly (optional — provides metadata)
function registerEvent(
  pool: ScorePool,
  event: EventConfig,
): Either<EventIncompatibility, ScorePool>

// Add one score. Implicitly registers new events if compatible.
function addScore(
  pool: ScorePool,
  score: JSONScores,
): Either<ScoreRejection, ScorePool>

// Add all scores from an event. Convenience for bulk import.
// Equivalent to registerEvent + addScore for each, but checked as a batch.
function addEvent(
  pool: ScorePool,
  event: EventConfig,
  scores: ReadonlyArray<JSONScores>,
): Either<EventIncompatibility, ScorePool>

// Pool-level validation before curve computation
function validatePool(pool: ScorePool): PoolValidationResult
```

#### Rejection types

**v1 (strict)** — `addScore` can fail for exactly three reasons:

| Rejection | Meaning |
|-----------|---------|
| `prompt_snapshot_mismatch` | Score's prompt doesn't match pool reference |
| `dimmap_structural_mismatch` | Score's dimension map has different problems/dimensions |
| `duplicate_score` | `scores_id` already in pool |

`addEvent` can fail for the same structural reasons (checked against EventConfig), plus:

| Rejection | Meaning |
|-----------|---------|
| `event_already_registered` | Event ID already in pool (use `addScore` for additional scores) |
| `score_event_mismatch` | A score in the batch has a different `event_id` than the EventConfig |

**v2 (intersection)** — `dimmap_structural_mismatch` goes away. Instead, adding a score/event with a different dimmap narrows the pool's effective scope. The only hard rejection is `prompt_snapshot_mismatch` on overlapping problems (and `duplicate_score`). A new advisory `no_overlap` would warn if the intersection is empty — the score/event shares zero problems with the pool, so adding it contributes nothing.

#### `initPool`: the first event/score

The pool needs at least one score to establish the reference. Two options:

```typescript
// Option A: init from an event
function initPool(label: string, event: EventConfig, scores: JSONScores[]): ScorePool

// Option B: init from a single score
function initPool(label: string, firstScore: JSONScores): ScorePool
```

Option B is minimal. The first score sets `prompt_snapshot` and `dimension_map` as pool reference. Its `event_id` becomes the first entry in `source_event_ids`.

Option A is more explicit — you declare the event context upfront. Useful when you know the event metadata but scores haven't arrived yet. But this creates a pool with zero scores, which contradicts ScorePool.scores being non-empty for curve computation.

**Recommendation**: Support both. `initPool(label)` creates an empty pool with no reference yet. The reference is established by the first `addEvent` or `addScore` call. The pool is "not ready for curve computation" until it has scores — that's what `validatePool` checks.

### Pool-level checks (after assembly, before curve computation)

Event/score compatibility ensures structural soundness. Pool-level checks are about **statistical quality** — can a meaningful curve be computed from this data?

| Check | Tier | What it verifies |
|-------|------|-----------------|
| `adequate_sample_size` | Statistical | `scores.length >= N` for intended curve method (≥30 for std dev). |
| `per_problem_coverage` | Statistical | Each problem has enough scores. A problem scored by 2 of 100 participants → useless μ/σ. |
| `non_degenerate_distribution` | Statistical | Score distributions not pathological (σ=0 collapses the curve). |
| `non_empty` | Structural | Pool has at least one score. (Can't compute a curve from nothing.) |
| `no_duplicate_participants` | Advisory | Same `participant_id` appearing twice across events — re-take or data error? |
| `balanced_event_representation` | Advisory | No single event dominates (95%/5% split biases curve toward one cohort). |

### Relationship between Q1 and Q2

```
  score/event  ──addScore/addEvent──▶  [ScorePool]  ──compute──▶  [Curve]  ──apply──▶  [CurvedScores]
                    Q1: entry gate         Q1: pool          Q2: checkCompatibility()
                    (compat check)         quality check
```

Q1 has two layers: the **entry gate** (per-score/event compatibility at addition time) and the **pool quality check** (statistical fitness before curve computation). Q2 guards curve application. Strict Q1 → Q2 provenance checks naturally pass for same-pool scores.

### Implementation plan

1. **Flesh out EventConfig** (schemas.ts §11) — add `prompt_snapshot`, `dimension_map`, `event_date`
2. **Write entry-gate checks** — `checkScoreCompatibility(pool, score)` and `checkEventCompatibility(pool, event)`
3. **Write construction functions** — `initPool`, `addScore`, `addEvent`, `registerEvent`
4. **Write `validatePool`** — pool-level statistical/advisory checks
5. **Fixture** — build a ScorePool incrementally (init → addEvent → addScore → validate), try incompatible additions, verify rejection
