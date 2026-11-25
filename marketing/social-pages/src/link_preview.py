# The picture a shared ride's link could show on Facebook, Messenger and other apps (1200 x 630),
# and a board that shows how such a link looks in a feed today and with the picture.
# python3 link_preview.py <build dir>   (then render.cjs on <build>/manifest-preview.json)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *  # noqa: F401,F403

TRIP = {
    "is": dict(route=("Reykjavík", "Akureyri"), when="Föstudagur 28. nóvember kl. 09:00",
               stops_label="Mótsstaðir á leiðinni", stops=["Borgarnes", "Blönduós"], seats="Laus sæti",
               cta="Bókaðu sæti á"),
    "en": dict(route=("Reykjavík", "Akureyri"), when="Friday 28 November at 09:00",
               stops_label="Stops on the way", stops=["Borgarnes", "Blönduós"], seats="Free seats",
               cta="Book a seat at"),
}


def seat_tag(cx, top, k, label, fs=26):
    """The green 'Free seats' tag pointing at the empty back window (as on the drivers' ad)."""
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


def trip_picture(lang, W=1200, H=630):
    t = TRIP[lang]
    road_y = H - 62
    horizon = road_y - 150
    s = landscape(W, horizon=horizon, road_y=road_y, sun=(W * 0.915, horizon - 50, 48), vs=0.95)
    ground = road_y - 20
    s += map_pin(W * 0.1, ground, h=84, label=t["route"][0], label_size=27)
    s += map_pin(W * 0.9, ground, h=84, label=t["route"][1], label_size=27)
    car_w = 330
    cx = W * 0.5 - car_w / 2 + 24
    car, k, top = beetle_on_road(cx, road_y + 8, car_w, kind="driver", moving=True)
    s += car + seat_tag(cx, top, k, t["seats"])
    frm, to = t["route"]
    text = (f'<div style="position:absolute;left:0;right:0;top:34px;display:flex;flex-direction:column;align-items:center;text-align:center">'
            f'{lockup(46)}'
            f'<h1 style="margin-top:26px;font-size:76px;line-height:1;display:flex;align-items:center;gap:26px">{frm}{ico("arrow", 62, PRIMARY, sw=3)}{to}</h1>'
            f'<p style="margin-top:16px;font:700 34px/1.1 Nunito;color:{TEXT}">{t["when"]}</p>'
            f'<p style="margin-top:12px;font:600 26px/1.1 Nunito;color:{MUTED}">{t["stops_label"]}: {", ".join(t["stops"])}</p>'
            f'</div>')
    return page(svg(s, W, H) + text, W, H, lang)


def feed_card(img, title, desc, post_text, label, sub):
    """A generic social feed post with a link card (layout like Facebook's on a phone, no logos)."""
    return f'''
<div class="col"><div class="lab">{label}</div><div class="labsub">{sub}</div>
<div class="post">
  <div class="head"><div class="av"></div><div><div class="nm">Anna</div><div class="tm">Rétt í þessu</div></div></div>
  <p class="txt">{post_text}</p>
  <div class="link"><img src="{img}"><div class="meta"><div class="dom">PUFFINRIDE.IS</div><div class="ttl">{title}</div><div class="dsc">{desc}</div></div></div>
  <div class="acts"><span>Líkar við</span><span>Skrifa ummæli</span><span>Deila</span></div>
</div></div>'''


BOARD_CSS = '''
#board{display:flex;gap:44px;padding:44px 44px 40px;background:#E4E9EB;align-items:flex-start}
.col{width:520px}
.lab{font:600 30px/1.1 Fredoka;color:#1F2A30}
.labsub{font:600 17px/1.35 Nunito;color:#56636B;margin:6px 0 16px;min-height:46px}
.post{background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.12);overflow:hidden;font-family:Nunito}
.head{display:flex;gap:10px;align-items:center;padding:14px 16px 6px}
.av{width:40px;height:40px;border-radius:50%;background:#C9D3D7}
.nm{font:700 16px/1.2 Nunito;color:#1F2A30}.tm{font:600 13px/1.3 Nunito;color:#7F8C93}
.txt{font:600 16px/1.4 Nunito;color:#1F2A30;padding:4px 16px 12px}
.link img{display:block;width:100%;aspect-ratio:1200/630;border-top:1px solid #E2E6E8;border-bottom:1px solid #E2E6E8}
.meta{background:#F0F2F5;padding:10px 16px 12px}
.dom{font:600 12.5px/1.2 Nunito;letter-spacing:.03em;color:#65676B}
.ttl{font:700 17px/1.3 Nunito;color:#1F2A30;margin-top:3px}
.dsc{font:600 14.5px/1.3 Nunito;color:#65676B;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.acts{display:flex;justify-content:space-around;padding:10px 0 12px;font:700 14px/1 Nunito;color:#65676B;border-top:1px solid #E2E6E8}
'''


def board(build):
    post = "Er að keyra norður á föstudaginn, laus sæti ef einhvern vantar far."
    a = feed_card("../share-today.png", "PuffinRide · Samferða um Ísland: far og samakstur",
                  "Verum samferða milli bæja á Íslandi: finndu far eða bjóddu laus sæti í bílnum þínum.",
                  post, "Í dag", "Sama mynd og texti fyrir alla tengla. Ekkert segir hvaða ferð þetta er.")
    b = feed_card("../out/puffinride-trip-preview-is.png", "Reykjavík → Akureyri · fös. 28. nóv. kl. 09:00",
                  "Far á PuffinRide. Sjáðu ferðina og bókaðu sæti.",
                  post, "Tillaga", "Leiðin, dagurinn og mótsstaðirnir á myndinni og í titlinum. Ekkert nafn, engin mynd af fólki, ekkert verð.")
    c = feed_card("../out/puffinride-trip-preview-en.png", "Reykjavík → Akureyri · Fri 28 Nov at 09:00",
                  "A shared ride on PuffinRide. See the trip and book a seat.",
                  "Driving north on Friday, free seats if anyone needs a ride.", "Proposed, in English",
                  "Facebook asks for the reader's language, so an English reader sees this one.")
    W, H = 3 * 520 + 2 * 44 + 88, 780
    return page(a + b + c, W, H, "is", extra_css=BOARD_CSS).replace('style="width', 'style="height:auto;width', 1), W, H


if __name__ == "__main__":
    build = sys.argv[1]
    jobs = [(f"puffinride-trip-preview-{l}", trip_picture(l), 1200, 630) for l in ("is", "en")]
    write_jobs(build, jobs, "manifest-preview.json")
    html, W, H = board(build)
    os.makedirs(os.path.join(build, "pages"), exist_ok=True)
    open(os.path.join(build, "pages", "board-link-preview.html"), "w").write(html)
    import json
    json.dump([dict(html=os.path.join(build, "pages", "board-link-preview.html"), png="link-preview-today-and-proposed.png", w=W, h=H)],
              open(os.path.join(build, "manifest-board.json"), "w"))
    print("ok")
