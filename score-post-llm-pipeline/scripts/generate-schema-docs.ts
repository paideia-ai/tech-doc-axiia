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

// Schema metadata - describes each schema for documentation
const SCHEMA_METADATA = {
  // Common Types
  ProblemIdSchema: {
    name: "ProblemId",
    icon: "🔤",
    stage: "common",
    description: "Exactly 6 digits. Last digit = language (0=EN, 1=ZH)",
    type: "string",
  },
  DimensionIdSchema: {
    name: "DimensionId",
    icon: "🔤",
    stage: "common",
    description: "discovery, representation, iterative-refinement, exploratory, self-verification",
    type: "string",
  },
  EventIdSchema: {
    name: "EventId",
    icon: "🔤",
    stage: "common",
    description: 'e.g., "event_2024_01"',
    type: "string",
  },
  PromptVersionHashSchema: {
    name: "PromptVersionHash",
    icon: "🔤",
    stage: "common",
    description: "Git commit hash (7-40 hex chars)",
    type: "string",
  },
  LetterGradeSchema: {
    name: "LetterGrade",
    icon: "🔤",
    stage: "common",
    description: '"A" | "B" | "C" | "D" | "X" (X = uncurved)',
    type: "enum",
  },
  ScoreValueSchema: {
    name: "ScoreValue",
    icon: "🔤",
    stage: "common",
    description: "0.0 to 1.0 (normalized score)",
    type: "number",
  },

  // Main Schemas
  ReportJSONSchema: {
    name: "ReportJSON",
    icon: "📄",
    stage: "stage-1",
    stageLabel: "Stage 1 Output",
    description: "LLM-generated report. <strong>letter_grades MUST be null</strong> (uncurved state)",
  },
  JSONScoresSchema: {
    name: "JSONScores",
    icon: "📊",
    stage: "stage-2",
    stageLabel: "Stage 2 Output",
    description: "Extracted scores from ReportJSON. Flat structure for processing. <strong>Core non-curved schema.</strong>",
  },
  ScorePoolSchema: {
    name: "ScorePool",
    icon: "🏊",
    stage: "stage-3",
    stageLabel: "Stage 3a Output",
    description: "Aggregated scores from <strong>multiple</strong> participants. Input for curve computation.",
  },
  CurveSchema: {
    name: "Curve",
    icon: "📈",
    stage: "stage-3",
    stageLabel: "Stage 3b Output",
    description: "Grade thresholds computed from score pool using standard deviation method.",
  },
  CurvedLetterGradesSchema: {
    name: "CurvedLetterGrades",
    icon: "🎯",
    stage: "stage-4",
    stageLabel: "Stage 4 Output",
    description: "Result of applying curve to <strong>one</strong> score. Intermediate before merge.",
  },
  CurvedReportSchema: {
    name: "CurvedReport",
    icon: "📝",
    stage: "stage-5",
    stageLabel: "Stage 5 Output (Final)",
    description: "Final report with letter grades. <strong>Core curved schema.</strong>",
  },
  CompatibilityResultSchema: {
    name: "CompatibilityResult",
    icon: "🔍",
    stage: "stage-4",
    stageLabel: "Stage 4a Check",
    description: "Result of checking if a Curve can be applied to JSONScores.",
  },
  EventConfigSchema: {
    name: "EventConfig",
    icon: "⚙️",
    stage: "config",
    stageLabel: "Configuration",
    description: "Configuration for an assessment event.",
  },
  DimensionDependencyConfigSchema: {
    name: "DimensionDependencyConfig",
    icon: "🔗",
    stage: "config",
    stageLabel: "Configuration",
    description: "Maps which problems contribute to which dimensions.",
  },
};

