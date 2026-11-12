import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../site/ads-single-analysis.js', import.meta.url),'utf8');
const window = {};
const document = {
  createElement:()=>({style:{}}),
  head:{append(){}},
  getElementById:()=>null
};
runInNewContext(source,{window,document});
const {analyze}=window.RedeAdsSingle;
const d={
 campaign:'Teste Shopee',dateStart:'2026-11-05',dateEnd:'2026-11-11',
 periodClosed:true,spent:2.89,revenue:43.8,actual:15.17,
 impressions:829,clicks:6,orders:2,itemsSold:2,target:null,
 price:null,cost:null
};
const finance=()=>({contrib:10,breakeven:2.19,minRoas:3,unfilled:[]});
test('interpreta desempenho do print sem tratar receita como lucro',()=>{
 const r=analyze(d,()=>null);
 assert.ok(Math.abs(r.actual-43.8/2.89)<1e-9);
 assert.ok(Math.abs(r.ctr-6/829*100)<1e-9);
 assert.ok(Math.abs(r.cpc-2.89/6)<1e-9);
 assert.equal(r.afterAds,40.91);
 assert.equal(r.estimatedNet,null);
 assert.equal(r.limitedSample,true);
 assert.equal(r.scenario,null);
 assert.equal(r.suggestedROAS,null);
});
test('lucro estimado desconta custo unitario e publicidade uma vez',()=>{
 const r=analyze({...d,price:21.90,cost:8},finance);
 assert.equal(r.estimatedNet,17.11);
 assert.match(r.title,/poucas vendas|cliques/);
});
test('nao estima lucro se custos complementares estao em branco',()=>{
 const r=analyze({...d,price:21.90},()=>({...finance(),unfilled:['shipping']}));
 assert.equal(r.estimatedNet,null);
 assert.ok(r.warnings.some(x=>x.includes('em branco')));
});
test('nao chama ROAS positivo de lucro quando margem e negativa',()=>{
 const r=analyze({...d,price:21.90},()=>({contrib:1,breakeven:21.9,minRoas:30,unfilled:[]}));
 assert.ok(r.estimatedNet<0);
 assert.match(r.title,/prejuízo/);
});
test('sem venda atribuida sinaliza perda do investimento e nao inventa conversao',()=>{
 const r=analyze({...d,revenue:0,orders:null,itemsSold:null},finance);
 assert.equal(r.actual,0);
 assert.equal(r.conversion,null);
 assert.equal(r.afterAds,-2.89);
 assert.match(r.title,/gasto sem vendas/);
});
test('sem orcamento ou meta ainda permite diagnostico',()=>{
 const r=analyze({...d,target:null,budget:null,budgetMode:'daily'},finance);
 assert.ok(r.title);
 assert.equal(r.suggestedBudget,null);
});
