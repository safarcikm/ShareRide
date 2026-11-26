# Builds the proposal page: "now" pictures beside the proposed screens.
#   python3 make.py <now pictures folder> <proposed pictures folder> <out folder>
# Writes <out>/index.html and <out>/img/*.webp.
import html
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

now_dir, new_dir, out = (Path(p) for p in sys.argv[1:4])
img_dir = out / "img"
img_dir.mkdir(parents=True, exist_ok=True)

PHONE = 390
SCREEN = 844


def rounded(picture, radius):
    """The picture with round corners, as the drawn screens have."""
    picture = picture.convert("RGBA")
    mask = Image.new("L", picture.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, picture.width - 1, picture.height - 1], radius, fill=255)
    picture.putalpha(ImageChops.multiply(picture.getchannel("A"), mask))
    return picture


def save(picture, name, radius=0):
    if radius:
        picture = rounded(picture, radius)
    picture.save(img_dir / f"{name}.webp", "WEBP", quality=84, method=6)
    return picture.size


def pinned_bar(picture):
    """How tall the bar at the foot of a whole-screen picture is, in its pixels."""
    rgb = picture.convert("RGB")
    y = rgb.height - 1
    while y > 0 and rgb.getpixel((8, y)) == (255, 255, 255):
        y -= 1
    bar = rgb.height - 1 - y
    return bar + 4 if bar else 0


def first_screen(picture, wide):
    """What shows before scrolling: the top of the screen, with its bar at the foot."""
    screen = (720 if wide else SCREEN) * 2
    if picture.height <= screen:
        return None
    bar = pinned_bar(picture)
    first = Image.new(picture.mode, (picture.width, screen))
    first.paste(picture.crop((0, 0, picture.width, screen - bar)), (0, 0))
    if bar:
        first.paste(picture.crop((0, picture.height - bar, picture.width, picture.height)), (0, screen - bar))
    return first


def image(name, size, alt, cls="", eager=False):
    loading = "" if eager else ' loading="lazy"'
    kind = f' class="{cls}"' if cls else ""
    return f'<img{kind} src="img/{name}.webp" width="{size[0] // 2}" height="{size[1] // 2}" alt="{html.escape(alt)}"{loading}>'


def figure(kind, name, whole, first, alt, wide):
    """One screen: its first screen, and the whole of it when it is longer."""
    label = "Now" if kind == "now" else "Proposed"
    radius = 0 if kind == "new" else (28 if wide else 60)
    size = save(whole, name, radius)
    if first is None:
        pictures = image(name, size, alt)
    else:
        first_size = save(first, f"{name}-first", radius)
        fold = ""
        if not wide:
            fold = f'<span class="fold" style="top:{SCREEN * 2 / size[1] * 100:.2f}%"><i>first screen ends</i></span>'
        pictures = image(f"{name}-first", first_size, alt, "first") + image(name, size, f"{alt}, the whole screen", "whole") + fold
    return (
        f'<figure class="shot {kind}"><figcaption><span class="tag {kind}">{label}</span></figcaption>'
        f'<div class="frame">{pictures}</div></figure>'
    ), first is not None


