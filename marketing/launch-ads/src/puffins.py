# Our own cartoon puffins, drawn from simple shapes (no tracing, no reference art).
# All functions return SVG fragments. Coordinates: head centre (0, 0), s = scale.
import itertools
_ids = itertools.count(1)

INK = "#1F2A30"        # basalt, the puffin's black
WHITE = "#FFFFFF"
FACE = "#F7F5F0"       # the puffin's white face, a touch warm
GREY = "#7C93A0"       # the blue-grey plate at the beak's base
SUN = "#F4C04E"
BEAK = "#F26B2E"       # beak orange (illustration only)
BEAKD = "#D9512A"      # the beak's darker grooves and tip
FEET = "#F58A3A"
CROW = "#F08C9C"
WOOL = "#EADFCB"
MOSS = "#2F6B4F"
MOSSL = "#9ED0A0"
GLACIER = "#8FCBE6"
LUPINE = "#A99BEB"


def uid(p="c"):
    return f"{p}{next(_ids)}"


def g(inner, cx=0, cy=0, s=1, extra=""):
    return f'<g transform="translate({cx:.2f} {cy:.2f}) scale({s:.4f})" {extra}>{inner}</g>'


def front_beak(blush=True):
    """The beak seen from the front: a tall shield with a grey plate, a yellow line and an orange tip."""
    cid = uid("b")
    shape = "M-7 -3.2 Q0 -6.6 7 -3.2 Q6.2 7 2.4 13.6 Q0 16.8 -2.4 13.6 Q-6.2 7 -7 -3.2Z"
    s = f'<defs><clipPath id="{cid}"><path d="{shape}"/></clipPath></defs>'
    s += f'<g clip-path="url(#{cid})">'
    s += f'<rect x="-9" y="-8" width="18" height="10" fill="{GREY}"/>'
    s += f'<rect x="-9" y="1.6" width="18" height="2.2" fill="{SUN}"/>'
    s += f'<rect x="-9" y="3.8" width="18" height="16" fill="{BEAK}"/>'
    s += f'<path d="M-6 8.2 Q0 10.4 6 8.2" stroke="{BEAKD}" stroke-width="1.1" fill="none"/>'
    s += '</g>'
    # yellow rosettes at the corners of the mouth
    s += f'<circle cx="-7.2" cy="-1.6" r="1.9" fill="{SUN}"/><circle cx="7.2" cy="-1.6" r="1.9" fill="{SUN}"/>'
    return s


def puffin_front(hat=None, scarf=None, blush=True, outline=None, marks=True, ink=INK):
    """A puffin's head from the front, about 44 wide and 42 tall at scale 1."""
    s = ''
    if outline:
        s += f'<ellipse cx="0" cy="0.5" rx="23.6" ry="21.6" fill="{outline}"/>'
    s += f'<ellipse cx="0" cy="0.5" rx="22" ry="20" fill="{ink}"/>'
    # white face: two cheeks that meet under the black crown
    s += (f'<path d="M-19 4 C-19.5 -6 -12 -10.5 -5 -8.2 Q0 -6.4 5 -8.2 C12 -10.5 19.5 -6 19 4 '
          f'C18.4 12.5 11 17.6 0 17.6 C-11 17.6 -18.4 12.5 -19 4Z" fill="{FACE}"/>')
    if marks:
        # the puffin's eye marks: a small grey triangle above and a line behind each eye
        for sx in (-1, 1):
            s += f'<path d="M{sx*6.4} -4.6 L{sx*10.4} -4.6 L{sx*8.6} -8.2Z" fill="#9AA8AE"/>'
    s += f'<circle cx="-8.6" cy="-1" r="2.7" fill="{INK}"/><circle cx="8.6" cy="-1" r="2.7" fill="{INK}"/>'
    s += f'<circle cx="-7.8" cy="-1.9" r="0.9" fill="{WHITE}"/><circle cx="9.4" cy="-1.9" r="0.9" fill="{WHITE}"/>'
    if blush:
        s += f'<ellipse cx="-13.2" cy="6.6" rx="3.4" ry="2.4" fill="{CROW}" opacity="0.75"/><ellipse cx="13.2" cy="6.6" rx="3.4" ry="2.4" fill="{CROW}" opacity="0.75"/>'
    s += g(front_beak(), 0, 2.2, 0.92)
    if hat:
        s += knitted_hat(hat)
    if scarf:
        s += f'<path d="M-17 15.5 Q0 23 17 15.5 L16 20.5 Q0 27.5 -16 20.5Z" fill="{scarf}"/>'
    return s


