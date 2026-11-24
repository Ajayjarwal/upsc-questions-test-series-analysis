const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(__dirname+'/../js/mapping-storage.js','utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8'),core=script.slice(0,script.lastIndexOf('\nrender();'));
let sequence=0;
const paper=()=>({id:'paper',title:'A saved paper',questions:[1,2].map(no=>({no,subject:'Geography',topic:'Rivers',text:'Question '+no,options:{A:'Yes',B:'No'},answer:'A'}))});
function fixture(storage=new Map()){
  const events={},nodes=new Map(),timers=new Map();let timer=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',open:false,textContent:'',setAttribute(){},focus(){},close(){this.open=false;},querySelectorAll(){return [];},addEventListener(){}});return nodes.get(id);};
  const context=vm.createContext({TextEncoder,URL,URLSearchParams,structuredClone,crypto:{randomUUID:()=> 'operation-'+(++sequence)},location:{hostname:'example.test',search:''},setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout(id){timers.delete(id);},localStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},document:{visibilityState:'visible',getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],documentElement:{setAttribute(){}},body:{classList:{remove(){},add(){}}},addEventListener(type,fn){(events[type]??=[]).push(fn);}},window:{scrollTo(){},scrollY:0,innerHeight:900,addEventListener(type,fn){(events[type]??=[]).push(fn);},matchMedia:()=>({matches:false})}});
  vm.runInContext(core,context);const run=code=>vm.runInContext(code,context);run(`render=()=>saveQuizSession();toast=()=>{};S.auth='ok';`);
  return {run,context,storage,events,timers,node,async open(store,user='alice'){context.store=store;run(`S.user={id:${JSON.stringify(user)}};`);await run(`openBank(store,'cloud')`);}};
}
function remote(merge){
  const users=new Map(),fail={write:false,afterCommit:false},calls=[],hooks={};
  const bank=user=>{if(!users.has(user))users.set(user,{packs:[paper()],prog:{},receipts:new Set(),quotes:null,history:[]});return users.get(user);};
  const store=user=>({progressOwner:'cloud:'+user,quoteOwner:'cloud:'+user,async load(){if(hooks.load)await hooks.load(user);const b=bank(user);return structuredClone({packs:b.packs,prog:b.prog});},async loadProgressReceipts(ids){return ids.filter(id=>bank(user).receipts.has(id));},async saveProgressChanges(op,pending){calls.push(op.id);if(fail.write)throw Error('offline');const b=bank(user);if(!b.receipts.has(op.id)){let items=b.prog[op.pid]||{};for(const c of op.changes){const p=merge(items[c.no],c.before,c.after,c.replace);if(p===null)delete items[c.no];else items[c.no]=structuredClone(p);}b.prog[op.pid]=items;b.receipts.add(op.id);}if(fail.afterCommit){fail.afterCommit=false;throw Error('lost response');}return {items:structuredClone(b.prog[op.pid]),applied:[op.id,...pending].filter(id=>b.receipts.has(id))};},async savePack(p){if(hooks.savePack)await hooks.savePack(p);const b=bank(user);b.packs=b.packs.filter(x=>x.id!==p.id).concat(structuredClone(p));},async deletePack(p){const b=bank(user);b.packs=b.packs.filter(x=>x.id!==p.id);delete b.prog[p.id];},async saveProg(){throw Error('Whole-paper overwrites must not be used');},async loadQuotes(){return bank(user).quotes;},async saveQuotes(q){bank(user).quotes=structuredClone(q);return q;},async loadTestResults(){return structuredClone(bank(user).history);},async saveTestResult(r){const h=bank(user).history;if(!h.some(x=>x.id===r.id))h.push(structuredClone(r));}});
  return {bank,store,fail,calls,hooks};
}
test('offline answers survive a reload and retry once without relying on the original page',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));cloud.fail.write=true;
  a.run(`recordAnswer('paper:1','A');`);await assert.rejects(a.run('flush()'),/offline/);assert.equal(a.run('syncStatusText()'),'Waiting to sync');
  const b=fixture(a.storage);await b.open(cloud.store('alice'));await b.run('PROGRESS.chain').catch(()=>{});assert.equal(b.run(`S.prog['paper:1'].c`),1);assert.equal(b.run('PROGRESS.ops.size'),1);
  cloud.fail.write=false;await b.run('flush()');assert.equal(cloud.bank('alice').prog.paper['1'].a,1);assert.equal(b.run('PROGRESS.ops.size'),0);assert.equal(b.run('syncStatusText()'),'Saved');
  const c=fixture(a.storage);await c.open(cloud.store('alice'));assert.equal(c.run(`S.prog['paper:1'].a`),1);
});
test('a committed save with a lost response is recognised after reload and never applied twice',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));cloud.fail.afterCommit=true;a.run(`recordAnswer('paper:1','B');`);await assert.rejects(a.run('flush()'),/lost response/);
  const b=fixture(a.storage);await b.open(cloud.store('alice'));assert.equal(b.run('PROGRESS.ops.size'),0);assert.equal(b.run(`S.prog['paper:1'].a`),1);assert.equal(cloud.calls.length,1);
});
test('rapid same-question edits keep their order after reload and unconfirmed responses stay pending',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));a.run(`Date.now=()=>1790000000000;recordAnswer('paper:1','A');recordAnswer('paper:1','B');`);
  const b=fixture(a.storage);await b.open(cloud.store('alice'));await b.run('PROGRESS.chain');assert.equal(cloud.bank('alice').prog.paper['1'].a,2);assert.equal(cloud.bank('alice').prog.paper['1'].l,'w');
  const bad=cloud.store('bob');bad.saveProgressChanges=async()=>({items:{},applied:[]});const c=fixture();await c.open(bad,'bob');c.run(`recordAnswer('paper:1','A');`);await assert.rejects(c.run('flush()'),/did not confirm/);assert.equal(c.run('PROGRESS.ops.size'),1);assert.equal(c.run('syncStatusText()'),'Waiting to sync');
});
test('two browser copies retain answers to different questions and concurrent answers to one question',async()=>{
  const a=fixture(),b=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));await b.open(cloud.store('alice'));
  a.run(`recordAnswer('paper:1','A');`);b.run(`recordAnswer('paper:2','B');`);await Promise.all([a.run('flush()'),b.run('flush()')]);assert.equal(cloud.bank('alice').prog.paper['1'].c,1);assert.equal(cloud.bank('alice').prog.paper['2'].w,1);
  const c=fixture(),d=fixture();await c.open(cloud.store('bob'),'bob');await d.open(cloud.store('bob'),'bob');c.run(`recordAnswer('paper:1','A');`);d.run(`recordAnswer('paper:1','B');`);await Promise.all([c.run('flush()'),d.run('flush()')]);const p=cloud.bank('bob').prog.paper['1'];assert.equal(p.a,2);assert.equal(p.c,1);assert.equal(p.w,1);assert.equal(p.repeat.a,1);
});
test('a slow bank request cannot replace a newer account and its pending changes stay isolated',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress'));let release;cloud.hooks.load=user=>user==='alice'?new Promise(resolve=>{release=resolve;}):Promise.resolve();
  const pending=f.open(cloud.store('alice'));await Promise.resolve();f.run('resetData()');await f.open(cloud.store('bob'),'bob');release();await pending;assert.equal(f.run('S.store.progressOwner'),'cloud:bob');assert.equal(f.run('PROGRESS.owner'),'cloud:bob');assert.equal(f.run('S.user.id'),'bob');
});
test('a save failing after an account switch cannot change the newer account status',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress')),alice=cloud.store('alice');let release;alice.saveProgressChanges=()=>new Promise((_,reject)=>{release=()=>reject(Error('old account offline'));});await f.open(alice);f.run(`recordAnswer('paper:1','A');`);const saving=f.run('flush()');while(!release)await new Promise(resolve=>setImmediate(resolve));f.run('resetData()');await f.open(cloud.store('bob'),'bob');release();await assert.rejects(saving);assert.equal(f.run('PROGRESS.owner'),'cloud:bob');assert.equal(f.run('PROGRESS.error'),'');assert.equal(f.run('syncStatusText()'),'Saved');
});
test('account changes while importing cannot insert old question sets into the newer account view',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress'));await f.open(cloud.store('alice'));f.context.parsed={id:'alice-import',title:'Alice import',questions:paper().questions};f.run('S.imp={parsed,dups:[]};');let release;cloud.hooks.savePack=()=>new Promise(resolve=>{release=resolve;});const saving=f.run('applyImport(true)');while(!release)await new Promise(resolve=>setImmediate(resolve));f.run('resetData()');await f.open(cloud.store('bob'),'bob');release();await assert.rejects(saving,/account changed/);assert.equal(f.run('S.packs.some(p=>p.id==="alice-import")'),false);assert.equal(f.run('S.quiz'),null);
});
test('exam drafts resume without submitting, revealing answers or losing review marks and reasoning',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));a.run(`startQuiz(['paper:1','paper:2'],{mode:'exam'});doPick('B');markForReview();S.quiz.rn['paper:1']='My reasoning';saveQuizSession();`);
  const b=fixture(a.storage);await b.open(cloud.store('alice'));assert.equal(b.run('QUIZ_DRAFTS.rows.length'),1);b.run('resumeQuiz(QUIZ_DRAFTS.rows[0].quiz.id)');assert.equal(b.run(`S.quiz.ans['paper:1']`),'B');assert.equal(b.run(`S.quiz.rn['paper:1']`),'My reasoning');assert.equal(b.run(`S.quiz.marked['paper:1']`),true);assert.equal(b.run('Object.keys(S.prog).length'),0);assert.equal(b.run('S.quiz.done'),false);
  b.run('finishQuiz()');await b.run('flush()');assert.equal(cloud.bank('alice').prog.paper['1'].a,1);assert.equal(cloud.bank('alice').prog.paper['2'].sk,1);
});
test('checked practice answers are not scored again when a draft resumes; changed questions disable resuming',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));a.run(`startQuiz(['paper:1','paper:2'],{mode:'practice'});doPick('A');doCheck();`);await a.run('flush()');
  const b=fixture(a.storage);await b.open(cloud.store('alice'));b.run('resumeQuiz(QUIZ_DRAFTS.rows[0].quiz.id);doCheck();');await b.run('flush()');assert.equal(cloud.bank('alice').prog.paper['1'].a,1);assert.equal(b.run(`S.quiz.res['paper:1'].ok`),true);
  cloud.bank('alice').packs[0].questions[0].text='Different question';const c=fixture(a.storage);await c.open(cloud.store('alice'));assert.equal(c.run('QUIZ_DRAFTS.rows[0].valid'),false);
  const other=fixture(a.storage);await other.open(cloud.store('bob'),'bob');assert.equal(other.run('QUIZ_DRAFTS.rows.length'),0);
});
test('restored backups preserve optional quotes and mapping data and reject executable or duplicate options',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress'));await f.open(cloud.store('alice'));
  f.run(`dailyQuotes=[{text:'Keep this quote',author:'Me'}];localStorage.setItem('solo-ui-lab-rivers-v1',JSON.stringify({history:{ganga:{seen:2,correct:1,review:1,last:10}},edits:{ganga:{name:'Ganga',note:'My note'}}}));`);
  const parsed=JSON.parse(f.run('JSON.stringify(parseBackup(buildBackup()))'));assert.equal(parsed.quotes[0].text,'Keep this quote');assert.equal(parsed.mapping.edits.ganga.note,'My note');f.context.backup=parsed;await f.run('S.bk.parsed=backup;restoreBackup()');assert.equal(cloud.bank('alice').quotes[0].text,'Keep this quote');
  assert.equal(f.run(`(()=>{const data=JSON.parse(buildBackup());data.packs[0].questions[0].options['"><img src=x onerror=alert(1)>']='unsafe';return !!parseBackup(JSON.stringify(data)).error})()`),true);
  assert.equal(f.run(`(()=>{const data=JSON.parse(buildBackup());data.packs[0].questions.push(data.packs[0].questions[0]);return !!parseBackup(JSON.stringify(data)).error})()`),true);
});
test('CSE CSAT and CAPF-source CSAT use their own marks and round once at the end',()=>{
  const f=fixture();assert.equal(f.run(`(()=>{S.space='csat';S.packs=[{id:'csat::paper',questions:Array.from({length:80},(_,i)=>({...${JSON.stringify(paper().questions[0])},no:i+1,source_exam:'CSE'}))}];rebuild();startQuiz(S.qs.map(q=>q.uid),{mode:'exam'});const rows=S.qs.map(q=>({u:q.uid,ok:true}));return resultScore(rows).marks===200&&resultScore(rows).max===200})()`),true);
  assert.equal(f.run(`(()=>{S.packs[0].questions.forEach(q=>q.source_exam='CAPF');rebuild();startQuiz(S.qs.map(q=>q.uid),{mode:'exam'});const rows=S.qs.map(q=>({u:q.uid,ok:true}));return resultScore(rows).marks===160&&resultScore([{u:S.qs[0].uid,ok:false}]).marks===-.67&&testMarks(12,17)===12.78})()`),true);
});
test('Enter on a focused Bookmark button does not check the selected answer',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress'));await f.open(cloud.store('alice'));f.run(`startQuiz(['paper:1'],{mode:'practice'});doPick('A');`);
  for(const fn of f.events.keydown)fn({key:'Enter',target:{tagName:'BUTTON',dataset:{act:'bm'}},preventDefault(){throw Error('Native button action was intercepted');}});assert.equal(f.run(`S.quiz.res['paper:1']`),undefined);
});
test('switching study sections while importing finishes the save without starting an invalid quiz',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress'));await f.open(cloud.store('alice'));f.context.parsed={id:'new-paper',title:'New paper',questions:paper().questions};f.run('S.imp={parsed,text:"input",dups:[]};');let release;cloud.hooks.savePack=()=>new Promise(resolve=>{release=resolve;});const saving=f.run('applyImport(true)');while(!release)await new Promise(resolve=>setImmediate(resolve));f.run(`resetPracticeSpace('cse')`);release();await saving;assert.equal(f.run('S.space'),'cse');assert.equal(f.run('S.quiz'),null);assert.ok(cloud.bank('alice').packs.some(p=>p.id==='new-paper'));
});
test('question search reuses its index and rebuilds it after a question edit',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress'));await f.open(cloud.store('alice'));assert.equal(f.run(`(()=>{S.space='cse';S.packs=[{id:'cse::paper',questions:[{...S.packs[0].questions[0],text:'Federalism in India'}]}];rebuild();const a=indexedQuestions();if(searchQuestions('federalism').length!==1||indexedQuestions()!==a)return false;S.packs[0].questions[0].text='A river';rebuild();return indexedQuestions()!==a&&searchQuestions('federalism').length===0})()`),true);
});

