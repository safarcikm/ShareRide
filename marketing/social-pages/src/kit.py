# The Facebook and Instagram page kit (2026-11-25): profile picture, highlight covers, the first posts
# (Instagram feed 1080 x 1350, also fine on Facebook) and a welcome story, in Icelandic and English.
# python3 kit.py <build dir>   then   node ../../launch-ads/src/render.cjs <build>/manifest-kit.json <out dir>
# Martin's rules: never mention payments or fees; no Meta Pixel. Claims stay true to the app today.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: F401,F403

W, H = 1080, 1350
PAD = 76
URL = "puffinride.is"

EXTRA = {
    "route": '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    "shield": '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    "question": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    "calendar": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
    "star": '<path d="M11.5 2.3a.6.6 0 0 1 1 0l2.6 5.4 5.9.8a.6.6 0 0 1 .3 1l-4.3 4.1 1 5.9a.6.6 0 0 1-.8.6L12 17.3l-5.3 2.8a.6.6 0 0 1-.8-.6l1-5.9L2.6 9.5a.6.6 0 0 1 .3-1l5.9-.8Z"/>',
    "flag": '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    "snow": '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    "send": '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    "lightbulb": '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
}


def icon2(name, size, colour, sw=2.2):
    """ico() from the ads, with a few more line icons (Lucide shapes, ISC licence)."""
    if name in EXTRA:
        return (f'<svg width="{size}px" height="{size}px" viewBox="0 0 24 24" fill="none" stroke="{colour}" stroke-width="{sw}" '
                f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;flex:none">{EXTRA[name]}</svg>')
    return ico(name, size, colour, sw=sw)


# ---------------------------------------------------------------- texts
T = {
    "is": {
        "welcome": dict(chip="Nýtt · Opið öllum", h="Verum samferða",
                        sub="Samakstur um allt Ísland: finndu far með öðrum eða bjóddu laus sæti í bílnum þínum.",
                        cta="Kíktu á"),
        "how": [
            dict(h="Svona virkar PuffinRide", sub="Fjögur skref frá leit að ferð.", swipe="Strjúktu til að sjá meira"),
            dict(h="Leitaðu að fari", sub="Veldu hvaðan, hvert og hvaða dag. Þú sérð líka ferðir sem fara bara hluta leiðarinnar."),
            dict(h="Sjáðu hver keyrir", sub="Bílstjórar eru með mynd, staðfest símanúmer og einkunnir frá fyrri farþegum."),
            dict(h="Bókaðu sæti", sub="Alla leiðina eða bara hluta hennar. Eftir bókun spjallið þið saman í appinu."),
            dict(h="Hittist á mótsstaðnum", sub="Hver mótsstaður segir þér nákvæmlega hvar á að standa."),
            dict(h="Áttu laus sæti?", sub="Bjóddu far og deildu ferðinni. Þú velur leiðina og mótsstaðina.", cta="Bjóddu far á"),
        ],
        "steps": ["Leitaðu að fari", "Sjáðu hver keyrir", "Bókaðu sæti", "Hittist á mótsstaðnum"],
        "search": dict(frm="Frá", to="Til", day="Dagur", frm_v="Reykjavík – BSÍ", to_v="Akureyri – Hof",
                       day_v="Föstudagur 18. desember", button="Leita", result="09:00 → 13:30", seats="2 laus sæti",
                       part="Fer líka um Borgarnes og Blönduós"),
        "profile": dict(name="Sigga", since="Á PuffinRide síðan nóvember 2026", phone="Símanúmer staðfest",
                        rating="4,9 (12 einkunnir)", review="„Stundvís og þægileg ferð norður.“", driver="Bílstjóri"),
        "book": dict(stops=["Reykjavík", "Borgarnes", "Blönduós", "Akureyri"], yours="Þinn hluti",
                     msg1="Hæ! Ég bíð við N1 í Borgarnesi.", msg2="Frábært, sjáumst kl. 10!"),
        "meet": dict(name="BSÍ", place="Reykjavík", label="Hvar á að standa",
                     where="Við aðalinngang umferðarmiðstöðvarinnar.", amen=["Skjól", "Salerni", "Verslun"]),
        "map": dict(chip="Mótsstaðir", h="Yfir 100 mótsstaðir um allt land",
                    sub="Bensínstöðvar, umferðarmiðstöðvar og vinsælir áfangastaðir, frá Ísafirði til Hafnar.",
                    legend="Hver punktur er mótsstaður", cta="Sjáðu þá alla á"),
        "safety": dict(chip="Öryggi", h="Vittu með hverjum þú ferð",
                       points=[("users", "Bílstjórar með mynd og einkunnir"), ("phone", "Allir með staðfest símanúmer"),
                               ("chat", "Spjall í appinu eftir bókun"), ("flag", "Tilkynntu eða útilokaðu ef eitthvað er að")],
                       cta="Kíktu á"),
        "xmas": dict(chip="Jólin", h="Á leið heim um jólin?",
                     sub="Bjóddu laus sætin í bílnum eða finndu far heim. Fleiri í hverjum bíl, færri bílar á veginum.",
                     cta="Finndu far á"),
        "winter": dict(chip="Vetrarakstur", h="Á ferð að vetri",
                       points=[("route", "Athugaðu færðina á umferdin.is"), ("snow", "Skoðaðu veðrið á vedur.is"),
                               ("pin", "Skildu eftir ferðaáætlun á safetravel.is"), ("chat", "Láttu vita í spjallinu ef eitthvað breytist")],
                       foot="Góða ferð!"),
        "feedback": dict(chip="Beta", h="Segðu okkur hvað þér finnst",
                         sub="PuffinRide er nýtt og við erum að bæta það á hverjum degi. Við lesum allt.",
                         how="Á prófílnum þínum: Senda ábendingu"),
        "story": dict(h="Verum samferða", sub="Samakstur um allt Ísland.", cta="Kíktu á", tagline="Samferða um Ísland"),
    },
    "en": {
        "welcome": dict(chip="New · Open to everyone", h="Share your ride",
                        sub="Carpool across Iceland: find a seat in someone else's car, or offer the empty seats in yours.",
                        cta="Have a look at"),
        "how": [
            dict(h="How PuffinRide works", sub="Four steps from search to seat.", swipe="Swipe to see more"),
            dict(h="Search for a ride", sub="Choose where from, where to and the day. You also see trips that go only part of your way."),
            dict(h="See who's driving", sub="Drivers have a photo, a verified phone number and ratings from earlier passengers."),
            dict(h="Book a seat", sub="All the way or just part of it. Once you've booked, you chat in the app."),
            dict(h="Meet at the meeting point", sub="Every meeting point tells you exactly where to stand."),
            dict(h="Got empty seats?", sub="Offer a ride and share the trip. You choose the route and the stops.", cta="Offer a ride at"),
        ],
        "steps": ["Search for a ride", "See who's driving", "Book a seat", "Meet at the meeting point"],
        "search": dict(frm="From", to="To", day="Day", frm_v="Reykjavík – BSÍ", to_v="Akureyri – Hof",
                       day_v="Friday 18 December", button="Search", result="09:00 → 13:30", seats="2 free seats",
                       part="Also stops at Borgarnes and Blönduós"),
        "profile": dict(name="Sigga", since="On PuffinRide since November 2026", phone="Phone verified",
                        rating="4.9 (12 ratings)", review="“On time and a comfortable ride north.”", driver="Driver"),
        "book": dict(stops=["Reykjavík", "Borgarnes", "Blönduós", "Akureyri"], yours="Your part",
                     msg1="Hi! I'll wait at N1 in Borgarnes.", msg2="Great, see you at 10!"),
        "meet": dict(name="BSÍ bus terminal", place="Reykjavík", label="Where to stand",
                     where="By the main entrance of the bus terminal.", amen=["Shelter", "Toilets", "Shop"]),
        "map": dict(chip="Meeting points", h="100+ meeting points around Iceland",
                    sub="Fuel stations, bus terminals and favourite sights, from Ísafjörður to Höfn.",
                    legend="Each dot is a meeting point", cta="See them all at"),
        "safety": dict(chip="Safety", h="Know who you're riding with",
                       points=[("users", "Drivers with a photo and ratings"), ("phone", "Everyone has a verified phone number"),
                               ("chat", "Chat in the app once you've booked"), ("flag", "Report or block if something's wrong")],
                       cta="Have a look at"),
        "xmas": dict(chip="Christmas", h="Heading home for Christmas?",
                     sub="Offer the empty seats in your car or find a ride home. More people in each car, fewer cars on the road.",
                     cta="Find a ride at"),
        "winter": dict(chip="Winter driving", h="Travelling in winter",
                       points=[("route", "Check road conditions at umferdin.is"), ("snow", "Check the weather at vedur.is"),
                               ("pin", "Leave a travel plan at safetravel.is"), ("chat", "Tell the others in the chat if plans change")],
                       foot="Have a good trip!"),
        "feedback": dict(chip="Beta", h="Tell us what you think",
                         sub="PuffinRide is new and we're making it better every day. We read everything.",
                         how="On your profile: Send feedback"),
        "story": dict(h="Share your ride", sub="Carpooling across Iceland.", cta="Have a look at", tagline="Shared rides across Iceland"),
    },
}


# ---------------------------------------------------------------- building blocks
def chip(text, fs=26, bg=PRIMARY_SOFT, fg=PRIMARY):
    return (f'<span style="display:inline-flex;align-items:center;height:{fs*1.9:.0f}px;padding:0 {fs*0.8:.0f}px;border-radius:999px;'
            f'background:{bg};color:{fg};font:700 {fs}px/1 Nunito;white-space:nowrap">{text}</span>')


def header(right=""):
    return (f'<div style="position:absolute;left:{PAD}px;right:{PAD}px;top:64px;display:flex;align-items:center;justify-content:space-between">'
            f'{lockup(64)}{right}</div>')


def headline(h, sub=None, top=190, size=96, sub_size=38, width=None):
    width = width or (W - 2 * PAD)
    s = (f'<div style="position:absolute;left:{PAD}px;top:{top}px;width:{width}px">'
         f'<h1 style="font-size:{size}px;line-height:1.04">{h}</h1>')
    if sub:
        s += f'<p class="sub" style="margin-top:{sub_size*0.62:.0f}px;font-size:{sub_size}px;line-height:1.32">{sub}</p>'
    return s + '</div>'


def card(inner, x, y, w, extra=""):
    return (f'<div style="position:absolute;left:{x}px;top:{y}px;width:{w}px;background:{SURFACE};border-radius:36px;'
            f'border:2px solid {EDGE};box-shadow:0 8px 0 {EDGE};{extra}">{inner}</div>')


def ground_scene(road_from_bottom=150, mtn=150, vs=1.0, car=None, pins=None, car_w=440, car_x=None, sun=True, extra="", winter=False):
    road_y = H - road_from_bottom
    horizon = road_y - mtn
    s = landscape(W, horizon=horizon, road_y=road_y, sun=((W * 0.92, horizon - 22 * vs - 30, 58) if sun else None), vs=vs)
    if winter:
        s = winterise(s)
    ground = road_y - 20
    for (x, name) in (pins or []):
        s += map_pin(W * x, ground, h=84, label=name, label_size=28)
    if car:
        cx = car_x if car_x is not None else W * 0.5 - car_w / 2 + 30
        s += beetle_on_road(cx, road_y + 8, car_w, kind=car, moving=True)[0]
    return svg(s + extra, W, H), road_y


def winterise(s):
    """The same landscape in snow: white hills and ground, pale lupines gone, a paler road verge."""
    s = s.replace(f'fill="{MOSS_LIGHT}"', 'fill="#FFFFFF"').replace(f'fill="{LUPINE}"', 'fill="#FFFFFF" fill-opacity="0"')
    s = s.replace(f'stroke="{PRIMARY}" stroke-width', 'stroke="#FFFFFF" stroke-opacity="0" stroke-width')
    return s


def cta_on_ground(text, road_y, fs=34):
    top = road_y + 30 + (H - road_y - 30 - fs * 2.3) / 2
    return f'<div style="position:absolute;left:0;right:0;top:{top:.0f}px;display:flex;justify-content:center">{cta(text, URL, fs)}</div>'


def step_badge(n, total=None, fs=26):
    label = f"{n}/{total}" if total else str(n)
    return chip(label, fs)


def puffin_avatar(size):
    inner = g(puffin_side(hat=CROW), 50, 58, 1.35)
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 100 100" style="display:block;flex:none;border-radius:50%;background:{GLACIER}">'
            f'<clipPath id="av"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#av)">{inner}</g></svg>')


