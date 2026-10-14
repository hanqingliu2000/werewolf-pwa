-- Scalar usage summaries survive the 24-hour snapshot cleanup; no player/session/action data.
do $migration$
declare
  s text;
  app_role text;
begin
  foreach s in array array['werewolf_preview', 'werewolf_prod'] loop
    app_role := s || '_app';
    execute format('create table %I.room_usage (
      id uuid primary key, room_id text not null check (room_id ~ ''^[A-F0-9]{8}$''),
      room_name text not null check (char_length(room_name) <= 32), created_at bigint,
      first_seen_at bigint not null, player_count int not null check (player_count between 1 and 12),
      peak_players int not null check (peak_players between 1 and 12),
      capacity int not null check (capacity between 8 and 12), last_activity_at bigint not null,
      expires_at bigint not null, is_test boolean not null
    )', s);
    execute format('create index room_usage_created on %I.room_usage(created_at)', s);
    execute format('create index room_usage_activity on %I.room_usage(last_activity_at)', s);
    execute format('create table %I.game_usage (
      id text primary key check (char_length(id) between 1 and 64),
      room_usage_id uuid not null references %I.room_usage(id) on delete cascade,
      started_at bigint, ended_at bigint, first_seen_at bigint not null,
      player_count int not null check (player_count between 8 and 12),
      status text not null check (status in (''active'',''completed'',''aborted'',''expired''))
    )', s, s);
    execute format('create index game_usage_room on %I.game_usage(room_usage_id)', s);
    execute format('create index game_usage_started on %I.game_usage(started_at)', s);
    execute format('alter table %I.room_usage enable row level security', s);
    execute format('alter table %I.game_usage enable row level security', s);
    execute format('revoke all on %I.room_usage, %I.game_usage from public, anon, authenticated, service_role, authenticator', s, s);
    execute format('grant select, insert, update, delete on %I.room_usage, %I.game_usage to %I', s, s, app_role);
    execute format('create policy backend_only on %I.room_usage for all to %I using (true) with check (true)', s, app_role);
    execute format('create policy backend_only on %I.game_usage for all to %I using (true) with check (true)', s, app_role);

    -- Only surviving rooms can be recovered; unknown historical times remain NULL.
    execute format($backfill$
      insert into %1$I.room_usage
      select coalesce(state->'usage'->>'id', state->>'lobbyId')::uuid, id, '房间 ' || id,
        (state->'usage'->>'createdAt')::bigint, (extract(epoch from now())*1000)::bigint,
        jsonb_array_length(state->'members'), jsonb_array_length(state->'members'),
        (select sum(value::int) from jsonb_each_text(state->'config'->'roles')),
        expires_at - 86400000, expires_at,
        coalesce((state->'usage'->>'isTest')::boolean, state->'members'->0->>'name' like 'Cloud QA %%')
      from %1$I.rooms where expires_at > (extract(epoch from now())*1000)::bigint;
      insert into %1$I.game_usage
      select r.state->'game'->>'id', u.id, (r.state->'usage'->>'gameStartedAt')::bigint,
        case when r.state->'game'->>'phase' = 'end' then (r.state->'game'->>'updatedAt')::bigint else null end,
        (extract(epoch from now())*1000)::bigint, jsonb_array_length(r.state->'game'->'players'),
        case when r.state->'game'->>'phase' <> 'end' then 'active'
          when (r.state->'game'->>'aborted')::boolean then 'aborted' else 'completed' end
      from %1$I.rooms r join %1$I.room_usage u on u.id = coalesce(r.state->'usage'->>'id', r.state->>'lobbyId')::uuid
      where jsonb_typeof(r.state->'game') = 'object';
      insert into %1$I.game_usage
      select a->'game'->>'id', u.id, null, (a->'game'->>'updatedAt')::bigint,
        (extract(epoch from now())*1000)::bigint, jsonb_array_length(a->'game'->'players'),
        case when (a->'game'->>'aborted')::boolean then 'aborted' else 'completed' end
      from %1$I.rooms r join %1$I.room_usage u on u.id = coalesce(r.state->'usage'->>'id', r.state->>'lobbyId')::uuid,
        lateral jsonb_array_elements(r.state->'archives') a
      where jsonb_typeof(a->'game') = 'object' and (a->>'expiresAt')::bigint > (extract(epoch from now())*1000)::bigint
      on conflict(id) do nothing;
    $backfill$, s);

    perform cron.schedule(s || '_usage_retention', '17 * * * *', format($cleanup$
      update %1$I.game_usage set status = 'expired' where status = 'active' and room_usage_id in
        (select id from %1$I.room_usage where expires_at <= (extract(epoch from now())*1000)::bigint);
      delete from %1$I.game_usage where coalesce(ended_at, started_at, first_seen_at)
        <= (extract(epoch from now())*1000)::bigint - 31536000000;
      delete from %1$I.room_usage where greatest(last_activity_at, first_seen_at)
        <= (extract(epoch from now())*1000)::bigint - 31536000000;
    $cleanup$, s));
  end loop;
end;
$migration$;
