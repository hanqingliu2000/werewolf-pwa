import { describe, expect, it, vi } from 'vitest';
import { POST as createRoom } from '../app/api/rooms/route';
import { POST as joinRoom } from '../app/api/rooms/[roomId]/join/route';
import { POST as startRoom } from '../app/api/rooms/[roomId]/start/route';
import { POST as submitAction } from '../app/api/rooms/[roomId]/actions/route';
import { POST as resolveNight } from '../app/api/rooms/[roomId]/resolve/route';
import { POST as advanceDay } from '../app/api/rooms/[roomId]/day-announce/route';
import { POST as dayVote } from '../app/api/rooms/[roomId]/day-vote/route';
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

describe('route full game flow', () => {
  it('plays night resolution through day vote and ends when wolf is eliminated', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('WW_DEBUG_REVEAL_ROLES', '1');

    const created = await createRoom(jsonRequest('http://localhost/api/rooms', {
      hostName: 'FlowHost',
      targetPlayers: 5,
      rolePlan: { guard: 1, werewolf: 1, seer: 1, witch: 1, hunter: 1 },
    }));
    expect(created.status).toBe(201);
    const { room, hostPlayer } = await parseJson(created);

    const joinedPlayers = [];
    for (const name of ['FlowWolf', 'FlowSeer', 'FlowWitch', 'FlowHunter']) {
      const joined = await joinRoom(jsonRequest(`http://localhost/api/rooms/${room.id}/join`, { name }), ctx(room.id));
      expect(joined.status).toBe(201);
      joinedPlayers.push((await parseJson(joined)).player);
    }
    const tokens = new Map([hostPlayer, ...joinedPlayers].map((player) => [player.id, player.sessionToken]));

    const started = await startRoom(
      jsonRequest(`http://localhost/api/rooms/${room.id}/start`, { playerId: hostPlayer.id }, hostPlayer.sessionToken),
      ctx(room.id),
    );
    expect(started.status).toBe(200);
    expect((await parseJson(started)).room.currentPhase).toBe('NIGHT_GUARD');

    const debug = await getState(
      getRequest(`http://localhost/api/rooms/${room.id}/state?revealRoles=1&playerId=${hostPlayer.id}`, hostPlayer.sessionToken),
      ctx(room.id),
    );
    expect(debug.status).toBe(200);
    const players = (await parseJson(debug)).players;
    const guard = players.find((player: any) => player.role === 'guard');
    const wolf = players.find((player: any) => player.role === 'werewolf');
    const seer = players.find((player: any) => player.role === 'seer');
    const witch = players.find((player: any) => player.role === 'witch');
    expect(guard && wolf && seer && witch).toBeTruthy();

    const guardAction = await submitAction(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/actions`,
        { actorPlayerId: guard.id, targetPlayerId: guard.id, actionType: 'guard' },
        tokens.get(guard.id),
      ),
      ctx(room.id),
    );
    expect(guardAction.status).toBe(200);
    expect((await parseJson(guardAction)).room.currentPhase).toBe('NIGHT_WEREWOLF');

    const wolfAction = await submitAction(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/actions`,
        { actorPlayerId: wolf.id, targetPlayerId: seer.id, actionType: 'kill', confirm: true },
        tokens.get(wolf.id),
      ),
      ctx(room.id),
    );
    expect(wolfAction.status).toBe(200);
    expect((await parseJson(wolfAction)).room.currentPhase).toBe('NIGHT_SEER');

    const seerAction = await submitAction(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/actions`,
        { actorPlayerId: seer.id, targetPlayerId: wolf.id, actionType: 'see' },
        tokens.get(seer.id),
      ),
      ctx(room.id),
    );
    expect(seerAction.status).toBe(200);
    expect((await parseJson(seerAction)).room.currentPhase).toBe('NIGHT_WITCH');

    const witchAction = await submitAction(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/actions`,
        { actorPlayerId: witch.id, targetPlayerId: seer.id, actionType: 'save' },
        tokens.get(witch.id),
      ),
      ctx(room.id),
    );
    expect(witchAction.status).toBe(200);
    expect((await parseJson(witchAction)).room.currentPhase).toBe('NIGHT_RESOLVE');

    const resolveWithoutToken = await resolveNight(
      jsonRequest(`http://localhost/api/rooms/${room.id}/resolve`, { hostPlayerId: hostPlayer.id }),
      ctx(room.id),
    );
    expect(resolveWithoutToken.status).toBe(401);

    const resolved = await resolveNight(
      jsonRequest(`http://localhost/api/rooms/${room.id}/resolve`, { hostPlayerId: hostPlayer.id }, hostPlayer.sessionToken),
      ctx(room.id),
    );
    expect(resolved.status).toBe(200);
    const resolvedBody = await parseJson(resolved);
    expect(resolvedBody.room.currentPhase).toBe('DAY_ANNOUNCE');
    expect(resolvedBody.deaths).toEqual([]);

    const dayInput = await advanceDay(
      jsonRequest(`http://localhost/api/rooms/${room.id}/day-announce`, { hostPlayerId: hostPlayer.id }, hostPlayer.sessionToken),
      ctx(room.id),
    );
    expect(dayInput.status).toBe(200);
    expect((await parseJson(dayInput)).room.currentPhase).toBe('DAY_INPUT');

    const voteWithWrongToken = await dayVote(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/day-vote`,
        { hostPlayerId: hostPlayer.id, eliminatedPlayerId: wolf.id },
        tokens.get(wolf.id),
      ),
      ctx(room.id),
    );
    expect(voteWithWrongToken.status).toBe(401);

    const voted = await dayVote(
      jsonRequest(
        `http://localhost/api/rooms/${room.id}/day-vote`,
        { hostPlayerId: hostPlayer.id, eliminatedPlayerId: wolf.id },
        hostPlayer.sessionToken,
      ),
      ctx(room.id),
    );
    expect(voted.status).toBe(200);
    const votedBody = await parseJson(voted);
    expect(votedBody.winner).toBe('good');
    expect(votedBody.room.status).toBe('end');
    expect(votedBody.room.currentPhase).toBe('END');

    vi.unstubAllEnvs();
  });
});
