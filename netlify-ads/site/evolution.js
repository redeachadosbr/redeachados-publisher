/* Rede Achados BR - Evolução de campanhas por fases.
   Somente leitura da API. Nunca mistura IDs ou soma períodos sobrepostos. */
(()=>{
'use strict';
const e=id=>document.getElementById(id);
const asNumber=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const safeText=v=>safe(String(v??''));
const formatNumber=n=>n===null||!Number.isFinite(n)?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:0});
const showDate=iso=>iso?iso.split('-').reverse().join('/'):'—';
let lastSku='',cached=null,busy=false,requestVersion=0;
function productChanges(sku){
 return getChanges().filter(x=>x.sku===sku&&historyBrazilDate(x.timestamp))
  .sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
}
function groupChanges(changes){
 const map=new Map();
 for(const c of changes){
  const day=historyBrazilDate(c.timestamp),current=map.get(day)||[];
  current.push(c);map.set(day,current);
 }
 return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,records])=>({
   date,records,labels:[...new Set(records.flatMap(x=>Array.isArray(x.changes)?x.changes:[]))],
   notes:records.map(x=>String(x.note||'').trim()).filter(Boolean)
 }));
}
function phaseLabel(change){
 if(!change)return 'Sem alterações registradas';
 const initial=change.notes.some(n=>/campanha\s+(iniciada|criada|ativada)/i.test(n));
 return initial?'Campanha iniciada':(change.labels.join(' + ')||'Alteração registrada');
}
function makePhases(sku,from,until,today,changes){
 if(!from||!until||from>until)throw Error('Corrija as datas inicial e final.');
 const lastFull=until>=today?historyMoveDay(today,-1):until;
 const allGroups=groupChanges(changes);
 const groups=allGroups.filter(x=>x.date>=from&&x.date<=until);
 const phases=[];
 let cursor=from,prev=allGroups.filter(x=>x.date<from).at(-1)||null;
 for(const group of groups){
  const stop=historyMoveDay(group.date,-1);
  if(cursor<=stop&&cursor<=lastFull){
   phases.push({sku,label:phaseLabel(prev),since:prev?.date||null,
    from:cursor,to:stop<lastFull?stop:lastFull,events:prev?.records||[],type:'full'});
  }
  // A alteração pode acontecer a qualquer hora. Esse dia não entra na comparação.
  cursor=historyMoveDay(group.date,1);prev=group;
 }
 if(cursor<=lastFull){
  phases.push({sku,label:phaseLabel(prev),since:prev?.date||null,
   from:cursor,to:lastFull,events:prev?.records||[],type:'full'});
 }
 // Quando a campanha foi criada durante o dia, a data de início é parcial.
 // Mostramos essa data na linha do tempo, mas só comparamos dias seguintes.
 const first=groups[0];
 if(first&&first.date===from&&first.notes.some(n=>/campanha\s+(iniciada|criada|ativada)/i.test(n))){
  phases.unshift({sku,label:'Início registrado',since:from,from,to:from,
   events:first.records,type:'transition'});
 }
 for(const group of groups){
  if(group.date===from&&phases[0]?.type==='transition')continue;
  phases.push({sku,label:'Alteração: '+phaseLabel(group),since:group.date,
    from:group.date,to:group.date,events:group.records,type:'transition'});
 }
 phases.sort((a,b)=>a.from.localeCompare(b.from)||(a.type==='transition'?-1:1));
 const current=until>=today?{sku,label:'Hoje · dados parciais',from:today,to:today,type:'partial',events:[]}:null;
 return {phases,current,lastFull,changes:groups,from,until};
}
function requestsFor(model){
 const jobs=[];
 // Shopee Ads não aceita consultas de um dia isolado. Nunca usar um dia de
 // alteração como parte de outra fase, nem consultar hoje como dia fechado.
 for(const phase of model.phases){
  if(phase.type!=='full')continue;
  const length=daysInclusive(phase.from,phase.to);
  if(length<2)continue;
  const parts=Math.ceil(length/28),base=Math.floor(length/parts),extra=length%parts;
  let date=phase.from;
  for(let index=0;index<parts;index++){
   const size=base+(index<extra?1:0);
   const end=historyMoveDay(date,size-1);
   jobs.push({phase,from:date,to:end});
   date=historyMoveDay(end,1);
  }
 }
 return jobs;
}
function aggregate(phase,chunks,id){
 const days=daysInclusive(phase.from,phase.to);
 const matching=chunks.filter(c=>c&&c.campaignId===id);
 if(matching.length!==chunks.length||!chunks.length)return {days,missing:true};
 const numericFields={spent:'expense',revenue:'broadGmv',impressions:'impressions',clicks:'clicks',orders:'broadOrders'};
 const values={};
 for(const [key,field] of Object.entries(numericFields)){
  const fields=matching.map(x=>asNumber(x.report[field]));
  values[key]=fields.every(x=>x!==null)?fields.reduce((a,b)=>a+b,0):null;
 }
 const ctr=values.impressions>0&&values.clicks!==null?100*values.clicks/values.impressions:null;
 let actual=values.spent>0&&values.revenue!==null?values.revenue/values.spent:null;
 if(actual===null&&matching.length===1)actual=asNumber(matching[0].report.roas);
 return {days,missing:false,...values,ctr,actual,
  daily:values.spent===null?null:values.spent/days,
  impDaily:values.impressions===null?null:values.impressions/days,
  clicksDaily:values.clicks===null?null:values.clicks/days,
  roiReported:values.revenue===null,
  sampleEnough:days>=7&&values.impressions>=500&&values.clicks>=20};
}
function phaseMessage(phase,m,previous,p){
 if(m.missing)return {kind:'warn',title:'Dados não disponíveis',text:'A API não retornou todos os blocos desta fase. Não foi feita nenhuma estimativa.'};
 if(phase.type==='partial')return {kind:'neutral',title:'Dia em andamento',text:'Os números de hoje não entram na comparação entre alterações.'};
 if(m.days<7||m.clicks===null||m.clicks<20||m.impressions===null||m.impressions<500){
  return {kind:'warn',title:'Aguardar mais dados',
   text:m.days+' dia(s), '+(m.clicks===null?'cliques não informados':formatNumber(m.clicks)+' clique(s)')+
    '. Ainda não é seguro decidir trocar capa, título ou ROAS.'};
 }
 const fin=p?computeProduct(p):null;
 const userFloor=asNumber(p?.adsMinRoas);
 const financial=fin?.minimum??null;
 const floor=Number.isFinite(financial)?Math.max(userFloor||0,financial):financial===Infinity?Infinity:userFloor;
 if(m.actual!==null&&fin&&m.actual<fin.breakEven)
  return {kind:'risk',title:'Proteger o lucro',text:'ROAS abaixo do equilíbrio estimado. Revise custos e oferta; não aumente a verba.'};
 if(m.actual!==null&&floor!==null&&m.actual<floor)
  return {kind:'warn',title:'Margem ainda não protegida',text:'ROAS abaixo do mínimo financeiro ou desejado. Mantenha a meta e revise a conversão.'};
 if(previous&&!previous.missing&&previous.sampleEnough&&m.sampleEnough&&previous.ctr!==null&&m.ctr!==null){
  if(phase.label.includes('Capa')){
   const delta=m.ctr-previous.ctr;
   if(Math.abs(delta)>=.2)return {kind:'neutral',title:'CTR '+(delta>0?'subiu':'caiu')+' após a capa',
    text:'Variação de '+(delta>0?'+':'')+delta.toFixed(2).replace('.',',')+
     ' ponto(s) percentuais. É associação temporal, não prova da causa; confira vendas e ROAS.'};
  }
  if(phase.label.includes('ROAS'))return {kind:'neutral',title:'Comparar a entrega após o ROAS',
   text:'Compare o gasto médio diário e a margem. Períodos têm durações diferentes; não compare apenas totais.'};
 }
 return {kind:'ok',title:'Manter e acompanhar',
  text:'Amostra suficiente para primeira revisão. Avalie CTR, ROAS e margem antes de fazer outra mudança.'};
}
function formatDelta(current,prev,unit,type){
 if(current===null||prev===null||!Number.isFinite(current)||!Number.isFinite(prev))return '';
 const delta=current-prev;
 if(Math.abs(delta)<.00001)return 'Sem mudança';
 if(type==='percent')return (delta>0?'▲ ':'▼ ')+Math.abs(delta).toFixed(2).replace('.',',')+' p.p.';
 if(type==='money')return (delta>0?'▲ ':'▼ ')+money(Math.abs(delta))+'/dia';
 return (delta>0?'▲ ':'▼ ')+roas(Math.abs(delta));
}
function ordersFor(sku,from,to){
 return window.RedeOrderPhase?.calculate(supplierOrderMeta,supplierOrderBySku.get(sku),from,to)||{available:false,covered:false,reason:'Leitura do XLSX indisponível.'};
}
function orderBadge(record,compact=false){
 if(!record.available)return '<span class="evo-sales-status">Pedidos XLSX: '+safeText(record.reason||'não importados')+'</span>';
 const count=record.units;
 const prefix=record.covered?'Unidades em pedidos não cancelados':'Unidades no trecho disponível';
 const coverage=record.covered?'datas abrangidas pelo arquivo':'cobertura incompleta';
 const dateLabel=record.firstDate&&record.lastDate?' · arquivo: '+showDate(record.firstDate)+' a '+showDate(record.lastDate):'';
 const line='<strong>'+safeText(prefix)+': '+formatNumber(count)+'</strong>'+
  ' · enviadas/entregues '+formatNumber(record.fulfilled)+
  ' · pendentes '+formatNumber(record.pending)+
  ' · canceladas/devolvidas '+formatNumber(record.cancelled)+
  (record.unknown?' · status não reconhecido '+formatNumber(record.unknown):'');
 const detail=compact?'':'<small>'+safeText(coverage+dateLabel+'. Status conforme a data da importação. Pedidos da loja ≠ vendas atribuídas aos Ads.')+'</small>';
 return '<div class="evo-sales-line">'+line+detail+'</div>';
}
function render(model,results,chosenId,loaded=false){
 const p=readProducts().find(x=>x.sku===e('evoSku').value);
 if(!p){e('evoSummary').hidden=true;e('evoTimeline').innerHTML='Selecione um SKU cadastrado.';return}
 const total=model.phases.filter(x=>x.type==='full'),current=model.current;
 const withMetrics=total.map(phase=>{
  const req=requestsFor({phases:[phase],current:null});
  const chunks=req.map(job=>results.get(job.from+'|'+job.to));
  return {phase,metrics:aggregate(phase,chunks,chosenId),orders:ordersFor(p.sku,phase.from,phase.to)};
 });
 const latest=withMetrics.at(-1),previous=withMetrics.at(-2);
 const last=latest?.metrics,prev=previous?.metrics;
 const decision=latest?phaseMessage(latest.phase,last,prev,p):
  {kind:'warn',title:'Aguardar período completo',text:'Nenhum dia completo disponível após a última mudança.'};
 e('evoSummary').hidden=false;
 e('evoTopDecision').textContent=decision.title;
 e('evoTopDecisionText').textContent=decision.text;
 e('evoTopBox').className='evo-decision '+decision.kind;
 e('evoLatestSpent').textContent=last&&!last.missing&&last.daily!==null?money(last.daily)+'/dia':'—';
 e('evoLatestRoas').textContent=last&&!last.missing&&last.actual!==null?roas(last.actual):'—';
 const latestOrders=latest?.orders;
 e('evoLatestUnits').textContent=!latestOrders?.available?'XLSX ausente':
  (latestOrders.covered?formatNumber(latestOrders.units):'Parcial: '+formatNumber(latestOrders.units));
 e('evoLatestUnitsNote').textContent=!latestOrders?.available?'Importe o XLSX em Produtos':
  (latestOrders.covered?'Pedidos não cancelados (inclui pendentes)':'Relatório sem cobertura de todas as datas');
 e('evoOrderStatus').textContent=supplierOrderMeta?.formatVersion===2?
   'Pedidos por SKU carregados de '+String(supplierOrderMeta.sourceName||'XLSX')+
   '. Datas do arquivo: '+showDate(supplierOrderMeta.firstDate||'')+' a '+showDate(supplierOrderMeta.lastDate||'')+
   '. Não são atribuídos automaticamente ao Ads.':
   'Importe o XLSX de pedidos na aba Produtos para visualizar unidades por fase, separando pendentes e cancelados.';
 e('evoCurrentLabel').textContent=latest?latest.phase.label+' · '+showDate(latest.phase.from)+' a '+showDate(latest.phase.to):'Sem período fechado';
 const floor=computeProduct(p);
 e('evoLatestTarget').textContent='Gasto desejado: '+(e('productSelect')?.value===p.sku&&val('budget')?money(val('budget'))+'/dia (referência)':'consulte a referência em Decisão atual')+
   ' · ROAS mínimo: '+(p.adsMinRoas?roas(p.adsMinRoas):'não informado')+
   (floor?' · mínimo financeiro '+(Number.isFinite(floor.minimum)?roas(floor.minimum):'inviável'):'');
 const changeDays=model.changes.length;
 e('evoCount').textContent=changeDays+' data(s) de alteração · '+withMetrics.length+
  ' período(s) completo(s) comparável(is)'+(current?' · hoje separado':'');
 const out=[];
 for(let i=0;i<model.phases.length;i++){
  const phase=model.phases[i];
  if(phase.type==='transition'){
   const dayOrders=ordersFor(p.sku,phase.from,phase.to);
   out.push('<article class="evo-change"><div class="evo-marker">✎</div><div><strong>'+safeText(showDate(phase.from))+
    ' · '+safeText(phase.label)+'</strong><div class="evo-small">'+
    'Dia de transição separado: não somar os indicadores deste dia às duas fases.</div>'+
    orderBadge(dayOrders,true)+'</div></article>');
   continue;
  }
  const row=withMetrics.find(x=>x.phase===phase),m=row?.metrics||{missing:true},beforeRow=withMetrics[withMetrics.indexOf(row)-1],before=beforeRow?.metrics;
  const orderData=row?.orders||ordersFor(p.sku,phase.from,phase.to);
  const ordersCompared=window.RedeOrderPhase?.compareDaily(orderData,beforeRow?.orders)||null;
  const orderComparison=ordersCompared?.delta!==null&&ordersCompared?
   ' · unidades/dia '+(ordersCompared.delta>=0?'+':'')+ordersCompared.delta.toLocaleString('pt-BR',{maximumFractionDigits:1})+'% vs. fase anterior':'';
  const orderHtml=orderBadge(orderData)+
   (orderComparison?'<div class="evo-small">'+safeText(orderComparison.slice(3))+'</div>':'');
  const signal=phaseMessage(phase,m,before,p);
  const impressions=m.impressions===null||m.missing?'—':formatNumber(m.impressions);
  const clicks=m.clicks===null||m.missing?'—':formatNumber(m.clicks);
  const spend=m.daily===null||m.missing?'—':money(m.daily);
  const ratio=m.actual===null||m.missing?'—':roas(m.actual);
  const ctr=m.ctr===null||m.missing?'—':pct(m.ctr);
  const confidence=m.missing?'Dados insuficientes':m.sampleEnough?'Amostra inicial suficiente':'Amostra pequena';
  const diff=before&&!before.missing&&!m.missing?
   ' · comparado à fase anterior: gasto '+formatDelta(m.daily,before.daily,'R$','money')+
   ' · ROAS '+formatDelta(m.actual,before.actual,'x')+' · CTR '+formatDelta(m.ctr,before.ctr,'%','percent'):'';
  out.push('<article class="evo-phase"><div class="evo-phase-top"><strong>'+safeText(phase.label)+'</strong><span>'+safeText(showDate(phase.from)+' a '+showDate(phase.to))+'</span></div>'+
   '<div class="evo-mini-grid"><div><small>Gasto/dia</small><b>'+safeText(spend)+'</b></div>'+
   '<div><small>ROAS</small><b>'+safeText(ratio)+'</b></div>'+
   '<div><small>CTR</small><b>'+safeText(ctr)+'</b></div>'+
   '<div><small>Cliques / impressões</small><b>'+safeText(clicks+' / '+impressions)+'</b></div></div>'+
   '<div class="evo-small">'+safeText(confidence+diff)+'</div>'+
   orderHtml+
   '<div class="evo-conclusion '+signal.kind+'"><strong>'+safeText(signal.title)+'</strong><span>'+safeText(signal.text)+
   (orderData.available&&!orderData.covered?' Os dados do relatório de pedidos não cobrem todo o intervalo; não interpretar a contagem como total de vendas.':'')+
   '</span></div></article>');
 }
 if(current){
  const todayOrders=ordersFor(p.sku,current.from,current.to);
  out.push('<article class="evo-change"><div class="evo-marker">◷</div><div><strong>Hoje ('+showDate(current.from)+') · parcial</strong>'+
   '<div class="evo-small">O dia atual não entra no diagnóstico das fases fechadas; pedidos podem chegar após a última importação.</div>'+
   orderBadge(todayOrders,true)+'</div></article>');
 }
 e('evoTimeline').innerHTML=out.join('')||'<p>Não há períodos completos neste intervalo.</p>';
 if(loaded)e('evoStatus').textContent='✓ Evolução consultada · '+showDate(model.from)+' a '+showDate(model.until)+
  '. Dias de mudança e o dia atual são separados dos períodos de avaliação.';
}
function initialRange(sku,history){
 if(history.length)return {date:historyBrazilDate(history[0].timestamp),source:'histórico da primeira alteração'};
 const old=getAdsSnapshots().filter(x=>x.sku===sku&&/^\d{4}-\d{2}-\d{2}$/.test(x.start||''))
  .map(x=>x.start).sort();
 if(old.length)return {date:old[0],source:'primeira consulta Ads salva'};
 const fallback=historyMoveDay(brazilTodayISO(),-179);
 return {date:fallback,source:'últimos 180 dias pesquisáveis (início real não confirmado)'};
}
function populate(preferCurrent=false){
 const select=e('evoSku'),current=select.value,preferred=preferCurrent?current:(e('productSelect')?.value||current||lastSku);
 const products=readProducts();
 select.innerHTML='<option value="">Selecione um produto</option>'+
  products.map(p=>'<option value="'+safeText(p.sku)+'">'+safeText(p.sku+' · '+p.name)+'</option>').join('');
 const selected=products.some(p=>p.sku===preferred)?preferred:products.some(p=>p.sku===current)?current:'';
 select.value=selected;
 if(selected!==lastSku){
  lastSku=selected;cached=null;
  const history=productChanges(selected),range=initialRange(selected,history);
  const earliest=historyMoveDay(brazilTodayISO(),-179);
  e('evoStart').value=range.date<earliest?earliest:range.date;
  e('evoEnd').value=brazilTodayISO();
  e('evoTimeline').innerHTML='<p>Períodos definidos automaticamente pelo histórico. Os dias de alterações não se misturam às fases completas.</p>';
  e('evoSummary').hidden=true;e('evoCampaignWrap').hidden=true;e('evoStatus').textContent=
   (history.length?'Histórico com '+history.length+' registro(s). ':'Nenhuma alteração conhecida. ')+
   'Início: '+showDate(e('evoStart').value)+' ('+range.source+').'+
   (range.date<earliest?' A API Ads permite consultar somente até aproximadamente 6 meses.':'');
 }
}
async function fetchAll(force=false){
 if(busy)return;
 const sku=e('evoSku').value,p=readProducts().find(x=>x.sku===sku);
 if(!p){e('evoStatus').textContent='Escolha um produto.';return}
 const from=e('evoStart').value,until=e('evoEnd').value||brazilTodayISO();
 const today=brazilTodayISO();
 if(!from){e('evoStatus').textContent='Informe a data inicial da campanha quando não houver histórico conhecido.';return}
 if(until>today||from>until){e('evoStatus').textContent='Confira as datas selecionadas.';return}
 if(daysInclusive(from,until)>185){e('evoStatus').textContent='O limite aproximado da API Ads é de seis meses. Escolha uma data inicial mais recente.';return}
 const model=makePhases(sku,from,until,today,productChanges(sku));
 const jobs=requestsFor(model);
 if(jobs.length>18){e('evoStatus').textContent='Muitas modificações neste período ('+jobs.length+' consultas). Escolha um intervalo menor.';return}
 if(!jobs.length){render(model,new Map(),'Não identificado',false);e('evoStatus').textContent='Não existem dois dias completos consecutivos nesta fase para consulta à API. Os pedidos XLSX disponíveis continuam visíveis.';return}
 const id=++requestVersion;
 busy=true;e('evoRefresh').disabled=true;
 e('evoCampaignWrap').hidden=true;e('evoSummary').hidden=true;
 e('evoTimeline').innerHTML='<p>Consultando as fases da campanha…</p>';
 let ok=0,errors=[],raw=new Map(),found=new Map();
 try{
  for(const job of jobs){
   if(id!==requestVersion||e('evoSku').value!==sku)break;
   e('evoStatus').textContent='Consultando histórico Ads: '+(ok+errors.length+1)+' de '+jobs.length+
    ' · '+showDate(job.from)+' a '+showDate(job.to);
   try{
    const response=await apiOverview(job.from,job.to);
    if(response.dateAdjustment?.shiftedDays)throw Error('A Shopee deslocou as datas do bloco; selecione um período já liberado para não misturar fases.');
    const relevant=apiReportMatches(response.campaigns,sku,p.name,p.linkedCampaignIds)
     .filter(c=>/^[0-9]+$/.test(String(c.campaignId||'')));
    for(const c of relevant)found.set(String(c.campaignId),c);
    raw.set(job.from+'|'+job.to,{job,campaigns:relevant});
    ok++;
   }catch(err){
    raw.set(job.from+'|'+job.to,{job,campaigns:[],error:String(err?.message||err)});
    errors.push(showDate(job.from)+': '+String(err?.message||err).slice(0,120));
   }
  }
  if(id!==requestVersion||e('evoSku').value!==sku)return;
  cached={sku,model,jobs,raw,found,errors,syncedCampaigns:new Set()};
  if(errors.length)e('evoStatus').textContent='Alguns períodos não puderam ser consultados ('+errors.length+
   '). Eles serão marcados como indisponíveis; nenhum dado será inventado.';
  if(found.size>1){
   const sel=e('evoCampaign');
   sel.innerHTML='<option value="">Escolha a campanha correta</option>'+
    [...found].map(([id,c])=>'<option value="'+safeText(id)+'">ID '+safeText(id)+' · '+safeText(String(c.productTitle||c.name||'Campanha').slice(0,80))+'</option>').join('');
   const preferred=apiCampaignPreference(sku);
   if(found.has(preferred))sel.value=preferred;
   e('evoCampaignWrap').hidden=false;
   if(!sel.value){e('evoTimeline').innerHTML='<p>Foram encontradas várias campanhas para este SKU. Escolha o ID correto acima para não somar anúncios diferentes.</p>';return}
  }
  if(!found.size){
   render(model,new Map(),'Sem campanha identificada',false);
   e('evoStatus').textContent='Sem dados Ads vinculados ao SKU neste intervalo. As fases e os pedidos do XLSX permanecem visíveis, sem inventar ROAS.';
   return;
  }
  useCampaign(e('evoCampaignWrap').hidden?[...found.keys()][0]:e('evoCampaign').value);
 }finally{
  busy=false;e('evoRefresh').disabled=false;
  if(e('evoSku').value&&e('evoSku').value!==sku&&e('evoStart').value)fetchAll();
 }
}
function useCampaign(campaignId){
 if(!cached||!campaignId)return;
 const map=new Map(),snapshots=[];
 for(const [key,item] of cached.raw){
  const report=item.campaigns.find(c=>String(c.campaignId)===String(campaignId));
  if(!report||item.error)continue;
  map.set(key,{campaignId:String(campaignId),report});
  const {from,to}=item.job;
  snapshots.push({id:String(campaignId)+'|'+from+'|'+to,
   campaignId:String(campaignId),sku:cached.sku,
   productName:readProducts().find(p=>p.sku===cached.sku)?.name||'',
   start:from,end:to,syncedAt:new Date().toISOString(),
   status:report.status||'unknown',statusGroup:report.statusGroup||'other',
   expense:asNumber(report.expense),revenue:asNumber(report.broadGmv),
   roas:asNumber(report.roas),impressions:asNumber(report.impressions),
   clicks:asNumber(report.clicks),orders:asNumber(report.broadOrders),
   source:'Shopee Ads API · evolução por período fechado'});
 }
 if(snapshots.length&&!cached.syncedCampaigns.has(String(campaignId))){
  mergeAdsSnapshots(snapshots);
  cached.syncedCampaigns.add(String(campaignId));
 }
 const missing=cached.jobs.length-map.size;
 render(cached.model,map,String(campaignId),true);
 if(missing)e('evoStatus').textContent+=' '+missing+' bloco(s) sem dados para o ID selecionado; não foram estimados.';
}
function open(){
 populate();
 const sku=e('evoSku').value;
 if(!sku)return;
 if(cached&&cached.sku===sku){
  const chosen=e('evoCampaignWrap').hidden?[...cached.found.keys()][0]:e('evoCampaign').value;
  if(chosen)useCampaign(chosen);
  return;
 }
 // Só uma ação para o usuário: abrir a aba carrega a evolução do SKU selecionado.
 if(e('evoStart').value&&!busy)fetchAll();
}
e('evoSku').addEventListener('change',()=>{
 populate(true);if(e('evoStart').value)fetchAll();
});
e('evoStart').addEventListener('change',()=>{cached=null});
e('evoEnd').addEventListener('change',()=>{cached=null});
e('evoRefresh').addEventListener('click',()=>fetchAll(true));
e('evoCampaign').addEventListener('change',()=>useCampaign(e('evoCampaign').value));
e('evoHistoryLink').addEventListener('click',()=>{
 const sku=e('evoSku').value;
 switchTab('historico');
 e('changeFilter').value=sku;
 e('apiHistoryFilter').value='changes';
 renderChangeHistory();
 e('changeHistoryPanel').scrollIntoView({behavior:'smooth',block:'start'});
});
function ordersUpdated(){
 if(!cached)return;
 const choice=e('evoCampaignWrap').hidden?[...cached.found.keys()][0]:e('evoCampaign').value;
 if(choice)useCampaign(choice);
 else render(cached.model,new Map(),'Sem campanha identificada',false);
}
function selectSku(sku){
 if(!readProducts().some(p=>p.sku===sku))return false;
 lastSku='';
 e('evoSku').value=sku;
 // Ao abrir a aba, populate seleciona o produto do formulário sem depender do filtro.
 if(e('productSelect')&&readProducts().some(p=>p.sku===sku)){
  e('productSelect').value=sku;
 }
 switchTab('evolucao');
 return true;
}
window.RedeEvolution={open,makePhases,requestsFor,aggregate,phaseMessage,ordersUpdated,selectSku};
})();