import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchWeDropCosts} from '../wedropCosts.js';
const items=[
  {item_id:10,sku:'ABC',item_name:'Com custo',item_status:'NORMAL',price:99.9,has_model:false},
  {item_id:20,sku:'XYZ',item_name:'Sem custo',item_status:'NORMAL',price:59,has_model:false},
  {item_id:30,sku:'DEF',item_name:'Também com custo',item_status:'NORMAL',price:70,has_model:false}
];
const costs=[
  {supplier_sku:'ABC',unit_cost:'20'},
  {supplier_sku:'DEF',unit_cost:'30'},
  {supplier_sku:'OUTRO',unit_cost:'40'}
];
test('padrão geral prioriza vínculos confirmados, sem mascarar as pendências',()=>{
  const v=matchWeDropCosts(items,[],costs);
  assert.equal(v.totals.matched,2);
  assert.equal(v.totals.missingCost,1);
  assert.deepEqual(v.rows.map(x=>x.sku),['ABC','DEF','XYZ']);
  assert.equal(v.totals.supplierSkusNotMatched,1);
});
test('abas fornecem os números corretos e isolam sem custo',()=>{
  const matched=matchWeDropCosts(items,[],costs,{filter:'matched'});
  const pending=matchWeDropCosts(items,[],costs,{filter:'unmatched'});
  assert.deepEqual(matched.rows.map(x=>x.sku),['ABC','DEF']);
  assert.deepEqual(pending.rows.map(x=>x.sku),['XYZ']);
  assert.equal(matched.totalFiltered,2);
  assert.equal(pending.totalFiltered,1);
  assert.equal(matched.totals.missingCost,1);
});
test('paginação mantém acesso a itens além dos primeiros 500',()=>{
  const many=Array.from({length:737},(_,i)=>({item_id:i+100,sku:'X'+i,
    item_name:'Teste',item_status:'NORMAL',price:85,has_model:false}));
  const mapping=many.slice(0,730).map(x=>({supplier_sku:x.sku,unit_cost:20}));
  const first=matchWeDropCosts(many,[],mapping,{filter:'matched',limit:500});
  const second=matchWeDropCosts(many,[],mapping,{filter:'matched',limit:500,offset:500});
  const pending=matchWeDropCosts(many,[],mapping,{filter:'unmatched',limit:500});
  assert.equal(first.totals.matched,730);
  assert.equal(first.totals.missingCost,7);
  assert.equal(first.rows.length,500);
  assert.equal(first.nextOffset,500);
  assert.equal(second.rows.length,230);
  assert.equal(second.nextOffset,null);
  assert.equal(pending.rows.length,7);
  assert.equal(new Set([...first.rows,...second.rows].map(x=>x.sku)).size,730);
});
test('sem custos preserva o estado vazio',()=>{
  const x=matchWeDropCosts(items,[],[],{filter:'matched'});
  assert.equal(x.financialReady,false);
  assert.deepEqual(x.rows,[]);
});
test('rejeita filtros e offsets inesperados no backend',()=>{
  assert.throws(()=>matchWeDropCosts(items,[],costs,{filter:'unexpected'}),/Filtro/);
  assert.throws(()=>matchWeDropCosts(items,[],costs,{filter:'all',offset:-1}),/Paginação/);
});
test('interface exibe abas vinculados e pendentes separadamente',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(html,/id="wedropTabMatched"/);
  assert.match(html,/id="wedropTabUnmatched"/);
  assert.match(html,/id="wedropTabAll"/);
  assert.match(html,/id="wedropTableMoreBtn"/);
  assert.match(app,/let wedropSelectedFilter='matched'/);
  assert.match(app,/\/api\/shopee\/wedrop\/coverage\?/);
  assert.match(app,/wedropNextOffset/);
});
