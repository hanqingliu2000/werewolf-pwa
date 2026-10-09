import { expect, test } from "@playwright/test";

test("twelve compact seats and current progress fit on phone screens with full names available", async ({ page }, info) => {
  for (const scene of ["S03", "S06", "S11"]) {
    await page.request.post("/__review/reset", { data: { scene } });
    await page.goto(`/r/FA${scene.slice(1).padStart(6, "0")}?reviewScene=${scene}`);
    if (scene === "S06") {
      const panel = page.getByRole("dialog", { name: "本人私密视角" });
      await expect(panel).toBeVisible();
      await expect(panel.locator(".action-targets .seat")).toHaveCount(12);
      expect(await panel.locator(".action-targets .seat").evaluateAll(elements => elements.every(e => e.getBoundingClientRect().height <= 64))).toBe(true);
      await page.keyboard.press("Escape");
    }
    await expect(page.locator(".room-main>.seat-grid .seat")).toHaveCount(12);
    await expect(page.locator("style[data-ui-review-devtools]")).toHaveCount(1);
    await expect(page.locator("nextjs-portal").first()).toBeHidden();
    for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 900 }]) {
      await page.setViewportSize(viewport); await page.evaluate(() => scrollTo(0, 0));
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => {
        const limit = document.querySelector(".lobby-actions")?.getBoundingClientRect().top ?? innerHeight;
        const seats = [...document.querySelectorAll(".room-main>.seat-grid .seat")].map(e => e.getBoundingClientRect());
        return { fit: seats.every(r => r.top >= 0 && r.bottom <= limit && r.width >= 44 && r.height >= 44 && r.height <= 64),
          progress: document.querySelector(".room-top")!.getBoundingClientRect().bottom <= innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(layout, `${scene}/${viewport.width}x${viewport.height}`).toEqual({ fit: true, progress: true, overflow: false });
      if (viewport.width === 390) await page.screenshot({ path: info.outputPath(`${scene}-compact.png`) });
    }
    await page.getByRole("button", { name: "完整名单", exact: true }).click();
    const roster = page.getByRole("dialog", { name: "完整名单" });
    await expect(roster.locator("li")).toHaveCount(scene === "S03" ? 6 : 12);
    if (scene !== "S03") await expect(roster.locator("li").last()).toContainText("今晚名字稍微长一点的玩家");
    await page.keyboard.press("Escape"); await expect(roster).not.toBeVisible();
  }
});

const cases = [
  { scene: "S05", choice: "本夜不守", expected: "本夜不守" },
  { scene: "S05", target: 2, expected: "守护：2 号 · 阿青" },
  { scene: "S07", choice: "使用解药", expected: "使用解药：8 号 · 安安", effect: "解药已消耗" },
  { scene: "S07", choice: "使用毒药", target: 11, expected: "使用毒药：11 号 · 小叶", effect: "毒药已消耗" },
  { scene: "S07", choice: "不用药", expected: "本夜不用药" },
  { scene: "S08", target: 3, expected: "查验：3 号 · 小周", effect: "查验结果：狼人阵营" },
  { scene: "S08", target: 6, expected: "查验：6 号 · 木木", effect: "查验结果：好人阵营" },
  { scene: "S08", choice: "本夜不查验", expected: "本夜不查验" },
  { scene: "S09", target: 2, expected: "开枪目标：2 号 · 阿青" },
  { scene: "S09", choice: "放弃开枪", expected: "已放弃开枪" },
];
test("each accepted action shows its own target and permitted effect immediately and after refresh", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const example of cases) {
    await page.request.post("/__review/reset", { data: { scene: example.scene } });
    await page.goto(`/r/FA${example.scene.slice(1).padStart(6, "0")}?reviewScene=${example.scene}`);
    const panel = page.getByRole("dialog", { name: "本人私密视角" }); await expect(panel).toBeVisible();
    if (example.choice) await panel.getByRole("button", { name: example.choice, exact: true }).click();
    if (example.target) await panel.getByRole("button", { name: new RegExp(`^${example.target}号 `) }).click();
    await panel.getByRole("button", { name: "确认行动", exact: true }).click();
    const receipt = panel.locator(".waiting-note");
    await expect(receipt).toContainText(example.expected);
    if (example.effect) await expect(receipt).toContainText(example.effect);
    else if (example.scene === "S08") await expect(receipt).not.toContainText("阵营");
    if (example.effect) await page.screenshot({ path: info.outputPath(`${example.scene}-${example.target ?? "save"}-receipt.png`) });
    await page.reload(); await expect(receipt).toContainText(example.expected);
    if (example.effect) await expect(receipt).toContainText(example.effect);
    await panel.getByRole("button", { name: "收起私密信息", exact: true }).click();
    await expect(page.locator(".waiting-note")).toHaveCount(0);
    await expect(page.locator(".room-main")).not.toContainText(example.expected);
  }
});

test("locked wolf targets and empty kills use the same private completed-result position", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const targetId of ["p8", null]) {
    await page.route("**/api/v2/rooms/FA000006/private", async route => {
      const response = await route.fetch(); const personal = await response.json();
      await route.fulfill({ json: { ...personal, action: null, wolves: { ...personal.wolves, locked: true },
        actionResult: { kind: "kill", targetId, nightNo: 2 } } });
    });
    await page.goto("/r/FA000006?reviewScene=S06");
    const panel = page.getByRole("dialog", { name: "本人私密视角" });
    await expect(panel.locator(".waiting-note")).toContainText(targetId ? "狼队共同目标：8 号 · 安安" : "狼队已决定空刀");
    await expect(panel.locator(".waiting-note")).toContainText("共同决策已锁定");
    await expect(panel.locator(".single-screen")).toHaveCount(0);
    await page.unroute("**/api/v2/rooms/FA000006/private");
  }
});
