/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file registry.test
 * @description Tests for src/providers/registry.ts — provider metadata +
 *   factory wiring + reasoning-strip logic. Pure logic only; no SDK calls,
 *   no network.
 * @see SPEC.md §"Architecture → Provider registry"
 */

import { describe, it, expect } from "vitest";
import {
  PROVIDER_REGISTRY,
  PROVIDER_ORDER,
  listProviders,
  makeModel,
  getReasoningPattern,
  stripThinking,
  type ProviderId,
} from "../src/providers/registry.js";

// Build the think tag pair via concatenation so the literal text isn't mangled
// by whatever HTML-ish pre-processing happens to the test source on write.
const tOpen = "<" + "think" + ">";
const tClose = "<" + "/think" + ">";

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
      expect(meta.thinkingTagPattern === null || meta.thinkingTagPattern instanceof RegExp).toBe(
        true,
      );
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
    expect(() => makeModel("minimax", "MiniMax-M2.7", "sk-fake-key-1234567890")).toThrow(/baseURL/);
    expect(() => makeModel("custom", "any-model", "sk-fake-key-1234567890")).toThrow(/baseURL/);
  });

  it("makeModel returns a LanguageModel for OpenAI-compat when baseURL set", () => {
    const m = makeModel(
      "minimax",
      "MiniMax-M2.7",
      "sk-fake-key-1234567890",
      "https://api.minimax.io/v1",
    );
    expect(m).toBeDefined();
  });
});

describe("thinkingTagPattern metadata", () => {
  it("anthropic, openai, google have null pattern (SDK handles natively)", () => {
    expect(PROVIDER_REGISTRY.anthropic.thinkingTagPattern).toBeNull();
    expect(PROVIDER_REGISTRY.openai.thinkingTagPattern).toBeNull();
    expect(PROVIDER_REGISTRY.google.thinkingTagPattern).toBeNull();
  });

  it("minimax declares the think tag pair as the strip pattern", () => {
    const p = PROVIDER_REGISTRY.minimax.thinkingTagPattern;
    expect(p).toBeInstanceOf(RegExp);
    expect(p!.test("before " + tOpen + "reasoning chain" + tClose + " after")).toBe(true);
    expect(p!.test("no think here")).toBe(false);
  });

  it("custom defaults to null but exposes reasoningTagEnv for override", () => {
    expect(PROVIDER_REGISTRY.custom.thinkingTagPattern).toBeNull();
    expect(PROVIDER_REGISTRY.custom.reasoningTagEnv).toBe("CUSTOM_REASONING_TAG");
  });
});

