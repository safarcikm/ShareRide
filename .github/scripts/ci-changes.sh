#!/usr/bin/env bash
# Decides whether CI's code jobs (lint, types, unit, integration and web
# tests, the bundles and the API image) run for this commit. ci.yml's "What
# changed" job runs it; it writes code=true or code=false to $GITHUB_OUTPUT
# and says why in the job summary. docs/engineering/ci-cd-and-releases.md
# explains the rules; ci-changes.test.sh checks them.
#
# The code jobs run unless one of these holds:
#
# 1. The change touches only files that no app, API, console or test reads:
#    docs, marketing, root Markdown and the like ($no_code). A pull request
#    is compared with the main it merges into. A push to main is compared
#    with the newest main commit whose CI passed, so code behind a docs
#    commit never goes untested.
# 2. A push to main has exactly the files (the same git tree) that a pull
#    request's run into main tested with every job passing. Such a run
#    writes tested_tree to $GITHUB_OUTPUT, and ci.yml keeps it as an
#    artifact named main-tree-<tree>.
#
# When anything is unclear (an API error, missing history), everything runs.
set -euo pipefail

repo="${GITHUB_REPOSITORY:?}"
event="${EVENT:?}"
# For a pull request: the branch it merges into, and that branch's commit.
base_ref="${BASE_REF:-}"
base="${BASE:-}"
server="${GITHUB_SERVER_URL:-https://github.com}"
output="${GITHUB_OUTPUT:-/dev/stdout}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

# Paths outside the apps, the packages and their tests; the API image leaves
# them out too (.dockerignore). Markdown inside apps/ and packages/ is code:
# the API serves the legal texts in packages/db/src/legal/texts.
no_code='^(docs/|marketing/|\.claude/|[^/]+\.md$|\.markdownlint-cli2\.jsonc$|\.github/(CODEOWNERS$|dependabot\.yml$|pull_request_template\.md$|ISSUE_TEMPLATE/|workflows/(docs|release|road-file)\.yml$))'

# Writes the decision and its reason, and stops. A pull request into main
# whose code jobs run also names the tree they test.
decide() {
  local tree
  echo "code=$1" >> "$output"
  if [ "$1" = true ] && [ "$event" = pull_request ] && [ "$base_ref" = main ] &&
    tree=$(git rev-parse 'HEAD^{tree}'); then
    echo "tested_tree=$tree" >> "$output"
  fi
  echo "$2" | tee -a "$summary"
  exit 0
}

# Prints the files that differ between two commits and count as code. Fails
# when git cannot compare them.
code_changes() {
  local files
  files=$(git diff --name-only --no-renames "$1" "$2") || return 1
  printf '%s\n' "$files" | grep -Ev "$no_code" | grep -v '^$' || true
}

# Rule 2. Returns without deciding when it does not hold.
tested_by_pull_request() {
  local tree runs run info jobs total failed
  tree=$(git rev-parse 'HEAD^{tree}') || return 0
  [[ $tree =~ ^[0-9a-f]{40}$ ]] || return 0
  runs=$(gh api "repos/$repo/actions/artifacts?name=main-tree-$tree&per_page=20" \
    --jq '.artifacts[] | select(.expired | not) | .workflow_run.id') || return 0
  for run in $runs; do
    [[ $run =~ ^[0-9]+$ ]] || continue
    # A pull request run of this workflow, from this repository (not a fork),
    # that passed.
    info=$(gh api "repos/$repo/actions/runs/$run" \
      --jq '"\(.event) \(.conclusion) \(.path) \(.head_repository.full_name)"') || continue
    [ "$info" = "pull_request success .github/workflows/ci.yml $repo" ] || continue
    # Every job passed and none was skipped ("What changed" and the three code
    # jobs at least): that run tested the code itself.
    jobs=$(gh api "repos/$repo/actions/runs/$run/jobs" \
      --jq '"\(.total_count) \([.jobs[] | select(.conclusion != "success")] | length)"') || continue
    read -r total failed _ <<< "$jobs" || continue
    [[ ${total:-} =~ ^[0-9]+$ && ${failed:-} == 0 && $total -ge 4 ]] || continue
    decide false "Code jobs skipped: a pull request run tested exactly these files and passed every job ($server/$repo/actions/runs/$run)."
  done
}

# Rule 1 for a push to main. Returns without deciding when it does not hold.
docs_only_since_main_passed() {
  local passed changed
  passed=$(gh run list --repo "$repo" --workflow ci.yml --branch main --event push \
    --status success --limit 1 --json headSha --jq '.[0].headSha // ""') || return 0
  [[ $passed =~ ^[0-9a-f]{40}$ ]] || return 0
  git merge-base --is-ancestor "$passed" HEAD 2> /dev/null || return 0
  changed=$(code_changes "$passed" HEAD) || return 0
  [ -z "$changed" ] || return 0
  decide false "Code jobs skipped: only docs, marketing and other files no code reads changed since ${passed}, whose CI passed."
}

case "$event" in
  pull_request)
    # GitHub checks out the pull request merged into main.
    if ! [[ $base =~ ^[0-9a-f]{40}$ ]] || ! changed=$(code_changes "$base" HEAD); then
      decide true "Code jobs run: could not compare with main."
    fi
    if [ -z "$changed" ]; then
      decide false "Code jobs skipped: this pull request changes only docs, marketing and other files no code reads."
    fi
    decide true "Code jobs run: this pull request changes code, such as $(head -n 1 <<< "$changed")."
    ;;
  push)
    tested_by_pull_request
    docs_only_since_main_passed
    decide true "Code jobs run: code changed since main last passed CI, and no pull request run tested exactly these files."
    ;;
  *)
    decide true "Code jobs run: the run was started by $event."
    ;;
esac
