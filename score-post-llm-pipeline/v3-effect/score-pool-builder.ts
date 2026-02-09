/**
 * ScorePool construction: initPool, addScore, addEvent.
 *
 * Builds a ScorePool incrementally from EventConfigs and JSONScores,
 * checking prompt snapshot and dimension map compatibility at each step.
 *
 * Error handling: Function + Either (tagged error union, no schema).
 * Prompt comparison: reuses PromptComparisonStrategy from apply-curve.ts,
 * defaulting to strictSetHash for v1.
 *
 * Run: npx tsx v3-effect/score-pool-builder.ts
 */

import { Either, Schema } from "effect";
import {
  type EventConfig,
  type JSONScores,
  type ProblemDigitId,
  type ScorePool,
  CheckFail,
  JSONScores as JSONScoresSchema,
  ProblemDimensionMap,
  PromptSnapshot,
  ScorePool as ScorePoolSchema,
} from "./schemas.js";
import {
  type PromptComparisonStrategy,
  strictSetHash,
} from "./apply-curve.js";

// =============================================================================
// PoolError — tagged union (no schema, per v1 decision)
// =============================================================================

export type PoolError =
  | { readonly _tag: "prompt_snapshot_mismatch"; readonly diffs: string[] }
  | { readonly _tag: "dimmap_structural_mismatch"; readonly mismatches: string[] }
  | { readonly _tag: "duplicate_score"; readonly scores_id: string }
  | { readonly _tag: "event_already_registered"; readonly event_id: string }
  | { readonly _tag: "score_event_mismatch"; readonly expected: string; readonly got: string };

export const formatPoolError = (e: PoolError): string => {
  switch (e._tag) {
    case "prompt_snapshot_mismatch":
      return `Prompt snapshot mismatch: ${e.diffs.join("; ")}`;
    case "dimmap_structural_mismatch":
      return `Dimension map structural mismatch: ${e.mismatches.join("; ")}`;
    case "duplicate_score":
      return `Duplicate score: ${e.scores_id}`;
    case "event_already_registered":
      return `Event already registered: ${e.event_id}`;
    case "score_event_mismatch":
      return `Score event mismatch: expected ${e.expected}, got ${e.got}`;
  }
};

// =============================================================================
// Encode / Decode helpers (top-level, no dynamic imports)
// =============================================================================

const decodePool = Schema.decodeUnknownSync(ScorePoolSchema);
const encodePool = Schema.encodeSync(ScorePoolSchema);
const encodeJSONScores = Schema.encodeSync(JSONScoresSchema);
const encodeDimMap = Schema.encodeSync(ProblemDimensionMap);
const encodeSnapshot = Schema.encodeSync(PromptSnapshot);

// =============================================================================
// Internal: checkScoreAgainstPool
//
// Validates a single JSONScores against the pool's reference prompt_snapshot
// and dimension_map. Returns null on success, PoolError on failure.
// =============================================================================

function checkScoreAgainstPool(
  pool: ScorePool,
  score: JSONScores,
  promptComparison: PromptComparisonStrategy,
): PoolError | null {
  // 1. Prompt snapshot comparison
  const scoreDigits = score.problem_scores.map(
    (ps) => ps.problem_id.digit,
  );
  const promptCheck = promptComparison(
    pool.prompt_snapshot,
    score.prompt_snapshot,
    scoreDigits,
  );
  if (promptCheck.status === "fail") {
    const cf = promptCheck as CheckFail;
    return {
      _tag: "prompt_snapshot_mismatch",
      diffs: cf.items.length > 0 ? [...cf.items] : [cf.message],
    };
  }

  // 2. Dimension map structural check: for each problem in the score,
  //    the dimension sets must match between score's dimmap and pool's dimmap.
  const mismatches: string[] = [];
  for (const ps of score.problem_scores) {
    const digit = ps.problem_id.digit;
    const scoreDims = new Set(
      score.dimension_map.entries
        .filter((e) => e.problem_id.digit === digit)
        .flatMap((e) => e.dimensions),
    );
    const poolDims = new Set(
      pool.dimension_map.entries
        .filter((e) => e.problem_id.digit === digit)
        .flatMap((e) => e.dimensions),
    );
    if (
      scoreDims.size !== poolDims.size ||
      ![...scoreDims].every((d) => poolDims.has(d))
    ) {
      mismatches.push(
        `${digit}: pool=[${[...poolDims].join(",")}] score=[${[...scoreDims].join(",")}]`,
      );
    }
  }
  if (mismatches.length > 0) {
    return { _tag: "dimmap_structural_mismatch", mismatches };
  }

  // 3. Duplicate score check
  if (pool.scores.some((s) => s.scores_id === score.scores_id)) {
    return { _tag: "duplicate_score", scores_id: score.scores_id };
  }

  return null;
}

