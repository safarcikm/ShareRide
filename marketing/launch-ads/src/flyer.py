# Builds the A5 flyer: front and back, Icelandic first with English under it.
# python3 flyer.py <build dir>  ->  <build>/flyer/flyer-a5-bleed.html (2 pages, 154 x 216 mm = A5 + 3 mm bleed)
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from parts import *

QR_URL = "https://puffinride.is/?utm_source=flyer&utm_medium=qr&utm_campaign=launch"
PX = 1080 / 154.0  # scene units per mm

FONTCSS = '''
@font-face{font-family:Fredoka;font-weight:500;src:url(../fonts/Fredoka_500Medium.ttf)}
@font-face{font-family:Fredoka;font-weight:600;src:url(../fonts/Fredoka_600SemiBold.ttf)}
@font-face{font-family:Nunito;font-weight:400;src:url(../fonts/Nunito_400Regular.ttf)}
@font-face{font-family:Nunito;font-weight:600;src:url(../fonts/Nunito_600SemiBold.ttf)}
@font-face{font-family:Nunito;font-weight:700;src:url(../fonts/Nunito_700Bold.ttf)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{position:relative;overflow:hidden;width:155mm;height:217mm;background:%s;font-family:Nunito;color:%s;break-after:page}
.abs{position:absolute}
.d{font-family:Fredoka;font-weight:600;letter-spacing:-0.01em}
.en{color:%s}
''' % (FROST, TEXT, MUTED)

# Trim is 3 mm in from every edge; keep words and the QR code 5 mm inside the trim (8 mm from the page edge).
L = 13  # left/right text edge in mm (3 bleed + 10)


def chip(text, fs):
    return (f'<span style="display:inline-flex;align-items:center;height:{fs*1.9:.2f}mm;padding:0 {fs*0.8:.2f}mm;border-radius:99mm;'
            f'background:{PRIMARY_SOFT};color:{PRIMARY};font:700 {fs}mm/1 Nunito;white-space:nowrap">{text}</span>')


def qr_card(size):
    pad = 0.6  # the code keeps its own quiet zone of 4 modules
    svg, ver = qr_svg(QR_URL, size, "mm", border=4)
    return (f'<div style="background:#FFFFFF;border-radius:3.2mm;padding:{pad}mm;box-shadow:0 1.1mm 0 {PRIMARY_EDGE};flex:none">{svg}</div>'), ver


