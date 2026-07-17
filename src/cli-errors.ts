/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cli-errors
 * @description Centralized exit-code helpers. Per project rule
 *   (.claude/rules/cli-exit-codes.md):
 *     0 — success
 *     1 — user error (bad input, missing key, invalid flag)
 *     2 — internal error (code bug, unhandled exception)
 *     3 — verification failure (eval didn't improve, e2e assert failed)
 *
 * Every CLI handler exits through one of these helpers. No bare
 * `process.exit(N)` scattered through the codebase.
 *
 * @see .claude/rules/cli-exit-codes.md
 */

type ErrorLike = Error | { message: string };

/**
 * Exit with code 1 (user error). Prints the error message to stderr in red,
 * then exits. Never returns.
 *
 * @param err   Error or { message }. Falls back to String(err) for safety.
 * @param hint  Optional one-line guidance appended after the error.
 */
export function exitUserError(err: ErrorLike | unknown, hint?: string): never {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  console.error(`\x1b[31;1m${msg}\x1b[0m`);
  if (hint) console.error(`\x1b[33mHint: ${hint}\x1b[0m`);
  process.exit(1);
}

/**
 * Exit with code 2 (internal error). Same formatting as exitUserError but
 * signals "this is a code bug, not your fault."
 *
 * @param err   Error or unknown.
 * @param hint  Optional one-line guidance.
 */
export function exitInternalError(err: ErrorLike | unknown, hint?: string): never {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  console.error(`\x1b[31;1m[internal] ${msg}\x1b[0m`);
  if (hint) console.error(`\x1b[33mHint: ${hint}\x1b[0m`);
  process.exit(2);
}

/**
 * Exit with code 3 (verification failure). Distinct color (magenta) so the
 * green-path ↔ red-path distinction stays clear.
 *
 * @param msg  Human-readable failure description.
 */
export function exitVerificationFail(msg: string): never {
  console.error(`\x1b[35;1m${msg}\x1b[0m`);
  process.exit(3);
}
