#!/usr/bin/env bash
# Runs the phone journeys (config.yaml) on one device against the test API
# on this machine, which must already be starting (spec 32, 3.7). From
# apps/mobile:
#   maestro/run.sh <device> <app ID> <android|ios>
# The flows' screenshots end up in screenshots/<platform>/, Maestro's
# report and logs in maestro-results/<platform>/, also when a flow fails.
set -euo pipefail
device="$1"
app_id="$2"
platform="$3"
results="maestro-results/$platform"
mkdir -p "$results" "screenshots/$platform"

keep_screenshots() {
  find screenshots -maxdepth 1 -name '*.png' -exec mv {} "screenshots/$platform/" \;
}
trap keep_screenshots EXIT

# The test API migrates and seeds its database before it answers.
for _ in $(seq 1 90); do
  if curl --silent --fail http://localhost:3001/v1/health >/dev/null; then break; fi
  sleep 2
done
curl --silent --fail --show-error http://localhost:3001/v1/health >/dev/null

maestro --device "$device" test maestro \
  --env APP_ID="$app_id" \
  --env API_URL=http://localhost:3001 \
  --format junit --output "$results/report.xml" \
  --test-output-dir "$results" \
  --debug-output "$results/debug"
