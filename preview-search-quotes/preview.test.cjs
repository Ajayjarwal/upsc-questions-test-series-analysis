const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const core=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const feature=fs.readFileSync(path.join(__dirname,'preview.js'),'utf8').replace(/bootDesignPreview\(\);\s*$/,'');
function fixture(){
  const storage=new Map(),events={};
  const context=vm.createContext({TextEncoder,URL,URLSearchParams,structuredClone,location:{hostname:'localhost',search:''},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById(){return {}},addEventListener(type,fn){(events[type]??=[]).push(fn)}},window:{scrollTo(){}}});
  vm.runInContext(core,context);vm.runInContext(feature,context);
  vm.runInContext(`S.space='cse';S.packs=previewDemoPacks();rebuild();`,context);
  return code=>vm.runInContext(code,context);
}
test('federalism searches question and solution, with related results last',()=>{
  const run=fixture();assert.equal(run(`JSON.stringify(cseSearch('FEDERALISM').map(r=>[r.q.no,r.direct,r.fields]))`),JSON.stringify([[1,true,['Question','Solution']],[3,true,['Solution']],[2,false,['Question','Solution','Topic label']]]));
  assert.equal(run(`cseSearch('federalism',false).length`),2);
});
test('centre/center, punctuation and singular/plural relation aliases work',()=>{
  const run=fixture();for(const term of ['state-center relation','Centre–State relations','center-state relation'])assert.equal(run(`cseSearch(${JSON.stringify(term)}).length`),3);
});
test('whole words, option text, empty and unknown searches work',()=>{
  const run=fixture();assert.equal(run(`cseSearch('   ').length+cseSearch('zzz-no-match').length`),0);
  assert.equal(run(`(()=>{S.qs=[{...S.qs[0],text:'Estates are discussed',exp:'',sum:'',options:{A:'A federalism example'}}];const r=cseSearch('federalism');return r.length===1&&r[0].fields.join()==='Options'&&cseSearch('state').length===0})()`),true);
});
test('search never changes progress and excludes all other spaces',()=>{
  const run=fixture();assert.equal(run(`(()=>{S.prog={'cse::design-demo:1':{a:4,m:1}};const before=JSON.stringify(S.prog);cseSearch('federalism');viewCseSearch();return before===JSON.stringify(S.prog)&&['static','ca','capf'].every(space=>{S.space=space;return cseSearch('federalism').length===0&&!viewHome().includes('data-preview-act="search-open"')})})()`),true);
});
test('only CSE exposes search and answer details stay collapsed',()=>{
  const run=fixture();assert.equal(run(`viewHome().includes('data-preview-act="search-open"')&&viewCseSearch().includes('id="cse-search-form"')`),true);
  assert.equal(run(`(()=>{const html=searchResult(cseSearch('federalism')[0]);return html.includes('<details class="search-answer">')&&!html.includes('<details open')})()`),true);
});
test('search highlights normalized phrases and escapes imported HTML',()=>{
  const run=fixture();assert.equal(run(`searchHighlight('<img src=x> Centre–State relations & federalism',['centre state relation','federalism'])`),'&lt;img src=x&gt; <mark>Centre–State relations</mark> &amp; <mark>federalism</mark>');
});
test('religion expands to its subtopics while exact-only mode does not',()=>{
  const run=fixture();assert.equal(run(`cseSearch('religion').length`),4);
  assert.equal(run(`cseSearch('religion').every(r=>!r.direct&&r.q.packId==='cse::design-religion-demo')`),true);
  assert.equal(run(`cseSearch('religion',false).length`),0);
  assert.equal(run(`cseSearch('religions').length`),4);
});
test('narrow religious queries do not expand to every religion',()=>{
  const run=fixture();assert.equal(run(`searchPlan('Buddhism').aliases.includes('jainism')`),false);
  // A question may mention Buddhism in an option; that is a real text match.
  assert.equal(run(`(()=>{const base=S.qs[0];S.qs=[{...base,no:1,text:'The Eightfold Path is taught here',options:{A:'Yes'},topic:'Buddhism',exp:'',sum:''},{...base,no:2,text:'Mahavira is discussed here',options:{A:'Yes'},topic:'Jainism',exp:'',sum:''}];return cseSearch('Buddhism').length===1&&cseSearch('Buddhism')[0].q.no===1})()`),true);
});
test('topic labels can find a question even without the word in its text',()=>{
  const run=fixture();assert.equal(run(`(()=>{S.qs=[{...S.qs[0],text:'Consider these teachings',options:{A:'One'},topic:'Buddhism',exp:'',sum:''}];const result=cseSearch('religion');return result.length===1&&result[0].fields.join()==='Topic label'&&result[0].terms.includes('buddhism')&&cseSearch('religion',false).length===0})()`),true);
});
test('quote import accepts supported formats and rejects invalid entries',()=>{
  const run=fixture();assert.equal(run(`JSON.stringify(parseQuoteJson(JSON.stringify({quotes:[{quote:'  Keep going  ',author:'  Me '},'Another quote']})))`),JSON.stringify([{text:'Keep going',author:'Me'},{text:'Another quote',author:''}]));
  for(const data of [[],{},[null],[{text:''}],[{text:'Good',author:5}],['x'.repeat(2001)]])assert.throws(()=>run(`parseQuoteJson(${JSON.stringify(JSON.stringify(data))})`));
  assert.throws(()=>run(`parseQuoteJson('{bad json')`));
});
test('daily quote remains stable within local day and rotates next day',()=>{
  const run=fixture();assert.equal(run(`(()=>{const quotes=[{text:'A'},{text:'B'},{text:'C'}];const a=quoteForDay(quotes,new Date(2026,10,2,0,1)),b=quoteForDay(quotes,new Date(2026,10,2,23,59)),c=quoteForDay(quotes,new Date(2026,10,3,0,1));return a===b&&b!==c})()`),true);
});
test('preview removes cloud boot and blocks connections',()=>{
  assert.ok(html.includes("connect-src 'none'"));assert.ok(!html.includes('async function boot()'));assert.ok(!html.includes('sb_publishable_'));assert.ok(!html.includes('"rd_space"'));assert.ok(!html.includes('"rd_theme"'));
});
