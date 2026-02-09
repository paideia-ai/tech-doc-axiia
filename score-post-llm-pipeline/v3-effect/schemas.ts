/**
 * Score Post-LLM Pipeline — Effect Schema (FP-native) v3
 *
 * 1. RECORD + OPTION — Per-problem dimension scores/grades use
 *    Record<Dimension, Option>. All 5 keys present; untested dims = None.
 *
 * 2. SCHEMA-LEVEL DERIVATION — ability_scores and totals are computed getters
 *    on the JSONScores class. They're part of the decoded type but NOT stored
 *    in JSON (Schema.Class only encodes declared fields).
 *
 * 3. EMBEDDED DimMap — ProblemDimensionMap is embedded directly (not by UUID).
 *    JSONScores is self-contained.
 *
 * 4. COMPOSITION — CurvedScores wraps JSONScores (via source).
 *
 * Scope: JSONScores, CurvedScores, Curve, ProblemDimensionMap, ScorePool,
 * EventConfig, and their dependencies.
 */

import { Schema, Option } from "effect";

// =============================================================================
// 1. Branded Primitives
// =============================================================================

/** Stable 6-digit identifier, last digit 0|1 (language: 0=zh, 1=en) */
export const ProblemDigitId = Schema.String.pipe(
  Schema.pattern(/^\d{6}$/),
  Schema.filter((s) => s[5] === "0" || s[5] === "1", {
    message: () => "Last digit must be 0 (zh) or 1 (en)",
  }),
  Schema.brand("ProblemDigitId")
);
export type ProblemDigitId = typeof ProblemDigitId.Type;

/** Two-part problem identifier: stable digit key + mutable human name */
export class ProblemId extends Schema.Class<ProblemId>("ProblemId")({
  digit: ProblemDigitId,
  name: Schema.String,
}) {}

/** SHA-256 content hash, exactly 64 hex chars */
export const Sha256Hex = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]{64}$/),
  Schema.brand("Sha256Hex")
);
export type Sha256Hex = typeof Sha256Hex.Type;

/** Git commit hash, 7–40 hex chars (for traceability) */
export const GitHash = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]{7,40}$/),
  Schema.brand("GitHash")
);
export type GitHash = typeof GitHash.Type;

// -- Prompt key validation (mirrors v1 PromptKeySchema) ----------------------

export const Lang = Schema.Literal("en", "zh");
export type Lang = typeof Lang.Type;

export const FrameworkPromptName = Schema.Literal(
  "ability-summary",
  "expert-review",
  "final-summary",
  "problem-ability",
  "problem-summary",
  "task-eval"
);
export type FrameworkPromptName = typeof FrameworkPromptName.Type;

export const ProblemPromptName = Schema.Literal("scoring", "task-eval");
export type ProblemPromptName = typeof ProblemPromptName.Type;

/** Folder-style problem identifier: "{6digits}-{name}" e.g. "000340-meeting-verify" */
const ProblemFolderId = Schema.String.pipe(
  Schema.pattern(/^\d{6}-.+$/),
  Schema.filter((s) => {
    const d = s[5];
    return d === "0" || d === "1" ? true : "Last digit must be 0 (zh) or 1 (en)";
  })
);

/**
 * Prompt key: path segments joined by `:`, mirroring the file hierarchy.
 *   Framework: "framework:{lang}:{name}"    e.g. "framework:zh:task-eval"
 *   Problems:  "problems:{folderId}:{name}" e.g. "problems:000340-meeting-verify:scoring"
 */
export const PromptKey = Schema.String.pipe(
  Schema.filter((value) => {
    const parts = value.split(":");
    if (parts.length !== 3) {
      return "Prompt key must have exactly 3 colon-separated segments: <type>:<scope>:<name>";
    }
    const [type, scope, name] = parts;
    if (type === "framework") {
      if (!Schema.is(Lang)(scope)) {
        return `Invalid framework lang "${scope}", expected "en" or "zh"`;
      }
      if (!Schema.is(FrameworkPromptName)(name)) {
        return `Invalid framework prompt name "${name}"`;
      }
      return true;
    }
    if (type === "problems") {
      if (!Schema.is(ProblemFolderId)(scope)) {
        return `Invalid problem folder id "${scope}", expected "{6digits}-{name}"`;
      }
      if (!Schema.is(ProblemPromptName)(name)) {
        return `Invalid problem prompt name "${name}"`;
      }
      return true;
    }
    return `Invalid prompt key type "${type}", expected "framework" or "problems"`;
  })
);
export type PromptKey = typeof PromptKey.Type;

/** One prompt file's identity: key + content hash */
export class PromptSnapshotEntry extends Schema.Class<PromptSnapshotEntry>("PromptSnapshotEntry")({
  key: PromptKey,
  sha256: Sha256Hex,
}) {}

