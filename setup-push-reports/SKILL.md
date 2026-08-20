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
- **Dashboard URL** — defaults to `https://portal.craft-crew.org`. Override only
  if the user names a different one.

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
| `gh` missing | "The GitHub CLI isn't installed — get it from https://cli.github.com, then restart me and re-run this." |
| `gh` not authenticated | "Run `gh auth login -s workflow` in your own terminal, then re-run this." |
| No remote | "This repo has no `origin` remote. Push it to GitHub first." |
| No node | "Node.js 18 or newer is required — it builds the enrolment request and renders the report PDF." |

### Installing or authenticating `gh` is the user's job, not yours

**Never run `gh auth login` or `gh auth refresh` yourself, and never try to
install `gh`.** Both auth commands open a browser and wait for a one-time code
typed into it. Your shell has no interactive input, so the command does not
prompt you — it hangs until it is killed, or fails with a message about the
terminal rather than about authentication. Retrying, or piping input at it,
wastes the user's time and can leave a half-written credential in their keyring.

When `gh` is missing or unauthenticated: **stop.** Do not continue to Step 2, do
not enrol, do not write any files. Tell the user the exact command to run in
their own terminal, and that you will pick it up once they have. A repo that is
half set up is worse than one that is untouched, because they believe it works.

**Check the token's scopes, do not assume.** `gh auth status` prints them.
Setup pushes a workflow file, which GitHub refuses without `workflow`:

- Scopes already include `workflow` → **say so and move on.** Do not tell the
  user to re-authenticate; that churns a working keyring entry for nothing.
- Scopes lack `workflow` → stop and ask them to run
  `gh auth refresh -h github.com -s workflow`, which adds the scope without
  discarding the existing login. Same rule as above: they run it, not you.

**Nothing here needs `jq` or any other tool.** Only `git`, `gh` and `node`,
which the checks above confirm.

**Note the current branch** — you will need it at step 9:

```bash
git rev-parse --abbrev-ref HEAD
git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || echo "origin/main"
```

## Step 2 — Identify the repository

```bash
SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
```

If this fails the repo probably isn't on GitHub yet — say so and stop.

## Step 3 — Enrol the repo

Exchange the join code for a credential scoped to this one repository.

Built and sent with `node`, which the preflight already confirmed. **Do not use
`jq`** — it is not installed by default on Windows or macOS, and requiring it
turns a working setup into a package-manager errand.

**The token must never reach stdout.** Anything printed here lands in the
conversation transcript, which is exactly where a credential must not be. So
the token is written to a file and only a safe summary is printed:

```bash
GH_LOGIN="$(gh api user -q .login)"
GH_NAME="$(gh api user -q '.name // empty')"
TOKEN_FILE="$(node -e 'console.log(require("path").join(require("os").tmpdir(), "prr-" + Date.now() + ".tmp"))')"

node -e '
const fs = require("fs");
const [code, repo, login, name, url, tokenFile] = process.argv.slice(1);
const body = { code, repo, github_login: login };
if (name) body.github_name = name;
fetch(url + "/api/enroll", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
  .then(async (r) => {
    const j = await r.json();
    if (!r.ok || !j.ok) {
      // Errors carry no token, so they are safe to show in full.
      console.error("enrol failed:", JSON.stringify(j));
      process.exit(1);
    }
    fs.writeFileSync(tokenFile, j.token, { mode: 0o600 });
    // Everything EXCEPT the token.
    console.log(JSON.stringify({
      ok: true, repo: j.repo, rotated: j.rotated, tenant: j.tenant,
    }));
  })
  .catch((e) => { console.error("enrol failed:", e.message); process.exit(1); });
' "$JOIN_CODE" "$SLUG" "$GH_LOGIN" "$GH_NAME" "$DASHBOARD_URL" "$TOKEN_FILE"
```

**Never `cat`, echo, or otherwise read `$TOKEN_FILE` into your output.** It is
consumed by the next step and deleted there.

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

The token goes from file to secret without passing through your output. `gh
secret set` reads stdin when `--body` is omitted, so redirecting the file keeps
the token out of the argument list too — arguments are visible in a process
listing:

```bash
gh secret set DASHBOARD_URL --body "$DASHBOARD_URL" --repo "$SLUG"
gh secret set REPORT_TOKEN --repo "$SLUG" < "$TOKEN_FILE"

# Always, including if the command above failed.
rm -f "$TOKEN_FILE"
```

Secrets overwrite cleanly, so this is safe to repeat.

If `gh secret set` is blocked by a permission prompt, that is reasonable — it
writes a credential. Ask the user to approve it rather than looking for another
route, and **do not** print the token so they can set it by hand.

## Step 5 — Install the files

**First, check you are not about to destroy someone else's workflow.**
`report.yml` is a generic name, and an existing project may already have one
that has nothing to do with this:

```bash
head -1 .github/workflows/report.yml 2>/dev/null
```

- File absent, or first line is `name: Push report` → ours, or new. Proceed.
- Anything else → **stop and ask.** Offer to install as
  `.github/workflows/push-report.yml` instead, and use that name for the rest
  of this step. Never overwrite a workflow you did not write.

Then copy from this skill's `templates/` directory, overwriting only our own
previous copies:

