/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file runs-io.test
 * @description Tests for src/eval/runs-io.ts — appendRun, writeRunsHeader,
 *   readRuns round-trip + filter, sha256Text fingerprint, verifyCasesFingerprint.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRun,
  readRuns,
  sha256Text,
  verifyCasesFingerprint,
  writeRunsHeader,
  type RunRecord,
  type RunsHeader,
} from "../src/eval/runs-io.js";
import type { AxisScore } from "../src/eval/types.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "skill-enh-runs-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const zeroAxes: AxisScore = {
  correctness: 0,
  triggerFidelity: 0,
  outputQuality: 0,
  robustness: 0,
  reusability: 0,
};

const header: RunsHeader = {
  startedAt: "2026-07-18T00:00:00.000Z",
  casesSha256: "a".repeat(64),
  v0Sha256: "b".repeat(64),
  provider: "minimax",
  model: "MiniMax-M2.7",
};

function makeRecord(iter: number, kept: boolean): RunRecord {
  return {
    iter,
    mode: kept ? "targeted" : "broad-rewrite",
    axes_addressed: ["correctness"],
    composite: 5 + iter * 0.1,
    axes: { ...zeroAxes, correctness: 5 + iter },
    kept,
    durationMs: 100 * iter,
    casesSha256: "a".repeat(64),
  };
}

describe("sha256Text", () => {
  it("returns 64-char hex for any input", () => {
    expect(sha256Text("hello")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Text("")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is deterministic", () => {
    expect(sha256Text("x")).toBe(sha256Text("x"));
  });
  it("differs for different inputs", () => {
    expect(sha256Text("a")).not.toBe(sha256Text("b"));
  });
});

describe("appendRun + readRuns", () => {
  it("writes header then records in order", async () => {
    const runsPath = join(tmpDir, "eval", "runs.jsonl");
    await writeRunsHeader(runsPath, header);
    await appendRun(runsPath, makeRecord(1, false));
    await appendRun(runsPath, makeRecord(2, true));
    const records = await readRuns(runsPath);
    expect(records).toHaveLength(2);
    expect(records[0]?.iter).toBe(1);
    expect(records[0]?.kept).toBe(false);
    expect(records[1]?.iter).toBe(2);
    expect(records[1]?.kept).toBe(true);
  });

  it("readRuns returns empty array for missing file", async () => {
    const records = await readRuns(join(tmpDir, "nope.jsonl"));
    expect(records).toEqual([]);
  });

  it("readRuns filters out the header line", async () => {
    const runsPath = join(tmpDir, "eval", "runs.jsonl");
    await writeRunsHeader(runsPath, header);
    await appendRun(runsPath, makeRecord(1, true));
    const raw = readFileSync(runsPath, "utf8");
    expect(raw).toContain('"__header":true');
    const records = await readRuns(runsPath);
    expect(records).toHaveLength(1);
  });
});

describe("verifyCasesFingerprint", () => {
  it("passes when sha256 matches", () => {
    const rec = makeRecord(1, true);
    expect(() => verifyCasesFingerprint(rec, rec.casesSha256)).not.toThrow();
  });
  it("throws when sha256 mismatches (mid-loop drift)", () => {
    const rec = makeRecord(1, true);
    expect(() => verifyCasesFingerprint(rec, "z".repeat(64))).toThrow(/CASES-DRIFT/);
  });
});
