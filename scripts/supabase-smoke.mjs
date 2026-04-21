import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const args = new Set(process.argv.slice(2));

if (!url || !key) {
  const message = 'Missing env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY';
  if (args.has('--skip-missing-env')) {
    console.log(`[SKIP] ${message}`);
    process.exit(0);
  }
  console.error(message);
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

const ruleConfig = {
  winMode: 'A',
  guardCanRepeatProtect: false,
  witchSelfSave: 'first-night-only',
  witchCanSaveAndPoisonSameNight: false,
  witchSaveCount: 1,
  witchPoisonCount: 1,
  hunterCanShootWhenPoisoned: false,
  hunterCanShootWhenKilled: true,
  targetPlayers: 5,
  rolePlan: { guard: 1, werewolf: 1, seer: 1, witch: 1, hunter: 1 },
};

function roomCode() {
  return `SMK${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(`[FAIL] ${name}: ${error.message}`);
  console.log(`[OK] rpc ${name}`);
  return data;
}

async function checkTables() {
  const checks = ['rooms', 'players', 'night_actions', 'events'];
  for (const table of checks) {
    const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`[FAIL] ${table}: ${error.message}`);
    console.log(`[OK] table ${table}`);
  }
}

async function cleanup(roomId) {
  if (!roomId) return;
  const { error } = await supabase.from('rooms').delete().eq('id', roomId);
  if (error) console.warn(`[WARN] cleanup ${roomId}: ${error.message}`);
}

async function checkRpcFlow() {
  const roomId = roomCode();
  const hostId = randomUUID();
  const hostToken = randomUUID();
  const p2 = { id: randomUUID(), token: randomUUID() };
  const p3 = { id: randomUUID(), token: randomUUID() };
  const p4 = { id: randomUUID(), token: randomUUID() };
  const p5 = { id: randomUUID(), token: randomUUID() };

  try {
    await rpc('create_room_with_host', {
      p_room_id: roomId,
      p_host_id: hostId,
      p_host_name: 'Smoke Host',
      p_room_name: 'Smoke RPC Room',
      p_rule_config: ruleConfig,
      p_session_token: hostToken,
    });

    for (const [name, player] of [
      ['Smoke P2', p2],
      ['Smoke P3', p3],
      ['Smoke P4', p4],
      ['Smoke P5', p5],
    ]) {
      await rpc('join_room_with_player', {
        p_room_id: roomId,
        p_player_id: player.id,
        p_player_name: name,
        p_session_token: player.token,
      });
    }

    await rpc('start_room_with_roles', {
      p_room_id: roomId,
      p_host_player_id: hostId,
      p_session_token: hostToken,
      p_role_queue: ['guard', 'werewolf', 'seer', 'witch', 'hunter'],
    });

    await rpc('submit_night_action_tx', {
      p_room_id: roomId,
      p_actor_player_id: hostId,
      p_session_token: hostToken,
      p_target_player_id: hostId,
      p_action_type: 'guard',
      p_confirm: false,
      p_action_id: randomUUID(),
    });

    await rpc('submit_night_action_tx', {
      p_room_id: roomId,
      p_actor_player_id: p2.id,
      p_session_token: p2.token,
      p_target_player_id: p3.id,
      p_action_type: 'kill',
      p_confirm: true,
      p_action_id: randomUUID(),
    });

    await rpc('submit_night_action_tx', {
      p_room_id: roomId,
      p_actor_player_id: p3.id,
      p_session_token: p3.token,
      p_target_player_id: p2.id,
      p_action_type: 'see',
      p_confirm: false,
      p_action_id: randomUUID(),
    });

    await rpc('submit_night_action_tx', {
      p_room_id: roomId,
      p_actor_player_id: p4.id,
      p_session_token: p4.token,
      p_target_player_id: p3.id,
      p_action_type: 'save',
      p_confirm: false,
      p_action_id: randomUUID(),
    });

    await rpc('resolve_night_tx', {
      p_room_id: roomId,
      p_host_player_id: hostId,
      p_session_token: hostToken,
      p_event_id: randomUUID(),
    });

    await rpc('advance_day_announce_tx', {
      p_room_id: roomId,
      p_host_player_id: hostId,
      p_session_token: hostToken,
      p_event_id: randomUUID(),
    });

    await rpc('submit_day_vote_tx', {
      p_room_id: roomId,
      p_host_player_id: hostId,
      p_session_token: hostToken,
      p_eliminated_player_id: p2.id,
      p_vote_event_id: randomUUID(),
      p_game_end_event_id: randomUUID(),
    });

    console.log(`[OK] rpc flow room ${roomId}`);
  } finally {
    await cleanup(roomId);
  }
}

async function main() {
  await checkTables();
  if (args.has('--rpc-flow')) await checkRpcFlow();
  console.log('Supabase smoke check passed.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(3);
});
