import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kitPublishFields,kitPublishPayload,kitApprovalFingerprint,validatePublishedKitResponse} from '../shopeeKitPublish.js';
import {chooseUniqueLiveKitSku,plausibleKitComponentTitle} from '../shopeeKitPlatform.js';
import {validateKitOptimizationTarget} from '../shopeeKitOptimization.js';
const kit={
 kitSku:'KIT-CO400-GA500',
 components:[{sku:'CO400',name:'Copo'},{sku:'GA500',name:'Garrafa'}],
 quote:{grossPrice:89.74,marketplacePrice:71.79,afterCoupon:71.09,targetMarginPct:15}
};
const photos=['br-11134207-7r98o-lzri4neb5vcv18'];
const input={
 title:'Kit Garrafa 500ml com Copo para Agua',
 description:'✨ Kit original com garrafa e copo em peças individuais. ✅ BENEFÍCIOS: itens para servir bebidas. 📦 O QUE VAI NA EMBALAGEM: uma garrafa e um copo, sem itens adicionais.',
 mainSku:'GA500',weightKg:1.12,lengthCm:30,widthCm:25,heightCm:18,
 logisticId:'90003',imageIds:photos,preOrder:false,photosReviewed:true,singleParcelConfirmed:true,
 contentsReviewed:true,autoSyncDts:false
};
const linked=[
 {supplierSku:'CO400',shopeeSku:'CO400',itemId:'12345',modelId:'0',status:'NORMAL'},
 {supplierSku:'GA500',shopeeSku:'GA500',itemId:'23456',modelId:'0',status:'NORMAL'}
];
test('Kit Formal precisa validação humana de foto, SKU principal e envio real',()=>{
 for(const diff of [
  {mainSku:'INVENTADO'},{photosReviewed:false},{contentsReviewed:false},
  {weightKg:0},{lengthCm:0},{logisticId:''},{imageIds:[]},{singleParcelConfirmed:false},
  {preOrder:true,daysToShip:0}
 ])assert.throws(()=>kitPublishFields({...input,...diff},kit));
 const fields=kitPublishFields(input,kit);
 const payload=kitPublishPayload(kit,fields,linked);
 assert.equal(payload.item_setting.item_sku,kit.kitSku);
 assert.equal(payload.item_setting.unlisted,false);
 assert.equal(payload.item_setting.model_list[0].original_price,89.74);
 assert.equal(payload.item_setting.images.image_id_list.length,1);
 assert.equal(payload.item_setting.model_list[0].component_list.length,2);
 assert.deepEqual(payload.item_setting.model_list[0].component_list.map(x=>x.quantity),[1,1]);
 assert.equal(payload.item_setting.model_list[0].component_list.filter(x=>x.main_component).length,1);
 assert.equal(payload.item_setting.model_list[0].component_list[1].main_component,true);
 assert.equal(payload.item_setting.logistic_info[0].logistic_id,90003);
 assert.equal(payload.item_setting.dimension.package_length,30);
 assert.deepEqual(payload.item_setting.tier_variation_list[0].option_list,[{option:'Kit completo'}]);
 assert.equal(payload.sync_setting.auto_sync_dts,false);
 assert.ok(!JSON.stringify(payload).includes('71.79'),'não aplicar desconto dentro da criação');
});
test('Preview assinado muda quando custo, SKU ou mídia muda',()=>{
 const f=kitPublishFields(input,kit),a=kitApprovalFingerprint(kit,f,linked);
 assert.notEqual(a,kitApprovalFingerprint({...kit,quote:{...kit.quote,grossPrice:91.74}},f,linked));
 assert.notEqual(a,kitApprovalFingerprint(kit,{...f,photoIds:['br-11134207-7r98o-lzri4neb5vcv19']},linked));
 assert.notEqual(a,kitApprovalFingerprint(kit,f,[{...linked[0],itemId:'54321'},linked[1]]));
});
test('Publicação exige Item ID real; nunca inferir sucesso',()=>{
 assert.equal(validatePublishedKitResponse({response:{item_id:932459}}),'932459');
 assert.throws(()=>validatePublishedKitResponse({response:{}}),/não confirmou/);
 assert.throws(()=>kitPublishPayload(kit,kitPublishFields(input,kit),
  [linked[0],{...linked[1],status:'UNLIST'}]),/ativo/);
});
test('Manager mostra ordem: revisar, publicar, desconto; rotas autenticadas',()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const browser=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 for(const name of ['readiness','media','preview','execute','status'])
  assert.match(server,new RegExp("/api/shopee/kits/publish/"+name));
 assert.match(server,/req\.body\?\.confirm!==true/);
 assert.match(server,/verifyDiscountPreview/); // assinatura usada no serviço
 assert.match(html,/id="kitPublishExecute"/);
 assert.match(html,/id="kitDiscountNext"/);
 assert.match(html,/id="kitMainSku"/);
 assert.match(html,/id="kitWeightKg"/);
 assert.match(html,/id="kitLogisticId"/);
 assert.match(browser,/kitPreparePublishPreview/);
 assert.match(browser,/kitPublishExecute/);
 assert.match(browser,/window\.confirm/);
 assert.doesNotMatch(browser,/function refreshKitPrices\(kit\)\{\s*refreshKitPrices\(kit\)/);
});

