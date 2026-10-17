import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {financeAdsDates,matchFinanceAds} from '../financeAdsSweep.js';
import {settingsFromShopeeResponse,summarizeShopeeAds} from '../adsReport.js';
const f={window:{from:1791846000,to:1792105200},catalogProducts:[
 {itemId:'10',sku:'A'},{itemId:'20',sku:'B'},{itemId:'30',sku:'C'},
 {itemId:'40',sku:'D'},{itemId:'40',sku:'D-2'}],
 skuSummary:[{sku:'A',payout:100,cost:50,balanceBeforeAds:50},
  {sku:'B',payout:80,cost:40,balanceBeforeAds:40},
  {sku:'C',payout:70,cost:30,balanceBeforeAds:40}]};
const c=(id,expense,directOrders,itemIdList=[],known=true)=>({
 campaignId:id,expense,directOrders,itemIdList,directOrdersObserved:known
});
test('item_id_list vem do common_info oficial, não do nome do anúncio',()=>{
 const m=settingsFromShopeeResponse({response:{campaign_list:[
  {campaign_id:101,common_info:{ad_name:'Venda A',item_id_list:[10,10]}}]}},['101']);
 assert.deepEqual(m.get('101').itemIdList,['10']);
 assert.deepEqual(m.get('101').status,'unknown');
});
test('varredura: aplica custo Ads de campanha convertida ao SKU vendido e não deduz duas vezes',()=>{
 const r=matchFinanceAds(f,{campaigns:[
  c('1',12.35,1,['10']),
  c('2',7.65,2,['10']),
  c('3',5,0,['20']),
  c('4',9,1,['20','30']),
  c('5',4,1,['40']),
  c('6',2,1,['999']),
  c('7',6,1,['20'])]});
 assert.equal(r.spendTotal,46);
 assert.equal(r.spendWithDirectConversions,41);
 assert.equal(r.spendWithoutDirectConversions,5);
 assert.equal(r.spendAllocatedToSoldSku,26);
 assert.equal(r.spendUnassigned,15);
 assert.equal(r.skuCosts.find(x=>x.sku==='A').expense,20);
 assert.equal(r.skuCosts.find(x=>x.sku==='A').afterAds,30);
 assert.equal(r.skuCosts.find(x=>x.sku==='B').expense,6);
 assert.equal(r.skuCosts.find(x=>x.sku==='B').afterAds,34);
 assert.equal(r.skuCosts.some(x=>x.sku==='C'),false);
 assert.equal(r.skuCosts.some(x=>x.sku==='D'),false);
 assert.equal(r.reconciliation,'by_item_period_not_by_order');
 assert.ok(r.limitations.some(x=>x.includes('não é lucro líquido final')));
});
test('campanha sem conversão não entra no resultado da venda, permanece como despesa',()=>{
 const r=matchFinanceAds(f,{campaigns:[c('1',20,0,['10'])]});
 assert.equal(r.spendWithoutDirectConversions,20);
 assert.equal(r.spendAllocatedToSoldSku,0);
 assert.equal(r.skuCosts.length,0);
 assert.equal(r.spendTotal,20);
});
test('campanha com venda atribuída mas sem pedido concluído no recorte não é debitada em SKU',()=>{
 const incomplete={...f,skuSummary:[]};
 const r=matchFinanceAds(incomplete,{campaigns:[c('1',30,3,['10'])]});
 assert.equal(r.spendAllocatedToSoldSku,0);
 assert.equal(r.spendUnassigned,30);
 assert.match(r.review[0].situation,/não existe venda concluída/);
});
test('sem métrica direct_order: não classificar como zero conversões',()=>{
 const r=matchFinanceAds(f,{campaigns:[c('1',17,0,['10'],false)]});
 assert.equal(r.spendWithoutDirectConversions,0);
 assert.equal(r.spendMetricUnknown,17);
 assert.equal(r.spendUnassigned,17);
 assert.equal(r.skuCosts.length,0);
});
test('campos UI/endpoint e nomes de despesas preservam lucro líquido final não apurado',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 for(const id of ['financeSkuAdsKpi','financeAdsNoConversion','financeAdsTotal',
   'financeSkuNetKpi','financeAdsExceptionList','financeAdsScanText','financeSkuBody']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(html,/Resultado após Ads/);
 assert.match(js,/renderFinanceAdsScan\(report\)/);
 assert.match(js,/spendWithoutDirectConversions/);
 assert.match(js,/financeAdsBySku/);
 assert.match(js,/Ads em revisão/);
 assert.match(server,/loadShopeeAdsOverview\(cfg,auth,callShopeeShopApi,dates\)/);
 assert.match(server,/matchFinanceAds\(finance,adsResult.value\)/);
 assert.match(server,/status:'unavailable'/);
 assert.match(html,/não é lucro fiscal final/i);
 assert.match(html,/app\.js\?v=1\.14\.1/);
});
test('datas de Ads correspondem ao calendário brasileiro, não ao fuso do servidor',()=>{
 assert.deepEqual(financeAdsDates({
  from:Date.parse('2026-10-13T02:00:00Z')/1000,
  to:Date.parse('2026-10-16T20:00:00Z')/1000
 }),{start:'2026-10-12',end:'2026-10-16'});
});
