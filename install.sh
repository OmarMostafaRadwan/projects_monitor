#!/usr/bin/env bash
# Installs the setup-push-reports skill into ~/.claude/skills.
#
#   curl -fsSL https://raw.githubusercontent.com/OmarMostafaRadwan/projects_monitor/main/install.sh | bash
#
# Installs to the PERSONAL skills directory rather than a project's, because
# the whole point is onboarding arbitrary repos — a project-scoped copy would
# only be available in the one repo you happened to install it into.
set -euo pipefail

REPO="${PUSH_REPORTS_REPO:-OmarMostafaRadwan/projects_monitor}"
BRANCH="${PUSH_REPORTS_BRANCH:-main}"
SKILL="setup-push-reports"
DEST="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

command -v curl >/dev/null || { echo "curl is required"; exit 1; }
command -v tar  >/dev/null || { echo "tar is required";  exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $SKILL from $REPO@$BRANCH..."
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" \
  | tar -xz -C "$tmp"

src="$(find "$tmp" -maxdepth 2 -type d -name "$SKILL" | head -n1)"
[ -n "$src" ] || { echo "Could not find $SKILL in the archive"; exit 1; }

mkdir -p "$DEST"
# Replace rather than merge: a stale template left behind by an older version
# is worse than a clean reinstall.
rm -rf "${DEST:?}/$SKILL"
cp -r "$src" "$DEST/$SKILL"

echo
echo "Installed to $DEST/$SKILL"
echo
echo "Next:"
echo "  1. gh auth login -s workflow     # the workflow scope is required"
echo "  2. Restart Claude Code"
echo "  3. In any repo:  /setup-push-reports <your-join-code>"
