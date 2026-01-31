/**
 * Synthetic Data Generator
 * Generates test data for each stage of the pipeline
 */

import { randomUUID } from "crypto";
import {
  ReportJSON,
  JSONScores,
  Curve,
  CurvedLetterGrades,
  CurvedReport,
  EventConfig,
  ScorePool,
  DimensionDependencyConfig,
} from "./schemas.js";

// =============================================================================
// Configuration
// =============================================================================

// Problem IDs (6 digit format)
const PROBLEM_IDS = [
  "003400",  // meeting-verify (EN)
  "003401",  // meeting-verify (ZH) - 会议总结校对
  "005000",  // thinking-traps (EN)
  "005001",  // thinking-traps (ZH) - 识别思维陷阱
  "010000",  // ling-bing (EN)
  "010001",  // ling-bing (ZH) - 丙语言翻译
];

// The 5 ability dimensions
const DIMENSION_IDS = [
  "discovery",            // 发现与自我理解
  "representation",       // 表达与转译
  "iterative-refinement", // 迭代与反馈
  "exploratory",          // 探索式发现
  "self-verification",    // 验证
];
const EVENT_ID = "event_2024_01";
const PROMPT_VERSION_HASH = "abc1234def5678";

// =============================================================================
// Utility Functions
// =============================================================================

function randomScore(): number {
  return Math.round(Math.random() * 100) / 100;
}

