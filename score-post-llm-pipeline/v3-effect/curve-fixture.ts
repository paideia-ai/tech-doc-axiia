/**
 * Curve fixtures for testing compatibility checks and curve application.
 *
 * Two builder functions derive Curves from a JSONScores instance:
 *
 *   buildCompatibleCurve(scores)   — matches exactly (same prompt hash,
 *                                    event, dimension map, all problems)
 *   buildIncompatibleCurve(scores) — deliberately broken: missing problem,
 *                                    wrong prompt hash, different event
 *
 * Thresholds: A ≥ 0.85, B ≥ 0.72, C ≥ 0.55, D < 0.55
 *
 * Run: npx tsx v3-effect/curve-fixture.ts
 */

import { Schema } from "effect";
import {
  type Curve,
  type JSONScores,
  Curve as CurveSchema,
  DIMENSIONS,
  decodeCurve,
  decodeJSONScores,
} from "./schemas.js";
import { sampleReport } from "./report-fixture.js";
import { samplePromptSnapshotStored } from "./fixtures.js";

// =============================================================================
// Shared threshold: A ≥ 0.85, B ≥ 0.72, C ≥ 0.55
// =============================================================================

const T = { A: 0.85, B: 0.72, C: 0.55 } as const;

// =============================================================================
// Constructors
// =============================================================================

/**
 * Build a compatible Curve from scores.
 * Copies prompt_snapshot, event_id, and dimension_map so all
 * provenance checks pass. Covers every problem in scores.
 */
export function buildCompatibleCurve(scores: JSONScores): Curve {
  const problem_curves: Record<string, typeof T> = {};
  for (const ps of scores.problem_scores) {
    problem_curves[ps.problem_id.digit] = { ...T };
  }

  const ability_curves: Record<string, typeof T> = {};
  for (const dim of DIMENSIONS) {
    ability_curves[dim] = { ...T };
  }

  // Re-encode the dimension_map from the decoded scores so the raw form
  // (ISO strings for DateTimeUtc, etc.) passes through decodeCurve cleanly.
  const dimMapEntries = scores.dimension_map.entries.map((e) => ({
    problem_id: { digit: e.problem_id.digit, name: e.problem_id.name },
    dimensions: [...e.dimensions],
  }));

  // Re-encode the prompt_snapshot from decoded scores
  const promptSnap = {
    git_hash: scores.prompt_snapshot.git_hash,
    set_hash: scores.prompt_snapshot.set_hash,
    entries: scores.prompt_snapshot.entries.map((e) => ({
      key: e.key,
      sha256: e.sha256,
    })),
  };

  return decodeCurve({
    curve_id: "11111111-2222-3333-4444-555555555555",
    label: "Spring 2024 Standard Deviation Curve",
    source_event_ids: [scores.event_id],
    prompt_snapshot: promptSnap,
    dimension_map: {
      map_id: scores.dimension_map.map_id,
      label: scores.dimension_map.label,
      created_at: "2024-06-01T00:00:00.000Z",
      entries: dimMapEntries,
    },
    method: { type: "standard_deviation", sigma_boundaries: [1, 0, -1] },
    sample_size: 120,
    computed_at: "2024-06-15T00:00:00.000Z",
    overall_mean: { ...T },
    ability_curves,
    problem_curves,
  });
}

/**
 * Build an incompatible Curve from scores.
 * Deliberately broken in multiple ways:
 *   structural:  omits the last problem, dimmap only has first two entries
 *   provenance:  different prompt snapshot (changed framework:zh:task-eval + different set_hash),
 *                wrong event, different map_id
 *   advisory:    sample_size = 15 (< 30 for std_dev)
 */
