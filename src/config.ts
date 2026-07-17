/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file config
 * @description Read + write .env files. dotenv ships a reader (used in env.ts)
 *   but no writer, so this thin module handles persistence for the
 *   `skillenhance config` wizard.
 *
 * Format: KEY=VALUE, one per line. Comments (lines starting with #) and
 * blank lines preserved. Values are written verbatim — no quoting, no
 * escaping. If a value contains '=' or starts with whitespace, callers
 * should wrap it themselves.
 *
 * @see SPEC.md §"Locked Decisions Q5 → Output artifact"
 *       (.env is the runtime config for the CLI; bundled skill output uses
 *        a separate folder; see SPEC Q5 bundle format.)
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";

/** Parsed .env file as a flat record. Comments / blanks dropped. */
export type EnvFile = Record<string, string>;

/**
 * Read a .env file from disk and return as key-value record.
 * Lines starting with `#` (after optional whitespace) are dropped. Blank
 * lines dropped. `KEY=VALUE` parsed verbatim; values are not unquoted.
 *
 * @param filePath Absolute path to the .env file. Resolved against cwd if relative.
 * @returns Parsed env. Missing file → empty record (not an error).
 */
export async function readEnvFile(filePath: string): Promise<EnvFile> {
  const abs = resolvePath(filePath);
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  return parseEnvText(raw);
}

/**
 * Parse .env-format text into a key-value record.
 * Public so tests can exercise without touching disk.
 *
 * @param text Raw file content.
 * @returns Parsed env.
 */
export function parseEnvText(text: string): EnvFile {
  const out: EnvFile = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue; // malformed; skip silently
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    out[key] = value;
  }
  return out;
}

/**
 * Write a key-value record back to disk as a .env file. Existing file
 * replaced. Comments / blanks NOT preserved (intentional — wizard writes
 * a clean canonical form).
 *
 * @param filePath Absolute path. Created if missing.
 * @param env      Record to write.
 */
export async function writeEnvFile(filePath: string, env: EnvFile): Promise<void> {
  const abs = resolvePath(filePath);
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  await writeFile(abs, lines.join("\n") + "\n", "utf8");
}

/**
 * Merge updates into an existing env record. New keys added, existing keys
 * overwritten, untouched keys preserved.
 *
 * @param base     Existing env.
 * @param updates  Partial overrides.
 * @returns New record (input not mutated).
 */
export function mergeEnv(base: EnvFile, updates: EnvFile): EnvFile {
  return { ...base, ...updates };
}
