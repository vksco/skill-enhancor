# Testing rules (extends `CLAUDE.md`)

Detailed patterns for `__tests__/` at the project root. See `CLAUDE.md` for the top-level summary.

---

## File layout

```
__tests__/
├── env.test.ts              # env loader: defaults, override, missing required key
├── spike.test.ts            # spike: missing key → clear error + exit 1
├── cases-io.test.ts         # cases.json freeze + sha256 invariant
├── rubric.test.ts           # composite calc, per-axis guard, mastery gate
├── registry.test.ts         # provider registry lookup + custom baseURL
└── e2e/
    ├── cli-help.test.ts     # skillenhance (no args) → help + exit 0
    ├── cli-config.test.ts   # skillenhance config → reads/writes ~/.skill-enhance/config.json
    ├── cli-enhance.test.ts  # skillenhance ./fixture → bundle output + exit 0
    ├── cli-from-doc.test.ts # --from-doc path
    └── providers-parity.test.ts  # anthropic, openai, minimax all reach ≥0.5 improvement on fixture
```

E2E tests live under `__tests__/e2e/` so unit + e2e can be run separately:

```sh
npm test                 # unit only
npm test -- __tests__/e2e/  # e2e only (skipped in CI without API key flag)
```

---

## Unit test patterns

Use vitest's `describe`/`it`/`expect`. Imports at top, no setup-heavy fixtures.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadEnv } from "../src/env.js";

describe("loadEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns default model when env unset", () => {
    vi.stubEnv("ANTHROPIC_MODEL", "");
    expect(loadEnv().anthropicModel).toBe("claude-sonnet-5");
  });

  it("fails loud when ANTHROPIC_API_KEY is missing for anthropic provider", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => loadEnv({ provider: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
```

---

## Mocking LLM providers

**Never** hit real Anthropic / OpenAI / Minimax in CI. Always mock at the AI SDK seam.

```ts
import { vi } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({
    text: "Mocked skill mutation result.",
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  })),
  streamText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({})),
}));
```

Reuse this mock block across tests by extracting to `__tests__/helpers/mock-ai-sdk.ts`.

---

## E2E patterns (CLI spawn)

```ts
import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve(__dirname, "../../dist/cli.js");

function run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("node", [CLI, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolveRun({ stdout, stderr, exitCode: code ?? 0 }));
    child.on("error", rejectRun);
  });
}

describe("cli help", () => {
  it("prints help and exits 0", async () => {
    const r = await run([]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/skillenhance/i);
  });
});
```

Build `dist/cli.js` via `npm run build` before running e2e.

---

## Coverage gate

`vitest run --coverage` enforces ≥80% lines on `src/`. Config in `vitest.config.ts`:

```ts
export default {
  test: {
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/spike.ts"],    // spike is a one-off demo, not product
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
};
```

PR fails if coverage < 80%. No exceptions for new code.

---

## Anti-patterns (don't do these)

- ❌ `import { foo } from "../src/foo.js"` vs `from "../src/foo"` — be consistent. Use `.js` extension (NodeNext ESM requirement).
- ❌ Hitting real APIs in `npm test`. Use `vi.mock`.
- ❌ Tests that pass `process.env.X = "..."` and don't restore — use `vi.stubEnv` + `vi.unstubAllEnvs`.
- ❌ E2E tests that depend on each other (each must be runnable alone).
- ❌ Snapshot tests for LLM output (snapshots become noise; assert structure instead).
- ❌ `it.only` / `describe.only` left in committed code.
