# SPEC.md — skill-enhancer (CLI)

> Durable artifact. Walk any cold session through this and they understand the project.

## Project Rules

Code and process rules live in [`CLAUDE.md`](./CLAUDE.md) (index) and modular files under [`.claude/rules/`](./.claude/rules/). Never inline policy into this SPEC.md; refer to the rule files. Locked decisions + feature scope (below) stay here.

---

## Problem

Build an npm-global-installable Windows CLI (`skill-enhance`) that takes a Claude skill and emits an **enhanced version with measurable quality improvement**. Borrows Karpathy's autoresearch architecture: bounded env + clean metric + wall-clock/time budget + iteration loop. User input: existing skill OR grill-me transcript. Output: best-scoring skill + run log + frozen eval cases.

**Core insight from autoresearch (mirrors of which are baked into this spec):** the "magic" is not the agent. It is the bounded environment, the clean metric, and the iteration loop. Mutation is doing the work; the LLM is just the loop's mutation operator.

---

## Locked Decisions (Q1–Q10)

| Q  | Decision |
|----|----------|
| Q1 | CLI first (MVP). Extract skill file later for community fork/tweak. |
| Q2 | Weighted rubric (5 axes: correctness / trigger fidelity / output quality / robustness / reusability). Single composite = loop signal; per-axis = mutation driver. |
| Q3 | Hybrid grill-me bootstrap: cases generated during interview, frozen at end. Cross-model judge mandatory (gen model ≠ judge model). Rule-based checks opt-in flag. |
| Q4.1 | Lean default budget: ~80K tokens/iter × 10 iters. Configurable. |
| Q4.2 | Hybrid payment: env var → CLI config (`~/.skill-enhance/config.json`) → Ollama fallback. |
| Q4.3 | Targeted mutation with broad rewrite every 5 iters regardless of state. |
| Q5 | Bundle output: `enhanced-skill-name/` folder with `SKILL.md` + `README.md` + `eval/`. `.skill-enhance/` working dir gitignored by default; `--git` opt-in for per-iter commit. |
| Q6 | Coverage-based termination (all 5 rubric axes touched). Floor of 5 questions. User veto always respected. `--quick` for 3-question rapid mode. |
| Q7.1 | Windows-only v1. Explicit OUT list (see "Non-goals"). |
| Q7.2 | Stack: Vercel AI SDK + `@ai-sdk/openai-compatible` + per-provider adapters. Config auto-detected from `process.env` / `.env` — **provider-agnostic by design**, no hardcoded default. Built-in provider registry: anthropic, openai, google, minimax, custom. Auto-detect priority: custom > minimax > google > openai > anthropic; explicit `--provider` overrides ambiguity. |
| Q7.3 | Lean INTO npm-on-Windows, PowerShell-friendly logs (ANSI-aware), error messages both cmd-style + user-friendly. |
| Q8.1 | Keep: `composite > S_n + 0.1` **AND** no axis drops > 0.5. |
| Q8.2 | Broad rewrite every 5 iters regardless of state. |
| Q8.3 | Three early-stop conditions, whichever first: round limit (default 10) OR stagnation (3 consecutive rejects) OR mastery (`composite ≥ 9.5` **AND** every axis `≥ 9.0`). |
| Q8.4 | Mutation emits full `SKILL.md` each iter, never diffs. |
| Q9  | 13 must-pass machine-verifiable criteria (see "Success Criteria"). |
| Q10 | 10-question bank covering all 5 rubric axes. Termination: coverage OR floor OR cap OR user veto. Bank overridable via `--questions <file>`. |

---

## Architecture

### Stack

- **Language:** TypeScript on Node 20 LTS+
- **Distribution:** npm (`package.json` `bin` entry → `npm i -g skill-enhance`)
- **LLM SDK:** `ai@^7` (Vercel AI SDK) + `@ai-sdk/openai-compatible@^3` + per-provider adapters
- **Env loader:** `dotenv@^17` for `.env` autoload; `src/env.ts` is the **single read site** for env vars; auto-detects provider from `*_API_KEY` env vars; fails loud with exact missing var name on misconfiguration
- **Terminal UI:** `@inquirer/prompts` (password input for keys, prompts for grill-me)
- **CLI framework:** `commander` or native `node:util.parseArgs`
- **File ops:** native `node:fs/promises`, `node:path`
- **Tests:** `vitest` for unit (with `NODE_ENV=test` set so dotenv skips loading), `@playwright/test` for CLI e2e

### File layout

