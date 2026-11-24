"use strict";
// Atomic, immutable browser entries prevent one map tab from replacing another's collection.
const MappingStorage=(()=>{
  const key='solo-ui-lab-rivers-v1',prefix=key+':change:';let stamp=0;
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const safe=k=>!['__proto__','constructor','prototype'].includes(k);
  const copy=v=>JSON.parse(JSON.stringify(v));
  function apply(data,patch){
    for(const [id,delta] of Object.entries(patch.history||{})){
      if(!safe(id)||!object(delta))continue;
      const row=data.history[id]||(data.history[id]={seen:0,correct:0,review:0,last:0});
      for(const field of ['seen','correct','review'])if(Number.isFinite(delta[field]))row[field]=Math.max(0,(Number(row[field])||0)+delta[field]);
      if(Number.isFinite(delta.last))row.last=Math.max(Number(row.last)||0,delta.last);
    }
    for(const [id,fields] of Object.entries(patch.edits||{})){
      if(!safe(id))continue;
      if(fields===null){delete data.edits[id];continue;}
      if(!object(fields))continue;
      const row=data.edits[id]||(data.edits[id]={});
      for(const [field,value] of Object.entries(fields))if(['name','capital','note','source','mouth','route','region'].includes(field)){if(value===null)delete row[field];else if(typeof value==='string')row[field]=value;}
    }
    for(const [field,value] of Object.entries(patch.mapSettings||{}))if(['latitudes','sidebarWidth','stateBorders','indiaCountryBorders','worldBorders'].includes(field))data.mapSettings[field]=value;
    if(['light','dark'].includes(patch.theme))data.theme=patch.theme;
    return data;
  }
  function read(storage=localStorage){
    const base=JSON.parse(storage.getItem(key)||'{}');if(!object(base))throw Error('Mapping storage is invalid.');
    const data={...base,history:object(base.history)?copy(base.history):{},edits:object(base.edits)?copy(base.edits):{},mapSettings:object(base.mapSettings)?copy(base.mapSettings):{}},entries=[],covered=new Set(Array.isArray(base.covered)?base.covered:[]);
    for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(prefix))continue;const row=JSON.parse(storage.getItem(k));if(object(row)&&!covered.has(row.id)&&object(row.patch))entries.push(row);}
    entries.sort((a,b)=>a.time-b.time||String(a.id).localeCompare(String(b.id)));for(const row of entries)apply(data,row.patch);
    data.covered=[...new Set([...covered,...entries.map(row=>row.id)])];data.changeTime=entries.reduce((n,row)=>Math.max(n,Number(row.time)||0),Number(base.changeTime)||0);return data;
  }
  function diff(before,after){
    const patch={history:{},edits:{},mapSettings:{}};
    for(const [id,row] of Object.entries(after.history||{})){const old=before.history?.[id]||{},delta={};for(const field of ['seen','correct','review']){const n=(Number(row[field])||0)-(Number(old[field])||0);if(n)delta[field]=n;}if(row.last!==old.last)delta.last=row.last;if(Object.keys(delta).length)patch.history[id]=delta;}
    for(const id of new Set([...Object.keys(before.edits||{}),...Object.keys(after.edits||{})])){
      const a=after.edits?.[id],b=before.edits?.[id];if(!a){patch.edits[id]=null;continue;}const fields={};for(const k of new Set([...Object.keys(a),...Object.keys(b||{})]))if(a[k]!==b?.[k])fields[k]=a[k]??null;if(Object.keys(fields).length)patch.edits[id]=fields;
    }
    for(const [k,v] of Object.entries(after.mapSettings||{}))if(v!==before.mapSettings?.[k])patch.mapSettings[k]=v;
    if(after.theme!==before.theme)patch.theme=after.theme;
    return patch;
  }
  const id=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
  function write(patch,storage=localStorage){
    const current=read(storage);if(!patch.theme&&!Object.keys(patch.history||{}).length&&!Object.keys(patch.edits||{}).length&&!Object.keys(patch.mapSettings||{}).length)return current;stamp=Math.max(Date.now(),stamp+1,(current.changeTime||0)+1);const row={id:id(),time:stamp,patch};
    storage.setItem(prefix+row.id,JSON.stringify(row));return read(storage);
  }
  function restore(incoming,storage=localStorage){
    // Cover exactly the entries incorporated in this snapshot. A concurrent append remains visible.
    const current=read(storage);
    storage.setItem(key,JSON.stringify({...incoming,covered:current.covered,changeTime:current.changeTime,history:{...current.history,...incoming.history},edits:{...current.edits,...incoming.edits}}));
  }
  return {key,prefix,read,diff,write,restore};
})();
