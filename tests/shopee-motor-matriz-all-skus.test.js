import test from 'node:test';
import assert from 'node:assert/strict';
import {narrativeTechnicalSuggestions,technicalOptionSearchTerms,mergeNarrativeTechnicalFacts} from '../shopeeTechnicalNarrative.js';
const attr=(id,name,inputType=3,options=[],extra={})=>({id,name,inputType,options,...extra});
function run(title,source,attributes,supplier=true){
 return narrativeTechnicalSuggestions({productTitle:title,
  supplier:supplier?{product_data:{name:title}}:null,sourceText:source,attributes});
}
const value=(result,id)=>result.suggestions.find(x=>x.attributeId===id)?.values?.[0];
test('Motor Matriz auto fills the main-unit quantity for distinct product families',()=>{
 for(const [title,item] of [
  ['Moto Elétrica Infantil Vermelha','Moto Elétrica Infantil Vermelha'],
  ['Toalha Camping Piquenique','Toalha Camping Piquenique'],
  ['Porta Temperos Giratório','Porta Temperos Giratório'],
  ['Cafeteira Italiana Alumínio','Cafeteira Italiana Alumínio']]){
  const data=run(title,'Itens Inclusos:\n-01 '+item+
   '\n-01 Manual de instruções\nEspecificações:\nCor: Vermelha',
   [attr(1,'Quantidade')]);
  assert.deepEqual(value(data,1),{valueId:0,valueName:'1'},title);
 }
});
test('indication derives from any explicit usage, without identifying moto or another category',()=>{
 for(const [title,text,expected] of [
  ['Toalha Camping','Produto ideal para camping, praia e piqueniques.','camping, praia e piqueniques'],
  ['Pote Hermético','Indicação de uso: Armazenar alimentos secos','armazenar alimentos secos'],
  ['Passadeira a Vapor','Produto desenvolvido para cuidar das roupas.','cuidar das roupas']]){
  const data=run(title,text,[attr(2,'Indication')]);
  assert.equal(value(data,2)?.valueName,expected,title);
 }
});
test('correct automatic battery selection respects official category option IDs',()=>{
 const data=run('Lanterna Recarregável','Fonte de alimentação: Bateria',
  [attr(3,'Power Source',1,[{id:19,name:'Battery'},{id:20,name:'AC Power'}])]);
 assert.deepEqual(value(data,3),{valueId:19,valueName:'Battery'});
});
test('age rules generalize to 5, 7 and 12 years, preserving age range semantics',()=>{
 for(const years of [5,7,12]){
  const data=run('Jogo Educativo', 'Indicado para crianças a partir de '+years+' anos.',
   [attr(4,'Recommended Age',1,[{id:years,name:years+' Years and Above'},
    {id:99,name:'3 - 4 years'}])]);
  assert.equal(value(data,4)?.valueId,years);
  assert.ok(technicalOptionSearchTerms('Recommended Age','A partir de '+years+' anos')
   .includes(years+' years and above'));
 }
 const range=run('Jogo Educativo','A partir de 3 anos.',
  [attr(5,'Recommended Age',1,[{id:8,name:'3 - 4 years'}])]);
 assert.equal(value(range,5),undefined);
 assert.equal(range.unresolved.length,1);
});
test('never infer country of manufacturing or unverified certifications',()=>{
 const data=run('Produto Importado','Vendedor de São Paulo. Enviado do Brasil.',
  [attr(5,'Region of Origin',1,[{id:88,name:'Brazil'}]),
   attr(6,'Has BSMI No.',1,[{id:11,name:'No'}]),
   attr(7,'Registro Inmetro',3)]);
 assert.equal(data.suggestions.length,0);
});
test('do not populate controlled dropdown unless an official matching option exists',()=>{
 const data=run('Lanterna Recarregável','Alimentação: Bateria',
  [attr(8,'Power Source',1,[{id:5,name:'Solar'}],{supportSearch:true})]);
 assert.equal(value(data,8),undefined);
 assert.equal(data.unresolved.length,1);
});
test('text without WeDrop catalog can use the original Shopee product title safely',()=>{
 const data=run('Garrafa Térmica 900ml',
  'Itens inclusos:\n01 Garrafa Térmica 900ml\nEspecificações:\nMaterial: Inox',
  [attr(9,'Quantity')],false);
 assert.equal(value(data,9)?.valueName,'1');
});
test('merges with base evidence without overriding its existing technical values',()=>{
 const base={suggestions:[{attributeId:1,values:[{valueId:12,valueName:'Stainless steel'}]}],unresolved:[]};
 const combined=mergeNarrativeTechnicalFacts(base,{suggestions:[
  {attributeId:1,values:[{valueId:0,valueName:'Plastic'}]},
  {attributeId:2,values:[{valueId:0,valueName:'1'}]}],unresolved:[]});
 assert.equal(combined.suggestions.length,2);
 assert.equal(combined.suggestions[0].values[0].valueName,'Stainless steel');
});