# ---------------------------------------------------------------- the posts
def welcome(lang):
    t = T[lang]["welcome"]
    scene, road_y = ground_scene(road_from_bottom=160, mtn=230, vs=1.6, car="two", car_w=600,
                                 pins=[(0.1, "Ísafjörður"), (0.9, "Egilsstaðir")])
    body = scene + header(chip(t["chip"])) + headline(t["h"], t["sub"], top=200, size=124, sub_size=42)
    body += cta_on_ground(t["cta"], road_y)
    return page(body, W, H, lang)


def how(lang, i):
    t = T[lang]["how"][i]
    total = len(T[lang]["how"])
    badge = step_badge(i + 1, total)
    if i == 0:
        steps = T[lang]["steps"]
        items = ''.join(
            f'<div style="display:flex;align-items:center;gap:26px;height:92px">'
            f'<span style="display:flex;align-items:center;justify-content:center;width:68px;height:68px;border-radius:50%;background:{PRIMARY};'
            f'font:600 36px/1 Fredoka;color:#fff;flex:none">{n + 1}</span>'
            f'<span style="font:700 40px/1.15 Nunito;color:{TEXT}">{s}</span></div>' for n, s in enumerate(steps))
        scene, road_y = ground_scene(road_from_bottom=150, mtn=120, vs=0.9, car="two", car_w=400)
        body = scene + header(badge) + headline(t["h"], t["sub"], top=196, size=100)
        body += f'<div style="position:absolute;left:{PAD}px;top:520px">{items}</div>'
        body += (f'<div style="position:absolute;left:0;right:0;top:{road_y + 50}px;display:flex;justify-content:center;align-items:center;gap:16px;'
                 f'font:600 34px/1 Fredoka;color:#FFFFFF">{t["swipe"]}{icon2("arrow", 38, "#FFFFFF", 2.8)}</div>')
        return page(body, W, H, lang)
    number = (f'<span style="display:inline-flex;align-items:center;justify-content:center;width:84px;height:84px;border-radius:50%;'
              f'background:{PRIMARY};font:600 46px/1 Fredoka;color:#fff">{i}</span>') if i <= 4 else ''
    body = header(badge)
    body += f'<div style="position:absolute;left:{PAD}px;top:180px">{number}</div>' if number else ''
    body += headline(t["h"], t["sub"], top=290 if number else 200, size=92, sub_size=38)
    vis = [None, search_visual, profile_visual, book_visual, meet_visual, offer_visual][i]
    body += vis(lang)
    return page(body, W, H, lang)