function randomUuid(): string {
  return randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function geometricMean(scores: number[]): number {
  if (scores.length === 0) return 0;
  const product = scores.reduce((acc, s) => acc * s, 1);
  return Math.pow(product, 1 / scores.length);
}

// =============================================================================
// Data Generators
// =============================================================================

/**
 * Generate Event Config
 */
export function generateEventConfig(): EventConfig {
  return {
    event_id: EVENT_ID,
    name: "AI Competency Assessment 2024-01",
    problem_ids: PROBLEM_IDS,
    dimension_ids: DIMENSION_IDS,
    language: "zh",
    prompt_version_hash: PROMPT_VERSION_HASH,
  };
}

/**
 * Generate Dimension-Problem Dependencies
 */
export function generateDimensionDependencies(): DimensionDependencyConfig {
  return {
    version: "1.0.0",
    updated_at: now(),
    dependencies: [
      {
        dimension_id: "discovery",
        contributing_problem_ids: ["003400", "003401", "005000", "005001"],
      },
      {
        dimension_id: "representation",
        contributing_problem_ids: ["003400", "003401", "010000", "010001"],
      },
      {
        dimension_id: "iterative-refinement",
        contributing_problem_ids: ["005000", "005001", "010000", "010001"],
      },
      {
        dimension_id: "exploratory",
        contributing_problem_ids: ["003400", "003401", "005000", "005001", "010000", "010001"],
      },
      {
        dimension_id: "self-verification",
        contributing_problem_ids: ["003400", "003401", "005000", "005001"],
      },
    ],
  };
}

/**
 * Generate a single Report JSON (Stage 1 output)
 */
export function generateReportJSON(participantId: string): ReportJSON {
  const problems = PROBLEM_IDS.map((pid) => ({
    problem_id: pid,
    dimension_scores: Object.fromEntries(
      DIMENSION_IDS.map((did) => [did, randomScore()])
    ),
    objective_score: randomScore(),
  }));

  // Calculate ability scores (average across problems)
  const abilities = DIMENSION_IDS.map((did) => {
    const scores = problems.map((p) => p.dimension_scores[did]);
    return {
      dimension_id: did,
      score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
    };
  });

  // Calculate total scores
  const total_problem_score = Math.round(
    (problems.reduce((sum, p) => sum + p.objective_score, 0) / problems.length) * 100
  ) / 100;
  const total_ability_score = Math.round(
    (abilities.reduce((sum, a) => sum + a.score, 0) / abilities.length) * 100
  ) / 100;
  const final_total_score = Math.round(
    geometricMean([total_problem_score, total_ability_score]) * 100
  ) / 100;

  return {
    report_id: randomUuid(),
    event_id: EVENT_ID,
    prompt_version_hash: PROMPT_VERSION_HASH,
    generated_at: now(),
    participant_id: participantId,
    problems,
    abilities,
    totals: {
      total_problem_score,
      total_ability_score,
      final_total_score,
    },
    letter_grades: null, // MUST be null for uncurved report
  };
}

/**
 * Generate multiple Report JSONs
 */
export function generateMultipleReports(count: number): ReportJSON[] {
  return Array.from({ length: count }, (_, i) =>
    generateReportJSON(`participant_${String(i + 1).padStart(3, "0")}`)
  );
}

/**
 * Extract JSON Scores from Report JSON (Stage 2)
 */
export function extractJSONScores(report: ReportJSON): JSONScores {
  return {
    source_report_id: report.report_id,
    event_id: report.event_id,
    participant_id: report.participant_id,
    totals: report.totals,
    ability_scores: report.abilities.map((a) => ({
      dimension_id: a.dimension_id,
      score: a.score,
    })),
    problem_scores: report.problems.map((p) => ({
      problem_id: p.problem_id,
      objective_score: p.objective_score,
      dimension_scores: Object.entries(p.dimension_scores).map(([did, score]) => ({
        dimension_id: did,
        score,
      })),
    })),
  };
}

/**
 * Create Score Pool from multiple scores (Stage 3 input)
 */
export function createScorePool(scores: JSONScores[]): ScorePool {
  if (scores.length === 0) {
    throw new Error("Cannot create score pool from empty scores array");
  }

  return {
    event_id: scores[0].event_id,
    prompt_version_hash: PROMPT_VERSION_HASH,
    problem_ids: PROBLEM_IDS,
    dimension_ids: DIMENSION_IDS,
    scores,
  };
}

/**
 * Compute Curve from Score Pool (Stage 3 output)
 * Uses standard deviation method: A > μ+σ, B > μ, C > μ-σ, D <= μ-σ
 */
export function computeCurve(pool: ScorePool): Curve {
  const scores = pool.scores;

  // Helper: compute standard deviation thresholds (clamped to 0-1 range)
  function computeStdDevThresholds(values: number[]): number[] {
    if (values.length === 0) return [0.8, 0.5, 0.2];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Clamp values to [0, 1] since scores cannot exceed this range
    const clamp = (v: number) => Math.max(0, Math.min(1, v));

    return [
      Math.round(clamp(mean + stdDev) * 1000) / 1000,  // A threshold: μ + σ
      Math.round(clamp(mean) * 1000) / 1000,           // B threshold: μ
      Math.round(clamp(mean - stdDev) * 1000) / 1000,  // C threshold: μ - σ
    ];
  }

  // Compute total score thresholds
  const totalProblemScores = scores.map((s) => s.totals.total_problem_score);
  const totalAbilityScores = scores.map((s) => s.totals.total_ability_score);
  const finalTotalScores = scores.map((s) => s.totals.final_total_score);

  // Compute per-dimension thresholds
  const abilityThresholds = DIMENSION_IDS.map((did) => {
    const dimScores = scores.flatMap((s) =>
      s.ability_scores.filter((a) => a.dimension_id === did).map((a) => a.score)
    );
    return {
      dimension_id: did,
      thresholds: computeStdDevThresholds(dimScores),
      grades: ["A", "B", "C", "D"] as const,
    };
  });

  // Compute per-problem thresholds
  const problemThresholds = PROBLEM_IDS.map((pid) => {
    const probScores = scores.flatMap((s) =>
      s.problem_scores.filter((p) => p.problem_id === pid).map((p) => p.objective_score)
    );
    return {
      problem_id: pid,
      thresholds: computeStdDevThresholds(probScores),
      grades: ["A", "B", "C", "D"] as const,
    };
  });

  return {
    curve_id: randomUuid(),
    source_event_id: pool.event_id,
    prompt_version_hash: pool.prompt_version_hash,
    problem_ids: pool.problem_ids,
    dimension_ids: pool.dimension_ids,
    method: {
      type: "standard_deviation",
      sigma_boundaries: [1, 0, -1],  // A: +1σ, B: mean, C: -1σ
    },
    sample_size: scores.length,
    computed_at: now(),
    totals: {
      total_problem: {
        thresholds: computeStdDevThresholds(totalProblemScores),
        grades: ["A", "B", "C", "D"],
      },
      total_ability: {
        thresholds: computeStdDevThresholds(totalAbilityScores),
        grades: ["A", "B", "C", "D"],
      },
      final_total: {
        thresholds: computeStdDevThresholds(finalTotalScores),
        grades: ["A", "B", "C", "D"],
      },
    },
    ability_curves: abilityThresholds,
    problem_curves: problemThresholds,
  };
}

/**
 * Apply Curve to Scores (Stage 4 output)
 */
export function applyCurve(scores: JSONScores, curve: Curve): CurvedLetterGrades {
  // Helper: determine grade from score and thresholds
  function getGrade(score: number, thresholds: number[]): "A" | "B" | "C" | "D" {
    if (score >= thresholds[0]) return "A";
    if (score >= thresholds[1]) return "B";
    if (score >= thresholds[2]) return "C";
    return "D";
  }

  // Grade the three total scores
  const totalProblemGrade = getGrade(scores.totals.total_problem_score, curve.totals.total_problem.thresholds);
  const totalAbilityGrade = getGrade(scores.totals.total_ability_score, curve.totals.total_ability.thresholds);
  const finalTotalGrade = getGrade(scores.totals.final_total_score, curve.totals.final_total.thresholds);

  const abilityGrades = scores.ability_scores.map((a) => {
    const curveData = curve.ability_curves.find((c) => c.dimension_id === a.dimension_id);
    return {
      dimension_id: a.dimension_id,
      grade: getGrade(a.score, curveData?.thresholds ?? [0.8, 0.6, 0.4]),
    };
  });

  const problemGrades = scores.problem_scores.map((p) => {
    const curveData = curve.problem_curves.find((c) => c.problem_id === p.problem_id);
    return {
      problem_id: p.problem_id,
      grade: getGrade(p.objective_score, curveData?.thresholds ?? [0.8, 0.6, 0.4]),
    };
  });

  return {
    source_scores_id: scores.source_report_id,
    curve_id: curve.curve_id,
    computed_at: now(),
    total_grades: {
      total_problem_grade: totalProblemGrade,
      total_ability_grade: totalAbilityGrade,
      final_total_grade: finalTotalGrade,
    },
    ability_grades: abilityGrades,
    problem_grades: problemGrades,
  };
}

/**
 * Merge Report and Grades into Curved Report (Stage 5 output)
 */
export function mergeIntoCurvedReport(
  report: ReportJSON,
  grades: CurvedLetterGrades
): CurvedReport {
  return {
    curved_report_id: randomUuid(),
    source_report_id: report.report_id,
    event_id: report.event_id,
    prompt_version_hash: report.prompt_version_hash,
    applied_curve_id: grades.curve_id,
    curved_at: now(),
    participant_id: report.participant_id,
    problems: report.problems,
    abilities: report.abilities,
    totals: report.totals,
    letter_grades: {
      totals: {
        total_problem: grades.total_grades.total_problem_grade,
        total_ability: grades.total_grades.total_ability_grade,
        final_total: grades.total_grades.final_total_grade,
      },
      abilities: Object.fromEntries(
        grades.ability_grades.map((a) => [a.dimension_id, a.grade])
      ),
      problems: Object.fromEntries(
        grades.problem_grades.map((p) => [p.problem_id, p.grade])
      ),
    },
  };
}

// =============================================================================
// Main: Generate and Save All Synthetic Data
// =============================================================================

import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = "./synthetic-data";

function saveJSON(filename: string, data: unknown): void {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`Saved: ${filepath}`);
}

