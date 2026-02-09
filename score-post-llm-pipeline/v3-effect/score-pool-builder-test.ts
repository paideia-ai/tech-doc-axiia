/**
 * Score pool builder tests: happy path + rejection scenarios.
 *
 * Run: npx tsx v3-effect/score-pool-builder-test.ts
 */

import { Either } from "effect";
import {
  type EventConfig,
  type JSONScores,
  decodeEventConfig,
  decodeJSONScores,
} from "./schemas.js";
import { samplePromptSnapshotStored } from "./fixtures.js";
import { initPool, addEvent, addScore, formatPoolError } from "./score-pool-builder.js";

// =============================================================================
// Shared fixture data
// =============================================================================

const NOW = "2024-06-10T00:00:00.000Z";

const dimMapRaw = {
  map_id: "d4e5f6a7-b8c9-4d0e-af12-345678901234",
  label: "2024 Spring Assessment v2",
  created_at: NOW,
  entries: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Expression-Translation",
        "Exploratory-Discovery",
      ],
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Verification-Confirmation",
        "Iterative-Optimization",
      ],
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      dimensions: [
        "Discovery-Self-Understanding",
        "Expression-Translation",
        "Exploratory-Discovery",
        "Verification-Confirmation",
        "Iterative-Optimization",
      ],
    },
  ],
};

const problemIds = [
  { digit: "000340", name: "meeting-verify" },
  { digit: "000500", name: "thinking-traps" },
  { digit: "001001", name: "ling-bing" },
];

/** Build a JSONScores with the given id, event_id, and varied task_scores */
function makeScore(
  scoresId: string,
  eventId: string,
  taskScores: [number, number, number],
): JSONScores {
  return decodeJSONScores({
    scores_id: scoresId,
    event_id: eventId,
    prompt_snapshot: samplePromptSnapshotStored,
    dimension_map: dimMapRaw,
    generated_at: NOW,
    participant_id: `student-${scoresId.slice(0, 4)}`,
    problem_scores: [
      {
        problem_id: { digit: "000340", name: "meeting-verify" },
        task_score: taskScores[0],
        dimension_scores: {
          "Discovery-Self-Understanding": 0.85,
          "Expression-Translation": 0.78,
          "Exploratory-Discovery": 0.72,
          "Verification-Confirmation": null,
          "Iterative-Optimization": null,
        },
      },
      {
        problem_id: { digit: "000500", name: "thinking-traps" },
        task_score: taskScores[1],
        dimension_scores: {
          "Discovery-Self-Understanding": 0.9,
          "Expression-Translation": null,
          "Exploratory-Discovery": null,
          "Verification-Confirmation": 0.65,
          "Iterative-Optimization": 0.7,
        },
      },
      {
        problem_id: { digit: "001001", name: "ling-bing" },
        task_score: taskScores[2],
        dimension_scores: {
          "Discovery-Self-Understanding": 0.88,
          "Expression-Translation": 0.82,
          "Exploratory-Discovery": 0.79,
          "Verification-Confirmation": 0.71,
          "Iterative-Optimization": 0.68,
        },
      },
    ],
  });
}

function makeEvent(eventId: string): EventConfig {
  return decodeEventConfig({
    event_id: eventId,
    problem_ids: problemIds,
    prompt_snapshot: samplePromptSnapshotStored,
    dimension_map: dimMapRaw,
    event_date: NOW,
  });
}

// =============================================================================
// 1. Happy path: initPool → addEvent → addScore
// =============================================================================

console.log("=== 1. Happy path ===\n");

