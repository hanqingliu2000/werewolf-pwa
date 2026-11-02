-- Widen summary constraints before deploying seven-player room support; leave rows and access policies intact.
do $migration$
declare
  s text;
begin
  foreach s in array array['werewolf_preview', 'werewolf_prod'] loop
    execute format('alter table %I.room_usage drop constraint room_usage_capacity_check,
      add constraint room_usage_capacity_check check (capacity between 7 and 12)', s);
    execute format('alter table %I.game_usage drop constraint game_usage_player_count_check,
      add constraint game_usage_player_count_check check (player_count between 7 and 12)', s);
  end loop;
end;
$migration$;
