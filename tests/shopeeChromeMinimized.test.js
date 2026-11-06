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
   update:async(id,info)=>{calls.push(['restore',id,info]);return {id,state:info.state};},
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
 const restored=await ctx.restoreResearchWindow(45,nonce);
 assert.equal(restored,71);
 assert.equal(calls.filter(x=>x[0]==='create').length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(calls.find(x=>x[0]==='restore')[2])),
  {state:'normal',focused:false});
 assert.ok(state[key]);
 await assert.rejects(ctx.researchTab(72,nonce,'https://shopee.com.br/search'),/Já existe uma pesquisa/);
 assert.equal(await ctx.closeSession(nonce,45),true);
 assert.equal(calls.filter(x=>x[0]==='close').length,1);
 assert.equal(state[key],undefined);
});

test('releitura da vitrine preserva 11 preços mesmo quando só 2 cartões mostram Vendido/Mês',async()=>{
 const offers=Array.from({length:11},(_,i)=>({
  shopId:String(300+i),itemId:String(1000+i),
  productName:'Balança Digital de Cozinha 10kg',
  priceMin:16.9+i/100,monthlySold:null,historicalSold:null
 }));
 let index=0;
 const responses=[
  {ok:true,offers,visibleCards:11,monthlyCards:0},
  {ok:true,offers:offers.slice(0,2).map(o=>({...o,priceMin:null,
   monthlySold:3000,monthlyPeriod:'month'})),visibleCards:2,monthlyCards:2},
  {ok:true,offers:offers.slice(2,3).map(o=>({...o,monthlySold:1000})),
   visibleCards:1,monthlyCards:1},
  {ok:true,offers:[],visibleCards:0,monthlyCards:0}
 ];
 const chrome={runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},
  onMessage:{addListener(){}}},tabs:{onActivated:{addListener(){}},
  onUpdated:{addListener(){}},onRemoved:{addListener(){}}},
  windows:{onRemoved:{addListener(){}}},storage:{session:{get:async()=>({})}}};
 chrome.tabs.sendMessage=async()=>responses[Math.min(index++,responses.length-1)];
 const local={chrome,console,URL,globalThis:null,
  setTimeout:callback=>{callback();return 1;},clearTimeout(){}};
 local.globalThis=local;
 vm.runInNewContext(source,local);
 const result=await local.readPage(15);
 assert.equal(result.ok,true);
 assert.equal(result.offers.length,11);
 assert.equal(result.monthlyCards,3);
 assert.equal(result.offers[0].priceMin,16.9);
 assert.equal(result.offers[0].monthlySold,3000);
});
