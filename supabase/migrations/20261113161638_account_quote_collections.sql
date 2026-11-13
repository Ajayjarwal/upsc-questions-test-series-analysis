begin;

create table public.quote_collections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quotes jsonb not null,
  updated_at timestamptz not null default now(),
  constraint quote_collection_is_array check (jsonb_typeof(quotes) = 'array'),
  constraint quote_collection_count check (jsonb_array_length(quotes) between 1 and 500)
);

alter table public.quote_collections enable row level security;
revoke all on public.quote_collections from anon, public;
grant select, insert, update on public.quote_collections to authenticated;

create policy "Read own quote collection"
  on public.quote_collections for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Insert own quote collection"
  on public.quote_collections for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Update own quote collection"
  on public.quote_collections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;
