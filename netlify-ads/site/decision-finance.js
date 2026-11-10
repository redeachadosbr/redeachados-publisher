// Painel de resultado financeiro acumulado: não interfere nas regras de decisão Shopee Ads.
(()=>{
'use strict';
const core=window.RedeCampaignFinance;
const get=id=>document.getElementById(id);
if(!core||!get('resultContent')||!get('productSelect'))return;
const br=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmt=x=>String(x||'').split('-').reverse().join('/')||'—';
const css=document.createElement('style');
css.textContent=[
'.ads-finance-total{border:1px solid #52728d;border-radius:14px;background:#172839;margin-top:17px;padding:15px}',
'.ads-finance-total h3{color:#f5faff;font-size:16px;margin:0 0 6px}',
'.ads-finance-total p{font-size:12px;line-height:1.5;color:#c9dceb;margin:5px 0}',
'.ads-finance-total .finance-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}',
'.ads-finance-total .finance-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:13px}',
'.ads-finance-total .finance-kpis>div{border:1px solid #43576e;background:#111f2c;padding:10px;border-radius:10px;min-width:0}',
'.ads-finance-total small{display:block;font-size:11px;color:#abc4db;margin-bottom:6px}',
'.ads-finance-total strong.amount{font-size:18px;color:#fff;overflow-wrap:anywhere}',
'.ads-finance-total strong.amount.positive{color:#8cf0b8}',
'.ads-finance-total strong.amount.negative{color:#ffb6b7}',
'.ads-finance-total .finance-status{font-size:11px;color:#f7d6a6;margin-top:9px;line-height:1.5}',
'.ads-finance-total .finance-alert{border-left:3px solid #e9b55f;background:#392c1e;padding:10px;border-radius:7px;font-size:12px;color:#f9e5c8;margin-top:11px}',
'@media(max-width:520px){.ads-finance-total .finance-kpis{grid-template-columns:1fr}}'
].join('\n');
document.head.append(css);
const panel=document.createElement('section');
panel.className='ads-finance-total';
panel.hidden=true;
panel.setAttribute('aria-label','Resultado financeiro acumulado da campanha');
panel.innerHTML='<div class="finance-top"><h3>Resultado financeiro desde o início da campanha</h3>'+
 '<button type="button" id="financeCumulativeRetry" class="btn-secondary mini">Atualizar</button></div>'+
 '<p id="financeCumulativeRange">—</p><div class="finance-kpis">'+
 '<div><small>Investimento Ads acumulado</small><strong class="amount" id="financeSpentTotal">—</strong></div>'+
 '<div><small>Lucro dos pedidos antes de Ads</small><strong class="amount" id="financeOrderProfit">—</strong></div>'+
 '<div><small>Resultado depois de Ads</small><strong class="amount" id="financeNetTotal">—</strong></div></div>'+
 '<div class="finance-status" id="financeCumulativeStatus" role="status" aria-live="polite">—</div>'+
 '<div class="finance-alert" id="financeCumulativeAlert" hidden></div>';
get('resultContent').insertAdjacentElement('afterend',panel);
let lastReport=null,token=0,lastCache=null;
const setStatus=(text,detail)=>{
 get('financeCumulativeStatus').textContent=text;
 if(detail)get('financeCumulativeRange').textContent=detail;
};
const setValues=(spent,profit,net,partial=false)=>{
 get('financeSpentTotal').textContent=br(spent)+(partial&&spent!==null?' (parcial)':'');
 get('financeOrderProfit').textContent=br(profit);
 const output=get('financeNetTotal');
 output.textContent=br(net);
 output.className='amount'+(net===null||net===undefined?'':net<0?' negative':' positive');
};
const currentCampaign=sku=>{
 const select=get('quickCampaign');
 const picked=String(select?.value||'');
 // Nunca misturar diferentes campanhas do mesmo SKU.
 return /^\d+$/.test(picked)?picked:(typeof apiCampaignPreference==='function'?apiCampaignPreference(sku):'');
};
function showFinancialAlert(r,result){
 const candidate=r?.suggestedROAS;
 const floor=r?.fin?.minRoas;
 const proposal=candidate??r?.unlimitedRule?.candidate??null;
 const below=Number.isFinite(floor)&&proposal!==null&&proposal!==undefined&&proposal<floor;
 const actionReduction=r?.scenario===1||r?.scenario===2||
  (r?.unlimitedRule?.candidate!==null&&r?.unlimitedRule?.candidate!==undefined&&r.unlimitedRule.candidate<r.d.target);
 let warning='';
 if(actionReduction&&(below||(result.afterAds!==null&&result.afterAds<0))){
  warning='Atenção financeira: reduzir o ROAS-alvo pode aumentar a entrega e o gasto'+
   (result.afterAds!==null&&result.afterAds<0?' mesmo com prejuízo acumulado.':'.')+
   ' A recomendação conforme nossas regras permanece disponível; a decisão de aplicá-la é sua.';
 }
 get('financeCumulativeAlert').textContent=warning;
 get('financeCumulativeAlert').hidden=!warning;
}
function show(result,context,r){
 setValues(result.spent??result.knownSpend??null,result.operatingBeforeAds,result.afterAds,
  !result.spent&&result.knownSpend!==null);
 if(result.afterAds!==null){
  setStatus((result.afterAds<0?'Prejuízo':'Lucro')+
   (result.status==='confirmed'?' conciliado pela API':' calculado com dados financeiros explícitos do XLSX')+
   '. '+(context.orderCount||0)+' pedido(s) da SKU. Vendas da loja não são necessariamente atribuídas aos Ads.');
 }else setStatus('Resultado pendente. '+(result.reasons||[]).join('; ')+
  '. Ausência de dados não significa R$ 0. Repasse não é o mesmo que lucro líquido.');
 showFinancialAlert(r,result);
}
async function readJson(url,abort){
 const response=await fetch(url,{method:'GET',credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store',signal:abort});
 let data;try{data=await response.json()}catch{throw Error('O servidor não retornou JSON para '+url.split('?')[0])}
 if(!response.ok||data?.ok===false||data?.error)throw Error(String(data?.error||'Erro '+response.status).slice(0,200));
 return data;
}
const requests=async (chunks,kind,signal,ticket)=>{
 const all=[];
 for(let i=0;i<chunks.length;i++){
  if(signal.aborted||ticket!==token)throw Error('Consulta substituída.');
  const [start,end]=chunks[i];
  setStatus('Conferindo '+(kind==='ads'?'investimento Ads':'repasses e custos')+' ('+(i+1)+'/'+chunks.length+')...');
  const qs=kind==='ads'?'start_date='+encodeURIComponent(start)+'&end_date='+encodeURIComponent(end):
   'start='+encodeURIComponent(start)+'&end='+encodeURIComponent(end);
  const route=kind==='ads'?'/api/shopee/ads/overview':'/api/shopee/finance/orders';
  try{
   const data=await readJson(route+'?'+qs,signal);
   all.push({from:start,to:end,data});
  }catch(error){
   if(signal.aborted)throw error;
   all.push({from:start,to:end,data:null,error:String(error.message||error)});
  }
 }
 return all;
};
let controller=null;
async function refresh(report,{force=false}={}){
 if(report)lastReport=report;
 const r=lastReport;
 if(!r||!get('productSelect').value)return;
 panel.hidden=false;
 const sku=r.d?.sku||get('productSelect').value;
 const campaignId=currentCampaign(sku);
 const today=brazilTodayISO();
 // O dia corrente costuma ser parcial. Somente dias fechados entram no total.
 const end=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const origin=core.campaignStart(getChanges(),sku,today);
 const start=origin.start;
 const cacheKey=[sku,campaignId,start,end].join('|');
 get('financeCumulativeAlert').hidden=true;
 if(!campaignId){setValues(null,null,null);setStatus('Selecione o ID correto da campanha na consulta Ads para evitar somar campanhas diferentes.');return}
 if(!start){setValues(null,null,null);setStatus(origin.reason+' Registre o início real no histórico para obter gasto desde o início.');return}
 get('financeCumulativeRange').textContent='SKU '+sku+' · Campanha ID '+campaignId+
  ' · '+fmt(start)+' a '+fmt(end)+' (até ontem; hoje ainda não contabilizado)';
 if(start>end){setValues(null,null,null);setStatus('Campanha iniciada hoje: aguarde pelo menos dois dias completos de dados Ads.');return}
 if(!force&&lastCache?.key===cacheKey){
  show(lastCache.result,lastCache.context,r);return;
 }
 if(controller)controller.abort();
 controller=new AbortController();
 const signal=controller.signal,ticket=++token;
 setValues(null,null,null);
 try{
  const chunks=core.makeRanges(start,end,28);
  const adsResponses=await requests(chunks,'ads',signal,ticket);
  if(signal.aborted||ticket!==token)return;
  const ads=core.adSpend(adsResponses,campaignId);
  // Se a consulta da API Ads for incompleta, conservar indicação parcial.
  const financeResponses=await requests(chunks,'finance',signal,ticket);
  if(signal.aborted||ticket!==token)return;
  const rows=[],seenOrders=new Set();
  let financeCoverage=financeResponses.length===chunks.length;
  const financeProblems=[];
  for(const part of financeResponses){
   const f=part.data;
   if(!f||!Array.isArray(f.paidOrders)){
    financeCoverage=false;financeProblems.push(part.from+' a '+part.to+': '+(part.error||'pedidos não retornados'));continue;
   }
   if(f.paidOrderCoverage?.complete!==true||f.returnsCoverage?.complete!==true||
      Number(f.skippedCompleted||0)>0||f.paymentAccessWarning){
    financeCoverage=false;
    financeProblems.push(part.from+' a '+part.to+': cobertura financeira incompleta');
   }
   for(const order of f.paidOrders){
    const id=String(order?.orderSn||'');
    if(id&&!seenOrders.has(id)){seenOrders.add(id);rows.push(order)}
   }
  }
  const orders=core.orderBalance(rows,sku);
  const xlsx=window.RedeAdsFinanceXlsx?.summarize?.(sku,start,end)||null;
  const result=core.reconcile({ads,orders,financialCoverage:financeCoverage,xlsx});
  if(result.status==='pending'&&xlsx?.reason)result.reasons.push('XLSX: '+xlsx.reason);
  if(!financeCoverage)result.reasons=[...(result.reasons||[]),...financeProblems.slice(0,4)];
  if(signal.aborted||ticket!==token)return;
  lastCache={key:cacheKey,result,context:{orderCount:orders.orderCount}};
  show(result,{orderCount:orders.orderCount},r);
 }catch(error){
  if(signal.aborted||ticket!==token)return;
  setValues(null,null,null);setStatus('Cálculo financeiro pendente: '+String(error.message||error)+
   '. A recomendação Ads permanece independente.');
 }
}
get('financeCumulativeRetry').addEventListener('click',()=>refresh(null,{force:true}));
get('productSelect').addEventListener('change',()=>{token++;controller?.abort();lastReport=null;lastCache=null;panel.hidden=true});
window.RedeAdsFinance={refresh,show};
})();