/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file spike.test
 * @description Tests for src/spike.ts — verifies the clear-error + exit 1 path
 *   when ANTHROPIC_API_KEY is missing. The success path requires a real key;
 *   we do NOT mock the AI SDK here because the whole point of spike.ts is to
 *   exercise the real SDK round-trip end to end.
 * @see CLAUDE.md §"No network in tests" — spike tests deliberately run without
 *   the success path because that requires a real Anthropic key.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const SPIKE_ENTRY = resolve(__dirname, "../src/spike.ts");

/**
 * Spawn `node --import tsx <spike.ts>` and return stdout, stderr, exit code.
 *
 * Why not spawn tsx directly: Node 22+ refuses to spawn `.cmd` files without
 * `shell: true`, which itself triggers DEP0190 + a security smell. Invoking
 * `node` with the tsx ESM loader is the clean cross-platform path that
 * resolves our `./env.js` imports (Node's native TS stripper doesn't).
 *
 * @param env - Extra env vars to inject. Merged onto process.env.
 * @returns Resolved with collected output once the child closes.
 */
function runSpike(env: NodeJS.ProcessEnv): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", SPIKE_ENTRY],
      {
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolveRun({ stdout, stderr, exitCode: code ?? 0 }));
    child.on("error", rejectRun);
  });
}

describe("spike (CLI invocation)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exits 1 with clear message when ANTHROPIC_API_KEY is missing", async () => {
    const r = await runSpike({ ANTHROPIC_API_KEY: "" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/ANTHROPIC_API_KEY/);
  });
});
