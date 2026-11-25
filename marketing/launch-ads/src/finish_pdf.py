# python finish_pdf.py <chromium.pdf> <out.pdf> [--cmyk] [--trim WxH_mm --bleed mm]
# Crops each page from its top-left corner to the exact size, converts to CMYK with Ghostscript if asked,
# and sets BleedBox/TrimBox so the printer knows where to cut.
import argparse, subprocess, tempfile, os
import pikepdf
MM = 72 / 25.4
ap = argparse.ArgumentParser()
ap.add_argument("inp"); ap.add_argument("out")
ap.add_argument("--cmyk", action="store_true")
ap.add_argument("--size", default="154x216", help="final page size in mm, bleed included")
ap.add_argument("--bleed", type=float, default=3.0)
a = ap.parse_args()
w, h = (float(x) * MM for x in a.size.split("x"))
b = a.bleed * MM
src = a.inp
if a.cmyk:
    tmp = tempfile.mktemp(suffix=".pdf")
    subprocess.run(["gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6",
                    "-dPDFSETTINGS=/prepress", "-sColorConversionStrategy=CMYK", "-sProcessColorModel=DeviceCMYK",
                    "-dEmbedAllFonts=true", "-dSubsetFonts=true", "-dAutoRotatePages=/None",
                    "-sOutputFile=" + tmp, src], check=True)
    src = tmp
pdf = pikepdf.open(src)
for page in pdf.pages:
    mb = [float(v) for v in page.mediabox]
    top = mb[3]
    box = pikepdf.Array([mb[0], top - h, mb[0] + w, top])
    page.mediabox = box
    page.obj["/CropBox"] = box
    page.obj["/BleedBox"] = box
    if b > 0:
        page.obj["/TrimBox"] = pikepdf.Array([mb[0] + b, top - h + b, mb[0] + w - b, top - b])
    else:
        page.obj["/TrimBox"] = box
pdf.docinfo["/Title"] = "PuffinRide flyer"
pdf.docinfo["/Author"] = "PuffinRide"
pdf.save(a.out)
