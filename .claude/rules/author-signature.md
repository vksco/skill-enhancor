# Author signature

Every TypeScript file MUST open with this header block. Placeholders are removed at write time.

```ts
/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file <filename without extension>
 * @description <one-line purpose>
 * @see SPEC.md §<section anchor, optional>
 */
```

What goes in `@description`:

- One sentence stating the file's purpose (not its implementation).
- For utility files: what responsibility does this module own? What is explicitly NOT its job?
- For test files: what behavior is under test and at what surface (unit / e2e / cli spawn)?

What MUST NOT go in headers:

- Implementation details (those live in function-level JSDoc).
- Change logs / history.
- TODO lists (use GitHub Issues, not file headers).

Source: project rule — Vikash Sharma, project owner.
