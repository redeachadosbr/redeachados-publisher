// Local logic tests with a small DOM/Chrome API simulation. This is not browser QA.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const background=fs.readFileSync(path.join(__dirname,'../background.js'),'utf8');
const content=fs.readFileSync(path.join(__dirname,'../content.js'),'utf8').replace('  start();','  globalThis.testApi={tick,start,targetVerify,refusalModal,tokenIn,singleListing};');
const ITEM='MLB7218285156', SKU='DF2524', KEY='ra_ml_verify_product_auto_v4';
function worker() {
  let listener, now=1000000;
  const data={}, tabs=new Map(), checks=[];
  const api={confirm:async itemId=>({ok:true,itemId,confirmed:!!data[KEY]?.actions?.return,status:'active',catalogListing:false,verifyProductPending:!data[KEY]?.actions?.return,message:'Estado consultado no teste.'})};
  class Clock extends Date {static now(){return now;}}
  const ctx=vm.createContext({URL,Date:Clock,console,setTimeout:()=>1,clearTimeout(){},chrome:{tabs:{query:async()=>[{id:100,active:true,url:'https://redeachados-ml-publisher.onrender.com/'}],get:async id=>{if(!tabs.has(id))throw Error('closed');return tabs.get(id)();},sendMessage:async(id,msg)=>{checks.push(msg.itemId);return api.confirm(msg.itemId);}},storage:{local:{get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value)),remove:async keys=>keys.forEach(key=>delete data[key])}},runtime:{onMessage:{addListener:fn=>listener=fn}}}});
  vm.runInContext(background,ctx);
  const send=(message,sender)=>new Promise(resolve=>listener(message,sender,resolve));
  return {send,data,Clock,tabs,checks,api,flush:()=>vm.runInContext('reconcile()',ctx),step:(ms=1500)=>now+=ms};
}
function environment(w,tabId=1) {
  let doc, ctx, loc={pathname:'/anuncios',href:'https://vendedores.mercadolivre.com.br/anuncios',hash:''};
  const events=[];
  class Element {
    constructor(tag,attrs={},...children){this.tagName=tag.toUpperCase();this.attrs={...attrs};this.children=[];this.parentElement=null;this.style={};this._text='';this._value=attrs.value||'';this.onclick=null;this.handlers={};this.disabled=!!attrs.disabled;this.append(...children);}
    get id(){return this.attrs.id||'';} set id(value){this.attrs.id=value;}
    get placeholder(){return this.attrs.placeholder||'';} get type(){return this.attrs.type||'';}
    get href(){return this.attrs.href?new URL(this.attrs.href,loc.href).href:'';}
    get isConnected(){return this===doc?.documentElement||!!this.parentElement?.isConnected;}
    get textContent(){return [this._text,...this.children.map(c=>c.textContent)].join(' ');} set textContent(v){this._text=String(v);this.children=[];}
    get innerText(){return this.textContent;}
    get value(){return this._value;} set value(v){this._value=v;}
    append(...children){for(const c of children){if(typeof c==='string')this._text+=(this._text?' ':'')+c;else this.appendChild(c);}}
    appendChild(c){c.parentElement=this;this.children.push(c);return c;}
    replaceChildren(...children){for(const c of this.children)c.parentElement=null;this.children=[];this._text='';this.append(...children);}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(x=>x!==this);this.parentElement=null;}
    getAttribute(key){return this.attrs[key]??null;} setAttribute(key,value){this.attrs[key]=value;}
    matches(selector){return selector.split(',').some(raw=>{
      const s=raw.trim();let match;
      if(s.startsWith('#'))return this.id===s.slice(1);
      if(s.startsWith('.'))return (this.attrs.class||'').split(' ').includes(s.slice(1));
      match=s.match(/^([a-z0-9-]+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/i);
      if(!match)return false;
      return (!match[1]||this.tagName===match[1].toUpperCase())&&(!match[2]||(Object.hasOwn(this.attrs,match[2])&&(match[3]===undefined||this.attrs[match[2]]===match[3])));
    });}
    closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null;}
    contains(other){for(let n=other;n;n=n.parentElement)if(n===this)return true;return false;}
    querySelectorAll(selector){const out=[];const visit=n=>{for(const c of n.children){if(c.matches(selector))out.push(c);visit(c);}};visit(this);return out;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    getBoundingClientRect(){return this.attrs._rect||{width:100,height:30,top:0,bottom:30,left:0,right:100};}
    scrollIntoView(){} focus(){}
    addEventListener(name,fn){(this.handlers[name]||=[]).push(fn);}
    dispatchEvent(event){for(const fn of this.handlers[event.type]||[])fn(event);return true;}
    click(){for(let n=this;n;n=n.parentElement){if(n.onclick)n.onclick({target:this,preventDefault(){}});}}
    cloneNode(){const copy=new Element(this.tagName,{...this.attrs},this._text);for(const c of this.children)copy.appendChild(c.cloneNode(true));return copy;}
  }
  class Input extends Element {get value(){return this._value;}set value(v){this._value=v;}}
  class Area extends Input {get value(){return this._value;}set value(v){this._value=v;}}
  const el=(tag,attrs={},...children)=>new (tag==='textarea'?Area:tag==='input'?Input:Element)(tag,attrs,...children);
  doc={documentElement:el('html'),body:el('body'),querySelectorAll:s=>doc.documentElement.querySelectorAll(s),querySelector:s=>doc.documentElement.querySelector(s),createElement:tag=>el(tag)};
  doc.documentElement.appendChild(doc.body);
  const sender=()=>({frameId:0,url:loc.href,tab:{id:tabId,url:loc.href}});
  w.tabs.set(tabId,()=>sender().tab);
  const chrome={runtime:{lastError:null,sendMessage:(m,cb)=>{w.send(m,sender()).then(cb);}}};
  ctx=vm.createContext({document:doc,location:loc,chrome,console,Date:w.Clock,URL,URLSearchParams,HTMLTextAreaElement:Area,HTMLInputElement:Input,Event:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},KeyboardEvent:class{constructor(type,opts){this.type=type;Object.assign(this,opts);}},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),setTimeout:()=>1,clearTimeout(){},setInterval(){},MutationObserver:class{observe(){}}});
  ctx.window=ctx;ctx.top=ctx;
  vm.runInContext(content,ctx);
  const navigate=url=>{loc.href='https://vendedores.mercadolivre.com.br'+url;loc.pathname=url;};
  const screen=(...elements)=>doc.body.replaceChildren(...elements);
  const button=(name,action,tag='button')=>{const b=el(tag,{},name);b.onclick=()=>{events.push(name);action?.();};return b;};
  return {ctx,api:ctx.testApi,el,doc,loc,events,navigate,screen,button,sender,tick:async()=>{w.step();await ctx.testApi.tick();await w.flush();}};
}
async function begin(w,e,id='run1',itemId=ITEM) {const result=await w.send({type:'RA_BEGIN',marker:{runId:id,itemId,sku:itemId===ITEM?SKU:'NEXT',userProductId:itemId===ITEM?'MLBU4369209785':''}},e.sender());await w.flush();if(result.state?.runId===w.data[KEY]?.runId)result.state=structuredClone(w.data[KEY]);return result;}
function recording(e,{noResponse=false}={}) {
  const {el,screen,button,navigate}=e;
  const result=()=>screen(el('h1',{},'Não foi possível verificar seu produto de catálogo'),el('p',{},'Você continuará vendendo com seu anúncio tradicional normalmente.'),button('Ir para elegíveis para competir',()=>{throw Error('Wrong return');}),button('Ir para anúncios',()=>{navigate('/anuncios/MLBU4369209785/modificar/test');screen(el('h1',{},'Anúncio tradicional'));}));
  const form=()=>{const field=el('textarea');screen(el('h2',{},'Digite as principais diferenças'),field,button('Enviar',()=>{e.sent=field.value;if(!noResponse)result();}));};
  const choices=()=>{
    navigate('/publicar/catalogo/'+ITEM);
    const accept=button('Continuar',()=>{throw Error('Accepted catalog');});
    const decline=button('Não encontro meu produto',()=>{
      e.doc.body.appendChild(el('div',{role:'dialog','aria-modal':'true'},el('h2',{},'Não encontrou seu produto?'),el('p',{},'Se continuar, você seguirá vendendo sem competir.'),button('Continuar',form)));
    });
    screen(el('h1',{},'Produtos de catálogo sugeridos'),accept,decline);
  };
  screen(el('main',{},el('article',{},el('span',{},'#72182851560'),el('p',{},'SKU DF25240'),button('Verificar produto',()=>{throw Error('Wrong item');})),el('article',{},el('section',{},el('span',{},'#7218285156'),el('p',{},'SKU DF2524')),el('section',{},button('Verificar produto',choices,'span')))));
  return {result,form,choices};
}
test('recorded sequence refuses catalog, fills preference, receives result and returns',async()=>{
  const w=worker(),e=environment(w);recording(e);await begin(w,e);
  for(let i=0;i<8;i++)await e.tick();
  assert.equal(w.data[KEY].status,'finished');
  assert.deepEqual(e.events,['Verificar produto','Não encontro meu produto','Continuar','Enviar','Ir para anúncios']);
  assert.match(e.sent,/Solicito manter este anúncio tradicional/);
});
test('unmatched item and partial IDs do not inherit authority from hash or banner',async()=>{
  const w=worker(),e=environment(w);await begin(w,e);
  e.screen(e.el('article',{},e.el('p',{},'SKU DF25240 #72182851560'),e.button('Verificar produto',()=>{throw Error('Wrong item');})));
  for(let i=0;i<3;i++)await e.tick();
  assert.deepEqual(e.events,[]);assert.deepEqual(Object.keys(w.data[KEY].actions),[]);
});
test('a target without an action cannot borrow the button of another listing',async()=>{
  const w=worker(),e=environment(w);await begin(w,e);
  e.screen(e.el('main',{},e.el('article',{},e.el('p',{},'SKU DF2524 #7218285156')),e.el('article',{},e.el('p',{},'SKU OTHER #1234567890'),e.button('Verificar produto',()=>{throw Error('Wrong item');}))));
  for(let i=0;i<3;i++)await e.tick();assert.deepEqual(e.events,[]);
});
test('an unconfirmed send never finishes or repeats; generic error is not success',async()=>{
  const w=worker(),e=environment(w);recording(e,{noResponse:true});await begin(w,e);
  for(let i=0;i<10;i++)await e.tick();
  assert.equal(e.events.filter(x=>x==='Enviar').length,1);assert.equal(w.data[KEY].status,'running');assert.equal(w.data[KEY].responseConfirmed,false);
  e.screen(e.el('h1',{},'Não foi possível verificar seu produto de catálogo'),e.el('p',{},'Tente novamente mais tarde'),e.button('Ir para anúncios',()=>{throw Error('Unconfirmed return');}));
  await e.tick();assert.equal(w.data[KEY].responseConfirmed,false);
});
test('stop after send prevents return when response arrives',async()=>{
  const w=worker(),e=environment(w),flow=recording(e,{noResponse:true});await begin(w,e);
  for(let i=0;i<6;i++)await e.tick();
  await w.send({type:'RA_STOP',runId:'run1'},e.sender());flow.result();await e.tick();
  assert.equal(w.data[KEY].status,'stopped');assert.equal(e.events.includes('Ir para anúncios'),false);
});
test('new tab ownership is restricted to the expected catalog route after verify',async()=>{
  const w=worker(),a=environment(w,1),b=environment(w,2);await begin(w,a);
  b.navigate('/publicar/catalogo/'+ITEM);
  assert.equal((await w.send({type:'RA_GET'},b.sender())).granted,false);
  w.step();await w.send({type:'RA_ACTION',runId:'run1',action:'verify'},a.sender());
  b.navigate('/publicar/catalogo/MLB1234567890');assert.equal((await w.send({type:'RA_GET'},b.sender())).granted,false);
  b.navigate('/publicar/catalogo/'+ITEM);assert.equal((await w.send({type:'RA_GET'},b.sender())).granted,true);
  assert.equal((await w.send({type:'RA_GET'},a.sender())).granted,false);
});
test('simultaneous action requests are serialized and only one receives permission',async()=>{
  const w=worker(),e=environment(w);await begin(w,e);w.step();
  const responses=await Promise.all(Array.from({length:20},()=>w.send({type:'RA_ACTION',runId:'run1',action:'verify'},e.sender())));
  assert.equal(responses.filter(x=>x.ok).length,1);
  const duplicate=environment(w,2);assert.equal((await begin(w,duplicate)).granted,false);
});
test('finished run does not restart on same marker; another explicit run can start',async()=>{
  const w=worker(),e=environment(w);recording(e);await begin(w,e);
  for(let i=0;i<8;i++)await e.tick();
  const before=e.events.length;await begin(w,e);await e.tick();assert.equal(e.events.length,before);assert.equal(w.data[KEY].status,'finished');
  const next=await begin(w,e,'run2');assert.equal(next.state.status,'running');assert.deepEqual(Object.keys(next.state.actions),[]);
});
test('regression from screenshot: stale V1.3 run is checked then next MLB starts without STOP',async()=>{
  const w=worker(),previous=environment(w,1),next=environment(w,2);
  await begin(w,previous);
  w.data[KEY]={...w.data[KEY],lastRemoteAttemptAt:0,remoteConfirmed:undefined,stage:'verify-clicked'};
  w.api.confirm=async itemId=>({ok:true,itemId,confirmed:itemId===ITEM,status:'active',catalogListing:false,verifyProductPending:itemId!==ITEM});
  const r=await begin(w,next,'run2','MLB7218132550');
  assert.equal(r.queued,true);assert.equal(w.data[KEY].itemId,'MLB7218132550');
  await w.flush();assert.equal(w.data[KEY].status,'running');
  const history=w.data.ra_ml_verify_history_v14;
  assert.equal(history[0].remoteConfirmed,true);assert.equal(history[0].itemId,ITEM);
  assert.equal(w.checks[w.checks.length-2],ITEM);assert.equal(w.checks.at(-1),'MLB7218132550');
  assert.equal((await w.send({type:'RA_ACTION',runId:'run1',action:'send'},previous.sender())).granted,undefined);
});
test('a still-pending active run keeps its successor queued and releases it after confirmation',async()=>{
  const w=worker(),previous=environment(w,1),next=environment(w,2);await begin(w,previous);
  const r=await begin(w,next,'run2','MLB7218132550');assert.equal(r.queued,true);
  w.step(6000);await w.flush();assert.equal(w.data[KEY].runId,'run1');
  assert.equal((await w.send({type:'RA_GET',runId:'run2'},next.sender())).queued,true);
  w.api.confirm=async itemId=>({ok:true,itemId,confirmed:true,status:'active',catalogListing:false,verifyProductPending:false});
  w.step(6000);await w.flush();assert.equal(w.data[KEY].runId,'run2');
});
test('a new request for an already completed SKU is confirmed before any click',async()=>{
  const w=worker(),e=environment(w);recording(e);
  w.api.confirm=async itemId=>({ok:true,itemId,confirmed:true,status:'active',catalogListing:false,verifyProductPending:false});
  await begin(w,e);await e.tick();
  assert.equal(w.data[KEY].status,'finished');assert.equal(w.data[KEY].remoteConfirmed,true);assert.deepEqual(e.events,[]);
});
test('failed or mismatched API response does not mark previous complete or release successor',async()=>{
  const w=worker(),a=environment(w,1),b=environment(w,2);await begin(w,a);await begin(w,b,'run2','MLB7218132550');
  w.api.confirm=async()=>({ok:false,error:'Servidor indisponível'});w.step(6000);await w.flush();
  assert.equal(w.data[KEY].runId,'run1');assert.equal(w.data[KEY].remoteConfirmed,false);
  w.api.confirm=async()=>({ok:true,itemId:'MLB9999999999',confirmed:true,status:'active',catalogListing:false,verifyProductPending:false});
  w.step(6000);await w.flush();assert.equal(w.data[KEY].runId,'run1');
});
test('orphaned pending run is preserved for review while the requested next SKU advances',async()=>{
  const w=worker(),a=environment(w,1),b=environment(w,2);await begin(w,a);w.tabs.delete(1);
  await begin(w,b,'run2','MLB7218132550');w.step(6000);await w.flush();
  assert.equal(w.data[KEY].runId,'run2');
  const previous=w.data.ra_ml_verify_history_v14[0];assert.equal(previous.outcome,'pending');assert.equal(previous.remoteConfirmed,false);
});
test('a queued retry of the same SKU preserves send reservation and cannot submit twice',async()=>{
  const w=worker(),a=environment(w,1),b=environment(w,2);await begin(w,a);
  w.data[KEY].actions.send=w.Clock.now();w.data[KEY].lastActionAt=w.Clock.now();w.data[KEY].stage='sending';
  w.api.confirm=async itemId=>({ok:true,itemId,confirmed:false,status:'active',catalogListing:false,verifyProductPending:true});
  w.tabs.delete(1);await begin(w,b,'run2');w.step(6000);await w.flush();await w.flush();
  assert.equal(w.data[KEY].runId,'run2');assert.ok(w.data[KEY].actions.send);assert.equal(w.data[KEY].status,'awaiting-confirmation');
  const r=await w.send({type:'RA_ACTION',runId:'run2',action:'send'},b.sender());assert.equal(r.ok,false);
});
test('STOP remains responsive during remote verification and late success cannot start the queue',async()=>{
  const w=worker(),a=environment(w,1),b=environment(w,2);await begin(w,a);await begin(w,b,'run2','MLB7218132550');
  let finish,started=false;w.api.confirm=()=>new Promise(resolve=>{started=true;finish=resolve;});w.step(6000);
  const checking=w.flush();while(!started)await new Promise(resolve=>setImmediate(resolve));
  const stop=await w.send({type:'RA_STOP',runId:'run1'},a.sender());assert.equal(stop.state.status,'stopped');
  finish({ok:true,itemId:ITEM,confirmed:true,status:'active',catalogListing:false,verifyProductPending:false});await checking;
  assert.equal(w.data[KEY].status,'stopped');assert.equal(w.data[KEY].runId,'run1');assert.deepEqual(w.data.ra_ml_verify_queue_v14,[]);
});
test('closed queued tabs are discarded without losing another requested successor',async()=>{
  const w=worker(),a=environment(w,1),b=environment(w,2),c=environment(w,3);await begin(w,a);
  await begin(w,b,'run2','MLB7218132550');await begin(w,c,'run3','MLB9999999999');w.tabs.delete(2);
  w.api.confirm=async itemId=>({ok:true,itemId,confirmed:true,status:'active',catalogListing:false,verifyProductPending:false});w.step(6000);await w.flush();
  assert.equal(w.data[KEY].runId,'run3');
});

