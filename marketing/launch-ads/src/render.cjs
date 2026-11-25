// node render.cjs <manifest.json> <out dir> [scale]
// Renders each job's #board to a PNG of exactly w x h (times scale).
const { chromium } = require("playwright");
const fs = require("fs"),
  path = require("path");
(async () => {
  const [, , manifest, outDir, scale] = process.argv;
  const jobs = JSON.parse(fs.readFileSync(manifest, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const j of jobs) {
    const page = await browser.newPage({
      viewport: { width: j.w, height: j.h },
      deviceScaleFactor: Number(scale || 1),
    });
    await page.goto("file://" + path.resolve(j.html));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    await page.locator("#board").screenshot({ path: path.join(outDir, j.png) });
    await page.close();
  }
  await browser.close();
  console.log("rendered", jobs.length);
})();
