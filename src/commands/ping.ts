/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file ping
 * @description Smoke-test command: `skillenhance ping`. Resolves the provider
 *   (auto-detect or --provider override), runs one short `generateText` call,
 *   and prints elapsed time + usage. Used by `config` wizard to verify a
 *   freshly-written key works, and by users as a quick "is my setup alive?"
 *   check.
 */

import { generateText } from "ai";
import { loadEnv } from "../env.js";
import { makeModel, type ProviderId } from "../providers/registry.js";
import { exitUserError, exitInternalError } from "../cli-errors.js";

export interface PingResult {
  provider: ProviderId;
  model: string;
  baseURL?: string;
  elapsedMs: number;
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Run the smoke test. Returns the result object so the caller (cli / tests)
 * can format it. Throws on failure via cli-errors.
 *
 * @param opts.provider - Optional explicit provider override.
 * @param opts.prompt   - Prompt text. Short by default.
 * @returns PingResult with timing + token usage.
 */
export async function runPing(opts: { provider?: string; prompt?: string } = {}): Promise<PingResult> {
  let env;
  try {
    env = loadEnv({ provider: opts.provider });
  } catch (err) {
    exitUserError(err);
  }

  const prompt = opts.prompt ?? "Reply with one short sentence: 'pong.'";

  const start = Date.now();
  let result;
  try {
    result = await generateText({
      model: makeModel(env.provider, env.model, env.apiKey, env.baseURL),
      prompt,
      maxOutputTokens: 50,
    });
  } catch (err) {
    exitInternalError(err);
  }
  const elapsed = Date.now() - start;

  return {
    provider: env.provider,
    model: env.model,
    baseURL: env.baseURL,
    elapsedMs: elapsed,
    text: result.text.trim(),
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    totalTokens: result.usage?.totalTokens ?? 0,
  };
}

/** Human-readable one-liner formatter used by `skillenhance ping` CLI output. */
export function formatPing(r: PingResult): string {
  const base = r.baseURL ? ` base=${r.baseURL}` : "";
  return (
    `[ping] provider=${r.provider} model=${r.model}${base}\n` +
    `[ping] ok in ${r.elapsedMs}ms — tokens in=${r.inputTokens} out=${r.outputTokens} total=${r.totalTokens}\n` +
    `[ping] ${r.text}`
  );
}
