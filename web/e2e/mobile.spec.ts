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

  await page.goto(`/room/${roomId}/lobby`);
  await expect(page.getByRole('heading', { name: '房间等待区' })).toBeVisible();
  await expect(page.getByText('E2E Guest')).toBeVisible();
  await expect(page.getByText('E2E Host（房主）')).toBeVisible();
  await expect(page.getByRole('button', { name: '开始游戏' })).toHaveCount(0);
});

test('mobile host can start a ready room and recover on play page', async ({ page, request }) => {
  const created = await request.post('/api/rooms', {
    data: {
      hostName: 'E2E API Host',
      roomName: 'E2E Ready Room',
      targetPlayers: 4,
      rolePlan: { werewolf: 1, seer: 1, villager: 2 },
    },
  });
  expect(created.status()).toBe(201);
  const { room, hostPlayer } = await created.json();

  for (const name of ['E2E One', 'E2E Two', 'E2E Three']) {
    const joined = await request.post(`/api/rooms/${room.id}/join`, { data: { name } });
    expect(joined.status()).toBe(201);
  }

  await page.goto('/');
  await page.evaluate(({ roomId, playerId, token }) => {
    localStorage.setItem(`ww:player:${roomId}`, playerId);
    localStorage.setItem(`ww:token:${roomId}`, token);
  }, {
    roomId: room.id,
    playerId: hostPlayer.id,
    token: hostPlayer.sessionToken,
  });

  await page.goto(`/room/${room.id}/lobby`);
  await expect(page.getByRole('heading', { name: '房间等待区' })).toBeVisible();
  await expect(page.getByText('E2E API Host（房主）')).toBeVisible();
  await expect(page.getByText('E2E Three')).toBeVisible();
  await expect(page.getByText('人数状态：已满足开局条件')).toBeVisible();
  await page.getByRole('button', { name: '开始游戏' }).click();

  await expect(page.getByText(/游戏已开始：NIGHT_/)).toBeVisible();
  await page.getByRole('button', { name: '进入对局页' }).click();
  await expect(page.getByText('你是 E2E API Host')).toBeVisible();
  await expect(page.getByText('未找到你的玩家身份')).toHaveCount(0);

  await page.goto(`/room/${room.id}/play`);
  await expect(page.getByText('你是 E2E API Host')).toBeVisible();
  await expect(page.getByText('未找到你的玩家身份')).toHaveCount(0);
});

test('mobile first night guard wolf and seer actions advance the live game phase', async ({ page, request }) => {
  const created = await request.post('/api/rooms', {
    data: {
      hostName: 'E2E Guard Host',
      roomName: 'E2E Action Room',
      targetPlayers: 4,
      rolePlan: { guard: 1, werewolf: 1, seer: 1, villager: 1 },
    },
  });
  expect(created.status()).toBe(201);
  const { room, hostPlayer } = await created.json();

  const joinedPlayers = [];
  for (const name of ['E2E Wolf', 'E2E Seer', 'E2E Villager']) {
    const joined = await request.post(`/api/rooms/${room.id}/join`, { data: { name } });
    expect(joined.status()).toBe(201);
    joinedPlayers.push((await joined.json()).player);
  }
  const wolfPlayer = joinedPlayers[0];
  const seerPlayer = joinedPlayers[1];

  const started = await request.post(`/api/rooms/${room.id}/start`, {
    data: { playerId: hostPlayer.id },
    headers: { 'x-player-token': hostPlayer.sessionToken },
  });
  expect(started.status()).toBe(200);

  await page.goto('/');
  await page.evaluate(({ roomId, playerId, token }) => {
    localStorage.setItem(`ww:player:${roomId}`, playerId);
    localStorage.setItem(`ww:token:${roomId}`, token);
  }, {
    roomId: room.id,
    playerId: hostPlayer.id,
    token: hostPlayer.sessionToken,
  });

  await page.goto(`/room/${room.id}/play`);
  await expect(page.getByRole('heading', { name: '夜晚·守卫行动' })).toBeVisible();
  await expect(page.getByText('你是 E2E Guard Host（守卫）')).toBeVisible();
  await page.locator('select').first().selectOption({ label: 'E2E Wolf' });
  await page.getByRole('button', { name: '提交守护' }).click();

  await expect(page.getByRole('heading', { name: '夜晚·狼人行动' })).toBeVisible();
  await expect(page.getByText('已提交：守护')).toBeVisible();

  const state = await request.get(`/api/rooms/${room.id}/state`);
  expect(state.status()).toBe(200);
  const body = await state.json();
  expect(body.room.currentPhase).toBe('NIGHT_WEREWOLF');

  await page.goto('/');
  await page.evaluate(({ roomId, playerId, token }) => {
    localStorage.setItem(`ww:player:${roomId}`, playerId);
    localStorage.setItem(`ww:token:${roomId}`, token);
  }, {
    roomId: room.id,
    playerId: wolfPlayer.id,
    token: wolfPlayer.sessionToken,
  });

  await page.goto(`/room/${room.id}/play`);
  await expect(page.getByRole('heading', { name: '夜晚·狼人行动' })).toBeVisible();
  await expect(page.getByText('你是 E2E Wolf（狼人）')).toBeVisible();
  await expect(page.getByText('狼人协作进度：已选择 0 / 1')).toBeVisible();
  await page.getByRole('button', { name: 'E2E Seer' }).click();
  await page.getByRole('button', { name: '提交击杀' }).click();

  await expect(page.getByText('已提交：击杀')).toBeVisible();
  await expect(page.getByText('狼人协作进度：已选择 1 / 1')).toBeVisible();
  await expect(page.getByText('已达成共识，可确认推进。')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '确认击杀并推进' }).click();
  await expect(page.getByRole('heading', { name: '夜晚·预言家行动' })).toBeVisible();

  const afterWolf = await request.get(`/api/rooms/${room.id}/state`);
  expect(afterWolf.status()).toBe(200);
  const afterWolfBody = await afterWolf.json();
  expect(afterWolfBody.room.currentPhase).toBe('NIGHT_SEER');

  await page.goto('/');
  await page.evaluate(({ roomId, playerId, token }) => {
    localStorage.setItem(`ww:player:${roomId}`, playerId);
    localStorage.setItem(`ww:token:${roomId}`, token);
  }, {
    roomId: room.id,
    playerId: seerPlayer.id,
    token: seerPlayer.sessionToken,
  });

  await page.goto(`/room/${room.id}/play`);
  await expect(page.getByRole('heading', { name: '夜晚·预言家行动' })).toBeVisible();
  await expect(page.getByText('你是 E2E Seer（预言家）')).toBeVisible();
  await expect(page.getByText('暂无查验记录')).toBeVisible();
  await page.locator('select').first().selectOption({ label: 'E2E Wolf' });
  await page.getByRole('button', { name: '提交查验' }).click();

  await expect(page.getByText('已提交：查验')).toBeVisible();
  await expect(page.getByText('第 1 夜：E2E Wolf（狼人阵营）')).toBeVisible();
  await expect(page.getByRole('heading', { name: '夜晚结算' })).toBeVisible();
  await expect(page.getByText('E2E Wolf · 未分配 · 存活')).toBeVisible();

  const afterSeer = await request.get(`/api/rooms/${room.id}/state`);
  expect(afterSeer.status()).toBe(200);
  const afterSeerBody = await afterSeer.json();
  expect(afterSeerBody.room.currentPhase).toBe('NIGHT_RESOLVE');
  expect(afterSeerBody.players.find((player: { name: string }) => player.name === 'E2E Wolf')?.role).toBeNull();
});
