import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchWeDropCosts,compareSkuSets} from '../wedropCosts.js';

const catalog=[
  {item_id:10,item_name:'Aromatizador',item_status:'NORMAL',sku:'0000001740',price:'64.97',has_model:false},
  {item_id:11,item_name:'Kit',item_status:'NORMAL',sku:'',price:null,has_model:true}
];
const models=[
  {item_id:11,model_id:111,model_sku:'VAR-1',price:'38.50'},
  {item_id:11,model_id:112,model_sku:'VAR-2',price:'39.90'}
];
test('sem custo WeDrop a API não transmite tabela financeira inútil',()=>{
  const res=matchWeDropCosts(catalog,models,[]);
  assert.equal(res.financialReady,false);
  assert.equal(res.totals.catalogItems,2);
  assert.equal(res.totals.comparedSkus,3);
  assert.equal(res.totals.importedCosts,0);
  assert.equal(res.totals.missingCost,3);
  assert.deepEqual(res.rows,[]);
  assert.equal(res.truncated,false);
  assert.match(res.warning,/Nenhum custo WeDrop importado/);
});
test('com custos importados o cruzamento retorna valores reais, preservando SKU textual',()=>{
  const costs=[{supplier_sku:'0000001740',unit_cost:'19.20'}];
  const res=matchWeDropCosts(catalog,models,costs);
  assert.equal(res.financialReady,true);
  assert.equal(res.totals.matched,1);
  assert.equal(res.totals.missingCost,2);
  assert.equal(res.rows.length,3);
  assert.equal(res.rows.find(x=>x.sku==='0000001740').grossDifference,45.77);
  assert.equal(compareSkuSets(['1740'],['0000001740']).matchedCount,0);
});
test('interface oculta colunas financeiras e cartões até importação de custos',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
  assert.match(html,/id="wedropNoCosts"[^>]*hidden/);
  assert.match(html,/id="wedropFinancialResults"[^>]*hidden/);
  assert.match(html,/class="[^"]*wedrop-financial-metric" hidden/);
  assert.match(html,/id="wedropCompared"/);
  assert.match(js,/const costsAvailable=data\.hasImportedCosts===true/);
  assert.match(js,/\$\('#wedropFinancialResults'\)\.hidden=!costsAvailable/);
  assert.match(js,/\$\('#wedropNoCosts'\)\.hidden=costsAvailable/);
  assert.match(js,/if\(!costsAvailable\)/);
  assert.match(css,/#wedropFinancialResults\[hidden\]/);
});
test('pré-validação não contém referência a variável inexistente matching',()=>{
  const js=readFileSync(new URL('../wedropCosts.js',import.meta.url),'utf8');
  const start=js.indexOf('export async function compareIncomingCosts');
  const end=js.indexOf('export async function getWeDropCoverage',start);
  assert.ok(start>=0&&end>start);
  const section=js.slice(start,end);
  assert.match(section,/!comparison\.matchedCount/);
  assert.doesNotMatch(section,/!matching\.length/);
});
