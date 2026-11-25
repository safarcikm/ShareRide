#!/bin/sh
# Make the reels. Usage: sh reel.sh <build dir> <out dir> [is|en]
# Needs Python 3, Node.js with Playwright and ffmpeg. Takes about two minutes a language.
set -e
B=$1; OUT=$2; shift 2
HERE=$(dirname "$0")
mkdir -p "$B" "$OUT"
cp -r "$HERE/../../launch-ads/src/fonts" "$B/"
python3 "$HERE/reel.py" "$B" "$@"
for lang in ${@:-is en}; do
  node "$HERE/reel.cjs" "$B/pages/reel-$lang.html" "$OUT/reel-share-your-ride-$lang-1080x1920.mp4" \
    "$OUT/reel-share-your-ride-$lang-cover-1080x1920.png"
done
