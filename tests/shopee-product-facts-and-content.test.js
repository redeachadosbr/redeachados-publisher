import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAutomaticWeDropImport} from '../wedropCsv.js';
import {importSupplierAutomatically} from '../wedropAutoSync.js';
import {readWeDropProduct} from '../wedropCosts.js';
import {supplierWorkflowFacts} from '../shopeeSupplierFacts.js';
import {normalizeAttributeAudit} from '../productOptimizer.js';
import {compileAttributes,compileTax} from '../shopeeStructuredFields.js';
import {validateReview,validateContentRules,safeTitle} from '../shopeeOptimizationWorkflow.js';
import {compileShopeeExecutionPlan} from '../shopeeExecutionPlan.js';
const header='SKU,Nome do Produto,Marca,Categoria,Fornecedor,Estado do Fornecedor,Preço,EAN,NCM,CEST,Peso (kg),Largura (cm),Altura (cm),Comprimento (cm),Peso da Caixa (kg),Imagem Principal';
const row='000A,Piscina Azul,Top Rio,Piscinas,Fornecedor,SC,99.99,0790872291525,01012100,,2600,33,13,36,0,https://example.com/pool.jpg';
const csv=header+'\n'+row;
const title='Piscina Inflável Infantil Quadrada 210 Litros Azul Top Rio 💦 Para Crianças no Quintal ou Jardim, Lazer e Sol no Verão ☀️';
test('official catalog preserves SKU, NCM and EAN leading zeros and raw conflicting measurement units',()=>{
 const p=prepareAutomaticWeDropImport(csv).products[0];
 assert.equal(p.sku,'000A');assert.equal(p.data.ncm,'01012100');assert.equal(p.data.ean,'0790872291525');
 assert.equal(p.data.catalogMeasurements.weightKg,'2600');assert.equal(p.sourceLine,2);
 assert.equal(p.data.cest,null);assert.ok(p.data.warnings.length);
 assert.deepEqual(prepareAutomaticWeDropImport('SKU,Custo,NCM\nA,9.90,12345678').products,[]);
});
test('ambiguous duplicate product metadata is quarantined without losing unrelated costs and SKUs',()=>{
 const p=prepareAutomaticWeDropImport(csv+'\n'+row.replace('0790872291525','0790872291526')+'\n'+row.replace('000A','000B'));
 assert.equal(p.costs.length,2);assert.equal(p.products[0].data.conflict,true);assert.equal(p.products[0].data.ncm,undefined);
 assert.equal(p.products[1].data.ncm,'01012100');
});
test('same-price import still saves fiscal/product metadata without any cost or marketplace write',async()=>{
 const before=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY,calls=[];
 process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);calls.push({u,options});assert.equal(u.hostname,'fixture.supabase.co');
  let rows=[];
  if(u.pathname.endsWith('/shopee_catalog_items'))rows=[{sku:'000A',item_id:1,has_model:false}];
  if(u.pathname.endsWith('/shopee_wedrop_costs'))rows=[{supplier_sku:'000A',unit_cost:99.99}];
  return new Response(JSON.stringify(rows));
 };
 try{
  const result=await importSupplierAutomatically(9,csv,{sourceName:'catalogo.csv'});
  assert.equal(result.changedCosts,0);assert.equal(result.productFactsSaved,1);
  const writes=calls.filter(x=>x.options.method==='POST');
  assert.deepEqual(writes.map(x=>x.u.pathname),['/rest/v1/shopee_wedrop_products','/rest/v1/shopee_wedrop_sync_state']);
  const saved=JSON.parse(writes[0].options.body)[0];assert.equal(saved.shop_id,9);assert.equal(saved.product_data.ncm,'01012100');
 }finally{globalThis.fetch=before;for(const [key,val] of [['SUPABASE_URL',oldUrl],['SUPABASE_SECRET_KEY',oldKey]])val===undefined?delete process.env[key]:process.env[key]=val;}
});
test('product lookup never reuses a SKU link after the marketplace SKU changes',async()=>{
 const before=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY,calls=[];
 process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';
 globalThis.fetch=async(url)=>{const u=new URL(url);calls.push(u);assert.equal(u.searchParams.get('shop_id'),'eq.9');
  return new Response(JSON.stringify(u.pathname.endsWith('sku_links')?[{item_id:1,model_id:0,shopee_sku:'OLD',supplier_sku:'000A'}]:[]));};
 try{assert.equal(await readWeDropProduct(9,{sku:'NEW',itemId:1}),null);assert.equal(calls.length,2);}
 finally{globalThis.fetch=before;for(const [key,val] of [['SUPABASE_URL',oldUrl],['SUPABASE_SECRET_KEY',oldKey]])val===undefined?delete process.env[key]:process.env[key]=val;}
});
test('fiscal suggestions use this exact supplier row and saved store settings, never universal defaults',()=>{
 const product=prepareAutomaticWeDropImport(csv).products[0],supplier={product_data:product.data,supplier_sku:product.sku,source_file:'catalogo.csv',source_line:2};
 const record={condition:'NEW',description:'43cm Altura x 135cm Largura x 88cm Comprimento',attributeAudit:{attributes:[{id:100942,inputType:3,values:[]}]}};
 const facts=supplierWorkflowFacts(supplier,record,{fiscal_notes:'Origem: 2- estrangeira\nCFOP Mesmo Estado: 5106\nCFOP Outros Estados: 6106\nCSOSN: 102\nPISCOFIS: 99\ntipo de serviço: Revendedor'});
 assert.equal(facts.taxSuggestion.ncm,'01012100');assert.equal(facts.taxSuggestion.operation_type,'1');assert.equal(facts.taxSuggestion.pis_cofins_cst,undefined);
 assert.equal(facts.attributeSuggestions[0].values[0].valueName,'88 x 135 x 43 cm');
 assert.equal(facts.taxSuggestion.measure_unit,undefined);assert.deepEqual(supplierWorkflowFacts(null,{}).taxSuggestion,{});
 assert.equal(compileTax({...facts.taxSuggestion,measure_unit:'UN'},{}).ncm,'01012100');
});
test('category fields support text, quantities with units and multiple official/custom selections',()=>{
 const record={attributeAudit:{attributes:[{id:1,name:'Dimensões',inputType:3,validationType:2},{id:2,name:'Volume',inputType:3,validationType:3,formatType:2,allowedUnits:['L','ML']},
  {id:3,name:'Material',inputType:5,maxValues:2,options:[{id:10,name:'Plastic'}]}]}};
 const changes=[{attributeId:1,values:[{valueId:0,valueName:'88 x 135 x 43 cm'}],evidence:'Descrição atual'},
  {attributeId:2,values:[{valueId:0,valueName:'210',unit:'L'}],evidence:'Fornecedor'},
  {attributeId:3,values:[{valueId:10},{valueId:0,valueName:'Outro material confirmado'}],evidence:'Ficha fabricante'}];
 const out=compileAttributes(changes,record,{attribute_list:[{attribute_id:99,attribute_value_list:[{value_id:123}]}]});
 assert.equal(out[0].attribute_id,99);assert.equal(out[2].attribute_value_list[0].value_unit,'L');assert.equal(out[3].attribute_value_list.length,2);
 assert.throws(()=>compileAttributes([{...changes[1],values:[{valueId:0,valueName:'210',unit:'KG'}]}],record,{}),/unidade/);
 assert.throws(()=>compileAttributes([{...changes[2],values:[{valueId:10},{valueId:10},{valueId:10}]}],record,{}),/Quantidade/);
 assert.throws(()=>compileAttributes([{...changes[2],values:[{valueId:999}]}],record,{}),/oficial/);
});
test('dependent category fields are validated against proposed parent choices before publishing',()=>{
 const response={response:{list:[{category_id:7,attribute_tree:[{attribute_id:1,name:'Tipo',attribute_info:{input_type:1},attribute_value_list:[{value_id:10,name:'Com medida',
  child_attribute_list:[{attribute_id:2,name:'Medida',mandatory:true,attribute_info:{input_type:3,input_validation_type:1},attribute_value_list:[]}]}]}]}]}};
 const live={category_id:7,attribute_list:[]},record={attributeAudit:normalizeAttributeAudit(live,response)};
 const parent={attributeId:1,valueId:10,evidence:'Ficha fabricante'},child={attributeId:2,values:[{valueId:0,valueName:'43'}],evidence:'Ficha fabricante'};
 assert.throws(()=>compileAttributes([child],record,live),/não disponível/);
 assert.throws(()=>compileAttributes([parent],record,live),/obrigatório/);
 assert.equal(compileAttributes([parent,child],record,live)[1].attribute_value_list[0].original_value_name,'43');
 assert.throws(()=>compileAttributes([parent,{...child,values:[{valueId:0,valueName:'abc'}]}],record,live),/inteiro/);
});
test('all returned official options stay available after position 120',()=>{
 const response={response:{attribute_list:[{attribute_id:1,name:'Tipo',attribute_info:{input_type:1},attribute_value_list:Array.from({length:130},(_,i)=>({value_id:i+1,name:'Opção '+i}))}]}};
 const record={attributeAudit:normalizeAttributeAudit({category_id:7},response)};
 assert.equal(record.attributeAudit.attributes[0].options.length,130);
 assert.equal(compileAttributes([{attributeId:1,valueId:130,evidence:'Fabricante'}],record,{category_id:7})[0].attribute_value_list[0].value_id,130);
});
test('title validation and execution both count Unicode codepoints without truncating emojis',()=>{
 assert.equal([...title].length,120);assert.ok(title.length>120);assert.equal(safeTitle(title),title);
 assert.equal(validateReview({stage:'seo',reviewed:true,title}).title,title);
 assert.equal(validateReview({stage:'seo',reviewed:true,title:'Bola Infantil N2 ⚽'}).title,'Bola Infantil N2 ⚽');
 assert.throws(()=>validateReview({stage:'seo',reviewed:true,title:title+'!'}),/120/);
 assert.throws(()=>validateReview({stage:'seo',reviewed:true,title:'Piscina Inflável 210 Litros Azul 💦 Top Rio para Diversão no Verão ☀️ em Plásticos Compacta para Guardar 135 x 88 x 43 cm'}),/medidas lineares/);
 const plan=compileShopeeExecutionPlan({shopId:1,itemId:2,modelId:0,sku:'SKU',record:{itemId:2,sku:'SKU',status:'NORMAL'},
  review:{draftTitle:title,stages:{seo:{reviewed:true}}},live:{item_name:'Antigo',description:'Texto',item_sku:'SKU'}});
 assert.equal(plan.canExecute,true);assert.equal(plan.proposed.item_name,title);
});
test('description review requires store length, ordered sections, five FAQ and ten reasons',()=>{
 assert.throws(()=>validateContentRules({description:'Descrição antiga'}),/1400/);
 assert.throws(()=>validateContentRules({description:'x'.repeat(1410)}),/cinco seções/);
 const structure='Descrição do produto\nEspecificações do produto\nTabela de medidas\n5 dúvidas frequentes\n'+
  Array.from({length:5},(_,i)=>(i+1)+'. Pergunta? Resposta.').join('\n')+'\n10 motivos para comprar agora\n'+
  Array.from({length:10},(_,i)=>(i+1)+'. Motivo confirmado.').join('\n');
 const description='🏖️ '+('Texto confirmado. '.repeat(80)).slice(0,1400-structure.length-4)+'\n'+structure;
 assert.equal([...description].length,1400);validateContentRules({description});
 assert.throws(()=>validateContentRules({description:description.replace('5. Pergunta? Resposta.','-. Pergunta? Resposta.')}),/5 perguntas/);
});
