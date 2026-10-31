import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKitResearchJson,kitJsonFileName} from '../public/kit-json-export.js';

test('gera arquivo .json real com nome correto, metadados e zeros à esquerda',()=>{
 const source={kits:[
  {skus:['050','TRC0265'],motivo:'Limpeza em conjunto',fontes:['https://exemplo.com/kit']},
  {skus:['TRC0265','CT0200'],motivo:'Rolo e balde',fontes:[]}
 ]};
 const result=buildKitResearchJson(JSON.stringify(source),{
  category:'Limpeza e Lavanderia',size:2,allowedCodes:['050','TRC0265','CT0200'],desiredKits:20
 });
 assert.equal(result.filename,'kits-limpeza-e-lavanderia-2-skus.json');
 assert.equal(result.count,2);
 assert.deepEqual(JSON.parse(result.content),source);
});
test('JSON da conversa em bloco Markdown e arquivo com 3 SKUs',()=>{
 const raw='Arquivo criado:\n```json\n'+JSON.stringify({kits:[{skus:['001','ABC','XYZ'],motivo:'Uso conjunto'}]})+'\n```';
 const result=buildKitResearchJson(raw,{category:'Brinquedos',size:3,
  allowedCodes:['001','ABC','XYZ'],desiredKits:20});
 assert.equal(result.filename,'kits-brinquedos-3-skus.json');
 assert.deepEqual(JSON.parse(result.content).kits[0].skus,['001','ABC','XYZ']);
 assert.deepEqual(JSON.parse(result.content).kits[0].fontes,[]);
});
test('não cria arquivo com SKU inventada ou sem estoque no catálogo permitido',()=>{
 assert.throws(()=>buildKitResearchJson('{"kits":[{"skus":["001","FALSA"]}]}',
  {category:'Brinquedos',size:2,allowedCodes:['001','ABC']}),/Nenhum kit válido/);
});
test('aplica limite 20 e tamanho selecionado, sem gerar combinações artificiais',()=>{
 const allowed=Array.from({length:45},(_,i)=>'SKU'+String(i).padStart(3,'0'));
 const source={kits:[[allowed[0],allowed[1],allowed[2]],
  ...Array.from({length:21},(_,i)=>[allowed[i],allowed[i+22]])]};
 const result=buildKitResearchJson(source,{category:'Limpeza',size:2,allowedCodes:allowed,desiredKits:20});
 assert.equal(result.count,20);
 assert.equal(JSON.parse(result.content).kits[0].skus.length,2);
 assert.equal(result.rejected,1);
});
test('gera JSON mesmo a partir da tabela de texto, sem inventar motivo/fontes',()=>{
 const raw='| Kit | SKU |\n| Limpeza | 001 + ABC |';
 const result=buildKitResearchJson(raw,{category:'Limpeza',size:2,
  allowedCodes:['001','ABC'],desiredKits:20});
 assert.deepEqual(JSON.parse(result.content),{kits:[{skus:['001','ABC'],motivo:'',fontes:[]}]});
});
test('verifica entrada e nome do arquivo',()=>{
 assert.equal(kitJsonFileName('Limpeza e Lavanderia',2),'kits-limpeza-e-lavanderia-2-skus.json');
 assert.throws(()=>kitJsonFileName('Limpeza',4),/Quantidade/);
});
