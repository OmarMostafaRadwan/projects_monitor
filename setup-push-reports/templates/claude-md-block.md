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

### Keep `docs/features.md` current — every push

`docs/features.md` describes **what this project does today**, in the present
tense. Not what changed this week — that is what the report entry is for. If a
push adds, removes or meaningfully alters a capability, update this file in the
same push.

**Incremental edits are not enough on their own.** Updating only what you
just touched means the file slowly stops matching the project: capabilities
removed by someone else stay listed, and whole areas nobody happened to work on
never get described. So the file carries a marker:

```markdown
<!-- full-review: 2026-01-31 -->
```

When that date is **more than 90 days old** — the Action warns when it is — stop
editing incrementally and do a full pass.

A full pass is not "read it again and see if anything looks wrong" — that finds
what you already remember. Rebuild the inventory the way setup did: list the
project's routes, commands or public entry points **with a command**, then check
every one against the document. Add what is missing, delete what no longer
exists, correct what is now wrong, and move anything you could not account for
into the "Not yet described" section rather than leaving it unmentioned.

Then set the date to today and say in that push's report entry how many entries
you found and how many are described.

Then render the two documents a non-technical reader actually opens:

```bash
node .github/render-features.mjs
```

That writes `docs/features.pdf` and `docs/features.docx`. Never hand-edit
either; they are generated, and an edit is lost on the next push. Stage all
three together.

**Write it for someone who will never open the code.** Capabilities, in plain
language, grouped by what a person is trying to do. No file names, no function
names, no framework names. A section that says what the project deliberately
does *not* do is worth more than three that restate the obvious.

The renderer understands a small, fixed set of Markdown, and silently ignores
anything else — so keep to it:

- `# Title` once, at the top
- a lead paragraph directly under it
- `## Section` and `### Subsection`
- `- bullets` and plain paragraphs
- `**bold**` inline

### Keep the project's own documentation current

The dashboard shows each project's README and screenshots next to its push
history, so someone can see what the project *is* — not only what changed last
week. Both are read from this repo on every push, so keeping them true is part
of the work, not a separate chore.

- **`README.md`** — update it when what the project does changes. It is read by
  people who will never open the code.
- **`docs/screenshots.config.json`** — the list of pages the dashboard shows.
  **This is your job, and it is the only screenshot work you do.** Add an entry
  when you add a page, remove one when a page goes away, and fix a path when a
  route changes. Keep the `NN-` prefixes so they sort into the order a person
  meets them.

CI takes the pictures, not you. On every push to the default branch it starts
the app, captures exactly the pages this file lists, and uploads them — so what
the dashboard shows is what the code currently renders. You have no browser, and
guessing at a screenshot is worse than having none.

**Never commit image files for this.** Only the config is committed. Git keeps
every version of a binary forever and images do not compress between versions,
so committing a megabyte per push grows the repository permanently. If you find
images in `docs/screenshots/`, they are from the older arrangement and the
config supersedes them.

If a page needs a login, the config names the *environment variables* holding
the credentials — never the credentials themselves. This file is committed.

### Rules

- Entries are **append-only**. Never edit or delete a past entry; if something
  was wrong, add a new entry saying so.
- Report what actually happened, including work that failed or was abandoned.
- If a push is trivial (a typo fix), still write an entry — a short honest one
  is fine, and silence is indistinguishable from a project nobody is working on.

<!-- push-reports:end -->
