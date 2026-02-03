02/04

ProblemId anna用的是`^\d{6}-.+$` (6 digits + title)，加上title会human-friendly一点 实际我们可以不validate title的部分

anna加了validation 末尾digit必须是0或者1 这个应该加

DimensionId enum更好 不应该是任意string 如果增减维度就改schema

PromptVersionHash 用git commit hash会出现的问题是两套相同的prompt有同一个git commit hash，但是我们可能希望检查两套报告是否是用完全一样的prompt打分的。anna用了每个prompt的sha256的集合可以避免这种情况。
鉴于我们依然希望通过报告上的记录定位到原propmt, sha256没法逆向还原，我建议git commit hash  和  sha256都用（anna没有使用git commit hash）

letter grade anna是这样做的我觉得更好
CurvedGradeSchema = z.enum(['A', 'B', 'C', 'D'])
UncurvedGradeSchema = z.literal('X')

ReportJSON schema这块我建议看一下anna怎么写的。我的理解是schema可以对着我们现有的LLM report的格式来写。

Curved Report Schema同理

JSON Scores Schema这块其实我们只需要final total或者叫overallMean，综合得分。但是把problem totals和ability totals保留下来也可以

Curve Schema anna做了以下我觉得都是更好的1. allow curve来源多个event 2. 我们不需要能力总分和客观总分的curve（因为给客户的report没有能力分和客观分的ABCD） 3. 嵌入了DimensionProblemDependency

关于DimensionProblemDependencySchema，这个在curve和原始LLM Report确实都应该有（anna都做了）, 因为我们apply curve的时候也许想check一下dependency是不是相同的

Curved letter grade 我们需要某个能力维度在某个问题中的ABCD。比如verification在000341有numerical score，我们用vericaition的总curve把这个numerical变成ABCD




