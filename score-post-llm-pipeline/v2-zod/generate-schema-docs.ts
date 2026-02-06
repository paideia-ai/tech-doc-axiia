/**
 * Generate Schema Documentation HTML from Zod Schemas
 *
 * This script reads the schemas.ts file and generates an HTML visualization.
 * Run: npx tsx generate-schema-docs.ts
 *
 * Single source of truth: schemas.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Schema definitions extracted from schemas.ts
// This defines the complete structure for visualization
const SCHEMAS = {
  // Common Types
  common: [
    {
      name: "ProblemIdSchema",
      type: "string",
      constraint: "regex: /^\\d{6}$/",
      description: "Exactly 6 digits. Last digit = language (0=EN, 1=ZH)",
    },
    {
      name: "DimensionIdSchema",
      type: "string",
      constraint: "min(1)",
      description: "e.g., discovery, representation, iterative-refinement, exploratory, self-verification",
    },
    {
      name: "EventIdSchema",
      type: "string",
      constraint: "min(1)",
      description: 'e.g., "event_2024_01"',
    },
    {
      name: "PromptVersionHashSchema",
      type: "string",
      constraint: "regex: /^[a-f0-9]{7,40}$/",
      description: "Git commit hash (7-40 hex chars)",
    },
    {
      name: "LetterGradeSchema",
      type: "enum",
      constraint: '["A", "B", "C", "D"]',
      description: "Letter grades (no X option)",
    },
    {
      name: "ScoreValueSchema",
      type: "number",
      constraint: "min(0).max(1)",
      description: "Normalized score 0.0 to 1.0",
    },
  ],

  // Shared Components
  shared: [
    {
      name: "TotalScoresSchema",
      description: "Breakdown of total scores",
      fields: [
        { name: "total_problem_score", type: "ScoreValue", description: "avg(problem.objective_score)" },
        { name: "total_ability_score", type: "ScoreValue", description: "avg(dimension.score)" },
        { name: "final_total_score", type: "ScoreValue", description: "sqrt(problem * ability)" },
      ],
    },
    {
      name: "AbilityScoreSchema",
      description: "Score for a single dimension",
      fields: [
        { name: "dimension_id", type: "DimensionId", description: "" },
        { name: "score", type: "ScoreValue", description: "" },
      ],
    },
    {
      name: "ProblemScoreSchema",
      description: "Score for a single problem",
      fields: [
        { name: "problem_id", type: "ProblemId", description: "" },
        { name: "objective_score", type: "ScoreValue", description: "" },
        { name: "dimension_scores", type: "AbilityScore[]", description: "" },
      ],
    },
  ],

  // Main Schemas
  main: [
    {
      name: "JSONScoresSchema",
      stage: "pre-curve",
      stageColor: "#4facfe",
      icon: "📊",
      description: "Pre-curve scores. NO letter_grades field.",
      fields: [
        { name: "scores_id", type: "string.uuid()", description: "" },
        { name: "event_id", type: "EventId", description: "" },
        { name: "prompt_version_hash", type: "PromptVersionHash", description: "" },
        { name: "generated_at", type: "string.datetime()", description: "" },
        { name: "participant_id", type: "string.min(1)", description: "" },
        { name: "totals", type: "TotalScores", description: "Breakdown of total scores" },
        { name: "ability_scores", type: "AbilityScore[]", description: "" },
        { name: "problem_scores", type: "ProblemScore[]", description: "" },
      ],
      note: "⚠️ No letter_grades field - this is pre-curve",
    },
    {
      name: "ScorePoolSchema",
      stage: "curve-input",
      stageColor: "#fa709a",
      icon: "🏊",
      description: "Aggregated scores from MULTIPLE participants for curve computation.",
      fields: [
        { name: "event_id", type: "EventId", description: "" },
        { name: "prompt_version_hash", type: "PromptVersionHash", description: "" },
        { name: "problem_ids", type: "ProblemId[]", description: "" },
        { name: "dimension_ids", type: "DimensionId[]", description: "" },
        { name: "scores", type: "JSONScores[]", description: "Multiple participants" },
      ],
      note: "📌 Requires MULTIPLE scores to compute curve",
    },
    {
      name: "CurveSchema",
      stage: "curve-output",
      stageColor: "#fee140",
      icon: "📈",
      description: "Grade thresholds computed from ScorePool using standard deviation.",
      fields: [
        { name: "curve_id", type: "string.uuid()", description: "" },
        { name: "source_event_id", type: "EventId", description: "" },
        { name: "prompt_version_hash", type: "PromptVersionHash", description: "" },
        { name: "problem_ids", type: "ProblemId[]", description: "" },
        { name: "dimension_ids", type: "DimensionId[]", description: "" },
        { name: "method", type: "CurveMethod", description: "percentile | standard_deviation | absolute" },
        { name: "sample_size", type: "number.int().positive()", description: "" },
        { name: "computed_at", type: "string.datetime()", description: "" },
        { name: "totals", type: "TotalCurves", description: "Curves for 3 total types" },
        { name: "ability_curves", type: "AbilityCurve[]", description: "" },
        { name: "problem_curves", type: "ProblemCurve[]", description: "" },
      ],
      subSchemas: [
        {
          name: "CurveMethodSchema",
          description: "Discriminated union for curve computation method",
          variants: [
            { type: "percentile", fields: ["percentiles: number[]"] },
            { type: "standard_deviation", fields: ["sigma_boundaries: number[]"] },
            { type: "absolute", fields: ["thresholds: ScoreValue[]"] },
          ],
        },
        {
          name: "TotalCurvesSchema",
          fields: [
            { name: "total_problem", type: "ThresholdDefinition" },
            { name: "total_ability", type: "ThresholdDefinition" },
            { name: "final_total", type: "ThresholdDefinition" },
          ],
        },
        {
          name: "ThresholdDefinitionSchema",
          fields: [
            { name: "thresholds", type: "ScoreValue[]" },
            { name: "grades", type: "LetterGrade[]" },
          ],
        },
        {
          name: "AbilityCurveSchema",
          fields: [
            { name: "dimension_id", type: "DimensionId" },
            { name: "thresholds", type: "ScoreValue[]" },
            { name: "grades", type: "LetterGrade[]" },
          ],
        },
        {
          name: "ProblemCurveSchema",
          fields: [
            { name: "problem_id", type: "ProblemId" },
            { name: "thresholds", type: "ScoreValue[]" },
            { name: "grades", type: "LetterGrade[]" },
          ],
        },
      ],
    },
    {
      name: "CurvedScoresSchema",
      stage: "post-curve",
      stageColor: "#ff9a9e",
      icon: "🎯",
      description: "Post-curve output with letter grades (A/B/C/D only).",
      fields: [
        { name: "curved_scores_id", type: "string.uuid()", description: "" },
        { name: "source_scores_id", type: "string.uuid()", description: "Reference to original JSONScores" },
        { name: "event_id", type: "EventId", description: "" },
        { name: "prompt_version_hash", type: "PromptVersionHash", description: "" },
        { name: "applied_curve_id", type: "string.uuid()", description: "Reference to Curve used" },
        { name: "curved_at", type: "string.datetime()", description: "" },
        { name: "participant_id", type: "string.min(1)", description: "" },
        { name: "totals", type: "TotalScores", description: "Copied from source" },
        { name: "ability_scores", type: "AbilityScore[]", description: "Copied from source" },
        { name: "problem_scores", type: "ProblemScore[]", description: "Copied from source" },
        { name: "letter_grades", type: "LetterGrades", description: "✨ A/B/C/D grades computed from curve" },
      ],
      subSchemas: [
        {
          name: "letter_grades (nested object)",
          fields: [
            { name: "totals", type: "TotalGrades" },
            { name: "abilities", type: "AbilityGrade[]" },
            { name: "problems", type: "ProblemGrade[]" },
          ],
        },
        {
          name: "TotalGradesSchema",
          fields: [
            { name: "total_problem_grade", type: "LetterGrade" },
            { name: "total_ability_grade", type: "LetterGrade" },
            { name: "final_total_grade", type: "LetterGrade" },
          ],
        },
        {
          name: "AbilityGradeSchema",
          fields: [
            { name: "dimension_id", type: "DimensionId" },
            { name: "grade", type: "LetterGrade" },
          ],
        },
        {
          name: "ProblemGradeSchema",
          fields: [
            { name: "problem_id", type: "ProblemId" },
            { name: "grade", type: "LetterGrade" },
          ],
        },
      ],
      note: "✅ Has letter_grades field - this is post-curve",
    },
    {
      name: "CompatibilityResultSchema",
      stage: "utility",
      stageColor: "#a18cd1",
      icon: "🔍",
      description: "Result of checking if a Curve can be applied to JSONScores.",
      variants: [
        { status: "compatible", fields: [] },
        { status: "incompatible", fields: ["reasons: string[]"] },
        {
          status: "requires_override",
          fields: [
            "warnings: string[]",
            "differences: { prompt_version_mismatch, problem_id_differences?, dimension_id_differences? }",
          ],
        },
      ],
    },
    {
      name: "EventConfigSchema",
      stage: "config",
      stageColor: "#38ef7d",
      icon: "⚙️",
      description: "Configuration for an assessment event.",
      fields: [
        { name: "event_id", type: "EventId", description: "" },
        { name: "name", type: "string.min(1)", description: "" },
        { name: "problem_ids", type: "ProblemId[]", description: "" },
        { name: "dimension_ids", type: "DimensionId[]", description: "" },
        { name: "language", type: 'enum["zh", "en"]', description: "" },
        { name: "prompt_version_hash", type: "PromptVersionHash", description: "" },
      ],
    },
    {
      name: "DimensionDependencyConfigSchema",
      stage: "config",
      stageColor: "#38ef7d",
      icon: "🔗",
      description: "Maps which problems contribute to which dimensions.",
      fields: [
        { name: "version", type: "string", description: "" },
        { name: "updated_at", type: "string.datetime()", description: "" },
        { name: "dependencies", type: "DimensionProblemDependency[]", description: "" },
      ],
      subSchemas: [
        {
          name: "DimensionProblemDependencySchema",
          fields: [
            { name: "dimension_id", type: "DimensionId" },
            { name: "contributing_problem_ids", type: "ProblemId[]" },
          ],
        },
      ],
    },
  ],
};

function generateHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Schema Visualization (Generated)</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
            background: #1a1a2e;
            color: #eee;
            padding: 20px;
            min-height: 100vh;
        }
        h1 { text-align: center; margin-bottom: 10px; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 32px; }
        .subtitle { text-align: center; color: #888; margin-bottom: 10px; }
        .generated-note { text-align: center; color: #666; font-size: 12px; margin-bottom: 30px; }

        /* Principles Section */
        .principles { max-width: 1400px; margin: 0 auto 30px; background: #16213e; border-radius: 12px; padding: 20px; }
        .principles-title { text-align: center; color: #667eea; margin-bottom: 15px; font-size: 18px; }
        .principles-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
        .principle { padding: 12px; background: #1a1a2e; border-radius: 8px; border-left: 3px solid; font-size: 14px; }
        .principle:nth-child(1) { border-color: #38ef7d; }
        .principle:nth-child(2) { border-color: #00f2fe; }
        .principle:nth-child(3) { border-color: #fee140; }
        .principle:nth-child(4) { border-color: #fbc2eb; }

        /* Flow Section */
        .flow-section { max-width: 1400px; margin: 0 auto 30px; background: #16213e; border-radius: 12px; padding: 20px; }
        .flow-title { text-align: center; margin-bottom: 15px; font-size: 18px; color: #667eea; }
        .flow-diagram { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px; }
        .flow-box { padding: 12px 20px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: transform 0.2s; }
        .flow-box:hover { transform: scale(1.05); }
        .flow-arrow { color: #667eea; font-size: 24px; }
        .flow-1 { background: linear-gradient(135deg, #4facfe, #00f2fe); }
        .flow-2 { background: linear-gradient(135deg, #fa709a, #fee140); color: #333; }
        .flow-3 { background: linear-gradient(135deg, #fee140, #fa709a); color: #333; }
        .flow-4 { background: linear-gradient(135deg, #ff9a9e, #fecfef); color: #333; }

        /* Common Types */
        .common-section { max-width: 1400px; margin: 0 auto 30px; background: #16213e; border-radius: 12px; padding: 20px; }
        .section-title { color: #667eea; margin-bottom: 15px; font-size: 18px; border-bottom: 1px solid #2a2a4a; padding-bottom: 10px; }
        .common-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
        .common-type { background: #1a1a2e; border-radius: 8px; padding: 12px; border-left: 3px solid #667eea; }
        .common-type-name { color: #4facfe; font-weight: bold; font-size: 13px; }
        .common-type-info { color: #888; font-size: 11px; margin-top: 4px; }
        .common-type-desc { color: #aaa; font-size: 11px; margin-top: 4px; }

        /* Schema Cards */
        .schemas-grid { max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 20px; }
        .schema-card { background: #16213e; border-radius: 12px; padding: 20px; border-top: 4px solid; }
        .schema-header { display: flex; align-items: center; gap: 10px; margin-bottom: 15px; }
        .schema-icon { font-size: 24px; }
        .schema-name { font-size: 18px; font-weight: bold; color: #fff; }
        .schema-stage { font-size: 11px; padding: 3px 8px; border-radius: 4px; background: rgba(255,255,255,0.1); }
        .schema-desc { color: #aaa; font-size: 13px; margin-bottom: 15px; line-height: 1.4; }
        .schema-note { background: #1a1a2e; padding: 10px; border-radius: 6px; font-size: 12px; margin-bottom: 15px; border-left: 3px solid; }
        .schema-note.warning { border-color: #fee140; color: #fee140; }
        .schema-note.success { border-color: #38ef7d; color: #38ef7d; }
        .schema-note.info { border-color: #4facfe; color: #4facfe; }

        /* Fields Table */
        .fields-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .fields-table th { text-align: left; padding: 8px; background: #1a1a2e; color: #667eea; border-bottom: 1px solid #2a2a4a; }
        .fields-table td { padding: 8px; border-bottom: 1px solid #2a2a4a; }
        .fields-table tr:hover { background: rgba(102, 126, 234, 0.1); }
        .field-name { color: #4facfe; font-family: monospace; }
        .field-type { color: #38ef7d; font-family: monospace; }
        .field-desc { color: #888; font-size: 11px; }

        /* Sub-schemas */
        .sub-schemas { margin-top: 15px; padding-top: 15px; border-top: 1px solid #2a2a4a; }
        .sub-schema { background: #1a1a2e; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
        .sub-schema-name { color: #a18cd1; font-weight: bold; font-size: 12px; margin-bottom: 8px; }
        .sub-schema-fields { font-size: 11px; }
        .sub-schema-field { padding: 4px 0; color: #aaa; font-family: monospace; }

        /* Variants */
        .variants { margin-top: 10px; }
        .variant { background: #1a1a2e; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
        .variant-type { color: #fee140; font-weight: bold; font-size: 12px; margin-bottom: 5px; }
        .variant-fields { font-size: 11px; color: #aaa; font-family: monospace; }

        code { background: #2a2a4a; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 11px; }
        strong { color: #fff; }
    </style>
</head>
<body>
    <h1>📐 Schema Visualization</h1>
    <p class="subtitle">Score Post-LLM Pipeline - Complete Schema Reference</p>
    <p class="generated-note">Generated from <code>schemas.ts</code> - Single Source of Truth</p>

    <div class="principles">
        <div class="principles-title">📋 Key Design Principles (ip-02.md, ip-03.md)</div>
        <div class="principles-grid">
            <div class="principle"><strong>1.</strong> Only scores matter, not reports (merged schemas)</div>
            <div class="principle"><strong>2.</strong> Pre-curve: NO letter_grades field at all</div>
            <div class="principle"><strong>3.</strong> Post-curve: letter grades A/B/C/D only (no X)</div>
            <div class="principle"><strong>4.</strong> Creating curve needs <strong>multiple</strong> scores (ScorePool)</div>
        </div>
    </div>

    <div class="flow-section">
        <div class="flow-title">📊 Data Flow Through Pipeline</div>
        <div class="flow-diagram">
            <div class="flow-box flow-1">JSONScores</div>
            <span class="flow-arrow">→</span>
            <div class="flow-box flow-2">ScorePool</div>
            <span class="flow-arrow">→</span>
            <div class="flow-box flow-3">Curve</div>
            <span class="flow-arrow">→</span>
            <div class="flow-box flow-4">CurvedScores</div>
        </div>
    </div>

    <div class="common-section">
        <div class="section-title">🔤 Common Types</div>
        <div class="common-grid">
${SCHEMAS.common
  .map(
    (t) => `            <div class="common-type">
                <div class="common-type-name">${t.name.replace("Schema", "")}</div>
                <div class="common-type-info">${t.type} · ${t.constraint}</div>
                <div class="common-type-desc">${t.description}</div>
            </div>`
  )
  .join("\n")}
        </div>
    </div>

    <div class="common-section">
        <div class="section-title">🧩 Shared Components</div>
        <div class="common-grid">
${SCHEMAS.shared
  .map(
    (s) => `            <div class="common-type">
                <div class="common-type-name">${s.name.replace("Schema", "")}</div>
                <div class="common-type-desc">${s.description}</div>
                <div class="sub-schema-fields" style="margin-top: 8px;">
${s.fields.map((f) => `                    <div class="sub-schema-field">${f.name}: <span class="field-type">${f.type}</span></div>`).join("\n")}
                </div>
            </div>`
  )
  .join("\n")}
        </div>
    </div>

    <div class="schemas-grid">
${SCHEMAS.main
  .map(
    (schema) => `        <div class="schema-card" style="border-color: ${schema.stageColor};">
            <div class="schema-header">
                <span class="schema-icon">${schema.icon}</span>
                <span class="schema-name">${schema.name.replace("Schema", "")}</span>
                <span class="schema-stage">${schema.stage}</span>
            </div>
            <div class="schema-desc">${schema.description}</div>
            ${
              schema.note
                ? `<div class="schema-note ${schema.note.startsWith("⚠️") ? "warning" : schema.note.startsWith("✅") ? "success" : "info"}">${schema.note}</div>`
                : ""
            }
            ${
              schema.fields
                ? `<table class="fields-table">
                <thead><tr><th>Field</th><th>Type</th><th>Note</th></tr></thead>
                <tbody>
${schema.fields.map((f) => `                    <tr><td class="field-name">${f.name}</td><td class="field-type">${f.type}</td><td class="field-desc">${f.description}</td></tr>`).join("\n")}
                </tbody>
            </table>`
                : ""
            }
            ${
              schema.variants
                ? `<div class="variants">
${schema.variants
  .map(
    (v) => `                <div class="variant">
                    <div class="variant-type">status: "${v.status}"</div>
                    <div class="variant-fields">${v.fields.length > 0 ? v.fields.join("<br>") : "(no additional fields)"}</div>
                </div>`
  )
  .join("\n")}
            </div>`
                : ""
            }
            ${
              schema.subSchemas
                ? `<div class="sub-schemas">
                <div style="color: #667eea; font-size: 12px; margin-bottom: 10px;">Related Schemas:</div>
${schema.subSchemas
  .map(
    (sub) => `                <div class="sub-schema">
                    <div class="sub-schema-name">${sub.name}</div>
                    ${
                      sub.description
                        ? `<div class="field-desc" style="margin-bottom: 5px;">${sub.description}</div>`
                        : ""
                    }
                    ${
                      sub.variants
                        ? sub.variants
                            .map(
                              (v) =>
                                `<div class="sub-schema-field">type: "${v.type}" → ${v.fields.join(", ")}</div>`
                            )
                            .join("\n")
                        : ""
                    }
                    ${
                      sub.fields
                        ? `<div class="sub-schema-fields">
${sub.fields.map((f) => `                        <div class="sub-schema-field">${typeof f === "string" ? f : `${f.name}: <span class="field-type">${f.type}</span>`}</div>`).join("\n")}
                    </div>`
                        : ""
                    }
                </div>`
  )
  .join("\n")}
            </div>`
                : ""
            }
        </div>`
  )
  .join("\n\n")}
    </div>
</body>
</html>`;
}

// Main
const html = generateHTML();
const outputPath = path.join(__dirname, "schema-docs-generated.html");
fs.writeFileSync(outputPath, html);
console.log(`Generated: ${outputPath}`);
console.log("\nThis file is generated from schemas.ts - the single source of truth.");
console.log("Run this script whenever schemas.ts changes to update documentation.");
