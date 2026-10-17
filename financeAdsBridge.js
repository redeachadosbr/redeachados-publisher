// Relatórios de anúncios Shopee (Produtos), leitura financeira privada por mês.
// Consulta ao entrar na página Ads; não altera orçamento, campanhas ou Ads no caixa.
const re=/^\d{4}-(0[1-9]|1[0-2])$/;
export function adsMonthWindows(month,now=new Date()){
 if(!re.test(String(month)))throw Error('INVALID_ADS_MONTH');
 const [y,m]=month.split('-').map(Number);
 const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 const first=new Date(Date.UTC(y,m-1,1));
 if(first>today)throw Error('ADS_FUTURE_MONTH');
 if(first<new Date(today.getTime()-184*86400000))throw Error('ADS_PERIOD_EXPIRED');
 const lastDay=new Date(Date.UTC(y,m,0)).getUTCDate();
 const current=y===today.getUTCFullYear()&&m===today.getUTCMonth()+1;
 const maxDay=current?today.getUTCDate():lastDay;
 if(maxDay<2)return [];
 const d=(day)=>month+'-'+String(day).padStart(2,'0');
 // API exige dois dias e permite até 30 dias por consulta.
 return maxDay<=30?[{start:d(1),end:d(maxDay)}]:
  [{start:d(1),end:d(29)},{start:d(30),end:d(31)}];
}
const cents=v=>Number.isFinite(Number(v))&&Number(v)>=0?Math.round(Number(v)*100):null;
const str=v=>String(v??'').slice(0,110);
export async function buildAdsFinanceSnapshot(month,loadOverview,{now=new Date()}={}){
 const windows=adsMonthWindows(month,now);
 if(!windows.length)return {schema:'ra-ads-report-v1',platform:'shopee',month,
  status:'insufficient_period',generatedAt:new Date().toISOString(),
  expense:null,gmv:null,orders:null,roas:null,campaigns:[],
  coverage:{from:month+'-01',to:month+'-01',complete:false},
  note:'Mês ainda não possui dois dias fechados para consulta Shopee Ads.'};
 const reports=[];
 for(const range of windows)reports.push(await loadOverview(range));
 const map=new Map();let spent=0,gmv=0,orders=0;
 for(const r of reports){
  if(!Array.isArray(r.campaigns)||!r.total||cents(r.total.expense)===null)
   throw Error('INVALID_SHOPEE_ADS_REPORT');
  spent+=cents(r.total.expense);
  gmv+=cents(r.total.broadGmv)||0;
  orders+=Number.isFinite(Number(r.total.broadOrders))?Math.max(0,Number(r.total.broadOrders)):0;
  for(const c of r.campaigns){
   const id=str(c.campaignId);
   if(!/^\d+$/.test(id))continue;
   const row=map.get(id)||{campaignId:id,name:str(c.name),adType:str(c.adType),
    status:str(c.status),expense:0,gmv:0,orders:0};
   row.expense+=cents(c.expense)||0;
   row.gmv+=cents(c.broadGmv)||0;
   row.orders+=Number.isFinite(Number(c.broadOrders))?Math.max(0,Number(c.broadOrders)):0;
   if(c.name)row.name=str(c.name);
   if(c.status)row.status=str(c.status);
   map.set(id,row);
  }
 }
 const spend=spent/100,commercialGmv=gmv/100;
 return {schema:'ra-ads-report-v1',platform:'shopee',month,
  status:'confirmed',generatedAt:new Date().toISOString(),
  expense:spend,gmv:commercialGmv,orders,roas:spend>0?Math.round(commercialGmv/spend*100)/100:null,
  campaigns:[...map.values()].map(c=>({...c,expense:c.expense/100,gmv:c.gmv/100}))
   .sort((a,b)=>b.expense-a.expense).slice(0,100),
  coverage:{from:windows[0].start,to:windows.at(-1).end,complete:true},
  note:'Somente anúncios de produtos Shopee Ads V2. GMV amplo atribuído não representa lucro; campanha GMV Max de loja ou outros tipos podem ficar fora.'};
}
