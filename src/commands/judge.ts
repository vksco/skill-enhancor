/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file commands/judge
 * @description `skillenhance judge` — standalone CLI for rubric scoring.
 *   Reads a SKILL.md + cases.json, runs the judge, prints composite + per-axis.
 *   Used for ad-hoc rubric scores during development; the iteration loop
 *   (Phase 4) calls `runJudge` directly without going through this command.
 * @see SPEC.md §"CLI grammar"
 */

import { resolve as resolvePath } from "node:path";
import { readCases } from "../eval/cases-io.js";
import { describeAggregate } from "../eval/rubric.js";
import { runJudge } from "../eval/judge.js";
import { readFile } from "node:fs/promises";

export interface JudgeCliOpts {
  skillPath: string;
  casesPath: string;
  provider?: string;
  modelId?: string;
}

/**
 * Run the judge CLI flow. Returns the aggregate so callers can format it.
 *
 * @param opts CLI flags.
 */
export async function runJudgeCli(opts: JudgeCliOpts) {
  const skillAbs = resolvePath(opts.skillPath);
  const casesAbs = resolvePath(opts.casesPath);

  const skillText = await readFile(skillAbs, "utf8");
  const casesFile = await readCases(casesAbs);

  const { aggregate } = await runJudge(skillText, casesFile.queries, {
    provider: opts.provider as never,
    modelId: opts.modelId,
  });

  return { skillAbs, casesAbs, aggregate, casesFile };
}

/** Human-readable one-liner formatter for `skillenhance judge` output. */
export function formatJudgeOutput(result: Awaited<ReturnType<typeof runJudgeCli>>): string {
  return (
    `[judge] skill=${result.skillAbs}\n` +
    `[judge] cases=${result.casesAbs} (${result.casesFile.queries.length})\n` +
    `[judge] ${describeAggregate(result.aggregate)}`
  );
}
