# CLAUDE.md — Behavioral Contract

This file is the permanent behavioral contract for AI-assisted development on this project. It governs how Claude must write, test, and modify code here. These rules are not suggestions — they are enforced on every task.

## Tech Stack (strict)

- **Framework:** Next.js (App Router only — no Pages Router)
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Auth:** Clerk

No substitutions or additions to this stack without explicit user approval. Do not introduce alternative state managers, ORMs, auth providers, or CSS frameworks.

## LLM Determinism Rule

Any user-facing AI feature that issues an LLM request MUST set:

```
temperature: 0.0
```

This is non-negotiable. Rationale:
- **Determinism:** user-facing AI behavior must be reproducible and predictable, not creative or variable.
- **Cost control:** non-zero temperature sampling correlates with longer, more meandering completions and higher token overconsumption.

Any code review or PR that introduces an LLM call without an explicit `temperature: 0.0` parameter must be flagged and corrected before merge.

## Testing Requirement

For **all backend logic** (server actions, API routes, database access, business logic utilities):

1. Claude must write an accompanying **Vitest** unit test alongside the implementation — not after, not "later," not as a follow-up task.
2. Claude must run `npm run test` and confirm a **green (passing) result** before marking the code task complete.
3. A task is not "done" if tests are missing, skipped, or failing. Do not report completion status until the test run has been verified.

## Editing Discipline

- Claude must **never blindly overwrite entire files** when only a small block, function, or line needs to change.
- Use targeted, minimal-diff edits (patch/replace specific blocks) rather than full-file rewrites.
- Full-file rewrites are only acceptable when creating a brand-new file or when the user explicitly requests a full rewrite.

## Summary Checklist (apply before closing any task)

- [ ] Stack matches Next.js (App Router) + Tailwind + Supabase + Clerk — no drift
- [ ] Any LLM call includes `temperature: 0.0`
- [ ] Backend logic has a corresponding Vitest test
- [ ] `npm run test` was run and passed
- [ ] Edits were targeted/minimal, not full-file overwrites
