import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOPEE_MATRIX_8_STAGES,shopeeExecutionProgress} from '../shopeeExecutionProgress.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';

function job(sku,plan={},result=null,state='prepared'){
 return {
  sku,item_id:'58221125342',model_id:0,state,
  updated_at:'2026-10-23T12:00:00Z',
  plan:{selectedStage:'all',canExecute:true,proposed:{},images:[],...plan},
  result
 };
}

test('Motor Matriz always renders the same 8 execution stages for every SKU',()=>{
 assert.deepEqual(SHOPEE_MATRIX_8_STAGES.map(x=>x.id),
  ['images','video','seo','description','technical','variants','fiscal','discount']);
 for(const sku of ['3747','1512','1175','90001']){
  const steps=shopeeExecutionProgress(job(sku)).steps;
  assert.equal(steps.length,8);
  assert.deepEqual(steps.map(x=>x.id),SHOPEE_MATRIX_8_STAGES.map(x=>x.id));
 }
});

test('Uploaded media is not counted as publication and prior media state is reusable',()=>{
 const plan={
  images:Array.from({length:9},(_,i)=>({slot:i+1})),
  video:{sha256:'approved-video'},modelVariations:{promotion:{discountId:'123'},options:[{},{}]},
  finalFiscal:{ncm:'12345678'},
  reusedMedia:{imageIds:Array.from({length:9},(_,i)=>'image-'+i),video:{phase:'ready',id:'video1'}}
 };
 const progress=shopeeExecutionProgress(job('3747',plan));
 assert.equal(progress.percent,0);
 assert.equal(progress.imagesUploaded,9);
 assert.equal(progress.imagesPublished,0);
 assert.equal(progress.videoPublished,false);
 assert.equal(progress.steps.find(x=>x.id==='images').status,'waiting');
 assert.equal(progress.steps.find(x=>x.id==='variants').status,'waiting');
});

test('Commercial steps are done only after real readback while model and fiscal remain pending',()=>{
 const plan={
  proposed:{item_name:'Approved',description:'Approved description',attribute_list:[{attribute_id:123,attribute_value_list:[]}]},
  modelVariations:{options:[{},{}],promotion:{discountId:'123'}},finalFiscal:{ncm:'12345678'}
 };
 const progress=shopeeExecutionProgress(job('1512',plan,
  {phase:'variation_ready',primaryVerified:true},'running'));
 assert.deepEqual(progress.steps.slice(2,5).map(x=>x.status),['done','done','done']);
 assert.equal(progress.steps[5].status,'waiting');
 assert.equal(progress.steps[6].status,'waiting');
 assert.equal(progress.steps[7].status,'waiting');
 assert.ok(progress.percent<100);
});

test('No-variation SKU skips only the inapplicable variation step',()=>{
 const progress=shopeeExecutionProgress(job('1175',
  {proposed:{description:'x'},commercialDiscount:{snapshot:{discountId:'1'}}},
  {phase:'verified',primaryVerified:true,discount:{status:'verified'}},'verified'));
 assert.equal(progress.steps.length,8);
 assert.equal(progress.steps.find(x=>x.id==='variants').status,'skipped');
 assert.equal(progress.steps.find(x=>x.id==='discount').status,'done');
 assert.equal(progress.percent,100);
 assert.equal(progress.verified,true);
});

test('Fiscal refusal never reports all eight stages completed',()=>{
 const p=shopeeExecutionProgress(job('3747',{
  modelVariations:{options:[{},{}],promotion:{discountId:'123'}},finalFiscal:{ncm:'12345678'}
 },{phase:'verified_partial',primaryVerified:true,variation:{status:'verified'},fiscal:{status:'rejected'}},'verified'));
 assert.equal(p.steps[5].status,'done');
 assert.equal(p.steps[6].status,'attention');
 assert.equal(p.steps[7].status,'waiting');
 assert.ok(p.percent<100);
 assert.equal(p.verified,false);
});

test('Worker skips commercial update globally when approved values already match Shopee',async()=>{
 for(const sku of ['3747','1512']){
  const plan={
   itemId:'58221125342',requiresExplicitConfirmation:true,canExecute:true,
   proposed:{description:'Published'},images:[],video:null,
   modelVariations:{options:[{name:'Red'},{name:'Blue'}]}
  };
  let validated=0,updated=0;
  const output=await advanceShopeeExecution({
   ...job(sku,plan,{phase:'queued'},'running'),plan
  },{
   validateIdentity:async()=>{validated++},
   read:async()=>({item_id:'58221125342',description:'Published'}),
   update:async()=>{updated++}
  });
  assert.equal(validated,1);
  assert.equal(updated,0);
  assert.equal(output.result.phase,'variation_ready');
  assert.equal(output.state,'running');
 }
});

test('Worker updates only the remaining description when images/video are already published',async()=>{
 const video={phase:'ready',id:'video-123'};
 const live={
  item_id:'58221125342',item_name:'Original',description:'Old',
  description_type:'normal',video_info:[{video_upload_id:'video-123'}],
  image:{image_id_list:['image-123']},attribute_list:[],tax_info:{},
  category_id:123,item_status:'NORMAL'
 };
 const plan={
  itemId:'58221125342',requiresExplicitConfirmation:true,canExecute:true,
  original:{item_name:'Original',description:'Old',description_type:'normal',
   video_info:live.video_info,image:live.image,attribute_list:[],tax_info:{},category_id:123},
  proposed:{description:'New'},
  images:[{slot:1}],video:{sha256:'abc'}
 };
 let payload;
 const output=await advanceShopeeExecution({
  ...job('5000',plan,{phase:'queued',imageIds:['image-123'],video},'running'),plan
 },{
  validateIdentity:async()=>{},
  read:async()=>live,
  beforeWrite:async()=>{},
  update:async p=>{payload=p;return {request_id:'request-1'}}
 });
 assert.deepEqual(payload,{item_id:58221125342,description:'New'});
 assert.equal(output.state,'running');
 assert.equal(output.result.phase,'verifying');
});
