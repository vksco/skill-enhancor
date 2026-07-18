/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file runs-io
 * @description Append-only NDJSON writer for `runs.jsonl` (per-iter history).
 *   Project rule #1: cases.json sha256 is frozen at first iter and verified
 *   at every iter — mid-loop case-regeneration is a hard bug.
 * @see SPEC.md §"Open Risks → consistency rule #1 (frozen cases hash)"
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import type { AxisScore } from "./types.js";

/** Single iteration record appended to runs.jsonl. */
export interface RunRecord {
  /** Iteration number, 1-based. */
  iter: number;
  /** "targeted" (driven by weakest axis) or "broad-rewrite" (every 5th iter). */
  mode: "targeted" | "broad-rewrite";
  /** Comma-separated axes this mutation tried to address (targeted mode only). */
  axes_addressed: string[];
  /** Score aggregate for the mutation. */
  composite: number;
  /** Per-axis scores for the mutation. */
  axes: AxisScore;
  /** Whether this iter was accepted as the new best (vs. discarded). */
  kept: boolean;
  /** Optional 1-sentence rationale extracted from the mutation output. */
  rationale?: string;
  /** Wall-clock duration of this iteration in ms. */
  durationMs: number;
  /** Token usage from the mutation call. */
  inputTokens?: number;
  outputTokens?: number;
  /** sha256 of cases.json at this iter (for drift verification). */
  casesSha256: string;
}

/** File header written once before NDJSON entries begin. */
export interface RunsHeader {
  /** ISO timestamp of when this run started. */
  startedAt: string;
  /** sha256 of cases.json frozen at run start. */
  casesSha256: string;
  /** sha256 of the input skill at run start. */
  v0Sha256: string;
  /** Provider used for mutations. */
  provider: string;
  /** Model id used for mutations. */
  model: string;
}

/** Ensure parent directory of `runsPath` exists. */
async function ensureParent(runsPath: string): Promise<void> {
  const dir = resolvePath(runsPath, "..");
  await mkdir(dir, { recursive: true });
}

/**
 * Compute sha256 of arbitrary text.
 *
 * @param text The string content to hash.
 * @returns 64-char hex digest.
 */
export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Append a single run record to `runs.jsonl`. Creates the parent dir if
 * missing. First call also writes a JSON header line (object with `__header: true`).
 *
 * @param runsPath Absolute path to runs.jsonl.
 * @param record   The iteration record to persist.
 */
export async function appendRun(runsPath: string, record: RunRecord): Promise<void> {
  await ensureParent(runsPath);
  await appendFile(runsPath, JSON.stringify(record) + "\n", "utf8");
}

/**
 * Write the runs.jsonl header. Overwrites any existing file. Should be
 * called once at run start.
 *
 * @param runsPath Absolute path to runs.jsonl.
 * @param header   Header metadata.
 */
export async function writeRunsHeader(
  runsPath: string,
  header: RunsHeader,
): Promise<void> {
  await ensureParent(runsPath);
  await writeFile(runsPath, JSON.stringify({ __header: true, ...header }) + "\n", "utf8");
}

/**
 * Read all records from runs.jsonl. Header line is discarded.
 *
 * @param runsPath Absolute path to runs.jsonl.
 * @returns Array of records (header excluded) in iteration order.
 */
export async function readRuns(runsPath: string): Promise<RunRecord[]> {
  let raw = "";
  try {
    raw = await readFile(runsPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: RunRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('{"__header":true')) continue;
    out.push(JSON.parse(trimmed) as RunRecord);
  }
  return out;
}

/**
 * Verify that a run record's casesSha256 matches the expected (frozen)
 * cases fingerprint. Throws if drift detected — that's a hard bug.
 *
 * @param record           Run record to verify.
 * @param expectedCasesSha256 The cases.json sha256 frozen at run start.
 */
export function verifyCasesFingerprint(
  record: RunRecord,
  expectedCasesSha256: string,
): void {
  if (record.casesSha256 !== expectedCasesSha256) {
    throw new Error(
      `[runs-io] CASES-DRIFT detected at iter ${record.iter}: ` +
        `expected ${expectedCasesSha256.slice(0, 12)}… got ${record.casesSha256.slice(0, 12)}…. ` +
        `cases.json was modified mid-run; run cannot continue safely.`,
    );
  }
}
