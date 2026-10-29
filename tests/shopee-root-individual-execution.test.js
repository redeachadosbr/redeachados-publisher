import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileShopeeExecutionPlan,normalizeShopeeExecutionStage,confirmShopeeExecution} from '../shopeeExecutionPlan.js';
import {shopeeExecutionProgress} from '../shopeeExecutionProgress.js';
import {advanceShopeeExecution} from '../shopeeExecutionWorker.js';
const source=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const record={sku:'310200',itemId:'101',selectedModelId:'0',status:'NORMAL',imageCount:9,
 attributeAudit:{missingMandatory:3,attributes:[]}};
const live={item_id:101,item_name:'Anúncio atual',description:'Descrição atual',
 description_type:'normal',item_status:'NORMAL',image:{image_id_list:[]},tax_info:{}};
const ctx={shopId:1,itemId:'101',modelId:'0',sku:'310200',record,live,review:{stages:{}}};
const promo=()=>compileShopeeExecutionPlan({...ctx,selectedStage:'discount',allowDiscountOnly:true});
test('motor raiz possui todas as oito escolhas individuais',()=>{
 for(const stage of ['images','video','seo','description','technical','variants','fiscal','discount'])
  assert.equal(normalizeShopeeExecutionStage(stage),stage);
 const html=source('public/index.html');
 assert.match(html,/<option value="variants">Somente variações \(etapa 06\)/);
 assert.match(html,/<option value="discount">Somente desconto \(etapa 08/);
});
test('raiz: somente desconto é um plano de etapa 08 sem outras escritas',()=>{
 const plan=promo();
 assert.equal(plan.canExecute,true);
 assert.equal(plan.discountOnly,true);
 assert.deepEqual(plan.actions,['discount']);
 assert.deepEqual(plan.proposed,{});
 assert.equal(plan.images.length,0);
 assert.equal(plan.video,null);
 assert.equal(plan.finalFiscal,null);
 assert.equal(plan.modelVariations,null);
 assert.doesNotThrow(()=>confirmShopeeExecution(plan,{sku:'310200',confirmation:'EXECUTAR 310200'}));
 const progress=shopeeExecutionProgress({state:'prepared',plan});
 assert.equal(progress.steps[7].id,'discount');
 assert.ok(progress.percent<100);
});
test('raiz: trabalho exclusivo vai diretamente para promoção, sem update_item',async()=>{
 const plan=promo();
 const called=[];
 const out=await advanceShopeeExecution({state:'running',plan:{...plan,
  commercialDiscount:{snapshot:{discountId:'202'}}},result:{phase:'queued'}},{
  read:async()=>live,
  validateIdentity:async()=>called.push('validate'),
  update:async()=>{throw Error('não pode atualizar anúncio-pai')},
  beforeWrite:async()=>{throw Error('não pode escrever anúncio-pai')}
 });
 assert.equal(out.state,'running');
 assert.equal(out.result.phase,'discount_ready');
 assert.deepEqual(called,['validate']);
});
test('raiz: somente variações não cria promoção nem inclui fiscal, mídia ou título',()=>{
 const models={type:'cor',alreadyCreated:false,options:[
  {name:'Azul',sku:'AZUL',supplierSku:'WD-A',cost:10,price:20,stock:8},
  {name:'Vermelho',sku:'VERM',supplierSku:'WD-V',cost:10,price:20,stock:8}]};
 const plan=compileShopeeExecutionPlan({...ctx,selectedStage:'variants',modelVariations:models});
 assert.equal(plan.canExecute,true);
 assert.deepEqual(plan.actions,['model_variations']);
 assert.deepEqual(plan.proposed,{});
 assert.equal(plan.images.length,0);
 assert.equal(plan.video,null);
 assert.equal(plan.finalFiscal,null);
 assert.equal(plan.modelVariations.promotion,undefined);
 const progress=shopeeExecutionProgress({state:'prepared',plan});
 assert.equal(progress.steps[5].id,'variants');
 assert.equal(progress.steps[5].status,'waiting');
 assert.equal(progress.steps[7].status,'skipped');
});
test('UI e servidor não exigem desconto ao executar somente variações',()=>{
 const app=source('public/app.js'),server=source('server.js');
 assert.match(server,/\['all','remaining','variants'\]\.includes\(selectedStage\)/);
 assert.match(server,/if\(modelVariations&&selectedStage!=='variants'\)/);
 assert.match(server,/\['all','remaining','discount','discount_adjust'\]\.includes\(plan\.selectedStage\)&&!linkedKit/);
 assert.match(app,/\['all','remaining','discount','discount_adjust'\]\.includes\(p\.selectedStage\)/);
 assert.match(app,/p\?\.selectedStage==='variants'/);
 assert.match(app,/p\?\.selectedStage==='discount'/);
});

test('etapa 08 do motor raiz respeita o preço promocional salvo por SKU, sem aplicar o valor de outra',()=>{
 const skuA=compileShopeeExecutionPlan({...ctx,sku:'310200',selectedStage:'discount_adjust',
  allowDiscountOnly:true});
 const skuB=compileShopeeExecutionPlan({...ctx,sku:'B456',record:{...ctx.record,sku:'B456'},selectedStage:'discount_adjust',
  allowDiscountOnly:true});
 assert.equal(skuA.selectedStage,'discount_adjust');
 assert.equal(skuB.selectedStage,'discount_adjust');
 assert.notEqual(skuA.sku,skuB.sku);
 assert.deepEqual(skuA.actions,['discount']);
 assert.deepEqual(skuB.actions,['discount']);
 const app=source('public/app.js'),server=source('server.js');
 assert.match(server,/\['all','discount','discount_adjust'\]\.includes\(selectedStage\)/);
 assert.match(server,/\['all','remaining','discount','discount_adjust'\]\.includes\(plan\.selectedStage\)&&!linkedKit/);
 assert.match(app,/\['all','discount','discount_adjust'\]\.includes\(\$\('#optimizerExecutionScope'\)\.value\)/);
 assert.match(app,/\['all','remaining','discount','discount_adjust'\]\.includes\(p\.selectedStage\)/);
 assert.match(app,/price bruto atual difere|preço bruto atual difere/i);
});

test('o worker aplica por SKU exatamente o preço promocional aprovado, nunca o preço antigo',async()=>{
 const {advanceVerifiedDiscount}=await import('../shopeeExecutionDiscount.js');
 const first={shopId:1,sku:'310200',itemId:'101',modelId:'0',discountId:'202',
  gross:160.74,promo:128.59,buyerAfterCoupon:127.30,couponPct:1,discountPct:20,
  quoteAt:'2026-10-29T12:00:00Z',originalPrice:189.37};
 const second={...first,sku:'ABC456',itemId:'303',gross:88.90,promo:71.19,
  buyerAfterCoupon:70.49,originalPrice:99.90};
 const published=[];
 for(const item of [first,second]){
  const live={...item,originalPrice:item.gross,action:'add'};
  const out=await advanceVerifiedDiscount({plan:{commercialDiscount:{
   snapshot:item,allowPriceChange:true}},result:{phase:'discount_ready'}},{
   discountRead:async()=>live,
   beforeWrite:async()=>{},
   discountPublish:async approved=>published.push({
    sku:approved.sku,itemId:approved.itemId,promo:approved.promo,gross:approved.gross
   })
  });
  assert.equal(out.result.phase,'discount_verifying');
 }
 assert.deepEqual(published,[{sku:'310200',itemId:'101',promo:128.59,gross:160.74},
  {sku:'ABC456',itemId:'303',promo:71.19,gross:88.90}]);
 assert.equal(published.some(p=>p.promo===189.37),false);
});