def field(icon_name, label, value):
    return (f'<div style="display:flex;align-items:center;gap:22px;padding:22px 28px;border-bottom:2px solid {EDGE}">'
            f'{icon2(icon_name, 40, PRIMARY, 2.4)}<div><div style="font:600 24px/1 Nunito;color:{MUTED}">{label}</div>'
            f'<div style="margin-top:8px;font:700 36px/1.1 Nunito;color:{TEXT}">{value}</div></div></div>')


def search_visual(lang):
    t = T[lang]["search"]
    inner = field("pin", t["frm"], t["frm_v"]) + field("pin", t["to"], t["to_v"]) + field("calendar", t["day"], t["day_v"])
    inner += (f'<div style="padding:24px 28px"><div style="display:flex;align-items:center;justify-content:center;gap:16px;height:84px;'
              f'border-radius:999px;background:{PRIMARY};box-shadow:0 6px 0 {PRIMARY_EDGE};font:600 36px/1 Fredoka;color:#fff">'
              f'{icon2("search", 36, "#FFFFFF", 2.8)}{t["button"]}</div></div>')
    s = card(inner, PAD, 640, W - 2 * PAD)
    res = (f'<div style="display:flex;align-items:center;gap:22px;padding:24px 28px">'
           f'{puffin_avatar(76)}<div style="flex:1"><div style="font:600 36px/1 Fredoka;color:{TEXT}">{t["result"]}</div>'
           f'<div style="margin-top:8px;font:600 26px/1.2 Nunito;color:{MUTED}">{t["part"]}</div></div>'
           f'{chip(t["seats"], 24)}</div>')
    s += card(res, PAD, 1150, W - 2 * PAD)
    return s


