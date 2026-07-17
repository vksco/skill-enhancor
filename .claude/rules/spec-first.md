# Spec-first rule (mandatory)

Before writing any **unplanned** code:

1. Invoke `grill-me` (walk design tree, one question at a time, recommend answers).
2. If multi-step: invoke `superpowers:writing-plans` to produce a written plan.
3. Amend `SPEC.md` with the new section: **decision** + **rationale** + **alternatives considered**.
4. Only then write code.

**No unplanned code lands.** A SPEC.md phase is the smallest unit of committed work. Each phase = exactly one commit.

## What is "unplanned"

Triggers the rule (require spec amendment first):

- Adds user-visible behavior (new flag, new output, new file format).
- Touches 2+ files.
- Changes public types or CLI surface.
- Modifies the iteration algorithm, rubric, or eval cases.
- Changes env var names or schema.

Does NOT trigger (rule is overhead):

- Typo fix in a comment.
- Renamed local variable inside one function.
- Adding a `@see` to a JSDoc.
- Reformatting dead code that's about to be deleted anyway.

## When you violate the rule by accident

Stop. Revert the code. Run grill-me. Amend SPEC.md. Re-apply the code as a normal phase commit.

Do not "amend SPEC.md retroactively to match the code." That is reward hacking. The spec is the source of truth, the code follows.

## SPEC.md sections to keep evergreen

- **Locked Decisions table** — append a row, never delete.
- **Architecture** — update when phase completes, link commit.
- **In-scope / Non-goals** — explicitly add/remove. Silent drift = bug.
- **Success Criteria** — append when adding a criterion, mark (✓) when verified.
- **Build Phases** — flip status, add commit hash, never reorder.
- **Open Risks** — close when mitigated, replace with "Resolved" + pointer.

## Anti-patterns

- ❌ "I'll just ship this tiny improvement and amend SPEC.md next turn." Next turn never comes.
- ❌ SPEC.md becomes stale because nobody owned it. Owner = this turn's assistant.
- ❌ Locking decisions the user didn't actually decide. If unclear, ask.
- ❌ Long SPEC.md sections for trivial decisions. One-line decisions stay one line.
