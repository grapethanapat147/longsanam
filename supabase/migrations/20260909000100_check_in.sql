-- Check-in at the venue (LSN-0020).
--
-- The organizer marks attendance. Not GPS: they already know who came, the page
-- is already open on their phone, and a tap per name raises no question of
-- spoofing.
--
-- Attendance exists here for one purpose — it is the evidence LSN-0019's credit
-- system was missing. A pay-later player who came and owes money now has a
-- different record from one who never showed, and the reminder can say so.

alter table public.session_participants
  add column if not exists checked_in_at     timestamptz,
  add column if not exists no_show_marked_at timestamptz;

comment on column public.session_participants.no_show_marked_at is
  'Idempotency guard for mark_no_shows() under the five-minute sweep.';

create index if not exists session_participants_no_show_idx
  on public.session_participants (session_id, no_show_marked_at)
  where status in ('joined_pay_later', 'payment_overdue');

-- ---------------------------------------------------------------------------
-- The organizer's tap
-- ---------------------------------------------------------------------------

create or replace function public.set_check_in(
  p_participant_id uuid,
  p_present        boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.session_participants%rowtype;
  v_session public.sessions%rowtype;
begin
  select * into v_p from public.session_participants where id = p_participant_id for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_session from public.sessions where id = v_p.session_id;

  if not public.is_session_organizer(v_session.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  -- The window mirrors checkInWindow() in src/lib/domain/credit.ts. Duplicated
  -- deliberately, like the pay-later threshold: the TS copy decides what the UI
  -- offers, this copy is the boundary a forged request still hits.
  if now() < v_session.starts_at - interval '30 minutes'
     or now() >= v_session.ends_at + interval '2 hours' then
    return jsonb_build_object('ok', false, 'reason', 'outside_check_in_window');
  end if;

  -- Who marked them present is already in audit_logs, with the actor id; a
  -- checked_in_by column would be a second copy of the same fact.
  update public.session_participants
  set checked_in_at = case when p_present then now() else null end
  where id = p_participant_id;

  perform public.app_log(auth.uid(), 'session_participant', p_participant_id, v_p.session_id,
    case when p_present then 'participant.checked_in' else 'participant.check_in_cleared' end,
    v_p.status::text, v_p.status::text,
    jsonb_build_object('present', p_present));

  return jsonb_build_object('ok', true, 'present', p_present);
end;
$$;

-- ---------------------------------------------------------------------------
-- Marking no-shows.
--
-- Two guards against charging someone for a session that is being cancelled in
-- the same sweep: this function skips cancelled and booking_failed sessions,
-- and its caller runs after the stranded-session loop rather than inside the
-- Promise.all. LSN-0019 shipped a bug of exactly this shape — the sweep
-- refunding paid players while billing the unpaid one — and one guard is not
-- enough for a race that produces a wrong charge against a real person.
-- ---------------------------------------------------------------------------

create or replace function public.mark_no_shows()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   record;
  v_count integer := 0;
  v_new   integer;
begin
  for v_row in
    select sp.id, sp.user_id, sp.session_id, sp.status
    from public.session_participants sp
    join public.sessions s on s.id = sp.session_id
    where sp.status in ('joined_pay_later', 'payment_overdue')
      and sp.checked_in_at is null
      and sp.no_show_marked_at is null
      and sp.user_id is not null
      -- An allowlist, not a denylist. A no-show only means something for a
      -- session that actually happened; `booked` and `completed` are the only
      -- two statuses that say it did. Filtering out cancelled and
      -- booking_failed instead would let `open`, `ready_to_book`,
      -- `holding_court` and `draft` through — every one of them a session that
      -- never secured a court — and charge its players for not attending it.
      -- The stranded-session loop normally cancels those first, but it
      -- `continue`s when cancel_session fails, and a guard that depends on
      -- another step having run is the shape of bug this ticket already has
      -- two other defences against.
      and s.status in ('booked', 'completed')
      and s.ends_at + interval '2 hours' <= now()
    for update of sp skip locked
  loop
    update public.session_participants
    set no_show_marked_at = now()
    where id = v_row.id;

    insert into public.player_credit (user_id, score) values (v_row.user_id, 100)
    on conflict (user_id) do nothing;

    update public.player_credit
    set score = greatest(0, least(100, score - 10))
    where user_id = v_row.user_id
    returning score into v_new;

    insert into public.credit_events (user_id, session_id, delta, reason)
    values (v_row.user_id, v_row.session_id, -10, 'no_show_unpaid');

    perform public.app_log(null, 'player_credit', v_row.user_id, v_row.session_id,
      'credit.no_show', null, v_new::text, jsonb_build_object('delta', -10));

    perform public.notify_user(v_row.user_id, v_row.session_id, 'no_show',
      'ไม่ได้เช็คอินและยังค้างชำระ',
      'ก๊วนจบแล้วแต่ไม่มีการเช็คอินและยังไม่ได้ชำระ เครดิตของคุณลดลง 10 คะแนน', null);

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('noShows', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- The chase listing gains the check-in time, so a reminder can say "you were
-- there" instead of only asserting a debt.
--
-- Dropped rather than replaced: `create or replace` cannot change the row type
-- a TABLE-returning function declares, and adding a column does exactly that
-- (SQLSTATE 42P13). The drop takes the grants with it, so they are reissued at
-- the foot of this file alongside the new functions' — a listing the sweep
-- cannot execute is a sweep that stops chasing anybody.
-- ---------------------------------------------------------------------------

drop function if exists public.list_chaseable_participants();

create function public.list_chaseable_participants()
returns table (
  participant_id uuid,
  user_id        uuid,
  session_id     uuid,
  session_title  text,
  amount_due_thb integer,
  ends_at        timestamptz,
  last_chased_at timestamptz,
  status         public.participant_status,
  line_user_id   text,
  checked_in_at  timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select sp.id, sp.user_id, sp.session_id, s.title, sp.amount_due_thb,
         s.ends_at, sp.last_chased_at, sp.status, pc.line_user_id, sp.checked_in_at
  from public.session_participants sp
  join public.sessions s on s.id = sp.session_id
  left join public.profile_contacts pc on pc.user_id = sp.user_id
  where sp.status in ('joined_pay_later', 'payment_overdue')
    and s.ends_at + interval '2 hours' <= now()
    and s.ends_at + interval '14 days' > now();
$$;

-- ---------------------------------------------------------------------------
-- Execution rights. The organizer's tap is reachable by signed-in users and
-- checks the caller itself; the sweep function is service_role only.
-- ---------------------------------------------------------------------------

revoke execute on function public.set_check_in(uuid, boolean) from public;
grant execute on function public.set_check_in(uuid, boolean) to authenticated;

revoke execute on function public.mark_no_shows() from public, authenticated;
grant execute on function public.mark_no_shows() to service_role;

revoke execute on function public.list_chaseable_participants() from public, authenticated;
grant execute on function public.list_chaseable_participants() to service_role;
