import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsDir = path.resolve(__dirname, "..");

test.describe("Schema Documentation Generator", () => {
  test.beforeAll(async () => {
    // Run the generator script before tests
    execSync("npx tsx generate-schema-docs.ts", {
      cwd: scriptsDir,
      stdio: "inherit",
    });
  });

  test("generates HTML file", async () => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    expect(fs.existsSync(htmlPath)).toBe(true);
  });

  test("HTML is valid and loads correctly", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Check page title
    await expect(page).toHaveTitle("Schema Visualization (Generated)");

    // Check main heading is visible
    await expect(page.locator("h1")).toContainText("Schema Visualization");
  });

  test("displays design principles from schemas.ts", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Check principles section exists
    const principlesSection = page.locator(".principles");
    await expect(principlesSection).toBeVisible();

    // Verify 4 key principles are displayed
    const principles = page.locator(".principle");
    await expect(principles).toHaveCount(4);

    // Check specific principle content
    await expect(principlesSection).toContainText("Only scores matter");
    await expect(principlesSection).toContainText("Pre-curve: NO letter_grades");
    await expect(principlesSection).toContainText("Post-curve: letter grades A/B/C/D");
    await expect(principlesSection).toContainText("ScorePool");
  });

  test("displays common types section", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Check common types section
    const commonSection = page.locator(".common-section").first();
    await expect(commonSection).toBeVisible();
    await expect(commonSection).toContainText("Common Types");

    // Verify common types are listed
    await expect(commonSection).toContainText("ProblemId");
    await expect(commonSection).toContainText("DimensionId");
    await expect(commonSection).toContainText("EventId");
    await expect(commonSection).toContainText("PromptVersionHash");
    await expect(commonSection).toContainText("LetterGrade");
    await expect(commonSection).toContainText("ScoreValue");
  });

  test("displays shared components section", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Check shared components section
    const sections = page.locator(".common-section");
    const sharedSection = sections.nth(1);
    await expect(sharedSection).toBeVisible();
    await expect(sharedSection).toContainText("Shared Components");

    // Verify shared schemas
    await expect(sharedSection).toContainText("TotalScores");
    await expect(sharedSection).toContainText("AbilityScore");
    await expect(sharedSection).toContainText("ProblemScore");
  });

  test("displays data flow pipeline", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Check flow section
    const flowSection = page.locator(".flow-section");
    await expect(flowSection).toBeVisible();

    // Verify pipeline stages
    const flowBoxes = page.locator(".flow-box");
    await expect(flowBoxes).toHaveCount(4);

    // Check pipeline order: JSONScores -> ScorePool -> Curve -> CurvedScores
    const boxes = await flowBoxes.allTextContents();
    expect(boxes).toEqual(["JSONScores", "ScorePool", "Curve", "CurvedScores"]);
  });

  test("displays main schema cards with fields", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Check schema cards exist
    const schemaCards = page.locator(".schema-card");
    await expect(schemaCards).toHaveCount(7); // 7 main schemas

    // Check JSONScores card has fields
    const jsonScoresCard = schemaCards.first();
    await expect(jsonScoresCard).toContainText("JSONScores");
    await expect(jsonScoresCard).toContainText("pre-curve");
    await expect(jsonScoresCard).toContainText("scores_id");
    await expect(jsonScoresCard).toContainText("event_id");
    await expect(jsonScoresCard).toContainText("totals");
    await expect(jsonScoresCard).toContainText("ability_scores");
    await expect(jsonScoresCard).toContainText("problem_scores");
  });

  test("displays CurvedScores with letter_grades field", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Find CurvedScores card
    const curvedScoresCard = page.locator(".schema-card").filter({ hasText: "CurvedScores" }).filter({ hasText: "post-curve" });
    await expect(curvedScoresCard).toBeVisible();

    // Verify it has letter_grades field
    await expect(curvedScoresCard).toContainText("letter_grades");
    await expect(curvedScoresCard).toContainText("A/B/C/D grades");

    // Verify sub-schemas are shown
    await expect(curvedScoresCard).toContainText("TotalGrades");
    await expect(curvedScoresCard).toContainText("AbilityGrade");
    await expect(curvedScoresCard).toContainText("ProblemGrade");
  });

  test("displays Curve schema with method variants", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Find Curve card
    const curveCard = page.locator(".schema-card").filter({ hasText: "📈" });
    await expect(curveCard).toBeVisible();

    // Verify curve method variants
    await expect(curveCard).toContainText("CurveMethod");
    await expect(curveCard).toContainText("percentile");
    await expect(curveCard).toContainText("standard_deviation");
    await expect(curveCard).toContainText("absolute");
  });

  test("displays CompatibilityResult with discriminated union", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    // Find CompatibilityResult card
    const compatCard = page.locator(".schema-card").filter({ hasText: "CompatibilityResult" });
    await expect(compatCard).toBeVisible();

    // Verify variants
    await expect(compatCard).toContainText("compatible");
    await expect(compatCard).toContainText("incompatible");
    await expect(compatCard).toContainText("requires_override");
  });

  test("all flow boxes have hover effect", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    await page.goto(`file://${htmlPath}`);

    const flowBox = page.locator(".flow-box").first();
    const transition = await flowBox.evaluate((el) => {
      return window.getComputedStyle(el).transition;
    });
    expect(transition).toContain("transform");
  });

  test("responsive layout works", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`file://${htmlPath}`);

    // All major sections should still be visible
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".principles")).toBeVisible();
    await expect(page.locator(".flow-section")).toBeVisible();
    await expect(page.locator(".common-section").first()).toBeVisible();
  });

  test("no console errors", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");

    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto(`file://${htmlPath}`);
    await page.waitForLoadState("networkidle");

    expect(errors).toEqual([]);
  });

  test("capture full page screenshot", async ({ page }) => {
    const htmlPath = path.join(scriptsDir, "schema-docs-generated.html");
    const screenshotPath = path.join(scriptsDir, "schema-docs-screenshot.png");

    // Set a wider viewport for better visualization
    await page.setViewportSize({ width: 1600, height: 1200 });
    await page.goto(`file://${htmlPath}`);
    await page.waitForLoadState("networkidle");

    // Verify key elements are visible
    await expect(page.locator("h1")).toContainText("Schema Visualization");
    await expect(page.locator(".principles")).toBeVisible();
    await expect(page.locator(".flow-section")).toBeVisible();
    await expect(page.locator(".common-section").first()).toBeVisible();
    await expect(page.locator(".schema-card").first()).toBeVisible();

    // Take full page screenshot
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    expect(fs.existsSync(screenshotPath)).toBe(true);
    console.log(`Screenshot saved to: ${screenshotPath}`);
  });
});
