const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
const core=script.slice(0,script.lastIndexOf('\nrender();'));
const quotes=text=>[{text,author:'Author'}];

function fixture({storage=new Map(),rows=new Map(),preview=false}={}){
  const events={},calls=[],messages=[],nodes=new Map(),fail={read:false,write:false,cache:false},hooks={};
  function node(id){
    if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',open:false,focus(){},querySelectorAll(){return [];},showModal(){this.open=true;},close(){this.open=false;},addEventListener(){}});
    return nodes.get(id);
  }
  const sb={from(table){
    assert.equal(table,'quote_collections','Quote requests must never modify packs or progress');
    return {
      select(fields){return {eq(column,user){
        assert.equal(column,'user_id');
        return {async maybeSingle(){
          calls.push({kind:'read',user,fields});
          if(fail.read)throw Error('offline');
          return {data:rows.has(user)?{quotes:structuredClone(rows.get(user))}:null,error:null};
        }};
      }};},
      upsert(row,options){return {async select(fields){
        calls.push({kind:'write',row:structuredClone(row),options,fields});
        if(hooks.beforeWrite)await hooks.beforeWrite(row);
        if(fail.write)return {data:null,error:{message:'offline',code:'NETWORK'}};
        if(options.ignoreDuplicates&&rows.has(row.user_id))return {data:[],error:null};
        rows.set(row.user_id,structuredClone(row.quotes));
        return {data:[{quotes:structuredClone(row.quotes)}],error:null};
      }};}
    };
  }};
  const context=vm.createContext({
    TextEncoder,URL,URLSearchParams,structuredClone,
    location:{hostname:preview?'localhost':'example.test',search:preview?'?preview=1':''},
    setTimeout:()=>0,clearTimeout(){},sb,
    localStorage:{getItem:key=>storage.get(key)??null,setItem(key,value){if(fail.cache)throw Error('cache blocked');storage.set(key,value);}},
    document:{visibilityState:'visible',getElementById:node,querySelector:selector=>node(selector),addEventListener(type,fn){(events[type]??=[]).push(fn);}},
    window:{scrollTo(){}}
  });
  vm.runInContext(core,context);
  context.messages=messages;
  vm.runInContext('render=()=>{};toast=message=>messages.push(message);',context);
  const run=code=>vm.runInContext(code,context);
  function account(user='alice'){
    run(`S.user={id:${JSON.stringify(user)}};S.storage='cloud';S.ready=true;S.store=supaBackend(sb,${JSON.stringify(user)});`);
  }
  return {run,account,storage,rows,calls,messages,nodes,node,events,fail,hooks,context};
}

test('a saved collection loads on another device using the same account',async()=>{
  const rows=new Map(),a=fixture({rows});a.account();
  await a.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(a.calls.filter(c=>c.kind==='write').length,0,'Defaults must not seed the live backend');
  assert.equal(await a.run(`persistQuoteCollection(${JSON.stringify(quotes('My quote'))})`),true);
  const b=fixture({rows});b.account();await b.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(b.run('dailyQuotes[0].text'),'My quote');
  assert.equal(b.run('quoteStorageLabel()'),'Saved to your account · available on your devices');
  assert.equal(b.calls.filter(c=>c.kind==='write').length,0);
});

test('existing browser quotes migrate once without changing packs or progress',async()=>{
  const key='solo-daily-quotes-v1',storage=new Map([[key,JSON.stringify(quotes('Existing browser quote'))]]),f=fixture({storage});f.account();
  const before=f.run('JSON.stringify({packs:S.packs,prog:S.prog})');
  await f.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(f.rows.get('alice')[0].text,'Existing browser quote');
  assert.equal(f.calls.find(c=>c.kind==='write').options.ignoreDuplicates,true);
  assert.equal(storage.get(key),JSON.stringify(quotes('Existing browser quote')));
  assert.equal(f.run('JSON.stringify({packs:S.packs,prog:S.prog})'),before);
  await f.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(f.calls.filter(c=>c.kind==='write').length,1);
});

test('browser migration cannot overwrite an existing or concurrently saved account collection',async()=>{
  const storage=new Map([['solo-daily-quotes-v1',JSON.stringify(quotes('Browser copy'))]]),f=fixture({storage});f.account();
  f.hooks.beforeWrite=()=>f.rows.set('alice',quotes('Other device won the race'));
  await f.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(f.run('dailyQuotes[0].text'),'Other device won the race');
  const writes=f.calls.filter(c=>c.kind==='write').length;
  await f.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(f.calls.filter(c=>c.kind==='write').length,writes);
  assert.equal(f.rows.get('alice')[0].text,'Other device won the race');
});

