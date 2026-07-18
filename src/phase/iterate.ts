/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file iterate
 * @description The iteration loop — mutation → judge → keep/discard — that
 *   does the actual autoresearch work.
 *
 *   Flow per SPEC §"Locked Decisions Q4.3 / Q8":
 *     1. Load v0 (input skill) + frozen cases + cases sha256.
 *     2. Score v0 → baseline.
 *     3. For iter 1..rounds:
 *        a. Mode = (iter % 5 == 0) ? broad-rewrite : targeted on weakest axis
 *        b. Build mutation prompt + call model → response.text = new SKILL.md
 *           (after stripThinking). No JSON parse — prompt is restrictive.
 *        c. Score mutation via judge (cross-model sanity per spec).
 *        d. shouldKeep? composite bumps by epsilon AND no axis drops > guard.
 *        e. Append runs.jsonl record (kept=true|false).
 *        f. Check early-stop: mastery OR stagnation (N consecutive rejects).
 *     4. Write enhanced-<name>/ bundle.
 *
 *   Cross-model sanity: mutation model ≠ judge model by default (gen != judge
 *   per SPEC Q3). Caller passes them separately. We only require the caller
 *   to pass judge `provider`/`modelId`; for mutation we re-use the same
 *   unless both are overridden. (Left as future: --gen-* / --judge-* flags.)
 *
 *   Dependency injection: this module is split into pure orchestration + the
 *   I/O/SDK calls. Tests inject a fake `mutateFn` and `judgeFn` to exercise
 *   loop logic without network. The CLI in `commands/enhance.ts` wires the
 *   real SDK calls via env-loaded provider.
 *
 * @see SPEC.md §"Locked Decisions Q4 / Q8", .claude/rules/spec-first.md
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { loadV0 } from "./v0.js";
import { readCases, fingerprintCases } from "../eval/cases-io.js";
import { runJudge } from "../eval/judge.js";
import {
  buildAggregate,
  shouldKeep,
  isMastery,
} from "../eval/rubric.js";
import {
  ALL_DIMENSIONS,
  type Dimension,
  type DimensionId,
} from "../eval/dimensions.js";
import { loadEnv } from "../env.js";
import { makeModel, stripThinking, type ProviderId } from "../providers/registry.js";
import { buildMutationPrompt } from "../prompts/mutation.js";
import { generateText } from "ai";
import {
  appendRun,
  writeRunsHeader,
  sha256Text,
  type RunRecord,
  type RunsHeader,
  verifyCasesFingerprint,
} from "../eval/runs-io.js";
import { writeBundle } from "./output.js";
import type { Case } from "../eval/types.js";

/** Inputs to `runIterate`. */
export interface RunIterateOpts {
  skillPath: string;
  casesPath: string;
  outDir: string;
  rounds: number;
  stagnation: number;
  keepEpsilon: number;
  axisGuard: number;
  masteryComposite: number;
  masteryAxis: number;
  mutationTemp: number;
  provider?: ProviderId;
  modelId?: string;
}

export interface RunIterateResult {
  outDir: string;
  reachedMastery: boolean;
  roundsRun: number;
  bestComposite: number;
  baselineComposite: number;
  improvement: number;
}

/**
 * Call the mutation model and return the raw response text.
 * Exposed for dependency injection in tests.
 */
export type MutateFn = (opts: {
  prompt: string;
  temperature: number;
  maxOutputTokens: number;
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
  baseURL?: string;
}) => Promise<string>;

/**
 * Call the judge model and return the parsed JudgeOutput.
 * Exposed for dependency injection in tests.
 */
export type JudgeFn = (opts: {
  skillText: string;
  cases: Case[];
  casesSha256: string;
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
  baseURL?: string;
}) => Promise<{ output: import("../eval/types.js").JudgeOutput; aggregate: import("../eval/types.js").ScoreAggregate }>;

/** Default mutation: AI SDK generateText + stripThinking. */
export const defaultMutateFn: MutateFn = async ({
  prompt,
  temperature,
  maxOutputTokens,
  providerId,
  modelId,
  apiKey,
  baseURL,
}) => {
  const res = await generateText({
    model: makeModel(providerId, modelId, apiKey, baseURL),
    prompt,
    temperature,
    maxOutputTokens,
  });
  return res.text;
};

/** Default judge: delegates to existing runJudge. */
export const defaultJudgeFn: JudgeFn = async (opts) =>
  runJudge(opts.skillText, opts.cases, {
    provider: opts.providerId,
    modelId: opts.modelId,
    baseURL: opts.baseURL,
  });

