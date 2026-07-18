/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file rubric.test
 * @description Tests for src/eval/rubric.ts — weights, composite, aggregator,
 *   shouldKeep (composite + axis guard), isMastery, describeAggregate.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_AXIS_GUARD,
  DEFAULT_KEEP_EPSILON,
  DEFAULT_MASTERY_AXIS_FLOOR,
  DEFAULT_MASTERY_COMPOSITE,
  DEFAULT_WEIGHTS,
  aggregateScores,
  buildAggregate,
  composite,
  describeAggregate,
  isMastery,
  shouldKeep,
} from "../src/eval/rubric.js";
import type { AxisScore, JudgeOutput, ScoreAggregate } from "../src/eval/types.js";

const allZeros: AxisScore = {
  correctness: 0,
  triggerFidelity: 0,
  outputQuality: 0,
  robustness: 0,
  reusability: 0,
};

const allTens: AxisScore = {
  correctness: 10,
  triggerFidelity: 10,
  outputQuality: 10,
  robustness: 10,
  reusability: 10,
};

describe("defaults", () => {
  it("DEFAULT_WEIGHTS sum to 1.0", () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("exports sensible keep / guard / mastery defaults", () => {
    expect(DEFAULT_KEEP_EPSILON).toBe(0.1);
    expect(DEFAULT_AXIS_GUARD).toBe(0.5);
    expect(DEFAULT_MASTERY_COMPOSITE).toBe(9.5);
    expect(DEFAULT_MASTERY_AXIS_FLOOR).toBe(9.0);
  });
});

describe("composite()", () => {
  it("returns 0 for all-zero axes", () => {
    expect(composite(allZeros)).toBe(0);
  });
  it("returns 10 for all-10 axes", () => {
    expect(composite(allTens)).toBeCloseTo(10, 6);
  });
  it("respects custom weights", () => {
    // If correctness dominates (1.0) and others are 0.0, only correctness score matters.
    const custom = { correctness: 1.0, triggerFidelity: 0, outputQuality: 0, robustness: 0, reusability: 0 };
    expect(composite({ ...allZeros, correctness: 7 }, custom)).toBeCloseTo(7, 6);
  });
});

describe("aggregateScores()", () => {
  it("returns all zeros for empty input", () => {
    expect(aggregateScores([])).toEqual(allZeros);
  });
  it("averages per-axis scores across cases", () => {
    const a: AxisScore = { ...allZeros, correctness: 6 };
    const b: AxisScore = { ...allZeros, correctness: 8 };
    expect(aggregateScores([a, b]).correctness).toBe(7);
  });
});

describe("buildAggregate()", () => {
  it("combines per-case scores with cases sha", () => {
    const output: JudgeOutput = {
      evaluations: [{ case_id: "c1", did_trigger: true, scores: { ...allZeros, correctness: 8 }, rationale: "ok" }],
    };
    const agg = buildAggregate(output, "deadbeef");
    expect(agg.axes.correctness).toBe(8);
    expect(agg.composite).toBeGreaterThan(0);
    expect(agg.caseCount).toBe(1);
    expect(agg.casesSha256).toBe("deadbeef");
  });
});

describe("shouldKeep()", () => {
  const baseline: ScoreAggregate = {
    axes: { ...allZeros, correctness: 7, triggerFidelity: 6, outputQuality: 5, robustness: 4, reusability: 3 },
    composite: composite({ ...allZeros, correctness: 7, triggerFidelity: 6, outputQuality: 5, robustness: 4, reusability: 3 }),
    caseCount: 5,
    casesSha256: "abc",
  };

  it("always returns true on first iter (no prev)", () => {
    expect(shouldKeep(baseline, null)).toBe(true);
  });
  it("rejects when composite doesn't beat baseline + epsilon", () => {
    const same: ScoreAggregate = { ...baseline, composite: baseline.composite + 0.05 };
    expect(shouldKeep(same, baseline)).toBe(false);
  });
  it("accepts when composite clears baseline + epsilon AND no axis drops below guard", () => {
    const improved: ScoreAggregate = {
      axes: { ...baseline.axes, correctness: 8, outputQuality: 6 },
      composite: composite({ ...baseline.axes, correctness: 8, outputQuality: 6 }),
      caseCount: 5,
      casesSha256: "abc",
    };
    expect(shouldKeep(improved, baseline)).toBe(true);
  });
  it("rejects when any axis drops more than guard", () => {
    const regressed: ScoreAggregate = {
      axes: { ...baseline.axes, correctness: 8, robustness: baseline.axes.robustness - 1.0 }, // drop > guard
      composite: composite({ ...baseline.axes, correctness: 8, robustness: baseline.axes.robustness - 1.0 }),
      caseCount: 5,
      casesSha256: "abc",
    };
    expect(shouldKeep(regressed, baseline)).toBe(false);
  });
});

describe("isMastery()", () => {
  const notMastered: ScoreAggregate = {
    axes: { ...allTens, reusability: 8 }, // one axis below floor
    composite: 9.8,
    caseCount: 5,
    casesSha256: "x",
  };
  const mastered: ScoreAggregate = {
    axes: { ...allTens, reusability: 9.0 }, // exactly at floor
    composite: 9.5,
    caseCount: 5,
    casesSha256: "x",
  };

  it("rejects when composite below threshold", () => {
    expect(isMastery({ ...mastered, composite: 9.0 })).toBe(false);
  });
  it("rejects when any axis below floor", () => {
    expect(isMastery(notMastered)).toBe(false);
  });
  it("accepts when composite ≥ threshold AND every axis ≥ floor", () => {
    expect(isMastery(mastered)).toBe(true);
  });
});

describe("describeAggregate()", () => {
  it("includes all 5 axis scores + composite + case count + short sha", () => {
    const out = describeAggregate({
      axes: allTens,
      composite: 10,
      caseCount: 7,
      casesSha256: "abcdef1234567890",
    });
    expect(out).toContain("composite=10.00");
    expect(out).toContain("correctness=10.0");
    expect(out).toContain("trigger=10.0");
    expect(out).toContain("output=10.0");
    expect(out).toContain("robust=10.0");
    expect(out).toContain("reuse=10.0");
    expect(out).toContain("cases=7");
    expect(out).toContain("sha=abcdef12");
    // Weights are NOT shown (config, not result).
    expect(out).not.toContain("wc=");
    expect(out).not.toContain("wt=");
  });
});
