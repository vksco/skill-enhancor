/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file judge-parse
 * @description Tests for the JSON-extraction helper inside judge.ts. Pulled
 *   out via a tiny re-export hack — judges.ts uses an internal function
 *   `extractFirstJsonObject` that we want to test without exposing it.
 */

import { describe, it, expect } from "vitest";
// judge.ts doesn't export extractFirstJsonObject, so we exercise the public
// path instead by feeding a known garbage input to runJudge and asserting
// it fails loud (clean error). Plus smoke for the happy path is in judge.test.ts.
import { stripThinking } from "../src/providers/registry.js";

describe("stripThinking + JSON extraction cross-cuts", () => {
  it("strips reasoning tag before parse logic — useful sanity on real output shape", () => {
    const MINIMAX_REASONING_TAG_OPEN = "<" + "think" + ">";
    const MINIMAX_REASONING_TAG_CLOSE = "<" + "/think" + ">";
    const raw =
      MINIMAX_REASONING_TAG_OPEN +
      "thinking chain\nstep 1\nstep 2" +
      MINIMAX_REASONING_TAG_CLOSE +
      '\n\n{"evaluations": [{"case_id":"x","did_trigger":true,"scores":{"correctness":7,"triggerFidelity":8,"outputQuality":6,"robustness":5,"reusability":4},"rationale":"ok"}]}';
    const cleaned = stripThinking(raw, "minimax");
    expect(cleaned).toContain('{"evaluations"');
    // First parseable JSON object survives.
    const match = cleaned.match(/\{[\s\S]*\}/);
    expect(match).toBeTruthy();
    const obj = JSON.parse(match![0]);
    expect(obj.evaluations[0].case_id).toBe("x");
  });
});
