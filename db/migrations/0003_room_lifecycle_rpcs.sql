-- Atomic room lifecycle helpers for Supabase-backed mode.

create or replace function public.api_room_json(p_room public.rooms)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_room.id,
    'hostId', p_room.host_id,
    'name', p_room.name,
    'status', p_room.status,
    'currentPhase', p_room.current_phase,
    'currentNightNo', p_room.current_night_no,
    'phaseVersion', p_room.phase_version,
    'ruleConfig', p_room.rule_config,
    'createdAt', p_room.created_at,
    'updatedAt', p_room.updated_at
  );
$$;

create or replace function public.api_player_json(
  p_player public.players,
  p_reveal_role boolean default false,
  p_reveal_session_token boolean default false
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_player.id,
    'roomId', p_player.room_id,
    'name', p_player.name,
    'role', case when p_reveal_role then p_player.role else null end,
    'alive', p_player.alive,
    'eliminatedAt', p_player.eliminated_at,
    'sessionToken', case when p_reveal_session_token then p_player.session_token else null end
  );
$$;

create or replace function public.create_room_with_host(
  p_room_id text,
  p_host_id uuid,
  p_host_name text,
  p_room_name text,
  p_rule_config jsonb,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_host public.players%rowtype;
  v_now timestamptz := now();
  v_host_name text := trim(p_host_name);
begin
  if v_host_name = '' then
    raise exception 'HOST_NAME_REQUIRED';
  end if;

  insert into public.rooms (
    id,
    host_id,
    name,
    status,
    current_phase,
    current_night_no,
    phase_version,
    rule_config,
    created_at,
    updated_at
  )
  values (
    upper(p_room_id),
    p_host_id,
    coalesce(nullif(trim(p_room_name), ''), v_host_name || ' 的房间'),
    'lobby',
    'LOBBY',
    0,
    1,
    p_rule_config,
    v_now,
    v_now
  )
  returning * into v_room;

  insert into public.players (
    id,
    room_id,
    name,
    role,
    alive,
    eliminated_at,
    session_token
  )
  values (
    p_host_id,
    v_room.id,
    v_host_name,
    null,
    true,
    null,
    p_session_token
  )
  returning * into v_host;

  return jsonb_build_object(
    'room', public.api_room_json(v_room),
    'hostPlayer', public.api_player_json(v_host, true, true)
  );
end;
$$;

create or replace function public.join_room_with_player(
  p_room_id text,
  p_player_id uuid,
  p_player_name text,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_now timestamptz := now();
  v_player_name text := trim(p_player_name);
begin
  if v_player_name = '' then
    raise exception 'PLAYER_NAME_REQUIRED';
  end if;

  select *
  into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'ROOM_ALREADY_STARTED';
  end if;

  if exists (
    select 1
    from public.players
    where room_id = v_room.id
      and lower(trim(name)) = lower(v_player_name)
  ) then
    raise exception 'PLAYER_NAME_TAKEN';
  end if;

  insert into public.players (
    id,
    room_id,
    name,
    role,
    alive,
    eliminated_at,
    session_token
  )
  values (
    p_player_id,
    v_room.id,
    v_player_name,
    null,
    true,
    null,
    p_session_token
  )
  returning * into v_player;

  update public.rooms
  set
    phase_version = phase_version + 1,
    updated_at = v_now
  where id = v_room.id
  returning * into v_room;

  return jsonb_build_object(
    'room', public.api_room_json(v_room),
    'player', public.api_player_json(v_player, true, true)
  );
end;
$$;

create or replace function public.start_room_with_roles(
  p_room_id text,
  p_host_player_id uuid,
  p_session_token text,
  p_role_queue text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_player_count int;
  v_target_players int;
  v_first_phase text;
  v_now timestamptz := now();
begin
  select *
  into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.host_id <> p_host_player_id then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_host_player_id
      and room_id = v_room.id
      and session_token = p_session_token
  ) then
    raise exception 'INVALID_SESSION';
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'PHASE_MISMATCH';
  end if;

  select count(*)
  into v_player_count
  from public.players
  where room_id = v_room.id;

  v_target_players := nullif(v_room.rule_config->>'targetPlayers', '')::int;
  if v_target_players is not null and v_player_count < v_target_players then
    raise exception 'PLAYERS_NOT_READY';
  end if;

  with ordered_players as (
    select
      id,
      row_number() over (order by name asc) as role_index
    from public.players
    where room_id = v_room.id
  )
  update public.players p
  set role = coalesce(p_role_queue[ordered_players.role_index::int], 'villager')
  from ordered_players
  where p.id = ordered_players.id;

  select case
    when exists (select 1 from public.players where room_id = v_room.id and alive and role = 'guard') then 'NIGHT_GUARD'
    when exists (select 1 from public.players where room_id = v_room.id and alive and role = 'werewolf') then 'NIGHT_WEREWOLF'
    when exists (select 1 from public.players where room_id = v_room.id and alive and role = 'seer') then 'NIGHT_SEER'
    when exists (select 1 from public.players where room_id = v_room.id and alive and role = 'witch') then 'NIGHT_WITCH'
    else 'NIGHT_RESOLVE'
  end into v_first_phase;

  update public.rooms
  set
    status = 'night',
    current_phase = v_first_phase,
    current_night_no = 1,
    phase_version = phase_version + 1,
    updated_at = v_now
  where id = v_room.id
  returning * into v_room;

  return jsonb_build_object('room', public.api_room_json(v_room));
end;
$$;

create or replace function public.next_active_night_phase(
  p_room_id text,
  p_current_phase text
)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_next text := p_current_phase;
begin
  loop
    v_next := case v_next
      when 'NIGHT_GUARD' then 'NIGHT_WEREWOLF'
      when 'NIGHT_WEREWOLF' then 'NIGHT_SEER'
      when 'NIGHT_SEER' then 'NIGHT_WITCH'
      when 'NIGHT_WITCH' then 'NIGHT_RESOLVE'
      else 'NIGHT_RESOLVE'
    end;

    if v_next = 'NIGHT_RESOLVE' then
      return v_next;
    end if;

    if v_next = 'NIGHT_WEREWOLF' and exists (select 1 from public.players where room_id = p_room_id and alive and role = 'werewolf') then
      return v_next;
    end if;
    if v_next = 'NIGHT_SEER' and exists (select 1 from public.players where room_id = p_room_id and alive and role = 'seer') then
      return v_next;
    end if;
    if v_next = 'NIGHT_WITCH' and exists (select 1 from public.players where room_id = p_room_id and alive and role = 'witch') then
      return v_next;
    end if;
  end loop;
end;
$$;

create or replace function public.first_active_night_phase(p_room_id text)
returns text
language sql
volatile
set search_path = public
as $$
  select case
    when exists (select 1 from public.players where room_id = p_room_id and alive and role = 'guard') then 'NIGHT_GUARD'
    when exists (select 1 from public.players where room_id = p_room_id and alive and role = 'werewolf') then 'NIGHT_WEREWOLF'
    when exists (select 1 from public.players where room_id = p_room_id and alive and role = 'seer') then 'NIGHT_SEER'
    when exists (select 1 from public.players where room_id = p_room_id and alive and role = 'witch') then 'NIGHT_WITCH'
    else 'NIGHT_RESOLVE'
  end;
$$;

create or replace function public.check_win_json(
  p_room_id text,
  p_rule_config jsonb
)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alive int := 0;
  v_wolves int := 0;
  v_good int := 0;
  v_alive_gods int := 0;
  v_alive_villagers int := 0;
begin
  select
    count(*)::int,
    count(*) filter (where role = 'werewolf')::int,
    count(*) filter (where role in ('seer', 'witch', 'guard', 'hunter'))::int,
    count(*) filter (where role = 'villager')::int
  into v_alive, v_wolves, v_alive_gods, v_alive_villagers
  from public.players
  where room_id = p_room_id
    and alive;

  v_good := v_alive - v_wolves;

  if v_wolves = 0 then
    return jsonb_build_object('ended', true, 'winner', 'good');
  end if;

  if p_rule_config->>'winMode' = 'B' then
    if v_alive_gods = 0 or v_alive_villagers = 0 then
      return jsonb_build_object('ended', true, 'winner', 'wolf');
    end if;
  elsif v_wolves >= v_good then
    return jsonb_build_object('ended', true, 'winner', 'wolf');
  end if;

  return jsonb_build_object('ended', false);
end;
$$;

create or replace function public.submit_night_action_tx(
  p_room_id text,
  p_actor_player_id uuid,
  p_session_token text,
  p_target_player_id uuid,
  p_action_type text,
  p_confirm boolean,
  p_action_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_actor public.players%rowtype;
  v_expected_action text;
  v_phase_allows boolean := false;
  v_role_allows boolean := false;
  v_now timestamptz := now();
  v_used_count int := 0;
  v_max_count int := 0;
  v_alive_wolves uuid[];
  v_selected_count int := 0;
  v_distinct_targets int := 0;
  v_should_advance boolean := false;
  v_next_phase text;
begin
  select *
  into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.status <> 'night' then
    raise exception 'PHASE_MISMATCH';
  end if;

  v_expected_action := case v_room.current_phase
    when 'NIGHT_GUARD' then 'guard'
    when 'NIGHT_WEREWOLF' then 'kill'
    when 'NIGHT_SEER' then 'see'
    when 'NIGHT_WITCH' then 'save'
    else null
  end;

  if v_expected_action is null then
    raise exception 'PHASE_MISMATCH';
  end if;

  v_phase_allows :=
    (v_room.current_phase = 'NIGHT_WITCH' and p_action_type in ('save', 'poison', 'pass')) or
    (v_room.current_phase = 'NIGHT_WEREWOLF' and p_action_type = 'kill') or
    p_action_type = v_expected_action;

  if not v_phase_allows then
    raise exception 'PHASE_MISMATCH';
  end if;

  select *
  into v_actor
  from public.players
  where id = p_actor_player_id
    and room_id = v_room.id;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_session_token is null or v_actor.session_token is distinct from p_session_token then
    raise exception 'INVALID_SESSION';
  end if;

  if not v_actor.alive then
    raise exception 'ALREADY_ELIMINATED';
  end if;

  v_role_allows := case v_actor.role
    when 'guard' then p_action_type = 'guard'
    when 'werewolf' then p_action_type = 'kill'
    when 'seer' then p_action_type = 'see'
    when 'witch' then p_action_type in ('save', 'poison', 'pass')
    else false
  end;

  if not v_role_allows then
    raise exception 'FORBIDDEN';
  end if;

  if p_action_type <> 'pass' then
    if p_target_player_id is null then
      raise exception 'TARGET_REQUIRED';
    end if;

    if not exists (
      select 1
      from public.players
      where id = p_target_player_id
        and room_id = v_room.id
    ) then
      raise exception 'PLAYER_NOT_FOUND';
    end if;
  end if;

  if v_room.current_phase = 'NIGHT_WITCH' and p_action_type in ('save', 'poison') then
    select count(*)
    into v_used_count
    from public.night_actions
    where room_id = v_room.id
      and actor_player_id = p_actor_player_id
      and action_type = p_action_type
      and is_final
      and night_no <> v_room.current_night_no;

    v_max_count := case p_action_type
      when 'save' then coalesce(nullif(v_room.rule_config->>'witchSaveCount', '')::int, 1)
      when 'poison' then coalesce(nullif(v_room.rule_config->>'witchPoisonCount', '')::int, 1)
      else 1
    end;

    if p_action_type = 'save' and v_used_count >= v_max_count then
      raise exception 'WITCH_SAVE_EXHAUSTED';
    end if;
    if p_action_type = 'poison' and v_used_count >= v_max_count then
      raise exception 'WITCH_POISON_EXHAUSTED';
    end if;
  end if;

  if p_action_type <> 'pass' then
    insert into public.night_actions (
      id,
      room_id,
      night_no,
      actor_role,
      actor_player_id,
      target_player_id,
      action_type,
      is_final,
      created_at,
      updated_at
    )
    values (
      p_action_id,
      v_room.id,
      v_room.current_night_no,
      v_actor.role,
      p_actor_player_id,
      p_target_player_id,
      p_action_type,
      true,
      v_now,
      v_now
    )
    on conflict (room_id, night_no, actor_player_id, action_type)
    do update set
      target_player_id = excluded.target_player_id,
      updated_at = excluded.updated_at;
  end if;

  if v_room.current_phase in ('NIGHT_GUARD', 'NIGHT_SEER') then
    v_should_advance := true;
  elsif v_room.current_phase = 'NIGHT_WEREWOLF' then
    select coalesce(array_agg(id), array[]::uuid[])
    into v_alive_wolves
    from public.players
    where room_id = v_room.id
      and alive
      and role = 'werewolf';

    select count(distinct actor_player_id), count(distinct target_player_id)
    into v_selected_count, v_distinct_targets
    from public.night_actions
    where room_id = v_room.id
      and night_no = v_room.current_night_no
      and action_type = 'kill'
      and is_final
      and actor_player_id = any(v_alive_wolves);

    if p_confirm then
      if v_selected_count <> coalesce(array_length(v_alive_wolves, 1), 0) or v_distinct_targets <> 1 then
        raise exception 'WOLF_CONSENSUS_REQUIRED';
      end if;
      v_should_advance := true;
    end if;
  elsif v_room.current_phase = 'NIGHT_WITCH' then
    if p_action_type = 'pass' then
      v_should_advance := true;
    elsif not coalesce((v_room.rule_config->>'witchCanSaveAndPoisonSameNight')::boolean, false) then
      v_should_advance := true;
    else
      if (
        select count(distinct action_type)
        from public.night_actions
        where room_id = v_room.id
          and night_no = v_room.current_night_no
          and actor_player_id = p_actor_player_id
          and action_type in ('save', 'poison')
          and is_final
      ) = 2 then
        v_should_advance := true;
      end if;
    end if;
  end if;

  v_next_phase := case
    when v_should_advance then public.next_active_night_phase(v_room.id, v_room.current_phase)
    else v_room.current_phase
  end;

  update public.rooms
  set
    current_phase = v_next_phase,
    phase_version = phase_version + 1,
    updated_at = v_now
  where id = v_room.id
  returning * into v_room;

  return jsonb_build_object(
    'room', public.api_room_json(v_room),
    'acceptedAction', p_action_type
  );
end;
$$;

create or replace function public.resolve_night_tx(
  p_room_id text,
  p_host_player_id uuid,
  p_session_token text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_host public.players%rowtype;
  v_hunter public.players%rowtype;
  v_now timestamptz := now();
  v_kill_target uuid;
  v_guard_target uuid;
  v_save_target uuid;
  v_poison_target uuid;
  v_death_ids uuid[] := array[]::uuid[];
  v_wolf_death_ids uuid[] := array[]::uuid[];
  v_poison_death_ids uuid[] := array[]::uuid[];
  v_hunter_can_shoot boolean := false;
  v_next_phase text;
  v_next_status text;
  v_deaths jsonb := '[]'::jsonb;
begin
  select *
  into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.host_id <> p_host_player_id then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into v_host
  from public.players
  where id = p_host_player_id
    and room_id = v_room.id;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_session_token is null or v_host.session_token is distinct from p_session_token then
    raise exception 'INVALID_SESSION';
  end if;

  if v_room.current_phase <> 'NIGHT_RESOLVE' then
    raise exception 'PHASE_MISMATCH';
  end if;

  select target_player_id
  into v_kill_target
  from public.night_actions
  where room_id = v_room.id
    and night_no = v_room.current_night_no
    and action_type = 'kill'
    and is_final
  limit 1;

  select target_player_id
  into v_guard_target
  from public.night_actions
  where room_id = v_room.id
    and night_no = v_room.current_night_no
    and action_type = 'guard'
    and is_final
  limit 1;

  select target_player_id
  into v_save_target
  from public.night_actions
  where room_id = v_room.id
    and night_no = v_room.current_night_no
    and action_type = 'save'
    and is_final
  limit 1;

  select target_player_id
  into v_poison_target
  from public.night_actions
  where room_id = v_room.id
    and night_no = v_room.current_night_no
    and action_type = 'poison'
    and is_final
  limit 1;

  if v_kill_target is not null
    and v_kill_target is distinct from v_guard_target
    and v_kill_target is distinct from v_save_target then
    v_death_ids := array_append(v_death_ids, v_kill_target);
    v_wolf_death_ids := array_append(v_wolf_death_ids, v_kill_target);
  end if;

  if v_poison_target is not null then
    if not (v_poison_target = any(v_death_ids)) then
      v_death_ids := array_append(v_death_ids, v_poison_target);
    end if;
    v_poison_death_ids := array_append(v_poison_death_ids, v_poison_target);
  end if;

  update public.players
  set
    alive = false,
    eliminated_at = v_now
  where room_id = v_room.id
    and id = any(v_death_ids)
    and alive;

  select *
  into v_hunter
  from public.players
  where room_id = v_room.id
    and role = 'hunter'
  limit 1;

  if found and v_hunter.id = any(v_death_ids) then
    v_hunter_can_shoot :=
      (
        v_hunter.id = any(v_wolf_death_ids)
        and coalesce((v_room.rule_config->>'hunterCanShootWhenKilled')::boolean, true)
      ) or (
        v_hunter.id = any(v_poison_death_ids)
        and coalesce((v_room.rule_config->>'hunterCanShootWhenPoisoned')::boolean, false)
      );
  end if;

  v_next_phase := case when v_hunter_can_shoot then 'DEATH_REACTION_HUNTER' else 'DAY_ANNOUNCE' end;
  v_next_status := case when v_hunter_can_shoot then 'night' else 'day' end;

  update public.rooms
  set
    current_phase = v_next_phase,
    status = v_next_status,
    phase_version = phase_version + 1,
    updated_at = v_now
  where id = v_room.id
  returning * into v_room;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'name', name) order by array_position(v_death_ids, id)),
    '[]'::jsonb
  )
  into v_deaths
  from public.players
  where room_id = v_room.id
    and id = any(v_death_ids);

  insert into public.events (
    id,
    room_id,
    type,
    payload,
    created_at
  )
  values (
    p_event_id,
    v_room.id,
    'night_resolve',
    jsonb_build_object('nightNo', v_room.current_night_no, 'deaths', v_deaths),
    v_now
  );

  return jsonb_build_object(
    'room', public.api_room_json(v_room),
    'deaths', v_deaths
  );
end;
$$;

create or replace function public.submit_day_vote_tx(
  p_room_id text,
  p_host_player_id uuid,
  p_session_token text,
  p_eliminated_player_id uuid,
  p_vote_event_id uuid,
  p_game_end_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_host public.players%rowtype;
  v_target public.players%rowtype;
  v_now timestamptz := now();
  v_result jsonb;
  v_winner text;
begin
  select *
  into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.host_id <> p_host_player_id then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into v_host
  from public.players
  where id = p_host_player_id
    and room_id = v_room.id;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_session_token is null or v_host.session_token is distinct from p_session_token then
    raise exception 'INVALID_SESSION';
  end if;

  if v_room.status <> 'day' or v_room.current_phase <> 'DAY_INPUT' then
    raise exception 'PHASE_MISMATCH';
  end if;

  if p_eliminated_player_id is not null then
    select *
    into v_target
    from public.players
    where id = p_eliminated_player_id
      and room_id = v_room.id
    for update;

    if not found then
      raise exception 'PLAYER_NOT_FOUND';
    end if;

    if not v_target.alive then
      raise exception 'ALREADY_ELIMINATED';
    end if;

    update public.players
    set
      alive = false,
      eliminated_at = v_now
    where id = v_target.id;
  end if;

  insert into public.events (
    id,
    room_id,
    type,
    payload,
    created_at
  )
  values (
    p_vote_event_id,
    v_room.id,
    'day_vote',
    jsonb_build_object('nightNo', v_room.current_night_no, 'eliminatedPlayerId', p_eliminated_player_id),
    v_now
  );

  v_result := public.check_win_json(v_room.id, v_room.rule_config);

  if (v_result->>'ended')::boolean then
    v_winner := v_result->>'winner';

    update public.rooms
    set
      status = 'end',
      current_phase = 'END',
      phase_version = phase_version + 1,
      updated_at = v_now
    where id = v_room.id
    returning * into v_room;

    insert into public.events (
      id,
      room_id,
      type,
      payload,
      created_at
    )
    values (
      p_game_end_event_id,
      v_room.id,
      'game_end',
      jsonb_build_object('winner', v_winner),
      v_now
    );
  else
    update public.rooms
    set
      status = 'night',
      current_phase = public.first_active_night_phase(v_room.id),
      current_night_no = current_night_no + 1,
      phase_version = phase_version + 1,
      updated_at = v_now
    where id = v_room.id
    returning * into v_room;
  end if;

  return jsonb_build_object(
    'room', public.api_room_json(v_room),
    'winner', v_winner
  );
end;
$$;

create or replace function public.submit_hunter_shot_tx(
  p_room_id text,
  p_hunter_player_id uuid,
  p_session_token text,
  p_target_player_id uuid,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_hunter public.players%rowtype;
  v_target public.players%rowtype;
  v_now timestamptz := now();
begin
  select *
  into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.current_phase <> 'DEATH_REACTION_HUNTER' then
    raise exception 'PHASE_MISMATCH';
  end if;

  select *
  into v_hunter
  from public.players
  where id = p_hunter_player_id
    and room_id = v_room.id
  for update;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_session_token is null or v_hunter.session_token is distinct from p_session_token then
    raise exception 'INVALID_SESSION';
  end if;

  if v_hunter.role <> 'hunter' then
    raise exception 'FORBIDDEN';
  end if;

  if v_hunter.alive then
    raise exception 'PHASE_MISMATCH';
  end if;

  select *
  into v_target
  from public.players
  where id = p_target_player_id
    and room_id = v_room.id
  for update;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if not v_target.alive then
    raise exception 'ALREADY_ELIMINATED';
  end if;

  update public.players
  set
    alive = false,
    eliminated_at = v_now
  where id = v_target.id;

  update public.rooms
  set
    current_phase = 'DAY_ANNOUNCE',
    status = 'day',
    phase_version = phase_version + 1,
    updated_at = v_now
  where id = v_room.id
  returning * into v_room;

  insert into public.events (
    id,
    room_id,
    type,
    payload,
    created_at
  )
  values (
    p_event_id,
    v_room.id,
    'hunter_shot',
    jsonb_build_object('hunterPlayerId', v_hunter.id, 'targetPlayerId', v_target.id),
    v_now
  );

  return jsonb_build_object('room', public.api_room_json(v_room));
end;
$$;

create or replace function public.restart_room_tx(
  p_room_id text,
  p_host_player_id uuid,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_host public.players%rowtype;
  v_now timestamptz := now();
begin
  select *
  into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.host_id <> p_host_player_id then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into v_host
  from public.players
  where id = p_host_player_id
    and room_id = v_room.id;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_session_token is null or v_host.session_token is distinct from p_session_token then
    raise exception 'INVALID_SESSION';
  end if;

  if v_room.status <> 'end' or v_room.current_phase <> 'END' then
    raise exception 'PHASE_MISMATCH';
  end if;

  update public.players
  set
    alive = true,
    role = null,
    eliminated_at = null
  where room_id = v_room.id;

  delete from public.night_actions
  where room_id = v_room.id;

  delete from public.events
  where room_id = v_room.id;

  update public.rooms
  set
    status = 'lobby',
    current_phase = 'LOBBY',
    current_night_no = 0,
    phase_version = phase_version + 1,
    updated_at = v_now
  where id = v_room.id
  returning * into v_room;

  return jsonb_build_object('room', public.api_room_json(v_room));
end;
$$;

create or replace function public.advance_day_announce_tx(
  p_room_id text,
  p_host_player_id uuid,
  p_session_token text,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_host public.players%rowtype;
  v_now timestamptz := now();
begin
  select *
  into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if v_room.host_id <> p_host_player_id then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into v_host
  from public.players
  where id = p_host_player_id
    and room_id = v_room.id;

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  if p_session_token is null or v_host.session_token is distinct from p_session_token then
    raise exception 'INVALID_SESSION';
  end if;

  if v_room.current_phase <> 'DAY_ANNOUNCE' then
    raise exception 'PHASE_MISMATCH';
  end if;

  update public.rooms
  set
    current_phase = 'DAY_INPUT',
    status = 'day',
    phase_version = phase_version + 1,
    updated_at = v_now
  where id = v_room.id
  returning * into v_room;

  insert into public.events (
    id,
    room_id,
    type,
    payload,
    created_at
  )
  values (
    p_event_id,
    v_room.id,
    'phase_advance',
    jsonb_build_object('to', 'DAY_INPUT', 'nightNo', v_room.current_night_no),
    v_now
  );

  return jsonb_build_object('room', public.api_room_json(v_room));
end;
$$;
