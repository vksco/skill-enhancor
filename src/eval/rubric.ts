/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file rubric
 * @description Rubric definition + composite / mastery / keep-or-discard math.
 *   All defaults live here so callers don't reinvent them.
 * @see SPEC.md §"Locked Decisions Q2", Q8.1, Q8.3
 */

import type { AxisId, AxisScore, ScoreAggregate } from "./types.js";
import { AXIS_IDS } from "./types.js";

/** Default weights for the 5 rubric axes. Sum to 1.0. */
export const DEFAULT_WEIGHTS: AxisScore = {
  correctness: 0.3,
  triggerFidelity: 0.2,
  outputQuality: 0.25,
  robustness: 0.15,
  reusability: 0.1,
};

/** Default keep-epsilon: composite must improve by this much to be accepted. */
export const DEFAULT_KEEP_EPSILON = 0.1;

/** Default per-axis drop guard: any single axis drop larger than this rejects the iter. */
export const DEFAULT_AXIS_GUARD = 0.5;

/** Default mastery composite threshold. */
export const DEFAULT_MASTERY_COMPOSITE = 9.5;

/** Default mastery per-axis floor: every axis must hit this to count as mastered. */
export const DEFAULT_MASTERY_AXIS_FLOOR = 9.0;

/**
 * Compute the weighted composite score from per-axis scores.
 *
 * @param axes  Per-axis scores (0–10).
 * @param w     Per-axis weights. Defaults to DEFAULT_WEIGHTS.
 * @returns Composite score in [0, 10].
 */
export function composite(axes: AxisScore, w: AxisScore = DEFAULT_WEIGHTS): number {
  let sum = 0;
  for (const id of AXIS_IDS) {
    sum += axes[id] * w[id];
  }
  return sum;
}

/**
 * Aggregate per-case scores into a single per-axis average + composite.
 *
 * @param scores  Array of per-case AxisScore objects.
 * @returns Per-axis average + composite.
 */
export function aggregateScores(scores: AxisScore[]): AxisScore {
  if (scores.length === 0) {
    return { correctness: 0, triggerFidelity: 0, outputQuality: 0, robustness: 0, reusability: 0 };
  }
  const totals: AxisScore = {
    correctness: 0,
    triggerFidelity: 0,
    outputQuality: 0,
    robustness: 0,
    reusability: 0,
  };
  for (const s of scores) {
    for (const id of AXIS_IDS) totals[id] += s[id];
  }
  const out: AxisScore = {
    correctness: 0,
    triggerFidelity: 0,
    outputQuality: 0,
    robustness: 0,
    reusability: 0,
  };
  for (const id of AXIS_IDS) out[id] = totals[id] / scores.length;
  return out;
}

/**
 * Aggregate JudgeOutput into a flat ScoreAggregate (per-axis avg + composite + cases sha).
 *
 * @param output           The judge's output.
 * @param casesSha256      Hex sha256 of cases.json at run start.
 * @param weights          Per-axis weights for composite.
 * @returns ScoreAggregate ready to be logged to runs.jsonl.
 */
export function buildAggregate(
  output: { evaluations: { scores: AxisScore }[] },
  casesSha256: string,
  weights: AxisScore = DEFAULT_WEIGHTS,
): ScoreAggregate {
  const axes = aggregateScores(output.evaluations.map((e) => e.scores));
  return {
    axes,
    composite: composite(axes, weights),
    caseCount: output.evaluations.length,
    casesSha256,
  };
}

/**
 * Decide whether an iter's composite is good enough to keep.
 * Composite must beat previous + epsilon, AND no single axis may drop more than guard.
 *
 * @param next   Next iter's aggregate.
 * @param prev   Previous (best) iter's aggregate. Null on first iter.
 * @param opts   Tunable thresholds.
 * @returns true if keep, false if reject.
 */
export function shouldKeep(
  next: ScoreAggregate,
  prev: ScoreAggregate | null,
  opts: { epsilon?: number; axisGuard?: number } = {},
): boolean {
  if (!prev) return true; // first iter always accepted
  const epsilon = opts.epsilon ?? DEFAULT_KEEP_EPSILON;
  if (next.composite <= prev.composite + epsilon) return false;
  // No axis may have dropped more than the guard.
  for (const id of AXIS_IDS) {
    const drop = prev.axes[id] - next.axes[id];
    if (drop > (opts.axisGuard ?? DEFAULT_AXIS_GUARD)) return false;
  }
  return true;
}

/**
 * Check whether an aggregate qualifies as "mastery" — composite above threshold AND
 * every axis above its floor.
 *
 * @param a    Aggregate to check.
 * @param opts Tunable thresholds.
 * @returns true if mastered.
 */
export function isMastery(
  a: ScoreAggregate,
  opts: { compositeThreshold?: number; axisFloor?: number } = {},
): boolean {
  const compositeThreshold = opts.compositeThreshold ?? DEFAULT_MASTERY_COMPOSITE;
  const axisFloor = opts.axisFloor ?? DEFAULT_MASTERY_AXIS_FLOOR;
  if (a.composite < compositeThreshold) return false;
  for (const id of AXIS_IDS) {
    if (a.axes[id] < axisFloor) return false;
  }
  return true;
}

/** Human-readable summary line for runs.jsonl / CLI display. */
export function describeAggregate(
  a: ScoreAggregate,
  weights: AxisScore = DEFAULT_WEIGHTS,
): string {
  const w = (id: AxisId): string => `w${id[0]}=${weights[id].toFixed(2)}`;
  return (
    `composite=${a.composite.toFixed(2)} ` +
    `[correctness=${a.axes.correctness.toFixed(1)} ` +
    `trigger=${a.axes.triggerFidelity.toFixed(1)} ` +
    `output=${a.axes.outputQuality.toFixed(1)} ` +
    `robust=${a.axes.robustness.toFixed(1)} ` +
    `reuse=${a.axes.reusability.toFixed(1)}] ` +
    `cases=${a.caseCount} ` +
    `sha=${a.casesSha256.slice(0, 8)}`
  );
}
