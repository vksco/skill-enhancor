/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file judge
 * @description Run the rubric judge against a skill + cases file.
 *
 *   We deliberately use `generateText` + manual JSON.parse + Zod validation
 *   rather than `generateObject`. The reason: OpenAI-compat reasoning
 *   models (Minimax M2.7 verified by probe) emit `think...` chains into
 *   the text field. The SDK's structured-output extractors do not handle
 *   this contamination cleanly — they fail with `No object generated: could
 *   not parse the response`. Going via generateText gives us full control
 *   over the parse pipeline: strip per-provider reasoning tags, then
 *   JSON.parse, then Zod-validate the parsed shape.
 *
 *   Cross-provider concern is the whole reason provider registry carries
 *   thinkingTagPattern — every per-provider variation is handled by the
 *   same `stripThinking()` call.
 *
 * @see SPEC.md §"Locked Decisions Q2 / Q4.1", §Open Risks #5
 */

import { generateText } from "ai";
import { z } from "zod";
import { loadEnv } from "../env.js";
import { makeModel, stripThinking, type ProviderId } from "../providers/registry.js";
import { buildJudgePrompt } from "../prompts/judge.js";
import { exitUserError, exitInternalError } from "../cli-errors.js";
import { buildAggregate } from "./rubric.js";
import { fingerprintCases } from "./cases-io.js";
import { DIMENSION_IDS } from "./dimensions.js";
import type { Case, JudgeOutput, ScoreAggregate } from "./types.js";

/**
 * Per-case Zod schema. `scores` is built dynamically from DIMENSION_IDS so
 * adding a dimension updates the validation shape automatically.
 */
const scoresSchema = z.object(
  Object.fromEntries(
    DIMENSION_IDS.map((id) => [id, z.number().min(0).max(10)]),
  ) as Record<(typeof DIMENSION_IDS)[number], z.ZodNumber>,
);

const evalSchema = z.object({
  case_id: z.string(),
  did_trigger: z.boolean(),
  scores: scoresSchema,
  rationale: z.string().min(1),
});

const judgeOutputSchema = z.object({
  evaluations: z.array(evalSchema).min(1),
});

/** Options controlling a single runJudge() call. */
export interface RunJudgeOpts {
  /** Override the provider used for judging. Defaults to the active provider. */
  provider?: ProviderId;
  /** Override the model id used for judging. Defaults to active provider's default. */
  modelId?: string;
  /** Base URL for OpenAI-compat providers (only used when override provider requires it). */
  baseURL?: string;
  /** Per-call maxOutputTokens. Reasoning models need generous budgets. */
  maxOutputTokens?: number;
}

/**
 * Run the judge on a skill + cases. Returns the parsed JudgeOutput + aggregate.
 *
 * @param skillText  Full SKILL.md content.
 * @param cases      Array of test cases. Frozen across the run.
 * @param opts       Per-call overrides (provider/model/baseURL/token limit).
 * @returns Parsed JudgeOutput + aggregate + casesSha256.
 */
export async function runJudge(
  skillText: string,
  cases: Case[],
  opts: RunJudgeOpts = {},
): Promise<{ output: JudgeOutput; aggregate: ScoreAggregate }> {
  let env;
  try {
    env = loadEnv({ provider: opts.provider });
  } catch (err) {
    exitUserError(err);
  }
  const providerId: ProviderId = opts.provider ?? env.provider;
  const apiKey = env.apiKey;
  const modelId = opts.modelId ?? env.model;
  const baseURL = opts.baseURL ?? env.baseURL;
  const casesJson = JSON.stringify({ queries: cases });
  const prompt = buildJudgePrompt(skillText, casesJson);
  // Reasoning models routinely spend 800+ output tokens on thinking before
  // producing the final JSON. 2500 leaves ample headroom.
  const maxOutputTokens = opts.maxOutputTokens ?? 2500;

  let rawText = "";
  try {
    const result = await generateText({
      model: makeModel(providerId, modelId, apiKey, baseURL),
      prompt,
      maxOutputTokens,
      temperature: 0, // deterministic judging
    });
    rawText = result.text;
  } catch (err) {
    exitInternalError(err, "Judge call failed. Check provider key + baseURL.");
  }

  // Strip per-provider reasoning tags before attempting to parse JSON.
  const cleaned = stripThinking(rawText, providerId, process.env);

  // Extract the first JSON object from the (possibly remaining-noisy) text.
  // The model often wraps JSON in prose; we want the outermost {...} block.
  const parsed = extractFirstJsonObject(cleaned);
  if (!parsed) {
    exitInternalError(
      new Error(
        `Judge output did not contain a JSON object. First 200 chars: ${cleaned.slice(0, 200)}`,
      ),
      "Try raising --max-output-tokens or switching to a non-reasoning model.",
    );
  }

  let output: JudgeOutput;
  try {
    output = judgeOutputSchema.parse(parsed) as JudgeOutput;
  } catch (err) {
    exitInternalError(
      new Error(
        `Judge output failed schema validation: ${(err as Error).message}\nFirst 500 chars: ${cleaned.slice(0, 500)}`,
      ),
      "Output did not match the expected { evaluations: [...] } shape.",
    );
  }

  const casesSha256 = fingerprintCases({ queries: cases });
  const aggregate = buildAggregate(output, casesSha256);

  return { output, aggregate };
}

/**
 * Find the first balanced JSON object in `text` and JSON.parse it.
 * Handles the common case where the model wraps the JSON in prose,
 * markdown code fences, or leading/trailing explanation.
 *
 * @param text  Possibly-noisy text from the model.
 * @returns Parsed object, or null if no balanced object found.
 */
function extractFirstJsonObject(text: string): unknown | null {
  // Strip markdown code fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  // Walk the string counting braces, respecting JSON string-literal quoting.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
