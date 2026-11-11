import test from 'node:test';
import assert from 'node:assert/strict';
import {auditRootShopeeExecution} from '../shopeeExecutionHealth.js';

// Regression: the Seller Center can report 14/24 fields filled because the
// remaining category fields are optional. A previous reviewed optional draft
// must not keep a fully valid, already published listing in a retry loop.
const sku='894717',itemId='58272818146';
const mandatory={id:1,name:'Marca',mandatory:true,state:'filled',inputType:2};
const optional={id:2,name:'Aroma',mandatory:false,state:'missing',inputType:2};
const official=[mandatory,optional,...Array.from({length:22},(_,i)=>({
 id:i+3,name:'Opcional '+(i+3),mandatory:false,state:'missing',inputType:2
}))];
const filled=(id,value)=>({attribute_id:id,attribute_value_list:[
 {value_id:0,original_value_name:value}
]});
const reviewed=(id,value)=>({attributeId:id,values:[
 {valueId:0,valueName:value}
]});
const record={attributeAudit:{missingMandatory:0,attributes:official}};
const live={item_id:Number(itemId),item_name:'Kit Pet',description:'Kit Pet',
 attribute_list:[filled(1,'Buddy Pet')],image:{image_id_list:[]},tax_info:{}};
const review={stages:{technical:{reviewed:true}},
 attributes:[reviewed(1,'Buddy Pet'),reviewed(2,'Sem aroma')]};
const check=(overrides={})=>auditRootShopeeExecution({
 sku,itemId,record,live,review,...overrides
});
const stage=(audit)=>audit.stages.find(x=>x.id==='technical');

test('ficha 14/24: opcional antigo não confirmado não bloqueia o kit',()=>{
 const job={sku,item_id:itemId,state:'failed',last_error:'mesmo plano não confirmado',
  plan:{actions:['attribute_list'],proposed:{attribute_list:[filled(2,'Sem aroma')]}}};
 const audit=check({job});
 assert.equal(stage(audit).status,'confirmed');
 assert.match(stage(audit).reason,/obrigat[oó]rios conferidos na Shopee/i);
 assert.equal(stage(audit).optionalDifferences,1);
 assert.ok(!audit.pending.includes('technical'));
 assert.equal(audit.complete,false,'outras etapas continuam exigindo prova oficial');
});
test('árvore oficial com obrigatório realmente vazio mantém a etapa pendente',()=>{
 const badRecord={attributeAudit:{missingMandatory:1,
  attributes:[{...mandatory,state:'missing'},optional]}};
 const audit=check({record:badRecord,live:{...live,attribute_list:[]}});
 assert.equal(stage(audit).status,'pending');
 assert.ok(audit.pending.includes('technical'));
 assert.match(stage(audit).reason,/exige 1 atributo/);
});
test('alteração obrigatória autorizada e ainda não publicada não é dispensada',()=>{
 const job={sku,item_id:itemId,state:'failed',
  plan:{actions:['attribute_list'],proposed:{attribute_list:[filled(1,'Outra marca')]}}};
 const audit=check({job});
 assert.notEqual(stage(audit).status,'confirmed');
 assert.ok(audit.pending.includes('technical'));
 assert.match(stage(audit).reason,/obrigat[oó]ria aprovada|Falha na execu[cç][aã]o/i);
});
test('sem auditoria de categoria não infere que a ficha está completa',()=>{
 const audit=check({record:{attributeAudit:{missingMandatory:0,attributes:[]}}});
 assert.notEqual(stage(audit).status,'confirmed');
 assert.ok(audit.pending.includes('technical'));
});
test('edição manual já publicada pode ser reconciliada sem repetir escrita',()=>{
 const manualLive={...live,attribute_list:[filled(1,'Buddy Pet'),filled(2,'Atualizado no Seller Center')]};
 const audit=check({live:manualLive});
 assert.equal(stage(audit).status,'confirmed');
 assert.equal(stage(audit).optionalDifferences,1);
 assert.ok(!audit.pending.includes('technical'));
});
