import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, TestInfo } from "@playwright/test";

/** Where the pictures go: WALK_OUT, or a folder beside the app. */
export const out = process.env.WALK_OUT ?? "walk-pictures";

const counters = new Map<string, number>();

/** A picture of the screen as it stands; `whole` grows the window to the whole screen first. */
export async function shot(page: Page, info: TestInfo, set: string, name: string, whole = false) {
  const folder = join(out, set, info.project.name);
  mkdirSync(folder, { recursive: true });
  const key = `${set}/${info.project.name}`;
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  await page.waitForTimeout(600);
  const size = page.viewportSize() ?? { width: 390, height: 844 };
  if (whole) {
    const scroll = page.getByTestId("screen-scroll").filter({ visible: true }).last();
    const height = await scroll
      .evaluate((element) => element.getBoundingClientRect().top + element.scrollHeight)
      .catch(() => size.height);
    // room for a tab bar or a bottom bar under the scroll
    const extra = await page.evaluate(() => {
      const scrolls = [...document.querySelectorAll('[data-testid="screen-scroll"]')].filter(
        (e) => (e as HTMLElement).offsetParent !== null,
      );
      const last = scrolls[scrolls.length - 1];
      if (!last) return 0;
      return Math.max(0, window.innerHeight - last.getBoundingClientRect().bottom);
    });
    await page.setViewportSize({
      width: size.width,
      height: Math.min(Math.max(Math.ceil(height + extra), size.height), 6000),
    });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: join(folder, `${String(n).padStart(2, "0")}-${name}.png`) });
  if (whole) await page.setViewportSize(size);
}
