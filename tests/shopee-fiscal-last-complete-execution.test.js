import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedTitle} from './fixtures/approved-content.js';
import {compileShopeeExecutionPlan,verifyShopeeFiscalExecution} from '../shopeeExecutionPlan.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
import {advanceVerifiedDiscount} from '../shopeeExecutionDiscount.js';
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
 assert.equal(p.finalFiscal.cest,'00');
 assert.deepEqual(p.actions,['item_name','tax_info']);
 assert.equal(Object.hasOwn(p.proposed,'tax_info'),false);
});

test('execução fiscal só começa DEPOIS de a Shopee confirmar a edição comercial',async()=>{
 const result=await executeInMemory();
 assert.equal(result.job.state,'verified');
 assert.deepEqual(result.writes.map(x=>Object.keys(x)),[['item_id','item_name'],['item_id','tax_info']]);
 assert.equal(result.writes[1].tax_info.cest,'00');
 assert.deepEqual(result.checkpoints,['updating','fiscal_updating']);
 assert.ok(result.phases.indexOf('fiscal_ready')>result.phases.indexOf('verifying'));
 assert.equal(verifyShopeeFiscalExecution(result.job.plan,result.shop,result.job.result),true);
 const progress=shopeeExecutionProgress({...result.job,updated_at:new Date().toISOString()});
 assert.equal(progress.verified,true);
 assert.equal(progress.fiscalStatus,'verified');
 assert.equal(progress.steps.find(x=>x.id==='fiscal').status,'done');
 assert.equal(progress.steps.at(-1).status,'review');
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
 assert.equal(progress.steps.find(x=>x.id==='fiscal').status,'attention');
 assert.equal(progress.steps.at(-1).status,'review');
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

test('etapa 08 ocorre após a verificação fiscal, e só conclui com desconto confirmado',async()=>{
 const p=plan(),price={shopId:'9',sku:base.sku,itemId:base.itemId,modelId:'0',
  discountId:'123456',gross:250,promo:200,buyerAfterCoupon:198,couponPct:1,
  discountPct:20,quoteAt:'2026-10-23T00:00:00Z',originalPrice:230};
 p.commercialDiscount={snapshot:price,allowPriceChange:true};
 const shop=structuredClone(live);shop.item_name=approvedTitle;shop.tax_info={...p.finalFiscal};
 let original=230,discountAdded=false,priceWrites=0,promoWrites=0;
 const io={
  read:async()=>shop,validateIdentity:async()=>{},beforeWrite:async()=>{},
  discountRead:async()=>({...price,originalPrice:original,action:discountAdded?'already':'add'}),
  discountUpdatePrice:async()=>{priceWrites++;original=250;},
  discountPublish:async()=>{promoWrites++;discountAdded=true;}
 };
 let job={state:'running',plan:p,result:{phase:'fiscal_verifying',primaryVerified:true,
  fiscalStartedAt:Date.now()}};
 const phases=[];
 for(let i=0;i<12;i++){
  const out=await advanceShopeeExecution(job,io);
  job={...job,state:out.state,result:out.result};phases.push(job.result.phase);
  if(job.state!=='running')break;
 }
 assert.equal(job.state,'verified');
 assert.ok(phases.indexOf('discount_ready')>phases.indexOf('fiscal_verifying')||phases[0]==='discount_ready');
 assert.deepEqual([priceWrites,promoWrites],[1,1]);
 const progress=shopeeExecutionProgress(job);
 assert.equal(progress.percent,100);
 assert.equal(progress.steps.at(-1).label,'08 · Desconto — última etapa');
 assert.equal(progress.discountStatus,'verified');
});

test('resposta incerta de promocao nao causa segunda escrita',async()=>{
 const snapshot={shopId:'9',sku:'3747',itemId:'12',modelId:'0',discountId:'12345',
  gross:200,promo:160,buyerAfterCoupon:158,couponPct:1,discountPct:20,
  quoteAt:'2026-10-23T00:00:00Z',originalPrice:200};
 const p={requiresExplicitConfirmation:true,canExecute:true,itemId:'12',sku:'3747',
  selectedStage:'all',commercialDiscount:{snapshot,allowPriceChange:false}};
 let writes=0;
 const io={beforeWrite:async()=>{},discountRead:async()=>({...snapshot,action:'add'}),
  discountPublish:async()=>{writes++;throw Error('API sem resposta conclusiva');}};
 const first=await advanceVerifiedDiscount({plan:p,result:{phase:'discount_ready'}},io);
 assert.equal(first.state,'uncertain');
 assert.equal(writes,1);
 // Mesmo se uma leitura manual examinar o checkpoint, nao pode repetir o POST.
 const later=await advanceVerifiedDiscount({plan:p,result:{...first.result,phase:'discount_verifying'}},io);
 assert.equal(later.state,'running');
 assert.equal(writes,1);
 const progress=shopeeExecutionProgress({state:'uncertain',plan:p,result:first.result});
 assert.ok(progress.percent<100);
 assert.equal(progress.steps.at(-1).id,'discount');
});

test('anúncio já atualizado pode executar somente desconto sem reenviar imagens ou texto',async()=>{
 const current=structuredClone(live);current.item_name=approvedTitle;
 current.tax_info=plan().finalFiscal;
 const p=compileShopeeExecutionPlan({...base,record,review,live:current,
  selectedStage:'all',allowDiscountOnly:true});
 assert.equal(p.discountOnly,true);
 assert.equal(p.canExecute,true);
 assert.deepEqual(p.actions,['discount']);
 p.commercialDiscount={snapshot:{sku:base.sku,discountId:'123456',gross:220},allowPriceChange:false};
 let apiWrites=0;
 const out=await advanceShopeeExecution({state:'running',plan:p,
  result:{phase:'queued',events:[]}},{
   read:async()=>current,validateIdentity:async()=>{},download:async()=>{},
   update:async()=>{apiWrites++;},beforeWrite:async()=>{}
  });
 assert.equal(out.state,'running');
 assert.equal(out.result.phase,'discount_ready');
 assert.equal(apiWrites,0);
});

test('motor único: variações entram na prévia e são confirmadas antes do desconto',async()=>{
 const opts=[{name:'VERMELHO',sku:'3747-VERMELHO',supplierSku:'3747',cost:349.99,
  price:745.99,stock:1,asset:{sha256:'red-sha',mime:'image/png'}},
  {name:'ROSA',sku:'3747-ROSA',supplierSku:'3746',cost:349.99,
   price:745.99,stock:1,asset:{sha256:'pink-sha',mime:'image/png'}}];
 const reviewed={stages:{},variationConfig:{enabled:true,type:'Cor',values:['VERMELHO','ROSA']}};
 const publishedPlan=compileShopeeExecutionPlan({...base,record,review:reviewed,live,
  modelVariations:{type:'Cor',options:opts,promotion:{discountId:'512820626272845',gross:741.77,promo:557.05}},
  selectedStage:'all'});
 assert.equal(publishedPlan.canExecute,true);
 assert.ok(publishedPlan.actions.includes('model_variations'));
 const signed={...publishedPlan,commercialDiscount:{snapshot:{
  shopId:'9',sku:base.sku,itemId:base.itemId,modelId:'0',discountId:'512820626272845',
  gross:741.77,promo:557.05,originalPrice:745.99},allowPriceChange:true}};
 let modelsCreated=false,pricesAdjusted=false,promotion=false,uploads=0,links=0;
 const writings=[];
 const io={
  read:async()=>live,validateIdentity:async()=>{},beforeWrite:async x=>writings.push('checkpoint:'+x.phase),
  variationImage:async()=>String(++uploads),
  variationRead:async()=>({item:{has_model:modelsCreated},models:modelsCreated?
   opts.map((o,i)=>({model_sku:o.sku,model_id:i+1,
    price_info:[{original_price:pricesAdjusted?741.77:745.99}]})):[]}),
  variationPublish:async()=>{writings.push('create_variations');modelsCreated=true},
  variationLink:async()=>{links++},
  variationCost:async()=>({unitCost:349.99}),
  variationUpdatePrices:async()=>{writings.push('update_model_prices');pricesAdjusted=true},
  variationPromotionRead:async()=>({status:'ongoing',action:'add',member:promotion?
   {model_list:[{model_id:1,model_promotion_price:557.05},
    {model_id:2,model_promotion_price:557.05}]}:null}),
  variationDiscountPublish:async()=>{writings.push('publish_model_promo');promotion=true}
 };
 let j={state:'running',plan:signed,result:{phase:'queued'}};
 for(let i=0;i<17&&j.state==='running';i++){
  const next=await advanceShopeeExecution(j,io);
  j={...j,state:next.state,result:next.result};
 }
 assert.equal(j.state,'verified');
 assert.equal(uploads,2);
 assert.ok(links>=1);
 assert.deepEqual(writings.filter(x=>!x.startsWith('checkpoint:')),
  ['create_variations','update_model_prices','publish_model_promo']);
 assert.equal(shopeeExecutionProgress(j).percent,100);
 assert.deepEqual(shopeeExecutionProgress(j).steps.slice(-3).map(x=>x.id),
  ['variants','fiscal','discount']);
});
test('resultado incerto de criação de modelos não gera segundo POST',async()=>{
 const plan={requiresExplicitConfirmation:true,canExecute:true,
  itemId:'58221125342',modelVariations:{type:'Cor',options:[{
   name:'VERMELHO',sku:'3747-VERMELHO',supplierSku:'3747',cost:349.99,price:745.99,
   asset:{mime:'image/png',sha256:'red'}}]}};
 let writes=0;
 const io={variationRead:async()=>({item:{has_model:false},models:[]}),
  validateIdentity:async()=>{},beforeWrite:async()=>{},
  variationPublish:async()=>{writes++;throw Error('Shopee timeout')},
  variationImage:async()=>('id1')};
 const first=await advanceShopeeExecution({state:'running',plan,
  result:{phase:'variation_ready',variationImageIds:['id1']}},io);
 assert.equal(first.state,'uncertain');
 assert.equal(writes,1);
 const second=await advanceShopeeExecution({state:'running',plan,
  result:{...first.result,phase:'variation_verifying'}},io);
 assert.equal(second.state,'running');
 assert.equal(writes,1);
});
