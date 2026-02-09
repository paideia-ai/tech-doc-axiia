/**
 * ISS Test Data: Extract → ScorePool → Curve
 *
 * Steps:
 *   1. Read all CN and EN report JSONs
 *   2. Extract JSONScores from each report (7 dimensions)
 *   3. Change EN problemId 6th digit → "1" (merge with CN)
 *   4. Assemble a ScorePool (skip compatibility checks — no PromptSnapshot/DimMap)
 *   5. Compute curve thresholds via μ ± σ
 *   6. Apply curve to each score to produce grades
 *   7. Write intermediate outputs
 *
 * Run: npx tsx extract-and-compute.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────

/** The 7 dimensions used in this historical ISS data */
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
  problem_id: string; // "000341-meeting-verify"
  task_score: number;
  dimension_scores: Record<Dimension, number | null>;
}

interface JSONScores {
  participant_id: string;
  lang: "zh" | "en";
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

/**
 * Maps (CN-style) problem names to their tested dimensions.
 * Derived from the report structure (dimensionDetails within each problemReport).
 */
const PROBLEM_DIMENSION_MAP: Record<string, Dimension[]> = {
  "meeting-verify": [
    "iterative-refinement",
    "choosing",
    "self-verification",
    "representation",
  ],
  "thinking-traps": ["discovery", "iterative-refinement", "world-modeling"],
  "ling-bing": ["exploratory", "self-verification"],
  operationalize: [
    "discovery",
    "iterative-refinement",
    "representation",
    "world-modeling",
  ],
};

// ─── Step 1 & 2: Extract JSONScores from raw reports ─────────────────

function extractScores(
  reportPath: string,
  lang: "zh" | "en"
): JSONScores {
  const raw = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  const participant_id = path.basename(reportPath, ".json");

  const problem_scores: ProblemScore[] = raw.problemReports.map(
    (pr: any) => {
      let problemId: string = pr.problemId; // e.g. "000341-meeting-verify"

      // Step 3 (for EN): change 6th digit to "1"
      if (lang === "en") {
        const chars = problemId.split("");
        chars[5] = "1"; // 0-indexed: chars[0..5] are the 6 digit positions
        problemId = chars.join("");
      }

      // Build dimension_scores: all 7 dims present, null if not tested
      const dimScores: Record<string, number | null> = {};
      for (const dim of DIMENSIONS) {
        dimScores[dim] = null;
      }
      for (const detail of pr.dimensionDetails) {
        dimScores[detail.dimension] = detail.score;
      }

      return {
        problem_id: problemId,
        task_score: pr.score,
        dimension_scores: dimScores as Record<Dimension, number | null>,
      };
    }
  );

  // Derive ability_scores, totals
  const ability_scores = deriveAbilityScores(problem_scores);
  const totals = deriveTotals(problem_scores, ability_scores);

  return {
    participant_id,
    lang,
    problem_scores,
    ability_scores,
    totals,
  };
}

function deriveAbilityScores(
  problems: ProblemScore[]
): Record<Dimension, number> {
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
  const final_total_score = Math.sqrt(
    total_problem_score * total_ability_score
  );
  return { total_problem_score, total_ability_score, final_total_score };
}

// ─── Step 5: Compute Curve (μ ± σ) ──────────────────────────────────

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
  // Overall mean thresholds (from final_total_score)
  const overall_mean = computeStdDevThresholds(
    pool.map((s) => s.totals.final_total_score)
  );

  // Per-dimension ability thresholds
  const ability_curves: Record<string, GradeThresholds> = {};
  for (const dim of DIMENSIONS) {
    ability_curves[dim] = computeStdDevThresholds(
      pool.map((s) => s.ability_scores[dim])
    );
  }

  // Per-problem thresholds (using CN-style merged problem IDs)
  const problem_curves: Record<string, GradeThresholds> = {};
  // Collect unique problem IDs
  const problemIds = new Set<string>();
  pool.forEach((s) => s.problem_scores.forEach((p) => problemIds.add(p.problem_id)));

