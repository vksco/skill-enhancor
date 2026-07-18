/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file prompts/judge
 * @description Judge prompt template. The judge is a STRONG model that scores
 *   the skill against frozen test cases across 5 rubric axes.
 * @see SPEC.md §"Locked Decisions Q2 (rubric)"
 */

/** Axis definitions used in the judge prompt. */
export const RUBRIC_AXIS_DEFS = `
- correctness (0-10): Instructions produce factually and procedurally right behaviour. No false claims, no deprecated APIs. Following the skill does not lead the agent into wrong conclusions.
- triggerFidelity (0-10): Skill fires on the right queries and stays quiet on wrong ones. For each case, score 10 if did_trigger matches should_trigger; lower if mismatched in a confusing way.
- outputQuality (0-10): Following the skill leads to genuinely good agent behaviour — concise, well-targeted, appropriate level of detail for the query.
- robustness (0-10): Skill survives edge cases (missing context, ambiguous input, partial info). Does not require perfect, well-formatted input.
- reusability (0-10): Skill composes with other skills, does not hide hardcoded paths or vendor-specific assumptions.
`.trim();

/**
 * Build the judge prompt for a given skill + cases file.
 *
 * @param skillText The full SKILL.md (or skill-equivalent) text.
 * @param casesJson The full cases.json content as a string.
 * @returns Prompt text ready to pass to generateObject().
 */
export function buildJudgePrompt(skillText: string, casesJson: string): string {
  return `You are an expert evaluator of Claude skills (SKILL.md files used inside Claude Code agents).

Score the skill across 5 rubric axes for EACH test case, plus whether each case correctly triggers the skill.

${RUBRIC_AXIS_DEFS}

SKILL TO EVALUATE:
\`\`\`
${skillText}
\`\`\`

TEST CASES (cases.json):
\`\`\`json
${casesJson}
\`\`\`

For EACH case, decide whether the skill would actually trigger and score all 5 axes 0-10. Use the case's should_trigger ground truth to inform your triggerFidelity score.

Output ONLY valid JSON of the form:
{"evaluations": [{"case_id": "...", "did_trigger": true|false, "scores": {"correctness": 0-10, "triggerFidelity": 0-10, "outputQuality": 0-10, "robustness": 0-10, "reusability": 0-10}, "rationale": "1-3 sentences"}]}

Order evaluations by case_id ascending. Include ALL cases, no omissions. No prose outside JSON.`;
}
