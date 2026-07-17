/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file spike
 * @description Phase 1 spike, refactored to use the shared provider registry.
 *   Proves the full pipeline (env autoload → provider-agnostic auto-detect →
 *   SDK factory → real LLM call → token usage) without CLI plumbing.
 *
 *   Canonical version: `skillenhance ping`. This file remains for one-off
 *   manual smoke checks (`npm run spike`).
 * @see SPEC.md §"Build Phases → 1. Spike"
 */

import { loadEnv } from "./env.js";
import { makeModel } from "./providers/registry.js";
import { generateText } from "ai";
import { exitUserError, exitInternalError } from "./cli-errors.js";

/**
 * Run the spike. Loads env (auto-detect or override), invokes the SDK with
 * the resolved credentials, prints the model response.
 *
 * @returns Resolved when complete. Exits process on error.
 */
async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    exitUserError(err);
  }

  console.log(`[spike] provider=${env.provider} model=${env.model}`);
  console.log(`[spike] api-key present: ${env.apiKey.length > 10 ? "yes" : "no"}`);
  console.log(`[spike] calling generateText...`);

  const prompt =
    "Reply with one sentence describing what a 'skill' is in the context of Claude Code agents.";

  const start = Date.now();
  let result;
  try {
    result = await generateText({
      model: makeModel(env.provider, env.model, env.apiKey, env.baseURL),
      prompt,
      maxOutputTokens: 200,
    });
  } catch (err) {
    exitInternalError(err);
  }
  const elapsed = Date.now() - start;

  const usage = result.usage;
  console.log(`[spike] response in ${elapsed}ms`);
  console.log(`[spike] usage: ${JSON.stringify(usage)}`);
  console.log(`[spike] text: ${result.text}`);
  console.log("[spike] OK");
}

main().catch((err) => exitUserError(err));
