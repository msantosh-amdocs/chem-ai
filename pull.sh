#!/usr/bin/env bash
# Market Research Group — pull-latest script
# Usage:  ./pull.sh [--merge] [--branch <name>] [--stash-wip] [--remote <name>]
#
# Fetches the latest commits from the remote and updates the current branch
# (or the branch you name) using `git pull --rebase` by default — matching
# the linear-history policy in digital-engineering-helper/git-standards.
#
# Safe defaults:
#   • Refuses to run if you have uncommitted changes, unless --stash-wip is
#     passed (then it stashes, pulls, and pops the stash automatically).
#   • Fetches first, then fast-forwards or rebases — never force-pushes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------- args ------------------------------------------------------------
MODE="rebase"          # rebase (default) | merge
REMOTE="origin"
BRANCH=""
STASH_WIP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --merge)      MODE="merge"; shift ;;
    --rebase)     MODE="rebase"; shift ;;
    --stash-wip)  STASH_WIP=1; shift ;;
    --remote)     REMOTE="${2:?--remote needs a name}"; shift 2 ;;
    --branch)     BRANCH="${2:?--branch needs a name}"; shift 2 ;;
    -h|--help)
      cat <<EOF
Market Research Group — pull latest changes from remote

Usage:
  ./pull.sh [--merge] [--branch <name>] [--stash-wip] [--remote <name>]

Options:
  --rebase        Use 'git pull --rebase' (default; linear history)
  --merge         Use 'git pull' (merge-style)
  --branch <n>    Pull branch <n> instead of the current one
  --remote <n>    Remote name (default: origin)
  --stash-wip     Stash uncommitted changes, pull, then re-apply
  -h, --help      Show this help
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ---------- colours ---------------------------------------------------------
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'
  YLW=$'\033[33m'; BLU=$'\033[34m'; MAG=$'\033[35m'; CYN=$'\033[36m'; R=$'\033[0m'
else
  B=""; DIM=""; RED=""; GRN=""; YLW=""; BLU=""; MAG=""; CYN=""; R=""
fi
info()  { printf "${CYN}▸${R} %s\n" "$*"; }
ok()    { printf "${GRN}✓${R} %s\n" "$*"; }
warn()  { printf "${YLW}⚠${R} %s\n" "$*"; }
fail()  { printf "${RED}✗${R} %s\n" "$*" >&2; }

banner() {
  printf "\n${B}${MAG}Market Research Group${R} ${DIM}· pull latest from ${REMOTE}${R}\n"
  printf "${DIM}──────────────────────────────────────────────────${R}\n"
}

# ---------- prerequisites ---------------------------------------------------
require_git() {
  command -v git >/dev/null 2>&1 || { fail "git is not installed."; exit 1; }
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || { fail "Not a git repository: $SCRIPT_DIR"; exit 1; }
}

# ---------- main ------------------------------------------------------------
banner
require_git

# Verify remote exists.
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  fail "Remote '$REMOTE' is not configured. Available:"
  git remote -v || true
  exit 1
fi
ok "Remote $REMOTE → $(git remote get-url "$REMOTE")"

# Determine target branch.
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ -z "$BRANCH" ]; then
  BRANCH="$CURRENT_BRANCH"
fi

if [ "$CURRENT_BRANCH" = "HEAD" ]; then
  fail "You are in a detached-HEAD state. Check out a branch first."
  exit 1
fi

if [ "$BRANCH" != "$CURRENT_BRANCH" ]; then
  info "Switching from ${B}$CURRENT_BRANCH${R} to ${B}$BRANCH${R}"
  git checkout "$BRANCH"
fi
ok "On branch $BRANCH"

# Uncommitted-changes guard.
DID_STASH=0
if ! git diff --quiet || ! git diff --cached --quiet; then
  if [ "$STASH_WIP" = "1" ]; then
    info "Stashing local changes (WIP · $(date +%H:%M:%S))"
    git stash push -u -m "pull.sh WIP $(date +%Y-%m-%dT%H:%M:%S)"
    DID_STASH=1
    ok "Stash saved"
  else
    fail "You have uncommitted changes. Commit them, or re-run with --stash-wip."
    git status --short
    exit 1
  fi
fi

# Fetch first (so we can report what's incoming), then integrate.
info "Fetching $REMOTE…"
git fetch --prune "$REMOTE"

BEFORE_SHA="$(git rev-parse HEAD)"
REMOTE_REF="$REMOTE/$BRANCH"

if ! git rev-parse --verify "$REMOTE_REF" >/dev/null 2>&1; then
  fail "Remote branch $REMOTE_REF does not exist."
  [ "$DID_STASH" = "1" ] && { warn "Restoring stash"; git stash pop || true; }
  exit 1
fi

INCOMING="$(git rev-list --count "HEAD..$REMOTE_REF")"
OUTGOING="$(git rev-list --count "$REMOTE_REF..HEAD")"
info "Local is ${B}$OUTGOING${R} commit(s) ahead, ${B}$INCOMING${R} behind $REMOTE_REF"

if [ "$INCOMING" = "0" ]; then
  ok "Already up to date."
  [ "$DID_STASH" = "1" ] && { info "Restoring stash"; git stash pop || warn "stash pop had conflicts — resolve manually"; }
  exit 0
fi

# Preview incoming commits.
printf "\n${DIM}Incoming commits:${R}\n"
git --no-pager log --oneline --decorate --color=always "HEAD..$REMOTE_REF" | sed 's/^/  /'
printf "\n"

# Integrate.
if [ "$MODE" = "rebase" ]; then
  info "Pulling with --rebase --autostash"
  if ! git pull --rebase --autostash "$REMOTE" "$BRANCH"; then
    fail "Rebase produced conflicts. Resolve them, then:"
    printf "  git add <files>\n  git rebase --continue\n"
    printf "or abort with:\n  git rebase --abort\n"
    [ "$DID_STASH" = "1" ] && warn "Your stashed changes are still in 'git stash list'."
    exit 1
  fi
else
  info "Pulling with --ff (merge on divergence)"
  if ! git pull --ff "$REMOTE" "$BRANCH"; then
    fail "Merge produced conflicts. Resolve them, then commit."
    [ "$DID_STASH" = "1" ] && warn "Your stashed changes are still in 'git stash list'."
    exit 1
  fi
fi
AFTER_SHA="$(git rev-parse HEAD)"

# Restore stash if we made one.
if [ "$DID_STASH" = "1" ]; then
  info "Restoring stashed changes"
  if git stash pop; then
    ok "Stash re-applied cleanly"
  else
    warn "Stash pop had conflicts — resolve, then 'git stash drop' when done."
  fi
fi

# Summary.
printf "\n${B}${GRN}Pulled $INCOMING commit(s) from $REMOTE_REF${R}\n"
printf "  ${DIM}$BEFORE_SHA${R} → ${B}$AFTER_SHA${R}\n"
printf "  ${DIM}Files changed:${R}\n"
git --no-pager diff --stat "$BEFORE_SHA..$AFTER_SHA" | sed 's/^/    /'
printf "\n${DIM}Tip: if server/web deps changed, re-run ./start.sh (or 'npm install').${R}\n\n"
