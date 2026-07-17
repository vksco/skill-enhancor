/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file env.test
 * @description Tests for src/env.ts — defaults, override, missing required key, validation.
 * @see CLAUDE.md §"Fact-check rule" (these tests verify real env behavior, not assumptions)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadEnv, listProviders } from "../src/env.js";

describe("env loader", () => {
  beforeEach(() => {
    // Reset every relevant env var between tests so order doesn't leak state.
    vi.unstubAllEnvs();
    for (const k of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_API_KEY",
      "MINIMAX_API_KEY",
      "CUSTOM_API_KEY",
      "ANTHROPIC_MODEL",
      "OPENAI_MODEL",
      "GOOGLE_MODEL",
      "MINIMAX_MODEL",
      "CUSTOM_MODEL",
      "MINIMAX_BASE_URL",
      "CUSTOM_BASE_URL",
      "SPIKE_MODEL",
    ]) {
      delete process.env[k];
    }
  });

  it("returns the default Anthropic model when ANTHROPIC_MODEL unset", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";
    const env = loadEnv({ provider: "anthropic" });
    expect(env.provider).toBe("anthropic");
    expect(env.model).toBe("claude-sonnet-5");
    expect(env.spikeModel).toBe("claude-haiku-4-5-20251001");
  });

  it("reads ANTHROPIC_MODEL override when set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
    const env = loadEnv({ provider: "anthropic" });
    expect(env.model).toBe("claude-haiku-4-5-20251001");
  });

  it("fails loud with actionable message when ANTHROPIC_API_KEY missing", () => {
    expect(() => loadEnv({ provider: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("fails loud when ANTHROPIC_API_KEY is too short", () => {
    process.env.ANTHROPIC_API_KEY = "short";
    expect(() => loadEnv({ provider: "anthropic" })).toThrow(/invalid ANTHROPIC_API_KEY/);
  });

  it("requires MINIMAX_BASE_URL for the minimax provider", () => {
    process.env.MINIMAX_API_KEY = "minimax-test-key-1234567890";
    process.env.MINIMAX_MODEL = "MiniMax-M3"; // explicit, not relying on default
    expect(() => loadEnv({ provider: "minimax" })).toThrow(/MINIMAX_BASE_URL/);
  });

  it("requires CUSTOM_BASE_URL for the custom provider", () => {
    process.env.CUSTOM_API_KEY = "custom-test-key-1234567890";
    process.env.CUSTOM_MODEL = "my-custom-model"; // explicit, satisfies model check first
    expect(() => loadEnv({ provider: "custom" })).toThrow(/CUSTOM_BASE_URL/);
  });

  it("rejects unknown provider at validation layer", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";
    expect(() => loadEnv({ provider: "totally-fake-provider" })).toThrow();
  });

  it("lists all five built-in providers", () => {
    const ids = listProviders();
    expect(ids).toEqual(["anthropic", "openai", "google", "minimax", "custom"]);
  });

  it("reads SPIKE_MODEL when set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";
    process.env.SPIKE_MODEL = "claude-sonnet-5";
    const env = loadEnv({ provider: "anthropic" });
    expect(env.spikeModel).toBe("claude-sonnet-5");
  });
});

describe("auto-detect (no explicit --provider)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    for (const k of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_API_KEY",
      "MINIMAX_API_KEY",
      "CUSTOM_API_KEY",
      "MINIMAX_BASE_URL",
      "CUSTOM_BASE_URL",
    ]) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws 'No LLM provider configured' when zero keys are set", () => {
    expect(() => loadEnv()).toThrow(/No LLM provider configured/);
  });

  it("detects anthropic when only ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";
    expect(loadEnv().provider).toBe("anthropic");
  });

  it("detects openai when only OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-openai-test-key-1234567890";
    expect(loadEnv().provider).toBe("openai");
  });

  it("detects minimax when MINIMAX_API_KEY + BASE_URL are set", () => {
    process.env.MINIMAX_API_KEY = "minimax-test-key-1234567890";
    process.env.MINIMAX_BASE_URL = "https://api.minimax.com/v1";
    expect(loadEnv().provider).toBe("minimax");
  });

  it("throws 'Multiple providers configured' when ≥2 keys are set without --provider", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";
    process.env.OPENAI_API_KEY = "sk-openai-test-key-1234567890";
    expect(() => loadEnv()).toThrow(/Multiple providers configured/);
  });

  it("explicit --provider beats ambiguity", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-1234567890";
    process.env.OPENAI_API_KEY = "sk-openai-test-key-1234567890";
    expect(loadEnv({ provider: "anthropic" }).provider).toBe("anthropic");
  });
});
