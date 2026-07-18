/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file rubric
 * @description Rubric math: weighted composite, per-axis aggregation,
 *   should-keep decision, mastery gate, CLI one-liner formatter. All
 *   derived from the dimension registry — adding a dimension there updates
 *   every calc here without code changes.
 * @see src/eval/dimensions.ts (source of truth), SPEC.md §"Locked Decisions Q2"
 */

import { ALL_DIMENSIONS, DIMENSION_IDS, defaultWeights, type DimensionId } from "./dimensions.js";
import type { AxisScore, ScoreAggregate } from "./types.js";

/** Default keep-epsilon: composite must improve by this much to be accepted. */
export const DEFAULT_KEEP_EPSILON = 0.1;

/** Default per-axis drop guard: any single axis drop larger than this rejects the iter. */
export const DEFAULT_AXIS_GUARD = 0.5;

/** Default mastery composite threshold. */
export const DEFAULT_MASTERY_COMPOSITE = 9.5;

/** Default mastery per-axis floor: every axis must hit this to count as mastered. */
export const DEFAULT_MASTERY_AXIS_FLOOR = 9.0;

/** Re-exported for callers that don't want to import dimensions.ts directly. */
export const DEFAULT_WEIGHTS: AxisScore = defaultWeights() as AxisScore;

/**
 * Compute the weighted composite score from per-axis scores. Iterates the
 * dimension registry, so adding a dimension updates this automatically.
 *
 * @param axes    Per-axis scores (0–10).
 * @param weights Per-axis weights. Defaults to registry defaults.
 * @returns Composite in [0, 10].
 */
export function composite(
  axes: AxisScore,
  weights: AxisScore = DEFAULT_WEIGHTS,
): number {
  let sum = 0;
  for (const id of DIMENSION_IDS) sum += axes[id]! * weights[id]!;
  return sum;
}

/**
 * Aggregate per-case scores into a single per-axis average.
 *
 * @param scores  Array of per-case AxisScore objects.
 * @returns Per-axis average.
 */
export function aggregateScores(scores: AxisScore[]): AxisScore {
  if (scores.length === 0) {
    const out = {} as AxisScore;
    for (const id of DIMENSION_IDS) out[id] = 0;
    return out;
  }
  const totals = new Map<DimensionId, number>();
  for (const id of DIMENSION_IDS) totals.set(id, 0);
  for (const s of scores) {
    for (const id of DIMENSION_IDS) totals.set(id, (totals.get(id) ?? 0) + s[id]!);
  }
  const out = {} as AxisScore;
  for (const id of DIMENSION_IDS) out[id] = (totals.get(id) ?? 0) / scores.length;
  return out;
}

/**
 * Aggregate JudgeOutput into a flat ScoreAggregate.
 *
 * @param output       The judge's output.
 * @param casesSha256  Hex sha256 of cases.json at run start.
 * @param weights      Per-axis weights for composite.
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
 * Decide whether an iter's aggregate beats the previous. Composite must
 * beat previous + epsilon, AND no single axis may drop more than guard.
 *
 * @param next  Next iter's aggregate.
 * @param prev  Previous (best) iter's aggregate. Null on first iter (always accepted).
 * @param opts  Tunable thresholds.
 */
export function shouldKeep(
  next: ScoreAggregate,
  prev: ScoreAggregate | null,
  opts: { epsilon?: number; axisGuard?: number } = {},
): boolean {
  if (!prev) return true;
  const epsilon = opts.epsilon ?? DEFAULT_KEEP_EPSILON;
  if (next.composite <= prev.composite + epsilon) return false;
  for (const id of DIMENSION_IDS) {
    const drop = prev.axes[id]! - next.axes[id]!;
    if (drop > (opts.axisGuard ?? DEFAULT_AXIS_GUARD)) return false;
  }
  return true;
}

/**
 * Check whether an aggregate qualifies as "mastery" — composite above
 * threshold AND every axis above its floor.
 *
 * @param a    Aggregate to check.
 * @param opts Tunable thresholds.
 */
export function isMastery(
  a: ScoreAggregate,
  opts: { compositeThreshold?: number; axisFloor?: number } = {},
): boolean {
  const compositeThreshold = opts.compositeThreshold ?? DEFAULT_MASTERY_COMPOSITE;
  const axisFloor = opts.axisFloor ?? DEFAULT_MASTERY_AXIS_FLOOR;
  if (a.composite < compositeThreshold) return false;
  for (const id of DIMENSION_IDS) {
    if (a.axes[id]! < axisFloor) return false;
  }
  return true;
}

/**
 * One line summary of an aggregate. Uses registry shortLabels. Weights
 * are intentionally NOT shown — they belong in dimensions.ts (config),
 * not in every result line. Without that, two dimensions whose shortLabel
 * shares a first letter (robust vs reuse) would visually collide as
 * `wr=0.15 wr=0.10`.
 */
export function describeAggregate(
  a: ScoreAggregate,
  _weights?: AxisScore,
): string {
  const axisParts = ALL_DIMENSIONS.map(
    (d) => `${d.shortLabel}=${a.axes[d.id]!.toFixed(1)}`,
  ).join(" ");
  return (
    `composite=${a.composite.toFixed(2)} [${axisParts}] ` +
    `cases=${a.caseCount} sha=${a.casesSha256.slice(0, 8)}`
  );
}