def front():
    W, H = 1080, 216 * PX
    road_y = 161 * PX
    horizon = road_y - 112
    s = landscape(W, horizon=horizon, road_y=road_y, sun=(W * 0.935, horizon - 22 * 1.25 - 26, 56), vs=1.25)
    ground = road_y - 20
    s += map_pin(W * 0.15, ground, h=84, label="Reykjavík", label_size=28)
    s += map_pin(W * 0.85, ground, h=84, label="Akureyri", label_size=28)
    s += beetle_on_road(W * 0.5 - 250 + 20, road_y + 8, 500, kind="two")[0]
    scene = f'<svg class="abs" style="left:0;top:0;overflow:visible" width="154mm" height="216mm" viewBox="0 0 {W} {H:.1f}" aria-hidden="true">{s}</svg>'

    t = f'<div class="abs" style="left:{L}mm;right:{L}mm;top:13mm">'
    t += f'<div style="display:flex;align-items:center;justify-content:space-between">{lockup(12, "mm")}{chip("Nýtt · New", 3.4)}</div>'
    t += '<h1 class="d" style="margin-top:9mm;font-size:16mm;line-height:1;color:#1F2A30">Vantar þig far?</h1>'
    t += f'<p class="d en" style="margin-top:1.6mm;font-weight:500;font-size:7.4mm;line-height:1.1">Need a ride?</p>'
    t += '<p style="margin-top:5mm;font:600 4.6mm/1.32 Nunito">Finndu laust sæti í bíl sem fer þína leið.</p>'
    t += '<p class="en" style="margin-top:0.8mm;font:600 4mm/1.32 Nunito">Find a free seat in a car that\'s going your way.</p>'
    pts = [("pin", "Yfir 100 mótsstaðir um allt land", "100+ meeting points around Iceland"),
           ("users", "Sjáðu hver keyrir áður en þú bókar", "See who's driving before you book"),
           ("chat", "Spjallaðu við bílstjórann fyrir ferðina", "Chat with the driver before the trip")]
    t += '<div style="margin-top:5.5mm;display:flex;flex-direction:column;gap:2.6mm">'
    for icn, a, b in pts:
        t += (f'<div style="display:flex;align-items:center;gap:2.8mm">'
              f'<span style="display:flex;align-items:center;justify-content:center;width:8.4mm;height:8.4mm;border-radius:50%;background:{PRIMARY_SOFT};flex:none">'
              f'{ico(icn, 4.8, PRIMARY, unit="mm", sw=2.4)}</span>'
              f'<span><span style="display:block;font:700 3.9mm/1.2 Nunito">{a}</span>'
              f'<span class="en" style="display:block;font:600 3.3mm/1.25 Nunito">{b}</span></span></div>')
    t += '</div></div>'

    card, ver = qr_card(35)
    foot = (f'<div class="abs" style="left:{L}mm;right:{L}mm;bottom:10mm;display:flex;align-items:flex-end;gap:6mm">{card}'
            f'<div style="padding-bottom:1mm;color:#FFFFFF">'
            f'<p class="d" style="font-size:6.2mm;line-height:1.1">Skannaðu og finndu far</p>'
            f'<p style="margin-top:0.8mm;font:600 4mm/1.2 Nunito;color:{PRIMARY_SOFT}">Scan to find a ride</p>'
            f'<p class="d" style="margin-top:3.6mm;font-size:9.4mm;line-height:1">puffinride.is</p></div></div>')
    return f'<section class="page">{scene}{t}{foot}</section>', ver


