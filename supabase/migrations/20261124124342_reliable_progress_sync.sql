begin;

create table public.progress_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  pack_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id,id)
);
create index progress_receipts_user_pack_idx on public.progress_receipts(user_id,pack_id);
alter table public.progress_receipts enable row level security;
revoke all on public.progress_receipts from public,anon,authenticated;
grant select,insert on public.progress_receipts to authenticated;
create policy "Read own progress receipts" on public.progress_receipts for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own progress receipts" on public.progress_receipts for insert to authenticated with check ((select auth.uid())=user_id);

create function public.merge_question_progress(p_current jsonb,p_before jsonb,p_after jsonb,p_replace boolean default false)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare
  c jsonb:=coalesce(p_current,'{}'::jsonb); b jsonb:=coalesce(p_before,'{}'::jsonb); a jsonb:=coalesce(p_after,'{}'::jsonb);
  k text; newer boolean; counters text[]:=array['a','c','w','sk','cw','ts','tn'];
  answer_fields text[]:=array['l','x','m','bx','dd','cd','tm','sl','cf','rn','t'];
  repeated jsonb; extra jsonb; n numeric;
begin
  if p_replace then return p_after; end if;
  if p_after is null then if c=b then return null; else return c; end if; end if;
  newer:=coalesce((a->>'t')::numeric,0)>=coalesce((c->>'t')::numeric,0);
  for k in select jsonb_object_keys(b||a) loop
    if k in ('__proto__','constructor','prototype','first','repeat') or b->k is not distinct from a->k then continue; end if;
    if k=any(counters) then
      n:=greatest(0,coalesce((c->>k)::numeric,0)+coalesce((a->>k)::numeric,0)-coalesce((b->>k)::numeric,0));
      c:=jsonb_set(c,array[k],to_jsonb(n));
    elsif not k=any(answer_fields) or newer then
      if a ? k then c:=jsonb_set(c,array[k],a->k); else c:=c-k; end if;
    end if;
  end loop;
  repeated:=jsonb_build_object('a',coalesce((c->'repeat'->>'a')::numeric,0),'c',coalesce((c->'repeat'->>'c')::numeric,0),'sk',coalesce((c->'repeat'->>'sk')::numeric,0));
  foreach k in array array['a','c','sk'] loop
    n:=greatest(0,(repeated->>k)::numeric+coalesce((a->'repeat'->>k)::numeric,0)-coalesce((b->'repeat'->>k)::numeric,0));
    repeated:=jsonb_set(repeated,array[k],to_jsonb(n));
  end loop;
  if not b ? 'first' and a ? 'first' then
    if c ? 'first' then
      if (a->'first'->>'t')::numeric<(c->'first'->>'t')::numeric then extra:=c->'first';c:=jsonb_set(c,'{first}',a->'first');else extra:=a->'first';end if;
      if coalesce((extra->>'skipped')::boolean,false) then repeated:=jsonb_set(repeated,'{sk}',to_jsonb((repeated->>'sk')::numeric+1));
      else repeated:=jsonb_set(repeated,'{a}',to_jsonb((repeated->>'a')::numeric+1));if coalesce((extra->>'ok')::boolean,false) then repeated:=jsonb_set(repeated,'{c}',to_jsonb((repeated->>'c')::numeric+1));end if;end if;
    else c:=jsonb_set(c,'{first}',a->'first');end if;
  end if;
  if a ? 'repeat' or b ? 'repeat' or c ? 'repeat' or (repeated->>'a')::numeric>0 or (repeated->>'sk')::numeric>0 then c:=jsonb_set(c,'{repeat}',repeated);end if;
  return c;
end $$;

