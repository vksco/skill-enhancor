# DRY rule

No copy-paste of:

- constants (env var names, exit codes, model defaults)
- prompt fragments (mutation preamble, judge rubric header)
- schema definitions (zod schemas, JSON shapes)
- error strings (`"Missing ANTHROPIC_API_KEY"` appears once)
- path joins or extensions

## Shared locations

| Kind | Lives in |
|---|---|
| Constants | `src/constants.ts` |
| Provider metadata | `src/providers/registry.ts` |
| Env reads | `src/env.ts` |
| CLI error formatter | `src/cli-errors.ts` |
| Prompt fragments | `src/prompts/` (one file per prompt role) |
| zod schemas | co-located with the module they describe |

## When to refactor

**On the third occurrence, not earlier.**

- Two similar snippets = coincidence. Wait.
- Three similar snippets = pattern. Extract.

Premature abstraction is a tax. If you extract too early, you lock in shapes that the second real use case doesn't fit. The rule of three is the cheapest resistance.

## What DRY is NOT

- DRY ≠ one-character symbols (`i` for index). Readability > compression.
- DRY ≠ no comments because "the code says it." Comments say **why**, code says what.
- DRY ≠ shared utils for things used twice. See "When to refactor" above.
- DRY ≠ shared types across modules that share no behavior. Re-typing is cheaper than false coupling.

## Anti-patterns

- ❌ Extracting an abstraction on the second use "because we'll need it again."
- ❌ DRYing strings that mean different things but happen to match.
- ❌ Pulling a constant into `constants.ts` when it's used exactly once.
- ❌ Generic helpers that accept any input → do any output → couple everything to everything.
