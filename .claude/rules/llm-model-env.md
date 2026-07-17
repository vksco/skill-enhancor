# LLM model via env (per-provider, provider-agnostic by design)

## Why this exists

The CLI must be provider-agnostic. No hardcoded default to Anthropic / OpenAI / anyone. The user picks a provider by setting env vars (or `.env`) — auto-detect picks it up at module load. Shipping a new model should not require shipping a new CLI version.

## Auto-detect (priority order, top-to-bottom)

`src/env.ts` walks these providers in this order and picks the first one whose `*_API_KEY` is set + ≥10 chars:

1. `custom` (most specific — user explicitly configured an OpenAI-compat endpoint)
2. `minimax` (OpenAI-compat, brand-specific)
3. `google`
4. `openai`
5. `anthropic`

If **zero** keys are set → fail with a list of supported providers (so the user can pick one).
If **2+** keys are set without `--provider` → fail with the ambiguity message (silently picking the first is a footgun — surprises the user).

```sh
$env:MINIMAX_API_KEY = "..."        # → detected as minimax
$env:MINIMAX_BASE_URL = "..."       # required
$env:MINIMAX_MODEL = "MiniMax-M3"   # optional, default per registry
node --import tsx src/spike.ts      # picks minimax automatically
```

## Env var inventory

| Var | Provider | Required | Default |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | anthropic | yes | — |
| `ANTHROPIC_MODEL` | anthropic | no | `claude-sonnet-5` |
| `OPENAI_API_KEY` | openai | yes | — |
| `OPENAI_MODEL` | openai | no | `gpt-5` |
| `GOOGLE_API_KEY` | google | yes | — |
| `GOOGLE_MODEL` | google | no | `gemini-2.5-pro` |
| `MINIMAX_API_KEY` | minimax | yes | — |
| `MINIMAX_BASE_URL` | minimax | yes | — |
| `MINIMAX_MODEL` | minimax | no | `MiniMax-M3` |
| `CUSTOM_API_KEY` | custom | yes | — |
| `CUSTOM_BASE_URL` | custom | yes | — |
| `CUSTOM_MODEL` | custom | yes | — |
| `SPIKE_MODEL` | src/spike.ts only | no | `claude-haiku-4-5-20251001` |
| `SKILL_ENHANCE_ROUNDS` | iteration (post-Phase 4) | no | `10` |
| `SKILL_ENHANCE_STAGNATION` | iteration (post-Phase 4) | no | `3` |
| `SKILL_ENHANCE_MASTERY_COMPOSITE` | mastery gate (post-Phase 4) | no | `9.5` |
| `SKILL_ENHANCE_MASTERY_AXIS` | mastery gate (post-Phase 4) | no | `9.0` |
| `SKILL_ENHANCE_TOKEN_CEILING` | cost guard (post-Phase 4) | no | `2000000` |

## `.env` autoload (only outside tests)

`dotenv` is installed; `src/env.ts` calls `loadDotenv()` once at module load **when `NODE_ENV !== "test"`**. So:

- Real CLI runs read `.env` automatically.
- Tests run with `NODE_ENV=test` (set by `vitest.config.ts` → `test.env`) → dotenv skipped → tests fully control `process.env`.

We never let dotenv **override** existing process.env values (its default behavior) — session-set envs win.

## Discipline: single read site (`src/env.ts`)

**No `process.env.X` in feature code.**

```ts
// ✅ correct
import { loadEnv } from "./env.js";
const env = loadEnv();                      // auto-detect from .env / session
const env = loadEnv({ provider: "anthropic" }); // explicit override
const model = env.model;                    // resolved, defaulted, type-safe

// ❌ wrong
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";  // bypassed auto-detect
```

Why: a single read site means there's exactly one place for validation, defaults, deprecation warnings, audits. Spreading `process.env` reads across files is how env coupling goes silent and rot accumulates.

## Adding a new provider

1. Add entry to `ProviderId` union in `src/env.ts`.
2. Add entries to `API_KEY_ENV`, `MODEL_ENV`, `DEFAULT_MODELS` maps.
3. If OpenAI-compat: also add to `BASE_URL_REQUIRED` set + `BASE_URL_ENV` partial.
4. Insert into `detectProvider`'s priority `order` array (most-specific end of the list).
5. Add `.env.example` row with comment.
6. Add unit test in `__tests__/env.test.ts` for: default model, model override, missing key, missing required extra (e.g. baseURL), auto-detect.
7. Update SPEC.md Architecture → env section.

## Anti-patterns

- ❌ `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5"` inside a feature module.
- ❌ Env defaults declared in two places (drift hazard).
- ❌ Treating missing env as a "soft skip" deep in the loop. Fail loud at module load.
- ❌ Env var names that don't match the provider prefix (e.g. `MY_KEY` for Anthropic).
- ❌ Asking the user "what's your API key?" — see [fact-check.md](./fact-check.md) §"Credentials".
- ❌ Hardcoded `provider = "anthropic"` anywhere outside `DEFAULT_MODELS`.
