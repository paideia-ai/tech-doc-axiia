/**
 * Pipeline Processing Functions
 * Each function has clearly defined input/output schemas
 */

import {
  ReportJSON,
  ReportJSONSchema,
  JSONScores,
  JSONScoresSchema,
  Curve,
  CurveSchema,
  CurvedLetterGrades,
  CurvedLetterGradesSchema,
  CurvedReport,
  CurvedReportSchema,
  ScorePool,
  ScorePoolSchema,
  CompatibilityResult,
  CompatibilityResultSchema,
  EventConfig,
  EventConfigSchema,
} from "./schemas.js";
import { z } from "zod";
import { randomUUID } from "crypto";

// =============================================================================
// Stage 1: LLM Output → Report JSON (Validation Only)
// =============================================================================

/**
 * INPUT: Raw LLM output (unknown)
 * OUTPUT: Validated ReportJSON
 *
 * Validates that LLM output conforms to ReportJSON schema.
 * Ensures letter_grades is null (uncurved).
 */
export const validateReportJSONInput = z.unknown();
export const validateReportJSONOutput = ReportJSONSchema;

export function validateReportJSON(input: unknown): ReportJSON {
  const result = ReportJSONSchema.safeParse(input);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Report JSON validation failed:\n${errors.join('\n')}`);
  }

  if (result.data.letter_grades !== null) {
    throw new Error("Report JSON must have letter_grades = null (uncurved)");
  }

  return result.data;
}

// =============================================================================
// Stage 2: Report JSON → JSON Scores (Extraction)
// =============================================================================

/**
 * INPUT: ReportJSON
 * OUTPUT: JSONScores
 *
 * Extracts scores from report into flat structure for processing.
 */
export const extractScoresInput = ReportJSONSchema;
export const extractScoresOutput = JSONScoresSchema;

export function extractScores(report: ReportJSON): JSONScores {
  // Validate input
  const validatedInput = ReportJSONSchema.parse(report);

  const scores: JSONScores = {
    source_report_id: validatedInput.report_id,
    event_id: validatedInput.event_id,
    participant_id: validatedInput.participant_id,
    totals: validatedInput.totals,
    ability_scores: validatedInput.abilities.map(a => ({
      dimension_id: a.dimension_id,
      score: a.score,
    })),
    problem_scores: validatedInput.problems.map(p => ({
      problem_id: p.problem_id,
      objective_score: p.objective_score,
      dimension_scores: Object.entries(p.dimension_scores).map(([did, score]) => ({
        dimension_id: did,
        score,
      })),
    })),
  };

  // Validate output
  return JSONScoresSchema.parse(scores);
}

// =============================================================================
// Stage 3a: Create Score Pool (Aggregation)
// =============================================================================

/**
 * INPUT: { scores: JSONScores[], config: EventConfig }
 * OUTPUT: ScorePool
 *
 * Aggregates multiple scores into a pool for curve computation.
 */
export const createScorePoolInput = z.object({
  scores: z.array(JSONScoresSchema),
  config: EventConfigSchema,
});
export const createScorePoolOutput = ScorePoolSchema;

export function createScorePool(
  scores: JSONScores[],
  config: EventConfig
): ScorePool {
  // Validate inputs
  const validatedScores = z.array(JSONScoresSchema).parse(scores);
  const validatedConfig = EventConfigSchema.parse(config);

  if (validatedScores.length === 0) {
    throw new Error("Cannot create score pool from empty scores array");
  }

  // Verify all scores belong to the same event
  const mismatchedEvents = validatedScores.filter(s => s.event_id !== validatedConfig.event_id);
  if (mismatchedEvents.length > 0) {
    throw new Error(`Score pool event mismatch: expected ${validatedConfig.event_id}, found ${mismatchedEvents[0].event_id}`);
  }

  const pool: ScorePool = {
    event_id: validatedConfig.event_id,
    prompt_version_hash: validatedConfig.prompt_version_hash,
    problem_ids: validatedConfig.problem_ids,
    dimension_ids: validatedConfig.dimension_ids,
    scores: validatedScores,
  };

  // Validate output
  return ScorePoolSchema.parse(pool);
}

// =============================================================================
// Stage 3b: Compute Curve (Calculation)
// =============================================================================

/**
 * INPUT: ScorePool
 * OUTPUT: Curve
 *
 * Computes grade thresholds from score pool using standard deviation method.
 * A: score >= μ+σ, B: score >= μ, C: score >= μ-σ, D: score < μ-σ
 */
export const computeCurveInput = ScorePoolSchema;
export const computeCurveOutput = CurveSchema;

export function computeCurve(pool: ScorePool): Curve {
  // Validate input
  const validatedPool = ScorePoolSchema.parse(pool);

  // Helper: compute standard deviation thresholds (clamped to 0-1 range)
  function computeStdDevThresholds(values: number[]): number[] {
    if (values.length === 0) return [0.8, 0.5, 0.2];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Clamp values to [0, 1] since scores cannot exceed this range
    const clamp = (v: number) => Math.max(0, Math.min(1, v));

    return [
      Math.round(clamp(mean + stdDev) * 1000) / 1000,  // A: μ + σ
      Math.round(clamp(mean) * 1000) / 1000,           // B: μ
      Math.round(clamp(mean - stdDev) * 1000) / 1000,  // C: μ - σ
    ];
  }

  const scores = validatedPool.scores;

  // Total score thresholds
  const totalProblemScores = scores.map(s => s.totals.total_problem_score);
  const totalAbilityScores = scores.map(s => s.totals.total_ability_score);
  const finalTotalScores = scores.map(s => s.totals.final_total_score);

  // Ability thresholds
  const abilityThresholds = validatedPool.dimension_ids.map(did => {
    const dimScores = scores.flatMap(s =>
      s.ability_scores.filter(a => a.dimension_id === did).map(a => a.score)
    );
    return {
      dimension_id: did,
      thresholds: computeStdDevThresholds(dimScores),
      grades: ["A", "B", "C", "D"] as ("A" | "B" | "C" | "D")[],
    };
  });

  // Problem thresholds
  const problemThresholds = validatedPool.problem_ids.map(pid => {
    const probScores = scores.flatMap(s =>
      s.problem_scores.filter(p => p.problem_id === pid).map(p => p.objective_score)
    );
    return {
      problem_id: pid,
      thresholds: computeStdDevThresholds(probScores),
      grades: ["A", "B", "C", "D"] as ("A" | "B" | "C" | "D")[],
    };
  });

  const curve: Curve = {
    curve_id: randomUUID(),
    source_event_id: validatedPool.event_id,
    prompt_version_hash: validatedPool.prompt_version_hash,
    problem_ids: validatedPool.problem_ids,
    dimension_ids: validatedPool.dimension_ids,
    method: {
      type: "standard_deviation",
      sigma_boundaries: [1, 0, -1],  // A: +1σ, B: mean, C: -1σ
    },
    sample_size: scores.length,
    computed_at: new Date().toISOString(),
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

  // Validate output
  return CurveSchema.parse(curve);
}

// =============================================================================
// Stage 4a: Check Compatibility
// =============================================================================

/**
 * INPUT: { scores: JSONScores, curve: Curve, options?: { allowLanguageDifference: boolean } }
 * OUTPUT: CompatibilityResult
 *
 * Checks if a curve can be applied to the given scores.
 */
export const checkCompatibilityInput = z.object({
  scores: JSONScoresSchema,
  curve: CurveSchema,
  options: z.object({
    allowLanguageDifference: z.boolean().optional(),
  }).optional(),
});
export const checkCompatibilityOutput = CompatibilityResultSchema;

export function checkCompatibility(
  scores: JSONScores,
  curve: Curve,
  options?: { allowLanguageDifference?: boolean }
): CompatibilityResult {
  // Validate inputs
  const validatedScores = JSONScoresSchema.parse(scores);
  const validatedCurve = CurveSchema.parse(curve);

  const reasons: string[] = [];
  const warnings: string[] = [];

  // Helper: extract base problem ID (without language suffix)
  function extractBase(pid: string): string {
    return pid.slice(0, -1);
  }

  // Check problem IDs
  const scoreProblemIds = new Set(validatedScores.problem_scores.map(p => p.problem_id));
  const curveProblemIds = new Set(validatedCurve.problem_ids);

  for (const pid of curveProblemIds) {
    const hasMatch = options?.allowLanguageDifference
      ? [...scoreProblemIds].some(spid => extractBase(spid) === extractBase(pid))
      : scoreProblemIds.has(pid);

    if (!hasMatch) {
      reasons.push(`Curve requires problem ${pid} but scores missing it`);
    }
  }

  for (const pid of scoreProblemIds) {
    const hasMatch = options?.allowLanguageDifference
      ? [...curveProblemIds].some(cpid => extractBase(cpid) === extractBase(pid))
      : curveProblemIds.has(pid);

    if (!hasMatch) {
      reasons.push(`Scores has problem ${pid} but curve doesn't include it`);
    }
  }

  // Check dimension IDs
  const scoreDimIds = new Set(validatedScores.ability_scores.map(a => a.dimension_id));
  const curveDimIds = new Set(validatedCurve.dimension_ids);

  for (const did of curveDimIds) {
    if (!scoreDimIds.has(did)) {
      reasons.push(`Curve requires dimension ${did} but scores missing it`);
    }
  }

  for (const did of scoreDimIds) {
    if (!curveDimIds.has(did)) {
      reasons.push(`Scores has dimension ${did} but curve doesn't include it`);
    }
  }

  if (reasons.length > 0) {
    return CompatibilityResultSchema.parse({
      status: "incompatible",
      reasons,
    });
  }

  return CompatibilityResultSchema.parse({
    status: "compatible",
  });
}

