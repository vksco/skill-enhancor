# Fact-check rule (mandatory, both directions)

Before stating any non-trivial fact — package name, API shape, version, command, URL, file path, behavior claim — verify via primary source:

| Claim type | Primary source |
|---|---|
| npm package name + version | `npm view <pkg> version` |
| GitHub content + line numbers | `gh api` / `WebFetch` |
| Local file existence + content | `Read` |
| CLI command correctness | `node -e "..."` / `--help` |
| API behavior + signatures | installed `node_modules/<pkg>/dist/*.d.ts` |

## Required response shape

When stating a verifiable fact:

```
[fact] <claim>
[source] <where it was verified>
```

When a fact cannot be verified in this turn:

```
[fact] I have not verified X. Will check before relying on it.
```

## Both directions

**Both the user and the assistant can be wrong.**

- When the user states a fact, treat it as a **hypothesis**, not a fact, until confirmed by primary source.
- If the user's claim and a primary-source check contradict each other, **surface the contradiction explicitly**.
- Don't be polite. Don't be sycophantic. Correct is more important than agreeable.

## What this rule kills

- Slopsquatting: hallucinated package names that an attacker registered after the same hallucination. Real and active threat per Spracklen et al., USENIX Security 2025 (arXiv 2406.10279).
- Stale memory across long sessions.
- AI confabulation in code generation.
- User assertions that "X is the latest version" without check.
- Cross-turn drift: "I said X last turn" treated as evidence rather than claim.

## Anti-patterns

- ❌ "I'm pretty sure the API uses X" — state the verification or don't state the fact.
- ❌ `npm install <name>` without `npm view <name>` first.
- ❌ Quoting an API shape from memory when the `.d.ts` is sitting in `node_modules/`.
- ❌ Citing a URL you haven't fetched.

## Credentials (do not ask, do not echo)

**Never ask the user for API keys, tokens, or any other credential values.**

That includes:

- ❌ "What is your ANTHROPIC_API_KEY?"
- ❌ "Paste your key so I can verify."
- ❌ "Can you confirm the secret you set?"
- ❌ Reading `~/.skill-enhance/config.json` or `.env` and echoing values back.

Acceptable behavior:

- ✅ Trust the user's stated setup ("I added the key in .env").
- ✅ Run the verifier (CLI invocation, tests).
- ✅ Surface the **exact missing env var name** on failure (no values).
- ✅ Suggest the env var name to set ("Set `$env:MINIMAX_BASE_URL = "..."`").
- ✅ Read `.env` or `config.json` to check **presence** of keys (variable names), not values.

Why: security + flow. Credentials are sensitive; asking for them forces the user to paste secrets into chat (logged in shell history, transcripts, etc.). The tool's design is provider-agnostic — auto-detect + verify-by-running handles this without ever seeing the secret.