export function buildIncompatibleCurve(scores: JSONScores): Curve {
  // Only first two problems — last deliberately omitted
  const problem_curves: Record<string, typeof T> = {};
  for (const ps of scores.problem_scores.slice(0, 2)) {
    problem_curves[ps.problem_id.digit] = { ...T };
  }

  const ability_curves: Record<string, typeof T> = {};
  for (const dim of DIMENSIONS) {
    ability_curves[dim] = { ...T };
  }

  const partialEntries = scores.dimension_map.entries.slice(0, 2).map((e) => ({
    problem_id: { digit: e.problem_id.digit, name: e.problem_id.name },
    dimensions: [...e.dimensions],
  }));

  // Snapshot with different git_hash, different set_hash, and one changed entry
  // (framework:zh:task-eval sha256 differs) — for per-entry diagnostic testing.
  const incompatibleSnapshot = {
    git_hash: "fffffff",
    set_hash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    entries: [
      { key: "framework:zh:ability-summary",  sha256: "1000000000000000000000000000000000000000000000000000000000000001" },
      { key: "framework:zh:expert-review",    sha256: "1000000000000000000000000000000000000000000000000000000000000002" },
      { key: "framework:zh:final-summary",    sha256: "1000000000000000000000000000000000000000000000000000000000000003" },
      { key: "framework:zh:problem-ability",  sha256: "1000000000000000000000000000000000000000000000000000000000000004" },
      { key: "framework:zh:problem-summary",  sha256: "1000000000000000000000000000000000000000000000000000000000000005" },
      // Changed: framework:zh:task-eval has a different sha256
      { key: "framework:zh:task-eval",        sha256: "ffff000000000000000000000000000000000000000000000000000000000006" },
      { key: "problem:000340:scoring",        sha256: "2000000000000000000000000000000000000000000000000000000000000001" },
      { key: "problem:000340:task-eval",      sha256: "2000000000000000000000000000000000000000000000000000000000000002" },
      { key: "problem:000500:scoring",        sha256: "3000000000000000000000000000000000000000000000000000000000000001" },
      { key: "problem:000500:task-eval",      sha256: "3000000000000000000000000000000000000000000000000000000000000002" },
      { key: "problem:001001:scoring",        sha256: "4000000000000000000000000000000000000000000000000000000000000001" },
      { key: "problem:001001:task-eval",      sha256: "4000000000000000000000000000000000000000000000000000000000000002" },
    ],
  };

  return decodeCurve({
    curve_id: "66666666-7777-8888-9999-aaaaaaaaaaaa",
    label: "Deliberately Incompatible Curve",
    source_event_ids: ["different-event"],
    prompt_snapshot: incompatibleSnapshot,
    dimension_map: {
      map_id: "00000000-0000-0000-0000-000000000000",
      label: "Wrong map",
      created_at: "2024-06-01T00:00:00.000Z",
      entries: partialEntries,
    },
    method: { type: "standard_deviation", sigma_boundaries: [1, 0, -1] },
    sample_size: 15,
    computed_at: "2024-06-15T00:00:00.000Z",
    overall_mean: { ...T },
    ability_curves,
    problem_curves,
  });
}

// =============================================================================
// Build scores from sampleReport (same as apply-curve.ts)
// =============================================================================

function buildScoresFromReport(): JSONScores {
  const now = "2024-06-10T00:00:00.000Z";
  const problem_scores = sampleReport.problemReports.map((pr) => {
    const [digit, ...nameParts] = pr.problemId.split("-");
    const dimension_scores: Record<string, number | null> = {};
    for (const dim of DIMENSIONS) {
      const detail = pr.dimensionDetails.find((d) => d.dimension === dim);
      dimension_scores[dim] = detail?.score ?? null;
    }
    return {
      problem_id: { digit, name: nameParts.join("-") },
      task_score: pr.score!,
      dimension_scores,
    };
  });
  const entries = sampleReport.problemReports.map((pr) => {
    const [digit, ...nameParts] = pr.problemId.split("-");
    return {
      problem_id: { digit, name: nameParts.join("-") },
      dimensions: pr.dimensionDetails.map((d) => d.dimension),
    };
  });
  return decodeJSONScores({
    scores_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    event_id: "spring-2024-final",
    prompt_snapshot: samplePromptSnapshotStored,
    participant_id: "student-0042",
    dimension_map: {
      map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
      label: "2024 Spring Assessment v2",
      created_at: now,
      entries,
    },
    generated_at: now,
    problem_scores,
  });
}

// =============================================================================
// Run: build + pretty-print decoded fixtures (only when executed directly)
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const scores = buildScoresFromReport();
  const encodeCurve = Schema.encodeSync(CurveSchema);

  console.log("=== Compatible Curve (full encoded form) ===\n");
  const compatible = buildCompatibleCurve(scores);
  console.log(JSON.stringify(encodeCurve(compatible), null, 2));

  console.log("\n=== Incompatible Curve (full encoded form) ===\n");
  const incompatible = buildIncompatibleCurve(scores);
  console.log(JSON.stringify(encodeCurve(incompatible), null, 2));
}
