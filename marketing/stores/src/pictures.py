# The store pages' pictures (spec 32, 3.9): each screenshot from the phone
# journeys (apps/mobile/maestro/store) under its caption, at each store's size,
# the Play feature graphic and the Play icon. The words come from listing.py.
#
#   python3 pictures.py <screens dir> <build dir>
#
# <screens dir> holds the journeys' screenshots as phone-apps.yml keeps them:
# ios/store-en-*.png from the iPhone of the App Store's largest size, and
# android/store-<is|en>-*.png from the Android emulator. The pages and a
# manifest go to <build dir>; render.cjs turns them into PNGs (build.sh).
#
# App Store: 1320 x 2868, the 6.9-inch size, and the same scaled to
# 1206 x 2622, the 6.3-inch size App Store Connect requires (medium_iphone).
# Google Play: 1080 x 1920 (9:16), the phones' size that Play shows in its
# lists, the feature graphic 1024 x 500 and the icon 512 x 512. The
# captions fill well under a fifth of each picture, and nothing is drawn
# around the screen that looks like a phone.
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "social-pages", "src"))
from common import (  # noqa: E402
    EDGE, MUTED, PRIMARY, TEXT, beetle_on_road, landscape, lockup, map_pin, page, svg,
)
from listing import FEATURE, SCREENS, check  # noqa: E402

APP_STORE = dict(W=1320, H=2868, top=150, caption=104, gap=96, radius=64)
GOOGLE_PLAY = dict(W=1080, H=1920, top=96, caption=70, gap=64, radius=44)
# The phones the journeys run on: the iPhone of the App Store's largest size, a Pixel 7.
SHOT_SIZE = {"ios": (1320, 2868), "android": (1080, 2400)}


def framed(shot, caption, lang, size):
    """The caption at the top and the screen under it, 80% of the picture's width. A screen too long
    for what is left runs off the bottom edge; one that fits sits whole in the middle of it."""
    W, H = size["W"], size["H"]
    width = round(W * 0.8)
    left = (W - width) // 2
    caption_h = round(size["caption"] * 1.12 * 2)
    shot_top = size["top"] + caption_h + size["gap"]
    sw, sh = SHOT_SIZE[shot.split("/")[0]]
    height = round(width * sh / sw)
    r = size["radius"]
    if shot_top + height + size["gap"] <= H:
        shot_top = shot_top + (H - size["gap"] - shot_top - height) // 2
        corners, bottom = f"{r}px", f"3px solid {EDGE}"
    else:
        corners, bottom = f"{r}px {r}px 0 0", "0"
    board = (
        f'<h1 style="position:absolute;left:{W * 0.07:.0f}px;right:{W * 0.07:.0f}px;top:{size["top"]}px;'
        f'height:{caption_h}px;display:flex;align-items:center;justify-content:center;'
        f'text-align:center;font-size:{size["caption"]}px;line-height:1.12">{caption}</h1>'
        f'<img src="../screens/{shot}" alt="" style="position:absolute;left:{left}px;top:{shot_top}px;'
        f'width:{width}px;height:{height}px;border-radius:{corners};border:3px solid {EDGE};border-bottom:{bottom};'
        f'box-shadow:0 24px 60px rgba(31,42,48,0.16)">'
    )
    return page(board, W, H, lang=lang)


def feature(lang):
    """Google Play's feature graphic, 1024 x 500: the landscape, the car between two meeting points,
    the logo and two lines. Play may put its own buttons on the lower corners, so they stay empty."""
    W, H = 1024, 500
    road_y = H - 70
    horizon = road_y - 118
    s = landscape(W, horizon=horizon, road_y=road_y, sun=(W * 0.9, horizon - 40, 46), vs=0.85)
    ground = road_y - 20
    s += map_pin(W * 0.22, ground, h=70, label="Reykjavík", label_size=24)
    s += map_pin(W * 0.78, ground, h=70, label="Akureyri", label_size=24)
    s += beetle_on_road(W * 0.5 - 150 + 20, road_y + 8, 300, kind="two")[0]
    f = FEATURE[lang]
    words = (
        f'<div style="position:absolute;left:0;right:0;top:40px;display:flex;flex-direction:column;align-items:center">'
        f"{lockup(64)}"
        f'<p style="margin-top:20px;font:600 40px/1 Fredoka;color:{TEXT}">{f["title"]}'
        f'<span style="color:{MUTED};font-weight:500"> · {f["line"]}</span></p></div>'
    )
    return page(svg(s, W, H) + words, W, H, lang=lang)


