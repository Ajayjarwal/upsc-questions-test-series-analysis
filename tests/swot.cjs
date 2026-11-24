const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(__dirname+'/../js/mapping-storage.js','utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const core=source.slice(0,source.lastIndexOf('\nrender();'));
const demoSource="function swotDemoBank(){\n  const packs=[],prog={},now=Date.now(),today=dayKey();\n  const general=[[\"Indian Polity and Governance\",[\"Federalism\",\"Parliament\"]],[\"Geography\",[\"Physical Geography\",\"Climate\"]],[\"Economy\",[\"Banking\",\"Inflation\"]],[\"Environment and Ecology\",[\"Biodiversity\",\"Climate Change\"]],[\"Modern Indian History\",[\"National Movement\",\"Constitutional Developments\"]]];\n  const aptitude=[[\"Quantitative Aptitude\",[\"Percentages\",\"Ratio and proportion\"]],[\"Logical Reasoning\",[\"Syllogisms\",\"Seating arrangements\"]],[\"Reading Comprehension\",[\"Inference\",\"Assumptions\"]]];\n  Object.keys(SPACES).forEach((space,si)=>{\n    const byYear={2024:[],2023:[]},itemsByYear={2024:{},2023:{}},subjects=space===\"csat\"?aptitude:general;\n    subjects.forEach(([subject,topics],sj)=>topics.forEach((topic,tj)=>{\n      for(let k=0;k<6;k++){\n        const year=k<3?2024:2023,no=byYear[year].length+1,j=si*60+sj*12+tj*6+k,source=space===\"csat\"&&k!==5?(k%2?\"CAPF\":\"CSE\"):\"\";\n        const q={no,subject,topic,text:`Illustrative question about ${topic}.\\nChoose an option to explore the practice interface.`,options:{A:\"First sample option\",B:\"Second sample option\",C:\"Third sample option\",D:\"Fourth sample option\"},answer:\"A\",exp:\"This is sample content for the design preview, not an official examination question.\",sum:\"Demo content only.\",year:String(year),mo:space===\"ca\"?\"2026-\"+(year===2024?\"11\":\"10\"):\"\",source_exam:source,...(j%5?{question_type:[\"factual\",\"conceptual\",\"analytical\",\"application\"][j%4]}:{})};\n        byYear[year].push(q);\n        if(space===\"capf\"&&sj===2&&tj===1)continue;\n        const threshold=[5,4,2,1][(sj+tj+si)%4],firstOk=k<threshold,skipped=j%19===0,repeats=j%3===0&&!skipped?2:0,latestOk=repeats?(firstOk||j%2===0):firstOk,confidence=[\"s\",\"s\",\"h\",\"g\",\"s\"][j%5];\n        const days=(sj+tj+si)%5===0?45+k:[45,8,18,65,0,32][k],time=45+(j*17)%130;\n        const p={a:skipped?0:1+repeats,c:skipped?0:(firstOk?1:0)+(repeats?(latestOk?2:1):0),w:skipped?0:(firstOk?0:1)+(repeats?(latestOk?0:1):0),sk:skipped?1:0,l:skipped?\"\":latestOk?\"c\":\"w\",x:!skipped&&!latestOk?\"B\":\"\",m:skipped||!latestOk||(!firstOk&&j%2===0)?1:0,t:now-days*86400000,cf:skipped?\"\":confidence,tm:time,ts:skipped?0:time*(1+repeats),tn:skipped?0:1+repeats,sl:!skipped&&latestOk&&time>SLOW_S?1:0,b:j%23===0?1:0,bx:latestOk?3:1,dd:addDays(today,latestOk&&j%3?4:-2),wy:[\"k\",\"c\",\"m\",\"s\"][j%4],cd:[]};\n        if(j%17!==0)p.first={pick:skipped?\"\":firstOk?\"A\":\"B\",ok:firstOk&&!skipped,skipped,cf:confidence,t:now-70*86400000,reason:\"Demo reasoning\"};\n        if(repeats)p.repeat={a:2,c:latestOk?2:1,sk:0};\n        if(p.m&&latestOk&&confidence===\"s\")p.cd=[addDays(today,-5),addDays(today,-2)];\n        if(j%29===0){p.dr=today;p.t=now;}\n        itemsByYear[year][no]=p;\n      }\n    }));\n    for(const year of [2024,2023]){const id=scopedPackId(\"swot-demo-\"+year,space);packs.push({id,title:`Demo ${SPACES[space].label} \u00b7 ${year}`,sample:true,ts:now,questions:byYear[year]});prog[id]=itemsByYear[year];}\n  });\n  return {packs,prog};\n}";
function fixture(){
  const storage=new Map(),events={},nodes=new Map(),scrolls=[];
  const makeNode=()=>({innerHTML:'',open:false,scrollTop:0,setAttribute(){},focus(){},querySelector(){return {focus(){}};},addEventListener(){},showModal(){this.open=true;},scrollIntoView(){},close(){this.open=false;}});
  const node=id=>{if(!nodes.has(id))nodes.set(id,makeNode());return nodes.get(id);};
  const context=vm.createContext({TextEncoder,URL,URLSearchParams,structuredClone,location:{hostname:'localhost',search:''},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:node,querySelector:node,createElement:makeNode,body:{classList:{add(){},remove(){}},appendChild(){}},documentElement:{setAttribute(){}},addEventListener(type,fn){(events[type]??=[]).push(fn);}},window:{scrollY:0,matchMedia:()=>({matches:false}),scrollTo(...args){scrolls.push(args);}}});
  vm.runInContext(core,context);vm.runInContext(demoSource,context);
  const run=code=>vm.runInContext(code,context);
  run(`const dashboardRenderer=render;const demo=swotDemoBank();S.packs=demo.packs;applyProg(demo.prog);rebuild();S.ready=true;S.auth='none';render=()=>{};`);
  return {run,storage,events,nodes,scrolls};
}
test('Mixed contains all sections; individual and CSAT-source views remain isolated',()=>{
  const {run}=fixture();
  assert.equal(run(`Object.keys(SPACES).every(space=>dashQuestions(space,'').every(q=>q.space===space))&&dashQuestions('mixed','').length===Object.keys(SPACES).reduce((n,space)=>n+dashQuestions(space,'').length,0)`),true);
  assert.equal(run(`['CSE','CAPF','untagged'].every(source=>dashQuestions('csat',source).every(q=>source==='untagged'?!q.source_exam:q.source_exam===source))`),true);
});
test('analysis and chart rendering never change active practice space, questions or progress',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{const before=JSON.stringify({packs:S.packs,prog:S.prog,space:S.space,qs:S.qs});for(const scope of ['mixed',...Object.keys(SPACES)])for(const mode of ['first','latest','repeat']){DASH.scope=scope;DASH.mode=mode;viewSwot();}return before===JSON.stringify({packs:S.packs,prog:S.prog,space:S.space,qs:S.qs});})()`),true);
});
test('first, latest and repeat bases use distinct recorded outcomes without inventing missing history',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{const q={uid:'test:1'};S.prog={'test:1':{a:3,l:'c',first:{ok:false,skipped:false},repeat:{a:2,c:2,sk:1}}};return dashStats([q],'first').pct===0&&dashStats([q],'latest').pct===100&&dashStats([q],'repeat').n===2&&dashStats([q],'repeat').pct===100&&dashStats([q],'repeat').sk===1;})()`),true);
  assert.equal(run(`(()=>{const q={uid:'test:1'};S.prog={'test:1':{a:5,l:'c'}};const a=dashStats([q],'first');return a.pct===null&&a.unknown===1&&a.band==='unrecorded';})()`),true);
});
test('small samples and unanswered topics are kept out of established SWOT bands',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{const qs=Array.from({length:4},(_,i)=>({uid:'test:'+i}));S.prog=Object.fromEntries(qs.map(q=>[q.uid,{a:1,l:'c',first:{ok:true},repeat:{a:20,c:20}}]));return dashStats(qs,'first').band==='limited'&&dashStats(qs,'repeat').band==='limited'&&dashStats([{uid:'new'}],'latest').band==='new'&&dashStats([{uid:'new'}],'latest').pct===null;})()`),true);
});
test('the displayed percentage bands use enough distinct questions and include boundary values consistently',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{const qs=Array.from({length:10},(_,i)=>({uid:'test:'+i}));return [[8,'strength'],[7,'opportunity'],[6,'opportunity'],[3,'weakness'],[2,'threat']].every(([correct,band])=>{S.prog=Object.fromEntries(qs.map((q,i)=>[q.uid,{a:1,first:{ok:i<correct}}]));return dashStats(qs,'first').band===band;});})()`),true);
});
test('coverage, confidence, due reviews and recorded timing use their own denominators',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{const qs=[{uid:'a'},{uid:'b'},{uid:'c'}];S.prog={a:{a:2,l:'w',m:1,cf:'s',dd:addDays(dayKey(),-2),ts:120,tn:2,w:2},b:{a:1,l:'c',cf:'s',dd:addDays(dayKey(),-1),dr:dayKey(),ts:60,tn:1},c:{sk:1,m:1,dd:addDays(dayKey(),1)}};const a=dashStats(qs,'latest');return a.n===2&&a.ok===1&&a.answered===2&&a.surePct===50&&a.confWrong===1&&a.repeated===1&&a.due===1&&a.done===1&&a.avgTime===60;})()`),true);
});
test('the subject profile draws exactly one personal data series and includes evidence counts',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{const html=dashRadar(dashSubjectRows(dashQuestions()));return (html.match(/class="swot-radar-you"/g)||[]).length===1&&html.includes('One series showing your')&&html.includes('distinct questions')&&!html.toLowerCase().includes('cohort');})()`),true);
});
test('SWOT band and topic searches filter tiles without rewriting the underlying banks',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{const rows=dashRows();DASH.band='threat';DASH.query='polity';const filtered=dashFilteredRows(rows);return filtered.length>0&&filtered.every(r=>r.stats.band==='threat'&&r.subject.toLowerCase().includes('polity'));})()`),true);
});
test('topic drill-down configures the right bank and respects a CSAT source selection',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{DASH.scope='csat';DASH.source='CAPF';const row=dashRows().find(r=>r.subject==='Quantitative Aptitude');const before=JSON.stringify(S.prog);dashPractise(row);return !DASH.open&&S.space==='csat'&&S.view==='wiz'&&S.step===2&&S.sel.sourceExam==='CAPF'&&pool().every(q=>q.source_exam==='CAPF')&&before===JSON.stringify(S.prog);})()`),true);
});
test('priority topic drill-down remains available in the subject heatmap view',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{DASH.heatBy='subject';const topic=dashRows(dashQuestions(),DASH.mode,'topic')[0];DASH.detail=topic.id;return dashTopicDetail(dashRows()).includes('Practise this topic');})()`),true);
});
test('question-type panels rely on explicit tags and treat untagged questions separately',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{const qs=dashQuestions();const html=dashExtraPanels(qs,dashRows(),dashStats(qs));return qs.some(q=>!q.question_type)&&html.includes('questions have no question_type tag')&&html.includes('Types are not inferred');})()`),true);
});
test('production uses its existing boot without demo data or preview storage keys',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(source.includes('(async function boot(){'));
  assert.ok(!source.includes('function swotDemoBank'));
  assert.ok(!source.includes('solo-ui-lab-swot'));
  assert.ok(!source.includes('Design preview · Demo data'));
  assert.ok(!html.includes("connect-src 'none'"));
  assert.ok(!source.includes('["heat","Heat map","heat"]'));
  const {run}=fixture();assert.equal(run(`dashMenuItem().includes('Dashboard')&&viewSwot().includes('id="swot-heatmap"')`),true);
});
test('topic cards open and update a modal without rebuilding or scrolling the dashboard',()=>{
  const {run,events,nodes,scrolls}=fixture();
  const key=run('dashRows()[0].id');
  run('render=()=>{throw Error("Dashboard must stay in place");};');
  const dispatch=act=>{const el={dataset:{dashAct:act,key}};events.click.at(-1)({target:{closest:()=>el}});};
  dispatch('detail');
  assert.equal(nodes.get('swot-topic-dialog').open,true);
  assert.ok(nodes.get('swot-topic-dialog').innerHTML.includes('Practise this topic'));
  dispatch('review-topic');
  assert.ok(nodes.get('swot-topic-dialog').innerHTML.includes('swot-review-list'));
  dispatch('close-detail');
  assert.equal(nodes.get('swot-topic-dialog').open,false);
  assert.deepEqual(scrolls,[]);
});
test('large subject groups reveal twelve topics at a time and remember disclosure state',()=>{
  const {run,events}=fixture();
  const key=run(`JSON.stringify([DASH.scope,DASH.source,DASH.heatBy,'Large subject'])`);
  assert.equal(run(`(()=>{const row=dashRows()[0];const items=Array.from({length:29},(_,i)=>({...row,id:'large:'+i,label:'Topic '+i,subject:'Large subject'}));const html=dashHeatGroup('Large subject',items,1);return (html.match(/class="swot-heat-tile /g)||[]).length===12&&html.includes('Show next 12 topics');})()`),true);
  events.toggle.at(-1)({target:{dataset:{dashGroup:key},open:true}});
  assert.equal(run(`DASH.heatOpen[${JSON.stringify(key)}]`),true);
  const el={dataset:{dashAct:'more-topics',key}};events.click.at(-1)({target:{closest:()=>el}});
  assert.equal(run(`DASH.heatLimits[${JSON.stringify(key)}]`),24);
  assert.equal(run(`(()=>{const row=dashRows()[0],items=Array.from({length:29},(_,i)=>({...row,id:'large:'+i,label:'Topic '+i,subject:'Large subject'}));const html=dashHeatGroup('Large subject',items,1);DASH.query='Topic 28';const filtered=dashFilteredRows(items);return (html.match(/class="swot-heat-tile /g)||[]).length===24&&html.includes('Show next 5 topics')&&filtered.length===1&&filtered[0].label==='Topic 28';})()`),true);
});
test('overview keeps four metrics and moves detailed analysis into a closed disclosure',()=>{
  const {run,events}=fixture();
  assert.equal(run(`(()=>{const qs=dashQuestions(),a=dashStats(qs),main=dashMetrics(a),extra=dashMoreInsights(qs,dashRows(),a),view=viewSwot();return (main.match(/<div>/g)||[]).length===4&&!main.includes('Accuracy when sure')&&!main.includes('Recorded answer time')&&extra.includes('Accuracy when sure')&&extra.includes('Recorded answer time')&&extra.includes('How you approach questions')&&extra.includes('Your section balance')&&!extra.includes('swot-more-insights" open')&&!view.includes('swot-topic-table');})()`),true);
  events.toggle.at(-1)({target:{classList:{contains:name=>name==='swot-more-insights'},open:true}});
  assert.equal(run(`dashMoreInsights(dashQuestions(),dashRows(),dashStats(dashQuestions())).includes('swot-more-insights" open')`),true);
});
test('chart point score uses the selected accuracy basis and exposes evidence and limited data',()=>{
  const {run}=fixture();
  assert.equal(run(`(()=>{for(const mode of ['first','latest','repeat']){DASH.mode=mode;for(const s of dashSubjectRows(dashQuestions())){const html=dashRadarPoint(s,10,20);if(!html.includes(dashPercent(s.stats.pct))||!html.includes(dashModeName())||!html.includes(s.stats.ok+'/'+s.stats.n+' correct')||!html.includes('tabindex="0"'))return false;}}return dashRadarPoint({name:'Small sample',stats:{n:2,ok:1,pct:50,observed:2}},10,20).includes('Limited data');})()`),true);
});
test('SWOT cards filter results then request smooth scrolling to the heatmap',()=>{
  const {run,events,nodes}=fixture(),calls=[];
  nodes.set('swot-heatmap',{scrollIntoView:options=>calls.push(options)});
  for(const band of ['strength','opportunity','weakness','threat']){
    const el={dataset:{dashAct:'band',value:band}};
    events.click.at(-1)({target:{closest:()=>el}});
    assert.equal(run('DASH.band'),band);
    assert.equal(calls.at(-1).block,'start');assert.equal(calls.at(-1).behavior,'smooth');
  }
});
test('dashboard keyboard events cannot answer a quiz left behind it',()=>{
  const {run,events}=fixture();
  run(`const q=S.qs[0];startQuiz([q.uid],{mode:'practice'});doPick('A');DASH.open=true;`);
  const before=run('JSON.stringify(S.prog)');
  for(const key of ['Enter','s','a','ArrowRight'])for(const handler of events.keydown)handler({key,target:{tagName:'BODY',dataset:{}},preventDefault(){}});
  assert.equal(run('Object.keys(S.quiz.res).length'),0);assert.equal(run('JSON.stringify(S.prog)'),before);
});
test('sign-out removes any topic drawer before rendering the login screen',()=>{
  const {run,nodes}=fixture();
  run(`openDashTopic(dashRows()[0].id,null);S.auth='login';dashboardRenderer();`);
  assert.equal(nodes.get('swot-topic-dialog').open,false);
  assert.equal(run('DASH.detail'),null);
  assert.ok(nodes.get('app').innerHTML.includes('aemail'));
});