// =============================================================================
// Stage 4b: Apply Curve
// =============================================================================

/**
 * INPUT: { scores: JSONScores, curve: Curve }
 * OUTPUT: CurvedLetterGrades
 *
 * Applies curve thresholds to scores to generate letter grades.
 * Requires compatible scores and curve.
 */
export const applyCurveInput = z.object({
  scores: JSONScoresSchema,
  curve: CurveSchema,
});
export const applyCurveOutput = CurvedLetterGradesSchema;

export function applyCurve(scores: JSONScores, curve: Curve): CurvedLetterGrades {
  // Validate inputs
  const validatedScores = JSONScoresSchema.parse(scores);
  const validatedCurve = CurveSchema.parse(curve);

  // Check compatibility first
  const compatibility = checkCompatibility(validatedScores, validatedCurve);
  if (compatibility.status === "incompatible") {
    throw new Error(`Cannot apply curve: ${compatibility.reasons.join(", ")}`);
  }

  // Helper: determine grade from score
  function getGrade(score: number, thresholds: number[]): "A" | "B" | "C" | "D" {
    if (score >= thresholds[0]) return "A";
    if (score >= thresholds[1]) return "B";
    if (score >= thresholds[2]) return "C";
    return "D";
  }

  // Grade the three total scores
  const totalProblemGrade = getGrade(
    validatedScores.totals.total_problem_score,
    validatedCurve.totals.total_problem.thresholds
  );
  const totalAbilityGrade = getGrade(
    validatedScores.totals.total_ability_score,
    validatedCurve.totals.total_ability.thresholds
  );
  const finalTotalGrade = getGrade(
    validatedScores.totals.final_total_score,
    validatedCurve.totals.final_total.thresholds
  );

  const abilityGrades = validatedScores.ability_scores.map(a => {
    const curveData = validatedCurve.ability_curves.find(c => c.dimension_id === a.dimension_id);
    return {
      dimension_id: a.dimension_id,
      grade: getGrade(a.score, curveData?.thresholds ?? [0.8, 0.6, 0.4]),
    };
  });

  const problemGrades = validatedScores.problem_scores.map(p => {
    const curveData = validatedCurve.problem_curves.find(c => c.problem_id === p.problem_id);
    return {
      problem_id: p.problem_id,
      grade: getGrade(p.objective_score, curveData?.thresholds ?? [0.8, 0.6, 0.4]),
    };
  });

  const grades: CurvedLetterGrades = {
    source_scores_id: validatedScores.source_report_id,
    curve_id: validatedCurve.curve_id,
    computed_at: new Date().toISOString(),
    total_grades: {
      total_problem_grade: totalProblemGrade,
      total_ability_grade: totalAbilityGrade,
      final_total_grade: finalTotalGrade,
    },
    ability_grades: abilityGrades,
    problem_grades: problemGrades,
  };

  // Validate output
  return CurvedLetterGradesSchema.parse(grades);
}

