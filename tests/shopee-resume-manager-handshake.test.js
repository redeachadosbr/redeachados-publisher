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
test('imagem 03 envia foto real preparada da MESMA SKU junto do novo prompt na Ponte',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const source=app.slice(app.indexOf('async function optimizerBridgeThirdReferenceDataUrl('),
   app.indexOf('async function optimizerCommercialRequestChatgptSlot('));
 assert.match(source,/sourceSlot=saved\.has\(1\)\?1:saved\.has\(2\)\?2:0/);
 assert.match(source,/optimizerImageEditReference\(w,sourceSlot\)/);
 assert.match(source,/optimizerImagesSameSku\(w\)/);
 assert.ok(source.includes('data:image'));
 assert.ok(source.includes('base64'));
 assert.doesNotMatch(source,/fetch\('https:\/\/|method:'DELETE'/);
 const single=app.slice(app.indexOf('async function optimizerCommercialRequestChatgptSlot('),
   app.indexOf('async function optimizerChatgptCopyAll('));
 assert.match(single,/referenceDataUrl=await optimizerBridgeThirdReferenceDataUrl\(w,current\.images\|\|\[\]\)/);
 assert.match(single,/imageUrl:refs\[i\],prompts,referenceDataUrl/);
 const continueFn=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer('),
   app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE'));
 assert.match(continueFn,/preparedThirdReference=Number\(missing\[0\]\)===3\?/);
 assert.equal((continueFn.match(/referenceDataUrl:preparedThirdReference/g)||[]).length,2);
 assert.doesNotMatch(continueFn,/method:'DELETE'|restart:true/);
});
test('não aceitar prompt legado de imagem 03 sem cotas e recarregar versão atual',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/PROMPT ANTIGO DETECTADO/);
 assert.match(app,/SEM texto, setas/);
 assert.match(app,/chatgptPrompts\.js\?v=20261110-product-package-scope/);
});
