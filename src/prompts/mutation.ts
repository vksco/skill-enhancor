/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file prompts/mutation
 * @description Mutation prompt template for the iteration loop.
 *   The mutation output is a full SKILL.md (per SPEC Q8.4 — never diffs).
 *   Directed by per-axis scores from the last judge call. Two modes:
 *     - "targeted": focus on weakest axis
 *     - "broad-rewrite": rewrite proportionally every 5th iter (per SPEC Q4.3)
 * @see SPEC.md §"Locked Decisions Q2 / Q4.3 / Q8.4"
 */

import { ALL_DIMENSIONS, type DimensionId } from "../eval/dimensions.js";

/** Per-axis scores from the last judge run (the mutation's diagnostic input). */
export interface MutationScores {
  axes: Record<DimensionId, number>;
  composite: number;
  caseCount: number;
}

/** One test case the mutation should be aware of. */
export interface MutationCase {
  id: string;
  input: string;
  should_trigger: boolean;
  expected?: string;
}

/** What the mutation mode signals to the model. */
export type MutationMode = "targeted" | "broad-rewrite";

/**
 * Build the mutation prompt. Output language is plain prose telling the model
 * to emit only a full SKILL.md — no meta-commentary, no preface.
 *
 * @param skillText        The best-known SKILL.md so far.
 * @param scores            Per-axis scores from the last judge run (drives direction).
 * @param cases             Frozen test cases (truncated to keep token budget).
 * @param casesJson         The full cases.json string (used for context).
 * @param mode              Targeted on weakest axis, or broad rewrite.
 * @returns Prompt text ready to hand to generateText.
 */
export function buildMutationPrompt(opts: {
  skillText: string;
  scores: MutationScores;
  cases: MutationCase[];
  casesJson: string;
  mode: MutationMode;
}): string {
  // Pick lowest-axis as the target; null when broad mode.
  let weakestId: DimensionId | null = null;
  let weakestScore = Infinity;
  for (const d of ALL_DIMENSIONS) {
    const s = opts.scores.axes[d.id]!;
    if (s < weakestScore) {
      weakestScore = s;
      weakestId = d.id;
    }
  }

  // Compact case summary: id + truncated input + trigger flag only.
  const caseLines = opts.cases.map((c) => {
    const trigger = c.should_trigger ? "+trigger" : "-trigger";
    const truncated = c.input.length > 140 ? c.input.slice(0, 140) + "…" : c.input;
    return `- [${c.id}] ${trigger} — ${truncated}`;
  });

  // For broad mode, surface every weak axis (anything < 8).
  const broadFocus = ALL_DIMENSIONS
    .filter((d) => opts.scores.axes[d.id]! < 8)
    .map((d) => `${d.id} (${opts.scores.axes[d.id]!}/10)`);

  const axisScores = ALL_DIMENSIONS.map(
    (d) => `- ${d.id}: ${opts.scores.axes[d.id]!.toFixed(1)}/10`,
  ).join("\n");

  const modeDirective =
    opts.mode === "targeted" && weakestId
      ? `YOUR FOCUS AXIS: **${weakestId}** (currently ${weakestScore.toFixed(1)}/10 — the weakest axis).
The rubric definition for this axis is:
> ${ALL_DIMENSIONS.find((d) => d.id === weakestId)?.promptDescription ?? ""}

Read each test case. Identify what is breaking ${weakestId} on each case. Then fix ONLY those parts of the SKILL.md. Do NOT touch parts that already score well.
Constraints: do not lower the score of any other axis by more than ~10% of its current value.`
      : `YOUR TASK: Rewrite the SKILL.md broadly — preserve the frontmatter (name, description) and the spirit of the original, but address every axis scoring below 8/10:
${broadFocus.length > 0 ? broadFocus.join("\n") : "(all axes are healthy; refine voice and clarity instead)"}`;

  return `You are iterating on a Claude skill (SKILL.md) to improve its objective scoring on a 5-axis rubric. Your only output is the FULL new SKILL.md.

${modeDirective}

CURRENT SKILL (the best version so far):
\`\`\`
${opts.skillText}
\`\`\`

CURRENT SCORES (composite ${opts.scores.composite.toFixed(2)}, ${opts.scores.caseCount} cases):
${axisScores}

TEST CASES YOU WILL BE EVALUATED ON:
${caseLines.join("\n")}

DO NOT:
- Rewrite the frontmatter (the \`---\` YAML block at top — keep name + description).
- Reference this prompt, the rubric, iteration mechanics, or "the rubric" in your output.
- Add commentary after the SKILL.md body.
- Use placeholder text like "TODO" or "[explain here]".

OUTPUT FORMAT: Emit ONLY the complete SKILL.md (YAML frontmatter + markdown body). No preface ("Here is the updated skill…"). No trailing remarks. Start directly with the \`---\` block.`;
}
