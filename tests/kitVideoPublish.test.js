import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kitVideoFileCheck,kitVideoMetaCheck,KIT_VIDEO_LIMIT} from '../public/kit-video-store.js';
import {kitPublishPayload,kitApprovalFingerprint} from '../shopeeKitPublish.js';

test('vídeo aceita MP4/MOV/WebM até 30 MB e 10–60 segundos',()=>{
 assert.equal(kitVideoFileCheck({type:'video/mp4',size:120000}),true);
 assert.equal(kitVideoFileCheck({type:'video/quicktime',size:120000}),true);
 assert.equal(kitVideoFileCheck({type:'video/webm',size:120000}),true);
 assert.throws(()=>kitVideoFileCheck({type:'video/mp4',size:KIT_VIDEO_LIMIT+1}),/30 MB/);
 assert.throws(()=>kitVideoFileCheck({type:'application/pdf',size:5000}),/MP4/);
 assert.deepEqual(kitVideoMetaCheck({duration:30,width:1280,height:720}),
  {duration:30,width:1280,height:720});
 assert.throws(()=>kitVideoMetaCheck({duration:8,width:1280,height:720}),/10 e 60/);
 assert.throws(()=>kitVideoMetaCheck({duration:61,width:1280,height:720}),/10 e 60/);
});
const kit={kitSku:'KIT-310200-278CHOCALHO',
 components:[{sku:'310200'},{sku:'278CHOCALHO'}],quote:{grossPrice:159.9,targetMarginPct:15}};
const fields={title:'Kit Brinquedos para Bebê Musical e Chocalho Infantil',
 description:'Kit infantil com elefante musical e conjunto torre com bola chocalho, uma unidade de cada componente, enviado em um único pacote com revisão de imagens.',
 photoIds:['x'.repeat(24)],mainSku:'310200',weight:0.354,dimensions:[16,28,36],
 logisticId:123,preorder:false,days:null,syncDts:false};
const linked=[{supplierSku:'310200',itemId:'12345678',modelId:'0',status:'NORMAL'},
 {supplierSku:'278CHOCALHO',itemId:'87654321',modelId:'0',status:'NORMAL'}];
test('kit com vídeo envia video_upload_id uma única vez sem alterar o conteúdo do kit',()=>{
 const result=kitPublishPayload(kit,fields,linked,{videoUploadId:'sg_12345678901234567890'});
 assert.deepEqual(result.item_setting.video_upload_id,['sg_12345678901234567890']);
 assert.deepEqual(result.item_setting.images.image_id_list,fields.photoIds);
 assert.equal(result.item_setting.pre_order.is_pre_order,false);
 const without=kitPublishPayload(kit,fields,linked);
 assert.equal(Object.hasOwn(without.item_setting,'video_upload_id'),false);
});
test('fingerprint da autorização muda se incluir, excluir ou trocar vídeo',()=>{
 const a=kitApprovalFingerprint(kit,{...fields,videoUploadId:null},linked);
 const b=kitApprovalFingerprint(kit,{...fields,videoUploadId:'sg_12345678901234567890'},linked);
 const c=kitApprovalFingerprint(kit,{...fields,videoUploadId:'sg_12345678901234567891'},linked);
 assert.notEqual(a,b);assert.notEqual(b,c);
});
test('o painel aparece somente nos kits, abaixo das imagens e antes da publicação',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../public/kit-builder.css',import.meta.url),'utf8');
 const start=html.indexOf('id="kitGallerySection"');
 const video=html.indexOf('id="kitVideoPanel"',start);
 const publication=html.indexOf('id="kitPublishPanel"',video);
 assert.ok(start>0&&video>start&&publication>video);
 for(const id of ['kitVideoFile','kitVideoSendShopee','kitVideoPreview','kitVideoInclude',
  'kitVideoDownload','kitVideoRemove','kitVideoStatus','kitVideoState'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(js,/await kitVideoStore\.put\(sku,file,meta\)/);
 assert.match(js,/await kitVideoStore\.get\(sku\)/);
 assert.match(js,/await kitVideoStore\.remove\(sku\)/);
 assert.match(js,/kitVideoUploadBusy|kitVideoBusy/);
 assert.match(js,/kitVideoInclude'\)\.checked&&kitVideoRemote\?\.ready===true/);
 assert.match(js,/kitVideoInclude'\)\?\.addEventListener\('change'/);
 assert.match(js,/\/api\/shopee\/kits\/video\/prepare/);
 assert.match(js,/\/api\/shopee\/kits\/video\/advance/);
 assert.match(css,/#tab-kits #kitDetail #kitVideoPanel/);
});
test('envio de vídeo é separado de publicação e exige origem e autenticação',()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const svc=fs.readFileSync(new URL('../shopeeKitPublicationService.js',import.meta.url),'utf8');
 for(const path of ['prepare','advance','status','discard'])
  assert.ok(server.includes("/api/shopee/kits/video/"+path));
 assert.match(server,/video\/prepare',mustLogin,requireWeDropAdmin/);
 assert.match(server,/express\.raw\(\{type:'application\/octet-stream',limit:'31mb'\}\)/);
 assert.match(svc,/await normalizeManualVideo\(buffer\)/);
 assert.match(svc,/advanceVideoUpload\(\{state:record.state,file:record.file,/);
 assert.match(svc,/readyVideoId\(auth,kitSku,input\?\.includeVideo\)/);
 assert.match(svc,/videoIncluded:Boolean\(videoUploadId\)/);
 assert.match(svc,/kitApprovalFingerprint\(ready.kit,\{\.\.\.fields,videoUploadId\}/);
 assert.match(svc,/add_kit_item/);
});
