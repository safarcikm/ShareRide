# Builds the social ads (HTML pages, rendered to PNG by render.cjs).
# python3 ads.py <build dir>  ->  <build>/ads/*.html and <build>/manifest-ads.json
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from parts import *
from texts import COPY

FONTCSS = '''
@font-face{font-family:Fredoka;font-weight:500;src:url(../fonts/Fredoka_500Medium.ttf)}
@font-face{font-family:Fredoka;font-weight:600;src:url(../fonts/Fredoka_600SemiBold.ttf)}
@font-face{font-family:Nunito;font-weight:400;src:url(../fonts/Nunito_400Regular.ttf)}
@font-face{font-family:Nunito;font-weight:600;src:url(../fonts/Nunito_600SemiBold.ttf)}
@font-face{font-family:Nunito;font-weight:700;src:url(../fonts/Nunito_700Bold.ttf)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#888}
#board{position:relative;overflow:hidden;background:%s;font-family:Nunito;color:%s}
h1{font-family:Fredoka;font-weight:600;letter-spacing:-0.015em;color:%s;text-wrap:balance}
.sub{font-family:Nunito;font-weight:600;color:%s;text-wrap:pretty}
''' % (FROST, TEXT, TEXT, MUTED)

SIZES = {
    # key: (width, height, side padding, logo, headline px, sub px, show points, road distance from bottom, car width)
    "square-1080x1080": dict(w=1080, h=1080, pad=72, top=64, logo=68, h1=104, sub=40, points=False, road=150, car=540, vs=1.45, mtn=190),
    "feed-1080x1350": dict(w=1080, h=1350, pad=72, top=64, logo=72, h1=108, sub=42, points=True, road=170, car=580, vs=1.6, mtn=230),
    "story-1080x1920": dict(w=1080, h=1920, pad=84, top=270, logo=84, h1=146, sub=52, points=False, road=500, car=620, vs=2.0, mtn=250),
}


# Long texts need a lower landscape so the mountains stay clear of the words.
OVERRIDES = {
    ("part", "story-1080x1920"): dict(vs=1.0, mtn=150),
    ("ride", "story-1080x1920"): dict(h1=136),
    ("part", "square-1080x1080"): dict(vs=1.15, mtn=170),
    ("drive", "square-1080x1080"): dict(vs=1.3),
}


def scene(concept, lang, W, H, road_from_bottom, car_w, vs, mtn):
    t = COPY[lang]
    road_y = H - road_from_bottom
    horizon = road_y - mtn
    s = landscape(W, horizon=horizon, road_y=road_y, sun=(W * 0.935, horizon - 22 * vs - 26, 60), vs=vs)
    ground = road_y - 20
    if concept == "ride":
        s += map_pin(W * 0.11, ground, h=92, label="Reykjavík", label_size=30)
        s += map_pin(W * 0.89, ground, h=92, label="Akureyri", label_size=30)
        s += beetle_on_road(W * 0.5 - car_w / 2 + 30, road_y + 8, car_w, kind="two")[0]
    elif concept == "drive":
        s += map_pin(W * 0.11, ground, h=92, label="Selfoss", label_size=30)
        s += map_pin(W * 0.89, ground, h=92, label="Reykjavík", label_size=30)
        cx = W * 0.5 - car_w / 2 + 30
        car, k, top = beetle_on_road(cx, road_y + 8, car_w, kind="driver")
        s += car
        # "Free seat" tag over the back of the roof, pointing at the empty back window (left of the luggage)
        label = t["drive"]["seat"]
        fs = 30
        w = len(label) * fs * 0.55 + fs * 1.3
        hh = fs * 1.6
        ax = cx - 6 * k + 50 * k
        ly = top + 34 * k - hh
        lx = ax + 16 - w
        s += f'<rect x="{lx:.1f}" y="{ly + 4:.1f}" width="{w:.1f}" height="{hh:.1f}" rx="{hh/2:.1f}" fill="{PRIMARY_EDGE}"/>'
        s += f'<rect x="{lx:.1f}" y="{ly:.1f}" width="{w:.1f}" height="{hh:.1f}" rx="{hh/2:.1f}" fill="{PRIMARY}"/>'
        s += f'<path d="M{ax - 12:.1f} {ly + hh - 1:.1f} L{ax:.1f} {ly + hh + 14:.1f} L{ax + 12:.1f} {ly + hh - 1:.1f}Z" fill="{PRIMARY}"/>'
        s += f'<text x="{lx + w / 2:.1f}" y="{ly + hh * 0.68:.1f}" text-anchor="middle" font-family="Fredoka" font-weight="600" font-size="{fs}" fill="#FFFFFF">{label}</text>'
    else:  # part of the way
        xs = [0.09, 0.31, 0.64, 0.91]
        names = ["Reykjavík", "Selfoss", "Hella", "Vík"]
        for x, n in zip(xs, names):
            s += map_pin(W * x, ground, h=80, label=n, label_size=27)
        # a puffin in a moss scarf waits at Hella, waving
        k = 1.55
        s += g(puffin_standing(scarf=MOSS_LIGHT, wave=True), W * 0.64 + 62, ground - 58.4 * k + 8, k)
        cw = car_w * 0.56
        s += beetle_on_road(W * 0.31 + 26, road_y + 8, cw, kind="two", moving=False)[0]
    return f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="position:absolute;left:0;top:0" aria-hidden="true">{s}</svg>'


