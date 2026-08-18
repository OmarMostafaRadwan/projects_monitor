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

### Keep the project's own documentation current

The dashboard shows each project's README and screenshots next to its push
history, so someone can see what the project *is* — not only what changed last
week. Both are read from this repo on every push, so keeping them true is part
of the work, not a separate chore.

- **`README.md`** — update it when what the project does changes. It is read by
  people who will never open the code.
- **`docs/screenshots/`** — one image per page or main view, named so they sort
  into the order a person meets them: `01-sign-in.png`, `02-overview.png`,
  `03-project-detail.png`. Add one when you add a page, replace the ones whose
  screen you changed, and delete the file when the page goes away. The folder is
  the source of truth: the dashboard mirrors it exactly, so a deleted file
  disappears there too.

PNG, JPEG, WebP or GIF; up to 2 MB each, 12 images, 10 MB total. Anything over a
limit is skipped with a warning in the Action log rather than failing the push.

If you changed the interface and cannot capture a screenshot yourself, say so in
`next_steps` rather than leaving a stale image in place.

### Rules

- Entries are **append-only**. Never edit or delete a past entry; if something
  was wrong, add a new entry saying so.
- Report what actually happened, including work that failed or was abandoned.
- If a push is trivial (a typo fix), still write an entry — a short honest one
  is fine, and silence is indistinguishable from a project nobody is working on.

<!-- push-reports:end -->