def knitted_hat(colour, band=WOOL):
    """A knitted hat (húfa) that sits on the crown."""
    s = f'<path d="M-17.5 -9 C-17 -23 17 -23 17.5 -9Z" fill="{colour}"/>'
    s += f'<path d="M-7 -19.6 L-7 -11 M0 -21 L0 -11 M7 -19.6 L7 -11" stroke="#000" stroke-opacity="0.12" stroke-width="1.6"/>'
    s += f'<rect x="-19" y="-12.2" width="38" height="6.6" rx="3.3" fill="{band}"/>'
    s += f'<circle cx="0" cy="-23.2" r="4" fill="{band}"/>'
    return s


def side_beak():
    """The beak in profile, pointing right, base at x=0: grey plate, yellow line, orange with grooves."""
    cid = uid("sb")
    shape = "M0 -10.5 C8 -10.5 16.5 -5.5 20.5 3.6 C14.5 8 7.5 11 0 11.6 Z"
    s = f'<defs><clipPath id="{cid}"><path d="{shape}"/></clipPath></defs><g clip-path="url(#{cid})">'
    s += f'<rect x="-2" y="-14" width="6.6" height="30" fill="{GREY}"/>'
    s += f'<rect x="4.6" y="-14" width="2.1" height="30" fill="{SUN}"/>'
    s += f'<rect x="6.7" y="-14" width="16" height="30" fill="{BEAK}"/>'
    s += f'<path d="M11.6 -7.4 Q13.6 -1 11.6 9.4 M16 -3.6 Q17.4 1 16 6.6" stroke="{BEAKD}" stroke-width="1.2" fill="none" stroke-linecap="round"/>'
    s += f'<path d="M0 3.6 Q11 4.6 20.5 3.6" stroke="{BEAKD}" stroke-width="1.1" fill="none"/>'
    s += '</g>'
    return s


HEAD_SIDE = "M-21 2 C-21.5 -13 -10 -22 2 -21.6 C12 -21.2 18.6 -15 19.6 -7 L19.6 11 C18 19 9 22.6 -1 22.4 C-12.6 22 -21 14.6 -21 2Z"


def puffin_side(hat=None, scarf=None, blush=True, outline=None, ink=INK, ring=True, face=FACE, beak=True):
    """A puffin's head three-quarters, facing right; head about 41 wide, 41 more with the beak."""
    s = ''
    if outline:
        s += f'<path d="{HEAD_SIDE}" fill="none" stroke="{outline}" stroke-width="3"/>'
    s += f'<path d="{HEAD_SIDE}" fill="{ink}"/>'
    # white face on the side towards us, black crown and nape left around it
    s += (f'<path d="M-13 3 C-13.4 -4.6 -7.6 -8.4 1 -8.2 C9 -8 15.4 -8.6 18.4 -9 L18.4 11.4 '
          f'C15 17.6 8 19.4 0.5 19 C-7.6 18.4 -12.8 11.6 -13 3Z" fill="{face}"/>')
    # the eye with the puffin's red ring and grey marks
    s += f'<path d="M5.4 -6.4 L11.4 -6.4 L8.6 -10.4Z" fill="#8E9CA3"/>'
    s += f'<path d="M6.4 2.6 L10.6 2.6 L8.4 5.2Z" fill="#8E9CA3"/>'
    if ring:
        s += f'<circle cx="8.4" cy="-2" r="3.9" fill="{BEAKD}"/>'
    s += f'<circle cx="8.4" cy="-2" r="2.9" fill="{INK}"/><circle cx="9.4" cy="-3" r="1" fill="{WHITE}"/>'
    if blush:
        s += f'<ellipse cx="3" cy="9.6" rx="3.8" ry="2.5" fill="{CROW}" opacity="0.8"/>'
    if beak:
        s += g(side_beak(), 18.2, -1.4, 1)
        s += f'<circle cx="18.6" cy="7.6" r="2.2" fill="{SUN}"/>'
    if hat:
        s += f'<g transform="translate(-2 1) rotate(-6)">{knitted_hat(hat)}</g>'
    if scarf:
        s += f'<path d="M-19.4 14.4 Q-1 22.6 18.6 14 L18 20.4 Q-1 29 -18.6 20.6Z" fill="{scarf}"/>'
    return s


