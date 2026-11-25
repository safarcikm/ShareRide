# PuffinRide launch ads: drawing parts (logo, landscape, car, pins, icons, QR).
# Colours are spec 15 tokens; puffins come from puffins.py / icons.py (the look thread's drawings).
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from puffins import puffin_side, puffin_standing, g, INK, FACE, SUN, CROW, WOOL, MOSSL, BEAK, BEAKD
from icons import car_open

FROST = "#EEF3F4"; SURFACE = "#FFFFFF"; TEXT = "#1F2A30"; MUTED = "#56636B"
PRIMARY = "#2F6B4F"; PRIMARY_EDGE = "#1F4A36"; PRIMARY_SOFT = "#E2EFE7"; EDGE = "#D2DDE1"
CONTROL = "#7F8C93"; GLACIER = "#8FCBE6"; LUPINE = "#A99BEB"; MOSS_LIGHT = MOSSL
COAST = "#B9CBD3"; SEA = "#D7E9F0"; STEERING = "#5B6B73"; ROAD = "#34454E"

# The app icon (apps/mobile/assets/logo/icon.svg), without its square.
ICON_PIN = (
    '<path d="M46.4 86 C41 75.2 21.2 62.6 21.2 41 C21.2 25.7 32.9 14 46.4 14 C59.9 14 71.6 25.7 71.6 41 C71.6 62.6 51.8 75.2 46.4 86 Z" fill="#1F2A30"/>'
    '<path d="M28.4 41 C28.4 32.9 34.7 27.5 42.8 27.5 C51.8 27.5 60.8 28.4 64.4 29.3 L64.4 51.8 C59.9 59.9 52.7 63.5 45.5 63.5 C35.6 63.5 28.4 55.4 28.4 41 Z" fill="#F7F5F0"/>'
    '<path d="M48.2 31.1 L53.6 31.1 L50.9 27.68 Z" fill="#8E9CA3"/><path d="M48.92 44.96 L52.88 44.96 L50.9 47.48 Z" fill="#8E9CA3"/>'
    '<circle cx="50.9" cy="37.85" r="4.77" fill="#D9512A"/><circle cx="50.9" cy="37.85" r="3.6" fill="#1F2A30"/><circle cx="52.16" cy="36.59" r="1.26" fill="#F7F5F0"/>'
    '<ellipse cx="41.9" cy="51.8" rx="4.5" ry="3.06" fill="#F08C9C" opacity="0.8"/>'
    '<path d="M63.5 24.69 C72.5 24.69 82.06 30.31 86.56 40.55 C79.81 45.5 71.94 48.88 63.5 49.55 Z" fill="#F26B2E"/>'
    '<path d="M63.5 24.69 L68.67 25.29 L68.67 48.79 L63.5 49.55 Z" fill="#7C93A0"/>'
    '<path d="M68.67 25.29 L71.04 25.98 L71.04 48.21 L68.67 48.79 Z" fill="#F4C04E"/>'
    '<path d="M76.55 28.18 Q78.8 35.38 76.55 47.08 M81.5 32.45 Q83.08 37.62 81.5 43.92" stroke="#D9512A" stroke-width="1.35" fill="none" stroke-linecap="round"/>'
    '<path d="M63.5 40.55 Q75.88 41.67 86.56 40.55" stroke="#D9512A" stroke-width="1.24" fill="none"/>'
    '<circle cx="64.04" cy="48.2" r="2.52" fill="#F4C04E"/>'
)

_n = [0]
def uid(p):
    _n[0] += 1
    return f"{p}{_n[0]}"


def icon(size, unit="px"):
    """The app icon: the pin on moss, rounded corners (rx 22.5 of 100)."""
    c = uid("ic")
    return (f'<svg width="{size}{unit}" height="{size}{unit}" viewBox="0 0 100 100" aria-hidden="true" style="display:block;flex:none">'
            f'<defs><clipPath id="{c}"><rect width="100" height="100" rx="22.5"/></clipPath></defs>'
            f'<g clip-path="url(#{c})"><rect width="100" height="100" fill="{PRIMARY}"/>{ICON_PIN}</g></svg>')


def lockup(size, unit="px", colour=TEXT):
    """Spec 15 4.9: the icon, then PuffinRide in Fredoka SemiBold at 0.6 of its height, a quarter-height gap."""
    return (f'<div style="display:flex;align-items:center;gap:{size*0.25:.2f}{unit}">{icon(size, unit)}'
            f'<span style="font-family:Fredoka;font-weight:600;font-size:{size*0.6:.2f}{unit};line-height:1;color:{colour};letter-spacing:-0.01em">PuffinRide</span></div>')