/**
 * Full prompt manifest: git hash + per-file SHA-256s + set hash for O(1) equality.
 *
 * Key naming convention (enforced by PromptKey schema):
 *   Framework: "framework:{lang}:{name}"    e.g. "framework:zh:task-eval"
 *   Problems:  "problems:{folderId}:{name}" e.g. "problems:000340-meeting-verify:scoring"
 *
 * entries must be sorted by key with no duplicates.
 * set_hash is the SHA-256 of the sorted entries JSON — enables fast equality check.
 */
export class PromptSnapshot extends Schema.Class<PromptSnapshot>("PromptSnapshot")({
  git_hash: GitHash,
  set_hash: Sha256Hex,
  entries: Schema.Array(PromptSnapshotEntry).pipe(
    Schema.filter((entries) => {
      const keys = entries.map((e) => e.key);
      for (let i = 1; i < keys.length; i++) {
        if (keys[i] <= keys[i - 1]) return false;
      }
      return true;
    }, { message: () => "Entries must be sorted by key with no duplicates" })
  ),
}) {}

/** Score value clamped to [0, 1] */
export const ScoreValue = Schema.Number.pipe(
  Schema.greaterThanOrEqualTo(0),
  Schema.lessThanOrEqualTo(1),
  Schema.brand("ScoreValue")
);
export type ScoreValue = typeof ScoreValue.Type;

export const EventId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("EventId")
);
export type EventId = typeof EventId.Type;

// =============================================================================
// 2. Enums
// =============================================================================

export const DIMENSIONS = [
  "discovery",
  "representation",
  "iterative-refinement",
  "exploratory",
  "self-verification",
] as const;

export const Dimension = Schema.Literal(...DIMENSIONS);
export type Dimension = typeof Dimension.Type;

export const LetterGrade = Schema.Literal("A", "B", "C", "D");
export type LetterGrade = typeof LetterGrade.Type;

// =============================================================================
// 3. ProblemDimensionMap — standalone entity
// =============================================================================

export class DimMapEntry extends Schema.Class<DimMapEntry>("DimMapEntry")({
  problem_id: ProblemId,
  dimensions: Schema.Array(Dimension),
}) {}

export class ProblemDimensionMap extends Schema.Class<ProblemDimensionMap>("ProblemDimensionMap")({
  map_id: Schema.UUID,
  label: Schema.String,
  created_at: Schema.DateTimeUtc,
  entries: Schema.Array(DimMapEntry),
}) {}

// =============================================================================
// 4. Score Components
// =============================================================================

/**
 * Per-problem scores. All 5 dimension keys present;
 * untested dimensions are None (null in JSON).
 */
export class ProblemScore extends Schema.Class<ProblemScore>("ProblemScore")({
  problem_id: ProblemId,
  task_score: ScoreValue,
  dimension_scores: Schema.Record({
    key: Dimension,
    value: Schema.OptionFromNullOr(ScoreValue),
  }),
}) {}

// =============================================================================
// 5. JSONScores — Schema.Class with derived getters
//
// Stored fields (JSON): scores_id, event_id, ..., problem_scores
// Derived getters:      ability_scores, totals
//
// Getters are part of the decoded type but NOT serialized.
// Schema.Class only encodes declared fields.
//
// Formulas:
//   ability_scores[dim]  = arithmetic mean of that dim across mapped problems
//   total_problem_score  = arithmetic mean of task_scores
//   total_ability_score  = arithmetic mean of the 5 ability scores
//   final_total_score    = geometric mean: √(problem × ability)
// =============================================================================

/** Arithmetic mean. Returns 0 for empty input. */
const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

/** Geometric mean of two non-negative numbers: √(a × b) */
const geoMean2 = (a: number, b: number): number => Math.sqrt(a * b);

const toScoreValue = Schema.decodeSync(ScoreValue);

export class JSONScores extends Schema.Class<JSONScores>("JSONScores")({
  scores_id: Schema.UUID,
  event_id: EventId,
  prompt_snapshot: PromptSnapshot,
  dimension_map: ProblemDimensionMap,
  generated_at: Schema.DateTimeUtc,
  participant_id: Schema.String.pipe(Schema.minLength(1)),
  problem_scores: Schema.Array(ProblemScore),
}) {
  /** Per-dimension arithmetic mean across mapped problems (skip None) */
  get ability_scores(): { readonly [K in Dimension]: ScoreValue } {
    const entries = DIMENSIONS.map((dim) => {
      const values = this.problem_scores
        .map((p) => p.dimension_scores[dim])
        .filter(Option.isSome)
        .map((o) => o.value);
      return [dim, toScoreValue(mean(values))] as const;
    });
    return Object.fromEntries(entries) as {
      readonly [K in Dimension]: ScoreValue;
    };
  }

  /** Derived totals from problem_scores */
  get totals() {
    const abilities = this.ability_scores;
    const totalProblem = toScoreValue(
      mean(this.problem_scores.map((p) => p.task_score))
    );
    const totalAbility = toScoreValue(mean(Object.values(abilities)));
    const finalTotal = toScoreValue(geoMean2(totalProblem, totalAbility));
    return {
      total_problem_score: totalProblem,
      total_ability_score: totalAbility,
      final_total_score: finalTotal,
    } as const;
  }
}

