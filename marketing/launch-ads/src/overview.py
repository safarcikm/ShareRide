# python overview.py <social dir> <out.png> : every ad on one sheet (rows: idea x language; columns: square, feed, story)
import os, sys
from PIL import Image, ImageDraw, ImageFont
here = os.path.dirname(os.path.abspath(__file__))
src, out = sys.argv[1], sys.argv[2]
font = ImageFont.truetype(os.path.join(here, "fonts", "Fredoka_600SemiBold.ttf"), 34)
rows = [(c, l) for c in ("ride", "drive", "part") for l in ("is", "en")]
sizes = ["square-1080x1080", "feed-1080x1350", "story-1080x1920"]
H, gap, label_w = 560, 24, 330
cols_w = [round(1080 * H / int(s.split("x")[1])) for s in sizes]
W = label_w + sum(cols_w) + gap * len(sizes)
sheet = Image.new("RGB", (W, len(rows) * (H + gap) + gap), (226, 232, 234))
d = ImageDraw.Draw(sheet)
names = {"ride": "Need a ride?", "drive": "Driving anyway?", "part": "Part of the way"}
for r, (c, l) in enumerate(rows):
    y = gap + r * (H + gap)
    d.text((gap, y + H / 2 - 40), names[c], font=font, fill=(31, 42, 48))
    d.text((gap, y + H / 2 + 4), "Íslenska" if l == "is" else "English", font=font, fill=(86, 99, 107))
    x = label_w
    for s, cw in zip(sizes, cols_w):
        im = Image.open(os.path.join(src, f"puffinride-{c}-{l}-{s}.png")).convert("RGB").resize((cw, H), Image.LANCZOS)
        sheet.paste(im, (x, y)); x += cw + gap
sheet.save(out)
