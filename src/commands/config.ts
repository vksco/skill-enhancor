/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file config
 * @description `skillenhance config` interactive wizard. Guides the user
 *   through: (1) picking a provider, (2) entering API key (password input),
 *   (3) entering base URL if OpenAI-compat, (4) entering model (defaulted),
 *   (5) writing the result back to `.env`, (6) running a `ping` to verify
 *   the new setup works end to end.
 *
 * Interactive prompts are wrapped so tests can exercise the pure logic
 * without stdin/stdout.
 */

import { resolve as resolvePath } from "node:path";
import { readEnvFile, writeEnvFile, mergeEnv } from "../config.js";
import {
  PROVIDER_REGISTRY,
  listProviders,
  type ProviderId,
} from "../providers/registry.js";
import { runPing, formatPing } from "./ping.js";
import { exitUserError } from "../cli-errors.js";

/** Pure inputs — no I/O. Lets tests feed prepared answers. */
export interface ConfigWizardAnswers {
  provider: ProviderId;
  apiKey: string;
  baseURL?: string;
  model?: string;
}

/** Pure functions injected so the wizard is testable without spawning TUI. */
export interface ConfigDeps {
  promptProvider: () => Promise<ProviderId>;
  promptApiKey: (provider: ProviderId) => Promise<string>;
  promptBaseURL: (provider: ProviderId) => Promise<string | undefined>;
  promptModel: (provider: ProviderId) => Promise<string | undefined>;
  runSmoke: (provider: ProviderId) => Promise<void>;
}

// Lazy import of @inquirer/prompts — keeps `--help`/`--version`/`ping` startup
// fast (no chalk/grapheme-splitter transitive deps loaded unless the wizard runs).
async function prompts() {
  return await import("@inquirer/prompts");
}

const defaultDeps: ConfigDeps = {
  promptProvider: async () => {
    const { select } = await prompts();
    return select<ProviderId>({
      message: "Choose your LLM provider:",
      choices: listProviders().map((id) => ({
        name: PROVIDER_REGISTRY[id].label,
        value: id,
      })),
    });
  },
  promptApiKey: async (provider) => {
    const { password } = await prompts();
    return password({
      message: `Enter API key for ${PROVIDER_REGISTRY[provider].label}:`,
      mask: "*",
    });
  },
  promptBaseURL: async (provider) => {
    const { input } = await prompts();
    const meta = PROVIDER_REGISTRY[provider];
    const envName = meta.baseUrlEnv ?? "(unset)";
    return input({
      message: `Enter base URL (env: ${envName}, e.g. https://api.example.com/v1):`,
      default: process.env[envName],
    });
  },
  promptModel: async (provider) => {
    const { input } = await prompts();
    return input({
      message: `Enter model id (default: ${PROVIDER_REGISTRY[provider].defaultModel || "none — required"}):`,
      default: PROVIDER_REGISTRY[provider].defaultModel,
    });
  },
  runSmoke: async (provider) => {
    const r = await runPing({ provider });
    console.log(formatPing(r));
  },
};

/**
 * Interactive config wizard entry point. Reads `.env`, runs the prompts,
 * writes the result back, then runs a smoke test.
 *
 * @param envPath    Absolute path to .env. Default: <cwd>/.env.
 * @param deps       Overridable prompt + smoke hooks (used by tests).
 */
export async function runConfigWizard(
  envPath: string = resolvePath(process.cwd(), ".env"),
  deps: ConfigDeps = defaultDeps,
): Promise<void> {
  const provider = await deps.promptProvider();
  const meta = PROVIDER_REGISTRY[provider];

  const apiKey = await deps.promptApiKey(provider);
  if (!apiKey || apiKey.length < 10) {
    exitUserError(`API key for ${provider} looks too short (got ${apiKey?.length ?? 0} chars).`);
  }

  let baseURL: string | undefined;
  if (meta.requiresBaseURL) {
    const answer = await deps.promptBaseURL(provider);
    if (!answer) exitUserError(`Base URL is required for provider "${provider}".`);
    baseURL = answer;
  }

  const modelAnswer = await deps.promptModel(provider);
  const model = modelAnswer?.trim() || meta.defaultModel;

  // Merge into existing .env so unrelated keys (PATH, etc.) survive.
  const existing = await readEnvFile(envPath);
  const updates = {
    [meta.apiKeyEnv]: apiKey,
    ...(meta.modelEnv ? { [meta.modelEnv]: model } : {}),
    ...(meta.baseUrlEnv && baseURL ? { [meta.baseUrlEnv]: baseURL } : {}),
  };
  await writeEnvFile(envPath, mergeEnv(existing, updates));
  console.log(`[config] wrote ${envPath}`);

  // Smoke test using freshly written config (re-read is unnecessary since
  // dotenv is not re-run; the wizard's spawn child will re-load on next run).
  console.log("[config] running smoke test with new credentials...");
  // Reload env in this process so the smoke picks up new creds without a restart.
  process.env[meta.apiKeyEnv] = apiKey;
  if (meta.modelEnv) process.env[meta.modelEnv] = model;
  if (meta.baseUrlEnv && baseURL) process.env[meta.baseUrlEnv] = baseURL;
  await deps.runSmoke(provider);
}
