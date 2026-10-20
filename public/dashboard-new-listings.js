// Dashboard new ad counts. Read-only and derived ONLY from Shopee create_time.
// Keep it independent from the large catalog page and its update timestamps.
(()=>{
 'use strict';
 let inFlight=null,lastFetch=0,lastDate='',lastShop='';
 const $=id=>document.getElementById(id);
 const number=n=>Number(n).toLocaleString('pt-BR');
 const status=(message)=>{if($('dashboardNewListingsUpdated'))$('dashboardNewListingsUpdated').textContent=message;};
 const todayKey=()=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const map=Object.fromEntries(parts.filter(p=>['year','month','day'].includes(p.type))
   .map(p=>[p.type,p.value]));
  return map.year+'-'+map.month+'-'+map.day;
 };
 const value=(id,n)=>{const el=$(id);if(el)el.textContent=Number.isInteger(n)&&n>=0?number(n):'—';};
 const element=(tag,klass,label)=>{
  const node=document.createElement(tag);
  if(klass)node.className=klass;
  if(label!==undefined)node.textContent=label;
  return node;
 };
 function paintHistory(rootId,data,maxCap){
  const root=$(rootId);if(!root)return;
  root.replaceChildren();
  const items=Array.isArray(data)?data:[];
  if(!items.length){root.append(element('span','','Sem histórico disponível.'));return;}
  const max=Math.max(1,...items.map(x=>Number(x.count)||0));
  for(const item of items){
   const count=Math.max(0,Number(item.count)||0);
   const cell=element('div','dashboard-new-listings-history-item');
   const label=element('span','dashboard-new-listings-history-label',String(item.label||''));
   const track=element('div','dashboard-new-listings-history-track');
   const fill=element('span','dashboard-new-listings-history-fill');
   fill.style.width=count===0?'0%':String(Math.max(5,Math.round(count/max*100)))+'%';
   track.append(fill);
   const value=element('strong','',number(count));
   cell.append(label,track,value);root.append(cell);
  }
 }
 function draw(data){
  if(!data?.ok||!Number.isInteger(data.today)||!Number.isInteger(data.month)||!Number.isInteger(data.year))
   throw Error('A API não confirmou os totais de cadastros.');
  value('dashboardNewListingsToday',data.today);
  value('dashboardNewListingsMonth',data.month);
  value('dashboardNewListingsYear',data.year);
  $('dashboardNewListingsDayLabel').textContent=data.dayKey?.split('-').reverse().join('/')||'Hoje';
  const monthTitle=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'})
   .format(new Date((data.monthKey||'2026-01')+'-15T12:00:00Z'));
  $('dashboardNewListingsMonthLabel').textContent=monthTitle;
  $('dashboardNewListingsYearLabel').textContent=String(data.yearKey||'Ano atual');
  paintHistory('dashboardNewListingsDays',data.last7);
  paintHistory('dashboardNewListingsMonths',data.byMonth);
  const checked=data.checkedAt?new Date(data.checkedAt):new Date();
  status('Atualizado às '+checked.toLocaleTimeString('pt-BR',{
   timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}));
  $('dashboardNewListingsFootnote').textContent=
   'Dados da criação original dos anúncios pela API Shopee. Cada item é contado uma vez. '+
   'Inclui anúncios ainda existentes (ativos e inativos); não inclui anúncios removidos. Fuso: Brasília.';
 }
 async function load(force=false){
  if(!$('dashboardNewListings'))return;
  const day=todayKey();
  if(inFlight)return inFlight;
  if(!force&&lastDate===day&&Date.now()-lastFetch<15*60*1000)return;
  status('Consultando datas de criação na Shopee...');
  inFlight=(async()=>{
   try{
    const response=await fetch('/api/shopee/dashboard/new-listings',{
     credentials:'same-origin',cache:'no-store',
     signal:AbortSignal.timeout(150000),
     headers:{Accept:'application/json'}
    });
    const body=await response.json().catch(()=>null);
    if(!response.ok)throw Error(body?.error||'Consulta de anúncios indisponível.');
    if(!body?.ok)throw Error('A Shopee não confirmou os dados solicitados.');
    draw(body);
    lastFetch=Date.now();lastDate=day;lastShop=String(body.shopId||'');
   }catch(error){
    status('Não foi possível conferir os novos anúncios.');
    for(const id of ['dashboardNewListingsToday','dashboardNewListingsMonth','dashboardNewListingsYear'])
     value(id,null);
    for(const id of ['dashboardNewListingsDays','dashboardNewListingsMonths']){
     const node=$(id);if(node)node.replaceChildren(
      element('span','', 'A contagem estará disponível quando a consulta Shopee for concluída.'));
    }
    $('dashboardNewListingsFootnote').textContent=String(error?.message||'Erro na consulta')+
     ' Nenhum número estimado foi utilizado.';
    lastFetch=0;lastDate='';
   }finally{inFlight=null;}
  })();
  return inFlight;
 }
 window.dashboardNewListingsLoad=load;
})();