test('screenshot regression: opening-item accepts the single Verificar produto after ML rewrites MLB to a different MLBU route',async()=>{
  const w=worker(),e=environment(w);await begin(w,e);w.step();
  const reserved=await w.send({type:'RA_ACTION',runId:'run1',action:'edit'},e.sender());assert.equal(reserved.ok,true);
  e.navigate('/anuncios/MLBU9999999999/modificar/bomni/variation/186170068-update_omni/user_product_id');
  e.screen(e.el('h1',{},'Mesa Notebook iPad Portátil Porta Copo Caneta Pés Dobrável'),e.button('Verificar produto',()=>{}));
  await e.tick();
  assert.equal(e.events.filter(x=>x==='Verificar produto').length,1);
  assert.ok(w.data[KEY].actions.verify);
});

test('catalog suggestion always selects Não, é diferente before any positive catalog action',async()=>{
  const w=worker(),e=environment(w);await begin(w,e);w.step();
  const reserved=await w.send({type:'RA_ACTION',runId:'run1',action:'verify'},e.sender());assert.equal(reserved.ok,true);
  e.navigate('/publicar/catalogo/'+ITEM);
  e.screen(e.el('h1',{},'Verifique se o seu produto corresponde'),e.button('Sim, é o mesmo',()=>{throw Error('Must never accept catalog');}),e.button('Não, é diferente',()=>{}));
  await e.tick();
  assert.deepEqual(e.events,['Não, é diferente']);
  assert.ok(w.data[KEY].actions.different);
});


