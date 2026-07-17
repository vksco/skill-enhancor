# skill-enhancer — project root

CLI that enhances Claude skills via autoresearch-style iteration. **Read [`SPEC.md`](./SPEC.md) first** for feature decisions.

This index file is lean. All code/process rules live in modular files under [`.claude/rules/`](./.claude/rules/).

## Sources of truth

| File | Purpose |
|---|---|
| [`SPEC.md`](./SPEC.md) | Feature decisions: locked Q1–Q10, success criteria, architecture, build phases |
| [`CLAUDE.md`](./CLAUDE.md) | This file — index only |
| [`.claude/rules/`](./.claude/rules/) | Code/process rules (one file per topic) |
| [`.env.example`](./.env.example) | Env var inventory with comments |

## Rules index

| Rule | File |
|---|---|
| Author signature on every source file | [author-signature.md](./.claude/rules/author-signature.md) |
| Always-on skills + skill-not-in-registry note | [skills.md](./.claude/rules/skills.md) |
| Fact-check before stating (both directions) | [fact-check.md](./.claude/rules/fact-check.md) |
| Spec-first rule (grill-me → SPEC.md → code) | [spec-first.md](./.claude/rules/spec-first.md) |
| Testing in `__tests__/` at root + 80% coverage | [testing.md](./.claude/rules/testing.md) |
| DRY rule (refactor on third occurrence) | [dry.md](./.claude/rules/dry.md) |
| Comment density rule (every file + every function) | [comments.md](./.claude/rules/comments.md) |
| CLI exit codes (0/1/2/3) | [cli-exit-codes.md](./.claude/rules/cli-exit-codes.md) |
| LLM model via env per-provider (env.ts discipline) | [llm-model-env.md](./.claude/rules/llm-model-env.md) |
| Project consistency rules (10 numbered) | [project-consistency.md](./.claude/rules/project-consistency.md) |

## Quick start (after `npm install`)

```sh
cp .env.example .env          # then fill in API keys (NEVER commit .env)
npm run typecheck             # strict + noUncheckedIndexedAccess
npm test                      # vitest, __tests__/ at root
npm run spike                 # one-off SDK round-trip (needs ANTHROPIC_API_KEY)
```

## Phase tracker (mirrors SPEC.md §"Build Phases")

| Phase | Status | Commit | Verified |
|---|---|---|---|
| 0 — Project rules applied | ✅ done | — | typecheck + 10/10 tests |
| 1 — Spike (stack round-trip) | 🟡 needs user API key | (pending) | user runs `npm run spike` |
| 2 — Provider registry + config UI | not started | — | — |
| 3 — Rubric + judge | not started | — | — |
| 4 — Iteration loop | not started | — | — |
| 5 — Grill-me + case bootstrap | not started | — | — |
| 6 — Bundle output | not started | — | — |
| 7 — Package + provider parity | not started | — | — |
| 8 — CI + release | not started | — | — |
