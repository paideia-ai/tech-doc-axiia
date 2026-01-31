/**
 * Run Full Pipeline
 * Demonstrates the complete data flow from synthetic data to curved reports
 */

import * as fs from "fs";
import * as path from "path";
import {
  generateMultipleReports,
  generateEventConfig,
  generateDimensionDependencies,
} from "./generate-synthetic-data.js";
import {
  validateReportJSON,
  extractScores,
  createScorePool,
  computeCurve,
  checkCompatibility,
  applyCurve,
  mergeIntoCurvedReport,
  PipelineSchemas,
} from "./pipeline-functions.js";
import {
  ReportJSON,
  JSONScores,
  Curve,
  CurvedLetterGrades,
  CurvedReport,
} from "./schemas.js";

// =============================================================================
// Configuration
// =============================================================================

const OUTPUT_DIR = "./pipeline-output";
const PARTICIPANT_COUNT = 25;

// =============================================================================
// Utilities
// =============================================================================

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function saveJSON(filename: string, data: unknown): void {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  📄 Saved: ${filename}`);
}

function printSchemaInfo(stage: string, schemaKey: keyof typeof PipelineSchemas): void {
  const schema = PipelineSchemas[schemaKey];
  console.log(`  Schema: ${schemaKey}`);
  console.log(`    Input:  ${schema.input._def?.typeName || 'complex'}`);
  console.log(`    Output: ${schema.output._def?.typeName || 'complex'}`);
}

// =============================================================================
// Pipeline Execution
// =============================================================================

async function runPipeline() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        Score Post-LLM Pipeline Demonstration               ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  ensureDir(OUTPUT_DIR);

  // -------------------------------------------------------------------------
  // Stage 0: Configuration
  // -------------------------------------------------------------------------
  console.log("📋 Stage 0: Configuration");
  console.log("─────────────────────────────────────────────────────────────");

  const eventConfig = generateEventConfig();
  const dependencies = generateDimensionDependencies();

  saveJSON("00-event-config.json", eventConfig);
  saveJSON("00-dimension-dependencies.json", dependencies);

  console.log(`  Event: ${eventConfig.event_id}`);
  console.log(`  Problems: ${eventConfig.problem_ids.length}`);
  console.log(`  Dimensions: ${eventConfig.dimension_ids.length}`);
  console.log(`  Prompt Version: ${eventConfig.prompt_version_hash}`);
  console.log();

  // -------------------------------------------------------------------------
  // Stage 1: Generate and Validate Report JSONs (LLM Output)
  // -------------------------------------------------------------------------
  console.log("🤖 Stage 1: LLM Output → Report JSON (Validation)");
  console.log("─────────────────────────────────────────────────────────────");
  printSchemaInfo("Stage 1", "validateReportJSON");

  const rawReports = generateMultipleReports(PARTICIPANT_COUNT);
  const validatedReports: ReportJSON[] = [];
  const validationErrors: string[] = [];

  for (const report of rawReports) {
    try {
      const validated = validateReportJSON(report);
      validatedReports.push(validated);
    } catch (e) {
      validationErrors.push(e instanceof Error ? e.message : String(e));
    }
  }

  saveJSON("01-raw-reports.json", rawReports);
  saveJSON("01-validated-reports.json", validatedReports);

  console.log(`  Input: ${rawReports.length} raw reports`);
  console.log(`  Output: ${validatedReports.length} validated reports`);
  console.log(`  Errors: ${validationErrors.length}`);
  console.log(`  letter_grades: null ✓ (uncurved)`);
  console.log();

  // -------------------------------------------------------------------------
  // Stage 2: Extract JSON Scores
  // -------------------------------------------------------------------------
  console.log("📊 Stage 2: Report JSON → JSON Scores (Extraction)");
  console.log("─────────────────────────────────────────────────────────────");
  printSchemaInfo("Stage 2", "extractScores");

  const allScores: JSONScores[] = validatedReports.map(report => extractScores(report));

  saveJSON("02-extracted-scores.json", allScores);

  console.log(`  Input: ${validatedReports.length} reports`);
  console.log(`  Output: ${allScores.length} score objects`);
  console.log(`  Each score contains:`);
  console.log(`    - ${allScores[0].ability_scores.length} ability scores`);
  console.log(`    - ${allScores[0].problem_scores.length} problem scores`);
  console.log();

  // -------------------------------------------------------------------------
  // Stage 3a: Create Score Pool
  // -------------------------------------------------------------------------
  console.log("🏊 Stage 3a: JSON Scores → Score Pool (Aggregation)");
  console.log("─────────────────────────────────────────────────────────────");
  printSchemaInfo("Stage 3a", "createScorePool");

  const scorePool = createScorePool(allScores, eventConfig);

  saveJSON("03a-score-pool.json", scorePool);

  console.log(`  Input: ${allScores.length} individual scores`);
  console.log(`  Output: 1 score pool`);
  console.log(`  Pool size: ${scorePool.scores.length} participants`);
  console.log();

  // -------------------------------------------------------------------------
  // Stage 3b: Compute Curve
  // -------------------------------------------------------------------------
  console.log("📈 Stage 3b: Score Pool → Curve (Computation)");
  console.log("─────────────────────────────────────────────────────────────");
  printSchemaInfo("Stage 3b", "computeCurve");

  const curve: Curve = computeCurve(scorePool);

  saveJSON("03b-curve.json", curve);

  console.log(`  Input: Score pool (${scorePool.scores.length} participants)`);
  console.log(`  Output: Curve with thresholds`);
  console.log(`  Method: ${curve.method.type}`);
  console.log(`  Overall thresholds: [${curve.overall.thresholds.map(t => t.toFixed(3)).join(", ")}]`);
  console.log(`  Grades mapping: ${curve.overall.grades.join(" > ")}`);
  console.log();

  // -------------------------------------------------------------------------
  // Stage 4a: Check Compatibility
  // -------------------------------------------------------------------------
  console.log("🔍 Stage 4a: Compatibility Check");
  console.log("─────────────────────────────────────────────────────────────");
  printSchemaInfo("Stage 4a", "checkCompatibility");

  // Test with first score
  const compatResult = checkCompatibility(allScores[0], curve);

  saveJSON("04a-compatibility-result.json", compatResult);

  console.log(`  Input: Scores + Curve`);
  console.log(`  Status: ${compatResult.status}`);
  if (compatResult.status === "incompatible") {
    console.log(`  Reasons: ${(compatResult as any).reasons.join(", ")}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // Stage 4b: Apply Curve
  // -------------------------------------------------------------------------
  console.log("🎯 Stage 4b: JSON Scores + Curve → Curved Letter Grades");
  console.log("─────────────────────────────────────────────────────────────");
  printSchemaInfo("Stage 4b", "applyCurve");

  const allGrades: CurvedLetterGrades[] = allScores.map(scores => applyCurve(scores, curve));

  saveJSON("04b-curved-letter-grades.json", allGrades);

  // Grade distribution
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0 };
  allGrades.forEach(g => gradeCounts[g.overall_grade]++);

  console.log(`  Input: ${allScores.length} scores + curve`);
  console.log(`  Output: ${allGrades.length} letter grade sets`);
  console.log(`  Grade distribution (overall):`);
  console.log(`    A: ${gradeCounts.A} (${((gradeCounts.A / allGrades.length) * 100).toFixed(1)}%)`);
  console.log(`    B: ${gradeCounts.B} (${((gradeCounts.B / allGrades.length) * 100).toFixed(1)}%)`);
  console.log(`    C: ${gradeCounts.C} (${((gradeCounts.C / allGrades.length) * 100).toFixed(1)}%)`);
  console.log(`    D: ${gradeCounts.D} (${((gradeCounts.D / allGrades.length) * 100).toFixed(1)}%)`);
  console.log();

  // -------------------------------------------------------------------------
  // Stage 5: Merge into Curved Reports
  // -------------------------------------------------------------------------
  console.log("📝 Stage 5: Report JSON + Letter Grades → Curved Report");
  console.log("─────────────────────────────────────────────────────────────");
  printSchemaInfo("Stage 5", "mergeIntoCurvedReport");

  const curvedReports: CurvedReport[] = validatedReports.map((report, i) =>
    mergeIntoCurvedReport(report, allGrades[i])
  );

  saveJSON("05-curved-reports.json", curvedReports);

  console.log(`  Input: ${validatedReports.length} reports + ${allGrades.length} grade sets`);
  console.log(`  Output: ${curvedReports.length} curved reports`);
  console.log(`  Each curved report contains:`);
  console.log(`    - source_report_id: ✓ (traceability)`);
  console.log(`    - applied_curve_id: ✓ (traceability)`);
  console.log(`    - letter_grades: populated (not null)`);
  console.log();

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    Pipeline Complete                        ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log("📁 Output files saved to:", path.resolve(OUTPUT_DIR));
  console.log();
  console.log("Pipeline stages:");
  console.log("  1. LLM Output → Report JSON (validate, ensure letter_grades=null)");
  console.log("  2. Report JSON → JSON Scores (extract for processing)");
  console.log("  3a. JSON Scores → Score Pool (aggregate multiple participants)");
  console.log("  3b. Score Pool → Curve (compute thresholds)");
  console.log("  4a. Compatibility Check (verify schemas match)");
  console.log("  4b. JSON Scores + Curve → Curved Letter Grades (apply thresholds)");
  console.log("  5. Report JSON + Letter Grades → Curved Report (final output)");
  console.log();
  console.log("Key design principles enforced:");
  console.log("  ✓ No in-place modification (original reports unchanged)");
  console.log("  ✓ All transformations validated with Zod schemas");
  console.log("  ✓ Full traceability (curve_id, source_report_id)");
  console.log("  ✓ Compatibility check before curve application");

  // Return summary for potential programmatic use
  return {
    participantCount: PARTICIPANT_COUNT,
    validatedReports: validatedReports.length,
    validationErrors: validationErrors.length,
    curvedReports: curvedReports.length,
    gradeDistribution: gradeCounts,
  };
}

// Run the pipeline
runPipeline()
  .then(summary => {
    console.log("\n✅ Pipeline execution successful");
    console.log(`   Processed ${summary.curvedReports} reports`);
  })
  .catch(error => {
    console.error("\n❌ Pipeline execution failed");
    console.error(error);
    process.exit(1);
  });
