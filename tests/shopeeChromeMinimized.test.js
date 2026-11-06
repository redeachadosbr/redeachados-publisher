import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../chrome-extension-shopee/background.js',import.meta.url),'utf8');
test('uma única janela minimizada é reutilizada entre lotes e fechada somente por nonce/Manager autorizados',async()=>{
 const key='raCurveResearchWindow';
 const state={},calls=[];
 const listener=()=>{};
 const chrome={
  runtime:{onInstalled:{addListener:listener},onStartup:{addListener:listener},
   onMessage:{addListener:listener}},
  tabs:{
   onActivated:{addListener:listener},
   onUpdated:{addListener:listener,removeListener:listener},
   onRemoved:{addListener:listener},
   query:async()=>[{id:71,windowId:8}],
   get:async id=>({id,windowId:8,status:'complete'}),
   update:async(id,data)=>{calls.push(['navigate',id,data.url]);},
   sendMessage:async()=>({ok:true,offers:[]})
  },
  windows:{
   onRemoved:{addListener:listener},
   create:async opts=>{calls.push(['create',opts]);return {id:8,
    state:'minimized',tabs:[{id:71,windowId:8}]};},
   get:async()=>({id:8,state:'minimized'}),
   update:async()=>{},
   remove:async id=>{calls.push(['close',id]);}
  },
  storage:{session:{
   get:async()=>({...state}),
   set:async values=>{Object.assign(state,values);},
   remove:async k=>{delete state[k];}
  }},
  scripting:{executeScript:async()=>{}}
 };
 const ctx={chrome,console,URL,setTimeout,clearTimeout,globalThis:null};
 ctx.globalThis=ctx;
 vm.runInNewContext(source,ctx);
 const nonce='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const first=await ctx.researchTab(45,nonce,'https://shopee.com.br/search?keyword=a');
 const second=await ctx.researchTab(45,nonce,'https://shopee.com.br/search?keyword=b');
 assert.equal(first.id,71);assert.equal(first.newWindow,true);
 assert.equal(second.id,71);assert.equal(second.newWindow,false);
 assert.equal(calls.filter(x=>x[0]==='create').length,1);
 assert.equal(calls[0][1].focused,false);
 assert.equal(calls[0][1].state,'minimized');
 assert.equal(await ctx.closeSession(nonce,999),false);
 assert.ok(state[key]);
 await assert.rejects(ctx.researchTab(72,nonce,'https://shopee.com.br/search'),/Outra pesquisa/);
 assert.equal(await ctx.closeSession(nonce,45),true);
 assert.equal(calls.filter(x=>x[0]==='close').length,1);
 assert.equal(state[key],undefined);
});
