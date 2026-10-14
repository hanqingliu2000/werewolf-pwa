import { expect, test } from "@playwright/test";

test("manual readiness is prominent in the first viewport and persists without prompts", async ({ page }, info) => {
  await page.request.post("/__review/reset", { data: { scene: "S03" } });
  await page.goto("/r/FA000003?reviewScene=S03");
  const ready = page.getByRole("button", { name: "准备好了", exact: true });
  await expect(ready).toBeVisible();
  await expect(page.locator(".ready-status")).toHaveText("1 号 · 未准备");
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport); await page.evaluate(() => { scrollTo(0, 0); return document.fonts.ready; });
    const rect = await ready.boundingBox();
    expect(rect!.y).toBeGreaterThanOrEqual(0);
    expect(rect!.y + rect!.height).toBeLessThan(viewport.height);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(await ready.evaluate(e => e.getBoundingClientRect().bottom < document.querySelector(".seat-grid")!.getBoundingClientRect().top)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`ready-${viewport.width}.png`) });
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await ready.click();
  const cancel = page.getByRole("button", { name: "取消准备", exact: true });
  await expect(cancel).toBeVisible();
  await expect(page.locator(".ready-status")).toHaveText("1 号 · 已准备");
  await page.reload(); await expect(cancel).toBeVisible();
  await cancel.click(); await expect(ready).toBeVisible();
  await page.reload(); await expect(ready).toBeVisible();
});