// =============================================================================
// Stage 5: Merge into Curved Report
// =============================================================================

/**
 * INPUT: { report: ReportJSON, grades: CurvedLetterGrades }
 * OUTPUT: CurvedReport
 *
 * Merges original report with letter grades to create final curved report.
 */
export const mergeIntoCurvedReportInput = z.object({
  report: ReportJSONSchema,
  grades: CurvedLetterGradesSchema,
});
export const mergeIntoCurvedReportOutput = CurvedReportSchema;

export function mergeIntoCurvedReport(
  report: ReportJSON,
  grades: CurvedLetterGrades
): CurvedReport {
  // Validate inputs
  const validatedReport = ReportJSONSchema.parse(report);
  const validatedGrades = CurvedLetterGradesSchema.parse(grades);

  // Verify the grades match the report
  if (validatedGrades.source_scores_id !== validatedReport.report_id) {
    throw new Error(
      `Grades source_scores_id (${validatedGrades.source_scores_id}) doesn't match report_id (${validatedReport.report_id})`
    );
  }

  const curvedReport: CurvedReport = {
    curved_report_id: randomUUID(),
    source_report_id: validatedReport.report_id,
    event_id: validatedReport.event_id,
    prompt_version_hash: validatedReport.prompt_version_hash,
    applied_curve_id: validatedGrades.curve_id,
    curved_at: new Date().toISOString(),
    participant_id: validatedReport.participant_id,
    problems: validatedReport.problems,
    abilities: validatedReport.abilities,
    totals: validatedReport.totals,
    letter_grades: {
      totals: {
        total_problem: validatedGrades.total_grades.total_problem_grade,
        total_ability: validatedGrades.total_grades.total_ability_grade,
        final_total: validatedGrades.total_grades.final_total_grade,
      },
      abilities: Object.fromEntries(
        validatedGrades.ability_grades.map(a => [a.dimension_id, a.grade])
      ),
      problems: Object.fromEntries(
        validatedGrades.problem_grades.map(p => [p.problem_id, p.grade])
      ),
    },
  };

  // Validate output
  return CurvedReportSchema.parse(curvedReport);
}

