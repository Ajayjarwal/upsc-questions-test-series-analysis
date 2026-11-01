const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(source);
function app() {
  const context = vm.createContext({
    TextEncoder, URL, URLSearchParams, structuredClone,
    location: {hostname: 'localhost', search: ''},
    setTimeout: () => 0, clearTimeout() {},
    localStorage: {getItem() { return null; }},
    document: {getElementById() { return {}; }, addEventListener() {}},
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
  assert.equal(run(`(()=>{S.prog={'old:1':{a:0,sk:0,cd:['2020-01-01'],bx:5}};recordSkip('old:1');const p=S.prog['old:1'];return p.dd===addDays(dayKey(),1)&&dueDay(p)===p.dd&&p.cd.length===0&&p.bx===1&&viewHome().includes('Due today:')})()`), true);
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
