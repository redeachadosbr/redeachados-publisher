import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('ChatGPT extension bridge has one-click automatic generation and per-slot upload feedback',()=>{
 for(const id of ['optimizerChatgptAuto','optimizerChatgptAbort','optimizerChatgptBridgeStatus']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/Gerar 9 imagens com ChatGPT/);
 assert.match(html,/Opção manual \(sem extensão\)/);
 assert.match(js,/RA_EXTENSION_PROBE/);
 assert.match(js,/RA_SITE_START/);
 assert.match(js,/RA_EXTENSION_IMAGE/);
 assert.match(js,/RA_SITE_UPLOAD_RESULT/);
 assert.match(js,/optimizerImagesSameSku\(w\)/);
 assert.match(js,/optimizerChatgptScaleFile\(file\)/);
 assert.match(js,/crypto\.randomUUID\(\)/);
 assert.match(js,/optimizerImagesSavedSlots\.add\(m\.slot\)/);
 assert.match(js,/requiresReview|stage\.reviewed=false/);
});

test('browser image upload uses authenticated same-origin API and invalidates old approvals',()=>{
 assert.match(js,/fetch\('\/api\/shopee\/optimizer\/images\/manual\?/);
 assert.match(js,/m\.itemId/);
 assert.match(js,/m\.modelId/);
 assert.match(js,/m\.nonce!==optimizerChatBridgeNonce/);
 assert.match(server,/saveWorkflowReview\(x\.shopId,x\.itemId,x\.modelId,x\.sku,\{stage:'images',reviewed:false\}\)/);
 assert.match(server,/requiresReview:true,marketplaceUpdated:false/);
});