test('real-page regression: duplicate responsive Verificar produto controls choose the on-screen CTA on the bound MLBU edit page',async()=>{
  const w=worker(),e=environment(w);await begin(w,e);w.step();
  const reserved=await w.send({type:'RA_ACTION',runId:'run1',action:'edit'},e.sender());assert.equal(reserved.ok,true);
  e.navigate('/anuncios/MLBU4369034099/modificar/bomni/variation/186170068-update_omni/user_product_id');
  const off=e.el('button',{_rect:{width:160,height:40,top:-600,bottom:-560,left:10,right:170}},'Verificar produto');
  off.onclick=()=>e.events.push('OFFSCREEN');
  const on=e.el('button',{_rect:{width:160,height:40,top:650,bottom:690,left:150,right:310}},e.el('span',{},'Verificar produto'));
  on.onclick=()=>e.events.push('ONSCREEN');
  e.screen(e.el('h1',{},'Mesa Notebook iPad Portátil Porta Copo Caneta Pés Dobrável'),off,on);
  await e.tick();
  assert.deepEqual(e.events,['ONSCREEN']);
  assert.ok(w.data[KEY].actions.verify);
});

test('post-verify flow continues even when Mercado Livre rewrites the catalog path away from the original MLB',async()=>{
  const w=worker(),e=environment(w);await begin(w,e);w.step();
  const reserved=await w.send({type:'RA_ACTION',runId:'run1',action:'verify'},e.sender());assert.equal(reserved.ok,true);
  e.navigate('/publicar/catalogo/MLBU4369034099');
  const decline=e.button('Não encontro meu produto',()=>{});
  e.screen(e.el('h1',{},'Produtos de catálogo sugeridos'),decline,e.button('Continuar',()=>{throw Error('Must not accept catalog');}));
  await e.tick();
  assert.deepEqual(e.events,['Não encontro meu produto']);
  assert.ok(w.data[KEY].actions.decline);
});
