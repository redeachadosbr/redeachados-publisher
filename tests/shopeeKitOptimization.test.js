import test from 'node:test';
import assert from 'node:assert/strict';
import {validateKitOptimizationTarget,kitOptimizationLinkIsCurrent,linkedKitPricingCost,assertKitListingComposition} from '../shopeeKitOptimization.js';
const kit={kitSku:'KIT-AAA-BBB',components:[{sku:'AAA'},{sku:'BBB'}],
 componentCost:40,kitCost:44,quote:{grossPrice:130,marketplacePrice:110}};
const saved={kitSku:kit.kitSku,kit,skus:['AAA','BBB'],
 creative:{title:'Kit Infantil Musical Elefante e Torre Chocalho para Bebês com Brinquedos Lúdicos Educativos e Interativos 🐘🎵',
 description:'Kit de brinquedos contendo elefante musical e torre chocalho. Produtos reais para brincadeiras infantis.'}};
const record={itemId:'123456',selectedModelId:'0',sku:'AAA',status:'NORMAL'};
const source={saved,kit,record,targetSku:'AAA',itemId:'123456',modelId:'0',mainSku:'AAA',confirmedItemId:'123456'};

test('SKU Shopee única é a principal; SKUs adicionais ficam no kit WeDrop',()=>{
 const link=validateKitOptimizationTarget(source);
 assert.equal(link.sku,'AAA');
 assert.equal(link.mainSku,'AAA');
 assert.equal(link.kitSku,'KIT-AAA-BBB');
 assert.deepEqual(link.componentSkus,['AAA','BBB']);
 assert.equal(link.kitCost,44);
 assert.equal(kitOptimizationLinkIsCurrent({...saved,optimization:link},link),true);
});

test('rejeita código KIT-* e outra SKU de componente como anúncio da Shopee',()=>{
 assert.throws(()=>validateKitOptimizationTarget({...source,targetSku:kit.kitSku,
  record:{...record,sku:kit.kitSku}}),/SOMENTE a SKU principal/);
 assert.throws(()=>validateKitOptimizationTarget({...source,targetSku:'BBB',
  record:{...record,sku:'BBB'}}),/SOMENTE a SKU principal/);
 assert.throws(()=>validateKitOptimizationTarget({...source,confirmedItemId:'2'}),/Confirme/);
 assert.throws(()=>validateKitOptimizationTarget({...source,record:{...record,itemId:'3'}}),/diverge/);
});

test('vínculo antigo com SKU separada exige nova preparação',()=>{
 const link=validateKitOptimizationTarget(source);
 const legacy={...link,sku:kit.kitSku};
 assert.equal(kitOptimizationLinkIsCurrent({...saved,optimization:legacy},legacy),false);
 assert.equal(kitOptimizationLinkIsCurrent({...saved,optimization:link,
  creative:{...saved.creative,title:'Novo'}},link),false);
 assert.equal(kitOptimizationLinkIsCurrent({...saved,optimization:link,
  kit:{...kit,kitCost:45}},link),false);
});

test('o custo do anúncio principal continua somando os componentes WeDrop',()=>{
 const link=validateKitOptimizationTarget(source);
 const live={kitSku:kit.kitSku,components:[{sku:'AAA'},{sku:'BBB'}],
  componentCost:40,kitCost:44,shipping:2,packing:2};
 const q=linkedKitPricingCost({saved:{...saved,optimization:link},link,live,
  sku:'AAA',itemId:'123456',modelId:'0'});
 assert.equal(q.unitCost,40);
 assert.equal(q.supplierSku,'AAA');
 assert.equal(q.kitCost,44);
 assert.deepEqual(q.componentSkus,['AAA','BBB']);
 assert.throws(()=>linkedKitPricingCost({saved:{...saved,optimization:link},link,
  live:{...live,componentCost:25},sku:'AAA',itemId:'123456',modelId:'0'}),/Custo ou composição/);
});

test('dois Item IDs de SKU 103006 não provam kit de três componentes',()=>{
 const coffee={kitSku:'KIT-103006-CO6968126-TRC7085',components:[
  {sku:'103006',name:'Cafeteira Italiana Inox 3 Xícaras'},
  {sku:'CO6968126',name:'Conjunto Com Canecas 6 Peça de Vidro Expresso 70ml'},
  {sku:'TRC7085',name:'Açucareiro de aço inox com colher - 220ml'}]};
 assert.throws(()=>assertKitListingComposition({kit:coffee,record:{
  itemId:'58212183726',title:'Cafeteira Italiana Inox 3 Xícaras Kit 2 Copos Borossilicato 90ml',
  description:'Duas xícaras borossilicato de 90 ml'}}),/BLOQUEIO DE SEGURANÇA.*CO6968126.*TRC7085/);
 assert.throws(()=>assertKitListingComposition({kit:coffee,record:{
  itemId:'58271858695',title:'Cafeteira Italiana Inox 3 Xícaras',
  description:'Cafeteira italiana para café'}}),/BLOQUEIO DE SEGURANÇA/);
 const proven=assertKitListingComposition({kit:coffee,record:{
  itemId:'12345678',title:'Kit Cafeteira Italiana Inox 3 Xícaras Canecas Vidro Expresso 70ml Açucareiro Inox 220ml',
  description:'Conjunto com 6 canecas de vidro 70 ml, cafeteira e açucareiro com colher 220 ml'}});
 assert.equal(proven.itemId,'12345678');
});
test('o servidor bloqueia vínculos antigos e o cliente não seleciona Item ID sozinho',async()=>{
 const {readFileSync}=await import('node:fs');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const client=readFileSync(new URL('../public/kit-existing-optimization.js',import.meta.url),'utf8');
 const discount=readFileSync(new URL('../shopeeKitDiscountService.js',import.meta.url),'utf8');
 assert.match(server,/assertKitListingComposition\(\{kit,record\}\)/);
 assert.match(server,/assertKitListingComposition\(\{kit:kit\.kit,record\}\)/);
 assert.match(discount,/assertKitListingComposition\(\{kit:saved\.kit/);
 assert.match(client,/autoVerified:false/);
 assert.doesNotMatch(client,/if\(automatic&&matches\.length===1\)\{choose/);
});