```
skill-enhancer/
├── package.json
├── tsconfig.json
├── README.md
├── SPEC.md                          ← this file
├── src/
│   ├── cli.ts                       # argument parser, command router
│   ├── commands/
│   │   ├── enhance.ts               # main enhance command
│   │   ├── config.ts                # provider config + key setup UI
│   │   └── package.ts               # bundle → .skill zip
│   ├── phase/
│   │   ├── grill-me.ts              # interview loop, terminal UI
│   │   ├── cases.ts                 # case generation + freeze
│   │   ├── v0.ts                    # baseline copy or generate v0
│   │   ├── iterate.ts               # mutation + judge + keep/discard loop
│   │   └── output.ts                # bundle writer
│   ├── providers/
│   │   ├── registry.ts              # provider → AI SDK adapter map
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   ├── minimax.ts
│   │   └── custom.ts                # openai-compat baseURL
│   ├── eval/
│   │   ├── rubric.ts                # 5 axes, weights, composite calc
│   │   ├── judge.ts                 # AI SDK generateText → structured JSON scores
│   │   └── cases-io.ts              # cases.json read/write/hash
│   ├── prompts/
│   │   ├── mutation.ts              # mutation prompt templates
│   │   └── judge.ts                 # judge prompt template
│   └── grill-me-questions.json      # default Q-bank (10 questions)
├── tests/
│   ├── fixtures/
│   │   ├── sample-skill/            # real existing skill for upgrade path
│   │   ├── spec-notes.md            # free-text spec for --from-doc
│   │   └── empty-skill-dir/         # for grill-me bootstrap
│   ├── e2e/
│   │   ├── enhance-existing.test.ts
│   │   ├── enhance-from-doc.test.ts
│   │   ├── providers-parity.test.ts
│   │   └── early-stop.test.ts
│   └── unit/
│       ├── rubric.test.ts
│       ├── cases-io.test.ts
│       └── registry.test.ts
└── .github/workflows/ci.yml         # Windows runners: lint, typecheck, e2e
```

### CLI grammar

```
skillenhance                                    # help
skillenhance [SKILL_PATH]                       # enhance existing skill
skillenhance --from-doc <PATH> [SKILL_PATH]     # interview from free-text spec
skillenhance --provider <id>                    # pick provider (anthropic|openai|minimax|custom)
skillenhance --model <id>                       # override model
skillenhance --base-url <url>                   # custom OpenAI-compat endpoint
skillenhance --rounds N --stagnation M
skillenhance --mastery-composite X --mastery-axis Y
skillenhance --quick                            # 3-question rapid mode (Q1, Q3, Q5)
skillenhance --questions <file>                 # custom Q-bank
skillenhance --git                              # auto-commit per accepted iter
skillenhance --dry                              # estimate cost, no mutations
skillenhance config                             # provider/key setup UI
skillenhance package <ENHANCED_DIR>             # bundle → .skill zip
skillenhance --version
```

### Iteration algorithm

```
1. PHASE: GRILL-ME (if --from-doc or no input skill)
   - Walk Q-bank until coverage OR floor OR cap OR user veto
   - Each answer auto-suggests 1 candidate case; user accepts/edits
   - Freeze → spec.md + cases.json

2. PHASE: V0 BASELINE
   - If user supplied skill: copy to v0
   - Else: generate v0 from spec.md
   - Score v0 on cases.json → S0 (composite + per-axis)
   - Hash cases.json → store as baseline hash

3. PHASE: ITERATION
   best = v0
   best_composite = S0
   stagnation = 0
   for iter in 1..round_limit:
     mode = (iter % 5 == 0) ? "broad-rewrite" : "targeted on <weakest axis>"
     mutation_prompt = compose(best, mode, weakest_axis, cases_sample, rubric, constraints)
     S_{n+1}_md = await generateText(mutation_prompt)              # full SKILL.md
     scores = await Promise.all(cases.map(c => judge(c, S_{n+1}))) # parallel
     composite = weighted_sum(scores, rubric.weights)
     axis_drops = per_axis_delta(scores, best.scores)               # max delta downward
     if composite > best_composite + 0.1 AND axis_drops < 0.5:
       accept: best = S_{n+1}_md; stagnation = 0
     else:
       reject: stagnation += 1
     append {iter, mode, composite, scores, accept} → runs.jsonl
     early_stop = round_limit || stagnation >= stagnation_max || mastery(scores, criteria)
     if early_stop: break

4. PHASE: OUTPUT
   - Write bundle: enhanced-name/{SKILL.md, README.md, eval/{cases.json, rubric.json, runs.jsonl}}
   - Print summary (initial S0 → final score, iters used, tokens spent, what changed)
```

### Decision thresholds (defaults, all tunable via flags)