def profile_visual(lang):
    t = T[lang]["profile"]
    inner = (f'<div style="display:flex;align-items:center;gap:30px;padding:34px 36px 26px">{puffin_avatar(150)}'
             f'<div><div style="display:flex;align-items:center;gap:16px"><span style="font:600 56px/1 Fredoka;color:{TEXT}">{t["name"]}</span>{chip(t["driver"], 22)}</div>'
             f'<div style="margin-top:12px;font:600 26px/1.2 Nunito;color:{MUTED}">{t["since"]}</div></div></div>')
    inner += (f'<div style="display:flex;flex-direction:column;gap:18px;padding:8px 36px 30px">'
              f'<div style="display:flex;align-items:center;gap:16px;font:700 32px/1 Nunito;color:{TEXT}">'
              f'<span style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:{PRIMARY_SOFT}">{icon2("check", 30, PRIMARY, 3)}</span>{t["phone"]}</div>'
              f'<div style="display:flex;align-items:center;gap:16px;font:700 32px/1 Nunito;color:{TEXT}">'
              f'<span style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:#FDF1D6">'
              f'<svg width="30" height="30" viewBox="0 0 24 24" style="display:block"><path d="{STAR}" fill="{SUN}" stroke="#DDA437" stroke-width="1.2" stroke-linejoin="round"/></svg></span>{t["rating"]}</div></div>')
    inner += (f'<div style="margin:0 36px 34px;padding:24px 28px;border-radius:24px;background:{FROST};font:600 30px/1.35 Nunito;color:{TEXT}">'
              f'{t["review"]}</div>')
    return strip() + card(inner, PAD, 640, W - 2 * PAD)


STAR = "M11.5 2.3a.6.6 0 0 1 1 0l2.6 5.4 5.9.8a.6.6 0 0 1 .3 1l-4.3 4.1 1 5.9a.6.6 0 0 1-.8.6L12 17.3l-5.3 2.8a.6.6 0 0 1-.8-.6l1-5.9L2.6 9.5a.6.6 0 0 1 .3-1l5.9-.8Z"


def book_visual(lang):
    t = T[lang]["book"]
    cw = W - 2 * PAD
    # the trip's stops on a line, the booked part (stops 2 to 4) in moss
    xs = [70, 70 + (cw - 140) / 3, 70 + 2 * (cw - 140) / 3, cw - 70]
    y = 120
    s = f'<path d="M{xs[0]} {y} L{xs[-1]} {y}" stroke="{EDGE}" stroke-width="12" stroke-linecap="round"/>'
    s += f'<path d="M{xs[1]} {y} L{xs[3]} {y}" stroke="{PRIMARY}" stroke-width="12" stroke-linecap="round"/>'
    for n, x in enumerate(xs):
        on = n >= 1
        s += f'<circle cx="{x}" cy="{y}" r="20" fill="{PRIMARY if on else SURFACE}" stroke="{PRIMARY if on else CONTROL}" stroke-width="6"/>'
        s += f'<text x="{x}" y="{y + 66}" text-anchor="middle" font-family="Nunito" font-weight="700" font-size="28" fill="{TEXT if on else MUTED}">{t["stops"][n]}</text>'
    mid = (xs[1] + xs[3]) / 2
    s += f'<rect x="{mid - 120}" y="{y - 86}" width="240" height="52" rx="26" fill="{PRIMARY}"/>'
    s += f'<text x="{mid}" y="{y - 51}" text-anchor="middle" font-family="Fredoka" font-weight="600" font-size="28" fill="#FFFFFF">{t["yours"]}</text>'
    route = card(f'<svg width="{cw - 4}" height="220" viewBox="0 0 {cw - 4} 220" style="display:block">{s}</svg>', PAD, 640, cw)
    bubble = lambda text, mine: (
        f'<div style="display:flex;justify-content:{"flex-end" if mine else "flex-start"};align-items:flex-end;gap:16px">'
        + ('' if mine else puffin_avatar(64)) +
        f'<div style="max-width:640px;padding:22px 30px;border-radius:32px;{"border-bottom-right-radius:10px" if mine else "border-bottom-left-radius:10px"};'
        f'background:{PRIMARY if mine else SURFACE};border:2px solid {PRIMARY if mine else EDGE};font:600 32px/1.3 Nunito;color:{"#fff" if mine else TEXT}">{text}</div></div>')
    chat = (f'<div style="position:absolute;left:{PAD}px;right:{PAD}px;top:940px;display:flex;flex-direction:column;gap:22px">'
            f'{bubble(t["msg1"], True)}{bubble(t["msg2"], False)}</div>')
    return strip() + route + chat


