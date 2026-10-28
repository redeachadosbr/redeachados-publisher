import test from 'node:test';
import assert from 'node:assert/strict';
import {validateKitOptimizationTarget,kitOptimizationLinkIsCurrent} from '../shopeeKitOptimization.js';
const kit={kitSku:'KIT-AAA-BBB',components:[{sku:'AAA'},{sku:'BBB'}],
 componentCost:40,kitCost:44,quote:{grossPrice:130,marketplacePrice:110}};
const saved={kitSku:kit.kitSku,kit,skus:['AAA','BBB'],
 creative:{title:'Kit Infantil Musical Elefante e Torre Chocalho para Bebês com Brinquedos Lúdicos Educativos e Interativos 🐘🎵',
 description:'Kit de brinquedos contendo elefante musical e torre chocalho. Produtos reais para brincadeiras infantis.'}};
const record={itemId:'123456',selectedModelId:'0',sku:'KIT-AAA-BBB',status:'NORMAL'};
const source={saved,kit,record,targetSku:record.sku,itemId:'123456',
 modelId:'0',mainSku:'AAA',confirmedItemId:'123456'};
test('vincula anúncio existente ao custo de dois componentes e SKU principal',()=>{
 const link=validateKitOptimizationTarget(source);
 assert.equal(link.kitCost,44);
 assert.deepEqual(link.componentSkus,['AAA','BBB']);
 assert.equal(link.mainSku,'AAA');
 assert.equal(kitOptimizationLinkIsCurrent({...saved,optimization:link},link),true);
});
test('rejeita trocar o anúncio do kit por anúncio individual ou não confirmado',()=>{
 assert.throws(()=>validateKitOptimizationTarget({...source,targetSku:'AAA',record:{...record,sku:'AAA'}}),/diferente/);
 assert.throws(()=>validateKitOptimizationTarget({...source,confirmedItemId:'2'}),/Confirme/);
 assert.throws(()=>validateKitOptimizationTarget({...source,record:{...record,itemId:'3'}}),/diverge/);
});
test('invalida vínculo se título ou custo do kit mudar',()=>{
 const link=validateKitOptimizationTarget(source);
 assert.equal(kitOptimizationLinkIsCurrent({...saved,optimization:link,creative:{...saved.creative,title:'Novo'}},link),false);
 assert.equal(kitOptimizationLinkIsCurrent({...saved,optimization:link,kit:{...kit,kitCost:45}},link),false);
});
