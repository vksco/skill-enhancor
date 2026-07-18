/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file dimensions
 * @description Single source of truth for the rubric axes that every
 *   evaluation layer consumes. Adding / renaming / reordering a dimension
 *   is a single-file edit here. All downstream layers (types, Zod schema,
 *   weights, prompts, CLI) derive from `ALL_DIMENSIONS`.
 *
 *   Why a registry and not a hardcoded tuple: see spec-first design at
 *   SPEC.md §"Locked Decisions Q2 / Registry-derived axes". Per project
 *   rule .claude/rules/dry.md: refactor on the third occurrence.
 * @see SPEC.md §"Locked Decisions Q2"
 */

/** Static metadata for one rubric axis. All fields required. */
export interface Dimension {
  /** Machine id. Matches the field name in AxisScore + Zod schema. */
  id: string;
  /** Human-readable label for CLI display. */
  label: string;
  /** Short key used in compact CLI formatter (e.g. "correctness=9.6"). */
  shortLabel: string;
  /** Default weight in [0, 1]. Sum across all dimensions must equal 1.0. */
  defaultWeight: number;
  /** Semantic definition injected into the judge prompt for this axis. */
  promptDescription: string;
}

/**
 * Built-in dimensions. To add a new dimension, append a new entry here —
 * every downstream layer (types, Zod, weights, prompts, CLI formatter)
 * will adapt automatically. Weights MUST sum to 1.0 (asserted by tests).
 *
 *   Rename a dimension: edit just the `id` field. TS type, Zod schema, and
 *   judge prompt all reflect the new name. Test fixtures and persisted
 *   cases.json files referencing the old name will need migration.
 */
export const ALL_DIMENSIONS: readonly Dimension[] = [
  {
    id: "correctness",
    label: "Correctness",
    shortLabel: "correctness",
    defaultWeight: 0.3,
    promptDescription:
      "Instructions produce factually and procedurally right behaviour. " +
      "No false claims, no deprecated APIs. Following the skill does not lead " +
      "the agent into wrong conclusions.",
  },
  {
    id: "triggerFidelity",
    label: "Trigger Fidelity",
    shortLabel: "trigger",
    defaultWeight: 0.2,
    promptDescription:
      "Skill fires on the right queries and stays quiet on wrong ones. " +
      "For each case, score 10 if did_trigger matches should_trigger; lower " +
      "if mismatched in a confusing way.",
  },
  {
    id: "outputQuality",
    label: "Output Quality",
    shortLabel: "output",
    defaultWeight: 0.25,
    promptDescription:
      "Following the skill leads to genuinely good agent behaviour — " +
      "concise, well-targeted, appropriate level of detail for the query.",
  },
  {
    id: "robustness",
    label: "Robustness",
    shortLabel: "robust",
    defaultWeight: 0.15,
    promptDescription:
      "Skill survives edge cases (missing context, ambiguous input, " +
      "partial info). Does not require perfect, well-formatted input.",
  },
  {
    id: "reusability",
    label: "Reusability",
    shortLabel: "reuse",
    defaultWeight: 0.1,
    promptDescription:
      "Skill composes with other skills, does not hide hardcoded paths " +
      "or vendor-specific assumptions.",
  },
];

/** Union of dimension ids derived from the registry. */
export type DimensionId = (typeof ALL_DIMENSIONS)[number]["id"];

/** All ids in declaration order. Use instead of `Object.keys(ALL_DIMENSIONS)`. */
export const DIMENSION_IDS: readonly DimensionId[] = ALL_DIMENSIONS.map((d) => d.id);

/** Lookup map: id → Dimension. Recomputed from registry on import (no duplication). */
export const DIMENSION_BY_ID: Readonly<Record<DimensionId, Dimension>> = Object.fromEntries(
  ALL_DIMENSIONS.map((d) => [d.id, d]),
) as Readonly<Record<DimensionId, Dimension>>;

/** Default per-axis weights as a Record. Defaults to registry defaults if not overridden. */
export function defaultWeights(): Record<DimensionId, number> {
  const out = {} as Record<DimensionId, number>;
  for (const d of ALL_DIMENSIONS) out[d.id] = d.defaultWeight;
  return out;
}

/** Default per-axis score record (all zeros). Useful for baseline aggregates. */
export function emptyScore(): Record<DimensionId, number> {
  const out = {} as Record<DimensionId, number>;
  for (const d of ALL_DIMENSIONS) out[d.id] = 0;
  return out;
}