// =============================================================================
// Internal: checkEventAgainstPool
//
// Validates an EventConfig's prompt_snapshot and dimension_map against the
// pool's reference. Fast-fail before iterating scores.
// =============================================================================

function checkEventAgainstPool(
  pool: ScorePool,
  event: EventConfig,
  promptComparison: PromptComparisonStrategy,
): PoolError | null {
  // Prompt snapshot check using event's problem digits
  const eventDigits = event.problem_ids.map(
    (pid) => pid.digit,
  ) as readonly ProblemDigitId[];
  const promptCheck = promptComparison(
    pool.prompt_snapshot,
    event.prompt_snapshot,
    eventDigits,
  );
  if (promptCheck.status === "fail") {
    const cf = promptCheck as CheckFail;
    return {
      _tag: "prompt_snapshot_mismatch",
      diffs: cf.items.length > 0 ? [...cf.items] : [cf.message],
    };
  }

  // Dimension map structural check: for each problem in the event,
  // check dimension sets match.
  const mismatches: string[] = [];
  for (const pid of event.problem_ids) {
    const digit = pid.digit;
    const eventDims = new Set(
      event.dimension_map.entries
        .filter((e) => e.problem_id.digit === digit)
        .flatMap((e) => e.dimensions),
    );
    const poolDims = new Set(
      pool.dimension_map.entries
        .filter((e) => e.problem_id.digit === digit)
        .flatMap((e) => e.dimensions),
    );
    if (
      eventDims.size !== poolDims.size ||
      ![...eventDims].every((d) => poolDims.has(d))
    ) {
      mismatches.push(
        `${digit}: pool=[${[...poolDims].join(",")}] event=[${[...eventDims].join(",")}]`,
      );
    }
  }
  if (mismatches.length > 0) {
    return { _tag: "dimmap_structural_mismatch", mismatches };
  }

  return null;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates a pool from the first event. Always succeeds.
 * Pool adopts the event's prompt_snapshot and dimension_map as reference.
 */
export function initPool(
  label: string,
  event: EventConfig,
  scores: readonly JSONScores[],
): ScorePool {
  // Validate each score's event_id matches the EventConfig
  for (const s of scores) {
    if (s.event_id !== event.event_id) {
      throw new Error(
        `initPool: score ${s.scores_id} has event_id "${s.event_id}" but EventConfig has "${event.event_id}"`,
      );
    }
  }

  const rawScores = scores.map((s) => encodeJSONScores(s));

  return decodePool({
    pool_id: crypto.randomUUID(),
    label,
    source_event_ids: [event.event_id],
    prompt_snapshot: encodeSnapshot(event.prompt_snapshot),
    dimension_map: encodeDimMap(event.dimension_map),
    created_at: new Date().toISOString(),
    scores: rawScores,
  });
}

/**
 * Add one score. Checks against pool reference.
 * New event_id → implicitly registered if compatible.
 */
export function addScore(
  pool: ScorePool,
  score: JSONScores,
  options?: { promptComparison?: PromptComparisonStrategy },
): Either.Either<ScorePool, PoolError> {
  const strategy = options?.promptComparison ?? strictSetHash;
  const error = checkScoreAgainstPool(pool, score, strategy);
  if (error !== null) {
    return Either.left(error);
  }

  // Encode existing pool to raw form, patch scores and event_ids, decode back
  const rawPool = encodePool(pool) as Record<string, unknown>;
  const existingScores = pool.scores.map((s) => encodeJSONScores(s));
  const newEventIds = pool.source_event_ids.includes(score.event_id as any)
    ? [...pool.source_event_ids]
    : [...pool.source_event_ids, score.event_id];

  const updated = decodePool({
    ...rawPool,
    source_event_ids: newEventIds,
    scores: [...existingScores, encodeJSONScores(score)],
  });

  return Either.right(updated);
}

/**
 * Add all scores from an event. Batch convenience.
 * Checks event config against pool first (fast fail), then adds all scores.
 */
export function addEvent(
  pool: ScorePool,
  event: EventConfig,
  scores: readonly JSONScores[],
  options?: { promptComparison?: PromptComparisonStrategy },
): Either.Either<ScorePool, PoolError> {
  const strategy = options?.promptComparison ?? strictSetHash;

  // 1. Check EventConfig against pool (fast fail)
  const eventError = checkEventAgainstPool(pool, event, strategy);
  if (eventError !== null) {
    return Either.left(eventError);
  }

  // 2. Check each score's event_id matches the EventConfig
  for (const s of scores) {
    if (s.event_id !== event.event_id) {
      return Either.left({
        _tag: "score_event_mismatch",
        expected: event.event_id,
        got: s.event_id,
      });
    }
  }

  // 3. Add each score, threading the pool through
  let current = pool;
  for (const s of scores) {
    const result = addScore(current, s, { promptComparison: strategy });
    if (Either.isLeft(result)) {
      return result;
    }
    current = result.right;
  }

  return Either.right(current);
}
