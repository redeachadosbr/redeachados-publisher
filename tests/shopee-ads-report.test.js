import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdsDate,validateAdsRange,campaignIdsFromResponse,
  discoverShopeeCampaigns,summarizeShopeeAds,loadShopeeAdsOverview,
  classifyShopeeCampaignStatus,settingsFromShopeeResponse,fetchShopeeCampaignSettings, brazilAdsToday
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
    if(r.path.endsWith('campaign_id_list'))return {response:{campaign_list:ids,has_next_page:false}};
    if(r.path.endsWith('campaign_setting_info')){
      return {response:{campaign_list:r.query.campaign_id_list.split(',').map(id=>({
        campaign_id:Number(id),common_info:{campaign_status:Number(id)%2?'ongoing':'paused',ad_name:'Ads '+id}
      }))}};
    }
    return {response:{shop_id:auth.shopId,campaign_list:[]}};
  },{start:'2026-10-09',end:'2026-10-16'});
  assert.equal(req.length,5);
  assert.equal(req.filter(x=>x.path.endsWith('campaign_setting_info')).length,2);
  assert.equal(req.filter(x=>x.path.endsWith('daily_performance')).length,2);
  assert.equal(req.filter(x=>x.path.endsWith('campaign_setting_info'))[0].query.info_type_list,'1');
  assert.equal(req.filter(x=>x.path.endsWith('daily_performance'))[0].query.campaign_id_list.split(',').length,100);
  assert.equal(req.filter(x=>x.path.endsWith('daily_performance'))[1].query.campaign_id_list.split(',').length,15);
  assert.equal(result.campaignCount,115);
  assert.equal(result.statusCounts.active,58);
  assert.equal(result.statusCounts.inactive,57);
  assert.equal(result.statusCounts.other,0);
});
test('erro de permissão Shopee não é interpretado como campanha vazia',async()=>{
  await assert.rejects(()=>discoverShopeeCampaigns(cfg,auth,async()=>{throw new Error('error_api_permission');}),/permission/);
});

test('classificação de status Shopee usa campanha_status e não números de cliques',()=>{
  assert.equal(classifyShopeeCampaignStatus('ongoing'),'active');
  for(const s of ['paused','ended','closed','deleted']){
    assert.equal(classifyShopeeCampaignStatus(s),'inactive');
  }
  for(const s of ['scheduled','unknown','',null,undefined,'invalid_field']){
    assert.equal(classifyShopeeCampaignStatus(s),'other');
  }
});
test('mapeia common_info da configuração sem colocar agendadas entre ativas',()=>{
  const settings=settingsFromShopeeResponse({response:{campaign_list:[
    {campaign_id:101,common_info:{campaign_status:'ongoing',ad_name:'Ativa'}},
    {campaign_id:102,common_info:{campaign_status:'paused',ad_name:'Pausada'}},
    {campaign_id:103,common_info:{campaign_status:'scheduled',ad_name:'Agendada'}},
    {campaign_id:999,common_info:{campaign_status:'ongoing',ad_name:'Fora da consulta'}}
  ]}},['101','102','103']);
  assert.equal(settings.get('101').statusGroup,'active');
  assert.equal(settings.get('102').statusGroup,'inactive');
  assert.equal(settings.get('103').statusGroup,'other');
  assert.equal(settings.has('999'),false);
});
test('CTR geral e por campanha: cliques sobre impressões, não média simples',()=>{
  const data=summarizeShopeeAds([{response:{campaign_list:[
    {campaign_id:101,metrics_list:[{expense:5,impression:100,clicks:20,broad_gmv:50}]},
    {campaign_id:102,metrics_list:[{expense:5,impression:900,clicks:18,broad_gmv:90}]}
  ]}}],[{campaignId:'101'},{campaignId:'102'}]);
  assert.equal(data.campaigns.find(x=>x.campaignId==='101').ctr,20);
  assert.equal(data.campaigns.find(x=>x.campaignId==='102').ctr,2);
  assert.equal(data.total.impressions,1000);
  assert.equal(data.total.clicks,38);
  assert.equal(data.total.ctr,3.8);
});
test('permissão negada somente nas configurações não inventa campanha ativa',async()=>{
  const report=await loadShopeeAdsOverview(cfg,auth,async(_cfg,r)=>{
    if(r.path.endsWith('campaign_id_list'))
      return {response:{campaign_list:[{campaign_id:101,ad_type:'auto'}],has_next_page:false}};
    if(r.path.endsWith('campaign_setting_info'))throw Error('error_api_permission: denied');
    return {response:{campaign_list:[{campaign_id:101,metrics_list:[{expense:10,impression:100,clicks:4,broad_gmv:50}]}]}};
  },{start:'2026-10-09',end:'2026-10-16'});
  assert.equal(report.campaignCount,1);
  assert.equal(report.statusCounts.active,0);
  assert.equal(report.statusCounts.inactive,0);
  assert.equal(report.statusCounts.other,1);
  assert.match(report.statusWarning,/permission/);
  assert.equal(report.total.ctr,4);
});

test('dia brasileiro não avança quando UTC já virou para amanhã',()=>{
 const clock=Date.parse('2026-10-19T01:00:00Z');
 assert.equal(brazilAdsToday(clock),'2026-10-18');
 assert.deepEqual(validateAdsRange('2026-10-11','2026-10-18',clock),
   {start_date:'11-10-2026',end_date:'18-10-2026'});
 assert.throws(()=>validateAdsRange('2026-10-12','2026-10-19',clock),/futuro/);
});
test('Shopee Ads recua a janela inteira em data não liberada e não duplica métricas',async()=>{
 const seen=[];
 const report=await loadShopeeAdsOverview(cfg,auth,async(_cfg,r)=>{
  seen.push(r);
  if(r.path.endsWith('campaign_id_list'))return {response:{campaign_list:[{campaign_id:101,ad_type:'auto'}],has_next_page:false}};
  if(r.path.endsWith('campaign_setting_info'))return {response:{campaign_list:[{campaign_id:101,common_info:{campaign_status:'ongoing'}}]}};
  if(r.path.endsWith('daily_performance')&&r.query.end_date==='18-10-2026')
    throw Error('ads.performance.error_date_in_future: The date must be today or earlier than today up to 6 months ago');
  if(r.path.endsWith('daily_performance'))return {response:{campaign_list:[{campaign_id:101,metrics_list:[
    {expense:9,broad_gmv:20,impression:50,clicks:2}]}]}};
  throw Error('Unexpected path '+r.path);
 },{start:'2026-10-11',end:'2026-10-18',allowDateFallback:true});
 assert.deepEqual(report.dates,{start:'10-10-2026',end:'17-10-2026'});
 assert.equal(report.dateAdjustment.shiftedDays,1);
 assert.equal(report.total.expense,9);
 assert.equal(seen.filter(x=>x.path.endsWith('daily_performance')).length,2);
});
test('rotinas financeiras sem fallback não alteram silenciosamente o período',async()=>{
 await assert.rejects(()=>loadShopeeAdsOverview(cfg,auth,async(_cfg,r)=>{
  if(r.path.endsWith('campaign_id_list'))return {response:{campaign_list:[{campaign_id:101}],has_next_page:false}};
  if(r.path.endsWith('campaign_setting_info'))return {response:{campaign_list:[]}};
  throw Error('ads.performance.error_date_in_future');
 },{start:'2026-10-11',end:'2026-10-18'}),/error_date_in_future/);
});
