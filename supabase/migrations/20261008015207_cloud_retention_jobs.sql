-- Cleanup is independent of requests. No game phase or role decisions run here.
create extension if not exists pg_cron with schema pg_catalog;

do $migration$
declare
  s text;
  job bigint;
  command text;
begin
  foreach s in array array['werewolf_preview', 'werewolf_prod'] loop
    command := format($cleanup$
      delete from %1$I.rooms where expires_at <= (extract(epoch from now()) * 1000)::bigint;
      delete from %1$I.limits where reset_at <= (extract(epoch from now()) * 1000)::bigint;
      update %1$I.rooms r set state = jsonb_set(state, '{archives}',
        coalesce((select jsonb_agg(a order by ordinal)
          from jsonb_array_elements(state->'archives') with ordinality as entries(a, ordinal)
          where (a->>'expiresAt')::bigint > (extract(epoch from now()) * 1000)::bigint), '[]'::jsonb)),
        version = version + 1
      where exists (select 1 from jsonb_array_elements(r.state->'archives') a
        where (a->>'expiresAt')::bigint <= (extract(epoch from now()) * 1000)::bigint);
    $cleanup$, s);
    for job in select jobid from cron.job where jobname = s || '_retention' loop
      perform cron.unschedule(job);
    end loop;
    perform cron.schedule(s || '_retention', '*/5 * * * *', command);
  end loop;
end;
$migration$;
