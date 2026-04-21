import { NextResponse } from 'next/server';
import { assertPlayerSession, getPlayerView } from '@/lib/store';
import { getSupabaseClient } from '@/lib/repo';
import { mapRoom } from '@/lib/api-mappers';
import { assertSupabasePlayerSession, readSessionToken } from '@/lib/session';

export async function GET(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    const { roomId } = await ctx.params;
    const normalizedRoomId = roomId.toUpperCase();
    const url = new URL(req.url);
    const playerId = url.searchParams.get('playerId');
    if (!playerId) return NextResponse.json({ error: 'PLAYER_ID_REQUIRED' }, { status: 400 });
    const sessionToken = readSessionToken(req);

    const sb = getSupabaseClient();
    if (!sb) {
      assertPlayerSession(normalizedRoomId, playerId, sessionToken);
      const data = getPlayerView(normalizedRoomId, playerId);
      return NextResponse.json(data, { status: 200 });
    }

    const { data: room, error: eRoom } = await sb.from('rooms').select('*').eq('id', normalizedRoomId).single();
    if (eRoom || !room) return NextResponse.json({ error: 'ROOM_NOT_FOUND' }, { status: 404 });

    const me = await assertSupabasePlayerSession(sb, normalizedRoomId, playerId, sessionToken);

    let seerResults: Array<{ nightNo: number; targetName: string; targetRole: string | null; alignment: 'good' | 'wolf' }> = [];
    if (me.role === 'seer') {
      const { data: sees } = await sb
        .from('night_actions')
        .select('night_no,target_player_id')
        .eq('room_id', normalizedRoomId)
        .eq('actor_player_id', me.id)
        .eq('action_type', 'see')
        .eq('is_final', true)
        .order('night_no', { ascending: true });
      if (sees && sees.length) {
        const ids = [...new Set(sees.map((x) => x.target_player_id))];
        const { data: targetPlayers } = await sb.from('players').select('id,name,role').in('id', ids);
        const byId = new Map((targetPlayers || []).map((p: any) => [p.id, p]));
        seerResults = sees.map((x: any) => {
          const t: any = byId.get(x.target_player_id);
          const role = t?.role ?? null;
          return {
            nightNo: x.night_no,
            targetName: t?.name || '未知玩家',
            targetRole: role,
            alignment: role === 'werewolf' ? 'wolf' : 'good',
          };
        });
      }
    }

    let witchStatus: { usedSave: number; usedPoison: number; maxSave: number; maxPoison: number } | null = null;
    if (me.role === 'witch') {
      const { data: uses } = await sb
        .from('night_actions')
        .select('action_type')
        .eq('room_id', normalizedRoomId)
        .eq('actor_player_id', me.id)
        .in('action_type', ['save','poison'])
        .eq('is_final', true);
      const usedSave = (uses || []).filter((u: any) => u.action_type === 'save').length;
      const usedPoison = (uses || []).filter((u: any) => u.action_type === 'poison').length;
      witchStatus = {
        usedSave,
        usedPoison,
        maxSave: Number(room.rule_config?.witchSaveCount ?? 1),
        maxPoison: Number(room.rule_config?.witchPoisonCount ?? 1),
      };
    }

    let witchVictim: { id: string; name: string } | null = null;
    if (me.role === 'witch' && room.current_phase === 'NIGHT_WITCH') {
      const { data: kill } = await sb
        .from('night_actions')
        .select('target_player_id')
        .eq('room_id', normalizedRoomId)
        .eq('night_no', room.current_night_no)
        .eq('action_type', 'kill')
        .eq('is_final', true)
        .maybeSingle();
      if (kill?.target_player_id) {
        const { data: target } = await sb.from('players').select('id,name').eq('id', kill.target_player_id).eq('room_id', normalizedRoomId).single();
        witchVictim = target ? { id: target.id, name: target.name } : null;
      }
    }

    let wolfConsensus = null;
    if (me.role === 'werewolf') {
      const { data: roomPlayers } = await sb.from('players').select('id,role,alive').eq('room_id', normalizedRoomId);
      const { data: actions } = await sb
        .from('night_actions')
        .select('actor_player_id,target_player_id,action_type,is_final')
        .eq('room_id', normalizedRoomId)
        .eq('night_no', room.current_night_no)
        .eq('is_final', true);
      const aliveWolves = (roomPlayers ?? []).filter((p) => p.alive && p.role === 'werewolf').map((p) => p.id);
      const wolfKills = (actions ?? []).filter((a) => a.action_type === 'kill' && aliveWolves.includes(a.actor_player_id));
      const targetByWolf = new Map(wolfKills.map((a) => [a.actor_player_id, a.target_player_id]));
      const selectedCount = aliveWolves.filter((id) => targetByWolf.has(id)).length;
      const consensus =
        selectedCount > 0 &&
        selectedCount === aliveWolves.length &&
        new Set(aliveWolves.map((id) => targetByWolf.get(id))).size === 1;
      wolfConsensus = {
        wolfCount: aliveWolves.length,
        selectedCount,
        consensus,
        allSelected: selectedCount === aliveWolves.length,
      };
    }

    return NextResponse.json(
      {
        room: {
          ...mapRoom(room),
        },
        me: {
          id: me.id,
          name: me.name,
          alive: me.alive,
          role: me.role,
        },
        seerResults,
        witchStatus,
        witchVictim,
        wolfConsensus,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = (error as Error).message || 'UNKNOWN_ERROR';
    const status = message === 'ROOM_NOT_FOUND' || message === 'PLAYER_NOT_FOUND' ? 404 : message === 'UNAUTHORIZED' || message === 'INVALID_SESSION' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
