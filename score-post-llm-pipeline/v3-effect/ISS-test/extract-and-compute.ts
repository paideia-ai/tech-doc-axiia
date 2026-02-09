/**
 * ISS-test: Raw Report JSONs → JSONScores → ScorePool → Curve → CurvedScores
 *
 * All data is decoded/encoded through the actual Effect Schema types from
 * schemas.ts. If any constructed object violates the schema, decoding throws.
 *
 * Steps:
 *   1. Read reports, extract scores, decode each through Schema → JSONScores[]
 *   2. Verify derived ability_scores/totals match report pre-computed values
 *   3. Assemble ScorePool (decoded through Schema)
 *   4. Compute Curve thresholds via μ ± σ, decode through Schema → Curve
 *   5. Apply curve → CurvedScores[] (each decoded through Schema)
 *   6. Compare problem curves with known values
 *
 * Run: cd score-post-llm-pipeline && npx tsx v3-effect/ISS-test/extract-and-compute.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import {
  DIMENSIONS,
  type Dimension,
  type LetterGrade,
  decodeJSONScores,
  decodeCurve,
  decodeCurvedScores,
  decodeEventConfig,
  decodeScorePool,
} from "../schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ──────────────────────────────────────────────────────

const DROP_DIMENSIONS = new Set(["choosing", "world-modeling"]);

const EN_DIGIT_REMAP: Record<string, string> = {
  "000340": "000341",
  "000500": "000501",
  "001000": "001001",
  "001110": "001111",
};

const PROBLEM_NAMES: Record<string, string> = {
  "000341": "meeting-verify",
  "000501": "thinking-traps",
  "001001": "ling-bing",
  "001111": "operationalize",
};

const PROBLEM_DIM_MAP: Record<string, Dimension[]> = {
  "000341": ["iterative-refinement", "representation", "self-verification"],
  "000501": ["discovery", "iterative-refinement"],
  "001001": ["exploratory", "self-verification"],
  "001111": ["discovery", "iterative-refinement", "representation"],
};

// ─── Raw report shape (source data, not schema-typed) ───────────────

interface RawReport {
  metadata: { lang: string };
  abilityMean: number;
  overallMean: number;
  taskEvalMean: number;
  problemReports: {
    score: number;
    problemId: string;
    dimensionDetails: { score: number; dimension: string }[];
  }[];
  dimensionReports: { score: number; dimension: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function arithMean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  const mu = arithMean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - mu) ** 2, 0) / values.length);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function uuid(): string {
  return crypto.randomUUID();
}

// ─── Synthetic metadata factory ─────────────────────────────────────

const SYNTHETIC_GIT_HASH = "a0b1c2d";
const SYNTHETIC_NOW = "2024-06-10T00:00:00.000Z";

function buildSyntheticPromptSnapshot() {
  // Build plausible entries sorted by key
  const entryKeys = [
    "framework:en:ability-summary",
    "framework:en:expert-review",
    "framework:en:task-eval",
    "framework:zh:ability-summary",
    "framework:zh:expert-review",
    "framework:zh:task-eval",
    "problem:000341:scoring",
    "problem:000341:task-eval",
    "problem:000501:scoring",
    "problem:000501:task-eval",
    "problem:001001:scoring",
    "problem:001001:task-eval",
    "problem:001111:scoring",
    "problem:001111:task-eval",
  ];

  const entries = entryKeys.map((key) => ({
    key,
    sha256: sha256(`synthetic-prompt-content:${key}`),
  }));

  const set_hash = sha256(JSON.stringify(entries));

  return {
    git_hash: SYNTHETIC_GIT_HASH,
    set_hash,
    entries,
  };
}

function buildSyntheticDimensionMap() {
  const entries = Object.entries(PROBLEM_DIM_MAP)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([digit, dims]) => ({
      problem_id: { digit, name: PROBLEM_NAMES[digit] },
      dimensions: dims,
    }));

  return {
    map_id: uuid(),
    label: "ISS 2024 Assessment (5-dim)",
    created_at: SYNTHETIC_NOW,
    entries,
  };
}

// Build once — shared by all JSONScores in this event
const PROMPT_SNAPSHOT = buildSyntheticPromptSnapshot();
const DIMENSION_MAP = buildSyntheticDimensionMap();
const EVENT_ID = "ISS-2024";

// ─── Step 1: Extract scores from report → decode as JSONScores ──────

function extractProblemDigit(problemId: string, lang: string): string {
  const digit = problemId.split("-")[0];
  return lang === "en" && EN_DIGIT_REMAP[digit] ? EN_DIGIT_REMAP[digit] : digit;
}

function buildJSONScoresInput(report: RawReport, participantId: string) {
  const lang = report.metadata.lang;

  const problem_scores = report.problemReports.map((pr) => {
    const digit = extractProblemDigit(pr.problemId, lang);
    const name = PROBLEM_NAMES[digit] ?? pr.problemId.split("-").slice(1).join("-");

    const dimension_scores: Record<string, number | null> = {};
    for (const dim of DIMENSIONS) {
      dimension_scores[dim] = null;
    }
    for (const dd of pr.dimensionDetails) {
      if (DROP_DIMENSIONS.has(dd.dimension)) continue;
      if (DIMENSIONS.includes(dd.dimension as Dimension)) {
        dimension_scores[dd.dimension] = dd.score;
      }
    }

    return {
      problem_id: { digit, name },
      task_score: pr.score,
      dimension_scores,
    };
  });

  problem_scores.sort((a, b) =>
    a.problem_id.digit.localeCompare(b.problem_id.digit)
  );

  return {
    scores_id: uuid(),
    event_id: EVENT_ID,
    prompt_snapshot: PROMPT_SNAPSHOT,
    dimension_map: DIMENSION_MAP,
    generated_at: SYNTHETIC_NOW,
    participant_id: participantId,
    problem_scores,
  };
}

// ─── Step 2: Verify derived values against report ───────────────────

interface VerifyCheck {
  field: string;
  derived: number;
  report: number;
  diff: number;
  pass: boolean;
}

function verifyAgainstReport(
  scores: ReturnType<typeof decodeJSONScores>,
  report: RawReport,
  tolerance: number
): { participant: string; checks: VerifyCheck[] } {
  const checks: VerifyCheck[] = [];
  const totals = scores.totals;

  const check = (field: string, derived: number, report: number, strict = true) => {
    const diff = Math.abs(derived - report);
    checks.push({ field, derived: round3(derived), report, diff: round3(diff), pass: strict ? diff < tolerance : true });
  };

  check("taskEvalMean ↔ total_problem_score", totals.total_problem_score, report.taskEvalMean);
  check("abilityMean (report=7dim, derived=5dim)", totals.total_ability_score, report.abilityMean, false);
  check("overallMean (report=7dim, derived=5dim)", totals.final_total_score, report.overallMean, false);

  for (const dim of DIMENSIONS) {
    const reportDim = report.dimensionReports.find((d) => d.dimension === dim);
    if (reportDim) {
      check(`ability.${dim}`, scores.ability_scores[dim], reportDim.score);
    }
  }

  return { participant: scores.participant_id, checks };
}

// ─── Step 4: Compute curve thresholds ───────────────────────────────

function computeThresholds(values: number[]) {
  const mu = arithMean(values);
  const sigma = stddev(values);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return { A: round3(clamp(mu + sigma)), B: round3(clamp(mu)), C: round3(clamp(mu - sigma)) };
}

// ─── Step 5: Grade assignment ───────────────────────────────────────

function assignGrade(score: number, t: { A: number; B: number; C: number }): LetterGrade {
  if (score >= t.A) return "A";
  if (score >= t.B) return "B";
  if (score >= t.C) return "C";
  return "D";
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });

  const cnDir = path.join(__dirname, "ISS-with-full-curved", "CN");
  const enDir = path.join(__dirname, "ISS-with-full-curved", "EN");

  // ── Step 1: Read reports → decode as JSONScores ──
  console.log("=== Step 1: Read Reports → Decode as JSONScores ===\n");

  const cnFiles = fs.readdirSync(cnDir).filter((f) => f.endsWith(".json"));
  const enFiles = fs.readdirSync(enDir).filter((f) => f.endsWith(".json"));
  console.log(`Found ${cnFiles.length} CN reports, ${enFiles.length} EN reports`);

  type DecodedJSONScores = ReturnType<typeof decodeJSONScores>;
  const allScores: DecodedJSONScores[] = [];
  const allReports: { participant: string; report: RawReport }[] = [];
  let decodeErrors = 0;

  const readAndDecode = (dir: string, files: string[]) => {
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as RawReport;
      const participantId = file.replace(".json", "");
      const input = buildJSONScoresInput(raw, participantId);

      try {
        const decoded = decodeJSONScores(input);
        allScores.push(decoded);
        allReports.push({ participant: participantId, report: raw });
      } catch (e) {
        decodeErrors++;
        console.error(`  DECODE FAIL: ${participantId}`, e instanceof Error ? e.message : e);
      }
    }
  };

  readAndDecode(cnDir, cnFiles);
  readAndDecode(enDir, enFiles);

  console.log(`Decoded ${allScores.length} JSONScores (${decodeErrors} failures)`);

  if (decodeErrors > 0) {
    console.error("\nAborting due to decode failures.");
    process.exit(1);
  }

  // Encode back to JSON to write step 1 output (proves round-trip works)
  // Schema.Class only encodes declared fields — ability_scores & totals are getters, not stored.
  // For the output file, we want to show both stored + derived.
  const step1Output = allScores.map((s) => ({
    // Encoded (stored) fields — via Schema.encodeSync
    scores_id: s.scores_id,
    event_id: s.event_id,
    participant_id: s.participant_id,
    problem_scores: s.problem_scores.map((ps) => ({
      problem_id: { digit: ps.problem_id.digit, name: ps.problem_id.name },
      task_score: ps.task_score,
      dimension_scores: Object.fromEntries(
        DIMENSIONS.map((dim) => {
          const opt = ps.dimension_scores[dim];
          return [dim, opt._tag === "Some" ? opt.value : null];
        })
      ),
    })),
    // Derived getters (computed on decode, not stored in JSON)
    _derived: {
      ability_scores: Object.fromEntries(
        DIMENSIONS.map((dim) => [dim, round3(s.ability_scores[dim])])
      ),
      totals: {
        total_problem_score: round3(s.totals.total_problem_score),
        total_ability_score: round3(s.totals.total_ability_score),
        final_total_score: round3(s.totals.final_total_score),
      },
    },
  }));

  fs.writeFileSync(path.join(outDir, "step1-json-scores.json"), JSON.stringify(step1Output, null, 2));
  console.log(`Wrote step1-json-scores.json (${allScores.length} entries)\n`);

  // Print sample
  console.log("Sample (first 3):");
  for (const s of allScores.slice(0, 3)) {
    console.log(`  ${s.participant_id}`);
    for (const ps of s.problem_scores) {
      const dimStr = DIMENSIONS.map((dim) => {
        const opt = ps.dimension_scores[dim];
        return `${dim.slice(0, 4)}=${opt._tag === "Some" ? round3(opt.value) : "null"}`;
      }).join(", ");
      console.log(`    ${ps.problem_id.digit}-${ps.problem_id.name}: task=${ps.task_score}  [${dimStr}]`);
    }
    console.log(
      `    totals: problem=${round3(s.totals.total_problem_score)} ability=${round3(s.totals.total_ability_score)} final=${round3(s.totals.final_total_score)}`
    );
  }

  // ── Step 2: Verify ──
  console.log("\n=== Step 2: Verification (schema-derived vs report) ===\n");
  const TOLERANCE = 0.015;
  const verifications = allScores.map((s, i) =>
    verifyAgainstReport(s, allReports[i].report, TOLERANCE)
  );

  let totalChecks = 0;
  let passedChecks = 0;
  const failedChecks: { participant: string; field: string; derived: number; report: number }[] = [];

  for (const v of verifications) {
    for (const c of v.checks) {
      totalChecks++;
      if (c.pass) passedChecks++;
      else failedChecks.push({ participant: v.participant, field: c.field, derived: c.derived, report: c.report });
    }
  }

  console.log(`Verification: ${passedChecks}/${totalChecks} checks passed`);
  if (failedChecks.length > 0) {
    console.log(`  ${failedChecks.length} failures:`);
    for (const f of failedChecks.slice(0, 10)) {
      console.log(`    ${f.participant}: ${f.field} derived=${f.derived} report=${f.report}`);
    }
  }
  fs.writeFileSync(path.join(outDir, "step2-verification.json"), JSON.stringify(verifications, null, 2));
  console.log(`Wrote step2-verification.json\n`);

  // ── Step 3: Decode EventConfig + ScorePool ──
  console.log("=== Step 3: Decode EventConfig + Assemble ScorePool ===\n");

  const problemIds = Object.entries(PROBLEM_NAMES)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([digit, name]) => ({ digit, name }));

  const eventConfig = decodeEventConfig({
    event_id: EVENT_ID,
    problem_ids: problemIds,
    prompt_snapshot: PROMPT_SNAPSHOT,
    dimension_map: DIMENSION_MAP,
    event_date: SYNTHETIC_NOW,
  });
  console.log(`EventConfig decoded: event_id=${eventConfig.event_id}, ${eventConfig.problem_ids.length} problems`);

  // ScorePool embeds full JSONScores — we need to re-encode each one as plain JSON
  // then let the ScorePool decoder re-decode them.
  // Since Schema.Class.encode only outputs declared fields, we build the raw input objects.
  const scorePoolInput = {
    pool_id: uuid(),
    label: "ISS Test Pool (from reports, 5-dim)",
    source_event_ids: [EVENT_ID],
    prompt_snapshot: PROMPT_SNAPSHOT,
    dimension_map: DIMENSION_MAP,
    created_at: SYNTHETIC_NOW,
    scores: allScores.map((s) => buildJSONScoresInputFromDecoded(s)),
  };

  // Decode through Schema to validate
  const scorePool = decodeScorePool(scorePoolInput);
  console.log(`ScorePool decoded: ${scorePool.scores.length} scores, pool_id=${scorePool.pool_id}`);

  fs.writeFileSync(path.join(outDir, "step3-score-pool.json"), JSON.stringify(scorePoolInput, null, 2));
  console.log(`Wrote step3-score-pool.json\n`);

  // ── Step 4: Compute Curve ──
  console.log("=== Step 4: Compute Curve ===\n");

  const overallVals = allScores.map((s) => s.totals.final_total_score as number);
  const overallThresholds = computeThresholds(overallVals);

  const ability_curves: Record<string, { A: number; B: number; C: number }> = {};
  for (const dim of DIMENSIONS) {
    ability_curves[dim] = computeThresholds(allScores.map((s) => s.ability_scores[dim] as number));
  }

  const problemDigits = [...new Set(allScores.flatMap((s) => s.problem_scores.map((p) => p.problem_id.digit as string)))].sort();
  const problem_curves: Record<string, { A: number; B: number; C: number }> = {};
  for (const digit of problemDigits) {
    const vals = allScores
      .map((s) => s.problem_scores.find((p) => p.problem_id.digit === digit))
      .filter(Boolean)
      .map((p) => p!.task_score as number);
    problem_curves[digit] = computeThresholds(vals);
  }

  const curveInput = {
    curve_id: uuid(),
    label: "ISS 2024 Curve (5-dim, from reports)",
    source_event_ids: [EVENT_ID],
    prompt_snapshot: PROMPT_SNAPSHOT,
    dimension_map: DIMENSION_MAP,
    method: { type: "standard_deviation" as const, sigma_boundaries: [1, 0, -1] },
    sample_size: allScores.length,
    computed_at: SYNTHETIC_NOW,
    overall_mean: overallThresholds,
    ability_curves,
    problem_curves,
  };

  const curve = decodeCurve(curveInput);
  console.log(`Curve decoded: curve_id=${curve.curve_id}, sample_size=${curve.sample_size}`);

  // Population stats for output
  const populationStats: Record<string, { μ: number; σ: number; n: number; thresholds: { A: number; B: number; C: number } }> = {};
  populationStats["overall (final_total_score)"] = {
    μ: round3(arithMean(overallVals)), σ: round3(stddev(overallVals)), n: overallVals.length, thresholds: overallThresholds,
  };
  for (const dim of DIMENSIONS) {
    const vals = allScores.map((s) => s.ability_scores[dim] as number);
    populationStats[`ability.${dim}`] = { μ: round3(arithMean(vals)), σ: round3(stddev(vals)), n: vals.length, thresholds: ability_curves[dim] };
  }
  for (const digit of problemDigits) {
    const vals = allScores.map((s) => s.problem_scores.find((p) => p.problem_id.digit === digit)).filter(Boolean).map((p) => p!.task_score as number);
    populationStats[`problem.${digit}-${PROBLEM_NAMES[digit]}`] = { μ: round3(arithMean(vals)), σ: round3(stddev(vals)), n: vals.length, thresholds: problem_curves[digit] };
  }

  fs.writeFileSync(path.join(outDir, "step4-curve.json"), JSON.stringify({ ...curveInput, population_stats: populationStats }, null, 2));

  console.log("Curve Thresholds (5-dim, merged EN→CN digits):");
  console.log("  " + "Category".padEnd(45) + "A≥".padEnd(8) + "B≥".padEnd(8) + "C≥".padEnd(8) + "μ".padEnd(8) + "σ".padEnd(8));
  console.log("  " + "-".repeat(77));
  const printRow = (label: string, t: { A: number; B: number; C: number }, mu: number, sigma: number) =>
    console.log("  " + label.padEnd(45) + String(t.A).padEnd(8) + String(t.B).padEnd(8) + String(t.C).padEnd(8) + String(round3(mu)).padEnd(8) + String(round3(sigma)).padEnd(8));

  printRow("overallMean", overallThresholds, arithMean(overallVals), stddev(overallVals));
  for (const dim of DIMENSIONS) {
    const vals = allScores.map((s) => s.ability_scores[dim] as number);
    printRow(`ability.${dim}`, ability_curves[dim], arithMean(vals), stddev(vals));
  }
  for (const digit of problemDigits) {
    const vals = allScores.map((s) => s.problem_scores.find((p) => p.problem_id.digit === digit)).filter(Boolean).map((p) => p!.task_score as number);
    printRow(`problem.${digit}-${PROBLEM_NAMES[digit]}`, problem_curves[digit], arithMean(vals), stddev(vals));
  }
  console.log(`\nWrote step4-curve.json\n`);

  // ── Step 5: Apply Curve → CurvedScores ──
  console.log("=== Step 5: Apply Curve → CurvedScores ===\n");

  const curvedScoresResults: ReturnType<typeof decodeCurvedScores>[] = [];

  for (const scores of allScores) {
    const overall_grade = assignGrade(scores.totals.final_total_score, overallThresholds);

    const ability_grades: Record<string, LetterGrade> = {};
    for (const dim of DIMENSIONS) {
      ability_grades[dim] = assignGrade(scores.ability_scores[dim], ability_curves[dim]);
    }

    const problem_grades = scores.problem_scores.map((ps) => {
      const digit = ps.problem_id.digit as string;
      const thresholds = problem_curves[digit];
      const task_grade = thresholds ? assignGrade(ps.task_score, thresholds) : ("D" as LetterGrade);

      const dimension_grades: Record<string, LetterGrade | null> = {};
      for (const dim of DIMENSIONS) {
        const opt = ps.dimension_scores[dim];
        if (opt._tag === "Some") {
          dimension_grades[dim] = assignGrade(opt.value, ability_curves[dim]);
        } else {
          dimension_grades[dim] = null;
        }
      }

      return {
        problem_id: { digit: ps.problem_id.digit, name: ps.problem_id.name },
        task_grade,
        dimension_grades,
      };
    });

    const curvedInput = {
      curved_scores_id: uuid(),
      source: buildJSONScoresInputFromDecoded(scores),
      applied_curve_id: curveInput.curve_id,
      curved_at: SYNTHETIC_NOW,
      problem_grades,
      ability_grades,
      overall_grade,
    };

    const decoded = decodeCurvedScores(curvedInput);
    curvedScoresResults.push(decoded);
  }

  console.log(`CurvedScores decoded: ${curvedScoresResults.length} results`);

  // Write output (plain JSON for readability, not full encoded with metadata)
  const step5Output = curvedScoresResults.map((cs) => ({
    participant_id: cs.source.participant_id,
    curved_scores_id: cs.curved_scores_id,
    overall_grade: cs.overall_grade,
    overall_mean: round3(cs.source.totals.final_total_score),
    total_problem_score: round3(cs.source.totals.total_problem_score),
    total_ability_score: round3(cs.source.totals.total_ability_score),
    ability_grades: Object.fromEntries(
      DIMENSIONS.map((dim) => [dim, { score: round3(cs.source.ability_scores[dim]), grade: cs.ability_grades[dim] }])
    ),
    problem_grades: cs.problem_grades.map((pg) => ({
      problem_id: { digit: pg.problem_id.digit, name: pg.problem_id.name },
      task_grade: pg.task_grade,
      dimension_grades: Object.fromEntries(
        DIMENSIONS.map((dim) => {
          const opt = pg.dimension_grades[dim];
          return [dim, opt._tag === "Some" ? opt.value : null];
        })
      ),
    })),
  }));

  fs.writeFileSync(path.join(outDir, "step5-curved-scores.json"), JSON.stringify(step5Output, null, 2));
  console.log(`Wrote step5-curved-scores.json\n`);

  // Grade distribution
  const gradeDist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const cs of curvedScoresResults) gradeDist[cs.overall_grade]++;
  console.log("Overall grade distribution:");
  for (const g of ["A", "B", "C", "D"]) console.log(`  ${g}: ${gradeDist[g]} (${((gradeDist[g] / curvedScoresResults.length) * 100).toFixed(1)}%)`);

  // Sample
  console.log("\nSample results (first 10):");
  console.log("  " + "Participant".padEnd(30) + "Grade".padEnd(7) + "Final".padEnd(8) + "Prob".padEnd(8) + "Abil".padEnd(8));
  console.log("  " + "-".repeat(61));
  for (const o of step5Output.slice(0, 10)) {
    console.log("  " + o.participant_id.padEnd(30) + o.overall_grade.padEnd(7) + String(o.overall_mean).padEnd(8) + String(o.total_problem_score).padEnd(8) + String(o.total_ability_score).padEnd(8));
  }

  // ── Step 6: Compare with known curve ──
  console.log("\n=== Step 6: Compare with Known Curve ===\n");
  const knownProblemCurves: Record<string, { A: number; B: number; C: number }> = {
    "000341": { A: 0.646, B: 0.332, C: 0.018 },
    "000501": { A: 0.854, B: 0.587, C: 0.32 },
    "001001": { A: 0.735, B: 0.556, C: 0.377 },
    "001111": { A: 0.55, B: 0.304, C: 0.058 },
  };

  console.log("Problem curves (should match — task_scores are dimension-independent):");
  for (const digit of problemDigits) {
    const known = knownProblemCurves[digit];
    const computed = problem_curves[digit];
    const match = known.A === computed.A && known.B === computed.B && known.C === computed.C;
    console.log(`  ${digit}: known=[${known.A}, ${known.B}, ${known.C}]  computed=[${computed.A}, ${computed.B}, ${computed.C}]  ${match ? "MATCH" : "MISMATCH"}`);
  }

  const knownOverall = { A: 0.497, B: 0.394, C: 0.292 };
  console.log(`\noverallMean: known(7dim)=[${knownOverall.A}, ${knownOverall.B}, ${knownOverall.C}]  computed(5dim)=[${overallThresholds.A}, ${overallThresholds.B}, ${overallThresholds.C}]  (expected to differ)`);

  console.log("\nDone. All outputs written to output/");
}

// ─── Re-encode a decoded JSONScores back to plain JSON input ────────
// Needed because ScorePool and CurvedScores embed JSONScores, and
// Schema.decodeUnknownSync needs the raw (encoded) form, not the decoded class instance.

function buildJSONScoresInputFromDecoded(s: ReturnType<typeof decodeJSONScores>) {
  return {
    scores_id: s.scores_id,
    event_id: s.event_id,
    prompt_snapshot: PROMPT_SNAPSHOT,
    dimension_map: DIMENSION_MAP,
    generated_at: SYNTHETIC_NOW,
    participant_id: s.participant_id,
    problem_scores: s.problem_scores.map((ps) => ({
      problem_id: { digit: ps.problem_id.digit, name: ps.problem_id.name },
      task_score: ps.task_score,
      dimension_scores: Object.fromEntries(
        DIMENSIONS.map((dim) => {
          const opt = ps.dimension_scores[dim];
          return [dim, opt._tag === "Some" ? opt.value : null];
        })
      ),
    })),
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