pairs = [
    dict(
        id="find",
        title="Find, when you are signed in",
        now=[("4-extra/phone/01-front-driver-request-waiting.png", "The front page today, for a driver with a request waiting")],
        new=("home", "Proposed front page for a signed-in driver"),
        was="Your next ride takes the whole first screen. It lists all six stretches of the route, and the search starts below the fold. That someone is waiting shows as a small blue tag at the top and a line at the bottom.",
        will="A greeting, then what needs you in yellow with one button, then the search. Your next ride is one ticket.",
    ),
    dict(
        id="results",
        title="Search results",
        now=[("1-signed-out/phone/09-results-whole.png", "Search results today")],
        new=("results", "Proposed search results"),
        was="The ride card keeps its tag in a band of its own, so every card is taller than it needs to be. Sorting and the filters are a row of chips that runs off the side of the screen. The list ends with nothing more to try.",
        will="The same ticket as everywhere else, with the tag beside the day. Sorting and one Filters button. The end of the list points to every ride leaving soon.",
    ),
    dict(
        id="trip",
        title="A ride's details",
        now=[("1-signed-out/phone/11-trip-whole.png", "A ride's details today")],
        new=("trip", "Proposed details of a ride"),
        was="Your part, the driver, the car, the preferences, the seat picture and the route are all white cards of the same weight. The seat picture sits inside the driver's card, and the day is small above a title that reads N1Vík.",
        will="Your part of the ride comes first, as a ticket with the number of seats. Then the driver, where you sit, the route. The price and Book stay at the bottom of the screen.",
    ),
    dict(
        id="booking",
        title="A booked seat",
        now=[("3-passenger/phone/16-booking-confirmed.png", "A confirmed booking today")],
        new=("booking", "Proposed page of a confirmed booking"),
        was="The title is the route. That the seat is confirmed is said twice, as a tag and as a line, and neither is the title. Every card has a centred button, and Cancel and Report float as loose links at the end.",
        will="The title says it. The road shows what comes next. Message sits beside the driver. Sharing, the weather, a report and cancelling are rows, with cancelling red and last.",
    ),
    dict(
        id="trip-day",
        title="Trip day",
        now=[("3-passenger/phone/22-trip-day-passenger.png", "Trip day for a passenger today")],
        new=("trip-day", "Proposed trip day for a passenger"),
        was="It is the booking page with a Trip day card added. The button that matters, I'm here, comes after the meeting point and the driver, just under the first screen.",
        will="The title counts down. Where to stand and who to look for come first, with the number plate. I'm here stays at the bottom of the screen.",
    ),
    dict(
        id="offer",
        title="Offering a ride, the last step",
        now=[("2-driver/phone/15-offer-5-review-missing.png", "The last step of offering a ride today")],
        new=("offer-check", "Proposed last step of offering a ride"),
        was="The last step opens with three unticked boxes and three buttons. Under them the route is listed twice, once as places and once with times, and the price line starts with 100%.",
        will="You see your ride the way passengers will. Under it, a row for each thing you can still change. What is left before a first ride is one yellow card that also says what is already done. The steps are stops on the road.",
    ),
    dict(
        id="driver-ride",
        title="The driver's ride, with a request waiting",
        now=[("2-driver/phone/28-driver-trip-request.png", "A driver's ride with a request today")],
        new=("driver-ride", "Proposed page of a driver's ride with a request"),
        was="The request is one long card with Accept above Decline and Report right under them. Then six seat bars, one for each stretch, then five buttons of the same weight in a column.",
        will="The request is yellow, with Decline and Accept side by side. Passengers are a list. Seats shrink to one line, with each stretch a tap away. Edit, share, post again and cancel are rows.",
    ),
    dict(
        id="my-rides",
        title="My rides",
        now=[
            ("4-extra/phone/02-my-rides-driver-request-waiting.png", "My rides today, for a driver with a request waiting"),
            ("2-driver/phone/27-driver-my-trips-1-request.png", "My trips today, a second list of the rides you drive"),
        ],
        new=("my-rides", "Proposed My rides for both"),
        was="My rides already puts what needs you first, but as the same tall white card. A second page, My trips, lists the same ride again as a different card, with a Post a trip button.",
        will="One list. Every ride is a ticket that says whether you drive or ride along, and its foot says what it needs or where it stands. Offer a ride sits at the top.",
    ),
    dict(
        id="chat",
        title="A conversation",
        now=[("3-passenger/phone/18-chat-sent.png", "A conversation today")],
        new=("chat", "Proposed conversation"),
        was="Report and Block are the two most visible things at the top. The box to write in is two lines tall, with a label above it.",
        will="The top shows who you are talking to and which ride it is about. Report and block move into the menu. Writing takes one line.",
    ),
    dict(
        id="profile",
        title="Profile and settings",
        now=[
            ("2-driver/phone/34-page-profile.png", "Profile today"),
            ("2-driver/phone/37-page-settings.png", "Settings today"),
        ],
        new=("account", "Proposed Profile, with the settings in it"),
        was="Two pages that overlap. Settings mixes plain text, chips, switches and cards, and Send feedback is on both.",
        will="One page of grouped rows: Driving, Account, Safety and privacy, Help. A row shows what is set now.",
    ),
    dict(
        id="laptop-find",
        title="Find on a laptop",
        wide=True,
        now=[("1-signed-out/laptop/02-front-whole.png", "The front page on a laptop today")],
        new=("laptop-home", "Proposed front page on a laptop"),
        was="The title is centred over the scene while everything under it starts at the left. Offering a ride, half of what PuffinRide is for, is one line of small text at the very end.",
        will="The title at the left with the car on the road beside it. Tickets of equal height. How it works and Offer a ride beside the rides, where a newcomer looks.",
    ),
    dict(
        id="laptop-driver-ride",
        title="The driver's ride on a laptop",
        wide=True,
        now=[("2-driver/laptop/28-driver-trip-request.png", "A driver's ride on a laptop today")],
        new=("laptop-driver-ride", "Proposed page of a driver's ride on a laptop"),
        was="The side column holds six seat bars. Accept and Decline are small and centred in a wide card, and Edit trip and Cancel trip sit side by side at the top with the same weight.",
        will="What needs you fills the main column. The ride, its seats and the things you can do with it are in the side column, with cancelling last.",
    ),
]

