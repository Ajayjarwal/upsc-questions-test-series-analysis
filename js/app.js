"use strict";
/* ---------- constants ---------- */
const TEMPLATE = JSON.stringify({
  schema:"recall-desk/1",
  paper:{id:"geo-pyq-2023",title:"Geography PYQ 2023",year:2023},
  subject:"Geography",
  questions:[{no:1,topic:"Soils",question:"Which soil is also called regur soil?",options:{A:"Alluvial",B:"Black",C:"Red",D:"Laterite"},answer:"B",explanation:"Full solution text. **Bold** and lines starting with '- ' are supported.",summary:"One-line note-ready takeaway.",sources:["https://ncert.nic.in/..."],images:[{src:"images/q1-solution.png",caption:"Soil profile"}],question_images:["images/q1-map.png"]}]
},null,2);
const CSAT_TEMPLATE=JSON.stringify({"schema": "recall-desk/1", "paper": {"id": "csat-source-format-example", "title": "CSAT format example — replace with your PYQs", "year": 2021}, "source_exam": "CAPF", "subject": "Quantitative Aptitude", "questions": [{"no": 1, "topic": "Percentages", "question": "What is 20% of 200?", "options": {"A": "20", "B": "30", "C": "40", "D": "50"}, "answer": "C", "explanation": "20/100 × 200 = 40."}, {"no": 2, "source_exam": "CSE", "year": 2020, "topic": "Ratio and proportion", "question": "Two numbers are in the ratio 2:3 and their sum is 50. What is the smaller number?", "options": {"A": "10", "B": "20", "C": "25", "D": "30"}, "answer": "B", "explanation": "The smaller number is 2/(2+3) × 50 = 20."}]},null,2);
const importTemplate=()=>S.space==="csat"?CSAT_TEMPLATE:TEMPLATE;
const BUCKETS=[["b0","Not attempted"],["b1","Under 40%"],["b2","40-59%"],["b3","60-79%"],["b4","80% and above"]];
const MAXSUBJ=3;
/* Hosting config. Fill these in when you deploy (see README). Leave empty to run without a login (Claude account or this browser). */
const CONFIG={supabaseUrl:"https://etdfbbtnthwjsroydxsa.supabase.co",supabaseKey:"sb_publishable_N0g-0D1Gd1hXJOmmrgEKfQ_-LBllhv3",googleLogin:false,requireLogin:true};
// Preview is available only on a local development host.
const LOCAL_PREVIEW=["localhost","127.0.0.1","[::1]"].includes(location.hostname)&&new URLSearchParams(location.search).get("preview")==="1";
const IC={
  quiz:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  smart:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  notebook:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M3 7h4M3 11h4M3 15h4M3 19h4m5-8 5-5 2 2-5 5-3 1z"/>',
  book:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  mark:'<path d="M7 4h10a1 1 0 0 1 1 1v16l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
  flag:'<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
  heat:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>'
};
const ic=n=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

const SPACES={
  static:{label:"Static",prefix:""},
  ca:{label:"Current Affairs",prefix:"ca::"},
  cse:{label:"CSE",prefix:"cse::"},
  csat:{label:"CSAT",prefix:"csat::"},
  capf:{label:"CAPF",prefix:"capf::"}
};
// Existing Static papers retain their published +2/−0.66 convention.
const MARKING={static:{right:2,wrong:.66},ca:{right:2,wrong:.66},cse:{right:2,wrong:2/3},capf:{right:2,wrong:2/3},csat:{right:2.5,wrong:2.5/3}};
const roundMarks=n=>Math.round((n+Number.EPSILON)*100)/100;
function markingFor(q,space=S.space){return MARKING[space==="csat"&&questionSourceExam(q||{})==="CAPF"?"capf":space]||MARKING.static;}
function resultScore(rows,Q=S.quiz){
  let marks=0,max=0;
  for(const r of rows){const rule=Q?.scoring?.[r.u]||markingFor(S.byUid.get(r.u));max+=rule.right;if(!r.skipped)marks+=r.ok?rule.right:-rule.wrong;}
  return {marks:roundMarks(marks),max:roundMarks(max)};
}
/* ---------- state ---------- */
const S={
  tab:"practice", view:"home", step:1, ready:false, storage:"browser", store:null, auth:(CONFIG.supabaseUrl||CONFIG.requireLogin)?"checking":"none", authErr:"", authMode:"in", authMsg:null, authEmail:"", user:null, sb:null,
  packs:[], qs:[], byUid:new Map(), prog:{},
  sel:{subjects:new Set(),topics:new Set(),pack:"all",which:"prio",mode:"practice",count:20,custom:15},
  nb:{subject:undefined}, smart:{subject:"",subjects:new Set(),topics:new Set(),step:1,count:20,custom:15,mode:"practice",back:"practice"}, heatBy:"topic", heatAll:false,
  quiz:null, bk:{parsed:null,error:""}, imp:{parsed:null,errors:[],text:"",dups:[],name:"",month:"",idMode:""}, confirmDel:null, newMode:"practice", space:(()=>{try{const saved=localStorage.getItem("rd_space");return Object.hasOwn(SPACES,saved)?saved:"static";}catch(e){return "static";}})(), mdText:"",theme:(()=>{try{return localStorage.getItem("rd_theme")==="light"?"light":"dark";}catch(e){return "dark";}})()
};
const app=document.getElementById("app");
let bankGeneration=0;
const bankContext=()=>({store:S.store,generation:bankGeneration});
function assertBank(context){if(S.store!==context.store||bankGeneration!==context.generation)throw Error("The account changed. The previous action was stopped.");}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slug=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);
const topicKey=(s,t)=>s+"\u203a"+t;
let toastTimer=0;
function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2800);}

/* ---------- storage backends ---------- */
function chunkQs(qs){
  const enc=new TextEncoder(),out=[];let cur=[],size=0;
  for(const q of qs){const n=enc.encode(JSON.stringify(q)).length+2;if(size+n>180000&&cur.length){out.push(cur);cur=[];size=0;}cur.push(q);size+=n;}
  if(cur.length)out.push(cur);
  return out.length?out:[[]];
}
function dbBackend(db,uid){
  const col=db.collection("data/users/"+uid);
  return {
    quoteOwner:"account:"+uid,
    async loadQuotes(){const doc=await col.doc("quotes").get();return doc.data()?.quotes??null;},
    async saveQuotes(quotes,{onlyIfMissing=false}={}){
      if(onlyIfMissing){const saved=await this.loadQuotes();if(saved!==null)return saved;}
      await col.doc("quotes").set({kind:"quotes",quotes});return quotes;
    },
    async load(){
      const snap=await col.limit(1000).get();const map={},prog={};
      snap.docs.forEach(d=>{const x=d.data()||{};
        if(x.kind==="pack"){(map[x.pid]=map[x.pid]||{id:x.pid,title:x.meta&&x.meta.title||x.pid,sample:!!(x.meta&&x.meta.sample),ts:(x.meta&&x.meta.ts)||0,parts:[]}).parts.push(x);}
        else if(x.kind==="prog"){prog[x.pid]=x.items||{};}
      });
      const packs=Object.values(map).map(p=>{p.parts.sort((a,b)=>a.idx-b.idx);const questions=[].concat(...p.parts.map(z=>z.questions||[]));return {id:p.id,title:p.title,sample:p.sample,ts:p.ts,questions,chunks:p.parts.length};});
      return {packs,prog};
    },
    async savePack(p,oldChunks){
      const parts=chunkQs(p.questions);
      for(let i=0;i<parts.length;i++)await col.doc("pack_"+p.id+"_"+i).set({kind:"pack",pid:p.id,idx:i,n:parts.length,meta:{title:p.title,sample:!!p.sample,ts:p.ts||0},questions:parts[i]});
      for(let j=parts.length;j<(oldChunks||0);j++)await col.doc("pack_"+p.id+"_"+j).delete();
      p.chunks=parts.length;
    },
    async saveProg(pid,items){await col.doc("prog_"+pid).set({kind:"prog",pid,items});},
    async deletePack(p){for(let j=0;j<(p.chunks||1);j++)await col.doc("pack_"+p.id+"_"+j).delete();await col.doc("prog_"+p.id).delete();}
  };
}
function localBackend(K="recall-desk-v1"){
  const read=()=>{try{return JSON.parse(localStorage.getItem(K))||{packs:{},prog:{}};}catch(e){return {packs:{},prog:{}};}};
  const write=d=>{try{localStorage.setItem(K,JSON.stringify(d));}catch(e){throw new Error("This browser blocked saving.");}};
  return {
    historyOwner:"browser:"+K,
    progressOwner:"browser:"+K,
    async loadProgressReceipts(ids){const d=read();return ids.filter(id=>d.receipts?.[id]);},
    async saveProgressChanges(op,pending=[]){
      const save=()=>{const d=read();d.receipts=d.receipts||{};d.prog=d.prog||{};if(!d.packs[op.pid])throw Error("This question set is no longer available.");let items=d.prog[op.pid]||{};
        if(!d.receipts[op.id]){for(const c of op.changes){const q=d.packs[op.pid].questions.find(q=>String(q.no)===c.no);if(c.after&&(!q||!progressEqual(questionIdentity(q),c.identity)))throw Error("A question changed. Keep a backup before retrying.");const next=mergeProgress(items[c.no],c.before,c.after,c.replace);if(next===null)delete items[c.no];else items[c.no]=next;}d.prog[op.pid]=items;d.receipts[op.id]=true;write(d);}
        return {items:d.prog[op.pid]||{},applied:[op.id,...pending].filter(id=>d.receipts[id])};};
      return typeof navigator!=="undefined"&&navigator.locks?navigator.locks.request("solo-progress:"+K,save):save();
    },
    async load(){const d=read();return {packs:Object.values(d.packs).map(p=>({...p,chunks:1})),prog:d.prog};},
    async savePack(p){const d=read();d.packs[p.id]={id:p.id,title:p.title,sample:!!p.sample,ts:p.ts||0,questions:p.questions};write(d);},
    async saveProg(pid,items){const d=read();d.prog[pid]=items;write(d);},
    async deletePack(p){const d=read();delete d.packs[p.id];delete d.prog[p.id];write(d);}
  };
}
function supaBackend(sb,uid){
  const ck=r=>{if(r.error)throw new Error(r.error.message||"Database error");return r.data||[];};
  return {
    quoteOwner:"cloud:"+uid,
    progressOwner:"cloud:"+uid,
    async saveProgressChanges(op,pending=[]){return ck(await sb.rpc("apply_progress_changes",{p_pack:op.pid,p_id:op.id,p_changes:op.changes,p_pending:pending}));},
    async loadProgressReceipts(ids){
      const found=[];for(let from=0;from<ids.length;from+=500){const rows=ck(await sb.from("progress_receipts").select("id").eq("user_id",uid).in("id",ids.slice(from,from+500)));found.push(...rows.map(r=>r.id));}return found;
    },
    async loadTestResults(){
      const out=[],size=1000;
      for(let from=0;;from+=size){
        const rows=ck(await sb.from("test_sessions").select("result").eq("user_id",uid).order("completed_at",{ascending:true}).order("id",{ascending:true}).range(from,from+size-1));
        out.push(...rows.map(row=>row.result));if(rows.length<size)return out;
      }
    },
    async saveTestResult(result){
      ck(await sb.from("test_sessions").upsert({user_id:uid,id:result.id,result,completed_at:new Date(result.date).toISOString()},{onConflict:"user_id,id",ignoreDuplicates:true}));
    },
    async loadQuotes(){
      const r=await sb.from("quote_collections").select("quotes").eq("user_id",uid).maybeSingle();
      if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});
      return r.data?.quotes??null;
    },
    async saveQuotes(quotes,{onlyIfMissing=false}={}){
      const r=await sb.from("quote_collections").upsert({user_id:uid,quotes,updated_at:new Date().toISOString()},{onConflict:"user_id",ignoreDuplicates:onlyIfMissing}).select("quotes");
      if(r.error)throw Object.assign(new Error(r.error.message),{code:r.error.code});
      // An initial migration must never replace a collection saved on another device.
      return r.data?.[0]?.quotes??await this.loadQuotes();
    },
    async load(){
      const pk=ck(await sb.from("packs").select("id,title,sample,ts,questions"));
      const pr=ck(await sb.from("progress").select("pack_id,items"));
      const prog={};pr.forEach(r=>{prog[r.pack_id]=r.items||{};});
      return {packs:pk.map(p=>({id:p.id,title:p.title,sample:!!p.sample,ts:Number(p.ts)||0,questions:p.questions||[],chunks:1})),prog};
    },
    async savePack(p){ck(await sb.from("packs").upsert({user_id:uid,id:p.id,title:p.title,sample:!!p.sample,ts:p.ts||0,questions:p.questions}));p.chunks=1;},
    async saveProg(pid,items){ck(await sb.from("progress").upsert({user_id:uid,pack_id:pid,items,updated_at:new Date().toISOString()}));},
    async deletePack(p){ck(await sb.from("progress").delete().eq("user_id",uid).eq("pack_id",p.id));ck(await sb.from("packs").delete().eq("user_id",uid).eq("id",p.id));}
  };
}
let chain=Promise.resolve();
function enqueue(fn){
  const context=bankContext(),pending=chain.then(()=>{assertBank(context);return fn();});
  // Recover the queue while returning the failure to the action awaiting this save.
  chain=pending.catch(e=>{toast("Could not save: "+((e&&e.message)||"unknown error"));});
  return pending;
}

/* ---------- data model ---------- */
function canonicalSubject(value){
  const subject=String(value??"");
  return /^(?:indian\s+)?polity\s+and\s+governance$/i.test(subject.trim())?"Polity and Governance":subject;
}
// Current Affairs uses the agreed CSE-based Polity taxonomy. Stored questions
// and progress identities remain intact; other study spaces keep their topics.
const CA_POLITY_GROUPS={
  "Basic Structure":[],
  "Centre-State Relations":["Federalism and Mineral Taxation"],
  "Citizenship":[],
  "Constitutional Amendments":["Cooperatives and Constitutional Provisions"],
  "Constitutional Bodies":[],
  "Directive Principles of State Policy":["Education and Examination Governance","Education and Literacy","Government Schemes & Policies","Health and Nutrition","Health Laws & Regulations","Labour Laws and Industrial Relations","Political Philosophy and Social Justice","Uniform Civil Code"],
  "Federalism":["State Executive","State Legislature"],
  "Fundamental Duties":[],
  "Fundamental Rights":["Fundamental Rights and Preventive Detention","Fundamental Rights and Public Order","Digital Governance and Social Media Regulation","Right to Information and Public Accountability"],
  "Inter-State Relations":["Inter-State Relations and Zonal Councils","Federalism and Water Disputes"],
  "Judiciary":["Alternative Dispute Resolution and Lok Adalats","High Courts and Jurisdiction","Supreme Court and Judicial Institutions","Tribunals and Judicial Reforms"],
  "Miscellaneous":["Maritime Laws & Regulations","Sports Awards and Governance","Sports Governance and Anti-Doping"],
  "Non-Constitutional Bodies":["Narcotics Regulation and Institutions","Statutory Bodies and Ministries"],
  "Panchayati Raj & Municipalities":["Panchayati Raj and Devolution","Local Government and Gram Sabha"],
  "Parliament":["Civil Registration and Legislative Powers"],
  "Salient Features of the Constitution":["Comparative Constitutional Systems","Historical Background","Preamble"],
  "Scheduled Areas and Tribal Areas":["Local Government and Autonomous Councils","Tribal Welfare and Education"],
  "Special Provisions":["Emergency Provisions"],
  "Union and its Territory":["Territorial Changes and Constitutional Law"],
  "Union Executive":["Cabinet Committees and Civil Services","Defence Organisation and Technology","Defence Procurement"]
};
const CA_SUBJECT_GROUPS={"Polity and Governance":CA_POLITY_GROUPS,...{
  "Economy": {
    "Banking": [
      "Banking and Financial Regulation",
      "Banking and NBFC Regulation",
      "Banking Fraud and Financial Technology",
      "Banking Laws and Digital Records",
      "Digital Payments and Financial Connectivity",
      "Digital Payments and Financial Infrastructure"
    ],
    "Economic Growth and Development": [
      "Business Environment and Global Reports",
      "International Economic Classifications",
      "Urbanisation and Economic Development"
    ],
    "Economic Reforms and Planning": [
      "Business Regulation and Decriminalisation",
      "Public Sector Enterprises and Leadership"
    ],
    "Energy": [
      "Oil and Gas Exploration",
      "Renewable Energy and Power Capacity",
      "Renewable Energy Schemes"
    ],
    "Financial Markets": [
      "Bonds and Infrastructure Finance",
      "Social Finance and Capital Markets"
    ],
    "Fiscal Policy": [
      "Fertilizer Policy and Distribution",
      "Fertilizer Policy and Subsidies",
      "Finance Commission and Fiscal Federalism",
      "Public Procurement and Digital Platforms",
      "Taxation and Voluntary Disclosure",
      "Taxation and Windfall Profits"
    ],
    "Inclusive Growth": [
      "Agriculture and Women Farmers",
      "Government Schemes & Policies",
      "Labour and Social Security",
      "Women and Rural Livelihoods"
    ],
    "Industry": [
      "Cooperatives and Rural Industries",
      "Electric Vehicles and Industrial Policy",
      "Industry and Manufacturing",
      "Investment and Industrial Policy",
      "Mining Laws and Mineral Taxation",
      "MSME Classification and Policy",
      "MSMEs and Payment Regulation",
      "MSMEs and Sustainable Manufacturing"
    ],
    "Inflation": [],
    "Infrastructure": [
      "Infrastructure and Logistics",
      "Infrastructure Monitoring"
    ],
    "International Economics & Balance of Payments": [
      "Foreign Investment and E-commerce",
      "International Trade and WTO"
    ],
    "Microeconomics": [],
    "Monetary Policy": [
      "Digital Currency and Monetary Policy"
    ],
    "National Income": [
      "Economic Indices and Statistics"
    ],
    "Pension & Insurance": [
      "Insurance and Financial Instruments"
    ],
    "Poverty & Inequality": [
      "Food Security and Global Reports"
    ],
    "Service Sector": [],
    "Unemployment": [
      "Employment and Rural Livelihoods"
    ]
  },
  "Environment and Ecology": {
    "Biodiversity & Conservation": [
      "Biodiversity and Species Discovery",
      "Biodiversity Heritage Sites",
      "Invasive Alien Species",
      "Protected Areas and Biosphere Reserves",
      "Protected Areas and Wildlife Corridors",
      "Species and Conservation",
      "Wetlands and Ramsar Sites"
    ],
    "Climate Change": [
      "Biomass and Carbon Sequestration",
      "Climate Change and Climate Finance",
      "Climate Change and National Commitments",
      "Climate Change and Urban Resilience",
      "Forests and Climate Action"
    ],
    "Ecology": [
      "Ecology and Symbiosis",
      "Ecology and Vegetation Change"
    ],
    "Environmental Laws & Regulations": [
      "Biodiversity Laws and Institutions",
      "Desertification and International Conventions",
      "Environmental Conservation and Regulation",
      "Environmental Impact Assessment",
      "Environmental Rights and River Conservation",
      "Plant Varieties and Farmers' Rights"
    ],
    "Miscellaneous": [
      "Environmental Indices and Reports"
    ],
    "Pollution": [
      "Pesticides and Food Safety"
    ],
    "Sustainable Development": [
      "Desertification and Climate Finance",
      "Green Infrastructure and Data Centres"
    ]
  },
  "Geography": {
    "Climate of India": [],
    "Climatology": [
      "Climatology and El Nino",
      "Climatology and Heatwaves"
    ],
    "Drainage of India": [
      "Lakes and Wetlands",
      "Rivers and Drainage Systems",
      "Rivers and Water-Sharing Agreements"
    ],
    "Earth and the Universe": [],
    "Earth's Interior and Crust": [
      "Earth’s Interior and Crust",
      "Earthquakes and Geophysical Processes",
      "Tectonics and Geophysical Features"
    ],
    "Energy Resources": [
      "Geothermal Resources",
      "Mineral and Energy Resources"
    ],
    "Geomorphology": [
      "Landslides and Disaster Management"
    ],
    "Industries": [],
    "Location of India": [],
    "Mineral Resources": [],
    "Natural Vegetation": [
      "Seed Conservation and Strategic Facilities"
    ],
    "Natural Vegetation of India": [],
    "Oceanography": [
      "Maritime Geography and Exclusive Economic Zones",
      "Seas and World Geography",
      "Straits and World Geography"
    ],
    "Physiography of India": [],
    "Population": [],
    "Soils of India": [],
    "Urbanisation": []
  },
  "International Relations": {
    "International Relations": [
      "India-Australia Relations",
      "India-Japan Relations",
      "India-Nepal Relations",
      "India-UK Relations",
      "International Law",
      "International Security and Defence Cooperation"
    ],
    "Miscellaneous": [
      "Indices and Global Mobility"
    ],
    "Other Multilateral Organisations": [
      "International Organisations",
      "International Organisations and Criminal Justice",
      "Regional Groupings and Security Cooperation"
    ],
    "Places in News": [],
    "United Nations and its Bodies": []
  },
  "Science and Technology": {
    "Biotechnology": [
      "Biotechnology and Drug Discovery",
      "Biotechnology and Medical Diagnostics",
      "Biotechnology and Plant Breeding",
      "Vaccines and Biotechnology"
    ],
    "Defence Technology": [
      "Defence Research and Technology Transfer",
      "Propulsion and Engine Technology"
    ],
    "General Biology": [],
    "General Chemistry": [
      "Hydrogen and Clean Transport",
      "Medical Chemistry and Pharmaceuticals"
    ],
    "General Physics": [
      "Optics and Material Properties",
      "Scientific Awards and Physics"
    ],
    "Genetics and Heredity": [
      "Gene Editing and Medical Biotechnology"
    ],
    "Human Health and Diseases": [
      "Drug Regulation and Advanced Therapies",
      "Microbiology and Human Health"
    ],
    "Human Physiology": [],
    "IT & Computers": [
      "Cybersecurity",
      "Digital Public Services",
      "Semiconductors and Electronics"
    ],
    "Miscellaneous": [
      "Science, Technology & Innovation Policy"
    ],
    "Nanotechnology": [],
    "Nuclear Technology": [
      "Nuclear Energy and Regulation"
    ],
    "Plant Physiology": [],
    "Robotics": [],
    "Space Technology": [
      "Satellite Navigation",
      "Space Exploration",
      "Space Law and International Liability",
      "Space Technology and Institutions",
      "Space Technology and Private Sector",
      "Spacecraft and Re-entry Technology"
    ],
    "Telecommunications": []
  }
}};
const CA_TOPIC_ALIASES=new Map(Object.entries(CA_SUBJECT_GROUPS).map(([subject,groups])=>[subject,new Map(Object.entries(groups).flatMap(([topic,aliases])=>[topic,...aliases].map(alias=>[alias,topic])))]));
function isCaPolity(subject,space=S.space){return space==="ca"&&canonicalSubject(subject)==="Polity and Governance";}
function caTopicGroups(subject,space=S.space){return space==="ca"?CA_SUBJECT_GROUPS[canonicalSubject(subject)]:undefined;}
function questionTopic(q,space){
  const aliases=space==="ca"&&CA_TOPIC_ALIASES.get(canonicalSubject(q.subject));
  return aliases?aliases.get(q.topic)||q.topic:q.topic;
}
function canonicalQuestion(question){
  const subject=canonicalSubject(question.subject);
  return subject===question.subject?question:{...question,subject};
}
function canonicalPack(pack){return {...pack,questions:pack.questions.map(canonicalQuestion)};}
function packSpace(id){
  return Object.keys(SPACES).find(k=>SPACES[k].prefix&&String(id).startsWith(SPACES[k].prefix))||"static";
}
function scopedPackId(id,space=S.space){const prefix=SPACES[space].prefix;return prefix&&!String(id).startsWith(prefix)?prefix+id:id;}
function inSpace(id){return packSpace(id)===S.space;}
function spacePacks(){return S.packs.filter(p=>inSpace(p.id));}
function spaceName(){return SPACES[S.space].label;}
const isExamSpace=()=>["capf","cse","csat"].includes(S.space);
const isSearchSpace=()=>S.space==="cse"||S.space==="csat";
function normalizeSourceExam(value){
  if(value===undefined||value===null||value==="")return "";
  if(typeof value!=="string")return null;
  const exam=value.trim().toUpperCase();return !exam?"":["CSE","CAPF"].includes(exam)?exam:null;
}
const questionSourceExam=q=>normalizeSourceExam(q.source_exam??q.exam)||"";
const sourceExamOk=(o,q)=>S.space!=="csat"||!o?.sourceExam||(o.sourceExam==="untagged"?!questionSourceExam(q):questionSourceExam(q)===o.sourceExam);
const sourceExamBadge=q=>S.space==="csat"&&questionSourceExam(q)?`<span class="tag plain" title="Source exam">${questionSourceExam(q)}</span>`:"";
function sourceExamBlock(o,scope){
  if(S.space!=="csat")return "";
  return `<div class="field"><span class="label">Source exam</span><div class="seg" role="group" aria-label="Source exam">${[["","All sources"],["CSE","CSE"],["CAPF","CAPF"],["untagged","Untagged"]].map(([value,label])=>`<button aria-pressed="${(o?.sourceExam||"")===value}" data-act="sourceexam" data-scope="${scope}" data-v="${value}">${label}</button>`).join("")}</div><p class="hint">Read from the JSON source_exam tag. All sources includes older questions without a tag.</p></div>`;
}
const MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const curMonth=()=>mKey(Date.now());
function mKey(ts){const d=new Date(ts);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
const okMonth=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m||""));
const monthLabel=m=>okMonth(m)?MN[+m.slice(5)-1]+" "+m.slice(0,4):"No month";
const monthOk=(o,q)=>S.space!=="ca"||!o||!o.months||!o.months.size||o.months.has(q.mo);
function monthBlock(o){
  if(S.space!=="ca")return "";
  const ms=[...new Set(S.qs.map(q=>q.mo).filter(Boolean))].sort().reverse();
  if(!ms.length)return "";
  if(!o.months)o.months=new Set();
  const years=[...new Set(ms.map(m=>m.slice(0,4)))];
  return `<div class="field"><span class="label">Month &amp; year ${o.months.size?"":"(all mixed)"}</span>${years.map(y=>{const mm=ms.filter(m=>m.startsWith(y)),all=mm.every(m=>o.months.has(m));return `<div class="row" style="gap:8px"><button class="chip yr" aria-pressed="${all}" data-act="yrsel" data-v="${y}">${y}</button>${mm.map(m=>`<button class="chip" aria-pressed="${o.months.has(m)}" data-act="mon" data-v="${m}">${MN[+m.slice(5)-1]}<small>${S.qs.filter(q=>q.mo===m).length}</small></button>`).join("")}</div>`;}).join("")}<p class="hint">Leave everything unselected to mix all months.</p></div>`;
}
function rebuild(){
  S.qs=[];S.byUid=new Map();
  for(const p of S.packs){if(!inSpace(p.id))continue;for(const q of p.questions){
    const x={uid:p.id+":"+q.no,packId:p.id,no:q.no,subject:canonicalSubject(q.subject),topic:questionTopic(q,packSpace(p.id)),text:q.text,options:q.options,answer:q.answer,exp:q.exp||"",sum:q.sum||"",simg:q.simg||[],qimg:q.qimg||[],src:q.src||[],year:q.year||"",source_exam:questionSourceExam(q),mo:q.mo||(p.ts?mKey(p.ts):"")};
    S.qs.push(x);S.byUid.set(x.uid,x);
  }}
}
function applyProg(progByPack){
  S.prog={};
  for(const pid in progByPack){const items=progByPack[pid];for(const no in items)S.prog[pid+":"+no]=items[no];}
}
function itemsFor(pid){
  const items={},p=S.packs.find(x=>x.id===pid);if(!p)return items;
  for(const q of p.questions){const r=S.prog[pid+":"+q.no];if(r)items[q.no]=r;}
  return items;
}
const dayKey=t=>{const d=t?new Date(t):new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
const addDays=(k,n)=>{const a=k.split("-").map(Number);return dayKey(new Date(a[0],a[1]-1,a[2]+n).getTime());};
const BOX_DAYS=[0,1,2,4,8,16],SLOW_S=90,CLEAR_DAYS=3,DUE_CAP=10;
const CONF={s:"Sure",h:"50-50",g:"Guess"},WHY={k:"Didn't know",c:"Confused options",m:"Misread",s:"Silly mistake"};
const dueDay=p=>{if(!p||(!p.a&&!p.sk))return null;return p.dd||addDays(dayKey(p.t||Date.now()),p.a&&p.l==="c"?2:1);};
const Z2=1.28*1.28,wilsonAcc=(ok,n)=>n?(ok/n+Z2/(2*n))/(1+Z2/n):0.5;
function topicScore(qs){
  let att=0,ok=0,cw=0,last=0;
  for(const q of qs){const p=S.prog[q.uid];if(!p||!p.a)continue;att++;if(p.l==="c")ok++;if(p.l==="w"&&p.cf==="s")cw++;if(p.t>last)last=p.t;}
  if(!att)return null;
  const adj=wilsonAcc(ok,att),days=last?Math.max(0,Math.floor((Date.now()-last)/86400000)):0;
  return {att,ok,adj,cw,days,score:0.6*(1-adj)+0.2*(cw/att)+0.2*Math.min(1,days/14)};
}
function interleave(list){
  const rest=list.slice(),out=[];let l1="",l2="";
  while(rest.length){
    const key=q=>topicKey(q.subject,q.topic);
    let k=rest.findIndex(q=>key(q)!==l1&&key(q)!==l2);
    if(k<0)k=rest.findIndex(q=>key(q)!==l1);
    if(k<0)k=0;
    const q=rest.splice(k,1)[0];out.push(q);l2=l1;l1=key(q);
  }
  return out;
}
const dueList=()=>{const td=dayKey();return S.qs.filter(q=>{const d=dueDay(S.prog[q.uid]);return d&&d<=td;}).sort((a,b)=>dueDay(S.prog[a.uid]).localeCompare(dueDay(S.prog[b.uid]))||priority(b)-priority(a));};
/* Daily revision is computed from progress in the currently selected space. */
function dailyReason(p,today=dayKey()){
  if(!p||(!p.a&&!p.sk)||p.dr===today||(p.t&&dayKey(p.t)===today))return null;
  const due=dueDay(p);
  if(due&&due<today)return {rank:0,label:"Overdue review"};
  if(p.l==="w"&&p.cf==="s")return {rank:1,label:"Confident but wrong"};
  if(p.m&&(p.w||0)+(p.sk||0)>=2)return {rank:2,label:"Repeated mistake"};
  if(p.l==="c"&&(p.cf==="g"||p.cf==="h"))return {rank:3,label:p.cf==="g"?"Correct guess":"Correct with uncertainty"};
  if(due&&due<=today)return {rank:4,label:"Due today"};
  if(p.m)return {rank:5,label:p.a?"Mistake to revisit":"Skipped question"};
  return null;
}
function dailyPlan(){
  const today=dayKey(),done=S.qs.filter(q=>S.prog[q.uid]?.dr===today).length;
  const candidates=S.qs.map(q=>({q,reason:dailyReason(S.prog[q.uid],today)})).filter(x=>x.reason);
  candidates.sort((a,b)=>a.reason.rank-b.reason.rank||String(dueDay(S.prog[a.q.uid])||today).localeCompare(String(dueDay(S.prog[b.q.uid])||today))||(S.prog[a.q.uid].t||0)-(S.prog[b.q.uid].t||0)||a.q.uid.localeCompare(b.q.uid));
  const slots=Math.max(0,DUE_CAP-done),chosen=candidates.slice(0,slots);
  const mixed=interleave(chosen.map(x=>x.q));
  return {done,target:Math.min(DUE_CAP,done+candidates.length),waiting:candidates.length,items:mixed.map(q=>chosen.find(x=>x.q.uid===q.uid)),later:Math.max(0,candidates.length-slots)};
}
function canDailyReview(uid){
  if(S.quiz?.kind!=='Daily revision')return true;
  if(S.prog[uid]?.dr!==dayKey()&&dailyPlan().done<DUE_CAP)return true;
  toast('Today’s revision allowance is complete. Continue with regular practice or return tomorrow.');return false;
}
function markDailyReview(uid){
  if(S.quiz?.kind==="Daily revision"&&S.quiz.uids.includes(uid))getP(uid).dr=dayKey();
}
function startDailyReview(){
  const plan=dailyPlan();if(!plan.items.length)return;
  startQuiz(plan.items.map(x=>x.q.uid),{mode:"practice",kind:"Daily revision",label:spaceName()});
}
function dailyCard(){
  const plan=dailyPlan(),n=plan.items.length;
  const message=n?`${n} question${n===1?"":"s"} ready. Overdue reviews come first, then mistakes and uncertain answers. Topics are mixed.`:plan.done>=DUE_CAP?"Today's revision goal is complete. More reviews will be ready tomorrow.":plan.done?"Today's queue is complete. Return tomorrow for your next review.":"Nothing needs revision yet. Attempt some questions; reviews will appear here on a later day.";
  return `<section class="card daily-revision"><div class="row sp"><div class="daily-heading"><h2>Daily revision</h2><span class="label">${esc(spaceName())}</span></div><span class="tag plain">Up to ${DUE_CAP} a day</span></div><p class="daily-message">${message}</p>
  <div class="daily-footer"><div class="daily-progress"><div class="row sp"><span class="hint">${plan.done} / ${plan.target} done today · answered or explicitly skipped</span>${plan.later?`<span class="hint">${plan.later} more waiting for another day</span>`:""}</div>
  <div class="bar" role="progressbar" aria-label="Daily revision progress" aria-valuemin="0" aria-valuemax="${Math.max(1,plan.target)}" aria-valuenow="${Math.min(plan.done,Math.max(1,plan.target))}"><b style="width:${plan.target?Math.min(100,Math.round(plan.done/plan.target*100)):0}%"></b></div>
  </div><div class="row"><button class="btn pri sm" data-act="dailygo" ${n?"":"disabled"}>${plan.done?"Continue":"Start"} revision${n?` (${n})`:""}</button><button class="btn sm" data-act="dailyopen">View queue</button></div></div><p class="hint daily-caption">Questions practised today stay out of this queue until a later day. Completing a review does not mean the concept is mastered.</p></section>`;
}
function viewDaily(){
  const plan=dailyPlan();
  return `<div class="row sp"><h1>Daily revision queue</h1><button class="btn" data-act="dailyback">Back to Practice</button></div>${dailyCard()}
  ${plan.items.length?`<section class="card"><h2>In this session</h2><p class="hint">No answers are revealed here. You still select one option at a time.</p>${plan.items.map(({q,reason},i)=>`<div class="pack"><div><span class="label">${i+1} · ${esc(q.subject)} · ${esc(q.topic)}</span><p>${esc(q.text)}</p><span class="tag plain">${esc(reason.label)}</span></div></div>`).join("")}</section>`:""}`;
}
function tickQ(){
  const Q=S.quiz;if(!Q||Q.done||!Q.t0)return;
  const now=Date.now(),uid=Q.uids[Q.i],r=uid&&Q.res[uid];
  if(uid&&!(Q.mode!=="exam"&&r&&!r.skipped))Q.tm[uid]=(Q.tm[uid]||0)+Math.min(now-Q.t0,300000);
  Q.t0=now;
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")tickQ();else if(S.quiz&&!S.quiz.done)S.quiz.t0=Date.now();});
function getP(uid){const p=S.prog[uid]||(S.prog[uid]={a:0,c:0,w:0,sk:0,l:"",m:0,x:"",b:0,t:0});for(const key of ['a','c','w','sk','m','b','t'])if(!Number.isFinite(p[key])||p[key]<0)p[key]=0;return p;}
let saveSet=new Set(),saveTimer=0;
const PROGRESS_PREFIX=LOCAL_PREVIEW?"solo-progress-preview-v2:":"solo-progress-v2:";
let progressStamp=0;
const PROGRESS={store:null,owner:"",generation:0,ops:new Map(),conflicts:new Map(),observed:{},base:{},chain:Promise.resolve(),error:"",cacheError:false,retry:0};
const QUIZ_PREFIX=LOCAL_PREVIEW?"solo-quiz-preview-v2:":"solo-quiz-v2:";
const QUIZ_DRAFTS={rows:[],error:false,dirty:true};
const QUIZ_TAB=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
function quizClaimKey(id){return quizStorageKey(quizOwner(),id)+':claim';}
function claimQuiz(id){try{localStorage.setItem(quizClaimKey(id),JSON.stringify({tab:QUIZ_TAB,closed:false}));}catch(error){QUIZ_DRAFTS.error=true;}}
function ownsQuiz(Q=S.quiz,notify=false){
  if(!Q?.id)return true;
  try{const claim=JSON.parse(localStorage.getItem(quizClaimKey(Q.id))||'null');if(claim&&(claim.closed||claim.tab!==QUIZ_TAB)){if(notify)toast('This test was resumed or closed in another tab. Continue there, or start a new test.');return false;}}catch(error){QUIZ_DRAFTS.error=true;}
  return true;
}
const quizOwner=()=>S.store?.progressOwner||S.store?.quoteOwner||S.store?.historyOwner||"";
function quizStorageKey(owner,id){return QUIZ_PREFIX+encodeURIComponent(owner)+":"+id;}
function saveQuizSession(){
  const Q=S.quiz,owner=quizOwner();if(!Q||Q.draftFinalized||!owner||!S.ready||!ownsQuiz(Q))return;
  Q.id=Q.id||progressId();Q.space=Q.space||S.space;
  const elapsed=Q.done?Q.elapsed:(Q.elapsedBase||0)+Date.now()-(Q.resumeClock||Q.start);
  const quiz=structuredClone({...Q,elapsedActive:Math.max(0,elapsed),t0:0});
  const identities=Object.fromEntries(Q.uids.map(uid=>[uid,S.byUid.has(uid)?questionIdentity(S.byUid.get(uid)):null]));
  try{localStorage.setItem(quizStorageKey(owner,Q.id),JSON.stringify({owner,quiz,identities,updated:Date.now()}));QUIZ_DRAFTS.error=false;QUIZ_DRAFTS.dirty=true;}catch(error){QUIZ_DRAFTS.error=true;}
}
function loadQuizSessions(){
  const owner=quizOwner(),prefix=QUIZ_PREFIX+encodeURIComponent(owner)+":";QUIZ_DRAFTS.rows=[];QUIZ_DRAFTS.dirty=false;if(!owner)return;
  const qs=new Map(S.packs.flatMap(p=>p.questions.map(q=>[p.id+':'+q.no,q])));
  try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;const row=JSON.parse(localStorage.getItem(key));if(row?.owner!==owner||!Object.hasOwn(SPACES,row.quiz?.space)||!Array.isArray(row.quiz.uids)||!row.quiz.uids.length||row.quiz.uids.length>5000)continue;
    const valid=new Set(row.quiz.uids).size===row.quiz.uids.length&&row.quiz.uids.every(uid=>qs.has(uid)&&progressEqual(questionIdentity(qs.get(uid)),row.identities?.[uid]));
    QUIZ_DRAFTS.rows.push({...row,key,valid});
  }}catch(error){QUIZ_DRAFTS.error=true;}
  QUIZ_DRAFTS.rows.sort((a,b)=>b.updated-a.updated);
}
function resumeCard(){
  if(S.quiz||!QUIZ_DRAFTS.rows.length)return '';
  return `<section class="card resume-card"><h2>Continue where you left off</h2><p class="hint">Saved on this browser for this account. Exam answers stay unchecked until you submit.</p>${QUIZ_DRAFTS.rows.slice(0,3).map(row=>`<div class="row sp"><div><strong>${esc(row.quiz.label||row.quiz.kind||'Unfinished test')}</strong><p class="hint">${SPACES[row.quiz.space].label} · ${row.quiz.uids.length} questions${row.valid?'':' · Questions changed; this draft cannot be resumed safely'}</p></div><div class="row"><button class="btn pri sm" data-act="resume-quiz" data-v="${esc(row.quiz.id)}" ${row.valid?'':'disabled'}>${row.quiz.done?'Recover result':'Resume'}</button><button class="linkbtn" data-act="discard-quiz" data-v="${esc(row.quiz.id)}">Discard draft</button></div></div>`).join('')}</section>`;
}
function discardQuizDraft(id){try{localStorage.setItem(quizClaimKey(id),JSON.stringify({tab:QUIZ_TAB,closed:true}));localStorage.removeItem(quizStorageKey(quizOwner(),id));}catch(error){}QUIZ_DRAFTS.rows=QUIZ_DRAFTS.rows.filter(row=>row.quiz.id!==id);}
function resumeQuiz(id){
  loadQuizSessions();const row=QUIZ_DRAFTS.rows.find(row=>row.quiz.id===id);if(!row?.valid){toast('This draft no longer matches your questions.');return;}
  resetPracticeSpace(row.quiz.space);
  const quiz=structuredClone(row.quiz);quiz.slots=quiz.slots||Object.fromEntries(quiz.uids.map((uid,i)=>[uid,i]));
  if(quiz.kind==='Daily revision'&&!quiz.done){
    const remaining=Math.max(0,DUE_CAP-dailyPlan().done),completed=quiz.uids.filter(uid=>quiz.res[uid]&&!quiz.res[uid].deferred),waiting=quiz.uids.filter(uid=>!completed.includes(uid)&&S.prog[uid]?.dr!==dayKey()).slice(0,remaining);
    if(!waiting.length){toast('Today’s revision queue is complete. This draft is kept for another day.');render();return;}
    quiz.uids=[...completed,...waiting];quiz.i=completed.length;
  }
  claimQuiz(id);DASH.open=false;S.quiz=quiz;S.quiz.t0=Date.now();S.quiz.resumeClock=Date.now();S.quiz.elapsedBase=S.quiz.elapsedActive||0;S.quiz.i=Math.max(0,Math.min(S.quiz.uids.length-1,S.quiz.i||0));S.tab='practice';
  if(S.quiz.done){if(!S.quiz.progressSaved)saveCompletedTest(S.quiz);S.quiz.draftFinalized=true;discardQuizDraft(id);}else if(S.quiz.submitting)finishQuiz();
  render();window.scrollTo(0,0);
}
function stableJson(value){return JSON.stringify(value,(_,v)=>plainObject(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
const progressEqual=(a,b)=>stableJson(a??null)===stableJson(b??null);
const progressId=()=>typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+"-"+Math.random().toString(36).slice(2)+"-"+Math.random().toString(36).slice(2);
function mergeProgress(current,before,after,replace=false){
  if(replace)return after===null?null:structuredClone(after);
  const c=structuredClone(current||{}),b=before||{},a=after||{};
  if(after===null)return progressEqual(c,b)?null:c;
  const newer=(a.t||0)>=(c.t||0),counters=new Set(['a','c','w','sk','cw','ts','tn']),answerFields=new Set(['l','x','m','bx','dd','cd','tm','sl','cf','rn','t']);
  for(const k of new Set([...Object.keys(b),...Object.keys(a)])){
    if(!safeKey(k)||progressEqual(b[k],a[k])||k==='first'||k==='repeat')continue;
    if(counters.has(k)){const delta=(a[k]||0)-(b[k]||0);c[k]=Math.max(0,(c[k]||0)+delta);}
    else if(!answerFields.has(k)||newer){if(Object.hasOwn(a,k))c[k]=structuredClone(a[k]);else delete c[k];}
  }
  const repeat={a:c.repeat?.a||0,c:c.repeat?.c||0,sk:c.repeat?.sk||0};
  for(const k of ['a','c','sk'])repeat[k]=Math.max(0,repeat[k]+(a.repeat?.[k]||0)-(b.repeat?.[k]||0));
  if(!b.first&&a.first){
    if(c.first){const extra=a.first.t<c.first.t?c.first:a.first;if(a.first.t<c.first.t)c.first=structuredClone(a.first);if(extra.skipped)repeat.sk++;else{repeat.a++;if(extra.ok)repeat.c++;}}
    else c.first=structuredClone(a.first);
  }
  if(a.repeat||b.repeat||c.repeat||repeat.a||repeat.sk)c.repeat=repeat;
  return c;
}
function progressOperationKey(owner,id){return PROGRESS_PREFIX+encodeURIComponent(owner)+":"+id;}
function readProgressOperations(owner){
  const out=[],prefix=PROGRESS_PREFIX+encodeURIComponent(owner)+":";
  try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;const op=JSON.parse(localStorage.getItem(key));if(op?.id&&op.owner===owner&&Array.isArray(op.changes)&&op.changes.length&&typeof op.pid==='string')out.push(op);}}catch(error){PROGRESS.cacheError=true;}
  return out.sort((a,b)=>a.created-b.created||a.id.localeCompare(b.id));
}
function cacheProgressOperation(op){try{localStorage.setItem(progressOperationKey(op.owner,op.id),JSON.stringify(op));return true;}catch(error){PROGRESS.cacheError=true;return false;}}
function forgetProgressOperation(id){PROGRESS.ops.delete(id);try{localStorage.removeItem(progressOperationKey(PROGRESS.owner,id));}catch(error){PROGRESS.cacheError=true;}}
function resetProgressSession(){PROGRESS.generation++;clearTimeout(PROGRESS.retry);PROGRESS.store=null;PROGRESS.owner="";PROGRESS.ops=new Map();PROGRESS.conflicts=new Map();PROGRESS.observed={};PROGRESS.base={};PROGRESS.chain=Promise.resolve();PROGRESS.error="";PROGRESS.cacheError=false;}
function questionIdentity(q){return {text:q.text,options:q.options,answer:q.answer,qimg:q.qimg||[]};}
function captureProgress(pid,replace=false,operationId=""){
  const h=PROGRESS;if(h.store!==S.store||!h.owner)return;
  const items=itemsFor(pid),previous=h.observed[pid]||{},pack=S.packs.find(p=>p.id===pid),changes=[];
  for(const no of new Set([...Object.keys(previous),...Object.keys(items)])){
    const before=previous[no]||null,after=items[no]||null;if(progressEqual(before,after))continue;
    const q=pack?.questions.find(q=>String(q.no)===no);
    changes.push({no,before:before?cleanProgress(before):null,after:after?cleanProgress(after):null,replace,...(q?{identity:questionIdentity(q)}:{})});
  }
  if(!changes.length)return;
  progressStamp=[...h.ops.values()].reduce((n,op)=>Math.max(n,Number(op.created)||0),Math.max(Date.now()-1,progressStamp))+1;
  const op={id:operationId||progressId(),owner:h.owner,pid,created:progressStamp,changes};if(h.ops.has(op.id))return;h.ops.set(op.id,op);cacheProgressOperation(op);h.observed[pid]=structuredClone(items);updateSyncStatus();
}
function progressConflict(op){
  const pack=S.packs.find(p=>p.id===op.pid);
  if(!pack)return 'The question set was removed.';
  return op.changes.some(c=>c.after&&(!pack.questions.some(q=>String(q.no)===c.no&&progressEqual(questionIdentity(q),c.identity))))?'A question changed after this answer was recorded.':'';
}
function holdProgressOperation(op,reason){
  op.blockedReason=reason;PROGRESS.conflicts.set(op.id,op);PROGRESS.ops.delete(op.id);cacheProgressOperation(op);
}
function progressRecoveryCard(){
  const rows=[...PROGRESS.conflicts.values()];if(!rows.length)return '';
  return `<details class="card progress-recovery"><summary>${rows.length} saved change${rows.length===1?' needs':'s need'} review</summary><p>These answers refer to changed or removed questions. They are kept on this browser and are excluded from your current scores. Other answers can still sync.</p><p class="hint">Export the recovery file before removing a saved change. It contains the original question and answer progress.</p><button class="btn sm" data-act="progress-export">Export recovery file</button>${rows.map(op=>`<div class="row sp"><span>${esc(op.pid)} · ${op.changes.length} question${op.changes.length===1?'':'s'} · ${esc(op.blockedReason)}</span><button class="linkbtn" data-act="progress-discard" data-v="${esc(op.id)}">Remove saved change</button></div>`).join('')}</details>`;
}
function overlayProgress(pid,items){
  let result=structuredClone(items||{});
  for(const op of PROGRESS.ops.values())if(op.pid===pid)for(const c of op.changes){const next=mergeProgress(result[c.no],c.before,c.after,c.replace);if(next===null)delete result[c.no];else result[c.no]=next;}
  return result;
}
async function loadProgressSession(store,prog){
  resetProgressSession();const h=PROGRESS,generation=h.generation;
  h.store=store;h.owner=store.progressOwner||"";h.base=structuredClone(prog||{});
  if(!h.owner){h.observed=structuredClone(prog||{});return;}
  const ops=readProgressOperations(h.owner);h.ops=new Map(ops.map(op=>[op.id,op]));
  if(ops.length&&store.loadProgressReceipts){
    const acknowledged=await store.loadProgressReceipts(ops.map(op=>op.id));if(h.generation!==generation||h.store!==store)return;
    // Receipts can be newer than the first bank read. Refresh before removing their local evidence.
    if(acknowledged.length){const fresh=await store.load();if(h.generation!==generation||h.store!==store)return;S.packs=fresh.packs.map(canonicalPack);rebuild();prog=fresh.prog;h.base=structuredClone(prog||{});for(const id of acknowledged)forgetProgressOperation(id);}
  }
  for(const op of [...h.ops.values()]){const reason=op.blockedReason||progressConflict(op);if(reason)holdProgressOperation(op,reason);}
  const data=structuredClone(prog||{});for(const pid of new Set([...Object.keys(data),...h.ops.values()].map(x=>typeof x==='string'?x:x.pid)))data[pid]=overlayProgress(pid,data[pid]);
  h.observed=structuredClone(data);applyProg(data);
}
function acceptProgressResponse(pid,response){
  for(const id of response.applied||[])forgetProgressOperation(id);
  const current=overlayProgress(pid,response.items||{});PROGRESS.base[pid]=structuredClone(response.items||{});PROGRESS.observed[pid]=structuredClone(current);
  for(const uid of Object.keys(S.prog))if(uid.slice(0,uid.lastIndexOf(':'))===pid)delete S.prog[uid];
  const pack=S.packs.find(p=>p.id===pid);for(const q of pack?.questions||[])if(Object.hasOwn(current,q.no))S.prog[pid+':'+q.no]=current[q.no];
}
function flushProgress(){
  const h=PROGRESS,store=h.store,generation=h.generation;if(!store)return Promise.resolve();
  h.chain=h.chain.catch(()=>{}).then(async()=>{
    if(h.generation!==generation||S.store!==store)return;
    try{
      for(const op of [...h.ops.values()]){
        if(h.generation!==generation||S.store!==store)return;if(!h.ops.has(op.id))continue;
        let response;
        try{response=await store.saveProgressChanges(op,[...h.ops.values()].filter(x=>x.pid===op.pid).map(x=>x.id));}
        catch(error){
          if(h.generation!==generation||S.store!==store)throw error;
          if(/question changed|question set is no longer available/i.test(error?.message||'')){holdProgressOperation(op,error.message);updateSyncStatus();continue;}
          throw error;
        }
        if(h.generation!==generation||S.store!==store)return;
        if(!plainObject(response)||!plainObject(response.items)||!Array.isArray(response.applied)||!response.applied.includes(op.id))throw Error('The server did not confirm this save.');
        acceptProgressResponse(op.pid,response);h.error="";updateSyncStatus();
      }
      h.error="";h.cacheError=false;
    }catch(error){if(h.generation===generation&&S.store===store){h.error="Your answers are waiting to sync. "+(error?.message||"");clearTimeout(h.retry);h.retry=setTimeout(()=>flushInBackground(),15000);}throw error;}
    finally{if(h.generation===generation&&S.store===store)updateSyncStatus();}
  });
  return h.chain;
}
function syncStatusText(){
  if(QUIZ_DRAFTS.error)return "Test draft could not be saved in this browser";
  if(PROGRESS.cacheError)return "Saving unavailable · keep this page open";
  if(typeof navigator!=="undefined"&&navigator.onLine===false)return PROGRESS.ops.size?"Offline · answers saved on this browser":"Offline";
  if(PROGRESS.error||TEST_HISTORY.state==='error'||quoteSync.state==='error')return "Waiting to sync";
  if(PROGRESS.ops.size||saveSet.size||TEST_HISTORY.state==='saving'||quoteSync.state==='saving')return "Saving…";
  if(PROGRESS.conflicts.size)return PROGRESS.conflicts.size+' saved change'+(PROGRESS.conflicts.size===1?' needs':'s need')+' review';
  return S.ready&&S.store?"Saved":"Opening your bank…";
}
function syncStatus(){return `<span class="save-status" role="status" aria-live="polite" data-sync-status>${esc(syncStatusText())}</span>${PROGRESS.conflicts.size?'<button class="linkbtn" data-act="progress-review">Review</button>':''}${PROGRESS.error||TEST_HISTORY.state==='error'?'<button class="linkbtn" data-act="sync-retry">Retry</button>':''}`;}
function syncBadge(){return `<span class="save-status-wrap" data-sync-container>${syncStatus()}</span>`;}
function updateSyncStatus(){document.querySelectorAll?.('[data-sync-container]').forEach(node=>{node.innerHTML=syncStatus();});}
function queueSave(pid,replace=false,operationId=""){
  if(S.store?.saveProgressChanges&&PROGRESS.store===S.store)captureProgress(pid,replace,operationId);else saveSet.add(pid);
  clearTimeout(saveTimer);saveTimer=setTimeout(flushInBackground,700);updateSyncStatus();
}
function flush(){
  clearTimeout(saveTimer);
  const store=S.store,pids=[...saveSet];saveSet=new Set();
  const durable=S.store?.saveProgressChanges&&PROGRESS.store===S.store?flushProgress():Promise.resolve();
  return Promise.all([durable,...pids.map(pid=>{
    const items=itemsFor(pid);
    return enqueue(()=>store.saveProg(pid,items)).catch(e=>{if(S.store===store)saveSet.add(pid);throw e;});
  })]);
}
function flushInBackground(){flush().catch(()=>{});}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flushInBackground();});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")saveQuizSession();else if(S.ready&&!S.quiz){loadQuizSessions();updateSyncStatus();}});
window.addEventListener?.('pagehide',saveQuizSession);
window.addEventListener?.('online',()=>{if(S.bankRetry)openBank(S.bankRetry.store,S.bankRetry.mode);else if(S.store)flushInBackground();});
window.addEventListener?.('offline',()=>{saveQuizSession();updateSyncStatus();});

