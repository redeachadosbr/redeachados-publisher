import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const ads=html.slice(html.indexOf('id="tab-ads"'),html.indexOf('id="tab-wedrop"'));
test('Shopee Ads 1.19.8 exibe nove indicadores, saúde, revisão e tabela real',()=>{
 for(const id of ['adsStart','adsEnd','loadAdsAutoBtn','adsSummary','adsResults','adsCampaignCount',
  'adsImpressions','adsClicks','adsCtr','adsExpense','adsGmv','adsRoasAcos',
  'adsAttributedOrders','adsItemsSold','adsHealthGauge','adsHealthScore',
  'adsHealthState','adsHealthComment','adsStatusTrack',
  'adsActiveCount','adsInactiveCount','adsOtherCount','adsRecommendations',
  'adsExecutionSteps','adsExecuteSuggested','adsExecutionReviewBtn',
  'adsResultsBody','adsCampaignSearch','adsStatusExplanation','adsFiltersPanel',
  'adsDiagnosisFilter','adsCampaignSort','adsSelectVisible',
  'adsReviewPanel','adsReviewRows','adsOpenSeller','adsCloseReview','adsExportBtn',
  'adsPrevious','adsNext','adsPageCurrent','adsPaginationInfo',
  'loadAdsBtn','campaignIds']){
  assert.equal((ads.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.equal((ads.match(/class="ads-v2-kpi ads-v2-kpi-/g)||[]).length,9);
 assert.match(html,/style\.css\?v=1\.19\.8/);
 assert.match(html,/app\.js\?v=1\.19\.8/);
 assert.match(server,/version:'1\.19\.8'/);
 assert.match(ads,/id="adsExecuteSuggested" type="button" disabled/);
 assert.match(ads,/id="adsResults" hidden/);
});
test('Recomendações são indicativas e não criam operações Shopee Ads de escrita',()=>{
 const a=app.indexOf('function adsDiagnose(c){');
 const b=app.indexOf('function adsCreateElement(',a);
 const q=app.indexOf('function adsRecommendationsFor(',b);
 const e=app.indexOf('function adsSetKpi(',q);
 assert.ok(a>0&&q>0&&e>q);
 const scope={};
 runInNewContext(app.slice(a,b)+'\nthis.adsDiagnose=adsDiagnose;',scope);
 assert.equal(scope.adsDiagnose({daysWithData:1,impressions:200,ctr:0.7,broadGmv:2,acos:5,expense:1}).label,'CTR baixo');
 assert.equal(scope.adsDiagnose({daysWithData:1,impressions:200,ctr:2,broadGmv:100,acos:40,expense:40}).label,'ACOS alto');
 assert.equal(scope.adsDiagnose({daysWithData:1,impressions:200,ctr:2,broadGmv:0,acos:null,expense:15,directOrdersObserved:true,directOrders:0}).label,'Sem venda direta');
 assert.equal(scope.adsDiagnose({daysWithData:1,impressions:10,ctr:0,broadGmv:0,acos:null,expense:4,directOrdersObserved:false,directOrders:0}).kind,'unknown');
 assert.equal(scope.adsDiagnose({daysWithData:0}).kind,'unknown');
 assert.match(app,/adsSuggestions=adsRecommendationsFor\(campaigns\)/);
 assert.match(app,/Não habilitado/);
 assert.match(app,/Nenhum lance, orçamento ou status foi alterado/);
 assert.doesNotMatch(server,/app\.post\('\/api\/shopee\/ads\/(update|pause|budget)/);
 assert.match(app,/https:\/\/seller\.shopee\.com\.br\//);
});
test('métricas reais, consultas existentes, filtros e exportação por campanha',()=>{
 assert.match(app,/await json\('\/api\/shopee\/ads\/overview\?'\+q/);
 assert.match(app,/await json\('\/api\/shopee\/ads\/product-campaign-performance\?'\+q/);
 assert.match(app,/data\.statusCounts/);
 assert.match(app,/adsNum\(total\.broadOrders\?\?0\)/);
 assert.match(app,/adsItemsSold','Não disponível'/);
 assert.match(app,/adsSelected=new Set\(item\.ids\)/);
 assert.match(app,/new Blob\(\[csv\],\{type:'text\/csv;charset=utf-8'\}\)/);
 assert.match(app,/function adsCsvProtect\(value\)/);
 assert.match(app,/adsVisibleCampaigns\(\)/);
 assert.match(app,/adsStatusLabel\(c\.status\)/);
 assert.match(app,/adsShowReview\(item\.ids\)/);
 assert.match(app,/classList\?\.toggle\?\.\('view-ads',name==='ads'\)/);
 assert.match(css,/#tab-ads \.ads-v2-metrics\{display:grid;grid-template-columns:repeat\(9,minmax\(0,1fr\)\)/);
 assert.match(css,/#tab-ads \.ads-v2-main-grid\{display:grid/);
 assert.match(css,/@media\(max-width:650px\)/);
});
