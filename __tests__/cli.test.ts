/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cli.test
 * @description Tests for src/cli.ts parseCliArgs — the pure arg-parsing layer.
 *   The router (runCli) is exercised via spawned-clerk e2e tests, not here.
 * @see SPEC.md §"CLI grammar"
 */

import { describe, it, expect } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("returns empty args when given nothing", () => {
    const r = parseCliArgs([]);
    expect(r.command).toBeUndefined();
    expect(r.provider).toBeUndefined();
    expect(r.version).toBeFalsy();
    expect(r.help).toBeFalsy();
  });

  it("captures positional command", () => {
    expect(parseCliArgs(["ping"]).command).toBe("ping");
    expect(parseCliArgs(["config"]).command).toBe("config");
  });

  it("captures --provider value", () => {
    expect(parseCliArgs(["ping", "--provider", "anthropic"]).provider).toBe("anthropic");
  });

  it("captures --version (and short -v)", () => {
    expect(parseCliArgs(["--version"]).version).toBe(true);
    expect(parseCliArgs(["-v"]).version).toBe(true);
  });

  it("captures --help (and short -h)", () => {
    expect(parseCliArgs(["--help"]).help).toBe(true);
    expect(parseCliArgs(["-h"]).help).toBe(true);
  });

  it("rejects unknown flags", () => {
    expect(() => parseCliArgs(["--nope"])).toThrow();
  });
});