function stat(list){
  let att=0,ok=0,mis=0,ever=0;
  for(const q of list){const p=S.prog[q.uid];if(!p)continue;if(p.a>0){att++;if(p.l==="c")ok++;}if(p.m)mis++;if(p.w>0||p.sk>0)ever++;}
  return {n:list.length,att,ok,mis,ever};
}
const pct=s=>s.att?Math.round(s.ok/s.att*100):null;
const bucket=p=>p===null?0:p<40?1:p<60?2:p<80?3:4;
function groupBySubject(list){
  const m=new Map();
  for(const q of list){if(!m.has(q.subject))m.set(q.subject,new Map());const t=m.get(q.subject);if(!t.has(q.topic))t.set(q.topic,[]);t.get(q.topic).push(q);}
  return m;
}
const openMistakes=()=>S.qs.filter(q=>S.prog[q.uid]&&S.prog[q.uid].m);
const bookmarks=()=>S.qs.filter(q=>S.prog[q.uid]&&S.prog[q.uid].b);
const mono=s=>{const w=String(s).trim().split(/\s+/)[0]||"?";return w.slice(0,2).toUpperCase();};

/* ---------- images ---------- */
function imgSafe(s){s=String(s||"").trim();return /^https:\/\/\S+$/i.test(s)||/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+\/=]+$/i.test(s)||/^(?!\/\/)[\w\-./ %]+\.(png|jpe?g|webp|gif|svg)$/i.test(s);}
function normImgs(v){
  if(!v)return [];if(!Array.isArray(v))v=[v];
  return v.map(x=>typeof x==="string"?{src:x,cap:""}:{src:String((x&&(x.src||x.url))||""),cap:String((x&&(x.caption||x.cap||x.alt))||"")}).map(x=>({src:x.src.trim(),cap:x.cap.trim()})).filter(x=>imgSafe(x.src));
}
function figs(list){
  list=list||[];if(!list.length)return "";
  return `<div class="figs">${list.map(f=>`<figure><img src="${esc(f.src)}" alt="${esc(f.cap||"Figure")}" loading="lazy" data-act="zoom" data-v="${esc(f.src)}">${f.cap?`<figcaption>${esc(f.cap)}</figcaption>`:""}</figure>`).join("")}</div>`;
}

/* Answer keys may accept several alternatives; an attempt always selects one. */
function normalizeAnswerKey(value){
  const raw=Array.isArray(value)?value:String(value??"").trim().split(/\s+or\s+|[,/|;+&]/i);
  if(!raw.length)return [];
  const keys=raw.map(x=>String(x).trim().toUpperCase().replace(/^[([]|[)\]]$/g,""));
  if(keys.some(k=>! /^[A-F1-6]$/.test(k)))return [];
  return [...new Set(keys.map(k=>/^[1-6]$/.test(k)?"ABCDEF"[Number(k)-1]:k))].sort();
}
const plainObject=v=>!!v&&typeof v==="object"&&!Array.isArray(v);
const safeKey=k=>!['__proto__','constructor','prototype'].includes(k);
function normalizedOptions(value){
  const entries=Array.isArray(value)?value.map((v,i)=>["ABCDEF"[i],v]):plainObject(value)?Object.entries(value):[];
  if(entries.length<2||entries.length>6)return null;
  const out={};
  for(const [raw,value] of entries){const match=String(raw).match(/^\s*[([]?([A-Fa-f1-6])[)\].:]?\s*$/),text=typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)?String(value):'';if(!match||!text.trim())return null;const key=/\d/.test(match[1])?"ABCDEF"[Number(match[1])-1]:match[1].toUpperCase();if(Object.hasOwn(out,key))return null;out[key]=text.trim();}
  return out;
}
function storedQuestion(q){
  if(!plainObject(q)||!Number.isSafeInteger(q.no)||q.no<1||typeof q.text!=="string"||!q.text.trim()||typeof q.subject!=="string"||!q.subject.trim())return null;
  const options=normalizedOptions(q.options),answer=normalizeAnswerKey(q.answer),exam=normalizeSourceExam(q.source_exam??q.exam);
  if(!options||!answer.length||answer.some(k=>!Object.hasOwn(options,k))||exam===null)return null;
  return {no:q.no,text:q.text,subject:canonicalSubject(q.subject.trim()),topic:String(q.topic||"General"),options,answer:answer.length===1?answer[0]:answer,exp:String(q.exp||""),sum:String(q.sum||""),src:(Array.isArray(q.src)?q.src:[]).map(String),qimg:normImgs(q.qimg),simg:normImgs(q.simg),year:String(q.year||""),...(exam?{source_exam:exam}:{}),...(okMonth(q.mo)?{mo:q.mo}:{}),...(q.question_type?{question_type:String(q.question_type)}:{})};
}
function cleanProgress(value){
  if(!plainObject(value))return {};
  const out={},numbers=new Set(['a','c','w','sk','b','m','t','bx','tm','ts','tn','sl','cw']);
  for(const [k,v] of Object.entries(value)){
    if(numbers.has(k)&&Number.isFinite(v)&&v>=0)out[k]=v;
    else if(['l','x','cf','wy'].includes(k)&&typeof v==='string')out[k]=v.slice(0,10);
    else if(k==='rn'&&typeof v==='string')out[k]=v.slice(0,2000);
    else if(['dd','dr'].includes(k)&&/^\d{4}-\d{2}-\d{2}$/.test(v||''))out[k]=v;
    else if(k==='cd'&&Array.isArray(v))out[k]=[...new Set(v.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)))];
    else if(k==='first'&&plainObject(v)){out.first={};for(const [field,x] of Object.entries(v)){if(['ok','skipped'].includes(field)&&typeof x==='boolean')out.first[field]=x;else if(field==='t'&&Number.isFinite(x))out.first.t=x;else if(['pick','cf','reason'].includes(field)&&typeof x==='string')out.first[field]=x.slice(0,field==='reason'?2000:1);}}
    else if(k==='repeat'&&plainObject(v))out.repeat=Object.fromEntries(Object.entries(v).filter(([field,x])=>['a','c','sk'].includes(field)&&Number.isFinite(x)&&x>=0));
  }
  return out;
}

const acceptedAnswers=q=>normalizeAnswerKey(q.answer);
const isAcceptedAnswer=(q,pick)=>acceptedAnswers(q).includes(pick);
const answerKeyNote=q=>acceptedAnswers(q).length>1?`<p class="info">Answer key accepts ${acceptedAnswers(q).join(" or ")}. Any one of these options is marked correct.</p>`:"";

