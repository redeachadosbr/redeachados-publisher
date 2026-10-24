import test from 'node:test';
import assert from 'node:assert/strict';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

// Regressão da SKU 303448: mídia completa, update_item aceito,
// readback pendente NÃO pode exibir 0% nem declarar publicação.
const plan={
  sku:'303448',itemId:'58271290960',modelId:'0',selectedStage:'all',
  images:Array.from({length:9},(_,i)=>({slot:i+1})),
  video:{filename:'video.mp4'},
  proposed:{item_name:'Título aprovado',description:'Descrição aprovada',
    attribute_list:[{attribute_id:1,attribute_value_list:[]}]},
  finalFiscal:{ncm:'95030010'}
};
const imageIds=Array.from({length:9},(_,i)=>'asset-'+i);
const result={
 phase:'verifying',requestId:'accepted',imageIds,
 video:{phase:'ready',id:'video-ready'},
 events:[{key:'update-accepted',at:'2026-10-24T09:50:52Z',label:'Solicitação recebida pela API'}]
};
test('mídia enviada e update aceito aparece como progresso operacional, nunca publicação',()=>{
 const progress=shopeeExecutionProgress({
  state:'uncertain',sku:'303448',plan,result,
  last_error:'A Shopee ainda não confirmou todos os campos.',
  updated_at:'2026-10-24T09:52:27Z'
 });
 assert.equal(progress.imagesUploaded,9);
 assert.equal(progress.imagesPublished,0);
 assert.equal(progress.videoReady,true);
 assert.equal(progress.videoPublished,false);
 assert.equal(progress.steps[0].status,'staged');
 assert.equal(progress.steps[1].status,'staged');
 assert.equal(progress.steps[2].status,'attention');
 assert.equal(progress.steps[3].status,'attention');
 assert.equal(progress.steps[4].status,'attention');
 assert.ok(progress.percent>0&&progress.percent<100);
 assert.equal(progress.verified,false);
 assert.match(progress.message,/não confirmada|confirmada/i);
});
test('duas leituras da Shopee confirmam mídias sem falsamente aprovar texto ou fiscal',()=>{
 const recovered=shopeeExecutionProgress({
  state:'failed',sku:'303448',plan,
  result:{...result,phase:'retry_allowed',recovery:{
   kind:'stable_readback_no_write',stable:true,imagesInShop:9,
   pending:['Título, descrição ou ficha técnica ainda divergem','Dados fiscais ainda não confirmados']
  }},
  last_error:'Nova prévia necessária: ficha técnica divergente',
  updated_at:'2026-10-24T09:55:45Z'
 });
 assert.equal(recovered.steps[0].status,'done');
 assert.equal(recovered.steps[1].status,'done');
 assert.equal(recovered.imagesPublished,9);
 assert.equal(recovered.videoPublished,true);
 assert.notEqual(recovered.steps[2].status,'done');
 assert.notEqual(recovered.steps[4].status,'done');
 assert.notEqual(recovered.steps[6].status,'done');
 assert.ok(recovered.percent>0&&recovered.percent<100);
 assert.equal(recovered.verified,false);
});
test('somente confirmação completa permite 100%',()=>{
 const progress=shopeeExecutionProgress({
  state:'verified',sku:'303448',plan,
  result:{...result,phase:'verified',verified:true,fiscal:{status:'verified'}}
 });
 assert.equal(progress.percent,100);
 assert.equal(progress.verified,true);
});
