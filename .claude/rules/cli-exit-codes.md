# CLI exit codes

Enforced everywhere the CLI exits. Imported from `src/cli-errors.ts`.

| Code | Meaning | When |
|---|---|---|
| `0` | Success | Operation completed without verification failure |
| `1` | User error | Bad input, missing required env var, invalid flag combination, missing skill path |
| `2` | Internal error | Code bug, unhandled exception, missing dependency at runtime |
| `3` | Verification failure | Eval score did not improve, e2e assert failed, mastery gate unmet |

## Decision logic

```
if (verificationRan && !verificationPassed)               -> exit 3
if (caught exception flagged "internal")                  -> exit 2
if (caught user input problem, missing key, bad path)      -> exit 1
else                                                       -> exit 0
```

## Where exit codes live in code

```ts
import { exitUserError, exitInternalError, exitVerificationFail } from "./cli-errors.js";

const env = loadEnv();          // throws user-error if missing key → caught → exitUserError(err)
const out = await run();        // throws internal on unhandled → exitInternalError(err)
if (!out.scoreImproved)         // exitVerificationFail() if criterion not met
```

## Anti-patterns

- ❌ `process.exit(1)` directly scattered through code. Centralize.
- ❌ `process.exit(0)` everywhere except catch. The decision logic above is the contract.
- ❌ Using `1` and `2` interchangeably for "any error."
- ❌ Recovering silently from a verification failure and exiting 0 anyway.
- ❌ Exiting 2 for "user typed wrong path." That's user error → exit 1.
