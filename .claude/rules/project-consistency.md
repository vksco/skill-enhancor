# Project consistency rules (10 numbered)

Don't violate any of these without amending SPEC.md first. Each rule has a verifiable consequence; if you can't verify, escalate.

## 1. Frozen cases hash invariant

Every run writes `cases_sha256` to the `runs.jsonl` header. Detects accidental case regeneration mid-loop (a real bug class — the metric drifts and "improvements" mean nothing).

Verify: open any `runs.jsonl`, first line has `cases_sha256`. Compare against the on-disk `cases.json` hash. Mismatch = bug.

## 2. Token ceiling log

Every `generateText` / `streamText` call wrapped with a usage tracker. Hard error if pre-set ceiling exceeded (`SKILL_ENHANCE_TOKEN_CEILING`).

Verify: `runs.jsonl` last entry shows cumulative tokens; final summary errors at ceiling breach instead of silently overrunning.

## 3. Bundled skill is reproducible

Same input + same seed → same output bundle. Mutation temperature ≤ 0.4 default. Judge temperature 0 (deterministic scoring). Seed logged in `runs.jsonl`.

Verify: running the loop twice on the same input produces byte-identical `SKILL.md` and `runs.jsonl`.

## 4. No silent env coupling

Every env var declared in `.env.example` with comment. Single read site (`src/env.ts`). Greppable: `git grep -n "process.env" src/` should match **only** `src/env.ts` and `src/spike.ts`'s `process.exit`-adjacent code (if any).

## 5. No surprise dep upgrades

`package.json` bump = PR with changelog entry. No `npm audit fix --force` mid-build. Audit runs in CI weekly, not on every commit.

Verify: PR diff to `package.json` is reviewed; changelog file updated in same commit.

## 6. Cross-platform paths

Use `node:path` everywhere. Never concat `/` or `\`. Windows-only v1 still uses cross-platform module so future port is trivial.

Verify: `git grep -n '["`/`'\\]' src/` returns no path-concat results.

## 7. No network in tests

Mock all LLM provider calls. `npm test` runs offline. No real Anthropic / OpenAI / Minimax in CI.

Verify: `npm test` exits 0 with no network access. Add `vi.mock("ai", ...)` and `vi.mock("@ai-sdk/*", ...)` patterns shown in [testing.md](./testing.md).

## 8. Phase boundaries = hard commit points

One commit per phase. No rolling WIP across boundaries. If a phase needs split, the rules become two phases with their own SPEC.md rows.

Verify: `git log --oneline` shows one commit per phase that flipped status to ✅.

## 9. Every commit references SPEC.md phase

Commit body cites the SPEC.md section. Enforced at review: no "no spec → no commit". Format:

```
Phase N: <title>

Implements SPEC.md §"Architecture → <relevant section>".
Test: <what was added>.
Verify: <command run + result>.
```

## 10. All public functions explicitly typed

TypeScript strict + `noUncheckedIndexedAccess`. No `any` without a `// SAFETY:` comment justifying it.

Verify: `npm run typecheck` exits 0. `grep -rn ": any" src/` returns only `// SAFETY:`-preceded matches.

## How to amend these

Each rule has a rationale. If the rationale no longer applies (project changed, new vendor, etc.), propose amending the rule via SPEC.md update + this file update in the same PR. Don't silently violate and don't silently relax — surface the trade-off.