| Param | Default | Flag |
|---|---|---|
| Keep epsilon | 0.1 | `--epsilon` |
| Per-axis drop guard | 0.5 | `--axis-guard` |
| Round limit | 10 | `--rounds` |
| Stagnation limit | 3 | `--stagnation` |
| Mastery composite | 9.5 | `--mastery-composite` |
| Mastery axis floor | 9.0 | `--mastery-axis` |
| Broad rewrite cadence | every 5 iters | `--broad-every` |
| Mutation temperature | 0.3 | `--mutation-temp` |
| Judge temperature | 0.0 | `--judge-temp` |

---

## In-scope (v1)

- Windows 11 (Windows 10 should also work)
- `npm i -g skill-enhance` global install
- All OpenAI-compatible providers via base URL
- Per-axis scoring + composite signal
- Frozen eval cases during a single run (sha256 invariant across iters)
- Bundle output folder with `SKILL.md` + `README.md` + `eval/`
- `--git` auto-commit per accepted iter
- Three early-stop conditions: rounds / stagnation / mastery
- Interactive terminal UI for grill-me + key setup
- 5 built-in providers (anthropic, openai, google, minimax, custom)
- Rule-based eval checks as opt-in flag

## Non-goals (v1)

- Linux / macOS support (later)
- Encrypted key storage at rest (later; DPAPI opt-in)
- Distributed / multi-machine runs
- Web dashboard for eval results
- Plugin system for custom mutators
- Live hot-update of skill in a running Claude Code session
- Streaming mutation output during long calls (use progress indicator only)
- Provider parity beyond the 5 built-ins
- Custom rubric axes (rubric is fixed in v1)
- Replay / caching across runs in a shared store (`.skill-enhance/cache/<hash>/` is a v2 feature)

---

## Machine-verifiable Success Criteria (Q9)

| # | Criterion | How verified |
|---|-----------|--------------|
| 1 | `npm i -g skill-enhance` exits 0 on Windows 11 | Fresh PowerShell, manual once, then CI |
| 2 | `skillenhance` (no args) prints help, exits 0 | CLI test |
| 3 | `skillenhance ./tests/fixtures/sample-skill/` reaches ≥0.5 composite improvement OR mastery in ≤10 iters | Automated e2e against fixture |
| 4 | `skillenhance --from-doc ./tests/fixtures/spec-notes.md` (no input skill) produces v0 + ≥0.5 composite improvement | Automated e2e |
| 5 | `skillenhance --provider anthropic` runs full loop on fixture | Automated e2e |
| 6 | `skillenhance --provider openai` runs full loop on fixture | Automated e2e |
| 7 | `skillenhance --provider minimax` runs full loop on fixture | Automated e2e |
| 8 | Generated `enhanced-name/SKILL.md` schema-valid (frontmatter + name + description present) | Schema check |
| 9 | `runs.jsonl` has N entries = accepted + rejected iters, all valid JSONL | File check |
| 10 | `--rounds 30 --stagnation 5` and `--quick` both behave per spec | Flag tests |
| 11 | Default lean config: total tokens ≤ specified budget per run (validated via run log) | Log parsing |
| 12 | `cases.json` frozen across all iters of one run (sha256 unchanged) | File hash check |
| 13 | Two runs on same input skill start from same v0 → same S0 baseline (deterministic gen) | Two e2e runs, diff S0 |

---

## Open Risks / Unknowns

1. **Cross-model judge reliability.** Opus-judging-Sonnet may score differently than Sonnet-judging-Sonnet. Mitigation: lock judge model in `.skill-enhance/judge-config.json` so a run is consistent; document variance in README.
2. **Mutation prompt drift.** Same iteration may produce different valid mutations at temperature > 0. Mitigation: mutation temperature 0.3 default; judge temperature 0 (deterministic scoring).
3. **SKILL.md schema compliance.** Generated skill must satisfy Anthropic's published SKILL.md schema for Claude Code to load it. Mitigation: schema-valid check at bundle write time; fail bundle if invalid.
4. **Token cost surprises.** Lean budget assumes ~5K input tokens/case average. Real cost may 2× on Opus-judge. Mitigation: `--dry` flag prints estimated cost before mutations; user can downgrade to Sonnet-judge.
5. **Minimax API specifics.** BaseURL = `https://api.minimax.io/v1` (verified by HTTP probe + cross-checked against working project at `D:\VIKASH\councilor`). Model ID format: `MiniMax-M2.7`, `MiniMax-M3` (varies by role). SDK: `@ai-sdk/openai-compatible` (verified working). M2.7 is a reasoning model — emits `think...` chains into the text field, so the SDK's `outputTokenDetails.reasoningTokens` is the signal and the registry carries `thinkingTagPattern: /think[\s\S]*?\/think/g` to strip them. Reasoning budgets consume output tokens — judge + mutation prompts in Phase 3+ must allow generous maxOutputTokens or use a non-reasoning variant.