/* ---------- import parsing ---------- */
function parseImport(text){
  let data;
  try{data=JSON.parse(text);}catch(e){return {errors:["This is not valid JSON ("+e.message+")."],questions:[]};}
  let arr,meta={};
  if(Array.isArray(data))arr=data;
  else if(data&&Array.isArray(data.questions)){arr=data.questions;meta=data;}
  else return {errors:['The file needs a "questions" list.'],questions:[]};
  const paper=meta.paper||{},mm=(meta.meta&&typeof meta.meta==="object")?meta.meta:{};
  const title=String(paper.title||meta.title||mm.title||"Imported set").slice(0,90);
  const id=slug(paper.id||meta.id||mm.id||title)||("set-"+Date.now().toString(36));
  const MON=["january","february","march","april","may","june","july","august","september","october","november","december"];
  let fileMonth="";{const dm=title.match(/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i)||title.match(/()(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);if(dm)fileMonth=dm[3]+"-"+String(MON.indexOf(dm[2].toLowerCase())+1).padStart(2,"0");}
  const topSubject=String(meta.subject||paper.subject||mm.subject||"").trim();
  const errors=[],out=[],used=new Set();
    arr.forEach((r,i)=>{
    const lab="Question "+((r&&r.no)!==undefined?r.no:i+1);
    if(!r||typeof r!=="object"){errors.push(lab+": not an object");return;}
    const sourceExam=normalizeSourceExam([r.source_exam,r.exam,paper.source_exam,paper.exam,meta.source_exam,meta.exam,mm.source_exam,mm.exam].find(value=>value!==undefined&&value!==null&&!(typeof value==="string"&&!value.trim())));
    if(sourceExam===null&&S.space==="csat"){errors.push(lab+': source_exam must be "CSE" or "CAPF"');return;}
    const subject=canonicalSubject(String(r.subject||topSubject).trim());
    if(!subject){errors.push(lab+": no subject");return;}
    const text=String(r.question||r.q||"").trim();
    if(!text){errors.push(lab+": no question text");return;}
    const opts=normalizedOptions(r.options);
    if(!opts){errors.push(lab+": needs 2–6 non-empty options labelled A–F");return;}
    const answers=normalizeAnswerKey(r.accepted_answers??r.answers??r.answer);
    if(!answers.length||answers.some(L=>!opts[L])){errors.push(lab+": answer key must contain valid option letters");return;}
    const ans=answers.length===1?answers[0]:answers;
    let no=parseInt(r.no!==undefined?r.no:r.qno,10);
    if(!Number.isInteger(no)||no<1||used.has(no)){no=1;while(used.has(no))no++;}
    used.add(no);
    let src=r.sources||r.source||[];if(!Array.isArray(src))src=String(src).split(/\n+/);
    if(Array.isArray(r.references))src=src.concat(r.references.map(x=>x&&typeof x==="object"?String(x.url||"").trim()+(x.page?" (p. "+x.page+")":""):String(x||"")));
    src=src.map(x=>String(x).trim()).filter(Boolean);
    let expl=String(r.explanation||r.exp||"").trim();
    if(src.length)expl=expl.split("\n").filter(l=>!/^\s*\*\*\s*News\s*:/i.test(l)).join("\n").trim();
    out.push({no,simg:normImgs(r.images||r.solution_images),qimg:normImgs(r.question_images||r.qimages),subject,topic:String(r.topic||"General").trim()||"General",text,options:opts,answer:ans,exp:expl,sum:String(r.summary||"").trim(),src,year:String(r.year||paper.year||meta.year||mm.year||""),...(sourceExam?{source_exam:sourceExam}:{}),...(r.question_type||meta.question_type?{question_type:String(r.question_type||meta.question_type).toLowerCase()}:{})});
  });
  out.sort((a,b)=>a.no-b.no);
  return {id,title,questions:out,errors,month:fileMonth};
}

/* ---------- solution formatting ---------- */
function questionDisplayText(text){
  if(!isSearchSpace())return String(text);
  const lines=String(text).replace(/\r\n?/g,"\n").split("\n"),out=[];
  const tableLine=line=>line.includes("|")||line.includes("\t");
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.trim()){out.push(line);continue;}
    // Retain a separator between distinct tables; remove empty prose lines.
    const next=lines.slice(i+1).find(x=>x.trim());
    if(out.length&&tableLine(out[out.length-1])&&next&&tableLine(next))out.push("");
  }
  return out.join("\n").trim();
}
function fmtQ(text){
  const lines=questionDisplayText(text).split("\n"),out=[];let buf=[],tbl=[];
  const cells=l=>{let s=l.trim();if(s.includes("|")){s=s.replace(/^\|/,"").replace(/\|$/,"");return s.split("|").map(x=>x.trim());}if(l.includes("\t"))return l.split("\t").map(x=>x.trim());return null;};
  const isSep=c=>c.length&&c.every(x=>/^:?-{2,}:?$/.test(x));
  const flushT=()=>{
    if(!tbl.length)return;
    if(tbl.length<2){buf.push(...tbl.map(r=>r.raw));tbl=[];return;}
    const rows=tbl.filter(r=>!isSep(r.c)),hasSep=tbl.some(r=>isSep(r.c)),n=Math.max(...rows.map(r=>r.c.length));
    const head=hasSep||/^(list|column|sr|s\.?\s?no|pair|name|item)/i.test(rows[0].c.join(" "));
    const tr=(r,tag)=>"<tr>"+Array.from({length:n},(_,i)=>`<${tag}>${inline(r.c[i]||"")}</${tag}>`).join("")+"</tr>";
    if(buf.length){out.push(`<div class="qt">${esc(buf.join("\n"))}</div>`);buf=[];}
    out.push(`<div class="qtbl"><table>${head?`<thead>${tr(rows[0],"th")}</thead><tbody>${rows.slice(1).map(r=>tr(r,"td")).join("")}</tbody>`:`<tbody>${rows.map(r=>tr(r,"td")).join("")}</tbody>`}</table></div>`);tbl=[];
  };
  for(const l of lines){const c=cells(l);if(c&&c.length>=2&&(c.length>=2)){tbl.push({c,raw:l});}else{flushT();buf.push(l);}}
  flushT();
  if(buf.length)out.push(`<div class="qt">${esc(buf.join("\n"))}</div>`);
  return out.join("");
}
function inline(s){return esc(s).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");}
function fmtSol(text){
  const raw=String(text).replace(/\t/g,"    ").split(/\n/);
  const blocks=[];let stack=[],cur=null;
  const newList=()=>{cur={type:"list",items:[]};blocks.push(cur);stack=[];};
  for(const line of raw){
    if(!line.trim())continue;
    const indent=line.match(/^ */)[0].length,l=line.trim();
    const fm=l.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if(fm){cur=null;stack=[];if(imgSafe(fm[2]))blocks.push({type:"img",src:fm[2],cap:fm[1]});continue;}
    const bm=l.match(/^[-\u2022*]\s+(.*)$/);
    if(bm){
      if(!cur||cur.type!=="list")newList();
      let lvl=indent<2?0:Math.min(3,Math.max(1,Math.floor(indent/4)));
      if(lvl>stack.length)lvl=stack.length;
      const item={text:bm[1],kids:[]};
      if(lvl===0)cur.items.push(item);else stack[lvl-1].kids.push(item);
      stack=stack.slice(0,lvl);stack[lvl]=item;
      continue;
    }
    if(indent>=2&&cur&&cur.type==="list"&&stack.length){stack[stack.length-1].text+="\n"+l;continue;}
    cur=null;stack=[];blocks.push({type:"p",text:l});
  }
  const li=(it,d)=>{
    const t=it.text.split("\n").map(inline).join("<br>");
    const head=it.kids.length&&/^\*\*[^*]+\*\*:?$/.test(it.text.trim());
    return `<li class="${head?"hd":""}">${t}${it.kids.length?`<ul class="l${Math.min(d+1,3)}">${it.kids.map(k=>li(k,d+1)).join("")}</ul>`:""}</li>`;
  };
  let html="",first=true;
  for(const b of blocks){
    if(b.type==="img")html+=figs([{src:b.src,cap:b.cap}]);
    else if(b.type==="list")html+=`<ul class="l0">${b.items.map(i=>li(i,0)).join("")}</ul>`;
    else if(/^\**\s*hence\b/i.test(b.text))html+=`<p class="verdict">${inline(b.text)}</p>`;
    else{html+=`<p${first?' class="lead"':""}>${inline(b.text)}</p>`;first=false;}
  }
  return html;
}
function solution(q){
  const keyNote=answerKeyNote(q);
  if(!q.exp&&!q.sum&&!(q.simg||[]).length)return keyNote;
  const links=q.src.map(u=>/^https?:\/\/\S+/.test(u)?`<a href="${esc(u.split(/\s+/)[0])}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`:`<span class="muted">${esc(u)}</span>`).join("");
  return `${keyNote}<div class="sol"><span class="label">Solution</span>${fmtSol(q.exp)}${figs(q.simg)}${q.sum?`<div class="quick"><b>Quick note:</b> ${esc(q.sum)}</div>`:""}${q.src.length?`<details class="src"><summary>Sources</summary><div>${links}</div></details>`:""}</div>`;
}
const bmBtn=uid=>{const on=!!(S.prog[uid]&&S.prog[uid].b);return `<button class="bm" data-act="bm" data-v="${esc(uid)}" aria-pressed="${on}">${ic("mark")}${on?"Bookmarked":"Bookmark"}</button>`;};

/* ---------- Question search and daily quotes ---------- */
const QUOTES_KEY=LOCAL_PREVIEW?"solo-daily-quotes-preview-v1":"solo-daily-quotes-v1";
const SEARCH_ICON='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
const EDIT_ICON='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4-1 13-13-4-4L4 15z"/></svg>';
const DEFAULT_QUOTES=[
  {text:"One focused hour today is one less doubt on exam day.",author:"Study reminder"},
  {text:"Return to what challenged you. That is where the learning begins.",author:"Study reminder"}
];
const RELATED_TOPICS=[
  ["federalism","federal","federation","centre state relations","center state relations","state centre relations","state center relation","union state relations","inter state council","interstate council","cooperative federalism","fiscal federalism","seventh schedule","distribution of powers","sarkaria commission","punchhi commission"],
  ["fundamental rights","right to equality","right to freedom","constitutional remedies","article 32","article 21","writs"],
  ["parliament","parliamentary","lok sabha","rajya sabha","money bill","joint sitting","legislature"],
  ["judiciary","judicial review","supreme court","high court","judicial independence"],
  ["local government","local self government","panchayati raj","panchayat","municipality","municipalities","73rd amendment","74th amendment"],
  ["monetary policy","repo rate","reverse repo","reserve bank","rbi","cash reserve ratio","bank rate","monetary policy committee"],
  ["fiscal policy","fiscal deficit","revenue deficit","government borrowing","public debt","budget deficit"],
  ["inflation","consumer price index","cpi","wholesale price index","wpi","price rise"],
  ["climate change","global warming","greenhouse gases","carbon emissions","paris agreement","unfccc"],
  ["biodiversity","biological diversity","species diversity","biodiversity hotspot","endemic species"],
  ["agriculture","farming","crop cultivation","minimum support price","msp","irrigation"],
  ["buddhism","buddhist","buddha","four noble truths","eightfold path"],
  ["jainism","jain","jaina","jainas","mahavira","tirthankara","tirthankaras","anekantavada"],
  ["bhakti movement","bhakti","devotional movement","kabir","alvars","nayanars"],
  ["sufism","sufi","sufis","sufi movement","chisti","chishti","silsila","silsilah"],
  ["sikhism","sikh","sikhs","guru nanak","guru granth sahib","khalsa"],
  ["plate tectonics","continental drift","tectonic plates","subduction","sea floor spreading"],
  ["ocean currents","oceanic circulation","thermohaline circulation","gulf stream","el nino","la nina"]
];
// Broad queries expand downwards. Searching Buddhism must not pull in every
// other religion merely because they share the same umbrella category.
const TOPIC_FAMILIES=[{
  aliases:["religion","religions","religious","faith","faiths","religious traditions","religious movements","indian religions","religion in india"],
  terms:["religion","religions","religious","faith","faiths","buddhism","buddhist","buddha","four noble truths","eightfold path","jainism","jain","jaina","jainas","mahavira","tirthankara","tirthankaras","anekantavada","hinduism","hindu","vedic","vedas","upanishads","shaivism","vaishnavism","shaktism","islam","islamic","sufism","sufi","sufis","silsila","silsilah","chishti","chisti","bhakti","kabir","alvars","nayanars","sikhism","sikh","guru nanak","guru granth sahib","khalsa","christianity","christian","zoroastrianism","zoroastrian","judaism","jewish"]
}];
const CSAT_RELATED_TOPICS=[
  ["percentage","percentages","percent","percentage change"],
  ["ratio","ratios","proportion","proportions","ratio and proportion"],
  ["average","averages","mean","arithmetic mean"],
  ["profit and loss","profit loss","profit","loss","discount","marked price","cost price","selling price"],
  ["time and work","work and time","work rate","pipes and cisterns"],
  ["time and distance","speed time distance","speed and distance","relative speed","boats and streams","trains"],
  ["number system","number systems","divisibility","remainders","hcf","lcm"],
  ["probability","probabilities","chance"],
  ["permutation and combination","permutations","combinations","counting principles"],
  ["data interpretation","data analysis","bar chart","pie chart","line graph"],
  ["syllogism","syllogisms","categorical reasoning"],
  ["blood relation","blood relations","family relation","family relations"],
  ["coding decoding","coding and decoding","letter coding"],
  ["seating arrangement","seating arrangements","linear arrangement","circular arrangement"],
  ["direction sense","directions","direction test"],
  ["reading comprehension","comprehension","reading passage"]
];
const CSAT_TOPIC_FAMILIES=[
  {aliases:["reasoning","logical reasoning","analytical reasoning"],terms:["reasoning","syllogism","syllogisms","blood relations","coding decoding","coding and decoding","seating arrangement","direction sense","assumption","conclusion","logical deduction"]},
  {aliases:["quantitative aptitude","numerical ability","basic numeracy","maths","mathematics"],terms:["percentage","percentages","ratio","proportion","average","profit and loss","time and work","time and distance","number system","probability","permutations","combinations","data interpretation"]}
];
const QUESTION_SEARCH={cse:{draft:"",query:"",related:true,page:1},csat:{draft:"",query:"",related:true,page:1}};
let QUESTION_INDEX={questions:null,space:"",rows:[]};
function indexedQuestions(){
  if(QUESTION_INDEX.questions===S.qs&&QUESTION_INDEX.space===S.space)return QUESTION_INDEX.rows;
  const rows=S.qs.map(q=>({q,fields:[{name:"Question",value:q.text},{name:"Options",value:Object.values(q.options||{}).join(" ")},{name:"Solution",value:[q.exp,q.sum].filter(Boolean).join("\n")}].map(f=>({...f,normal:searchNormalize(f.value)})),labels:[{name:"Topic label",value:q.topic},{name:"Subject label",value:q.subject}].map(f=>({...f,normal:searchNormalize(f.value)}))}));
  QUESTION_INDEX={questions:S.qs,space:S.space,rows};return rows;
}
const activeSearch=()=>QUESTION_SEARCH[S.space]||QUESTION_SEARCH.cse;
function searchNormalize(value){
  return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/).map(w=>w==="center"?"centre":w==="relations"?"relation":w==="states"?"state":w==="centres"?"centre":w).join(" ");
}
function hasSearchPhrase(text,phrase){return !!phrase&&(" "+text+" ").includes(" "+phrase+" ");}
function searchPlan(query,related=true){
  const phrase=searchNormalize(query),tokens=[...new Set(phrase.split(" ").filter(Boolean))];
  const groups=related?(S.space==="csat"?CSAT_RELATED_TOPICS:RELATED_TOPICS).filter(g=>g.some(alias=>searchNormalize(alias)===phrase)):[];
  const families=related?(S.space==="csat"?CSAT_TOPIC_FAMILIES:TOPIC_FAMILIES).filter(f=>f.aliases.some(alias=>searchNormalize(alias)===phrase)):[];
  const aliases=[...new Set([...groups.flat(),...families.flatMap(f=>f.terms)].map(searchNormalize))].filter(a=>a!==phrase);
  return {phrase,tokens,aliases};
}
function searchQuestions(query,related=true){
  if(!isSearchSpace())return [];
  const plan=searchPlan(query,related);if(!plan.tokens.length)return [];
  return indexedQuestions().filter(({q})=>sourceExamOk(activeSearch(),q)).flatMap(({q,fields,labels})=>{
    const directFields=fields.filter(f=>plan.tokens.every(t=>hasSearchPhrase(f.normal,t)));
    const relatedCandidates=[...fields,...labels];
    const relatedFields=related?relatedCandidates.filter(f=>plan.aliases.some(a=>hasSearchPhrase(f.normal,a))||(labels.includes(f)&&hasSearchPhrase(f.normal,plan.phrase))):[];
    if(!directFields.length&&!relatedFields.length)return [];
    const direct=!!directFields.length,matched=direct?directFields:relatedFields;
    const terms=direct?plan.tokens:[...new Set([...plan.aliases,plan.phrase].filter(a=>relatedFields.some(f=>hasSearchPhrase(f.normal,a))))];
    const score=(direct?1000:0)+(directFields.some(f=>hasSearchPhrase(f.normal,plan.phrase))?100:0)+(matched.some(f=>f.name==="Question")?30:matched.some(f=>f.name==="Options")?20:10);
    return [{q,direct,fields:matched.map(f=>f.name),terms,score,excerpt:matched.find(f=>f.name==="Solution")?.value||""}];
  }).sort((a,b)=>b.score-a.score||(Number(b.q.year)||0)-(Number(a.q.year)||0)||a.q.no-b.q.no);
}
function searchHighlight(value,terms){
  // Locate normalized whole words, then escape the original text around marks.
  const text=String(value||""),words=[...text.matchAll(/[\p{L}\p{N}]+/gu)];
  const normals=words.map(w=>searchNormalize(w[0])),ranges=[];
  for(const term of terms){const parts=term.split(" ");for(let i=0;i<=words.length-parts.length;i++){
    if(parts.every((p,j)=>normals[i+j]===p))ranges.push([words[i].index,words[i+parts.length-1].index+words[i+parts.length-1][0].length]);
  }}
  ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const r of ranges){const last=merged[merged.length-1];if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
  let out="",at=0;for(const [start,end] of merged){out+=esc(text.slice(at,start))+"<mark>"+esc(text.slice(start,end))+"</mark>";at=end;}return out+esc(text.slice(at));
}
function searchExcerpt(text,terms){
  const words=[...String(text).matchAll(/[\p{L}\p{N}]+/gu)];
  const termWords=new Set(terms.flatMap(t=>t.split(" "))),hit=words.find(w=>termWords.has(searchNormalize(w[0])));
  const start=Math.max(0,(hit?.index||0)-90),end=Math.min(text.length,start+360);
  return (start?"…":"")+text.slice(start,end)+(end<text.length?"…":"");
}
function searchResult(row){
  const {q,direct,fields,terms,excerpt}=row,pack=S.packs.find(p=>p.id===q.packId);
  return `<article class="search-result"><div class="row sp"><div class="qmeta"><span class="tag">${esc(q.subject)}</span><span class="tag plain">${esc(q.topic)}</span>${q.year?`<span class="tag plain">${esc(q.year)}</span>`:""}${sourceExamBadge(q)}</div><span class="tag${direct?"":" plain"}">${direct?"Keyword match":"Related topic"}</span></div>
    <p class="match-note">${esc(pack?.title||"Imported set")} · Q${q.no} · Found in ${esc(fields.join(" + ").toLowerCase())}</p>
    <h3>${searchHighlight(questionDisplayText(q.text),terms)}</h3>
    ${excerpt?`<p class="search-excerpt"><strong>Solution excerpt</strong><br>${searchHighlight(searchExcerpt(excerpt,terms),terms)}</p>`:""}
    ${!direct?`<p class="match-note">Related terms found: ${esc(terms.join(", "))}</p>`:""}
    <details class="search-answer"><summary>View options, answer &amp; full solution</summary><div class="search-answer-body">${figs(q.qimg)}${Object.entries(q.options).map(([key,value])=>`<p><strong>${esc(key)}.</strong> ${searchHighlight(value,terms)}</p>`).join("")}<p class="gold">Accepted answer: ${esc(acceptedAnswers(q).join(" or "))}</p>${solution(q)||`<p class="hint">No solution was included in this import.</p>`}</div></details></article>`;
}
function viewQuestionSearch(){
  const {query,related,page}=activeSearch(),csat=S.space==="csat",examples=csat?["Comprehension","Percentages","Time and work","Logical reasoning"]:["Federalism","Religion","Monetary policy","Biodiversity"],rows=searchQuestions(query,related),exact=rows.filter(r=>r.direct).length,relatedCount=rows.length-exact;
  const size=12,pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(page,pages),plan=searchPlan(query,related);
  return `<button class="backlink" data-feature-act="search-back">← Back to ${spaceName()} Practice</button>
    <section class="card search-box"><div class="row sp"><span class="label gold">Explore your ${spaceName()} question bank</span>${SEARCH_ICON}</div><h1>Has this topic appeared before?</h1><p class="muted">Find words and related topics in your imported questions, options and solutions.</p>
    <form id="question-search-form" class="search-form" role="search"><label class="sr-only" for="question-search-input">Search ${spaceName()} questions</label><input class="txt" id="question-search-input" type="search" maxlength="160" value="${esc(activeSearch().draft)}" placeholder="${csat?"Try percentages, comprehension, syllogisms…":"Try federalism, inflation, Buddhism…"}" autocomplete="off"><button class="btn pri" type="submit">Search questions</button></form>
    <div class="search-controls"><label><input id="search-related" type="checkbox" ${related?"checked":""}> Include related topics</label><span class="hint">Questions + options + solutions</span></div>
    ${sourceExamBlock(activeSearch(),"search")}
    <div class="search-chips"><span class="hint">Try</span>${examples.map(t=>`<button class="chip" data-feature-act="search-suggestion" data-value="${esc(t)}">${esc(t)}</button>`).join("")}</div></section>
    ${query?`<div class="field" style="gap:8px" role="status"><div class="row sp"><h2>${rows.length} result${rows.length===1?"":"s"} for “${esc(query)}”</h2><span class="hint">${S.qs.filter(q=>sourceExamOk(activeSearch(),q)).length} ${spaceName()} questions searched</span></div><div class="search-counts"><span class="tag">${exact} keyword match${exact===1?"":"es"}</span>${related?`<span class="tag plain">${relatedCount} related-topic match${relatedCount===1?"":"es"}</span>`:""}</div>${plan.aliases.length?`<p class="hint">Also looking for: ${esc(plan.aliases.slice(0,6).join(", "))}${plan.aliases.length>6?"…":""}</p>`:""}</div>`:`<section class="card flat"><h2>Follow a topic across papers</h2><p class="muted">${csat?"Search “percentages” to find direct mentions and related terms such as percent and percentage change.":"Search “federalism” to find direct mentions, plus related terms such as Centre–State relations and the Seventh Schedule."}</p></section>`}
    ${query&&!rows.length?`<section class="card flat"><h2>No matching questions in this bank</h2><p class="muted">Try a shorter keyword or import more ${spaceName()} papers. No match here does not mean a topic has never appeared in UPSC.</p></section>`:""}
    ${rows.slice((current-1)*size,current*size).map(searchResult).join("")}
    ${pages>1?`<nav class="search-pagination" aria-label="Search result pages"><button class="btn sm" data-feature-act="search-page" data-value="${current-1}" ${current===1?"disabled":""}>Previous</button><span class="hint">${current} / ${pages}</span><button class="btn sm" data-feature-act="search-page" data-value="${current+1}" ${current===pages?"disabled":""}>Next</button></nav>`:""}
    <details class="card flat"><summary class="hint">How are related topics matched?</summary><p class="hint">Keyword matches look for all your search words within question text, options or a solution. Related matching also checks topic and subject labels, plus a curated dictionary: ${csat?"for example, logical reasoning includes syllogisms, blood relations and seating arrangements. Broad categories expand to their subtopics; a narrow syllogism search stays focused on syllogisms.":"for example, religion includes Buddhism, Jainism, Bhakti and Sufism. Broad categories expand to their subtopics; a narrow Buddhism search stays focused on Buddhism."} This is dictionary-based matching, not an AI understanding of every topic.${query&&related&&!plan.aliases.length?" This search has no dictionary expansion; only your words and matching topic labels are being checked.":""}</p></details>
    <p class="hint">Results cover your imports only. No result does not prove a topic has never appeared in UPSC. Browsing results does not record an attempt.</p>`;
}
function parseQuoteJson(text){
  const data=JSON.parse(text),list=Array.isArray(data)?data:data&&data.quotes;
  if(!Array.isArray(list)||!list.length||list.length>500)throw Error("Use a list of 1–500 quotes, or an object with a quotes list.");
  return list.map((row,i)=>{
    const quote=typeof row==="string"?row:row&&typeof row==="object"?(row.text??row.quote):null;
    const author=typeof row==="string"?"":row?.author??"";
    if(typeof quote!=="string"||!quote.trim()||quote.length>2000||typeof author!=="string"||author.length>160)throw Error("Quote "+(i+1)+" needs text (up to 2,000 characters) and an optional author (up to 160).");
    return {text:quote.trim(),author:author.trim()};
  });
}
function readQuoteCache(key){try{const raw=localStorage.getItem(key);return raw?parseQuoteJson(raw):null;}catch(e){return null;}}
let dailyQuotes=readQuoteCache(QUOTES_KEY)||structuredClone(DEFAULT_QUOTES);
let quoteSync={state:"browser",owner:"",hasRemote:false,error:""},quoteGeneration=0,quoteSaving=false;
const accountQuoteMode=mode=>mode==="cloud"||mode==="account";
const quoteCacheKey=owner=>QUOTES_KEY+":"+owner;
function cacheAccountQuotes(owner,quotes){try{localStorage.setItem(quoteCacheKey(owner),JSON.stringify(quotes));}catch(e){/* The backend remains the source of truth if caching is blocked. */}}
function legacyQuotesFor(owner,claim=false){
  try{
    const previous=localStorage.getItem(QUOTES_KEY+":legacy-owner");
    if(previous&&previous!==owner)return null;
    const quotes=readQuoteCache(QUOTES_KEY);
    if(quotes&&claim)localStorage.setItem(QUOTES_KEY+":legacy-owner",owner);
    return quotes;
  }catch(e){return null;}
}
function quoteSyncError(error){
  return ["PGRST205","42P01"].includes(error?.code)?"Account quote storage needs its one-time setup. Your browser quotes are safe.":"Quotes could not sync with your account. Please retry. "+(error?.message||"");
}
async function loadStoredQuotes(store,mode,{migrate=true}={}){
  const generation=++quoteGeneration,owner=store?.quoteOwner||"";
  quoteSync={state:accountQuoteMode(mode)?"loading":"browser",owner,hasRemote:false,error:""};
  dailyQuotes=(accountQuoteMode(mode)?readQuoteCache(quoteCacheKey(owner)):readQuoteCache(QUOTES_KEY))||structuredClone(DEFAULT_QUOTES);
  if(!accountQuoteMode(mode))return;
  try{
    if(!owner||!store.loadQuotes)throw Error("Account quote storage is unavailable.");
    let saved=await store.loadQuotes();
    if(generation!==quoteGeneration)return;
    if(migrate){
      const previous=legacyQuotesFor(owner,true);
      if(saved===null&&previous){
        dailyQuotes=previous;
        saved=await store.saveQuotes(previous,{onlyIfMissing:true});
        if(saved===null)throw Error("Your browser quotes have not reached the account yet.");
      }
    }
    if(generation!==quoteGeneration)return;
    if(saved!==null){dailyQuotes=parseQuoteJson(JSON.stringify(saved));cacheAccountQuotes(owner,dailyQuotes);}
    else dailyQuotes=structuredClone(DEFAULT_QUOTES);
    quoteSync={state:"ready",owner,hasRemote:saved!==null,error:""};
  }catch(error){
    if(generation===quoteGeneration)quoteSync={state:"error",owner,hasRemote:false,error:quoteSyncError(error)};
  }
}
async function persistQuoteCollection(rows){
  if(quoteSaving)return false;
  const valid=parseQuoteJson(JSON.stringify(rows)),store=S.store,mode=S.storage,generation=quoteGeneration,owner=quoteSync.owner;
  quoteSaving=true;
  try{
    let saved=valid;
    if(accountQuoteMode(mode)){
      if(!store?.saveQuotes||!owner||owner!==store.quoteOwner)throw Error("Sign in again to save quotes to your account.");
      quoteSync={...quoteSync,state:"saving",error:""};
      const result=await store.saveQuotes(valid);
      if(generation!==quoteGeneration||S.store!==store)return false;
      saved=parseQuoteJson(JSON.stringify(result));
      cacheAccountQuotes(owner,saved);
      // Preserve the previous browser collection as a recoverable copy, owned by this account.
      legacyQuotesFor(owner,true);
      quoteSync={state:"ready",owner,hasRemote:true,error:""};
    }else localStorage.setItem(QUOTES_KEY,JSON.stringify(valid));
    dailyQuotes=saved;return true;
  }catch(error){
    if(generation!==quoteGeneration)return false;
    if(accountQuoteMode(mode))quoteSync={...quoteSync,state:"error",error:quoteSyncError(error)};
    throw error;
  }finally{if(generation===quoteGeneration)quoteSaving=false;}
}
function quoteStorageLabel(){
  if(!accountQuoteMode(S.storage))return "Saved in this browser only";
  if(quoteSync.state==="saving")return "Saving to your account…";
  if(quoteSync.state==="loading")return "Loading your account quotes…";
  if(quoteSync.state==="error")return "Not synced · your draft stays here";
  return quoteSync.hasRemote?"Saved to your account · available on your devices":"Quotes will save to your account";
}
function resetQuoteSession(){
  quoteGeneration++;quoteSaving=false;quoteSync={state:"browser",owner:"",hasRemote:false,error:""};dailyQuotes=structuredClone(DEFAULT_QUOTES);quoteDraft=[];
  const dialog=document.getElementById("quote-dialog");if(dialog?.open)dialog.close();
}
function quoteForDay(quotes,date=new Date()){
  const day=Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);
  return quotes[((day%quotes.length)+quotes.length)%quotes.length];
}
function quoteCard(){
  const quote=quoteForDay(dailyQuotes);
  return `<aside class="quote-card" aria-label="Quote of the day" title="${esc(quote.text+(quote.author?' — '+quote.author:''))}"><span class="quote-label">Quote of the day${quoteSync.state==="error"?'<span class="quote-sync-warning"> · Not synced</span>':""}</span><p class="quote-copy"><em>“${esc(quote.text)}”</em></p><div class="quote-bottom">${quote.author?`<span class="quote-author">— ${esc(quote.author)}</span>`:""}<button class="quote-edit" data-feature-act="quote-edit" aria-label="Edit quote collection" title="Edit all quotes">${EDIT_ICON}</button></div></aside>`;
}
let quoteDraft=[],quoteTrigger=null;
function quoteEntry(q,i){return `<section class="quote-entry"><div class="row sp"><label class="label" for="quote-text-${i}">Quote ${i+1}</label><button type="button" class="linkbtn" data-feature-act="quote-remove" data-value="${i}" aria-label="Remove quote ${i+1}">Remove</button></div><textarea id="quote-text-${i}" data-quote-text="${i}" maxlength="2000" aria-label="Quote ${i+1} text">${esc(q.text)}</textarea><input class="txt" data-quote-author="${i}" maxlength="160" value="${esc(q.author)}" placeholder="Author (optional)" aria-label="Quote ${i+1} author"></section>`;}
function drawQuoteEditor(){
  const dialog=document.getElementById("quote-dialog");
  const previous=accountQuoteMode(S.storage)?legacyQuotesFor(quoteSync.owner):null;
  const recover=previous&&JSON.stringify(previous)!==JSON.stringify(dailyQuotes);
  dialog.innerHTML=`<form id="quote-editor-form" class="quote-editor-layout"><div class="row sp"><h2 id="quote-editor-title">Your daily quotes</h2><button type="button" class="quote-close" data-feature-act="quote-cancel" aria-label="Close quote editor">×</button></div><p class="quote-editor-intro">One quote each day, rotating through your collection. Edit any quote or import your own JSON file.</p><div class="row"><button type="button" class="btn sm" data-feature-act="quote-import">Import JSON</button><button type="button" class="btn sm" data-feature-act="quote-add">+ Add quote</button>${recover?'<button type="button" class="btn sm" data-feature-act="quote-browser-import">Import browser quotes</button>':""}<span class="hint">${quoteDraft.length} quote${quoteDraft.length===1?"":"s"}</span></div><input type="file" id="quote-json-file" accept=".json,application/json" hidden><p id="quote-error" class="quote-error" role="alert"></p><div class="quote-list">${quoteDraft.map(quoteEntry).join("")||`<p class="muted">Add at least one quote before saving.</p>`}</div><details><summary class="hint">Supported JSON format</summary><pre class="quote-json-format">${esc(JSON.stringify({quotes:[{text:"Your quote here",author:"Author name"}]},null,2))}</pre><p class="hint" style="margin-top:8px">A list of plain quote strings also works. Import replaces this draft collection; Save applies it.</p></details><footer class="quote-editor-footer"><div class="row sp"><span class="hint" role="status" aria-live="polite">${esc(quoteStorageLabel())}</span><div class="row"><button type="button" class="btn sm" data-feature-act="quote-cancel">Cancel</button><button type="submit" class="btn pri sm">Save quotes</button></div></div></footer></form>`;
  dialog.querySelectorAll("button,input,textarea").forEach(control=>{control.disabled=quoteSaving;});
}
function ensureQuoteDialog(){
  if(document.getElementById("quote-dialog"))return;
  const dialog=document.createElement("dialog");dialog.id="quote-dialog";dialog.className="quote-dialog";dialog.setAttribute("aria-labelledby","quote-editor-title");document.body.appendChild(dialog);
  dialog.addEventListener("cancel",event=>{if(quoteSaving){event.preventDefault();return;}quoteDraft=[];});
}
function openQuoteEditor(trigger){
  if(!S.ready||quoteSync.state==="loading"){toast("Your quotes are still loading. Please try again in a moment.");return;}
  ensureQuoteDialog();quoteDraft=structuredClone(dailyQuotes);quoteTrigger=trigger;drawQuoteEditor();document.getElementById("quote-dialog").showModal();
  if(quoteSync.error)document.getElementById("quote-error").textContent=quoteSync.error;
}
function closeQuoteEditor(){document.getElementById("quote-dialog").close();quoteTrigger?.focus();}
function runQuestionSearch(value){activeSearch().query=String(value).trim().slice(0,160);activeSearch().draft=activeSearch().query;activeSearch().page=1;render();}
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-feature-act]");if(!el)return;
  if(quoteSaving&&el.dataset.featureAct.startsWith("quote-"))return;
  switch(el.dataset.featureAct){
    case "search-open":if(!isSearchSpace())return;S.view="search";S.tab="practice";S.quiz=null;render();document.getElementById("question-search-input").focus();window.scrollTo(0,0);break;
    case "search-back":S.view="home";render();window.scrollTo(0,0);break;
    case "search-suggestion":runQuestionSearch(el.dataset.value);break;
    case "search-page":activeSearch().page=Number(el.dataset.value);render();document.getElementById("question-search-form").scrollIntoView({block:"start"});break;
    case "quote-edit":openQuoteEditor(el);break;
    case "quote-cancel":closeQuoteEditor();break;
    case "quote-add":if(quoteDraft.length>=500){document.getElementById("quote-error").textContent="The collection can contain up to 500 quotes.";break;}quoteDraft.push({text:"",author:""});drawQuoteEditor();document.getElementById("quote-text-"+(quoteDraft.length-1)).focus();break;
    case "quote-remove":quoteDraft.splice(Number(el.dataset.value),1);drawQuoteEditor();break;
    case "quote-import":document.getElementById("quote-json-file").click();break;
    case "quote-browser-import":{const previous=legacyQuotesFor(quoteSync.owner);if(previous){quoteDraft=structuredClone(previous);drawQuoteEditor();}break;}
  }
});
document.addEventListener("input",e=>{
  if(e.target.id==="question-search-input")activeSearch().draft=e.target.value;
  if(e.target.dataset&&Object.hasOwn(e.target.dataset,"quoteText"))quoteDraft[Number(e.target.dataset.quoteText)].text=e.target.value;
  if(e.target.dataset&&Object.hasOwn(e.target.dataset,"quoteAuthor"))quoteDraft[Number(e.target.dataset.quoteAuthor)].author=e.target.value;
});
document.addEventListener("change",async e=>{
  if(e.target.id==="search-related"){activeSearch().related=e.target.checked;activeSearch().page=1;render();}
  if(e.target.id!=="quote-json-file")return;
  const file=e.target.files?.[0];if(!file)return;
  try{if(file.size>1048576)throw Error("Choose a JSON file smaller than 1 MB.");const imported=parseQuoteJson(await file.text());if(!document.getElementById("quote-dialog").open)return;quoteDraft=imported;drawQuoteEditor();}
  catch(err){document.getElementById("quote-error").textContent=err instanceof SyntaxError?"This file is not valid JSON. Your saved quotes have not changed.":err.message;}
});
document.addEventListener("submit",async e=>{
  if(e.target.id==="question-search-form"){e.preventDefault();if(isSearchSpace())runQuestionSearch(document.getElementById("question-search-input").value);}
  if(e.target.id==="quote-editor-form"){
    e.preventDefault();if(quoteSaving)return;
    const generation=quoteGeneration;
    try{
      parseQuoteJson(JSON.stringify(quoteDraft));
      document.getElementById("quote-error").textContent="";
      const pending=persistQuoteCollection(quoteDraft);drawQuoteEditor();
      if(!await pending)return;
      closeQuoteEditor();render();document.querySelector('[data-feature-act="quote-edit"]')?.focus();toast(accountQuoteMode(S.storage)?"Quote collection saved to your account":"Quote collection saved in this browser");
    }catch(err){
      if(generation!==quoteGeneration)return;
      drawQuoteEditor();document.getElementById("quote-error").textContent=quoteSync.error||err.message;
    }
  }
});
// Refresh the daily card after midnight when the page becomes visible again.
document.addEventListener("visibilitychange",async()=>{
  if(document.visibilityState!=="visible"||document.getElementById("quote-dialog")?.open||S.quiz||quoteSaving)return;
  if(S.store&&accountQuoteMode(S.storage))await loadStoredQuotes(S.store,S.storage,{migrate:false});
  const card=document.querySelector(".quote-card");if(card)card.outerHTML=quoteCard();
});

/* ---------- view helpers ---------- */
const SUN=`<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MOON=`<svg class="ic" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const themeBtn=()=>`<button class="tgl" data-act="theme" aria-label="${S.theme==='light'?'Switch to dark mode':'Switch to light mode'}" title="${S.theme==='light'?'Dark mode':'Light mode'}">${S.theme==='light'?MOON:SUN}</button>`;
const UI_ARROW='<svg class="ui-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-5-5 5 5-5 5"/></svg>';
function storageStatus(){
  if(!S.ready)return "Opening your bank...";
  if(S.storage==="cloud")return `Signed in as ${esc(S.user?.email||"")} · <button class="linkbtn" data-act="signout" data-ui-menu="close">Sign out</button>`;
  return S.storage==="account"?"Saved to your Claude account":"Saved in this browser only";
}
function header(){
  const open=openMistakes().length;
  const tabs=[["practice","Practice","quiz"],["notebook","Notebook","notebook"],["marks","Bookmarks","mark"],["import","Import","book"]];
  return `<header class="ui-header"><div class="ui-topbar"><div class="ui-brand"><button class="ui-menu-toggle" data-ui-menu="open" aria-label="Open navigation menu" aria-controls="ui-navigation-menu" aria-expanded="false"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><div><button class="logo" data-act="home" aria-label="Solo Leveling, go to home">SOLO LEVELING</button><span class="ui-brand-caption"><span class="ui-active-space" aria-label="Current practice section">${DASH.open?"Dashboard":esc(spaceName())}</span></span></div></div><div class="ui-space-row ui-quote-only">${quoteCard()}</div><div class="hdr-r">${syncBadge()}${themeBtn()}</div></div>
  <nav class="tabs ui-tabs" role="tablist" aria-label="Study tools">${tabs.map(([key,label,icon])=>`<a class="tab" role="tab" aria-selected="${S.tab===key}" href="${sectionHash(S.space,key)}" data-v="${key}" data-route>${icon?ic(icon):""}${label}${key==="notebook"&&open?`<span class="badge">${open}</span>`:""}</a>`).join("")}</nav></header>`;
}

const UI_MENU_DETAILS={
  static:{icon:"book",description:"Build your subject knowledge"},
  ca:{icon:"heat",description:"Practise your monthly question sets"},
  cse:{icon:"quiz",description:"Civil Services previous-year questions"},
  csat:{icon:"book",description:"Aptitude and comprehension previous-year questions"},
  capf:{icon:"flag",description:"CAPF previous-year questions"}
};
function uiMenuExpanded(open){
  document.querySelector('[data-ui-menu="open"]')?.setAttribute("aria-expanded",String(open));
}
function drawUiMenu(){
  const dialog=document.getElementById("ui-navigation-menu");
  const dark=S.theme!=="light";
  dialog.innerHTML='<div class="ui-menu-head"><h2 id="ui-menu-title">Menu</h2><div class="ui-menu-controls"><button id="ui-menu-theme" class="ui-menu-theme" data-act="theme" data-ui-menu="theme" role="switch" aria-checked="'+dark+'" aria-label="Dark theme">'+(dark?MOON:SUN)+'<span class="ui-menu-switch" aria-hidden="true"><span></span></span></button><button class="ui-menu-close" data-ui-menu="close" aria-label="Close navigation menu"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 14M19 5 5 19"/></svg></button></div></div><p class="ui-menu-caption">Study spaces and tools</p><nav class="ui-menu-list" aria-label="Study spaces and tools">'+dashMenuItem()+mappingMenuItem()+Object.entries(SPACES).map(([key,space])=>{
    const info=UI_MENU_DETAILS[key],active=!DASH.open&&S.space===key;
    return '<a class="ui-menu-item" href="'+sectionHash(key)+'" data-v="'+key+'" data-route data-ui-menu="select"'+(active?' aria-current="page"':'')+'><span class="ui-menu-icon">'+ic(info.icon)+'</span><span class="ui-menu-copy"><strong>'+esc(space.label)+'</strong><small>'+esc(info.description)+'</small></span>'+(active?'<span class="ui-menu-current">Current</span>':'<svg class="ic ui-menu-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>')+'</a>';
  }).join("")+'</nav><div class="ui-menu-footer">'+storageStatus()+'</div>';
}
function mappingMenuItem(){
  return '<a class="ui-menu-item ui-mapping-link" href="./mapping/" target="_blank" rel="noopener" data-open-mapping aria-label="Mapping, opens in a new tab"><span class="ui-menu-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15"/></svg></span><span class="ui-menu-copy"><strong>Mapping</strong><small>Explore India and World</small></span><svg class="ic ui-menu-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3 11 13M10 3H3v18h18v-7"/></svg></a>';
}
document.addEventListener("click",event=>{
  if(event.target.closest("a[data-open-mapping]"))document.getElementById("ui-navigation-menu")?.close();
});
function ensureUiMenu(){
  let dialog=document.getElementById("ui-navigation-menu");
  if(dialog)return dialog;
  dialog=document.createElement("dialog");
  dialog.id="ui-navigation-menu";dialog.className="ui-menu";
  dialog.setAttribute("aria-labelledby","ui-menu-title");
  dialog.addEventListener("close",()=>{
    document.body.classList.remove("ui-menu-open");
    uiMenuExpanded(false);
    document.querySelector('[data-ui-menu="open"]')?.focus();
  });
  dialog.addEventListener("click",event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  });
  document.body.appendChild(dialog);return dialog;
}
function openUiMenu(){
  const dialog=ensureUiMenu();
  if(dialog.open)return;
  drawUiMenu();dialog.showModal();
  document.body.classList.add("ui-menu-open");uiMenuExpanded(true);
  dialog.querySelector('[data-ui-menu="close"]').focus();
}


function emptyBank(){
  return `<section class="card"><h2>${isExamSpace()?`Your ${spaceName()} PYQ bank is empty`:"Your question bank is empty"}</h2>
  <p class="muted">${isExamSpace()?`Import your ${spaceName()} PYQ JSON files to begin. Subjects and sub-topics are created from each file.`:"Import a question set to begin. Each file creates its subject and sub-topic lists on its own."}</p>
  <div class="row"><button class="btn pri" data-act="tab" data-v="import">Import questions</button></div></section>`;
}

/* ---------- practice ---------- */
function rank(q){const p=S.prog[q.uid];return p&&p.m?0:!(p&&p.a)?1:2;}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const latestPack=()=>spacePacks().filter(p=>p.ts).sort((a,b)=>b.ts-a.ts)[0]||null;
const effCount=o=>o.count==="custom"?Math.max(1,Math.min(200,parseInt(o.custom,10)||1)):o.count;
const tgt=()=>S.view==="smart"?S.smart:S.sel;
const priority=q=>{const p=S.prog[q.uid]||{};const w=p.w||0,sk=p.sk||0;return w>=2||w+sk>=3||(p.l==="w"&&p.cf==="s")?3:w===1?2:1;};
const PRI={3:"High priority",2:"Mid priority",1:"Low priority"};
function smartPool(sub,o){
  return openMistakes().filter(q=>(!sub||q.subject===sub)&&(!o||!o.subjects||!o.subjects.size||o.subjects.has(q.subject))&&(!o||!o.topics||!o.topics.size||o.topics.has(topicKey(q.subject,q.topic)))&&monthOk(o,q)&&sourceExamOk(o,q)&&!((S.prog[q.uid].cd||[]).includes(dayKey()))).sort((a,b)=>priority(b)-priority(a)||(S.prog[a.uid].t-S.prog[b.uid].t));
}
function pool(){
  const s=S.sel,lp=latestPack();
  return S.qs.filter(q=>{
    if(s.subjects.size&&!s.subjects.has(q.subject))return false;
    if(s.topics.size&&!s.topics.has(topicKey(q.subject,q.topic)))return false;
    if(s.pack!=="all"&&q.packId!==s.pack)return false;
    if(!monthOk(s,q))return false;
    if(!sourceExamOk(s,q))return false;
    const p=S.prog[q.uid];
    if(s.which==="wrong")return !!(p&&p.m);
    if(s.which==="new")return !(p&&p.a);
    if(s.which==="latest")return !!lp&&q.packId===lp.id;
    return true;
  });
}
function pickSet(){
  const s=S.sel,p=pool();
  const ordered=s.which==="shuffle"?shuffle(p):s.which==="latest"?p.slice().sort((a,b)=>a.no-b.no):shuffle(p).sort((a,b)=>rank(a)-rank(b));
  const take=ordered.slice(0,effCount(s));
  return (s.which==="latest"?take:interleave(take)).map(q=>q.uid);
}
function prefsBlock(o,avail){
  const eff=effCount(o);
  return `${sourceExamBlock(o,S.view==="smart"?"smart":"quiz")}${monthBlock(o)}<div class="field"><span class="label">Number of questions</span><div class="opts4">${[10,20,30,"custom"].map(c=>`<button class="pbtn" aria-pressed="${o.count===c}" data-act="pc" data-v="${c}">${c==="custom"?"Custom":c}</button>`).join("")}</div>
  ${o.count==="custom"?`<input type="number" class="num" min="1" max="200" value="${esc(o.custom)}" data-change="custom" aria-label="Custom number of questions">`:""}</div>
  <div class="field"><span class="label">Mode</span><div class="grid2" style="gap:12px">${[["practice","Practice","See the answer and solution after each question"],["exam","Exam","Review everything after you submit"]].map(([k,t,d])=>`<button class="mode" aria-pressed="${o.mode===k}" data-act="pm" data-v="${k}"><strong>${t}</strong><span class="muted">${d}</span></button>`).join("")}</div></div>
  ${avail<eff?`<div class="info">Only ${avail} question${avail===1?"":"s"} match. We'll start with ${avail}.</div>`:""}`;
}
function pyqYear(q){
  const year=String(q.year||"").trim();
  if(year)return /^(19|20)\d{2}$/.test(year)?year:"unknown";
  const title=S.packs.find(p=>p.id===q.packId)?.title||"";
  const years=[...new Set(title.match(/\b(?:19|20)\d{2}\b/g)||[])];
  return years.length===1?years[0]:"unknown";
}
const pyqYearLabel=year=>year==="unknown"?"Year not set":year;
function pyqYearQuestions(year){
  if(!isExamSpace())return [];
  return S.qs.filter(q=>pyqYear(q)===year&&sourceExamOk(S.pyqSource,q)).sort((a,b)=>a.no-b.no||a.packId.localeCompare(b.packId));
}
function attemptPyqYear(year){
  const qs=pyqYearQuestions(year);if(!qs.length)return;
  startQuiz(qs.map(q=>q.uid),{mode:S.newMode,kind:spaceName()+" year PYQ",label:pyqYearLabel(year)});
}
function reviewPyqYear(year){
  if(!pyqYearQuestions(year).length)return;
  S.tr={year,f:"all",i:0};S.view="tr";S.tab="practice";S.quiz=null;render();window.scrollTo(0,0);
}
function pyqYearsCard(){
  const years=[...new Set(S.qs.filter(q=>sourceExamOk(S.pyqSource,q)).map(pyqYear))].sort((a,b)=>a==="unknown"?1:b==="unknown"?-1:Number(b)-Number(a));
  return `<section class="card"><div class="row sp"><h2>${spaceName()} PYQs by year</h2>${modeSeg()}</div>${sourceExamBlock(S.pyqSource,"year")}<p class="muted">Attempt the imported questions from one year, or review its answers, solutions and your progress.</p>${years.length?`<div class="scrolllist">${years.map(year=>{const qs=pyqYearQuestions(year),s=stat(qs);return `<div class="pack"><div><strong>${esc(pyqYearLabel(year))}</strong><div class="hint">${qs.length} question${qs.length===1?"":"s"} · ${s.att} answered · ${s.ok} correct</div></div><div class="row"><button class="btn pri sm" data-act="yearattempt" data-v="${esc(year)}" aria-label="Attempt ${esc(pyqYearLabel(year))} PYQs">Attempt</button><button class="btn sm" data-act="yearreview" data-v="${esc(year)}" aria-label="Review ${esc(pyqYearLabel(year))} PYQs">Review</button></div></div>`;}).join("")}</div>`:`<p class="hint">${S.space==="csat"&&S.pyqSource?.sourceExam?"No questions match this source. Choose All sources or import more files.":"Years appear here after you import your PYQ files."}</p><div><button class="btn" data-act="tab" data-v="import">Import PYQs</button></div>`}<p class="hint">Attempt includes previously answered questions too. Years come from your imported files or test titles. If missing, set the PYQ year during import.</p></section>`;
}

