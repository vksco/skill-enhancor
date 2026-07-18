/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file commands/enhance
 * @description `skillenhance enhance` CLI command — runs the iteration loop.
 *   Per SPEC §"CLI grammar". Phase 4 of the build.
 *
 *   Inputs:
 *     --skill <path>     Path to the input SKILL.md (Phase 4 only)
 *     --cases <path>     Path to a frozen cases.json
 *     --out <dir>        Output bundle directory (default ./enhanced-<name>/)
 *     --rounds N         Max iterations (default 10)
 *     --stagnation N     Stop after N consecutive rejects (default 3)
 *     --keep-epsilon     Composite improvement threshold (default 0.1)
 *     --axis-guard       Max single-axis drop allowed (default 0.5)
 *     --mastery-composite   Composite for mastery (default 9.5)
 *     --mastery-axis     Per-axis floor for mastery (default 9.0)
 *     --mutation-temp    Temperature for mutation calls (default 0.3)
 *     --provider X       Provider override (otherwise auto-detected)
 *     --model Y          Model override for both mutation + judge
 * @see SPEC.md §"CLI grammar", §"Phase 4 deliverable"
 */

import { resolve as resolvePath } from "node:path";
import { runIterate, type RunIterateResult } from "../phase/iterate.js";
import { exitUserError, exitInternalError, exitVerificationFail } from "../cli-errors.js";

export interface EnhanceCliOpts {
  skill?: string;
  cases?: string;
  out?: string;
  rounds?: number;
  stagnation?: number;
  keepEpsilon?: number;
  axisGuard?: number;
  masteryComposite?: number;
  masteryAxis?: number;
  mutationTemp?: number;
  provider?: string;
  model?: string;
}

export const DEFAULT_OPTIONS = {
  rounds: 10,
  stagnation: 3,
  keepEpsilon: 0.1,
  axisGuard: 0.5,
  masteryComposite: 9.5,
  masteryAxis: 9.0,
  mutationTemp: 0.3,
};

/**
 * Run `skillenhance enhance`. Returns the result summary; throws on failure
 * (cli's main router translates to exit codes via the helpers).
 *
 * @param opts CLI flags + positional paths.
 */
export async function runEnhanceCli(opts: EnhanceCliOpts): Promise<RunIterateResult> {
  const skillPath = opts.skill;
  const casesPath = opts.cases;
  if (!skillPath) {
    exitUserError(
      "enhance: missing --skill. Usage: skillenhance enhance --skill <SKILL.md> --cases <cases.json>",
    );
  }
  if (!casesPath) {
    exitUserError(
      "enhance: missing --cases. Usage: skillenhance enhance --skill <SKILL.md> --cases <cases.json>",
    );
  }

  // Derive default out dir from input skill's stem.
  const skillAbs = resolvePath(skillPath);
  const baseName = skillAbs.split(/[\\/]/).pop() ?? "skill";
  const stem = baseName.replace(/\.md$/i, "");
  const outDir = opts.out ? resolvePath(opts.out) : resolvePath(`./enhanced-${stem || "skill"}`);

  try {
    const result = await runIterate({
      skillPath,
      casesPath,
      outDir,
      rounds: opts.rounds ?? DEFAULT_OPTIONS.rounds,
      stagnation: opts.stagnation ?? DEFAULT_OPTIONS.stagnation,
      keepEpsilon: opts.keepEpsilon ?? DEFAULT_OPTIONS.keepEpsilon,
      axisGuard: opts.axisGuard ?? DEFAULT_OPTIONS.axisGuard,
      masteryComposite: opts.masteryComposite ?? DEFAULT_OPTIONS.masteryComposite,
      masteryAxis: opts.masteryAxis ?? DEFAULT_OPTIONS.masteryAxis,
      mutationTemp: opts.mutationTemp ?? DEFAULT_OPTIONS.mutationTemp,
      provider: opts.provider as never,
      modelId: opts.model,
    });
    return result;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // Detect ENOENT via either the property (when layer doesn't wrap) or
    // the message text (when loadV0/cases-io wraps the original error).
    if (e.code === "ENOENT" || /ENOENT|file not found|no such file/i.test((err as Error).message ?? "")) {
      exitUserError(err, "Check skill + cases paths exist.");
    }
    exitInternalError(err);
  }
}

/**
 * Human-friendly one-liner for `skillenhance enhance` output.
 */
export function formatEnhanceResult(r: RunIterateResult): string {
  const sign = r.improvement >= 0 ? "+" : "";
  return (
    `[enhance] out=${r.outDir}\n` +
    `[enhance] baseline=${r.baselineComposite.toFixed(2)} → best=${r.bestComposite.toFixed(2)} (${sign}${r.improvement.toFixed(2)})\n` +
    `[enhance] rounds=${r.roundsRun} mastery=${r.reachedMastery ? "yes" : "no"}`
  );
}
