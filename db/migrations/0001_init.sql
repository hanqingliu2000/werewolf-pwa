-- Werewolf Host PWA - initial schema

create table if not exists rooms (
  id text primary key,
  host_id uuid not null,
  name text not null,
  status text not null,
  current_phase text not null,
  current_night_no int not null default 0,
  phase_version int not null default 1,
  rule_config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key,
  room_id text not null references rooms(id) on delete cascade,
  name text not null,
  role text,
  alive boolean not null default true,
  eliminated_at timestamptz,
  session_token text not null
);

create table if not exists night_actions (
  id uuid primary key,
  room_id text not null references rooms(id) on delete cascade,
  night_no int not null,
  actor_role text not null,
  actor_player_id uuid not null references players(id) on delete cascade,
  target_player_id uuid not null references players(id) on delete cascade,
  action_type text not null,
  is_final boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, night_no, actor_player_id, action_type)
);

create table if not exists events (
  id uuid primary key,
  room_id text not null references rooms(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_players_room on players(room_id);
create unique index if not exists idx_players_session_token on players(session_token);
create index if not exists idx_actions_room_night on night_actions(room_id, night_no);
create index if not exists idx_events_room_created on events(room_id, created_at desc);
