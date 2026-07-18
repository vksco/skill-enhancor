/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file commands-judge.test
 * @description Direct unit tests for src/commands/judge.ts + src/eval/judge.ts.
 *   AI SDK is mocked so these tests stay offline (per CLAUDE.md §"No network").
 *   Complements e2e tests in __tests__/e2e/cli-ping-judge.test.ts which
 *   only exercise the failure paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({
    text: JSON.stringify({
      evaluations: [
        {
          case_id: "c1",
          did_trigger: true,
          scores: {
            correctness: 9,
            triggerFidelity: 10,
            outputQuality: 8,
            robustness: 9,
            reusability: 8,
          },
          rationale: "well-scored",
        },
      ],
    }),
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  })),
}));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => ({ id: "mock-model" })) }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => ({ id: "mock-model" })) }));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => () => ({ id: "mock-model" })),
}));

import { runJudgeCli, formatJudgeOutput } from "../src/commands/judge.js";
import { resolve as resolvePath } from "node:path";

beforeEach(() => {
  vi.unstubAllEnvs();
  // Spy on process.exit so test runs survive if runJudge error-path calls it.
  vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
    return undefined as never;
  }) as never);
  process.env.MINIMAX_API_KEY = "sk-fake-minimax-key-1234567890";
  process.env.MINIMAX_BASE_URL = "https://api.minimax.io/v1";
});

afterEach(() => {
  vi.restoreAllMocks();
});

const REPO_ROOT = resolvePath(__dirname, "..");
const SKILL = resolvePath(REPO_ROOT, "__tests__/fixtures/sample-skill.md");
const CASES = resolvePath(REPO_ROOT, "__tests__/fixtures/cases.json");

describe("runJudgeCli (direct)", () => {
  it("reads skill + cases files, returns aggregate", async () => {
    const result = await runJudgeCli({ skillPath: SKILL, casesPath: CASES });
    expect(result.skillAbs).toBe(SKILL);
    expect(result.casesAbs).toBe(CASES);
    expect(result.casesFile.queries.length).toBeGreaterThan(0);
    expect(result.aggregate.caseCount).toBe(1);
    expect(result.aggregate.composite).toBeGreaterThan(0);
    expect(result.aggregate.casesSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("passes --provider override to env.ts", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-fake-key-1234567890";
    delete process.env.MINIMAX_API_KEY; // ensure anthropic wins on auto-detect
    const result = await runJudgeCli({ skillPath: SKILL, casesPath: CASES, provider: "anthropic" });
    expect(result.aggregate.caseCount).toBe(1);
  });
});

describe("formatJudgeOutput", () => {
  // Pure formatter test — construct a fake result, no SDK calls, no env.
  it("includes skill path, cases path, case count, composite", () => {
    const fakeResult = {
      skillAbs: "/path/to/skill.md",
      casesAbs: "/path/to/cases.json",
      aggregate: {
        axes: {
          correctness: 9,
          triggerFidelity: 10,
          outputQuality: 8,
          robustness: 9,
          reusability: 8,
        },
        composite: 8.7,
        caseCount: 5,
        casesSha256: "abcdef0123456789",
      },
      casesFile: {
        queries: [
          { id: "a", input: "x", should_trigger: true },
          { id: "b", input: "y", should_trigger: false },
          { id: "c", input: "z", should_trigger: true },
          { id: "d", input: "w", should_trigger: false },
          { id: "e", input: "v", should_trigger: true },
        ],
      },
    };
    const out = formatJudgeOutput(fakeResult);
    expect(out).toContain("[judge]");
    expect(out).toContain("/path/to/skill.md");
    expect(out).toContain("/path/to/cases.json");
    expect(out).toContain("(5)");
    expect(out).toMatch(/composite=8\.70/);
  });
});
