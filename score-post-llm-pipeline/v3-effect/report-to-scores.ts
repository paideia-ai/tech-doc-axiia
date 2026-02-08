/**
 * Transform: Report JSON (axiia-website) → JSONScores (v3-effect schema).
 *
 * Extracts numeric score data from a Report, builds the stored form,
 * and decodes it through the schema. Derived getters (ability_scores, totals)
 * are then compared against the Report's own aggregated values to verify
 * the schema computes the same numbers as the production system.
 *
 * Run: npx tsx v3-effect/report-to-scores.ts
 */

import { Option } from "effect";
import { DIMENSIONS, decodeJSONScores, type JSONScores } from "./schemas.js";
import type { Report } from "./report-fixture.js";
import { sampleReport } from "./report-fixture.js";
import { samplePromptSnapshotStored } from "./fixtures.js";

// ---------------------------------------------------------------------------
// 1. Transform: Report → JSONScores stored form
// ---------------------------------------------------------------------------

interface TransformContext {
  scores_id: string;
  event_id: string;
  prompt_snapshot: {
    git_hash: string;
    set_hash: string;
    entries: { key: string; sha256: string }[];
  };
  participant_id: string;
  dimension_map_id: string;
  dimension_map_label: string;
}

/**
 * Extract numeric scores from a Report into the JSONScores stored shape.
 *
 * The Report's problemId format is "NNNNNN-name" (e.g., "000340-meeting-verify").
 * We split it into { digit, name } for our ProblemId struct.
 */
function reportToScoresStored(report: Report, ctx: TransformContext) {
  const now = new Date().toISOString();

  // Build problem_scores from problemReports
  const problem_scores = report.problemReports.map((pr) => {
    const [digit, ...nameParts] = pr.problemId.split("-");
    const name = nameParts.join("-");

    // Build dimension_scores: all 5 keys, null for untested
    const dimension_scores: Record<string, number | null> = {};
    for (const dim of DIMENSIONS) {
      const detail = pr.dimensionDetails.find((d) => d.dimension === dim);
      dimension_scores[dim] = detail?.score ?? null;
    }

    return {
      problem_id: { digit, name },
      task_score: pr.score!,
      dimension_scores,
    };
  });

  // Build dimension_map entries from which dims each problem actually has
  const entries = report.problemReports.map((pr) => {
    const [digit, ...nameParts] = pr.problemId.split("-");
    return {
      problem_id: { digit, name: nameParts.join("-") },
      dimensions: pr.dimensionDetails.map((d) => d.dimension),
    };
  });

  return {
    scores_id: ctx.scores_id,
    event_id: ctx.event_id,
    prompt_snapshot: ctx.prompt_snapshot,
    dimension_map: {
      map_id: ctx.dimension_map_id,
      label: ctx.dimension_map_label,
      created_at: now,
      entries,
    },
    generated_at: now,
    participant_id: ctx.participant_id,
    problem_scores,
  };
}

// ---------------------------------------------------------------------------
// 2. Run: transform → decode → verify derived values match Report
// ---------------------------------------------------------------------------

const stored = reportToScoresStored(sampleReport, {
  scores_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  event_id: "spring-2024-final",
  prompt_snapshot: samplePromptSnapshotStored,
  participant_id: "student-0042",
  dimension_map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
  dimension_map_label: "2024 Spring Assessment v2",
});

console.log("=== Stored form (from Report) ===\n");
console.log(JSON.stringify(stored, null, 2));

// Decode through schema — this validates structure + computes derived getters
const decoded: JSONScores = decodeJSONScores(stored);

console.log("\n=== Decoded: derived ability_scores ===\n");
for (const dim of DIMENSIONS) {
  const val = decoded.ability_scores[dim];
  console.log(`  ${dim}: ${val.toFixed(4)}`);
}

console.log("\n=== Decoded: derived totals ===\n");
console.log(`  total_problem_score: ${decoded.totals.total_problem_score.toFixed(4)}`);
console.log(`  total_ability_score: ${decoded.totals.total_ability_score.toFixed(4)}`);
console.log(`  final_total_score:   ${decoded.totals.final_total_score.toFixed(4)}`);

// ---------------------------------------------------------------------------
// 3. Verify: compare derived values against Report's stored aggregates
// ---------------------------------------------------------------------------

console.log("\n=== Verification: schema-derived vs Report-stored ===\n");

const TOLERANCE = 1e-10;

function check(label: string, schemaVal: number, reportVal: number | undefined) {
  if (reportVal === undefined) {
    console.log(`  ${label}: SKIP (not in Report)`);
    return;
  }
  const diff = Math.abs(schemaVal - reportVal);
  const ok = diff < TOLERANCE;
  console.log(
    `  ${label}: ${ok ? "PASS" : "FAIL"}` +
      `  schema=${schemaVal.toFixed(6)} report=${reportVal.toFixed(6)} diff=${diff.toExponential(2)}`
  );
}

check("taskEvalMean / total_problem_score", decoded.totals.total_problem_score, sampleReport.taskEvalMean);
check("abilityMean / total_ability_score", decoded.totals.total_ability_score, sampleReport.abilityMean);
check("overallMean / final_total_score", decoded.totals.final_total_score, sampleReport.overallMean);

// Per-dimension: compare schema ability_scores vs Report dimensionReports[].score
for (const dim of DIMENSIONS) {
  const dimReport = sampleReport.dimensionReports.find((d) => d.dimension === dim);
  check(`ability[${dim}]`, decoded.ability_scores[dim], dimReport?.score);
}
