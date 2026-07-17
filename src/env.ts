/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file env
 * @description Provider-agnostic env loader. Single read site per project rules.
 *   - Auto-loads `.env` at module load (skipped when NODE_ENV=test so tests
 *     keep full control of the env).
 *   - Detects the active provider from whichever `*_API_KEY` is present.
 *     Priority: custom > minimax > google > openai > anthropic (most specific
 *     sources first so a minimax user with leftover anthropic env does not
 *     silently route to anthropic).
 *   - Accepts an explicit `--provider` override to disambiguate when multiple
 *     keys are set.
 *   - Fails loud at module load with the exact missing var name when a
 *     required env is absent. Never asks the user for credentials.
 * @see SPEC.md §"Locked Decisions Q7.2 / Architecture → env"
 */

import { config as loadDotenv } from "dotenv";

// Auto-load `.env` once at module load so the CLI "just works" for users with
// creds in `.env`. Skipped during tests so vitest can fully control process.env.
// We never override pre-existing process.env values (dotenv defaults).
if (process.env.NODE_ENV !== "test") {
  loadDotenv({ quiet: true });
}

import { z } from "zod";

/** Provider IDs we ship as built-ins. "custom" = openai-compat with user baseURL. */
export type ProviderId = "anthropic" | "openai" | "google" | "minimax" | "custom";

export interface LoadedEnv {
  /** Resolved provider. Either auto-detected or explicit override. */
  provider: ProviderId;
  /** API key for the chosen provider. */
  apiKey: string;
  /** Model ID for the chosen provider; default per-provider; env-overridable. */
  model: string;
  /** Custom OpenAI-compat base URL. Required iff provider ∈ {minimax, custom}. */
  baseURL?: string;
  /** Spike-only model override. Never used by production commands. */
  spikeModel: string;
}

/** Default models per provider. Override via `ANTHROPIC_MODEL`, `OPENAI_MODEL`, etc. */
const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5",
  google: "gemini-2.5-pro",
  minimax: "MiniMax-M3",
  custom: "",
};

/** Env var names per provider — single source for adding new providers. */
const API_KEY_ENV: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  minimax: "MINIMAX_API_KEY",
  custom: "CUSTOM_API_KEY",
};

const MODEL_ENV: Record<ProviderId, string> = {
  anthropic: "ANTHROPIC_MODEL",
  openai: "OPENAI_MODEL",
  google: "GOOGLE_MODEL",
  minimax: "MINIMAX_MODEL",
  custom: "CUSTOM_MODEL",
};

/** Providers that need a baseURL (OpenAI-compat endpoints). */
const BASE_URL_REQUIRED: ReadonlySet<ProviderId> = new Set<ProviderId>(["minimax", "custom"]);

const BASE_URL_ENV: Partial<Record<ProviderId, string>> = {
  minimax: "MINIMAX_BASE_URL",
  custom: "CUSTOM_BASE_URL",
};

const PROVIDER_IDS: readonly ProviderId[] = ["anthropic", "openai", "google", "minimax", "custom"];

/** Zod schema for runtime validation of explicit --provider input. */
const providerSchema = z.enum(["anthropic", "openai", "google", "minimax", "custom"]);

/**
 * Auto-detect the provider by walking env keys in specificity order.
 * Returns the first provider whose `*_API_KEY` is present and ≥10 chars.
 *
 * @returns Detected provider, or `null` if zero providers configured.
 */
function detectProvider(): ProviderId | null {
  // Custom first (most specific — a user who configured custom likely did so on purpose).
  // Then minimax (OpenAI-compat, also specific). Then google/openai/anthropic.
  const order: ProviderId[] = ["custom", "minimax", "google", "openai", "anthropic"];
  for (const id of order) {
    const key = process.env[API_KEY_ENV[id]];
    if (key && key.length >= 10) return id;
  }
  return null;
}

/**
 * Load + validate environment for the chosen provider (or auto-detect one).
 *
 * @param opts.provider  Explicit provider ID. If omitted, env.ts auto-detects
 *                       from whichever `*_API_KEY` is present.
 * @returns Parsed env object with all fields resolved + defaulted.
 * @throws if: (a) zero providers configured and no --provider override,
 *         (b) explicit --provider doesn't match a known ID,
 *         (c) required env for the resolved provider is missing/short.
 */
export function loadEnv(opts: { provider?: string } = {}): LoadedEnv {
  let provider: ProviderId;
  let ambiguous = false;

  if (opts.provider) {
    provider = providerSchema.parse(opts.provider);
  } else {
    const detected = detectProvider();
    if (!detected) {
      throw new Error(
        "[env] No LLM provider configured. Set ONE of:\n" +
          "  ANTHROPIC_API_KEY (default)\n" +
          "  OPENAI_API_KEY\n" +
          "  GOOGLE_API_KEY\n" +
          "  MINIMAX_API_KEY + MINIMAX_BASE_URL + MINIMAX_MODEL\n" +
          "  CUSTOM_API_KEY + CUSTOM_BASE_URL + CUSTOM_MODEL\n" +
          "Or pass --provider <id> explicitly.",
      );
    }
    // If multiple keys are set, surface that — silently picking first is footgun.
    const setCount = PROVIDER_IDS.filter(
      (id) => (process.env[API_KEY_ENV[id]]?.length ?? 0) >= 10,
    ).length;
    if (setCount > 1) ambiguous = true;
    provider = detected;
  }

  if (ambiguous) {
    const set = PROVIDER_IDS.filter(
      (id) => (process.env[API_KEY_ENV[id]]?.length ?? 0) >= 10,
    );
    throw new Error(
      `[env] Multiple providers configured: ${set.join(", ")}. ` +
        `Pass --provider <id> explicitly to disambiguate.`,
    );
  }

  // Provider-specific resolution (this part is unchanged from v1 except baseURL is optional-table-driven).
  const apiKeyEnv = API_KEY_ENV[provider];
  const apiKey = process.env[apiKeyEnv] ?? "";
  if (!apiKey || apiKey.length < 10) {
    throw new Error(
      `[env] Missing or invalid ${apiKeyEnv}. ` +
        `Set it in .env or via PowerShell: $env:${apiKeyEnv} = "..."`,
    );
  }

  const modelEnv = MODEL_ENV[provider];
  const model = process.env[modelEnv]?.trim() || DEFAULT_MODELS[provider];
  if (!model) {
    throw new Error(`[env] No model for provider "${provider}". Set $env:${modelEnv} = "...".`);
  }

  let baseURL: string | undefined;
  if (BASE_URL_REQUIRED.has(provider)) {
    const urlEnv = BASE_URL_ENV[provider];
    if (!urlEnv) {
      // Unreachable in practice — BASE_URL_REQUIRED and BASE_URL_ENV are kept in sync.
      throw new Error(`[env] internal: missing baseURL env mapping for provider "${provider}".`);
    }
    baseURL = process.env[urlEnv]?.trim();
    if (!baseURL) {
      throw new Error(`[env] provider "${provider}" requires $env:${urlEnv}.`);
    }
  }

  const spikeModel = process.env.SPIKE_MODEL?.trim() || "claude-haiku-4-5-20251001";

  return { provider, apiKey, model, baseURL, spikeModel };
}

/** Public re-export so callers can list supported providers without re-typing the union. */
export function listProviders(): readonly ProviderId[] {
  return PROVIDER_IDS;
}
