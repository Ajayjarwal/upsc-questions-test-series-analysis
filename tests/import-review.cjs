const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
new vm.Script(source);
function app() {
  const events={};
  const context = vm.createContext({
    events,
    TextEncoder, URL, URLSearchParams, structuredClone,
    location: {hostname: 'localhost', search: ''},
    setTimeout: () => 0, clearTimeout() {},
    localStorage: {getItem() { return null; }},
    document: {getElementById() { return {}; }, addEventListener(type,fn) { (events[type]??=[]).push(fn); }},
    window: {scrollTo() {}}
  });
  vm.runInContext(source.slice(0, source.lastIndexOf('\nrender();')), context);
  vm.runInContext(`
    render=()=>{};toast=()=>{};
    const question={no:1,text:'Original',subject:'Science',topic:'Test',options:{A:'Yes',B:'No'},answer:'A'};
    const original={id:'old',title:'Original',questions:[question]};
    S.packs=[structuredClone(original)];rebuild();
    const disk=new Map([['old',structuredClone(original)]]),progress=new Map();
    S.store={
      savePack:async p=>disk.set(p.id,structuredClone(p)),
      deletePack:async p=>disk.delete(p.id),
      saveProg:async (id,items)=>progress.set(id,structuredClone(items))
    };
    function importFixture(id='new') {
      S.imp={text:'retry input',parsed:{id,title:'Replacement',questions:[{...question,text:'Replacement'}]},dups:[{no:1,choice:'new',old:{uid:'old:1'}}]};
    }
  `, context);
  return code => vm.runInContext(code, context);
}
test('failed replacement save preserves original questions and retry input', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{importFixture();S.store.savePack=async()=>{throw Error('offline')};try{await applyImport(false)}catch(e){}return disk.has('old')&&S.byUid.has('old:1')&&S.imp.text==='retry input'&&!S.importing})()`), true);
});
test('replacement saves before cleanup; failed cleanup can be retried', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{importFixture();S.store.deletePack=async()=>{throw Error('offline')};try{await applyImport(false)}catch(e){}return disk.has('old')&&disk.has('new')&&!!S.imp.parsed})()`), true);
  assert.equal(await run(`(async()=>{S.store.deletePack=async p=>disk.delete(p.id);await applyImport(false);return !disk.has('old')&&disk.has('new')&&S.byUid.has('new:1')&&!S.imp.parsed})()`), true);
});
test('same-set duplicate cleanup does not remove newly saved questions', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{importFixture('old');await applyImport(false);return disk.get('old').questions.length===1&&S.byUid.get('old:1').text==='Replacement'})()`), true);
});
test('changed and removed questions lose progress; unchanged questions retain it', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{S.packs[0].questions.push({...question,no:2},{...question,no:3});S.prog={'old:1':{a:5,b:1},'old:2':{a:2,b:1},'old:3':{a:3},'other:1':{a:7}};await addPack({id:'old',title:'New',questions:[{...question,text:'Changed'},{...question,no:2,options:{B:'No',A:'Yes'}}]},false);return !S.prog['old:1']&&!S.prog['old:3']&&S.prog['old:2'].a===2&&S.prog['other:1'].a===7&&Object.keys(progress.get('old')).join()==='2'})()`), true);
});
test('changed answer or option text invalidates progress', () => {
  const run=app();
  assert.equal(run(`!sameQuestion(question,{...question,answer:'B'})&&!sameQuestion(question,{...question,options:{A:'Changed',B:'No'}})`), true);
});
test('first skip schedules tomorrow and resets consecutive-day clearing', () => {
  const run=app();
  assert.equal(run(`(()=>{S.prog={'old:1':{a:0,sk:0,cd:['2020-01-01'],bx:5}};recordSkip('old:1');const p=S.prog['old:1'];return p.dd===addDays(dayKey(),1)&&dueDay(p)===p.dd&&p.cd.length===0&&p.bx===1&&viewHome().includes('Daily revision')})()`), true);
});
test('legacy skipped-only questions enter due review; untouched questions do not', () => {
  const run=app();
  assert.equal(run(`(()=>{S.prog={'old:1':{a:0,sk:1,m:1,t:new Date(2020,0,1).getTime()}};return dueList().length===1&&dueDay({a:0,sk:0,b:1})===null})()`), true);
});
test('CAPF imports use a separate ID even when a Static test has the same source ID', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{S.space='capf';const id=scopedPackId('old');await addPack({id,title:'CAPF PYQ',questions:[question]},false);return id==='capf::old'&&disk.has('old')&&disk.has('capf::old')&&S.qs.length===1&&S.qs[0].packId==='capf::old'&&spacePacks().length===1})()`),true);
  assert.equal(run(`(()=>{S.space='static';rebuild();return S.qs.length===1&&S.qs[0].packId==='old'})()`),true);
});
test('all four spaces isolate questions, bookmarks and mistakes', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=Object.keys(SPACES).map(space=>({id:scopedPackId('paper',space),questions:[question]}));S.prog={};for(const p of S.packs)S.prog[p.id+':1']={a:1,b:1,m:1};return Object.keys(SPACES).every(space=>{S.space=space;rebuild();return S.qs.length===1&&packSpace(S.qs[0].packId)===space&&bookmarks().length===1&&openMistakes().length===1})})()`),true);
});
test('CAPF backup and analysis preserve the exam namespace', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'capf::paper',title:'CAPF',questions:[question]}];S.prog={'capf::paper:1':{a:1,l:'c'}};return parseBackup(buildBackup()).packs[0].id==='capf::paper'&&buildAnalysis().includes('capf,CAPF,1,')})()`),true);
});
test('CAPF uses Static-style quiz screens without month controls', () => {
  const run=app();
  assert.equal(run(`(()=>{S.space='capf';return monthBlock({})===''&&viewHome().includes('CAPF PYQ Practice')&&emptyBank().includes('CAPF PYQ JSON')&&header().indexOf('data-v="cse"')<header().indexOf('data-v="capf"')})()`),true);
});
test('imports accept alternative answer keys and reject invalid options', () => {
  const run=app();
  assert.equal(run(`(()=>{const parse=answer=>parseImport(JSON.stringify({subject:'CAPF',questions:[{question:'Alternative key',options:{A:'One',B:'Two',C:'Three'},answer}]}));return [['A','C'],'A or C','A/C',[1,3]].every(key=>{const r=parse(key);return !r.errors.length&&acceptedAnswers(r.questions[0]).join()==='A,C'})&&parse(['A','F']).errors.length===1&&parse([]).errors.length===1&&parse('all').errors.length===1&&parse('B').questions[0].answer==='B'})()`),true);
});
test('practice allows one selection and hides the accepted key until Check Answer', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'old',questions:[{...question,answer:['A','B']}]}];rebuild();startQuiz(['old:1'],{mode:'practice'});doPick('A');doPick('B');const before=viewQuiz();const oneSelection=(before.match(/aria-checked="true"/g)||[]).length===1;doCheck();const after=viewQuiz();return oneSelection&&!before.includes('Answer key accepts')&&!before.includes('opt right')&&S.quiz.res['old:1'].ok&&after.includes('Answer key accepts A or B')&&(after.match(/class="opt right"/g)||[]).length===2})()`),true);
});
test('either accepted option earns credit, other options are incorrect', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'old',questions:[{...question,options:{A:'One',B:'Two',C:'Three'},answer:['A','C']}]}];rebuild();return recordAnswer('old:1','A').ok&&recordAnswer('old:1','C').ok&&!recordAnswer('old:1','B').ok})()`),true);
});
test('exam hides alternatives until submission and scores either answer correctly', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'old',questions:[{...question,answer:['A','B']}]}];rebuild();startQuiz(['old:1'],{mode:'exam'});doPick('B');const hidden=!viewQuiz().includes('Answer key accepts');finishQuiz();S.quiz.rv=0;return hidden&&S.quiz.res['old:1'].ok&&viewReview().includes('Answer key accepts A or B')})()`),true);
});
test('backup, notebook export and reimport preserve accepted alternatives', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'old',questions:[{...question,answer:['A','B']}]}];rebuild();const restored=parseBackup(buildBackup());return restored.packs[0].questions[0].answer.join()==='A,B'&&mdFor(S.qs).includes('A) Yes or B) No')&&sameQuestion({...question,answer:['B','A']},{...question,answer:['A','B']})&&!sameQuestion(question,{...question,answer:['A','B']})})()`),true);
});
test('daily queue prioritizes overdue, confident errors, repeats and uncertain correct answers', () => {
  const run=app();
  assert.equal(run(`(()=>{const yesterday=new Date(Date.now()-86400000).getTime(),today=dayKey();const base={a:1,t:yesterday,dd:addDays(today,3)};S.packs=[{id:'old',questions:Array.from({length:6},(_,i)=>({...question,no:i+1}))}];rebuild();S.prog={'old:1':{...base,l:'c',dd:addDays(today,-2)},'old:2':{...base,l:'w',cf:'s',m:1},'old:3':{...base,l:'w',w:2,m:1},'old:4':{...base,l:'c',cf:'g'},'old:5':{...base,l:'c',dd:today},'old:6':{...base,l:'c',cf:'s'}};return dailyPlan().items.map(x=>x.q.no).join()==='1,2,3,4,5'&&dailyPlan().target===5})()`),true);
});
test('daily queue excludes fresh questions and anything practised today', () => {
  const run=app();
  assert.equal(run(`(()=>{const today=dayKey();return dailyReason({a:0,sk:0})===null&&dailyReason({a:1,l:'w',cf:'s',t:Date.now(),dd:today})===null&&dailyReason({a:1,l:'w',cf:'s',dr:today,t:1})===null&&dailyReason({a:1,l:'c',cf:'h',t:1,dd:addDays(today,2)}).label==='Correct with uncertainty'})()`),true);
});
test('daily queue caps work at 10 in all spaces, deduplicates and retains overflow', () => {
  const run=app();
  assert.equal(run(`Object.keys(SPACES).every(space=>{S.space=space;const id=scopedPackId('limit-check');S.packs=[{id,questions:Array.from({length:40},(_,i)=>({...question,no:i+1}))}];rebuild();S.prog={};for(const q of S.qs)S.prog[q.uid]={a:1,w:3,m:1,l:'w',cf:'s',t:1};S.prog[id+':1'].dr=dayKey();S.prog[id+':2'].dr=dayKey();const plan=dailyPlan();if(!(plan.done===2&&plan.target===10&&plan.items.length===8&&plan.later===30&&new Set(plan.items.map(x=>x.q.uid)).size===8))return false;for(let no=3;no<=10;no++)S.prog[id+':'+no].dr=dayKey();const complete=dailyPlan();return complete.done===10&&complete.target===10&&complete.items.length===0&&complete.later===30})`),true);
});
test('daily answers and explicit skips count once and persist with normal progress', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{S.prog={'old:1':{a:1,c:0,w:1,sk:0,m:1,t:1,l:'w'}};startDailyReview();doPick('A');doCheck();await flush();return dailyPlan().done===1&&dailyPlan().items.length===0&&progress.get('old')['1'].dr===dayKey()})()`),true);
});
test('ending daily revision early leaves unchecked questions and progress untouched', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'old',questions:[question,{...question,no:2}]}];rebuild();S.prog={'old:1':{a:1,c:0,w:1,sk:0,m:1,t:1,l:'w'},'old:2':{a:1,c:0,w:1,sk:0,m:1,t:1,l:'w'}};startDailyReview();doPick('A');doCheck();const untouched=JSON.stringify(S.prog['old:2']);finishQuiz();return JSON.stringify(S.prog['old:2'])===untouched&&dailyPlan().items.length===1&&dailyPlan().done===1&&S.quiz.res['old:2'].deferred})()`),true);
});
test('daily explicit skip is processed today and becomes eligible tomorrow', () => {
  const run=app();
  assert.equal(run(`(()=>{S.prog={'old:1':{a:1,c:0,w:1,sk:0,m:1,t:1,l:'w'}};startDailyReview();doSkip();const p=S.prog['old:1'];return p.dr===dayKey()&&dailyPlan().done===1&&!dailyReason(p)&&!!dailyReason(p,addDays(dayKey(),1))})()`),true);
});
test('daily queue is isolated by space, keeps dates in backups and does not reveal keys', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'old',questions:[{...question,answer:['A','B']}]},{id:'capf::old',questions:[question]}];rebuild();S.prog={'old:1':{a:1,m:1,l:'w',t:1,dr:dayKey()},'capf::old:1':{a:1,m:1,l:'w',t:1}};S.space='capf';rebuild();const plan=dailyPlan();const preview=viewDaily();return plan.done===0&&plan.items.length===1&&plan.items[0].q.packId==='capf::old'&&!preview.includes('Answer key accepts')&&!preview.includes('Solution')&&parseBackup(buildBackup()).progress.old['1'].dr===dayKey()})()`),true);
});
test('reasoning survives navigation and grading and cannot be edited after reveal', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{S.packs[0].questions.push({...question,no:2});rebuild();startQuiz(['old:1','old:2'],{mode:'practice'});doPick('A');events.input.forEach(fn=>fn({target:{id:'reasoning',value:'I ruled out B because <script>alert(1)</script>'}}));goTo(1);goTo(0);const before=viewQuiz();doCheck();events.input.forEach(fn=>fn({target:{id:'reasoning',value:'Changed after reveal'}}));await flush();const p=S.prog['old:1'];return before.includes('I ruled out B')&&p.rn.includes('<script>')&&p.first.reason===p.rn&&S.quiz.rn['old:1']===p.rn&&viewQuiz().includes('&lt;script&gt;')&&!viewQuiz().includes('<script>')&&progress.get('old')['1'].rn===p.rn})()`),true);
});
test('reasoning is optional and exam notes are saved only on submission', () => {
  const run=app();
  assert.equal(run(`(()=>{startQuiz(['old:1'],{mode:'exam'});doPick('A');S.quiz.rn['old:1']='An explanation';const before=!S.prog['old:1']&&!viewQuiz().includes('Your reasoning before reveal');finishQuiz();S.quiz.rv=0;return before&&S.prog['old:1'].rn==='An explanation'&&viewReview().includes('An explanation')})()`),true);
});
test('first outcome stays unchanged while repeat results accumulate separately', () => {
  const run=app();
  assert.equal(run(`(()=>{const first=recordAnswer('old:1','B',{reason:'First thought'});const again=recordAnswer('old:1','A',{reason:'Revised thought'});recordAnswer('old:1','B');const p=S.prog['old:1'],stats=performanceStats();return first.attemptType==='first'&&again.attemptType==='repeat'&&!p.first.ok&&p.first.reason==='First thought'&&stats.first.a===1&&stats.first.c===0&&stats.repeat.a===2&&stats.repeat.c===1})()`),true);
});
test('legacy attempts remain unknown and their new repeats are tracked', () => {
  const run=app();
  assert.equal(run(`(()=>{S.prog={'old:1':{a:5,c:4,w:1,sk:0}};const out=recordAnswer('old:1','A');const stats=performanceStats();return out.attemptType==='repeat'&&!S.prog['old:1'].first&&stats.unknown===1&&stats.first.a===0&&stats.repeat.a===1&&stats.repeat.c===1})()`),true);
});
test('first skips remain distinct from later answers and deferred daily questions are excluded', () => {
  const run=app();
  assert.equal(run(`(()=>{recordSkip('old:1');recordAnswer('old:1','A');const stats=performanceStats();const summary=sessionPerformance([{attemptType:'first',skipped:true},{attemptType:'repeat',ok:true},{deferred:true,skipped:true}]);return stats.first.sk===1&&stats.first.a===0&&stats.repeat.a===1&&stats.repeat.c===1&&summary.first.sk===1&&summary.repeat.a===1})()`),true);
});
test('session statistics classify mixed first and repeat answers', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs[0].questions.push({...question,no:2});rebuild();S.prog['old:2']={a:1,c:0,w:1,sk:0};startQuiz(['old:1','old:2'],{mode:'exam'});doPick('A');goTo(1);doPick('B');finishQuiz();const stats=sessionPerformance(Object.values(S.quiz.res));return stats.first.a===1&&stats.first.c===1&&stats.repeat.a===1&&stats.repeat.c===0&&viewResult().includes('This session: first attempts vs repeats')})()`),true);
});
test('first and repeat history and reasoning round-trip through backup and stay isolated by space', () => {
  const run=app();
  assert.equal(run(`(()=>{recordAnswer('old:1','B',{reason:'My reasoning'});recordAnswer('old:1','A');const b=parseBackup(buildBackup());S.packs.push({id:'capf::other',questions:[question]});S.space='capf';rebuild();return b.progress.old['1'].first.reason==='My reasoning'&&b.progress.old['1'].repeat.a===1&&performanceStats().first.a===0&&performanceStats().repeat.a===0&&buildAnalysis().includes('first_result')})()`),true);
});
function yearFixture(run) {
  run(`S.space='capf';S.packs=[{id:'capf::a',title:'Paper part A',questions:[{...question,year:'2021'},{...question,no:2,year:'2020'}]},{id:'capf::b',title:'Paper part B',questions:[{...question,year:'2021'}]},{id:'static-paper',title:'Other',questions:[{...question,year:'2021'}]}];rebuild();S.prog={'capf::a:1':{a:1,c:1,l:'c'},'capf::b:1':{a:1,w:1,l:'w',x:'B'}};`);
}
test('CAPF year attempts include only that year across files, including answered questions', () => {
  const run=app();yearFixture(run);
  assert.equal(run(`(()=>{S.newMode='exam';attemptPyqYear('2021');return S.quiz.uids.length===2&&S.quiz.uids.includes('capf::a:1')&&S.quiz.uids.includes('capf::b:1')&&S.quiz.mode==='exam'&&S.quiz.label==='2021'})()`),true);
});
test('CAPF year review filters and navigation work across source files', () => {
  const run=app();yearFixture(run);
  assert.equal(run(`(()=>{reviewPyqYear('2021');const all=trList();const html=viewTest();S.tr.f='bad';const wrong=trList();return all.list.length===2&&html.includes('CAPF PYQs · 2021')&&html.includes('Paper part A')&&wrong.list.length===1&&wrong.list[0].uid==='capf::b:1'&&viewTest().includes('Wrong')})()`),true);
});
test('year metadata takes precedence over a unique title year; ambiguous and absent years stay unassigned', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'x',title:'CAPF 2020'},{id:'y',title:'CAPF 2020–2021'},{id:'z',title:'CAPF PYQs'}];return pyqYear({packId:'x',year:'2021'})==='2021'&&pyqYear({packId:'x'})==='2020'&&pyqYear({packId:'y'})==='unknown'&&pyqYear({packId:'z'})==='unknown'})()`),true);
});
test('CAPF replaces the old test sections while Static keeps them', () => {
  const run=app();yearFixture(run);
  assert.equal(run(`(()=>{const capf=viewHome();S.space='static';rebuild();const original=viewHome();return capf.includes('CAPF PYQs by year')&&!capf.includes('Tests not attempted yet')&&!capf.includes('<h2>Review a test</h2>')&&capf.indexOf('data-v="2021"')<capf.indexOf('data-v="2020"')&&original.includes('Tests not attempted yet')&&original.includes('<h2>Review a test</h2>')&&!original.includes('CAPF PYQs by year')})()`),true);
});
test('import year fills missing metadata without overwriting explicit years', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{S.space='capf';S.imp={year:'2021',parsed:{id:'capf::new',title:'CAPF',questions:[{...question},{...question,no:2,year:'2020'}]},dups:[]};await applyImport(false);const q=disk.get('capf::new').questions;return q[0].year==='2021'&&q[1].year==='2020'})()`),true);
});
test('year attempts are unavailable outside exam spaces and missing year groups remain usable', () => {
  const run=app();
  assert.equal(run(`(()=>{S.packs=[{id:'capf::new',title:'CAPF',questions:[question]}];S.space='capf';rebuild();attemptPyqYear('unknown');const works=S.quiz.uids.length===1&&S.quiz.label==='Year not set';S.quiz=null;S.space='static';rebuild();attemptPyqYear('2021');return works&&S.quiz===null})()`),true);
});
test('paper and top-level year import metadata are retained', () => {
  const run=app();
  assert.equal(run(`(()=>{const q={question:'Example',options:{A:'One',B:'Two'},answer:'A'};return parseImport(JSON.stringify({subject:'CAPF',paper:{year:2021},questions:[q]})).questions[0].year==='2021'&&parseImport(JSON.stringify({subject:'CAPF',year:2020,questions:[q]})).questions[0].year==='2020'})()`),true);
});
test('CSE has the full exam platform and keeps year attempts separate from CAPF', () => {
  const run=app();yearFixture(run);
  assert.equal(run(`(()=>{S.packs.push({id:'cse::paper',title:'CSE PYQ 2021',questions:[{...question,year:'2021'}]});S.space='cse';rebuild();const home=viewHome();attemptPyqYear('2021');const isolated=S.quiz.uids.join()==='cse::paper:1'&&S.quiz.kind==='CSE year PYQ';reviewPyqYear('2021');return isolated&&home.includes('CSE PYQ Practice')&&home.includes('Daily revision')&&home.includes('First attempts vs repeat practice')&&home.includes('CSE PYQs by year')&&header().includes('data-v="import"')&&viewTest().includes('CSE PYQs · 2021')&&!home.includes('reserved for later')})()`),true);
});
test('year-wise PYQs are the final home section in both exam spaces', () => {
  const run=app();yearFixture(run);
  assert.equal(run(`(()=>{S.packs.push({id:'cse::paper',title:'CSE 2020',questions:[{...question,year:'2020'}]});return ['capf','cse'].every(space=>{S.space=space;rebuild();const html=viewHome();return html.lastIndexOf('<section class="card">')===html.indexOf('<section class="card"><div class="row sp"><h2>'+spaceName()+' PYQs by year')&&html.indexOf(spaceName()+' PYQs by year')>html.indexOf('Memory Heatmap')&&!html.includes('Tests not attempted yet')&&!html.includes('<h2>Review a test</h2>')})})()`),true);
});
test('CSE imports support optional year metadata and preserve exam identity in backup', async () => {
  const run=app();
  assert.equal(await run(`(async()=>{S.space='cse';S.imp={year:'2020',parsed:{id:scopedPackId('new'),title:'CSE PYQs',questions:[question]},dups:[]};await applyImport(false);const backup=parseBackup(buildBackup());return disk.get('cse::new').questions[0].year==='2020'&&backup.packs.some(p=>p.id==='cse::new')&&pyqYearQuestions('2020').length===1})()`),true);
});
test('CSE compacts blank question lines without changing stored text or other spaces', () => {
  const run=app();
  assert.equal(run(String.raw`(()=>{const raw='Prompt\n\n\n1. First statement\n\n2. Second statement\n\nSelect an option';S.packs[0].questions[0].text=raw;S.space='cse';const compact=questionDisplayText(raw);const table=fmtQ('| A | B |\n|---|---|\n| One | Two |\n\n| C | D |\n|---|---|\n| Three | Four |');S.space='static';return compact==='Prompt\n1. First statement\n2. Second statement\nSelect an option'&&S.packs[0].questions[0].text===raw&&questionDisplayText(raw)===raw&&(table.match(/<table>/g)||[]).length===2})()`),true);
});
test('CSE topic grid keeps import order, counts and topic selections', () => {
  const run=app();
  assert.equal(run(`(()=>{S.space='cse';const items=[{...question,topic:'Early Medieval India'},{...question,no:2,topic:'Delhi Sultanate'},{...question,no:3,topic:'Bhakti Movement'}];const g=groupBySubject(items),o={subjects:new Set(['Science']),topics:new Set(['Science›Bhakti Movement'])};const html=topicGroups(o,g,['Science']);S.space='static';const original=topicGroups(o,g,['Science']);return html.includes('topic-grid')&&(html.match(/class="topic-card"/g)||[]).length===3&&html.indexOf('Early Medieval India')<html.indexOf('Delhi Sultanate')&&html.includes('aria-pressed="true" data-act="topic" data-v="Science›Bhakti Movement"')&&!original.includes('topic-grid')&&original.includes('class="chip"')})()`),true);
});
test('notebook overview counts open mistakes once per question and only in the active space', () => {
  const run=app();
  assert.equal(run(`(()=>{S.space='cse';S.packs=[{id:'cse::demo',questions:[{...question,subject:'Polity'},{...question,no:2,subject:'Polity'},{...question,no:3,subject:'Geography'},{...question,no:4,subject:'Geography'}]},{id:'capf::demo',questions:[question]}];S.prog={'cse::demo:1':{m:1,w:9},'cse::demo:2':{m:1,sk:2},'cse::demo:3':{m:1,w:1},'cse::demo:4':{m:0,w:3},'capf::demo:1':{m:1,w:1}};rebuild();const rows=notebookSubjects();return rows.length===2&&rows[0].subject==='Polity'&&rows[0].count===2&&rows[1].count===1&&notebookOverview().includes('2 subjects · Polity leads with 2')})()`),true);
});
