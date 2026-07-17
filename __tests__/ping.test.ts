/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file ping.test
 * @description Tests for src/commands/ping.ts — verifies the smoke command
 *   constructs the correct model factory + calls generateText with the right
 *   shape + strips reasoning tags. AI SDK is mocked so the test stays offline.
 * @see CLAUDE.md §"No network in tests"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const tOpen = "<" + "think" + ">";
const tClose = "<" + "/think" + ">";

vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({
    text: "ok",
    usage: {
      inputTokens: 5,
      outputTokenDetails: { textTokens: 3, reasoningTokens: 0 },
      outputTokens: 3,
      totalTokens: 8,
    },
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
    "CUSTOM_REASONING_TAG",
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
    expect(r.text).toBe("ok"); // mock returns clean "ok"; strip is a no-op
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
    // No env keys set → loadEnv throws → runPing exits via cli-errors.
    // Vitest can't easily intercept process.exit, so we assert on rejection.
    await expect(runPing()).rejects.toBeDefined();
  });

  it("strips Minimax thinker tags from response text (when mock returns them)", async () => {
    // Override mock to return text containing reasoning tag.
    (generateText as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: tOpen + "thinking chain" + tClose + "\n\npong.",
      usage: {
        inputTokens: 5,
        outputTokenDetails: { textTokens: 10, reasoningTokens: 40 },
        outputTokens: 50,
        totalTokens: 55,
      },
    });
    process.env.MINIMAX_API_KEY = "sk-fake-minimax-key-1234567890";
    process.env.MINIMAX_BASE_URL = "https://api.minimax.io/v1";

    const r = await runPing();
    expect(r.text).toBe("pong.");
    expect(r.reasoningTokens).toBe(40);
  });
});

describe("formatPing", () => {
  it("shows reasoning token count when > 0", () => {
    const out = formatPing({
      provider: "minimax",
      model: "MiniMax-M2.7",
      baseURL: "https://api.minimax.io/v1",
      elapsedMs: 100,
      text: "pong.",
      inputTokens: 5,
      outputTokens: 10,
      reasoningTokens: 40,
      totalTokens: 55,
    });
    expect(out).toContain("reasoning=40");
    expect(out).toContain("tokens in=5 out=10");
    expect(out).toContain("pong.");
  });

  it("omits reasoning token display when 0 (no need to surface the field)", () => {
    const out = formatPing({
      provider: "anthropic",
      model: "claude-sonnet-5",
      elapsedMs: 200,
      text: "ok",
      inputTokens: 1,
      outputTokens: 1,
      reasoningTokens: 0,
      totalTokens: 2,
    });
    expect(out).not.toContain("reasoning=");
    expect(out).not.toContain("base=");
    expect(out).toContain("provider=anthropic");
  });
});
