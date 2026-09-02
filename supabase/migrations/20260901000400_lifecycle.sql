-- ===========================================================================
-- Longsanam — session lifecycle sweeps
--
-- Two ends that were previously left dangling:
--   1. A booked session never left `booked`, so nothing was ever `completed`.
--   2. A session whose start time passed without a court left the players'
--      money sitting in a session that can no longer happen.
-- ===========================================================================

create or replace function public.complete_finished_sessions()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    select id from public.sessions
    where status = 'booked' and ends_at <= now()
    for update skip locked
  loop
    update public.sessions set status = 'completed' where id = v_row.id;

    perform public.app_log(null, 'session', v_row.id, v_row.id,
      'session.completed', 'booked', 'completed', '{}'::jsonb);

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('completedSessions', v_count);
end;
$$;

comment on function public.complete_finished_sessions is
  'Moves booked sessions past their end time to completed. Safe to run repeatedly.';

/**
 * Sessions that can no longer happen: the start time has passed and no court
 * was ever confirmed. Returned rather than cancelled here, because refunding
 * the players requires the payment provider, which lives in the application.
 */
create or replace function public.list_stranded_sessions()
returns table (id uuid, status public.session_status, paid_participants bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.status,
    count(sp.id) filter (where sp.status = 'paid_confirmed') as paid_participants
  from public.sessions s
  left join public.session_participants sp on sp.session_id = s.id
  where s.starts_at <= now()
    and s.status in ('draft', 'open', 'ready_to_book', 'holding_court', 'booking_failed')
  group by s.id, s.status;
$$;

do $$
begin
  execute 'revoke all on function public.complete_finished_sessions() from public, anon, authenticated';
  execute 'revoke all on function public.list_stranded_sessions() from public, anon, authenticated';
  execute 'grant execute on function public.complete_finished_sessions() to service_role, postgres';
  execute 'grant execute on function public.list_stranded_sessions() to service_role, postgres';
end;
$$;