function unattemptedCard(){
  const rows=spacePacks().slice().sort((a,b)=>(b.ts||0)-(a.ts||0)).map(p=>{const n=S.qs.filter(q=>q.packId===p.id&&!(S.prog[q.uid]&&S.prog[q.uid].a)).length;return {p,n};}).filter(r=>r.n&&r.n===r.p.questions.length);
  if(!rows.length)return "";
  return `<div class="card"><div class="row sp"><div><strong>Tests not attempted yet</strong><div class="muted" style="font-size:14px">${rows.length} test${rows.length===1?"":"s"} you have never started</div></div>${modeSeg()}</div><div class="${rows.length>4?"scrolllist":""}">${rows.map(r=>`<div class="pack"><div><strong>${esc(r.p.title)}</strong><div class="muted" style="font-size:14px">${r.n} question${r.n===1?"":"s"}</div></div><button class="btn pri sm" data-act="attemptpack" data-v="${esc(r.p.id)}">Attempt</button></div>`).join("")}</div></div>`;
}
const NOTEBOOK_COLOURS=["#1da2bf","#9182e7","#d44d85","#7e9fc0","#b87cad","#249c45","#3989e0","#e9656c","#b77951","#20a47d","#92a51c","#cf9200","#7b828c","#dc6026"];
function notebookSubjects(){
  const counts=new Map();for(const q of openMistakes())counts.set(q.subject,(counts.get(q.subject)||0)+1);
  return [...counts].map(([subject,count])=>({subject,count})).sort((a,b)=>b.count-a.count).map((row,i)=>({...row,colour:NOTEBOOK_COLOURS[i%NOTEBOOK_COLOURS.length]}));
}
function notebookOverview(){
  const rows=notebookSubjects(),total=rows.reduce((n,r)=>n+r.count,0),lead=rows[0];
  return `<section class="card notebook-overview" aria-labelledby="notebook-overview-title"><div class="notebook-overview-top"><div class="icon">${ic("notebook")}</div><div class="notebook-total"><strong class="big">${total}</strong><span class="hint">question${total===1?"":"s"} to fix</span></div></div>
  <h2 id="notebook-overview-title">Personal Mistakes Notebook</h2><p class="muted">Every question you got wrong or skipped, with the correct answer and solution</p>
  ${total?`<div class="notebook-distribution" role="img" aria-label="Mistakes by subject; counts are listed below">${rows.map(r=>`<span class="notebook-segment" style="flex-grow:${r.count};background:${r.colour}" title="${esc(r.subject)}: ${r.count}"></span>`).join("")}</div>
  <ul class="notebook-legend" aria-label="Mistakes by subject">${rows.map(r=>`<li><span class="notebook-dot" style="background:${r.colour}" aria-hidden="true"></span><span class="notebook-subject">${esc(r.subject)}</span><strong>${r.count}</strong></li>`).join("")}</ul>
  <p class="hint notebook-caption">${rows.length} subject${rows.length===1?"":"s"} · ${esc(lead.subject)} leads with ${lead.count}</p>`:`<p class="hint">No mistakes yet — questions you get wrong or skip land here automatically</p>`}
  <div class="notebook-action"><button class="btn pri" data-act="tab" data-v="notebook">Open Notebook</button></div></section>`;
}
function uiNotebook(){
  const rows=notebookSubjects(),total=rows.reduce((n,r)=>n+r.count,0);
  return `<section class="ui-notebook" aria-labelledby="ui-notebook-title"><div class="ui-notebook-head"><div><h2 id="ui-notebook-title">Personal Mistakes Notebook</h2><p>A second look at the questions that need one.</p></div><div class="ui-notebook-number"><strong>${total}</strong><span>to revisit</span></div></div>
  ${total?`<div class="notebook-distribution" role="img" aria-label="Mistakes by subject; counts are listed below">${rows.map(r=>`<span class="notebook-segment" style="flex-grow:${r.count};background:${r.colour}" title="${esc(r.subject)}: ${r.count}"></span>`).join("")}</div><ul class="notebook-legend">${rows.map(r=>`<li><span class="notebook-dot" style="background:${r.colour}" aria-hidden="true"></span><span class="notebook-subject">${esc(r.subject)}</span><strong>${r.count}</strong></li>`).join("")}</ul>`:`<p class="hint">Wrong and skipped questions will appear here after you practise.</p>`}
  <div class="ui-notebook-foot"><span class="hint">${rows.length?`${rows.length} subjects · Your next chance to get it right`:"Your progress starts with one question"}</span><button class="btn" data-act="tab" data-v="notebook">Open notebook ${UI_ARROW}</button></div></section>`;
}
function viewHome(){
  const plan=dailyPlan(),stats=stat(S.qs),mis=openMistakes().length,saved=bookmarks().length,has=S.qs.length>0;
  const ready=smartPool("",{months:new Set()}).length,subjects=new Set(S.qs.map(q=>q.subject)).size;
  const accuracy=stats.att?Math.round(stats.ok/stats.att*100):null;
  return `<div class="ui-home"><section class="ui-hero"><div><div class="ui-overline">${esc(spaceName())} / Overview ${LOCAL_PREVIEW?'<span class="ui-context-label">Local preview</span>':""}</div><h1>${isExamSpace()?spaceName()+" PYQ Practice":"Your practice dashboard"}</h1><p>Keep revision moving. Build a quiz, revisit mistakes, and see what sticks.</p></div>${isSearchSpace()?`<button class="btn search-launch" data-feature-act="search-open">${SEARCH_ICON}Search questions</button>`:`<button class="btn" data-act="tab" data-v="import">+ Import questions</button>`}</section>
  <section class="ui-stats" aria-label="Your practice at a glance"><div class="ui-stat"><span class="ui-stat-label">Questions</span><strong class="ui-stat-value">${S.qs.length}</strong><span class="ui-stat-note">${subjects} subject${subjects===1?"":"s"}</span></div><div class="ui-stat"><span class="ui-stat-label">Accuracy</span><strong class="ui-stat-value">${accuracy===null?"—":accuracy+"%"}</strong><span class="ui-stat-note">Latest answers · ${stats.att}</span></div><div class="ui-stat"><span class="ui-stat-label">To revisit</span><strong class="ui-stat-value">${mis}</strong><span class="ui-stat-note">Mistakes notebook</span></div><div class="ui-stat"><span class="ui-stat-label">Today</span><strong class="ui-stat-value">${plan.done}<small> / ${plan.target}</small></strong><span class="ui-stat-note">${plan.items.length?`${plan.items.length} due`:"You're up to date"}</span></div></section>
  ${has?dailyCard():emptyBank()}
  <section aria-labelledby="ui-session-title"><div class="ui-section-title"><h2 id="ui-session-title">Choose your next session</h2><span>Your pace. Your progress.</span></div><div class="ui-quiz-grid"><article class="ui-quiz-card ui-quiz-primary"><div class="ui-quiz-head"><span class="icon">${ic("quiz")}</span><h3>Take a quiz</h3></div><p>Choose your subjects and subtopics. Build a focused session around what you want to learn.</p><div class="ui-quiz-foot"><span class="hint">${S.qs.length} questions to explore</span><button class="btn" data-act="startwiz" ${has?"":"disabled"}>Start quiz ${UI_ARROW}</button></div></article><article class="ui-quiz-card${ready?"":" locked"}"><div class="ui-quiz-head"><span class="icon">${ic("smart")}</span><h3>Smart Quiz</h3></div><p>Turn mistakes into progress with a mix of questions that need another look, highest priority first.</p><div class="ui-quiz-foot"><span class="hint">${ready?`${ready} mistakes ready to revisit`:mis?"All mistakes practised today":"Unlocks after your first mistake"}</span><button class="btn" data-act="smart" ${ready?"":"disabled"}>Revisit mistakes ${UI_ARROW}</button></div></article></div></section>
  <div class="ui-learning-grid">${uiNotebook()}<section class="ui-tools"><h2>Your study tools</h2><button class="ui-tool" data-act="tab" data-v="marks"><span class="icon">${ic("mark")}</span><span class="ui-tool-text"><strong>Bookmarks</strong><small>${saved} saved question${saved===1?"":"s"} for later</small></span>${UI_ARROW}</button><button class="ui-tool" data-act="tab" data-v="heat"><span class="icon">${ic("heat")}</span><span class="ui-tool-text"><strong>SWOT &amp; heatmap</strong><small>See your strengths and revision priorities</small></span>${UI_ARROW}</button><button class="ui-tool" data-act="tab" data-v="import"><span class="icon">${ic("book")}</span><span class="ui-tool-text"><strong>Add to your question bank</strong><small>Import your practice files</small></span>${UI_ARROW}</button></section></div>
  ${isExamSpace()?"":`<div class="unattempted-wrap">${unattemptedCard()}</div>`}
  ${has?`<div class="ui-performance">${performanceCard()}</div>`:""}
  <div class="ui-library">${isExamSpace()?pyqYearsCard():testsCard()}</div>
  <footer class="ui-footer"><span>Solo Leveling · A little better, every day</span><span>${storageStatus()}</span></footer></div>`;
}

function topicGroups(o,g,subjects){
  return subjects.filter(s=>o.subjects.has(s)&&g.has(s)).map(sub=>{
    const entries=[...g.get(sub)];
    if(S.view!=="smart"&&caTopicGroups(sub))for(const topic of Object.keys(caTopicGroups(sub)))if(!g.get(sub).has(topic))entries.push([topic,[]]);
    if(caTopicGroups(sub))entries.sort(([a],[b])=>a.localeCompare(b));
    const ks=entries.filter(([,list])=>list.length).map(([t])=>topicKey(sub,t)),all=ks.length&&ks.every(k=>o.topics.has(k)),tot=entries.reduce((a,[,list])=>a+list.length,0);
    return `<div class="tgrp"><div class="row sp"><strong>${esc(sub)} <small class="muted">${tot} question${tot===1?"":"s"}</small></strong><button class="linkbtn" data-act="topall" data-ks='${esc(JSON.stringify(ks))}'>${all?"Clear":"Select all"}</button></div><div class="topic-grid">${entries.map(([t,list])=>{
      const k=topicKey(sub,t),on=o.topics.has(k);
      return `<button class="topic-card" ${list.length?"":"disabled"} aria-pressed="${on}" data-act="topic" data-v="${esc(k)}"><span class="topic-info"><span class="topic-name">${esc(t)}</span><span class="topic-count">${list.length} question${list.length===1?"":"s"}</span></span><span class="chk" aria-hidden="true">${on?ic("check"):""}</span></button>`;
    }).join("")}</div></div>`;
  }).join("");
}

function viewWiz(){
  const sel=S.sel,subjects=[...new Set(S.qs.map(q=>q.subject))].sort();
  const tabs=`<div class="steps"><span class="${S.step===1?"on":""}">Subjects</span><span class="${S.step===2?"on":""}">Preferences</span></div>`;
  if(S.step===1){
    const allOn=subjects.length>0&&subjects.every(s=>sel.subjects.has(s));
    return `${tabs}<div class="row sp"><div class="field" style="gap:4px"><span class="label">Step 1 of 2</span><h2>Select subjects</h2><p class="muted">Unattempted and incorrect questions are prioritised.</p></div><button class="btn sm" data-act="suball">${allOn?"Clear all":"Select all"}</button></div>
    <div class="subj">${subjects.map(s=>{const on=sel.subjects.has(s),n=S.qs.filter(q=>q.subject===s).length;
      return `<button class="sc" data-act="subj" data-v="${esc(s)}" aria-pressed="${on}"><span class="mono-tile">${esc(mono(s))}</span><span class="meta"><span class="nm">${esc(s)}</span><span class="muted" style="font-size:14px">${n} question${n===1?"":"s"}</span></span><span class="chk">${on?ic("check"):""}</span></button>`;}).join("")}</div>
    <div class="foot"><span class="muted">${sel.subjects.size} of ${subjects.length} subject${subjects.length===1?"":"s"} selected</span><div class="row"><button class="btn" data-act="cancel">Cancel</button><button class="btn pri" data-act="next2" ${sel.subjects.size?"":"disabled"}>Next</button></div></div>`;
  }
  const g=groupBySubject(S.qs),allKeys=[];
  for(const sub of subjects){if(!sel.subjects.has(sub))continue;for(const t of g.get(sub).keys())allKeys.push(topicKey(sub,t));}
  const matches=pool().length,n=Math.min(effCount(sel),matches);
  const whichOpts=[["prio","Unattempted & incorrect first"],["new","Unattempted only"],["wrong","Incorrect only"],["shuffle","Everything shuffled"]];
  if(latestPack())whichOpts.push(["latest","Latest import only"]);
  return `${tabs}<div class="field" style="gap:4px"><span class="label">Step 2 of 2</span><h2>Set your preferences</h2><p class="gold">${[...sel.subjects].map(esc).join(", ")}</p></div>
  <section class="card">
    <div class="field"><div class="row sp"><span class="label">Sub-topics ${sel.topics.size?"":"(all)"}</span><button class="linkbtn" data-act="topall" data-ks='${esc(JSON.stringify(allKeys))}'>${allKeys.length&&allKeys.every(k=>sel.topics.has(k))?"Clear all":"Select all"}</button></div><p class="hint">Grouped by subject. Pick sub-topics under each one.</p><div class="tgroups">${topicGroups(sel,g,subjects)}</div></div>
    <div class="field"><span class="label">Which questions</span><div class="seg">${whichOpts.map(([k,l])=>`<button aria-pressed="${sel.which===k}" data-act="which" data-v="${k}">${l}</button>`).join("")}</div></div>
    ${prefsBlock(sel,matches)}
    ${spacePacks().length>1?`<div class="field"><label class="label" for="packsel">Question set</label><select id="packsel" data-change="pack"><option value="all">All sets</option>${spacePacks().map(p=>`<option value="${esc(p.id)}"${sel.pack===p.id?" selected":""}>${esc(p.title)}</option>`).join("")}</select></div>`:""}
  </section>
  <div class="foot"><span class="muted">${n} question${n===1?"":"s"} · ${sel.mode==="exam"?"Exam":"Practice"} mode</span><div class="row"><button class="btn" data-act="back1">Previous</button><button class="btn pri" data-act="start" ${n?"":"disabled"}>Start</button></div></div>`;
}
function viewSmart(){
  const o=S.smart,pool0=smartPool("",{months:new Set()}),g=groupBySubject(pool0),subjects=[...g.keys()].sort();
  for(const s of [...o.subjects])if(!g.has(s))o.subjects.delete(s);
  const tabs=`<div class="steps"><span class="${o.step===1?"on":""}">Subjects</span><span class="${o.step===2?"on":""}">Preferences</span></div>`;
  if(o.step===1){
    const allOn=subjects.length>0&&subjects.every(s=>o.subjects.has(s));
    return `${tabs}<div class="row sp"><div class="field" style="gap:4px"><span class="label">Step 1 of 2</span><h2>Select subjects</h2><p class="muted">Only subjects with mistakes to reattempt are shown. Leave none selected to include all.</p></div><button class="btn sm" data-act="suball">${allOn?"Clear all":"Select all"}</button></div>
    <div class="subj">${subjects.map(s=>{const on=o.subjects.has(s),n=pool0.filter(q=>q.subject===s).length;
      return `<button class="sc" data-act="subj" data-v="${esc(s)}" aria-pressed="${on}"><span class="mono-tile">${esc(mono(s))}</span><span class="meta"><span class="nm">${esc(s)}</span><span class="muted" style="font-size:14px">${n} mistake${n===1?"":"s"}</span></span><span class="chk">${on?ic("check"):""}</span></button>`;}).join("")}</div>
    <div class="foot"><span class="muted">${o.subjects.size?o.subjects.size+" of "+subjects.length+" subject"+(subjects.length===1?"":"s")+" selected":"All subjects"}</span><div class="row"><button class="btn" data-act="smartback">Cancel</button><button class="btn pri" data-act="next2">Next</button></div></div>`;
  }
  const shown=o.subjects.size?subjects.filter(s=>o.subjects.has(s)):subjects;
  const so={...o,subjects:new Set(shown)},allKeys=[];
  for(const s of shown)for(const t of g.get(s).keys())allKeys.push(topicKey(s,t));
  for(const k of [...o.topics])if(!allKeys.includes(k))o.topics.delete(k);
  const avail=smartPool("",o).length,n=Math.min(effCount(o),avail);
  return `${tabs}<div class="field" style="gap:4px"><span class="label">Step 2 of 2</span><h2>Set your preferences</h2><p class="gold">${shown.map(esc).join(", ")||"All subjects"}</p></div>
  <section class="card">
    <div class="field"><div class="row sp"><span class="label">Sub-topics ${o.topics.size?"":"(all)"}</span><button class="linkbtn" data-act="topall" data-ks='${esc(JSON.stringify(allKeys))}'>${allKeys.length&&allKeys.every(k=>o.topics.has(k))?"Clear all":"Select all"}</button></div><p class="hint">Grouped by subject. Only sub-topics with mistakes are shown.</p><div class="tgroups">${topicGroups(so,g,subjects)}</div></div>
    ${prefsBlock(o,avail)}</section>
  <div class="foot"><span class="muted">${n} question${n===1?"":"s"} · ${o.mode==="exam"?"Exam":"Practice"} mode</span><div class="row"><button class="btn" data-act="back1">Previous</button><button class="btn pri" data-act="smartgo" ${n?"":"disabled"}>Start</button></div></div>`;
}

/* ---------- quiz ---------- */
function palState(Q,uid){
  const r=Q.res[uid];
  if(Q.mode==="exam")return Q.ans[uid]?"ans":Q.skp[uid]?"skip":"";
  if(!r)return "";
  return r.skipped?"skip":r.ok?"ok":"bad";
}
const answeredCount=Q=>Q.uids.filter(u=>Q.mode==="exam"?Q.ans[u]:(Q.res[u]&&!Q.res[u].skipped)).length;
const markedCount=Q=>Q.uids.filter(u=>Q.marked?.[u]).length;
const paletteMark=(Q,u)=>Q.marked?.[u]?`<span class="review-marker" aria-hidden="true">${ic("flag")}</span>`:"";
function reviewMarkButton(Q,uid){
  const marked=!!Q.marked?.[uid];
  return `<button class="bm mark-review" data-act="markreview" aria-pressed="${marked}">${ic("flag")}${marked?"Marked for review":"Mark for review"}</button>`;
}
function palette(Q){
  const exam=Q.mode==="exam",done=answeredCount(Q),left=Q.uids.length-done,marked=markedCount(Q);
  return `<aside class="card pal"><div><strong>Question palette · ${exam?"Exam":"Practice"}</strong>
  <div class="pcount"><span class="g">Answered (${done})</span><span class="r">Unanswered (${left})</span></div></div>
  <div class="pgrid">${Q.uids.map((u,k)=>`<button class="pn ${palState(Q,u)}${Q.marked?.[u]?" marked":""}${k===Q.i?" cur":""}" data-act="goto" data-v="${k}" aria-label="Question ${k+1}${Q.marked?.[u]?", marked for review":""}" ${k===Q.i?'aria-current="true"':""}>${k+1}${paletteMark(Q,u)}</button>`).join("")}</div>
  <div class="plegend"><span><i class="cur"></i>Current</span>${exam?`<span><i class="ans"></i>Answered</span><span><i class="skip"></i>Skipped</span>`:`<span><i class="ok"></i>Correct</span><span><i class="bad"></i>Incorrect</span><span><i class="skip"></i>Skipped</span><span><i class="un"></i>Not attempted</span>`}<span><i class="review-key"></i>Marked for review</span></div>
  <button class="btn sm review-jump" data-act="reviewmarked" ${marked?"":"disabled"}>Go to marked (${marked})</button><p class="hint">Review marks last for this attempt.</p>
  <button class="btn full" data-act="finish">${exam?"Submit now":"End session"}</button></aside>`;
}
function reviewPalette(Q){
  return `<aside class="card pal"><div><strong>Question palette · Review</strong></div>
  <div class="pgrid">${Q.uids.map((u,k)=>{const r=Q.res[u],st=r.skipped?"":r.ok?"ok":"bad";return `<button class="pn ${st}${Q.marked?.[u]?" marked":""}${k===Q.rv?" cur":""}" data-act="rgoto" data-v="${k}" aria-label="Question ${k+1}${Q.marked?.[u]?", marked for review":""}" ${k===Q.rv?'aria-current="true"':""}>${k+1}${paletteMark(Q,u)}</button>`;}).join("")}</div>
  <div class="plegend"><span><i class="cur"></i>Current</span><span><i class="ok"></i>Correct</span><span><i class="bad"></i>Incorrect</span><span><i class="un"></i>Skipped</span><span><i class="review-key"></i>Marked for review</span></div>
  ${markedCount(Q)?`<button class="btn sm review-jump" data-act="reviewmarked">Go to marked (${markedCount(Q)})</button>`:""}
  <button class="btn pri full" data-act="rback">Back to summary</button></aside>`;
}
function viewReview(){
  const Q=S.quiz,uid=Q.uids[Q.rv],q=S.byUid.get(uid),r=Q.res[uid],pick=r.pick||"",last=Q.rv===Q.uids.length-1;
  const opts=reviewOptions(q,pick);
  const verdict=r.skipped?`<p class="note skip">Not answered</p>`:r.ok?`<p class="note">Correct</p>`:`<p class="note bad">Wrong</p>`;
  return `<div class="qlayout"><section class="card"><div class="qhead"><button class="btn sm" data-act="rback">Back to summary</button><div class="bar" aria-hidden="true"><b style="width:${Math.round((Q.rv+1)/Q.uids.length*100)}%"></b></div><span class="muted">${Q.rv+1} / ${Q.uids.length}</span></div>
  <div class="qmeta"><span class="tag">Q${Q.rv+1}</span><span class="tag plain">${esc(q.subject)}</span><span class="tag plain">${esc(q.topic)}</span>${q.year?`<span class="tag plain">${esc(q.year)}</span>`:""}${sourceExamBadge(q)}${Q.marked?.[uid]?`<span class="tag review-tag">Marked for review</span>`:""}<span style="margin-left:auto">${bmBtn(q.uid)}</span></div>
  <div class="qtext">${fmtQ(q.text)}</div>${figs(q.qimg)}<div class="opts">${opts}</div>${verdict}${r.skipped?"":cfShow(r.cf)}${reasoningNote(r.reason)}${solution(q)}
  <div class="row">${Q.rv>0?`<button class="btn" data-act="rprev">Previous</button>`:""}${last?`<button class="btn pri" data-act="rback">Back to summary</button>`:`<button class="btn pri" data-act="rnext">Next</button>`}<span class="hint">Review mode · arrow keys move between questions</span></div></section>${reviewPalette(Q)}</div>`;
}

