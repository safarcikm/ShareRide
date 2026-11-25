# A 15-second reel for Instagram and Facebook (1080 x 1920, 30 frames a second), in Icelandic and English:
# the yellow car drives in with empty seats, a puffin waits at a meeting point and hops in, the car drives
# on, and it ends on "Verum samferða" / "Share your ride" and puffinride.is.
# python3 reel.py <build dir> [is|en]   then   node reel.cjs <build>/pages/reel-<lang>.html <out.mp4> [cover.png]
# (build.sh copies the fonts to <build>/fonts first; reel.sh does both)
# Martin's rules: never mention payments or fees; no Meta Pixel. Claims stay true to the app today.
# Reels cover the top ~220 px, the bottom ~420 px and a column on the right with their own buttons,
# so the words stay between 250 and 1500 px from the top and clear of the right edge.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: F401,F403

W, H = 1080, 1920
SECONDS = 15.0
ROAD_Y = 1320
HORIZON = ROAD_Y - 250
GROUND = ROAD_Y - 20
CAR_W = 560
PIN_X = 800
PUFFIN_X = 950
URL = "puffinride.is"

T = {
    "is": [
        dict(h="Laus sæti í bílnum?", sub="Bjóddu far á PuffinRide."),
        dict(h="Farþegar hoppa inn á leiðinni", sub="Á yfir 100 mótsstöðum um allt land."),
        dict(h="Alla leið eða bara hluta hennar", sub="Þú sérð hver keyrir áður en þú bókar."),
        dict(h="Verum samferða", sub="Finndu far eða bjóddu far."),
    ],
    "en": [
        dict(h="Empty seats in your car?", sub="Offer a ride on PuffinRide."),
        dict(h="Passengers hop in on the way", sub="At 100+ meeting points across Iceland."),
        dict(h="The whole way or just part of it", sub="See who's driving before you book."),
        dict(h="Share your ride", sub="Find a ride or offer one."),
    ],
}
PIN_NAME = "Borgarnes"


def keyframes(name, frames, ease="ease-in-out"):
    """frames: (second, css) pairs on the reel's 15-second timeline. Before the first and after the last,
    the element holds that frame. Each step eases with `ease` unless the css names its own."""
    out = f"@keyframes {name}{{"
    for t, css in frames:
        out += f"{t / SECONDS * 100:.3f}%{{{css};animation-timing-function:{ease}}}"
    return out + "}"


def timeline(name):
    return f"animation:{name} {SECONDS}s linear 0s 1 both"


def car(kind):
    """The car on its own: left bumper at 0, wheels on the road."""
    return beetle_on_road(0, ROAD_Y + 8, CAR_W, kind=kind, moving=False)[0]


def speed_lines():
    k = CAR_W / 186.0
    top = ROAD_Y + 8 - 115 * k + 3 * k
    s = ''
    for dy, ln in ((62, 70), (78, 96), (94, 60)):
        yy = top + dy * k
        s += f'<path d="M{-18 - ln:.1f} {yy:.1f} L{-18:.1f} {yy:.1f}" stroke="{CONTROL}" stroke-width="{1.4 * k:.1f}" stroke-linecap="round"/>'
    return s


def car_x_frames():
    """Where the car's left bumper is: in, waits, a little on to the puffin, away, and in again at the end."""
    return [
        (0.0, "transform:translateX(-700px)"),
        (2.2, "transform:translateX(40px)"),
        (4.6, "transform:translateX(40px)"),
        (5.6, "transform:translateX(190px)"),
        (8.0, "transform:translateX(190px)"),
        (10.0, "transform:translateX(1250px)"),
        (10.9, "transform:translateX(-700px)"),
        (12.6, "transform:translateX(260px)"),
        (15.0, "transform:translateX(260px)"),
    ]


def moving_frames():
    """Speed lines only while the car moves."""
    on, off = "opacity:1", "opacity:0"
    return [(0.0, on), (2.0, on), (2.3, off), (4.6, on), (5.4, on), (5.7, off), (8.0, off), (8.2, on),
            (10.0, on), (10.9, on), (12.4, on), (12.7, off), (15.0, off)]


def hop_frames():
    """The puffin's jump from beside the pin, over the roof, into the back window (a parabola in steps)."""
    x0, y0 = 0.0, 0.0
    # the back seat's window: the car (left bumper at 190) puts it about here, relative to the puffin's feet
    k = CAR_W / 186.0
    x1 = 190 - 6 * k + 58 * k - PUFFIN_X
    y1 = (ROAD_Y + 8 - 115 * k + 3 * k + 66 * k) - GROUND
    start, end, n = 6.0, 6.9, 9
    frames = [(0.0, "transform:translate(0px,0px) scale(0);opacity:1"),
              (4.3, "transform:translate(0px,0px) scale(0);opacity:1"),
              (4.7, "transform:translate(0px,0px) scale(1);opacity:1"),
              (start, "transform:translate(0px,0px) scale(1);opacity:1")]
    for i in range(1, n + 1):
        f = i / n
        x = x0 + (x1 - x0) * f
        y = y0 + (y1 - y0) * f - 240 * 4 * f * (1 - f)
        sc = 1 - 0.3 * f
        op = 1 if f < 0.8 else max(0.0, 1 - (f - 0.8) / 0.2)
        frames.append((start + (end - start) * f, f"transform:translate({x:.1f}px,{y:.1f}px) scale({sc:.3f});opacity:{op:.2f}"))
    frames.append((15.0, frames[-1][1]))
    return frames


