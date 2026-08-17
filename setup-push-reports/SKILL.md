---
name: setup-push-reports
description: Set up automated push reporting for this repository in one command. Enrols the repo with a workspace join code, configures the GitHub Action and repo secrets, installs the report tooling, and adds the CLAUDE.md instruction that makes Claude Code write a status report before every push. Use when the user asks to set up push reports, connect a repo to the dashboard, or pastes a join code like acme-7K2M-9XQ4.
---

# Set up push reports

Configure this repository to send a status report to the dashboard on every push.

The user supplies a **join code** — something like `craft-crew-7K2M-9XQ4` — which
identifies their workspace. Everything else is automatic.

**Never print the repo credential** in output, in a commit, or in a log. It goes
straight into GitHub secrets and is then discarded. The join code is safe to
echo; the credential is not.

---

## Inputs

- **Join code** — from the argument the user passed, or ask for it if absent.
  Codes look like `<slug>-XXXX-XXXX`. Accept any casing.
- **Dashboard URL** — defaults to `https://project-dashboard-monitoring.vercel.app`.
  Override only if the user names a different one.

Set both as shell variables (`JOIN_CODE`, `DASHBOARD_URL`) before starting.

---

## Step 1 — Preflight

Run these and **stop at the first failure**. A half-configured repo is worse
than an unconfigured one, because the developer believes it works.

```bash
git rev-parse --is-inside-work-tree
gh --version
gh auth status
git remote get-url origin
node --version
```

| Failure | What to tell the user |
|---|---|
| Not a git repo | "This isn't a git repository. Run `git init`, add a remote, and try again." |
| `gh` missing | "The GitHub CLI isn't installed — get it from https://cli.github.com, then re-run this." |
| `gh` not authenticated | "Run `gh auth login -s workflow` first. The `workflow` scope is required, because setup pushes a workflow file." |
| No remote | "This repo has no `origin` remote. Push it to GitHub first." |
| No node | "Node.js is required to render the report PDF." |

## Step 2 — Identify the repository

```bash
SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
```

If this fails the repo probably isn't on GitHub yet — say so and stop.

## Step 3 — Enrol the repo

Exchange the join code for a credential scoped to this one repository.

```bash
GH_LOGIN="$(gh api user -q .login)"
GH_NAME="$(gh api user -q '.name // empty')"

jq -nc --arg code "$JOIN_CODE" --arg repo "$SLUG" \
       --arg login "$GH_LOGIN" --arg name "$GH_NAME" \
  '{code: $code, repo: $repo, github_login: $login}
   + (if $name == "" then {} else {github_name: $name} end)' \
| curl -s -X POST "$DASHBOARD_URL/api/enroll" \
    -H "Content-Type: application/json" --data-binary @-
```

The response contains `token` and `tenant.name`. Handle failures plainly:

| Response | Meaning |
|---|---|
| `invalid_code` | Wrong or revoked. Ask them to check with their admin. |
| `expired_code` / `code_exhausted` | No longer usable; they need a new one. |
| `repo_claimed` | Already enrolled in a different workspace. An admin there must remove it first. |

Re-running on an enrolled repo is fine — it rotates the credential and returns
`rotated: true`. Say so rather than reporting it as new.

## Step 4 — Set the repo secrets

This is what makes setup one command: no GitHub settings UI, no manual entry.

```bash
gh secret set DASHBOARD_URL --body "$DASHBOARD_URL" --repo "$SLUG"
gh secret set REPORT_TOKEN  --body "$TOKEN"         --repo "$SLUG"
```

Secrets overwrite cleanly, so this is safe to repeat.

## Step 5 — Install the files

Copy from this skill's `templates/` directory, overwriting existing copies:

| Template | Destination |
|---|---|
| `report.yml` | `.github/workflows/report.yml` |
| `add-report-entry.mjs` | `.github/add-report-entry.mjs` |
| `render-report-pdf.mjs` | `.github/render-report-pdf.mjs` |
| `report-entry.schema.json` | `.github/report-entry.schema.json` |
| `report-document.schema.json` | `.github/report-document.schema.json` |

Then create the reports directory:

```bash
mkdir -p reports && touch reports/.gitkeep
```

Do **not** create `reports/report.json` — the first report entry creates it.

## Step 6 — Mark PDFs as binary

Ensure `.gitattributes` contains:

```
*.pdf binary
```

Without it, git rewrites line endings in the PDF on Windows checkouts and
corrupts the file. Create the file if absent; append if the line is missing.

## Step 7 — Update CLAUDE.md

Append `templates/claude-md-block.md` to `CLAUDE.md`, creating the file if
absent.

**This must be idempotent.** The block is delimited by:

```
<!-- push-reports:start -->
...
<!-- push-reports:end -->
```

If those markers exist, replace everything between them. Never append a second
copy.

## Step 8 — Write the first report entry

Follow the instructions now in `CLAUDE.md` and add an entry describing the
setup itself — that both seeds the log and proves the tooling runs:

```bash
node .github/add-report-entry.mjs <entry.json>
```

## Step 9 — Commit and push

```bash
git add .github reports CLAUDE.md .gitattributes
git commit -m "chore: set up push reporting"
git push
```

Stay on the current branch. Do not create one, and do not push to a different
one.

## Step 10 — Report back

Confirm in a few lines:

- which repository was configured, and which workspace it joined
- that both secrets are set
- that the first report was sent, and where to see it
- if the credential was rotated rather than newly issued, mention it

Do not print the token, and do not print the enrolment response verbatim — it
contains the token.

---

## Idempotency

Running this twice must be safe:

- workflow, scripts, schemas — overwrite
- `CLAUDE.md` block — replace between markers, never duplicate
- `.gitattributes` — append only if missing
- secrets — overwrite (GitHub's default)
- enrolment — rotates the credential rather than erroring
- `reports/report.json` — left alone; it is append-only history

## What the developer does afterwards

Nothing. Saying "push this" to Claude Code produces a report automatically,
because of the `CLAUDE.md` block. A plain `git push` still registers — the
Action builds a stub from commit metadata, so a push never produces silence.
