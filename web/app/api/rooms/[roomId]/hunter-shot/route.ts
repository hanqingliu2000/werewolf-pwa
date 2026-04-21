import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertPlayerSession, hunterShot } from '@/lib/store';
import { getSupabaseClient } from '@/lib/repo';
import { readSessionToken } from '@/lib/session';

const schema = z.object({
  hunterPlayerId: z.string().min(1),
  targetPlayerId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const payload = schema.parse(await req.json());
    const { roomId } = await ctx.params;
    const normalizedRoomId = roomId.toUpperCase();
    const sessionToken = readSessionToken(req);
    const sb = getSupabaseClient();

    if (!sb) {
      assertPlayerSession(normalizedRoomId, payload.hunterPlayerId, sessionToken);
      const room = hunterShot(normalizedRoomId, payload);
      return NextResponse.json({ room }, { status: 200 });
    }

    const { data, error } = await sb.rpc('submit_hunter_shot_tx', {
      p_room_id: normalizedRoomId,
      p_hunter_player_id: payload.hunterPlayerId,
      p_session_token: sessionToken,
      p_target_player_id: payload.targetPlayerId,
      p_event_id: randomUUID(),
    });
    if (error) throw new Error(error.message || 'SUPABASE_HUNTER_SHOT_FAILED');

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
