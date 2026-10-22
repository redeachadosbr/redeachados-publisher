import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync(new URL('../public/ads-improvements.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/ads-premium.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function module(){
 const ctx={globalThis:{},document:{},URL,Number,String,Array,Math};
 vm.runInNewContext(src,ctx);
 return ctx.globalThis.RedeAdsImprovements;
}
const baseline={
 campaignId:'101',name:'Produto A',statusGroup:'active',daysWithData:7,
 impressions:1200,clicks:0,expense:12,directOrdersObserved:true,directOrders:0,acos:null
};
test('impressões sem cliques identificam revisão de capa e título, sem prometer avaliação visual',()=>{
 const c=module().recommendations([baseline]);
 assert.equal(c.length,1);
 assert.equal(c[0].id,'no_clicks');
 assert.match(c[0].solution,/capa principal/);
});
test('cliques sem pedido direto são priorizados sem inferir pedidos não informados',()=>{
 const c=module().recommendations([{...baseline,clicks:40,impressions:1000,expense:20}]);
 assert.equal(c[0].id,'clicks_no_orders');
 assert.match(c[0].solution,/Pesquisar preços/);
 const noObservation=module().recommendations([{...baseline,clicks:40,impressions:1000,expense:20,
  directOrdersObserved:false}]);
 assert.equal(noObservation.length,0);
});
test('preço concorrente só recebe ajuste sugerido com pesquisa já validada',()=>{
 const result=module().recommendations([{...baseline,clicks:40,expense:22,
 priceEvidence:{price:150,marketAverage:100,differencePct:50,compared:3}}]);
 assert.match(result[0].solution,/acima da média/);
});
test('não apresenta campanha pausada como alerta atual',()=>{
 const result=module().recommendations([{...baseline,statusGroup:'inactive',clicks:30}]);
 assert.equal(result.length,0);
});
test('layout ocupa a área sob a tabela sem alterar painel da API',()=>{
 assert.match(css,/ADS GRID FIX 2\.3/);
 assert.match(css,/#tab-ads \.ads-v2-campaigns\{grid-row:4!important;grid-column:1\/10!important/);
 assert.match(css,/#tab-ads \.ads-v2-improvements\{grid-row:5!important;grid-column:1\/10!important/);
 assert.match(css,/#tab-ads \.ads-v2-execution\{grid-row:5!important;grid-column:10\/13!important/);
 assert.match(html,/ads-premium\.css\?v=2\.3\.0-stable-dashboard-grid/);
 assert.match(css,/#tab-ads \.ads-v2-review-panel:not\(\[hidden\]\)/);
 assert.match(html,/id="adsImprovementCount"/);
 assert.match(html,/ads-improvements\.js\?v=/);
 assert.match(app,/RedeAdsImprovements\?\.render/);
 assert.match(app,/adsShowReview\(\[c\.campaignId\]\)/);
});
