// Consultas oficiais Shopee Ads V2. Nenhuma alteração em campanhas ou orçamento.
const ID_PATH='/api/v2/ads/get_product_level_campaign_id_list';
const DAILY_PATH='/api/v2/ads/get_product_campaign_daily_performance';
const SETTINGS_PATH='/api/v2/ads/get_product_level_campaign_setting_info';
const DAY=86400000;
export function parseAdsDate(value){
  const v=String(value||'').trim();
  let year,month,day;
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
    [year,month,day]=v.split('-').map(Number);
  }else if(/^\d{2}-\d{2}-\d{4}$/.test(v)){
    [day,month,year]=v.split('-').map(Number);
  }else throw Error('Informe as datas em formato válido.');
  const stamp=Date.UTC(year,month-1,day);
  const d=new Date(stamp);
  if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day)
    throw Error('Data inválida.');
  return {timestamp:stamp,api:[day,month,year].map((n,i)=>i===2?String(n):String(n).padStart(2,'0')).join('-')};
}
export function validateAdsRange(start,end,now=Date.now()){
  const a=parseAdsDate(start),b=parseAdsDate(end);
  const latest=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate());
  if(a.timestamp>=b.timestamp)throw Error('A data inicial deve ser anterior à data final. Escolha pelo menos dois dias.');
  if(b.timestamp>latest)throw Error('A data final não pode estar no futuro.');
  if(b.timestamp-a.timestamp>29*DAY)throw Error('A API permite no máximo 30 dias por consulta.');
  if(a.timestamp<latest-184*DAY)throw Error('A Shopee limita consultas de Ads aos últimos 6 meses.');
  return {start_date:a.api,end_date:b.api};
}
export function campaignIdsFromResponse(data){
  if(!Array.isArray(data?.response?.campaign_list))throw Error('A Shopee não retornou uma lista válida de campanhas.');
  return data.response.campaign_list
    .map(c=>({campaignId:String(c.campaign_id||'').trim(),adType:String(c.ad_type||'')}))
    .filter(c=>/^\d+$/.test(c.campaignId)&&c.campaignId!=='0');
}
export async function discoverShopeeCampaigns(cfg,auth,callApi){
  const found=new Map();
  for(let page=0;page<80;page++){
    const response=await callApi(cfg,{
      path:ID_PATH,accessToken:auth.accessToken,shopId:auth.shopId,
      query:{ad_type:'all',offset:page*50,limit:50}
    });
    const campaigns=campaignIdsFromResponse(response);
    for(const c of campaigns)found.set(c.campaignId,c);
    if(!response.response.has_next_page)return [...found.values()];
    if(campaigns.length===0)throw Error('Paginação da Shopee Ads não avançou; nenhuma campanha será omitida silenciosamente.');
  }
  throw Error('Limite de paginação (4.000 campanhas). A consulta não está completa.');
}
export function classifyShopeeCampaignStatus(raw){
  const normalized=String(raw??'').trim().toLowerCase();
  if(normalized==='ongoing')return 'active';
  if(['paused','ended','deleted','closed'].includes(normalized))return 'inactive';
  // scheduled não significa rodando. Informações ausentes também não.
  return 'other';
}
export function settingsFromShopeeResponse(data,expectedIds){
  const campaigns=data?.response?.campaign_list;
  if(!Array.isArray(campaigns))throw Error('Shopee não retornou configurações válidas das campanhas.');
  const allowed=new Set(expectedIds.map(x=>String(x)));
  const byId=new Map();
  for(const c of campaigns){
    const id=String(c?.campaign_id||'').trim();
    if(!allowed.has(id))continue;
    const info=c?.common_info||{};
    const status=typeof info.campaign_status==='string'?info.campaign_status.trim().toLowerCase():'';
    byId.set(id,{
      campaignId:id,
      status:status||'unknown',
      statusGroup:classifyShopeeCampaignStatus(status),
      name:String(info.ad_name||'').trim(),
      placement:String(info.campaign_placement||'').trim()
    });
  }
  return byId;
}
export async function fetchShopeeCampaignSettings(cfg,auth,callApi,discovered){
  const map=new Map();
  for(let i=0;i<discovered.length;i+=100){
    const ids=discovered.slice(i,i+100).map(x=>x.campaignId);
    const d=await callApi(cfg,{
      path:SETTINGS_PATH,accessToken:auth.accessToken,shopId:auth.shopId,
      query:{campaign_id_list:ids.join(','),info_type_list:'1'}
    });
    for(const [k,v] of settingsFromShopeeResponse(d,ids))map.set(k,v);
  }
  return map;
}
function amount(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?n:0;
}
function ratio(n,d,factor=1){return d>0?Number((n/d*factor).toFixed(4)):null;}
export function summarizeShopeeAds(performanceResponses,discovered){
  const map=new Map(discovered.map(c=>[c.campaignId,{
    campaignId:c.campaignId,adType:c.adType||'',name:'',status:'unknown',statusGroup:'other',
    expense:0,broadGmv:0,directGmv:0,clicks:0,impressions:0,
    broadOrders:0,directOrders:0,daysWithData:0
  }]));
  for(const apiData of performanceResponses){
    const sections=Array.isArray(apiData.response)?apiData.response:[apiData.response];
    for(const section of sections){
      for(const c of section?.campaign_list||[]){
        const id=String(c.campaign_id||'');
        const entry=map.get(id);
        if(!entry)continue;
        entry.name=String(c.ad_name||entry.name||'');
        entry.adType=String(c.ad_type||entry.adType);
        for(const m of c.metrics_list||[]){
          entry.expense+=amount(m.expense);
          entry.broadGmv+=amount(m.broad_gmv);
          entry.directGmv+=amount(m.direct_gmv);
          entry.clicks+=amount(m.clicks);
          entry.impressions+=amount(m.impression);
          entry.broadOrders+=amount(m.broad_order);
          entry.directOrders+=amount(m.direct_order);
          entry.daysWithData++;
        }
      }
    }
  }
  const campaigns=[...map.values()].map(c=>({
    ...c,roas:ratio(c.broadGmv,c.expense),
    acos:ratio(c.expense,c.broadGmv,100),
    cpc:ratio(c.expense,c.clicks),ctr:ratio(c.clicks,c.impressions,100),
    directRoas:ratio(c.directGmv,c.expense),
    directAcos:ratio(c.expense,c.directGmv,100)
  })).sort((a,b)=>b.expense-a.expense);
  const total=campaigns.reduce((x,c)=>{
    for(const k of ['expense','broadGmv','directGmv','clicks','impressions','broadOrders','directOrders'])
      x[k]+=c[k];
    if(c.daysWithData)x.withData++;
    return x;
  },{expense:0,broadGmv:0,directGmv:0,clicks:0,impressions:0,broadOrders:0,directOrders:0,withData:0});
  total.roas=ratio(total.broadGmv,total.expense);
  total.acos=ratio(total.expense,total.broadGmv,100);
  total.cpc=ratio(total.expense,total.clicks);
  total.ctr=ratio(total.clicks,total.impressions,100);
  return {campaigns,total,campaignCount:campaigns.length};
}
export async function loadShopeeAdsOverview(cfg,auth,callApi,{start,end}){
  const range=validateAdsRange(start,end);
  const ids=await discoverShopeeCampaigns(cfg,auth,callApi);
  // Consultar status REAL da campanha, não inferir pelo gasto/impressões passados.
  // Se a Shopee negar configurações, mostrar "status não confirmado" sem
  // classificar falsamente como ativa ou pausada.
  let settings=new Map();
  let statusWarning=null;
  if(ids.length){
    try{
      settings=await fetchShopeeCampaignSettings(cfg,auth,callApi,ids);
    }catch(err){
      statusWarning='Não foi possível confirmar os status atuais na Shopee: '+
        String(err.message||err).slice(0,220);
    }
  }
  const datasets=[];
  for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100);
    datasets.push(await callApi(cfg,{
      path:DAILY_PATH,accessToken:auth.accessToken,shopId:auth.shopId,
      query:{...range,campaign_id_list:batch.map(c=>c.campaignId).join(',')}
    }));
  }
  const summary=summarizeShopeeAds(datasets,ids);
  for(const campaign of summary.campaigns){
    const details=settings.get(campaign.campaignId);
    if(!details)continue;
    campaign.status=details.status;
    campaign.statusGroup=details.statusGroup;
    if(details.name)campaign.name=details.name;
    campaign.placement=details.placement;
  }
  const statusCounts={
    active:summary.campaigns.filter(x=>x.statusGroup==='active').length,
    inactive:summary.campaigns.filter(x=>x.statusGroup==='inactive').length,
    other:summary.campaigns.filter(x=>x.statusGroup==='other').length
  };
  return {shopId:auth.shopId,dates:{start:range.start_date,end:range.end_date},
    ...summary,statusCounts,statusWarning,
    coverage:'Campanhas de anúncios de produtos retornadas pela API Ads V2.',
    caveat:'Impressões, cliques e CTR referem-se ao período selecionado. O status é atual; histórico de desempenho não indica se uma campanha está rodando. Receita atribuída não é lucro líquido. GMV amplo pode incluir outros produtos da loja; não some GMV amplo ao direto.'};
}
