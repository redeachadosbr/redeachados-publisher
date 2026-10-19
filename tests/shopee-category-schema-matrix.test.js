import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizerCategoryAttributes,normalizeAttributeAudit} from '../productOptimizer.js';
import {attributeAuditForChanges,compileAttributes,attributeInputRules} from '../shopeeStructuredFields.js';
import {searchAttributeRequest,readSearchedAttributeOptions,assertSearchableAttribute,hydrateSearchOptions} from '../shopeeCategorySearch.js';

const leaf={attribute_id:402,mandatory:true,name:'Certificação condicional',
 attribute_info:{input_type:3,input_validation_type:2},attribute_value_list:[]};
const parent={attribute_id:401,mandatory:true,name:'Tipo do produto',
 attribute_info:{input_type:1},
 attribute_value_list:[{value_id:1001,name:'Tipo A',child_attribute_list:[leaf]},
 {value_id:1002,name:'Tipo B',child_attribute_list:[]}]};
const custom={attribute_id:403,mandatory:false,name:'Potência real',
 attribute_info:{input_type:3,input_validation_type:3,format_type:2,attribute_unit_list:['W','kW']},attribute_value_list:[]};
const searchable={attribute_id:404,mandatory:false,name:'Marca',
 attribute_info:{input_type:2,support_search_value:true},attribute_value_list:[]};
const tree={response:{list:[{category_id:123,attribute_tree:[parent,custom,searchable]},
 {category_id:999,attribute_tree:[{attribute_id:111,mandatory:true,name:'Campo exclusivo de outra categoria',attribute_info:{input_type:3}}]}]}};
const base={item_id:100,category_id:123,item_name:'Teste categoria',attribute_list:[]};
const raw=()=>normalizeAttributeAudit(base,tree);
test('cada categoria recebe apenas sua própria árvore oficial, sem campos de outra categoria',()=>{
 const rows=optimizerCategoryAttributes(base,tree);
 assert.deepEqual(rows.map(x=>x.attribute_id).sort(),[401,402,403,404]);
 assert.ok(!rows.some(x=>x.attribute_id===111));
 assert.equal(raw().attributes.find(x=>x.id===402).conditional,true);
 assert.equal(raw().missingMandatory,1);
});
test('filhos obrigatórios aparecem somente após selecionar a opção do pai',()=>{
 const record={sku:'ITEM-123',categoryId:123,attributeAudit:raw()};
 const audit=attributeAuditForChanges([{attributeId:401,values:[{valueId:1001,valueName:'Tipo A'}]}],record,base);
 assert.equal(audit.attributes.find(x=>x.id===402).conditional,false);
 assert.equal(audit.missingMandatory,1);
 assert.throws(()=>compileAttributes([
  {attributeId:401,values:[{valueId:1001}],evidence:'fabricante'}
 ],record,base),/atributo obrigatório/);
 const attrs=compileAttributes([
  {attributeId:401,values:[{valueId:1001}],evidence:'fabricante'},
  {attributeId:402,values:[{valueId:0,valueName:'CERT123'}],evidence:'certificado'}
 ],record,base);
 assert.deepEqual(attrs.map(x=>x.attribute_id).sort(),[401,402]);
 assert.throws(()=>compileAttributes([
  {attributeId:402,values:[{valueId:0,valueName:'CERT123'}],evidence:'certificado'}
 ],record,base),/não disponível/);
});
test('unidades e tipos seguem a ficha oficial da categoria',()=>{
 const record={sku:'SKU',categoryId:123,attributeAudit:raw()};
 assert.deepEqual(attributeInputRules(record.attributeAudit.attributes.find(x=>x.id===403)).units,['W','kW']);
 assert.throws(()=>compileAttributes([{attributeId:403,values:[{valueId:0,valueName:'1500',unit:'kg'}],evidence:'fabricante'}],record,base),/unidade oficial|Unidade não permitida/);
});
test('mais de sessenta campos de categoria podem ser revisados, sem um teto fixo de 60',()=>{
 const nodes=Array.from({length:65},(_,i)=>({attribute_id:10000+i,mandatory:true,name:'Campo '+i,
  attribute_info:{input_type:3},attribute_value_list:[]}));
 const src={response:{list:[{category_id:123,attribute_tree:nodes}]}};
 const audit=normalizeAttributeAudit(base,src);
 const record={sku:'SKU-LONGO',categoryId:123,attributeAudit:audit};
 const changes=nodes.map((node,i)=>({attributeId:node.attribute_id,values:[{valueId:0,valueName:'Valor '+i}],evidence:'manual verificado'}));
 const applied=compileAttributes(changes,record,base);
 assert.equal(applied.length,65);
});
test('busca paginada da Shopee aceita somente atributos habilitados pela própria categoria',async()=>{
 const record={categoryId:123,attributeAudit:raw()};
 assert.equal(assertSearchableAttribute(record,404).id,404);
 assert.throws(()=>assertSearchableAttribute(record,403),/não oferece pesquisa oficial/);
 assert.throws(()=>searchAttributeRequest({attributeId:404,limit:101}),/1 a 100/);
 assert.deepEqual(searchAttributeRequest({attributeId:404,valueName:'Marca A',cursor:50,limit:50}),{
  attribute_id:404,value_name:'Marca A',cursor:50,limit:50
 });
 assert.deepEqual(readSearchedAttributeOptions({response:{
  attribute_value_list:[{value_id:707,name:'Marca A'}],has_next:true}},0,50),{
  options:[{id:707,name:'Marca A',unit:''}],hasNext:true,nextCursor:50
 });
 await hydrateSearchOptions(record,[{attributeId:404,values:[{valueId:707,valueName:'Marca A'}]}],async req=>{
  assert.equal(req.attribute_id,404);return {response:{attribute_value_list:[{value_id:707,name:'Marca A'}],has_next:false}};
 });
 assert.equal(record.attributeAudit.attributes.find(x=>x.id===404).options[0].id,707);
 const record2={categoryId:123,attributeAudit:raw()};
 await assert.rejects(()=>hydrateSearchOptions(record2,[{attributeId:404,values:[{valueId:707,valueName:'Marca A'}]}],
 async()=>({response:{attribute_value_list:[{value_id:708,name:'Marca X'}]}})),/não foi confirmada/);
});

test('atributo removido da categoria não pode ser reaproveitado para preencher outra ficha',()=>{
 const oldItem={...base,attribute_list:[{attribute_id:878787,attribute_value_list:[{value_id:0,original_value_name:'Legado'}]}]};
 const a=normalizeAttributeAudit(oldItem,tree);
 const legacy=a.attributes.find(x=>x.id===878787);
 assert.equal(legacy.legacy,true);
 assert.match(legacy.issues[0],/categoria atual/);
});