test('desconto não pode ser solicitado na criação; só após publicação Shopee e prévia separada',()=>{
 const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const discount=fs.readFileSync(new URL('../shopeeKitDiscountService.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const name of ['/api/shopee/kits/discount/preview','/api/shopee/kits/discount/execute'])
  assert.ok(server.includes(name));
 assert.match(discount,/publication\?\.status!=='published'/);
 assert.match(discount,/get_item_base_info/);
 assert.match(discount,/get_model_list/);
 assert.match(discount,/lookupShopeeCompetitors/);
 assert.match(discount,/REDE_ACHADOS_MARKET_RULES\.minimumOffers/);
 assert.match(discount,/\[0,9\]/);
 assert.match(discount,/readDiscountPages/);
 assert.match(discount,/add_discount_item/);
 assert.match(discount,/update_discount_item/);
 assert.match(html,/id="kitDiscountExecute"/);
 assert.match(html,/id="kitSingleParcelConfirmed"/);
});

test('Kit Formal recupera somente um Item ID oficial e SKU exata',()=>{
 const result=chooseUniqueLiveKitSku('TX24508E',[
  {itemId:'23295176595',sku:'TX24508E',status:'NORMAL',modelId:'0'},
  {itemId:'23666666666',sku:'OUTRA-SKU',status:'NORMAL',modelId:'0'}
 ]);
 assert.equal(result.candidate.itemId,'23295176595');
 assert.equal(result.activeCount,1);
 assert.equal(chooseUniqueLiveKitSku('TX24508E',[
  {itemId:'23295176595',sku:'TX24508E',status:'UNLIST'}
 ]).candidate,null);
 assert.equal(chooseUniqueLiveKitSku('TX24508E',[
  {itemId:'23295176595',sku:'TX24508E',status:'NORMAL'},
  {itemId:'23666666666',sku:'TX24508E',status:'NORMAL'}
 ]).candidate,null,'SKU duplicada não permite vínculo automático');
});
test('Kit impede vínculo de estojo com anúncio de mochila pelo mesmo código',()=>{
 assert.equal(plausibleKitComponentTitle('Estojo Escolar T-Rex Attack','Estojo Escolar Infantil Dinossauro'),true);
 assert.equal(plausibleKitComponentTitle('Estojo Escolar T-Rex Attack','Mochila Dinossauro de Rodinhas'),false);
 assert.equal(plausibleKitComponentTitle('Mochila Dinossauro de Rodinhas','Mochila Escolar Carrinho'),true);
 const platform=fs.readFileSync(new URL('../shopeeKitPlatform.js',import.meta.url),'utf8');
 assert.match(platform,/findLiveShopeeSku/);
 assert.match(platform,/upsertWeDropSkuLink/);
 assert.match(platform,/plausibleKitComponentTitle/);
 assert.doesNotMatch(platform,/similarityScore|fuzzyMatch/);
});
test('Etapa 10 utiliza somente a SKU principal Shopee, sem exigir anuncio dos complementos WeDrop',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const builder=fs.readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const optimization=fs.readFileSync(new URL('../shopeeKitOptimization.js',import.meta.url),'utf8');
 assert.match(html,/id="kitWizardOpenExecution"[^>]*>▶ Executar na Shopee/);
 const click=builder.slice(builder.indexOf("$('#kitWizardOpenExecution')?.addEventListener('click'"),
  builder.indexOf("$('#kitWizardOpenTechnical')?.addEventListener('click'"));
 assert.match(click,/kitWizardResumeTargetForExecution/);
 assert.match(click,/await saveDraft\(\)/);
 assert.doesNotMatch(click,/kitWizardExecuteNewKit|kitPublishGuideNext|kitPublicationReadiness|Kit Formal/);
 const flow=builder.slice(builder.indexOf('async function kitWizardResumeTargetForExecution()'),
  builder.indexOf('let kitWizardExecutionOpening='));
 assert.match(flow,/const principal=String\(prepared\.kit\.components\?\.\[0\]\?\.sku\|\|''\)/);
 assert.match(flow,/kitWizardEnsureExecutionLink/);
 assert.match(flow,/kitExistingOptimizer\.resumeLiveVerifiedTarget/);
 assert.ok(flow.indexOf('kitWizardEnsureExecutionLink')<flow.indexOf('kitExistingOptimizer.resumeLiveVerifiedTarget'));
 assert.match(optimization,/SKUs complementares são vinculadas na WeDrop/);
});

test('Mochila Shopee e estojo somente WeDrop: permitir a SKU principal sem anuncio secundario',()=>{
 const kit={
  kitSku:'KIT-TX24505K-TX24508E',
  components:[{sku:'TX24505K',name:'Mochila Escolar de Rodinhas Dinossauro'},
   {sku:'TX24508E',name:'Estojo Escolar T-Rex Attack'}],
  componentCost:49.98,kitCost:49.98,shipping:0,packing:0,
  quote:{grossPrice:149.90,marketplacePrice:99.50,targetMarginPct:15}
 };
 const saved={
  kitSku:kit.kitSku,skus:kit.components.map(p=>p.sku),kit,
  creative:{title:'Kit Mochila Escolar de Rodinhas e Estojo Dinossauro',
   description:'✨ Kit completo com mochila escolar de rodinhas e estojo para materiais escolares.'}
 };
 const itemId='58271882120';
 const linked=validateKitOptimizationTarget({saved,kit,
  record:{itemId,sku:'TX24505K',selectedModelId:0,status:'NORMAL',
   title:'Mochila Escolar de Rodinhas Dinossauro'},
  targetSku:'TX24505K',mainSku:'TX24505K',itemId,modelId:'0',
  confirmedItemId:itemId
 });
 assert.equal(linked.mainSku,'TX24505K');
 assert.deepEqual(linked.componentSkus,['TX24505K','TX24508E']);
 assert.equal(linked.componentCost,49.98);
 assert.ok(linked.componentNames.some(name=>name.includes('Estojo')));
});
