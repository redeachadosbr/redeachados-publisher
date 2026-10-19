import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {compileShopeeExecutionPlan,verifyShopeeExecution,assertLiveShopeeUnchanged} from '../shopeeExecutionPlan.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {advanceVideoUpload,VIDEO_PART_SIZE} from '../shopeeMediaApi.js';
import {callShopeePublicMediaApi} from '../shopee.js';
import {compileAttributes,compileTax} from '../shopeeStructuredFields.js';
import {imageDimensions,imagesSignature} from '../shopeePreparedImages.js';
import {descriptionDraft} from '../shopeeOptimizationWorkflow.js';
import {approvedTitle} from './fixtures/approved-content.js';
const description='Descrição real do produto, com todas as características e instruções já confirmadas pelo fornecedor.';
const live={item_id:2,item_status:'NORMAL',item_name:'Produto atual',item_sku:'SKU',description,category_id:3,description_type:'normal',video_info:[],image:{image_id_list:['old']},attribute_list:[],tax_info:{}};
const record={itemId:'2',sku:'SKU',selectedModelId:'0',status:'NORMAL',imageCount:1,attributeAudit:{attributes:[]}};
const asset={filename:'produto.mp4',sha256:'a'.repeat(64),size_bytes:30,mime_type:'video/mp4',storage_path:'1/2/0/a.mp4'};
const compile=(options={})=>compileShopeeExecutionPlan({shopId:1,itemId:'2',modelId:'0',sku:'SKU',record,live,review:{},...options});
const textPlan=()=>compile({review:{stages:{seo:{reviewed:true}},draftTitle:approvedTitle}});
const videoPlan=()=>compile({manualVideo:asset,review:{stages:{video:{reviewed:true}},videoSha256:asset.sha256}});
const video={id:'uploaded-video',phase:'ready',videoInfo:{video_url_list:[{video_url:'https://cvf.shopee.com.br/file/verified-video'}]}};
function ioFor(plan,overrides={}){
 const calls=[];
 return {calls,read:async()=>live,validateIdentity:async()=>true,download:async()=>Buffer.from('data'),
  beforeWrite:async state=>calls.push(['intent',structuredClone(state)]),
  update:async body=>{calls.push(['update',body]);return {request_id:'r1'};},...overrides};
}
test('original description is preserved instead of replaced by generic copy',()=>{
 assert.equal(descriptionDraft({description}),description);
});
test('video-only plan requires review of the exact imported hash',()=>{
 assert.deepEqual(videoPlan().actions,['video']);assert.equal(videoPlan().canExecute,true);
 const p=compile({manualVideo:asset,review:{stages:{video:{reviewed:true}},videoSha256:'old'}});
 assert.equal(p.video,null);assert.equal(p.canExecute,false);
});
test('published video is reused only if readback proves the same video is still linked',()=>{
 const a={...asset,publication:{sha256:asset.sha256,video}};
 const review={stages:{video:{reviewed:true}},videoSha256:asset.sha256};
 assert.equal(compile({live:{...live,video_info:[{video_url:'https://cvf.shopee.sg/file/verified-video'}]},manualVideo:a,review}).video,null);
 assert.equal(compile({manualVideo:a,review}).video.sha256,asset.sha256);
});
test('video confirmation requires exact processed media; any existing video is insufficient',()=>{
 const p=videoPlan();assert.equal(verifyShopeeExecution(p,{...live,video_info:[{video_url:'https://cvf.shopee.com.br/file/wrong'}]},{video}),false);
 assert.equal(verifyShopeeExecution(p,{...live,video_info:[{video_url:'https://cvf.shopee.sg/file/verified-video'}]},{video}),true);
 assert.equal(verifyShopeeExecution(p,{...live,item_id:999,video_info:[{video_url:'https://cvf.shopee.sg/file/verified-video'}]},{video}),false);
});
test('multipart video advances one part at a time with exact 4 MB parts and checks processing',async()=>{
 const file=Buffer.alloc(VIDEO_PART_SIZE+17),calls=[];
 let result='INITIATED';const api={init:async()=>({video_upload_id:'v'}),part:async(id,n,b)=>calls.push([n,b.length]),
  complete:async(id,seq)=>{calls.push(seq);result='TRANSCODING';},result:async()=>({status:result,video_info:video.videoInfo})};
 let state=await advanceVideoUpload({file,api});
 state=await advanceVideoUpload({state,file,api});state=await advanceVideoUpload({state,file,api});
 assert.deepEqual(calls,[[0,VIDEO_PART_SIZE],[1,17]]);
 state=await advanceVideoUpload({state,file,api});assert.equal(state.phase,'processing');
 assert.deepEqual(calls[2],[0,1]);
 state=await advanceVideoUpload({state,file,api});assert.equal(state.phase,'processing');
 result='SUCCEEDED';state=await advanceVideoUpload({state,file,api});assert.equal(state.phase,'ready');
});
test('video API rejection stops before updating listing',async()=>{
 const job={plan:videoPlan(),result:{video:{id:'v',nextPart:1,phase:'processing',startedAt:Date.now()}}};
 const io=ioFor(job.plan,{media:{result:async()=>({status:'FAILED',message:'Duration invalid'})}});
 await assert.rejects(advanceShopeeExecution(job,io),/recusado/);assert.equal(io.calls.length,0);
});
test('write intent is persisted before a single item update; resume performs readback only',async()=>{
 const plan=textPlan(),io=ioFor(plan);
 const out=await advanceShopeeExecution({plan,result:{}},io);
 assert.equal(out.state,'running');assert.deepEqual(io.calls.map(x=>x[0]),['intent','update']);
 assert.deepEqual(io.calls[1][1],{item_id:2,item_name:plan.proposed.item_name});
 const resumed=ioFor(plan,{read:async()=>({...live,...plan.proposed})});
 const checked=await advanceShopeeExecution({plan,result:{...out.result,phase:'updating'}},resumed);
 assert.equal(checked.state,'verified');assert.equal(resumed.calls.length,0);
});
test('lost response is uncertain and never automatically retried',async()=>{
 const plan=textPlan(),io=ioFor(plan,{update:async()=>{throw Error('network timeout');}});
 const out=await advanceShopeeExecution({plan,result:{}},io);assert.equal(out.state,'uncertain');
 assert.equal(io.calls[0][0],'intent');
 const resumed=ioFor(plan);
 const check=await advanceShopeeExecution({plan,result:{...out.result,updateStartedAt:Date.now()-100000}},resumed);
 assert.equal(check.state,'uncertain');assert.equal(resumed.calls.length,0);
});
test('changed SKU or live content stops execution before any side effect',async()=>{
 const plan=textPlan();
 await assert.rejects(advanceShopeeExecution({plan,result:{}},ioFor(plan,{validateIdentity:async()=>{throw Error('SKU mudou');}})),/SKU/);
 const io=ioFor(plan,{read:async()=>({...live,item_name:'Edited by owner'})});
 await assert.rejects(advanceShopeeExecution({plan,result:{}},io),/alterado/);assert.equal(io.calls.length,0);
});
test('failure to persist write intent prevents marketplace mutation',async()=>{
 const plan=textPlan(),io=ioFor(plan,{beforeWrite:async()=>{throw Error('database lost');}});
 await assert.rejects(advanceShopeeExecution({plan,result:{}},io),/database lost/);
 assert.equal(io.calls.length,0);
});
test('images require nine exact reviewed files and preserve existing gallery on incomplete input',()=>{
 const images=Array.from({length:9},(_,i)=>({slot:i+1,sha256:String(i).repeat(64)}));
 const review={stages:{images:{reviewed:true}},imagesSignature:imagesSignature(images)};
 const ready=compile({manualImages:images,review});assert.equal(ready.images.length,9);assert.equal(ready.canExecute,true);
 const incomplete=compile({manualImages:images.slice(0,8),review});assert.equal(incomplete.images.length,0);assert.equal(incomplete.canExecute,false);
 assert.throws(()=>assertLiveShopeeUnchanged(ready,{...live,image:{image_id_list:['changed']}}),/Imagens alteradas/);
});
test('images upload serially; gallery is replaced only when all nine IDs exist',async()=>{
 const plan=textPlan();plan.images=[{mime_type:'image/png'},{mime_type:'image/png'}];
 const io=ioFor(plan,{downloadImage:async()=>Buffer.alloc(30),media:{image:async()=> 'uploaded-image'}});
 const out=await advanceShopeeExecution({plan,result:{}},io);assert.equal(out.result.phase,'images_upload');
 assert.deepEqual(out.result.imageIds,['uploaded-image']);assert.equal(io.calls.length,0);
});
test('attributes require a current official option and explicit evidence; unrelated fields preserved',()=>{
 const r={attributeAudit:{attributes:[{id:1,name:'Cor',options:[{id:10,name:'Azul'}]}]}};
 const existing={attribute_list:[{attribute_id:99,attribute_value_list:[{value_id:9}]}]};
 const actual=compileAttributes([{attributeId:1,valueId:10,evidence:'Catálogo WeDrop SKU'}],r,existing);
 assert.equal(actual[0].attribute_id,99);assert.equal(actual[1].attribute_value_list[0].value_id,10);
 assert.throws(()=>compileAttributes([{attributeId:1,valueId:0,evidence:'Catálogo'}],r,existing),/oficial/);
 assert.throws(()=>compileAttributes([{attributeId:1,valueId:10}],r,existing),/fonte/);
});
test('tax code 99 is never treated as a 99 percent rate and unverified NCM is blocked',()=>{
 const result=compileTax({ncm:'39269090',pis_cofins_cst:'99',evidence:'Nota fornecedor',measure_unit:'UN'},{});
 assert.equal(result.pis_cofins_cst,'99');assert.equal(result.pis,undefined);assert.equal(result.cofins,undefined);
 assert.throws(()=>compileTax({ncm:'00',evidence:'Sem informação'},{}),/inválido/);
});
test('public media signatures exclude shop tokens and preserve multipart boundary',async()=>{
 const before=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,opts)=>{calls.push({url:new URL(url),opts});return new Response('{}');};
 try{
  const cfg={configured:true,partnerId:12,partnerKey:'test-key',host:'https://partner.shopeemobile.com'};
  const form=new FormData();form.set('part_content',new Blob(['part']),'part.bin');
  await callShopeePublicMediaApi(cfg,{path:'/api/v2/media_space/upload_video_part',form});
  const {url,opts}=calls[0],ts=url.searchParams.get('timestamp');
  assert.equal(url.searchParams.get('sign'),crypto.createHmac('sha256','test-key').update('12'+url.pathname+ts).digest('hex'));
  assert.equal(url.searchParams.has('access_token'),false);assert.equal(opts.headers['Content-Type'],undefined);assert.equal(opts.body,form);
 }finally{globalThis.fetch=before;}
});
