#!/bin/sh
# Rebuild the page kit's pictures. Usage: sh build.sh <build dir> <out dir> [picture names...]
# Needs Python 3 and Node.js with Playwright (../../launch-ads/src/render.cjs). Fonts: Fredoka and
# Nunito (SIL OFL) from ../../launch-ads/src/fonts. Give picture names to rebuild only those.
set -e
B=$1; OUT=$2; shift 2
HERE=$(dirname "$0")
mkdir -p "$B" "$OUT"
cp -r "$HERE/../../launch-ads/src/fonts" "$B/"
python3 "$HERE/kit.py" "$B" "$@"
node "$HERE/../../launch-ads/src/render.cjs" "$B/manifest-kit.json" "$OUT"
