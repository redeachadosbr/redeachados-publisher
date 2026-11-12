import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commercialCategoryFields,commercialAttributePayload,commercialKitFields,commercialKitPayload} from '../shopeeKitCommercial.js';
import {commercialSignPreview,commercialVerifyPreview,isDefinitiveShopeeRejection} from '../shopeeKitCommercialService.js';
import {enabledShopeeChannels} from '../shopeeLogisticsChannels.js';

const kit={kitSku:'KIT-894939-894182',components:[
 {sku:'894939',name:'Bola Interativa para Gatos'},
 {sku:'894182',name:'Escova Formato Gato'}
],quote:{grossPrice:69.90}};
const input={
 mainSku:'894939',categoryId:12345,categoryReviewed:true,
 title:'✨ Kit Bola Interativa para Gatos e Escova Formato Gato · Brincadeira e Cuidado Pet',
 description:'✨ Kit completo com uma bola interativa e uma escova formato gato. ✅ Uma unidade de cada produto para brincar e cuidar dos pelos do pet.',
 logisticId:'80001',weightKg:0.4,lengthCm:20,widthCm:18,heightCm:12,
 imageIds:Array.from({length:9},(_,i)=>'image-verified-'+i),
 contentsReviewed:true,photosReviewed:true,singleParcelConfirmed:true,
 attributes:[]
};
const channel=[{id:'80001',name:'Envio'}];
const tree={response:{list:[{category_id:12345,attribute_tree:[
 {attribute_id:11,mandatory:true,name:'Material',attribute_info:{input_type:1},
  attribute_value_list:[{value_id:10,name:'Plástico',multi_lang:[{language:'pt-BR',value:'Plástico'}]}]},
 {attribute_id:12,mandatory:false,name:'Cor',attribute_info:{input_type:1},
  attribute_value_list:[{value_id:20,name:'Azul'}]}
]}]}};

