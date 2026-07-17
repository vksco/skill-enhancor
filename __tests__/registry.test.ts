/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file registry.test
 * @description Tests for src/providers/registry.ts — provider metadata +
 *   factory wiring. Pure logic only; no SDK calls, no network.
 * @see SPEC.md §"Architecture → Provider registry"
 */

import { describe, it, expect } from "vitest";
import {
  PROVIDER_REGISTRY,
  PROVIDER_ORDER,
  listProviders,
  makeModel,
  type ProviderId,
} from "../src/providers/registry.js";

describe("provider registry", () => {
  it("declares all 5 built-in providers in PROVIDER_ORDER", () => {
    expect(PROVIDER_ORDER).toEqual(["custom", "minimax", "google", "openai", "anthropic"]);
  });

  it("listProviders returns the registry order", () => {
    expect(listProviders()).toEqual(PROVIDER_ORDER);
  });

  it("every registered provider has the required metadata fields", () => {
    for (const id of PROVIDER_ORDER) {
      const meta = PROVIDER_REGISTRY[id];
      expect(meta.label).toBeTruthy();
      expect(meta.apiKeyEnv).toMatch(/^[A-Z_]+$/);
      expect(meta.modelEnv).toMatch(/^[A-Z_]+$/);
      expect(typeof meta.requiresBaseURL).toBe("boolean");
    }
  });

  it("minimax and custom require a base URL", () => {
    expect(PROVIDER_REGISTRY.minimax.requiresBaseURL).toBe(true);
    expect(PROVIDER_REGISTRY.custom.requiresBaseURL).toBe(true);
    expect(PROVIDER_REGISTRY.minimax.baseUrlEnv).toBe("MINIMAX_BASE_URL");
    expect(PROVIDER_REGISTRY.custom.baseUrlEnv).toBe("CUSTOM_BASE_URL");
  });

  it("anthropic, openai, google do NOT require a base URL", () => {
    expect(PROVIDER_REGISTRY.anthropic.requiresBaseURL).toBe(false);
    expect(PROVIDER_REGISTRY.openai.requiresBaseURL).toBe(false);
    expect(PROVIDER_REGISTRY.google.requiresBaseURL).toBe(false);
  });

  it("makeModel throws for OpenAI-compat providers without baseURL", () => {
    expect(() => makeModel("minimax", "MiniMax-M2.7", "sk-fake-key-1234567890")).toThrow(
      /baseURL/,
    );
    expect(() => makeModel("custom", "any-model", "sk-fake-key-1234567890")).toThrow(/baseURL/);
  });

  it("makeModel returns a LanguageModel for OpenAI-compat when baseURL set", () => {
    const m = makeModel(
      "minimax",
      "MiniMax-M2.7",
      "sk-fake-key-1234567890",
      "https://api.minimax.io/v1",
    );
    // AI SDK returns a model object; not a string. Just verify it's not null/undefined
    // and that it has some provider-specific interface (provider metadata).
    expect(m).toBeDefined();
  });
});
