#!/bin/sh
# Draw the store pages' pictures again. Usage: sh build.sh <screens dir> <build dir> <out dir>
# Needs Python 3 with Pillow and Node.js with Playwright (../../launch-ads/src/render.cjs). Fonts:
# Fredoka and Nunito (SIL OFL) from ../../launch-ads/src/fonts. <screens dir> holds ios/ and android/
# from the "store" run of Phone apps (spec 32, 3.9); see ../README.md.
set -e
SCREENS=$1; B=$2; OUT=$3
HERE=$(dirname "$0")
mkdir -p "$B" "$OUT/app-store/en-GB" "$OUT/google-play/is" "$OUT/google-play/en"
cp -r "$HERE/../../launch-ads/src/fonts" "$B/"
python3 "$HERE/listing.py" "$HERE/../texts.md"
python3 "$HERE/pictures.py" "$SCREENS" "$B"
node "$HERE/../../launch-ads/src/render.cjs" "$B/manifest-stores.json" "$OUT"
python3 "$HERE/pictures.py" finish "$OUT"