function viewQuiz(){
  const Q=S.quiz;
  if(Q.done)return Q.rv!=null?viewReview():viewResult();
  const uid=Q.uids[Q.i],q=S.byUid.get(uid),exam=Q.mode==="exam",r=Q.res[uid];
  const locked=!exam&&!!r&&!r.skipped,last=Q.i===Q.uids.length-1;
  const cur=exam?Q.ans[uid]:(locked?r.pick:Q.sel[uid]);
  const opts=Object.keys(q.options).map(L=>{
    let cls="opt",flag="";
    if(locked){if(isAcceptedAnswer(q,L)){cls+=" right";flag="Correct";}else if(L===cur){cls+=" wrong";flag="Your answer";}}
    else if(cur===L)cls+=" sel";
    return `<button class="${cls}" data-act="pick" data-v="${esc(L)}" role="radio" aria-checked="${cur===L}" ${locked?"disabled":""}><span class="dot">${esc(L)}</span><span class="txt">${esc(q.options[L])}</span>${flag?`<span class="flag">${flag}</span>`:""}</button>`;
  }).join("");
  const tmx=r&&r.tm?` \u00b7 ${r.tm}s${r.slow?" (slow, aim under 72s)":""}`:"",cfx=r&&r.cf?` \u00b7 ${CONF[r.cf]}`:"";
  const verdict=!locked?"":r.ok?`<p class="note">Correct.${r.cleared?" Cleared from your Notebook.":r.wasM?` Correct on ${r.days} of ${CLEAR_DAYS} days to clear it.`:""}${cfx}${tmx}</p>`:`<p class="note bad">Wrong. Added to your Notebook.${r.cf==="s"?" You were sure, so it is high priority.":cfx}${tmx}</p>`;
  const cfRow=(!locked&&cur)?`<div class="cfrow"><span class="label">How sure are you?</span><div class="chips">${["s","h","g"].map(k=>`<button class="pbtn" aria-pressed="${Q.cf[uid]===k}" data-act="conf" data-v="${k}">${CONF[k]}</button>`).join("")}</div><span class="hint">Optional. Helps catch lucky guesses.</span></div>`:"";
  const whyRow=(locked&&!r.ok)?whyChips(uid):"";
  const prevB=Q.i>0?`<button class="btn" data-act="prev">Previous</button>`:"";
  let left="",nav="";
  if(exam){
    left=`${answeredCount(Q)} of ${Q.uids.length} answered \u00b7 nothing is revealed until you submit`;
    nav=`${prevB}<button class="btn" data-act="skip">Skip</button><button class="btn pri" data-act="savenext">${last?"Save":"Save &amp; Next"}</button>`;
  }else if(locked){
    left=r.ok?"Correct":"Wrong";
    nav=`${prevB}${last?`<button class="btn pri" data-act="finish">Finish</button>`:`<button class="btn pri" data-act="next">Next question</button>`}`;
  }else{
    left=cur?"Answer selected":"Select an answer";
    nav=`${prevB}<button class="btn" data-act="skip">${last?"Skip and finish":"Skip"}</button><button class="btn pri" data-act="check" ${cur?"":"disabled"}>Check Answer</button>`;
  }
  return `<div class="qlayout"><section class="card"><div class="qhead"><button class="btn sm" data-act="exit">Exit</button><div class="bar" aria-hidden="true"><b style="width:${Math.round(answeredCount(Q)/Q.uids.length*100)}%"></b></div><span class="muted">${Q.i+1} / ${Q.uids.length}</span></div>
  <div class="qmeta"><span class="tag">Q${Q.i+1}</span><span class="tag plain">${esc(q.subject)}</span><span class="tag plain">${esc(q.topic)}</span>${q.year?`<span class="tag plain">${esc(q.year)}</span>`:""}${sourceExamBadge(q)}<span class="question-tools">${reviewMarkButton(Q,uid)}${bmBtn(q.uid)}</span></div>
  ${Q.kind==="Daily revision"?`<p class="hint">Daily revision · ${esc(dailyReason(S.prog[uid])?.label||"Review in progress")}</p>`:""}
  <div class="qtext">${fmtQ(q.text)}</div>${figs(q.qimg)}
  <div class="opts" role="radiogroup" aria-label="Answer options">${opts}</div>
  ${r&&r.skipped&&!exam?`<p class="note bad">Skipped. Added to your Notebook. You can still answer it.</p>`:""}
  ${cfRow}${!locked&&cur?`<div class="field"><label class="label" for="reasoning">Your reasoning (optional)</label><textarea id="reasoning" maxlength="2000" style="min-height:90px;font:inherit" placeholder="Why this option? Which options did you eliminate, and why?">${esc(Q.rn[uid]||"")}</textarea><p class="hint">Write a short explanation before revealing the solution. This note is not graded.</p></div>`:""}
  ${verdict}${locked?reasoningNote(r.reason):""}${whyRow}${locked?solution(q):""}
  </section>${palette(Q)}</div><div class="qbar"><span class="muted">${left}</span><div class="row">${nav}</div></div>${S.confirmFin?finishModal(Q,exam):""}${S.confirmExit?exitModal(Q):""}`;
}
function cfShow(cf){
  return `<div class="cfrow"><span class="label">How sure were you?</span><div class="chips">${["s","h","g"].map(k=>`<span class="chip2${cf===k?" gold":""}">${CONF[k]}</span>`).join("")}${cf?"":`<span class="hint">Not tagged during the test</span>`}</div></div>`;
}
function whyChips(uid){
  const cur=(S.prog[uid]||{}).wy;
  return `<div class="cfrow"><span class="label">Why did you miss it?</span><div class="chips">${Object.keys(WHY).map(k=>`<button class="pbtn" aria-pressed="${cur===k}" data-act="why" data-v="${k}" data-u="${esc(uid)}">${WHY[k]}</button>`).join("")}</div></div>`;
}
function exitModal(Q){
  const message=QUIZ_DRAFTS.error?"This browser could not save a resumable draft. Exiting will lose unchecked answers.":Q?.mode==="exam"?"Your picks are saved as a draft on this browser. You can resume later; they are graded only when you submit.":"Checked answers are kept. This attempt is saved on this browser so you can resume it later.";
  return `<div class="mback" role="dialog" aria-modal="true" aria-labelledby="xt"><div class="modal"><h2 id="xt">Are you sure you want to exit?</h2><p class="muted">${message}</p><div class="row"><button class="btn" data-act="exitno">Keep going</button><button class="btn pri" data-act="exitok">Yes, exit</button></div></div></div>`;
}
function finishModal(Q,exam){
  const n=Q.uids.length,a=answeredCount(Q),u=n-a,marked=markedCount(Q);
  return `<div class="mback" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="modal"><h2 id="mt">${exam?"Submit your test?":"End this session?"}</h2>
  <p class="muted">You have answered <strong>${a}</strong> of ${n} question${n===1?"":"s"}${u?` and <strong>${u}</strong> ${u===1?"is":"are"} unanswered`:""}.${u?(Q.kind==="Daily revision"?" Unchecked questions stay in your daily queue for later.":" Unanswered questions are marked as skipped and added to your Notebook."):""}${exam?" You cannot change your answers after submitting.":""}</p>
  ${marked?`<p class="review-notice">${marked} question${marked===1?" is":"s are"} still marked for review.</p>`:""}
  <div class="row"><button class="btn" data-act="finishno">Go back</button>${marked?`<button class="btn review-jump" data-act="reviewmarked">Review marked (${marked})</button>`:""}<button class="btn pri" data-act="finishok">${exam?"Yes, submit":"Yes, end session"}</button></div></div></div>`;
}
function fmtTime(ms){const s=Math.round(ms/1000);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function guessBlock(R,score){
  const rows=[["s","Sure"],["h","50-50"],["g","Guess"],["","Not tagged"]].map(([k,l])=>{const L=R.filter(r=>!r.skipped&&(r.cf||"")===k),c=L.filter(r=>r.ok).length;return {k,l,n:L.length,c,net:resultScore(L).marks};}).filter(x=>x.n);
  if(!rows.some(x=>x.k))return "";
  const risky=rows.filter(x=>x.k==="g"||x.k==="h"),rn=risky.reduce((a,x)=>a+x.net,0),rc=risky.reduce((a,x)=>a+x.n,0);
  const gnet=(rows.find(x=>x.k==="g")||{net:0}).net;
  const verdict=!rc?"You were sure about everything you answered.":rn>=0?`Your 50-50 and guess answers earned <strong>+${Math.round(rn*100)/100}</strong> marks. Break-even accuracy is 25%, so keep attempting when you can cut two options.`:`Your 50-50 and guess answers cost <strong>${Math.abs(Math.round(rn*100)/100)}</strong> marks. Skip when you cannot eliminate at least one option.`;
  return `<section class="card"><h3>Guess tracker</h3><div class="gt"><span class="label">Confidence</span><span class="label">Answered</span><span class="label">Right</span><span class="label">Net marks</span>${rows.map(x=>`<span>${x.l}</span><span>${x.n}</span><span>${x.c}</span><span>${x.net>0?"+":""}${x.net}</span>`).join("")}</div>
  <p>${verdict}</p>${gnet?`<p class="muted">Score without your Guess answers: ${Math.round((score-gnet)*100)/100}</p>`:""}</section>`;
}
function viewResult(){
  const Q=S.quiz,n=Q.uids.length,R=Q.uids.map(u=>({u,...Q.res[u]}));
  const c=R.filter(r=>r.ok).length,sk=R.filter(r=>r.skipped).length,w=n-c-sk;
  const att=c+w,acc=att?Math.round(c/att*100):0,scoring=resultScore(R,Q),score=scoring.marks;
  const wasM=R.filter(r=>r.wasM&&!r.skipped).length,cl=R.filter(r=>r.cleared).length,added=w+sk;
  const banner=Q.kind==="Daily revision"?`<strong>${R.filter(r=>!r.deferred).length} reviewed or skipped</strong><span class="muted">Unchecked questions stay in your queue. Wrong answers and explicit skips return on a later day; correct answers follow your review schedule.</span>`:wasM?`<strong>Cleared ${cl} of ${wasM} attempted</strong><span class="muted">The rest stay in your Notebook until you get them right with confidence on ${CLEAR_DAYS} different days</span>`:added?`<strong>${added} added to your Notebook</strong><span class="muted">Reattempt them any time with a Smart Quiz</span>`:`<strong>Clean sheet</strong><span class="muted">No mistakes in this session</span>`;
  const missed=R.filter(r=>!r.ok).map(r=>r.u);
  const timed=R.filter(r=>r.tm>0),avgT=timed.length?Math.round(timed.reduce((x,r)=>x+r.tm,0)/timed.length):0;
  const slowN=R.filter(r=>r.ok&&r.slow).length,sureW=R.filter(r=>!r.skipped&&!r.ok&&r.cf==="s").length;
  return `<section class="card"><div class="row sp"><h1 style="font-size:30px">Session summary</h1><button class="btn" data-act="exit">Back to Practice</button></div>
  <div class="chips"><span class="tag plain">${esc(Q.kind)}</span><span class="tag plain">${esc(Q.label)}</span><span class="tag plain">${n} question${n===1?"":"s"}</span><span class="tag plain">${Q.mode==="exam"?"Exam":"Practice"}</span></div></section>
  <div class="sumgrid">
    <div class="tile2"><span class="muted">Correct</span><span class="v g">${c}/${n}</span><div class="track"><b style="width:${n?Math.round(c/n*100):0}%"></b></div></div>
    <div class="tile2"><span class="muted">Incorrect</span><span class="v r">${w}/${n}</span></div>
    <div class="tile2"><span class="muted">Skipped</span><span class="v m">${sk}/${n}</span></div>
    <div class="tile2"><span class="label">Accuracy</span><span class="v">${acc}%</span></div>
    <div class="tile2"><span class="label">Score</span><span class="v">${score} / ${scoring.max}</span><span class="hint">${S.space==="csat"?"Marks follow each question’s CSE or CAPF source":S.space==="static"||S.space==="ca"?"+2 right, −0.66 wrong":"+2 right, −⅔ wrong"}</span></div>
    <div class="tile2"><span class="label">Time taken</span><span class="v">${fmtTime(Q.elapsed||0)}</span></div>
    <div class="tile2"><span class="label">Avg per question</span><span class="v">${avgT?avgT+"s":"-"}</span><span class="hint">Target about 72s</span></div>
    <div class="tile2"><span class="label">Correct but slow</span><span class="v">${slowN}</span><span class="hint">Over ${SLOW_S}s each</span></div>
    <div class="tile2"><span class="label">Sure but wrong</span><span class="v r">${sureW}</span><span class="hint">Revise these first</span></div>
  </div>
  ${performanceCard(sessionPerformance(R),true)}
  ${guessBlock(R,score)}
  <div class="banner">${banner}</div>
  <div class="row"><button class="btn pri" data-act="review">Review</button>${markedCount(Q)?`<button class="btn review-jump" data-act="reviewmarked">Review marked (${markedCount(Q)})</button>`:""}${missed.length?`<button class="btn" data-act="redo">Redo the ${missed.length} missed</button>`:""}<button class="btn" data-act="tab" data-v="notebook" data-quizdone="1">Open Notebook</button></div>`;
}

/* ---------- attempt history and reasoning ---------- */
function reasoningNote(text){return text?`<div class="sol"><span class="label">Your reasoning before reveal</span><p class="qt">${esc(text)}</p></div>`:"";}
function trackAttempt(p,result){
  const type=!p.first&&!(p.a||p.sk)?"first":"repeat";
  const entry={pick:result.pick||"",ok:!!result.ok,skipped:!!result.skipped,cf:result.cf||"",reason:String(result.reason||"").slice(0,2000),t:Date.now()};
  if(type==="first")p.first=entry;
  else{p.repeat=p.repeat||{a:0,c:0,sk:0};if(entry.skipped)p.repeat.sk++;else{p.repeat.a++;if(entry.ok)p.repeat.c++;}}
  p.rn=entry.reason;
  return type;
}
function performanceStats(list=S.qs){
  const stats={first:{a:0,c:0,sk:0},repeat:{a:0,c:0,sk:0},unknown:0};
  for(const q of list){const p=S.prog[q.uid];if(!p)continue;
    if(p.first){if(p.first.skipped)stats.first.sk++;else{stats.first.a++;if(p.first.ok)stats.first.c++;}}
    else if(p.a||p.sk)stats.unknown++;
    if(p.repeat)for(const key of ["a","c","sk"])stats.repeat[key]+=p.repeat[key]||0;
  }
  return stats;
}
function performanceCard(stats=performanceStats(),session=false){
  return `<section class="card"><h2>${session?"This session: first attempts vs repeats":"First attempts vs repeat practice"}</h2><div class="grid2">${[["first","First attempts"],["repeat","Repeat practice"]].map(([key,label])=>{const r=stats[key];return `<div class="card flat"><h3>${label}</h3><strong class="score" style="font-size:32px">${r.a?Math.round(r.c/r.a*100)+"%":"—"}</strong><p>${r.c} correct / ${r.a} answered · ${r.sk} skipped</p></div>`;}).join("")}</div><p class="hint">Accuracy excludes skips. First means the first recorded attempt here; previous exposure elsewhere cannot be detected.${session?"":" Repeat totals track practice recorded since this feature was added."}</p>${stats.unknown?`<p class="hint">First-attempt history is unavailable for ${stats.unknown} previously practised question${stats.unknown===1?"":"s"}. Their old results have not been estimated.</p>`:""}</section>`;
}
function sessionPerformance(results){
  const stats={first:{a:0,c:0,sk:0},repeat:{a:0,c:0,sk:0},unknown:0};
  for(const r of results){if(r.deferred||!stats[r.attemptType])continue;const row=stats[r.attemptType];if(r.skipped)row.sk++;else{row.a++;if(r.ok)row.c++;}}
  return stats;
}

/* ---------- notebook + saved ---------- */
function mdFor(list){
  const g=groupBySubject(list);let out="# Mistake notebook\n";
  for(const [sub,tm] of g){out+="\n## "+sub+"\n";for(const [t,qs] of tm){out+="\n### "+t+"\n";for(const q of qs){out+="- "+q.text.replace(/\n+/g," ")+" **Ans: "+acceptedAnswers(q).map(L=>L+") "+q.options[L]).join(" or ")+"**"+((q.sum||q.exp)?" - "+(q.sum||q.exp).replace(/\n+/g," "):"")+"\n";}}}
  return out;
}
function reviewOptions(q,pick=""){
  return `<div class="review-options" role="list" aria-label="Answer review">${Object.keys(q.options).map(L=>{
    const right=isAcceptedAnswer(q,L),wrong=!right&&L===pick;
    const label=right?"Correct answer":wrong?`Your answer <span aria-hidden="true">✕</span>`:"";
    return `<div class="review-option${right?" right":wrong?" wrong":""}" role="listitem"><span class="review-letter">${esc(L)}</span><span class="review-text">${esc(q.options[L])}</span>${label?`<span class="review-flag">${label}</span>`:""}</div>`;
  }).join("")}</div>`;
}
function qCard(q,extra,pickArg,status){
  const p=S.prog[q.uid]||{},pick=pickArg!==undefined&&pickArg!==null?pickArg:(p.x||"");
  const chip=status==="ok"?`<span class="chip2 ok">Correct</span>`:status==="bad"?`<span class="chip2 bad">Incorrect</span>`:status==="skip"?`<span class="chip2 skip">Skipped</span>`:"";
  return `<details class="mq"><summary><span class="muted">Q${q.no}</span>${chip}<span class="q">${esc(questionDisplayText(q.text))}</span></summary><div class="body">${figs(q.qimg)}${reviewOptions(q,pick)}${reasoningNote(p.rn)}${solution(q)}<div class="row sp"><span class="muted" style="font-size:13px">${extra||""}</span>${bmBtn(q.uid)}</div></div></details>`;
}
function nbQuestion(q){
  const p=S.prog[q.uid]||{},picked=p.x;
  const ls=questionDisplayText(q.text).split("\n"),first=ls[0],rest=ls.slice(1).join("\n").trim();
  return `<details class="nbq"><summary><div class="qmeta"><span class="tag">Q${q.no}</span><span class="mut">${esc(q.subject)}</span>${q.year?`<span class="chip2">${esc(q.year)}</span>`:""}${sourceExamBadge(q)}<span class="chip2">${esc(q.topic)}</span><span class="chip2 ${picked?"bad":"skip"}">${picked?"Incorrect":"Skipped"}</span>${picked?`<span class="chip2">You picked (${esc(picked.toLowerCase())})</span>`:""}${picked&&p.cf==="s"?`<span class="chip2 bad">Confident wrong</span>`:""}<span class="chip2 gold">${PRI[priority(q)]}</span><span class="rt">${bmBtn(q.uid)}<span class="caret" aria-hidden="true">▾</span></span></div><p class="qtext">${esc(first)}</p>${rest?`<p class="qtext dots">\u2026</p>`:""}</summary>
  <div class="nbbody">${rest?`<div class="qtext">${fmtQ(rest)}</div>`:""}${figs(q.qimg)}${reviewOptions(q,picked)}
  ${picked?cfShow(p.cf)+whyChips(q.uid):""}${reasoningNote(p.rn)}${solution(q)}<span class="muted" style="font-size:13px">Missed ${p.w||0}x · skipped ${p.sk||0}x · right ${p.c||0}x · clears after ${CLEAR_DAYS-(p.cd||[]).length} more day${CLEAR_DAYS-(p.cd||[]).length===1?"":"s"} of confident correct answers</span>${moveBlock(q)}</div></details>`;
}
function bmQuestion(q){
  const ls=questionDisplayText(q.text).split("\n"),first=ls[0],rest=ls.slice(1).join("\n").trim();
  return `<details class="nbq"><summary><div class="qmeta"><span class="tag">Q${q.no}</span><span class="mut">${esc(q.subject)}</span>${q.year?`<span class="chip2">${esc(q.year)}</span>`:""}${sourceExamBadge(q)}<span class="chip2">${esc(q.topic)}</span><span class="rt">${bmBtn(q.uid)}<span class="caret" aria-hidden="true">▾</span></span></div><p class="qtext">${esc(first)}</p>${rest?`<p class="qtext dots">\u2026</p>`:""}</summary>
  <div class="nbbody">${rest?`<div class="qtext">${fmtQ(rest)}</div>`:""}${figs(q.qimg)}${reviewOptions(q)}
  ${solution(q)}</div></details>`;
}
function moveBlock(q){
  return `<div class="moveblk"><button class="btn sm" data-act="moveopen" data-v="${esc(q.uid)}">Move to another sub-topic</button><div class="moveform" data-u="${esc(q.uid)}" hidden></div></div>`;
}
function moveStep1(q){
  const subs=[...new Set(S.qs.map(x=>x.subject))].sort();
  return `<span class="label">Step 1 \u00b7 Move to which subject?</span><div class="chips">${subs.map(x=>`<button class="pbtn" aria-pressed="${x===q.subject}" data-act="mvsub" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>
  <span class="label">Or type a new subject</span><div class="row"><input class="delin mvnew" type="text" maxlength="80" placeholder="New subject" aria-label="New subject"><button class="btn sm pri" data-act="mvsubnew">Continue</button></div>
  <div class="row"><button class="btn sm" data-act="movecancel">Cancel</button></div>`;
}
function moveStep2(q,sj){
  const tops=[...new Set([...S.qs.filter(x=>x.subject===sj).map(x=>x.topic),...(caTopicGroups(sj)?Object.keys(caTopicGroups(sj)):[])])].sort();
  return `<span class="label">Step 2 \u00b7 Sub-topic in <b>${esc(sj)}</b></span>${tops.length?`<div class="chips">${tops.map(x=>`<button class="pbtn" aria-pressed="${sj===q.subject&&x===q.topic}" data-act="mvgo" data-s="${esc(sj)}" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>`:`<p class="hint">No sub-topics yet in this subject. Type a new one.</p>`}
  <span class="label">Or type a new sub-topic</span><div class="row"><input class="delin mvnew" type="text" maxlength="80" placeholder="New sub-topic" aria-label="New sub-topic"><button class="btn sm pri" data-act="mvgonew" data-s="${esc(sj)}">Move here</button></div>
  <div class="row"><button class="btn sm" data-act="mvback">Back</button><button class="btn sm" data-act="movecancel">Cancel</button></div>`;
}
async function doMove(uid,sj,tp){
  const context=bankContext();
  const q=S.byUid.get(uid);if(!q)return;
  sj=canonicalSubject(String(sj||"").trim().replace(/\s+/g," "));tp=String(tp||"").trim().replace(/\s+/g," ");
  if(!sj||!tp){toast("Enter a sub-topic");return;}
  const subs=[...new Set(S.qs.map(x=>x.subject))];sj=subs.find(x=>x.toLowerCase()===sj.toLowerCase())||sj;
  const tps=[...new Set(S.qs.filter(x=>x.subject===sj).map(x=>x.topic))];tp=tps.find(x=>x.toLowerCase()===tp.toLowerCase())||tp;
  if(sj===q.subject&&tp===q.topic){toast("Already there");return;}
  const pk=S.packs.find(x=>x.id===q.packId),q0=pk&&pk.questions.find(x=>x.no===q.no);if(!q0)return;
  const old=pk.chunks||1,updated={...pk,questions:pk.questions.map(x=>x===q0?{...x,subject:sj,topic:tp}:x)};
  await enqueue(()=>S.store.savePack(updated,old));
  assertBank(context);
  S.packs=S.packs.map(x=>x===pk?updated:x);rebuild();render();toast("Moved to "+sj+" \u203a "+tp);
}
const stOf=q=>{const p=S.prog[q.uid];return p&&p.a?(p.l==="c"?"ok":"bad"):(p&&p.sk?"skip":"new");};
function trList(){
  const T=S.tr||{},all=T.year?pyqYearQuestions(T.year):S.qs.filter(q=>q.packId===T.pid).sort((a,b)=>a.no-b.no),f=T.f||"all";
  return {all,list:f==="all"?all:all.filter(q=>stOf(q)===f),f};
}
function viewTest(){
  const T=S.tr||{},pk=T.year?(pyqYearQuestions(T.year).length?{title:spaceName()+" PYQs · "+pyqYearLabel(T.year)}:null):S.packs.find(p=>p.id===T.pid);
  if(!pk)return `<section class="card"><h2>Test not found</h2><div><button class="btn" data-act="home">Back to Practice</button></div></section>`;
  const {all,list,f}=trList();
  const cnt={ok:0,bad:0,skip:0,"new":0};all.forEach(q=>cnt[stOf(q)]++);
  const chips=[["all","All",all.length],["bad","Incorrect",cnt.bad],["skip","Skipped",cnt.skip],["ok","Correct",cnt.ok],["new","Not attempted",cnt["new"]]];
  const i=Math.max(0,Math.min(T.i||0,list.length-1));T.i=i;
  const filt=`<div class="chips">${chips.map(([k,l,n])=>`<button class="pbtn" aria-pressed="${f===k}" data-act="trf" data-v="${k}">${l} ${n}</button>`).join("")}</div>`;
  const att=cnt.ok+cnt.bad,acc=att?Math.round(cnt.ok/att*100):0;
  const pal=`<aside class="card pal"><div><strong>Question palette \u00b7 Review</strong><div class="muted" style="font-size:13px;margin-top:4px">${esc(pk.title)}</div><div class="muted" style="font-size:13px">${att} of ${all.length} attempted \u00b7 ${acc}% accuracy</div></div>${filt}
  <div class="pgrid">${list.map((x,k)=>{const st=stOf(x);return `<button class="pn ${st==="new"?"":st}${k===i?" cur":""}" data-act="tgoto" data-v="${k}" aria-label="Question ${T.year?k+1:x.no}" ${k===i?'aria-current="true"':""}>${T.year?k+1:x.no}</button>`;}).join("")}</div>
  <div class="plegend"><span><i class="cur"></i>Current</span><span><i class="ok"></i>Correct</span><span><i class="bad"></i>Incorrect</span><span><i class="skip"></i>Skipped</span><span><i class="un"></i>Not attempted</span></div>
  <button class="btn pri full" data-act="home">Back to Practice</button></aside>`;
  if(!list.length)return `<div class="qlayout"><section class="card"><div class="qhead"><button class="btn sm" data-act="home">Back to Practice</button></div><p class="muted">No questions in this filter.</p></section>${pal}</div>`;
  const q=list[i],p=S.prog[q.uid]||{},st=stOf(q),pick=st==="bad"?(p.x||""):"";
  const opts=reviewOptions(q,pick);
  const verdict={ok:`<p class="note">Correct</p>`,bad:`<p class="note bad">Wrong${p.cf==="s"?" \u00b7 you were sure":""}</p>`,skip:`<p class="note skip">Skipped</p>`,"new":`<p class="note skip">Not answered</p>`}[st];
  return `<div class="qlayout"><section class="card"><div class="qhead"><button class="btn sm" data-act="home">Back to Practice</button><div class="bar" aria-hidden="true"><b style="width:${Math.round((i+1)/list.length*100)}%"></b></div><span class="muted">${i+1} / ${list.length}</span></div>
  <div class="qmeta"><span class="tag">Q${q.no}</span>${T.year?`<span class="tag plain">${esc(S.packs.find(p=>p.id===q.packId)?.title||"")}</span>`:""}<span class="tag plain">${esc(q.subject)}</span><span class="tag plain">${esc(q.topic)}</span>${q.year?`<span class="tag plain">${esc(q.year)}</span>`:""}${sourceExamBadge(q)}<span style="margin-left:auto">${bmBtn(q.uid)}</span></div>
  <div class="qtext">${fmtQ(q.text)}</div>${figs(q.qimg)}<div class="opts">${opts}</div>${verdict}${st==="ok"||st==="bad"?cfShow(p.cf):""}${st==="bad"?whyChips(q.uid):""}${reasoningNote(p.rn)}${solution(q)}${moveBlock(q)}
  <div class="row">${i>0?`<button class="btn" data-act="tprev">Previous</button>`:""}${i<list.length-1?`<button class="btn pri" data-act="tnext">Next</button>`:`<button class="btn pri" data-act="home">Back to Practice</button>`}<span class="hint">Review mode \u00b7 arrow keys move between questions</span></div></section>${pal}</div>`;
}
function testsCard(){
  const tests=spacePacks().slice().sort((a,b)=>(b.ts||0)-(a.ts||0));if(!tests.length)return "";
  const show=tests;
  return `<section class="card"><h2>Review a test</h2><p class="muted">Open a whole test with your answers, solutions and reasons for mistakes</p><div class="scrolllist">${show.map(p=>{const qs=S.qs.filter(q=>q.packId===p.id);let a=0,ok=0;qs.forEach(q=>{const x=S.prog[q.uid];if(x&&x.a){a++;if(x.l==="c")ok++;}});return `<div class="pack"><div><strong>${esc(p.title)}</strong><div class="muted" style="font-size:14px">${a} of ${qs.length} attempted${a?` \u00b7 ${ok} correct`:""}</div></div><button class="btn sm" data-act="testopen" data-v="${esc(p.id)}">Review</button></div>`;}).join("")}</div></section>`;
}
function viewNotebook(){
  const back=`<button class="backlink" data-act="home">← Back to Practice</button>`;
  const md=S.mdText?`<div class="field"><label class="label" for="mdbox">Select all and copy</label><textarea id="mdbox" readonly>${esc(S.mdText)}</textarea></div>`:"";
  if(!S.qs.length)return `<div class="field" style="gap:10px">${back}<h1>Mistakes Notebook</h1></div>`+emptyBank();
  const list=openMistakes(),all=stat(S.qs);
  const subjects=[...new Set(S.qs.map(q=>q.subject))].sort();
  const cnt=s=>list.filter(q=>q.subject===s).length;
  const withM=subjects.filter(cnt);
  if(!list.length)return `<div class="field" style="gap:10px">${back}<h1>Mistakes Notebook</h1><p class="muted">0 questions to fix</p></div><section class="card"><h2>No mistakes yet</h2><p class="muted">${all.ever?`You have cleared all ${all.ever} question${all.ever===1?"":"s"} you got wrong or skipped.`:"Questions you get wrong or skip land here automatically."} Answer one correctly in a Smart Quiz and it leaves the Notebook.</p><div><button class="btn pri" data-act="home">Go to Practice</button></div></section>`;
  let sel=S.nb.subject;
  if(sel===undefined)sel=withM.length===1?withM[0]:"";
  if(sel&&!cnt(sel))sel="";
  const n=sel?cnt(sel):list.length;
  const head=`<div class="nbhead"><div class="field" style="gap:10px">${back}<h1>${sel?`${esc(sel)} · ${n} mistake${n===1?"":"s"}`:"Mistakes Notebook"}</h1><p class="muted">${sel?"High priority first":`${list.length} question${list.length===1?"":"s"} to fix`}</p></div>
    <div class="row"><button class="btn" data-act="copymd">Copy as markdown</button><button class="btn pri" data-act="smartsub" data-s="${esc(sel)}">Start Smart Quiz · ${n}</button></div></div>${md}`;
  const chips=`<div class="fchips"><button class="fchip" aria-pressed="${!sel}" data-act="nbsub" data-v="">All</button>${withM.map(s=>`<button class="fchip" aria-pressed="${sel===s}" data-act="nbsub" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
  if(sel){
    const qs=smartPool(sel);
    return head+chips+`<div class="nblist">${qs.map(nbQuestion).join("")}</div><div class="stickybar"><span class="muted">${qs.length} question${qs.length===1?"":"s"} · ${esc(sel)}</span><button class="btn pri" data-act="smartsub" data-s="${esc(sel)}">Start Smart Quiz</button></div>`;
  }
  return head+chips+`<div class="nbgrid">${subjects.map(s=>{const k=cnt(s);
    return `<div class="nbcard${k?"":" none"}"><button class="nbmain" data-act="nbsub" data-v="${esc(s)}" ${k?"":"disabled"}><span class="mono-tile">${esc(mono(s))}</span><span><span class="nm">${esc(s)}</span><span class="muted" style="font-size:14px">${k?`${k} mistake${k===1?"":"s"}`:"No mistakes"}</span></span></button>${k?`<button class="btn sm" data-act="smartsub" data-s="${esc(s)}">Start Smart Quiz</button>`:""}</div>`;}).join("")}</div>`;
}
function viewMarks(){
  const list=bookmarks();
  const head=`<div class="field" style="gap:6px"><h1>Bookmarks</h1><p class="muted">${list.length} saved question${list.length===1?"":"s"}</p></div>`;
  if(!list.length)return head+`<section class="card"><h2>Nothing saved yet</h2><p class="muted">Tap Save on any question, during a quiz or in the Notebook, to keep it here.</p><div><button class="btn pri" data-act="tab" data-v="practice">Go to Practice</button></div></section>`;
  const sorted=list.slice().sort((x,y)=>x.subject.localeCompare(y.subject)||x.topic.localeCompare(y.topic)||x.no-y.no);
  return head+`<section class="card"><div class="row"><button class="btn pri" data-act="quizmarks">Quiz these ${list.length}</button></div></section><div class="nblist">${sorted.map(bmQuestion).join("")}</div>`;
}

/* ---------- heat map ---------- */
function insightsHtml(){
  let cs=0,cn=0,gs=0,gn=0,tt=0,tn=0,slow=0,wt=0;const why={k:0,c:0,m:0,s:0};
  for(const q of S.qs){const p=S.prog[q.uid];if(!p||!p.a)continue;
    if(p.cf==="s"){cn++;if(p.l==="c")cs++;}
    if(p.cf==="g"){gn++;if(p.l==="c")gs++;}
    if(p.tn){tt+=p.ts||0;tn+=p.tn;}
    if(p.sl)slow++;
    if(p.w>0&&p.wy&&why[p.wy]!==undefined){why[p.wy]++;wt++;}}
  if(!(cn||gn||tn||wt))return "";
  const pc=(a,b)=>b?Math.round(a/b*100)+"%":"-";
  const note=cn>=3&&cs/cn<0.8?`<p class="note bad">Overconfident: you are right only ${pc(cs,cn)} of the time when you are sure. Re-check the "sure but wrong" questions.</p>`:cn>=3?`<p class="note">Well calibrated: your sure answers are right ${pc(cs,cn)} of the time.</p>`:"";
  return `<section class="card"><h3>Learning signals</h3>
  <div class="field" style="gap:8px">${cn?`<div class="dotrow"><span>Right when Sure</span><strong>${pc(cs,cn)} (${cn})</strong></div>`:""}${gn?`<div class="dotrow"><span>Right when Guessing</span><strong>${pc(gs,gn)} (${gn})</strong></div>`:""}${tn?`<div class="dotrow"><span>Average time per question</span><strong>${Math.round(tt/tn)}s</strong></div>`:""}${tn?`<div class="dotrow"><span>Correct but slow (over ${SLOW_S}s)</span><strong>${slow}</strong></div>`:""}</div>
  ${note}
  ${wt?`<div class="field" style="gap:8px"><span class="label">Why you miss questions</span>${Object.keys(WHY).filter(k=>why[k]).map(k=>`<div class="dotrow"><span>${WHY[k]}</span><strong>${why[k]}</strong></div>`).join("")}</div>`:`<p class="hint">Tag why you missed a question (in the quiz or the Notebook) to see your pattern here.</p>`}</section>`;
}
function viewHeat(){
  const head=`<div class="field" style="gap:6px"><h1>Memory Heatmap</h1><p class="muted">Based on your latest answer to every question you've attempted</p></div>`;
  if(!S.qs.length)return head+emptyBank();
  const all=stat(S.qs),g=groupBySubject(S.qs);
  const topics=[],groups=[],showAll=!!S.heatAll;
  for(const [sub,tm] of g){
    const items=[];
    for(const [t,qs] of tm){const s=stat(qs);if(s.att||showAll)items.push({name:t,sub,t,s,p:s.att?pct(s):null,n:qs.length});if(s.att)topics.push({name:t,sub,t,s,p:pct(s),f:topicScore(qs)});}
    const ss=stat([...tm.values()].flat());
    if(items.length)groups.push({sub,s:ss,p:ss.att?pct(ss):null,items:items.sort((a,b)=>b.s.att-a.s.att||(a.p===null)-(b.p===null)||(a.p||0)-(b.p||0))});
  }
  groups.sort((a,b)=>b.s.att-a.s.att);
  const subs=[];
  for(const [sub,tm] of g){const s=stat([...tm.values()].flat());if(s.att||showAll)subs.push({name:sub,sub:"",t:"",s,p:s.att?pct(s):null,subKey:sub});}
  const cls=x=>x.p===null?"none":x.p>=70?"strong":x.p>=50?"avg":"weak";
  const conf=topics.filter(x=>x.s.att>=3);
  const nStrong=conf.filter(x=>cls(x)==="strong").length,nAvg=conf.filter(x=>cls(x)==="avg").length,nWeak=conf.filter(x=>cls(x)==="weak").length;
  const focus=topics.filter(x=>x.f&&(x.f.adj<0.7||x.f.cw>0)).sort((a,b)=>b.f.score-a.f.score).slice(0,8);
  const by=S.heatBy,cells=subs.slice().sort((a,b)=>b.s.att-a.s.att||(a.p||0)-(b.p||0));
  const cellHtml=x=>`<button class="cell ${cls(x)}${x.s.att>=3?" conf":" low"}" style="--g:${Math.max(1,x.s.att)}" data-act="heat" data-s="${esc(x.sub||x.subKey)}" data-t="${esc(x.t)}"><span><span class="n">${esc(x.name)}</span>${x.sub&&by!=="topic"?`<span class="s" style="display:block">${esc(x.sub)}</span>`:by==="topic"?"":`<span class="s" style="display:block">${x.s.ok}/${x.s.att} right</span>`}</span><span class="p">${x.p===null?"Not attempted":x.p+"%"}</span></button>`;
  const nShown=by==="topic"?groups.reduce((a,b)=>a+b.items.length,0):cells.length;
  const accP=pct(all);
  return head+`<section class="card"><div class="hm"><div class="field" style="gap:12px"><span class="label">Overall accuracy</span><span class="acc">${accP===null?"-":accP+"%"}</span><span class="muted">${all.ok} of ${all.att} questions correct</span>
    <div class="field" style="gap:8px;margin-top:6px"><div class="dotrow"><span><i class="dot2" style="background:var(--good)"></i>Strong topics</span><strong>${nStrong}</strong></div><div class="dotrow"><span><i class="dot2" style="background:var(--gold)"></i>Average topics</span><strong>${nAvg}</strong></div><div class="dotrow"><span><i class="dot2" style="background:#e06a6a"></i>Weak topics</span><strong>${nWeak}</strong></div></div></div>
    <div class="field"><strong class="row" style="gap:10px"><span class="gold">${ic("quiz")}</span>Focus next</strong><p class="hint">Ranked by estimated accuracy (fair to topics with few attempts), confident mistakes and days since you last practised. Tap one to practise it.${focus.length>3?" Scroll for more.":""}</p>${focus.length?`<div class="focuslist">`+focus.map(x=>`<div class="focus tap" role="button" tabindex="0" data-act="heat" data-s="${esc(x.sub)}" data-t="${esc(x.t)}"><i></i><div><strong>${esc(x.name)}</strong><div class="muted" style="font-size:14px">${esc(x.sub)} · ${x.p}% (${x.s.ok}/${x.s.att})${x.s.att<3?" · limited data":""}</div><div class="chips" style="margin-top:6px">${x.f.cw?`<span class="chip2 bad">${x.f.cw} confident wrong</span>`:""}${x.f.days>=3?`<span class="chip2">last practised ${x.f.days}d ago</span>`:""}</div></div></div>`).join("")+`</div>`:`<p class="muted">${all.att?"Nothing needs focus right now. Nice work.":"Take a quiz and your weak topics appear here."}</p>`}</div></div></section>
  ${insightsHtml()}
  <section class="card"><div class="row sp"><div><h2>${by==="topic"?"Topics":"Subjects"} ${showAll?"overview":"you've attempted"}</h2><p class="muted">${by==="topic"?`${nShown} topic${nShown===1?"":"s"} across ${groups.length} subject${groups.length===1?"":"s"}`:`${nShown} subject${nShown===1?"":"s"}`} · bigger cell = more questions attempted</p></div>
    <div class="viewtog"><button aria-pressed="${by==="topic"}" data-act="heatby" data-v="topic">By topic</button><button aria-pressed="${by==="subject"}" data-act="heatby" data-v="subject">By subject</button><span class="vsep"></span><button aria-pressed="${showAll}" data-act="heatall">Show unattempted</button></div></div>
    ${by==="topic"?(groups.length?`<div class="hgroups">${groups.map(gr=>`<div class="hsub"><div class="hshead"><i class="hsbar ${cls(gr)}"></i><strong>${esc(gr.sub)}</strong><span class="hspct ${cls(gr)}">${gr.p===null?"\u2014":gr.p+"%"}</span><span class="muted">${gr.s.att?`${gr.s.ok} of ${gr.s.att} correct \u00b7 `:"Not attempted \u00b7 "}${gr.items.length} topic${gr.items.length===1?"":"s"}</span></div><div class="cells">${gr.items.map(cellHtml).join("")}</div></div>`).join("")}</div>`:`<p class="muted">Nothing attempted yet.</p>`):(cells.length?`<div class="cells">${cells.map(cellHtml).join("")}</div>`:`<p class="muted">Nothing attempted yet.</p>`)}
    <div class="lg2"><span><i style="border-color:var(--good);background:var(--sbg)"></i>Strong (≥70%)</span><span><i style="border-color:var(--gold);background:var(--gold-soft)"></i>Average (50–69%)</span><span><i style="border-color:#d36a6a;background:var(--wbg)"></i>Weak (&lt;50%)</span><span><i style="border-style:dashed"></i>Fewer than 3 attempts</span></div>
    <p class="hint">Tap a cell to practise it.</p></section>`;
}

/* ---------- import ---------- */
function toks(q){return new Set((q.text+" "+Object.values(q.options).join(" ")).toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>2));}
function jac(a,b){let i=0;for(const x of a)if(b.has(x))i++;const u=a.size+b.size-i;return u?i/u:0;}
const SIM=0.6;
function findSimilar(r){
  const ot=S.qs.filter(q=>q.packId!==r.id).map(q=>({q,t:toks(q)}));
  const out=[];
  for(const nq of r.questions){
    const t=toks(nq);let best=null,bs=0;
    for(const o of ot){const s=jac(t,o.t);if(s>bs){bs=s;best=o.q;}}
    if(best&&bs>=SIM)out.push({no:nq.no,newQ:nq,old:best,score:bs,choice:"both"});
  }
  return out;
}
function dupCard(d,i){
  const side=(q,lab)=>`<div class="dside"><span class="label">${lab}</span><span class="tag plain" style="align-self:flex-start">${esc(q.subject)} › ${esc(q.topic)}</span><div class="dq">${fmtQ(q.text)}</div><ul class="dopts">${Object.keys(q.options).map(L=>`<li class="${isAcceptedAnswer(q,L)?"right":""}"><b>${esc(L)}</b> ${esc(q.options[L])}${isAcceptedAnswer(q,L)?" ✓":""}</li>`).join("")}</ul></div>`;
  return `<div class="dup"><div class="row sp"><strong>New Q${d.newQ.no} looks similar</strong><span class="muted">${Math.round(d.score*100)}% match</span></div><div class="dcols">${side(d.old,"Already in your bank")}${side(d.newQ,"New in this file")}</div>
  <div class="seg">${[["old","Keep existing"],["new","Keep new"],["both","Keep both"]].map(([k,l])=>`<button aria-pressed="${d.choice===k}" data-act="dup" data-i="${i}" data-v="${k}">${l}</button>`).join("")}</div></div>`;
}
const modeSeg=()=>`<div class="row" style="gap:10px"><span class="muted">Attempt in</span><div class="seg">${[["practice","Practice"],["exam","Exam"]].map(([k,l])=>`<button aria-pressed="${S.newMode===k}" data-act="newmode" data-v="${k}">${l}</button>`).join("")}</div></div>`;
function importPreview(){
  const r=S.imp.parsed;if(!r)return "";
  const bits=[];
  if(r.errors.length)bits.push(`<ul class="errs">${r.errors.slice(0,8).map(e=>`<li>${esc(e)}</li>`).join("")}${r.errors.length>8?`<li>and ${r.errors.length-8} more</li>`:""}</ul>`);
  if(r.questions.length){
    const g=groupBySubject(r.questions.map(q=>({...q})));
    const exists=!!r.exists&&S.imp.idMode==="replace";
    const withSol=r.questions.filter(q=>q.exp).length,dups=S.imp.dups||[];
    const keep=r.questions.length-dups.filter(d=>d.choice==="old").length;
    bits.push(`<div class="pv scroll"><table><thead><tr><th>Subject</th><th>Sub-topic</th><th>Questions</th></tr></thead><tbody>${[...g].map(([s,tm])=>[...tm].map(([t,qs])=>`<tr><td>${esc(s)}</td><td>${esc(t)}</td><td>${qs.length}</td></tr>`).join("")).join("")}</tbody></table></div>
    <p class="hint">${withSol} of ${r.questions.length} have a solution.</p>${S.space==="csat"?`<p class="hint">Sources: ${["CSE","CAPF",""].map(exam=>`${exam||"Untagged"}: ${r.questions.filter(q=>questionSourceExam(q)===exam).length}`).join(" · ")}</p>`:""}
    ${dups.length?`<div class="field"><h3>Similar questions found (${dups.length})</h3><p class="muted">Review each pair. If they are different questions, keep both.</p>${dups.map(dupCard).join("")}</div>`:""}
    ${r.exists?`<div class="info"><strong>This file has the same set id as a test you already added.</strong> Choose what to do:<div class="seg" style="margin-top:10px">${[["new","Add as a separate test"],["replace","Replace the existing test"]].map(([k,l])=>`<button aria-pressed="${(S.imp.idMode==="replace")===(k==="replace")}" data-act="idmode" data-v="${k}">${l}</button>`).join("")}</div></div>`:""}
    <div class="field"><label class="label" for="impname">Test name (shown in the import log)</label><input id="impname" class="delin" style="width:100%" type="text" maxlength="120" value="${esc(S.imp.name||"")}" placeholder="${esc(r.title)}"></div>
    ${S.space==="ca"?`<div class="field"><label class="label" for="impmonth">Month &amp; year of these questions</label><input id="impmonth" class="delin" type="month" value="${esc(S.imp.month||curMonth())}"><p class="hint">Defaults to today. Change it if these questions belong to another month.</p></div>`:""}
    ${isExamSpace()?`<div class="field"><label class="label" for="impyear">PYQ year for questions missing a year (optional)</label><input id="impyear" class="delin" type="number" min="1900" max="2099" placeholder="2021" value="${esc(S.imp.year||"")}"><p class="hint">Existing question years are kept. Leave blank if the file already includes its year.</p></div>`:""}
    ${modeSeg()}
    <div class="row"><button class="btn pri" data-act="impadd" ${keep?"":"disabled"}>${exists?"Replace":"Add"} test (${keep})</button><button class="btn" data-act="impattempt" ${keep?"":"disabled"}>${exists?"Replace":"Add"} and attempt only these</button>${r.errors.length?`<span class="muted">${r.errors.length} skipped</span>`:""}</div>
    ${exists?`<p class="hint">The existing set is replaced by this file. Progress is kept only when the question, options and correct answer are unchanged.</p>`:""}`);
  }
  return bits.join("");
}
function fmtWhen(ts){if(!ts)return "Added earlier";try{return "Added "+new Date(ts).toLocaleString("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"});}catch(e){return "Added earlier";}}
function packMonth(p){const f=p.questions[0];return (f&&f.mo)||(p.ts?mKey(p.ts):"");}
function logRow(p){
  const subs=[...new Set(p.questions.map(q=>q.subject))].join(", ");
  const open=S.confirmDel===p.id;
  return `<div class="pack logrow"><div><strong>${esc(p.title)}</strong>${p.sample?` <span class="tag plain">sample</span>`:""}<div class="muted" style="font-size:14px">${esc(subs)} · ${p.questions.length} questions</div><div class="muted" style="font-size:13px">${esc(fmtWhen(p.ts))}</div>${S.space==="ca"?(S.editMonth===p.id?`<div class="row" style="margin-top:8px"><input id="mchgin" class="delin" type="month" value="${esc(packMonth(p))}"><button class="btn sm pri" data-act="msave" data-v="${esc(p.id)}">Save</button><button class="btn sm" data-act="mno">Cancel</button></div>`:`<div class="row" style="gap:8px;margin-top:6px"><span class="chip2 gold">${esc(monthLabel(packMonth(p)))}</span><button class="linkbtn" data-act="mchg" data-v="${esc(p.id)}">Change month</button></div>`):""}</div>${open?"":`<button class="btn sm danger" data-act="del" data-v="${esc(p.id)}">Delete</button>`}
  ${open?`<div class="delbox"><p><strong>Delete "${esc(p.title)}"?</strong> All ${p.questions.length} questions and your progress on them will be removed. This cannot be undone.</p><label class="label" for="delin">Type DELETE to confirm</label><div class="row"><input id="delin" class="delin" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE"><button class="btn sm danger" id="delgo" data-act="delgo" data-v="${esc(p.id)}" disabled>Delete test</button><button class="btn sm" data-act="delno">Cancel</button></div></div>`:""}</div>`;
}
function viewImport(){
  return `<div class="field" style="gap:6px"><h1>Import</h1><p class="muted">Add question sets. Subjects and sub-topics are created from the file. Importing into <strong class="gold">${spaceName()}</strong>.</p></div>
  <section class="card"><h2>Import questions</h2>${S.space==="csat"?`<p class="hint">Use <code>"source_exam": "CAPF"</code> or <code>"source_exam": "CSE"</code> at file level. A question can override it with its own source_exam. Tags identify the source within CSAT; imports stay in the selected section.</p><div><button class="btn sm" data-act="downloadtpl">Download tagged JSON example</button></div>`:""}
  <div class="field"><label class="label" for="impfile">File</label><input type="file" id="impfile" accept=".json,application/json,.txt"></div>
  <div class="field"><label class="label" for="imptext">Or paste JSON</label><textarea id="imptext" spellcheck="false" placeholder='{"subject":"Geography","questions":[...]}'>${esc(S.imp.text)}</textarea></div>
  <div id="imp-out" class="field">${importPreview()}</div></section>
  <section class="card"><h2>Import log</h2><p class="muted">Every test you added, newest first. Deleting a test removes all its questions and your progress on them.</p>
  ${spacePacks().length?`<div class="scrolllist">${spacePacks().slice().sort((a,b)=>(b.ts||0)-(a.ts||0)).map(logRow).join("")}</div>`:`<p class="muted">Nothing here yet.</p>`}
  <p class="hint">${S.storage==="cloud"?"Questions and progress are saved to your account in the cloud.":S.storage==="account"?"Questions and progress are saved to your Claude account.":"Questions and progress are saved in this browser only. Open the page signed in to keep them across devices."}</p></section>
  ${backupCard()}
  <section class="card flat"><details><summary class="sm">Import file format</summary><div class="field" style="margin-top:12px"><pre class="fmt">${esc(importTemplate())}</pre><p class="hint">"explanation" is the full solution; "summary" is an optional one-line note; "sources" is an optional list. "images" (solution figures) and "question_images" are optional lists of image links or file paths; you can also put a line like ![caption](images/fig1.png) inside the explanation. Options can also be a list. If the official key accepts either of two options, use "answer": ["A", "C"]. You still select one option; the accepted alternatives appear after checking or submitting. A question can carry its own "subject". The same set "id" replaces the earlier import.</p><div class="row"><button class="btn sm" data-act="copytpl">Copy format</button></div></div></details></section>`;
}

/* ---------- render ---------- */
function splash(){return `<div class="loginwrap"><span class="logo static">Solo Leveling</span><p class="muted">Loading...</p></div>`;}
function viewSetup(){
  const err=S.auth==="error";
  return `<div class="loginwrap"><span class="logo static">Solo Leveling</span><section class="card"><h2>${err?"Login could not start":"Login is not set up yet"}</h2>
  <p class="muted">${err?esc(S.authErr):"This site is locked behind a login, but no login service is connected."}</p>
  <p class="muted">Open <b>js/app.js</b>, fill in <b>supabaseUrl</b> and <b>supabaseKey</b> in the CONFIG line near the top, then publish the updated files.</p></section></div>`;
}
function render(){
  document.documentElement.setAttribute("data-space",S.space);document.documentElement.setAttribute("data-theme",S.theme);
  if(S.auth==="checking"){app.innerHTML=splash();return;}
  if(S.auth==="setup"||S.auth==="error"){app.innerHTML=viewSetup();return;}
  if(S.auth==="login"){app.innerHTML=viewLogin();return;}
  if(S.bankError){app.innerHTML=`<section class="card"><h2>Could not open your question bank</h2><p class="muted">${esc(S.bankError)}</p><p>Your question bank is unavailable until loading succeeds. Please retry.</p><div><button class="btn pri" data-act="retrybank">Retry</button></div></section>`;return;}
  let body;
  if(!S.ready)body=`<section class="card"><h2>Opening your question bank</h2><p class="muted">Loading your sets and progress.</p></section>`;
  else if(S.tab==="practice")body=S.quiz?viewQuiz():S.view==="search"&&isSearchSpace()?viewQuestionSearch():S.view==="daily"?viewDaily():S.view==="wiz"?viewWiz():S.view==="smart"?viewSmart():S.view==="tr"?viewTest():viewHome();
  else if(S.tab==="notebook")body=viewNotebook();
  else if(S.tab==="heat")body=viewHeat();
  else if(S.tab==="marks")body=viewMarks();
  else body=viewImport();
  const keepScroll=window.scrollY;
  const focus=S.ready&&S.tab==="practice"&&((S.quiz&&!S.quiz.done)||(!S.quiz&&S.view==="tr"));
  app.innerHTML=(focus?`<div class="row" style="justify-content:flex-end">${syncBadge()}${themeBtn()}</div>`:header())+progressRecoveryCard()+resumeCard()+body;
  window.scrollTo(0,keepScroll);
  if(S.tab==="import"){bindImport();}
}
function bindImport(){
  const ta=document.getElementById("imptext"),f=document.getElementById("impfile");
  const bf=document.getElementById("bkfile");
  if(bf)bf.addEventListener("change",()=>{const file=bf.files&&bf.files[0];if(!file)return;const rd=new FileReader();rd.onload=()=>{const r=parseBackup(String(rd.result||""));S.bk=r.error?{parsed:null,error:r.error}:{parsed:r,error:""};render();};rd.readAsText(file);});
  const di=document.getElementById("delin"),dg=document.getElementById("delgo");
  if(di&&dg){di.addEventListener("input",()=>{dg.disabled=di.value.trim().toLowerCase()!=="delete";});di.addEventListener("keydown",e=>{if(e.key==="Enter"&&!dg.disabled)dg.click();});}
  if(ta)ta.addEventListener("input",()=>{S.imp.text=ta.value;runParse();});
  if(f)f.addEventListener("change",()=>{const file=f.files&&f.files[0];if(!file)return;const rd=new FileReader();rd.onload=()=>{S.imp.text=String(rd.result||"");const t=document.getElementById("imptext");if(t)t.value=S.imp.text;runParse();};rd.readAsText(file);});
}
let parseTimer=0;
function runParse(){
  clearTimeout(parseTimer);
  parseTimer=setTimeout(()=>{
    const p=S.imp.text.trim()?parseImport(S.imp.text):null;
    if(p&&p.id){
      p.id=scopedPackId(p.id);
      if(p.month&&S.space=="ca")S.imp.month=p.month;
      p.exists=!!S.packs.find(x=>x.id===p.id);
      if(p.exists&&S.imp.idMode!=="replace"){const base=p.id;let n=2;while(S.packs.find(x=>x.id===base+"-"+n))n++;p.id=base+"-"+n;}
    }
    S.imp.parsed=p;S.imp.dups=p&&p.questions&&p.questions.length?findSimilar(p):[];
    const out=document.getElementById("imp-out");if(out)out.innerHTML=importPreview();
  },250);
}

/* ---------- login ---------- */
function viewLogin(){
  const up=S.authMode==="up",m=S.authMsg;
  return `<div class="loginwrap"><div class="field" style="gap:6px"><span class="logo static">Solo Leveling</span><h1>${up?"Create your account":"Welcome back"}</h1><p class="muted">Sign in to keep your questions, mistakes and progress safe across devices.</p></div>
  <section class="card"><div class="seg"><button aria-pressed="${!up}" data-act="authmode" data-v="in">Sign in</button><button aria-pressed="${up}" data-act="authmode" data-v="up">Create account</button></div>
  <div class="field"><label class="label" for="aemail">Email</label><input class="txt" type="email" id="aemail" autocomplete="email" value="${esc(S.authEmail)}"></div>
  <div class="field"><label class="label" for="apass">Password</label><input class="txt" type="password" id="apass" autocomplete="${up?"new-password":"current-password"}"></div>
  ${m?`<p class="note${m.bad?" bad":""}" role="alert">${esc(m.text)}</p>`:""}
  <button class="btn pri full" data-act="authgo">${up?"Create account":"Sign in"}</button>
  <button class="btn full" data-act="magic">Email me a login link instead</button>
  ${CONFIG.googleLogin?`<button class="btn full" data-act="google">Continue with Google</button>`:""}
  <p class="hint">Forgot your password? Use the login link, then you are signed in without it.</p></section></div>`;
}
function authVals(){const e=document.getElementById("aemail"),p=document.getElementById("apass");S.authEmail=e?e.value.trim():S.authEmail;return {email:S.authEmail,password:p?p.value:""};}
const authBack=()=>location.href.split("#")[0];
async function authGo(){
  const {email,password}=authVals();
  if(!email||!password){S.authMsg={text:"Enter your email and password.",bad:1};render();return;}
  const up=S.authMode==="up";
  const r=up?await S.sb.auth.signUp({email,password,options:{emailRedirectTo:authBack()}}):await S.sb.auth.signInWithPassword({email,password});
  if(r.error){S.authMsg={text:r.error.message,bad:1};render();return;}
  if(up&&!(r.data&&r.data.session)){S.authMsg={text:"Account created. Open the confirmation link we emailed you, then sign in."};render();}
}
async function authMagic(){
  const {email}=authVals();
  if(!email){S.authMsg={text:"Enter your email first.",bad:1};render();return;}
  const r=await S.sb.auth.signInWithOtp({email,options:{emailRedirectTo:authBack()}});
  S.authMsg=r.error?{text:r.error.message,bad:1}:{text:"Login link sent. Open it on this device."};render();
}
function resetData(){
  saveQuizSession();QUIZ_DRAFTS.rows=[];QUIZ_DRAFTS.error=false;QUIZ_DRAFTS.dirty=true;bankGeneration++;resetProgressSession();resetTestHistory();clearTimeout(saveTimer);
  S.store=null;S.storage="browser";S.packs=[];S.qs=[];S.byUid=new Map();S.prog={};S.quiz=null;S.view="home";S.tab="practice";S.tr=null;
  S.imp={parsed:null,errors:[],text:"",dups:[],name:"",month:"",idMode:""};S.bk={parsed:null,error:""};S.mdText="";S.importing=false;S.restoring=false;S.nb.subject=undefined;
  S.sel.subjects=new Set();S.sel.topics=new Set();S.sel.months=new Set();S.sel.pack="all";S.smart={subject:"",subjects:new Set(),topics:new Set(),step:1,count:20,custom:15,mode:"practice",back:"practice"};
  for(const search of Object.values(QUESTION_SEARCH)){search.draft="";search.query="";search.page=1;}
  QUESTION_INDEX={questions:null,space:"",rows:[]};saveSet=new Set();resetQuoteSession();
}