| Template | Destination |
|---|---|
| `report.yml` | `.github/workflows/report.yml` |
| `add-report-entry.mjs` | `.github/add-report-entry.mjs` |
| `render-report-pdf.mjs` | `.github/render-report-pdf.mjs` |
| `report-entry.schema.json` | `.github/report-entry.schema.json` |
| `report-document.schema.json` | `.github/report-document.schema.json` |
| `capture-screenshots.mjs` | `.github/capture-screenshots.mjs` |

Then create the reports directory:

```bash
mkdir -p reports && touch reports/.gitkeep
```

An existing `reports/` directory is fine — nothing in it is touched. Do **not**
create `reports/report.json`; the first report entry creates it, and the tool
refuses to overwrite one belonging to something else.

### Screenshots, if this project has pages

The dashboard shows screenshots of a project's pages. They are captured by CI on
every push to the default branch, never committed, and never taken by you — you
have no browser, and a repository that commits an image per push grows forever.

**Decide whether this project has pages at all.** Look at `package.json` for a
start script, and at the project layout. A web application qualifies; a library,
a CLI, or a service with no interface does not. If it does not, skip this
section entirely and say so at Step 10 — a config file that cannot be satisfied
produces a failing job on every push.

If it does, create `docs/screenshots.config.json` using
`templates/screenshots.config.json` as the shape, **filled in with this
project's real values** rather than copied verbatim:

- `install`, `build`, `start` — the project's actual commands. Read them from
  `package.json`; a build that is not needed should be `""`, not invented.
  **Pick the package manager from the lockfile, not from habit.** `npm ci`
  against a `pnpm-lock.yaml` fails immediately and takes the whole capture with
  it. `pnpm-lock.yaml` → `corepack enable && pnpm install --frozen-lockfile`,
  `yarn.lock` → `corepack enable && yarn install --immutable`, `bun.lockb` →
  `bun install --frozen-lockfile`, `package-lock.json` → `npm ci`. If the app
  lives in a subdirectory, `cd` into it **in every one of the three commands** —
  each runs from the repository root, independently of the others.
- `port` and `readyPath` — where the started app answers.
- `pages` — the routes a person actually meets, numbered in that order. **List
  them from the router, and list all of them** up to the limit of twelve; do not
  stop at three because three were easy to find. A dashboard showing four of a
  product's eleven screens misrepresents it, and nothing later will notice the
  omission. For a route with parameters, pick one real instance that will still
  exist later.

  **Never list a page that displays a credential.** Anything showing an API key,
  an invite link, a join code or a token becomes a picture on a dashboard that
  everyone with project access can see. Skip it and say why in the config, in a
  `$comment` next to the page list.
- `auth` — only if the interesting pages are behind a login. It names the
  environment variables holding the credentials; it never contains them. Delete
  the block for a public site, and tell the user at Step 10 which repo secrets
  to add if you kept it.

**Work out what the app needs in order to start, and say so.** Most real
applications refuse to boot without a database URL or an API key, and CI has
none of them. Look for `.env.example`, a `.env` template, or whatever the README
tells a new developer to set. Any repo secret named `SCREENSHOT_ENV_FOO` is
handed to the app as `FOO`, so a project needing `DATABASE_URL` needs a secret
called `SCREENSHOT_ENV_DATABASE_URL`.

You cannot create these — you do not have the values, and must not ask for them
in the conversation. Name them at Step 10 as something the user adds themselves.
Without them the capture job starts nothing, warns, and leaves the dashboard's
existing screenshots alone; it never fails a build, but it also never produces a
picture, and nobody will chase a warning they were never told to expect.

Leave an existing `docs/screenshots.config.json` alone — it is the project's
own, and it may have been tuned.

Images already committed under `docs/screenshots/` keep working, because the
report job still sends them when no config exists. Once a config is present, CI
owns the screenshots and the folder is ignored.

## Step 6 — Protect the installed files from line-ending rewrites

Ensure `.gitattributes` contains these lines, appending any that are missing
and creating the file if absent:

```
*.pdf binary
.github/workflows/report.yml text eol=lf
.github/*.mjs text eol=lf
```

Both matter, and both fail in ways that do not mention line endings:

- Without `binary`, git rewrites bytes inside the report PDF on Windows
  checkouts and corrupts it.
- Without `eol=lf`, a Windows checkout gives the workflow CRLF, and every
  carriage return inside a `run:` block reaches the Ubuntu runner as
  `$'\r': command not found`.

Leave the rest of an existing `.gitattributes` alone — only add what is missing.

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

**Check the branch first.** Setup commits `.github/`, `reports/`, `CLAUDE.md`
and `.gitattributes`. On a feature branch those files ride into whatever pull
request it becomes, which is rarely what someone wants — and they will not
notice until review.

If the current branch is not the default one, **stop and ask** before
committing:

> You're on `fix/some-branch`, not `main`. Setup adds the workflow, report
> tooling and a `CLAUDE.md` block — committing here means they land in this
> branch's pull request. Switch to `main` first, or commit here anyway?

Then, on whichever branch they chose:

```bash
git add .github reports CLAUDE.md .gitattributes
git add docs/screenshots.config.json 2>/dev/null || true
git commit -m "chore: set up push reporting"
git push
```

Do not create a branch, and do not switch branches yourself — that is the
user's call, and switching could disturb uncommitted work.

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
