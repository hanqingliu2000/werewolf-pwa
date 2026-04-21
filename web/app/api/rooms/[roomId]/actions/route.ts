import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertPlayerSession, submitNightAction } from '@/lib/store';
import { getSupabaseClient } from '@/lib/repo';
import { readSessionToken } from '@/lib/session';

const schema = z.object({
  actorPlayerId: z.string().min(1),
  targetPlayerId: z.string().min(1).optional(),
  actionType: z.enum(['guard', 'kill', 'see', 'save', 'poison', 'pass']),
  confirm: z.boolean().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const payload = schema.parse(await req.json());
    const { roomId } = await ctx.params;
    const normalizedRoomId = roomId.toUpperCase();
    const sessionToken = readSessionToken(req);
    const sb = getSupabaseClient();

    if (!sb) {
      assertPlayerSession(normalizedRoomId, payload.actorPlayerId, sessionToken);
      const result = submitNightAction(normalizedRoomId, payload);
      return NextResponse.json(result, { status: 200 });
    }

    const { data, error } = await sb.rpc('submit_night_action_tx', {
      p_room_id: normalizedRoomId,
      p_actor_player_id: payload.actorPlayerId,
      p_session_token: sessionToken,
      p_target_player_id: payload.targetPlayerId ?? null,
      p_action_type: payload.actionType,
      p_confirm: payload.confirm ?? false,
      p_action_id: randomUUID(),
    });
    if (error) throw new Error(error.message || 'SUPABASE_SUBMIT_ACTION_FAILED');

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