def text_block(i, t, lang, first, last, top=410, size=112):
    """Scene i's words, in from below and out upwards."""
    name = f"text{i}"
    hidden_below, shown, hidden_above = ("opacity:0;transform:translateY(40px)", "opacity:1;transform:translateY(0)",
                                         "opacity:0;transform:translateY(-30px)")
    frames = [(0.0, hidden_below), (first, hidden_below), (first + 0.45, shown)]
    if last < SECONDS:
        frames += [(last - 0.35, shown), (last, hidden_above)]
    frames.append((SECONDS, frames[-1][1]))
    css = keyframes(name, frames, "cubic-bezier(.2,.7,.2,1)")
    html = (f'<div style="position:absolute;left:84px;width:850px;top:{top}px;{timeline(name)}">'
            f'<h1 style="font-size:{size}px;line-height:1.04">{t["h"]}</h1>'
            f'<p class="sub" style="margin-top:30px;font-size:48px;line-height:1.3">{t["sub"]}</p></div>')
    return css, html


def reel(lang):
    t = T[lang]
    css = ""
    # the still landscape
    scene = landscape(W, horizon=HORIZON, road_y=ROAD_Y, sun=(W * 0.86, HORIZON - 140, 66), vs=2.2)
    body = svg(scene, W, H)
    # the meeting point and the waiting puffin pop up when the second scene starts
    css += keyframes("pin", [(0.0, "transform:scale(0)"), (4.0, "transform:scale(0)"), (4.35, "transform:scale(1.08)"),
                             (4.5, "transform:scale(1)"), (10.4, "transform:scale(1);opacity:1"), (10.9, "transform:scale(1);opacity:0"),
                             (15.0, "transform:scale(1);opacity:0")])
    pin = map_pin(PIN_X, GROUND, h=100, label=PIN_NAME, label_size=30)
    body += (f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="position:absolute;left:0;top:0;overflow:visible" aria-hidden="true">'
             f'<g style="transform-box:view-box;transform-origin:{PIN_X}px {GROUND}px;{timeline("pin")}">{pin}</g></svg>')
    # the car: speed lines, the car with the driver only, and the car with the passenger in the back
    css += keyframes("carx", car_x_frames(), "cubic-bezier(.45,0,.25,1)")
    css += keyframes("lines", moving_frames(), "linear")
    css += keyframes("bounce", [(0.0, "transform:translateY(0)"), (0.2, "transform:translateY(-4px)"), (0.4, "transform:translateY(0)")], "ease-in-out")
    css += keyframes("passenger", [(0.0, "opacity:0"), (6.75, "opacity:0"), (6.95, "opacity:1"), (15.0, "opacity:1")], "linear")
    bounce = "animation:bounce 0.4s ease-in-out 0s infinite"
    body += (f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="position:absolute;left:0;top:0;overflow:visible" aria-hidden="true">'
             f'<g style="{timeline("carx")}"><g style="{timeline("lines")}">{speed_lines()}</g>'
             f'<g style="{bounce}"><g>{car("driver")}</g><g style="{timeline("passenger")}">{car("two")}</g></g></g></svg>')
    # the puffin: pops up, waves, then hops into the back seat
    css += keyframes("hop", hop_frames(), "linear")
    css += keyframes("wavegate", [(0.0, "opacity:0"), (4.8, "opacity:0"), (4.81, "opacity:1"), (5.95, "opacity:1"), (5.96, "opacity:0"), (15.0, "opacity:0")], "linear")
    css += "@keyframes wave{0%{opacity:0}50%{opacity:1}}"
    s = 2.6
    still = g(puffin_standing(hat=CROW, scarf=None, wave=False), 0, 0, s)
    waving = g(puffin_standing(hat=CROW, scarf=None, wave=True), 0, 0, s)
    feet = 58.4 * s
    body += (f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="position:absolute;left:0;top:0;overflow:visible" aria-hidden="true">'
             f'<g transform="translate({PUFFIN_X} {GROUND - feet:.1f})"><g style="transform-box:view-box;transform-origin:0px {feet:.1f}px;{timeline("hop")}">'
             f'{still}<g style="{timeline("wavegate")}"><g style="animation:wave 0.7s steps(1) 0s infinite">{waving}</g></g></g></g></svg>')
    # words: the logo throughout, a scene's words at a time, then the address at the end
    body += f'<div style="position:absolute;left:84px;top:262px">{lockup(76)}</div>'
    times = [(0.3, 3.9), (4.1, 7.9), (8.1, 10.9), (11.3, SECONDS)]
    for i, (first, last) in enumerate(times):
        c, h = text_block(i, t[i], lang, first, last, size=(128 if i == 3 else 108))
        css += c
        body += h
    css += keyframes("cta", [(0.0, "opacity:0;transform:translateY(30px)"), (12.2, "opacity:0;transform:translateY(30px)"),
                             (12.7, "opacity:1;transform:translateY(0)"), (15.0, "opacity:1;transform:translateY(0)")], "cubic-bezier(.2,.7,.2,1)")
    css += "@keyframes pulse{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}"
    top = ROAD_Y + 30 + 34
    assert top + 46 * 2.3 + 6 <= H - 420
    body += (f'<div style="position:absolute;left:0;right:0;top:{top}px;display:flex;justify-content:center;{timeline("cta")}">'
             f'<div style="animation:pulse 1.2s ease-in-out 0s infinite">{cta("", URL, 46)}</div></div>')
    return page(body, W, H, lang, extra_css=css)


if __name__ == "__main__":
    build = sys.argv[1]
    langs = sys.argv[2:] or ["is", "en"]
    os.makedirs(os.path.join(build, "pages"), exist_ok=True)  # beside <build>/fonts, as the page kit's pages
    for lang in langs:
        with open(os.path.join(build, "pages", f"reel-{lang}.html"), "w") as f:
            f.write(reel(lang))
    print("reels:", ", ".join(langs))