test('failed migration preserves the browser copy for a later retry',async()=>{
  const storage=new Map([['solo-daily-quotes-v1',JSON.stringify(quotes('Keep me'))]]),f=fixture({storage});f.account();f.fail.write=true;
  await f.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(f.run('quoteSync.state'),'error');assert.equal(f.run('dailyQuotes[0].text'),'Keep me');
  assert.equal(f.rows.size,0);assert.ok(storage.get('solo-daily-quotes-v1').includes('Keep me'));
  f.fail.write=false;await f.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(f.rows.get('alice')[0].text,'Keep me');
});

test('failed save retains the editor draft and previous saved collection, then retries successfully',async()=>{
  const f=fixture({rows:new Map([['alice',quotes('Saved quote')]])});f.account();await f.run('loadStoredQuotes(S.store,S.storage)');
  f.run(`quoteDraft=${JSON.stringify(quotes('New draft'))};`);f.node('quote-dialog').open=true;f.fail.write=true;
  await f.events.submit[0]({target:{id:'quote-editor-form'},preventDefault(){}});
  assert.equal(f.node('quote-dialog').open,true);assert.equal(f.run('quoteDraft[0].text'),'New draft');
  assert.equal(f.run('dailyQuotes[0].text'),'Saved quote');assert.equal(f.rows.get('alice')[0].text,'Saved quote');
  assert.equal(f.run('quoteSaving'),false);assert.equal(f.messages.length,0);assert.match(f.node('quote-error').textContent,/could not sync/);
  f.fail.write=false;await f.events.submit[0]({target:{id:'quote-editor-form'},preventDefault(){}});
  assert.equal(f.node('quote-dialog').open,false);assert.equal(f.rows.get('alice')[0].text,'New draft');
  assert.deepEqual(f.messages,['Quote collection saved to your account']);
});

test('success is not reported before the backend confirms the save and duplicate submissions are ignored',async()=>{
  const f=fixture();f.account();await f.run('loadStoredQuotes(S.store,S.storage)');
  let finish;f.hooks.beforeWrite=()=>new Promise(resolve=>{finish=resolve;});
  f.run(`quoteDraft=${JSON.stringify(quotes('Wait for backend'))};`);f.node('quote-dialog').open=true;
  const pending=f.events.submit[0]({target:{id:'quote-editor-form'},preventDefault(){}});
  assert.equal(f.run('quoteSaving'),true);assert.equal(f.messages.length,0);assert.equal(f.node('quote-dialog').open,true);
  await f.events.submit[0]({target:{id:'quote-editor-form'},preventDefault(){}});
  assert.equal(f.calls.filter(c=>c.kind==='write').length,1);
  finish();await pending;assert.deepEqual(f.messages,['Quote collection saved to your account']);
});

test('account caches and the legacy browser collection cannot leak to another signed-in account',async()=>{
  const f=fixture({storage:new Map([['solo-daily-quotes-v1',JSON.stringify(quotes('Alice legacy'))]])});f.account();
  await f.run('loadStoredQuotes(S.store,S.storage)');f.run('resetData()');f.account('bob');
  await f.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(f.rows.has('bob'),false);assert.notEqual(f.run('dailyQuotes[0].text'),'Alice legacy');
  assert.equal(f.storage.get('solo-daily-quotes-v1:legacy-owner'),'cloud:alice');
  f.account('alice');f.fail.read=true;await f.run('loadStoredQuotes(S.store,S.storage)');
  assert.equal(f.run('dailyQuotes[0].text'),'Alice legacy');assert.equal(f.run('quoteSync.state'),'error');
});

test('a stale account load is ignored after switching accounts',async()=>{
  const f=fixture();let finish;
  f.context.waitForA=new Promise(resolve=>{finish=resolve;});
  f.run("S.store={quoteOwner:'cloud:alice',loadQuotes:()=>waitForA};S.storage='cloud';");
  const pending=f.run('loadStoredQuotes(S.store,S.storage)');
  f.run('resetQuoteSession()');f.account('bob');f.rows.set('bob',quotes('Bob quote'));await f.run('loadStoredQuotes(S.store,S.storage)');
  finish(quotes('Alice quote'));await pending;
  assert.equal(f.run('dailyQuotes[0].text'),'Bob quote');assert.equal(f.run('quoteSync.owner'),'cloud:bob');
});

