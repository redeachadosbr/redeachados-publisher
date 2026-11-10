// Resultado Ads simplificado — apenas gasto API + lucro ANTES de Ads informado manualmente.
// Não chama API Payment/Returns nem interfere nas 5 regras de decisão.
(()=>{
'use strict';
const core=window.RedeCampaignFinance;
const get=id=>document.getElementById(id);
if(!core||!get('resultContent')||!get('productSelect'))return;
const keyName='redeachados_ads_lucro_manual_v1';
const br=v=>v===null||v===undefined?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmt=x=>String(x||'').split('-').reverse().join('/');
function parseMoney(raw){
 const rawText=String(raw??'').trim();
 if(!rawText)return {state:'empty',value:null};
 let t=rawText.replace(/R\$/gi,'').replace(/\s/g,'');
 if(/^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(t))
  t=t.replace(/\./g,'').replace(',','.');
 else if(/^-?\d+(?:,\d{1,2})?$/.test(t))t=t.replace(',','.');
 else if(!/^-?\d+\.\d{1,2}$/.test(t))return {state:'invalid',value:null};
 const n=Number(t);
 if(!Number.isFinite(n)||Math.abs(n)>100000000||!Number.isSafeInteger(Math.round(n*100)))
  return {state:'invalid',value:null};
 return {state:'valid',value:Math.round(n*100)/100};
}
function getSaved(key){
 try{
  const x=JSON.parse(localStorage.getItem(keyName)||'{}');
  const v=x[key];return v===undefined||v===null?'':String(v);
 }catch{return ''}
}
function saveValue(key,amount){
 if(!key)return false;
 try{
  const x=JSON.parse(localStorage.getItem(keyName)||'{}');
  if(amount===null)delete x[key];else x[key]=amount;
  const keys=Object.keys(x);for(const k of keys.slice(0,Math.max(0,keys.length-300)))delete x[k];
  localStorage.setItem(keyName,JSON.stringify(x));
  return true;
 }catch{return false}
}
const css=document.createElement('style');
css.textContent=[
 '.ads-finance-total{margin-top:16px;padding:15px;border:1px solid #4d7090;border-radius:13px;background:#182a3c}',
 '.ads-finance-total h3{font-size:15px;color:#f7fbff;margin:0}',
 '.ads-finance-total .top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
 '.ads-finance-total p{font-size:12px;color:#bfd1e5;line-height:1.5;margin:7px 0}',
 '.ads-finance-total .cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}',
 '.ads-finance-total .cell{border:1px solid #39536b;border-radius:9px;background:#111e2b;padding:10px;min-width:0}',
 '.ads-finance-total .cell label,.ads-finance-total .cell small{display:block;font-size:11px;color:#bed1e4;margin-bottom:7px}',
 '.ads-finance-total .value{font-size:21px;font-weight:800;color:#fff;overflow-wrap:anywhere}',
 '.ads-finance-total input{width:100%;border:1px solid #738ea7;border-radius:8px;background:#091621;color:#fff;padding:10px 7px;font-size:17px;font-weight:750;min-width:0}',
 '.ads-finance-total input:disabled{opacity:.55}',
 '.ads-finance-total .positive{color:#97edb8}',
 '.ads-finance-total .negative{color:#ffb3b3}',
 '.ads-finance-total .result-status{font-size:12px;color:#d3e1f1;margin-top:10px}',
 '.ads-finance-total .warn{color:#ffd99a;font-size:12px;margin-top:10px}',
 '@media(max-width:560px){.ads-finance-total .cols{grid-template-columns:1fr}}'
].join('\n');document.head.append(css);
const panel=document.createElement('section');
panel.className='ads-finance-total';panel.hidden=true;
panel.setAttribute('aria-label','Resultado financeiro acumulado simplificado');
panel.innerHTML='<div class="top"><h3>Resultado financeiro desde o início da campanha</h3>'+
 '<button type="button" class="btn-secondary mini" id="financeCumulativeRetry">Atualizar Ads</button></div>'+
 '<p id="financeCumulativeRange">Campanha não consultada.</p>'+
 '<div class="cols"><div class="cell"><small>Investimento Ads acumulado</small>'+
 '<div class="value" id="financeSpentTotal">—</div></div>'+
 '<div class="cell"><label for="financeManualProfit">Lucro dos pedidos antes de Ads (R$)</label>'+
 '<input id="financeManualProfit" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 120,00" disabled>'+
 '</div><div class="cell"><small>Resultado depois de Ads</small>'+
 '<div class="value" id="financeNetTotal">—</div></div></div>'+
 '<p id="financeManualHelp">Informe o lucro total dos pedidos, já descontados os custos e taxas, mas ANTES dos Ads, para o mesmo período acumulado.</p>'+
 '<p class="result-status" id="financeCumulativeStatus" role="status" aria-live="polite">Consulte a campanha pela API.</p>'+
 '<p class="warn" id="financeCumulativeAlert" hidden></p>';
get('resultContent').insertAdjacentElement('afterend',panel);
const input=get('financeManualProfit'),spentText=get('financeSpentTotal'),netText=get('financeNetTotal');
const label=get('financeCumulativeRange'),status=get('financeCumulativeStatus'),alert=get('financeCumulativeAlert');
let lastReport=null,currentKey='',lastCache=null,inflight='',controller=null,token=0,ads=null;
let lastSaveWorked=true;
const setStatus=text=>{status.textContent=text};
const currentCampaign=sku=>{
 const filled=typeof lastAdsFilledCampaignKey==='string'?lastAdsFilledCampaignKey:'';
 const i=filled.lastIndexOf('|'),matched=i>=1&&filled.slice(0,i)===sku?filled.slice(i+1):'';
 return /^\d+$/.test(matched)?matched:'';
};
function updateResult(){
 const entry=parseMoney(input.value),profit=entry.value;
 const spend=ads?.spent??null;
 netText.className='value';
 alert.hidden=true;alert.textContent='';
 if(entry.state==='invalid'){
  netText.textContent='—';setStatus('Confira o lucro informado. Use, por exemplo, 120,50 ou -10,00.');return;
 }
 if(spend===null){
  netText.textContent='—';
  setStatus(ads?.complete===false?'Gasto Ads incompleto. O resultado não será calculado com valor parcial.':
   'Consultando o gasto Ads acumulado na Shopee...');
  return;
 }
 if(entry.state==='empty'){
  netText.textContent='—';
  setStatus('Gasto Ads confirmado. Digite o lucro antes de Ads para calcular o resultado.');
  return;
 }
 const net=Math.round((profit-spend)*100)/100;
 netText.textContent=br(net);netText.className='value '+(net<0?'negative':net>0?'positive':'');
 const situation=net<0?'Prejuízo':net>0?'Lucro':'Resultado zerado';
 setStatus(situation+' acumulado: '+br(net)+'. Valor dos pedidos informado manualmente.'+
  (lastSaveWorked?'':' Atenção: não foi possível salvar o valor neste navegador.'));
 const r=lastReport,reduce=r?.scenario===1||r?.scenario===2||
  (r?.unlimitedRule?.candidate!==null&&r?.unlimitedRule?.candidate!==undefined&&r.unlimitedRule.candidate<r.d.target);
 if(net<0&&reduce){
  alert.textContent='Atenção: baixar o ROAS-alvo pode aumentar o gasto. A recomendação da regra Ads continua disponível.';
  alert.hidden=false;
 }
}
function fillManualForKey(key){
 if(currentKey===key)return;
 currentKey=key;
 input.value=getSaved(key);
 input.disabled=false;
 lastSaveWorked=true;
}
input.addEventListener('input',()=>{
 if(!currentKey)return;
 const x=parseMoney(input.value);
 lastSaveWorked=x.state==='invalid'?false:saveValue(currentKey,x.value);
 updateResult();
});
input.addEventListener('blur',()=>{
 const x=parseMoney(input.value);
 if(x.state==='valid')input.value=x.value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
});
async function readAds(start,end,id,signal,ticket){
 const chunks=core.makeRanges(start,end,28);
 const all=[];
 for(let i=0;i<chunks.length;i++){
  if(signal.aborted||ticket!==token)throw Error('Consulta cancelada');
  const [from,to]=chunks[i];
  setStatus('Lendo investimento Ads ('+(i+1)+'/'+chunks.length+')...');
  const url='/api/shopee/ads/overview?start_date='+encodeURIComponent(from)+'&end_date='+encodeURIComponent(to);
  try{
   const response=await fetch(url,{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store',signal});
   let data;try{data=await response.json()}catch{throw Error('Resposta da Shopee não é JSON')}
   if(!response.ok||data?.ok===false||data?.error)throw Error(String(data?.error||'Falha '+response.status));
   all.push({from,to,data});
  }catch(error){
   if(signal.aborted)throw error;
   all.push({from,to,error:String(error.message||error),data:null});
  }
 }
 return core.adSpend(all,id);
}
async function refresh(report,{force=false}={}){
 if(report)lastReport=report;
 const r=lastReport,sku=r?.d?.sku||get('productSelect').value;
 if(!sku)return;
 panel.hidden=false;
 const id=currentCampaign(sku);
 const today=typeof brazilTodayISO==='function'?brazilTodayISO():'';
 const end=today?new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10):'';
 const origin=core.campaignStart(getChanges(),sku,today),start=origin.start;
 if(!id||!start||!end||start>=end){
  controller?.abort();token++;inflight='';lastCache=null;ads=null;
  currentKey='';input.value='';input.disabled=true;
  spentText.textContent='—';netText.textContent='—';
  label.textContent='SKU '+sku+' · campanha a confirmar';
  setStatus(!id?'Consulte os Ads nas datas manuais para identificar a campanha.':
   !start?origin.reason:'Ainda não existem dois dias completos para somar os Ads.');
  alert.hidden=true;return;
 }
 const key=[sku,id,start,end].join('|');
 const changed=key!==currentKey;
 if(changed){ads=null;spentText.textContent='—';netText.textContent='—';}
 fillManualForKey(key);
 label.textContent='SKU '+sku+' · Campanha '+id+' · '+fmt(start)+' a '+fmt(end)+' (até ontem)';
 if(!force&&lastCache?.key===key){
  ads=lastCache.ads;spentText.textContent=ads.spent===null?(ads.knownSpend===null?'—':br(ads.knownSpend)+' (parcial)'):br(ads.spent);
  updateResult();return;
 }
 if(!force&&inflight===key)return;
 if(controller)controller.abort();
 controller=new AbortController();
 const signal=controller.signal,ticket=++token;
 inflight=key;
 ads=null;spentText.textContent='—';updateResult();
 try{
  const result=await readAds(start,end,id,signal,ticket);
  if(signal.aborted||ticket!==token)return;
  ads=result;
  lastCache={key,ads:result};
  spentText.textContent=result.spent!==null?br(result.spent):
   result.knownSpend===null?'—':br(result.knownSpend)+' (parcial)';
  updateResult();
  if(!result.complete){
   setStatus('Gasto Ads incompleto em '+result.missing.length+' bloco(s). Não é possível calcular um resultado final.');
  }
 }catch(error){
  if(signal.aborted||ticket!==token)return;
  ads=null;spentText.textContent='—';netText.textContent='—';
  setStatus('Não foi possível consultar o gasto Ads: '+String(error.message||error).slice(0,200));
 }finally{
  if(ticket===token)inflight='';
 }
}
get('financeCumulativeRetry').addEventListener('click',()=>refresh(null,{force:true}));
get('productSelect').addEventListener('change',()=>{
 controller?.abort();token++;inflight='';lastCache=null;lastReport=null;ads=null;
 currentKey='';input.value='';input.disabled=true;panel.hidden=true;
});
window.RedeAdsFinance={refresh,parseMoney};
})();