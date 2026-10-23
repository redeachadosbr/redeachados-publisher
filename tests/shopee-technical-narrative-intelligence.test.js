import test from 'node:test';
import assert from 'node:assert/strict';
import {narrativeTechnicalSuggestions,mergeNarrativeTechnicalFacts} from '../shopeeTechnicalNarrative.js';
import {mergeWorkflowTechnicalAutofill} from '../shopeeOptimizationWorkflowStore.js';

const motoText=String.raw`Surpreenda os pequenos com a Moto Elétrica Infantil Vintage - Vermelha, ideal para crianças a partir de 3 anos.
A moto permite passeios e brincadeiras. Equipada com bateria recarregável de 6V.
Itens Inclusos:
-01 Moto Elétrica Infantil 6V Vintage
-01 Carregador
-01 Manual de Instruções
Especificações:
Dimensões: 37 cm altura x 45cm largura x 76cm comprimento
Idade recomendada: A partir de 3 anos
Bateria recarregável: 6V
Contém:
01 Moto Elétrica Infantil 6V Vintage - Vermelha`;
const attr=(id,name,inputType=3,options=[])=>({id,name,inputType,options});
const basic=[
 attr(100057,'Power Source',1,[{id:777,name:'Battery'},{id:778,name:'AC Power'}]),
 attr(100999,'Quantidade'),attr(100998,'Quantity per pack'),attr(101029,'Indication'),
 attr(101240,'Recommended Age',1,[{id:33,name:'3 - 4 years'},{id:34,name:'3 Years and Above'}]),
 attr(101306,'Region of Origin',1,[{id:99,name:'Brazil'}]),
 attr(100135,'Has BSMI No.',1,[{id:50,name:'No'}]),
 attr(101040,'Built-in Battery',1,[{id:60,name:'Yes'}])
];
const collect=(attributes=basic,sourceText=motoText)=>narrativeTechnicalSuggestions({
 attributes,supplier:{product_data:{name:'Moto Elétrica Infantil 6V Vintage - Vermelha'}},sourceText
});
const at=(results,id)=>results.suggestions.find(x=>Number(x.attributeId)===id)?.values?.[0];
test('technical reader fills battery/quantity/age/indication from paragraphs and item lists',()=>{
 const actual=collect();
 assert.deepEqual(at(actual,100057),{valueId:777,valueName:'Battery'});
 assert.deepEqual(at(actual,100999),{valueId:0,valueName:'1'});
 assert.deepEqual(at(actual,100998),{valueId:0,valueName:'1'});
 assert.match(at(actual,101029).valueName,/criancas a partir de 3 anos/i);
 assert.deepEqual(at(actual,101240),{valueId:34,valueName:'3 Years and Above'});
 assert.deepEqual(at(actual,101040),{valueId:60,valueName:'Yes'});
});
test('country of manufacture and certification are not inferred from CNPJ or seller state',()=>{
 const actual=collect(basic,motoText+'\nFornecedor: São Paulo - Brasil\nNCM: 95030010');
 assert.equal(at(actual,101306),undefined);
 assert.equal(at(actual,100135),undefined);
});
test('3 years and above must not be equated with the 3-4 years age band',()=>{
 const actual=collect([attr(55,'Recommended Age',1,[{id:2,name:'3 - 4 years'}])]);
 assert.equal(at(actual,55),undefined);
 assert.ok(actual.unresolved.some(x=>x.attributeId===55));
});
test('pack quantity is never the sum of charger, manual and main toy',()=>{
 const actual=collect([attr(55,'Quantity per pack')]);
 assert.deepEqual(at(actual,55),{valueId:0,valueName:'1'});
});
test('narrative merge preserves already confirmed candidate and never duplicates attributes',()=>{
 const b={suggestions:[{attributeId:100999,values:[{valueId:0,valueName:'1'}]}],unresolved:[]};
 const combined=mergeNarrativeTechnicalFacts(b,collect());
 assert.equal(combined.suggestions.filter(x=>x.attributeId===100999).length,1);
});
test('merging technical draft fills blank notes but respects user-confirmed edits and disabled fields',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 let saved=null;
 const fields=[
  {attributeId:100057,enabled:true,evidence:'BATERIA',values:[{valueId:-1,valueName:''}]},
  {attributeId:100999,enabled:true,evidence:'Manual',values:[{valueId:0,valueName:'2'}]},
  {attributeId:101029,enabled:false,userDisabled:true,evidence:'',values:[{valueId:-1,valueName:''}]}
 ];
 try{
  process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='test-key';
  globalThis.fetch=async(_url,options={})=>{
   if(options.method==='POST'){saved=JSON.parse(options.body)[0].review_state;return Response.json({});}
   return Response.json([{sku:'3747',review_state:{technicalDraft:{fields}}}]);
  };
  const result=await mergeWorkflowTechnicalAutofill(852701218,58221125342,0,'3747',
   [attr(100057,'Power Source',1),attr(100999,'Quantity'),attr(101029,'Indication')],
   [{attributeId:100057,evidence:'Descrição SKU: bateria recarregável',values:[{valueId:777,valueName:'Battery'}]},
    {attributeId:100999,evidence:'Descrição SKU',values:[{valueId:0,valueName:'1'}]},
    {attributeId:101029,evidence:'Descrição SKU',values:[{valueId:0,valueName:'Passeio infantil'}]}]);
  assert.ok(saved);
  const byId=new Map(result.fields.map(x=>[x.attributeId,x]));
  assert.equal(byId.get(100057).values[0].valueName,'Battery');
  assert.match(byId.get(100057).evidence,/BATERIA/);
  assert.equal(byId.get(100999).values[0].valueName,'2');
  assert.equal(byId.get(101029).enabled,false);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
 }
});