def back():
    W, H = 1080, 216 * PX
    # moss footer from 160 mm, with a hill line on top
    top = 161 * PX
    s = (f'<path d="M-10 {top + 26:.1f} Q240 {top - 24:.1f} 540 {top + 6:.1f} Q820 {top + 30:.1f} 1090 {top - 6:.1f} L1090 {H + 10:.1f} L-10 {H + 10:.1f}Z" fill="{MOSS_LIGHT}"/>')
    s += f'<rect x="-10" y="{top + 40:.1f}" width="1100" height="{H:.1f}" fill="{PRIMARY}"/>'
    s += (f'<path d="M-10 {top + 46:.1f} Q300 {top + 22:.1f} 600 {top + 44:.1f} Q860 {top + 62:.1f} 1090 {top + 36:.1f} L1090 {top + 60:.1f} L-10 {top + 60:.1f}Z" fill="{PRIMARY}"/>')
    # a puffin in a moss scarf waits by a meeting point pin, top right
    k = 1.7
    px_, gy = W - L * PX - 60, 40 * PX
    s += map_pin(px_ + 6, gy, h=118)
    s += g(puffin_standing(scarf=MOSS_LIGHT, wave=True), px_ - 74, gy - 58.4 * k, k)
    s += f'<ellipse cx="{px_ - 40:.1f}" cy="{gy + 2:.1f}" rx="120" ry="9" fill="{EDGE}"/>'
    scene = f'<svg class="abs" style="left:0;top:0;overflow:visible" width="154mm" height="216mm" viewBox="0 0 {W} {H:.1f}" aria-hidden="true">{s}</svg>'

    def steps(label_is, label_en, items):
        out = (f'<div style="margin-top:5mm;display:flex;align-items:baseline;gap:2mm">'
               f'<span class="d" style="font-size:5.4mm;color:{PRIMARY}">{label_is}</span>'
               f'<span style="font:600 3.6mm/1 Nunito;color:{MUTED}">· {label_en}</span></div>')
        out += '<ol style="list-style:none;margin-top:2.6mm;display:flex;flex-direction:column;gap:2.6mm">'
        for i, (a, b) in enumerate(items, 1):
            out += (f'<li style="display:flex;gap:3mm;align-items:flex-start">'
                    f'<span class="d" style="flex:none;width:7mm;height:7mm;border-radius:50%;background:{PRIMARY};color:#FFFFFF;'
                    f'display:flex;align-items:center;justify-content:center;font-size:4mm;line-height:1">{i}</span>'
                    f'<span style="padding-top:0.3mm"><span style="display:block;font:700 3.9mm/1.25 Nunito">{a}</span>'
                    f'<span class="en" style="display:block;margin-top:0.4mm;font:600 3.35mm/1.28 Nunito">{b}</span></span></li>')
        return out + '</ol>'

    t = f'<div class="abs" style="left:{L}mm;right:{L}mm;top:14mm">'
    t += '<h2 class="d" style="font-size:10mm;line-height:1">Svona virkar það</h2>'
    t += f'<p class="d en" style="margin-top:1.4mm;font-weight:500;font-size:5.6mm;line-height:1.1">How it works</p>'
    t += steps("Fyrir farþega", "For passengers", [
        ("Leitaðu að ferð á puffinride.is.", "Search for a ride at puffinride.is."),
        ("Bókaðu sæti alla leið eða bara hluta hennar.", "Book a seat for the whole trip or just part of it."),
        ("Hittu bílstjórann á mótsstaðnum og njóttu ferðarinnar.",
         "Meet the driver at the meeting point and enjoy the ride."),
    ])
    t += steps("Fyrir bílstjóra", "For drivers", [
        ("Settu inn ferðina þína og veldu mótsstaði á leiðinni.", "Post your trip and choose meeting points along the way."),
        ("Farþegar bóka sæti á þeim hluta leiðarinnar sem þeir þurfa.", "Passengers book seats for the part of the trip they need."),
        ("Spjallaðu við farþegana og hittist á mótsstaðnum.", "Chat with your passengers and meet at the meeting point."),
    ])
    t += (f'<div style="margin-top:4.6mm;background:#FFFFFF;border-radius:3.2mm;box-shadow:0 0.8mm 0 {EDGE};padding:3mm 3.6mm">'
          f'<p style="font:700 3.5mm/1.3 Nunito">PuffinRide er fyrir fólk sem deilir ferð sem það fer hvort sem er. '
          f'Þetta er ekki leigubílaþjónusta.</p>'
          f'<p class="en" style="margin-top:1mm;font:600 3.2mm/1.3 Nunito">PuffinRide is for sharing a trip you\'re making anyway. '
          f'It isn\'t a taxi service.</p></div>')
    t += '</div>'

    card, ver = qr_card(30)
    foot = (f'<div class="abs" style="left:{L}mm;right:{L}mm;bottom:10mm;display:flex;align-items:flex-end;gap:6mm">{card}'
            f'<div style="padding-bottom:1mm;color:#FFFFFF">'
            f'<p class="d" style="font-size:9mm;line-height:1">puffinride.is</p>'
            f'<p style="margin-top:2.6mm;font:700 3.7mm/1.3 Nunito">Opið öllum · Á íslensku og ensku</p>'
            f'<p style="margin-top:0.6mm;font:600 3.3mm/1.3 Nunito;color:{PRIMARY_SOFT}">Open to everyone · In Icelandic and English</p></div></div>')
    return f'<section class="page">{scene}{t}{foot}</section>', ver


def doc(pages, size_css, extra_css=""):
    return (f'<!doctype html><html lang="is"><head><meta charset="utf-8"><style>{FONTCSS}@page{{size:{size_css};margin:0}}{extra_css}</style></head>'
            f'<body>{pages}</body></html>')


if __name__ == "__main__":
    build = sys.argv[1]
    d = os.path.join(build, "flyer")
    os.makedirs(d, exist_ok=True)
    f, v1 = front()
    b, v2 = back()
    open(os.path.join(d, "flyer-a5-bleed.html"), "w").write(doc(f + b, "155mm 217mm"))
    # home printing (two per A4 page) is made from the finished PDF by two_up.py
    print("QR versions", v1, v2)
