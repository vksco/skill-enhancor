/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file prompts/judge
 * @description Judge prompt template. The axis definitions are derived
 *   from `ALL_DIMENSIONS` so adding a dimension in dimensions.ts updates
 *   the judge prompt automatically.
 * @see src/eval/dimensions.ts, SPEC.md §"Locked Decisions Q2"
 */

import { ALL_DIMENSIONS } from "../eval/dimensions.js";

/**
 * Inline axis definitions injected into the judge prompt. Built from the
 * dimension registry — adding a dimension in dimensions.ts updates this
 * without code changes here.
 */
export const RUBRIC_AXIS_DEFS: string = ALL_DIMENSIONS.map(
  (d) =>
    `- ${d.id} (0-10): ${d.promptDescription}`,
).join("\n");

/**
 * Build the full judge prompt for a skill + cases file.
 *
 * @param skillText The full SKILL.md (or skill-equivalent) text.
 * @param casesJson The full cases.json content as a string.
 * @returns Prompt text ready to pass to generateText().
 */
export function buildJudgePrompt(skillText: string, casesJson: string): string {
  // Schema example references dimension ids dynamically so the example shape
  // matches what the judge must emit.
  const exampleScores: string = ALL_DIMENSIONS.map(
    (d) => `"${d.id}": 0-10`,
  ).join(", ");

  return `You are an expert evaluator of Claude skills (SKILL.md files used inside Claude Code agents).

Score the skill across ${ALL_DIMENSIONS.length} rubric axes for EACH test case, plus whether each case correctly triggers the skill.

${RUBRIC_AXIS_DEFS}

SKILL TO EVALUATE:
\`\`\`
${skillText}
\`\`\`

TEST CASES (cases.json):
\`\`\`json
${casesJson}
\`\`\`

For EACH case, decide whether the skill would actually trigger and score all ${ALL_DIMENSIONS.length} axes 0-10. Use the case's should_trigger ground truth to inform your triggerFidelity score.

Output ONLY valid JSON of the form:
{"evaluations": [{"case_id": "...", "did_trigger": true|false, "scores": {${exampleScores}}, "rationale": "1-3 sentences"}]}

Order evaluations by case_id ascending. Include ALL cases, no omissions. No prose outside JSON.`;
}
