#!/usr/bin/env bash
# Starts the API image the way staging runs it and checks that it answers:
# migrations and the seed run, the API is ready, the web app is served on
# the same origin, and /v1 keeps the API's 404. CI runs it on every build,
# so Render deploys only an image that starts.
#
#   DATABASE_URL=postgres://... infra/docker/smoke-test.sh shareride-api:local
#
# The database is migrated and seeded: use a throwaway one.
set -euo pipefail

image="${1:?usage: smoke-test.sh IMAGE}"
: "${DATABASE_URL:?DATABASE_URL must point at a throwaway database}"
port="${SMOKE_PORT:-3900}"
name="shareride-smoke-$$"
base="http://localhost:${port}"

# Production settings with placeholder Vonage keys: nothing here sends an SMS.
settings=(
  --network host
  -e NODE_ENV=production
  -e APP_ENV=staging
  -e DATABASE_URL
)

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then docker logs "$name" 2>&1 | tail -n 50 || true; fi
  docker rm -f "$name" > /dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker run --rm "${settings[@]}" "$image" node packages/db/src/migrate-cli.ts --seed-drafts

docker run -d --name "$name" "${settings[@]}" \
  -e PORT="$port" \
  -e AUTH_SECRET="smoke-$(head -c 32 /dev/urandom | base64)" \
  -e SMS_PROVIDER=vonage -e VONAGE_API_KEY=smoke-not-used -e VONAGE_API_SECRET=smoke-not-used \
  -e TRUST_PROXY=2 \
  "$image" > /dev/null

for _ in $(seq 1 30); do
  if curl -fsS "$base/v1/health/ready" > /dev/null 2>&1; then break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != "true" ]; then
    echo "The API stopped during start-up."
    exit 1
  fi
  sleep 1
done

check() {
  printf '%-44s' "$1"
  shift
  if "$@"; then echo ok; else echo FAILED; return 1; fi
}

status_of() { curl -s -o /dev/null -w '%{http_code}' "$base$1"; }

check "API ready" test "$(status_of /v1/health/ready)" = 200
check "web app at /" sh -c "curl -fsS '$base/' | grep -q '<title>ShareRide</title>'"
check "web app at an app route (reload)" sh -c "curl -fsS '$base/sign-in' | grep -q '<title>ShareRide</title>'"
check "content security policy on the page" sh -c "curl -fsSI '$base/' | grep -qi '^content-security-policy:'"
check "unknown /v1 path is the API's 404" test "$(status_of /v1/no-such-endpoint)" = 404
check "missing bundle is a 404, not the page" test "$(status_of /_expo/static/js/web/gone.js)" = 404
bundle="$(curl -fsS "$base/" | grep -o '/_expo/static/js/web/entry-[^"]*\.js' | head -n 1 || true)"
check "the page names the app's bundle" test -n "$bundle"
check "the app's bundle is served" test "$(status_of "$bundle")" = 200
check "its source map is not" test "$(status_of "$bundle.map")" = 404
check "legal documents seeded" test "$(status_of /v1/legal/terms/current)" = 200
check "sample meeting points seeded" sh -c "curl -fsS '$base/v1/meeting-points' | grep -q '\"sample\":true'"
# Render copies secret files into the build context (see .dockerignore).
check "no secret files in the image" docker run --rm "$image" test ! -e /repo/sentry-auth-token
