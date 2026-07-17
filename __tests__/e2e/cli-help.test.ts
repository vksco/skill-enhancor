/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cli-help.test
 * @description E2E test for `skillenhance --help`. Spawns the CLI as a child
 *   process (real entry point, real arg parser) and asserts on stdout + exit.
 *   Per project rule "no network in tests" — this test invokes no LLM.
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const CLI_ENTRY = resolve(__dirname, "../../src/cli.ts");

function runCli(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, ["--import", "tsx", CLI_ENTRY, ...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolveRun({ stdout, stderr, exitCode: code ?? 0 }));
    child.on("error", rejectRun);
  });
}

describe("CLI help (e2e)", () => {
  it("--help exits 0 and lists commands", async () => {
    const r = await runCli(["--help"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/skillenhance/);
    expect(r.stdout).toMatch(/ping/);
    expect(r.stdout).toMatch(/config/);
  }, 15000);

  it("--version exits 0 and prints 0.1.0", async () => {
    const r = await runCli(["--version"]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("0.1.0");
  }, 15000);

  it("no args exits 0 and prints help (alias for --help)", async () => {
    const r = await runCli([]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/USAGE/);
  }, 15000);

  it("unknown command exits 1 with helpful message", async () => {
    const r = await runCli(["bogus"]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/Unknown command/);
  }, 15000);

  it("unknown flag exits 1", async () => {
    const r = await runCli(["--nope"]);
    expect(r.exitCode).toBe(1);
  }, 15000);
});
