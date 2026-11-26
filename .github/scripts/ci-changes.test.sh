#!/usr/bin/env bash
# Checks how ci-changes.sh decides whether CI's code jobs run, against a
# throwaway repository and a stand-in for the gh command. CI runs it first,
# in the "What changed" job.
#
#   bash .github/scripts/ci-changes.test.sh
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/ci-changes.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Git with no user settings, and a fixed name for the commits.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=ci GIT_AUTHOR_EMAIL=ci@example.invalid
export GIT_COMMITTER_NAME=ci GIT_COMMITTER_EMAIL=ci@example.invalid

# The stand-in for gh answers each question from a file in $FAKE; "!fail"
# makes it fail like an API error, and a missing file fails too.
# - last-pass: the newest main commit whose CI passed
# - tested-tree and artifact-runs: the runs that kept main-tree-<tested-tree>
# - run-<id> and jobs-<id>: a run's "event conclusion path repository", and
#   its "job count, jobs that did not pass"
mkdir -p "$work/bin"
cat > "$work/bin/gh" << 'GH'
#!/usr/bin/env bash
answer() {
  [ -f "$FAKE/$1" ] || exit 1
  [ "$(cat "$FAKE/$1")" != "!fail" ] || exit 1
  cat "$FAKE/$1"
}
case "$*" in
  "run list "*"--event push"*) answer last-pass ;;
  "api repos/owner/repo/actions/artifacts?name=main-tree-"*)
    [ -f "$FAKE/tested-tree" ] || exit 0
    case "$2" in
      *"name=main-tree-$(cat "$FAKE/tested-tree")&"*) answer artifact-runs ;;
    esac
    ;;
  "api repos/owner/repo/actions/runs/"*"/jobs "*)
    id=${2#repos/owner/repo/actions/runs/}
    answer "jobs-${id%/jobs}"
    ;;
  "api repos/owner/repo/actions/runs/"*) answer "run-${2#repos/owner/repo/actions/runs/}" ;;
  *) echo "unexpected: gh $*" >&2; exit 1 ;;
esac
GH
chmod +x "$work/bin/gh"

failures=0

# Starts a repository with code, docs, marketing and Markdown the code reads,
# and leaves the shell in it on main.
fresh() {
  rm -rf "$work/repo" "$work/fake"
  mkdir -p "$work/fake"
  git init -q -b main "$work/repo"
  cd "$work/repo"
  mkdir -p apps/api docs marketing packages/db/src/legal/texts .github/workflows .github/scripts
  echo "export {};" > apps/api/index.ts
  echo "# Docs" > docs/guide.md
  echo "picture" > marketing/ad.png
  echo "# Terms" > packages/db/src/legal/texts/terms-v1.en.md
  echo "# Read me" > README.md
  echo "name: CI" > .github/workflows/ci.yml
  echo "name: Docs" > .github/workflows/docs.yml
  echo "echo" > .github/scripts/ci-changes.sh
  commit "start"
}

# Changes a file (path, text) and commits it with a message.
change() {
  mkdir -p "$(dirname "$1")"
  echo "$2" >> "$1"
}
commit() {
  git add -A
  git commit -q -m "$1"
}

# What GitHub checks out for a pull request: the branch merged into main,
# main being the first parent.
pull_request_checkout() {
  git checkout -q --detach main
  git merge -q --no-ff --no-edit "$1"
}

# Runs ci-changes.sh for an event and checks its decision (true or false)
# and, when given, the tree it says it tests: "head" (HEAD's tree) or "none".
# A pull request merges into main ($base_ref) at main's commit ($base)
# unless those are set.
expect() {
  local name="$1" event="$2" wanted="$3" wanted_tree="${4:-}" got tree head_tree
  : > "$work/output"
  if ! (
    cd "$work/repo"
    PATH="$work/bin:$PATH" FAKE="$work/fake" EVENT="$event" \
      BASE_REF="${base_ref:-main}" BASE="${base:-$(git rev-parse main)}" \
      GITHUB_REPOSITORY=owner/repo GITHUB_SERVER_URL=https://github.com \
      GITHUB_OUTPUT="$work/output" GITHUB_STEP_SUMMARY="$work/summary" \
      bash "$script" > "$work/log" 2>&1
  ); then
    echo "not ok - $name: the script failed"
    sed 's/^/    /' "$work/log"
    failures=$((failures + 1))
    return
  fi
  got=$(sed -n 's/^code=//p' "$work/output")
  tree=$(sed -n 's/^tested_tree=//p' "$work/output")
  head_tree=$(git -C "$work/repo" rev-parse 'HEAD^{tree}')
  if [ "$got" != "$wanted" ]; then
    echo "not ok - $name: code=${got:-nothing}, wanted code=$wanted"
  elif [ "$wanted_tree" = head ] && [ "$tree" != "$head_tree" ]; then
    echo "not ok - $name: tested_tree=${tree:-nothing}, wanted $head_tree"
  elif [ "$wanted_tree" = none ] && [ -n "$tree" ]; then
    echo "not ok - $name: tested_tree=$tree, wanted none"
  else
    echo "ok - $name"
    return
  fi
  sed 's/^/    /' "$work/log"
  failures=$((failures + 1))
}

# Pull requests: compared with the main they merge into.

fresh
git checkout -q -b topic
change docs/guide.md "more"
change docs/specs/new.md "new"
change marketing/post.png "post"
change CLAUDE.md "rule"
change .github/workflows/docs.yml "# lint"
change .claude/skills/x/SKILL.md "skill"
commit "docs"
pull_request_checkout topic
expect "a pull request with docs, marketing and root Markdown only skips" pull_request false none