def puffin_body(head="front", hat=None, scarf=None, wave=False, ink=INK):
    """A whole puffin standing: a pebble body, white belly, orange feet. Head centre at (0, 0)."""
    s = ''
    # feet
    s += f'<path d="M-12 47 Q-15 53 -20 54 L-4 54 Q-6 50 -6 47Z" fill="{FEET}"/>'
    s += f'<path d="M12 47 Q15 53 20 54 L4 54 Q6 50 6 47Z" fill="{FEET}"/>'
    # body
    s += f'<path d="M-20 14 C-27 26 -25 44 -12 49 Q0 52 12 49 C25 44 27 26 20 14Z" fill="{ink}"/>'
    s += f'<path d="M-12 20 C-17 30 -15 42 -7 46 Q0 48 7 46 C15 42 17 30 12 20 Q0 15 -12 20Z" fill="{WHITE}"/>'
    # wings
    if wave:
        s += f'<path d="M20 22 C30 16 36 8 34 2 C32 0 29 2 28 5 C25 12 21 15 17 17Z" fill="{ink}"/>'
    else:
        s += f'<path d="M20 20 C27 26 28 36 23 42 C20 36 18 30 17 22Z" fill="{ink}"/>'
    s += f'<path d="M-20 20 C-27 26 -28 36 -23 42 C-20 36 -18 30 -17 22Z" fill="{ink}"/>'
    s += puffin_front(hat=hat, scarf=scarf) if head == "front" else puffin_side(hat=hat, scarf=scarf)
    return s


def puffin_standing(hat=None, scarf=None, wave=False, ink=INK, sign=None):
    """A whole puffin standing, three-quarters to the right: pebble body, white front, orange feet.
    Head centre at (0, 0); feet at about y = 58."""
    s = ''
    s += f'<path d="M-9 50 Q-12 57 -17 58.4 L-1 58.4 Q-3 54 -3 50Z" fill="{FEET}"/>'
    s += f'<path d="M7 50 Q6 56 2 58.4 L18 58.4 Q12 55 12 50Z" fill="{FEET}"/>'
    s += f'<path d="M-19 12 C-27 24 -26 44 -14 51 Q-2 55 10 52 C22 47 25 30 17 13Z" fill="{ink}"/>'
    s += f'<path d="M-4 18 C-9 28 -8 42 -1 49 Q5 51 10 49 C19 43 21 30 15 18 Q6 14 -4 18Z" fill="{WHITE}"/>'
    if wave:
        s += f'<path d="M15 24 C24 20 31 12 31 5 C30 2 26 3 25 6 C22 13 18 17 12 20Z" fill="{ink}"/>'
    else:
        s += f'<path d="M-18 22 C-24 30 -22 41 -14 46 C-15 38 -13 30 -10 24Z" fill="#000" fill-opacity="0.18"/>'
    if sign:
        s += sign
    s += puffin_side(hat=hat, scarf=scarf, ink=ink)
    return s