// =============================================================================
// 6. Grades — per-problem grades use Record + Option (mirrors scores)
//
// Aggregates (ability_grades, overall_grade) ARE stored because
// computing them requires the curve function, not simple averaging.
// =============================================================================

/** Per-problem grades. Mirrors ProblemScore structure. */
export class ProblemGrade extends Schema.Class<ProblemGrade>("ProblemGrade")({
  problem_id: ProblemId,
  task_grade: LetterGrade,
  dimension_grades: Schema.Record({
    key: Dimension,
    value: Schema.OptionFromNullOr(LetterGrade),
  }),
}) {}

// =============================================================================
// 7. CurvedScores — composes JSONScores, adds grades
// =============================================================================

export class CurvedScores extends Schema.Class<CurvedScores>("CurvedScores")({
  curved_scores_id: Schema.UUID,
  source: JSONScores,
  applied_curve_id: Schema.UUID,
  curved_at: Schema.DateTimeUtc,
  problem_grades: Schema.Array(ProblemGrade),
  /** Stored because computing these requires the curve function */
  ability_grades: Schema.Record({ key: Dimension, value: LetterGrade }),
  /** Single overall grade from final_total_score — production only grades this one */
  overall_grade: LetterGrade,
}) {}

// =============================================================================
// 8. Curve — grade boundary thresholds computed from a ScorePool
//
// GradeThresholds: minimum scores for A, B, C. D is implied (below C).
// CurveMethod: discriminated union — currently only standard_deviation.
// Curve embeds ProblemDimensionMap (same pattern as JSONScores).
// problem_curves keyed by ProblemDigitId (the stable string part of ProblemId).
// overall_mean: single GradeThresholds for the final_total_score (production only grades this).
// =============================================================================

/** Minimum score thresholds for A/B/C. D = score < C threshold. */
export class GradeThresholds extends Schema.Class<GradeThresholds>("GradeThresholds")({
  A: ScoreValue,
  B: ScoreValue,
  C: ScoreValue,
}) {}

/**
 * Curve computation method (tagged union).
 *
 * standard_deviation: sigma_boundaries e.g. [1, 0, -1]
 *   → A ≥ μ+1σ, B ≥ μ, C ≥ μ-1σ, D < μ-1σ
 * percentile: percentiles e.g. [0.75, 0.50, 0.25]
 * absolute: fixed score thresholds
 */
export class CurveMethodStdDev extends Schema.Class<CurveMethodStdDev>("CurveMethodStdDev")({
  type: Schema.Literal("standard_deviation"),
  sigma_boundaries: Schema.Array(Schema.Number),
}) {}

export class CurveMethodPercentile extends Schema.Class<CurveMethodPercentile>("CurveMethodPercentile")({
  type: Schema.Literal("percentile"),
  percentiles: Schema.Array(
    Schema.Number.pipe(
      Schema.greaterThanOrEqualTo(0),
      Schema.lessThanOrEqualTo(1)
    )
  ),
}) {}

export class CurveMethodAbsolute extends Schema.Class<CurveMethodAbsolute>("CurveMethodAbsolute")({
  type: Schema.Literal("absolute"),
  thresholds: Schema.Array(ScoreValue),
}) {}

export const CurveMethod = Schema.Union(CurveMethodStdDev, CurveMethodPercentile, CurveMethodAbsolute);
export type CurveMethod = typeof CurveMethod.Type;

/**
 * Curve: computed from a ScorePool, used to assign letter grades.
 *
 * - source_event_ids: which events contributed scores (NonEmptyArray)
 * - dimension_map: embedded for compatibility checking when applying
 * - problem_curves keyed by ProblemDigitId (O(1) lookup)
 * - ability_curves keyed by Dimension (O(1) lookup)
 * - overall_mean: thresholds for the single graded total (final_total_score)
 */
