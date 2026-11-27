# The App Store and Google Play store pages' words (spec 32, 3.9), in one place:
# the fields Martin pastes into App Store Connect and the Play Console, and the
# captions over the screenshots. `python3 listing.py <out.md>` checks every field
# against its store's limit and Martin's rule for marketing (never a word about
# payments or fees), then writes the texts page. pictures.py takes the captions.
#
# Claims are true to the apps on 2026-11-27: open to everyone aged 18 and over,
# more than 100 meeting points (136 on puffinride.is), the driver's profile
# before booking, a verified phone number for everyone, chat once a booking is
# confirmed, word (push or email) when someone asks for a seat, Icelandic and
# English. Nothing about Google sign-in: the iPhone app has none in version 1
# (spec 32, 3.3).
import re
import sys

LIMITS = {
    # App Store Connect (product page, per language)
    "app_store.name": 30,
    "app_store.subtitle": 30,
    "app_store.promotional": 170,
    "app_store.keywords": 100,
    "app_store.description": 4000,
    # Google Play Console (main store listing, per language)
    "google_play.title": 30,
    "google_play.short": 80,
    "google_play.full": 4000,
    # The pictures: a caption on two lines at most (Google: under 20% of the picture)
    "caption": 42,
}

# Martin, 2026-11-22: marketing never mentions payments or fees. The store pages
# show the app's screens as they are, prices on the ride cards included, but no
# word of ours is about money. Also Google Play's rules for listings: no
# "best", "#1", "free", "new" or calls to action in the pictures.
MONEY = re.compile(
    r"\b(pay|paid|paying|payment\w*|price\w*|fee|fees|cost\w*|cheap\w*|money|ISK|kr|free|"
    r"greiða|greiðsl\w*|borga|borgar|borgað\w*|borgum|borgið|borgun\w*|verð\w*|gjald\w*|kostnað\w*|ódýr\w*|krón\w*|ókeypis)\b",
    re.IGNORECASE,
)
PROMO = re.compile(r"\b(best|#1|top|new|download now|install now|try now|besta|nýtt|nýr|ný)\b", re.IGNORECASE)

APP_STORE_DESCRIPTION = """\
PuffinRide is carpooling across Iceland. Drivers who are going somewhere anyway offer the empty seats in their car, and passengers book a seat for the whole way or just part of it, from one meeting point to another.

Find a ride
• Search by town or meeting point and day, and see the rides that go your way.
• Book a seat for the whole ride or only the part you need: from Borgarnes to Blönduós on a ride from Reykjavík to Akureyri, for example.
• Some rides book instantly; on others the driver says yes first.

See who you travel with
• Every driver has a profile with a first name, a photo, the languages they speak, reviews and a reliability figure.
• See the car's make, model and colour before you book, and its number plate once your seat is confirmed.
• Once a booking is confirmed, message each other in the app.

Offer a ride
• Driving somewhere? Post your ride in a few steps, from meeting point to meeting point, and choose how many seats to offer.
• Decide whether people book instantly or ask you first.
• We let you know as soon as someone asks for a seat.

Meeting points
• More than 100 meeting points around the country, at fuel stations, bus terminals and well-known sights, and each one tells you where to stand.

Safety
• Everyone has a verified phone number, and your number is never shown to other people.
• Community rules everyone accepts, and reviews after every ride.
• Report or block anyone.
• Download your data or delete your account at any time.

PuffinRide is in an open beta, open to everyone aged 18 and over, in English and Icelandic. We have only just started, so if no ride goes your way yet, offer one or look again soon.

Questions or ideas? Write to admin@puffinride.is."""