// Read the schemas.ts file to extract actual schema structure
function extractSchemaInfo(): string {
  const schemasPath = path.join(__dirname, "schemas.ts");
  const content = fs.readFileSync(schemasPath, "utf-8");

  // Extract the header comment (design principles)
  const headerMatch = content.match(/\/\*\*[\s\S]*?\*\//);
  const header = headerMatch ? headerMatch[0] : "";

  return content;
}

// Generate the HTML
function generateHTML(): string {
  const schemaContent = extractSchemaInfo();

  // Extract key info from schema file
  const hasTotals = schemaContent.includes("TotalScoresSchema");
  const hasThreeGrades = schemaContent.includes("TotalGradesSchema");
  const problemIdRegex = schemaContent.match(/regex\(\/\^\\d\{(\d+)\}\$\//);
  const problemIdDigits = problemIdRegex ? problemIdRegex[1] : "6";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Schema Visualization (Generated)</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #eee;
            padding: 20px;
            min-height: 100vh;
        }
        h1 { text-align: center; margin-bottom: 10px; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 32px; }
        .subtitle { text-align: center; color: #888; margin-bottom: 10px; }
        .generated-note { text-align: center; color: #666; font-size: 12px; margin-bottom: 30px; }
        .principles { max-width: 1200px; margin: 0 auto 30px; background: #16213e; border-radius: 12px; padding: 20px; }
        .principles-title { text-align: center; color: #667eea; margin-bottom: 15px; font-size: 18px; }
        .principles-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; }
        .principle { padding: 12px; background: #1a1a2e; border-radius: 8px; border-left: 3px solid; font-size: 14px; }
        .principle:nth-child(1) { border-color: #38ef7d; }
        .principle:nth-child(2) { border-color: #00f2fe; }
        .principle:nth-child(3) { border-color: #fee140; }
        .principle:nth-child(4) { border-color: #fbc2eb; }
        .core-schemas { display: flex; justify-content: center; gap: 30px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #2a2a4a; }
        .core-schema { text-align: center; }
        .core-schema-box { padding: 10px 20px; border-radius: 8px; font-weight: bold; }
        .core-schema-label { color: #888; font-size: 12px; margin-top: 5px; }
        .flow-section { max-width: 1200px; margin: 0 auto 30px; background: #16213e; border-radius: 12px; padding: 20px; }
        .flow-title { text-align: center; margin-bottom: 15px; font-size: 18px; color: #667eea; }
        .flow-diagram { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px; }
        .flow-box { padding: 12px 20px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: transform 0.2s; }
        .flow-box:hover { transform: scale(1.05); }
        .flow-arrow { color: #667eea; font-size: 24px; }
        .flow-1 { background: linear-gradient(135deg, #11998e, #38ef7d); }
        .flow-2 { background: linear-gradient(135deg, #4facfe, #00f2fe); }
        .flow-3 { background: linear-gradient(135deg, #fa709a, #fee140); color: #333; }
        .flow-4 { background: linear-gradient(135deg, #a18cd1, #fbc2eb); color: #333; }
        .flow-5 { background: linear-gradient(135deg, #ff9a9e, #fecfef); color: #333; }
        .info-box { max-width: 800px; margin: 0 auto 30px; background: #16213e; border-radius: 12px; padding: 20px; }
        .info-title { color: #667eea; margin-bottom: 10px; }
        .info-content { color: #aaa; font-size: 14px; line-height: 1.6; }
        code { background: #2a2a4a; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
        strong { color: #fff; }
    </style>
</head>
<body>
    <h1>📐 Schema Visualization</h1>
    <p class="subtitle">Score Post-LLM Pipeline Data Structures</p>
    <p class="generated-note">Generated from <code>schemas.ts</code> - Single Source of Truth</p>

    <div class="principles">
        <div class="principles-title">📋 Key Design Principles (ip-02.md)</div>
        <div class="principles-grid">
            <div class="principle"><strong>1.</strong> Uncurved reports have <code>letter_grades = null</code></div>
            <div class="principle"><strong>2.</strong> Creating a curve requires <strong>multiple</strong> scores (ScorePool)</div>
            <div class="principle"><strong>3.</strong> Applying a curve requires only <strong>one</strong> score</div>
            <div class="principle"><strong>4.</strong> Pipeline starts from extracted scores, not full reports</div>
        </div>
        <div class="core-schemas">
            <div class="core-schema">
                <div class="core-schema-box" style="background: linear-gradient(135deg, #4facfe, #00f2fe);">JSONScores</div>
                <div class="core-schema-label">Non-curved (no letter grades)</div>
            </div>
            <div style="font-size: 24px; color: #667eea; align-self: center;">vs</div>
            <div class="core-schema">
                <div class="core-schema-box" style="background: linear-gradient(135deg, #ff9a9e, #fecfef); color: #333;">CurvedReport</div>
                <div class="core-schema-label">With letter grades</div>
            </div>
        </div>
    </div>

    <div class="flow-section">
        <div class="flow-title">📊 Data Flow Through Pipeline</div>
        <div class="flow-diagram">
            <div class="flow-box flow-1">ReportJSON</div>
            <span class="flow-arrow">→</span>
            <div class="flow-box flow-2">JSONScores</div>
            <span class="flow-arrow">→</span>
            <div class="flow-box flow-3">ScorePool</div>
            <span class="flow-arrow">→</span>
            <div class="flow-box flow-3">Curve</div>
            <span class="flow-arrow">→</span>
            <div class="flow-box flow-4">CurvedLetterGrades</div>
            <span class="flow-arrow">→</span>
            <div class="flow-box flow-5">CurvedReport</div>
        </div>
    </div>

    <div class="info-box">
        <div class="info-title">📋 Schema Summary (from schemas.ts)</div>
        <div class="info-content">
            <p><strong>Problem ID:</strong> Exactly ${problemIdDigits} digits (last digit = language: 0=EN, 1=ZH)</p>
            <p><strong>Total Scores:</strong> ${hasTotals ? "✅ Three totals (total_problem, total_ability, final_total)" : "❌ Missing"}</p>
            <p><strong>Total Grades:</strong> ${hasThreeGrades ? "✅ Three grades for each total" : "❌ Missing"}</p>
            <p><strong>Dimensions:</strong> discovery, representation, iterative-refinement, exploratory, self-verification</p>
            <p><strong>Curve Method:</strong> Standard deviation (A ≥ μ+σ, B ≥ μ, C ≥ μ-σ, D &lt; μ-σ)</p>
        </div>
    </div>

    <div class="info-box">
        <div class="info-title">🔗 View Full Schema</div>
        <div class="info-content">
            <p>For detailed field-level documentation, see: <code>scripts/schemas.ts</code></p>
            <p>For the full interactive visualization: <code>scripts/schema-visualization.html</code></p>
        </div>
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
