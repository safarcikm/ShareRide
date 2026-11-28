# Puts the pictures of the looks side by side, with their names (README.md).
#   python3 boards.py <pictures folder> <out folder>
# The pictures folder holds one folder per look (before, slab, mix, soft),
# as looks.spec.ts writes them.
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

pictures, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
fonts = Path(__file__).resolve().parents[5] / "node_modules" / ".pnpm"
title_font = ImageFont.truetype(
    str(next(fonts.glob("@expo-google-fonts+fredoka@*/node_modules/@expo-google-fonts/fredoka/600SemiBold/Fredoka_600SemiBold.ttf"))), 34)
text_font = ImageFont.truetype(
    str(next(fonts.glob("@expo-google-fonts+nunito@*/node_modules/@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf"))), 24)

LOOKS = [
    ("before", "Now", "A solid strip under each card and button, thinning out at the corners"),
    ("slab", "1. Even edges", "The same strips, as thick at the corners as in the middle; a hairline round cards"),
    ("mix", "2. Soft cards, solid buttons", "Cards get a hairline and a soft shadow; buttons keep an even solid edge"),
    ("soft", "3. All soft", "No solid edges: soft shadows under cards and buttons"),
]
INK, MUTED, PAPER, LINE = (31, 42, 48), (86, 99, 107), (255, 255, 255), (220, 229, 232)


def crop(look, name, box, scale):
    picture = Image.open(pictures / look / f"{name}.png").convert("RGB")
    w, h = picture.size
    x0, y0, x1, y1 = box
    part = picture.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
    return part.resize((int(part.width * scale), int(part.height * scale)), Image.LANCZOS)


def label(draw, x, y, title, words):
    draw.text((x, y), title, font=title_font, fill=INK)
    draw.text((x, y + 44), words, font=text_font, fill=MUTED)


def rows(name, parts, looks=LOOKS, gap=24, pad=32):
    """One row per look: its name, then its parts side by side."""
    made = [[crop(look, *part) for part in parts] for look, _, _ in looks]
    width = max(sum(p.width for p in row) + gap * (len(row) - 1) for row in made) + 2 * pad
    heights = [max(p.height for p in row) for row in made]
    head = 96
    board = Image.new("RGB", (width, sum(heights) + len(made) * (head + pad) + pad), PAPER)
    draw = ImageDraw.Draw(board)
    y = pad
    for (_, title, words), row, height in zip(looks, made, heights):
        label(draw, pad, y, title, words)
        x, y = pad, y + head
        for part in row:
            board.paste(part, (x, y))
            draw.rectangle([x - 1, y - 1, x + part.width, y + part.height], outline=LINE)
            x += part.width + gap
        y += height + pad
    board.save(out / f"{name}.png", optimize=True)
    print(name, board.size)


def columns(name, shot, looks=LOOKS, scale=1 / 3, gap=24, pad=32):
    """The whole first screen in each look, side by side."""
    made = [crop(look, shot, (0, 0, 1, 1), scale) for look, _, _ in looks]
    head = 60
    width = sum(p.width for p in made) + gap * (len(made) - 1) + 2 * pad
    board = Image.new("RGB", (width, max(p.height for p in made) + head + 2 * pad), PAPER)
    draw = ImageDraw.Draw(board)
    x = pad
    for (_, title, _), part in zip(looks, made):
        draw.text((x, pad), title.split(". ")[-1] if title != "Now" else title, font=text_font, fill=INK)
        board.paste(part, (x, pad + head))
        draw.rectangle([x - 1, pad + head - 1, x + part.width, pad + head + part.height], outline=LINE)
        x += part.width + gap
    board.save(out / f"{name}.png", optimize=True)
    print(name, board.size)


# Close up, light: a ride's ticket with the seats, and the search card's button.
rows("1-close-up", [("ride-phone-light", (0, 0.262, 1, 0.40), 0.5), ("find-phone-light", (0, 0.775, 1, 0.915), 0.5)])
# At night: the same ticket, and what needs a driver.
rows("2-close-up-night", [("ride-phone-dark", (0, 0.10, 1, 0.40), 0.5), ("find-driver-phone-dark", (0, 0.262, 1, 0.50), 0.5)])
# Whole first screens.
columns("3-find-phone", "find-phone-light")
columns("4-ride-phone", "ride-phone-light")
columns("5-driver-phone-night", "find-driver-phone-dark")
# A laptop, now and the one I recommend.
rows("6-laptop", [("find-laptop-light", (0.04, 0.27, 0.96, 0.95), 0.5)], looks=[LOOKS[0], LOOKS[2]])