GOOGLE_PLAY_FULL_IS = """\
PuffinRide er samakstur um allt Ísland. Bílstjórar sem eru hvort sem er á leiðinni bjóða laus sæti í bílnum sínum og farþegar bóka sæti alla leiðina eða bara hluta hennar, frá einum mótsstað til annars.

Finndu far
• Leitaðu eftir bæ eða mótsstað og degi og sjáðu ferðirnar sem fara þína leið.
• Bókaðu sæti alla leiðina eða bara þann hluta sem þú þarft, til dæmis frá Borgarnesi til Blönduóss í ferð frá Reykjavík til Akureyrar.
• Sumar ferðir má bóka strax, í öðrum samþykkir bílstjórinn fyrst.

Sjáðu með hverjum þú ferð
• Hver bílstjóri er með prófíl með fornafni, mynd, tungumálum, umsögnum og áreiðanleika.
• Þú sérð tegund, gerð og lit bílsins áður en þú bókar, og bílnúmerið þegar sætið er staðfest.
• Þegar bókun er staðfest getið þið spjallað saman í appinu.

Bjóddu far
• Ertu að keyra eitthvert? Settu ferðina inn í nokkrum skrefum, frá mótsstað til mótsstaðar, og veldu hve mörg sæti þú býður.
• Þú ræður hvort fólk bókar strax eða biður þig fyrst.
• Við látum þig vita um leið og einhver biður um sæti.

Mótsstaðir
• Yfir 100 mótsstaðir um allt land, við bensínstöðvar, umferðarmiðstöðvar og vinsæla áfangastaði, og hver þeirra segir þér hvar á að standa.

Öryggi
• Allir eru með staðfest símanúmer og þitt númer er aldrei sýnt öðrum.
• Samfélagsreglur sem allir samþykkja, og umsagnir eftir hverja ferð.
• Þú getur tilkynnt eða útilokað hvern sem er.
• Þú getur sótt gögnin þín eða eytt aðganginum hvenær sem er.

PuffinRide er í opinni prófun, opið öllum 18 ára og eldri, á íslensku og ensku. Við erum nýbyrjuð, svo ef engin ferð fer þína leið enn, bjóddu far eða kíktu aftur fljótlega.

Spurningar eða hugmyndir? Skrifaðu okkur á admin@puffinride.is."""

LISTING = {
    "app_store": {
        "language": "English (U.K.)",
        "name": "PuffinRide",
        "subtitle": "Carpooling across Iceland",
        "promotional": (
            "Going the same way? Find a seat in someone's car, or offer the empty seats in yours, "
            "at more than 100 meeting points around Iceland."
        ),
        "keywords": "carpool,rideshare,lift,ride,hitchhike,road trip,Reykjavik,Akureyri,Selfoss,Keflavik,samakstur,far",
        "description": APP_STORE_DESCRIPTION,
    },
    "google_play": {
        "en": {
            "language": "English (United Kingdom), en-GB",
            "title": "PuffinRide",
            "short": "Carpooling across Iceland: find a ride, or offer the empty seats in your car.",
            "full": APP_STORE_DESCRIPTION,
        },
        "is": {
            "language": "Icelandic, is-IS",
            "title": "PuffinRide",
            "short": "Samakstur um allt Ísland: finndu far eða bjóddu lausu sætin í bílnum þínum.",
            "full": GOOGLE_PLAY_FULL_IS,
        },
    },
}

# The screenshots, in the order the stores show them: the journey's file (in
# apps/mobile/maestro/store, store-<lang>-<file>.png) and the caption over it.
SCREENS = [
    {
        "file": "1-find",
        "en": "Share your ride across Iceland",
        "is": "Verum samferða um Ísland",
    },
    {
        "file": "4-results",
        "en": "Book the whole way, or just part of it",
        "is": "Alla leiðina eða bara hluta hennar",
    },
    {
        "file": "3-ride",
        "en": "See who's driving before you book",
        "is": "Sjáðu hver keyrir áður en þú bókar",
    },
    {
        "file": "5-meeting-points",
        "en": "More than 100 meeting points",
        "is": "Yfir 100 mótsstaðir um allt land",
    },
    {
        "file": "2-leaving-soon",
        "en": "Rides leaving soon, all over Iceland",
        "is": "Ferðir sem fara bráðum, um allt land",
    },
    {
        "file": "7-offer",
        "en": "Driving anyway? Offer the empty seats",
        "is": "Á leiðinni? Bjóddu lausu sætin",
    },
]

# Spec 32, 3.9: the addresses both stores ask for.
ADDRESSES = {
    "Privacy policy": "https://puffinride.is/legal/privacy",
    "Support": "https://puffinride.is/about",
    "Marketing (App Store only)": "https://puffinride.is",
    "Account deletion (Google Play only)": "https://puffinride.is/delete-account",
}

FEATURE = {
    "en": {"title": "Share your ride", "line": "Carpooling across Iceland"},
    "is": {"title": "Verum samferða", "line": "Samakstur um allt Ísland"},
}


