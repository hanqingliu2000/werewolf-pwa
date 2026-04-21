import type { SupabaseClient } from '@supabase/supabase-js';

export function readSessionToken(req: Request, fallback?: string | null) {
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || req.headers.get('x-player-token') || fallback || null;
}

export async function assertSupabasePlayerSession(
  sb: SupabaseClient,
  roomId: string,
  playerId: string,
  sessionToken?: string | null,
) {
  if (!sessionToken) throw new Error('UNAUTHORIZED');
  const { data: player, error } = await sb
    .from('players')
    .select('*')
    .eq('id', playerId)
    .eq('room_id', roomId)
    .single();
  if (error || !player) throw new Error('PLAYER_NOT_FOUND');
  if (player.session_token !== sessionToken) throw new Error('INVALID_SESSION');
  return player;
}

export async function assertSupabaseHostSession(
  sb: SupabaseClient,
  room: { host_id: string },
  roomId: string,
  hostPlayerId: string,
  sessionToken?: string | null,
) {
  if (room.host_id !== hostPlayerId) throw new Error('FORBIDDEN');
  return assertSupabasePlayerSession(sb, roomId, hostPlayerId, sessionToken);
}
