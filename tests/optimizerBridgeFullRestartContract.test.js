import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const resume=app.slice(app.indexOf('async function optimizerChatgptContinueFromServer()'),
 app.indexOf('globalThis.__RA_SHOPEE_RESUME_BRIDGE='));

test('retomada 1/9 ou 2/9 nunca envia reinício total à Ponte',()=>{
 assert.match(resume,/const fullStartFromZero=bridgeCompleted\.length===0&&missing\.length===9&&missing\[0\]===1/);
 assert.equal((resume.match(/restart:fullStartFromZero/g)||[]).length,2);
 assert.doesNotMatch(resume,/restart:freshThird\|\|deferredThird/);
 assert.match(resume,/completed:bridgeCompleted/);
});

test('nova sequência começa em 01 somente quando não há fotos salvas',()=>{
 assert.match(resume,/const allMissing=Array\.from\(\{length:9\}/);
 assert.match(resume,/optimizerChatBridgeActiveClear\(optimizerChatBridgeJob\.nonce\)/);
 assert.match(resume,/optimizerChatBridgeJob\.complete=true/);
 assert.match(resume,/9\/9 imagens já preparadas para esta SKU/);
});

test('botão começar do zero oferece confirmação e não elimina fotos de outras SKUs',()=>{
 assert.match(html,/id="optimizerChatgptStartOver"/);
 assert.match(html,/↻ Começar do zero/);
 const fresh=app.slice(app.indexOf("$('#optimizerChatgptStartOver')?.addEventListener"),
  app.indexOf("$('#optimizerChatgptRestartAll')?.addEventListener"));
 assert.match(fresh,/optimizerImagesSameSku\(w\)/);
 assert.match(fresh,/button\.click\(\)/);
 assert.doesNotMatch(fresh,/method:'DELETE'/);
 const reset=app.slice(app.indexOf("$('#optimizerChatgptRestartAll')?.addEventListener"),
  app.indexOf('function optimizerBridgeRecoverFromExtension'));
 assert.match(reset,/if\(slots\.length&&!confirm\(/);
 assert.match(reset,/item_id:w\.itemId,model_id:w\.modelId,slot/);
 assert.match(reset,/method:'DELETE'/);
 assert.match(reset,/restart:true/);
});
