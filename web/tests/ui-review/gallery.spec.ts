import { expect, test } from "@playwright/test";

const examples = ["创建房间", "加入房间", "大厅", "身份牌", "守卫", "狼人", "女巫", "预言家", "猎人", "主持", "白天", "暂停", "结束", "复盘"];
test("each live UI example loads and previous/next navigation preserves stable scene URLs", async ({ page }, info) => {
  await page.goto("/?scene=S01&mode=phone");
  const iframe = page.frameLocator("#preview");
  for (let i = 0; i < examples.length; i++) {
    const id = `S${String(i + 1).padStart(2, "0")}`;
    await expect(page).toHaveURL(new RegExp(`scene=${id}&mode=phone`));
    await expect(page.locator("#scene-name")).toContainText(examples[i]!);
    await expect(page.locator(".frame")).not.toHaveClass(/loading/);
    await expect(iframe.locator("main")).toBeVisible();
    if (i >= 2 && i !== 13) await expect(iframe.locator(".room-code strong")).toHaveText(`FA${String(i + 1).padStart(6, "0")}`);
    if ([3, 4, 5, 6, 7, 8].includes(i)) await expect(iframe.getByRole("dialog", { name: "本人私密视角" })).toBeVisible();
    if (i === 3) await expect(iframe.locator(".identity-card h3")).toHaveText("女巫");
    if (i >= 4 && i <= 8) await expect(iframe.locator(".single-screen")).toHaveAttribute("data-task", ["guard", "werewolf", "witch", "seer", "hunter"][i - 4]!);
    if ([9, 11].includes(i)) await expect(iframe.getByRole("dialog", { name: "主持控制" })).toBeVisible();
    if (i === 1) await expect(iframe.getByRole("button", { name: "加入房间", exact: true }).last()).toBeEnabled();
    if (i === 13) await expect(iframe.locator(".role-gallery article")).toHaveCount(12);
    if ([3, 6, 9, 13].includes(i)) await page.screenshot({ path: info.outputPath(`${id}-phone.png`) });
    await page.getByRole("button", { name: "下一页", exact: true }).click();
  }
  await expect(page).toHaveURL(/scene=S01/); await page.getByRole("button", { name: "上一页", exact: true }).click(); await expect(page).toHaveURL(/scene=S14/);
});
test("resizing, reset and read-only simulation retain real interactive components", async ({ page }, info) => {
  await page.goto("/?scene=S07&mode=phone"); const iframe = page.frameLocator("#preview");
  await expect(page.locator(".frame")).not.toHaveClass(/loading/);
  const panel = iframe.getByRole("dialog", { name: "本人私密视角" }); await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "使用毒药", exact: true }).click();
  await panel.getByRole("button", { name: /^3号 / }).click();
  await expect(panel.locator(".selection-summary")).toContainText("3 号");
  await page.getByRole("button", { name: "重置当前示例", exact: true }).click();
  await expect(page.locator(".frame")).not.toHaveClass(/loading/);
  await expect(panel).toBeVisible(); await expect(panel.locator(".selection-summary")).toContainText("尚未选择");
  await page.getByRole("button", { name: "桌面视图", exact: true }).click(); await expect(page).toHaveURL(/mode=desktop/);
  await page.screenshot({ path: info.outputPath("desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of ["上一页", "下一页", "手机视图", "桌面视图", "重置当前示例"]) {
    const box = await page.getByRole("button", { name: control, exact: true }).boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "手机视图", exact: true }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).focus(); await page.keyboard.press("ArrowRight"); await expect(page).toHaveURL(/scene=S08/);
  await page.evaluate(() => { for (let i = 0; i < 3; i++) document.getElementById("next")!.click(); });
  await expect(page).toHaveURL(/scene=S11/); await expect(iframe.locator(".room-code strong")).toHaveText("FA000011");
});