// =============================================================================
// Full Pipeline Function
// =============================================================================

/**
 * INPUT: { reports: unknown[], config: EventConfig }
 * OUTPUT: { curvedReports: CurvedReport[], curve: Curve, errors: string[] }
 *
 * Runs the full pipeline from raw LLM outputs to curved reports.
 */
export const runFullPipelineInput = z.object({
  reports: z.array(z.unknown()),
  config: EventConfigSchema,
});
export const runFullPipelineOutput = z.object({
  curvedReports: z.array(CurvedReportSchema),
  curve: CurveSchema,
  errors: z.array(z.string()),
});

export function runFullPipeline(
  reports: unknown[],
  config: EventConfig
): { curvedReports: CurvedReport[]; curve: Curve; errors: string[] } {
  const errors: string[] = [];
  const validReports: ReportJSON[] = [];

  // Stage 1: Validate all reports
  for (let i = 0; i < reports.length; i++) {
    try {
      const validated = validateReportJSON(reports[i]);
      validReports.push(validated);
    } catch (e) {
      errors.push(`Report ${i}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (validReports.length === 0) {
    throw new Error("No valid reports to process");
  }

  // Stage 2: Extract scores
  const scores = validReports.map(r => extractScores(r));

  // Stage 3: Create pool and compute curve
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);

  // Stage 4 & 5: Apply curve and merge
  const curvedReports: CurvedReport[] = [];
  for (let i = 0; i < validReports.length; i++) {
    try {
      const grades = applyCurve(scores[i], curve);
      const curvedReport = mergeIntoCurvedReport(validReports[i], grades);
      curvedReports.push(curvedReport);
    } catch (e) {
      errors.push(`Curving report ${i}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { curvedReports, curve, errors };
}

// =============================================================================
// Export all IO schemas for documentation
// =============================================================================

export const PipelineSchemas = {
  // Stage 1
  validateReportJSON: { input: validateReportJSONInput, output: validateReportJSONOutput },
  // Stage 2
  extractScores: { input: extractScoresInput, output: extractScoresOutput },
  // Stage 3a
  createScorePool: { input: createScorePoolInput, output: createScorePoolOutput },
  // Stage 3b
  computeCurve: { input: computeCurveInput, output: computeCurveOutput },
  // Stage 4a
  checkCompatibility: { input: checkCompatibilityInput, output: checkCompatibilityOutput },
  // Stage 4b
  applyCurve: { input: applyCurveInput, output: applyCurveOutput },
  // Stage 5
  mergeIntoCurvedReport: { input: mergeIntoCurvedReportInput, output: mergeIntoCurvedReportOutput },
  // Full pipeline
  runFullPipeline: { input: runFullPipelineInput, output: runFullPipelineOutput },
};
