#!/bin/sh
# Rebuild every ad and flyer. Usage: sh build_all.sh <python with segno+pikepdf> <build dir> <out dir>
# Needs Node.js with Playwright (render.cjs, pdf.cjs) and Ghostscript (CMYK). Fonts: Fredoka and Nunito (SIL OFL) in fonts/.
set -e
PY=$1; B=$2; OUT=$3; HERE=$(dirname "$0")
mkdir -p "$OUT/social" "$OUT/flyer" "$B"
cp -r "$HERE/fonts" "$B/"
$PY "$HERE/ads.py" "$B"
node "$HERE/render.cjs" "$B/manifest-ads.json" "$OUT/social"
$PY "$HERE/flyer.py" "$B"
node "$HERE/pdf.cjs" "$B/flyer/flyer-a5-bleed.html" "$B/flyer/a5-raw.pdf"
$PY "$HERE/finish_pdf.py" "$B/flyer/a5-raw.pdf" "$OUT/flyer/puffinride-flyer-a5-print-cmyk.pdf" --cmyk
$PY "$HERE/finish_pdf.py" "$B/flyer/a5-raw.pdf" "$OUT/flyer/puffinride-flyer-a5-print-rgb.pdf"
$PY "$HERE/two_up.py" "$OUT/flyer/puffinride-flyer-a5-print-rgb.pdf" "$OUT/flyer/puffinride-flyer-a4-two-per-page-home.pdf"
pdftoppm -r 150 -png "$OUT/flyer/puffinride-flyer-a5-print-cmyk.pdf" "$OUT/flyer/preview-a5"
$PY "$HERE/overview.py" "$OUT/social" "$OUT/puffinride-ads-overview.png"
