import { expect, test } from '@playwright/test';

test('mobile home renders without horizontal overflow', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '狼人杀玩家入口' })).toBeVisible();
  await expect(page.getByPlaceholder('你的昵称')).toBeVisible();
  await expect(page.getByRole('button', { name: '创建房间' })).toBeVisible();
  await expect(page.getByRole('button', { name: '加入房间' })).toBeVisible();
  await expect(page.locator('.connection-status')).toBeVisible();

  const layout = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyText: document.body.innerText,
  }));

  expect(layout.width).toBeLessThanOrEqual(420);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.bodyText).toContain('WEREWOLF PWA');
});

test('manifest exposes png install icons', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const data = await manifest.json();

  expect(data.display).toBe('standalone');
  expect(data.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }),
      expect.objectContaining({ src: '/icon-512.png', purpose: 'maskable' }),
    ]),
  );

  const icon192 = await request.get('/icon-192.png');
  const icon512 = await request.get('/icon-512.png');
  expect(icon192.ok()).toBe(true);
  expect(icon512.ok()).toBe(true);
  expect(icon192.headers()['content-type']).toContain('image/png');
  expect(icon512.headers()['content-type']).toContain('image/png');
});
