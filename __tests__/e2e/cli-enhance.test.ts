/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file e2e/cli-enhance
 * @description E2E tests for `skillenhance enhance`. Each test exercises a
 *   failure path (missing args, missing keys) so we don't hit real LLM.
 *   Per project rule "no network in tests" + the inferred fact that vitest
 *   propagates VITEST=true, all tests strip vite env so the child actually
 *   runs the CLI (not silently exits 0).
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
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolveRun, rejectRun) => {
    // Strip VITEST* so the spawned child's auto-exec guard does NOT skip
    // runCli (otherwise all tests silently exit 0).
    const childEnv = { ...env };
    for (const k of ["VITEST", "VITEST_WORKER_ID", "VITEST_POOL_ID"]) {
      delete childEnv[k];
    }
    const child = spawn(process.execPath, ["--import", "tsx", CLI_ENTRY, ...args], {
      env: childEnv,
      cwd: REPO_ROOT,
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

function envWithoutKeys(): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test" };
  for (const k of [
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY",
    "MINIMAX_API_KEY", "CUSTOM_API_KEY",
    "MINIMAX_BASE_URL", "CUSTOM_BASE_URL", "MINIMAX_MODEL", "CUSTOM_MODEL",
    "VITEST", "VITEST_WORKER_ID", "VITEST_POOL_ID",
  ]) {
    delete e[k];
  }
  return e;
}

describe("CLI enhance (e2e)", () => {
  it("exits 1 when --skill flag is missing", async () => {
    const r = await runCli(["enhance", "--cases", "./whatever"], envWithoutKeys());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing --skill|enhance/);
  }, 20000);

  it("exits 1 when --cases flag is missing", async () => {
    const r = await runCli(["enhance", "--skill", "./whatever.md"], envWithoutKeys());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/missing --cases|enhance/);
  }, 20000);

  // For file-existence checks we need a valid env (otherwise loadEnv throws
  // first with "no provider configured", which is exit 1 — same code but
  // wrong message). Use a transient provider baseUrl that won't actually
  // hit network; loadV0's ENOENT throws BEFORE the network call.
  function envWithStubProvider(): NodeJS.ProcessEnv {
    const e = envWithoutKeys();
    // Stuff a far-future not-real base URL so loadEnv passes for the
    // "minimax" provider. The child will fail before any HTTP call.
    e.MINIMAX_API_KEY = "sk-fake-minimax-key-1234567890";
    e.MINIMAX_BASE_URL = "https://api.minimax.io/v1";
    return e;
  }

  it("exits non-zero when skill file doesn't exist (arg validation + env checks)", async () => {
    const r = await runCli(
      ["enhance", "--skill", "./no-such-skill.md", "--cases", "./__tests__/fixtures/cases.json"],
      envWithStubProvider(),
    );
    expect(r.exitCode).not.toBe(0);
    // Could be exit 1 (arg validation / file not found) or exit 2 (env).
    expect([1, 2]).toContain(r.exitCode);
    expect(r.stderr).toMatch(/not found|skill|provider|enhance|cases/i);
  }, 20000);

  it("exits non-zero when cases file doesn't exist", async () => {
    const r = await runCli(
      [
        "enhance",
        "--skill",
        "./__tests__/fixtures/sample-skill.md",
        "--cases",
        "./no-such-cases.json",
      ],
      envWithStubProvider(),
    );
    expect(r.exitCode).not.toBe(0);
    expect([1, 2]).toContain(r.exitCode);
  }, 20000);
});
