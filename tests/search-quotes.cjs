const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const script=fs.readFileSync(__dirname+'/../js/mapping-storage.js','utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const core=script.slice(0,script.lastIndexOf('\nrender();'));
const demoSource=String.raw`function previewDemoPacks(){
  const common={subject:"Indian Polity and Governance",answer:"A",options:{A:"Statement 1 only",B:"Statement 2 only",C:"Both statements",D:"Neither statement"}};
  const questions=[
    {...common,no:1,year:"2023",topic:"Federalism",text:"With reference to cooperative federalism in India, consider the following statements:\n1. Cooperation between the Union and States can support policy implementation.\n2. The Constitution removes every division of legislative powers.\nWhich of the statements given above is correct?",exp:"Cooperative federalism involves collaboration between different levels of government. The Constitution divides legislative powers between the Union and the States.",sum:"Cooperation operates within a constitutional distribution of powers."},
    {...common,no:2,year:"2021",topic:"Centre–State relations",text:"With reference to Centre–State relations, consider the following statements:\n1. The Seventh Schedule contains the Union, State and Concurrent Lists.\n2. All residuary legislative powers belong to the States.\nWhich statement is correct?",exp:"The Seventh Schedule distributes legislative subjects. Residuary legislative powers rest with Parliament.",sum:"The Seventh Schedule is central to the distribution of legislative subjects."},
    {...common,no:3,year:"2020",topic:"Constitutional bodies",text:"Consider the following statements about the Inter-State Council:\n1. Article 263 provides for its establishment.\n2. Its recommendations are equivalent to binding judicial decisions.\nWhich statement is correct?",exp:"The Inter-State Council provides a forum for discussion of matters of common interest. It is a mechanism of cooperative federalism, rather than a court issuing binding judgments."},
    {...common,no:4,year:"2022",topic:"Fundamental rights",text:"With reference to Article 32, consider the following statements:\n1. It provides a right to move the Supreme Court for enforcement of fundamental rights.\n2. It applies only to disputes between two State governments.\nWhich statement is correct?",exp:"Article 32 concerns constitutional remedies for enforcement of fundamental rights."},
    {...common,no:5,year:"2024",subject:"Economy",topic:"Monetary policy",text:"With reference to the repo rate, consider the following statements:\n1. It is a monetary policy instrument used by the Reserve Bank of India.\n2. It is the rate of income tax paid by banks.\nWhich statement is correct?",exp:"Monetary policy uses instruments including the repo rate to influence liquidity and borrowing costs."},
    {...common,no:6,year:"2024",subject:"Environment and Ecology",topic:"Biodiversity",text:"With reference to endemic species, consider the following statements:\n1. Their natural distribution is restricted to a particular geographical area.\n2. Endemism means a species is found naturally in every continent.\nWhich statement is correct?",exp:"Endemic species are restricted to a particular region. Their protection is relevant to biodiversity conservation."}
  ];
  const religionQuestions=[
    {no:1,subject:"Art and Culture",topic:"Buddhism",text:"The Four Noble Truths and the Eightfold Path are associated with which tradition?",options:{A:"Buddhism",B:"Jainism",C:"Sikhism",D:"Zoroastrianism"},answer:"A",exp:"The Four Noble Truths and the Eightfold Path are central teachings in Buddhism."},
    {no:2,subject:"Art and Culture",topic:"Jainism",text:"Mahavira is associated with which of the following traditions?",options:{A:"Jainism",B:"Bhakti",C:"Sufism",D:"Sikhism"},answer:"A",exp:"Mahavira is regarded in Jainism as the twenty-fourth Tirthankara."},
    {no:3,subject:"Medieval Indian History",topic:"Bhakti Movement",text:"Kabir is commonly studied in connection with which movement?",options:{A:"Bhakti movement",B:"Swadeshi movement",C:"Non-Cooperation movement",D:"Quit India movement"},answer:"A",exp:"Kabir is associated with the Bhakti movement, with an emphasis on devotion."},
    {no:4,subject:"Medieval Indian History",topic:"Sufism",text:"The Chishti silsila is associated with which tradition?",options:{A:"Sufism",B:"Jainism",C:"Buddhism",D:"Sikhism"},answer:"A",exp:"The Chishti silsila is a Sufi order. Sufism is a mystical tradition within Islam."}
  ];
  return [{id:"cse::design-demo",title:"Illustrative CSE demo · not official PYQs",sample:true,questions,ts:0},{id:"cse::design-religion-demo",title:"Religion search examples · not official PYQs",sample:true,questions:religionQuestions,ts:0}];
}
`;
function fixture(){
  const storage=new Map(),events={};
  const context=vm.createContext({TextEncoder,URL,URLSearchParams,structuredClone,location:{hostname:'localhost',search:''},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById(){return {}},addEventListener(type,fn){(events[type]??=[]).push(fn)}},window:{scrollTo(){}}});
  vm.runInContext(core,context);vm.runInContext(demoSource,context);
  vm.runInContext(`S.space='cse';S.packs=previewDemoPacks();rebuild();`,context);
  return code=>vm.runInContext(code,context);
}
test('federalism searches question and solution, with related results last',()=>{
  const run=fixture();assert.equal(run(`JSON.stringify(searchQuestions('FEDERALISM').map(r=>[r.q.no,r.direct,r.fields]))`),JSON.stringify([[1,true,['Question','Solution']],[3,true,['Solution']],[2,false,['Question','Solution','Topic label']]]));
  assert.equal(run(`searchQuestions('federalism',false).length`),2);
});
test('centre/center, punctuation and singular/plural relation aliases work',()=>{
  const run=fixture();for(const term of ['state-center relation','Centre–State relations','center-state relation'])assert.equal(run(`searchQuestions(${JSON.stringify(term)}).length`),3);
});
test('whole words, option text, empty and unknown searches work',()=>{
  const run=fixture();assert.equal(run(`searchQuestions('   ').length+searchQuestions('zzz-no-match').length`),0);
  assert.equal(run(`(()=>{S.qs=[{...S.qs[0],text:'Estates are discussed',exp:'',sum:'',options:{A:'A federalism example'}}];const r=searchQuestions('federalism');return r.length===1&&r[0].fields.join()==='Options'&&searchQuestions('state').length===0})()`),true);
});
test('search never changes progress and is unavailable in Static, Current Affairs and CAPF',()=>{
  const run=fixture();assert.equal(run(`(()=>{S.prog={'cse::design-demo:1':{a:4,m:1}};const before=JSON.stringify(S.prog);searchQuestions('federalism');viewQuestionSearch();return before===JSON.stringify(S.prog)&&['static','ca','capf'].every(space=>{S.space=space;return searchQuestions('federalism').length===0&&!viewHome().includes('data-feature-act="search-open"')})})()`),true);
});
test('CSE exposes search and answer details stay collapsed',()=>{
  const run=fixture();assert.equal(run(`viewHome().includes('data-feature-act="search-open"')&&viewQuestionSearch().includes('id="question-search-form"')`),true);
  assert.equal(run(`(()=>{const html=searchResult(searchQuestions('federalism')[0]);return html.includes('<details class="search-answer">')&&!html.includes('<details open')})()`),true);
});
test('search highlights normalized phrases and escapes imported HTML',()=>{
  const run=fixture();assert.equal(run(`searchHighlight('<img src=x> Centre–State relations & federalism',['centre state relation','federalism'])`),'&lt;img src=x&gt; <mark>Centre–State relations</mark> &amp; <mark>federalism</mark>');
});
test('religion expands to its subtopics while exact-only mode does not',()=>{
  const run=fixture();assert.equal(run(`searchQuestions('religion').length`),4);
  assert.equal(run(`searchQuestions('religion').every(r=>!r.direct&&r.q.packId==='cse::design-religion-demo')`),true);
  assert.equal(run(`searchQuestions('religion',false).length`),0);
  assert.equal(run(`searchQuestions('religions').length`),4);
});
test('narrow religious queries do not expand to every religion',()=>{
  const run=fixture();assert.equal(run(`searchPlan('Buddhism').aliases.includes('jainism')`),false);
  // A question may mention Buddhism in an option; that is a real text match.
  assert.equal(run(`(()=>{const base=S.qs[0];S.qs=[{...base,no:1,text:'The Eightfold Path is taught here',options:{A:'Yes'},topic:'Buddhism',exp:'',sum:''},{...base,no:2,text:'Mahavira is discussed here',options:{A:'Yes'},topic:'Jainism',exp:'',sum:''}];return searchQuestions('Buddhism').length===1&&searchQuestions('Buddhism')[0].q.no===1})()`),true);
});
test('topic labels can find a question even without the word in its text',()=>{
  const run=fixture();assert.equal(run(`(()=>{S.qs=[{...S.qs[0],text:'Consider these teachings',options:{A:'One'},topic:'Buddhism',exp:'',sum:''}];const result=searchQuestions('religion');return result.length===1&&result[0].fields.join()==='Topic label'&&result[0].terms.includes('buddhism')&&searchQuestions('religion',false).length===0})()`),true);
});
test('quote import accepts supported formats and rejects invalid entries',()=>{
  const run=fixture();assert.equal(run(`JSON.stringify(parseQuoteJson(JSON.stringify({quotes:[{quote:'  Keep going  ',author:'  Me '},'Another quote']})))`),JSON.stringify([{text:'Keep going',author:'Me'},{text:'Another quote',author:''}]));
  for(const data of [[],{},[null],[{text:''}],[{text:'Good',author:5}],['x'.repeat(2001)]])assert.throws(()=>run(`parseQuoteJson(${JSON.stringify(JSON.stringify(data))})`));
  assert.throws(()=>run(`parseQuoteJson('{bad json')`));
});
test('daily quote remains stable within local day and rotates next day',()=>{
  const run=fixture();assert.equal(run(`(()=>{const quotes=[{text:'A'},{text:'B'},{text:'C'}];const a=quoteForDay(quotes,new Date(2026,10,2,0,1)),b=quoteForDay(quotes,new Date(2026,10,2,23,59)),c=quoteForDay(quotes,new Date(2026,10,3,0,1));return a===b&&b!==c})()`),true);
});
test('production preserves authentication and contains no demo seeding',()=>{
  assert.ok(script.includes('async function boot()'));
  assert.ok(script.includes('CONFIG.requireLogin'));
  assert.ok(!script.includes('previewDemoPacks'));
  assert.ok(!script.includes('cse::design-demo'));
  assert.ok(!script.includes('Design preview · sample data'));
  assert.ok(script.includes('solo-daily-quotes-preview-v1'));
  assert.ok(script.includes('solo-daily-quotes-v1'));
});

