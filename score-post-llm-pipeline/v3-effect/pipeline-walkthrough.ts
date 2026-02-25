/**
 * Pipeline Walkthrough — annotated end-to-end tutorial
 *
 * Walks through all 4 pipeline edges in order:
 *   Edge 1 — COLLECT:  score-pool-builder  (initPool, addScore)
 *   Edge 2 — COMPUTE:  compute-curve       (computeCurve)
 *   Edge 3 — CHECK:    apply-curve         (checkCompatibility)
 *   Edge 4 — APPLY:    apply-curve         (applyCurve)
 *
 * Each section is heavily commented to explain the "why" behind each
 * Effect Schema pattern. This is a teaching script, not a test suite.
 *
 * Run: npx tsx v3-effect/pipeline-walkthrough.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Option, Either, Schema } from "effect";
import {
  type CurveMethod,
  type JSONScores,
  type EventConfig,
  JSONScores as JSONScoresSchema,
  CurvedScores,
  DIMENSIONS,
  decodeJSONScores,
  decodeEventConfig,
} from "./schemas.js";
import { samplePromptSnapshotStored } from "./fixtures.js";
import { initPool, addScore, formatPoolError } from "./score-pool-builder.js";
import { computeCurve } from "./compute-curve.js";
import { checkCompatibility, applyCurve } from "./apply-curve.js";

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Section 1: Load from file + decode raw JSON → typed instances           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// The canonical entry point for any schema type is a 3-step pattern:
//   1. readFileSync  → raw string
//   2. JSON.parse    → unknown JS object
//   3. decodeXxx()   → fully typed, branded, validated instance
//
// decodeJSONScores is Schema.decodeUnknownSync(JSONScores). It:
//   - Validates every field (ProblemDigitId must be 6 digits, ScoreValue ∈ [0,1])
//   - Brands primitives (ScoreValue, ProblemDigitId, EventId, etc.)
//   - Transforms JSON null → Option.None for dimension_scores
//   - Throws a ParseError if anything is invalid
//
// After decoding, the object is a Schema.Class instance with full type safety.

console.log("╔═══════════════════════════════════════════════════════════════╗");
console.log("║  Section 1: Load from file → decode                         ║");
console.log("╚═══════════════════════════════════════════════════════════════╝\n");

const scoresPath = path.join(import.meta.dirname!, "test-data", "scores.json");
const rawJson: unknown = JSON.parse(fs.readFileSync(scoresPath, "utf-8"));
const scores: JSONScores = decodeJSONScores(rawJson);

console.log(`Loaded: ${scoresPath}`);
console.log(`  scores_id:      ${scores.scores_id}`);
console.log(`  event_id:       ${scores.event_id}`);
console.log(`  participant_id: ${scores.participant_id}`);
console.log(`  problems:       ${scores.problem_scores.length}`);

// Demonstrate that invalid data throws. ScoreValue > 1 is rejected:
try {
  decodeJSONScores({
    ...rawJson as object,
    problem_scores: [{
      problem_id: { digit: "000340", name: "test" },
      task_score: 1.5, // Invalid: ScoreValue must be ≤ 1
      dimension_scores: {
        "Discovery-Self-Understanding": null,
        "Expression-Translation": null,
        "Exploratory-Discovery": null,
        "Verification-Confirmation": null,
        "Iterative-Optimization": null,
      },
    }],
  });
  console.log("  ERROR: should have thrown!");
} catch (e) {
  console.log(`\n  Validation demo: task_score=1.5 → rejected (ScoreValue must be ≤ 1)`);
}

console.log("");

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Section 2: Derived getters — computed on access, not stored            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// JSONScores is a Schema.Class. It declares stored fields (scores_id, event_id,
// problem_scores, etc.) AND has TypeScript getter properties:
//   - ability_scores: per-dimension arithmetic mean across mapped problems
//   - totals: total_problem_score, total_ability_score, final_total_score
//
// These getters are computed on access — they're part of the decoded type
// but NOT part of the serialized JSON. Schema.Class only encodes declared fields.
//
// Formulas:
//   ability_scores[dim] = mean of that dim's scores across all problems (skip None)
//   total_problem_score = mean of all task_scores
//   total_ability_score = mean of the 5 ability scores
//   final_total_score   = arithmetic mean: (problem + ability) / 2

console.log("╔═══════════════════════════════════════════════════════════════╗");
console.log("║  Section 2: Derived getters                                 ║");
console.log("╚═══════════════════════════════════════════════════════════════╝\n");

const abilities = scores.ability_scores;
console.log("ability_scores (computed on access, not stored in JSON):");
for (const dim of DIMENSIONS) {
  console.log(`  ${dim}: ${(abilities[dim] as number).toFixed(4)}`);
}

const totals = scores.totals;
console.log(`\ntotals (also computed, not stored):`);
console.log(`  total_problem_score: ${(totals.total_problem_score as number).toFixed(4)}`);
console.log(`  total_ability_score: ${(totals.total_ability_score as number).toFixed(4)}`);
console.log(`  final_total_score:   ${(totals.final_total_score as number).toFixed(4)}`);

// Prove that encoding strips derived getters:
const encodeJSONScores = Schema.encodeSync(JSONScoresSchema);
const encoded = encodeJSONScores(scores) as Record<string, unknown>;
console.log(`\nEncoded form has ability_scores? ${"ability_scores" in encoded}`);  // false
console.log(`Encoded form has totals?          ${"totals" in encoded}`);           // false
console.log(`Encoded form has problem_scores?  ${"problem_scores" in encoded}`);   // true

console.log("");

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Section 3: Working with Option (dimension_scores)                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// In JSON, untested dimensions are null. Effect Schema transforms these to
// Option.None via Schema.OptionFromNullOr. Tested dimensions become
// Option.Some(ScoreValue).
//
// Pattern for working with Options:
//   Option.isSome(opt) → opt.value is the unwrapped ScoreValue
//   Option.isNone(opt) → dimension was not tested for this problem
//
// To collect only tested dimensions:
//   .filter(Option.isSome).map(o => o.value)

console.log("╔═══════════════════════════════════════════════════════════════╗");
console.log("║  Section 3: Working with Option                             ║");
console.log("╚═══════════════════════════════════════════════════════════════╝\n");

for (const ps of scores.problem_scores) {
  const tested: string[] = [];
  const untested: string[] = [];

  for (const dim of DIMENSIONS) {
    const opt = ps.dimension_scores[dim];
    // Option.isSome → dimension was tested, value is the score
    // Option.isNone → JSON null → dimension not tested for this problem
    if (Option.isSome(opt)) {
      tested.push(`${dim}=${(opt.value as number).toFixed(2)}`);
    } else {
      untested.push(dim);
    }
  }

  console.log(`  ${ps.problem_id.digit} (${ps.problem_id.name}):`);
  console.log(`    tested:   [${tested.join(", ")}]`);
  if (untested.length > 0) {
    console.log(`    untested: [${untested.join(", ")}]`);
  }
}

// Collecting all tested dims across all problems using the filter pattern:
const allTestedDims = new Set(
  scores.problem_scores.flatMap((ps) =>
    DIMENSIONS.filter((dim) => Option.isSome(ps.dimension_scores[dim]))
  ),
);
console.log(`\n  All tested dimensions: [${[...allTestedDims].join(", ")}]`);

console.log("");

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Section 4: Build a ScorePool (Edge 1 — COLLECT)                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// In production, scores arrive as individual JSON files — one per student
// per event. The standard pattern is:
//   list files → load each → JSON.parse → decodeJSONScores → feed into pool
//
// ScorePool construction:
//   initPool(label, eventConfig, initialScores[])  — seeds the pool
//   addScore(pool, score)                          — returns Either<ScorePool, PoolError>
//
// Either: Right = success (new pool), Left = error (PoolError).
// Errors are tagged unions: prompt_snapshot_mismatch, dimmap_structural_mismatch,
// duplicate_score, etc. Use formatPoolError to get a human-readable message.
//
// The pool adopts the first event's prompt_snapshot and dimension_map as its
// reference. Subsequent scores must match structurally.

console.log("╔═══════════════════════════════════════════════════════════════╗");
console.log("║  Section 4: Build a ScorePool (Edge 1 — COLLECT)            ║");
console.log("╚═══════════════════════════════════════════════════════════════╝\n");

const NOW = "2024-06-10T00:00:00.000Z";

// Shared dimension map and prompt snapshot — in production these come from config
const dimMapRaw = {
  map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
  label: "2024 Spring Assessment v2",
  created_at: NOW,
  entries: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Expression-Translation",
        "Exploratory-Discovery",
      ],
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Verification-Confirmation",
        "Iterative-Optimization",
      ],
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Expression-Translation",
        "Exploratory-Discovery",
        "Verification-Confirmation",
        "Iterative-Optimization",
      ],
    },
  ],
};

const problemIds = [
  { digit: "000340", name: "meeting-verify" },
  { digit: "000500", name: "thinking-traps" },
  { digit: "001001", name: "ling-bing" },
];

/** Helper: build a JSONScores with varied scores and a distinct ability profile. */
function makeScore(
  scoresId: string,
  eventId: string,
  taskScores: [number, number, number],
  dimScale: [number, number, number, number, number],
): JSONScores {
  const [disc, expr, expl, verif, iter] = dimScale;
  const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));
  return decodeJSONScores({
    scores_id: scoresId,
    event_id: eventId,
    prompt_snapshot: samplePromptSnapshotStored,
    dimension_map: dimMapRaw,
    generated_at: NOW,
    participant_id: `student-${scoresId.slice(0, 4)}`,
    problem_scores: [
      {
        problem_id: { digit: "000340", name: "meeting-verify" },
        task_score: taskScores[0],
        dimension_scores: {
          "Discovery-Self-Understanding": clamp(0.85 * disc),
          "Expression-Translation": clamp(0.78 * expr),
          "Exploratory-Discovery": clamp(0.72 * expl),
          "Verification-Confirmation": null,
          "Iterative-Optimization": null,
        },
      },
      {
        problem_id: { digit: "000500", name: "thinking-traps" },
        task_score: taskScores[1],
        dimension_scores: {
          "Discovery-Self-Understanding": clamp(0.90 * disc),
          "Expression-Translation": null,
          "Exploratory-Discovery": null,
          "Verification-Confirmation": clamp(0.65 * verif),
          "Iterative-Optimization": clamp(0.70 * iter),
        },
      },
      {
        problem_id: { digit: "001001", name: "ling-bing" },
        task_score: taskScores[2],
        dimension_scores: {
          "Discovery-Self-Understanding": clamp(0.88 * disc),
          "Expression-Translation": clamp(0.82 * expr),
          "Exploratory-Discovery": clamp(0.79 * expl),
          "Verification-Confirmation": clamp(0.71 * verif),
          "Iterative-Optimization": clamp(0.68 * iter),
        },
      },
    ],
  });
}

