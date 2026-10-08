-- Private snapshots only. All game decisions remain in the TypeScript service.
do $migration$
declare
  s text;
  app_role text;
  public_role text;
begin
  foreach s in array array['werewolf_preview', 'werewolf_prod'] loop
    app_role := s || '_app';
    if not exists (select 1 from pg_roles where rolname = app_role) then
      execute format('create role %I nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls', app_role);
    end if;
    execute format('create schema if not exists %I', s);
    execute format('revoke all on schema %I from public', s);
    foreach public_role in array array['anon', 'authenticated', 'service_role', 'authenticator'] loop
      if exists (select 1 from pg_roles where rolname = public_role) then
        execute format('revoke all on schema %I from %I', s, public_role);
      end if;
    end loop;
    execute format('create table %I.rooms (
      id text primary key check (id ~ ''^[A-F0-9]{8}$''),
      version bigint not null check (version > 0), expires_at bigint not null,
      state jsonb not null check (jsonb_typeof(state) = ''object'' and state->>''schemaVersion'' = ''1''
        and state->>''id'' = id and (state->>''expiresAt'')::bigint = expires_at)
    )', s);
    execute format('create index rooms_expiry on %I.rooms(expires_at)', s);
    execute format('create table %I.receipts (
      key text primary key, room_id text not null references %I.rooms(id) on delete cascade,
      value jsonb not null check (jsonb_typeof(value) = ''object'' and value->''result''->>''roomId'' = room_id)
    )', s, s);
    execute format('create index receipts_room on %I.receipts(room_id)', s);
    execute format('create table %I.limits (
      key text primary key, reset_at bigint not null, count bigint not null check (count > 0)
    )', s);
    execute format('create index limits_expiry on %I.limits(reset_at)', s);
    execute format('grant usage on schema %I to %I', s, app_role);
    execute format('grant select, insert, update, delete on all tables in schema %I to %I', s, app_role);
    execute format('alter table %I.rooms enable row level security', s);
    execute format('alter table %I.receipts enable row level security', s);
    execute format('alter table %I.limits enable row level security', s);
    execute format('create policy backend_only on %I.rooms for all to %I using (true) with check (true)', s, app_role);
    execute format('create policy backend_only on %I.receipts for all to %I using (true) with check (true)', s, app_role);
    execute format('create policy backend_only on %I.limits for all to %I using (true) with check (true)', s, app_role);
    execute format('alter default privileges in schema %I revoke all on tables from public', s);
    execute format('alter default privileges in schema %I revoke execute on functions from public', s);
  end loop;
end;
$migration$;
