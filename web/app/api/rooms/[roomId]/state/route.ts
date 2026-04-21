import { NextResponse } from 'next/server';
import { assertHostSession, getRoomState } from '@/lib/store';
import { getSupabaseClient } from '@/lib/repo';
import { mapPlayer, mapRoom } from '@/lib/api-mappers';
import { assertSupabaseHostSession, readSessionToken } from '@/lib/session';

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const normalizedRoomId = roomId.toUpperCase();
    const url = new URL(req.url);
    const requestedRevealRoles = url.searchParams.get('revealRoles') === '1';
    const playerId = url.searchParams.get('playerId');
    const sessionToken = readSessionToken(req);
    const debugRevealEnabled = process.env.WW_DEBUG_REVEAL_ROLES === '1';
    const sb = getSupabaseClient();

    if (!sb) {
      const revealRoles = requestedRevealRoles && debugRevealEnabled;
      if (revealRoles) {
        if (!playerId) throw new Error('PLAYER_ID_REQUIRED');
        assertHostSession(normalizedRoomId, playerId, sessionToken);
      }
      const state = getRoomState(normalizedRoomId, {
        revealRoles,
        revealPrivateNightActions: revealRoles,
        revealWolfConsensus: revealRoles,
      });
      return NextResponse.json(state, { status: 200 });
    }

    const { data: room, error: eRoom } = await sb.from('rooms').select('*').eq('id', normalizedRoomId).single();
    if (eRoom || !room) return NextResponse.json({ error: 'ROOM_NOT_FOUND' }, { status: 404 });
    const revealRoles = requestedRevealRoles && debugRevealEnabled;
    if (revealRoles) {
      if (!playerId) throw new Error('PLAYER_ID_REQUIRED');
      await assertSupabaseHostSession(sb, room, normalizedRoomId, playerId, sessionToken);
    }

    const { data: players, error: ePlayers } = await sb.from('players').select('*').eq('room_id', normalizedRoomId);
    if (ePlayers || !players) throw new Error(`SUPABASE_FETCH_PLAYERS_FAILED: ${ePlayers?.message}`);

    const { data: actions } = await sb
      .from('night_actions')
      .select('*')
      .eq('room_id', normalizedRoomId)
      .eq('night_no', room.current_night_no);

    const { data: events } = await sb
      .from('events')
      .select('*')
      .eq('room_id', normalizedRoomId)
      .order('created_at', { ascending: false })
      .limit(10);

    const aliveWolves = players.filter((p) => p.alive && p.role === 'werewolf').map((p) => p.id);
    const wolfKillActions = (actions ?? []).filter((a) => a.is_final && a.action_type === 'kill' && aliveWolves.includes(a.actor_player_id));
    const wolfTargets = new Map(wolfKillActions.map((a) => [a.actor_player_id, a.target_player_id]));
    const selectedCount = aliveWolves.filter((id) => wolfTargets.has(id)).length;
    const consensus =
      selectedCount > 0 &&
      selectedCount === aliveWolves.length &&
      new Set(aliveWolves.map((id) => wolfTargets.get(id))).size === 1;

    return NextResponse.json(
      {
        room: mapRoom(room),
        players: players.map((p) => mapPlayer(p, { revealRole: revealRoles })),
        nightActions: revealRoles ? actions ?? [] : [],
        wolfConsensus: revealRoles ? {
          wolfCount: aliveWolves.length,
          selectedCount,
          consensus,
          allSelected: selectedCount === aliveWolves.length,
        } : null,
        events: events ?? [],
      },
      { status: 200 },
    );
  } catch (error) {
    const message = (error as Error).message || 'UNKNOWN_ERROR';
    const status = message === 'ROOM_NOT_FOUND' ? 404 : message === 'UNAUTHORIZED' || message === 'INVALID_SESSION' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