test('changed pending questions are held out of new questions and do not block another paper',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));cloud.bank('alice').packs.push({...paper(),id:'other'});await a.open(cloud.store('alice'));cloud.fail.write=true;a.run("recordAnswer('paper:1','A')");await assert.rejects(a.run('flush()'));cloud.fail.write=false;cloud.bank('alice').packs[0].questions[0].text='Replacement question';
  const b=fixture(a.storage);await b.open(cloud.store('alice'));assert.equal(b.run("S.prog['paper:1']"),undefined);assert.equal(b.run('PROGRESS.conflicts.size'),1);assert.match(b.run('progressRecoveryCard()'),/Export recovery file/);
  b.run("recordAnswer('other:1','A')");await b.run('flush()');assert.equal(cloud.bank('alice').prog.other['1'].a,1);assert.equal(b.run('PROGRESS.ops.size'),0);
  const c=fixture(a.storage);await c.open(cloud.store('alice'));assert.equal(c.run('PROGRESS.conflicts.size'),1);assert.equal(c.run("[...PROGRESS.conflicts.values()][0].changes[0].identity.text"),'Question 1');
});
test('a permanent server rejection keeps recovery evidence and continues unrelated queued answers',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress')),store=cloud.store('alice'),save=store.saveProgressChanges;cloud.bank('alice').packs.push({...paper(),id:'other'});store.saveProgressChanges=(op,ids)=>op.pid==='paper'?Promise.reject(Error('A question changed. Keep a backup before retrying.')):save(op,ids);await f.open(store);
  f.run("recordAnswer('paper:1','A');recordAnswer('other:1','B')");await f.run('flush()');assert.equal(f.run('PROGRESS.conflicts.size'),1);assert.equal(cloud.bank('alice').prog.other['1'].w,1);assert.equal(f.run('PROGRESS.ops.size'),0);
});
test('receipts arriving between bank reads refresh progress before retiring the local operation',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));a.run("recordAnswer('paper:1','A')");const store=cloud.store('alice'),receipts=store.loadProgressReceipts;store.loadProgressReceipts=async ids=>{await a.run('flush()');return receipts(ids);};const b=fixture(a.storage);await b.open(store);assert.equal(b.run("S.prog['paper:1'].a"),1);assert.equal(b.run('PROGRESS.ops.size'),0);
});
test('a failed reconciliation refresh does not delete the only local evidence of a saved answer',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));cloud.fail.afterCommit=true;a.run("recordAnswer('paper:1','A')");await assert.rejects(a.run('flush()'));const store=cloud.store('alice'),load=store.load;let calls=0;store.load=()=>++calls>1?Promise.reject(Error('offline refresh')):load();const b=fixture(a.storage);await b.open(store);assert.match(b.run('S.bankError'),/offline refresh/);assert.equal(b.run("readProgressOperations('cloud:alice').length"),1);
});
test('resuming a draft transfers ownership and the previous tab cannot submit or overwrite it',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));a.run("startQuiz(['paper:1','paper:2'],{mode:'exam'});doPick('A');saveQuizSession()");const b=fixture(a.storage);await b.open(cloud.store('alice'));b.run('resumeQuiz(QUIZ_DRAFTS.rows[0].quiz.id)');a.run("doPick('B');finishQuiz();saveQuizSession()");assert.equal(a.run('S.quiz.done'),false);assert.equal(a.run("S.quiz.ans['paper:1']"),'A');assert.equal(a.run('PROGRESS.ops.size'),0);b.run('finishQuiz()');await b.run('flush()');assert.equal(cloud.bank('alice').prog.paper['1'].a,1);assert.equal(cloud.bank('alice').prog.paper['2'].sk,1);a.run('finishQuiz()');assert.equal(a.run('S.quiz.done'),false);
});
test('even copies without browser coordination use one immutable submission and question event ID',async()=>{
  const a=fixture(),b=fixture(),cloud=remote(a.run('mergeProgress')),base=paper().questions[0];cloud.bank('alice').packs=[{id:'paper',title:'Full paper',questions:Array.from({length:50},(_,i)=>({...base,no:i+1}))}];await a.open(cloud.store('alice'));await b.open(cloud.store('alice'));a.run("startQuiz(S.qs.map(q=>q.uid),{mode:'exam'});for(const u of S.quiz.uids)S.quiz.ans[u]='A';saveQuizSession()");b.context.copy=JSON.parse(a.run('JSON.stringify(S.quiz)'));b.run('S.quiz=copy;claimQuiz(copy.id)');
  a.run('finishQuiz()');await a.run('flush()');await a.run('TEST_HISTORY.chain');b.run('finishQuiz()');await b.run('flush()');await b.run('TEST_HISTORY.chain');assert.equal(cloud.bank('alice').history.length,1);assert.equal(cloud.bank('alice').prog.paper['1'].a,1);
});
test('new repeat sessions still count as separate tests and attempts',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress')),base=paper().questions[0];cloud.bank('alice').packs=[{id:'paper',questions:Array.from({length:50},(_,i)=>({...base,no:i+1}))}];await f.open(cloud.store('alice'));
  for(let i=0;i<2;i++){f.run("startQuiz(S.qs.map(q=>q.uid),{mode:'exam'});for(const u of S.quiz.uids)S.quiz.ans[u]='A';finishQuiz()");await f.run('flush()');await f.run('TEST_HISTORY.chain');}assert.equal(cloud.bank('alice').history.length,2);assert.equal(cloud.bank('alice').prog.paper['1'].a,2);
});
test('incomplete cloud collections block backups visibly and loading recovery restores export',async()=>{
  const f=fixture(),cloud=remote(f.run('mergeProgress')),store=cloud.store('alice');cloud.bank('alice').quotes=[{text:'My saved quote',author:'Me'}];store.loadQuotes=async()=>{throw Error('unavailable');};store.loadTestResults=async()=>{throw Error('unavailable');};await f.open(store);
  assert.throws(()=>f.run('buildBackup()'),/Backup unavailable.*quotes.*completed-test history/);assert.match(f.run('backupCard()'),/complete backup is unavailable/);await f.run('loadStoredQuotes(store, S.storage)').catch(()=>{});const good=cloud.store('alice');f.context.good=good;f.run('S.store=good');await f.run('loadStoredQuotes(good,S.storage)');await f.run('loadTestHistory(good,S.storage)');assert.equal(JSON.parse(f.run('buildBackup()')).quotes[0].text,'My saved quote');
});
test('a prior daily revision draft obeys today’s remaining allowance',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress')),base=paper().questions[0];cloud.bank('alice').packs=[{id:'paper',questions:Array.from({length:20},(_,i)=>({...base,no:i+1}))}];cloud.bank('alice').prog={paper:Object.fromEntries(Array.from({length:20},(_,i)=>[String(i+1),{a:1,c:0,w:1,m:1,t:1,dd:'2020-01-01'}]))};await a.open(cloud.store('alice'));a.run('startDailyReview();saveQuizSession()');const chosen=JSON.parse(a.run('JSON.stringify(S.quiz.uids)'));let marked=0;for(let no=1;no<=20;no++)if(!chosen.includes('paper:'+no)&&marked++<8)cloud.bank('alice').prog.paper[no].dr=a.run('dayKey()');const b=fixture(a.storage);await b.open(cloud.store('alice'));b.run('resumeQuiz(QUIZ_DRAFTS.rows[0].quiz.id)');assert.equal(b.run('S.quiz.uids.length'),2);b.run("for(const uid of S.quiz.uids){S.quiz.i=S.quiz.uids.indexOf(uid);doPick('A');doCheck();}finishQuiz()");await b.run('flush()');assert.equal(b.run('dailyPlan().done'),10);
});
test('a completed daily allowance cannot be bypassed by an old draft or an already-open queue',async()=>{
  const a=fixture(),cloud=remote(a.run('mergeProgress'));cloud.bank('alice').prog={paper:{1:{a:1,w:1,m:1,t:1,dd:'2020-01-01'}}};await a.open(cloud.store('alice'));a.run('startDailyReview();saveQuizSession()');a.run("S.prog['paper:1'].dr=dayKey();doPick('A');doCheck();doSkip()");assert.equal(a.run('S.quiz.res["paper:1"]'),undefined);a.run('const draftId=S.quiz.id;S.quiz=null;resumeQuiz(draftId)');assert.equal(a.run('S.quiz'),null);
});