// Create an EventConfig (same 3-step pattern: raw object → decodeEventConfig)
const event: EventConfig = decodeEventConfig({
  event_id: "spring-2024-final",
  problem_ids: problemIds,
  prompt_snapshot: samplePromptSnapshotStored,
  dimension_map: dimMapRaw,
  event_date: NOW,
});

// Build 4 students with varied performance profiles
const studentScores: JSONScores[] = [
  makeScore("aaaaaaaa-0001-4000-8000-000000000001", "spring-2024-final", [0.90, 0.85, 0.92], [1.05, 1.10, 1.00, 0.95, 1.00]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000002", "spring-2024-final", [0.80, 0.75, 0.82], [1.00, 1.00, 1.00, 1.00, 1.00]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000003", "spring-2024-final", [0.60, 0.55, 0.62], [0.80, 0.75, 0.80, 0.85, 0.80]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000004", "spring-2024-final", [0.45, 0.40, 0.48], [0.65, 0.60, 0.65, 0.65, 0.60]),
];

// initPool: seeds pool with first event + first batch of scores. Always succeeds.
let pool = initPool("Spring 2024 Pool", event, [studentScores[0]]);
console.log(`initPool: ${pool.scores.length} score(s), events: [${pool.source_event_ids.join(", ")}]`);

// addScore: returns Either<ScorePool, PoolError>.
// Right = success → updated pool. Left = rejection with tagged error.
for (let i = 1; i < studentScores.length; i++) {
  const result = addScore(pool, studentScores[i]);
  if (Either.isRight(result)) {
    pool = result.right;
    console.log(`addScore(student ${i + 1}): success → pool now has ${pool.scores.length} score(s)`);
  } else {
    // Either.isLeft → PoolError (shouldn't happen here)
    console.log(`addScore(student ${i + 1}): REJECTED → ${formatPoolError(result.left)}`);
  }
}

// Demonstrate rejection: try adding a duplicate score (same scores_id)
const duplicateResult = addScore(pool, studentScores[0]);
if (Either.isLeft(duplicateResult)) {
  console.log(`\n  Rejection demo: duplicate score → ${formatPoolError(duplicateResult.left)}`);
}

console.log(`\nFinal pool: ${pool.scores.length} students`);
console.log("");

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Section 5: Compute a Curve (Edge 2 — COMPUTE)                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// computeCurve(pool, method, label) takes a ScorePool and a CurveMethod,
// then statistically derives grade boundary thresholds from the pool's score
// distribution.
//
// CurveMethod is a tagged union with three variants:
//   standard_deviation: sigma_boundaries e.g. [1, 0, -1]
//     → A ≥ μ+1σ, B ≥ μ, C ≥ μ-1σ, D < μ-1σ
//   percentile: percentiles e.g. [0.75, 0.50, 0.25]
//   absolute: fixed thresholds (no statistics needed)
//
// The curve produces per-problem thresholds, per-dimension (ability) thresholds,
// and an overall_mean threshold — each is a GradeThresholds { A, B, C }.
// Thresholds vary because each category has a different score distribution.
//
// GOTCHA: Provenance fields (prompt_snapshot, dimension_map) contain DateTimeUtc.
// computeCurve internally uses Schema.encodeSync(PromptSnapshot) and
// Schema.encodeSync(ProblemDimensionMap) to re-encode them correctly.
// Never use .toString() on DateTimeUtc — it produces "DateTime.Utc(...)" format
// which fails decodeCurve. Always use Schema.encodeSync for re-encoding.

console.log("╔═══════════════════════════════════════════════════════════════╗");
console.log("║  Section 5: Compute a Curve (Edge 2 — COMPUTE)              ║");
console.log("╚═══════════════════════════════════════════════════════════════╝\n");

const stdDevMethod: CurveMethod = {
  type: "standard_deviation",
  sigma_boundaries: [1, 0, -1],
} as CurveMethod;

const curve = computeCurve(pool, stdDevMethod, "Walkthrough StdDev Curve");

console.log(`Curve computed: ${curve.label}`);
console.log(`  method: ${curve.method.type}, sample_size: ${curve.sample_size}`);

console.log("\nProblem thresholds (vary per-problem based on score distribution):");
for (const [digit, t] of Object.entries(curve.problem_curves)) {
  console.log(`  ${digit}: A≥${t.A.toFixed(3)}  B≥${t.B.toFixed(3)}  C≥${t.C.toFixed(3)}`);
}

console.log("\nAbility thresholds (vary per-dimension):");
for (const dim of DIMENSIONS) {
  const t = curve.ability_curves[dim];
  console.log(`  ${dim}: A≥${t.A.toFixed(3)}  B≥${t.B.toFixed(3)}  C≥${t.C.toFixed(3)}`);
}

const om = curve.overall_mean;
console.log(`\nOverall: A≥${om.A.toFixed(3)}  B≥${om.B.toFixed(3)}  C≥${om.C.toFixed(3)}`);

// Note: percentile and absolute methods are also available.
// percentile: { type: "percentile", percentiles: [0.75, 0.50, 0.25] }
// absolute:   { type: "absolute", thresholds: [0.85, 0.72, 0.55] }

console.log("");

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Section 6: Check + Apply (Edges 3+4 — CHECK + APPLY)                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// Before applying a curve to a student's scores, run checkCompatibility to
// verify structural, provenance, and advisory requirements.
//
// CompatibilityResult has three severity tiers:
//   structural:  MUST pass — problems covered, dimmap matches, thresholds ordered
//   provenance:  SHOULD match — prompt version, event membership, dimmap identity
//   advisory:    informational — extra problems, sample size, staleness, score range
//
// Status derivation:
//   Any structural fail       → "incompatible" (applyCurve will throw)
//   All structural pass,
//     any provenance fail     → "requires_override" (must opt in)
//   All pass                  → "compatible" (applyCurve proceeds)
//
// applyCurve(curve, scores) runs the check internally, then assigns:
//   - Per-problem task_grade + dimension_grades (Option for untested dims)
//   - Per-dimension ability_grades
//   - Single overall_grade from final_total_score

console.log("╔═══════════════════════════════════════════════════════════════╗");
console.log("║  Section 6: Check + Apply (Edges 3+4)                       ║");
console.log("╚═══════════════════════════════════════════════════════════════╝\n");

// Pick student 2 (middle performer) to grade
const targetStudent = studentScores[1];
console.log(`Target student: ${targetStudent.participant_id}`);

// Edge 3 — CHECK
const compat = checkCompatibility(curve, targetStudent);
console.log(`\nCompatibility status: ${compat.status}`);
console.log("  Structural checks:");
console.log(`    problem_coverage:   ${compat.structural.problem_coverage.status}`);
console.log(`    dimmap_structural:  ${compat.structural.dimmap_structural.status}`);
console.log(`    threshold_ordering: ${compat.structural.threshold_ordering.status}`);
console.log("  Provenance checks:");
console.log(`    prompt_version:     ${compat.provenance.prompt_version.status}`);
console.log(`    event_membership:   ${compat.provenance.event_membership.status}`);
console.log(`    dimmap_identity:    ${compat.provenance.dimmap_identity.status}`);
console.log("  Advisory checks:");
console.log(`    sample_size:        ${compat.advisory.sample_size.status}`);
console.log(`    staleness:          ${compat.advisory.staleness.status}`);

// Edge 4 — APPLY
const curved = applyCurve(curve, targetStudent);

console.log("\nProblem grades:");
for (const pg of curved.problem_grades) {
  const dimGrades = DIMENSIONS.map((d) => {
    const opt = pg.dimension_grades[d];
    return `${d}=${Option.isSome(opt) ? opt.value : "-"}`;
  }).join(", ");
  console.log(`  ${pg.problem_id.digit} (${pg.problem_id.name}): task=${pg.task_grade}  [${dimGrades}]`);
}

console.log("\nAbility grades:");
for (const dim of DIMENSIONS) {
  console.log(`  ${dim}: ${curved.ability_grades[dim]}`);
}

console.log(`\nOverall grade: ${curved.overall_grade}`);
console.log("");

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Section 7: Encode → JSON output (round-trip)                            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// The reverse of Section 1's decode: encode a typed instance back to plain JSON.
//   Schema.encodeSync(CurvedScores)(curved)  → plain JS object
//   JSON.stringify                            → string
//   writeFileSync                             → file
//
// This completes the round-trip: raw JSON → decode → process → encode → JSON
//
// Key points:
//   - encodeSync strips derived getters (ability_scores, totals on source)
//   - encodeSync converts DateTimeUtc back to ISO string
//   - encodeSync converts Option.None back to null
//   - The output is a self-contained JSON snapshot

console.log("╔═══════════════════════════════════════════════════════════════╗");
console.log("║  Section 7: Encode → JSON output                            ║");
console.log("╚═══════════════════════════════════════════════════════════════╝\n");

const encodeCurvedScores = Schema.encodeSync(CurvedScores);
const curvedEncoded = encodeCurvedScores(curved);

const outPath = path.join(import.meta.dirname!, "test-data", "walkthrough-output.json");
fs.writeFileSync(outPath, JSON.stringify(curvedEncoded, null, 2) + "\n");
console.log(`Wrote: ${outPath}`);

// Verify the round-trip: key fields should be present
const roundTrip = curvedEncoded as Record<string, unknown>;
console.log(`\nRound-trip verification:`);
console.log(`  has curved_scores_id?  ${typeof roundTrip.curved_scores_id === "string"}`);
console.log(`  has source?            ${typeof roundTrip.source === "object"}`);
console.log(`  has problem_grades?    ${Array.isArray(roundTrip.problem_grades)}`);
console.log(`  has overall_grade?     ${typeof roundTrip.overall_grade === "string"}`);

// The source field is a plain JSONScores object — derived getters are stripped
const sourceEncoded = roundTrip.source as Record<string, unknown>;
console.log(`  source has ability_scores?  ${"ability_scores" in sourceEncoded}`);  // false
console.log(`  source has totals?          ${"totals" in sourceEncoded}`);           // false

console.log("\n══════════════════════════════════════════════════════════════════");
console.log("  Walkthrough complete. All 4 pipeline edges demonstrated.");
console.log("══════════════════════════════════════════════════════════════════");
