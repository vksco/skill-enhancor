/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file v0
 * @description v0 baseline loader for the iteration loop.
 *   Phase 4's only input mode is `--skill <path>`; the file at that path
 *   becomes the v0 baseline. `--from-doc <path>` (generate v0 from free-text
 *   spec) lives in Phase 5.
 * @see SPEC.md §"Locked Decisions Q6 (grill-me bootstrap)" + Q10 (Q-bank)
 */

import { resolve as resolvePath } from "node:path";
import { readFile } from "node:fs/promises";

export interface V0Source {
  /** Absolute path to the input skill file. */
  skillPath: string;
  /** Full SKILL.md text. */
  skillText: string;
  /** Display name derived from the file name (strips .md). */
  name: string;
}

/**
 * Load v0 baseline from a skill file path.
 *
 * @param skillPath Absolute or relative path; resolved against cwd if relative.
 * @throws If the file does not exist, is not readable, or appears empty.
 */
export async function loadV0(skillPath: string): Promise<V0Source> {
  const abs = resolvePath(skillPath);
  let text: string;
  try {
    text = await readFile(abs, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`[v0] skill file not found: ${abs}`);
    }
    throw err;
  }
  if (text.trim().length === 0) {
    throw new Error(`[v0] skill file is empty: ${abs}`);
  }
  // Derive display name from file stem.
  const baseName = abs.split(/[\\/]/).pop() ?? "skill";
  const stem = baseName.replace(/\.md$/i, "");
  const name = stem || "skill";
  return { skillPath: abs, skillText: text, name };
}