def chip(text, fs):
    return (f'<span style="display:inline-flex;align-items:center;height:{fs*1.9:.0f}px;padding:0 {fs*0.8:.0f}px;border-radius:999px;'
            f'background:{PRIMARY_SOFT};color:{PRIMARY};font:700 {fs}px/1 Nunito;white-space:nowrap">{text}</span>')


def points_html(points, fs, gap):
    icons = {"Yfir": "pin", "100+": "pin", "Þú velur": "pin", "You choose": "pin"}
    out = f'<div style="display:flex;flex-direction:column;gap:{gap}px">'
    for icon_name, p in points:
        out += (f'<div style="display:flex;align-items:center;gap:{fs*0.6:.0f}px">'
                f'<span style="display:flex;align-items:center;justify-content:center;width:{fs*1.7:.0f}px;height:{fs*1.7:.0f}px;border-radius:50%;background:{PRIMARY_SOFT}">'
                f'{ico(icon_name, fs*1.0, PRIMARY, sw=2.4)}</span>'
                f'<span style="font:700 {fs}px/1.25 Nunito;color:{TEXT}">{p}</span></div>')
    return out + '</div>'


def cta(text, url, fs):
    return (f'<div style="display:inline-flex;align-items:center;gap:{fs*0.5:.0f}px;height:{fs*2.3:.0f}px;padding:0 {fs*0.5:.0f}px 0 {fs*1.0:.0f}px;'
            f'border-radius:999px;background:#FFFFFF;box-shadow:0 6px 0 {PRIMARY_EDGE};white-space:nowrap">'
            f'<span style="font:600 {fs}px/1 Nunito;color:{MUTED}">{text}</span>'
            f'<span style="font:600 {fs*1.05:.0f}px/1 Fredoka;color:{TEXT}">{url}</span>'
            f'<span style="display:flex;align-items:center;justify-content:center;width:{fs*1.6:.0f}px;height:{fs*1.6:.0f}px;border-radius:50%;background:{PRIMARY}">'
            f'{ico("arrow", fs*0.95, "#FFFFFF", sw=2.8)}</span></div>')