test('complete backups retain held answers as recovery evidence and never apply them to replacement questions',async()=>{
 const a=fixture(),cloud=remote(a.run('mergeProgress'));await a.open(cloud.store('alice'));cloud.fail.write=true;a.run("recordAnswer('paper:1','A')");await assert.rejects(a.run('flush()'));cloud.fail.write=false;cloud.bank('alice').packs[0].questions[0].text='New question';const b=fixture(a.storage);await b.open(cloud.store('alice'));const backup=JSON.parse(b.run('buildBackup()'));assert.equal(backup.answer_recovery[0].changes[0].identity.text,'Question 1');const c=fixture();await c.open(cloud.store('bob'),'bob');c.context.backup=JSON.stringify(backup);await c.run('S.bk.parsed=parseBackup(backup);restoreBackup()');assert.equal(c.run('PROGRESS.conflicts.size'),1);assert.equal(c.run("S.prog['paper:1']?.a||0"),0);
});
test('trimming a daily draft retains the original event slots to avoid collisions with earlier answers',async()=>{
 const f=fixture(),cloud=remote(f.run('mergeProgress'));await f.open(cloud.store('alice'));f.run("startQuiz(['paper:1','paper:2'],{mode:'practice'});const first=quizEventId('paper:1','answer');S.quiz.uids=['paper:2'];const second=quizEventId('paper:2','answer');globalThis.slotIds=[first,second]");assert.notEqual(f.run('slotIds[0]'),f.run('slotIds[1]'));
});
