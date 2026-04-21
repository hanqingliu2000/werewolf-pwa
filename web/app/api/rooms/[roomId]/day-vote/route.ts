import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertHostSession, dayVote } from '@/lib/store';
import { getSupabaseClient } from '@/lib/repo';
import { readSessionToken } from '@/lib/session';

const schema = z.object({
  hostPlayerId: z.string().min(1),
  eliminatedPlayerId: z.string().nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const payload = schema.parse(await req.json());
    const { roomId } = await ctx.params;
    const normalizedRoomId = roomId.toUpperCase();
    const sessionToken = readSessionToken(req);
    const sb = getSupabaseClient();

    if (!sb) {
      assertHostSession(normalizedRoomId, payload.hostPlayerId, sessionToken);
      const result = dayVote(normalizedRoomId, payload);
      return NextResponse.json(result, { status: 200 });
    }

    const { data, error } = await sb.rpc('submit_day_vote_tx', {
      p_room_id: normalizedRoomId,
      p_host_player_id: payload.hostPlayerId,
      p_session_token: sessionToken,
      p_eliminated_player_id: payload.eliminatedPlayerId ?? null,
      p_vote_event_id: randomUUID(),
      p_game_end_event_id: randomUUID(),
    });
    if (error) throw new Error(error.message || 'SUPABASE_DAY_VOTE_FAILED');

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_PAYLOAD', details: error.issues }, { status: 400 });
    }
    const message = (error as Error).message || 'UNKNOWN_ERROR';
    const status = message === 'ROOM_NOT_FOUND' ? 404 : message === 'FORBIDDEN' ? 403 : message === 'PHASE_CONFLICT' ? 409 : message === 'UNAUTHORIZED' || message === 'INVALID_SESSION' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