test('a save finishing after sign out cannot repopulate the previous account in memory',async()=>{
  const f=fixture();f.account();await f.run('loadStoredQuotes(S.store,S.storage)');let finish;
  f.hooks.beforeWrite=()=>new Promise(resolve=>{finish=resolve;});
  const pending=f.run(`persistQuoteCollection(${JSON.stringify(quotes('Alice quote'))})`);
  f.run('resetData()');finish();assert.equal(await pending,false);
  assert.equal(f.run('S.store'),null);assert.equal(f.run('quoteSync.owner'),'');assert.notEqual(f.run('dailyQuotes[0].text'),'Alice quote');
});

test('quote load failures leave the question bank usable',async()=>{
  const f=fixture();
  await f.run(`openBank({quoteOwner:'cloud:alice',load:async()=>({packs:[{id:'paper',questions:[{no:1,text:'Question',subject:'Polity',topic:'Rights',options:{A:'Yes'},answer:'A'}]}],prog:{}}),loadQuotes:async()=>{throw Object.assign(Error('Missing table'),{code:'PGRST205'});}},'cloud')`);
  assert.equal(f.run('S.ready'),true);assert.equal(f.run('S.bankError'),'');assert.equal(f.run('S.qs.length'),1);
  assert.equal(f.run('quoteSync.state'),'error');assert.match(f.run('quoteSync.error'),/one-time setup/);
});

test('a slow quote request does not hold up the loaded question bank',async()=>{
  const f=fixture();let finish;
  f.context.waitForQuotes=new Promise(resolve=>{finish=resolve;});
  f.run('const rendered=[];render=()=>rendered.push({ready:S.ready,questions:S.qs.length});');
  const pending=f.run(`openBank({quoteOwner:'cloud:alice',load:async()=>({packs:[{id:'paper',questions:[{no:1,text:'Question',subject:'Polity',topic:'Rights',options:{A:'Yes'},answer:'A'}]}],prog:{}}),loadQuotes:()=>waitForQuotes},'cloud')`);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.run('rendered.some(view=>view.ready&&view.questions===1)'),true);
  finish(null);await pending;
});

test('backend saves still succeed if browser caching is blocked',async()=>{
  const f=fixture();f.account();await f.run('loadStoredQuotes(S.store,S.storage)');f.fail.cache=true;
  assert.equal(await f.run(`persistQuoteCollection(${JSON.stringify(quotes('Cloud survives'))})`),true);
  assert.equal(f.rows.get('alice')[0].text,'Cloud survives');assert.equal(f.run('quoteSync.state'),'ready');
});

test('browser previews keep their own storage and never call the account backend',async()=>{
  const f=fixture({preview:true});f.run("S.storage='browser';S.ready=true;S.store=localBackend('isolated-test-bank');");
  await f.run('loadStoredQuotes(S.store,S.storage)');await f.run(`persistQuoteCollection(${JSON.stringify(quotes('Preview only'))})`);
  assert.ok(f.storage.has('solo-daily-quotes-preview-v1'));assert.equal(f.storage.has('solo-daily-quotes-v1'),false);
  assert.equal(f.calls.length,0);assert.equal(f.run('quoteStorageLabel()'),'Saved in this browser only');
});

test('invalid quote collections never reach the backend',async()=>{
  const f=fixture();f.account();await f.run('loadStoredQuotes(S.store,S.storage)');
  for(const rows of [[],[{text:''}],Array.from({length:501},()=>({text:'Too many'}))])await assert.rejects(f.run(`persistQuoteCollection(${JSON.stringify(rows)})`));
  assert.equal(f.calls.filter(c=>c.kind==='write').length,0);
});

test('returning to the page refreshes account quotes but never replaces an open draft',async()=>{
  const f=fixture({rows:new Map([['alice',quotes('Old quote')]])});f.account();await f.run('loadStoredQuotes(S.store,S.storage)');
  f.rows.set('alice',quotes('Edited on another device'));f.node('quote-dialog').open=true;
  await Promise.all(f.events.visibilitychange.map(fn=>fn()));assert.equal(f.run('dailyQuotes[0].text'),'Old quote');
  f.node('quote-dialog').open=false;await Promise.all(f.events.visibilitychange.map(fn=>fn()));
  assert.equal(f.run('dailyQuotes[0].text'),'Edited on another device');
});
