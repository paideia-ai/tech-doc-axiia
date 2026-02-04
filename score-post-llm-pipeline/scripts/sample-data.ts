/**
 * Sample Data for Schema Validation Testing
 *
 * This file contains sample data conforming to both:
 * - schema-v1/schema-verify-v1.ts (Anna's v1 schema)
 * - scripts/schemas.ts (master schema)
 */

// =============================================================================
// PART 1: schema-v1/schema-verify-v1.ts Sample Data
// =============================================================================

export const v1 = {
  // --- Common Types ---

  problemId: "001230-quadratic-equations",

  eventId: "event-2024-spring-cohort-a",

  curvedGrade: "B" as const,

  uncurvedGrade: "X" as const,

  promptVersionHash: "7a8b9c0d1e2f3a4b",

  sha256Hex: "3a7bd3e2360a7d9e5f8c1b4a6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e",

  lang: "zh" as const,

  promptKey: "framework:zh:task-eval",

  promptSnapshotEntry: {
    key: "framework:zh:task-eval",
    sha256: "3a7bd3e2360a7d9e5f8c1b4a6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e",
  },

  promptSnapshotEntries: [
    {
      key: "framework:en:ability-summary",
      sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
    },
    {
      key: "framework:zh:task-eval",
      sha256: "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
    },
    {
      key: "problems:001230-quadratic-equations:scoring",
      sha256: "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
    },
  ],

  scoreValue: 0.75,

  dimension: "representation" as const,

  dimensionProblemDependency: {
    problemId: "001230-quadratic-equations",
    problemVersion: 1,
    dimensions: ["representation", "self-verification"] as const,
  },

  dimensionProblemDependencyList: [
    {
      problemId: "001230-quadratic-equations",
      problemVersion: 1,
      dimensions: ["representation", "self-verification"] as const,
    },
    {
      problemId: "001241-data-analysis",
      problemVersion: 2,
      dimensions: ["iterative-refinement", "discovery"] as const,
    },
  ],

  // --- 1. LLM Report JSON (原始报告) ---

  metadata: {
    lang: "zh" as const,
    reportId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    eventId: "event-2024-spring-cohort-a",
    participantId: "participant-001",
    promptSetHash: "3a7bd3e2360a7d9e5f8c1b4a6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e",
    entries: [
      {
        key: "framework:zh:task-eval",
        sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
      },
      {
        key: "problems:001230-quadratic-equations:scoring",
        sha256: "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
      },
    ],
    dimensionProblemDependency: [
      {
        problemId: "001230-quadratic-equations",
        problemVersion: 1,
        dimensions: ["representation", "self-verification"] as const,
      },
    ],
    createdAt: "2024-03-15T10:30:00Z",
  },

  dimensionCard: {
    dimension: "representation" as const,
    phrases: "能够清晰地表达问题",
    grade: "X" as const,
  },

  problem: {
    problemId: "001230-quadratic-equations",
    phrases: "解决一元二次方程",
    grade: "X" as const,
  },

  dimensionReport: {
    dimension: "representation" as const,
    problems: [
      {
        problemId: "001230-quadratic-equations",
        phrases: "解决一元二次方程",
        grade: "X" as const,
      },
    ],
    summary: "学生在表达能力方面表现良好",
    score: 0.78,
    grade: "X" as const,
  },

  overallItem: {
    title: "清晰表达",
    description: "能够用数学语言准确描述问题",
  },

  overall: {
    bad: [
      { title: "计算粗心", description: "在运算过程中有小错误" },
    ],
    good: [
      { title: "清晰表达", description: "能够用数学语言准确描述问题" },
    ],
    improvements: [
      { title: "验证答案", description: "建议在完成后验证答案的正确性" },
    ],
    overview: "总体表现良好，有进步空间",
  },

  problemCard: {
    problemId: "001230-quadratic-equations",
    grade: "X" as const,
  },

  proof: {
    comment: "学生展示了清晰的解题思路",
    isStrength: true,
    observation: "正确使用了求根公式",
  },

  dimensionDetail: {
    dimension: "representation" as const,
    proofs: [
      {
        comment: "学生展示了清晰的解题思路",
        isStrength: true,
        observation: "正确使用了求根公式",
      },
    ],
    summary: "在问题表达方面表现优秀",
    score: 0.82,
    grade: "X" as const,
  },

  problemReport: {
    bad: ["计算过程有小错误"],
    dimensionDetails: [
      {
        dimension: "representation" as const,
        proofs: [
          {
            comment: "清晰表达问题",
            isStrength: true,
            observation: "使用正确的数学符号",
          },
        ],
        summary: "表达能力良好",
        score: 0.82,
        grade: "X" as const,
      },
      {
        dimension: "self-verification" as const,
        proofs: [
          {
            comment: "验证了答案",
            isStrength: true,
            observation: "代入原方程检验",
          },
        ],
        summary: "验证能力中等",
        score: 0.65,
        grade: "X" as const,
      },
    ],
    good: ["解题思路清晰", "使用正确的公式"],
    problemId: "001230-quadratic-equations",
    overview: "该题目完成度较高",
    score: 0.75,
    grade: "X" as const,
  },

  llmReport: {
    metadata: {
      lang: "zh" as const,
      reportId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      eventId: "event-2024-spring-cohort-a",
      participantId: "participant-001",
      promptSetHash: "3a7bd3e2360a7d9e5f8c1b4a6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e",
      entries: [
        {
          key: "framework:zh:task-eval",
          sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        },
      ],
      dimensionProblemDependency: [
        {
          problemId: "001230-quadratic-equations",
          problemVersion: 1,
          dimensions: ["representation", "self-verification"] as const,
        },
      ],
      createdAt: "2024-03-15T10:30:00Z",
    },
    dimensionCards: [
      { dimension: "representation" as const, phrases: "表达能力", grade: "X" as const },
      { dimension: "self-verification" as const, phrases: "验证能力", grade: "X" as const },
      { dimension: "iterative-refinement" as const, phrases: "迭代优化", grade: "X" as const },
      { dimension: "discovery" as const, phrases: "发现能力", grade: "X" as const },
      { dimension: "exploratory" as const, phrases: "探索能力", grade: "X" as const },
    ],
    dimensionReports: [
      {
        dimension: "representation" as const,
        problems: [
          { problemId: "001230-quadratic-equations", phrases: "二次方程", grade: "X" as const },
        ],
        summary: "表达能力总结",
        score: 0.78,
        grade: "X" as const,
      },
    ],
    overall: {
      bad: [{ title: "粗心", description: "计算有误" }],
      good: [{ title: "清晰", description: "表达清晰" }],
      improvements: [{ title: "验证", description: "加强验证" }],
      overview: "总体良好",
    },
    problemCards: [
      { problemId: "001230-quadratic-equations", grade: "X" as const },
    ],
    problemReports: [
      {
        bad: ["小错误"],
        dimensionDetails: [
          {
            dimension: "representation" as const,
            proofs: [{ comment: "好", isStrength: true, observation: "清晰" }],
            summary: "表达良好",
            score: 0.82,
            grade: "X" as const,
          },
        ],
        good: ["思路清晰"],
        problemId: "001230-quadratic-equations",
        overview: "完成度高",
        score: 0.75,
        grade: "X" as const,
      },
    ],
    taskEvalMean: 0.75,
    abilityMean: 0.72,
    overallMean: 0.73,
    grade: "X" as const,
  },

  // --- 2. JSON Scores (提取的分数) ---

  abilityScore: {
    dimensionId: "representation" as const,
    score: 0.78,
  },

  dimensionDetailScore: {
    dimensionId: "representation" as const,
    score: 0.82,
  },

  problemScore: {
    problemId: "001230-quadratic-equations",
    score: 0.75,
    dimensionDetailScores: [
      { dimensionId: "representation" as const, score: 0.82 },
      { dimensionId: "self-verification" as const, score: 0.65 },
    ],
  },

  jsonScores: {
    abilityScores: [
      { dimensionId: "representation" as const, score: 0.78 },
      { dimensionId: "self-verification" as const, score: 0.72 },
      { dimensionId: "iterative-refinement" as const, score: 0.68 },
      { dimensionId: "discovery" as const, score: 0.75 },
      { dimensionId: "exploratory" as const, score: 0.70 },
    ],
    problemScores: [
      {
        problemId: "001230-quadratic-equations",
        score: 0.75,
        dimensionDetailScores: [
          { dimensionId: "representation" as const, score: 0.82 },
          { dimensionId: "self-verification" as const, score: 0.65 },
        ],
      },
    ],
    overallMean: 0.73,
  },

  // --- 3. Curve ---

  curveMethod: "standard_deviation" as const,

  gradeThresholds: {
    A: 0.85,
    B: 0.70,
    C: 0.55,
  },

  curve: {
    curveId: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    label: "2024 Spring Cohort Curve",
    sourceEventIds: ["event-2024-spring-cohort-a", "event-2024-spring-cohort-b"],
    promptSetHash: "3a7bd3e2360a7d9e5f8c1b4a6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e",
    entries: [
      {
        key: "framework:zh:task-eval",
        sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
      },
    ],
    dimensionProblemDependency: [
      {
        problemId: "001230-quadratic-equations",
        problemVersion: 1,
        dimensions: ["representation", "self-verification"] as const,
      },
    ],
    method: "standard_deviation" as const,
    sampleSize: 150,
    createdAt: "2024-03-20T14:00:00Z",
    abilityCurves: {
      "representation": { A: 0.88, B: 0.72, C: 0.56 },
      "self-verification": { A: 0.80, B: 0.65, C: 0.50 },
      "iterative-refinement": { A: 0.85, B: 0.70, C: 0.55 },
      "discovery": { A: 0.82, B: 0.67, C: 0.52 },
      "exploratory": { A: 0.79, B: 0.64, C: 0.49 },
    },
    problemCurves: {
      "001230-quadratic-equations": { A: 0.90, B: 0.75, C: 0.60 },
    },
    overall: { A: 0.83, B: 0.69, C: 0.53 },
  },

  // --- 4. Curved Letter Grades ---

  curvedLetterGrades: {
    curveId: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    computedAt: "2024-03-21T09:00:00Z",
    overallGrade: "B" as const,
    abilityGrades: {
      "representation": "B" as const,
      "self-verification": "B" as const,
      "iterative-refinement": "C" as const,
      "discovery": "B" as const,
      "exploratory": "B" as const,
    },
    problemGrades: {
      "001230-quadratic-equations": "B" as const,
    },
    dimensionDetailGrades: {
      "001230-quadratic-equations": {
        "representation": "B" as const,
        "self-verification": "C" as const,
      },
    },
  },

  // --- 5. Curved Report (最终报告) ---

  curvedReportMetadata: {
    lang: "zh" as const,
    reportId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    eventId: "event-2024-spring-cohort-a",
    participantId: "participant-001",
    promptSetHash: "3a7bd3e2360a7d9e5f8c1b4a6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e",
    entries: [
      {
        key: "framework:zh:task-eval",
        sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
      },
    ],
    dimensionProblemDependency: [
      {
        problemId: "001230-quadratic-equations",
        problemVersion: 1,
        dimensions: ["representation", "self-verification"] as const,
      },
    ],
    createdAt: "2024-03-15T10:30:00Z",
    curveId: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    curvedAt: "2024-03-21T09:00:00Z",
  },

  curvedDimensionCard: {
    dimension: "representation" as const,
    phrases: "表达能力",
    grade: "B" as const,
  },

  curvedProblem: {
    problemId: "001230-quadratic-equations",
    phrases: "二次方程",
    grade: "B" as const,
  },

  curvedDimensionReport: {
    dimension: "representation" as const,
    problems: [
      { problemId: "001230-quadratic-equations", phrases: "二次方程", grade: "B" as const },
    ],
    summary: "表达能力总结",
    score: 0.78,
    grade: "B" as const,
  },

  curvedProblemCard: {
    problemId: "001230-quadratic-equations",
    grade: "B" as const,
  },

  curvedDimensionDetail: {
    dimension: "representation" as const,
    proofs: [{ comment: "好", isStrength: true, observation: "清晰" }],
    summary: "表达良好",
    score: 0.82,
    grade: "B" as const,
  },

  curvedProblemReport: {
    bad: ["小错误"],
    dimensionDetails: [
      {
        dimension: "representation" as const,
        proofs: [{ comment: "好", isStrength: true, observation: "清晰" }],
        summary: "表达良好",
        score: 0.82,
        grade: "B" as const,
      },
    ],
    good: ["思路清晰"],
    problemId: "001230-quadratic-equations",
    overview: "完成度高",
    score: 0.75,
    grade: "B" as const,
  },

  curvedReport: {
    metadata: {
      lang: "zh" as const,
      reportId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      eventId: "event-2024-spring-cohort-a",
      participantId: "participant-001",
      promptSetHash: "3a7bd3e2360a7d9e5f8c1b4a6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c8d9e0f3e",
      entries: [
        {
          key: "framework:zh:task-eval",
          sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
        },
      ],
      dimensionProblemDependency: [
        {
          problemId: "001230-quadratic-equations",
          problemVersion: 1,
          dimensions: ["representation", "self-verification"] as const,
        },
      ],
      createdAt: "2024-03-15T10:30:00Z",
      curveId: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
      curvedAt: "2024-03-21T09:00:00Z",
    },
    dimensionCards: [
      { dimension: "representation" as const, phrases: "表达能力", grade: "B" as const },
      { dimension: "self-verification" as const, phrases: "验证能力", grade: "B" as const },
      { dimension: "iterative-refinement" as const, phrases: "迭代优化", grade: "C" as const },
      { dimension: "discovery" as const, phrases: "发现能力", grade: "B" as const },
      { dimension: "exploratory" as const, phrases: "探索能力", grade: "B" as const },
    ],
    dimensionReports: [
      {
        dimension: "representation" as const,
        problems: [
          { problemId: "001230-quadratic-equations", phrases: "二次方程", grade: "B" as const },
        ],
        summary: "表达能力总结",
        score: 0.78,
        grade: "B" as const,
      },
    ],
    overall: {
      bad: [{ title: "粗心", description: "计算有误" }],
      good: [{ title: "清晰", description: "表达清晰" }],
      improvements: [{ title: "验证", description: "加强验证" }],
      overview: "总体良好",
    },
    problemCards: [
      { problemId: "001230-quadratic-equations", grade: "B" as const },
    ],
    problemReports: [
      {
        bad: ["小错误"],
        dimensionDetails: [
          {
            dimension: "representation" as const,
            proofs: [{ comment: "好", isStrength: true, observation: "清晰" }],
            summary: "表达良好",
            score: 0.82,
            grade: "B" as const,
          },
        ],
        good: ["思路清晰"],
        problemId: "001230-quadratic-equations",
        overview: "完成度高",
        score: 0.75,
        grade: "B" as const,
      },
    ],
    taskEvalMean: 0.75,
    abilityMean: 0.72,
    overallMean: 0.73,
    grade: "B" as const,
  },
};


