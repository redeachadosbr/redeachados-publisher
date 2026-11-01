import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sources=['server.js','public/kit-builder.js','public/kit-existing-optimization.js'];
const correct=String.raw`^[1-9]\d{0,17}$`;
const broken=String.raw`^[1-9]\\d{0,17}$`;
const modelCorrect=String.raw`^(0|[1-9]\d{0,17})$`;
const modelBroken=String.raw`^(0|[1-9]\\d{0,17})$`;

test('Item ID salvo e válido não é rejeitado por escape duplicado',()=>{
 assert.equal(new RegExp(correct).test('58272041645'),true);
 assert.equal(new RegExp(correct).test('5abc'),false);
 assert.equal(new RegExp(modelCorrect).test('0'),true);
 for(const path of sources){
  const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.equal(src.includes(broken),false,path+' contém regex numérica escapada em dobro');
  assert.equal(src.includes(modelBroken),false,path+' contém regex de modelo quebrada');
  assert.equal(src.includes(correct),true,path+' deve validar Item ID decimal');
 }
});
test('A recuperação consulta primeiro o Item ID oficial antes da busca SKU',()=>{
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=server.indexOf("app.get('/api/shopee/kits/optimization/find'");
 const end=server.indexOf('// Preparação assistida de anúncios.',start);
 const route=server.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.ok(route.indexOf('shopeeLiveEditableItem(cfg,auth,storedItemId)')<
  route.indexOf('findLiveShopeeSku(cfg,auth,callShopeeShopApi'));
 assert.match(route,/verifiedSavedTarget:verified/);
});
