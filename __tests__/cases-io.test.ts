/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cases-io.test
 * @description Tests for src/eval/cases-io.ts — readCases, writeCases,
 *   fingerprintCases (sha256 determinism), validateCases errors.
 * @see SPEC.md §"Open Risks → consistency rule #1"
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fingerprintCases,
  readCases,
  writeCases,
  validateCases,
} from "../src/eval/cases-io.js";
import type { CasesFile } from "../src/eval/types.js";

let tmpDir: string;
let tmpFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "skill-enh-cases-"));
  tmpFile = join(tmpDir, "cases.json");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const sample: CasesFile = {
  queries: [
    { id: "z", input: "z1", should_trigger: true },
    { id: "a", input: "a1", should_trigger: false },
    { id: "m", input: "m1", should_trigger: true, kind: "edge", expected: "..." },
  ],
};

describe("fingerprintCases", () => {
  it("returns deterministic sha256 for same input", () => {
    const h1 = fingerprintCases(sample);
    const h2 = fingerprintCases(sample);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is key-order independent (canonical JSON)", () => {
    const a: CasesFile = { queries: [{ id: "x", input: "i", should_trigger: true }] };
    const b: CasesFile = { queries: [{ should_trigger: true, input: "i", id: "x" }] };
    expect(fingerprintCases(a)).toBe(fingerprintCases(b));
  });
  it("differs when content differs", () => {
    const a = fingerprintCases(sample);
    const modified = { queries: [{ ...sample.queries[0], input: "DIFFERENT" }] };
    expect(fingerprintCases(modified)).not.toBe(a);
  });
});

describe("readCases + writeCases", () => {
  it("round-trips through write → read", async () => {
    await writeCases(tmpFile, sample);
    const back = await readCases(tmpFile);
    expect(back).toEqual(sample);
  });
  it("writes canonical (sorted keys, no whitespace)", async () => {
    await writeCases(tmpFile, sample);
    const raw = readFileSync(tmpFile, "utf8");
    // No inter-token whitespace; no `": "` separators either.
    expect(raw).not.toContain(": ");
    expect(raw).not.toContain(", ");
    expect(raw.trim()).toBe(raw.replace(/\n$/, "")); // only trailing newline
  });
  it("throws on missing required field (no id)", async () => {
    const bad = { queries: [{ input: "x", should_trigger: true }] };
    writeFileSync(tmpFile, JSON.stringify(bad), "utf8");
    await expect(readCases(tmpFile)).rejects.toThrow(/id/);
  });
  it("throws on should_trigger not boolean", async () => {
    const bad = { queries: [{ id: "x", input: "x", should_trigger: "yes" }] };
    writeFileSync(tmpFile, JSON.stringify(bad), "utf8");
    await expect(readCases(tmpFile)).rejects.toThrow(/should_trigger.*boolean/);
  });
});

describe("validateCases", () => {
  it("rejects empty queries array", () => {
    expect(() => validateCases({ queries: [] })).toThrow(/cannot be empty/);
  });
  it("rejects non-object root", () => {
    expect(() => validateCases("nope")).toThrow(/root must be an object/);
    expect(() => validateCases(null)).toThrow(/root must be an object/);
  });
  it("accepts a minimal valid file", () => {
    expect(() => validateCases({ queries: [{ id: "x", input: "y", should_trigger: true }] })).not.toThrow();
  });
});
