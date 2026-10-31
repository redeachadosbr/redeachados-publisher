import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {KIT_BRIDGE_SESSION_KEY,kitBridgePayload,isKitBridgeEvent} from '../public/kit-extension-bridge.js';
import {looksLikeKitReferenceMontage} from '../public/kit-cover-validation.js';
test('kit gera os 9 prompts com referências visuais e protocolo da Ponte',()=>{
 const kit={kitSku:'KIT-278CHOCALHO-310200',components:[
  {sku:'310200',imageUrl:'https://wedrop.test/elefante.jpg'},
  {sku:'278CHOCALHO',imageUrl:'https://wedrop.test/torre.jpg'}
 ]};
 const prompts=Array.from({length:9},(_,i)=>'Imagem '+(i+1)+' SKU 310200 e SKU 278CHOCALHO JUNTOS');
 const payload=kitBridgePayload({kit,nonce:'test-123',referenceDataUrl:'data:image/jpeg;base64,AAAA',prompts,completed:[1,3]});
 assert.equal(payload.kitSku,kit.kitSku);
 assert.equal(payload.itemId,'0');assert.equal(payload.modelId,'0');
 assert.equal(payload.prompts.length,9);
 assert.deepEqual(payload.completed,[1,3]);
 assert.equal(KIT_BRIDGE_SESSION_KEY,'raKitExtensionActiveV1');
 const job={nonce:'test-123',kitSku:kit.kitSku,itemId:'0',modelId:'0'};
 assert.equal(isKitBridgeEvent({nonce:'test-123',sku:kit.kitSku,slot:2},job),true);
 assert.equal(isKitBridgeEvent({nonce:'different',sku:kit.kitSku,slot:2},job),false);
});
test('Ponte não mistura imagens de kit com anúncios individuais',()=>{
 const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const runtime=fs.readFileSync(new URL('../public/kit-extension-runtime.js',import.meta.url),'utf8');
 assert.match(app,/raKitExtensionActiveV1/);
 assert.match(app,/activeKit\?\.nonce===m\.nonce&&activeKit\.kitSku/);
 assert.match(runtime,/kind:'RA_SITE_START'/);
 assert.match(runtime,/kind:'RA_SITE_UPLOAD_RESULT'/);
 assert.match(runtime,/await onPhoto/);
 assert.match(ui,/createKitExtensionController/);
 assert.match(ui,/kitPhotoStore\.put\(kitSku,slot,dataUrl\)/);
 assert.match(html,/id="kitGenerateAll"/);
 assert.match(html,/id="kitStopExtension"/);
 assert.match(html,/id="kitPlusManualFallback"/);
});
test('backend limita as fotos WeDrop à composição validada do kit',()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(server,/\/api\/shopee\/kits\/reference-photo/);
 assert.match(server,/requireWeDropAdmin/);
 assert.match(server,/composeKit\(auth.shopId,skus/);
 assert.match(server,/kitReferencePhoto/);
});

test('ponte não declara imagem gerada somente porque abriu o chat',()=>{
 const runtime=fs.readFileSync(new URL('../public/kit-extension-runtime.js',import.meta.url),'utf8');
 assert.match(runtime,/Aguardando a primeira imagem gerada e importada/);
 assert.match(runtime,/watchImage\(first\)/);
 assert.match(runtime,/240000/);
 assert.match(runtime,/retryAutomaticImagePickup/);
 assert.match(runtime,/RA_SITE_CONTINUE/);
 assert.match(runtime,/RA_SITE_WAKE/);
 assert.match(runtime,/sem reenviar o prompt/);
 assert.match(runtime,/if\(accepted!==true\)throw Error/);
});
test('troca de fotos é atômica e galeria não confirma antes de salvar',()=>{
 const store=fs.readFileSync(new URL('../public/kit-extension-bridge.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(store,/move:async\(kit,from,to\)/);
 assert.match(store,/database.transaction\('photos','readwrite'\)/);
 assert.match(ui,/await kitPhotoStore.move\(kitSku,from,to\);/);
 assert.match(ui,/if\(!images.has\(row.slot\)&&\/\^data:image/);
});

test('Manager permite recuperar geração de kit após atualização fechar o runner, sem repetir imagens',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const runtime=fs.readFileSync(new URL('../public/kit-extension-runtime.js',import.meta.url),'utf8');
 assert.match(html,/id="kitResumeExtension"/);
 assert.match(ui,/async function kitResumeExtensionImages\(\{automatic=false\}=\{\}\)/);
 assert.match(ui,/await kitPhotoStore.list\(sku\)/);
 assert.match(ui,/getKitExtensionBridge\(\).resumeFromManager\(\)/);
 assert.match(runtime,/async function resumeFromManager\(\)/);
 assert.match(runtime,/RA_SITE_CONTINUE/);
 assert.match(runtime,/NO_RECOVERABLE_JOB/);
 assert.match(runtime,/wakeConfirmedSession\(\{kitSku:kit.kitSku,nonce,slot:Number\(result.slot\)\}\)/);
 assert.match(runtime,/await waitReady\(\)/);
});

test('capa 01 não confunde montagem de referências WeDrop com foto gerada',()=>{
 const w=96,h=96;
 const pixels=new Uint8ClampedArray(w*h*4).fill(255);
 // Três fotos originais em quadros separados por faixas brancas.
 for(const [a,b] of [[5,27],[37,59],[69,91]]){
  for(let y=24;y<75;y++)for(let x=a;x<=b;x++){
   const p=(y*w+x)*4;pixels[p]=40;pixels[p+1]=75;pixels[p+2]=100;
  }
 }
 assert.equal(looksLikeKitReferenceMontage(pixels,w,h,3),true);
 // Fundo/cena contínua sem divisórias deve ser aceito.
 for(let y=24;y<75;y++)for(let x=1;x<95;x++){
  const p=(y*w+x)*4;pixels[p]=40;pixels[p+1]=75;pixels[p+2]=100;
 }
 assert.equal(looksLikeKitReferenceMontage(pixels,w,h,3),false);
 const ui=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 assert.match(ui,/validateKitCoverImage\(file,\{referenceDataUrl\}\)/);
 assert.match(ui,/await kitStoredPhotoApproved\(row\)/);
 assert.match(ui,/ATENÇÃO IMAGEM 01: as fotografias WeDrop anexadas são SOMENTE REFERÊNCIAS/);
});


test('retomada da Ponte usa um CONTINUE e depois WAKE, sem iniciar outro lote',()=>{
 const runtime=fs.readFileSync(new URL('../public/kit-extension-runtime.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const start=runtime.slice(runtime.indexOf('async function resumeFromManager()'),runtime.indexOf('// Exclusivo de kits: o botão verde'));
 assert.equal((start.match(/kind:'RA_SITE_CONTINUE'/g)||[]).length,1);
 assert.match(start,/return wakeConfirmedSession/);
 assert.doesNotMatch(start,/resumeFromExtension\(/);
 assert.match(runtime,/post\(\{kind:'RA_SITE_WAKE',nonce\}\)/);
 assert.match(runtime,/if\(job\?\.kitSku===kit\.kitSku&&getImages\(\)\.size<9\)/);
 assert.match(runtime,/return resumeFromManager\(\)/);
 assert.match(ui,/kitScheduleAutomaticBridgeRecovery\(/);
 assert.match(ui,/window.addEventListener\('focus',kitScheduleAutomaticBridgeRecovery\)/);
 assert.match(ui,/kitPhotoStore\.list\(sku\)/);
 assert.match(ui,/kitManagerResumeBusy/);
});