def meet_visual(lang):
    t = T[lang]["meet"]
    road_y = H - 150
    horizon = road_y - 140
    s = landscape(W, horizon=horizon, road_y=road_y, sun=(W * 0.92, horizon - 50, 50), vs=0.9)
    ground = road_y - 20
    s += map_pin(W * 0.68, ground, h=100, label="BSÍ", label_size=30)
    k = 1.6
    s += g(puffin_standing(scarf=MOSS_LIGHT, wave=True), W * 0.68 + 96, ground - 58.4 * k + 8, k)
    s += beetle_on_road(70, road_y + 8, 360, kind="driver", moving=True)[0]
    out = svg(s, W, H)
    amen = ''.join(chip(a, 24) for a in t["amen"])
    inner = (f'<div style="padding:32px 36px">'
             f'<div style="display:flex;align-items:center;gap:20px">'
             f'<span style="display:flex;align-items:center;justify-content:center;width:72px;height:72px;border-radius:50%;background:{PRIMARY_SOFT}">{icon2("pin", 40, PRIMARY, 2.4)}</span>'
             f'<div><div style="font:600 44px/1 Fredoka;color:{TEXT}">{t["name"]}</div><div style="margin-top:6px;font:600 26px/1 Nunito;color:{MUTED}">{t["place"]}</div></div></div>'
             f'<div style="margin-top:28px;font:700 24px/1 Nunito;color:{MUTED};text-transform:uppercase;letter-spacing:.06em">{t["label"]}</div>'
             f'<div style="margin-top:12px;font:700 36px/1.3 Nunito;color:{TEXT}">{t["where"]}</div>'
             f'<div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap">{amen}</div></div>')
    return out + card(inner, PAD, 620, W - 2 * PAD)


def strip():
    """A low strip of the landscape at the bottom of a carousel slide."""
    road_y = H - 96
    s = landscape(W, horizon=road_y - 70, road_y=road_y, sun=(W * 0.93, road_y - 120, 40), vs=0.55)
    return svg(s, W, H)


def offer_visual(lang):
    t = T[lang]["how"][5]
    seat = {"is": "Laust sæti", "en": "Free seat"}[lang]
    road_y = H - 170
    horizon = road_y - 200
    s = landscape(W, horizon=horizon, road_y=road_y, sun=(W * 0.92, horizon - 60, 58), vs=1.3)
    ground = road_y - 20
    s += map_pin(W * 0.1, ground, h=88, label="Selfoss", label_size=28)
    s += map_pin(W * 0.9, ground, h=88, label="Reykjavík", label_size=28)
    car_w = 560
    cx = W * 0.5 - car_w / 2 + 30
    car, k, top = beetle_on_road(cx, road_y + 8, car_w, kind="driver", moving=True)
    s += car + seat_tag(cx, top, k, seat, fs=30)
    return svg(s, W, H) + cta_on_ground(t["cta"], road_y)


def seat_tag(cx, top, k, label, fs=26):
    w = len(label) * fs * 0.55 + fs * 1.3
    hh = fs * 1.6
    ax = cx - 6 * k + 50 * k
    ly = top + 34 * k - hh
    lx = ax + 16 - w
    s = f'<rect x="{lx:.1f}" y="{ly + 4:.1f}" width="{w:.1f}" height="{hh:.1f}" rx="{hh/2:.1f}" fill="{PRIMARY_EDGE}"/>'
    s += f'<rect x="{lx:.1f}" y="{ly:.1f}" width="{w:.1f}" height="{hh:.1f}" rx="{hh/2:.1f}" fill="{PRIMARY}"/>'
    s += f'<path d="M{ax - 11:.1f} {ly + hh - 1:.1f} L{ax:.1f} {ly + hh + 13:.1f} L{ax + 11:.1f} {ly + hh - 1:.1f}Z" fill="{PRIMARY}"/>'
    s += f'<text x="{lx + w / 2:.1f}" y="{ly + hh * 0.68:.1f}" text-anchor="middle" font-family="Fredoka" font-weight="600" font-size="{fs}" fill="#FFFFFF">{label}</text>'
    return s


MAP = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "iceland-map.json")))


