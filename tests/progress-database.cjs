const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261124124342_reliable_progress_sync.sql'),'utf8');
const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
const question={no:1,text:'Question',options:{A:'Yes',B:'No'},answer:'A',qimg:[]},identity={...question};delete identity.no;
async function database(){
  const db=new PGlite();
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${alice}'),('${bob}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;create table public.packs(user_id uuid not null,id text not null,questions jsonb,primary key(user_id,id));create table public.progress(user_id uuid not null,pack_id text not null,items jsonb,updated_at timestamptz,primary key(user_id,pack_id));alter table public.packs enable row level security;alter table public.progress enable row level security;create policy own_packs on public.packs to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);create policy own_progress on public.progress to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);grant select,insert,update,delete on public.packs,public.progress to authenticated;`);
  await db.query('insert into public.packs values ($1,$2,$3),($4,$2,$3)',[alice,'paper',JSON.stringify([question,{...question,no:2}]),bob]);
  await db.exec(migration);await db.exec(`set role authenticated;set request.jwt.claim.sub='${alice}';`);
  return db;
}
const change=(no,after,before=null)=>({no:String(no),before,after,identity});
async function save(db,id,changes,pending=[]){return (await db.query('select public.apply_progress_changes($1,$2,$3,$4) as result',['paper',id,JSON.stringify(changes),pending])).rows[0].result;}
test('database merges independent questions and retries without replacing or double-counting answers',async()=>{
  const db=await database();try{
    const first={a:1,c:1,w:0,sk:0,l:'c',t:10,first:{pick:'A',ok:true,skipped:false,t:10}};
    await save(db,'one',[change(1,first)]);let row=await save(db,'two',[change(2,{a:1,c:0,w:1,l:'w',t:11})]);assert.equal(row.items['1'].c,1);assert.equal(row.items['2'].w,1);
    row=await save(db,'one',[change(1,first)],['one','two']);assert.equal(row.items['1'].a,1);assert.deepEqual(row.applied.sort(),['one','two']);
  }finally{await db.close();}
});
test('simultaneous first answers to the same question keep both counts and one first attempt',async()=>{
  const db=await database();try{
    await save(db,'later',[change(1,{a:1,c:0,w:1,sk:0,l:'w',t:20,first:{pick:'B',ok:false,skipped:false,t:20}})]);
    const row=await save(db,'earlier',[change(1,{a:1,c:1,w:0,sk:0,l:'c',t:10,first:{pick:'A',ok:true,skipped:false,t:10}})]),p=row.items['1'];
    assert.equal(p.a,2);assert.equal(p.c,1);assert.equal(p.w,1);assert.equal(p.first.t,10);assert.deepEqual(p.repeat,{a:1,c:0,sk:0});assert.equal(p.l,'w');
  }finally{await db.close();}
});
test('new saves retain independent bookmark edits and reject stale question identities',async()=>{
  const db=await database();try{
    await save(db,'answer',[change(1,{a:1,c:1,l:'c',t:20})]);const row=await save(db,'bookmark',[change(1,{b:1})]);assert.equal(row.items['1'].a,1);assert.equal(row.items['1'].b,1);
    await assert.rejects(save(db,'stale',[{...change(1,{a:1}),identity:{...identity,text:'Changed'}}]),/question changed/i);
    assert.equal((await db.query('select count(*)::int as n from public.progress_receipts')).rows[0].n,2);
  }finally{await db.close();}
});
test('RLS separates accounts and anonymous calls cannot save; legacy whole-paper writes are blocked',async()=>{
  const db=await database();try{
    await save(db,'alice-save',[change(1,{a:1,c:1,t:10})]);
    await assert.rejects(db.query('update public.progress set items=$1 where pack_id=$2',[JSON.stringify({}),'paper']),/Refresh the website/);
    await db.exec(`set request.jwt.claim.sub='${bob}';`);assert.equal((await db.query('select count(*)::int as n from public.progress_receipts')).rows[0].n,0);
    const row=await save(db,'bob-save',[change(2,{a:1,w:1,t:20})]);assert.equal(row.items['1'],undefined);
    await db.exec('reset role;set role anon;');await assert.rejects(save(db,'anonymous',[change(1,{a:1})]),/permission denied/i);
  }finally{await db.close();}
});
