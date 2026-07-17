/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file registry
 * @description Single source of truth for provider metadata + SDK factory map
 *   + reasoning-strip patterns.
 *
 *   Adding a new provider = one new entry in `PROVIDER_REGISTRY` + one
 *   matching factory in `factories.ts` (inlined below). Everything else
 *   (env loader, --provider CLI flag, `config` wizard, `ping` smoke,
 *   output normalization) derives from here.
 *
 *   Why a per-provider reasoning pattern lives here: different vendors emit
 *   different thinking tags (`<think>...</think>`, `<reasoning>...</reasoning>`,
 *   `<thought>...</thought>`, etc.). The Vercel AI SDK already separates
 *   reasoning from text for Anthropic/OpenAI/Google-native adapters, but
 *   OpenAI-compat vendors (Minimax, etc.) leak thinking into `text`. Rather
 *   than one hard-coded regex per call-site, the registry is the data.
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
  /**
   * Regex matching the full `<tag>...</tag>` pair this provider emits to
   * wrap its reasoning chain, when such tags leak into `text` instead of
   * being returned separately by the SDK.
   *
   * `null` = SDK reliably separates reasoning from text (Anthropic, native
   * OpenAI, native Google). No stripping needed.
   *
   * Each non-null pattern must be non-greedy and include the closing tag.
   * The string returned by `stripThinking()` has this pattern removed and
   * the result trimmed.
   */
  thinkingTagPattern: RegExp | null;
  /**
   * Env var name for user-supplied regex override (custom OpenAI-compat
   * vendors). When set, `getReasoningPattern()` prefers the user's regex
   * over `thinkingTagPattern`. Invalid regex is ignored (fall back to
   * `thinkingTagPattern` or null).
   */
  reasoningTagEnv?: string;
}

/**
 * Built-in registry. Order in `order` array drives auto-detect priority
 * (most-specific first → custom, minimax, google, openai, anthropic).
 *
 * Adding a provider:
 *   1. Append entry to `order` and `PROVIDER_REGISTRY`.
 *   2. Add factory case in `makeModel`.
 *   3. Add env var to `.env.example`.
 *   4. Add unit test in `__tests__/registry.test.ts`.
 *   5. Add strip-thinking unit test if `thinkingTagPattern` is non-null.
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
    // User-defined. Override via CUSTOM_REASONING_TAG=<regex>.
    thinkingTagPattern: null,
    reasoningTagEnv: "CUSTOM_REASONING_TAG",
  },
  minimax: {
    label: "Minimax (OpenAI-compatible)",
    defaultModel: "MiniMax-M2.7",
    apiKeyEnv: "MINIMAX_API_KEY",
    modelEnv: "MINIMAX_MODEL",
    baseUrlEnv: "MINIMAX_BASE_URL",
    requiresBaseURL: true,
    // Minimax M2.7 leaks `<think>...</think>` chains into the text field.
    // Verified via probe on 2026-07-18 against api.minimax.io/v1.
    thinkingTagPattern: /<think>[\s\S]*?<\/think>/g,
  },
  google: {
    label: "Google Gemini",
    defaultModel: "gemini-2.5-pro",
    apiKeyEnv: "GOOGLE_API_KEY",
    modelEnv: "GOOGLE_MODEL",
    requiresBaseURL: false,
    // Gemini native adapter (when added in Phase 7) handles reasoning
    // separately via the SDK. No strip needed.
    thinkingTagPattern: null,
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-5",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    requiresBaseURL: false,
    // Native OpenAI adapter separates reasoning from text. o-series reasoning
    // comes back via `result.reasoning`, not in `text`. No strip needed.
    thinkingTagPattern: null,
  },
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-5",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    requiresBaseURL: false,
    // Anthropic adapter handles `thinking` budget natively. Returns reasoning
    // via `result.reasoning` separately. No strip needed.
    thinkingTagPattern: null,
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
      const compat = createOpenAICompatible({ name: id, baseURL, apiKey });
      return compat(modelId);
    }
  }
}

/**
 * Resolve the effective reasoning-strip pattern for a provider.
 *
 * Priority:
 *   1. If the provider has a `reasoningTagEnv` AND the user's regex parses,
 *      use the user's regex (lets users support new OpenAI-compat vendors
 *      without code changes).
 *   2. Else if the provider declares a built-in `thinkingTagPattern`, use it.
 *   3. Else `null` — the provider's SDK separates reasoning from text
 *      reliably, no strip needed.
 *
 * @param id      Provider ID.
 * @param env     Process env to consult for `reasoningTagEnv`. Defaults to `process.env`.
 * @returns Regex to use for stripping, or `null` if no stripping should happen.
 */
export function getReasoningPattern(
  id: ProviderId,
  env: NodeJS.ProcessEnv = process.env,
): RegExp | null {
  const meta = PROVIDER_REGISTRY[id];

  if (meta.reasoningTagEnv) {
    const userPattern = env[meta.reasoningTagEnv];
    if (userPattern) {
      try {
        return new RegExp(userPattern, "g");
      } catch {
        // Invalid regex from user — fall through to built-in or null.
        // Silently ignoring is debatable; explicit log would be better
        // but we don't want to spam on every call. Caller can decide.
      }
    }
  }

  return meta.thinkingTagPattern;
}

/**
 * Strip reasoning-tag wrappers from model output text. Per-provider pattern
 * is fetched via `getReasoningPattern()` so each call site stays identical.
 *
 * @param text     Model output (may include reasoning tags).
 * @param id       Provider ID; drives pattern selection.
 * @param env      Optional env override (for tests).
 * @returns Text with reasoning tags removed and result trimmed. If no
 *          pattern applies for the provider, returns `text` unchanged.
 */
export function stripThinking(
  text: string,
  id: ProviderId,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const pattern = getReasoningPattern(id, env);
  if (!pattern) return text;
  return text.replace(pattern, "").trim();
}

/** List provider ids in registry order (used by CLI, wizard, tests). */
export function listProviders(): readonly ProviderId[] {
  return PROVIDER_ORDER;
}