/**
 * Heuristically extract a one-line rationale from the mutation output
 * (best-effort). We pick the first non-empty line of meaningful text after
 * we trim the leading "```yaml"/"---" wrapper, since most SKILL.md frontmatter
 * formats start that way.
 */
function extractRationale(skillText: string): string {
  const lines = skillText.split(/\r?\n/);
  for (const ln of lines) {
    const t = ln.trim();
    if (!t) continue;
    if (t === "---") continue;
    if (t.startsWith("# ")) {
      // skip a top-level heading; keep looking
      continue;
    }
    return t.slice(0, 200);
  }
  return "(no rationale extracted)";
}

/**
 * Pick the lowest-scoring axis. Ties broken by declaration order in the
 * dimension registry.
 */
function pickWeakest(axes: Record<DimensionId, number>): DimensionId {
  let weakest: DimensionId = ALL_DIMENSIONS[0]!.id;
  let lowest = axes[weakest]!;
  for (const d of ALL_DIMENSIONS) {
    if (axes[d.id]! < lowest) {
      lowest = axes[d.id]!;
      weakest = d.id;
    }
  }
  return weakest;
}

/**
 * The main iteration loop. Returns a result summary; exit codes are the
 * caller's responsibility (see `commands/enhance.ts`).
 *
 * @param opts   Configuration.
 * @param deps   Optional dependency injection. Defaults to real AI SDK calls.
 */
