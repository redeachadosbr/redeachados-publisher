// Rede Achados BR | histórico Ads compreensível, somente leitura.
(()=>{
'use strict';
const $id=id=>document.getElementById(id);
const DAY=86400000;
const from=s=>Date.parse(s+'T12:00:00Z');
const shift=(s,n)=>new Date(from(s)+n*DAY).toISOString().slice(0,10);
const days=(a,b)=>Math.round((from(b)-from(a))/DAY)+1;
const fmtDate=x=>x.split('-').reverse().join('/');
const fmtNumber=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const fmtMoney=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtPct=n=>n===null?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const fmtRoas=n=>n===null?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'x';
const clean=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const saoPauloDate=value=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const x=Object.fromEntries(p.filter(v=>v.type!=='literal').map(v=>[v.type,v.value]));
 return x.year+'-'+x.month+'-'+x.day;
};
const today=()=>saoPauloDate(Date.now());
const style=document.createElement('style');
style.textContent=[
'.ads-timeline{margin-bottom:22px;padding:20px;border:1px solid #49627d;border-radius:16px;background:linear-gradient(125deg,#202b3a,#151d28)}',
'.ads-timeline h3{margin:6px 0;font-size:21px;color:#f5f9ff}.ads-timeline p{color:#b9cce0;margin:5px 0;font-size:12px}',
'.ads-timeline-kicker{font-size:11px;font-weight:800;color:#95d5ff;letter-spacing:1px}',
'.ads-timeline-fields{display:grid;grid-template-columns:2fr 1.5fr 1fr 1fr auto;gap:10px;margin:18px 0 12px;align-items:end}',
'.ads-timeline-fields label{font-size:12px;color:#cedce8;display:grid;gap:5px}',
'.ads-timeline-fields select,.ads-timeline-fields input{width:100%;border-radius:9px;border:1px solid #526477;background:#101923;color:#f7fbff;padding:10px}',
'.ads-timeline-fields button{white-space:nowrap;min-height:41px}',
'.ads-timeline-message{padding:11px 13px;border-radius:9px;background:#1a2736;border:1px solid #3f5469;font-size:12px;color:#d2e0ed}',
'.ads-timeline-message.error{background:#3b252b;border-color:#90505b;color:#ffbec6}',
'.ads-timeline-message.done{background:#1f382f;border-color:#4d836c;color:#b1f5d8}',
'.ads-timeline-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}',
'.ads-timeline-kpis div{background:#121c29;border:1px solid #384d63;border-radius:11px;padding:13px}',
'.ads-timeline-kpis small{display:block;font-size:11px;color:#b2c5d5}.ads-timeline-kpis strong{font-size:19px;color:#f8fcff}',
'.ads-period{border:1px solid #405166;background:#131e2b;border-radius:12px;margin-top:12px;overflow:hidden}',
'.ads-period-head{padding:13px 15px;display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #314458}',
'.ads-period-head strong{display:block;font-size:14px;color:#fff}.ads-period-head small{display:block;color:#adc0d3;font-size:11px;margin-top:3px}',
'.ads-period-tag{align-self:flex-start;padding:4px 9px;border-radius:99px;background:#3c4652;color:#e5f1ff;font-size:11px;font-weight:700}',
'.ads-period-tag.good{background:#1e483c;color:#b5f4d4}.ads-period-tag.warn{background:#503d25;color:#f4d296}.ads-period-tag.bad{background:#522d34;color:#ffc1c5}',
'.ads-period-body{padding:14px 15px}.ads-period-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}',
'.ads-period-grid span{font-size:11px;color:#acbfd0}.ads-period-grid b{display:block;font-size:15px;color:#fff}',
'.ads-period-diagnosis{margin-top:12px;font-size:12px;color:#d9e7f7;background:#1d2c3e;border-left:3px solid #87bfe8;padding:10px 12px;border-radius:5px}',
'.ads-timeline-changes{margin-top:17px;border-top:1px solid #455569;padding-top:12px;color:#c7d8e9;font-size:12px}',
'.ads-timeline-changes div{padding:7px 0;border-bottom:1px solid #2c3d50}.ads-timeline-changes strong{color:#fff}',
'@media(max-width:1050px){.ads-timeline-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.ads-timeline-fields button{grid-column:1/-1}.ads-period-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}',
'@media(max-width:600px){.ads-timeline{padding:14px}.ads-timeline-fields{grid-template-columns:1fr}.ads-timeline-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ads-period-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'
].join('\n');
document.head.append(style);
const host=$id('changeHistoryPanel');
if(!host)return;
const wrap=document.createElement('section');
wrap.className='ads-timeline';
wrap.setAttribute('aria-label','Comparativo histórico após alterações');
wrap.innerHTML='<div class="ads-timeline-kicker">HISTÓRICO VISUAL • POR PRODUTO</div>'+
 '<h3>O que mudou depois de cada alteração?</h3><p>Compare períodos do mesmo produto e da mesma campanha. Sem misturar datas ou campanhas diferentes.</p>'+
 '<div class="ads-timeline-fields">'+
 '<label>Produto / SKU<select id="adsTlSku"><option value="">Escolha um produto</option></select></label>'+
 '<label>Campanha / ID<select id="adsTlCampaign"><option value="">Identificar pela API</option></select></label>'+
 '<label>Data inicial<input id="adsTlStart" type="date"></label>'+
 '<label>Data final<input id="adsTlEnd" type="date"></label>'+
 '<button type="button" id="adsTlRun" class="btn-primary mini">Analisar histórico</button></div>'+
 '<div id="adsTlStatus" class="ads-timeline-message" role="status" aria-live="polite">Selecione um produto e consulte. Nenhuma campanha será alterada.</div>'+
 '<div id="adsTlOutput" hidden><div id="adsTlKpis" class="ads-timeline-kpis"></div><div id="adsTlPeriods"></div>'+
 '<div id="adsTlChanges" class="ads-timeline-changes"></div>'+
 '<p style="margin-top:13px">As mudanças passam a valer para a comparação no <strong>dia seguinte</strong> ao registro. Correlação temporal não prova que a alteração causou o resultado. A API Ads informa pedidos atribuídos, não unidades efetivamente vendidas: estas exigem conferência com a planilha de pedidos da Shopee.</p></div>';
host.prepend(wrap);
const e=id=>wrap.querySelector('#'+id);
const msg=(value,type='')=>{e('adsTlStatus').className='ads-timeline-message '+type;e('adsTlStatus').textContent=value};
let running=false;
function fillProducts(){
 const current=e('adsTlSku').value;
 const products=readProducts();
 e('adsTlSku').innerHTML='<option value="">Selecione um produto</option>'+
  products.map(p=>'<option value="'+clean(p.sku)+'">'+clean(p.sku+' · '+p.name)+'</option>').join('');
 const choose=[current,$id('changeFilter')?.value,$id('productSelect')?.value].find(x=>products.some(p=>p.sku===x));
 if(choose)e('adsTlSku').value=choose;
}
function selectDates(){
 const now=today(),earliest=shift(now,-179),sku=e('adsTlSku').value;
 const changes=getChanges().filter(x=>x.sku===sku).map(x=>saoPauloDate(x.timestamp)).sort();
 const userStart=$id('dateStart')?.value||changes[0]||earliest;
 e('adsTlStart').max=now;e('adsTlEnd').max=now;
 e('adsTlStart').value=userStart<earliest?earliest:userStart>now?earliest:userStart;
 e('adsTlEnd').value=now;
}
function changesIn(sku,start,end){
 return getChanges().filter(c=>c.sku===sku&&saoPauloDate(c.timestamp)>=start&&saoPauloDate(c.timestamp)<=end)
  .sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
}
function splitPeriods(start,end,changes){
 const byDate=new Map();
 for(const item of changes){const d=saoPauloDate(item.timestamp);if(!byDate.has(d))byDate.set(d,[]);byDate.get(d).push(item)}
 const periods=[];let at=start,lastChanges=[];
 for(const [date,items] of [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
  if(at<=date)periods.push({start:at,end:date,changes:lastChanges});
  at=shift(date,1);lastChanges=items;
 }
 if(at<=end)periods.push({start:at,end,changes:lastChanges});
 return periods;
}
function windows(start,end){
 const len=days(start,end);
 if(len<2)return [];
 const count=Math.ceil(len/30),base=Math.floor(len/count),extra=len%count,results=[];
 let at=start;
 for(let i=0;i<count;i++){
  const endPart=shift(at,base+(i<extra?1:0)-1);
  results.push([at,endPart]);at=shift(endPart,1);
 }
 return results;
}
function combine(campaigns,period){
 const a={impressions:0,clicks:0,expense:0,broadGmv:0,broadOrders:0,
  days:days(period.start,period.end),daysWithData:0,ordersObserved:false};
 for(const c of campaigns){
  for(const k of ['impressions','clicks','expense','broadGmv','broadOrders','daysWithData'])a[k]+=Number(c[k])||0;
  a.ordersObserved=a.ordersObserved||c.broadOrdersObserved===true;
 }
 a.ctr=a.impressions?a.clicks/a.impressions*100:null;
 a.roas=a.expense?a.broadGmv/a.expense:null;
 return a;
}
function verdict(a,b){
 if(a.days<3||a.daysWithData===0||a.clicks<10)return ['Acompanhar','warn','Amostra ainda pequena. Não dá para afirmar que a alteração melhorou ou piorou a campanha.'];
 if(a.clicks>=20&&a.ordersObserved&&a.broadOrders===0)return ['Rever conversão','bad','Cliques sem pedidos atribuídos. Confira preço, frete, capa, descrição e atraso de atribuição.'];
 if(a.expense>0&&a.broadGmv===0)return ['Gasto sem receita','bad','Houve gasto sem receita atribuída no período. Revise margem e competitividade antes de ampliar Ads.'];
 if(b&&b.days>=3&&b.daysWithData>0&&a.roas!==null&&b.roas!==null){
  if(a.roas>b.roas*1.15)return ['ROAS subiu','good','ROAS maior que no período anterior. Compare também pedidos por dia e cliques, sem atribuir a melhora só à mudança.'];
  if(a.roas<b.roas*.85)return ['ROAS caiu','bad','ROAS menor que no período anterior. Revise custo, oferta e outras mudanças simultâneas.'];
 }
 return ['Observando','', 'Sem variação suficiente para uma conclusão. Acompanhe mais dias antes de ajustar orçamento ou ROAS.'];
}
function metric(name,value){return '<span>'+clean(name)+'<b>'+clean(value)+'</b></span>'}
function comparison(a,b){
 if(!b||a.days<2||b.days<2||!a.daysWithData||!b.daysWithData)return 'Sem período anterior comparável.';
 const parts=[];
 if(a.roas!==null&&b.roas!==null&&b.roas>0)
  parts.push('ROAS '+(a.roas/b.roas>=1?'+':'')+((a.roas/b.roas-1)*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%');
 if(b.clicks>0)parts.push('Cliques por dia '+(a.clicks/a.days/(b.clicks/b.days)*100-100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%');
 return parts.join(' · ')||'Sem base suficiente para variação.';
}
function show(periods,changes,id){
 const latest=periods.at(-1).metrics;
 e('adsTlKpis').innerHTML=[['ID da campanha',id],['Gasto no último período',fmtMoney(latest.expense)],
  ['ROAS no último período',fmtRoas(latest.roas)],['Pedidos atribuídos',latest.ordersObserved?fmtNumber(latest.broadOrders):'Não informado']]
  .map(([name,value])=>'<div><small>'+clean(name)+'</small><strong>'+clean(value)+'</strong></div>').join('');
 let prior=null;
 e('adsTlPeriods').innerHTML=periods.map((p,index)=>{
  const a=p.metrics,v=verdict(a,prior),header=index===0?'Período inicial':'Após '+p.changes.map(c=>c.changes.join(' + ')).join(' · ');
  const body=['Impressões','Cliques','CTR','Investimento','ROAS','Pedidos atribuídos'];
  const values=[fmtNumber(a.impressions),fmtNumber(a.clicks),fmtPct(a.ctr),fmtMoney(a.expense),fmtRoas(a.roas),a.ordersObserved?fmtNumber(a.broadOrders):'Não informado'];
  const details='<div class="ads-period-grid">'+body.map((x,i)=>metric(x,values[i])).join('')+'</div>';
  const delta=comparison(a,prior);
  const card='<article class="ads-period"><div class="ads-period-head"><div><strong>'+clean(header)+'</strong><small>'+
   clean(fmtDate(p.start)+' a '+fmtDate(p.end)+' · '+a.days+' dia(s) · campanha '+id)+
   '</small></div><span class="ads-period-tag '+v[1]+'">'+clean(v[0])+'</span></div>'+
   '<div class="ads-period-body">'+details+'<div class="ads-period-diagnosis"><strong>Diagnóstico:</strong> '+clean(v[2])+
   '<br><small>Comparação: '+clean(delta)+'</small></div></div></article>';
  if(a.daysWithData>0&&a.days>=2)prior=a;
  return card;
 }).join('');
 e('adsTlChanges').innerHTML='<strong>Alterações registradas ('+changes.length+')</strong>'+
 (changes.length?changes.map(x=>'<div>'+clean(fmtDate(saoPauloDate(x.timestamp)))+' · <strong>'+
   clean(x.changes.join(' + '))+'</strong> · '+clean(x.note||'Sem observação')+'</div>').join(''):
  '<div>Nenhuma alteração salva neste intervalo.</div>');
 e('adsTlOutput').hidden=false;
}
async function run(){
 if(running)return;
 const sku=e('adsTlSku').value,product=readProducts().find(x=>x.sku===sku);
 if(!product){msg('Escolha um produto cadastrado.','error');return}
 if(!apiReadAccess()){msg('Abra o Decisor no Render e faça login para consultar a API.','error');return}
 let start=e('adsTlStart').value,end=e('adsTlEnd').value,now=today(),minimum=shift(now,-179);
 if(!start||!end||start>end||end>now){msg('Informe um período válido até hoje.','error');return}
 let limitNote='';
 if(start<minimum){start=minimum;e('adsTlStart').value=start;limitNote='Consulta limitada aos últimos 6 meses disponíveis pela API. '}
 if(days(start,end)<2){msg('Selecione no mínimo dois dias.','error');return}
 running=true;e('adsTlRun').disabled=true;e('adsTlOutput').hidden=true;
 try{
  msg('Identificando campanha do SKU na API Shopee...');
  const probeStart=shift(end,-Math.min(7,days(start,end)-1));
  const probe=await apiOverview(probeStart,end);
  const norm=x=>String(x||'').trim().toLocaleLowerCase('pt-BR');
  const exact=probe.campaigns.filter(c=>norm(c.productSku)===norm(sku)&&sku);
  const possible=exact.length?exact:probe.campaigns.filter(c=>norm(product.name)&&
   (norm(c.productTitle).includes(norm(product.name))||norm(c.name).includes(norm(product.name))));
  if(!possible.length)throw Error('Campanha não localizada. Confira o SKU e o vínculo do produto na Shopee.');
  const campaignSelector=e('adsTlCampaign'),preferred=campaignSelector.value||apiCampaignPreference(sku);
  campaignSelector.innerHTML='<option value="">Selecione o ID da campanha</option>'+possible.map(c=>
    '<option value="'+clean(c.campaignId)+'">ID '+clean(c.campaignId)+' · '+clean(c.productTitle||c.name||sku)+'</option>').join('');
  if(possible.length===1&&exact.length===1)campaignSelector.value=String(possible[0].campaignId);
  else if(possible.some(c=>String(c.campaignId)===preferred))campaignSelector.value=preferred;
  if(!campaignSelector.value){
   msg((exact.length?'Há várias campanhas. ':'Correspondência por nome: confirme a campanha correta. ')+
    'Selecione o ID e clique novamente em Analisar histórico.','error');return;
  }
  const campaignId=campaignSelector.value;rememberApiCampaign(sku,campaignId);
  const changes=changesIn(sku,start,end),periods=splitPeriods(start,end,changes);
  const total=periods.reduce((sum,p)=>sum+windows(p.start,p.end).length,0);
  if(total>20)throw Error('Muitas mudanças em datas próximas. Analise um intervalo menor para evitar consultas excessivas.');
  let counter=0;
  for(const period of periods){
   const responses=[];
   for(const [a,b] of windows(period.start,period.end)){
    msg('Consultando '+fmtDate(a)+' a '+fmtDate(b)+' · '+(++counter)+' de '+total+' períodos de leitura...');
    const data=await apiOverview(a,b);
    if(data.dateAdjustment?.shiftedDays)throw Error('A Shopee ainda não liberou todos os dias deste período. Escolha uma data final anterior.');
    const campaign=data.campaigns.find(c=>String(c.campaignId)===campaignId);
    if(!campaign)throw Error('Campanha '+campaignId+' não retornou entre '+fmtDate(a)+' e '+fmtDate(b)+'.');
    responses.push(campaign);apiStoreOne(campaign,sku,a,b);
   }
   period.metrics=combine(responses,period);
  }
  show(periods,changes,campaignId);
  msg(limitNote+'Análise concluída: '+periods.length+' período(s), '+changes.length+' alteração(ões), campanha '+campaignId+'. Nenhuma alteração enviada à Shopee.','done');
 }catch(err){msg('Não foi possível concluir: '+String(err.message||err),'error')}
 finally{running=false;e('adsTlRun').disabled=false}
}
fillProducts();selectDates();
e('adsTlSku').addEventListener('change',()=>{e('adsTlCampaign').innerHTML='<option value="">Identificar pela API</option>';selectDates();e('adsTlOutput').hidden=true});
e('adsTlRun').addEventListener('click',run);
$id('saveChangeBtn')?.addEventListener('click',()=>{queueMicrotask(()=>{fillProducts();e('adsTlOutput').hidden=true})});
$id('changeFilter')?.addEventListener('change',()=>{
 const sku=$id('changeFilter').value;
 if(sku&&readProducts().some(p=>p.sku===sku)&&e('adsTlSku').value!==sku){
  e('adsTlSku').value=sku;selectDates();e('adsTlCampaign').innerHTML='<option value="">Identificar pela API</option>';e('adsTlOutput').hidden=true;
 }
});
})();