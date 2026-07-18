/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cli-errors.test
 * @description Direct tests for src/cli-errors.ts exit helpers.
 *   spies on process.exit so each exit call is captured without killing
 *   the test process. Covers exit codes 1/2/3 per project rules
 *   (.claude/rules/cli-exit-codes.md).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  exitUserError,
  exitInternalError,
  exitVerificationFail,
} from "../src/cli-errors.js";

let exitSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
    return undefined as never;
  }) as never);
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exitUserError (exit 1)", () => {
  it("exits 1 with the error message", () => {
    exitUserError(new Error("bad input"));
    expect(errSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  it("accepts string messages", () => {
    exitUserError("simple message");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  it("prints optional hint on a second line", () => {
    exitUserError(new Error("x"), "try this");
    const allCalls = errSpy.mock.calls.map((c) => c.join(" "));
    expect(allCalls.some((l) => /Hint: try this/.test(l))).toBe(true);
  });
});

describe("exitInternalError (exit 2)", () => {
  it("exits 2 and prefixes with [internal]", () => {
    exitInternalError(new Error("bug"));
    expect(exitSpy).toHaveBeenCalledWith(2);
    const allCalls = errSpy.mock.calls.map((c) => c.join(" "));
    expect(allCalls.some((l) => /\[internal\] bug/.test(l))).toBe(true);
  });
});

describe("exitVerificationFail (exit 3)", () => {
  it("exits 3 with the given message", () => {
    exitVerificationFail("eval did not improve");
    expect(exitSpy).toHaveBeenCalledWith(3);
    const allCalls = errSpy.mock.calls.map((c) => c.join(" "));
    expect(allCalls.some((l) => /eval did not improve/.test(l))).toBe(true);
  });
});