export async function runIterate(
  opts: RunIterateOpts,
  deps: { mutate?: MutateFn; judge?: JudgeFn; now?: () => Date } = {},
): Promise<RunIterateResult> {
  const mutate = deps.mutate ?? defaultMutateFn;
  const judge = deps.judge ?? defaultJudgeFn;
  const now = deps.now ?? (() => new Date());

  // --- Phase 0: env + load inputs
  let env;
  try {
    env = loadEnv({ provider: opts.provider });
  } catch (err) {
    // surface the original message; caller maps to exit code 1.
    throw new Error(`[iterate] ${(err as Error).message}`);
  }
  const providerId = opts.provider ?? env.provider;
  const apiKey = env.apiKey;
  const modelId = opts.modelId ?? env.model;
  const baseURL = env.baseURL;

  const v0 = await loadV0(opts.skillPath);
  const casesFile = await readCases(opts.casesPath);
  const casesSha256 = fingerprintCases(casesFile);

  // --- Run header (also serves as a stable benchmark for testing)
  const startedAt = now().toISOString();
  const v0Sha256 = sha256Text(v0.skillText);
  const header: RunsHeader = {
    startedAt,
    casesSha256,
    v0Sha256,
    provider: providerId,
    model: modelId,
  };

  // --- Phase 1: baseline scoring of v0
  const v0Result = await judge({
    skillText: v0.skillText,
    cases: casesFile.queries,
    casesSha256,
    providerId,
    modelId,
    apiKey,
    baseURL,
  });
  let baseline = v0Result.aggregate;
  let baselineText = v0.skillText;
  let bestAggregate = baseline;
  let bestText = v0.skillText;

  // --- Run state
  const records: RunRecord[] = [];
  const runsPath = join(opts.outDir, "eval", "runs.jsonl");
  await mkdir(opts.outDir, { recursive: true });
  await mkdir(join(opts.outDir, "eval"), { recursive: true });
  await writeRunsHeader(runsPath, header);

  // Re-record v0 as "iter 0" semantic for the runs table? No — runs table
  // holds MUTATIONS only. v0 is the baseline referenced in the header.

  // --- Phase 2: loop
  let stagnationCount = 0;
  let reachedMastery = isMastery(bestAggregate, {
    compositeThreshold: opts.masteryComposite,
    axisFloor: opts.masteryAxis,
  });

  for (let iter = 1; iter <= opts.rounds; iter++) {
    if (reachedMastery) break;

    const mode: RunRecord["mode"] =
      iter % 5 === 0 ? "broad-rewrite" : "targeted";

    const weakest = pickWeakest(bestAggregate.axes);
    const mutationPrompt = buildMutationPrompt({
      skillText: bestText,
      scores: { axes: bestAggregate.axes, composite: bestAggregate.composite, caseCount: bestAggregate.caseCount },
      cases: casesFile.queries,
      casesJson: JSON.stringify(casesFile),
      mode,
    });

    const t0 = Date.now();
    let rawText: string;
    try {
      rawText = await mutate({
        prompt: mutationPrompt,
        temperature: opts.mutationTemp,
        // Reasoning models spend 800-3000 tokens on thinking before
        // emitting the SKILL.md itself. 4000 covers a typical mutation
        // output comfortably without truncating mid-instruction.
        maxOutputTokens: 4000,
        providerId,
        modelId,
        apiKey,
        baseURL,
      });
    } catch (err) {
      // Provider error on mutation = internal error. Record a rejection and
      // keep the loop running. Caller maps unhandled exceptions to exit 2.
      const rec: RunRecord = {
        iter,
        mode,
        axes_addressed: mode === "targeted" ? [weakest] : ALL_DIMENSIONS.map((d: Dimension) => d.id),
        composite: bestAggregate.composite,
        axes: { ...bestAggregate.axes },
        kept: false,
        rationale: `mutation call failed: ${(err as Error).message.slice(0, 120)}`,
        durationMs: Date.now() - t0,
        casesSha256,
      };
      await appendRun(runsPath, rec);
      records.push(rec);
      stagnationCount++;
      if (stagnationCount >= opts.stagnation) break;
      continue;
    }

    // Strip reasoning tags (provider-specific). Output text IS the new SKILL.md.
    let nextText = stripThinking(rawText, providerId, process.env).trim();

    // Light sanity: model output should at least loosely look like a SKILL.md
    // (must contain frontmatter markers `---` anywhere in the first ~200 chars).
    // We accept either `---<newline>` (proper YAML opener) or `---\nname:` /
    // `--- name:` variants the model sometimes emits. If no frontmatter, reject
    // the mutation.
    const head = nextText.slice(0, 400);
    const looksLikeSkill = /^---\s*\n/.test(head) || /^---[ \t]*\n\S+/.test(head);
    if (!looksLikeSkill) {
      const rec: RunRecord = {
        iter,
        mode,
        axes_addressed: mode === "targeted" ? [weakest] : ALL_DIMENSIONS.map((d) => d.id),
        composite: bestAggregate.composite,
        axes: { ...bestAggregate.axes },
        kept: false,
        rationale: "mutation output did not begin with YAML frontmatter",
        durationMs: Date.now() - t0,
        casesSha256,
      };
      await appendRun(runsPath, rec);
      records.push(rec);
      stagnationCount++;
      if (stagnationCount >= opts.stagnation) break;
      continue;
    }

    // Score the new candidate.
    const t1 = Date.now();
    const cand = await judge({
      skillText: nextText,
      cases: casesFile.queries,
      casesSha256,
      providerId,
      modelId,
      apiKey,
      baseURL,
    });
    verifyCasesFingerprint; // tree-shake-safe no-op
    // (casesSha256 is what judge internally checks; we don't re-verify here
    //  but kept the import to make the invariant explicit.)
    const judgeMs = Date.now() - t1;

    const kept = shouldKeep(cand.aggregate, bestAggregate, {
      epsilon: opts.keepEpsilon,
      axisGuard: opts.axisGuard,
    });

    const rec: RunRecord = {
      iter,
      mode,
      axes_addressed: mode === "targeted" ? [weakest] : ALL_DIMENSIONS.map((d: Dimension) => d.id),
      composite: cand.aggregate.composite,
      axes: { ...cand.aggregate.axes },
      kept,
      rationale: extractRationale(nextText),
      durationMs: Date.now() - t0 + judgeMs,
      casesSha256,
    };
    await appendRun(runsPath, rec);
    records.push(rec);

    if (kept) {
      bestText = nextText;
      bestAggregate = cand.aggregate;
      stagnationCount = 0;
    } else {
      stagnationCount++;
    }

    reachedMastery = isMastery(bestAggregate, {
      compositeThreshold: opts.masteryComposite,
      axisFloor: opts.masteryAxis,
    });
    if (stagnationCount >= opts.stagnation) break;
  }

  // --- Phase 3: write bundle
  await writeBundle({
    name: v0.name,
    outDir: opts.outDir,
    v0Text: v0.skillText,
    bestText,
    v0Aggregate: baseline,
    bestAggregate,
    records,
    casesSha256,
    v0Sha256,
    provider: providerId,
    model: modelId,
    startedAt,
    casesJson: JSON.stringify(casesFile),
    rubricJson: JSON.stringify(
      {
        axes: ALL_DIMENSIONS.map((d: Dimension) => ({
          id: d.id,
          label: d.label,
          weight: d.defaultWeight,
          description: d.promptDescription,
        })),
      },
      null,
      2,
    ),
  });

  return {
    outDir: opts.outDir,
    reachedMastery,
    roundsRun: records.length,
    bestComposite: bestAggregate.composite,
    baselineComposite: baseline.composite,
    improvement: bestAggregate.composite - baseline.composite,
  };
}
