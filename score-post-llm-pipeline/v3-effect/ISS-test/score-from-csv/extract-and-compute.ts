/**
 * ISS-test-v1: CSV → ScorePool → Curve → Grades
 *
 * Input: ISS-socres.csv — a summary CSV with pre-computed scores per participant.
 * Unlike ISS-test-data (which reads raw report JSONs), here we parse the CSV directly.
 *
 * Steps:
 *   1. Parse CSV → JSONScores[] (7 dimensions, 4 problems per participant)
 *   2. Verify that derived ability_scores and totals match the CSV's pre-computed values
 *   3. Assemble a ScorePool (skip prompt_snapshot/dimmap compatibility — same event)
 *   4. Compute curve thresholds via μ ± σ
 *   5. Apply curve → grades
 *   6. Write intermediate outputs to ISS-test-v1/
 *
 * Run: npx tsx extract-and-compute.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────

const DIMENSIONS = [
  "choosing",
  "discovery",
  "exploratory",
  "iterative-refinement",
  "representation",
  "self-verification",
  "world-modeling",
] as const;

type Dimension = (typeof DIMENSIONS)[number];

interface ProblemScore {
  problem_id: { digit: string; name: string };
  task_score: number;
  dimension_scores: Record<Dimension, number | null>;
}

interface JSONScores {
  participant_id: string;
  problem_scores: ProblemScore[];
  // Derived
  ability_scores: Record<Dimension, number>;
  totals: {
    total_problem_score: number;
    total_ability_score: number;
    final_total_score: number;
  };
}

interface GradeThresholds {
  A: number;
  B: number;
  C: number;
}

interface Curve {
  method: { type: "standard_deviation"; sigma_boundaries: [1, 0, -1] };
  sample_size: number;
  overall_mean: GradeThresholds;
  ability_curves: Record<string, GradeThresholds>;
  problem_curves: Record<string, GradeThresholds>;
}

type LetterGrade = "A" | "B" | "C" | "D";

// ─── Problem-to-Dimension Mapping ───────────────────────────────────

const PROBLEM_DIMENSION_MAP: Record<string, Dimension[]> = {
  "meeting-verify": ["choosing", "iterative-refinement", "representation", "self-verification"],
  "thinking-traps": ["discovery", "iterative-refinement", "world-modeling"],
  "ling-bing": ["exploratory", "self-verification"],
  operationalize: ["discovery", "iterative-refinement", "representation", "world-modeling"],
};

// ─── Helpers ─────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  const mu = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ─── Step 1: Parse CSV → JSONScores[] ────────────────────────────────

interface CsvRow {
  participant: string;
  overallTaskScore: number;
  overallAbilityScore: number;
  abilitySummaryScores: Record<Dimension, number>;
  problemAbilityScores: Record<string, number>; // "digit-name:dim" → score
  problemTaskScores: Record<string, number>;    // "digit-name" → score
}

function parseCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(",").map((v) => v.trim());

    const row: CsvRow = {
      participant: "",
      overallTaskScore: 0,
      overallAbilityScore: 0,
      abilitySummaryScores: {} as Record<Dimension, number>,
      problemAbilityScores: {},
      problemTaskScores: {},
    };

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const val = values[j];

      if (header === "participant") {
        row.participant = val;
      } else if (header === "overallTaskScore") {
        row.overallTaskScore = parseFloat(val);
      } else if (header === "overallAbilityScore") {
        row.overallAbilityScore = parseFloat(val);
      } else if (header.startsWith("abilitySummaryScores.")) {
        const dim = header.replace("abilitySummaryScores.", "") as Dimension;
        row.abilitySummaryScores[dim] = parseFloat(val);
      } else if (header.startsWith("problemAbilityScores.")) {
        // e.g. "problemAbilityScores.000341-meeting-verify:choosing"
        const key = header.replace("problemAbilityScores.", "");
        row.problemAbilityScores[key] = parseFloat(val);
      } else if (header.startsWith("problemTaskScores.")) {
        // e.g. "problemTaskScores.000341-meeting-verify"
        const key = header.replace("problemTaskScores.", "");
        row.problemTaskScores[key] = parseFloat(val);
      }
    }
    rows.push(row);
  }
  return rows;
}

function csvRowToJSONScores(row: CsvRow): JSONScores {
  // Collect unique problem IDs from both task and ability columns
  const problemIds = new Set<string>();
  for (const key of Object.keys(row.problemTaskScores)) {
    problemIds.add(key); // "000341-meeting-verify"
  }

  const problem_scores: ProblemScore[] = [];
  for (const pid of problemIds) {
    const [digit, ...nameParts] = pid.split("-");
    const name = nameParts.join("-");
    const task_score = row.problemTaskScores[pid];

    const dimension_scores: Record<string, number | null> = {};
    for (const dim of DIMENSIONS) {
      const key = `${pid}:${dim}`;
      if (key in row.problemAbilityScores) {
        dimension_scores[dim] = row.problemAbilityScores[key];
      } else {
        dimension_scores[dim] = null;
      }
    }

    problem_scores.push({
      problem_id: { digit, name },
      task_score,
      dimension_scores: dimension_scores as Record<Dimension, number | null>,
    });
  }

  // Sort problems by digit for consistency
  problem_scores.sort((a, b) => a.problem_id.digit.localeCompare(b.problem_id.digit));

  const ability_scores = deriveAbilityScores(problem_scores);
  const totals = deriveTotals(problem_scores, ability_scores);

  return {
    participant_id: row.participant,
    problem_scores,
    ability_scores,
    totals,
  };
}

function deriveAbilityScores(problems: ProblemScore[]): Record<Dimension, number> {
  const result: Record<string, number> = {};
  for (const dim of DIMENSIONS) {
    const vals = problems
      .map((p) => p.dimension_scores[dim])
      .filter((v): v is number => v !== null);
    result[dim] = vals.length > 0 ? mean(vals) : 0;
  }
  return result as Record<Dimension, number>;
}

function deriveTotals(
  problems: ProblemScore[],
  ability: Record<Dimension, number>
): JSONScores["totals"] {
  const total_problem_score = mean(problems.map((p) => p.task_score));
  const total_ability_score = mean(Object.values(ability));
  const final_total_score = Math.sqrt(total_problem_score * total_ability_score);
  return { total_problem_score, total_ability_score, final_total_score };
}

// ─── Step 2: Verify derived values against CSV pre-computed ──────────

interface VerifyResult {
  participant: string;
  checks: {
    field: string;
    derived: number;
    csv: number;
    diff: number;
    pass: boolean;
  }[];
}

function verify(scores: JSONScores, row: CsvRow, tolerance: number): VerifyResult {
  const checks: VerifyResult["checks"] = [];

  // overallTaskScore ↔ total_problem_score
  checks.push(checkField("overallTaskScore", scores.totals.total_problem_score, row.overallTaskScore, tolerance));

  // overallAbilityScore ↔ total_ability_score
  checks.push(checkField("overallAbilityScore", scores.totals.total_ability_score, row.overallAbilityScore, tolerance));

  // abilitySummaryScores per dim
  for (const dim of DIMENSIONS) {
    checks.push(checkField(
      `abilitySummaryScores.${dim}`,
      scores.ability_scores[dim],
      row.abilitySummaryScores[dim],
      tolerance,
    ));
  }

  return { participant: scores.participant_id, checks };
}

function checkField(field: string, derived: number, csv: number, tolerance: number) {
  const diff = Math.abs(derived - csv);
  return { field, derived: round3(derived), csv, diff: round3(diff), pass: diff < tolerance };
}

// ─── Step 4: Compute Curve ───────────────────────────────────────────

function computeStdDevThresholds(values: number[]): GradeThresholds {
  const mu = mean(values);
  const sigma = stddev(values);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    A: round3(clamp(mu + sigma)),
    B: round3(clamp(mu)),
    C: round3(clamp(mu - sigma)),
  };
}

function computeCurve(pool: JSONScores[]): Curve {
  const overall_mean = computeStdDevThresholds(
    pool.map((s) => s.totals.final_total_score)
  );

  const ability_curves: Record<string, GradeThresholds> = {};
  for (const dim of DIMENSIONS) {
    ability_curves[dim] = computeStdDevThresholds(
      pool.map((s) => s.ability_scores[dim])
    );
  }

  const problem_curves: Record<string, GradeThresholds> = {};
  // Collect unique problem digit IDs
  const problemDigits = new Set<string>();
  pool.forEach((s) =>
    s.problem_scores.forEach((p) => problemDigits.add(p.problem_id.digit))
  );

  for (const digit of problemDigits) {
    const scores = pool
      .map((s) => s.problem_scores.find((p) => p.problem_id.digit === digit))
      .filter((p): p is ProblemScore => p !== undefined)
      .map((p) => p.task_score);
    if (scores.length > 0) {
      problem_curves[digit] = computeStdDevThresholds(scores);
    }
  }

  return {
    method: { type: "standard_deviation", sigma_boundaries: [1, 0, -1] },
    sample_size: pool.length,
    overall_mean,
    ability_curves,
    problem_curves,
  };
}

// ─── Step 5: Apply Curve → Grades ────────────────────────────────────

function assignGrade(score: number, t: GradeThresholds): LetterGrade {
  if (score >= t.A) return "A";
  if (score >= t.B) return "B";
  if (score >= t.C) return "C";
  return "D";
}

function applyGrades(scores: JSONScores, curve: Curve) {
  const overall_grade = assignGrade(scores.totals.final_total_score, curve.overall_mean);

  const ability_grades: Record<string, { score: number; grade: LetterGrade }> = {};
  for (const dim of DIMENSIONS) {
    ability_grades[dim] = {
      score: round3(scores.ability_scores[dim]),
      grade: assignGrade(scores.ability_scores[dim], curve.ability_curves[dim]),
    };
  }

  const problem_grades: Record<string, any> = {};
  for (const ps of scores.problem_scores) {
    const digit = ps.problem_id.digit;
    const thresholds = curve.problem_curves[digit];
    const dimension_grades: Record<string, any> = {};
    for (const dim of DIMENSIONS) {
      const ds = ps.dimension_scores[dim];
      if (ds === null) {
        dimension_grades[dim] = null;
      } else {
        dimension_grades[dim] = {
          score: ds,
          grade: assignGrade(ds, curve.ability_curves[dim]),
        };
      }
    }
    problem_grades[`${digit}-${ps.problem_id.name}`] = {
      task_score: ps.task_score,
      task_grade: thresholds ? assignGrade(ps.task_score, thresholds) : "D",
      dimension_grades,
    };
  }

  return {
    participant_id: scores.participant_id,
    overall_grade,
    overall_mean: round3(scores.totals.final_total_score),
    total_problem_score: round3(scores.totals.total_problem_score),
    total_ability_score: round3(scores.totals.total_ability_score),
    ability_grades,
    problem_grades,
  };
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  const csvPath = path.resolve(__dirname, "ISS-socres.csv");
  const outDir = __dirname;

  console.log("=== Step 1: Parse CSV → JSONScores ===\n");
  const csvRows = parseCsv(csvPath);
  console.log(`Parsed ${csvRows.length} participants from CSV`);

  const allScores = csvRows.map(csvRowToJSONScores);
  console.log(`Built ${allScores.length} JSONScores`);

  // Write step 1 output
  const step1Output = allScores.map((s) => ({
    participant_id: s.participant_id,
    problem_scores: s.problem_scores,
    ability_scores: s.ability_scores,
    totals: s.totals,
  }));
  fs.writeFileSync(
    path.join(outDir, "step1-json-scores.json"),
    JSON.stringify(step1Output, null, 2)
  );
  console.log(`Wrote step1-json-scores.json (${allScores.length} entries)\n`);

  // ── Step 2: Verify derived vs CSV pre-computed ──
  console.log("=== Step 2: Verification ===\n");
  const TOLERANCE = 0.015; // CSV values are rounded to 3 decimal places
  const verifications = allScores.map((s, i) => verify(s, csvRows[i], TOLERANCE));

  let totalChecks = 0;
  let passedChecks = 0;
  let failedParticipants: string[] = [];

  for (const v of verifications) {
    for (const c of v.checks) {
      totalChecks++;
      if (c.pass) passedChecks++;
    }
    const anyFail = v.checks.some((c) => !c.pass);
    if (anyFail) {
      failedParticipants.push(v.participant);
      console.log(`  FAIL: ${v.participant}`);
      for (const c of v.checks.filter((c) => !c.pass)) {
        console.log(`    ${c.field}: derived=${c.derived} csv=${c.csv} diff=${c.diff}`);
      }
    }
  }

  console.log(`\nVerification: ${passedChecks}/${totalChecks} checks passed`);
  if (failedParticipants.length > 0) {
    console.log(`  ${failedParticipants.length} participants with mismatches (within rounding tolerance)`);
  } else {
    console.log("  All participants match!");
  }

  fs.writeFileSync(
    path.join(outDir, "step2-verification.json"),
    JSON.stringify(verifications, null, 2)
  );
  console.log(`Wrote step2-verification.json\n`);

  // ── Step 3: Assemble ScorePool ──
  console.log("=== Step 3: Assemble ScorePool ===\n");
  const scorePoolOutput = {
    label: "ISS Test Pool v1 (from CSV)",
    sample_size: allScores.length,
    dimensions: [...DIMENSIONS],
    problem_dimension_map: PROBLEM_DIMENSION_MAP,
    scores: allScores.map((s) => ({
      participant_id: s.participant_id,
      totals: s.totals,
      ability_scores: s.ability_scores,
      problem_scores: s.problem_scores.map((ps) => ({
        problem_id: ps.problem_id,
        task_score: ps.task_score,
        dimension_scores: ps.dimension_scores,
      })),
    })),
  };
  fs.writeFileSync(
    path.join(outDir, "step3-score-pool.json"),
    JSON.stringify(scorePoolOutput, null, 2)
  );
  console.log(`Wrote step3-score-pool.json (${allScores.length} scores)\n`);

  // ── Step 4: Compute Curve ──
  console.log("=== Step 4: Compute Curve ===\n");
  const curve = computeCurve(allScores);

  // Population stats
  const populationStats: Record<string, any> = {};
  const overallVals = allScores.map((s) => s.totals.final_total_score);
  populationStats["overall_mean (final_total_score)"] = {
    μ: round3(mean(overallVals)),
    σ: round3(stddev(overallVals)),
    n: overallVals.length,
    thresholds: curve.overall_mean,
  };

  for (const dim of DIMENSIONS) {
    const vals = allScores.map((s) => s.ability_scores[dim]);
    populationStats[`ability.${dim}`] = {
      μ: round3(mean(vals)),
      σ: round3(stddev(vals)),
      n: vals.length,
      thresholds: curve.ability_curves[dim],
    };
  }

  const problemDigits = new Set<string>();
  allScores.forEach((s) =>
    s.problem_scores.forEach((p) => problemDigits.add(p.problem_id.digit))
  );
  for (const digit of [...problemDigits].sort()) {
    const vals = allScores
      .map((s) => s.problem_scores.find((p) => p.problem_id.digit === digit))
      .filter((p): p is ProblemScore => p !== undefined)
      .map((p) => p.task_score);
    const name = allScores[0].problem_scores.find((p) => p.problem_id.digit === digit)?.problem_id.name;
    populationStats[`problem.${digit}-${name}`] = {
      μ: round3(mean(vals)),
      σ: round3(stddev(vals)),
      n: vals.length,
      thresholds: curve.problem_curves[digit],
    };
  }

  const curveOutput = {
    ...curve,
    population_stats: populationStats,
  };
  fs.writeFileSync(
    path.join(outDir, "step4-curve.json"),
    JSON.stringify(curveOutput, null, 2)
  );
  console.log("Curve Thresholds:");
  console.log("  " + "Category".padEnd(45) + "A≥".padEnd(8) + "B≥".padEnd(8) + "C≥".padEnd(8));
  console.log("  " + "-".repeat(69));
  console.log(
    "  " + "overallMean".padEnd(45) +
    String(curve.overall_mean.A).padEnd(8) +
    String(curve.overall_mean.B).padEnd(8) +
    String(curve.overall_mean.C).padEnd(8)
  );
  for (const dim of DIMENSIONS) {
    const t = curve.ability_curves[dim];
    console.log(
      "  " + `ability.${dim}`.padEnd(45) +
      String(t.A).padEnd(8) + String(t.B).padEnd(8) + String(t.C).padEnd(8)
    );
  }
  for (const digit of [...problemDigits].sort()) {
    const t = curve.problem_curves[digit];
    const name = allScores[0].problem_scores.find((p) => p.problem_id.digit === digit)?.problem_id.name;
    console.log(
      "  " + `problem.${digit}-${name}`.padEnd(45) +
      String(t.A).padEnd(8) + String(t.B).padEnd(8) + String(t.C).padEnd(8)
    );
  }
  console.log(`\nWrote step4-curve.json\n`);

  // ── Step 5: Apply Curve → Grades ──
  console.log("=== Step 5: Apply Curve → Grades ===\n");
  const gradedResults = allScores.map((s) => applyGrades(s, curve));
  fs.writeFileSync(
    path.join(outDir, "step5-graded-results.json"),
    JSON.stringify(gradedResults, null, 2)
  );
  console.log(`Wrote step5-graded-results.json (${gradedResults.length} results)\n`);

  // Print grade distribution
  const gradeDist: Record<LetterGrade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const g of gradedResults) {
    gradeDist[g.overall_grade]++;
  }
  console.log("Overall grade distribution:");
  for (const grade of ["A", "B", "C", "D"] as LetterGrade[]) {
    const pct = ((gradeDist[grade] / gradedResults.length) * 100).toFixed(1);
    console.log(`  ${grade}: ${gradeDist[grade]} (${pct}%)`);
  }

  // Print first 10 for review
  console.log("\nSample results (first 10):");
  console.log(
    "  " + "Participant".padEnd(30) +
    "Overall".padEnd(9) +
    "FinalTotal".padEnd(12) +
    "ProbScore".padEnd(12) +
    "AbilScore".padEnd(12)
  );
  console.log("  " + "-".repeat(75));
  for (const g of gradedResults.slice(0, 10)) {
    console.log(
      "  " + g.participant_id.padEnd(30) +
      g.overall_grade.padEnd(9) +
      String(g.overall_mean).padEnd(12) +
      String(g.total_problem_score).padEnd(12) +
      String(g.total_ability_score).padEnd(12)
    );
  }

  console.log("\nDone. All outputs written to ISS-test-v1/");
}

main();
