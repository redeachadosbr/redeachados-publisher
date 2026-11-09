import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const manager=readFileSync(new URL('../chrome-extension-shopee/manager.js',import.meta.url),'utf8');
const background=readFileSync(new URL('../chrome-extension-shopee/background.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../chrome-extension-shopee/manifest.json',import.meta.url),'utf8'));
test('ponte v1.2.12 recupera guias Manager e verifica versão antes da pesquisa',()=>{
 assert.equal(manifest.version,'1.2.12');
 assert.ok(manifest.permissions.includes('scripting'));
 assert.ok(manifest.permissions.includes('storage'));
 assert.match(background,/chrome\.scripting\.executeScript/);
 assert.match(background,/chrome\.runtime\.onInstalled/);
 assert.match(background,/chrome\.tabs\.onActivated/);
 assert.match(background,/chrome\.tabs\.onUpdated/);
 assert.match(ui,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
});
test('script reinjetado responde uma única vez a cada ping',async()=>{
 const origin='https://redeachados-shopee.onrender.com';
 const listeners=[],events=[];
 const window={
  addEventListener(name,cb){if(name==='message')listeners.push(cb);},
  postMessage(data,originParam){
   events.push(data);
   if(originParam===origin)queueMicrotask(()=>{
    for(const fn of [...listeners])fn({source:window,origin,data});
   });
  }
 };
 const runtime={getManifest:()=>({version:'1.2.12'}),
  onMessage:{addListener(){}},sendMessage(){}};
 const ctx={window,location:{origin},chrome:{runtime},globalThis:null,console};
 ctx.globalThis=ctx;
 vm.runInNewContext(manager,ctx);
 vm.runInNewContext(manager,ctx);
 const nonce='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 window.postMessage({kind:'RA_CURVE_CHROME_PROBE',nonce},origin);
 await new Promise(r=>setImmediate(r));
 assert.equal(events.filter(x=>x.kind==='RA_CURVE_CHROME_READY').length,1);
 assert.equal(events.find(x=>x.kind==='RA_CURVE_CHROME_READY').version,'1.2.12');
 assert.equal(listeners.length,1);
});

