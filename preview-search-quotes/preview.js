"use strict";
// This file is loaded only by the copied preview page. No account is connected.
const PREVIEW_BANK_KEY="solo-design-preview-bank-v1";
const PREVIEW_QUOTES_KEY="solo-design-preview-quotes-v1";
const SEARCH_ICON='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
const EDIT_ICON='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4-1 13-13-4-4L4 15z"/></svg>';
const PREVIEW_DEFAULT_QUOTES=[
  {text:"One focused hour today is one less doubt on exam day.",author:"Study reminder"},
  {text:"Return to what challenged you. That is where the learning begins.",author:"Study reminder"}
];
const PREVIEW_RELATED_TOPICS=[
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
const PREVIEW_TOPIC_FAMILIES=[{
  aliases:["religion","religions","religious","faith","faiths","religious traditions","religious movements","indian religions","religion in india"],
  terms:["religion","religions","religious","faith","faiths","buddhism","buddhist","buddha","four noble truths","eightfold path","jainism","jain","jaina","jainas","mahavira","tirthankara","tirthankaras","anekantavada","hinduism","hindu","vedic","vedas","upanishads","shaivism","vaishnavism","shaktism","islam","islamic","sufism","sufi","sufis","silsila","silsilah","chishti","chisti","bhakti","kabir","alvars","nayanars","sikhism","sikh","guru nanak","guru granth sahib","khalsa","christianity","christian","zoroastrianism","zoroastrian","judaism","jewish"]
}];
const PREVIEW_SEARCH={draft:"",query:"",related:true,page:1};
function searchNormalize(value){
  return String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/).map(w=>w==="center"?"centre":w==="relations"?"relation":w==="states"?"state":w==="centres"?"centre":w).join(" ");
}
function hasSearchPhrase(text,phrase){return !!phrase&&(" "+text+" ").includes(" "+phrase+" ");}
function searchPlan(query,related=true){
  const phrase=searchNormalize(query),tokens=[...new Set(phrase.split(" ").filter(Boolean))];
  const groups=related?PREVIEW_RELATED_TOPICS.filter(g=>g.some(alias=>searchNormalize(alias)===phrase)):[];
  const families=related?PREVIEW_TOPIC_FAMILIES.filter(f=>f.aliases.some(alias=>searchNormalize(alias)===phrase)):[];
  const aliases=[...new Set([...groups.flat(),...families.flatMap(f=>f.terms)].map(searchNormalize))].filter(a=>a!==phrase);
  return {phrase,tokens,aliases};
}
function cseSearch(query,related=true){
  if(S.space!=="cse")return [];
  const plan=searchPlan(query,related);if(!plan.tokens.length)return [];
  return S.qs.flatMap(q=>{
    const fields=[{name:"Question",value:q.text},{name:"Options",value:Object.values(q.options||{}).join(" ")},{name:"Solution",value:[q.exp,q.sum].filter(Boolean).join("\n")}].map(f=>({...f,normal:searchNormalize(f.value)}));
    const directFields=fields.filter(f=>plan.tokens.every(t=>hasSearchPhrase(f.normal,t)));
    const labels=[{name:"Topic label",value:q.topic},{name:"Subject label",value:q.subject}].map(f=>({...f,normal:searchNormalize(f.value)}));
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
  return `<article class="search-result"><div class="row sp"><div class="qmeta"><span class="tag">${esc(q.subject)}</span><span class="tag plain">${esc(q.topic)}</span>${q.year?`<span class="tag plain">${esc(q.year)}</span>`:""}</div><span class="tag${direct?"":" plain"}">${direct?"Keyword match":"Related topic"}</span></div>
    <p class="match-note">${esc(pack?.title||"Imported set")} · Q${q.no} · Found in ${esc(fields.join(" + ").toLowerCase())}</p>
    <h3>${searchHighlight(questionDisplayText(q.text),terms)}</h3>
    ${excerpt?`<p class="search-excerpt"><strong>Solution excerpt</strong><br>${searchHighlight(searchExcerpt(excerpt,terms),terms)}</p>`:""}
    ${!direct?`<p class="match-note">Related terms found: ${esc(terms.join(", "))}</p>`:""}
    <details class="search-answer"><summary>View options, answer &amp; full solution</summary><div class="search-answer-body">${figs(q.qimg)}${Object.entries(q.options).map(([key,value])=>`<p><strong>${esc(key)}.</strong> ${searchHighlight(value,terms)}</p>`).join("")}<p class="gold">Accepted answer: ${esc(acceptedAnswers(q).join(" or "))}</p>${solution(q)||`<p class="hint">No solution was included in this import.</p>`}</div></details></article>`;
}
function viewCseSearch(){
  const {query,related,page}=PREVIEW_SEARCH,rows=cseSearch(query,related),exact=rows.filter(r=>r.direct).length,relatedCount=rows.length-exact;
  const size=12,pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(page,pages),plan=searchPlan(query,related);
  return `<button class="backlink" data-preview-act="search-back">← Back to CSE Practice</button>
    <section class="card search-box"><div class="row sp"><span class="label gold">Explore your CSE question bank</span>${SEARCH_ICON}</div><h1>Has this topic appeared before?</h1><p class="muted">Find words and related topics in your imported questions, options and solutions.</p>
    <form id="cse-search-form" class="search-form" role="search"><label class="sr-only" for="cse-search-input">Search CSE questions</label><input class="txt" id="cse-search-input" type="search" maxlength="160" value="${esc(PREVIEW_SEARCH.draft)}" placeholder="Try federalism, inflation, Buddhism…" autocomplete="off"><button class="btn pri" type="submit">Search questions</button></form>
    <div class="search-controls"><label><input id="search-related" type="checkbox" ${related?"checked":""}> Include related topics</label><span class="hint">Questions + options + solutions</span></div>
    <div class="search-chips"><span class="hint">Try</span>${["Federalism","Religion","Monetary policy","Biodiversity"].map(t=>`<button class="chip" data-preview-act="search-suggestion" data-value="${esc(t)}">${esc(t)}</button>`).join("")}</div></section>
    ${query?`<div class="field" style="gap:8px" role="status"><div class="row sp"><h2>${rows.length} result${rows.length===1?"":"s"} for “${esc(query)}”</h2><span class="hint">${S.qs.length} CSE questions searched</span></div><div class="search-counts"><span class="tag">${exact} keyword match${exact===1?"":"es"}</span>${related?`<span class="tag plain">${relatedCount} related-topic match${relatedCount===1?"":"es"}</span>`:""}</div>${plan.aliases.length?`<p class="hint">Also looking for: ${esc(plan.aliases.slice(0,6).join(", "))}${plan.aliases.length>6?"…":""}</p>`:""}</div>`:`<section class="card flat"><h2>Follow a topic across papers</h2><p class="muted">Search “federalism” to find direct mentions, plus related terms such as Centre–State relations and the Seventh Schedule.</p></section>`}
    ${query&&!rows.length?`<section class="card flat"><h2>No matching questions in this bank</h2><p class="muted">Try a shorter keyword or import more CSE papers. No match here does not mean a topic has never appeared in UPSC.</p></section>`:""}
    ${rows.slice((current-1)*size,current*size).map(searchResult).join("")}
    ${pages>1?`<nav class="search-pagination" aria-label="Search result pages"><button class="btn sm" data-preview-act="search-page" data-value="${current-1}" ${current===1?"disabled":""}>Previous</button><span class="hint">${current} / ${pages}</span><button class="btn sm" data-preview-act="search-page" data-value="${current+1}" ${current===pages?"disabled":""}>Next</button></nav>`:""}
    <details class="card flat"><summary class="hint">How are related topics matched?</summary><p class="hint">Keyword matches look for all your search words within question text, options or a solution. Related matching also checks topic and subject labels, plus a curated dictionary: for example, religion includes Buddhism, Jainism, Bhakti and Sufism. Broad categories expand to their subtopics; a narrow Buddhism search stays focused on Buddhism. This is dictionary-based matching, not an AI understanding of every topic.${query&&related&&!plan.aliases.length?" This search has no dictionary expansion; only your words and matching topic labels are being checked.":""}</p></details>
    <p class="hint">${S.packs.every(p=>p.sample)?"These are illustrative demo questions, not verified UPSC PYQs.":"Results cover your imports only."} No result does not prove a topic has never appeared in UPSC. Browsing results does not record an attempt.</p>`;
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
let previewQuotes=(()=>{try{const raw=localStorage.getItem(PREVIEW_QUOTES_KEY);return raw?parseQuoteJson(raw):structuredClone(PREVIEW_DEFAULT_QUOTES);}catch(e){return structuredClone(PREVIEW_DEFAULT_QUOTES);}})();
function quoteForDay(quotes,date=new Date()){
  const day=Math.floor(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000);
  return quotes[((day%quotes.length)+quotes.length)%quotes.length];
}
function quoteCard(){
  const quote=quoteForDay(previewQuotes);
  return `<aside class="quote-card" aria-label="Quote of the day" title="${esc(quote.text+(quote.author?' — '+quote.author:''))}"><span class="quote-label">Quote of the day</span><p class="quote-copy"><em>“${esc(quote.text)}”</em></p><div class="quote-bottom">${quote.author?`<span class="quote-author">— ${esc(quote.author)}</span>`:""}<button class="quote-edit" data-preview-act="quote-edit" aria-label="Edit quote collection" title="Edit all quotes">${EDIT_ICON}</button></div></aside>`;
}
let quoteDraft=[],quoteTrigger=null;
function quoteEntry(q,i){return `<section class="quote-entry"><div class="row sp"><label class="label" for="quote-text-${i}">Quote ${i+1}</label><button type="button" class="linkbtn" data-preview-act="quote-remove" data-value="${i}" aria-label="Remove quote ${i+1}">Remove</button></div><textarea id="quote-text-${i}" data-quote-text="${i}" maxlength="2000" aria-label="Quote ${i+1} text">${esc(q.text)}</textarea><input class="txt" data-quote-author="${i}" maxlength="160" value="${esc(q.author)}" placeholder="Author (optional)" aria-label="Quote ${i+1} author"></section>`;}
function drawQuoteEditor(){
  const dialog=document.getElementById("quote-dialog");
  dialog.innerHTML=`<form id="quote-editor-form" class="quote-editor-layout"><div class="row sp"><h2 id="quote-editor-title">Your daily quotes</h2><button type="button" class="quote-close" data-preview-act="quote-cancel" aria-label="Close quote editor">×</button></div><p class="quote-editor-intro">One quote each day, rotating through your collection. Edit any quote or import your own JSON file.</p><div class="row"><button type="button" class="btn sm" data-preview-act="quote-import">Import JSON</button><button type="button" class="btn sm" data-preview-act="quote-add">+ Add quote</button><span class="hint">${quoteDraft.length} quote${quoteDraft.length===1?"":"s"}</span></div><input type="file" id="quote-json-file" accept=".json,application/json" hidden><p id="quote-error" class="quote-error" role="alert"></p><div class="quote-list">${quoteDraft.map(quoteEntry).join("")||`<p class="muted">Add at least one quote before saving.</p>`}</div><details><summary class="hint">Supported JSON format</summary><pre class="quote-json-format">${esc(JSON.stringify({quotes:[{text:"Your quote here",author:"Author name"}]},null,2))}</pre><p class="hint" style="margin-top:8px">A list of plain quote strings also works. Import replaces this draft collection; Save applies it.</p></details><footer class="quote-editor-footer"><div class="row sp"><span class="hint">Saved only in this preview browser</span><div class="row"><button type="button" class="btn sm" data-preview-act="quote-cancel">Cancel</button><button type="submit" class="btn pri sm">Save quotes</button></div></div></footer></form>`;
}
function openQuoteEditor(trigger){
  quoteDraft=structuredClone(previewQuotes);quoteTrigger=trigger;drawQuoteEditor();document.getElementById("quote-dialog").showModal();
}
function closeQuoteEditor(){document.getElementById("quote-dialog").close();quoteTrigger?.focus();}
function runCseSearch(value){PREVIEW_SEARCH.query=String(value).trim().slice(0,160);PREVIEW_SEARCH.draft=PREVIEW_SEARCH.query;PREVIEW_SEARCH.page=1;render();}
const basePreviewHeader=header,basePreviewHome=viewHome;
header=function(){
  const html=basePreviewHeader(),spaceStart=html.indexOf('<div class="spaces"'),navStart=html.indexOf('<nav class="tabs"'),spaces=html.slice(spaceStart,navStart),nav=html.slice(navStart);
  return `<header class="preview-header"><div class="preview-header-top"><button class="logo" data-act="home" aria-label="Solo Leveling, go to home">Solo Leveling</button><div class="hdr-r"><span class="status">Preview · saved in this browser only</span>${themeBtn()}</div></div><div class="spaces-quote-row">${spaces}<div class="quote-dock">${quoteCard()}</div></div>${nav}</header>`;
};
viewHome=function(){
  if(S.space==="cse"&&S.view==="search")return viewCseSearch();
  const body=basePreviewHome();if(S.space!=="cse")return body;
  const end=body.indexOf('</div>')+6;
  return `<div class="cse-page-title">${body.slice(0,end)}<button class="btn search-launch" data-preview-act="search-open">${SEARCH_ICON}Search questions</button></div>${body.slice(end)}`;
};
const basePreviewRender=render;
render=function(){basePreviewRender();app.insertAdjacentHTML("afterbegin",'<div class="preview-notice"><strong>Design preview · sample data</strong><span>Separate copy · no cloud connection · original website unchanged</span></div>');};
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-preview-act]");if(!el)return;
  switch(el.dataset.previewAct){
    case "search-open":if(S.space!=="cse")return;S.view="search";S.tab="practice";S.quiz=null;render();document.getElementById("cse-search-input").focus();window.scrollTo(0,0);break;
    case "search-back":S.view="home";render();window.scrollTo(0,0);break;
    case "search-suggestion":runCseSearch(el.dataset.value);break;
    case "search-page":PREVIEW_SEARCH.page=Number(el.dataset.value);render();document.getElementById("cse-search-form").scrollIntoView({block:"start"});break;
    case "quote-edit":openQuoteEditor(el);break;
    case "quote-cancel":closeQuoteEditor();break;
    case "quote-add":if(quoteDraft.length>=500){document.getElementById("quote-error").textContent="The collection can contain up to 500 quotes.";break;}quoteDraft.push({text:"",author:""});drawQuoteEditor();document.getElementById("quote-text-"+(quoteDraft.length-1)).focus();break;
    case "quote-remove":quoteDraft.splice(Number(el.dataset.value),1);drawQuoteEditor();break;
    case "quote-import":document.getElementById("quote-json-file").click();break;
  }
});
document.addEventListener("input",e=>{
  if(e.target.id==="cse-search-input")PREVIEW_SEARCH.draft=e.target.value;
  if(e.target.hasAttribute("data-quote-text"))quoteDraft[Number(e.target.dataset.quoteText)].text=e.target.value;
  if(e.target.hasAttribute("data-quote-author"))quoteDraft[Number(e.target.dataset.quoteAuthor)].author=e.target.value;
});
document.addEventListener("change",async e=>{
  if(e.target.id==="search-related"){PREVIEW_SEARCH.related=e.target.checked;PREVIEW_SEARCH.page=1;render();}
  if(e.target.id!=="quote-json-file")return;
  const file=e.target.files?.[0];if(!file)return;
  try{if(file.size>1048576)throw Error("Choose a JSON file smaller than 1 MB.");const imported=parseQuoteJson(await file.text());if(!document.getElementById("quote-dialog").open)return;quoteDraft=imported;drawQuoteEditor();}
  catch(err){document.getElementById("quote-error").textContent=err instanceof SyntaxError?"This file is not valid JSON. Your saved quotes have not changed.":err.message;}
});
document.addEventListener("submit",e=>{
  if(e.target.id==="cse-search-form"){e.preventDefault();if(S.space==="cse")runCseSearch(document.getElementById("cse-search-input").value);}
  if(e.target.id==="quote-editor-form"){
    e.preventDefault();try{const valid=parseQuoteJson(JSON.stringify(quoteDraft));localStorage.setItem(PREVIEW_QUOTES_KEY,JSON.stringify(valid));previewQuotes=valid;closeQuoteEditor();render();document.querySelector('[data-preview-act="quote-edit"]')?.focus();toast("Quote collection saved in preview");}
    catch(err){document.getElementById("quote-error").textContent=err.message;}
  }
});
// Refresh the daily card after midnight when the page becomes visible again.
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&!document.getElementById("quote-dialog").open&&!S.quiz){const card=document.querySelector(".quote-card");if(card)card.outerHTML=quoteCard();}});
function previewDemoPacks(){
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
async function bootDesignPreview(){
  const dialog=document.createElement("dialog");dialog.id="quote-dialog";dialog.className="quote-dialog";dialog.setAttribute("aria-labelledby","quote-editor-title");document.body.appendChild(dialog);
  dialog.addEventListener("cancel",()=>{quoteDraft=[];});
  S.space="cse";S.auth="none";
  const backend=localBackend(PREVIEW_BANK_KEY),existing=await backend.load();
  if(!existing.packs.length){for(const pack of previewDemoPacks())await backend.savePack(pack);}
  // Supplement only the untouched sample bank. Never replace imported content.
  else if(existing.packs.length===1&&existing.packs[0].id==="cse::design-demo"&&existing.packs[0].sample){await backend.savePack(previewDemoPacks()[1]);}
  await openBank(backend,"browser");
}
bootDesignPreview();
