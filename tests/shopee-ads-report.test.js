import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdsDate,validateAdsRange,campaignIdsFromResponse,
  discoverShopeeCampaigns,summarizeShopeeAds,loadShopeeAdsOverview
} from '../adsReport.js';
const cfg={mode:'live'};
const auth={shopId:852701218,accessToken:'simulation'};
test('datas válidas de até 30 dias e sem data futura',()=>{
  const now=Date.UTC(2026,9,16,10);
  assert.deepEqual(validateAdsRange('2026-10-09','2026-10-16',now),{
    start_date:'09-10-2026',end_date:'16-10-2026'
  });
  assert.equal(parseAdsDate('09-10-2026').api,'09-10-2026');
  assert.throws(()=>validateAdsRange('2026-10-16','2026-10-16',now),/anterior/);
  assert.throws(()=>validateAdsRange('2026-09-01','2026-10-16',now),/30 dias/);
  assert.throws(()=>validateAdsRange('2026-10-15','2026-10-17',now),/futuro/);
  assert.throws(()=>parseAdsDate('2026-02-30'),/inválida/);
});
test('campanhas são paginadas e duplicados removidos',async()=>{
  let calls=0;
  const api=async(_cfg,r)=>{
    assert.equal(r.path,'/api/v2/ads/get_product_level_campaign_id_list');
    assert.equal(r.query.ad_type,'all');
    assert.equal(r.query.offset,calls*50);
    calls++;
    return {response:{has_next_page:calls<3,campaign_list:(
      calls===1?[{campaign_id:101,ad_type:'auto'}]:
      calls===2?[{campaign_id:101,ad_type:'auto'},{campaign_id:102,ad_type:'manual'}]:
      [{campaign_id:103,ad_type:'auto'}])}};
  };
  const list=await discoverShopeeCampaigns(cfg,auth,api);
  assert.equal(calls,3);
  assert.deepEqual(list.map(x=>x.campaignId),['101','102','103']);
});
test('se a Shopee não devolver lista válida, não inventa campanha zero',()=>{
  assert.throws(()=>campaignIdsFromResponse({response:{}}),/lista válida/);
});
test('retorna resultado sem campanhas nem requisição de desempenho',async()=>{
  const called=[];
  const res=await loadShopeeAdsOverview(cfg,auth,async(_cfg,r)=>{
    called.push(r.path);return {response:{campaign_list:[],has_next_page:false}};
  },{start:'2026-10-09',end:'2026-10-16'});
  assert.equal(called.length,1);
  assert.equal(res.campaignCount,0);
  assert.equal(res.total.expense,0);
  assert.equal(res.total.roas,null);
});
test('relatório agrega métricas sem somar GMV direto e amplo como se fossem distintos',()=>{
  const list=[{campaignId:'101',adType:'auto'},{campaignId:'102',adType:'manual'}];
  const report=summarizeShopeeAds([{response:[{campaign_list:[
    {campaign_id:101,ad_name:'Campanha A',metrics_list:[
      {expense:10,broad_gmv:100,direct_gmv:80,clicks:5,impression:100,broad_order:2,direct_order:1},
      {expense:15,broad_gmv:50,direct_gmv:30,clicks:10,impression:200,broad_order:1,direct_order:1}]}
  ]}]}],list);
  assert.equal(report.campaignCount,2);
  assert.equal(report.total.expense,25);
  assert.equal(report.total.broadGmv,150);
  assert.equal(report.total.directGmv,110);
  assert.equal(report.total.roas,6);
  assert.equal(report.total.acos,Number((25/150*100).toFixed(4)));
  assert.equal(report.total.withData,1);
  assert.equal(report.campaigns.find(x=>x.campaignId==='102').acos,null);
});
test('consulta desempenho com lista autodescoberta sem passar de 100 IDs',async()=>{
  const ids=Array.from({length:115},(_,i)=>({campaign_id:i+1,ad_type:'auto'}));
  const req=[];
  const result=await loadShopeeAdsOverview(cfg,auth,async(_cfg,r)=>{
    req.push(r);
    if(r.path.includes('campaign_id_list'))return {response:{campaign_list:ids,has_next_page:false}};
    return {response:[{shop_id:auth.shopId,campaign_list:[]}]};
  },{start:'2026-10-09',end:'2026-10-16'});
  assert.equal(req.length,3);
  assert.equal(req[1].query.campaign_id_list.split(',').length,100);
  assert.equal(req[2].query.campaign_id_list.split(',').length,15);
  assert.equal(result.campaignCount,115);
});
test('erro de permissão Shopee não é interpretado como campanha vazia',async()=>{
  await assert.rejects(()=>discoverShopeeCampaigns(cfg,auth,async()=>{throw new Error('error_api_permission');}),/permission/);
});
