import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kitPublishFields,kitPublishPayload,kitApprovalFingerprint,validatePublishedKitResponse} from '../shopeeKitPublish.js';
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
 logisticId:'90003',imageIds:photos,preOrder:false,photosReviewed:true,
 contentsReviewed:true,autoSyncDts:false
};
const linked=[
 {supplierSku:'CO400',shopeeSku:'CO400',itemId:'12345',modelId:'0',status:'NORMAL'},
 {supplierSku:'GA500',shopeeSku:'GA500',itemId:'23456',modelId:'0',status:'NORMAL'}
];
test('Kit Formal precisa validação humana de foto, SKU principal e envio real',()=>{
 for(const diff of [
  {mainSku:'INVENTADO'},{photosReviewed:false},{contentsReviewed:false},
  {weightKg:0},{lengthCm:0},{logisticId:''},{imageIds:[]},
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