async function main() {
  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log("Generating synthetic data...\n");

  // 1. Generate event config
  const eventConfig = generateEventConfig();
  saveJSON("00-event-config.json", eventConfig);

  // 2. Generate dimension dependencies
  const dependencies = generateDimensionDependencies();
  saveJSON("00-dimension-dependencies.json", dependencies);

  // 3. Generate multiple Report JSONs (simulate LLM output)
  const reports = generateMultipleReports(20);
  saveJSON("01-report-jsons.json", reports);
  saveJSON("01-report-json-single.json", reports[0]);

  // 4. Extract JSON Scores from each report
  const allScores = reports.map(extractJSONScores);
  saveJSON("02-json-scores.json", allScores);
  saveJSON("02-json-scores-single.json", allScores[0]);

  // 5. Create Score Pool
  const scorePool = createScorePool(allScores);
  saveJSON("03-score-pool.json", scorePool);

  // 6. Compute Curve
  const curve = computeCurve(scorePool);
  saveJSON("03-curve.json", curve);

  // 7. Apply Curve to each score
  const allGrades = allScores.map((s) => applyCurve(s, curve));
  saveJSON("04-curved-letter-grades.json", allGrades);
  saveJSON("04-curved-letter-grades-single.json", allGrades[0]);

  // 8. Merge into Curved Reports
  const curvedReports = reports.map((r, i) => mergeIntoCurvedReport(r, allGrades[i]));
  saveJSON("05-curved-reports.json", curvedReports);
  saveJSON("05-curved-report-single.json", curvedReports[0]);

  console.log("\n✅ All synthetic data generated successfully!");
  console.log(`Output directory: ${path.resolve(OUTPUT_DIR)}`);
}

main().catch(console.error);
