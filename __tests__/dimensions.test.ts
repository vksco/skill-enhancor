/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file dimensions.test
 * @description Tests for src/eval/dimensions.ts — registry integrity
 *   (every dim has required fields, weights sum to 1, ids unique) +
 *   the helpers (defaultWeights, emptyScore, DIMENSION_BY_ID lookup).
 * @see SPEC.md §"Locked Decisions Q2 / Registry-derived axes"
 */

import { describe, it, expect } from "vitest";
import {
  ALL_DIMENSIONS,
  DIMENSION_IDS,
  DIMENSION_BY_ID,
  defaultWeights,
  emptyScore,
  type Dimension,
} from "../src/eval/dimensions.js";

describe("dimension registry integrity", () => {
  it("has at least one dimension", () => {
    expect(ALL_DIMENSIONS.length).toBeGreaterThan(0);
  });

  it("every dimension has required fields (id, label, shortLabel, defaultWeight, promptDescription)", () => {
    for (const d of ALL_DIMENSIONS) {
      expect(typeof d.id).toBe("string");
      expect(d.id.length).toBeGreaterThan(0);
      expect(typeof d.label).toBe("string");
      expect(d.label.length).toBeGreaterThan(0);
      expect(typeof d.shortLabel).toBe("string");
      expect(d.shortLabel.length).toBeGreaterThan(0);
      expect(typeof d.defaultWeight).toBe("number");
      expect(d.defaultWeight).toBeGreaterThanOrEqual(0);
      expect(d.defaultWeight).toBeLessThanOrEqual(1);
      expect(typeof d.promptDescription).toBe("string");
      expect(d.promptDescription.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique", () => {
    const ids = ALL_DIMENSIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shortLabels are unique", () => {
    const shorts = ALL_DIMENSIONS.map((d) => d.shortLabel);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  it("defaultWeights sum to 1.0 (with small floating tolerance)", () => {
    const sum = ALL_DIMENSIONS.reduce((a, b) => a + b.defaultWeight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("DIMENSION_IDS preserves declaration order and matches ALL_DIMENSIONS ids", () => {
    expect(DIMENSION_IDS).toEqual(ALL_DIMENSIONS.map((d) => d.id));
  });

  it("DIMENSION_BY_ID lookup returns a Dimension for every id", () => {
    for (const id of DIMENSION_IDS) {
      const d: Dimension | undefined = DIMENSION_BY_ID[id];
      expect(d).toBeDefined();
      expect(d!.id).toBe(id);
    }
  });
});

describe("defaultWeights() helper", () => {
  it("returns one entry per dimension id", () => {
    const w = defaultWeights();
    for (const id of DIMENSION_IDS) expect(w[id]).toBeDefined();
  });

  it("values match the registry defaults", () => {
    const w = defaultWeights();
    for (const d of ALL_DIMENSIONS) {
      expect(w[d.id]).toBe(d.defaultWeight);
    }
  });
});

describe("emptyScore() helper", () => {
  it("returns all-zero scores for each dimension", () => {
    const e = emptyScore();
    for (const id of DIMENSION_IDS) expect(e[id]).toBe(0);
  });
});
