import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedTitle} from './fixtures/approved-content.js';
import {compileShopeeExecutionPlan,verifyShopeeFiscalExecution} from '../shopeeExecutionPlan.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';

const base={shopId:9,itemId:'58220952395',modelId:'0',sku:'TUD0667'};
const record={shopId:9,itemId:base.itemId,selectedModelId:'0',sku:base.sku,
 status:'NORMAL',imageCount:0,videoStatus:'Sem vídeo',
 attributeAudit:{attributes:[],missingMandatory:0}};
const live={item_id:58220952395,item_name:'Título antigo',description:'Descrição antiga',
 description_type:'normal',item_status:'NORMAL',tax_info:{},category_id:101,
 attribute_list:[],video_info:[],image:{image_id_list:[]}};
const tax={ncm:'95030099',origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
 csosn:'102',measure_unit:'UN',operation_type:'1',pis_cofins_cst:'99',cest:'00',
 evidence:'Catálogo WeDrop SKU TUD0667 e orientação contábil'};
const review={stages:{seo:{reviewed:true},fiscal:{reviewed:true}},
 draftTitle:approvedTitle,tax};
const plan=()=>compileShopeeExecutionPlan({...base,record,review,live,selectedStage:'all'});

async function executeInMemory({rejectFiscal=false,discardResponse=false}={}){
 const p=plan(),shop=structuredClone(live),writes=[],phases=[],checkpoints=[];
 let job={state:'running',plan:p,result:{phase:'queued'}};
 const io={
  read:async()=>structuredClone(shop),
  validateIdentity:async()=>{},
  beforeWrite:async state=>{checkpoints.push(state.phase);},
  update:async body=>{
   writes.push(body);
   if(body.tax_info){
    if(rejectFiscal)throw Error('product.error_busi: Please upload the corresponding CEST of NCM');
    if(!discardResponse)shop.tax_info={...body.tax_info};
   }else if(body.item_name)shop.item_name=body.item_name;
   return {request_id:'from-test'};
  },
  download:async()=>{throw Error('Não devia enviar vídeo');},
  downloadImage:async()=>{throw Error('Não devia enviar imagem');},
  media:{}
 };
 for(let i=0;i<8;i++){
  const out=await advanceShopeeExecution(job,io);
  phases.push(out.result?.phase);
  job={...job,state:out.state,result:out.result};
  if(out.state!=='running')break;
 }
 return {job,writes,phases,checkpoints,shop};
}

test('todas as etapas incluem fiscal como ÚLTIMA alteração, fora do update comercial',()=>{
 const p=plan();
 assert.equal(p.canExecute,true);
 assert.equal(p.finalFiscal.ncm,'95030099');
 assert.equal(Object.hasOwn(p.finalFiscal,'cest'),false);
 assert.deepEqual(p.actions,['item_name','tax_info']);
 assert.equal(Object.hasOwn(p.proposed,'tax_info'),false);
});

test('execução fiscal só começa DEPOIS de a Shopee confirmar a edição comercial',async()=>{
 const result=await executeInMemory();
 assert.equal(result.job.state,'verified');
 assert.deepEqual(result.writes.map(x=>Object.keys(x)),[['item_id','item_name'],['item_id','tax_info']]);
 assert.deepEqual(result.checkpoints,['updating','fiscal_updating']);
 assert.ok(result.phases.indexOf('fiscal_ready')>result.phases.indexOf('verifying'));
 assert.equal(verifyShopeeFiscalExecution(result.job.plan,result.shop,result.job.result),true);
 const progress=shopeeExecutionProgress({...result.job,updated_at:new Date().toISOString()});
 assert.equal(progress.verified,true);
 assert.equal(progress.fiscalStatus,'verified');
 assert.equal(progress.steps.at(-1).status,'done');
});

test('se a Shopee rejeitar CEST, comercial é confirmado mas fiscal segue pendente',async()=>{
 const result=await executeInMemory({rejectFiscal:true});
 assert.equal(result.job.state,'verified');
 assert.equal(result.job.result.phase,'verified_partial');
 assert.equal(result.job.result.fiscal.status,'rejected');
 assert.equal(result.writes.length,2);
 const progress=shopeeExecutionProgress({...result.job,updated_at:new Date().toISOString()});
 assert.equal(progress.verified,false);
 assert.equal(progress.fiscalPartial,true);
 assert.equal(progress.fiscalStatus,'rejected');
 assert.equal(progress.steps.at(-1).status,'attention');
 assert.ok(progress.percent<100);
});

test('sem resposta fiscal confirmada, NUNCA repetir o envio automaticamente',async()=>{
 const p=plan(),shop=structuredClone(live),calls=[];
 shop.item_name=approvedTitle;
 const result={phase:'fiscal_updating',primaryVerified:true,fiscalStartedAt:Date.now(),
  requestId:'sent',events:[]};
 const job={state:'running',plan:p,result};
 const out=await advanceShopeeExecution(job,{
  read:async()=>shop,
  validateIdentity:async()=>{throw Error('Não deveria validar de novo');},
  update:async()=>{calls.push('update');}
 });
 assert.equal(out.state,'running');
 assert.equal(out.result.phase,'fiscal_verifying');
 assert.deepEqual(calls,[]);
});
