/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cli
 * @description Top-level CLI entry. Parses argv via `node:util.parseArgs`
 *   (no extra framework dep) and routes to commands.
 *
 * Command surface:
 *   skillenhance                          → help
 *   skillenhance --version                → version
 *   skillenhance ping [--provider X]      → smoke test
 *   skillenhance config                   → interactive setup wizard
 *   skillenhance judge <SKILL> --cases <JSON> [--provider X] [--model M]
 *
 * Future phases add: enhance, package, cases commands.
 * @see SPEC.md §"CLI grammar"
 */

import { parseArgs } from "node:util";
import { runPing, formatPing } from "./commands/ping.js";
import { runConfigWizard } from "./commands/config.js";
import { runJudgeCli, formatJudgeOutput } from "./commands/judge.js";
import { runEnhanceCli, formatEnhanceResult } from "./commands/enhance.js";
import { exitUserError, exitInternalError } from "./cli-errors.js";

/** Package.json-resolved version string. */
const VERSION = "0.1.0";

const HELP = `\
skillenhance v${VERSION} — enhance Claude skills via autoresearch-style iteration.

USAGE
  skillenhance [options] [COMMAND]

COMMANDS
  ping       Smoke test: one generateText call against the active provider.
  config     Interactive setup wizard. Picks provider, sets API key + model,
             saves to .env, then runs ping to verify.
  judge      Rubric score a skill against test cases.
             <SKILL> path to SKILL.md; --cases <JSON> path to cases.json.
  enhance    Run the iteration loop on a skill: mutation → judge → keep/discard.
             --skill <path> --cases <path> [--out dir] [--rounds N] ...
  help       Print this help.

OPTIONS
  --provider <id>     Override auto-detected provider (anthropic|openai|google|minimax|custom).
  --model <id>        Override model id (used by judge + mutation).
  --skill <path>      Path to skill file (judge + enhance).
  --cases <path>      Path to cases.json (judge + enhance).
  --out <dir>         Output bundle dir for enhance (default ./enhanced-<name>/).
  --rounds N          Max iterations for enhance (default 10).
  --stagnation N      Stop after N consecutive rejects (default 3).
  --keep-epsilon      Composite improvement threshold (default 0.1).
  --axis-guard        Max single-axis drop allowed (default 0.5).
  --mastery-composite Composite for mastery (default 9.5).
  --mastery-axis      Per-axis floor for mastery (default 9.0).
  --mutation-temp     Temperature for mutation calls (default 0.3).
  --version           Print version and exit.
  --help, -h          Print this help and exit.

EXAMPLES
  skillenhance                                  # print help
  skillenhance ping                             # smoke test with auto-detected provider
  skillenhance ping --provider minimax          # explicit provider
  skillenhance judge ./skill.md --cases ./cases.json
  skillenhance enhance --skill ./skill.md --cases ./cases.json --out ./out
  skillenhance config                           # interactive setup wizard

See SPEC.md and CLAUDE.md for full documentation.
`;

interface CliArgs {
  command?: string;
  positional1?: string; // for `judge <skill-path>`
  provider?: string;
  model?: string;
  skill?: string;
  cases?: string;
  out?: string;
  rounds?: string;
  stagnation?: string;
  keepEpsilon?: string; // CLI: --keep-epsilon
  axisGuard?: string; //   CLI: --axis-guard
  masteryComposite?: string; // CLI: --mastery-composite
  masteryAxis?: string; //   CLI: --mastery-axis
  mutationTemp?: string; //  CLI: --mutation-temp
  help?: boolean;
  version?: boolean;
}

/**
 * Parse argv via Node's parseArgs. Strict — unknown options → error.
 *
 * Important: Node's parseArgs does NOT auto-kebab camelCase option IDs.
 * We register kebab-case STRING keys (e.g. "keep-epsilon") and read via
 * bracket notation. Internal CliArgs interface keeps camelCase for clarity.
 *
 * @param argv  process.argv.slice(2)
 * @returns Parsed flags + first two positionals (subcommand + argument).
 */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv as string[],
    options: {
      provider: { type: "string" },
      model: { type: "string" },
      skill: { type: "string" },
      cases: { type: "string" },
      out: { type: "string" },
      rounds: { type: "string" },
      stagnation: { type: "string" },
      "keep-epsilon": { type: "string" },
      "axis-guard": { type: "string" },
      "mastery-composite": { type: "string" },
      "mastery-axis": { type: "string" },
      "mutation-temp": { type: "string" },
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: true,
  });

  const v = values as Record<string, unknown>;
  return {
    command: positionals[0],
    positional1: positionals[1],
    provider: v.provider as string | undefined,
    model: v.model as string | undefined,
    skill: v.skill as string | undefined,
    cases: v.cases as string | undefined,
    out: v.out as string | undefined,
    rounds: v.rounds as string | undefined,
    stagnation: v.stagnation as string | undefined,
    keepEpsilon: v["keep-epsilon"] as string | undefined,
    axisGuard: v["axis-guard"] as string | undefined,
    masteryComposite: v["mastery-composite"] as string | undefined,
    masteryAxis: v["mastery-axis"] as string | undefined,
    mutationTemp: v["mutation-temp"] as string | undefined,
    help: v.help as boolean | undefined,
    version: v.version as boolean | undefined,
  };
}