def iceland(width, dot=7.0):
    """The app's own map of Iceland (Natural Earth, public domain) with every meeting point as a dot."""
    k = width / MAP["size"]["width"]
    h = MAP["size"]["height"] * k
    s = f'<g transform="scale({k:.4f})">'
    for ring in MAP["land"]:
        s += f'<polygon points="{ring}" fill="{MOSS_LIGHT}" stroke="{PRIMARY}" stroke-width="2.4" stroke-linejoin="round"/>'
    for ring in MAP["glaciers"]:
        s += f'<polygon points="{ring}" fill="#FFFFFF" opacity="0.9"/>'
    for road in MAP["roads"]:
        tag = "polygon" if road["ring"] else "polyline"
        s += f'<{tag} points="{road["points"]}" fill="none" stroke="{STEERING}" stroke-opacity="0.45" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>'
    for p in MAP["points"]:
        s += f'<circle cx="{p["x"]:.1f}" cy="{p["y"]:.1f}" r="{dot / k:.1f}" fill="{PRIMARY}" stroke="#FFFFFF" stroke-width="{2.2 / k:.1f}"/>'
    s += '</g>'
    return s, h


def map_post(lang):
    t = T[lang]["map"]
    body = header(chip(t["chip"])) + headline(t["h"], t["sub"], top=186, size=88, sub_size=36)
    mw = 900
    m, mh = iceland(mw, dot=9)
    top = 520
    body += f'<svg width="{mw}" height="{mh:.0f}" viewBox="0 0 {mw} {mh:.0f}" style="position:absolute;left:{(W - mw) / 2:.0f}px;top:{top}px">{m}</svg>'
    body += (f'<div style="position:absolute;left:0;right:0;justify-content:center;top:{top + mh + 6:.0f}px;display:flex;align-items:center;gap:14px;font:700 28px/1 Nunito;color:{MUTED}">'
             f'<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="{PRIMARY}" stroke="#fff" stroke-width="3"/></svg>{t["legend"]}</div>')
    body += f'<div style="position:absolute;left:0;right:0;bottom:46px;display:flex;justify-content:center">{cta(t["cta"], URL + "/meeting-points", 32)}</div>'
    return page(body, W, H, lang)


def points_list(points, fs=38, gap=30, icon_bg=PRIMARY_SOFT, colour=TEXT):
    out = f'<div style="display:flex;flex-direction:column;gap:{gap}px">'
    for icon_name, p in points:
        out += (f'<div style="display:flex;align-items:center;gap:{fs*0.65:.0f}px">'
                f'<span style="display:flex;align-items:center;justify-content:center;width:{fs*2:.0f}px;height:{fs*2:.0f}px;border-radius:50%;background:{icon_bg};flex:none">'
                f'{icon2(icon_name, fs*1.1, PRIMARY, 2.3)}</span>'
                f'<span style="font:700 {fs}px/1.25 Nunito;color:{colour}">{p}</span></div>')
    return out + '</div>'


def safety(lang):
    t = T[lang]["safety"]
    scene, road_y = ground_scene(road_from_bottom=150, mtn=110, vs=0.85, car="two", car_w=380,
                                 pins=[(0.1, "Höfn"), (0.9, "Vík")])
    body = scene + header(chip(t["chip"])) + headline(t["h"], None, top=190, size=96)
    body += f'<div style="position:absolute;left:{PAD}px;right:{PAD}px;top:{470 if lang == "en" else 470}px">{points_list(t["points"], fs=36, gap=26)}</div>'
    body += cta_on_ground(t["cta"], road_y)
    return page(body, W, H, lang)


def snowflakes(n, seed, x0, x1, y0, y1, r=(3, 7)):
    import random
    rnd = random.Random(seed)
    return ''.join(f'<circle cx="{rnd.uniform(x0, x1):.0f}" cy="{rnd.uniform(y0, y1):.0f}" r="{rnd.uniform(*r):.1f}" fill="#FFFFFF" opacity="{rnd.uniform(.6, 1):.2f}"/>'
                   for _ in range(n))


NIGHT_SKY = "#24414F"


def xmas(lang):
    t = T[lang]["xmas"]
    road_y = H - 160
    horizon = road_y - 210
    s = f'<rect width="{W}" height="{H}" fill="{NIGHT_SKY}"/>'
    # northern lights: two soft moss and glacier bands
    s += '<g transform="translate(0 150)">'
    s += (f'<path d="M-40 520 C200 380 420 600 640 470 C820 360 960 420 1120 330 L1120 420 C960 500 820 450 640 560 C420 690 200 470 -40 610Z" fill="{MOSS_LIGHT}" opacity="0.28"/>'
          f'<path d="M-40 600 C240 470 470 660 700 540 C880 450 1000 500 1120 430 L1120 480 C1000 550 880 520 700 600 C470 720 240 540 -40 650Z" fill="{GLACIER}" opacity="0.22"/>')
    s += '</g>'
    s += snowflakes(18, 5, 0, W, 0, 170, r=(2, 4))  # above the words
    s += snowflakes(46, 7, 0, W, 870, horizon + 60, r=(2, 5))  # under them
    land = landscape(W, horizon=horizon, road_y=road_y, sun=None, vs=1.4)
    land = winterise(land).replace(f'fill="{COAST}"', 'fill="#B6C9D2"').replace(f'height="2000" fill="{PRIMARY}"', 'height="2000" fill="#FFFFFF"')
    s += land
    ground = road_y - 20
    s += map_pin(W * 0.1, ground, h=88, label="Reykjavík", label_size=28)
    s += map_pin(W * 0.9, ground, h=88, label="Egilsstaðir" if lang == "is" else "Egilsstaðir", label_size=28)
    s += beetle_on_road(W * 0.5 - 300 + 30, road_y + 8, 600, kind="two", moving=True)[0]
    s += snowflakes(26, 11, 0, W, horizon, road_y - 30, r=(2, 4.5))
    body = svg(s, W, H)
    body += (f'<div style="position:absolute;left:{PAD}px;right:{PAD}px;top:64px;display:flex;align-items:center;justify-content:space-between">'
             f'{lockup(64, colour="#FFFFFF")}{chip(t["chip"], 26, bg="#FFFFFF", fg=PRIMARY)}</div>')
    body += (f'<div style="position:absolute;left:{PAD}px;width:{W - 2*PAD}px;top:196px">'
             f'<h1 style="font-size:104px;line-height:1.04;color:#FFFFFF">{t["h"]}</h1>'
             f'<p class="sub" style="margin-top:24px;font-size:38px;line-height:1.32;color:#DCE8EC">{t["sub"]}</p></div>')
    fs = 34
    top = road_y + 30 + (H - road_y - 30 - fs * 2.3) / 2
    body += f'<div style="position:absolute;left:0;right:0;top:{top:.0f}px;display:flex;justify-content:center">{cta(t["cta"], URL, fs)}</div>'
    return page(body, W, H, lang)


