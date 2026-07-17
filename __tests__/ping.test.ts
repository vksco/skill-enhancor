/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file ping.test
 * @description Tests for src/commands/ping.ts — verifies the smoke command
 *   constructs the correct model factory + calls generateText with the right
 *   shape. The real LLM call is mocked so the test stays offline (per project
 *   rule "no network in tests").
 * @see CLAUDE.md §"No network in tests"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI SDK before importing the module under test, per testing.md §"Mocking".
vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({
    text: "pong.",
    usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
  })),
}));

vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => ({ id: "mock-model" })) }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => ({ id: "mock-model" })) }));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => () => ({ id: "mock-model" })),
}));

import { generateText } from "ai";
import { runPing, formatPing } from "../src/commands/ping.js";

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const k of [
    "ANTHROPIC_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_BASE_URL",
    "MINIMAX_MODEL",
    "CUSTOM_API_KEY",
    "CUSTOM_BASE_URL",
    "CUSTOM_MODEL",
  ]) {
    delete process.env[k];
  }
});

describe("runPing (mocked AI SDK)", () => {
  it("auto-detects provider, calls generateText, returns timing + tokens", async () => {
    process.env.MINIMAX_API_KEY = "sk-fake-minimax-key-1234567890";
    process.env.MINIMAX_BASE_URL = "https://api.minimax.io/v1";

    const r = await runPing();
    expect(r.provider).toBe("minimax");
    expect(r.text).toBe("pong.");
    expect(r.inputTokens).toBe(5);
    expect(r.outputTokens).toBe(3);
    expect(r.totalTokens).toBe(8);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("explicit --provider override beats auto-detect", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-1234567890";
    process.env.MINIMAX_API_KEY = "sk-fake-minimax-key-1234567890";
    process.env.MINIMAX_BASE_URL = "https://api.minimax.io/v1";

    const r = await runPing({ provider: "anthropic" });
    expect(r.provider).toBe("anthropic");
  });

  it("fails loud with no provider configured", async () => {
    // No env keys set → loadEnv throws → runPing exits with 1.
    // Vitest's process.exit can't intercept without mocking, so we re-throw
    // and assert on the thrown shape instead.
    await expect(runPing()).rejects.toBeDefined();
  });
});

describe("formatPing", () => {
  it("formats result with provider, model, base (if any), elapsed, tokens, text", () => {
    const out = formatPing({
      provider: "minimax",
      model: "MiniMax-M2.7",
      baseURL: "https://api.minimax.io/v1",
      elapsedMs: 123,
      text: "pong.",
      inputTokens: 5,
      outputTokens: 3,
      totalTokens: 8,
    });
    expect(out).toContain("provider=minimax");
    expect(out).toContain("model=MiniMax-M2.7");
    expect(out).toContain("base=https://api.minimax.io/v1");
    expect(out).toContain("123ms");
    expect(out).toContain("tokens in=5 out=3 total=8");
    expect(out).toContain("pong.");
  });

  it("omits base URL for non-OpenAI-compat providers", () => {
    const out = formatPing({
      provider: "anthropic",
      model: "claude-sonnet-5",
      elapsedMs: 200,
      text: "ok",
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    });
    expect(out).not.toContain("base=");
    expect(out).toContain("provider=anthropic");
  });
});
