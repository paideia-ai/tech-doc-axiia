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

const PROBLEM_IDS = ["9034940", "9034941", "9035030", "9035031", "9036120", "9036121"];
const DIMENSION_IDS = ["verification", "critical_thinking", "communication", "collaboration"];
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
        dimension_id: "verification",
        contributing_problem_ids: ["9034940", "9034941", "9035030", "9035031"],
      },
      {
        dimension_id: "critical_thinking",
        contributing_problem_ids: ["9034940", "9034941", "9036120", "9036121"],
      },
      {
        dimension_id: "communication",
        contributing_problem_ids: ["9035030", "9035031", "9036120", "9036121"],
      },
      {
        dimension_id: "collaboration",
        contributing_problem_ids: ["9034940", "9034941", "9035030", "9035031", "9036120", "9036121"],
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

  // Calculate overall score (geometric mean of ability scores)
  const overall = geometricMean(abilities.map((a) => a.score));

  return {
    report_id: randomUuid(),
    event_id: EVENT_ID,
    prompt_version_hash: PROMPT_VERSION_HASH,
    generated_at: now(),
    participant_id: participantId,
    problems,
    abilities,
    overall_score: Math.round(overall * 100) / 100,
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
    overall_score: report.overall_score,
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
 */
export function computeCurve(pool: ScorePool): Curve {
  const scores = pool.scores;

  // Helper: compute percentile thresholds
  function computeThresholds(values: number[]): number[] {
    const sorted = [...values].sort((a, b) => b - a);
    const n = sorted.length;
    return [
      sorted[Math.floor(n * 0.2)] || 0.8, // Top 20% -> A
      sorted[Math.floor(n * 0.5)] || 0.6, // Top 50% -> B
      sorted[Math.floor(n * 0.8)] || 0.4, // Top 80% -> C
    ];
  }

  // Compute overall thresholds
  const overallScores = scores.map((s) => s.overall_score ?? 0);
  const overallThresholds = computeThresholds(overallScores);

  // Compute per-dimension thresholds
  const abilityThresholds = DIMENSION_IDS.map((did) => {
    const dimScores = scores.flatMap((s) =>
      s.ability_scores.filter((a) => a.dimension_id === did).map((a) => a.score)
    );
    return {
      dimension_id: did,
      thresholds: computeThresholds(dimScores),
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
      thresholds: computeThresholds(probScores),
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
      type: "percentile",
      percentiles: [0.8, 0.5, 0.2],
    },
    sample_size: scores.length,
    computed_at: now(),
    overall: {
      thresholds: overallThresholds,
      grades: ["A", "B", "C", "D"],
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

  const overallGrade = getGrade(scores.overall_score ?? 0, curve.overall.thresholds);

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
    overall_grade: overallGrade,
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
    overall_score: report.overall_score,
    letter_grades: {
      overall: grades.overall_grade,
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
