import test from 'node:test';
import assert from 'node:assert/strict';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';
import {shopeeExecutionUnconfirmedFields} from '../shopeeExecutionPlan.js';

const title='🦖 Caminhão Dinossauro com 3 Mini Carrinhos Verde';
const desc='Descrição real confirmada do produto';
const mediaId='sg-11110106-6vjar-muorz1c16ubpd9';
const imageIds=Array.from({length:9},(_,i)=>'image-'+i);
const path='https://cvf.shopee.com.br/file/api/v4/video/'+mediaId+'.mp4';
const plan={
 sku:'303448',itemId:'58271290960',modelId:'0',selectedStage:'all',canExecute:true,
 images:Array.from({length:9},(_,i)=>({slot:i+1})),
 video:{sha256:'123'},
 proposed:{attribute_list:[{attribute_id:100413,
  attribute_value_list:[{value_id:0,original_value_name:'NOVO'}]}]},
 confirmedStages:{seo:true,description:true,technical:false},
 finalFiscal:{ncm:'95030010'},
 original:{item_name:title,description:desc,
  image:{image_id_list:imageIds},
  video_info:[{video_url:path}],attribute_list:[]},
 reusedMedia:{imageIds,
  video:{id:mediaId,phase:'ready',videoInfo:{video_url_list:[{video_url:path}]}}}
};
test('SKU 303448: as duas etapas de texto e a mídia já conferidas ficam verdes; somente técnica/fiscal pendentes',()=>{
 const p=shopeeExecutionProgress({
  state:'prepared',plan,sku:'303448',item_id:'58271290960',
  updated_at:'2026-10-24T10:10:16Z',result:null
 });
 for(const name of ['images','video','seo','description'])
  assert.equal(p.steps.find(x=>x.id===name).status,'done',name);
 assert.equal(p.steps.find(x=>x.id==='technical').status,'waiting');
 assert.equal(p.steps.find(x=>x.id==='fiscal').status,'waiting');
 assert.equal(p.imagesPublished,9);
 assert.equal(p.videoPublished,true);
 assert.ok(p.percent>0&&p.percent<100);
 assert.match(p.message,/Título SEO já confirmado/);
 assert.match(p.message,/Descrição já confirmada/);
});
test('diagnóstico: identifica exclusivamente o atributo técnico 100413, sem culpar título e descrição',()=>{
 const pending=shopeeExecutionUnconfirmedFields(plan,{
  item_id:58271290960,item_name:title,description:desc,
  image:{image_id_list:imageIds},
  video_info:[{video_url:path}],
  attribute_list:[],tax_info:{}
 },{imageIds,video:plan.reusedMedia.video});
 assert.equal(pending.some(s=>/Título SEO|Descrição/.test(s)),false);
 assert.ok(pending.some(s=>/100413/.test(s)));
 assert.ok(pending.some(s=>/fiscais/.test(s)));
});