fresh
git checkout -q -b topic
change docs/guide.md "more"
change apps/api/index.ts "// change"
commit "code"
pull_request_checkout topic
expect "a pull request that changes an app runs everything, and names its tree" \
  pull_request true head

fresh
git checkout -q -b topic
change apps/api/index.ts "// change"
commit "code"
pull_request_checkout topic
base_ref="feature"
expect "a pull request into another branch names no tree" pull_request true none
base_ref=""

fresh
git checkout -q -b topic
change packages/db/src/legal/texts/terms-v1.en.md "clause"
commit "legal text"
pull_request_checkout topic
expect "Markdown the API reads counts as code" pull_request true

fresh
git checkout -q -b topic
change .github/workflows/ci.yml "# job"
commit "ci"
pull_request_checkout topic
expect "a change to ci.yml runs everything" pull_request true

fresh
git checkout -q -b topic
change .github/scripts/ci-changes.sh "# rule"
commit "ci script"
pull_request_checkout topic
expect "a change to the CI scripts runs everything" pull_request true

fresh
git checkout -q -b topic
git mv apps/api/index.ts docs/index.ts
commit "move"
pull_request_checkout topic
expect "a file moved out of an app into docs runs everything" pull_request true

fresh
git checkout -q -b topic
git rm -q apps/api/index.ts
commit "delete"
pull_request_checkout topic
expect "deleting code runs everything" pull_request true

fresh
git checkout -q -b topic
change apps/api/index.ts "// change"
commit "code"
change docs/guide.md "more"
commit "docs last"
expect "a pull request is compared with main, not with its last commit" pull_request true

fresh
git checkout -q -b topic
change docs/guide.md "more"
commit "docs"
pull_request_checkout topic
base="not-a-commit"
expect "a pull request without its main commit runs everything" pull_request true
base=""

# Pushes to main: compared with the newest main commit whose CI passed.

fresh
passed=$(git rev-parse HEAD)
change docs/guide.md "more"
commit "docs"
echo "$passed" > "$work/fake/last-pass"
expect "docs only since main last passed skips" push false none

fresh
passed=$(git rev-parse HEAD)
change apps/api/index.ts "// untested"
commit "code whose CI was cancelled"
change docs/guide.md "more"
commit "docs"
echo "$passed" > "$work/fake/last-pass"
expect "docs on top of untested code runs everything" push true none

fresh
git checkout -q -b elsewhere
change docs/guide.md "elsewhere"
commit "not on main"
elsewhere=$(git rev-parse HEAD)
git checkout -q main
change docs/guide.md "more"
commit "docs"
echo "$elsewhere" > "$work/fake/last-pass"
expect "a passing commit that is not on this main runs everything" push true

fresh
change docs/guide.md "more"
commit "docs"
echo "!fail" > "$work/fake/last-pass"
expect "an API error runs everything" push true

fresh
change docs/guide.md "more"
commit "docs"
echo "" > "$work/fake/last-pass"
expect "no passing commit on main runs everything" push true

# Pushes to main: a pull request run into main tested exactly these files.

# main gets a code change, and run 123 kept main-tree-<tree>, where <tree>
# is HEAD's tree unless another is given.
tested_run() {
  change apps/api/index.ts "// feature"
  commit "feature"
  echo "!fail" > "$work/fake/last-pass"
  echo "${1:-$(git rev-parse 'HEAD^{tree}')}" > "$work/fake/tested-tree"
  echo "123" > "$work/fake/artifact-runs"
  echo "pull_request success .github/workflows/ci.yml owner/repo" > "$work/fake/run-123"
  echo "4 0" > "$work/fake/jobs-123"
}

fresh
tested_run
expect "the same files as a pull request run that passed every job skips" push false none

fresh
tested_run "$(git rev-parse 'HEAD^{tree}')"
expect "main moved on after the pull request's run: runs everything" push true

fresh
tested_run
echo "4 1" > "$work/fake/jobs-123"
expect "a pull request run with a skipped or failed job does not count" push true

fresh
tested_run
echo "3 0" > "$work/fake/jobs-123"
expect "a run with fewer jobs than this workflow does not count" push true

fresh
tested_run
echo "pull_request failure .github/workflows/ci.yml owner/repo" > "$work/fake/run-123"
expect "a pull request run that failed does not count" push true

fresh
tested_run
echo "pull_request success .github/workflows/ci.yml someone/fork" > "$work/fake/run-123"
expect "a run from a fork does not count" push true

fresh
tested_run
echo "push success .github/workflows/ci.yml owner/repo" > "$work/fake/run-123"
expect "a run that was not for a pull request does not count" push true

fresh
tested_run
echo "pull_request success .github/workflows/other.yml owner/repo" > "$work/fake/run-123"
expect "a run of another workflow does not count" push true

fresh
tested_run
printf '122\n123\n' > "$work/fake/artifact-runs"
echo "pull_request failure .github/workflows/ci.yml owner/repo" > "$work/fake/run-122"
expect "one passing run among several is enough" push false

fresh
tested_run
echo "!fail" > "$work/fake/artifact-runs"
expect "an API error looking for the run runs everything" push true

# Anything else runs everything.

fresh
change docs/guide.md "more"
commit "docs"
expect "a run started by hand runs everything" workflow_dispatch true

if [ "$failures" -ne 0 ]; then
  echo "$failures failed"
  exit 1
fi
echo "all passed"
