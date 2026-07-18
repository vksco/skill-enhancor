/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file cases-io
 * @description Read + write + sha256-fingerprint cases.json files.
 *   Project rule #1: cases.json sha256 is logged in runs.jsonl header and
 *   verified at iteration start. Drift mid-loop = hard bug → fail loud.
 * @see SPEC.md §"Open Risks → consistency rule #1 (frozen cases hash)"
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { Case, CasesFile } from "./types.js";

/**
 * Compute sha256 of a canonical JSON representation of cases.
 * Canonical = keys sorted, no whitespace. Same input → same hash.
 *
 * @param file  CasesFile to fingerprint.
 * @returns 64-char hex sha256.
 */
export function fingerprintCases(file: CasesFile): string {
  const canonical = stableStringify(file);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Stable JSON serialization with sorted keys at every depth. */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          stableStringify((obj as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

/**
 * Read + parse a cases.json file from disk. Validates basic shape: must have
 * a non-empty `queries` array. Throws on malformed JSON or missing required fields.
 *
 * @param filePath Absolute path. Resolved against cwd if relative.
 * @returns Validated CasesFile.
 */
export async function readCases(filePath: string): Promise<CasesFile> {
  const abs = resolvePath(filePath);
  const raw = await readFile(abs, "utf8");
  const parsed: unknown = JSON.parse(raw);
  validateCases(parsed);
  return parsed as CasesFile;
}

/**
 * Write a CasesFile to disk as canonical JSON. The canonical form makes
 * fingerprinting deterministic across machines.
 *
 * @param filePath Absolute path.
 * @param cases    CasesFile to write.
 */
export async function writeCases(filePath: string, cases: CasesFile): Promise<void> {
  const abs = resolvePath(filePath);
  const canonical = stableStringify(cases);
  await writeFile(abs, canonical + "\n", "utf8");
}

/** Pure validator (no I/O). Used by readCases + tests. */
export function validateCases(value: unknown): asserts value is CasesFile {
  if (!value || typeof value !== "object") {
    throw new Error("[cases] root must be an object.");
  }
  const v = value as Partial<CasesFile>;
  if (!Array.isArray(v.queries)) {
    throw new Error('[cases] "queries" must be an array.');
  }
  if (v.queries.length === 0) {
    throw new Error('[cases] "queries" cannot be empty — loop has nothing to evaluate against.');
  }
  v.queries.forEach((q, i) => validateCase(q, i));
}

function validateCase(q: Partial<Case> | undefined, index: number): asserts q is Case {
  if (!q || typeof q !== "object") {
    throw new Error(`[cases] queries[${index}] must be an object.`);
  }
  if (typeof q.id !== "string" || q.id.length === 0) {
    throw new Error(`[cases] queries[${index}].id must be a non-empty string.`);
  }
  if (typeof q.input !== "string") {
    throw new Error(`[cases] queries[${index}].input must be a string.`);
  }
  if (typeof q.should_trigger !== "boolean") {
    throw new Error(`[cases] queries[${index}].should_trigger must be boolean.`);
  }
  if (q.expected !== undefined && typeof q.expected !== "string") {
    throw new Error(`[cases] queries[${index}].expected (when present) must be a string.`);
  }
  if (q.kind !== undefined && typeof q.kind !== "string") {
    throw new Error(`[cases] queries[${index}].kind (when present) must be a string.`);
  }
}
