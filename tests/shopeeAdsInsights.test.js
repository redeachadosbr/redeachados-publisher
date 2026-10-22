import test from 'node:test';
import assert from 'node:assert/strict';
import {adsSevenDayWindows,buildAdsMonitor,offerPriceEvidence} from '../shopeeAdsInsights.js';
const NOW=Date.parse('2026-10-22T12:00:00Z');
const product={itemId:'500',sku:'AB100',title:'Cafeteira Italiana',stock:22,status:'NORMAL',imageUrl:'https://cf.shopee.com.br/file/abc'};
const quote={sku:'AB100',itemId:'500',updatedAt:'2026-10-22T00:00:00Z',quote:{
 unitCost:40,customerPrice:120,netMarginPct:18,netProfit:21,
 marketResearch:{verified:true,count:3,reference:100,researchedAt:'2026-10-21T15:00:00Z'}
}};
const candidate={itemId:'500',sku:'AB100',title:'Cafeteira Italiana',score:70,marginPct:18};
function campaign(values={}){
 return {campaignId:'40',name:'Ads Cafeteira',itemIdList:['500'],status:'ongoing',statusGroup:'active',
  daysWithData:7,impressions:1000,clicks:0,expense:20,directOrders:0,
  broadOrders:0,directOrdersObserved:true,broadOrdersObserved:true,roas:0,
  ...values};
}
function run(values={},prev=null){return buildAdsMonitor({catalog:[product],plans:[quote],
 candidates:[candidate],recent:{campaigns:[campaign(values)]},
 previous:prev?{campaigns:[campaign(prev)]}:null,now:NOW});}
test('janelas usam dias completos: 7 recentes e 7 anteriores',()=>{
 assert.deepEqual(adsSevenDayWindows('2026-10-22'),{
  recent:{start:'2026-10-15',end:'2026-10-21'},
  previous:{start:'2026-10-08',end:'2026-10-14'}});
});
test('campanha com impressoes e nenhum clique recebe alerta e mostra miniatura e CTR',()=>{
 const data=run();
 assert.equal(data.campaigns[0].imageUrl,product.imageUrl);
 assert.equal(data.campaigns[0].metrics.ctr,0);
 assert.ok(data.campaigns[0].alerts.some(a=>a.code==='zero_clicks'));
 assert.equal(data.candidates[0].adsMetrics.impressions,1000);
 assert.equal(data.candidates[0].adsMetrics.clicks,0);
});
test('cliques sem pedidos sinalizam preço de mercado real validado',()=>{
 const data=run({impressions:1300,clicks:43,expense:32,roas:0});
 const warning=data.campaigns[0].alerts.find(a=>a.code==='no_sales');
 assert.ok(warning);
 assert.match(warning.actions.join(' '),/120\.00 ante média amostral 100\.00/);
 assert.equal(data.campaigns[0].pricing.deltaPct,20);
});
test('pesquisa não validada não vira comparação factual',()=>{
 const evidence=offerPriceEvidence({quote:{customerPrice:150,marketResearch:{verified:false,reference:100,count:2}}},{now:NOW});
 assert.equal(evidence.fresh,false);
 const out=buildAdsMonitor({catalog:[product],plans:[],candidates:[candidate],
  recent:{campaigns:[campaign({clicks:45})]},now:NOW});
 assert.match(out.campaigns[0].alerts.find(a=>a.code==='no_sales').actions.join(' '),/Atualizar pesquisa/);
});
test('múltiplos itens não atribuem tráfego a SKU individual',()=>{
 const out=run({itemIdList:['500','501'],clicks:15,impressions:1400});
 assert.equal(out.campaigns[0].sharedCampaign,true);
 assert.equal(out.candidates[0].adsMetrics.impressions,null);
});
test('sem confirmação de pedido não deduz zero venda a partir de campos ausentes',()=>{
 const out=run({directOrdersObserved:false,broadOrdersObserved:false,clicks:80,impressions:1000});
 assert.equal(out.campaigns[0].metrics.orders,null);
 assert.equal(out.campaigns[0].alerts.some(a=>a.code==='no_sales'),false);
});
test('variação de impressões só compara quando ambas as semanas têm dados',()=>{
 const out=run({impressions:350,clicks:40},{impressions:1000,clicks:55});
 assert.equal(out.campaigns[0].metrics.impressionChangePct,-65);
 assert.ok(out.campaigns[0].alerts.some(a=>a.code==='impressions_drop'));
});
test('API indisponível mantém triagem financeira e não inventa impressões ou CTR',()=>{
 const out=buildAdsMonitor({catalog:[product],plans:[quote],candidates:[candidate]});
 assert.equal(out.candidates[0].adsMetrics.impressions,null);
 assert.equal(out.candidates[0].adsMetrics.ctr,null);
 assert.equal(out.campaigns.length,0);
});
test('status pausado não deve classificar baixo tráfego como falha de entrega atual',()=>{
 const out=run({status:'paused',statusGroup:'inactive',impressions:0,clicks:0});
 assert.ok(out.campaigns[0].alerts.some(a=>a.code==='inactive'));
 assert.equal(out.campaigns[0].alerts.some(a=>a.code==='no_delivery'),false);
});