def play_icon():
    """The app icon for Google Play, 512 x 512: the square, as Play rounds the corners itself."""
    icon = open(os.path.join(HERE, "..", "..", "..", "apps", "mobile", "assets", "logo", "icon.svg")).read()
    icon = icon.replace('width="1024" height="1024"', 'width="512" height="512"')
    return page(f'<div style="position:absolute;inset:0">{icon}</div>', 512, 512, bg=PRIMARY)


def jobs(screens):
    out = []
    for n, s in enumerate(SCREENS, 1):
        name = f"{n}-{s['file'].split('-', 1)[1]}"
        out.append((f"app-store/en-GB/{name}", framed(f"ios/store-en-{s['file']}.png", s["en"], "en", APP_STORE),
                    APP_STORE["W"], APP_STORE["H"]))
        for lang in ("is", "en"):
            out.append((f"google-play/{lang}/{name}",
                        framed(f"android/store-{lang}-{s['file']}.png", s[lang], lang, GOOGLE_PLAY),
                        GOOGLE_PLAY["W"], GOOGLE_PLAY["H"]))
    for lang in ("is", "en"):
        out.append((f"google-play/{lang}/feature-graphic", feature(lang), 1024, 500))
    out.append(("google-play/icon-512", play_icon(), 512, 512))
    missing = [
        path for path in
        [f"ios/store-en-{s['file']}.png" for s in SCREENS]
        + [f"android/store-{lang}-{s['file']}.png" for s in SCREENS for lang in ("is", "en")]
        if not os.path.exists(os.path.join(screens, path))
    ]
    return out, missing


def finish(out):
    """Take the alpha channel off every picture but the icon: App Store Connect refuses screenshots
    with one, and Play's feature graphic must have none. Play's icon is a 32-bit PNG."""
    from PIL import Image

    # Only the stores' folders: <out> also holds screens/, the phones' own screenshots.
    walks = (os.walk(os.path.join(out, store)) for store in ("app-store", "google-play"))
    for folder, _, names in (step for walk in walks for step in walk):
        for name in names:
            path = os.path.join(folder, name)
            if name.endswith(".png") and name != "icon-512.png":
                Image.open(path).convert("RGB").save(path, optimize=True)
            elif name == "icon-512.png":
                Image.open(path).convert("RGBA").save(path, optimize=True)
    medium_iphone(out)


# Since 2026 App Store Connect requires the iPhone of medium size (6.1 and
# 6.3 inches, 1206 x 2622) and makes the others from it; the 6.9-inch
# pictures may go under "large display". The two shapes differ by under
# 0.1 %, so scaling is enough.
MEDIUM_IPHONE = (1206, 2622)


def medium_iphone(out):
    from PIL import Image

    large = os.path.join(out, "app-store", "en-GB")
    medium = os.path.join(out, "app-store", "en-GB-6.3")
    os.makedirs(medium, exist_ok=True)
    for name in sorted(os.listdir(large)):
        if name.endswith(".png"):
            picture = Image.open(os.path.join(large, name)).convert("RGB")
            smaller = picture.resize(MEDIUM_IPHONE, Image.LANCZOS)
            smaller.save(os.path.join(medium, name), optimize=True)


if __name__ == "__main__":
    if sys.argv[1] == "finish":
        finish(sys.argv[2])
        sys.exit()
    screens, build = sys.argv[1], sys.argv[2]
    problems = check()
    if problems:
        sys.exit("\n".join(problems))
    pictures, missing = jobs(screens)
    if missing:
        sys.exit("missing screenshots: " + ", ".join(missing))
    shutil.copytree(screens, os.path.join(build, "screens"), dirs_exist_ok=True)
    pages = os.path.join(build, "pages")
    os.makedirs(pages, exist_ok=True)
    manifest = []
    for name, html, W, H in pictures:
        # The pages sit side by side, so the fonts and screens are one folder up from each.
        path = os.path.join(pages, name.replace("/", "-") + ".html")
        open(path, "w", encoding="utf-8").write(html)
        manifest.append(dict(html=path, png=name + ".png", w=W, h=H))
    json.dump(manifest, open(os.path.join(build, "manifest-stores.json"), "w"), indent=1)
    print(len(manifest), "pictures")
