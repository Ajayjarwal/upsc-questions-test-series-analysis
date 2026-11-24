const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(__dirname+'/../js/mapping-storage.js','utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const core=source.slice(0,source.lastIndexOf('\nrender();'));
const sample=(id='result-1')=>({id,date:1794708000000,total:50,space:'static',mode:'exam',correct:30,incorrect:15,skipped:5,marks:50.1,maxMarks:100,sourceExam:'',label:'Completed test',bySubject:{Geography:{total:25,correct:25,incorrect:0,skipped:0,marks:50,maxMarks:50},Economy:{total:25,correct:5,incorrect:15,skipped:5,marks:.1,maxMarks:50}}});
function fixture({rows=new Map(),storage=new Map()}={}){
  const calls=[],nodes=new Map(),hooks={},fail={read:false,write:false,cache:false};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',open:false,setAttribute(){},focus(){},scrollIntoView(){},close(){this.open=false;},addEventListener(){}});return nodes.get(id);};
  const sb={from(table){assert.equal(table,'test_sessions','History must never write packs, progress or quotes');return {
    select(fields){assert.equal(fields,'result');return {eq(column,user){assert.equal(column,'user_id');const query={order(){return query;},async range(from,to){calls.push({kind:'read',user,from,to});if(hooks.beforeRead)await hooks.beforeRead(user);if(fail.read)throw Error('offline');return {data:(rows.get(user)||[]).slice(from,to+1).map(result=>({result:structuredClone(result)})),error:null};}};return query;}};},
    async upsert(row,options){calls.push({kind:'write',row:structuredClone(row),options});assert.equal(options.onConflict,'user_id,id');assert.equal(options.ignoreDuplicates,true);if(hooks.beforeWrite)await hooks.beforeWrite(row);if(fail.write)return {error:{message:'offline'}};const saved=rows.get(row.user_id)||[];if(!saved.some(item=>item.id===row.id))saved.push(structuredClone(row.result));rows.set(row.user_id,saved);return {data:null,error:null};}
  };}};
  const context=vm.createContext({TextEncoder,URL,URLSearchParams,structuredClone,location:{hostname:'example.test',search:''},setTimeout:()=>0,clearTimeout(){},sb,
    localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(fail.cache)throw Error('cache blocked');storage.set(key,value);}},
    document:{visibilityState:'visible',getElementById:node,querySelector:node,documentElement:{setAttribute(){}},addEventListener(){}},window:{scrollY:0,innerHeight:800,scrollTo(){},matchMedia:()=>({matches:false})}});
  vm.runInContext(core,context);
  const run=code=>vm.runInContext(code,context);
  run(`render=()=>{};toast=()=>{};S.ready=true;S.auth='none';S.space='static';DASH.scope='static';S.packs=[{id:'test-paper',title:'Test',questions:Array.from({length:50},(_,i)=>({no:i+1,subject:i<25?'Geography':'Economy',topic:'General',text:'Question',answer:'A',options:{A:'Yes',B:'No'}}))}];rebuild();`);
  const account=async(user='alice')=>{run(`S.user={id:${JSON.stringify(user)}};S.storage='cloud';S.store=supaBackend(sb,${JSON.stringify(user)});`);await run('loadTestHistory(S.store,S.storage)');run("quoteSync={state:'ready',owner:S.store.quoteOwner};");};
  return {run,account,rows,storage,calls,hooks,fail,context,flush:()=>run('TEST_HISTORY.chain')};
}
test('production starts with no invented history and account loads never seed records',async()=>{
  const f=fixture();await f.account();
  assert.equal(f.run('readTestHistory().length'),0);assert.equal(f.calls.filter(c=>c.kind==='write').length,0);
  assert.equal(f.run(`dashProgressChart().includes('No 50-question test results available')&&!dashProgressChart().includes('Example history')`),true);
  assert.ok(!source.includes('function demoTestHistory'));
});
test('finishing a test stores counts, subjects and marks once, without altering question data',async()=>{
  const f=fixture();await f.account();
  const before=f.run('JSON.stringify({packs:S.packs,prog:S.prog})');
  assert.equal(f.run(`(()=>{const uids=S.qs.map(q=>q.uid);startQuiz(uids,{mode:'practice'});S.quiz.res=Object.fromEntries(uids.map((u,i)=>[u,{ok:i<30,skipped:i>=45}]));finishQuiz();finishQuiz();return S.quiz.done;})()`),true);
  await f.flush();assert.equal(f.rows.get('alice').length,1);const row=f.rows.get('alice')[0];
  assert.deepEqual([row.correct,row.incorrect,row.skipped,row.marks,row.maxMarks],[30,15,5,50.1,100]);
  assert.equal(row.bySubject.Geography.total,25);assert.equal(row.bySubject.Economy.marks,.1);
  assert.equal(f.run('JSON.stringify({packs:S.packs,prog:S.prog})'),before);
});
test('a second browser loads the same saved result and filters the subject portion',async()=>{
  const a=fixture();await a.account();a.context.result=sample();a.run('recordTestResult(result)');await a.flush();
  const b=fixture({rows:a.rows});await b.account();
  assert.equal(b.run('readTestHistory().length'),1);
  assert.equal(b.run(`(()=>{DASH.testSubject='Geography';const row=progressHistory().rows[0];return row.paperTotal===50&&row.total===25&&row.correct===25&&row.incorrect===0&&row.marks===50&&row.maxMarks===50&&testPointSubjects(row)==='Subject: Geography';})()`),true);
  assert.equal(b.calls.filter(c=>c.kind==='write').length,0);
});
test('failed saves retain a pending result and retry without duplicate records',async()=>{
  const f=fixture();await f.account();f.fail.write=true;f.context.result=sample();f.run('recordTestResult(result)');await f.flush();
  assert.equal(f.run('TEST_HISTORY.state'),'error');assert.equal(f.run('TEST_HISTORY.pending.size'),1);
  assert.equal(f.run('readTestHistory().length'),1);assert.equal(f.rows.has('alice'),false);
  f.fail.write=false;await f.run('loadTestHistory(S.store,S.storage)');await f.flush();
  assert.equal(f.rows.get('alice').length,1);assert.equal(f.run('TEST_HISTORY.pending.size'),0);assert.equal(f.run('TEST_HISTORY.state'),'ready');
});
test('an unfinished backend save is never labelled as saved to the account',async()=>{
  const f=fixture();await f.account();let release;f.hooks.beforeWrite=()=>new Promise(resolve=>{release=resolve;});
  f.context.result=sample();f.run('recordTestResult(result)');await Promise.resolve();await Promise.resolve();
  assert.equal(f.run('TEST_HISTORY.pending.size'),1);assert.ok(f.run('testHistoryStatus()').includes('Saving'));
  release();await f.flush();assert.ok(f.run('testHistoryStatus()').includes('saved to your account'));
});
test('account isolation holds for cached data and a load finishing after sign-out',async()=>{
  const f=fixture({rows:new Map([['alice',[sample()]]])});await f.account();await f.account('bob');assert.equal(f.run('readTestHistory().length'),0);
  let release;f.hooks.beforeRead=()=>new Promise(resolve=>{release=resolve;});
  const pending=f.run(`loadTestHistory(supaBackend(sb,'alice'),'cloud')`);f.run(`resetTestHistory();S.auth='login';`);release();await pending;
  assert.equal(f.run('readTestHistory().length'),0);assert.equal(f.run('TEST_HISTORY.owner'),'');
});
test('a save completing after an account switch cannot populate the other account',async()=>{
  const f=fixture();await f.account();let release;f.hooks.beforeWrite=()=>new Promise(resolve=>{release=resolve;});
  f.context.result=sample();f.run('recordTestResult(result)');await Promise.resolve();await Promise.resolve();const oldSave=f.flush();
  await f.account('bob');release();await oldSave;
  assert.equal(f.run('TEST_HISTORY.owner'),'cloud:bob');assert.equal(f.run('readTestHistory().length'),0);
});
test('backend saves succeed even when browser caching is blocked',async()=>{
  const f=fixture();await f.account();f.fail.cache=true;f.context.result=sample();f.run('recordTestResult(result)');await f.flush();
  assert.equal(f.rows.get('alice').length,1);assert.equal(f.run('TEST_HISTORY.state'),'ready');
});
test('blocked caching and a failed save retain the result in memory for retry',async()=>{
  const f=fixture();await f.account();f.fail.cache=true;f.fail.write=true;f.context.result=sample();f.run('recordTestResult(result)');await f.flush();
  f.fail.write=false;await f.run('loadTestHistory(S.store,S.storage)');await f.flush();assert.equal(f.rows.get('alice').length,1);
});
test('test-history loading paginates beyond the backend row limit',async()=>{
  const rows=Array.from({length:1001},(_,i)=>({...sample('result-'+i),date:1794708000000+i})),f=fixture({rows:new Map([['alice',rows]])});
  await f.account();assert.equal(f.run('readTestHistory().length'),1001);assert.equal(f.calls.filter(c=>c.kind==='read').length,2);
});
test('history errors do not make the question bank unavailable',async()=>{
  const f=fixture();f.fail.read=true;await f.account();
  assert.equal(f.run('S.ready'),true);assert.equal(f.run('S.packs.length'),1);assert.equal(f.run('TEST_HISTORY.state'),'error');
});
test('backups include session history and older backups do not erase existing tests',async()=>{
  const f=fixture();await f.account();f.context.result=sample();f.run('recordTestResult(result)');await f.flush();
  assert.equal(f.run(`parseBackup(buildBackup()).testHistory[0].bySubject.Geography.marks`),50);
  await f.run(`S.bk.parsed={packs:[],progress:{},testHistory:[]};restoreBackup();`);
  assert.equal(f.run('readTestHistory().length'),1);
});
test('results with invalid totals or example markers are never persisted',async()=>{
  const f=fixture();await f.account();f.context.result=sample();
  assert.equal(f.run(`recordTestResult({...result,total:49})||recordTestResult({...result,demo:true})||recordTestResult({...result,marks:99})`),false);
  assert.equal(f.calls.filter(c=>c.kind==='write').length,0);
});
test('browser-only storage survives reload without mixing preview or account caches',async()=>{
  const f=fixture();f.run(`S.store=localBackend('browser-test-bank');S.storage='browser';`);await f.run('loadTestHistory(S.store,S.storage)');
  f.context.result=sample();f.run('recordTestResult(result);resetTestHistory();');await f.run('loadTestHistory(S.store,S.storage)');
  assert.equal(f.run('readTestHistory().length'),1);assert.equal(f.calls.length,0);
  assert.ok([...f.storage.keys()].every(key=>key==='solo-test-history-v1:browser:browser-test-bank'));
});
test('full-length tests retain 100-question size and negative marks; other sizes stay out',async()=>{
  const f=fixture();await f.account();
  assert.equal(f.run(`(()=>{const Q={done:true,start:55,mode:'exam',kind:'Quiz',uids:Array.from({length:100},(_,i)=>'q:'+i),res:Object.fromEntries(Array.from({length:100},(_,i)=>['q:'+i,{ok:false,skipped:false}]))};const saved=saveCompletedTest(Q);DASH.testLength=100;return saved&&progressHistory().rows[0].marks===-66&&progressHistory().rows[0].maxMarks===200&&!dashProgressChart().includes('NaN');})()`),true);
  await f.flush();assert.equal(f.rows.get('alice')[0].total,100);
  assert.equal(f.run(`saveCompletedTest({done:true,uids:Array(49).fill('q'),res:{q:{ok:true}}})`),false);
});
test('hover subject labels distinguish mixed papers, filtered subjects and missing metadata',()=>{
  const f=fixture();f.context.result=sample();
  assert.equal(f.run('testPointSubjects(result)'),'Subjects: Geography · Economy');
  assert.equal(f.run(`testPointSubjects({...result,subject:'Geography'})`),'Subject: Geography');
  assert.equal(f.run(`testPointSubjects({...result,bySubject:undefined})`),'Subject: Not recorded');
});
test('saving a later result does not hide an earlier result still waiting for retry',async()=>{
  const f=fixture();await f.account();f.fail.write=true;f.context.result=sample('first');f.run('recordTestResult(result)');await f.flush();
  f.fail.write=false;f.context.result=sample('second');f.run('recordTestResult(result)');await f.flush();
  assert.equal(f.run('TEST_HISTORY.pending.size'),1);assert.equal(f.run('TEST_HISTORY.state'),'error');assert.ok(f.run('testHistoryStatus()').includes('Retry sync'));
});
test('test-progress graph appears only in Static and other sections cannot record new test results',()=>{
  const f=fixture();
  assert.equal(f.run(`(()=>{for(const scope of ['mixed','ca','cse','csat','capf']){DASH.scope=scope;if(dashProgressChart()!==''||viewSwot().includes('id="swot-progress-title"')||!viewSwot().includes('Your subject profile'))return false;}DASH.scope='static';if(!dashProgressChart().includes('id="swot-progress-title"'))return false;for(const space of ['ca','cse','csat','capf']){S.space=space;if(saveCompletedTest({done:true,uids:Array(50).fill('q'),res:{q:{ok:true}}}))return false;}return readTestHistory().length===0;})()`),true);
});
test('saved test summaries use existing latest outcomes without creating attempt history or changing data',()=>{
  const f=fixture();
  assert.equal(f.run(`(()=>{S.prog=Object.fromEntries(S.qs.map((q,i)=>[q.uid,i<30?{a:1,l:'c',t:1000+i}:i<45?{a:1,l:'w',t:1000+i}:{a:0,sk:1,t:1000+i}]));const before=JSON.stringify({packs:S.packs,prog:S.prog}),row=savedStaticTests()[0],view=progressHistory();return row.correct===30&&row.incorrect===15&&row.skipped===5&&row.marks===50.1&&row.date===1049&&row.mode==='saved'&&view.rows.length===1&&view.legacyCount===1&&readTestHistory().length===0&&before===JSON.stringify({packs:S.packs,prog:S.prog});})()`),true);
});
test('incomplete test papers do not get invented skips, dates or completion records',()=>{
  const f=fixture();
  assert.equal(f.run(`(()=>{S.prog={[S.qs[0].uid]:{a:1,l:'c'}};if(savedStaticTests().length)return false;S.prog=Object.fromEntries(S.qs.map(q=>[q.uid,{a:1,l:'c'}]));const row=savedStaticTests()[0];return row.date===null&&testDate(row.date)==='Date unavailable'&&readTestHistory().length===0;})()`),true);
});
test('one graph combines older papers and new attempts without source buttons',async()=>{
  const f=fixture();await f.account();f.context.result=sample();f.run('recordTestResult(result)');await f.flush();
  assert.equal(f.run(`(()=>{S.prog=Object.fromEntries(S.qs.map(q=>[q.uid,{a:1,l:'w',t:100}]));const all=progressHistory();DASH.testSubject='Geography';const filtered=progressHistory();return all.rows.length===2&&all.legacyCount===1&&filtered.rows.length===2&&filtered.rows[0].marks===-16.5&&filtered.rows[1].marks===50&&readTestHistory()[0].marks===50.1&&!dashProgressChart().includes('test-view')&&!dashProgressChart().includes('Result source');})()`),true);
});
test('a recorded full paper replaces its legacy summary even after later question practice',async()=>{
  const f=fixture();await f.account();f.context.result={...sample(),paperId:'test-paper'};f.run('recordTestResult(result)');await f.flush();
  assert.equal(f.run(`(()=>{S.prog=Object.fromEntries(S.qs.map(q=>[q.uid,{a:2,l:'w',t:Date.now()}]));const history=progressHistory();return history.rows.length===1&&history.legacyCount===0&&history.rows[0].marks===50.1;})()`),true);
  const b=fixture({rows:f.rows});await b.account();assert.equal(b.run('readTestHistory()[0].paperId'),'test-paper');
});
test('older sessions match exact unique titles and genuine repeat attempts remain separate',async()=>{
  const a={...sample('first'),label:'Test'},b={...sample('repeat'),label:'Test',date:1794708001000};
  const f=fixture({rows:new Map([['alice',[a,b]]])});await f.account();
  assert.equal(f.run(`(()=>{S.prog=Object.fromEntries(S.qs.map(q=>[q.uid,{a:1,l:'c',t:100}]));const h=progressHistory();return h.rows.length===2&&h.legacyCount===0&&h.rows.every(row=>row.mode==='exam');})()`),true);
});
test('ambiguous titles never merge two different papers or discard an attempt',async()=>{
  const f=fixture({rows:new Map([['alice',[{...sample(),label:'Test'}]]])});await f.account();
  assert.equal(f.run(`(()=>{S.packs.push({...structuredClone(S.packs[0]),id:'other-paper'});rebuild();S.prog=Object.fromEntries(S.qs.map(q=>[q.uid,{a:1,l:'c',t:100}]));return progressHistory().rows.length===3&&progressHistory().legacyCount===2;})()`),true);
});
test('paper identity requires exact full coverage and survives backups without rewriting history',async()=>{
  const f=fixture();await f.account();
  assert.equal(f.run(`(()=>{const uids=S.qs.map(q=>q.uid);if(completedStaticPaperId(uids)!=='test-paper'||completedStaticPaperId(uids.slice(1))||completedStaticPaperId([...uids.slice(1),uids[1]]))return false;startQuiz(uids,{mode:'exam'});S.quiz.res=Object.fromEntries(uids.map(u=>[u,{ok:true,skipped:false}]));finishQuiz();return readTestHistory()[0].paperId==='test-paper'&&parseBackup(buildBackup()).testHistory[0].paperId==='test-paper';})()`),true);
  await f.flush();assert.equal(f.rows.get('alice')[0].paperId,'test-paper');
});
