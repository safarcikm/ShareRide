from puffins import *
FROST="#EEF3F4"; NIGHT="#121A1E"; CARBODY="#F5F8F9"; GLASS="#A9C4CE"; SEAT="#D5E1E5"

def car_top(theme="light"):
    """A: the car from above, front to the right; driver front (top) in a hat, you in the back."""
    body, glass, seat, edge, wheel = (CARBODY, GLASS, SEAT, "#1F4A36", INK) if theme=="light" else ("#34454E", "#557784", "#3E525C", "#0B1013", "#0B1013")
    s = ''
    for x in (20, 64):
        s += f'<rect x="{x}" y="19" width="17" height="9" rx="4.5" fill="{wheel}"/><rect x="{x}" y="72" width="17" height="9" rx="4.5" fill="{wheel}"/>'
    s += f'<rect x="6" y="25" width="88" height="53" rx="23" fill="{edge}"/>'
    s += f'<rect x="6" y="22" width="88" height="53" rx="23" fill="{body}"/>'
    s += f'<rect x="90" y="30" width="4" height="9" rx="2" fill="{SUN}"/><rect x="90" y="58" width="4" height="9" rx="2" fill="{SUN}"/>'
    s += f'<rect x="6" y="31" width="3.6" height="8" rx="1.8" fill="{CROW}"/><rect x="6" y="58" width="3.6" height="8" rx="1.8" fill="{CROW}"/>'
    s += f'<path d="M77 31 Q84 48.5 77 66 L82 64 Q88 48.5 82 33Z" fill="{glass}"/>'
    s += f'<path d="M15 34 Q11 48.5 15 63" stroke="{glass}" stroke-width="3.4" fill="none" stroke-linecap="round"/>'
    s += f'<rect x="21" y="29" width="18" height="17" rx="6" fill="{seat}"/>'  # back, free
    s += f'<rect x="50" y="51" width="18" height="17" rx="6" fill="{seat}"/>'  # front passenger, free
    s += g(puffin_side(hat=CROW), 54, 39, 0.42)
    s += g(puffin_side(scarf=MOSSL), 27, 60, 0.42)
    return s

def car_profile(theme="light"):
    """A2: a little car from the side, two puffins at the windows."""
    body = CARBODY; glass="#CFE3EA"
    s = f'<path d="M8 66 C8 56 12 52 20 50 L30 36 C33 32 37 30 42 30 L64 30 C70 30 74 33 78 38 L86 50 C92 52 94 56 94 64 L94 68 C94 71 92 72 89 72 L11 72 C9 72 8 70 8 68Z" fill="{body}"/>'
    s += f'<path d="M33 37 C35 34 38 33 41 33 L49 33 L49 50 L23 50Z" fill="{glass}"/>'
    s += f'<path d="M53 33 L63 33 C67 33 70 35 72 38 L81 50 L53 50Z" fill="{glass}"/>'
    s += f'<clipPath id="w1"><path d="M33 37 C35 34 38 33 41 33 L49 33 L49 50 L23 50Z"/></clipPath>'
    s += f'<clipPath id="w2"><path d="M53 33 L63 33 C67 33 70 35 72 38 L81 50 L53 50Z"/></clipPath>'
    s += f'<g clip-path="url(#w1)">{g(puffin_side(scarf=MOSSL), 36, 49, 0.42)}</g>'
    s += f'<g clip-path="url(#w2)">{g(puffin_side(hat=CROW), 61, 49, 0.42)}</g>'
    s += f'<rect x="88" y="55" width="6" height="5" rx="2.5" fill="{SUN}"/><rect x="8" y="56" width="5" height="5" rx="2.5" fill="{CROW}"/>'
    for x in (28, 74):
        s += f'<circle cx="{x}" cy="72" r="10" fill="{INK}"/><circle cx="{x}" cy="72" r="4" fill="#9AA8AE"/>'
    return s

def lundi_icon():
    """B: Lundi, a puffin's head in a knitted hat, filling the square."""
    return g(puffin_side(hat=CROW, scarf=None), 40, 56, 1.42)

PIN = "M50 92 C44 80 22 66 22 42 C22 25 35 12 50 12 C65 12 78 25 78 42 C78 66 56 80 50 92Z"
def pin_icon(bg, pinfill=INK):
    """C: the meeting-point pin is a puffin: black pin, white face, the beak pointing the way."""
    s = f'<path d="{PIN}" fill="{pinfill}"/>'
    s += f'<path d="M30 42 C30 33 37 27 46 27 C56 27 66 28 70 29 L70 54 C65 63 57 67 49 67 C38 67 30 58 30 42Z" fill="{FACE}"/>'
    s += f'<path d="M52 31 L58 31 L55 27.2Z" fill="#8E9CA3"/><path d="M52.8 46.4 L57.2 46.4 L55 49.2Z" fill="#8E9CA3"/>'
    s += f'<circle cx="55" cy="38.5" r="5.3" fill="{BEAKD}"/><circle cx="55" cy="38.5" r="4" fill="{INK}"/><circle cx="56.4" cy="37.1" r="1.4" fill="#fff"/>'
    s += f'<ellipse cx="45" cy="54" rx="5" ry="3.4" fill="{CROW}" opacity="0.8"/>'
    s += g(side_beak(), 69, 37, 1.25)
    s += f'<circle cx="69.6" cy="50" r="2.8" fill="{SUN}"/>'
    return s

