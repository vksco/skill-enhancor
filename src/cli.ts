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
  judge      Rubric score a skill against test cases (Phase 3 standalone test).
             <SKILL> path to SKILL.md; --cases <JSON> path to cases.json.
  help       Print this help.

OPTIONS
  --provider <id>   Override auto-detected provider (anthropic|openai|google|minimax|custom).
  --model <id>      Override model id (used by judge).
  --skill <path>    Path to skill file (future: enhance command).
  --cases <path>    Path to cases.json (used by judge).
  --version         Print version and exit.
  --help, -h        Print this help and exit.

EXAMPLES
  skillenhance                              # print help
  skillenhance ping                         # smoke test with auto-detected provider
  skillenhance ping --provider minimax      # explicit provider
  skillenhance judge ./skill.md --cases ./cases.json
  skillenhance config                       # interactive setup wizard

See SPEC.md and CLAUDE.md for full documentation.
`;

interface CliArgs {
  command?: string;
  positional1?: string; // for `judge <skill-path>`
  provider?: string;
  model?: string;
  skill?: string;
  cases?: string;
  help?: boolean;
  version?: boolean;
}

/**
 * Parse argv via Node's parseArgs. Strict — unknown options → error.
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
      version: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
    allowPositionals: true,
  });

  return {
    command: positionals[0],
    positional1: positionals[1],
    provider: values.provider as string | undefined,
    model: values.model as string | undefined,
    skill: values.skill as string | undefined,
    cases: values.cases as string | undefined,
    help: values.help as boolean | undefined,
    version: values.version as boolean | undefined,
  };
}

/**
 * Top-level CLI router. Exits with 0 on success; delegates error exits to
 * `cli-errors.ts` helpers. Never returns on success (exits 0).
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
  }

  const command = args.command ?? (args.help ? "help" : "help");

  switch (command) {
    case "help":
      console.log(HELP);
      process.exit(0);

    case "ping": {
      const r = await runPing({ provider: args.provider });
      console.log(formatPing(r));
      process.exit(0);
    }

    case "config":
      await runConfigWizard();
      process.exit(0);

    case "judge": {
      const skillPath = args.positional1 ?? args.skill;
      const casesPath = args.cases;
      if (!skillPath) {
        exitUserError(
          'judge: missing skill path. Usage: skillenhance judge <SKILL> --cases <JSON>',
        );
      }
      if (!casesPath) {
        exitUserError(
          'judge: missing --cases path. Usage: skillenhance judge <SKILL> --cases <JSON>',
        );
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
      } catch (err) {
        exitInternalError(err);
      }
      break;
    }

    default:
      exitUserError(
        `Unknown command: "${command}".`,
        "Run `skillenhance --help` for the supported command list.",
      );
  }
}

// Only invoke when executed directly (not when imported by tests).
// `process.argv[1]` is the entry script path.
const isDirectInvoke =
  process.argv[1] &&
  (process.argv[1].endsWith("cli.ts") ||
    process.argv[1].endsWith("cli.js") ||
    process.argv[1].endsWith("skillenhance"));
if (isDirectInvoke) {
  runCli().catch((err) => exitUserError(err));
}
