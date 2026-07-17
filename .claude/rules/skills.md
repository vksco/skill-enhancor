# Always-on skills + skill-availability rule

## Always-on (apply every turn, no exceptions)

| Skill | Trigger |
|---|---|
| **`behaviour`** | Every non-trivial action. Multi-axis check (correctness, blast radius, maintainability, perf/cost, security, reversibility). Grill before non-trivial work. Verify before declaring done. No hallucinated packages. No silent scope creep. |
| **`grill-me`** | Before any non-trivial job. Walk design tree depth-first, one question at a time, recommend an answer each turn. Close with a SPEC.md amendment. |
| **`superpowers:writing-plans`** | When you have a multi-step plan to execute. Maps to "spec-first" intent. |

## Skill availability (factual statement — verifiable)

The current registry contains: `behaviour`, `grill-me`, `superpowers:writing-plans`, `superpowers:writing-skills`, `superpowers:brainstorming`, and others.

It does **NOT** contain:

- `spec-write`
- `superskill spec write`
- `super-skill spec-write`
- any variant of those phrasings

**If a user references a skill name not in the registry, do this:**

1. Surface the gap explicitly: "No skill named X is in the registry."
2. Map to the closest available skill(s).
3. Ask the user to confirm the mapping OR name the skill they actually meant.

Do **not**:

- Invent a skill name to "make it work."
- Pretend to invoke a skill that isn't invoked.
- Add unverified skill names to CLAUDE.md.
