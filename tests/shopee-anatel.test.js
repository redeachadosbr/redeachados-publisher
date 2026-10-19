import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAttributeAudit} from '../productOptimizer.js';
import {attributeAuditForChanges,compileAttributes} from '../shopeeStructuredFields.js';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';
import {inspectAnatelCompliance} from '../shopeeAnatel.js';

const license={attribute_id:91202,mandatory:false,name:'Número de licença Anatel',
 attribute_info:{input_type:3},attribute_value_list:[]};
const connectivity={attribute_id:91201,mandatory:true,
 name:'Contém Bluetooth, Wi-Fi ou tecnologia de radiofrequência (RF)?',
 attribute_info:{input_type:1},
 attribute_value_list:[
  {value_id:610,name:'SIM',child_attribute_list:[license]},
  {value_id:611,name:'NÃO',child_attribute_list:[]}
 ]};
const source={response:{list:[{category_id:941234,attribute_tree:[connectivity]}]}};
const live={item_id:19801,category_id:941234,item_name:'Equipamento de teste',
 description:'Descrição antiga',attribute_list:[],item_status:'NORMAL',description_type:'normal'};
const record=(item=live,tree=source)=>({sku:'SKU-941',itemId:'19801',selectedModelId:'0',
 categoryId:item.category_id,status:'NORMAL',imageCount:9,videoStatus:'não confirmado',
 attributeAudit:normalizeAttributeAudit(item,tree)});
const parent=valueId=>({attributeId:91201,evidence:'Ficha oficial do fabricante',
 values:[{valueId}]});
const child=valueName=>({attributeId:91202,evidence:'Certificado de homologação do modelo',
 values:[{valueId:0,valueName}]});

test('a categoria que possui o novo atributo pede resposta, sem supor conectividade',()=>{
 const audit=record().attributeAudit;
 assert.equal(inspectAnatelCompliance(audit).status,'pendente-resposta');
 assert.equal(audit.anatel.requiresAction,true);
 assert.equal(inspectAnatelCompliance(audit).registrationAttributeId,91202);
 assert.equal(audit.attributes.find(x=>x.id===91202).conditional,true);
});
test('resposta NÃO oficial dispensa o registro e não inventa número',()=>{
 const r=record(),changes=[parent(611)];
 const draft=attributeAuditForChanges(changes,r,live);
 const checked=inspectAnatelCompliance(draft);
 assert.equal(checked.status,'declarado-nao');
 assert.equal(checked.requiresAction,false);
 assert.deepEqual(compileAttributes(changes,r,live).map(a=>a.attribute_id),[91201]);
});
test('resposta SIM ativa campo filho e exige número, mesmo se o filho vier como optional',()=>{
 const r=record(),changes=[parent(610)];
 const draft=attributeAuditForChanges(changes,r,live);
 assert.equal(draft.attributes.find(x=>x.id===91202).conditional,false);
 assert.equal(inspectAnatelCompliance(draft).status,'pendente-registro');
 assert.throws(()=>compileAttributes(changes,r,live),/Anatel|registro|homologa/i);
});
test('SIM com código plausível e fonte permite compilar; não homologa automaticamente',()=>{
 const r=record(),changes=[parent(610),child('01234-56-78901')];
 const attributes=compileAttributes(changes,r,live);
 assert.deepEqual(attributes.map(x=>x.attribute_id),[91201,91202]);
 const verified=inspectAnatelCompliance(attributeAuditForChanges(changes,r,live));
 assert.equal(verified.status,'registro-informado');
 assert.match(verified.message,/Confira o certificado/);
 assert.throws(()=>compileAttributes([parent(610),child('NÃO SE APLICA')],r,live),/Anatel|registro/i);
 assert.throws(()=>compileAttributes([parent(610),child('00000000')],r,live),/Anatel|registro/i);
 assert.throws(()=>compileAttributes([parent(610),{...child('01234-56-78901'),evidence:''}],r,live),/fonte/i);
});
test('mudança de SIM para NÃO retira atributo filho dependente de um item existente',()=>{
 const original={...live,attribute_list:[
  {attribute_id:91201,attribute_value_list:[{value_id:610,original_value_name:'SIM'}]},
  {attribute_id:91202,attribute_value_list:[{value_id:0,original_value_name:'01234-56-78901'}]}
 ]};
 const r=record(original),changes=[parent(611)];
 const attrs=compileAttributes(changes,r,original);
 assert.deepEqual(attrs.map(x=>x.attribute_id),[91201]);
});
test('planos de publicação param se a categoria exigir Anatel e não foi respondida',()=>{
 const r=record();
 const plan=compileShopeeExecutionPlan({shopId:123,itemId:'19801',modelId:'0',sku:r.sku,
  record:r,review:{stages:{},draftTitle:'',draftDescription:''},live});
 assert.equal(plan.canExecute,false);
 assert.match(plan.blocked.join(' '),/Anatel/i);
});
test('categorias sem o atributo não recebem exigência Anatel artificial',()=>{
 const home={...live,category_id:34155};
 const schema={response:{list:[{category_id:34155,attribute_tree:[
  {attribute_id:710,name:'Material',mandatory:false,attribute_info:{input_type:3},attribute_value_list:[]}
 ]}]}};
 const r=record(home,schema);
 assert.equal(inspectAnatelCompliance(r.attributeAudit).applicable,false);
 assert.deepEqual(compileAttributes([{attributeId:710,evidence:'fabricante',
  values:[{valueId:0,valueName:'Plástico'}]}],r,home).map(x=>x.attribute_id),[710]);
});