create function public.apply_progress_changes(p_pack text,p_id text,p_changes jsonb,p_pending text[] default array[]::text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  owner_id uuid:=auth.uid(); items_now jsonb; change jsonb; next_item jsonb; stored_question jsonb; identity_now jsonb; question_no text; acknowledged jsonb;
begin
  if owner_id is null then raise exception 'Sign in to save answers.' using errcode='42501';end if;
  if p_id is null or p_pack is null or p_changes is null or length(p_id) not between 1 and 200 or length(p_pack) not between 1 and 200 or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes) not between 1 and 5000 or cardinality(p_pending)>5000 then raise exception 'Invalid progress change.';end if;
  -- A row lock serialises simultaneous copies without replacing unrelated answers.
  perform 1 from public.packs where user_id=owner_id and id=p_pack for share;
  if not found then raise exception 'This question set is no longer available.';end if;
  perform set_config('app.solo_progress_rpc','on',true);
  insert into public.progress(user_id,pack_id,items,updated_at) values(owner_id,p_pack,'{}',now()) on conflict(user_id,pack_id) do nothing;
  select p.items into items_now from public.progress p where p.user_id=owner_id and p.pack_id=p_pack for update;
  items_now:=coalesce(items_now,'{}');
  if not exists(select 1 from public.progress_receipts where user_id=owner_id and id=p_id) then
    for change in select value from jsonb_array_elements(p_changes) loop
      question_no:=change->>'no';
      if not change ?& array['no','before','after'] or question_no is null or question_no!~'^[1-9][0-9]*$' or jsonb_typeof(change->'after') not in ('object','null') or jsonb_typeof(change->'before') not in ('object','null') then raise exception 'Invalid question progress.';end if;
      if change->'after'<>'null'::jsonb then
        select q into stored_question from public.packs p cross join lateral jsonb_array_elements(p.questions) q where p.user_id=owner_id and p.id=p_pack and q->>'no'=question_no;
        identity_now:=jsonb_build_object('text',stored_question->'text','options',stored_question->'options','answer',stored_question->'answer','qimg',coalesce(stored_question->'qimg','[]'::jsonb));
        if stored_question is null or identity_now is distinct from change->'identity' then raise exception 'A question changed. Keep a backup before retrying.';end if;
      end if;
      next_item:=public.merge_question_progress(items_now->question_no,nullif(change->'before','null'::jsonb),nullif(change->'after','null'::jsonb),coalesce((change->>'replace')::boolean,false));
      if next_item is null then items_now:=items_now-question_no;else items_now:=jsonb_set(items_now,array[question_no],next_item);end if;
    end loop;
    update public.progress set items=items_now,updated_at=now() where user_id=owner_id and pack_id=p_pack;
    insert into public.progress_receipts(user_id,id,pack_id) values(owner_id,p_id,p_pack);
  elsif not exists(select 1 from public.progress_receipts where user_id=owner_id and id=p_id and pack_id=p_pack) then raise exception 'The save identifier belongs to another paper.';
  end if;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into acknowledged from public.progress_receipts where user_id=owner_id and pack_id=p_pack and (id=p_id or id=any(p_pending));
  return jsonb_build_object('items',items_now,'applied',acknowledged);
end $$;
revoke all on function public.merge_question_progress(jsonb,jsonb,jsonb,boolean) from public,anon;
revoke all on function public.apply_progress_changes(text,text,jsonb,text[]) from public,anon;
grant execute on function public.merge_question_progress(jsonb,jsonb,jsonb,boolean) to authenticated;
grant execute on function public.apply_progress_changes(text,text,jsonb,text[]) to authenticated;

-- A still-open pre-update page must refresh instead of replacing a newer paper.
create function public.guard_legacy_progress_save() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(current_setting('app.solo_progress_rpc',true),'')<>'on' and exists(select 1 from public.progress_receipts where user_id=new.user_id and pack_id=new.pack_id) then raise exception 'Refresh the website before saving; a newer version is protecting your answers.';end if;
  return new;
end $$;
revoke all on function public.guard_legacy_progress_save() from public,anon;
grant execute on function public.guard_legacy_progress_save() to authenticated;
create trigger protect_synced_progress before insert or update on public.progress for each row execute function public.guard_legacy_progress_save();
comment on table public.progress_receipts is 'Idempotency receipts for atomic per-question changes; contains no question content.';
commit;