6. **Windows libuv shutdown warning.** After process.exit, an `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` warning sometimes surfaces in stderr. Cosmetic, doesn't affect exit code or output. Likely a transitive inquirer/chalk async handle. Investigate in Phase 8; document `--no-deprecation-warnings` flag or upgrade path.
6. **Grill-me question count dynamics.** Some users may answer 5 questions cleanly, others may need 10+ to reach coverage. Floor of 5 prevents under-coverage; cap of 10 prevents over-asking. Edge case: user answers 4 questions but coverage is complete (e.g., 4 axes covered) — current logic permits early termination on coverage alone, which is correct.

---

## Build Phases (rough order)

| Phase | Days | Deliverable |
|---|---|---|
| 0. **Project rules applied** | ✅ | `CLAUDE.md` (index) + 10 `.claude/rules/*.md` files + `src/env.ts` env loader + `__tests__/` at root + vitest wired + author signatures + 16/16 unit tests green |
| 1. **Spike** | ✅ | TS scaffold + Vercel AI SDK + auto-detect minimax provider; round-trip 4978ms / 260 tokens via real model |
| 2. **Provider registry + config UI + ping** | ✅ | `src/providers/registry.ts` (single source of truth for 5 providers), `src/cli.ts` (node:util.parseArgs router), `src/commands/ping.ts` (smoke test), `src/commands/config.ts` (interactive wizard using @inquirer/prompts, lazy-loaded), `src/config.ts` (.env read/write helper), `src/cli-errors.ts` (exit code helpers per project rules); 33 new tests across 5 new files; `skillenhance --help`, `skillenhance ping`, `skillenhance config` all working end-to-end (real call 2505ms / 100 tokens verified) |
| 3. **Rubric + judge** | ✅ | `src/eval/types.ts` (shared types), `src/eval/rubric.ts` (5 axes + weights + composite + mastery gate + keep-or-discard), `src/eval/cases-io.ts` (cases.json read/write + sha256 fingerprint), `src/prompts/judge.ts` (judge prompt template), `src/eval/judge.ts` (generateText + stripThinking + JSON.extract + Zod.validate — switched from generateObject because that path fails on reasoning-model output), `src/commands/judge.ts` + `skillenhance judge` CLI; 31 new tests; fixtures at `__tests__/fixtures/sample-skill.md` + `cases.json`; real Minimax call returned composite=9.71 across 5 cases × 5 axes |
| 1. Spike | 1 | TS scaffold + `@ai-sdk/openai-compatible` round-trip on fixture |
| 2. Provider registry + config UI | 1 | `skillenhance config` works; chosen provider produces 1 sample completion |
| 3. Rubric + judge | 1 | 5-axis scoring with real cases; cross-model sanity check |
| 4. Iteration loop | 2 | mutation → judge → keep/discard; `runs.jsonl`; early stops; lean-budget e2e on fixture |
| 5. Grill-me + case bootstrap | 2 | Q-bank, terminal UI, `cases.json` freeze, `--from-doc`, `--quick` |
| 6. Bundle output | 1 | `enhanced-name/` writer, `README.md` generator, `--git` auto-commit |
| 7. Package + provider parity | 1 | `npm i -g` smoke; 3-provider e2e; schema validation; CI green |
| 8. CI + release | 1 | GitHub Actions on 3 Windows runners; npm publish dry-run; README + docs |

**Total: ~10 working days for v1.** Solo dev, MVP scope.

---

## Out-of-band / follow-up (post-v1)

- Encrypted key storage via Windows DPAPI opt-in
- Skill file extraction (for community fork/tweak of the tool itself)
- Linux + macOS support (Q7.1 follow-up)
- Provider parity testing beyond the 5 built-ins
- Streaming mutation output
- Eval result web dashboard
- Custom rubric axes (user-defined axes)
- Cache layer (`.skill-enhance/cache/<hash>/` for skip-if-redone)

---

## Decision Trail

Q1 shape → Q2 rubric → Q3 cases → Q4 budget/pay/mutate → Q5 output → Q6 grill-me protocol → Q7 win/scope/key → Q8 loop algorithm → Q9 success criteria → Q10 question bank. Each question gave the user 2–4 options, my recommendation, rationale. User confirmed each. No silent assumptions.
