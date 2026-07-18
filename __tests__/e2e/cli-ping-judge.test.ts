/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cli-ping-judge.test
 * @description E2E tests for `skillenhance ping` and `skillenhance judge`.
 *   No network: every test exercises the FAILURE path (missing key, missing
 *   file, bad provider) so we can verify CLI plumbing end-to-end without
 *   hitting real LLM providers. The SUCCESS path is covered by mocked unit
 *   tests in __tests__/ping.test.ts and __tests__/judge.test.ts.
 * @see CLAUDE.md §"No network in tests"
 */

import { describe, it, expect, beforeEach } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const CLI_ENTRY = resolve(__dirname, "../../src/cli.ts");
const REPO_ROOT = resolve(__dirname, "../..");

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = {},
  cwd: string = REPO_ROOT,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolveRun, rejectRun) => {
    const exec = process.execPath;
    const cmdline = [exec, "--import", "tsx", CLI_ENTRY, ...args];
    if (process.env.DEBUG_E2E === "1") {
      console.error("DEBUG spawn:", { exec, cmdline, cwd, hasKey: !!(env.MINIMAX_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY) });
    }
    // One-off debug mode: replace the CLI invocation with a script that
    // prints the env it sees + its argv. Skip the real command.
    if (process.env.DEBUG_E2E_ENV === "1") {
      const debugScript = resolve(REPO_ROOT, ".debug-env.ts");
      const child = spawn(exec, ["-e", "console.log(JSON.stringify({argv: process.argv.slice(0,5), NODE_ENV: process.env.NODE_ENV, hasMINIMAX: !!process.env.MINIMAX_API_KEY}))"], {
        env,
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => resolveRun({ stdout, stderr, exitCode: code ?? 0 }));
      child.on("error", rejectRun);
      return;
    }
    const child = spawn(exec, ["--import", "tsx", CLI_ENTRY, ...args], {
      env,
      cwd,
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

/**
 * Build a child-process env that has NO LLM keys, so env.ts fails loud.
 *   - Strips every `*_API_KEY` env var (force loadEnv to fail).
 *   - Sets NODE_ENV=test so env.ts SKIPS dotenv autoload (otherwise
 *     it would pull real keys from the project's .env and ping would
 *     succeed against a real provider, breaking the "no network" rule).
 *   - Unsets VITEST + friends so the spawned child's auto-exec guard
 *     does NOT skip runCli (vitest propagates these to child env by
 *     default; if we leave them set, the CLI silently exits 0 because
 *     the auto-exec thinks "I'm in a vitest worker, skip").
 *   - Leaves Windows system envs (PATH, PATHEXT, SystemRoot, ...) intact
 *     — stripping those produces STATUS_STACK_BUFFER_OVERRUN (0xC0000409).
 */
function envWithoutKeys(): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test" };
  for (const k of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "MINIMAX_API_KEY",
    "CUSTOM_API_KEY",
    "MINIMAX_BASE_URL",
    "CUSTOM_BASE_URL",
    "MINIMAX_MODEL",
    "CUSTOM_MODEL",
    "VITEST",
    "VITEST_WORKER_ID",
    "VITEST_POOL_ID",
  ]) {
    delete e[k];
  }
  return e;
}

describe("CLI ping (e2e)", () => {
  it("exits 1 with provider error when no LLM key is set", async () => {
    const r = await runCli(["ping"], envWithoutKeys());
    expect(r.exitCode).toBe(1);
    // env.ts throws "[env] No LLM provider configured..." on missing keys.
    expect(r.stderr).toMatch(/No LLM provider configured|Anthropic|Minimax/i);
  }, 20000);

  it("exits 1 with explicit --provider that isn't installed (anthropic) when no key present", async () => {
    const env = envWithoutKeys();
    const r = await runCli(["ping", "--provider", "anthropic"], env);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/ANTHROPIC_API_KEY/i);
  }, 20000);
});

describe("CLI judge (e2e)", () => {
  it("exits 1 when called with missing --cases flag (proves arg validation runs)", async () => {
    const env = envWithoutKeys();
    const skillPath = resolve(REPO_ROOT, "__tests__/fixtures/sample-skill.md");
    const r = await runCli(["judge", skillPath], env);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing --cases|judge/i);
  }, 20000);

  it("exits 1 when called with non-existent cases file (proves file read path)", async () => {
    const env = envWithoutKeys();
    const skillPath = resolve(REPO_ROOT, "__tests__/fixtures/sample-skill.md");
    const r = await runCli(
      ["judge", skillPath, "--cases", "./does-not-exist.json"],
      env,
    );
    if (r.exitCode !== 1) {
      console.error("DEBUG child:", JSON.stringify({ exit: r.exitCode, stdout: r.stdout, stderr: r.stderr }));
    }
    expect(r.exitCode).toBe(1);
  }, 20000);

  it("exits 1 with provider error when no LLM key is set (proves full pipeline)", async () => {
    const env = envWithoutKeys();
    const skillPath = resolve(REPO_ROOT, "__tests__/fixtures/sample-skill.md");
    const casesPath = resolve(REPO_ROOT, "__tests__/fixtures/cases.json");
    const r = await runCli(["judge", skillPath, "--cases", casesPath], env);
    if (r.exitCode !== 1) {
      console.error("DEBUG child:", JSON.stringify({ exit: r.exitCode, stdout: r.stdout, stderr: r.stderr }));
    }
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/No LLM provider configured|provider/i);
  }, 20000);
});