# ---------- small line icons (Lucide-like, 24 grid) ----------
def ico(name, size, colour, unit="px", sw=2.2):
    paths = {
        "pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
        "banknote": '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
        "hand": '<path d="M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14"/><path d="m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 13 6 6"/>',
        "coins": '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
        "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        "car": '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
        "ticket": '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
        "chat": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
        "arrow": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
        "check": '<path d="M20 6 9 17l-5-5"/>',
        "phone": '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    }
    return (f'<svg width="{size}{unit}" height="{size}{unit}" viewBox="0 0 24 24" fill="none" stroke="{colour}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;flex:none">{paths[name]}</svg>')


# ---------- the car ----------
def car_driver_only(body="#F5F8F9", wheel=INK, hub="#9AA8AE", glass="#CFE3EA", shade="#D5E1E5"):
    """car_open with only the driver: the back seat is free (a dashed seat outline shows it)."""
    s = ''
    s += f'<rect x="15" y="38" width="22" height="18" rx="6" fill="none" stroke="{CONTROL}" stroke-width="1.6" stroke-dasharray="3.2 2.4"/>'
    s += g(puffin_side(hat=CROW), 61, 44, 0.6)
    s += f'<path d="M79.5 55 L83.5 37.5 Q84.3 35 86.8 35.6 Q89.2 36.4 88.6 39 L86 55Z" fill="{glass}" fill-opacity="0.85" stroke="{body}" stroke-width="1.8" stroke-linejoin="round"/>'
    s += f'<path d="M84.6 39.5 L82.6 49" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>'
    s += f'<path d="M6 62 C6 56 10 54 16 54 L84 54 C91 54 95 58 95 64 L95 72 C95 75.5 93 77 89.5 77 L11 77 C8 77 6 75 6 72Z" fill="{body}"/>'
    s += f'<path d="M6 66.5 L95 66.5" stroke="{shade}" stroke-width="2.2"/>'
    s += f'<rect x="44" y="60" width="8" height="2.6" rx="1.3" fill="{shade}"/>'
    s += f'<rect x="89" y="58.5" width="6" height="5" rx="2.5" fill="{SUN}"/><rect x="6" y="58.5" width="5" height="5" rx="2.5" fill="{CROW}"/>'
    for x in (25, 75):
        s += f'<circle cx="{x}" cy="77" r="10.5" fill="{wheel}"/><circle cx="{x}" cy="77" r="4.2" fill="{hub}"/>'
    return s


def car_on_road(x, road_y, width, kind="two", moving=True):
    """The car (viewBox 0..100, wheels touch y=87.5) placed so its wheels sit on road_y, x = left edge."""
    k = width / 89.0
    inner = car_open() if kind == "two" else car_driver_only()
    s = ''
    if moving:
        for i, (dy, ln) in enumerate([(-18, 70), (6, 96), (30, 60)]):
            yy = road_y - 87.5 * k + (58 + dy * 0.5) * k
            s += f'<path d="M{x - 18 - ln} {yy:.1f} L{x - 18} {yy:.1f}" stroke="{CONTROL}" stroke-width="{2.6 * k:.1f}" stroke-linecap="round"/>'
    s += f'<g transform="translate({x - 6 * k:.1f} {road_y - 87.5 * k + 2 * k:.1f}) scale({k:.4f})">{inner}</g>'
    return s


# ---------- pins ----------
def map_pin(cx, ground_y, h=74, label=None, label_size=26, colour=PRIMARY):
    """A meeting point: a moss map pin with a white dot on a steering-grey pole, its name in a chip above."""
    pole = h * 0.42
    head_r = h * 0.29
    top = ground_y - pole
    s = f'<path d="M{cx} {ground_y} L{cx} {top + head_r * 0.2:.1f}" stroke="{STEERING}" stroke-width="{h*0.07:.1f}" stroke-linecap="round"/>'
    hy = top - head_r * 0.9
    s += (f'<path d="M{cx} {top + head_r * 0.55:.1f} C{cx - head_r * 0.35:.1f} {top:.1f} {cx - head_r:.1f} {hy + head_r * 0.6:.1f} {cx - head_r:.1f} {hy:.1f} '
          f'A{head_r:.1f} {head_r:.1f} 0 1 1 {cx + head_r:.1f} {hy:.1f} C{cx + head_r:.1f} {hy + head_r * 0.6:.1f} {cx + head_r * 0.35:.1f} {top:.1f} {cx} {top + head_r * 0.55:.1f}Z" fill="{colour}"/>')
    s += f'<circle cx="{cx}" cy="{hy:.1f}" r="{head_r * 0.42:.1f}" fill="{SURFACE}"/>'
    if label:
        w = len(label) * label_size * 0.56 + label_size * 1.2
        ly = hy - head_r - label_size * 1.75
        hh = label_size * 1.5
        s += f'<rect x="{cx - w / 2:.1f}" y="{ly + 3:.1f}" width="{w:.1f}" height="{hh:.1f}" rx="{hh / 2:.1f}" fill="{EDGE}"/>'
        s += f'<rect x="{cx - w / 2:.1f}" y="{ly:.1f}" width="{w:.1f}" height="{hh:.1f}" rx="{hh / 2:.1f}" fill="{SURFACE}"/>'
        s += (f'<text x="{cx}" y="{ly + hh * 0.68:.1f}" text-anchor="middle" font-family="Fredoka" font-weight="500" '
              f'font-size="{label_size}" fill="{TEXT}">{label}</text>')
    return s


# ---------- the landscape ----------
def lupines(points, s=1.0):
    out = ''
    for (x, y) in points:
        for i, dx in enumerate((-9, 0, 9)):
            hgt = (22, 30, 20)[i] * s
            out += f'<path d="M{x + dx * s} {y} L{x + dx * s} {y - hgt}" stroke="{PRIMARY}" stroke-width="{2.4 * s:.1f}" stroke-linecap="round"/>'
            out += f'<rect x="{x + dx * s - 3.4 * s:.1f}" y="{y - hgt - 2 * s:.1f}" width="{6.8 * s:.1f}" height="{hgt * 0.62:.1f}" rx="{3.4 * s:.1f}" fill="{LUPINE}"/>'
    return out


def landscape(w=1080, horizon=300, road_y=430, sun=(800, 250, 74), ground_colour=PRIMARY, vs=1.0):
    """Mountains with glaciers, moss hills with lupines, a road and moss ground, for a width w.
    horizon: the foot line of the mountains; vs scales the mountains' height. The road's surface is road_y - 16 .. road_y + 30."""
    s = ''
    k = w / 1080.0
    def Y(dy):  # a height above the horizon, scaled
        return horizon - dy * vs
    if sun:
        s += f'<circle cx="{sun[0]}" cy="{sun[1]}" r="{sun[2]}" fill="{SUN}"/>'
    # far mountains: a pointed one at the left, a broad glacier mountain at the right
    s += (f'<path d="M{-40*k} {Y(-70)} L{120*k} {Y(30)} Q{170*k} {Y(70)} {220*k} {Y(40)} L{300*k} {Y(-10)} '
          f'Q{360*k} {Y(10)} {420*k} {Y(-20)} L{560*k} {Y(40)} Q{640*k} {Y(118)} {760*k} {Y(120)} '
          f'Q{880*k} {Y(122)} {960*k} {Y(50)} L{1120*k} {Y(-40)} L{1120*k} {road_y} L{-40*k} {road_y}Z" fill="{COAST}"/>')
    # glacier caps
    s += (f'<path d="M{622*k} {Y(88)} Q{680*k} {Y(120)} {760*k} {Y(120)} Q{850*k} {Y(121)} {912*k} {Y(84)} '
          f'Q{880*k} {Y(70)} {850*k} {Y(80)} Q{820*k} {Y(64)} {790*k} {Y(80)} Q{760*k} {Y(62)} {725*k} {Y(80)} '
          f'Q{690*k} {Y(64)} {660*k} {Y(82)} Q{640*k} {Y(72)} {622*k} {Y(88)}Z" fill="{SURFACE}"/>')
    s += (f'<path d="M{97*k} {Y(14)} L{120*k} {Y(30)} Q{170*k} {Y(70)} {220*k} {Y(40)} L{236*k} {Y(30)} '
          f'Q{214*k} {Y(22)} {196*k} {Y(32)} Q{176*k} {Y(16)} {156*k} {Y(30)} Q{124*k} {Y(6)} {97*k} {Y(14)}Z" fill="{SURFACE}"/>')
    # moss hills
    hy = road_y - 70 * max(vs * 0.8, 1)
    s += (f'<path d="M{-20*k} {hy+10} Q{140*k} {hy-50} {330*k} {hy-6} Q{520*k} {hy+30} {700*k} {hy-24} Q{880*k} {hy-62} {1100*k} {hy-4} '
          f'L{1100*k} {road_y} L{-20*k} {road_y}Z" fill="{MOSS_LIGHT}"/>')
    s += lupines([(170 * k, hy + 34), (430 * k, hy + 44), (900 * k, hy + 30)], s=1.15 * max(k, 0.8))
    # road: verge, asphalt, dashes
    s += f'<rect x="{-10}" y="{road_y - 22}" width="{w + 20}" height="8" fill="{PRIMARY}"/>'
    s += f'<rect x="{-10}" y="{road_y - 16}" width="{w + 20}" height="46" fill="{ROAD}"/>'
    for i in range(-1, int(w / 96) + 2):
        s += f'<rect x="{i * 96 + 20}" y="{road_y + 5}" width="44" height="5" rx="2.5" fill="{SURFACE}" opacity="0.85"/>'
    s += f'<rect x="{-10}" y="{road_y + 30}" width="{w + 20}" height="2000" fill="{ground_colour}"/>'
    return s


def qr_svg(url, size, unit="mm", dark=TEXT, border=4):
    """A QR code (error correction M) as an SVG of size x size, with a quiet zone of `border` modules."""
    import segno
    q = segno.make(url, error="m", micro=False)
    m = q.matrix
    n = len(m)
    tot = n + 2 * border
    rects = []
    for y, row in enumerate(m):
        x = 0
        while x < n:
            if row[x]:
                x0 = x
                while x < n and row[x]:
                    x += 1
                rects.append(f'M{x0 + border} {y + border}h{x - x0}v1h{-(x - x0)}z')
            else:
                x += 1
    return (f'<svg width="{size}{unit}" height="{size}{unit}" viewBox="0 0 {tot} {tot}" shape-rendering="crispEdges" aria-label="QR code" style="display:block">'
            f'<rect width="{tot}" height="{tot}" fill="#FFFFFF"/><path d="{"".join(rects)}" fill="{dark}"/></svg>'), q.version


# ---------- the rounded retro convertible (2026-11-22, Martin: "more appealing, like a Beetle", generic, no marks) ----------
# Same box as car_open: viewBox 0..100, front to the right, wheels at (25, 77) and (75, 77), r 10.5.
CAR_COLOURS = {
    "sun": dict(body="#F4C04E", light="#F8D57E", dark="#DDA437", line="#C38B22"),
    "glacier": dict(body="#8FCBE6", light="#B8DFF0", dark="#72B4D3", line="#5A9CBB"),
    "lupine": dict(body="#A99BEB", light="#C5BBF2", dark="#9183DA", line="#7A6BC6"),
    "crowberry": dict(body="#F08C9C", light="#F5AEB9", dark="#E2717F", line="#CC5A69"),
}
CHROME = "#D5E1E5"; CHROME_DARK = "#9AA8AE"


def car_round(kind="two", colour="sun", ink=INK, tyre=INK):
    c = CAR_COLOURS[colour]
    s = ''
    # the folded roof on the back deck
    s += f'<path d="M9 56 C9 50.5 13 48.5 18 48.5 C22 48.5 24.5 50.5 24.5 53.5 L24.5 56Z" fill="{WOOL}"/>'
    s += f'<path d="M13 50.2 Q15 53 14 56 M18.5 48.8 Q20.5 52 19.6 56" stroke="#D3C4AA" stroke-width="1.1" fill="none" stroke-linecap="round"/>'
    # puffins in their seats
    if kind == "two":
        s += g(puffin_side(scarf=MOSS_LIGHT, ink=ink), 30, 43.5, 0.54)
    else:
        s += f'<rect x="19.5" y="40" width="21" height="17" rx="6" fill="none" stroke="{CONTROL}" stroke-width="1.6" stroke-dasharray="3.2 2.4"/>'
    s += g(puffin_side(hat=CROW, ink=ink), 61, 44.5, 0.6)
    # windscreen in a chrome frame
    s += (f'<path d="M78.6 56 L82.2 39.4 Q83 37.4 85.2 37.8 Q87.4 38.4 86.9 40.6 L84.6 56Z" fill="#CFE3EA" fill-opacity="0.85" '
          f'stroke="{CHROME}" stroke-width="1.7" stroke-linejoin="round"/>')
    s += f'<path d="M83.4 41.5 L81.7 49.5" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round" opacity="0.9"/>'
    # the body: a low rounded tub, the bonnet curving down to the front
    s += (f'<path d="M12.5 72 L12.5 61 C12.5 57 15.5 54.5 20 54.5 L77 54.5 C84.5 54.5 89 58 90.5 63.5 L91 72Z" fill="{c["body"]}"/>')
    s += f'<path d="M20 54.5 L77 54.5 C82 54.5 85.6 56 87.6 58.4" stroke="{c["light"]}" stroke-width="2" fill="none" stroke-linecap="round"/>'
    s += f'<path d="M14 64.5 L90 64.5" stroke="{c["dark"]}" stroke-width="1.2" opacity="0.7"/>'
    # door seam and handle
    s += f'<path d="M47 56.5 L47 70.5" stroke="{c["line"]}" stroke-width="1" stroke-linecap="round"/>'
    s += f'<rect x="49.5" y="58.2" width="5" height="1.6" rx="0.8" fill="{CHROME_DARK}"/>'
    # wheels: tyres with big round hubcaps
    for x in (25, 75):
        s += f'<circle cx="{x}" cy="77" r="10.5" fill="{tyre}"/><circle cx="{x}" cy="77" r="5.6" fill="{CHROME}"/>'
        s += f'<circle cx="{x}" cy="77" r="5.6" fill="none" stroke="#FFFFFF" stroke-width="0.9" opacity="0.8"/><circle cx="{x}" cy="77" r="1.8" fill="{CHROME_DARK}"/>'
    # round fenders over the wheels, with the wheel well cut out
    fenders = [
        'M3.5 75 C3.5 66 10.5 58.6 22 58.2 C33.5 57.8 42 64.5 42.5 75 L37.24 75 A12.4 12.4 0 0 0 12.76 75 Z',
        'M57.5 75 C58 65 65.5 58.4 75.5 58.4 C85.5 58.4 93.5 63.5 97 72.5 L97.4 75 L87.24 75 A12.4 12.4 0 0 0 62.76 75 Z',
    ]
    for path in fenders:
        s += f'<path d="{path}" fill="{c["dark"]}"/>'
    s += f'<path d="M8.5 64 C12 60.5 16.5 59.3 22 59.2 C29 59 35 61.5 38.5 65.5" stroke="{c["light"]}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.9"/>'
    s += f'<path d="M62 64.5 C65.5 61 70 59.5 75.5 59.5 C82.5 59.5 88.5 62 92 66" stroke="{c["light"]}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="0.9"/>'
    # running board between the fenders
    s += f'<rect x="40.5" y="71.6" width="19" height="3.6" rx="1.6" fill="#5B6B73"/>'
    # round headlight on the front fender, tail light on the back one
    s += f'<circle cx="90.6" cy="63.6" r="3.9" fill="{CHROME}"/><circle cx="90.9" cy="63.6" r="2.9" fill="{SUN}"/><circle cx="91.8" cy="62.7" r="0.9" fill="#FFFFFF"/>'
    s += f'<ellipse cx="6.3" cy="66.5" rx="1.6" ry="2.6" fill="{CROW}"/>'
    # chrome bumpers
    s += f'<rect x="93" y="71.6" width="6.4" height="3.2" rx="1.6" fill="{CHROME}"/>'
    s += f'<rect x="0.8" y="71.6" width="6.4" height="3.2" rx="1.6" fill="{CHROME}"/>'
    return s


# ---------- the Beetle-style puffin car (shared with the site: puffinride-look/car/puffin-beetle-draft.svg) ----------
# Its own box: viewBox 0 4 200 124, front to the right, wheels at (52, 100) and (151, 100), r 15 (bottom y 115),
# bumpers from x 6 to 192. A copy lives next to this file as car-beetle.svg.
def car_beetle(kind="two"):
    import re
    svg = open(os.path.join(os.path.dirname(__file__), "car-beetle.svg")).read()
    inner = svg[svg.index(">", svg.index("<svg")) + 1:svg.rindex("</svg>")]
    if kind == "driver":  # take the back-seat puffin out: the back window is empty
        a = inner.index('<g transform="translate(58 57)')
        b = inner.index('<g transform="translate(96 58)')
        inner = inner[:a] + inner[b:]
    return inner


def beetle_on_road(x, road_y, width, kind="two", moving=False):
    """The Beetle-style car with its left bumper at x and its wheels on road_y; width is bumper to bumper."""
    k = width / 186.0
    top = road_y - 115 * k + 3 * k
    s = ''
    if moving:
        for dy, ln in ((62, 70), (78, 96), (94, 60)):
            yy = top + dy * k
            s += f'<path d="M{x - 18 - ln:.1f} {yy:.1f} L{x - 18:.1f} {yy:.1f}" stroke="{CONTROL}" stroke-width="{1.4 * k:.1f}" stroke-linecap="round"/>'
    s += f'<g transform="translate({x - 6 * k:.1f} {top:.1f}) scale({k:.4f})">{car_beetle(kind)}</g>'
    return s, k, top
