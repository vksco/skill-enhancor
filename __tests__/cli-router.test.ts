/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cli-router.test
 * @description Direct unit tests for src/cli.ts runCli router.
 *   Complements the spawned-clerk e2e tests in __tests__/e2e/. Those cover
 *   external behavior; these cover CLI plumbing branches that subprocess
 *   spawns don't count toward vitest coverage.
 * @see CLAUDE.md §"Testing rules"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as cli from "../src/cli.js";

let exitSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // process.exit THROWS on every call (any code). Tests catch the throw
  // — this is how we ensure the CLI never falls through past an
  // explicit exit() and silently continues executing.
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__exit__:${(code ?? 0).toString()}`);
  }) as never);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Snapshot exit code + emitted messages from the most recent run. */
function snapshot() {
  const calls = exitSpy.mock.calls;
  const last = calls.length ? calls[calls.length - 1]?.[0] : undefined;
  const code = typeof last === "number" ? last : -1;
  return {
    code,
    stdout: logSpy.mock.calls.map((c) => c.join(" ")).join("\n"),
    stderr: errSpy.mock.calls.map((c) => c.join(" ")).join("\n"),
  };
}

/** runCli swallows-or-throws — every code path calls process.exit (spied),
 *  which now throws. We catch and return the snapshot. */
async function runCliCapture(args: string[]): Promise<ReturnType<typeof snapshot>> {
  try {
    await cli.runCli(args);
  } catch {
    /* expected — every successful path calls process.exit which now throws */
  }
  return snapshot();
}

describe("runCli router — version + help", () => {
  it("--version prints version and exits 0", async () => {
    const r = await runCliCapture(["--version"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0.1.0");
  });

  it("-v (short) also prints version", async () => {
    const r = await runCliCapture(["-v"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("0.1.0");
  });

  it("--help prints USAGE and exits 0", async () => {
    const r = await runCliCapture(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/USAGE/);
  });

  it("no args defaults to help", async () => {
    const r = await runCliCapture([]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/USAGE/);
  });

  it("explicit 'help' command works too", async () => {
    const r = await runCliCapture(["help"]);
    expect(r.code).toBe(0);
  });
});

describe("runCli router — unknown command/flag", () => {
  it("unknown command exits 1 with a hint message", async () => {
    const r = await runCliCapture(["bogus"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Unknown command/);
  });

  it("unknown flag exits 1 (parseArgs is strict)", async () => {
    const r = await runCliCapture(["--nope"]);
    expect(r.code).toBe(1);
  });
});

describe("runCli router — judge arg validation", () => {
  it("judge without skill path exits 1", async () => {
    const r = await runCliCapture(["judge"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/missing skill path/);
  });

  it("judge without --cases exits 1", async () => {
    const r = await runCliCapture(["judge", "./skill.md"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/missing --cases/);
  });

  it("judge with non-existent cases file exits 1 (user error, not internal)", async () => {
    const r = await runCliCapture([
      "judge",
      "./__tests__/fixtures/sample-skill.md",
      "--cases",
      "./does-not-exist.json",
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Check the skill path/);
  });
});
