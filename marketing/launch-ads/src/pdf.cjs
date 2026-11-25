// node pdf.cjs <in.html> <out.pdf>  : prints an HTML page to PDF at its CSS @page size (vector, fonts embedded)
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const [, , inp, out] = process.argv;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.resolve(inp));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  await browser.close();
})();