test('publicação comercial usa um único anúncio com a SKU principal; complementares não aparecem no payload',()=>{
 const fields=commercialKitFields(input,kit,channel,input.imageIds);
 const payload=commercialKitPayload(fields,kit,[{attribute_id:11,attribute_value_list:[{value_id:10,original_value_name:'Plástico'}]}]);
 assert.equal(payload.item_sku,'894939');
 assert.equal(payload.item_status,'NORMAL');
 assert.equal(payload.original_price,69.9);
 assert.equal(payload.normal_stock,1);
 assert.equal(payload.image.image_id_list.length,9);
 assert.equal(payload.attribute_list.length,1);
 assert.equal(JSON.stringify(payload).includes('894182'),false);
 assert.equal(JSON.stringify(payload).includes('KIT-894939'),false);
 assert.equal(payload.model_list,undefined);
 assert.equal(payload.component_list,undefined);
});
test('categoria e atributos oficiais obrigatórios são validados; opcionais não bloqueiam',()=>{
 assert.equal(commercialCategoryFields(tree,12345,[]).length,2);
 assert.throws(()=>commercialAttributePayload(tree,12345,[]),/Material/);
 const attribute=commercialAttributePayload(tree,12345,[{id:11,valueId:10}]);
 assert.deepEqual(attribute,[{attribute_id:11,attribute_value_list:[{value_id:10,original_value_name:'Plástico'}]}]);
 assert.throws(()=>commercialAttributePayload(tree,12345,[{id:11,valueId:999}]),/não pertence/);
 assert.throws(()=>commercialAttributePayload(tree,12345,[{id:11,text:'Qualquer texto'}]),/Selecione uma opção oficial/);
});
test('dados sem origem comprovada bloqueiam a criação sem inventar categoria ou medidas',()=>{
 assert.throws(()=>commercialKitFields({...input,categoryReviewed:false},kit,channel,input.imageIds),/Confirme a categoria/);
 assert.throws(()=>commercialKitFields({...input,weightKg:0},kit,channel,input.imageIds),/peso/);
 assert.throws(()=>commercialKitFields({...input,mainSku:'SKU-NAO-PERTENCE'},kit,channel,input.imageIds),/principal/);
 assert.throws(()=>commercialKitFields({...input,imageIds:input.imageIds.slice(0,8)},kit,channel,input.imageIds),/nove imagens/);
 assert.throws(()=>commercialKitFields({...input,description:input.description+' SKU 894182'},kit,channel,input.imageIds),/códigos internos/);
 assert.throws(()=>commercialKitFields({...input,logisticId:'199'},kit,channel,input.imageIds),/canal logístico/);
});
test('prévia comercial não pode ser reutilizada com preço, categoria ou imagens diferentes',()=>{
 const fields=commercialKitFields(input,kit,channel,input.imageIds);
 const payload=commercialKitPayload(fields,kit,[]);
 const token=commercialSignPreview(kit.kitSku,payload,'test-secret');
 assert.equal(commercialVerifyPreview(token,kit.kitSku,payload,'test-secret'),true);
 assert.throws(()=>commercialVerifyPreview(token,kit.kitSku,{...payload,original_price:5},'test-secret'),/alterada/);
 assert.throws(()=>commercialVerifyPreview(token,'KIT-OUTRO',payload,'test-secret'),/alterada/);
 assert.throws(()=>commercialVerifyPreview(token+'tamper',kit.kitSku,payload,'test-secret'),/Assinatura/);
});
test('etapa 10 não manda rascunho novo ao find de otimizador nem ao Kit Formal',()=>{
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const store=readFileSync(new URL('../shopeeKitDraftStore.js',import.meta.url),'utf8');
 assert.match(ui,/if\(kitWizardIsNewUnpublished\(\)\)\{[\s\S]*?await kitWizardExecuteNewListingDirect\(\)/);
 assert.match(ui,/commercial\/readiness/);
 assert.match(ui,/commercial\/preview/);
 assert.match(ui,/commercial\/execute/);
 assert.match(server,/commercialReadiness/);
 assert.match(server,/commercialExecute/);
 assert.match(store,/claimKitPublication/);
 assert.match(store,/draft->publication->>status=eq.local_draft/);
});

test('rejeição explícita de validação permite corrigir e tentar novamente; timeout não permite duplicar',()=>{
 assert.equal(isDefinitiveShopeeRejection(Error('product.error_busi: marca obrigatória')),true);
 assert.equal(isDefinitiveShopeeRejection(Error('error_param: categoria inválida')),true);
 assert.equal(isDefinitiveShopeeRejection(Error('fetch failed')),false);
 assert.equal(isDefinitiveShopeeRejection(Error('Shopee HTTP 504')),false);
});

test('ordem canônica do identificador KIT não altera a SKU principal escolhida 894939',()=>{
 const reversed={...kit,components:[kit.components[1],kit.components[0]]};
 const fields=commercialKitFields(input,reversed,channel,input.imageIds);
 const payload=commercialKitPayload(fields,reversed,[]);
 assert.equal(payload.item_sku,'894939');
 assert.equal(payload.item_name,input.title);
 assert.equal(payload.image.image_id_list.length,9);
 assert.equal(JSON.stringify(payload).includes('894182'),false);
});

test('get_channel_list: id oficial logistics_channel_id disponibiliza canais habilitados',()=>{
 const official={response:{logistics_channel_list:[
  {logistics_channel_id:50021,logistics_channel_name:'SPX Express',enabled:true},
  {logistics_channel_id:50022,logistics_channel_name:'Desabilitado',enabled:false},
  {logistic_channel_id:50023,logistic_channel_name:'Legado',enabled:1}
 ]}};
 assert.deepEqual(enabledShopeeChannels(official),[
  {id:'50021',name:'SPX Express'},{id:'50023',name:'Legado'}]);
 assert.deepEqual(enabledShopeeChannels({response:{logistics_channel_list:[]}}),[]);
 assert.throws(()=>enabledShopeeChannels({response:{}}),/lista oficial/);
});
test('kit 894182 + 894939 conserva principal selecionada e canal salvo no assistente',()=>{
 const ui=readFileSync(new URL('../public/kit-builder.js',import.meta.url),'utf8');
 const svc=readFileSync(new URL('../shopeeKitCommercialService.js',import.meta.url),'utf8');
 assert.match(ui,/kit\?\.kitSku==='KIT-894182-894939'/);
 assert.match(ui,/prepared\?\.logistics\?\.mainSku/);
 assert.match(ui,/result\.logistics\?\.logisticId/);
 assert.match(svc,/kitSku==='KIT-894182-894939'&&fields\.mainSku!==mainSku/);
});