def fields():
    """Every field with its limit's key and its text."""
    a = LISTING["app_store"]
    out = [(f"app_store.{k}", f"App Store, {k}", a[k]) for k in ("name", "subtitle", "promotional", "keywords", "description")]
    for lang, p in LISTING["google_play"].items():
        out += [(f"google_play.{k}", f"Google Play ({lang}), {k}", p[k]) for k in ("title", "short", "full")]
    for s in SCREENS:
        out += [("caption", f"Caption {s['file']} ({lang})", s[lang]) for lang in ("en", "is")]
    for lang, f in FEATURE.items():
        out += [("caption", f"Feature graphic ({lang})", f"{f['title']} {f['line']}")]
    return out


def check():
    """The problems with the texts: too long, money, a promise the stores forbid."""
    problems = []
    for key, name, text in fields():
        limit = LIMITS[key]
        size = len(text.encode("utf-8")) if key == "app_store.keywords" else len(text)
        if size > limit:
            problems.append(f"{name}: {size} of {limit}")
        for rule, pattern in (("money", MONEY), ("promotion", PROMO)):
            found = pattern.search(text)
            if found and not (rule == "money" and key == "app_store.keywords"):
                problems.append(f"{name}: says {found.group(0)!r} ({rule})")
    if re.search(r"google", LISTING["app_store"]["description"], re.IGNORECASE):
        problems.append("App Store: the iPhone app has no Google sign-in in version 1")
    return problems


def count(key, text):
    size = len(text.encode("utf-8")) if key == "app_store.keywords" else len(text)
    return f"{size} of {LIMITS[key]}"


def markdown():
    a = LISTING["app_store"]
    g = LISTING["google_play"]
    q = "```"
    lines = [
        "# PuffinRide store pages: the texts",
        "",
        "Written by `src/listing.py`: change the words there and run",
        "`python3 src/listing.py texts.md`, which also checks each field's length",
        "and that nothing mentions payments or fees. Copy each box into the field",
        "named above it. Spec 32, 3.9; the rest of the kit is in [README.md](README.md).",
        "",
        "## App Store, English (U.K.)",
        "",
        "App Store Connect, PuffinRide, the 1.0 version's page. The App Store offers",
        "no Icelandic for store texts, so this is the page Iceland sees.",
        "",
    ]
    for key, label in (
        ("name", "Name (App Information)"),
        ("subtitle", "Subtitle (App Information)"),
        ("promotional", "Promotional text"),
        ("keywords", "Keywords (commas, no spaces after them)"),
        ("description", "Description"),
    ):
        lines += [f"**{label}**, {count('app_store.' + key, a[key])} characters:", "", f"{q}text", a[key], q, ""]
    lines += ["## The addresses", "", "| Field | Address |", "| ----- | ------- |"]
    lines += [f"| {name} | `{url}` |" for name, url in ADDRESSES.items()]
    lines += [""]
    lines += [
        "## Google Play, Icelandic and English",
        "",
        "Play Console, PuffinRide, Grow users, Store presence, Main store listing.",
        "Make Icelandic the default language and add English (United Kingdom) as a",
        "translation, each with its own texts and pictures.",
        "",
    ]
    for lang in ("is", "en"):
        p = g[lang]
        lines += [f"### {p['language']}", ""]
        for key, label in (("title", "App name"), ("short", "Short description"), ("full", "Full description")):
            lines += [f"**{label}**, {count('google_play.' + key, p[key])} characters:", "", f"{q}text", p[key], q, ""]
    lines += [
        "## The captions on the pictures",
        "",
        "| Picture | English | Icelandic |",
        "| ------- | ------- | --------- |",
    ]
    for n, s in enumerate(SCREENS, 1):
        lines.append(f"| {n}. `{s['file']}` | {s['en']} | {s['is']} |")
    lines += ["", f"Feature graphic: \"{FEATURE['en']['title']}\", \"{FEATURE['en']['line']}\"; "
              f"\"{FEATURE['is']['title']}\", \"{FEATURE['is']['line']}\".", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    found = check()
    if found:
        print("\n".join(found))
        sys.exit(1)
    if len(sys.argv) > 1:
        with open(sys.argv[1], "w", encoding="utf-8") as out:
            out.write(markdown())
    print("texts ok")
