import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('retomada confirma resultado real do Manager só após RA_SITE_CONTINUE e WAKE',()=>{
 const fn=main.slice(main.indexOf('async function optimizerChatgptContinueFromServer(){'),main.indexOf("$('#optimizerChatgptAuto')?.addEventListener"));
 assert.ok(fn.includes("window.postMessage({kind:'RA_SITE_WAKE'"));
 assert.ok(fn.indexOf('RA_SITE_WAKE')<fn.indexOf('return {ok:true,nonce:optimizerChatBridgeNonce'));
 assert.match(fn,/globalThis\.__RA_SHOPEE_RESUME_BRIDGE=async identity=>/);
 assert.match(fn,/String\(w\.sku\)!==String\(identity\?\.sku\)/);
 assert.match(fn,/optimizerChatgptContinueBusy/);
 assert.match(fn,/return result\?\.ok===true\?result:/);
 assert.match(main,/function optimizerWaitBridgeReply\(kind,nonce,timeoutMs=18000\)/);
 assert.match(fn,/const wakeResult=await wakeAck/);
 assert.match(fn,/startResult=await startAck/);
});


test('imagem 03 consulta a execução real da extensão antes de criar outra na mesma SKU',()=>{
 const main=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const ret=main.slice(main.indexOf('async function optimizerBridgeRetireSameSkuForNewThird('),
  main.indexOf('// Impedir execução duplicada mesmo se a galeria reativar',main.indexOf('async function optimizerBridgeRetireSameSkuForNewThird(')));
 assert.match(ret,/optimizerBridgeRecoverFromExtension\(payload\)/);
 assert.match(ret,/RA_SITE_ABORT/);
 assert.match(ret,/nonce:result\.nonce/);
 assert.match(ret,/NO_RECOVERABLE_JOB/);
 assert.match(ret,/optimizerImagesSameSku\(w\)/);
 assert.doesNotMatch(ret,/method:'DELETE'|restart:true|images\/reorder/);
 const single=main.slice(main.indexOf('async function optimizerCommercialRequestChatgptSlot('),
  main.indexOf('async function optimizerChatgptCopyAll('));
 assert.match(single,/await optimizerBridgeRetireSameSkuForNewThird\(w,brief/);
 assert.match(single,/optimizerBridgeSkuHasRunningJob\(lastError\)/);
 assert.match(single,/busyRetried=true/);
 assert.match(single,/i--;continue/);
 const cont=main.slice(main.indexOf('async function optimizerChatgptContinueFromServer('),
  main.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE'));
 assert.match(cont,/else if\(freshThird\)\{/);
 assert.match(cont,/await optimizerBridgeRetireSameSkuForNewThird\(w,brief,stored\)/);
 assert.match(cont,/optimizerBridgeSkuHasRunningJob\(startResult\?\.error\)/);
 assert.match(cont,/A Ponte ainda está ocupada/);
});
test('botão Gerar ignora clique duplicado enquanto reconcilia a Ponte',()=>{
 const main=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(main,/let optimizerSlotBridgeStartInFlight=false/);
 assert.match(main,/if\(optimizerSlotBridgeStartInFlight\)/);
 assert.match(main,/optimizerSlotBridgeStartInFlight=true;generate\.disabled=true/);
 assert.match(main,/finally\{\s*optimizerSlotBridgeStartInFlight=false/);
});