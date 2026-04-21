import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRoom } from '@/lib/store';
import { getSupabaseClient } from '@/lib/repo';

const schema = z.object({
  hostName: z.string().min(1),
  roomName: z.string().optional(),
  targetPlayers: z.number().int().min(4).max(18).optional(),
  rolePlan: z.record(z.string(), z.number().int().min(0)).optional(),
  ruleConfig: z.record(z.string(), z.any()).optional(),
});

const defaultRuleConfig = {
  winMode: 'A',
  guardCanRepeatProtect: false,
  witchSelfSave: 'first-night-only',
  witchCanSaveAndPoisonSameNight: false,
  witchSaveCount: 1,
  witchPoisonCount: 1,
  hunterCanShootWhenPoisoned: false,
  hunterCanShootWhenKilled: true,
};

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(req: Request) {
  try {
    const payload = schema.parse(await req.json());
    const sb = getSupabaseClient();
    if (!sb) {
      const result = createRoom({
        hostName: payload.hostName,
        roomName: payload.roomName,
        ruleConfig: {
          ...(payload.ruleConfig ?? {}),
          ...(payload.targetPlayers ? { targetPlayers: payload.targetPlayers } : {}),
          ...(payload.rolePlan ? { rolePlan: payload.rolePlan } : {}),
        },
      });
      return NextResponse.json(result, { status: 201 });
    }

    const id = makeRoomCode();
    const hostId = randomUUID();
    const sessionToken = randomUUID();
    const ruleConfig = {
      ...defaultRuleConfig,
      ...(payload.ruleConfig ?? {}),
      ...(payload.targetPlayers ? { targetPlayers: payload.targetPlayers } : {}),
      ...(payload.rolePlan ? { rolePlan: payload.rolePlan } : {}),
    };
    const { data, error } = await sb.rpc('create_room_with_host', {
      p_room_id: id,
      p_host_id: hostId,
      p_host_name: payload.hostName,
      p_room_name: payload.roomName ?? null,
      p_rule_config: ruleConfig,
      p_session_token: sessionToken,
    });
    if (error) throw new Error(error.message || 'SUPABASE_CREATE_ROOM_FAILED');

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'INVALID_PAYLOAD', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message || 'UNKNOWN_ERROR' }, { status: 400 });
  }
}
