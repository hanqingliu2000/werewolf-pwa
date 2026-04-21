import { describe, expect, it, vi } from 'vitest';
import { POST as createRoom } from '../app/api/rooms/route';
import { POST as joinRoom } from '../app/api/rooms/[roomId]/join/route';
import { POST as startRoom } from '../app/api/rooms/[roomId]/start/route';
import { POST as submitAction } from '../app/api/rooms/[roomId]/actions/route';
import { GET as getMe } from '../app/api/rooms/[roomId]/me/route';
import { GET as getState } from '../app/api/rooms/[roomId]/state/route';

function jsonRequest(url: string, body: unknown, token?: string) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-player-token': token } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getRequest(url: string, token?: string) {
  return new Request(url, {
    headers: token ? { 'x-player-token': token } : {},
  });
}

function ctx(roomId: string) {
  return { params: Promise.resolve({ roomId }) };
}

async function parseJson<T = any>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

describe('route privacy and session guards', () => {
  it('requires player tokens and keeps public state masked', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('WW_DEBUG_REVEAL_ROLES', '1');

    const created = await createRoom(jsonRequest('http://localhost/api/rooms', {
      hostName: 'RouteHost',
      targetPlayers: 5,
      rolePlan: { guard: 1, werewolf: 1, seer: 1, witch: 1, hunter: 1 },
    }));
    expect(created.status).toBe(201);
    const { room, hostPlayer } = await parseJson(created);

    const joinedPlayers = [];
    for (const name of ['Wolf', 'Seer', 'Witch', 'Hunter']) {
      const joined = await joinRoom(jsonRequest(`http://localhost/api/rooms/${room.id}/join`, { name }), ctx(room.id));
      expect(joined.status).toBe(201);
      joinedPlayers.push((await parseJson(joined)).player);
    }
    const tokenByPlayerId = new Map([hostPlayer, ...joinedPlayers].map((p) => [p.id, p.sessionToken]));

    const startWithoutToken = await startRoom(
      jsonRequest(`http://localhost/api/rooms/${room.id}/start`, { playerId: hostPlayer.id }),
      ctx(room.id),
    );
    expect(startWithoutToken.status).toBe(401);

    const started = await startRoom(
      jsonRequest(`http://localhost/api/rooms/${room.id}/start`, { playerId: hostPlayer.id }, hostPlayer.sessionToken),
      ctx(room.id),
    );
    expect(started.status).toBe(200);

    const publicState = await getState(getRequest(`http://localhost/api/rooms/${room.id}/state`), ctx(room.id));
    expect(publicState.status).toBe(200);
    const publicBody = await parseJson(publicState);
    expect(publicBody.players.every((p: any) => p.role === null)).toBe(true);
    expect(publicBody.nightActions).toEqual([]);
    expect(publicBody.wolfConsensus).toBeNull();

    const debugWithoutToken = await getState(
      getRequest(`http://localhost/api/rooms/${room.id}/state?revealRoles=1&playerId=${hostPlayer.id}`),
      ctx(room.id),
    );
    expect(debugWithoutToken.status).toBe(401);

    const debugState = await getState(
      getRequest(`http://localhost/api/rooms/${room.id}/state?revealRoles=1&playerId=${hostPlayer.id}`, hostPlayer.sessionToken),
      ctx(room.id),
    );
    expect(debugState.status).toBe(200);
    const debugBody = await parseJson(debugState);
    const guard = debugBody.players.find((p: any) => p.role === 'guard');
    const wolf = debugBody.players.find((p: any) => p.role === 'werewolf');
    const seer = debugBody.players.find((p: any) => p.role === 'seer');
    expect(guard && wolf && seer).toBeTruthy();

    const meWithoutToken = await getMe(getRequest(`http://localhost/api/rooms/${room.id}/me?playerId=${wolf.id}`), ctx(room.id));
    expect(meWithoutToken.status).toBe(401);

    const meWithWrongToken = await getMe(
      getRequest(`http://localhost/api/rooms/${room.id}/me?playerId=${wolf.id}`, hostPlayer.sessionToken),
      ctx(room.id),
    );
    expect(meWithWrongToken.status).toBe(401);

    const me = await getMe(
      getRequest(`http://localhost/api/rooms/${room.id}/me?playerId=${wolf.id}`, tokenByPlayerId.get(wolf.id)),
      ctx(room.id),
    );
    expect(me.status).toBe(200);
    expect((await parseJson(me)).me.role).toBe('werewolf');

    const spoofedAction = await submitAction(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/actions`,
        { actorPlayerId: guard.id, targetPlayerId: guard.id, actionType: 'guard' },
        tokenByPlayerId.get(wolf.id),
      ),
      ctx(room.id),
    );
    expect(spoofedAction.status).toBe(401);

    const guardAction = await submitAction(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/actions`,
        { actorPlayerId: guard.id, targetPlayerId: guard.id, actionType: 'guard' },
        tokenByPlayerId.get(guard.id),
      ),
      ctx(room.id),
    );
    expect(guardAction.status).toBe(200);

    const wolfAction = await submitAction(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/actions`,
        { actorPlayerId: wolf.id, targetPlayerId: seer.id, actionType: 'kill' },
        tokenByPlayerId.get(wolf.id),
      ),
      ctx(room.id),
    );
    expect(wolfAction.status).toBe(200);

    const maskedAfterActions = await getState(getRequest(`http://localhost/api/rooms/${room.id}/state`), ctx(room.id));
    const maskedAfterActionsBody = await parseJson(maskedAfterActions);
    expect(maskedAfterActionsBody.players.every((p: any) => p.role === null)).toBe(true);
    expect(maskedAfterActionsBody.nightActions).toEqual([]);
    expect(maskedAfterActionsBody.wolfConsensus).toBeNull();

    vi.unstubAllEnvs();
  });
});
