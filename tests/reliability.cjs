const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8'),core=script.slice(0,script.lastIndexOf('\nrender();'));
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
