-- Add per-player bearer tokens for host/player API authorization.

alter table players
  add column if not exists session_token text;

update players
set session_token = gen_random_uuid()::text
where session_token is null;

alter table players
  alter column session_token set not null;

create unique index if not exists idx_players_session_token on players(session_token);