const eventA = makeEvent("event-A");
const scoresA = [
  makeScore("aaaaaaaa-0001-4000-8000-000000000001", "event-A", [0.80, 0.75, 0.82]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000002", "event-A", [0.70, 0.68, 0.74]),
  makeScore("aaaaaaaa-0001-4000-8000-000000000003", "event-A", [0.90, 0.85, 0.88]),
];

const pool0 = initPool("Spring 2024 Pool", eventA, scoresA);
console.log(`initPool: ${pool0.scores.length} scores, events: [${pool0.source_event_ids.join(", ")}]`);

// addEvent with compatible event B
const eventB = makeEvent("event-B");
const scoresB = [
  makeScore("bbbbbbbb-0001-4000-8000-000000000001", "event-B", [0.65, 0.72, 0.78]),
  makeScore("bbbbbbbb-0001-4000-8000-000000000002", "event-B", [0.85, 0.80, 0.91]),
];

const pool1Result = addEvent(pool0, eventB, scoresB);
if (Either.isLeft(pool1Result)) {
  console.log(`UNEXPECTED ERROR: ${formatPoolError(pool1Result.left)}`);
  process.exit(1);
}
const pool1 = pool1Result.right;
console.log(`addEvent(B): ${pool1.scores.length} scores, events: [${pool1.source_event_ids.join(", ")}]`);

// addScore with one more score from event B
const extraScoreB = makeScore("bbbbbbbb-0001-4000-8000-000000000003", "event-B", [0.77, 0.73, 0.80]);
const pool2Result = addScore(pool1, extraScoreB);
if (Either.isLeft(pool2Result)) {
  console.log(`UNEXPECTED ERROR: ${formatPoolError(pool2Result.left)}`);
  process.exit(1);
}
const pool2 = pool2Result.right;
console.log(`addScore(B extra): ${pool2.scores.length} scores, events: [${pool2.source_event_ids.join(", ")}]`);
console.log("  OK\n");

// =============================================================================
// 2. Rejection: prompt snapshot mismatch
// =============================================================================

console.log("=== 2. Rejection: prompt snapshot mismatch ===\n");

const differentSnapshot = {
  ...samplePromptSnapshotStored,
  set_hash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  entries: [
    ...samplePromptSnapshotStored.entries.slice(0, 5),
    // Changed: framework:zh:task-eval has a different sha256
    { key: "framework:zh:task-eval", sha256: "ffff000000000000000000000000000000000000000000000000000000000006" },
    ...samplePromptSnapshotStored.entries.slice(6),
  ],
};

const eventC = decodeEventConfig({
  event_id: "event-C",
  problem_ids: problemIds,
  prompt_snapshot: differentSnapshot,
  dimension_map: dimMapRaw,
  event_date: NOW,
});

const scoreCFromEventC = decodeJSONScores({
  scores_id: "cccccccc-0001-4000-8000-000000000001",
  event_id: "event-C",
  prompt_snapshot: differentSnapshot,
  dimension_map: dimMapRaw,
  generated_at: NOW,
  participant_id: "student-bad-prompt",
  problem_scores: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      task_score: 0.6,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.7,
        "Expression-Translation": 0.6,
        "Exploratory-Discovery": 0.5,
        "Verification-Confirmation": null,
        "Iterative-Optimization": null,
      },
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      task_score: 0.5,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.6,
        "Expression-Translation": null,
        "Exploratory-Discovery": null,
        "Verification-Confirmation": 0.5,
        "Iterative-Optimization": 0.4,
      },
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      task_score: 0.55,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.65,
        "Expression-Translation": 0.6,
        "Exploratory-Discovery": 0.55,
        "Verification-Confirmation": 0.5,
        "Iterative-Optimization": 0.45,
      },
    },
  ],
});

const promptMismatchResult = addEvent(pool0, eventC, [scoreCFromEventC]);
if (Either.isLeft(promptMismatchResult)) {
  console.log(`Correctly rejected: ${formatPoolError(promptMismatchResult.left)}`);
} else {
  console.log("ERROR: should have been rejected!");
  process.exit(1);
}
console.log("  OK\n");

// =============================================================================
// 3. Rejection: dimmap structural mismatch
// =============================================================================

console.log("=== 3. Rejection: dimmap structural mismatch ===\n");

// Score with a different dimension mapping for problem 000340
const differentDimMap = {
  ...dimMapRaw,
  map_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  entries: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      // Different dimensions! Added Verification-Confirmation, removed Expression-Translation
      dimensions: [
        "Discovery-Self-Understanding",
        "Verification-Confirmation",
        "Exploratory-Discovery",
      ],
    },
    dimMapRaw.entries[1],
    dimMapRaw.entries[2],
  ],
};

const scoreBadDimmap = decodeJSONScores({
  scores_id: "dddddddd-0001-4000-8000-000000000001",
  event_id: "event-A",
  prompt_snapshot: samplePromptSnapshotStored,
  dimension_map: differentDimMap,
  generated_at: NOW,
  participant_id: "student-bad-dimmap",
  problem_scores: [
    {
      problem_id: { digit: "000340", name: "meeting-verify" },
      task_score: 0.6,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.7,
        "Expression-Translation": null,
        "Exploratory-Discovery": 0.5,
        "Verification-Confirmation": 0.6,
        "Iterative-Optimization": null,
      },
    },
    {
      problem_id: { digit: "000500", name: "thinking-traps" },
      task_score: 0.5,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.6,
        "Expression-Translation": null,
        "Exploratory-Discovery": null,
        "Verification-Confirmation": 0.5,
        "Iterative-Optimization": 0.4,
      },
    },
    {
      problem_id: { digit: "001001", name: "ling-bing" },
      task_score: 0.55,
      dimension_scores: {
        "Discovery-Self-Understanding": 0.65,
        "Expression-Translation": 0.6,
        "Exploratory-Discovery": 0.55,
        "Verification-Confirmation": 0.5,
        "Iterative-Optimization": 0.45,
      },
    },
  ],
});

const dimmapMismatchResult = addScore(pool0, scoreBadDimmap);
if (Either.isLeft(dimmapMismatchResult)) {
  console.log(`Correctly rejected: ${formatPoolError(dimmapMismatchResult.left)}`);
} else {
  console.log("ERROR: should have been rejected!");
  process.exit(1);
}
console.log("  OK\n");

// =============================================================================
// 4. Rejection: duplicate score
// =============================================================================

console.log("=== 4. Rejection: duplicate score ===\n");

// Try adding a score that's already in the pool (same scores_id as scoresA[0])
const duplicateScore = makeScore("aaaaaaaa-0001-4000-8000-000000000001", "event-A", [0.60, 0.55, 0.50]);
const duplicateResult = addScore(pool0, duplicateScore);
if (Either.isLeft(duplicateResult)) {
  console.log(`Correctly rejected: ${formatPoolError(duplicateResult.left)}`);
} else {
  console.log("ERROR: should have been rejected!");
  process.exit(1);
}
console.log("  OK\n");

// =============================================================================
// Summary
// =============================================================================

console.log("All tests passed.");