def ad(concept, lang, size):
    S = dict(SIZES[size], **OVERRIDES.get((concept, size), {}))
    W, H, pad = S["w"], S["h"], S["pad"]
    t = COPY[lang]
    c = t[concept]
    body = scene(concept, lang, W, H, S["road"], S["car"], S["vs"], S["mtn"])
    text = f'<div style="position:absolute;left:{pad}px;right:{pad}px;top:{S["top"]}px">'
    text += (f'<div style="display:flex;align-items:center;justify-content:space-between">{lockup(S["logo"])}'
             f'{chip(t["new"], S["logo"] * 0.4)}</div>')
    text += f'<h1 style="margin-top:{S["h1"]*0.62:.0f}px;font-size:{S["h1"]}px;line-height:1.04">{c["h"]}</h1>'
    text += f'<p class="sub" style="margin-top:{S["sub"]*0.6:.0f}px;font-size:{S["sub"]}px;line-height:1.32;max-width:{W - 2*pad - 40}px">{c["sub"]}</p>'
    if S["points"]:
        text += f'<div style="margin-top:{S["sub"]*1.1:.0f}px">{points_html(c["points"], S["sub"]*0.82, S["sub"]*0.45)}</div>'
    text += '</div>'
    # the call to action sits on the moss ground under the road
    road_y = H - S["road"]
    cta_fs = 40 if size == "story-1080x1920" else 34
    cta_top = road_y + 30 + (S["road"] - 30 - cta_fs * 2.3) / 2 if size != "story-1080x1920" else road_y + 40
    if size == "story-1080x1920":  # Meta covers the bottom 340 px of a story with its own buttons
        assert cta_top + cta_fs * 2.3 + 6 <= H - 340, (concept, lang, cta_top)
    text += f'<div style="position:absolute;left:0;right:0;top:{cta_top:.0f}px;display:flex;justify-content:center">{cta(c["cta"], t["url"], cta_fs)}</div>'
    if size == "story-1080x1920":
        text += (f'<div style="position:absolute;left:0;right:0;top:{road_y + 230}px;text-align:center;font:600 36px/1 Fredoka;color:{PRIMARY_SOFT};opacity:.9">'
                 f'{t["tagline"]}</div>')
    html = (f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><style>{FONTCSS}</style></head>'
            f'<body><div id="board" style="width:{W}px;height:{H}px">{body}{text}</div></body></html>')
    return html, W, H


def cover():
    """Facebook Page cover, 1640 x 624. Phones show only the middle ~1110 px, so the words stay in the middle 1000."""
    W, H = 1640, 624
    road_y = H - 92
    horizon = road_y - 150
    s = landscape(W, horizon=horizon, road_y=road_y, sun=(W * 0.9, horizon - 22 - 26, 60), vs=1.0)
    ground = road_y - 20
    s += map_pin(W * 0.2, ground, h=92, label="Reykjavík", label_size=30)
    s += map_pin(W * 0.8, ground, h=92, label="Akureyri", label_size=30)
    s += beetle_on_road(W * 0.5 - 230 + 30, road_y + 8, 460, kind="two")[0]
    scene = f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="position:absolute;left:0;top:0" aria-hidden="true">{s}</svg>'
    text = (f'<div style="position:absolute;left:0;right:0;top:48px;display:flex;flex-direction:column;align-items:center">'
            f'{lockup(88)}'
            f'<p style="margin-top:22px;font:600 40px/1 Fredoka;color:{TEXT}">Samferða um Ísland'
            f'<span style="color:{MUTED};font-weight:500"> · Shared rides across Iceland</span></p></div>')
    html = (f'<!doctype html><html lang="is"><head><meta charset="utf-8"><style>{FONTCSS}</style></head>'
            f'<body><div id="board" style="width:{W}px;height:{H}px">{scene}{text}</div></body></html>')
    return html, W, H


if __name__ == "__main__":
    build = sys.argv[1]
    os.makedirs(os.path.join(build, "ads"), exist_ok=True)
    jobs = []
    only = sys.argv[2:] if len(sys.argv) > 2 else None
    for concept in ("ride", "drive", "part"):
        for lang in ("is", "en"):
            for size in SIZES:
                name = f"puffinride-{concept}-{lang}-{size}"
                if only and not any(o in name for o in only):
                    continue
                html, W, H = ad(concept, lang, size)
                p = os.path.join(build, "ads", name + ".html")
                open(p, "w").write(html)
                jobs.append(dict(html=p, png=name + ".png", w=W, h=H))
    if not only:
        html, W, H = cover()
        p = os.path.join(build, "ads", "puffinride-facebook-cover-1640x624.html")
        open(p, "w").write(html)
        jobs.append(dict(html=p, png="puffinride-facebook-cover-1640x624.png", w=W, h=H))
    json.dump(jobs, open(os.path.join(build, "manifest-ads.json"), "w"), indent=1)
    print(len(jobs), "ads")
