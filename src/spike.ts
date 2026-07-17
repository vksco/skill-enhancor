/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file spike
 * @description Phase 1 spike: prove Vercel AI SDK round-trip works on Windows.
 *   Single `generateText` call against the chosen provider via env-configured API key.
 *   Run via `npm run spike`.
 * @see SPEC.md §"Build Phases → 1. Spike"
 */

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type LanguageModel } from "ai";
import { loadEnv, type ProviderId } from "./env.js";

/**
 * Map a provider ID to the AI SDK model factory.
 * Co-located here (not in env.ts) because the factory calls are SDK-specific
 * and would drag all SDK imports into the lightweight env loader.
 *
 * @param provider - Provider ID (already validated by loadEnv).
 * @param modelId  - Model ID (already validated + defaulted by loadEnv).
 * @param apiKey   - Real API key from env. NEVER pass a placeholder — the SDK
 *                   sends it as `Authorization: Bearer <key>` and placeholders
 *                   look like auth failures downstream.
 * @param baseURL  - OpenAI-compat endpoint. Required iff provider ∈ {minimax, custom}.
 */
function modelFor(
  provider: ProviderId,
  modelId: string,
  apiKey: string,
  baseURL?: string,
): LanguageModel {
  switch (provider) {
    case "anthropic":
      return anthropic(modelId);
    case "openai":
      return openai(modelId);
    case "google":
      // Lazy import pattern would be cleaner but Phase 1 spike only needs Anthropic round-trip.
      throw new Error("[spike] provider 'google' not wired into spike.ts yet (Phase 7)");
    case "minimax":
    case "custom": {
      if (!baseURL) throw new Error(`[spike] provider '${provider}' needs baseURL in env.`);
      const compat = createOpenAICompatible({ name: provider, baseURL, apiKey });
      return compat(modelId);
    }
  }
}

/**
 * Run the spike. Exits process with 0 on success, 1 on failure.
 *
 * @returns Promise that resolves when the call completes.
 */
async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    // env.ts throws with the helpful message already — re-emit colored.
    console.error(`\x1b[31;1m${(err as Error).message}\x1b[0m`);
    process.exit(1);
  }

  console.log(`[spike] provider=${env.provider} model=${env.model}`);
  console.log(`[spike] api-key present: ${env.apiKey.length > 10 ? "yes" : "no"}`);
  console.log(`[spike] calling generateText...`);

  const prompt =
    "Reply with one sentence describing what a 'skill' is in the context of Claude Code agents.";

  const start = Date.now();
  const { text, usage } = await generateText({
    model: modelFor(env.provider, env.model, env.apiKey, env.baseURL),
    prompt,
    maxOutputTokens: 200,
  });
  const elapsed = Date.now() - start;

  console.log(`[spike] response in ${elapsed}ms`);
  console.log(`[spike] usage: ${JSON.stringify(usage)}`);
  console.log(`[spike] text: ${text}`);
  console.log("[spike] OK");
}

main().catch((err) => {
  console.error("[spike] FAIL:", err);
  process.exit(1);
});
