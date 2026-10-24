import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('imagem manual não cancela o lote ChatGPT de outra posição',()=>{
 const js=read('../public/app.js'),html=read('../public/index.html');
 assert.match(js,/function optimizerChatBridgeRelease\(/);
 assert.doesNotMatch(js,/if\(optimizerChatBridgeBusy\)await optimizerChatBridgeRelease/);
 assert.match(js,/Importação manual da posição/);
 assert.match(js,/if\(job\.stopped\)/);
 assert.match(js,/optimizerChatBridgeAck\(m,false/);
 assert.match(js,/correctionDrop\.addEventListener\('paste'/);
 assert.match(js,/correctionDrop\.addEventListener\('drop'/);
 assert.match(html,/id="optimizerImageCorrectionDropzone"/);
 assert.match(html,/app\.js\?v=1\.21\./);
});

test('recuperação consulta a galeria da SKU e retoma somente slots realmente faltantes',()=>{
 const js=read('../public/app.js');
 const queue=read('../public/chatgptUploadQueue.js');
 assert.match(js,/const stored=new Map\(/);
 assert.match(js,/onlySlots:missing/);
 assert.match(queue,/onlySlots=null/);
 assert.match(queue,/permitted\.has\(row\.slot\)/);
 assert.match(js,/async function optimizerChatgptContinueFromServer/);
 assert.match(js,/RA_SITE_WAKE/);
});
