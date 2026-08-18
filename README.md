# Push Reports — setup skill

A Claude Code skill that connects a repository to the Push Reports dashboard in
one command.

After setup, every push produces a plain-English status report: what changed,
why, what was decided, how it was verified, and what is blocked. Those land on a
single dashboard, so nobody has to chase people for updates or open repos one by
one.

---

## Install

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/OmarMostafaRadwan/projects_monitor/main/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/OmarMostafaRadwan/projects_monitor/main/install.ps1 | iex
```

Either installs to your personal skills directory (`~/.claude/skills`), so it is
available in **every** repo on your machine — which is the point, since you will
be onboarding arbitrary projects.

Re-run the same command any time to update.

<details>
<summary>Manual install</summary>

Copy the `setup-push-reports/` folder from this repo into `~/.claude/skills/`
(Windows: `%USERPROFILE%\.claude\skills\`). That is the whole install — the
skill is self-contained.

</details>

---

## Requirements

| | |
|---|---|
| **GitHub CLI** | authenticated, with the `workflow` scope |
| **Node.js 18+** | builds the enrolment request and renders the report PDF |
| **A join code** | from whoever runs your dashboard, e.g. `acme-7K2M-9XQ4` |

Nothing else. In particular **`jq` is not required** — it is absent by default
on Windows and macOS, and setup should not turn into a package-manager errand.

The `workflow` scope is not optional. Setup pushes a workflow file, and GitHub
rejects that push outright without it — the failure appears at the very last
step, long after everything looks fine. Check what you already have with
`gh auth status`:

```bash
# already signed in, just missing the scope — keeps your existing login
gh auth refresh -h github.com -s workflow

# not signed in at all
gh auth login -s workflow
```

---

## Use

Restart Claude Code after installing, then inside any repo:

```
/setup-push-reports acme-7K2M-9XQ4
```

That enrols the repo, sets its secrets, installs the Action and report tooling,
and pushes. It is safe to run twice — the credential is rotated rather than
duplicated.

If you are on a feature branch it will say so and ask before committing, since
the setup files would otherwise ride into that branch's pull request.

Afterwards, saying "push this" to Claude Code writes a report entry and pushes
it with your changes. A plain `git push` still registers: the Action sends a
stub built from the commit metadata, because a push that reports nothing is
indistinguishable from a project nobody is working on.

---

## What it installs in your repo

```
.github/workflows/report.yml        sends the report on every push
.github/add-report-entry.mjs        adds an entry and re-renders the PDF
.github/render-report-pdf.mjs       dependency-free PDF renderer
.github/report-entry.schema.json    the entry contract
.github/report-document.schema.json the document contract
reports/report.json                 cumulative log, newest entry first
reports/report.pdf                  readable version, most recent entries
docs/screenshots/README.md          the naming convention for page screenshots
CLAUDE.md                           the block that makes reporting automatic
.gitattributes                      marks PDFs binary so git cannot corrupt them
```

No packages are added to your project. The report tooling is plain Node with no
dependencies, so it cannot conflict with anything you already use.

---

## Things worth knowing

**The Action never fails your build.** It runs `continue-on-error` with a 15
second cap, and swallows every failure with a warning. A status tool that blocks
deploys gets deleted within a week.

**Two secrets are set on your repo**, `DASHBOARD_URL` and `REPORT_TOKEN`. The
token is scoped to that single repository, so revoking it affects nothing else.

**Reports describe your work, and leave your machine.** They contain summaries
and file names — never source code — but if you work under a contract that
restricts even that, check before onboarding a client repo.

**Your README and screenshots are sent too.** On every push the Action uploads
`README.md` and any images in `docs/screenshots/`, so the dashboard can show
what a project is rather than only what changed. That is a larger disclosure
than the reports themselves — a screenshot can contain customer names, real
data, or anything else that was on screen when it was taken. Nothing is sent
from `docs/screenshots/` until you put something there, so if that is not
appropriate for a repo, leave the folder empty and the feature stays off.

**Activity is a liveness signal, not a productivity measure.** There are no
leaderboards and no push counts, deliberately.
