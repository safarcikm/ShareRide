const { chromium } = require("playwright");
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch();
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 3,
      colorScheme: scheme,
    });
    await page.goto("http://localhost:8082/", { waitUntil: "networkidle" });
    await page.getByTestId("ticket-notch").first().waitFor({ state: "attached", timeout: 20000 });
    const ticket = page
      .locator('[data-testid="card"]')
      .filter({ has: page.getByTestId("ticket-tear") })
      .first();
    await ticket.scrollIntoViewIfNeeded();
    await ticket.hover();
    await page.waitForTimeout(400);
    const notches = page.getByTestId("ticket-notch");
    const n = await notches.count();
    for (let i = 0; i < Math.min(n, 4); i++) {
      const box = await notches.nth(i).boundingBox();
      if (!box) continue;
      await page.screenshot({
        path: `${out}/${scheme}-${i}.png`,
        clip: { x: box.x - 14, y: box.y - 14, width: box.width + 28, height: box.height + 28 },
      });
    }
    await page.screenshot({ path: `${out}/${scheme}-whole.png` });
    await page.close();
  }
  await browser.close();
})();
