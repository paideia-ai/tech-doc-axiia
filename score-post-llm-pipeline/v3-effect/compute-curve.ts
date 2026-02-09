/**
 * Edge 2 — COMPUTE: ScorePool + CurveMethod → Curve
 *
 * Statistically computes grade boundary thresholds from a pool's score
 * distribution. Three methods: standard_deviation, percentile, absolute.
 *
 * Run: npx tsx v3-effect/compute-curve.ts
 */

import { Schema } from "effect";
import {
  type CurveMethod,
  type Dimension,
  type GradeThresholds,
  type ScorePool,
  type ScoreValue,
  Curve as CurveSchema,
  DIMENSIONS,
  ProblemDimensionMap,
  PromptSnapshot,
  decodeCurve,
} from "./schemas.js";

// =============================================================================
// Pure helpers
// =============================================================================

const toScoreValue = Schema.decodeSync(
  Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1),
    Schema.brand("ScoreValue"),
  ),
);

/** Arithmetic mean. Returns 0 for empty input. */
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/** Population standard deviation. */
const stddev = (values: readonly number[], mu: number): number => {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

/**
 * Percentile value using linear interpolation (the "exclusive" method).
 * `sorted` must be pre-sorted ascending; `p` in [0, 1].
 */
const percentileValue = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
};

/** Clamp to [0, 1] for ScoreValue validity. */
const clampScore = (n: number): number => Math.max(0, Math.min(1, n));

// =============================================================================
// thresholdsFromMethod
// =============================================================================

const encodeSnapshot = Schema.encodeSync(PromptSnapshot);
const encodeDimMap = Schema.encodeSync(ProblemDimensionMap);

function thresholdsFromMethod(
  values: readonly number[],
  method: CurveMethod,
): GradeThresholds {
  let a: number, b: number, c: number;

  switch (method.type) {
    case "standard_deviation": {
      const mu = mean(values);
      const sigma = stddev(values, mu);
      // sigma_boundaries: [A_k, B_k, C_k] → threshold = μ + k*σ
      a = clampScore(mu + method.sigma_boundaries[0] * sigma);
      b = clampScore(mu + method.sigma_boundaries[1] * sigma);
      c = clampScore(mu + method.sigma_boundaries[2] * sigma);
      break;
    }
    case "percentile": {
      const sorted = [...values].sort((x, y) => x - y);
      a = clampScore(percentileValue(sorted, method.percentiles[0]));
      b = clampScore(percentileValue(sorted, method.percentiles[1]));
      c = clampScore(percentileValue(sorted, method.percentiles[2]));
      break;
    }
    case "absolute": {
      a = method.thresholds[0];
      b = method.thresholds[1];
      c = method.thresholds[2];
      break;
    }
  }

  return {
    A: toScoreValue(a),
    B: toScoreValue(b),
    C: toScoreValue(c),
  } as GradeThresholds;
}

// =============================================================================
// computeCurve
// =============================================================================

/**
 * Compute a Curve from a ScorePool using the given method.
 *
 * For each category (per-problem, per-dimension, overall), collects the
 * relevant scores from all students in the pool, then applies the method
 * to derive grade boundary thresholds.
 */
export function computeCurve(
  pool: ScorePool,
  method: CurveMethod,
  label: string,
): typeof CurveSchema.Type {
  const scores = pool.scores;

  // 1. problem_curves: keyed by ProblemDigitId
  const problemDigits = new Set(
    pool.dimension_map.entries.map((e) => e.problem_id.digit),
  );
  const problem_curves: Record<string, GradeThresholds> = {};
  for (const digit of problemDigits) {
    const taskScores = scores
      .map((s) => s.problem_scores.find((ps) => ps.problem_id.digit === digit))
      .filter((ps) => ps !== undefined)
      .map((ps) => ps.task_score as number);
    problem_curves[digit] = thresholdsFromMethod(taskScores, method);
  }

  // 2. ability_curves: keyed by Dimension
  const ability_curves: Record<string, GradeThresholds> = {};
  for (const dim of DIMENSIONS) {
    const abilityScores = scores.map(
      (s) => s.ability_scores[dim] as number,
    );
    ability_curves[dim] = thresholdsFromMethod(abilityScores, method);
  }

  // 3. overall_mean: from final_total_score
  const totalScores = scores.map(
    (s) => s.totals.final_total_score as number,
  );
  const overall_mean = thresholdsFromMethod(totalScores, method);

  // 4. Re-encode provenance from decoded pool using Schema.encode
  //    (handles DateTimeUtc → ISO string correctly)
  const rawDimMap = encodeDimMap(pool.dimension_map);
  const rawSnapshot = encodeSnapshot(pool.prompt_snapshot);

  // Encode method for raw form
  const methodRaw =
    method.type === "standard_deviation"
      ? { type: "standard_deviation", sigma_boundaries: [...method.sigma_boundaries] }
      : method.type === "percentile"
        ? { type: "percentile", percentiles: [...method.percentiles] }
        : { type: "absolute", thresholds: [...method.thresholds] };

  return decodeCurve({
    curve_id: crypto.randomUUID(),
    label,
    source_event_ids: [...pool.source_event_ids],
    prompt_snapshot: rawSnapshot,
    dimension_map: rawDimMap,
    method: methodRaw,
    sample_size: scores.length,
    computed_at: new Date().toISOString(),
    overall_mean,
    ability_curves,
    problem_curves,
  });
}

// =============================================================================
// Exports for testing
// =============================================================================

export { mean, stddev, percentileValue, clampScore, thresholdsFromMethod };