  for (const pid of problemIds) {
    const scores = pool
      .map((s) => s.problem_scores.find((p) => p.problem_id === pid))
      .filter((p): p is ProblemScore => p !== undefined)
      .map((p) => p.task_score);
    if (scores.length > 0) {
      problem_curves[pid] = computeStdDevThresholds(scores);
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

// ─── Step 6: Apply Curve → Grades ────────────────────────────────────

function assignGrade(score: number, t: GradeThresholds): LetterGrade {
  if (score >= t.A) return "A";
  if (score >= t.B) return "B";
  if (score >= t.C) return "C";
  return "D";
}

function applyGrades(
  scores: JSONScores,
  curve: Curve
): {
  participant_id: string;
  overall_grade: LetterGrade;
  overall_mean: number;
  ability_grades: Record<string, { score: number; grade: LetterGrade }>;
  problem_grades: Record<
    string,
    {
      task_score: number;
      task_grade: LetterGrade;
      dimension_grades: Record<string, { score: number; grade: LetterGrade } | null>;
    }
  >;
} {
  const overall_grade = assignGrade(
    scores.totals.final_total_score,
    curve.overall_mean
  );

  const ability_grades: Record<string, { score: number; grade: LetterGrade }> = {};
  for (const dim of DIMENSIONS) {
    ability_grades[dim] = {
      score: scores.ability_scores[dim],
      grade: assignGrade(scores.ability_scores[dim], curve.ability_curves[dim]),
    };
  }

  const problem_grades: Record<string, any> = {};
  for (const ps of scores.problem_scores) {
    const thresholds = curve.problem_curves[ps.problem_id];
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
    problem_grades[ps.problem_id] = {
      task_score: ps.task_score,
      task_grade: thresholds
        ? assignGrade(ps.task_score, thresholds)
        : "D",
      dimension_grades,
    };
  }

  return {
    participant_id: scores.participant_id,
    overall_grade,
    overall_mean: scores.totals.final_total_score,
    ability_grades,
    problem_grades,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  const mu = mean(values);
  const variance =
    values.reduce((sum, v) => sum + (v - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  const baseDir = path.resolve(__dirname, "ISS");
  const outDir = path.resolve(__dirname);

  // 1. Read all reports
  const cnDir = path.join(baseDir, "CN");
  const enDir = path.join(baseDir, "EN");
  const cnFiles = fs.readdirSync(cnDir).filter((f) => f.endsWith(".json"));
  const enFiles = fs.readdirSync(enDir).filter((f) => f.endsWith(".json"));

  console.log(`CN reports: ${cnFiles.length}, EN reports: ${enFiles.length}`);

  // 2 & 3. Extract JSONScores (EN gets problemId fix)
  const cnScores = cnFiles.map((f) =>
    extractScores(path.join(cnDir, f), "zh")
  );
  const enScores = enFiles.map((f) =>
    extractScores(path.join(enDir, f), "en")
  );

  // Write step 1 output: individual JSONScores
  const allScoresForOutput = [...cnScores, ...enScores].map((s) => ({
    participant_id: s.participant_id,
    lang: s.lang,
    problem_scores: s.problem_scores,
    ability_scores: s.ability_scores,
    totals: s.totals,
  }));
  fs.writeFileSync(
    path.join(outDir, "step1-json-scores.json"),
    JSON.stringify(allScoresForOutput, null, 2)
  );
  console.log(
    `Step 1: Wrote ${allScoresForOutput.length} JSONScores → step1-json-scores.json`
  );

  // 4. Assemble ScorePool (skip compatibility — no PromptSnapshot/DimMap)
  const pool = [...cnScores, ...enScores];
  const scorePoolOutput = {
    label: "ISS Test Pool (CN+EN merged)",
    sample_size: pool.length,
    dimensions: [...DIMENSIONS],
    problem_dimension_map: PROBLEM_DIMENSION_MAP,
    scores: pool.map((s) => ({
      participant_id: s.participant_id,
      lang: s.lang,
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
    path.join(outDir, "step2-score-pool.json"),
    JSON.stringify(scorePoolOutput, null, 2)
  );
  console.log(
    `Step 2: Wrote ScorePool (${pool.length} scores) → step2-score-pool.json`
  );

  // 5. Compute curve
  const curve = computeCurve(pool);

  // Also compute per-problem per-dimension thresholds for reference
  const problemDimThresholds: Record<string, Record<string, GradeThresholds>> = {};
  const problemIds = new Set<string>();
  pool.forEach((s) => s.problem_scores.forEach((p) => problemIds.add(p.problem_id)));

  for (const pid of problemIds) {
    problemDimThresholds[pid] = {};
    const problemName = pid.replace(/^\d+-/, "");
    const dims = PROBLEM_DIMENSION_MAP[problemName] || [];
    for (const dim of dims) {
      const scores = pool
        .map((s) => s.problem_scores.find((p) => p.problem_id === pid))
        .filter((p): p is ProblemScore => p !== undefined)
        .map((p) => p.dimension_scores[dim as Dimension])
        .filter((v): v is number => v !== null);
      if (scores.length > 0) {
        problemDimThresholds[pid][dim] = computeStdDevThresholds(scores);
      }
    }
  }

  // Add population stats for transparency
  const populationStats: Record<string, any> = {};

  // Overall
  const overallVals = pool.map((s) => s.totals.final_total_score);
  populationStats["overall_mean (final_total_score)"] = {
    μ: round3(mean(overallVals)),
    σ: round3(stddev(overallVals)),
    n: overallVals.length,
    thresholds: curve.overall_mean,
  };

  // Per-dimension
  for (const dim of DIMENSIONS) {
    const vals = pool.map((s) => s.ability_scores[dim]);
    populationStats[`ability.${dim}`] = {
      μ: round3(mean(vals)),
      σ: round3(stddev(vals)),
      n: vals.length,
      thresholds: curve.ability_curves[dim],
    };
  }

  // Per-problem
  for (const pid of problemIds) {
    const vals = pool
      .map((s) => s.problem_scores.find((p) => p.problem_id === pid))
      .filter((p): p is ProblemScore => p !== undefined)
      .map((p) => p.task_score);
    populationStats[`problem.${pid}`] = {
      μ: round3(mean(vals)),
      σ: round3(stddev(vals)),
      n: vals.length,
      thresholds: curve.problem_curves[pid],
    };
  }

  const curveOutput = {
    ...curve,
    population_stats: populationStats,
    problem_dimension_thresholds: problemDimThresholds,
  };
  fs.writeFileSync(
    path.join(outDir, "step3-curve.json"),
    JSON.stringify(curveOutput, null, 2)
  );
  console.log(`Step 3: Wrote Curve → step3-curve.json`);

  // 6. Apply curve to each score
  const gradedResults = pool.map((s) => applyGrades(s, curve));
  fs.writeFileSync(
    path.join(outDir, "step4-graded-results.json"),
    JSON.stringify(gradedResults, null, 2)
  );
  console.log(
    `Step 4: Wrote ${gradedResults.length} graded results → step4-graded-results.json`
  );

  // Print a summary comparison table
  console.log("\n=== Curve Thresholds ===\n");
  console.log("Category".padEnd(40), "A≥".padEnd(8), "B≥".padEnd(8), "C≥".padEnd(8));
  console.log("-".repeat(64));
  console.log(
    "overallMean".padEnd(40),
    String(curve.overall_mean.A).padEnd(8),
    String(curve.overall_mean.B).padEnd(8),
    String(curve.overall_mean.C).padEnd(8)
  );
  for (const dim of DIMENSIONS) {
    const t = curve.ability_curves[dim];
    console.log(
      `ability.${dim}`.padEnd(40),
      String(t.A).padEnd(8),
      String(t.B).padEnd(8),
      String(t.C).padEnd(8)
    );
  }
  for (const pid of [...problemIds].sort()) {
    const t = curve.problem_curves[pid];
    console.log(
      `problem.${pid}`.padEnd(40),
      String(t.A).padEnd(8),
      String(t.B).padEnd(8),
      String(t.C).padEnd(8)
    );
  }

  // Verify against original report values
  console.log("\n=== Verification: Derived vs Original ===\n");
  console.log(
    "Participant".padEnd(35),
    "derived-overallMean".padEnd(22),
    "orig-overallMean".padEnd(22),
    "match?"
  );
  console.log("-".repeat(100));

  // Read originals for comparison
  for (const s of cnScores.slice(0, 5)) {
    const origPath = path.join(cnDir, s.participant_id + ".json");
    const orig = JSON.parse(fs.readFileSync(origPath, "utf-8"));
    const derivedOM = round3(s.totals.final_total_score);
    const origOM = orig.overallMean;
    const match = Math.abs(derivedOM - origOM) < 0.001;
    console.log(
      s.participant_id.padEnd(35),
      String(derivedOM).padEnd(22),
      String(origOM).padEnd(22),
      match ? "✓" : `✗ (Δ=${round3(derivedOM - origOM)})`
    );
  }

  for (const s of enScores.slice(0, 5)) {
    const origPath = path.join(enDir, s.participant_id + ".json");
    const orig = JSON.parse(fs.readFileSync(origPath, "utf-8"));
    const derivedOM = round3(s.totals.final_total_score);
    const origOM = orig.overallMean;
    const match = Math.abs(derivedOM - origOM) < 0.001;
    console.log(
      s.participant_id.padEnd(35),
      String(derivedOM).padEnd(22),
      String(origOM).padEnd(22),
      match ? "✓" : `✗ (Δ=${round3(derivedOM - origOM)})`
    );
  }

  console.log("\nDone. All outputs written to ISS-test-data/");
}

main();
