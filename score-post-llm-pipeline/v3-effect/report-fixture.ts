/**
 * Fixture: a Report JSON matching the axiia-website Report type.
 *
 * Uses the same numeric values as fixtures.ts so derived totals
 * should match after transformation.
 *
 * Dimensions use the v3-effect 5-dimension set (future state).
 */

// ---------------------------------------------------------------------------
// Minimal Report types (mirrors axiia-website sdk-test-events/src/types.ts)
// ---------------------------------------------------------------------------

export type Grade = "A" | "B" | "C" | "D";

export interface Proof {
  comment: string;
  isStrength: boolean;
  observation: string;
}

export interface DimensionDetail {
  dimension: string;
  grade: Grade;
  proofs: Proof[];
  summary: string;
  score?: number;
}

export interface ProblemReport {
  bad: string[];
  dimensionDetails: DimensionDetail[];
  good: string[];
  grade: Grade;
  problemId: string;
  overview: string;
  score?: number;
}

export interface DimensionCard {
  dimension: string;
  grade: Grade;
  phrases: string;
}

export interface DimensionReport {
  dimension: string;
  grade: Grade;
  problems: Array<{ grade: Grade; problemId: string; phrases: string }>;
  summary: string;
  score?: number;
}

export interface ProblemCard {
  grade: Grade;
  problemId: string;
}

export interface OverallItem {
  title: string;
  description: string;
}

export interface Report {
  metadata: { lang: string };
  dimensionCards: DimensionCard[];
  dimensionReports: DimensionReport[];
  grade: Grade;
  overall: {
    bad: OverallItem[];
    good: OverallItem[];
    improvements: OverallItem[];
    overview: string;
  };
  problemCards: ProblemCard[];
  problemReports: ProblemReport[];
  taskEvalMean?: number;
  abilityMean?: number;
  overallMean?: number;
}

// ---------------------------------------------------------------------------
// Fixture data — same scores as fixtures.ts
//
// Problems:
//   000340-meeting-verify:  task=0.80, Discovery=0.85, Expression=0.78, Exploratory=0.72
//   000500-thinking-traps:  task=0.75, Discovery=0.90, Verification=0.65, Iterative=0.70
//   001001-ling-bing:       task=0.82, Discovery=0.88, Expression=0.82, Exploratory=0.79,
//                           Verification=0.71, Iterative=0.68
// ---------------------------------------------------------------------------

