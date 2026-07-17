# Comment density rule

## What every file MUST have

Top-of-file doc block (see [author-signature.md](./author-signature.md)):

- One sentence: **purpose**.
- One sentence: **boundaries** (what is explicitly NOT this file's job, if non-obvious).

## What every non-trivial function MUST have

JSDoc block:

```
@param   <name>: <type>  — <what + units if any>
@returns <type or "void"> — <what>
@throws  <Error type>    — <when, only if not obvious>
```

Plus a one-line **rationale comment** above the function if the why isn't obvious from the name.

## Examples

### Good

```ts
/**
 * Hash the canonical forms of cases + rubric so we can detect drift mid-loop.
 * SHA-256 over JSON.stringify of both sorted by key. Mutating cases mid-run
 * is a hard bug; the hash surfaces it.
 *
 * @returns 64-char hex string.
 */
export function fingerprint(cases: Case[]): string { ... }
```

### Bad

```ts
// Hash the cases.
export function fingerprint(cases: Case[]): string { ... }
```

The "bad" version says what (which we can read from the code), not why (which we can't).

## What comments MUST explain

- **Why** — the constraint, the invariant, the surprising edge case.
- **What** something does — only if the name is misleading or the implementation is dense.
- **Units** — "elapsed in milliseconds", "tokens not characters".
- **Boundary semantics** — "inclusive", "throws if empty", "may return null on miss".

## What comments MUST NOT contain

- Implementation narration ("// now we loop").
- Change logs ("// fixed bug on 2026-07-18" — use git).
- Speculation ("// maybe do X later" — use `// TODO(name):` with owner).
- Dead-code archaeology ("// was previously used for X" — delete the dead code).
- Banner separators (`// ============` blocks). Use file split instead.