/* ---------- backup ---------- */
function backupProblems(){
  const problems=[];
  try{normalizeMappingBackup(MappingStorage.read());}catch(error){problems.push('this browser’s mapping data');}
  if(accountQuoteMode(S.storage)&&(quoteSync.owner!==S.store?.quoteOwner||quoteSync.state!=='ready'))problems.push('quotes');
  if(TEST_HISTORY.remote&&(!TEST_HISTORY.loaded||!['ready','saving'].includes(TEST_HISTORY.state)))problems.push('completed-test history');
  return problems;
}
function buildBackup(){
  const missing=backupProblems();if(missing.length)throw Error('Backup unavailable until '+missing.join(' and ')+' finish loading. Retry loading in Backup and restore.');
  const progress={};for(const p of S.packs)progress[p.id]=itemsFor(p.id);
  const saved=normalizeMappingBackup(MappingStorage.read()),mapping=Object.keys(saved.history).length||Object.keys(saved.edits).length||Object.keys(saved.mapSettings).length?saved:null;
  const quotes=accountQuoteMode(S.storage)&&(quoteSync.owner!==S.store?.quoteOwner||quoteSync.state!=="ready")?null:dailyQuotes;
  return JSON.stringify({schema:"recall-desk-backup/1",exported:new Date().toISOString(),packs:S.packs.map(p=>({id:p.id,title:p.title,sample:!!p.sample,ts:p.ts||0,questions:p.questions.map(canonicalQuestion)})),progress,test_history:readTestHistory(),answer_recovery:[...PROGRESS.conflicts.values()],...(quotes?{quotes}:{}),...(mapping?{mapping}:{})});
}
function normalizeAnswerRecovery(rows){
  if(rows===undefined)return [];
  if(!Array.isArray(rows)||rows.length>5000)throw Error('Invalid answer recovery records.');
  return rows.map(op=>{if(!plainObject(op)||typeof op.pid!=='string'||!safeKey(op.pid)||op.pid.length>200||!Array.isArray(op.changes)||!op.changes.length||op.changes.length>5000||op.changes.some(c=>!plainObject(c)||!/^\d+$/.test(c.no)||(c.after!==null&&(!plainObject(c.identity)||typeof c.identity.text!=='string'))||(c.before!==null&&!plainObject(c.before))||(c.after!==null&&!plainObject(c.after))))throw Error('Invalid answer recovery record.');return {pid:op.pid,changes:structuredClone(op.changes),blockedReason:'Recovered answers for changed or removed questions.'};});
}
function normalizeMappingBackup(value){
  if(!plainObject(value))throw Error("Invalid mapping backup.");
  const history={},edits={};
  for(const [id,p] of Object.entries(value.history||{})){if(!safeKey(id)||!plainObject(p))continue;history[id]=Object.fromEntries(['seen','correct','review','last'].map(k=>[k,Number.isFinite(p[k])&&p[k]>=0?p[k]:0]));}
  for(const [id,p] of Object.entries(value.edits||{})){if(!safeKey(id)||!plainObject(p))continue;edits[id]=Object.fromEntries(Object.entries(p).filter(([k,v])=>['name','capital','note','source','mouth','route','region'].includes(k)&&typeof v==='string').map(([k,v])=>[k,v.slice(0,k==='note'?8000:2000)]));}
  const mapSettings={};for(const k of ['latitudes','stateBorders','indiaCountryBorders','worldBorders'])if(typeof value.mapSettings?.[k]==='boolean')mapSettings[k]=value.mapSettings[k];
  if(Number.isFinite(value.mapSettings?.sidebarWidth))mapSettings.sidebarWidth=Math.max(160,Math.min(640,value.mapSettings.sidebarWidth));
  return {theme:value.theme==='light'?'light':'dark',history,edits,mapSettings};
}
function buildAnalysis(){
  const cell=v=>{v=v==null?"":String(v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const head=["space","test","q","subject","topic","status","attempts","wrong","skipped","right","sureness","why_missed","last_time_s","avg_time_s","slow_correct","box","due","last_seen","bookmarked","open_mistake","first_result","first_pick","repeat_answered","repeat_correct","repeat_skipped"];
  const rows=[head.join(",")];
  for(const pk of S.packs){
    const space=packSpace(pk.id),sp=space==="ca"?"current-affairs":space;
    for(const q of pk.questions){
      const p=S.prog[pk.id+":"+q.no];if(!p||!(p.a||p.sk||p.b))continue;
      const st=p.a?(p.l==="c"?"correct":"wrong"):p.sk?"skipped":"new";
      rows.push([sp,pk.title,q.no,canonicalSubject(q.subject),q.topic,st,p.a||0,p.w||0,p.sk||0,p.c||0,CONF[p.cf]||"",WHY[p.wy]||"",p.tm||"",p.tn?Math.round((p.ts||0)/p.tn):"",p.sl?1:0,p.bx||"",p.a?dueDay(p):"",p.t?dayKey(p.t):"",p.b?1:0,p.m?1:0,p.first?(p.first.skipped?"skipped":p.first.ok?"correct":"wrong"):"unknown",p.first?.pick||"",p.repeat?.a||0,p.repeat?.c||0,p.repeat?.sk||0].map(cell).join(","));
    }
  }
  return "# recall-desk progress export "+new Date().toISOString().slice(0,10)+" (sureness = how sure you were on the last answer; why_missed = your tag for the last wrong answer)\n"+rows.join("\n");
}
function saveFile(name,text,type){
  try{const b=new Blob([text],{type:type||"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);return true;}catch(e){return false;}
}
function parseBackup(text){
  let d;try{d=JSON.parse(text);}catch(e){return {error:"This is not valid JSON."};}
  if(!d||d.schema!=="recall-desk-backup/1"||!Array.isArray(d.packs))return {error:"This is not a Recall Desk backup file."};
  const packs=[],ids=new Set();
  for(const p of d.packs){
    if(!p||typeof p.id!=="string"||!p.id||p.id.length>200||!safeKey(p.id)||ids.has(p.id)||!Array.isArray(p.questions))return {error:"The backup contains an invalid or repeated set ID."};
    ids.add(p.id);const qs=p.questions.map(storedQuestion),nos=new Set(qs.filter(Boolean).map(q=>q.no));
    if(qs.some(q=>!q)||nos.size!==qs.length)return {error:"Invalid questions in "+String(p.title||p.id)+". Restore was stopped before changing your data."};
    if(qs.length)packs.push({id:p.id,title:String(p.title||p.id),sample:!!p.sample,ts:Number(p.ts)||0,questions:qs});
  }
  if(!packs.length)return {error:"No question sets were found in this backup."};
  const progress={};for(const p of packs){progress[p.id]={};for(const q of p.questions){const value=d.progress?.[p.id]?.[q.no];if(value)progress[p.id][q.no]=cleanProgress(value);}}
  try{return {packs,progress,testHistory:normalizeTestHistory(d.test_history),answerRecovery:normalizeAnswerRecovery(d.answer_recovery),exported:d.exported||"",...(Object.hasOwn(d,'quotes')?{quotes:parseQuoteJson(JSON.stringify(d.quotes))}:{}),...(Object.hasOwn(d,'mapping')?{mapping:normalizeMappingBackup(d.mapping)}:{})};}catch(error){return {error:error.message};}
}
async function restoreBackup(){
  const b=S.bk.parsed;if(!b||S.restoring)return;
  const context=bankContext(),token={};S.restoring=token;
  try{
  await flush();assertBank(context);
  for(const p of b.packs){
    const old=S.packs.find(x=>x.id===p.id),oldChunks=old?old.chunks:0;
    const pack={...p,chunks:oldChunks};
    await enqueue(()=>S.store.savePack(pack,oldChunks));
    assertBank(context);
    S.packs=S.packs.filter(x=>x.id!==p.id).concat(pack);
    rebuild();
    const items=b.progress[p.id]||{};
    // A restored set gets exactly the backup's progress, including an empty record.
    for(const uid of Object.keys(S.prog))if(uid.slice(0,uid.lastIndexOf(":"))===p.id)delete S.prog[uid];
    for(const q of pack.questions)if(Object.hasOwn(items,q.no))S.prog[p.id+":"+q.no]=items[q.no];
    queueSave(p.id,true);
  }
  await flush();assertBank(context);
  for(const record of b.testHistory||[])recordTestResult(record);
  await TEST_HISTORY.chain;
  assertBank(context);
  if(b.quotes){await persistQuoteCollection(b.quotes);assertBank(context);}
  if(b.mapping)MappingStorage.restore(b.mapping);
  for(const row of b.answerRecovery||[]){const op={...row,id:progressId(),owner:PROGRESS.owner,created:Date.now()};holdProgressOperation(op,row.blockedReason);}
  const n=b.packs.reduce((a,p)=>a+p.questions.length,0);
  S.bk={parsed:null,error:""};toast("Restored "+b.packs.length+" set"+(b.packs.length===1?"":"s")+", "+n+" questions");render();
  }finally{if(S.restoring===token)S.restoring=false;}
}
function backupCard(){
  const b=S.bk.parsed,n=b?b.packs.reduce((a,p)=>a+p.questions.length,0):0,pn=b?Object.values(b.progress).reduce((a,o)=>a+Object.keys(o||{}).length,0):0;
  const missing=backupProblems(),available=S.packs.length&&!missing.length;
  return `<section class="card"><h2>Backup and restore</h2>
  ${missing.length?`<p class="note bad" role="status">A complete backup is unavailable: ${esc(missing.join(" and "))} have not loaded. Retry before exporting.</p><button class="btn sm" data-act="backup-retry">Retry loading backup data</button>`:""}
  <p class="muted">Save your question sets, progress, quotes and this browser’s mapping notes and progress to one file, and load it back any time, even in a new account.</p>
  <div class="row">${CONFIG.requireLogin?`<button class="btn pri" data-act="bkdl" ${available?"":"disabled"}>Download backup</button>`:""}<button class="btn${CONFIG.requireLogin?"":" pri"}" data-act="bkcopy" ${available?"":"disabled"}>Copy backup</button></div>
  <p class="hint">${CONFIG.requireLogin?"If your browser blocks the download, use Copy backup and paste it into a text file.":"Copy the backup and paste it into a text file. Restore reads that file back."}</p>
  <div class="field" style="gap:8px"><span class="label">For analysis</span><p class="muted" style="font-size:14px">A small progress-only file (no question text) that you can paste or attach in a chat to get a review of your patterns.</p><div class="row">${CONFIG.requireLogin?`<button class="btn pri" data-act="andl" ${S.packs.length?"":"disabled"}>Download analysis file</button>`:""}<button class="btn${CONFIG.requireLogin?"":" pri"}" data-act="ancopy" ${S.packs.length?"":"disabled"}>Copy for analysis</button></div></div>
  <div class="field"><label class="label" for="bkfile">Restore from a backup file</label><input type="file" id="bkfile" accept=".json,application/json,.txt"></div>
  ${S.bk.error?`<p class="note bad">${esc(S.bk.error)}</p>`:""}
  ${b?`<div class="field"><p>${b.packs.length} set${b.packs.length===1?"":"s"} \u00b7 ${n} questions \u00b7 progress on ${pn} questions${b.exported?` \u00b7 saved ${esc(String(b.exported).slice(0,10))}`:""}</p><p class="hint">Sets with the same id are replaced along with their progress. Included quotes replace your collection; mapping entries are merged. Backups without quotes or mapping leave those untouched.</p><div class="row"><button class="btn pri" data-act="bkrestore">Restore</button></div></div>`:""}</section>`;
}

/* ---------- actions ---------- */
function recordAnswer(uid,pick,o){
  o=o||{};
  const operationId=quizEventId(uid,'answer'),existing=PROGRESS.ops.get(operationId)?.changes.find(c=>c.no===String(S.byUid.get(uid)?.no));
  if(existing){const p=getP(uid);return {ok:isAcceptedAnswer(S.byUid.get(uid),pick),cleared:false,wasM:!!existing.before?.m,days:(p.cd||[]).length,slow:!!p.sl,attemptType:existing.before?.a||existing.before?.sk?'repeat':'first'};}
  const q=S.byUid.get(uid),p=getP(uid),ok=isAcceptedAnswer(q,pick),wasM=!!p.m,td=dayKey();let cleared=false,days=0;
  const attemptType=trackAttempt(p,{pick,ok,cf:o.cf,reason:o.reason});
  p.a++;p.t=Date.now();p.cf=o.cf||"";
  if(typeof o.tm==="number"&&o.tm>0){p.tm=Math.round(o.tm);p.ts=(p.ts||0)+p.tm;p.tn=(p.tn||0)+1;p.sl=ok&&p.tm>SLOW_S?1:0;}else p.sl=0;
  if(ok){
    p.c++;p.l="c";p.x="";
    const sure=p.cf!=="g"&&p.cf!=="h";
    p.bx=sure?Math.min(5,(p.bx||1)+1):(p.bx||1);
    p.dd=addDays(td,BOX_DAYS[p.bx]);
    if(p.m){
      p.cd=p.cd||[];
      if(sure&&!p.cd.includes(td))p.cd.push(td);
      if(p.cd.length>=CLEAR_DAYS){p.m=0;cleared=true;p.cd=[];}
    }
    days=p.m?(p.cd||[]).length:CLEAR_DAYS;
  }else{
    p.w++;p.l="w";p.m=1;p.x=pick;p.bx=1;p.dd=addDays(td,1);p.cd=[];p.wy="";
    if(p.cf==="s")p.cw=(p.cw||0)+1;
  }
  markDailyReview(uid);queueSave(q.packId,false,operationId);return {ok,cleared,wasM,days,slow:!!p.sl,attemptType};
}
function recordSkip(uid){
  const operationId=quizEventId(uid,'skip'),existing=PROGRESS.ops.get(operationId)?.changes.find(c=>c.no===String(S.byUid.get(uid)?.no));if(existing)return existing.before?.a||existing.before?.sk?'repeat':'first';
  const q=S.byUid.get(uid),p=getP(uid);
  const attemptType=trackAttempt(p,{skipped:true,reason:S.quiz?.rn?.[uid]||""});
  p.sk=(p.sk||0)+1;p.m=1;p.t=Date.now();p.bx=1;p.dd=addDays(dayKey(p.t),1);p.cd=[];markDailyReview(uid);queueSave(q.packId,false,operationId);return attemptType;
}
function quizEventId(uid,kind){const Q=S.quiz;if(!Q||Q.done||!Q.id)return '';Q.events=Q.events||{};Q.slots=Q.slots||Object.fromEntries(Q.uids.map((u,i)=>[u,i]));const key=uid+':'+kind;if(!Q.events[key]){Q.events[key]=Q.id+':'+Q.slots[uid]+':'+(Q.mode==='exam'?'result':kind);saveQuizSession();}return Q.events[key];}
function startQuiz(uids,o){
  DASH.open=false;
  S.confirmFin=false;S.confirmExit=false;
  if(!uids.length)return;
  o=o||{};
  S.quiz={id:progressId(),space:S.space,uids,slots:Object.fromEntries(uids.map((uid,i)=>[uid,i])),rv:null,i:0,mode:o.mode||"practice",kind:o.kind||"Quiz",label:o.label||"Mixed",start:Date.now(),ans:{},res:{},sel:{},skp:{},cf:{},rn:{},marked:{},tm:{},t0:Date.now(),done:false,elapsed:0,scoring:Object.fromEntries(uids.map(u=>[u,{...markingFor(S.byUid.get(u))}]))};
  claimQuiz(S.quiz.id);S.tab="practice";S.mdText="";render();window.scrollTo(0,0);
}
function doPick(L){
  const Q=S.quiz;if(!Q||!ownsQuiz(Q,true)||Q.done)return;
  const uid=Q.uids[Q.i],q=S.byUid.get(uid);if(!q.options[L])return;
  if(Q.mode==="exam"){Q.ans[uid]=L;delete Q.skp[uid];render();return;}
  const r=Q.res[uid];if(r&&!r.skipped)return;
  Q.sel[uid]=L;render();
}
function doCheck(){
  const Q=S.quiz;if(!Q||!ownsQuiz(Q,true)||Q.done||Q.mode==="exam")return;
  const uid=Q.uids[Q.i],L=Q.sel[uid],r=Q.res[uid];if(!L||(r&&!r.skipped)||!canDailyReview(uid))return;
  tickQ();
  const tmS=(Q.tm[uid]||0)/1000,cf=Q.cf[uid]||"";
  const reason=Q.rn[uid]||"",out=recordAnswer(uid,L,{cf,tm:tmS,reason});
  Q.res[uid]={pick:L,reason,attemptType:out.attemptType,ok:out.ok,cleared:out.cleared,wasM:out.wasM,days:out.days,slow:out.slow,cf,tm:Math.round(tmS),skipped:false};
  if(out.cleared)toast("Cleared from your Notebook");
  render();
}
function goTo(k){const Q=S.quiz;if(!Q||Q.done||k<0||k>=Q.uids.length)return;tickQ();Q.i=k;render();window.scrollTo(0,0);}
function markForReview(){
  const Q=S.quiz;if(!Q||!ownsQuiz(Q,true)||Q.done)return;
  const uid=Q.uids[Q.i];Q.marked=Q.marked||{};
  if(Q.marked[uid])delete Q.marked[uid];else Q.marked[uid]=true;
  render();
}
function goToMarked(){
  const Q=S.quiz;if(!Q||!markedCount(Q))return;
  S.confirmFin=false;
  const from=Q.done?(Q.rv??-1):Q.i;
  for(let step=1;step<=Q.uids.length;step++){
    const i=(from+step)%Q.uids.length;if(!Q.marked[Q.uids[i]])continue;
    if(Q.done){Q.rv=i;render();window.scrollTo(0,0);}else goTo(i);
    return;
  }
}
function doSkip(){
  const Q=S.quiz;if(!Q||!ownsQuiz(Q,true)||Q.done)return;
  const uid=Q.uids[Q.i];if(!canDailyReview(uid))return;
  if(Q.mode==="exam"){delete Q.ans[uid];Q.skp[uid]=1;if(Q.i<Q.uids.length-1)goTo(Q.i+1);else render();return;}
  if(!Q.res[uid]){const attemptType=recordSkip(uid);Q.res[uid]={skipped:true,ok:false,attemptType,reason:Q.rn[uid]||""};}
  if(Q.i<Q.uids.length-1)goTo(Q.i+1);else{S.confirmFin=true;render();}
}
function finishQuiz(){
  const Q=S.quiz;if(!Q||!ownsQuiz(Q,true)||Q.done)return;
  tickQ();
  Q.submitting=true;saveQuizSession();
  for(const u of Q.uids){
    if(Q.mode==="exam"){
      const pick=Q.ans[u];
      if(pick){const tmS=(Q.tm[u]||0)/1000,cf=Q.cf[u]||"";const reason=Q.rn[u]||"",o=recordAnswer(u,pick,{cf,tm:tmS,reason});Q.res[u]={pick,reason,attemptType:o.attemptType,ok:o.ok,cleared:o.cleared,wasM:o.wasM,days:o.days,slow:o.slow,cf,tm:Math.round(tmS),skipped:false};}
      else{const attemptType=recordSkip(u);Q.res[u]={skipped:true,ok:false,attemptType,reason:Q.rn[u]||""};}
    }else if(!Q.res[u]&&Q.kind==="Daily revision"){Q.res[u]={skipped:true,ok:false,deferred:true};}
    else if(!Q.res[u]){const attemptType=recordSkip(u);Q.res[u]={skipped:true,ok:false,attemptType,reason:Q.rn[u]||""};}
    saveQuizSession();
  }
  Q.done=true;Q.submitting=false;Q.completedAt=Date.now();Q.elapsed=(Q.elapsedBase||0)+Date.now()-(Q.resumeClock||Q.start);saveQuizSession();flushInBackground();
  const cl=Q.uids.filter(u=>Q.res[u].cleared).length;
  if(cl&&Q.mode==="exam")toast("Cleared "+cl+" from your Notebook");
  render();window.scrollTo(0,0);
}
function sameQuestion(a,b){
  const identity=q=>JSON.stringify({text:q.text,answer:acceptedAnswers(q),options:Object.keys(q.options).sort().map(k=>[k,q.options[k]]),qimg:q.qimg||[]});
  return identity(a)===identity(b);
}
async function addPack(parsed,sample){
  const context=bankContext();await flush();assertBank(context);
  const old=S.packs.find(p=>p.id===parsed.id);
  const pack={id:parsed.id,title:parsed.title,sample:!!sample,ts:Date.now(),questions:parsed.questions,chunks:old?old.chunks:0};
  const oldChunks=old?old.chunks:0;
  await enqueue(()=>S.store.savePack(pack,oldChunks));
  assertBank(context);
  S.packs=S.packs.filter(p=>p.id!==pack.id).concat(pack);
  rebuild();
  if(old){
    const previous=new Map(old.questions.map(q=>[q.no,q]));
    const unchanged=new Set(pack.questions.filter(q=>previous.has(q.no)&&sameQuestion(previous.get(q.no),q)).map(q=>pack.id+":"+q.no));
    for(const uid of Object.keys(S.prog))if(uid.slice(0,uid.lastIndexOf(":"))===pack.id&&!unchanged.has(uid))delete S.prog[uid];
    queueSave(pack.id,true);await flush();
  }
  return pack;
}
async function removeQuestion(uid){
  const context=bankContext();await flush();assertBank(context);
  const q=S.byUid.get(uid);if(!q)return;
  const p=S.packs.find(x=>x.id===q.packId);if(!p)return;
  const oldChunks=p.chunks||1,updated={...p,questions:p.questions.filter(x=>x.no!==q.no)};
  if(!updated.questions.length)await enqueue(()=>S.store.deletePack(p));
  else await enqueue(()=>S.store.savePack(updated,oldChunks));
  assertBank(context);
  delete S.prog[uid];
  S.packs=updated.questions.length?S.packs.map(x=>x===p?updated:x):S.packs.filter(x=>x!==p);
  rebuild();if(updated.questions.length)queueSave(p.id);
}
async function applyImport(attempt){
  const r=S.imp.parsed;if(!r||!r.questions.length||S.importing)return;
  const context=bankContext(),space=S.space,mode=S.newMode,tab=S.tab,view=S.view,token={};
  S.importing=token;
  try{
  const dups=S.imp.dups||[],drop=new Set(),del=new Set();
  for(const d of dups){if(d.choice==="old")drop.add(d.no);else if(d.choice==="new")del.add(d.old.uid);}
  const qs=r.questions.filter(q=>!drop.has(q.no));
  if(S.space==="ca"){const mo=okMonth(S.imp.month)?S.imp.month:curMonth();qs.forEach(q=>{q.mo=mo;});}
  if(isExamSpace()&&S.imp.year){const year=String(S.imp.year).trim();if(!/^(19|20)\d{2}$/.test(year)){toast("Enter a valid four-digit PYQ year");return;}qs.forEach(q=>{if(!q.year)q.year=year;});}
  if(!qs.length){toast("Nothing left to add");return;}
  // Persist the replacement before removing any originals. Same-set originals
  // have already been replaced by addPack and must not delete the new questions.
  const pack=await addPack({id:r.id,title:(S.imp.name||"").trim()||r.title,questions:qs},false);
  assertBank(context);
  for(const uid of del)if(uid.slice(0,uid.lastIndexOf(":"))!==pack.id)await removeQuestion(uid);
  await flush();
  assertBank(context);
  if(S.space!==space||S.tab!==tab||S.view!==view||S.imp.parsed!==r||S.quiz&&!S.quiz.done){toast(qs.length+" questions added to "+SPACES[space].label);return;}
  S.imp={parsed:null,errors:[],text:"",dups:[],name:"",month:"",idMode:""};
  const uids=pack.questions.map(q=>pack.id+":"+q.no);
  if(attempt){toast(qs.length+" questions added");startQuiz(uids,{mode,kind:"New import",label:pack.title});}
  else{toast(qs.length+" questions added"+(del.size?", "+del.size+" older replaced":""));S.tab="practice";S.view="home";render();}
  }finally{if(S.importing===token)S.importing=false;}
}
document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]");if(!el)return;
  const a=el.dataset.act,v=el.dataset.v,sel=S.view==="smart"?S.smart:S.sel;
  try{
  switch(a){
    case "progress-review":DASH.open=false;S.tab='import';render();document.querySelector('.progress-recovery')?.setAttribute('open','');break;
    case "progress-export":saveFile('solo-answer-recovery.json',JSON.stringify({schema:'solo-answer-recovery/1',exported:new Date().toISOString(),changes:[...PROGRESS.conflicts.values()]},null,2));break;
    case "progress-discard":{const op=PROGRESS.conflicts.get(v);if(op){if(!window.confirm('Remove this saved change from this browser? Export the recovery file first if you want to keep it.'))break;localStorage.removeItem(progressOperationKey(op.owner,op.id));PROGRESS.conflicts.delete(v);render();}break;}
    case "backup-retry":{const context=bankContext();await Promise.all([loadStoredQuotes(S.store,S.storage),loadTestHistory(S.store,S.storage)]);assertBank(context);render();break;}
    case "sync-retry":await flush();if(TEST_HISTORY.remote)await loadTestHistory(S.store,S.storage);toast("Sync retried");render();break;
    case "resume-quiz":resumeQuiz(v);break;
    case "discard-quiz":discardQuizDraft(v);render();break;
    case "retrybank":if(S.bankRetry)await openBank(S.bankRetry.store,S.bankRetry.mode);break;
    case "tab":if(v==="heat"){openSwot(S.space,true);break;}DASH.open=false;S.tab=v;if(v!=="practice")S.view="home";if(v==="notebook"&&el.dataset.quizdone)S.nb.subject=undefined;if(v!=="practice"&&S.quiz&&S.quiz.done&&el.dataset.quizdone)S.quiz=null;S.mdText="";render();window.scrollTo(0,0);break;
    case "startwiz":S.view="wiz";S.step=1;S.quiz=null;render();window.scrollTo(0,0);break;
    case "cancel":S.view="home";sel.subjects=new Set();sel.topics=new Set();sel.months=new Set();render();break;
    case "next2":if(S.view==="smart"){S.smart.step=2;render();window.scrollTo(0,0);}else if(sel.subjects.size){S.step=2;render();window.scrollTo(0,0);}break;
    case "back1":if(S.view==="smart")S.smart.step=1;else S.step=1;render();break;
    case "smart":S.smart={subject:"",subjects:new Set(),topics:new Set(),step:1,count:20,custom:15,mode:"practice",back:"practice"};S.view="smart";S.tab="practice";S.quiz=null;render();window.scrollTo(0,0);break;
    case "smartsub":S.smart={subject:"",subjects:new Set(el.dataset.s?[el.dataset.s]:[]),topics:new Set(),step:el.dataset.s?2:1,count:20,custom:15,mode:"practice",back:"notebook"};S.view="smart";S.tab="practice";S.quiz=null;render();window.scrollTo(0,0);break;
    case "smartback":{const b=S.smart.back;S.view="home";S.tab=b;render();window.scrollTo(0,0);break;}
    case "smartgo":{const o=S.smart,uids=interleave(smartPool("",o).slice(0,effCount(o))).map(q=>q.uid);startQuiz(uids,{mode:o.mode,kind:"Smart Quiz",label:o.subjects.size?[...o.subjects].join(", "):"All subjects"});break;}
    case "attemptpack":{const pk=S.packs.find(x=>x.id===v);if(!pk)break;const uids=S.qs.filter(q=>q.packId===pk.id&&!(S.prog[q.uid]&&S.prog[q.uid].a)).sort((x,y)=>x.no-y.no).map(q=>q.uid);startQuiz(uids,{mode:S.newMode,kind:"New import",label:pk.title});break;}
    case "attemptlatest":{const lp=latestPack();if(!lp)break;const uids=S.qs.filter(q=>q.packId===lp.id&&!(S.prog[q.uid]&&S.prog[q.uid].a)).sort((x,y)=>x.no-y.no).map(q=>q.uid);startQuiz(uids,{mode:S.newMode,kind:"New import",label:lp.title});break;}
    case "quizmarks":startQuiz(shuffle(bookmarks().map(q=>q.uid)),{mode:"practice",kind:"Bookmarks",label:"Saved questions"});break;
    case "suball":{const subs=S.view==="smart"?[...new Set(smartPool("",{months:new Set()}).map(q=>q.subject))]:[...new Set(S.qs.map(q=>q.subject))];if(subs.every(s=>sel.subjects.has(s))){sel.subjects=new Set();sel.topics=new Set();}else sel.subjects=new Set(subs);render();break;}
    case "topall":{const ks=el.dataset.ks?JSON.parse(el.dataset.ks):[];if(ks.every(k=>sel.topics.has(k)))sel.topics=new Set();else sel.topics=new Set(ks);render();break;}
    case "subj":if(sel.subjects.has(v)){sel.subjects.delete(v);for(const k of [...sel.topics])if(k.startsWith(v+"›"))sel.topics.delete(k);}else sel.subjects.add(v);render();break;
    case "topic":sel.topics.has(v)?sel.topics.delete(v):sel.topics.add(v);render();break;
    case "which":sel.which=v;render();break;
    case "sourceexam":{
      if(S.space!=="csat"||!["","CSE","CAPF","untagged"].includes(v))break;
      const scope=el.dataset.scope;
      if(scope==="year")S.pyqSource={sourceExam:v};
      else if(scope==="search"){activeSearch().sourceExam=v;activeSearch().page=1;}
      else if(scope==="smart")S.smart.sourceExam=v;
      else if(scope==="quiz")S.sel.sourceExam=v;
      render();break;
    }
    case "pc":tgt().count=v==="custom"?"custom":Number(v);render();break;
    case "pm":tgt().mode=v;render();break;
    case "start":startQuiz(pickSet(),{mode:sel.mode,kind:"Quiz",label:[...sel.subjects].join(", ")||"Mixed"});break;
    case "dailyopen":S.view="daily";S.quiz=null;render();window.scrollTo(0,0);break;
    case "dailyback":S.view="home";render();window.scrollTo(0,0);break;
    case "dailygo":startDailyReview();break;
    case "duego":{const list=interleave(dueList().slice(0,DUE_CAP));if(list.length)startQuiz(list.map(q=>q.uid),{mode:"practice",kind:"Due review",label:"Spaced revision"});break;}
    case "conf":{const Q=S.quiz;if(!Q||Q.done)break;const u=Q.uids[Q.i],r0=Q.res[u];if(Q.mode!=="exam"&&r0&&!r0.skipped)break;Q.cf[u]=Q.cf[u]===v?"":v;render();break;}
    case "why":{const u=el.dataset.u,p=getP(u),q=S.byUid.get(u);p.wy=p.wy===v?"":v;if(q)queueSave(q.packId);if(el.closest(".nbq")){el.parentElement.querySelectorAll(".pbtn").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.v===p.wy)));}else render();break;}
    case "yearattempt":attemptPyqYear(v);break;
    case "yearreview":reviewPyqYear(v);break;
    case "testopen":S.tr={pid:v,f:"all",i:0};S.view="tr";S.tab="practice";S.quiz=null;render();window.scrollTo(0,0);break;
    case "trf":if(S.tr){S.tr.f=v;S.tr.i=0;render();window.scrollTo(0,0);}break;
    case "tgoto":if(S.tr){S.tr.i=Number(v);render();window.scrollTo(0,0);}break;
    case "tprev":if(S.tr){S.tr.i=Math.max(0,(S.tr.i||0)-1);render();window.scrollTo(0,0);}break;
    case "tnext":if(S.tr){S.tr.i=(S.tr.i||0)+1;render();window.scrollTo(0,0);}break;
    case "alltests":S.allTests=!S.allTests;render();break;
    case "moveopen":{const b=el.closest(".moveblk"),fm=b.querySelector(".moveform"),q=S.byUid.get(v);if(!q)break;fm.innerHTML=moveStep1(q);fm.hidden=false;el.hidden=true;break;}
    case "movecancel":{const b=el.closest(".moveblk");b.querySelector(".moveform").hidden=true;b.querySelector('[data-act="moveopen"]').hidden=false;break;}
    case "mvsub":case "mvsubnew":{const fm=el.closest(".moveform"),q=S.byUid.get(fm.dataset.u);if(!q)break;let sj=v;
      if(a==="mvsubnew"){sj=fm.querySelector(".mvnew").value.trim().replace(/\s+/g," ");if(!sj){toast("Type a subject first");break;}const subs=[...new Set(S.qs.map(x=>x.subject))];sj=subs.find(x=>x.toLowerCase()===sj.toLowerCase())||sj;}
      fm.innerHTML=moveStep2(q,sj);break;}
    case "mvback":{const fm=el.closest(".moveform"),q=S.byUid.get(fm.dataset.u);if(q)fm.innerHTML=moveStep1(q);break;}
    case "mvgo":{const fm=el.closest(".moveform");await doMove(fm.dataset.u,el.dataset.s,v);break;}
    case "mvgonew":{const fm=el.closest(".moveform");await doMove(fm.dataset.u,el.dataset.s,fm.querySelector(".mvnew").value);break;}
    case "pick":doPick(v);break;
    case "markreview":markForReview();break;
    case "reviewmarked":goToMarked();break;
    case "skip":doSkip();break;
    case "check":doCheck();break;
    case "savenext":{const Q=S.quiz;if(!Q||Q.done)break;const u=Q.uids[Q.i];if(!Q.ans[u])Q.skp[u]=1;if(Q.i<Q.uids.length-1)goTo(Q.i+1);else{render();toast(Q.ans[u]?"Answer saved":"Marked as skipped");}break;}
    case "theme":{S.theme=S.theme==="light"?"dark":"light";try{localStorage.setItem("rd_theme",S.theme);}catch(err){}render();break;}
    case "space":{if(!Object.hasOwn(SPACES,v))break;resetPracticeSpace(v);render();window.scrollTo(0,0);break;}
    case "idmode":S.imp.idMode=v;runParse();break;
    case "newmode":S.newMode=v;render();break;
    case "next":if(S.quiz)goTo(S.quiz.i+1);break;
    case "prev":if(S.quiz)goTo(S.quiz.i-1);break;
    case "goto":goTo(Number(v));break;
    case "finish":if(S.quiz&&!S.quiz.done){S.confirmFin=true;render();}break;
    case "finishok":S.confirmFin=false;finishQuiz();break;
    case "finishno":S.confirmFin=false;render();break;
    case "bm":{const q=S.byUid.get(v);if(!q)break;const p=getP(v);p.b=p.b?0:1;queueSave(q.packId);render();break;}
    case "exit":{const Q0=S.quiz;if(Q0&&!Q0.done){S.confirmExit=true;render();break;}S.confirmExit=false;flushInBackground();S.quiz=null;S.tab="practice";S.view="home";render();window.scrollTo(0,0);break;}
    case "exitno":ROUTES.pending=null;S.confirmExit=false;render();break;
    case "exitok":{S.confirmExit=false;flushInBackground();S.quiz=null;S.tab="practice";S.view="home";const pending=ROUTES.pending;ROUTES.pending=null;if(pending)goToRoute(pending);else{render();window.scrollTo(0,0);}break;}
    case "exit_unused":S.quiz=null;S.tab="practice";S.view="home";render();window.scrollTo(0,0);break;
    case "redo":{const Q=S.quiz;startQuiz(shuffle(Q.uids.filter(u=>!Q.res[u].ok)),{mode:Q.mode,kind:"Redo",label:Q.label});break;}
    case "nbsub":S.nb.subject=v||"";render();window.scrollTo(0,0);break;
    case "heatby":S.heatBy=v;render();break;
    case "mon":{const o=tgt();if(!o.months)o.months=new Set();o.months.has(v)?o.months.delete(v):o.months.add(v);render();break;}
    case "yrsel":{const o=tgt();if(!o.months)o.months=new Set();const mm=[...new Set(S.qs.map(q=>q.mo).filter(m=>m&&m.startsWith(v)))];const all=mm.every(m=>o.months.has(m));mm.forEach(m=>all?o.months.delete(m):o.months.add(m));render();break;}
    case "mchg":S.editMonth=v;render();break;
    case "mno":S.editMonth=null;render();break;
    case "msave":{const x=document.getElementById("mchgin"),p=S.packs.find(z=>z.id===v);if(!x||!p||!okMonth(x.value)){toast("Pick a valid month and year");break;}
      const context=bankContext(),month=x.value,old=p.chunks||1,updated={...p,questions:p.questions.map(q=>({...q,mo:month}))};
      await enqueue(()=>S.store.savePack(updated,old));assertBank(context);S.packs=S.packs.map(z=>z===p?updated:z);S.editMonth=null;rebuild();render();toast("Month set to "+monthLabel(month));break;}
    case "heatall":S.heatAll=!S.heatAll;render();break;
    case "heat":{const s=el.dataset.s,t=el.dataset.t;sel.subjects=new Set([s]);sel.topics=t?new Set([topicKey(s,t)]):new Set();sel.which="prio";sel.pack="all";S.quiz=null;S.tab="practice";S.view="wiz";S.step=2;render();window.scrollTo(0,0);break;}
    case "copymd":{const md=mdFor(openMistakes());try{await navigator.clipboard.writeText(md);S.mdText="";toast("Mistakes copied as markdown");}catch(err){S.mdText=md;render();toast("Select the text and copy it");}break;}
    case "downloadtpl":saveFile("csat-source-exam-example.json",importTemplate());break;
    case "copytpl":try{await navigator.clipboard.writeText(importTemplate());toast("Format copied");}catch(err){toast("Select the format text and copy it");}break;
    case "dup":{const d=S.imp.dups[Number(el.dataset.i)];if(d){d.choice=v;render();}break;}
    case "impadd":await applyImport(false);break;
    case "impattempt":await applyImport(true);break;
    case "home":DASH.open=false;flushInBackground();S.quiz=null;S.tab="practice";S.view="home";render();window.scrollTo(0,0);break;
    case "review":S.quiz.rv=0;render();window.scrollTo(0,0);break;
    case "rgoto":S.quiz.rv=Number(v);render();window.scrollTo(0,0);break;
    case "rprev":if(S.quiz.rv>0){S.quiz.rv--;render();window.scrollTo(0,0);}break;
    case "rnext":if(S.quiz.rv<S.quiz.uids.length-1){S.quiz.rv++;render();window.scrollTo(0,0);}break;
    case "rback":S.quiz.rv=null;render();window.scrollTo(0,0);break;
    case "zoom":{let lb=document.getElementById("lb");if(!lb){lb=document.createElement("div");lb.id="lb";lb.addEventListener("click",()=>lb.classList.remove("on"));document.body.appendChild(lb);}lb.innerHTML=`<img src="${esc(v)}" alt="">`;lb.classList.add("on");break;}
    case "bkdl":{const ok=saveFile("recall-desk-backup-"+new Date().toISOString().slice(0,10)+".json",buildBackup());toast(ok?"Backup downloaded":"Download blocked here. Use Copy backup.");break;}
    case "bkcopy":try{await navigator.clipboard.writeText(buildBackup());toast("Backup copied. Paste it into a text file.");}catch(err){toast("Could not copy. Try Download backup.");}break;
    case "andl":{const ok=saveFile("recall-desk-analysis-"+new Date().toISOString().slice(0,10)+".csv",buildAnalysis(),"text/csv");toast(ok?"Analysis file downloaded":"Download blocked here. Use Copy for analysis.");break;}
    case "ancopy":try{await navigator.clipboard.writeText(buildAnalysis());toast("Copied. Paste it into the chat.");}catch(err){toast("Could not copy. Try Download analysis file.");}break;
    case "bkrestore":await restoreBackup();break;
    case "authmode":authVals();S.authMode=v;S.authMsg=null;render();break;
    case "authgo":await authGo();break;
    case "magic":await authMagic();break;
    case "google":{const r=await S.sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:authBack()}});if(r.error){S.authMsg={text:r.error.message,bad:1};render();}break;}
    case "signout":{const context=bankContext();saveQuizSession();await flush();await chain;assertBank(context);await S.sb.auth.signOut();break;}
    case "del":S.confirmDel=v;render();{const x=document.getElementById("delin");if(x)x.focus();}break;
    case "delno":S.confirmDel=null;render();break;
    case "delgo":{
      const x=document.getElementById("delin");if(!x||x.value.trim().toLowerCase()!=="delete")break;
      const p=S.packs.find(z=>z.id===v);if(!p)break;const context=bankContext();await flush();assertBank(context);
      await enqueue(()=>S.store.deletePack(p));assertBank(context);S.confirmDel=null;
      S.packs=S.packs.filter(z=>z.id!==v);for(const k of Object.keys(S.prog))if(k.startsWith(v+":"))delete S.prog[k];
      rebuild();render();toast("\""+p.title+"\" deleted");break;}
  }
  }catch(err){toast("Action could not finish: "+((err&&err.message)||"unknown error")+". Please try again.");}
});
document.addEventListener("input",e=>{if(!e.target)return;if(e.target.id==="reasoning"){const Q=S.quiz;if(Q&&!Q.done&&(Q.mode==="exam"||!Q.res[Q.uids[Q.i]]||Q.res[Q.uids[Q.i]].skipped))Q.rn[Q.uids[Q.i]]=e.target.value.slice(0,2000);return;}if(e.target.id==="impname")S.imp.name=e.target.value;else if(e.target.id==="impmonth")S.imp.month=e.target.value;else if(e.target.id==="impyear")S.imp.year=e.target.value;});
document.addEventListener("change",e=>{
  const d=e.target&&e.target.dataset&&e.target.dataset.change;
  if(d==="pack"){S.sel.pack=e.target.value;render();}
  else if(d==="custom"){tgt().custom=Math.max(1,Math.min(200,parseInt(e.target.value,10)||1));render();}
});
document.addEventListener("keydown",e=>{
  if(document.getElementById("ui-navigation-menu")?.open)return;
  if(document.getElementById("quote-dialog")?.open||document.getElementById("swot-topic-dialog")?.open)return;
  if(["radar-score","test-point"].includes(e.target?.dataset?.dashAct)){if(e.key==="Enter"||e.key===" ")e.preventDefault();return;}
  if(DASH.open&&S.ready&&["none","ok"].includes(S.auth))return;
  if((e.key==="Enter"||e.key===" ")&&["markreview","reviewmarked"].includes(e.target?.dataset?.act))return;
  if(S.auth==="login"&&e.key==="Enter"&&e.target&&e.target.tagName==="INPUT"){authGo();e.preventDefault();return;}
  const Q=S.quiz;
  if(!Q&&S.tab==="practice"&&S.view==="tr"&&S.tr){
    const t0=(e.target&&e.target.tagName)||"";if(t0==="TEXTAREA"||t0==="INPUT"||t0==="SELECT")return;
    const n=trList().list.length;
    if(e.key==="ArrowLeft"&&(S.tr.i||0)>0){S.tr.i--;render();window.scrollTo(0,0);e.preventDefault();}
    else if(e.key==="ArrowRight"&&(S.tr.i||0)<n-1){S.tr.i=(S.tr.i||0)+1;render();window.scrollTo(0,0);e.preventDefault();}
    return;
  }
  if(Q&&Q.done&&Q.rv!=null&&S.tab==="practice"){
    const t=(e.target&&e.target.tagName)||"";if(t==="TEXTAREA"||t==="INPUT"||t==="SELECT")return;
    if(e.key==="ArrowLeft"&&Q.rv>0){Q.rv--;render();e.preventDefault();}
    else if(e.key==="ArrowRight"&&Q.rv<Q.uids.length-1){Q.rv++;render();e.preventDefault();}
    return;
  }
  if(!Q||Q.done||S.tab!=="practice")return;
  if(S.confirmFin){if(e.key==="Escape"){S.confirmFin=false;render();}return;}
  if(S.confirmExit){if(e.key==="Escape"){ROUTES.pending=null;S.confirmExit=false;render();}return;}
  const tag=(e.target&&e.target.tagName)||"";if(["TEXTAREA","INPUT","SELECT","BUTTON","A"].includes(tag)||e.target?.isContentEditable||e.metaKey||e.ctrlKey||e.altKey)return;
  const q=S.byUid.get(Q.uids[Q.i]),k=e.key.toUpperCase(),r=Q.res[Q.uids[Q.i]],locked=Q.mode!=="exam"&&r&&!r.skipped;
  let L=null;if(/^[A-F]$/.test(k))L=k;else if(/^[1-6]$/.test(k))L="ABCDEF"[Number(k)-1];
  if(L&&q.options[L]&&!locked){doPick(L);e.preventDefault();return;}
  if(k==="S"&&(Q.mode==="exam"||!r)){doSkip();e.preventDefault();return;}
  if(e.key==="ArrowLeft"){goTo(Q.i-1);e.preventDefault();return;}
  if(e.key==="Enter"&&Q.mode!=="exam"&&(!r||r.skipped)&&Q.sel[Q.uids[Q.i]]){doCheck();e.preventDefault();return;}
  if(e.key==="ArrowRight"||(e.key==="Enter"&&(Q.mode==="exam"||(r&&!r.skipped)))){if(Q.i<Q.uids.length-1)goTo(Q.i+1);e.preventDefault();}
});

