/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file judge.test
 * @description Tests for src/eval/judge.ts — runJudge wires SDK + prompt +
 *   Zod schema + aggregate. AI SDK is mocked so tests stay offline.
 * @see CLAUDE.md §"No network in tests"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted() makes the mock factory closure work cleanly. Variables
// referenced inside vi.mock() must be declared with this so vitest's
// transformer sees them before hoisting the mock call to the top of the file.
// We mock the raw LLM text — judge.ts does its own JSON parse + Zod validate.
const mockGenerateText = vi.hoisted(() =>
  vi.fn(async () => ({
    text: JSON.stringify({
      evaluations: [
        {
          case_id: "trigger-1",
          did_trigger: true,
          scores: {
            correctness: 8,
            triggerFidelity: 9,
            outputQuality: 7,
            robustness: 6,
            reusability: 5,
          },
          rationale: "well-formed skill that triggers appropriately",
        },
        {
          case_id: "anti-1",
          did_trigger: false,
          scores: {
            correctness: 8,
            triggerFidelity: 9,
            outputQuality: 7,
            robustness: 6,
            reusability: 5,
          },
          rationale: "correctly stays silent on refactor request",
        },
      ],
    }),
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  })),
);

vi.mock("ai", () => ({
  generateText: mockGenerateText,
  generateObject: vi.fn(), // unused by judge.ts; here for completeness
}));

vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => ({ id: "mock-model" })) }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => ({ id: "mock-model" })) }));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => () => ({ id: "mock-model" })),
}));

import { runJudge } from "../src/eval/judge.js";

beforeEach(() => {
  vi.unstubAllEnvs();
  mockGenerateText.mockClear();
  for (const k of [
    "ANTHROPIC_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_BASE_URL",
    "MINIMAX_MODEL",
  ]) {
    delete process.env[k];
  }
});

describe("runJudge (mocked AI SDK)", () => {
  it("returns parsed output + aggregate with cases sha256", async () => {
    process.env.MINIMAX_API_KEY = "sk-fake-minimax-key-1234567890";
    process.env.MINIMAX_BASE_URL = "https://api.minimax.io/v1";

    const cases = [
      { id: "trigger-1", input: "summarize", should_trigger: true },
      { id: "anti-1", input: "refactor", should_trigger: false },
    ];

    const { output, aggregate } = await runJudge("# test skill\n\nbody", cases);

    expect(output.evaluations).toHaveLength(2);
    expect(aggregate.caseCount).toBe(2);
    expect(aggregate.casesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("passes the full skill text + cases JSON into the prompt", async () => {
    process.env.MINIMAX_API_KEY = "sk-fake-minimax-key-1234567890";
    process.env.MINIMAX_BASE_URL = "https://api.minimax.io/v1";

    await runJudge(
      "UNIQUE_SKILL_BODY",
      [{ id: "q1", input: "trigger phrase", should_trigger: true }],
    );

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const call = mockGenerateText.mock.calls[0][0];
    expect(call.prompt).toContain("UNIQUE_SKILL_BODY");
    expect(call.prompt).toContain("trigger phrase");
    expect(call.temperature).toBe(0);
  });

  it("respects explicit provider override (no error)", async () => {
    process.env.MINIMAX_API_KEY = "sk-fake-minimax-key-1234567890";
    process.env.MINIMAX_BASE_URL = "https://api.minimax.io/v1";
    process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-1234567890";

    await runJudge("# skill", [{ id: "q1", input: "x", should_trigger: true }], {
      provider: "anthropic",
    });
    // Provider override wiring lives in env.ts tests; here we just confirm
    // the explicit override doesn't break the run.
    expect(mockGenerateText).toHaveBeenCalled();
  });
});
