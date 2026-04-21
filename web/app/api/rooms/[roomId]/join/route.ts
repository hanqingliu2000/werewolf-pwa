import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { joinRoom } from '@/lib/store';
import { getSupabaseClient } from '@/lib/repo';

const schema = z.object({
  name: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const payload = schema.parse(await req.json());
    const { roomId } = await ctx.params;
    const normalizedRoomId = roomId.toUpperCase();
    const normalizedPlayerName = payload.name.trim();
    const sb = getSupabaseClient();

    if (!sb) {
      const result = joinRoom(normalizedRoomId, { name: normalizedPlayerName });
      return NextResponse.json(result, { status: 201 });
    }

    const { data, error } = await sb.rpc('join_room_with_player', {
      p_room_id: normalizedRoomId,
      p_player_id: randomUUID(),
      p_player_name: normalizedPlayerName,
      p_session_token: randomUUID(),
    });
    if (error) throw new Error(error.message || 'SUPABASE_JOIN_ROOM_FAILED');

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_PAYLOAD', details: error.issues }, { status: 400 });
    }
    const message = (error as Error).message || 'UNKNOWN_ERROR';
    const status = message === 'ROOM_NOT_FOUND' ? 404 : message === 'PLAYER_NAME_TAKEN' ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
