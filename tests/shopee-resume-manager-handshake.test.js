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
 assert.match(fn,/const startResult=await startAck/);
});
