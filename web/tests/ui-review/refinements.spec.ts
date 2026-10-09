import { expect, test } from "@playwright/test";

const viewports = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 },
  { width: 768, height: 900 }, { width: 1440, height: 900 }, { width: 740, height: 360 }];

test("create and join start with blank nicknames and no removed decorative copy", async ({ page }, info) => {
  for (const { scene, path, label } of [{ scene: "S01", path: "/__app", label: "创建房间" },
    { scene: "S02", path: "/join?room=FA000002", label: "加入房间" }]) {
    await page.goto(`${path}${path.includes("?") ? "&" : "?"}reviewScene=${scene}`);
    const form = page.getByRole("form", { name: label });
    await expect(form.getByRole("button", { name: label, exact: true })).toBeEnabled();
    const nickname = form.getByLabel("你的昵称", { exact: true });
    await expect(nickname).toHaveValue("");
    expect(await nickname.getAttribute("placeholder")).toBeNull();
    await expect(nickname).toHaveAttribute("required", "");
    await expect(page.locator(".entry-form .section-heading,.wordmark,.edition,.entry-page .site-footer")).toHaveCount(0);
    for (const removed of ["WEREWOLF", "夜幕 · 同席", "01 / ASSEMBLE", "02 / ENTER", "今晚，开一局", "回到这一桌", "8 至 12 人"]) {
      await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
    }
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(nickname).toHaveValue("");
      if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: info.outputPath(`${scene}-${viewport.width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "查看游戏规则", exact: true }).focus();
    await page.keyboard.press("Enter");
    const rules = page.getByRole("dialog", { name: "公开规则" });
    await expect(rules.getByRole("heading", { name: "公开规则", exact: true })).toBeVisible();
    await page.keyboard.press("Escape"); await expect(rules).not.toBeVisible();
    await expect(page.getByRole("button", { name: "查看游戏规则", exact: true })).toBeFocused();
  }
});

test("seat footer stays and private panels omit redundant visible labels without losing their accessible name", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.request.post("/__review/reset", { data: { scene: "S03" } });
  await page.goto("/r/FA000003?reviewScene=S03");
  await expect(page.locator(".site-footer span").last()).toHaveText("1 号 · 小林");
  await page.goto("/r/FA000004?reviewScene=S04");
  const panel = page.getByRole("dialog", { name: "本人私密视角" });
  await expect(panel).toBeVisible();
  await expect(panel.locator(".modal-header h2")).toBeHidden();
  await expect(panel.locator(".private-label")).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "女巫", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "关闭面板", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "收起私密信息", exact: true })).toBeVisible();
  await panel.locator(".identity-card img").evaluate((element) => (element as HTMLImageElement).decode());
  await page.screenshot({ path: info.outputPath("S04-simplified.png") });
  await panel.getByRole("button", { name: "收起私密信息", exact: true }).focus();
  await page.keyboard.press("Enter"); await expect(panel).not.toBeVisible();
  await expect(page.locator(".identity-card")).toHaveCount(0);
  await page.goto("/r/FA000008?reviewScene=S08");
  await expect(panel.locator(".single-screen")).toHaveAttribute("data-task", "seer");
  await expect(panel.getByText("本夜一次", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("timer")).toBeVisible();
  await expect(panel.locator(".action-targets .seat")).toHaveCount(12);
  await panel.getByRole("button", { name: "本人查验记录", exact: true }).click();
  await expect(panel.locator(".private-detail:popover-open .private-records")).toContainText("狼人阵营");
  await panel.getByRole("button", { name: "关闭详情", exact: true }).click();
  await panel.getByRole("button", { name: /^3号 / }).click();
  await expect(panel.getByRole("button", { name: "确认行动", exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("S08-simplified.png") });
});

test("public cardback is larger, uncropped and leaves the task entry usable at all viewport sizes", async ({ page }, info) => {
  await page.goto("/r/FA000011?reviewScene=S11");
  const art = page.locator(".neutral-identity .back-art");
  const button = page.getByRole("button", { name: "查看当前任务", exact: true });
  await expect(art).toBeVisible();
  const resource = await page.request.get("/art/cardback.webp");
  expect(resource.ok()).toBe(true); expect((await resource.body()).byteLength).toBeGreaterThan(10_000);
  await page.evaluate(async () => { const image = new Image(); image.src = "/art/cardback.webp"; await image.decode(); await document.fonts.ready; });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport); await page.evaluate(() => scrollTo(0, 0));
    const layout = await art.evaluate((element) => {
      const r = element.getBoundingClientRect(); const control = element.parentElement!.querySelector("button")!.getBoundingClientRect();
      return { width: r.width, ratio: r.width / r.height, background: getComputedStyle(element).backgroundImage,
        fit: getComputedStyle(element).backgroundSize, gap: control.top - r.bottom, controlBottom: control.bottom,
        horizontalScroll: document.documentElement.scrollWidth > innerWidth };
    });
    if (viewport.width <= 768 && viewport.height <= 700) expect(layout.width).toBe(64);
    else { expect(layout.width).toBeGreaterThanOrEqual(220); expect(layout.width).toBeLessThanOrEqual(240); }
    expect(layout.ratio).toBeCloseTo(0.75, 2); expect(layout.background).toContain("/art/cardback.webp");
    expect(layout.fit).toBe("contain"); if (viewport.height > 700) expect(layout.gap).toBeGreaterThanOrEqual(8); expect(layout.horizontalScroll).toBe(false);
    if (viewport.height >= 800) expect(layout.controlBottom).toBeLessThanOrEqual(viewport.height);
    if ([390, 1440].includes(viewport.width)) await page.screenshot({ path: info.outputPath(`S11-${viewport.width}.png`) });
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  }
  await button.click();
  await expect(page.getByRole("dialog", { name: "本人私密视角" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".identity-card")).toHaveCount(0);
});
