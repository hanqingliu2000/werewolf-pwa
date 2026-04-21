import { afterEach, describe, expect, it, vi } from 'vitest';

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authedJsonRequest(url: string, body: unknown, token: string) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-player-token': token,
    },
    body: JSON.stringify(body),
  });
}

function ctx(roomId: string) {
  return { params: Promise.resolve({ roomId }) };
}

async function parseJson<T = any>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

describe('supabase route rpc writes', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/repo');
    vi.resetModules();
  });

  it('creates room and host through one rpc call', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', currentPhase: 'LOBBY' },
        hostPlayer: { id: 'host-id', sessionToken: 'host-token' },
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/route');

    const res = await POST(jsonRequest('http://localhost/api/rooms', {
      hostName: 'Host',
      roomName: 'RPC Room',
      targetPlayers: 5,
      rolePlan: { werewolf: 1 },
    }));

    expect(res.status).toBe(201);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', currentPhase: 'LOBBY' },
      hostPlayer: { id: 'host-id', sessionToken: 'host-token' },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_room_with_host', expect.objectContaining({
      p_room_id: expect.any(String),
      p_host_id: expect.any(String),
      p_host_name: 'Host',
      p_room_name: 'RPC Room',
      p_rule_config: expect.objectContaining({
        targetPlayers: 5,
        rolePlan: { werewolf: 1 },
      }),
      p_session_token: expect.any(String),
    }));
  });

  it('joins room through one rpc call', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', phaseVersion: 2 },
        player: { id: 'player-id', sessionToken: 'player-token' },
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/join/route');

    const res = await POST(jsonRequest('http://localhost/api/rooms/abc123/join', { name: ' Alice ' }), ctx('abc123'));

    expect(res.status).toBe(201);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', phaseVersion: 2 },
      player: { id: 'player-id', sessionToken: 'player-token' },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('join_room_with_player', {
      p_room_id: 'ABC123',
      p_player_id: expect.any(String),
      p_player_name: 'Alice',
      p_session_token: expect.any(String),
    });
  });

  it('starts room through one rpc call after reading role config', async () => {
    const select = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({
      data: {
        rule_config: {
          rolePlan: { werewolf: 2, seer: 1 },
        },
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ select, eq, single });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', currentPhase: 'NIGHT_WEREWOLF' },
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ from, rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/start/route');

    const res = await POST(
      authedJsonRequest('http://localhost/api/rooms/abc123/start', { playerId: '11111111-1111-1111-1111-111111111111' }, 'host-token'),
      ctx('abc123'),
    );

    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', currentPhase: 'NIGHT_WEREWOLF' },
    });
    expect(from).toHaveBeenCalledWith('rooms');
    expect(select).toHaveBeenCalledWith('rule_config');
    expect(eq).toHaveBeenCalledWith('id', 'ABC123');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('start_room_with_roles', {
      p_room_id: 'ABC123',
      p_host_player_id: '11111111-1111-1111-1111-111111111111',
      p_session_token: 'host-token',
      p_role_queue: expect.arrayContaining(['werewolf', 'werewolf', 'seer']),
    });
  });

  it('submits night action through one rpc call', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', currentPhase: 'NIGHT_WEREWOLF' },
        acceptedAction: 'guard',
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/actions/route');

    const res = await POST(
      authedJsonRequest(
        'http://localhost/api/rooms/abc123/actions',
        {
          actorPlayerId: '11111111-1111-1111-1111-111111111111',
          targetPlayerId: '22222222-2222-2222-2222-222222222222',
          actionType: 'guard',
        },
        'actor-token',
      ),
      ctx('abc123'),
    );

    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', currentPhase: 'NIGHT_WEREWOLF' },
      acceptedAction: 'guard',
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_night_action_tx', {
      p_room_id: 'ABC123',
      p_actor_player_id: '11111111-1111-1111-1111-111111111111',
      p_session_token: 'actor-token',
      p_target_player_id: '22222222-2222-2222-2222-222222222222',
      p_action_type: 'guard',
      p_confirm: false,
      p_action_id: expect.any(String),
    });
  });

  it('resolves night through one rpc call', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', currentPhase: 'DAY_ANNOUNCE' },
        deaths: [{ id: '22222222-2222-2222-2222-222222222222', name: 'Target' }],
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/resolve/route');

    const res = await POST(
      authedJsonRequest(
        'http://localhost/api/rooms/abc123/resolve',
        { hostPlayerId: '11111111-1111-1111-1111-111111111111' },
        'host-token',
      ),
      ctx('abc123'),
    );

    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', currentPhase: 'DAY_ANNOUNCE' },
      deaths: [{ id: '22222222-2222-2222-2222-222222222222', name: 'Target' }],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('resolve_night_tx', {
      p_room_id: 'ABC123',
      p_host_player_id: '11111111-1111-1111-1111-111111111111',
      p_session_token: 'host-token',
      p_event_id: expect.any(String),
    });
  });

  it('submits day vote through one rpc call', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', currentPhase: 'NIGHT_WEREWOLF' },
        winner: null,
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/day-vote/route');

    const res = await POST(
      authedJsonRequest(
        'http://localhost/api/rooms/abc123/day-vote',
        {
          hostPlayerId: '11111111-1111-1111-1111-111111111111',
          eliminatedPlayerId: '22222222-2222-2222-2222-222222222222',
        },
        'host-token',
      ),
      ctx('abc123'),
    );

    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', currentPhase: 'NIGHT_WEREWOLF' },
      winner: null,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_day_vote_tx', {
      p_room_id: 'ABC123',
      p_host_player_id: '11111111-1111-1111-1111-111111111111',
      p_session_token: 'host-token',
      p_eliminated_player_id: '22222222-2222-2222-2222-222222222222',
      p_vote_event_id: expect.any(String),
      p_game_end_event_id: expect.any(String),
    });
  });

  it('submits hunter shot through one rpc call', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', currentPhase: 'DAY_ANNOUNCE' },
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/hunter-shot/route');

    const res = await POST(
      authedJsonRequest(
        'http://localhost/api/rooms/abc123/hunter-shot',
        {
          hunterPlayerId: '11111111-1111-1111-1111-111111111111',
          targetPlayerId: '22222222-2222-2222-2222-222222222222',
        },
        'hunter-token',
      ),
      ctx('abc123'),
    );

    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', currentPhase: 'DAY_ANNOUNCE' },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_hunter_shot_tx', {
      p_room_id: 'ABC123',
      p_hunter_player_id: '11111111-1111-1111-1111-111111111111',
      p_session_token: 'hunter-token',
      p_target_player_id: '22222222-2222-2222-2222-222222222222',
      p_event_id: expect.any(String),
    });
  });

  it('restarts room through one rpc call', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', currentPhase: 'LOBBY' },
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/restart/route');

    const res = await POST(
      authedJsonRequest(
        'http://localhost/api/rooms/abc123/restart',
        { hostPlayerId: '11111111-1111-1111-1111-111111111111' },
        'host-token',
      ),
      ctx('abc123'),
    );

    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', currentPhase: 'LOBBY' },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('restart_room_tx', {
      p_room_id: 'ABC123',
      p_host_player_id: '11111111-1111-1111-1111-111111111111',
      p_session_token: 'host-token',
    });
  });

  it('advances day announce through one rpc call', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        room: { id: 'ABC123', currentPhase: 'DAY_INPUT' },
      },
      error: null,
    });
    vi.doMock('@/lib/repo', () => ({ getSupabaseClient: () => ({ rpc }) }));
    const { POST } = await import('../app/api/rooms/[roomId]/day-announce/route');

    const res = await POST(
      authedJsonRequest(
        'http://localhost/api/rooms/abc123/day-announce',
        { hostPlayerId: '11111111-1111-1111-1111-111111111111' },
        'host-token',
      ),
      ctx('abc123'),
    );

    expect(res.status).toBe(200);
    expect(await parseJson(res)).toEqual({
      room: { id: 'ABC123', currentPhase: 'DAY_INPUT' },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('advance_day_announce_tx', {
      p_room_id: 'ABC123',
      p_host_player_id: '11111111-1111-1111-1111-111111111111',
      p_session_token: 'host-token',
      p_event_id: expect.any(String),
    });
  });
});
