/**
 * Output sample data as JSON for visualization tools like JSON Crack
 * Run with: npx tsx scripts/visualize-schemas.ts
 */

import { v1, master } from "./sample-data";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = path.join(__dirname, "schema-json-output");
fs.mkdirSync(outputDir, { recursive: true });

// V1 Schema samples
fs.writeFileSync(
  path.join(outputDir, "v1-llm-report.json"),
  JSON.stringify(v1.llmReport, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, "v1-curve.json"),
  JSON.stringify(v1.curve, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, "v1-curved-report.json"),
  JSON.stringify(v1.curvedReport, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, "v1-json-scores.json"),
  JSON.stringify(v1.jsonScores, null, 2)
);

// Master Schema samples
fs.writeFileSync(
  path.join(outputDir, "master-json-scores.json"),
  JSON.stringify(master.jsonScores, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, "master-curve.json"),
  JSON.stringify(master.curve, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, "master-curved-scores.json"),
  JSON.stringify(master.curvedScores, null, 2)
);
fs.writeFileSync(
  path.join(outputDir, "master-score-pool.json"),
  JSON.stringify(master.scorePool, null, 2)
);

// Combined comparison
fs.writeFileSync(
  path.join(outputDir, "comparison-both-schemas.json"),
  JSON.stringify({
    v1_schema: {
      llmReport: v1.llmReport,
      jsonScores: v1.jsonScores,
      curve: v1.curve,
      curvedReport: v1.curvedReport,
    },
    master_schema: {
      jsonScores: master.jsonScores,
      curve: master.curve,
      curvedScores: master.curvedScores,
      scorePool: master.scorePool,
    },
  }, null, 2)
);

console.log(`\nJSON files written to: ${outputDir}/`);
console.log("\nFiles created:");
fs.readdirSync(outputDir).forEach(file => {
  console.log(`  - ${file}`);
});

console.log("\n" + "=".repeat(80));
console.log("Copy the JSON below to paste into https://jsoncrack.com/editor");
console.log("=".repeat(80));

console.log("\n--- V1 LLM Report ---");
console.log(JSON.stringify(v1.llmReport, null, 2));

console.log("\n--- Master JSONScores ---");
console.log(JSON.stringify(master.jsonScores, null, 2));