// =============================================================================
// PART 2: scripts/schemas.ts Sample Data (Master Schema)
// =============================================================================

export const master = {
  // --- 1. Common Types ---

  problemId: "001230",  // 6 digits only, no title

  eventId: "event-2024-spring-cohort-a",

  lang: "zh" as const,

  promptVersionHash: "7a8b9c0d1e2f3a4b",

  letterGrade: "B" as const,

  scoreValue: 0.75,

  // Different dimension names than v1
  dimension: "Discovery-Self-Understanding" as const,

  // --- 2. Dimension-Problem Dependency ---

  dimensionProblemDependency: {
    problem_id: "001230",
    problem_version: 1,
    dimensions: ["Discovery-Self-Understanding", "Expression-Translation"] as const,
  },

  dimensionProblemDependencyList: [
    {
      problem_id: "001230",
      problem_version: 1,
      dimensions: ["Discovery-Self-Understanding", "Expression-Translation"] as const,
    },
    {
      problem_id: "001241",
      problem_version: 2,
      dimensions: ["Iterative-Optimization", "Exploratory-Discovery"] as const,
    },
  ],

  // --- 3. Total Scores ---

  totalScores: {
    total_problem_score: 0.75,
    total_ability_score: 0.72,
    final_total_score: 0.73,
  },

  // --- 4. JSONScores (PRE-CURVE) ---

  abilityScore: {
    dimension: "Discovery-Self-Understanding" as const,
    score: 0.78,
  },

  dimensionDetailScore: {
    dimension: "Discovery-Self-Understanding" as const,
    score: 0.82,
  },

  problemScore: {
    problem_id: "001230",
    task_score: 0.75,
    dimension_scores: [
      { dimension: "Discovery-Self-Understanding" as const, score: 0.82 },
      { dimension: "Expression-Translation" as const, score: 0.65 },
    ],
  },

  jsonScores: {
    scores_id: "c3d4e5f6-a7b8-9012-cdef-345678901234",
    event_id: "event-2024-spring-cohort-a",
    prompt_version_hash: "7a8b9c0d1e2f3a4b",
    generated_at: "2024-03-15T10:30:00Z",
    participant_id: "participant-001",
    totals: {
      total_problem_score: 0.75,
      total_ability_score: 0.72,
      final_total_score: 0.73,
    },
    ability_scores: [
      { dimension: "Discovery-Self-Understanding" as const, score: 0.78 },
      { dimension: "Expression-Translation" as const, score: 0.72 },
      { dimension: "Exploratory-Discovery" as const, score: 0.68 },
      { dimension: "Verification-Confirmation" as const, score: 0.75 },
      { dimension: "Iterative-Optimization" as const, score: 0.70 },
    ],
    problem_scores: [
      {
        problem_id: "001230",
        task_score: 0.75,
        dimension_scores: [
          { dimension: "Discovery-Self-Understanding" as const, score: 0.82 },
          { dimension: "Expression-Translation" as const, score: 0.65 },
        ],
      },
      {
        problem_id: "001241",
        task_score: 0.70,
        dimension_scores: [
          { dimension: "Iterative-Optimization" as const, score: 0.72 },
          { dimension: "Exploratory-Discovery" as const, score: 0.68 },
        ],
      },
    ],
  },

  // --- 5. Curve ---

  curveMethodPercentile: {
    type: "percentile" as const,
    percentiles: [0.9, 0.7, 0.5],
  },

  curveMethodStdDev: {
    type: "standard_deviation" as const,
    sigma_boundaries: [1, 0, -1],
  },

  curveMethodAbsolute: {
    type: "absolute" as const,
    thresholds: [0.85, 0.70, 0.55],
  },

  gradeThresholds: {
    A: 0.85,
    B: 0.70,
    C: 0.55,
  },

  totalCurves: {
    total_problem: { A: 0.85, B: 0.70, C: 0.55 },
    total_ability: { A: 0.82, B: 0.68, C: 0.52 },
    final_total: { A: 0.83, B: 0.69, C: 0.53 },
  },

  curve: {
    curve_id: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    label: "2024 Spring Cohort Curve",
    source_event_ids: ["event-2024-spring-cohort-a", "event-2024-spring-cohort-b"],
    prompt_version_hash: "7a8b9c0d1e2f3a4b",
    dimension_problem_dependency: [
      {
        problem_id: "001230",
        problem_version: 1,
        dimensions: ["Discovery-Self-Understanding", "Expression-Translation"] as const,
      },
    ],
    method: {
      type: "standard_deviation" as const,
      sigma_boundaries: [1, 0, -1],
    },
    sample_size: 150,
    computed_at: "2024-03-20T14:00:00Z",
    totals: {
      total_problem: { A: 0.85, B: 0.70, C: 0.55 },
      total_ability: { A: 0.82, B: 0.68, C: 0.52 },
      final_total: { A: 0.83, B: 0.69, C: 0.53 },
    },
    ability_curves: {
      "Discovery-Self-Understanding": { A: 0.88, B: 0.72, C: 0.56 },
      "Expression-Translation": { A: 0.80, B: 0.65, C: 0.50 },
      "Exploratory-Discovery": { A: 0.85, B: 0.70, C: 0.55 },
      "Verification-Confirmation": { A: 0.82, B: 0.67, C: 0.52 },
      "Iterative-Optimization": { A: 0.79, B: 0.64, C: 0.49 },
    },
    problem_curves: {
      "001230": { A: 0.90, B: 0.75, C: 0.60 },
      "001241": { A: 0.85, B: 0.70, C: 0.55 },
    },
  },

  // --- 6. CurvedScores (POST-CURVE) ---

  totalGrades: {
    total_problem_grade: "B" as const,
    total_ability_grade: "B" as const,
    final_total_grade: "B" as const,
  },

  curvedScores: {
    curved_scores_id: "d4e5f6a7-b8c9-0123-def0-456789012345",
    source_scores_id: "c3d4e5f6-a7b8-9012-cdef-345678901234",
    event_id: "event-2024-spring-cohort-a",
    prompt_version_hash: "7a8b9c0d1e2f3a4b",
    applied_curve_id: "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    curved_at: "2024-03-21T09:00:00Z",
    participant_id: "participant-001",
    totals: {
      total_problem_score: 0.75,
      total_ability_score: 0.72,
      final_total_score: 0.73,
    },
    ability_scores: [
      { dimension: "Discovery-Self-Understanding" as const, score: 0.78 },
      { dimension: "Expression-Translation" as const, score: 0.72 },
      { dimension: "Exploratory-Discovery" as const, score: 0.68 },
      { dimension: "Verification-Confirmation" as const, score: 0.75 },
      { dimension: "Iterative-Optimization" as const, score: 0.70 },
    ],
    problem_scores: [
      {
        problem_id: "001230",
        task_score: 0.75,
        dimension_scores: [
          { dimension: "Discovery-Self-Understanding" as const, score: 0.82 },
          { dimension: "Expression-Translation" as const, score: 0.65 },
        ],
      },
    ],
    letter_grades: {
      totals: {
        total_problem_grade: "B" as const,
        total_ability_grade: "B" as const,
        final_total_grade: "B" as const,
      },
      abilities: {
        "Discovery-Self-Understanding": "B" as const,
        "Expression-Translation": "B" as const,
        "Exploratory-Discovery": "C" as const,
        "Verification-Confirmation": "B" as const,
        "Iterative-Optimization": "B" as const,
      },
      problems: {
        "001230": "B" as const,
      },
      dimension_details: {
        "001230": {
          "Discovery-Self-Understanding": "B" as const,
          "Expression-Translation": "C" as const,
        },
      },
    },
  },

  // --- 7. Score Pool ---

  scorePool: {
    pool_id: "e5f6a7b8-c9d0-1234-ef01-567890123456",
    label: "2024 Spring Combined Pool",
    source_event_ids: ["event-2024-spring-cohort-a", "event-2024-spring-cohort-b"],
    prompt_version_hash: "7a8b9c0d1e2f3a4b",
    problem_ids: ["001230", "001241"],
    dimension_problem_dependency: [
      {
        problem_id: "001230",
        problem_version: 1,
        dimensions: ["Discovery-Self-Understanding", "Expression-Translation"] as const,
      },
      {
        problem_id: "001241",
        problem_version: 2,
        dimensions: ["Iterative-Optimization", "Exploratory-Discovery"] as const,
      },
    ],
    created_at: "2024-03-18T12:00:00Z",
    scores: [
      {
        scores_id: "c3d4e5f6-a7b8-9012-cdef-345678901234",
        event_id: "event-2024-spring-cohort-a",
        prompt_version_hash: "7a8b9c0d1e2f3a4b",
        generated_at: "2024-03-15T10:30:00Z",
        participant_id: "participant-001",
        totals: {
          total_problem_score: 0.75,
          total_ability_score: 0.72,
          final_total_score: 0.73,
        },
        ability_scores: [
          { dimension: "Discovery-Self-Understanding" as const, score: 0.78 },
          { dimension: "Expression-Translation" as const, score: 0.72 },
          { dimension: "Exploratory-Discovery" as const, score: 0.68 },
          { dimension: "Verification-Confirmation" as const, score: 0.75 },
          { dimension: "Iterative-Optimization" as const, score: 0.70 },
        ],
        problem_scores: [
          {
            problem_id: "001230",
            task_score: 0.75,
            dimension_scores: [
              { dimension: "Discovery-Self-Understanding" as const, score: 0.82 },
              { dimension: "Expression-Translation" as const, score: 0.65 },
            ],
          },
        ],
      },
    ],
  },

  // --- 8. Compatibility Result ---

  compatibilityResultCompatible: {
    status: "compatible" as const,
  },

  compatibilityResultIncompatible: {
    status: "incompatible" as const,
    reasons: [
      "Prompt version mismatch: expected 7a8b9c0, got 1234567",
      "Missing problem: 001250",
    ],
  },

  compatibilityResultRequiresOverride: {
    status: "requires_override" as const,
    warnings: [
      "Prompt version differs but scores are structurally compatible",
    ],
    differences: {
      prompt_version_mismatch: true,
      problem_id_differences: ["001250 missing in curve"],
      dimension_differences: undefined,
    },
  },

  // --- 9. Event Config ---

  eventConfig: {
    event_id: "event-2024-spring-cohort-a",
    name: "2024 Spring Cohort A Assessment",
    problem_names: {
      "001230": "Quadratic Equations",
      "001241": "Data Analysis",
    },
    problem_ids: ["001230", "001241"],
    language: "zh" as const,
    prompt_version_hash: "7a8b9c0d1e2f3a4b",
  },
};


// =============================================================================
// PART 3: Key Differences Summary
// =============================================================================

export const differences = {
  problemId: {
    v1: "001230-quadratic-equations",  // 6digits-title
    master: "001230",                   // 6digits only
  },

  dimensions: {
    v1: ["representation", "self-verification", "iterative-refinement", "discovery", "exploratory"],
    master: [
      "Discovery-Self-Understanding",
      "Expression-Translation",
      "Exploratory-Discovery",
      "Verification-Confirmation",
      "Iterative-Optimization",
    ],
  },

  namingConvention: {
    v1: "camelCase (problemId, dimensionId)",
    master: "snake_case (problem_id, dimension_id)",
  },

  curveMethod: {
    v1: "literal('standard_deviation') only",
    master: "discriminatedUnion with 3 options (percentile, standard_deviation, absolute)",
  },

  promptVersioning: {
    v1: "SHA-256 promptSetHash + entries array",
    master: "git commit hash only",
  },

  uncurvedGrade: {
    v1: "has UncurvedGradeSchema = 'X'",
    master: "no uncurved grade concept",
  },

  reportSchema: {
    v1: "full LLMReportSchema with phrases, proofs, summaries",
    master: "no report schema, only JSONScores",
  },
};
