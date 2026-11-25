# Shared bits for the Facebook and Instagram page kit (2026-11-25).
# The drawings (logo, puffins, the Beetle-style car, landscape, pins, icons) come from
# the launch ads' generator in marketing/launch-ads/src, so the pages, the ads and the site stay one look.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
MARKETING = os.path.normpath(os.path.join(HERE, "..", "..", "launch-ads", "src"))
sys.path.insert(0, MARKETING)
from parts import *  # noqa: F401,F403  (colours, icon, lockup, ico, map_pin, landscape, beetle_on_road, ...)
from puffins import puffin_side, puffin_standing, puffin_front, g, INK, FACE, SUN, CROW, WOOL, MOSSL, BEAK, GLACIER as GLACIER_P, LUPINE as LUPINE_P  # noqa: F401

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


def page(board, W, H, lang="is", bg=None, extra_css=""):
    style = f"width:{W}px;height:{H}px" + (f";background:{bg}" if bg else "")
    return (f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><style>{FONTCSS}{extra_css}</style></head>'
            f'<body><div id="board" style="{style}">{board}</div></body></html>')


def svg(inner, W, H):
    return f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="position:absolute;left:0;top:0" aria-hidden="true">{inner}</svg>'


def cta(text, url, fs):
    """The white pill with the address and an arrow, as on the ads."""
    return (f'<div style="display:inline-flex;align-items:center;gap:{fs*0.5:.0f}px;height:{fs*2.3:.0f}px;padding:0 {fs*0.5:.0f}px 0 {fs*1.0:.0f}px;'
            f'border-radius:999px;background:#FFFFFF;box-shadow:0 6px 0 {PRIMARY_EDGE};white-space:nowrap">'
            + (f'<span style="font:600 {fs}px/1 Nunito;color:{MUTED}">{text}</span>' if text else '') +
            f'<span style="font:600 {fs*1.05:.0f}px/1 Fredoka;color:{TEXT}">{url}</span>'
            f'<span style="display:flex;align-items:center;justify-content:center;width:{fs*1.6:.0f}px;height:{fs*1.6:.0f}px;border-radius:50%;background:{PRIMARY}">'
            f'{ico("arrow", fs*0.95, "#FFFFFF", sw=2.8)}</span></div>')


def write_jobs(build, jobs_html, manifest):
    """jobs_html: list of (name, html, W, H). Writes <build>/pages/<name>.html and a manifest for render.cjs."""
    import json
    d = os.path.join(build, "pages")
    os.makedirs(d, exist_ok=True)
    jobs = []
    for name, html, W, H in jobs_html:
        p = os.path.join(d, name + ".html")
        open(p, "w").write(html)
        jobs.append(dict(html=p, png=name + ".png", w=W, h=H))
    json.dump(jobs, open(os.path.join(build, manifest), "w"), indent=1)
    return jobs
