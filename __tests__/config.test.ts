/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file config.test
 * @description Tests for src/config.ts — parseEnvText, readEnvFile, writeEnvFile, mergeEnv.
 *   Uses a temp directory per-test to keep side effects isolated.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseEnvText,
  readEnvFile,
  writeEnvFile,
  mergeEnv,
  type EnvFile,
} from "../src/config.js";

let tmpDir: string;
let tmpFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "skill-enh-cfg-"));
  tmpFile = join(tmpDir, ".env");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseEnvText", () => {
  it("parses simple KEY=VALUE pairs", () => {
    expect(parseEnvText("A=1\nB=two\nC=three=with=equals")).toEqual({
      A: "1",
      B: "two",
      C: "three=with=equals",
    });
  });

  it("drops comments and blank lines", () => {
    expect(
      parseEnvText("# header comment\n\nA=1\n  # indented comment\nB=2\n"),
    ).toEqual({ A: "1", B: "2" });
  });

  it("silently skips malformed lines without '=', returns rest", () => {
    // Plain text with no '=' is malformed; skipping should be silent.
    const out = parseEnvText("brokenline\nA=1\n");
    expect(out).toEqual({ A: "1" });
  });

  it("handles CRLF line endings", () => {
    expect(parseEnvText("A=1\r\nB=2\r\n")).toEqual({ A: "1", B: "2" });
  });
});

describe("readEnvFile + writeEnvFile", () => {
  it("returns empty record when file does not exist", async () => {
    const r = await readEnvFile(join(tmpDir, "nope.env"));
    expect(r).toEqual({});
  });

  it("round-trips through read → write → read", async () => {
    const original: EnvFile = { X: "1", Y: "two", Z: "three=with=equals" };
    await writeEnvFile(tmpFile, original);
    const back = await readEnvFile(tmpFile);
    expect(back).toEqual(original);
  });

  it("write overwrites an existing file (clean canonical form, no comments preserved)", async () => {
    writeFileSync(
      tmpFile,
      "# preserved comment\nA=old\n\n# another\nB=old\n",
      "utf8",
    );
    await writeEnvFile(tmpFile, { A: "new", C: "added" });
    const raw = readFileSync(tmpFile, "utf8");
    expect(raw).not.toContain("#");
    expect(raw).not.toContain("B=old");
    const back = await readEnvFile(tmpFile);
    expect(back).toEqual({ A: "new", C: "added" });
  });
});

describe("mergeEnv", () => {
  it("preserves keys not in updates", () => {
    expect(mergeEnv({ A: "1", B: "2" }, { A: "new" })).toEqual({ A: "new", B: "2" });
  });

  it("adds new keys", () => {
    expect(mergeEnv({ A: "1" }, { B: "2" })).toEqual({ A: "1", B: "2" });
  });

  it("does not mutate the input", () => {
    const base: EnvFile = { A: "1" };
    const updates: EnvFile = { A: "2", B: "3" };
    mergeEnv(base, updates);
    expect(base).toEqual({ A: "1" });
  });
});