def tree(cx, base):
    """A small spruce tied on the roof, lying down, with a red ribbon."""
    s = f'<g transform="translate({cx:.0f} {base:.0f})">'
    s += f'<rect x="-120" y="-8" width="22" height="14" rx="4" fill="#8A5A3B"/>'
    s += f'<path d="M-104 -2 L120 -2 L-104 -48 Z" fill="{PRIMARY}"/><path d="M-104 -2 L120 -2 L-104 44 Z" fill="{PRIMARY_EDGE}"/>'
    s += f'<path d="M-60 -38 L-60 34 M0 -26 L0 22 M56 -14 L56 10" stroke="#FFFFFF" stroke-width="5" opacity="0.65" stroke-linecap="round"/>'
    s += f'<rect x="-34" y="-34" width="12" height="70" rx="5" fill="{CROW}"/>'
    s += '</g>'
    return s


def winter(lang):
    t = T[lang]["winter"]
    road_y = H - 150
    horizon = road_y - 120
    s = landscape(W, horizon=horizon, road_y=road_y, sun=(W * 0.9, horizon - 40, 46), vs=0.9)
    s = winterise(s).replace(f'height="2000" fill="{PRIMARY}"', 'height="2000" fill="#FFFFFF"')
    s += snowflakes(40, 3, 0, W, horizon - 120, road_y - 30, r=(2.5, 5.5))
    s += beetle_on_road(W * 0.5 - 200 + 30, road_y + 8, 400, kind="two", moving=True)[0]
    body = svg(s, W, H) + header(chip(t["chip"])) + headline(t["h"], None, top=190, size=100)
    body += f'<div style="position:absolute;left:{PAD}px;right:{PAD}px;top:380px">{points_list(t["points"], fs=36, gap=28)}</div>'
    body += (f'<div style="position:absolute;left:0;right:0;top:{road_y + 52}px;text-align:center;font:600 44px/1 Fredoka;color:{PRIMARY}">'
             f'{t["foot"]}</div>')
    return page(body, W, H, lang)


def feedback(lang):
    t = T[lang]["feedback"]
    scene, road_y = ground_scene(road_from_bottom=150, mtn=140, vs=1.0, car=None)
    # a puffin with a speech bubble on the moss hill
    k = 2.3
    pf = g(puffin_standing(scarf=MOSS_LIGHT, wave=True), W * 0.24, road_y - 20 - 58.4 * k + 8, k)
    bubble = (f'<g transform="translate({W * 0.24 + 70:.0f} {road_y - 330})">'
              f'<rect x="0" y="0" width="300" height="150" rx="50" fill="#FFFFFF" stroke="{EDGE}" stroke-width="3"/>'
              f'<path d="M30 140 L10 190 L80 146 Z" fill="#FFFFFF" stroke="{EDGE}" stroke-width="3" stroke-linejoin="round"/>'
              f'<rect x="20" y="130" width="70" height="16" fill="#FFFFFF"/>'
              f'<circle cx="95" cy="75" r="14" fill="{PRIMARY}"/><circle cx="150" cy="75" r="14" fill="{PRIMARY}"/><circle cx="205" cy="75" r="14" fill="{PRIMARY}"/></g>')
    body = scene.replace('</svg>', pf + bubble + '</svg>')
    body += header(chip(t["chip"])) + headline(t["h"], t["sub"], top=190, size=100, sub_size=38)
    body += (f'<div style="position:absolute;left:{PAD}px;top:620px;display:flex;align-items:center;gap:18px;padding:20px 30px;border-radius:999px;'
             f'background:{SURFACE};border:2px solid {EDGE};font:700 32px/1 Nunito;color:{TEXT}">{icon2("send", 36, PRIMARY, 2.4)}{t["how"]}</div>')
    body += cta_on_ground("", road_y)
    return page(body, W, H, lang)


