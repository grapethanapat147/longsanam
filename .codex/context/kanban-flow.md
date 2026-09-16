# Kanban Flow — Longsanam (LSN)

Ticket-first workflow, mirroring the convention used in the ICW and Famai projects.

## Board files
- `.codex/tasks/backlog.md`
- `.codex/tasks/in-progress.md`
- `.codex/tasks/review.md`
- `.codex/tasks/done.md`

## Ticket files
`.codex/tasks/tickets/LSN-XXXX.md` — one file per ticket, 4-digit zero-padded.

## States
`Backlog -> In Progress -> Review -> Done`

## Rules
1. Every code change belongs to exactly one open ticket.
2. A ticket moves to **Review** only when its acceptance criteria are all met and its tests pass.
3. A ticket moves to **Done** only after review notes are appended to the ticket file.
4. Next ticket number:
   `find .codex/tasks/tickets -maxdepth 1 -type f -name 'LSN-[0-9][0-9][0-9][0-9].md' -exec basename {} .md \; | sed 's/^LSN-//' | sort -n | tail -1`
5. Branch naming: `feature/LSN-XXXX` or `bugfix/LSN-XXXX`.

## Definition of Done
- Acceptance criteria satisfied.
- `npm run lint`, `npx tsc --noEmit`, and `npm test` all pass.
- No non-functional UI: every rendered control either works or is explicitly disabled with a reason.
- Any new status transition is written to `audit_logs`.
- Relaxing a constraint or unique index means auditing every reader of the old
  invariant, not just the constraint. Readers built on the old guarantee do not
  error — they silently pick the wrong row — and the existing tests stay green
  because no fixture yet produces the newly possible state. Say in the review
  notes how many call sites were found and how they were located. (LSN-0024)
