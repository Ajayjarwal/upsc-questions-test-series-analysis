begin;

create table public.test_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  completed_at timestamptz not null,
  result jsonb not null,
  primary key (user_id, id),
  constraint test_session_shape check (
    jsonb_typeof(result) = 'object'
    and result ?& array['id','date','total','space','mode','correct','incorrect','skipped','marks','maxMarks']
    and result->>'id' = id
    and result->>'total' in ('50', '100')
    and result->>'space' in ('static', 'ca', 'cse', 'csat', 'capf')
    and result->>'mode' in ('practice', 'exam')
  ),
  constraint test_session_counts check (
    (result->>'correct')::integer >= 0
    and (result->>'incorrect')::integer >= 0
    and (result->>'skipped')::integer >= 0
    and (result->>'correct')::integer + (result->>'incorrect')::integer + (result->>'skipped')::integer = (result->>'total')::integer
    and (result->>'marks')::numeric = (result->>'correct')::integer * 2 - (result->>'incorrect')::integer * 0.66
    and (result->>'maxMarks')::integer = (result->>'total')::integer * 2
  )
);

create index test_sessions_user_completed_idx on public.test_sessions (user_id, completed_at, id);
alter table public.test_sessions enable row level security;
revoke all on public.test_sessions from anon, public, authenticated;
grant select, insert on public.test_sessions to authenticated;

create policy "Read own completed tests"
  on public.test_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Insert own completed tests"
  on public.test_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

comment on table public.test_sessions is 'Immutable completed 50/100-question test snapshots; separate from question progress.';
commit;
