<!-- push-reports:start -->

## Push reports

Before any push to GitHub, add a report entry describing the work done in this
session. Write the entry to a temp file and run:

```bash
node .github/add-report-entry.mjs <entry.json>
```

That prepends it to `reports/report.json` and re-renders `reports/report.pdf`.
Never hand-edit either file. Stage both with your code changes and push
together.

### What the entry must contain

```json
{
  "title": "Short headline in plain language",
  "summary": "...",
  "why": "...",
  "what_changed": ["..."],
  "decisions": ["..."],
  "verification": ["..."],
  "blockers": ["..."],
  "next_steps": ["..."],
  "area": "auth|ui|api|database|infra|docs|other",
  "type": "feature|fix|refactor|chore"
}
```

**`summary`** — three to five sentences for a **non-technical manager**. What
capability now exists that didn't before, and what it means for the project or
the client. No file names, no function names, no framework names. This is the
field that appears on the CEO's screen, and the one the whole system exists to
deliver. A one-line summary is rejected by the tool.

**`why`** — the reason this work happened now: the problem observed, the request
made, the bug hit. Intent only exists at the moment of the work; a diff can
never recover it.

**`what_changed`** — the concrete changes, one per entry. Technical detail
belongs here, not in the summary.

**`decisions`** — notable choices and the reasoning, including options rejected
and why. Empty array when nothing non-obvious was decided. Do not invent
entries to fill it.

**`verification`** — how you know it works: what you ran, what you checked, what
you observed. **State plainly what you did not verify.** An unverified claim
recorded as verified is worse than no report at all.

**`blockers`** — empty array when nothing is blocked, and name who or what is
being waited on. This field is the main reason this system exists, so never
leave a real blocker out to make a report look tidy.

**`files_changed`** — omit it. The Action fills it in from GitHub's own record
of the push, which is authoritative.

### Rules

- Entries are **append-only**. Never edit or delete a past entry; if something
  was wrong, add a new entry saying so.
- Report what actually happened, including work that failed or was abandoned.
- If a push is trivial (a typo fix), still write an entry — a short honest one
  is fine, and silence is indistinguishable from a project nobody is working on.

<!-- push-reports:end -->
