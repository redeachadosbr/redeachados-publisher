import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

const sku2392={sku:'2392',itemId:'58221348619',modelId:'0',
 selectedStage:'all',canExecute:true,
 images:Array.from({length:9},(_,i)=>({slot:i+1})),
 video:{filename:'Mulher_apresenta_bicicleta_rosa.mp4'},
 original:{image:{image_id_list:[]},video_info:[]},
 proposed:{item_name:'Bicicleta Infantil Moto Cross Aro 16 Rosa'},
 finalFiscal:{ncm:'87120010'},confirmedStages:{seo:false,technical:false,description:false}
};
test('plano da SKU2392 sem início: 0% é prévia, não execução travada',()=>{
 const p=shopeeExecutionProgress({sku:'2392',item_id:'58221348619',
  model_id:'0',state:'prepared',plan:sku2392,run_id:null,result:null,last_error:null});
 assert.equal(p.percent,0);assert.equal(p.hasStarted,false);
 assert.equal(p.resumable,false);assert.equal(p.awaitingAuthorization,true);
 assert.match(p.title,/aguardando autorização/i);
 assert.match(p.message,/Nenhuma publicação foi iniciada/);
 assert.equal(p.discountStatus,'awaiting_execution_confirmation');
 assert.equal(p.steps.at(-1).status,'authorization');
 assert.equal(p.imagesUploaded,0);assert.equal(p.imagesPublished,0);
});
test('execução iniciada antiga sem desconto exige nova conferência sem alegar que desconto foi recusado',()=>{
 const p=shopeeExecutionProgress({sku:'2392',state:'running',plan:sku2392,
  result:{phase:'updating',startedAt:'2026-10-25T04:00:00Z'}});
 assert.equal(p.discountStatus,'not_approved_for_this_run');
 assert.equal(p.steps.at(-1).status,'review');
});
test('retomada de imagens já enviadas continua disponível sem afirmar publicação',()=>{
 const p=shopeeExecutionProgress({sku:'2392',state:'prepared',plan:{
  ...sku2392,reusedMedia:{imageIds:Array.from({length:9},(_,i)=>'media'+i)}},
  result:null});
 assert.equal(p.hasStarted,false);assert.equal(p.resumable,true);
 assert.equal(p.imagesUploaded,9);assert.equal(p.imagesPublished,0);
});
test('interface oferece recuperação do desconto e diferencia aprovação fiscal de execução',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(js,/optimizerExecutionFixDiscount/);
 assert.match(js,/Aguardando sua autorização/);
 assert.match(js,/Ficha técnica foi reaberta por correção/);
 assert.match(js,/optimizerDiscountOpenReview\(\)/);
 assert.match(js,/optimizerExecutionPrepare\(\)/);
});