/* ---------- boot ---------- */
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>rej(new Error("Could not load "+src));document.head.appendChild(s);});}
async function openBank(store,mode){
  saveQuizSession();S.quiz=null;
  const generation=++bankGeneration;clearTimeout(saveTimer);saveSet=new Set();resetProgressSession();
  S.store=null;S.storage=mode;S.ready=false;S.bankError="";S.bankRetry={store,mode};render();
  try{
    const d=await store.load();if(generation!==bankGeneration)return;
    S.packs=d.packs.map(canonicalPack);rebuild();applyProg(d.prog);S.store=store;
    await loadProgressSession(store,d.prog);if(generation!==bankGeneration)return;
    S.ready=true;S.bankRetry=null;
    const quotesReady=loadStoredQuotes(store,mode),testsReady=loadTestHistory(store,mode);render();await Promise.all([quotesReady,testsReady]);
    if(generation!==bankGeneration)return;
    loadQuizSessions();
    if(PROGRESS.ops.size)flushInBackground();
  }catch(e){
    if(generation!==bankGeneration)return;
    S.bankError="Could not load your "+(mode==="cloud"||mode==="account"?"account":"browser")+" data: "+((e&&e.message)||"unknown error");
  }
  render();
}
async function startCloud(user){
  if(S.user?.id!==user.id)resetData();
  S.user=user;S.auth="ok";S.authMsg=null;S.ready=false;render();
  await openBank(supaBackend(S.sb,user.id),"cloud");
}
document.addEventListener("click",event=>{
  const control=event.target.closest("[data-ui-menu]");
  if(!control)return;
  const action=control.dataset.uiMenu;
  if(action==="open")openUiMenu();
  else if(action==="close"||action==="select")document.getElementById("ui-navigation-menu")?.close();
  else if(action==="theme"){
    drawUiMenu();uiMenuExpanded(true);
    document.getElementById("ui-menu-theme").focus();
  }
});

document.addEventListener("click",event=>{
  const link=event.target.closest("a[data-route]");
  if(!link||link.dataset?.route===undefined||event.defaultPrevented||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();requestPageRoute(parsePageRoute(link.getAttribute("href")));
});

/* ---------- Learning dashboard ---------- */
const DASH={testLength:50,testSubject:"",open:true,scope:"mixed",mode:"first",band:"all",source:"",query:"",heatBy:"topic",detail:null,showQuestions:false,expanded:{},heatLimits:{},heatOpen:{},topicTrigger:null,insightsOpen:false};
const DASH_BANDS={strength:{label:"Strengths",rule:"Above 70%",hint:"Keep these warm with light revision",colour:"#61d9a0"},opportunity:{label:"Opportunities",rule:"60–70%",hint:"A little practice can make these strengths",colour:"#86aaff"},weakness:{label:"Weaknesses",rule:"30–59%",hint:"Revisit concepts, then practise",colour:"#efc65d"},threat:{label:"Threats",rule:"Below 30%",hint:"Give these topics focused attention",colour:"#ff7d86"}};
const DASH_MIN=5;
const dashModeName=()=>({first:"First attempt",latest:"Latest answer",repeat:"Repeat practice"}[DASH.mode]);
const dashPc=(ok,n)=>n?Math.round(ok/n*100):null;
const dashPercent=value=>value===null?"—":value+"%";
const dashShort=name=>({"Polity and Governance":"Polity","Modern Indian History":"History","Environment and Ecology":"Environment","Quantitative Aptitude":"Numeracy","Logical Reasoning":"Reasoning","Reading Comprehension":"Comprehension"}[canonicalSubject(name)]||canonicalSubject(name));
function dashMenuItem(){return `<a class="ui-menu-item swot-menu-item" href="#/dashboard" data-route data-ui-menu="select"${DASH.open?' aria-current="page"':""}><span class="ui-menu-icon">${ic("heat")}</span><span class="ui-menu-copy"><strong>Dashboard</strong><small>Your SWOT, subject profile &amp; heatmap</small></span>${DASH.open?'<span class="ui-menu-current">Current</span>':UI_ARROW}</a>`;}
function dashQuestions(scope=DASH.scope,source=DASH.source){
  const out=[];
  for(const p of S.packs){
    const space=packSpace(p.id);if(scope!=="mixed"&&space!==scope)continue;
    for(const q of p.questions){
      if(scope==="csat"&&source&&(source==="untagged"?!!questionSourceExam(q):questionSourceExam(q)!==source))continue;
      out.push({...q,subject:canonicalSubject(q.subject),topic:questionTopic(q,space),uid:p.id+":"+q.no,packId:p.id,space,src:q.src||[],qimg:q.qimg||[],simg:q.simg||[],exp:q.exp||"",sum:q.sum||"",year:q.year||"",source_exam:questionSourceExam(q)});
    }
  }
  return out;
}
function dashOutcome(q,mode=DASH.mode){
  const p=S.prog[q.uid]||{};
  if(mode==="first")return p.first?{n:p.first.skipped?0:1,ok:!p.first.skipped&&p.first.ok?1:0,sk:p.first.skipped?1:0}:{n:0,ok:0,sk:0};
  if(mode==="repeat")return {n:p.repeat?.a||0,ok:p.repeat?.c||0,sk:p.repeat?.sk||0};
  return {n:p.a>0&&["c","w"].includes(p.l)?1:0,ok:p.a>0&&p.l==="c"?1:0,sk:!p.a&&p.sk?1:0};
}
function dashStats(qs,mode=DASH.mode){
  const a={bank:qs.length,n:0,ok:0,sk:0,observed:0,answered:0,unknown:0,mistakes:0,due:0,done:0,sure:0,sureOk:0,confWrong:0,repeated:0,uncertain:0,nearClear:0,time:0,timed:0,last:0,reasons:{}};
  const today=dayKey();
  for(const q of qs){
    const p=S.prog[q.uid]||{},o=dashOutcome(q,mode);a.n+=o.n;a.ok+=o.ok;a.sk+=o.sk;if(o.n)a.observed++;
    if(p.a>0)a.answered++;if(!p.first&&(p.a||p.sk))a.unknown++;
    if(p.m)a.mistakes++;if(p.dr===today)a.done++;
    const due=dueDay(p);if(due&&due<=today&&p.dr!==today&&(!p.t||dayKey(p.t)!==today))a.due++;
    if(p.a&&p.cf==="s"){a.sure++;if(p.l==="c")a.sureOk++;else if(p.l==="w")a.confWrong++;}
    if(p.m&&p.w>=2)a.repeated++;if(p.l==="c"&&["g","h"].includes(p.cf))a.uncertain++;
    if(p.m&&(p.cd||[]).length===CLEAR_DAYS-1)a.nearClear++;
    if(p.tn>0){a.time+=p.ts||0;a.timed+=p.tn;}a.last=Math.max(a.last,p.t||0);
    if(p.wy&&p.w>0)a.reasons[p.wy]=(a.reasons[p.wy]||0)+1;
  }
  a.pct=dashPc(a.ok,a.n);a.coverage=dashPc(a.answered,a.bank);a.surePct=dashPc(a.sureOk,a.sure);a.avgTime=a.timed?Math.round(a.time/a.timed):null;
  a.band=a.n===0?(mode==="first"&&a.unknown?"unrecorded":"new"):a.observed<DASH_MIN?"limited":a.pct>70?"strength":a.pct>=60?"opportunity":a.pct>=30?"weakness":"threat";
  return a;
}
function dashRows(qs=dashQuestions(),mode=DASH.mode,by=DASH.heatBy){
  const groups=new Map();
  for(const q of qs){const topic=by==="subject"?"":q.topic,key=JSON.stringify([q.space,q.subject,topic]);if(!groups.has(key))groups.set(key,{id:key,space:q.space,subject:q.subject,topic,label:topic||q.subject,qs:[]});groups.get(key).qs.push(q);}
  return [...groups.values()].map(row=>({...row,stats:dashStats(row.qs,mode)}));
}
function dashSubjectRows(qs){
  const groups=new Map();for(const q of qs){if(!groups.has(q.subject))groups.set(q.subject,[]);groups.get(q.subject).push(q);}
  return [...groups].map(([name,items])=>({name,stats:dashStats(items)})).sort((a,b)=>b.stats.n-a.stats.n||a.name.localeCompare(b.name));
}
function dashEvidence(a){return a.n?`${a.ok}/${a.n} correct · ${a.observed} distinct questions`:a.band==="unrecorded"?"First-attempt history unavailable":a.answered?"No answers in this practice mode":"Not answered yet";}
function dashPill(a){return a.band==="limited"?'<span class="swot-evidence">Limited data</span>':a.band==="unrecorded"?'<span class="swot-evidence">History unavailable</span>':a.band==="new"?'<span class="swot-evidence">No result yet</span>':"";}
function dashFilteredRows(rows){const query=DASH.query.trim().toLowerCase();return rows.filter(r=>(DASH.band==="all"||r.stats.band===DASH.band)&&(!query||(r.label+" "+r.subject+" "+SPACES[r.space].label).toLowerCase().includes(query)));}
function dashRadarPoint(subject,x,y){
  const a=subject.stats,label=`${subject.name}: ${dashPercent(a.pct)} ${dashModeName().toLowerCase()} accuracy. ${dashEvidence(a)}${a.observed<DASH_MIN?'. Limited data':''}`;
  return `<g class="swot-radar-target" tabindex="0" role="button" aria-label="${esc(label)}" data-dash-act="radar-score"><circle cx="${x}" cy="${y}" r="14" class="swot-radar-hit"/><circle cx="${x}" cy="${y}" r="4.5" class="swot-radar-point"/><g class="swot-radar-tooltip" aria-hidden="true"><rect x="18" y="4" width="424" height="79" rx="10"/><text x="32" y="27" class="swot-tooltip-title">${esc(dashShort(subject.name))} · ${dashPercent(a.pct)}</text><text x="32" y="48">${dashModeName()} · ${a.ok}/${a.n} correct</text><text x="32" y="68">${a.observed} distinct questions${a.observed<DASH_MIN?' · Limited data':''}</text></g></g>`;
}
function dashRadar(subjects){
  const axes=subjects.filter(s=>s.stats.n>0).slice(0,8),cx=230,cy=186,r=118;
  if(axes.length<3)return `<div class="swot-radar-empty">${ic("heat")}<p>Answer questions in three subjects to build your profile.</p><span class="hint">Available subject values are listed below.</span></div>`;
  const xy=(i,v,extra=0)=>{const t=-Math.PI/2+i*Math.PI*2/axes.length;return [cx+(r*v/100+extra)*Math.cos(t),cy+(r*v/100+extra)*Math.sin(t)];};
  const points=v=>axes.map((s,i)=>xy(i,typeof v==="number"?v:s.stats.pct).map(x=>x.toFixed(1)).join(",")).join(" ");
  const labels=axes.map((s,i)=>{const [x,y]=xy(i,100,29),name=dashShort(s.name),words=name.split(" "),lines=name.length>18?[words.slice(0,Math.ceil(words.length/2)).join(" "),words.slice(Math.ceil(words.length/2)).join(" ")]:[name];return `<text x="${x}" y="${y}" text-anchor="${Math.abs(x-cx)<20?"middle":x>cx?"start":"end"}">${lines.map((line,j)=>`<tspan x="${x}" dy="${j?18:0}">${esc(line)}</tspan>`).join("")}</text>`;}).join("");
  return `<svg class="swot-radar" viewBox="0 0 460 375" role="group" aria-labelledby="swot-radar-title swot-radar-desc"><title id="swot-radar-title">Your subject accuracy</title><desc id="swot-radar-desc">One series showing your ${dashModeName().toLowerCase()} accuracy. ${axes.map(s=>s.name+": "+s.stats.pct+" percent, "+s.stats.observed+" distinct questions").join(". ")}. Full values are listed below.</desc>${[20,40,60,80,100].map(v=>`<polygon class="swot-radar-grid" points="${points(v)}"/>`).join("")}${axes.map((s,i)=>{const [x,y]=xy(i,100);return `<path class="swot-radar-grid" d="M${cx},${cy} L${x},${y}"/>`;}).join("")}${[20,40,60,80,100].map(v=>`<text class="swot-radar-tick" x="${cx+7}" y="${cy-r*v/100-3}">${v}</text>`).join("")}<polygon class="swot-radar-you" points="${points(null)}"/>${labels}${axes.map((s,i)=>{const [x,y]=xy(i,s.stats.pct);return dashRadarPoint(s,x,y);}).join("")}</svg><div class="swot-chart-legend"><i></i> You <span>· ${dashModeName()}</span></div>${subjects.filter(s=>s.stats.n>0).length>8?'<p class="hint">Eight most-practised subjects shown. All subjects are listed below.</p>':""}`;
}
function dashTile(row){const a=row.stats;return `<button class="swot-heat-tile ${a.band}${DASH.detail===row.id?" selected":""}" data-dash-act="detail" data-key="${esc(row.id)}" aria-label="${esc(SPACES[row.space].label+", "+row.subject+", "+row.label+", "+dashPercent(a.pct)+", "+dashEvidence(a))}">${DASH.scope==="mixed"?`<span class="swot-tile-space">${SPACES[row.space].label}</span>`:""}<span class="swot-tile-label">${esc(row.label)}</span><strong>${dashPercent(a.pct)}</strong><span class="swot-tile-count">${esc(dashEvidence(a))}</span>${dashPill(a)}${a.confWrong?`<span class="swot-tile-alert">${a.confWrong} sure but wrong</span>`:""}</button>`;}
function dashHeatGroup(subject,items,index){
  const key=JSON.stringify([DASH.scope,DASH.source,DASH.heatBy,subject]),limit=DASH.heatLimits[key]||12;
  const open=DASH.query||DASH.band!=="all"||(DASH.heatOpen[key]??(DASH.scope!=="mixed"||index===0));
  return `<details class="swot-heat-group" data-dash-group="${esc(key)}" ${open?"open":""}><summary><span><strong>${esc(subject)}</strong><small>${items.length} ${DASH.heatBy==="topic"?"topic":"section"}${items.length===1?"":"s"}</small></span><b>${dashPercent(dashStats(items.flatMap(r=>r.qs)).pct)}</b></summary><div class="swot-heat-tiles">${items.slice(0,limit).map(dashTile).join("")}</div>${items.length>limit?`<div class="swot-heat-more"><span>Showing ${limit} of ${items.length}</span><button class="btn sm" data-dash-act="more-topics" data-key="${esc(key)}">Show next ${Math.min(12,items.length-limit)} topics</button></div>`:""}</details>`;
}
function dashHeatmap(rows){
  const filtered=dashFilteredRows(rows),groups=new Map();for(const row of filtered){if(!groups.has(row.subject))groups.set(row.subject,[]);groups.get(row.subject).push(row);}
  return `<section class="swot-panel swot-heatmap" id="swot-heatmap" aria-labelledby="swot-heatmap-title"><div class="swot-panel-heading"><div><h2 id="swot-heatmap-title">Your learning heatmap</h2><p>Choose a tile to understand it and plan your next session.</p></div><div class="seg swot-small-seg">${["topic","subject"].map(by=>`<button data-dash-act="heatby" data-value="${by}" aria-pressed="${DASH.heatBy===by}">By ${by}</button>`).join("")}</div></div><form class="swot-search" id="swot-search-form"><label class="sr-only" for="swot-topic-search">Find a subject or topic</label><input id="swot-topic-search" class="txt" type="search" value="${esc(DASH.query)}" placeholder="Find a subject or topic…"><button class="btn sm" type="submit">Find</button></form><div class="swot-heat-legend">${Object.entries(DASH_BANDS).map(([k,b])=>`<span><i class="${k}"></i>${b.label}</span>`).join("")}<span><i class="new"></i>No result / limited data</span></div>${DASH.band!=="all"?`<div class="swot-filter-note">Showing ${esc(DASH_BANDS[DASH.band]?.label||DASH.band)} <button class="linkbtn" data-dash-act="band" data-value="all">Show all</button></div>`:""}<div class="swot-heat-groups">${[...groups].map(([subject,items],i)=>dashHeatGroup(subject,items,i)).join("")||'<div class="swot-empty"><p>No topics match these filters.</p><button class="btn sm" data-dash-act="clear">Clear filters</button></div>'}</div><p class="swot-panel-foot">Bands require at least ${DASH_MIN} distinct answered questions. Smaller samples stay provisional; unanswered topics have no percentage.</p></section>`;
}
function dashTopicDetail(rows){
  const row=rows.find(r=>r.id===DASH.detail)||dashRows(dashQuestions(),DASH.mode,"topic").find(r=>r.id===DASH.detail);if(!row)return "";const a=row.stats;
  return `<section class="swot-panel swot-focus" aria-labelledby="swot-focus-title"><div class="swot-panel-heading"><div><span class="ui-overline">Topic focus · ${SPACES[row.space].label}</span><h2 id="swot-focus-title">${esc(row.label)}</h2><p>${esc(row.subject)} · ${esc(dashEvidence(a))}</p></div><button class="btn sm" data-dash-act="close-detail">Close</button></div><div class="swot-focus-stats"><span><strong>${dashPercent(a.pct)}</strong>${dashModeName()} accuracy</span><span><strong>${a.mistakes}</strong>Open mistakes</span><span><strong>${a.due}</strong>Due for review</span><span><strong>${a.confWrong}</strong>Sure but wrong</span></div><div class="row"><button class="btn pri" data-dash-act="practice" data-key="${esc(row.id)}">Practise this ${row.topic?"topic":"subject"} ${UI_ARROW}</button><button class="btn" data-dash-act="review-topic">${DASH.showQuestions?"Hide":"Review"} these questions</button>${dashPill(a)}</div>${DASH.showQuestions?`<div class="swot-review-list">${row.qs.map(q=>{const p=S.prog[q.uid]||{};return qCard(q,SPACES[q.space].label,p.x||"",p.a?(p.l==="c"?"ok":"bad"):p.sk?"skip":"");}).join("")}</div>`:""}</section>`;
}
function dashTopicDialog(){
  let dialog=document.getElementById("swot-topic-dialog");
  if(dialog)return dialog;
  dialog=document.createElement("dialog");dialog.id="swot-topic-dialog";dialog.className="swot-topic-dialog";dialog.setAttribute("aria-labelledby","swot-focus-title");
  dialog.addEventListener("close",()=>{
    DASH.detail=null;DASH.showQuestions=false;document.body.classList.remove("swot-topic-open");
    const trigger=DASH.topicTrigger;DASH.topicTrigger=null;if(trigger?.isConnected)trigger.focus({preventScroll:true});
  });
  dialog.addEventListener("click",event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  document.body.appendChild(dialog);return dialog;
}
function openDashTopic(key,trigger){
  DASH.detail=key;DASH.showQuestions=false;DASH.topicTrigger=trigger;
  const dialog=dashTopicDialog();dialog.innerHTML=dashTopicDetail(dashRows());
  document.body.classList.add("swot-topic-open");if(!dialog.open)dialog.showModal();
  dialog.scrollTop=0;
}
function dashNextActions(rows){
  const picked=[],used=new Set();const add=(row,title,reason)=>{if(row&&!used.has(row.id)){picked.push({row,title,reason});used.add(row.id);}};
  const risk=[...rows].sort((a,b)=>(b.stats.confWrong*5+b.stats.repeated*3+b.stats.due*2)-(a.stats.confWrong*5+a.stats.repeated*3+a.stats.due*2));
  const highest=risk.find(r=>r.stats.confWrong||r.stats.repeated||r.stats.due);
  add(highest,"Revisit a priority topic",highest?`${highest.stats.confWrong} confident errors · ${highest.stats.due} due reviews`:"");
  const opportunity=rows.filter(r=>r.stats.band==="opportunity").sort((a,b)=>b.stats.pct-a.stats.pct).find(r=>!used.has(r.id));
  add(opportunity,"Build on a near-strength",opportunity?`${opportunity.stats.pct}% accuracy across ${opportunity.stats.observed} questions`:"");
  const fresh=rows.find(r=>r.stats.band==="new"&&!used.has(r.id));add(fresh,"Explore an untouched topic",fresh?`${fresh.stats.bank} questions waiting`:"");
  for(const row of risk)if(picked.length<3&&!used.has(row.id))add(row,"Choose a focused session",row.stats.n?`${dashEvidence(row.stats)}`:`${row.stats.bank} questions in your bank`);
  return `<section class="swot-next" aria-labelledby="swot-next-title"><div class="ui-section-title"><h2 id="swot-next-title">Your next three moves</h2><span>Small sessions. Clear priorities.</span></div><div class="swot-action-grid">${picked.map((item,i)=>`<button class="swot-action" data-dash-act="detail" data-key="${esc(item.row.id)}"><span class="swot-action-index">0${i+1}</span><span><small>${item.title}</small><strong>${esc(item.row.label)}</strong><span>${esc(item.reason)} · ${SPACES[item.row.space].label}</span></span>${UI_ARROW}</button>`).join("")||'<p class="muted">Add a question set to start building your study priorities.</p>'}</div></section>`;
}
function dashExtraPanels(qs,rows,a){
  const stale=rows.filter(r=>r.stats.last&&Math.floor((Date.now()-r.stats.last)/86400000)>=30).sort((x,y)=>x.stats.last-y.stats.last).slice(0,5);
  const types=[["factual","Factual"],["conceptual","Conceptual"],["analytical","Analytical"],["application","Application"]],tagged=qs.filter(q=>types.some(([type])=>type===q.question_type));
  return `<div class="swot-bottom-grid"><section class="swot-panel"><h2>How you approach questions</h2><p class="swot-subtitle">Your accuracy by explicitly tagged question type.</p><div class="swot-type-rows">${types.map(([type,label])=>{const stats=dashStats(qs.filter(q=>q.question_type===type));return `<div><span>${label}<small>${stats.observed} distinct answered questions</small></span><i><b style="width:${stats.pct||0}%"></b></i><strong>${dashPercent(stats.pct)}</strong></div>`;}).join("")}</div><p class="swot-panel-foot">${qs.length-tagged.length} questions have no question_type tag. Types are not inferred from their text; source exams and current-affairs labels are kept separate.</p></section><section class="swot-panel"><h2>Not practised recently</h2><p class="swot-subtitle">Topics last touched 30+ days ago.</p><div class="swot-stale-list">${stale.map(row=>`<button data-dash-act="detail" data-key="${esc(row.id)}"><span><strong>${esc(row.label)}</strong><small>${esc(row.subject)} · ${dashPercent(row.stats.pct)} ${dashModeName().toLowerCase()}</small></span><b>${Math.floor((Date.now()-row.stats.last)/86400000)} days</b></button>`).join("")||'<p class="swot-empty-note">No previously practised topics are overdue by 30 days.</p>'}</div><p class="swot-panel-foot">${rows.filter(r=>!r.stats.last).length} topics have never been practised; they stay separate from this list.</p></section></div><section class="swot-panel swot-risk-panel"><div><h2>Signals worth a second look</h2><p>These current-state alerts can occur in any accuracy band.</p></div><div class="swot-risk-counts"><span><strong>${a.confWrong}</strong>Sure but wrong</span><span><strong>${a.repeated}</strong>Repeated mistakes still open</span><span><strong>${a.uncertain}</strong>Correct guesses / 50–50</span><span><strong>${a.nearClear}</strong>One confident revision day from clearing</span></div></section>`;
}
function dashMixedTable(){
  if(DASH.scope!=="mixed")return "";
  return `<section class="swot-panel"><div class="swot-panel-heading"><div><h2>Your section balance</h2><p>Compare your own question banks using the same accuracy basis.</p></div></div><div class="swot-comparison-wrap"><table class="swot-comparison"><thead><tr><th>Section</th><th>${dashModeName()} accuracy</th><th>Bank coverage</th><th>Open mistakes</th><th>Reviews due</th></tr></thead><tbody>${Object.entries(SPACES).map(([key,space])=>{const a=dashStats(dashQuestions(key,""));return `<tr><th><button class="linkbtn" data-dash-act="scope" data-value="${key}">${space.label}</button></th><td><strong>${dashPercent(a.pct)}</strong><small>${a.ok}/${a.n} correct</small></td><td>${dashPercent(a.coverage)}<small>${a.answered}/${a.bank} answered</small></td><td>${a.mistakes}</td><td>${a.due}</td></tr>`;}).join("")}</tbody></table></div><p class="swot-panel-foot">Mixed counts each question within its own bank. Imports repeated across sections remain separate; raw exam marks are not combined.</p></section>`;
}
/* Completed tests are append-only snapshots, separate from per-question progress. */
const TEST_HISTORY_KEY=LOCAL_PREVIEW?"solo-test-history-preview-v1":"solo-test-history-v1";
const TEST_HISTORY={owner:"",rows:[],pending:new Set(),state:"idle",error:"",generation:0,store:null,remote:false,loaded:false,chain:Promise.resolve()};
const testMarks=(correct,incorrect)=>roundMarks(correct*MARKING.static.right-incorrect*MARKING.static.wrong);
const testDate=(t,full=false)=>Number.isFinite(t)&&t>0?new Date(t).toLocaleDateString("en-IN",{day:"numeric",month:"short",...(full?{year:"numeric"}:{})}):"Date unavailable";
function normalizeTestResult(row){
  if(!row||row.demo||typeof row.id!=="string"||!row.id||row.id.length>200||![50,100].includes(row.total)||!Object.hasOwn(SPACES,row.space)||!Number.isFinite(row.date)||!Number.isFinite(new Date(row.date).getTime())||!["exam","practice"].includes(row.mode)||![row.correct,row.incorrect,row.skipped].every(n=>Number.isInteger(n)&&n>=0)||row.correct+row.incorrect+row.skipped!==row.total||row.marks!==testMarks(row.correct,row.incorrect)||row.maxMarks!==row.total*2)return null;
  const result={id:row.id,date:row.date,total:row.total,space:row.space,mode:row.mode,correct:row.correct,incorrect:row.incorrect,skipped:row.skipped,marks:row.marks,maxMarks:row.maxMarks,sourceExam:["CSE","CAPF","mixed"].includes(row.sourceExam)?row.sourceExam:"",label:String(row.label||"Completed test").slice(0,120)};
  if(typeof row.paperId==="string"&&row.paperId&&row.paperId.length<=200)result.paperId=row.paperId;
  if(row.bySubject&&typeof row.bySubject==="object"&&!Array.isArray(row.bySubject)){
    const parts=Object.entries(row.bySubject);
    if(parts.length&&parts.every(([name,a])=>name&&validTestSubject(a,row.total))&&["total","correct","incorrect","skipped"].every(key=>parts.reduce((n,[,a])=>n+a[key],0)===row[key]))result.bySubject=Object.fromEntries(parts.map(([name,a])=>[name,{total:a.total,correct:a.correct,incorrect:a.incorrect,skipped:a.skipped,marks:a.marks,maxMarks:a.maxMarks}]));
  }
  return result;
}
function normalizeTestHistory(rows){
  const unique=new Map();
  if(Array.isArray(rows))for(const row of rows){const value=normalizeTestResult(row);if(value&&!unique.has(value.id))unique.set(value.id,value);}
  return [...unique.values()].sort((a,b)=>a.date-b.date||a.id.localeCompare(b.id));
}
function readTestHistory(){return TEST_HISTORY.rows;}
function testHistoryOwner(store=S.store){return store?.historyOwner||store?.quoteOwner||"browser";}
function cacheTestHistory(){
  if(!TEST_HISTORY.owner)return false;
  try{localStorage.setItem(TEST_HISTORY_KEY+":"+TEST_HISTORY.owner,JSON.stringify({rows:TEST_HISTORY.rows,pending:[...TEST_HISTORY.pending]}));return true;}catch(error){return false;}
}
function resetTestHistory(){
  TEST_HISTORY.generation++;TEST_HISTORY.owner="";TEST_HISTORY.rows=[];TEST_HISTORY.pending=new Set();TEST_HISTORY.state="idle";TEST_HISTORY.error="";TEST_HISTORY.store=null;TEST_HISTORY.remote=false;TEST_HISTORY.loaded=false;TEST_HISTORY.chain=Promise.resolve();
}
function historyRender(){if(DASH.open&&S.ready)render();}
function queueTestSave(record){
  const h=TEST_HISTORY,store=h.store,owner=h.owner,generation=h.generation;
  if(!h.remote)return Promise.resolve(true);
  h.chain=h.chain.catch(()=>{}).then(async()=>{
    if(h.owner!==owner||h.generation!==generation||h.store!==store)return false;
    h.state="saving";historyRender();
    try{
      await store.saveTestResult(record);
      if(h.owner!==owner||h.generation!==generation||h.store!==store)return false;
      h.pending.delete(record.id);h.state=h.pending.size?(h.error?"error":"saving"):"ready";if(!h.pending.size)h.error="";cacheTestHistory();historyRender();return true;
    }catch(error){
      if(h.owner===owner&&h.generation===generation&&h.store===store){h.state="error";h.error="A completed test is waiting to sync. Your question progress is saved separately.";cacheTestHistory();historyRender();}
      return false;
    }
  });
  return h.chain;
}
function recordTestResult(row){
  const value=normalizeTestResult(row);if(!value)return false;
  const h=TEST_HISTORY;
  if(!h.owner){h.owner=testHistoryOwner();h.store=S.store;h.remote=!!S.store?.loadTestResults&&!!S.store?.saveTestResult;h.state="ready";}
  if(h.rows.some(item=>item.id===value.id))return false;
  h.rows=normalizeTestHistory([...h.rows,value]);
  if(h.remote)h.pending.add(value.id);
  const cached=cacheTestHistory();
  if(h.remote)queueTestSave(value);
  else if(!cached){h.state="error";h.error="This browser could not save the test result. Download a backup before leaving this page.";}
  else{h.state="ready";h.error="";}
  historyRender();return true;
}
async function loadTestHistory(store,mode){
  const h=TEST_HISTORY,owner=testHistoryOwner(store),previous=h.owner===owner?{rows:h.rows,pending:[...h.pending]}:{rows:[],pending:[]},generation=++h.generation;
  h.owner=owner;h.store=store;h.loaded=false;h.remote=!!store?.loadTestResults&&!!store?.saveTestResult;h.chain=Promise.resolve();h.error="";
  let cached={};try{cached=JSON.parse(localStorage.getItem(TEST_HISTORY_KEY+":"+owner)||"{}");}catch(error){}
  h.rows=normalizeTestHistory([...previous.rows,...normalizeTestHistory(cached.rows)]);h.pending=new Set([...previous.pending,...(Array.isArray(cached.pending)?cached.pending:[])].filter(id=>h.rows.some(row=>row.id===id)));
  if(!h.remote){h.loaded=true;h.state="ready";if(h.rows.length&&!cacheTestHistory()){h.state="error";h.error="This browser could not save the test results. Download a backup before leaving this page.";}return;}
  h.state="loading";historyRender();
  try{
    const saved=normalizeTestHistory(await store.loadTestResults());
    if(h.owner!==owner||h.generation!==generation||h.store!==store)return;
    // Sessions are immutable and append-only; merge rather than losing a test saved during loading.
    h.loaded=true;h.rows=normalizeTestHistory([...saved,...h.rows]);for(const row of saved)h.pending.delete(row.id);
    h.state="ready";h.error="";cacheTestHistory();
    for(const id of [...h.pending]){const row=h.rows.find(item=>item.id===id);if(row)queueTestSave(row);}
  }catch(error){
    if(h.owner===owner&&h.generation===generation&&h.store===store){h.state="error";h.error="Completed-test history could not sync. Your question bank is still available.";}
  }
  if(h.owner===owner&&h.generation===generation)historyRender();
}
function testHistoryStatus(){
  const h=TEST_HISTORY;
  if(h.state==="error")return esc(h.error)+' <button class="linkbtn" data-dash-act="history-retry">Retry sync</button>';
  if(h.state==="loading")return "Loading your completed tests…";
  if(h.state==="saving")return "Saving the completed test to your account…";
  return h.remote?"Completed tests saved to your account.":"Completed tests saved in this browser.";
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.ready&&S.store&&TEST_HISTORY.remote&&(!S.quiz||S.quiz.done))loadTestHistory(S.store,S.storage);});

