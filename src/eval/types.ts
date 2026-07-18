/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file types
 * @description Shared types for evaluation: rubric axes, scores, cases.
 *   Used by rubric.ts, judge.ts, cases-io.ts, and Phase 4 iteration loop.
 * @see SPEC.md §"Locked Decisions Q2 (rubric)", §"Architecture → eval"
 */

/** The five rubric axes the iteration loop optimizes. */
export const AXIS_IDS = [
  "correctness",
  "triggerFidelity",
  "outputQuality",
  "robustness",
  "reusability",
] as const;
export type AxisId = (typeof AXIS_IDS)[number];

/** Score for one axis, integer 0–10. */
export interface AxisScore {
  correctness: number;
  triggerFidelity: number;
  outputQuality: number;
  robustness: number;
  reusability: number;
}

/** A single test case the iteration loop evaluates the skill against. */
export interface Case {
  /** Stable id used in runs.jsonl + judge output. Required. */
  id: string;
  /** The user query / situation. */
  input: string;
  /** Whether this case SHOULD trigger the skill. */
  should_trigger: boolean;
  /** Optional expected behavior sketch the judge uses as ground truth. */
  expected?: string;
  /** Optional tag for filtering (e.g., "positive", "negative", "edge"). */
  kind?: string;
}

/** A loaded cases.json file shape. */
export interface CasesFile {
  /** The test cases. Required to be non-empty for a meaningful run. */
  queries: Case[];
  /** Optional schema version, currently unused but reserved. */
  schema_version?: string;
}

/** Single per-case evaluation from the judge. */
export interface CaseEvaluation {
  case_id: string;
  /** What the judge thinks would happen — true = skill would trigger on this case. */
  did_trigger: boolean;
  /** 0–10 scores across all 5 axes for this specific case. */
  scores: AxisScore;
  /** Short rationale (1–3 sentences). */
  rationale: string;
}

/** Judge output shape — aggregate of all per-case evals. */
export interface JudgeOutput {
  /** One entry per case in the input. Order matches input. */
  evaluations: CaseEvaluation[];
}

/** Aggregate scores: per-axis average + composite (weighted sum). */
export interface ScoreAggregate {
  /** Per-axis averages across cases (0–10). */
  axes: AxisScore;
  /** Weighted composite across axes (0–10). */
  composite: number;
  /** Number of cases evaluated. */
  caseCount: number;
  /** cases.json sha256 fingerprint at run start (per project rule #1). */
  casesSha256: string;
}
