/**
 * Pipeline Tests
 * Tests schema validation and pipeline functions with edge cases
 */

import {
  validateReportJSON,
  extractScores,
  createScorePool,
  computeCurve,
  checkCompatibility,
  applyCurve,
  mergeIntoCurvedReport,
  runFullPipeline,
} from "./pipeline-functions.js";
import {
  generateReportJSON,
  generateMultipleReports,
  generateEventConfig,
  extractJSONScores,
} from "./generate-synthetic-data.js";
import {
  ReportJSONSchema,
  JSONScoresSchema,
  CurveSchema,
  CurvedLetterGradesSchema,
  CurvedReportSchema,
} from "./schemas.js";

// =============================================================================
// Test Utilities
// =============================================================================

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (e) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${e instanceof Error ? e.message : String(e)}`);
    testsFailed++;
  }
}

function testError(name: string, fn: () => void, expectedError?: string): void {
  try {
    fn();
    console.log(`❌ ${name} (expected error but succeeded)`);
    testsFailed++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (expectedError && !msg.includes(expectedError)) {
      console.log(`❌ ${name} (wrong error)`);
      console.log(`   Expected: ${expectedError}`);
      console.log(`   Got: ${msg}`);
      testsFailed++;
    } else {
      console.log(`✅ ${name} (correctly threw error)`);
      testsPassed++;
    }
  }
}

// =============================================================================
// Stage 1 Tests: Report JSON Validation
// =============================================================================

console.log("\n========== Stage 1: Report JSON Validation ==========\n");

test("Valid report JSON passes validation", () => {
  const report = generateReportJSON("test_user_001");
  const validated = validateReportJSON(report);
  ReportJSONSchema.parse(validated);
});

testError("Report with non-null letter_grades fails", () => {
  const report = generateReportJSON("test_user");
  (report as any).letter_grades = { overall: "A", abilities: {}, problems: {} };
  validateReportJSON(report);
}, "letter_grades");

testError("Report missing required field fails", () => {
  const report = generateReportJSON("test_user");
  delete (report as any).event_id;
  validateReportJSON(report);
});

testError("Report with invalid problem_id fails", () => {
  const report = generateReportJSON("test_user");
  report.problems[0].problem_id = "invalid"; // Not 6-8 digits
  validateReportJSON(report);
}, "Problem ID");

testError("Report with out-of-range score fails", () => {
  const report = generateReportJSON("test_user");
  report.problems[0].objective_score = 1.5; // > 1
  validateReportJSON(report);
});

// =============================================================================
// Stage 2 Tests: Score Extraction
// =============================================================================

console.log("\n========== Stage 2: Score Extraction ==========\n");

test("Extract scores from valid report", () => {
  const report = generateReportJSON("test_user");
  const scores = extractScores(report);
  JSONScoresSchema.parse(scores);

  // Verify source linking
  if (scores.source_report_id !== report.report_id) {
    throw new Error("Source report ID mismatch");
  }
});

test("Extracted scores preserve all data", () => {
  const report = generateReportJSON("test_user");
  const scores = extractScores(report);

  // Check counts
  if (scores.problem_scores.length !== report.problems.length) {
    throw new Error("Problem count mismatch");
  }
  if (scores.ability_scores.length !== report.abilities.length) {
    throw new Error("Ability count mismatch");
  }
});

// =============================================================================
// Stage 3 Tests: Score Pool and Curve Computation
// =============================================================================

console.log("\n========== Stage 3: Score Pool & Curve ==========\n");

test("Create score pool from multiple scores", () => {
  const reports = generateMultipleReports(10);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);

  if (pool.scores.length !== 10) {
    throw new Error("Pool should have 10 scores");
  }
});

testError("Empty scores array fails", () => {
  const config = generateEventConfig();
  createScorePool([], config);
}, "empty");

testError("Event ID mismatch fails", () => {
  const reports = generateMultipleReports(5);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  scores[0].event_id = "different_event";
  createScorePool(scores, config);
}, "mismatch");

test("Compute curve from score pool", () => {
  const reports = generateMultipleReports(20);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);

  CurveSchema.parse(curve);

  // Verify curve structure
  if (curve.sample_size !== 20) {
    throw new Error("Curve sample_size should be 20");
  }
  if (curve.totals.final_total.thresholds.length !== 3) {
    throw new Error("Final total thresholds should have 3 values");
  }
});

test("Curve thresholds are in descending order", () => {
  const reports = generateMultipleReports(50);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);

  const t = curve.totals.final_total.thresholds;
  if (!(t[0] >= t[1] && t[1] >= t[2])) {
    throw new Error(`Thresholds not descending: ${t}`);
  }
});

// =============================================================================
// Stage 4 Tests: Compatibility and Curve Application
// =============================================================================

console.log("\n========== Stage 4: Compatibility & Apply Curve ==========\n");

test("Compatible scores and curve pass check", () => {
  const reports = generateMultipleReports(10);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);

  const result = checkCompatibility(scores[0], curve);
  if (result.status !== "compatible") {
    throw new Error(`Expected compatible, got ${result.status}`);
  }
});

test("Incompatible problem IDs detected", () => {
  const reports = generateMultipleReports(10);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);

  // Modify scores to have different problem
  const modifiedScores = { ...scores[0] };
  modifiedScores.problem_scores = [
    ...modifiedScores.problem_scores,
    {
      problem_id: "999999",
      objective_score: 0.5,
      dimension_scores: [],
    },
  ];

  const result = checkCompatibility(modifiedScores, curve);
  if (result.status !== "incompatible") {
    throw new Error("Should be incompatible");
  }
});

test("Apply curve generates valid letter grades", () => {
  const reports = generateMultipleReports(20);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);

  const grades = applyCurve(scores[0], curve);
  CurvedLetterGradesSchema.parse(grades);

  // Verify grade values
  const validGrades = ["A", "B", "C", "D"];
  if (!validGrades.includes(grades.total_grades.final_total_grade)) {
    throw new Error(`Invalid final total grade: ${grades.total_grades.final_total_grade}`);
  }
});

testError("Applying incompatible curve fails", () => {
  const reports = generateMultipleReports(10);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);

  // Remove a dimension from scores
  const modifiedScores = { ...scores[0] };
  modifiedScores.ability_scores = modifiedScores.ability_scores.slice(0, 1);

  applyCurve(modifiedScores, curve);
}, "Cannot apply curve");

// =============================================================================
// Stage 5 Tests: Merge into Curved Report
// =============================================================================

console.log("\n========== Stage 5: Merge into Curved Report ==========\n");

test("Merge creates valid curved report", () => {
  const reports = generateMultipleReports(10);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);
  const grades = applyCurve(scores[0], curve);

  const curvedReport = mergeIntoCurvedReport(reports[0], grades);
  CurvedReportSchema.parse(curvedReport);

  // Verify references
  if (curvedReport.source_report_id !== reports[0].report_id) {
    throw new Error("Source report ID mismatch");
  }
  if (curvedReport.applied_curve_id !== curve.curve_id) {
    throw new Error("Applied curve ID mismatch");
  }
});

test("Curved report has all letter grades", () => {
  const reports = generateMultipleReports(10);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);
  const grades = applyCurve(scores[0], curve);
  const curvedReport = mergeIntoCurvedReport(reports[0], grades);

  // Check letter_grades structure
  if (!curvedReport.letter_grades.totals.final_total) {
    throw new Error("Missing final total grade");
  }
  if (!curvedReport.letter_grades.totals.total_problem) {
    throw new Error("Missing total problem grade");
  }
  if (!curvedReport.letter_grades.totals.total_ability) {
    throw new Error("Missing total ability grade");
  }
  if (Object.keys(curvedReport.letter_grades.abilities).length === 0) {
    throw new Error("Missing ability grades");
  }
  if (Object.keys(curvedReport.letter_grades.problems).length === 0) {
    throw new Error("Missing problem grades");
  }
});

testError("Mismatched report and grades fails", () => {
  const reports = generateMultipleReports(10);
  const config = generateEventConfig();
  const scores = reports.map(r => extractScores(r));
  const pool = createScorePool(scores, config);
  const curve = computeCurve(pool);
  const grades = applyCurve(scores[0], curve);

  // Try to merge with different report
  mergeIntoCurvedReport(reports[1], grades);
}, "doesn't match");

// =============================================================================
// Full Pipeline Tests
// =============================================================================

console.log("\n========== Full Pipeline Tests ==========\n");

test("Full pipeline processes all reports", () => {
  const reports = generateMultipleReports(15);
  const config = generateEventConfig();

  const result = runFullPipeline(reports, config);

  if (result.curvedReports.length !== 15) {
    throw new Error(`Expected 15 curved reports, got ${result.curvedReports.length}`);
  }
  if (result.errors.length !== 0) {
    throw new Error(`Unexpected errors: ${result.errors.join(", ")}`);
  }
});

test("Full pipeline handles invalid reports gracefully", () => {
  const reports = generateMultipleReports(10);
  // Inject invalid reports
  const mixedReports = [
    reports[0],
    { invalid: true }, // Invalid
    reports[1],
    { report_id: "not-uuid" }, // Invalid
    reports[2],
  ];
  const config = generateEventConfig();

  const result = runFullPipeline(mixedReports, config);

  // Should process valid reports only
  if (result.curvedReports.length !== 3) {
    throw new Error(`Expected 3 curved reports, got ${result.curvedReports.length}`);
  }
  if (result.errors.length !== 2) {
    throw new Error(`Expected 2 errors, got ${result.errors.length}`);
  }
});

// =============================================================================
// Edge Case Tests
// =============================================================================

console.log("\n========== Edge Case Tests ==========\n");

test("Single report pipeline works", () => {
  const reports = generateMultipleReports(1);
  const config = generateEventConfig();

  const result = runFullPipeline(reports, config);

  if (result.curvedReports.length !== 1) {
    throw new Error("Should process single report");
  }
});

test("Report totals are preserved through extraction", () => {
  const report = generateReportJSON("test_user");

  const validated = validateReportJSON(report);
  const scores = extractScores(validated);

  // Verify totals are properly extracted
  if (scores.totals.total_problem_score !== report.totals.total_problem_score) {
    throw new Error("Total problem score mismatch");
  }
  if (scores.totals.total_ability_score !== report.totals.total_ability_score) {
    throw new Error("Total ability score mismatch");
  }
  if (scores.totals.final_total_score !== report.totals.final_total_score) {
    throw new Error("Final total score mismatch");
  }
});

test("Extreme score values (0 and 1)", () => {
  const report = generateReportJSON("test_user");
  report.problems[0].objective_score = 0;
  report.problems[1].objective_score = 1;
  report.abilities[0].score = 0;
  report.abilities[1].score = 1;

  const validated = validateReportJSON(report);
  const scores = extractScores(validated);

  // Should not throw
  JSONScoresSchema.parse(scores);
});

// =============================================================================
// Summary
// =============================================================================

console.log("\n========== Test Summary ==========\n");
console.log(`Total: ${testsPassed + testsFailed}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (testsFailed > 0) {
  process.exit(1);
}