# ---------------------------------------------------------------- profile picture, highlight covers, story
def profile_picture(S=1080):
    """The app icon's puffin pin on moss, sized for the round crop Facebook and Instagram show."""
    k = 8.6
    cx, cy = 53.9, 50.0
    inner = f'<g transform="translate({S/2 - cx*k:.1f} {S/2 - cy*k:.1f}) scale({k})">{ICON_PIN}</g>'
    board = f'<svg width="{S}" height="{S}" viewBox="0 0 {S} {S}" style="display:block"><rect width="{S}" height="{S}" fill="{PRIMARY}"/>{inner}</svg>'
    return page(board, S, S, "is")


def profile_check(S=1080):
    """How the picture looks in the circle (for checking only)."""
    k = 8.6
    cx, cy = 53.9, 50.0
    inner = f'<g transform="translate({S/2 - cx*k:.1f} {S/2 - cy*k:.1f}) scale({k})">{ICON_PIN}</g>'
    board = (f'<svg width="{S}" height="{S}" viewBox="0 0 {S} {S}" style="display:block"><rect width="{S}" height="{S}" fill="#FFFFFF"/>'
             f'<clipPath id="c"><circle cx="{S/2}" cy="{S/2}" r="{S/2}"/></clipPath><g clip-path="url(#c)"><rect width="{S}" height="{S}" fill="{PRIMARY}"/>{inner}</g></svg>')
    return page(board, S, S, "is")


HIGHLIGHTS = [
    ("how", "route", "Svona virkar", "How it works"),
    ("find", "search", "Finna far", "Find a ride"),
    ("offer", "car", "Bjóða far", "Offer a ride"),
    ("points", "pin", "Mótsstaðir", "Meeting points"),
    ("safety", "shield", "Öryggi", "Safety"),
    ("questions", "question", "Spurningar", "Questions"),
]


def highlight(icon_name):
    """Instagram highlight cover, 1080 x 1920: Instagram shows the middle as a circle."""
    Wd, Hd = 1080, 1920
    board = (f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">'
             f'{icon2(icon_name, 420, "#F7F5F0", 1.9)}</div>')
    return page(board, Wd, Hd, "is", bg=PRIMARY)


def story(lang):
    """A welcome story, 1080 x 1920. The top 270 and bottom 340 px stay free for Instagram's own bars."""
    t = T[lang]["story"]
    Ws, Hs = 1080, 1920
    road_y = Hs - 560
    horizon = road_y - 260
    s = landscape(Ws, horizon=horizon, road_y=road_y, sun=(Ws * 0.92, horizon - 70, 64), vs=2.0)
    ground = road_y - 20
    s += map_pin(Ws * 0.1, ground, h=92, label="Reykjavík", label_size=30)
    s += map_pin(Ws * 0.9, ground, h=92, label="Akureyri", label_size=30)
    s += beetle_on_road(Ws * 0.5 - 310 + 30, road_y + 8, 620, kind="two", moving=True)[0]
    body = f'<svg width="{Ws}" height="{Hs}" viewBox="0 0 {Ws} {Hs}" style="position:absolute;left:0;top:0">{s}</svg>'
    body += (f'<div style="position:absolute;left:84px;right:84px;top:290px">{lockup(84)}'
             f'<h1 style="margin-top:80px;font-size:150px;line-height:1.02">{t["h"]}</h1>'
             f'<p class="sub" style="margin-top:30px;font-size:52px;line-height:1.3">{t["sub"]}</p></div>')
    body += f'<div style="position:absolute;left:0;right:0;top:{road_y + 70}px;display:flex;justify-content:center">{cta(t["cta"], URL, 40)}</div>'
    body += (f'<div style="position:absolute;left:0;right:0;top:{road_y + 230}px;text-align:center;font:600 36px/1 Fredoka;color:{PRIMARY_SOFT};opacity:.9">'
             f'{t["tagline"]}</div>')
    assert road_y + 70 + 40 * 2.3 + 6 <= Hs - 340
    return page(body, Ws, Hs, lang)


if __name__ == "__main__":
    build = sys.argv[1]
    only = sys.argv[2:]
    jobs = []
    for lang in ("is", "en"):
        jobs.append((f"post-01-welcome-{lang}-1080x1350", welcome(lang), W, H))
        for i in range(6):
            jobs.append((f"post-02-how-it-works-{lang}-slide{i + 1}-1080x1350", how(lang, i), W, H))
        jobs.append((f"post-03-meeting-points-{lang}-1080x1350", map_post(lang), W, H))
        jobs.append((f"post-04-safety-{lang}-1080x1350", safety(lang), W, H))
        jobs.append((f"post-05-christmas-{lang}-1080x1350", xmas(lang), W, H))
        jobs.append((f"post-06-winter-travel-{lang}-1080x1350", winter(lang), W, H))
        jobs.append((f"post-07-feedback-{lang}-1080x1350", feedback(lang), W, H))
        jobs.append((f"story-welcome-{lang}-1080x1920", story(lang), 1080, 1920))
    jobs.append(("profile-picture-1080", profile_picture(), 1080, 1080))
    jobs.append(("check-profile-picture-in-circle", profile_check(), 1080, 1080))
    for n, (key, icon_name, is_, en) in enumerate(HIGHLIGHTS, 1):
        jobs.append((f"highlight-{n}-{key}-1080x1920", highlight(icon_name), 1080, 1920))
    if only:
        jobs = [j for j in jobs if any(o in j[0] for o in only)]
    write_jobs(build, jobs, "manifest-kit.json")
    print(len(jobs), "pictures")