function testSubjects(qs,results){
  const groups=new Map();
  qs.forEach((q,i)=>{if(!q?.subject||!results[i]||results[i].deferred)return;const name=canonicalSubject(q.subject);if(!groups.has(name))groups.set(name,{total:0,correct:0,incorrect:0,skipped:0});const a=groups.get(name),r=results[i];a.total++;if(r.skipped)a.skipped++;else if(r.ok)a.correct++;else a.incorrect++;});
  return Object.fromEntries([...groups].map(([name,a])=>[name,{...a,marks:testMarks(a.correct,a.incorrect),maxMarks:a.total*2}]));
}
function validTestSubject(a,total){return a&&Number.isInteger(a.total)&&a.total>0&&a.total<=total&&[a.correct,a.incorrect,a.skipped].every(n=>Number.isInteger(n)&&n>=0)&&a.correct+a.incorrect+a.skipped===a.total&&a.marks===testMarks(a.correct,a.incorrect)&&a.maxMarks===a.total*2;}
function canonicalSubjectBreakdown(parts,total){
  if(!parts||typeof parts!=="object"||Array.isArray(parts))return undefined;
  const merged=new Map();
  for(const [label,value] of Object.entries(parts)){
    const name=canonicalSubject(label);if(!name||!validTestSubject(value,total))return undefined;
    if(!merged.has(name))merged.set(name,{total:0,correct:0,incorrect:0,skipped:0});
    const group=merged.get(name);for(const key of ["total","correct","incorrect","skipped"])group[key]+=value[key];
  }
  const groups=[...merged].map(([name,a])=>[name,{...a,marks:testMarks(a.correct,a.incorrect),maxMarks:a.total*2}]);
  return groups.length&&groups.every(([,a])=>validTestSubject(a,total))?Object.fromEntries(groups):undefined;
}
function savedStaticTests(){
  const rows=[];
  for(const pack of S.packs){
    if(packSpace(pack.id)!=="static"||![50,100].includes(pack.questions.length))continue;
    const results=pack.questions.map(q=>{
      const p=S.prog[pack.id+":"+q.no]||{};
      if(p.a>0&&["c","w"].includes(p.l))return {ok:p.l==="c",skipped:false};
      if(!p.a&&p.sk>0)return {ok:false,skipped:true};
      return null;
    });
    // A partly attempted import is not a submitted test; do not invent skipped answers.
    if(results.some(result=>!result))continue;
    const total=results.length,correct=results.filter(r=>r.ok).length,skipped=results.filter(r=>r.skipped).length,incorrect=total-correct-skipped;
    const date=Math.max(0,...pack.questions.map(q=>Number(S.prog[pack.id+":"+q.no]?.t)||0))||null;
    rows.push({id:"saved:"+pack.id,paperId:pack.id,date,total,space:"static",mode:"saved",label:pack.title||pack.id,correct,incorrect,skipped,marks:testMarks(correct,incorrect),maxMarks:total*2,bySubject:testSubjects(pack.questions,results)});
  }
  return rows;
}
// Keep every recorded attempt; use legacy progress only for papers without a snapshot.
function recordedStaticPaperId(row,papers){
  if(row.space!=="static")return "";
  if(row.paperId)return papers.some(p=>p.paperId===row.paperId&&p.total===row.total)?row.paperId:"";
  // Older sessions lack paper IDs. Only an exact, unambiguous paper title is safe to match.
  const matches=papers.filter(p=>p.total===row.total&&p.label===row.label);
  return matches.length===1?matches[0].paperId:"";
}
function progressHistory(){
  const recorded=readTestHistory().filter(row=>(DASH.scope==="mixed"||row.space===DASH.scope)&&(DASH.scope!=="csat"||!DASH.source||(DASH.source==="untagged"?!row.sourceExam:row.sourceExam===DASH.source))).map(row=>({...row,bySubject:canonicalSubjectBreakdown(row.bySubject,row.total)}));
  const papers=["static","mixed"].includes(DASH.scope)?savedStaticTests():[];
  const covered=new Set(recorded.map(row=>recordedStaticPaperId(row,papers)).filter(Boolean));
  const combined=[...recorded,...papers.filter(row=>!covered.has(row.paperId))];
  const subjects=[...new Set([...dashQuestions().map(q=>q.subject),...combined.flatMap(row=>Object.keys(row.bySubject||{}))])].filter(Boolean).sort((a,b)=>a.localeCompare(b));
  let rows=combined.filter(row=>row.total===DASH.testLength),missingSubjects=0;
  if(DASH.testSubject){missingSubjects=rows.filter(row=>!row.bySubject).length;rows=rows.flatMap(row=>{const a=Object.hasOwn(row.bySubject||{},DASH.testSubject)?row.bySubject[DASH.testSubject]:null;return validTestSubject(a,row.total)?[{...row,...a,paperTotal:row.total,subject:DASH.testSubject}]:[];});}
  rows.sort((a,b)=>a.date-b.date||a.id.localeCompare(b.id));
  return {rows,subjects,missingSubjects,legacyCount:rows.filter(row=>row.mode==="saved").length};
}
function completedStaticPaperId(uids){
  const unique=new Set(uids);
  if(unique.size!==uids.length)return "";
  const matches=S.packs.filter(pack=>packSpace(pack.id)==="static"&&pack.questions.length===uids.length&&pack.questions.every(q=>unique.has(pack.id+":"+q.no)));
  return matches.length===1?matches[0].id:"";
}
function saveCompletedTest(Q){
  if(S.space!=="static"||!Q?.done||Q.progressSaved||![50,100].includes(Q.uids.length)||Q.kind==="Daily revision")return false;
  const results=Q.uids.map(uid=>Q.res[uid]);
  if(results.some(r=>!r||r.deferred))return false;
  const correct=results.filter(r=>r.ok&&!r.skipped).length,skipped=results.filter(r=>r.skipped).length,incorrect=results.length-correct-skipped;
  const qs=Q.uids.map(uid=>S.byUid.get(uid)),exams=new Set(qs.map(q=>q?questionSourceExam(q):"")),date=Q.completedAt||Date.now();
  const sessionId=`${S.space}:${Q.id||Q.start}`,legacy=readTestHistory().find(row=>row.id.startsWith(sessionId+':'));
  const record={id:legacy?.id||sessionId,date,total:Q.uids.length,space:S.space,correct,incorrect,skipped,marks:testMarks(correct,incorrect),maxMarks:Q.uids.length*2,bySubject:testSubjects(qs,results),mode:Q.mode,sourceExam:exams.size===1?[...exams][0]:"mixed",label:Q.label||Q.kind||"Completed test"};
  const paperId=completedStaticPaperId(Q.uids);if(paperId)record.paperId=paperId;
  const added=recordTestResult(record);Q.progressSaved=true;return added;
}
const finishQuizBeforeProgress=finishQuiz;
finishQuiz=function(){const Q=S.quiz,wasDone=Q?.done;finishQuizBeforeProgress();if(!wasDone&&Q?.done){saveCompletedTest(Q);const eligible=S.space==="static"&&[50,100].includes(Q.uids.length)&&Q.kind!=="Daily revision";if(!eligible||(TEST_HISTORY.state!=="error"&&(!TEST_HISTORY.pending.size||cacheTestHistory()))){Q.draftFinalized=true;discardQuizDraft(Q.id);}else saveQuizSession();}};
function dashProgressChart(){
  if(DASH.scope!=="static")return "";
  const {rows,subjects,missingSubjects,legacyCount}=progressHistory(),total=DASH.testLength,max=DASH.testSubject?Math.max(10,Math.ceil(Math.max(0,...rows.map(row=>row.maxMarks))/10)*10):total*2,width=Math.max(900,rows.length*26+110),height=310,left=58,right=28,top=24,bottom=48;
  const step=max/4,min=Math.min(0,Math.floor(Math.min(0,...rows.map(r=>r.marks))/step)*step),range=max-min;
  const x=i=>rows.length===1?(width+left-right)/2:left+i*(width-left-right)/(rows.length-1),y=v=>top+(max-v)/range*(height-top-bottom),ticks=[];
  for(let value=min;value<=max;value+=step)ticks.push(value);
  const labelEvery=Math.max(1,Math.ceil(rows.length/7));
  const points=rows.map((row,i)=>`${x(i).toFixed(2)},${y(row.marks).toFixed(2)}`).join(" ");
  const graph=rows.length?`<div class="swot-progress-scroll"><svg class="swot-test-chart" viewBox="0 0 ${width} ${height}" style="min-width:${Math.max(600,rows.length*20)}px" role="group" aria-labelledby="swot-test-chart-title swot-test-chart-desc"><title id="swot-test-chart-title">${total}-question test marks over time</title><desc id="swot-test-chart-desc">Completed test results ordered by date. Older summaries use last question activity dates. Results from ${rows.length} tests. Hover, tap, or focus a point for its date, correct, incorrect, skipped and marks.</desc>${ticks.map(value=>`<line class="swot-test-grid${value===0?' zero':''}" x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}"/><text class="swot-test-axis" x="${left-12}" y="${y(value)+5}" text-anchor="end">${value}</text>`).join("")}<polyline class="swot-test-line" points="${points}"/>${rows.map((row,i)=>`${(i%labelEvery===0&&i<rows.length-labelEvery)||i===rows.length-1?`<text class="swot-test-axis" x="${x(i)}" y="${height-14}" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}">${testDate(row.date)}</text>`:""}<g class="swot-test-point" tabindex="0" role="button" data-dash-act="test-point" data-test-point="${i}" aria-label="${esc((row.mode==="saved"?"Last activity ":"")+testDate(row.date,true)+', '+(row.label||SPACES[row.space].label)+', '+testPointSubjects(row)+', '+row.correct+' correct, '+row.incorrect+' incorrect, '+row.skipped+' skipped, '+row.marks+' marks out of '+row.maxMarks)}" aria-describedby="swot-test-tooltip"><circle class="swot-test-hit" cx="${x(i)}" cy="${y(row.marks)}" r="13"/><circle class="swot-test-dot" cx="${x(i)}" cy="${y(row.marks)}" r="5"/></g>`).join("")}</svg></div>`:`<div class="swot-progress-empty">${ic("quiz")}<h3>No ${DASH.testSubject?esc(DASH.testSubject)+" results for ":""}${total}-question test results available</h3><p>Finish a ${total}-question Static test to record a result. Older papers appear when every question has an answer or an explicit skip.</p></div>`;
  return `<section class="swot-panel swot-progress" aria-labelledby="swot-progress-title"><div class="swot-panel-heading"><div><div class="swot-progress-title"><h2 id="swot-progress-title">Your test progress</h2></div><p>${DASH.testSubject?esc(DASH.testSubject)+" · ":""}Marks over time · all test results in one view</p></div><div class="swot-progress-filters"><div class="swot-test-length"><label for="swot-test-subject">Subject</label><select id="swot-test-subject"><option value="">All subjects</option>${subjects.map(subject=>`<option value="${esc(subject)}"${DASH.testSubject===subject?' selected':''}>${esc(subject)}</option>`).join("")}</select></div><div class="swot-test-length"><label for="swot-test-length">Test length</label><select id="swot-test-length"><option value="50"${total===50?' selected':''}>Half-length · 50 questions</option><option value="100"${total===100?' selected':''}>Full-length · 100 questions</option></select></div></div></div><div class="swot-progress-plot">${graph}<div id="swot-test-tooltip" class="swot-test-tooltip" role="tooltip" hidden></div></div><div class="swot-progress-caption"><span><i></i>${DASH.testSubject?"Subject marks":"Total marks <small>/ "+max+"</small>"}</span><span>+2 correct · −0.66 incorrect · 0 skipped</span></div><p class="swot-panel-foot">${testHistoryStatus()} ${legacyCount?legacyCount+" older paper summaries use the latest saved answers and last activity date; they can change with further practice. Recorded attempts keep their original scores.":""} ${DASH.testSubject?"Showing this subject’s portion of each "+total+"-question test. ":""}${missingSubjects?missingSubjects+" older tests have no saved subject breakdown and are excluded. ":""}Hover or tap a point for the full result.</p></section>`;
}
function testPointSubjects(row){
  const names=row.subject?[row.subject]:Object.entries(row.bySubject||{}).filter(([,a])=>validTestSubject(a,row.total)).map(([name])=>name);
  return names.length?(names.length===1?"Subject: ":"Subjects: ")+names.map(dashShort).join(" · "):"Subject: Not recorded";
}
function showTestPoint(point){
  const row=progressHistory().rows[Number(point.dataset.testPoint)],tip=document.getElementById("swot-test-tooltip"),plot=point.closest(".swot-progress-plot");if(!row||!tip||!plot)return;
  document.querySelectorAll('.swot-test-point.active').forEach(el=>el.classList.remove('active'));point.classList.add('active');
  tip.innerHTML=`<div class="swot-test-tip-head"><strong>${testDate(row.date,true)}</strong><span>${row.mode==="saved"?"Last activity":esc(row.space==="ca"?"CA":SPACES[row.space].label)+" · "+(row.mode==="exam"?"Exam":"Practice")}</span></div>${row.label?`<div class="swot-test-tip-paper" title="${esc(row.label)}">${esc((String(row.label).match(/\btest[\s-]*(\d+)/i)||[])[1]?"Test "+String(row.label).match(/\btest[\s-]*(\d+)/i)[1]:row.label)}</div>`:""}<div class="swot-test-tip-subject">${esc(testPointSubjects(row))}</div><div class="swot-test-tip-marks"><strong>${row.marks.toFixed(2)}</strong><span>/ ${row.maxMarks} marks</span></div><div class="swot-test-tip-counts"><span><b>${row.correct}</b>Correct</span><span><b>${row.incorrect}</b>Incorrect</span><span><b>${row.skipped}</b>Skipped</span></div>`;
  tip.hidden=false;const dot=point.querySelector('.swot-test-dot').getBoundingClientRect(),box=plot.getBoundingClientRect();
  tip.style.left=Math.max(8,Math.min(dot.left-box.left+dot.width/2-tip.offsetWidth/2,box.width-tip.offsetWidth-8))+"px";
  const gap=14,above=dot.top-box.top-tip.offsetHeight-gap,below=dot.bottom-box.top+gap;
  const fitsBelow=dot.bottom+gap+tip.offsetHeight<=window.innerHeight-8;
  // Flip below high points instead of clamping the box over the selected dot.
  tip.style.top=(above>=8||(!fitsBelow&&dot.top-tip.offsetHeight-gap>=8)?above:below)+"px";
}
document.addEventListener("change",event=>{if(event.target.id==="swot-test-subject"){const subject=event.target.value;if(subject&&!progressHistory().subjects.includes(subject))return;DASH.testSubject=subject;render();return;}if(event.target.id!=="swot-test-length")return;const length=Number(event.target.value);if(![50,100].includes(length))return;DASH.testLength=length;render();});
document.addEventListener("pointerover",event=>{const point=event.target.closest?.('[data-test-point]');if(point)showTestPoint(point);});
document.addEventListener("pointerout",event=>{const point=event.target.closest?.('[data-test-point]');if(point&&!point.contains(event.relatedTarget)&&point!==document.activeElement){const tip=document.getElementById('swot-test-tooltip');if(tip)tip.hidden=true;point.classList.remove('active');}});
document.addEventListener("focusin",event=>{const point=event.target.closest?.('[data-test-point]');if(point)showTestPoint(point);});
document.addEventListener("focusout",event=>{const point=event.target.closest?.('[data-test-point]');if(point){const tip=document.getElementById('swot-test-tooltip');if(tip)tip.hidden=true;point.classList.remove('active');}});
document.addEventListener("scroll",event=>{if(!event.target.classList?.contains('swot-progress-scroll'))return;const tip=document.getElementById('swot-test-tooltip');if(tip)tip.hidden=true;},true);

function dashMetrics(a,extra=false){
  const metrics=extra?[[dashPercent(a.surePct),"Accuracy when sure",`${a.sureOk}/${a.sure} latest sure answers correct`],[a.avgTime===null?"—":a.avgTime+'<small>s</small>',"Recorded answer time",`${a.timed} timed attempts · all recorded practice`]]:[[dashPercent(a.pct),dashModeName()+" accuracy",`${a.ok}/${a.n} answered correctly`],[dashPercent(a.coverage),"Question-bank coverage",`${a.answered}/${a.bank} questions answered`],[a.mistakes,"Open mistakes","Wrong and skipped questions"],[a.due,"Reviews due",`${a.done} practised in revision today`]];
  return `<section class="swot-metrics${extra?' swot-metrics-extra':''}" aria-label="${extra?'Confidence and timing':'Learning statistics'}">${metrics.map(([value,label,note])=>`<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("")}</section>`;
}
function dashMoreInsights(qs,rows,a){
  return `<details class="swot-more-insights"${DASH.insightsOpen?' open':''}><summary><span><strong>More insights</strong><small>Timing, confidence and detailed breakdowns</small></span><span class="swot-insights-toggle" aria-hidden="true"></span></summary><div class="swot-insights-content">${dashMetrics(a,true)}${dashExtraPanels(qs,rows,a)}${dashMixedTable()}</div></details>`;
}
function viewSwot(){
  const qs=dashQuestions(),a=dashStats(qs),rows=dashRows(qs),subjects=dashSubjectRows(qs),topicRows=dashRows(qs,DASH.mode,"topic");
  const scopeLabel=DASH.scope==="mixed"?"All five sections":SPACES[DASH.scope].label;
  return `<main class="swot-dash"><section class="swot-hero"><div><div class="ui-overline">Your learning, in focus <span class="ui-context-label">Your question bank</span></div><h1>SWOT analysis</h1><p>Know what’s working. See what deserves your next hour.</p></div><span class="swot-date">${new Date().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</span></section><nav class="swot-scope-tabs" aria-label="Dashboard sections">${[["mixed","Mixed"],...Object.entries(SPACES).map(([key,s])=>[key,s.label])].map(([key,label])=>`<button data-dash-act="scope" data-value="${key}" aria-pressed="${DASH.scope===key}">${label}</button>`).join("")}</nav><section class="swot-controls" aria-label="Analysis controls"><div><span class="label">Accuracy basis</span><div class="seg">${[["first","First attempt"],["latest","Latest answer"],["repeat","Repeat practice"]].map(([key,label])=>`<button data-dash-act="mode" data-value="${key}" aria-pressed="${DASH.mode===key}">${label}</button>`).join("")}</div></div>${DASH.scope==="csat"?`<div><span class="label">CSAT source</span><div class="seg">${[["","All sources"],["CSE","CSE"],["CAPF","CAPF"],["untagged","Untagged"]].map(([key,label])=>`<button data-dash-act="source" data-value="${key}" aria-pressed="${DASH.source===key}">${label}</button>`).join("")}</div></div>`:`<p>${scopeLabel} · ${a.bank} imported questions<br><span>Choose the same basis for your SWOT, subject chart, and heatmap.</span></p>`}</section>${DASH.mode==="first"&&a.unknown?`<div class="swot-history-note">${a.unknown} earlier questions have no recorded first attempt. <button class="linkbtn" data-dash-act="mode" data-value="latest">View their latest answers</button></div>`:""}${dashMetrics(a)}${dashProgressChart()}<section aria-labelledby="swot-summary-title"><div class="ui-section-title"><h2 id="swot-summary-title">Your SWOT at a glance</h2><span>${DASH_MIN}+ distinct answered questions per classified ${DASH.heatBy}</span></div><div class="swot-summary-grid">${Object.entries(DASH_BANDS).map(([key,b])=>`<button class="swot-summary ${key}" data-dash-act="band" data-value="${key}" aria-pressed="${DASH.band===key}"><span><b>${b.label}</b><small>${b.rule}</small></span><strong>${rows.filter(r=>r.stats.band===key).length}<small>${DASH.heatBy}s</small></strong><span class="swot-summary-hint">${b.hint} ${UI_ARROW}</span></button>`).join("")}</div><div class="swot-evidence-note"><span>${rows.filter(r=>r.stats.band==="limited").length} with limited data · ${rows.filter(r=>["new","unrecorded"].includes(r.stats.band)).length} without results for this basis</span><button class="linkbtn" data-dash-act="band" data-value="all">Show every band</button></div></section>${dashNextActions(topicRows)}<div class="swot-visual-grid"><section class="swot-panel swot-profile"><h2>Your subject profile</h2><p class="swot-subtitle">Only your performance. ${dashModeName()} accuracy.</p><div class="swot-radar-wrap">${dashRadar(subjects)}</div><details class="swot-subject-values" open><summary>Subject values &amp; evidence</summary><div class="swot-subject-scroll" role="region" aria-label="Subject scores" tabindex="0">${subjects.map(s=>`<button data-dash-act="find-subject" data-value="${esc(s.name)}"><span>${esc(s.name)}<small>${s.stats.ok}/${s.stats.n} correct · ${s.stats.observed} distinct questions</small></span><strong>${dashPercent(s.stats.pct)}</strong></button>`).join("")}</div></details><p class="swot-panel-foot">Hover or tap a chart point for its score. The chart has one series: you. Values from fewer than ${DASH_MIN} distinct answered questions are provisional.</p></section>${dashHeatmap(rows)}</div>${dashMoreInsights(qs,topicRows,a)}<footer class="ui-footer"><span>Based on your recorded practice</span><span>Your saved questions and progress</span></footer></main>`;
}
function openSwot(scope="mixed",heat=false){
  DASH.open=true;DASH.testSubject="";DASH.scope=scope;DASH.detail=null;DASH.showQuestions=false;DASH.band="all";DASH.source="";DASH.query="";render();
  if(heat)document.getElementById("swot-heatmap")?.scrollIntoView({block:"start"});else window.scrollTo(0,0);
}
function dashPractise(row){
  DASH.open=false;S.space=row.space;S.quiz=null;S.tab="practice";S.view="wiz";S.step=2;rebuild();
  S.sel={subjects:new Set([row.subject]),topics:row.topic?new Set([topicKey(row.subject,row.topic)]):new Set(),pack:"all",which:"prio",mode:"practice",count:10,custom:10,sourceExam:row.space==="csat"?DASH.source:""};render();window.scrollTo(0,0);
}
const swotPracticeRender=render;
render=function(){
  if(!DASH.open||!S.ready||S.bankError||!["none","ok"].includes(S.auth)){
    document.documentElement.setAttribute("data-dashboard","false");
    const dialog=document.getElementById("swot-topic-dialog");
    if(dialog?.open){DASH.topicTrigger=null;DASH.detail=null;DASH.showQuestions=false;dialog.close();document.body.classList.remove("swot-topic-open");}
    return swotPracticeRender();
  }
  document.documentElement.setAttribute("data-dashboard","true");
  document.documentElement.setAttribute("data-space",DASH.scope);document.documentElement.setAttribute("data-theme",S.theme);
  const keep=window.scrollY;app.innerHTML=header().replace(/<nav class="tabs ui-tabs"[\s\S]*?<\/nav>/,'<div class="swot-header-caption"><span>Dashboard / Learning analysis</span><span>Your learning dashboard</span></div>')+progressRecoveryCard()+resumeCard()+viewSwot();window.scrollTo(0,keep);
};
document.addEventListener("submit",event=>{if(event.target.id!=="swot-search-form")return;event.preventDefault();DASH.query=document.getElementById("swot-topic-search").value;DASH.detail=null;render();document.getElementById("swot-heatmap")?.scrollIntoView({block:"start"});});
document.addEventListener("toggle",event=>{const key=event.target.dataset?.dashGroup;if(key)DASH.heatOpen[key]=event.target.open;if(event.target.classList?.contains("swot-more-insights"))DASH.insightsOpen=event.target.open;},true);
document.addEventListener("click",event=>{
  const el=event.target.closest("[data-dash-act]");if(!el)return;
  const act=el.dataset.dashAct,value=el.dataset.value;
  if(act==="radar-score"){el.focus({preventScroll:true});return;}
  if(act==="test-point"){el.focus({preventScroll:true});showTestPoint(el);return;}
  if(act==="history-retry"){loadTestHistory(S.store,S.storage);return;}
  if(act==="open"){openSwot();return;}
  if(act==="detail"){openDashTopic(el.dataset.key,el);return;}
  if(act==="close-detail"){document.getElementById("swot-topic-dialog")?.close();return;}
  if(act==="review-topic"){DASH.showQuestions=!DASH.showQuestions;const dialog=dashTopicDialog(),keep=dialog.scrollTop;dialog.innerHTML=dashTopicDetail(dashRows());dialog.scrollTop=keep;dialog.querySelector('[data-dash-act="review-topic"]')?.focus({preventScroll:true});return;}
  if(act==="practice"){const row=dashRows().find(r=>r.id===el.dataset.key)||dashRows(dashQuestions(),DASH.mode,"topic").find(r=>r.id===el.dataset.key);if(row){DASH.topicTrigger=null;document.getElementById("swot-topic-dialog")?.close();document.body.classList.remove("swot-topic-open");dashPractise(row);}return;}
  if(act==="more-topics")DASH.heatLimits[el.dataset.key]=(DASH.heatLimits[el.dataset.key]||12)+12;
  if(act==="scope"){DASH.testSubject="";DASH.scope=value;DASH.source="";DASH.band="all";DASH.query="";DASH.detail=null;DASH.showQuestions=false;}
  if(act==="mode"){DASH.mode=value;DASH.detail=null;DASH.showQuestions=false;}
  if(act==="source"){DASH.testSubject="";DASH.source=value;DASH.detail=null;}
  if(act==="band"){DASH.band=DASH.band===value?"all":value;DASH.detail=null;}
  if(act==="heatby"){DASH.heatBy=value;DASH.detail=null;}
  if(act==="expand")DASH.expanded[value]=!DASH.expanded[value];
  if(act==="clear"){DASH.band="all";DASH.query="";}
  if(act==="find-subject"){DASH.query=value;DASH.band="all";DASH.detail=null;}
  render();
  if(act==="find-subject"||act==="band")document.getElementById("swot-heatmap")?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  else if(["scope","mode","source"].includes(act))window.scrollTo(0,0);
});
/* ---------- Shareable pages and browser navigation ---------- */
const SPACE_PATHS={static:"static",ca:"current-affairs",cse:"cse",csat:"csat",capf:"capf"};
const PAGE_TOOLS={notebook:"Notebook",bookmarks:"Bookmarks",import:"Import",practice:"Practice",revision:"Daily revision",mistakes:"Mistake practice",search:"Search questions"};
const ROUTES={started:false,applying:false,waiting:false,current:"",index:0,restoring:false,pending:null,scrolls:new Map()};
function sectionHash(space,tool=""){
  const page=tool==="marks"?"bookmarks":tool==="practice"?"":tool;
  return "#/"+SPACE_PATHS[space]+(page?"/"+page:"");
}
function parsePageRoute(hash){
  const parts=String(hash||"").toLowerCase().replace(/^#\//,"").replace(/\/+$/,"").split("/");
  if(!String(hash||"").startsWith("#/")||parts.length>2)return null;
  const spaceFor=path=>Object.keys(SPACE_PATHS).find(key=>SPACE_PATHS[key]===path||(key==="ca"&&path==="ca"));
  if(parts[0]==="dashboard"){
    const scope=parts[1]?spaceFor(parts[1]):"mixed";
    return scope?{kind:"dashboard",scope,hash:"#/dashboard"+(scope==="mixed"?"":"/"+SPACE_PATHS[scope])}:null;
  }
  const space=spaceFor(parts[0]),tool=parts[1]||"";
  if(!space||(tool&&!Object.hasOwn(PAGE_TOOLS,tool))||(tool==="search"&&!["cse","csat"].includes(space)))return null;
  return {kind:"section",space,tool,hash:sectionHash(space)+(tool?"/"+tool:"")};
}
function authReturnUrl(){
  // Leave Supabase's session/error fragments and PKCE callback parameters untouched.
  return /(?:^#|&)(?:access_token|refresh_token|error|error_code|error_description|token_type)=/.test(location.hash||"")||new URLSearchParams(location.search||"").has("code");
}
function resetPracticeSpace(space){
  saveQuizSession();
  DASH.open=false;flushInBackground();S.space=space;try{localStorage.setItem("rd_space",space);}catch(error){}
  S.quiz=null;S.tab="practice";S.view="home";S.step=1;S.sel.subjects=new Set();S.sel.topics=new Set();S.sel.pack="all";S.sel.sourceExam="";S.pyqSource={sourceExam:""};S.sel.months=new Set();S.nb.subject="";S.editMonth=null;S.confirmDel=null;S.mdText="";
  S.imp={parsed:null,errors:[],text:"",dups:[],name:"",month:"",idMode:""};rebuild();
}
function pageRouteFromState(){
  if(DASH.open)return parsePageRoute("#/dashboard"+(DASH.scope==="mixed"?"":"/"+SPACE_PATHS[DASH.scope]));
  let tool=S.tab==="marks"?"bookmarks":S.tab!=="practice"?S.tab:"";
  if(S.tab==="practice")tool=S.quiz||S.view==="wiz"?"practice":({daily:"revision",smart:"mistakes",search:"search"}[S.view]||"");
  return parsePageRoute(sectionHash(S.space)+(tool?"/"+tool:""));
}
function applyPageRoute(page){
  ROUTES.applying=true;
  try{
    document.getElementById("ui-navigation-menu")?.close?.();
    document.getElementById("swot-topic-dialog")?.close?.();
    document.body.classList.remove("ui-menu-open","swot-topic-open");
    S.confirmExit=false;S.confirmFin=false;S.quiz=null;S.mdText="";
    if(page.kind==="dashboard"){
      DASH.open=true;DASH.scope=page.scope;DASH.testSubject="";DASH.source="";DASH.band="all";DASH.query="";DASH.detail=null;DASH.showQuestions=false;
      S.tab="practice";S.view="home";
    }else{
      if(S.space!==page.space)resetPracticeSpace(page.space);
      DASH.open=false;S.tab=({notebook:"notebook",bookmarks:"marks",import:"import"}[page.tool]||"practice");
      S.view=({practice:"wiz",revision:"daily",mistakes:"smart",search:"search"}[page.tool]||"home");
      if(page.tool==="practice")S.step=1;
      if(page.tool==="mistakes")S.smart={subject:"",subjects:new Set(),topics:new Set(),step:1,count:20,custom:15,mode:"practice",back:"practice"};
      if(page.tool==="notebook")S.nb.subject=undefined;
      try{localStorage.setItem("rd_space",page.space);}catch(error){}
    }
  }finally{ROUTES.applying=false;}
}
function pageHistoryState(scroll=0){
  const existing=window.history?.state;
  return {...(existing&&typeof existing==="object"?existing:{}),soloPage:{index:ROUTES.index,scroll}};
}
function writePageUrl(page,replace=false,scroll=0){
  if(!window.history?.pushState)return;
  if(!replace){
    ROUTES.scrolls.set(ROUTES.index,window.scrollY||0);
    window.history.replaceState(pageHistoryState(window.scrollY||0),"",location.href);
    ROUTES.index++;
  }
  window.history[replace?"replaceState":"pushState"](pageHistoryState(scroll),"",(location.pathname||"/")+(location.search||"")+page.hash);
}
function routePageTitle(page){
  if(!page)return;
  document.title=page.kind==="dashboard"?"Dashboard"+(page.scope==="mixed"?"":" · "+SPACES[page.scope].label)+" · Solo Leveling":SPACES[page.space].label+(page.tool?" · "+PAGE_TOOLS[page.tool]:"")+" · Solo Leveling";
}
function syncPageRoute(){
  if(!ROUTES.started||ROUTES.applying||ROUTES.restoring)return;
  if(!S.ready||S.bankError||!["none","ok"].includes(S.auth)){ROUTES.waiting=true;return;}
  if(authReturnUrl())return;
  if(ROUTES.waiting||!ROUTES.current){
    const page=parsePageRoute(location.hash)||parsePageRoute(ROUTES.current)||parsePageRoute("#/dashboard");
    ROUTES.waiting=false;applyPageRoute(page);ROUTES.current=page.hash;writePageUrl(page,true);routePageTitle(page);return;
  }
  const page=pageRouteFromState();if(!page)return;
  if(page.hash!==ROUTES.current){writePageUrl(page);ROUTES.current=page.hash;}
  routePageTitle(page);
}
function goToRoute(page,fromHistory=false,scroll=0){
  ROUTES.pending=null;
  if(!fromHistory&&page.hash===ROUTES.current)return;
  writePageUrl(page,fromHistory,scroll);ROUTES.current=page.hash;applyPageRoute(page);routePageTitle(page);
  render();window.scrollTo(0,scroll);
  const heading=app.querySelector?.("h1, h2");heading?.setAttribute("tabindex","-1");heading?.focus({preventScroll:true});
}
function requestPageRoute(page){
  if(!page||page.hash===ROUTES.current)return;
  if(S.quiz&&!S.quiz.done){ROUTES.pending=page;S.confirmExit=true;render();return;}
  goToRoute(page);
}
function browserPageChanged(){
  if(!ROUTES.started||authReturnUrl())return;
  const page=parsePageRoute(location.hash)||parsePageRoute("#/dashboard");
  if(ROUTES.restoring){if(page.hash===ROUTES.current)ROUTES.restoring=false;return;}
  const marker=window.history?.state?.soloPage;
  if(page.hash===ROUTES.current){
    if(Number.isInteger(marker?.index))ROUTES.index=marker.index;
    if(location.hash!==page.hash)writePageUrl(page,true);
    return;
  }
  ROUTES.scrolls.set(ROUTES.index,window.scrollY||0);
  if(S.quiz&&!S.quiz.done){
    ROUTES.pending=page;S.confirmExit=true;ROUTES.restoring=true;
    const delta=Number.isInteger(marker?.index)?ROUTES.index-marker.index:-1;
    if(delta&&window.history?.go)window.history.go(delta);
    else{writePageUrl(parsePageRoute(ROUTES.current),true);ROUTES.restoring=false;}
    render();return;
  }
  ROUTES.index=Number.isInteger(marker?.index)?marker.index:ROUTES.index+1;
  goToRoute(page,true,ROUTES.scrolls.get(ROUTES.index)??marker?.scroll??0);
}
function initRoutes(){
  if(ROUTES.started)return;ROUTES.started=true;
  ROUTES.index=Number.isInteger(window.history?.state?.soloPage?.index)?window.history.state.soloPage.index:0;
  if(window.history&&"scrollRestoration" in window.history)window.history.scrollRestoration="manual";
  window.addEventListener?.("popstate",browserPageChanged);
  window.addEventListener?.("hashchange",browserPageChanged);
  window.addEventListener?.("beforeunload",event=>{if(S.quiz&&!S.quiz.done||PROGRESS.cacheError&&PROGRESS.ops.size||QUIZ_DRAFTS.error){saveQuizSession();event.preventDefault();event.returnValue="";}});
  if(authReturnUrl()){ROUTES.waiting=true;return;}
  const page=parsePageRoute(location.hash)||parsePageRoute("#/dashboard");
  applyPageRoute(page);ROUTES.current=page.hash;writePageUrl(page,true);routePageTitle(page);
}
const pageNavigationRender=render;
render=function(){saveQuizSession();if(S.ready&&!S.quiz&&QUIZ_DRAFTS.dirty)loadQuizSessions();syncPageRoute();return pageNavigationRender();};

render();
(async function boot(){
  initRoutes();
  if(LOCAL_PREVIEW){S.auth="none";await openBank(localBackend("recall-desk-preview-v1"),"browser");return;}
  if(CONFIG.requireLogin&&!(CONFIG.supabaseUrl&&CONFIG.supabaseKey)){S.auth="setup";S.ready=true;render();return;}
  if(CONFIG.supabaseUrl&&CONFIG.supabaseKey){
    try{
      await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js");
      const base=(()=>{try{return new URL(CONFIG.supabaseUrl.trim()).origin;}catch(e){return CONFIG.supabaseUrl.trim();}})();
      S.sb=window.supabase.createClient(base,CONFIG.supabaseKey.trim(),{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      S.sb.auth.onAuthStateChange((ev,session)=>{
        if(ev==="SIGNED_OUT"){resetData();S.user=null;S.auth="login";S.ready=true;render();}
        else if(session&&session.user&&(!S.user||S.user.id!==session.user.id))setTimeout(()=>startCloud(session.user),0);
      });
      const {data}=await S.sb.auth.getSession();
      if(!data.session&&!S.user){S.auth="login";S.ready=true;render();}
      return;
    }catch(e){
      if(CONFIG.requireLogin){S.auth="error";S.authErr=(e&&e.message)||"Unknown error";S.ready=true;render();return;}
      toast("Login could not start ("+((e&&e.message)||"error")+"). Using this browser only.");S.sb=null;S.auth="none";
    }
  }
  let store=null,mode="browser";
  try{
    const c=window.claude;
    if(c&&c.use){
      const user=await c.use("user"),db=await c.use("db");
      const uid=user&&db?await user.id():null;
      if(db&&uid){store=dbBackend(db,String(uid));mode="account";}
    }
  }catch(e){store=null;}
  if(!store){store=localBackend();mode="browser";}
  await openBank(store,mode);
})();
