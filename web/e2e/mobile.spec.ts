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

test('mobile create and join flow stores player session', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('你的昵称').fill('E2E Host');
  await page.getByRole('button', { name: '创建房间' }).click();

  await expect(page.getByRole('heading', { name: '创建房间' })).toBeVisible();
  await expect(page.getByPlaceholder('例如：主持人A')).toHaveValue('E2E Host');
  await page.getByPlaceholder('今晚面杀局').fill('E2E Mobile Room');
  await page.getByRole('button', { name: '完成创建' }).click();

  await expect(page.getByText(/创建失败|请先填写你的昵称|角色总数不能超过目标人数/)).toHaveCount(0);
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}\/lobby\?playerId=/);
  await expect(page.getByRole('heading', { name: '房间等待区' })).toBeVisible();
  await expect(page.getByText('E2E Host（房主）')).toBeVisible();

  const roomId = page.url().match(/\/room\/([A-Z0-9]{6})\/lobby/)?.[1];
  expect(roomId).toBeTruthy();
  const hostSession = await page.evaluate((id) => ({
    player: localStorage.getItem(`ww:player:${id}`),
    token: localStorage.getItem(`ww:token:${id}`),
  }), roomId);
  expect(hostSession.player).toBeTruthy();
  expect(hostSession.token).toBeTruthy();

  await page.goto(`/join?roomId=${roomId}&name=E2E%20Guest`);
  await expect(page.getByRole('heading', { name: '加入房间' })).toBeVisible();
  await page.getByRole('button', { name: '加入房间' }).click();

  await expect(page).toHaveURL(new RegExp(`/room/${roomId}/lobby\\?playerId=`));
  await expect(page.getByText('E2E Guest')).toBeVisible();
  await expect(page.getByText('E2E Host（房主）')).toBeVisible();

  const guestSession = await page.evaluate((id) => ({
    player: localStorage.getItem(`ww:player:${id}`),
    token: localStorage.getItem(`ww:token:${id}`),
  }), roomId);
  expect(guestSession.player).toBeTruthy();
  expect(guestSession.token).toBeTruthy();
  expect(guestSession.player).not.toBe(hostSession.player);
  expect(guestSession.token).not.toBe(hostSession.token);
});
