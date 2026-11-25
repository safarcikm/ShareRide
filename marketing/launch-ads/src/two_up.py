# python two_up.py <a5 print.pdf with TrimBox> <out.pdf>
# Home printing: each A5 page twice on A4 landscape, cropped to the trim, at 94% so home printers' margins don't cut it,
# with a dashed line down the middle to cut along.
import sys
import pikepdf
from pikepdf import Rectangle
MM = 72 / 25.4
src = pikepdf.open(sys.argv[1])
out = pikepdf.new()
W, H = 297 * MM, 210 * MM
k = 0.94
w, h = 148 * MM * k, 210 * MM * k
for sp in src.pages:
    out.add_blank_page(page_size=(W, H))
    page = out.pages[-1]
    form = out.copy_foreign(pikepdf.Page(sp).as_form_xobject())
    for x0 in (0, W / 2):
        x = x0 + (W / 2 - w) / 2
        y = (H - h) / 2
        page.add_overlay(form, Rectangle(x, y, x + w, y + h))
    line = f"q 0.604 0.659 0.682 RG 0.7 w [3 3] 0 d {W/2:.2f} 0 m {W/2:.2f} {H:.2f} l S Q".encode()
    page.contents_add(out.make_stream(line))
out.docinfo["/Title"] = "PuffinRide flyer, two per A4 page"
out.save(sys.argv[2])