sections = []
for pair in pairs:
    wide = pair.get("wide", False)
    figures = []
    longer = False
    for index, (source, alt) in enumerate(pair["now"]):
        name = f"now-{pair['id']}{'' if index == 0 else f'-{index + 1}'}"
        whole = Image.open(now_dir / source)
        markup, more = figure("now", name, whole, first_screen(whole, wide), alt, wide)
        figures.append(markup)
        longer = longer or more
    name = f"new-{pair['id']}"
    whole = Image.open(new_dir / f"{pair['new'][0]}.png")
    first = Image.open(new_dir / f"{pair['new'][0]}--first.png")
    markup, more = figure("new", name, whole, first if whole.height > first.height + 4 else None, pair["new"][1], wide)
    figures.append(markup)
    longer = longer or more
    toggle = (
        ""
        if wide
        else '<div class="seg" hidden><button type="button" data-view="now">Now</button><button type="button" data-view="new">Proposed</button></div>'
    )
    whole_button = '<button type="button" class="more" aria-pressed="false" hidden>Show the whole screens</button>' if longer else ""
    sections.append(
        f"""<section class="pair" id="{pair['id']}">
  <h3>{pair['title']}</h3>
  <dl class="was"><dt><span class="tag now">Now</span></dt><dd>{pair['was']}</dd><dt><span class="tag new">Proposed</span></dt><dd>{pair['will']}</dd></dl>
  <div class="stage {'wide' if wide else 'phones'}" data-size="first">{toggle}{''.join(figures)}</div>
  {whole_button}
</section>"""
    )

# The opening row and the two pictures that stand alone.
hero = []
for source, label in (("home", "Find, signed in"), ("booking", "A booked seat"), ("driver-ride", "The driver's ride")):
    size = save(Image.open(new_dir / f"{source}--first.png"), f"hero-{source}")
    hero.append(f'<figure>{image(f"hero-{source}", size, f"Proposed: {label}", eager=True)}<figcaption>{label}</figcaption></figure>')
parts_size = save(Image.open(new_dir / "parts.png"), "parts")
dark_size = save(Image.open(new_dir / "home-is-dark--first.png"), "new-home-is-dark")

page = (Path(__file__).parent / "page.html").read_text()
page = (
    page.replace("{{HERO}}", "".join(hero))
    .replace("{{PAIRS}}", "\n".join(sections))
    .replace("{{PARTS_W}}", str(parts_size[0] // 2))
    .replace("{{PARTS_H}}", str(parts_size[1] // 2))
    .replace("{{DARK_W}}", str(dark_size[0] // 2))
    .replace("{{DARK_H}}", str(dark_size[1] // 2))
)
(out / "index.html").write_text(page)
total = sum(f.stat().st_size for f in img_dir.iterdir())
print(f"{len(list(img_dir.iterdir()))} pictures, {total / 1e6:.1f} MB")
