import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('troca de SKU limpa estado antigo e nao herda imagens ou geracao da SKU anterior',()=>{
 assert.match(js,/void optimizerChatBridgeSwitchSku\(value\)/);
 assert.match(js,/optimizerImagesSavedSlots=new Set\(\)/);
 assert.match(js,/optimizerWorkflowPlan=null;optimizerWorkflowStage=null;optimizerWorkflowSerial\+\+/);
 assert.match(js,/optimizerImagesAutoBusy=false/);
 assert.match(js,/optimizerImagesSavedSlots=new Set\(stored.keys\(\)\)/);
});
test('ponte usa nonce e SKU exata para retomar somente a tarefa aberta',()=>{
 assert.match(js,/function optimizerChatBridgeSwitchSku\(/);
 assert.match(js,/window.postMessage\(\{kind:'RA_SITE_ABORT',nonce:old.nonce/);
 assert.match(js,/optimizerChatBridgeActiveClear\(old.nonce\)/);
 assert.match(js,/if\(!optimizerChatBridgeIdentity\(job,optimizerWorkflowPlan\)\|\|/);
 assert.match(js,/String\(\$\('#optimizerSku'\)\?\.value\|\|''\)\.trim\(\)!==String\(job.sku\)/);
 assert.match(js,/if\(m.kind==='RA_EXTENSION_IMAGE'&&m.nonce\)/);
 assert.match(js,/optimizerChatBridgeAck\(m,false/);
});
test('trabalho da SKU antiga nao pode roubar outra aba do mesmo Manager',()=>{
 assert.match(js,/redeAchadosBridgeActiveV3/);
 assert.match(js,/window.addEventListener\('storage',event=>/);
 assert.match(js,/if\(!saved.stopped&&!saved.complete&&newer\?\.nonce&&newer.nonce!==saved.nonce\)/);
 assert.match(js,/optimizerChatBridgeActiveSave\(optimizerChatBridgeJob\)/);
 assert.match(js,/optimizerChatBridgeActiveClear\(job.nonce\)/);
});
test('callbacks de filas anteriores nao podem modificar fotos/progresso de outro anuncio',()=>{
 assert.match(js,/if\(optimizerChatBridgeJob\?\.nonce!==row.nonce\|\|/);
 assert.match(js,/!optimizerChatBridgeIdentity\(optimizerWorkflowPlan,row\)\)return/);
 assert.match(js,/if\(optimizerChatBridgeJob\?\.nonce!==row.nonce\|\|!optimizerChatBridgeIdentity\(w,row\)\)return/);
});
test('nova versao web e JavaScript sintaticamente corretos',()=>{
 assert.match(html,/app\.js\?v=1\.21\.37-sku-bridge-reset/);
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'app.js'}));
});