export class Curve extends Schema.Class<Curve>("Curve")({
  curve_id: Schema.UUID,
  label: Schema.String.pipe(Schema.minLength(1)),
  source_event_ids: Schema.NonEmptyArray(EventId),
  prompt_snapshot: PromptSnapshot,
  dimension_map: ProblemDimensionMap,
  method: CurveMethod,
  sample_size: Schema.Number.pipe(
    Schema.int(),
    Schema.greaterThan(0)
  ),
  computed_at: Schema.DateTimeUtc,
  overall_mean: GradeThresholds,
  ability_curves: Schema.Record({ key: Dimension, value: GradeThresholds }),
  problem_curves: Schema.Record({
    key: ProblemDigitId,
    value: GradeThresholds,
  }),
}) {}

// =============================================================================
// 9. CompatibilityResult — check result before applying a Curve to JSONScores
//
// Three severity tiers:
//   structural:  must all pass for application to be physically possible
//   provenance:  should match for results to be meaningful
//   advisory:    informational, never block application
//
// Status derivation:
//   Any structural fail       → "incompatible"
//   All structural pass,
//     any provenance fail     → "requires_override"
//   All pass                  → "compatible"
// =============================================================================

export class CheckPass extends Schema.Class<CheckPass>("CheckPass")({
  status: Schema.Literal("pass"),
}) {}

export class CheckFail extends Schema.Class<CheckFail>("CheckFail")({
  status: Schema.Literal("fail"),
  message: Schema.String,
  items: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
}) {}

export const CheckOutcome = Schema.Union(CheckPass, CheckFail);
export type CheckOutcome = typeof CheckOutcome.Type;

export class CompatibilityResult extends Schema.Class<CompatibilityResult>("CompatibilityResult")({
  status: Schema.Literal("compatible", "incompatible", "requires_override"),

  structural: Schema.Struct({
    problem_coverage: CheckOutcome,
    dimmap_structural: CheckOutcome,
    threshold_ordering: CheckOutcome,
  }),

  provenance: Schema.Struct({
    prompt_version: CheckOutcome,
    event_membership: CheckOutcome,
    dimmap_identity: CheckOutcome,
  }),

  advisory: Schema.Struct({
    extra_curve_problems: CheckOutcome,
    sample_size: CheckOutcome,
    staleness: CheckOutcome,
    score_range: CheckOutcome,
  }),
}) {}

export const decodeCompatibilityResult =
  Schema.decodeUnknownSync(CompatibilityResult);

// =============================================================================
// 10. ScorePool — aggregated scores for curve computation
//
// Collects JSONScores from a cohort so a Curve can be computed from them.
// Shares provenance fields with Curve: source_event_ids, prompt_snapshot,
// dimension_map. Embeds full JSONScores (self-contained snapshot, no lookups).
// =============================================================================

export class ScorePool extends Schema.Class<ScorePool>("ScorePool")({
  pool_id: Schema.UUID,
  label: Schema.String.pipe(Schema.minLength(1)),
  source_event_ids: Schema.NonEmptyArray(EventId),
  prompt_snapshot: PromptSnapshot,
  dimension_map: ProblemDimensionMap,
  created_at: Schema.DateTimeUtc,
  scores: Schema.Array(JSONScores),
}) {}

// =============================================================================
// 11. EventConfig — assessment event configuration
//
// Defines an event's scoring context: which problems, which prompts,
// which dimension mapping, and when the event took place.
// =============================================================================

export class EventConfig extends Schema.Class<EventConfig>("EventConfig")({
  event_id: EventId,
  problem_ids: Schema.NonEmptyArray(ProblemId),
  prompt_snapshot: PromptSnapshot,
  dimension_map: ProblemDimensionMap,
  event_date: Schema.DateTimeUtc,
}) {}

// =============================================================================
// Decode / Encode helpers
// =============================================================================

export const decodeEventConfig = Schema.decodeUnknownSync(EventConfig);
export const decodePromptSnapshot = Schema.decodeUnknownSync(PromptSnapshot);
export const decodeJSONScores = Schema.decodeUnknownSync(JSONScores);
export const decodeCurvedScores = Schema.decodeUnknownSync(CurvedScores);
export const decodeCurve = Schema.decodeUnknownSync(Curve);
export const decodeScorePool = Schema.decodeUnknownSync(ScorePool);
export const decodeProblemDimensionMap =
  Schema.decodeUnknownSync(ProblemDimensionMap);

export const encodeEventConfig = Schema.encodeSync(EventConfig);
export const encodePromptSnapshot = Schema.encodeSync(PromptSnapshot);
export const encodeJSONScores = Schema.encodeSync(JSONScores);
export const encodeCurvedScores = Schema.encodeSync(CurvedScores);
export const encodeCurve = Schema.encodeSync(Curve);
export const encodeScorePool = Schema.encodeSync(ScorePool);
export const encodeProblemDimensionMap = Schema.encodeSync(ProblemDimensionMap);