test('CSAT searches its own questions and solutions with aptitude aliases and no CSE results',()=>{
  const run=fixture();
  assert.equal(run(`(()=>{
    const base={no:1,subject:'Quantitative Aptitude',topic:'Percentages',options:{A:'One',B:'Two'},answer:'A'};
    S.packs.push({id:'csat::paper',title:'CSAT 2021',questions:[{...base,text:'Find the percentages.'},{...base,no:2,topic:'Proportion',text:'A price changes.',exp:'The percent change is calculated from the initial value.'},{...base,no:3,topic:'Probability',text:'Find the chance of an event.'}]});
    S.space='csat';rebuild();const before=JSON.stringify(S.prog),all=searchQuestions('percentages'),exact=searchQuestions('percentages',false),page=viewQuestionSearch();
    return all.length===2&&all.every(r=>r.q.packId==='csat::paper')&&all[0].direct&&!all[1].direct&&all[1].fields.includes('Solution')&&exact.length===1&&page.includes('Search CSAT questions')&&page.includes('Back to CSAT Practice')&&page.includes('Comprehension')&&page.includes('Logical reasoning')&&JSON.stringify(S.prog)===before;
  })()`),true);
});

test('CSE and CSAT keep independent search queries, filters and page positions',()=>{
  const run=fixture();
  assert.equal(run(`(()=>{
    render=()=>{};
    runQuestionSearch('federalism');activeSearch().page=2;activeSearch().related=false;
    S.space='csat';if(activeSearch().query!==''||activeSearch().page!==1||!activeSearch().related)return false;
    runQuestionSearch('syllogism');activeSearch().draft='Another CSAT draft';
    if(searchPlan('syllogism').aliases.includes('seating arrangement')||!searchPlan('reasoning').aliases.includes('syllogism'))return false;
    S.space='cse';return activeSearch().query==='federalism'&&activeSearch().page===2&&!activeSearch().related&&!searchPlan('reasoning').aliases.includes('syllogism');
  })()`),true);
});

test('CSAT search respects source tags while CSE search stays independent',()=>{
  const run=fixture();
  assert.equal(run(`(()=>{
    const base={no:1,subject:'Numeracy',topic:'Percentages',text:'Find the percentage.',options:{A:'One'},answer:'A'};
    S.packs.push({id:'csat::tagged',questions:[{...base,source_exam:'CAPF'},{...base,no:2,source_exam:'CSE'},{...base,no:3}]});S.space='csat';rebuild();
    if(searchQuestions('percentage').length!==3)return false;
    for(const [source,no] of [['CAPF',1],['CSE',2],['untagged',3]]){activeSearch().sourceExam=source;const rows=searchQuestions('percentage');if(rows.length!==1||rows[0].q.no!==no)return false;}
    S.space='cse';rebuild();return searchQuestions('federalism').length===3;
  })()`),true);
});
