import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertHostSession, startRoom } from '@/lib/store';
import { getSupabaseClient } from '@/lib/repo';
import { buildRoleQueue } from '@/lib/game-rules';
import { readSessionToken } from '@/lib/session';

const schema = z.object({
  playerId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const payload = schema.parse(await req.json());
    const { roomId } = await ctx.params;
    const normalizedRoomId = roomId.toUpperCase();
    const sessionToken = readSessionToken(req);
    const sb = getSupabaseClient();

    if (!sb) {
      assertHostSession(normalizedRoomId, payload.playerId, sessionToken);
      const room = startRoom(normalizedRoomId, payload.playerId);
      return NextResponse.json({ room }, { status: 200 });
    }

    const { data: room, error: eRoom } = await sb.from('rooms').select('rule_config').eq('id', normalizedRoomId).single();
    if (eRoom || !room) return NextResponse.json({ error: 'ROOM_NOT_FOUND' }, { status: 404 });

    const roleQueue = buildRoleQueue(18, room.rule_config?.rolePlan as Record<string, number> | undefined);
    const { data, error } = await sb.rpc('start_room_with_roles', {
      p_room_id: normalizedRoomId,
      p_host_player_id: payload.playerId,
      p_session_token: sessionToken,
      p_role_queue: roleQueue,
    });
    if (error) throw new Error(error.message || 'SUPABASE_START_ROOM_FAILED');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_PAYLOAD', details: error.issues }, { status: 400 });
    }
    const message = (error as Error).message || 'UNKNOWN_ERROR';
    const status = message === 'ROOM_NOT_FOUND' ? 404 : message === 'FORBIDDEN' ? 403 : message === 'PHASE_CONFLICT' ? 409 : message === 'UNAUTHORIZED' || message === 'INVALID_SESSION' ? 401 : message === 'PLAYERS_NOT_READY' ? 400 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