describe("stripThinking()", () => {
  it("removes Minimax think chain from text", () => {
    // Strip removes the full tag pair as a unit; surrounding text preserved.
    // Spaces from "before " (1 space) + " after" (1 space) → 2 spaces between.
    const raw = "before " + tOpen + "I need to reason" + tClose + " after";
    expect(stripThinking(raw, "minimax")).toBe("before  after");
  });

  it("removes multiline reasoning content", () => {
    // The tag pair (including newlines inside it) becomes empty string.
    const raw =
      "start\n\n" +
      tOpen +
      "user asked: think hard\nstep 1\nstep 2" +
      tClose +
      "\n\nfinal answer";
    expect(stripThinking(raw, "minimax")).toBe("start\n\n\n\nfinal answer");
  });

  it("removes multiple reasoning tags in one response", () => {
    const raw = "first" + tOpen + "a1" + tClose + "middle" + tOpen + "a2" + tClose + "end";
    expect(stripThinking(raw, "minimax")).toBe("firstmiddleend");
  });

  it("trims leading and trailing whitespace from the WHOLE remaining text", () => {
    const raw = "\n\n  " + tOpen + "reasoning" + tClose + "  \n\nfinal\n";
    // After strip: "  \n\nfinal\n" → trim → "  \n\nfinal" → trim again?
    // .trim() only strips whitespace from ends; the body "\n\nfinal" stays.
    expect(stripThinking(raw, "minimax")).toBe("\n\nfinal".trim());
    // Above is a single trim — internal blank lines preserved.
    expect(stripThinking(raw, "minimax")).toBe("\n\nfinal".replace(/^[\s\n]+/, "").replace(/[\s\n]+$/, ""));
  });

  it("returns text unchanged when provider has no pattern (anthropic/openai/google)", () => {
    const raw = " " + tOpen + "tags should NOT be removed for anthropic" + tClose + " ";
    for (const id of ["anthropic", "openai", "google"] as const) {
      expect(stripThinking(raw, id)).toBe(raw);
    }
  });

  it("returns text unchanged for custom provider with no env override", () => {
    const raw = " " + tOpen + "reasoning stays" + tClose + " ";
    expect(stripThinking(raw, "custom", {})).toBe(raw);
  });

  it("respects CUSTOM_REASONING_TAG env override for custom provider", () => {
    const env = { CUSTOM_REASONING_TAG: "<!-[\\s\\S]*?->" };
    const raw = "before " + "<" + "!--secret thinking-->" + "after";
    expect(stripThinking(raw, "custom", env)).toBe("before after");
  });

  it("falls back to built-in pattern when CUSTOM_REASONING_TAG is invalid regex", () => {
    const env = { MINIMAX_BASE_URL: "ignored", CUSTOM_REASONING_TAG: "[" };
    // Minimax has a built-in pattern; invalid env override doesn't break it.
    expect(getReasoningPattern("minimax", env)).toBe(
      PROVIDER_REGISTRY.minimax.thinkingTagPattern,
    );
  });

  it("non-greedy match — strips each adjacent tag pair independently", () => {
    // Two adjacent think tags. Each tag pair removed separately, leaving "a" + "d".
    const raw = "a" + tOpen + "b" + tClose + tOpen + "c" + tClose + "d";
    expect(stripThinking(raw, "minimax")).toBe("ad");
  });

  it("non-greedy — returns empty when only tag content present", () => {
    // Two adjacent think tags with no surrounding text.
    const raw = tOpen + "x" + tClose + tOpen + "y" + tClose;
    expect(stripThinking(raw, "minimax")).toBe("");
  });
});

describe("getReasoningPattern()", () => {
  it("returns built-in pattern when no env override is set", () => {
    expect(getReasoningPattern("minimax", {})).toBe(PROVIDER_REGISTRY.minimax.thinkingTagPattern);
  });

  it("returns null for providers without a built-in pattern and no env", () => {
    expect(getReasoningPattern("anthropic", {})).toBeNull();
    expect(getReasoningPattern("custom", {})).toBeNull();
  });

  it("prefers user env regex over built-in", () => {
    const env = { CUSTOM_REASONING_TAG: "<reason>[\\s\\S]*?</reason>" };
    const p = getReasoningPattern("custom", env);
    expect(p).toBeInstanceOf(RegExp);
    expect(p!.test("<reason>x</reason>")).toBe(true);
  });

  it("uses 'g' flag on user-provided regex (multiple matches)", () => {
    const env = { CUSTOM_REASONING_TAG: "<x>[\\s\\S]*?</x>" };
    const p = getReasoningPattern("custom", env)!;
    const raw = "<x>1</x> <x>2</x>";
    expect(raw.replace(p, "").trim()).toBe("");
  });

  it("falls back to built-in for minimax when user env regex is invalid", () => {
    const env = { MINIMAX_BASE_URL: "ignored", CUSTOM_REASONING_TAG: "[" };
    expect(getReasoningPattern("minimax", env)).toBe(
      PROVIDER_REGISTRY.minimax.thinkingTagPattern,
    );
  });
});

// Keep ProviderId referenced so the import is not flagged as unused under
// stricter linters; the type alias is the public contract.
const _id: ProviderId = "anthropic";
void _id;