def icon(inner, bg, size, rx=22.5):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 100 100"><clipPath id="clip{size}{id(inner)%9999}"><rect width="100" height="100" rx="{rx}"/></clipPath><g clip-path="url(#clip{size}{id(inner)%9999})"><rect width="100" height="100" fill="{bg}"/>{inner}</g></svg>'

def car_open(body=CARBODY, wheel=INK, hub="#9AA8AE", glass="#CFE3EA", shade="#D5E1E5", ink=INK):
    """A: a little round car from the side, open on top; two puffins ride in it, the driver in front."""
    s = ''
    s += g(puffin_side(scarf=MOSSL, ink=ink), 27, 42.5, 0.55)
    s += g(puffin_side(hat=CROW, ink=ink), 61, 44, 0.6)
    s += f'<path d="M79.5 55 L83.5 37.5 Q84.3 35 86.8 35.6 Q89.2 36.4 88.6 39 L86 55Z" fill="{glass}" fill-opacity="0.85" stroke="{body}" stroke-width="1.8" stroke-linejoin="round"/>'
    s += f'<path d="M84.6 39.5 L82.6 49" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round" opacity="0.9"/>'
    s += f'<path d="M6 62 C6 56 10 54 16 54 L84 54 C91 54 95 58 95 64 L95 72 C95 75.5 93 77 89.5 77 L11 77 C8 77 6 75 6 72Z" fill="{body}"/>'
    s += f'<path d="M6 66.5 L95 66.5" stroke="{shade}" stroke-width="2.2"/>'
    s += f'<rect x="44" y="60" width="8" height="2.6" rx="1.3" fill="{shade}"/>'
    s += f'<rect x="89" y="58.5" width="6" height="5" rx="2.5" fill="{SUN}"/><rect x="6" y="58.5" width="5" height="5" rx="2.5" fill="{CROW}"/>'
    for x in (25, 75):
        s += f'<circle cx="{x}" cy="77" r="10.5" fill="{wheel}"/><circle cx="{x}" cy="77" r="4.2" fill="{hub}"/>'
    return s

# ---- one-colour (Android themed, iOS tinted) versions: a silhouette with the face and details cut out
def mono_wrap(fg, bg, shapes_fg, shapes_bg):
    return f'<g fill="{fg}">{shapes_fg}</g><g fill="{bg}">{shapes_bg}</g>'

def mono_head(fg, bg, hat=False):
    from puffins import HEAD_SIDE
    face = ('<path d="M-13 3 C-13.4 -4.6 -7.6 -8.4 1 -8.2 C9 -8 15.4 -8.6 18.4 -9 L18.4 11.4 '
            'C15 17.6 8 19.4 0.5 19 C-7.6 18.4 -12.8 11.6 -13 3Z"/>')
    beak = '<g transform="translate(18.2 -1.4)"><path d="M0 -10.5 C8 -10.5 16.5 -5.5 20.5 3.6 C14.5 8 7.5 11 0 11.6 Z"/></g>'
    s = f'<g fill="{fg}"><path d="{HEAD_SIDE}"/>{beak}</g>'
    s += f'<g fill="{bg}">{face}</g>'
    s += f'<g fill="{fg}"><circle cx="8.4" cy="-2" r="3.6"/></g>'
    s += f'<path d="M23.6 -11 L23.6 11" stroke="{bg}" stroke-width="1.8"/>'
    if hat:
        s += f'<g transform="translate(-2 1) rotate(-6)" fill="{fg}" stroke="{bg}" stroke-width="1.6"><path d="M-17.5 -9 C-17 -23 17 -23 17.5 -9Z"/><rect x="-19" y="-12.2" width="38" height="6.6" rx="3.3"/><circle cx="0" cy="-23.2" r="4"/></g>'
    return s

def mono_A(fg, bg):
    s = g(mono_head(fg, bg), 27, 42.5, 0.55) + g(mono_head(fg, bg, hat=True), 61, 44, 0.6)
    s += f'<g fill="{fg}"><path d="M6 62 C6 56 10 54 16 54 L84 54 C91 54 95 58 95 64 L95 72 C95 75.5 93 77 89.5 77 L11 77 C8 77 6 75 6 72Z"/>'
    s += f'<path d="M79.5 55 L83.5 37.5 Q84.3 35 86.8 35.6 Q89.2 36.4 88.6 39 L86 55Z"/></g>'
    for x in (25, 75):
        s += f'<circle cx="{x}" cy="77" r="12.2" fill="{bg}"/><circle cx="{x}" cy="77" r="10.5" fill="{fg}"/><circle cx="{x}" cy="77" r="4.2" fill="{bg}"/>'
    return s

def mono_B(fg, bg):
    return g(mono_head(fg, bg, hat=True), 36, 55, 1.32)

def mono_C(fg, bg):
    s = f'<path d="{PIN}" fill="{fg}"/>'
    s += f'<path d="M30 42 C30 33 37 27 46 27 C56 27 66 28 70 29 L70 54 C65 63 57 67 49 67 C38 67 30 58 30 42Z" fill="{bg}"/>'
    s += f'<circle cx="55" cy="38.5" r="4.6" fill="{fg}"/>'
    s += f'<g transform="translate(69 37) scale(1.25)"><path d="M0 -10.5 C8 -10.5 16.5 -5.5 20.5 3.6 C14.5 8 7.5 11 0 11.6 Z" fill="{fg}"/><path d="M4.4 -10 L4.4 11" stroke="{bg}" stroke-width="1.6"/></g>'
    return s
