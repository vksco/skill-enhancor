/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file registry
 * @description Single source of truth for provider metadata + SDK factory map.
 *   Adding a new provider = one new entry in `PROVIDER_REGISTRY` + one
 *   matching factory in `factories.ts`. Everything else (env loader,
 *   --provider CLI flag, `config` wizard, `ping` smoke) derives from here.
 * @see SPEC.md §"Architecture → Provider registry", §"Locked Decisions Q7.2"
 */

import type { LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Provider ID strings (kept as union for type-safe lookups elsewhere). */
export type ProviderId = "anthropic" | "openai" | "google" | "minimax" | "custom";

/** Per-provider config as the user sets it via env or `skillenhance config`. */
export interface ProviderMeta {
  /** Human-readable label shown in `skillenhance config` wizard. */
  label: string;
  /** Default model id. Override per-run via `<PROVIDER>_MODEL` env. */
  defaultModel: string;
  /** Env var name holding the API key. */
  apiKeyEnv: string;
  /** Env var name holding the model override. */
  modelEnv: string;
  /** Env var name holding the OpenAI-compat base URL (only when requiresBaseURL=true). */
  baseUrlEnv?: string;
  /** Whether this provider is OpenAI-compatible and needs a base URL. */
  requiresBaseURL: boolean;
  /** Env var name to skip this provider from auto-detect (advanced). */
  disabled?: boolean;
}

/**
 * Built-in registry. Order in `order` array drives auto-detect priority
 * (most-specific first → custom, minimax, google, openai, anthropic).
 *
 * Adding a provider:
 *   1. Append entry to `order` and `PROVIDER_REGISTRY`.
 *   2. Add factory case in `factories.ts`.
 *   3. Add env var to `.env.example`.
 *   4. Add unit test in `__tests__/registry.test.ts`.
 */
export const PROVIDER_ORDER: readonly ProviderId[] = [
  "custom",
  "minimax",
  "google",
  "openai",
  "anthropic",
];

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderMeta> = {
  custom: {
    label: "Custom OpenAI-compatible endpoint",
    defaultModel: "",
    apiKeyEnv: "CUSTOM_API_KEY",
    modelEnv: "CUSTOM_MODEL",
    baseUrlEnv: "CUSTOM_BASE_URL",
    requiresBaseURL: true,
  },
  minimax: {
    label: "Minimax (OpenAI-compatible)",
    defaultModel: "MiniMax-M2.7",
    apiKeyEnv: "MINIMAX_API_KEY",
    modelEnv: "MINIMAX_MODEL",
    baseUrlEnv: "MINIMAX_BASE_URL",
    requiresBaseURL: true,
  },
  google: {
    label: "Google Gemini",
    defaultModel: "gemini-2.5-pro",
    apiKeyEnv: "GOOGLE_API_KEY",
    modelEnv: "GOOGLE_MODEL",
    requiresBaseURL: false,
    disabled: false,
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    requiresBaseURL: false,
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-5",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    requiresBaseURL: false,
  },
};

/**
 * Provider-agnostic model factory. Builds the right AI SDK LanguageModel
 * instance for the given provider + credentials.
 *
 * @param id      Provider ID.
 * @param modelId Model ID (resolved/defaulted upstream).
 * @param apiKey  Real API key (NEVER a placeholder — the SDK sends it as Authorization header).
 * @param baseURL OpenAI-compat base URL. Required when provider has `requiresBaseURL=true`.
 * @returns LanguageModel ready to hand to `generateText` / `streamText`.
 * @throws if the provider is unknown or required baseURL is missing.
 */
export function makeModel(
  id: ProviderId,
  modelId: string,
  apiKey: string,
  baseURL?: string,
): LanguageModel {
  switch (id) {
    case "anthropic":
      return anthropic(modelId);
    case "openai":
      return openai(modelId);
    case "google":
      // Google adapter not installed in MVP — provider-parity tests in Phase 7.
      throw new Error(
        "[registry] provider 'google' not yet wired. Add @ai-sdk/google in Phase 7.",
      );
    case "minimax":
    case "custom": {
      if (!baseURL) {
        const env = PROVIDER_REGISTRY[id].baseUrlEnv ?? "(unset)";
        throw new Error(`[registry] provider '${id}' needs baseURL in $env:${env}.`);
      }
      // dotenv + env.ts already verified the key, but be defensive.
      const compat = createOpenAICompatible({ name: id, baseURL, apiKey });
      return compat(modelId);
    }
  }
}

/** List provider ids in registry order (used by CLI, wizard, tests). */
export function listProviders(): readonly ProviderId[] {
  return PROVIDER_ORDER;
}
