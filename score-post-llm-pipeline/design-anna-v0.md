# Curve pipeline plan

Created by: Anna Cheng

1. **生成 curve**
    
    Input 为 大于等于 1 个 相同 （problems 组合）的 event （如果是一组人工组合的样本分数则无法溯源）
    
    μ + 1σ,  μ,   μ - 1σ
    
    生成的 curve 存 db
    
    ```json
    //curve schema
    {
    	metadata: {
    		eventIds: string[] // 样本分来源，可组合 event 但需校验 problem 一致
    	},
    	"abilitySummaryScores" : {
    		"discovery": {A: number, B:number, C:number},
    		"representation": {A: number, B:number, C:number},
    		"iterative-refinement": {A: number, B:number, C:number},
    		"exploratory": {A: number, B:number, C:number},
    		"self-verification": {A: number, B:number, C:number}
    	},
    	"problemTaskScores" : {
    		[problemId]: {A: number, B:number, C:number}
    	},
    	overallMean: {A: number, B:number, C:number}
    }
    ```
    
2. **生成 raw report JSON** 
    1. 无 letter grade
    2. 记录 scoring prompt version （latest commit hash for this run）
    3. 记录 ability.dimension depend on which problem
    
3. **curve final reports**
    
    相同题目组合的 event 使用匹配的 curve
    
    所有字段严格 match，少字段或字段不符均抛错误
    
    Final report ：
    
    1. curved letter grade 回填
    2. 记录 which curve applied （curveId）
    

![image.png](Curve%20pipeline%20plan/image.png)

**Q&A**

1. curve 计算 σ 为样本标准差吗？
2. 对 raw report json 进行 curve 时应该人工选择 or 自动匹配使用的 curve 版本？
3. 回填 raw report 前的 curved letter grade 集合是否有必要保留，我感觉没有
4. 5 大维度名称确认
    
    ```json
    发现与自我理解 discovery
    表达与转译 representation
    迭代与反馈 iterative-refinement
    探索式发现  exploratory
    验证 self-verification
    ```
    

Step1： 从 7 维到 5 维

粗略看了下主要代码调整涉及 constants define、types、ability.dimension depend on which problem

```tsx
export const PROBLEMS: Record<ProblemId, ProblemDefinition> = {
  '000340-meeting-verify': {
    id: '000340-meeting-verify',
    name: 'Meeting Summary Verification',
    abilities: [
      'iterative-refinement',
      'choosing',
      'self-verification',
      'representation',
    ],
  },
  '000341-meeting-verify': {
    id: '000341-meeting-verify',
    name: '会议总结校对',
    abilities: [
      'iterative-refinement',
      'choosing',
      'self-verification',
      'representation',
    ],
  },
  '000500-thinking-traps': {
    id: '000500-thinking-traps',
    name: 'Cognitive Bias Identification',
    abilities: ['discovery', 'iterative-refinement', 'world-modeling'],
  },
  '000501-thinking-traps': {
    id: '000501-thinking-traps',
    name: '识别思维陷阱',
    abilities: ['discovery', 'iterative-refinement', 'world-modeling'],
  },
  '001000-ling-bing': {
    id: '001000-ling-bing',
    name: 'Language X Translation',
    abilities: ['exploratory', 'self-verification'],
  },
  '001001-ling-bing': {
    id: '001001-ling-bing',
    name: '丙语言翻译',
    abilities: ['exploratory', 'self-verification'],
  },
  '001110-operationalize': {
    id: '001110-operationalize',
    name: 'Operationalization Prompt Testing',
    abilities: [
      'discovery',
      'iterative-refinement',
      'representation',
      'world-modeling',
    ],
  },
  '001111-operationalize': {
    id: '001111-operationalize',
    name: '可操作化提示词检验',
    abilities: [
      'discovery',
      'iterative-refinement',
      'representation',
      'world-modeling',
    ],
  },
}
```

Step2: 实现 curve gen script

Step3: 补充 llm report JSON  metadata

Step4: 完善 curve final reports scripts semantic 层面校验