export const sampleReport: Report = {
  metadata: { lang: "zh" },

  grade: "B",
  taskEvalMean: 0.79,
  abilityMean: 0.7603333333333333,
  overallMean: 0.7750247307882073,

  problemCards: [
    { problemId: "000340-meeting-verify", grade: "B" },
    { problemId: "000500-thinking-traps", grade: "B" },
    { problemId: "001001-ling-bing", grade: "A" },
  ],

  problemReports: [
    {
      problemId: "000340-meeting-verify",
      grade: "B",
      score: 0.8,
      overview: "Student demonstrated solid understanding of meeting verification.",
      good: ["Clear structure", "Good attention to detail"],
      bad: ["Missed some nuance in tone"],
      dimensionDetails: [
        {
          dimension: "Discovery-Self-Understanding",
          grade: "A",
          score: 0.85,
          summary: "Strong self-directed inquiry.",
          proofs: [
            { observation: "Asked clarifying questions", comment: "Shows initiative", isStrength: true },
          ],
        },
        {
          dimension: "Expression-Translation",
          grade: "B",
          score: 0.78,
          summary: "Clear but could be more precise.",
          proofs: [
            { observation: "Translated intent accurately", comment: "Minor ambiguity", isStrength: true },
          ],
        },
        {
          dimension: "Exploratory-Discovery",
          grade: "B",
          score: 0.72,
          summary: "Some exploration but stayed close to given path.",
          proofs: [
            { observation: "Tried one alternative approach", comment: "Limited scope", isStrength: false },
          ],
        },
      ],
    },
    {
      problemId: "000500-thinking-traps",
      grade: "B",
      score: 0.75,
      overview: "Identified major cognitive biases but missed subtler ones.",
      good: ["Recognized confirmation bias"],
      bad: ["Missed anchoring effect"],
      dimensionDetails: [
        {
          dimension: "Discovery-Self-Understanding",
          grade: "A",
          score: 0.9,
          summary: "Excellent self-awareness of thinking patterns.",
          proofs: [
            { observation: "Reflected on own biases", comment: "Deep metacognition", isStrength: true },
          ],
        },
        {
          dimension: "Verification-Confirmation",
          grade: "C",
          score: 0.65,
          summary: "Verification attempts were surface-level.",
          proofs: [
            { observation: "Accepted first answer", comment: "Needs more checking", isStrength: false },
          ],
        },
        {
          dimension: "Iterative-Optimization",
          grade: "B",
          score: 0.7,
          summary: "Made some revisions based on feedback.",
          proofs: [
            { observation: "Revised prompt once", comment: "Could iterate more", isStrength: true },
          ],
        },
      ],
    },
    {
      problemId: "001001-ling-bing",
      grade: "A",
      score: 0.82,
      overview: "Strong translation performance across all dimensions.",
      good: ["Creative problem solving", "Good iterative refinement"],
      bad: ["Minor verification gaps"],
      dimensionDetails: [
        {
          dimension: "Discovery-Self-Understanding",
          grade: "A",
          score: 0.88,
          summary: "Clear understanding of the translation challenge.",
          proofs: [
            { observation: "Identified key difficulties early", comment: "Strategic approach", isStrength: true },
          ],
        },
        {
          dimension: "Expression-Translation",
          grade: "A",
          score: 0.82,
          summary: "Accurate and nuanced translations.",
          proofs: [
            { observation: "Preserved meaning across languages", comment: "Excellent", isStrength: true },
          ],
        },
        {
          dimension: "Exploratory-Discovery",
          grade: "B",
          score: 0.79,
          summary: "Explored multiple translation strategies.",
          proofs: [
            { observation: "Tried three approaches", comment: "Good breadth", isStrength: true },
          ],
        },
        {
          dimension: "Verification-Confirmation",
          grade: "B",
          score: 0.71,
          summary: "Checked translations against context.",
          proofs: [
            { observation: "Cross-referenced with examples", comment: "Adequate", isStrength: true },
          ],
        },
        {
          dimension: "Iterative-Optimization",
          grade: "B",
          score: 0.68,
          summary: "Refined translations through multiple rounds.",
          proofs: [
            { observation: "Three revision cycles", comment: "Diminishing returns", isStrength: true },
          ],
        },
      ],
    },
  ],

  dimensionCards: [
    { dimension: "Discovery-Self-Understanding", grade: "A", phrases: "Strong metacognition and self-directed learning" },
    { dimension: "Expression-Translation", grade: "B", phrases: "Clear communication with room for precision" },
    { dimension: "Exploratory-Discovery", grade: "B", phrases: "Moderate exploration of alternatives" },
    { dimension: "Verification-Confirmation", grade: "C", phrases: "Needs more systematic verification" },
    { dimension: "Iterative-Optimization", grade: "B", phrases: "Reasonable iteration on feedback" },
  ],

  dimensionReports: [
    {
      dimension: "Discovery-Self-Understanding",
      grade: "A",
      score: 0.8766666666666666,
      summary: "Consistently demonstrated strong self-understanding across all problems.",
      problems: [
        { problemId: "000340-meeting-verify", grade: "A", phrases: "Strong self-directed inquiry" },
        { problemId: "000500-thinking-traps", grade: "A", phrases: "Excellent metacognition" },
        { problemId: "001001-ling-bing", grade: "A", phrases: "Strategic self-awareness" },
      ],
    },
    {
      dimension: "Expression-Translation",
      grade: "B",
      score: 0.8,
      summary: "Generally clear expression with occasional ambiguity.",
      problems: [
        { problemId: "000340-meeting-verify", grade: "B", phrases: "Clear but imprecise" },
        { problemId: "001001-ling-bing", grade: "A", phrases: "Excellent translation" },
      ],
    },
    {
      dimension: "Exploratory-Discovery",
      grade: "B",
      score: 0.755,
      summary: "Explored alternatives but could push boundaries further.",
      problems: [
        { problemId: "000340-meeting-verify", grade: "B", phrases: "Limited exploration" },
        { problemId: "001001-ling-bing", grade: "B", phrases: "Good breadth" },
      ],
    },
    {
      dimension: "Verification-Confirmation",
      grade: "C",
      score: 0.68,
      summary: "Verification was the weakest area overall.",
      problems: [
        { problemId: "000500-thinking-traps", grade: "C", phrases: "Surface-level checks" },
        { problemId: "001001-ling-bing", grade: "B", phrases: "Adequate verification" },
      ],
    },
    {
      dimension: "Iterative-Optimization",
      grade: "B",
      score: 0.69,
      summary: "Made revisions but could iterate more systematically.",
      problems: [
        { problemId: "000500-thinking-traps", grade: "B", phrases: "Some revision" },
        { problemId: "001001-ling-bing", grade: "B", phrases: "Multiple rounds" },
      ],
    },
  ],

  overall: {
    overview: "A solid performance showing strength in self-understanding and expression, with room for improvement in verification and optimization.",
    good: [
      { title: "Self-awareness", description: "Consistently demonstrated strong metacognitive skills across all problems." },
      { title: "Communication", description: "Clear and effective translation of ideas into AI-readable instructions." },
    ],
    bad: [
      { title: "Verification depth", description: "Tended to accept initial results without thorough checking." },
    ],
    improvements: [
      { title: "Systematic checking", description: "Develop a verification checklist to apply after each AI interaction." },
      { title: "Deeper iteration", description: "Push beyond the first satisfactory result to find optimal solutions." },
    ],
  },
};
