// Takes spec 36's pictures from its moving preview: node build.cjs [out folder]
// Needs Playwright's Chromium. Each picture shows the banners as they stand
// once their moment is over (the look Reduce motion shows), at twice size,
// saved as WebP. Drawings only: nothing here ships in the app.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const out = path.resolve(process.argv[2] ?? path.join(__dirname, ".."));
fs.mkdirSync(out, { recursive: true });
const preview = fs.readFileSync(path.join(__dirname, "..", "preview.html"), "utf8");
const page = (body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${body}</body></html>`;

/** A PNG as WebP, through the browser's own encoder. */
async function webp(tab, png, file) {
  const data = await tab.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/webp", 0.9).split(",")[1];
  }, png.toString("base64"));
  fs.writeFileSync(path.join(out, file), Buffer.from(data, "base64"));
  console.log(file);
}

(async () => {
  const browser = await chromium.launch();
  const html = path.join(out, ".preview.html");
  fs.writeFileSync(html, page(preview));
  for (const scheme of ["light", "dark"]) {
    const tab = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      colorScheme: scheme,
      deviceScaleFactor: 2,
    });
    // Nothing plays: every banner stands as it does when its moment is over.
    await tab.addInitScript(() => {
      delete window.IntersectionObserver;
    });
    await tab.goto(`file://${html}`);
    await tab.evaluate(() =>
      document.querySelectorAll(".play").forEach((el) => el.classList.remove("play")),
    );
    await tab.evaluate(() => document.fonts.ready);

    // Every season and day, in a grid, with its name: each banner's own
    // picture, laid out on a canvas.
    const cards = [];
    for (const item of await tab.$$("#seasons .item, #big .item, #smaller .item")) {
      const name = await item.$eval("h3", (el) => el.textContent);
      const local = await item.$eval(".is-name", (el) => el.textContent);
      const png = await (await item.$(".scene")).screenshot();
      cards.push({ name, local, b64: png.toString("base64") });
    }
    const sheet = await tab.evaluate(async (list) => {
      const scale = 2,
        cols = 4,
        gap = 16 * scale,
        pad = 20 * scale,
        label = 28 * scale;
      const images = await Promise.all(
        list.map(async (card) => {
          const img = new Image();
          img.src = `data:image/png;base64,${card.b64}`;
          await img.decode();
          return img;
        }),
      );
      const w = images[0].width,
        h = Math.max(...images.map((img) => img.height));
      const rows = Math.ceil(images.length / cols);
      const canvas = document.createElement("canvas");
      canvas.width = pad * 2 + cols * w + (cols - 1) * gap;
      canvas.height = pad * 2 + rows * (label + h) + (rows - 1) * gap;
      const g = canvas.getContext("2d");
      const css = getComputedStyle(document.documentElement);
      g.fillStyle = css.getPropertyValue("--bg").trim();
      g.fillRect(0, 0, canvas.width, canvas.height);
      images.forEach((img, i) => {
        const x = pad + (i % cols) * (w + gap),
          y = pad + Math.floor(i / cols) * (label + h + gap);
        g.fillStyle = css.getPropertyValue("--text").trim();
        g.font = `600 ${17 * scale}px Fredoka, sans-serif`;
        const name = list[i].name.replace("Bóndadagur and Konudagur", "Bóndadagur, Konudagur");
        g.fillText(name, x, y + 18 * scale);
        const nameWidth = g.measureText(name).width;
        g.fillStyle = css.getPropertyValue("--muted").trim();
        g.font = `600 ${13 * scale}px Nunito, sans-serif`;
        if (nameWidth + g.measureText(list[i].local).width < w - 8 * scale)
          g.fillText(list[i].local, x + nameWidth + 8 * scale, y + 18 * scale);
        g.save();
        g.beginPath();
        g.roundRect(x, y + label, w, img.height, 16 * scale);
        g.clip();
        g.drawImage(img, x, y + label);
        g.restore();
      });
      return canvas.toDataURL("image/png").split(",")[1];
    }, cards);
    await webp(tab, Buffer.from(sheet, "base64"), `2-seasons-and-days-${scheme}.webp`);

    if (scheme === "light") {
      await webp(tab, await (await tab.$("#palettes")).screenshot(), "1-colours.webp");
    }
    for (const day of scheme === "light" ? ["christmas", "june17"] : ["newyear"]) {
      await tab.selectOption("#laptop-theme", day);
      await tab.evaluate(() =>
        document.querySelectorAll(".play").forEach((el) => el.classList.remove("play")),
      );
      await webp(
        tab,
        await (await tab.$("#laptop-wrap")).screenshot(),
        `3-laptop-${day}-${scheme}.webp`,
      );
    }
    await tab.close();
  }
  fs.rmSync(html);
  await browser.close();
})();
