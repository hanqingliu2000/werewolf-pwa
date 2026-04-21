import { afterEach, describe, expect, it, vi } from 'vitest';

function authedJsonRequest(url: string, body: unknown, token = 'session-token') {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-player-token': token,
    },
    body: JSON.stringify(body),
  });
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(roomId: string) {
  return { params: Promise.resolve({ roomId }) };
}

async function parseJson<T = any>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

describe('rpc route error mapping', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/repo');
    vi.resetModules();
  });

  it.each([
    {
      name: 'night action',
      request: () => authedJsonRequest('http://localhost/api/rooms/abc123/actions', {
        actorPlayerId: '11111111-1111-1111-1111-111111111111',
        targetPlayerId: '22222222-2222-2222-2222-222222222222',
        actionType: 'guard',
      }),
      post: async () => (await import('../app/api/rooms/[roomId]/actions/route')).POST,
    },
    {
      name: 'day announce',
      request: () => authedJsonRequest('http://localhost/api/rooms/abc123/day-announce', {
        hostPlayerId: '11111111-1111-1111-1111-111111111111',
      }),
      post: async () => (await import('../app/api/rooms/[roomId]/day-announce/route')).POST,
    },
    {
      name: 'resolve night',
      request: () => authedJsonRequest('http://localhost/api/rooms/abc123/resolve', {
        hostPlayerId: '11111111-1111-1111-1111-111111111111',
      }),
      post: async () => (await import('../app/api/rooms/[roomId]/resolve/route')).POST,
    },
    {
      name: 'hunter shot',
      request: () => authedJsonRequest('http://localhost/api/rooms/abc123/hunter-shot', {
        hunterPlayerId: '11111111-1111-1111-1111-111111111111',
        targetPlayerId: '22222222-2222-2222-2222-222222222222',
      }),
      post: async () => (await import('../app/api/rooms/[roomId]/hunter-shot/route')).POST,
    },
    {
      name: 'day vote',
      request: () => authedJsonRequest('http://localhost/api/rooms/abc123/day-vote', {
        hostPlayerId: '11111111-1111-1111-1111-111111111111',
        eliminatedPlayerId: null,
      }),
      post: async () => (await import('../app/api/rooms/[roomId]/day-vote/route')).POST,
    },
    {
      name: 'restart',
      request: () => authedJsonRequest('http://localhost/api/rooms/abc123/restart', {
        hostPlayerId: '11111111-1111-1111-1111-111111111111',
      }),
      post: async () => (await import('../app/api/rooms/[roomId]/restart/route')).POST,
    },
  ])('maps PHASE_CONFLICT from $name to 409', async ({ request, post }) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'PHASE_CONFLICT' } });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));

    const res = await (await post())(request(), ctx('abc123'));

    expect(res.status).toBe(409);
    expect(await parseJson(res)).toEqual({ error: 'PHASE_CONFLICT' });
  });

  it('maps duplicate player names from join rpc to 409', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'PLAYER_NAME_TAKEN' } });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/join/route');

    const res = await POST(jsonRequest('http://localhost/api/rooms/abc123/join', { name: 'Alice' }), ctx('abc123'));

    expect(res.status).toBe(409);
    expect(await parseJson(res)).toEqual({ error: 'PLAYER_NAME_TAKEN' });
  });
});