/**
 * Top-level CLI router. Exits with 0 on success; delegates error exits to
 * `cli-errors.ts` helpers. Never returns on success (exits 0).
 *
 * Note on control flow: every successful command path returns from runCli
 * explicitly (in addition to process.exit) so this function is safe to
 * call from tests with process.exit mocked. process.exit is defense in
 * depth — relying solely on it would break under mock injection.
 */
export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  let args: CliArgs;
  try {
    args = parseCliArgs(argv);
  } catch (err) {
    exitUserError((err as Error).message, "Run `skillenhance --help` for usage.");
  }

  if (args.version) {
    console.log(VERSION);
    process.exit(0);
    return;
  }

  const command = args.command ?? "help";

  if (command === "help") {
    console.log(HELP);
    process.exit(0);
    return;
  }

  if (command === "ping") {
    const r = await runPing({ provider: args.provider });
    console.log(formatPing(r));
    process.exit(0);
    return;
  }

  if (command === "config") {
    await runConfigWizard();
    process.exit(0);
    return;
  }

  if (command === "judge") {
    const skillPath = args.positional1 ?? args.skill;
    const casesPath = args.cases;
    if (!skillPath) {
      exitUserError(
        'judge: missing skill path. Usage: skillenhance judge <SKILL> --cases <JSON>',
      );
      return;
    }
    if (!casesPath) {
      exitUserError(
        'judge: missing --cases path. Usage: skillenhance judge <SKILL> --cases <JSON>',
      );
      return;
    }
    try {
      const result = await runJudgeCli({
        skillPath,
        casesPath,
        provider: args.provider,
        modelId: args.model,
      });
      console.log(formatJudgeOutput(result));
      process.exit(0);
      return;
    } catch (err) {
      // File-not-found (ENOENT) on user-supplied paths is a user error,
      // not a bug. Surface as exit 1 with a helpful message. Everything
      // else gets the standard internal-error treatment.
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        exitUserError(err, "Check the skill path and --cases path exist.");
        return;
      }
      exitInternalError(err);
      return;
    }
  }

  if (command === "enhance") {
    try {
      const num = (s: string | undefined, fallback: number): number => {
        if (!s) return fallback;
        const n = Number(s);
        return Number.isFinite(n) ? n : fallback;
      };
      const result = await runEnhanceCli({
        skill: args.skill,
        cases: args.cases,
        out: args.out,
        rounds: num(args.rounds, NaN as never),
        stagnation: num(args.stagnation, NaN as never),
        keepEpsilon: num(args.keepEpsilon, NaN as never),
        axisGuard: num(args.axisGuard, NaN as never),
        masteryComposite: num(args.masteryComposite, NaN as never),
        masteryAxis: num(args.masteryAxis, NaN as never),
        mutationTemp: num(args.mutationTemp, NaN as never),
        provider: args.provider,
        model: args.model,
      });
      console.log(formatEnhanceResult(result));
      // Exit code reflects outcome:
      //   0 = mastery or rounds exhausted with improvement
      //   1 = no improvement from baseline (caller should retry with diff params)
      //   3 = verification failed (kept as exit 3 per CLI contract; not used yet)
      if (!result.reachedMastery && result.improvement <= 0) {
        process.exit(1);
      }
      process.exit(0);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        exitUserError(err, "Check skill + cases paths exist.");
        return;
      }
      exitInternalError(err);
      return;
    }
  }

  // Unknown command
  exitUserError(
    `Unknown command: "${command}".`,
    "Run `skillenhance --help` for the supported command list.",
  );
}

// Only invoke when executed directly (not when imported by tests).
// VITEST is the specific sentinel vitest sets in worker processes — checking
// it alone lets `NODE_ENV=test` users still run the real CLI from a shell.
// `process.argv[1]` is the entry script path.
const isDirectInvoke =
  process.env.VITEST !== "true" &&
  process.argv[1] &&
  (process.argv[1].endsWith("cli.ts") ||
    process.argv[1].endsWith("cli.js") ||
    process.argv[1].endsWith("skillenhance"));
if (isDirectInvoke) {
  runCli().catch((err) => exitUserError(err));
}
