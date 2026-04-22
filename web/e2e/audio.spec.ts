import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

type HostAudioEvent = {
  type: 'create' | 'load' | 'play';
  src: string;
};

type HostAudioWindow = Window & typeof globalThis & {
  __hostAudioEvents?: HostAudioEvent[];
  __hostAudioBlocked?: boolean;
};

async function installMockAudio(page: Page, opts: { blocked?: boolean } = {}) {
  await page.addInitScript((initialBlocked) => {
    const win = window as HostAudioWindow;
    win.__hostAudioEvents = [];
    win.__hostAudioBlocked = initialBlocked;
    const push = (event: HostAudioEvent) => win.__hostAudioEvents?.push(event);

    class MockAudio {
      src: string;
      preload = '';
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(src?: string) {
        this.src = src || '';
        push({ type: 'create', src: this.src });
      }

      load() {
        push({ type: 'load', src: this.src });
      }

      play() {
        push({ type: 'play', src: this.src });
        if (win.__hostAudioBlocked) {
          return Promise.reject(new Error('blocked'));
        }
        window.setTimeout(() => this.onended?.(), 0);
        return Promise.resolve();
      }
    }

    Object.defineProperty(window, 'Audio', {
      configurable: true,
      writable: true,
      value: MockAudio,
    });
  }, opts.blocked === true);
}

async function playedClipKeys(page: Page) {
  return page.evaluate(() => {
    const win = window as HostAudioWindow;
    return (win.__hostAudioEvents || [])
      .filter((event) => event.type === 'play')
      .map((event) => event.src.match(/\/([^/]+)\.mp3$/)?.[1] || event.src);
  });
}

async function createStartedAudioRoom(request: APIRequestContext) {
  const created = await request.post('/api/rooms', {
    data: {
      hostName: 'E2E Audio Host',
      roomName: 'E2E Audio Room',
      targetPlayers: 4,
      rolePlan: { guard: 1, werewolf: 1, seer: 1, villager: 1 },
    },
  });
  expect(created.status()).toBe(201);
  const { room, hostPlayer } = await created.json();

  for (const name of ['E2E Audio Wolf', 'E2E Audio Seer', 'E2E Audio Villager']) {
    const joined = await request.post(`/api/rooms/${room.id}/join`, { data: { name } });
    expect(joined.status()).toBe(201);
  }

  const started = await request.post(`/api/rooms/${room.id}/start`, {
    data: { playerId: hostPlayer.id },
    headers: { 'x-player-token': hostPlayer.sessionToken },
  });
  expect(started.status()).toBe(200);

  return { room, hostPlayer };
}

test('host narration auto-plays initial and transition clips in order after audio is available', async ({ page, request }) => {
  await installMockAudio(page);
  const { room, hostPlayer } = await createStartedAudioRoom(request);

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
  await expect.poll(() => playedClipKeys(page)).toEqual(['night_guard_open']);

  await page.locator('select').first().selectOption({ label: 'E2E Audio Wolf' });
  await page.getByRole('button', { name: '提交守护' }).click();

  await expect(page.getByRole('heading', { name: '夜晚·狼人行动' })).toBeVisible();
  await expect.poll(() => playedClipKeys(page)).toEqual([
    'night_guard_open',
    'night_guard_close',
    'night_werewolf_open',
  ]);
});

test('host narration retries current phase after the user unlocks blocked autoplay', async ({ page, request }) => {
  await installMockAudio(page, { blocked: true });
  const { room, hostPlayer } = await createStartedAudioRoom(request);

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
  await expect.poll(() => playedClipKeys(page)).toEqual(['night_guard_open']);
  await expect(page.getByText(/语音播报失败：PREBUILT_AUDIO_PLAY_BLOCKED/)).toBeVisible();
  await expect(page.getByText('语音未解锁（浏览器限制）。点击一次即可恢复自动播报。')).toBeVisible();

  await page.evaluate(() => {
    const win = window as HostAudioWindow;
    win.__hostAudioBlocked = false;
  });
  await page.getByRole('button', { name: '点击解锁语音播放' }).first().click();

  await expect.poll(() => playedClipKeys(page)).toEqual(['night_guard_open', 'night_guard_open']);
  await expect(page.getByText('主持播报：守卫请睁眼，请选择你要守护的玩家。')).toBeVisible();
});
