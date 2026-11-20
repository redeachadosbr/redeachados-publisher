/* Rede Achados BR Ads — interface financeira simplificada.
 * Mantém os dados anteriores. Registros financeiros são gravados no histórico
 * existente (com marca própria), portanto seguem o backup e a sincronização.
 */
(()=>{
'use strict';
if(typeof getHistory!=='function'||typeof setHistory!=='function'||typeof readProducts!=='function'||typeof switchTab!=='function')return;
const KIND='simple_finance_v1',tab=document.querySelector('.tabs');
if(!tab)return;
const $=id=>document.getElementById(id);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const currency=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const moneyFromInput=value=>{
 let s=String(value??'').trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
 if(!s)return null;
 if(/^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
 else if(/^-?\d+(?:,\d{1,2})?$/.test(s))s=s.replace(',','.');
 else if(!/^-?\d+(?:\.\d{1,2})?$/.test(s))return null;
 const n=Number(s);
 return Number.isFinite(n)&&Math.abs(n)<=100000000?Math.round(n*100)/100:null;
};
const isoToday=()=>{
 const bits=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const d=Object.fromEntries(bits.map(x=>[x.type,x.value]));
 return d.year+'-'+d.month+'-'+d.day;
};
const priorDate=(iso,offset)=>new Date(Date.parse(iso+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
const records=()=>getHistory().filter(r=>r&&r.data&&r.data.kind===KIND);
const brazilDay=stamp=>{
 const d=new Date(stamp);if(!Number.isFinite(d.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const v=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return v.year+'-'+v.month+'-'+v.day;
};
const brazilStamp=stamp=>{
 const d=new Date(stamp);
 return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
};
const lastChanges=()=>{
 const latest=new Map();
 for(const change of getChanges()){
  const sku=String(change?.sku||'').trim().toUpperCase(),value=Date.parse(change?.timestamp||'');
  if(!sku||!Number.isFinite(value))continue;
  if(!latest.has(sku)||Date.parse(latest.get(sku).timestamp)<value)latest.set(sku,change);
 }
 return latest;
};
const getStatus=product=>typeof effectiveAdsStatus==='function'?effectiveAdsStatus(product):String(product.adsStatus||'unknown');
const marketText=product=>typeof product.market==='number'&&Number.isFinite(product.market)&&product.market>0?currency(product.market):'Não informado';
const curveTextSaved=product=>/^[ABCDE]$/.test(String(product.curve||''))?'Curva '+product.curve:'Não informada';
const resultOf=d=>Math.round((d.revenueNet-d.wedropCost-d.adsSpend-d.otherCosts)*100)/100;
const dateBR=iso=>String(iso||'').split('-').reverse().join('/');
const css=document.createElement('style');
css.textContent=[
 '.simple-mode .tabs .tab[data-tab="simulador"],.simple-mode .tabs .tab[data-tab="evolucao"],.simple-mode .tabs .tab[data-tab="regras"]{display:none!important}',
 '.simple-mode #historico>.panel:first-child{display:none!important}',
 '.simple-mode #historico .hist-action-buttons [data-analyze-change]{display:none}',
 '.simple-mode #changeHistoryPanel{margin-top:0}',
 '.simple-mode .hero-icon{display:none}',
 '.simple-finance h2{margin:0 0 5px}',
 '.simple-finance .s-grid{display:none!important}',
 '.simple-finance .s-card{border:1px solid #5a5141;border-radius:12px;padding:14px;background:#201e1b}',
 '.simple-finance .s-card small{color:#d8c9aa;font-size:12px}',
 '.simple-finance .s-card strong{display:block;font-size:23px;margin-top:5px;word-break:break-word}',
 '.simple-finance .s-green{color:#a5f5c7}.simple-finance .s-red{color:#ffb2b2}.simple-finance .s-amber{color:#f3d4a2}',
 '.simple-finance .s-toolbar{display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin:12px 0}',
 '.simple-finance .s-toolbar label{font-size:12px;color:#d6d0c4}',
 '.simple-finance input,.simple-finance select{max-width:100%;padding:10px;border-radius:8px}',
 '.simple-finance details{margin:16px 0;padding:15px;border:1px solid #585148;border-radius:12px;background:#1a1c20}',
 '.simple-finance summary{cursor:pointer;font-weight:750;font-size:16px}',
 '.simple-finance .s-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}',
 '.simple-finance .s-field{display:flex;flex-direction:column;gap:5px;min-width:0}',
 '.simple-finance .s-field label{font-size:12px;color:#ded6c7}',
 '.simple-finance .s-field.wide{grid-column:span 2}',
 '.simple-finance .s-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}',
 '.simple-finance .s-muted{font-size:12px;color:#c8c1b7;line-height:1.5}',
 '.simple-finance .s-table{overflow-x:auto;margin-top:12px}',
 '.simple-finance .s-table table{min-width:1090px;width:100%;border-collapse:collapse}',
 '.simple-finance .s-table th,.simple-finance .s-table td{padding:11px 9px;text-align:left;border-bottom:1px solid #4a4541}',
 '.simple-finance .s-table th{text-transform:none;font-size:12px;color:#ded2c0}',
 '.simple-finance .s-table td small{display:block;color:#c6bfb6}',
 '.simple-finance .s-tag{font-size:11px;padding:4px 7px;border-radius:6px;background:#30313a;display:inline-block}',
 '.simple-mode .tabs .tab[data-tab="painel"]{display:none!important}',
 '@media(max-width:900px){.simple-finance .s-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.simple-finance .s-form{grid-template-columns:repeat(2,minmax(0,1fr))}}',
 '@media(max-width:520px){.simple-finance .s-grid{grid-template-columns:1fr 1fr}.simple-finance .s-card strong{font-size:18px}.simple-finance .s-form{grid-template-columns:1fr}.simple-finance .s-field.wide{grid-column:span 1}}'
].join('\n');
document.head.append(css);
// O Painel Geral foi removido da navegação a pedido do lojista.
// Apenas duas abas: Produtos e Alterações.
const panel=document.createElement('section');
panel.id='painel';panel.className='simple-finance product-finance-panel';
panel.innerHTML=
'<div class="panel"><div class="row-between"><div><div class="overline">Controle financeiro manual · somente leitura Shopee</div><h2>Financeiro por produto</h2><p class="subtle">Acompanhe o resultado de cada SKU sem recomendações automáticas de Ads.</p></div><button class="btn-secondary mini" type="button" id="simpleOpenChanges">Registrar alteração</button></div>'+
'<div class="s-toolbar"><div class="s-field"><label for="simplePeriod">Período financeiro</label><select id="simplePeriod"><option value="all">Todo o histórico</option><option value="month">Este mês</option><option value="30">Últimos 30 dias</option><option value="7">Últimos 7 dias</option></select></div><div class="s-field"><label for="simpleRecent">Últimas alterações dos anúncios</label><select id="simpleRecent"><option value="all">Todos os produtos (mais recentes primeiro)</option><option value="today">Alterados hoje</option><option value="7">Alterados nos últimos 7 dias</option><option value="15">Alterados nos últimos 15 dias</option><option value="30">Alterados nos últimos 30 dias</option><option value="none">Sem alterações registradas</option></select></div><div class="s-field"><label for="simpleSearch">Buscar produto</label><input id="simpleSearch" type="search" placeholder="SKU ou nome" autocomplete="off"></div></div>'+
'<div class="s-grid"><div class="s-card"><small>Receita líquida informada</small><strong id="sRevenue">—</strong></div><div class="s-card"><small>Gasto Ads informado</small><strong id="sAds">—</strong></div><div class="s-card"><small>Lucro/prejuízo apurado</small><strong id="sNet">—</strong></div><div class="s-card"><small>Produtos sem apuração completa</small><strong class="s-amber" id="sPending">—</strong></div></div>'+
'<p class="s-muted" id="sCoverage">Os totais incluem apenas períodos completos e conferidos. Não são uma conciliação automática com a Shopee.</p>'+
'<div class="s-table"><table><thead><tr><th>Produto</th><th>Curva</th><th>Média do mercado</th><th>Última alteração</th><th>Ads (R$)</th><th>Lucro/prejuízo (R$)</th><th>Situação</th><th></th></tr></thead><tbody id="simpleProductRows"></tbody></table></div>'+
'<details id="simpleFinanceDetails"><summary id="simpleFormHeading">+ Registrar resultado financeiro por produto</summary>'+
'<p class="s-muted">Preencha valores relativos ao mesmo período. A receita líquida deve vir da Shopee após taxas e descontos; não desconte essas taxas novamente. Use custo efetivo WeDrop e Ads de todas as campanhas do SKU no período. Não rateie automaticamente pedidos com vários SKUs.</p>'+
'<form id="simpleFinanceForm" autocomplete="off"><div class="s-form">'+
'<div class="s-field wide"><label for="sSku">Produto / SKU *</label><select id="sSku" required></select><small class="s-muted" id="sProductMarketCurve" aria-live="polite">Selecione um produto para ver a curva e a média do mercado cadastradas.</small></div>'+
'<div class="s-field"><label for="sStart">Início do período *</label><input type="date" id="sStart" required></div>'+
'<div class="s-field"><label for="sEnd">Fim do período *</label><input type="date" id="sEnd" required></div>'+
'<div class="s-field"><label for="sRevenueInput">Receita líquida Shopee (R$) *</label><input id="sRevenueInput" inputmode="decimal" placeholder="Ex.: 150,00" required></div>'+
'<div class="s-field"><label for="sCostInput">Custo efetivo WeDrop (R$) *</label><input id="sCostInput" inputmode="decimal" placeholder="Ex.: 100,00" required></div>'+
'<div class="s-field"><label for="sAdsInput">Gasto Ads no período (R$) *</label><input id="sAdsInput" inputmode="decimal" placeholder="Ex.: 30,00" required></div>'+
'<div class="s-field"><label for="sOtherInput">Outras despesas externas (R$) *</label><input id="sOtherInput" inputmode="decimal" placeholder="Ex.: 5,00" required></div>'+
'</div><label class="checkline"><input type="checkbox" id="sConfirmed"><span>Conferi o valor líquido dos pedidos, custos, devoluções e investimento Ads desse período (não são apenas previsões).</span></label>'+
'<p class="s-muted" id="sFinanceMessage" role="status" aria-live="polite"></p>'+
'<div class="s-actions"><button type="submit" class="btn-primary" id="simpleSaveFinance">Salvar resultado</button><button type="button" class="btn-secondary" id="simpleCancelFinance">Limpar formulário</button></div></form></details>'+
'<h3>Histórico financeiro lançado</h3><p class="s-muted">Edite ou exclua lançamentos incorretos. O histórico de alterações de anúncios permanece na aba Alterações.</p>'+
'<div class="s-table"><table><thead><tr><th>Produto</th><th>Período</th><th>Gasto Ads</th><th>Resultado</th><th>Conferência</th><th></th></tr></thead><tbody id="simpleLedgerRows"></tbody></table></div></div>';
document.getElementById('produtos').appendChild(panel);
document.body.classList.add('simple-mode');
const badge=document.querySelector('.top .pill');
if(badge)badge.textContent='Painel de lucro e histórico de Ads';
const heading=document.querySelector('.hero h1');
if(heading)heading.textContent='Controle de lucro e alterações dos anúncios.';
const sub=document.querySelector('.hero p');
if(sub)sub.textContent='Você decide o que ajustar. O aplicativo registra o histórico e mostra resultados financeiros informados por produto.';
const originalSwitch=switchTab;
switchTab=function(name){
 if(['simulador','evolucao','regras','painel'].includes(name))name='produtos';
 originalSwitch(name);
 if(name==='produtos')render();
};
// Modo simples fixo; não há mais abas de recomendação ou simulador no menu.
$('simpleOpenChanges').addEventListener('click',()=>switchTab('historico'));
let editingId=null;
function reset(){
 editingId=null;$('simpleFinanceForm').reset();
 const today=isoToday();
 $('sStart').value=today.slice(0,8)+'01';$('sEnd').value=priorDate(today,-1);
 $('simpleFormHeading').textContent='+ Registrar resultado financeiro por produto';
 $('simpleSaveFinance').textContent='Salvar resultado';
 $('sFinanceMessage').textContent='';
}
function productMarketCurveSummary(){
 const p=readProducts().find(x=>x.sku===$('sSku').value);
 $('sProductMarketCurve').textContent=p?'Classificação do cadastro: '+curveTextSaved(p)+' · Preço médio do mercado: '+marketText(p):'Selecione um produto para ver a curva e a média do mercado cadastradas.';
}
function options(){
 const select=$('sSku'),previous=select.value;
 select.innerHTML='<option value="">Selecione o produto</option>'+readProducts().map(p=>
  '<option value="'+escapeHtml(p.sku)+'">'+escapeHtml(p.sku+' · '+p.name)+'</option>').join('');
 if([...select.options].some(o=>o.value===previous))select.value=previous;
 productMarketCurveSummary();
}
function filterStart(){
 const p=$('simplePeriod').value,today=isoToday();
 if(p==='all')return null;
 if(p==='month')return today.slice(0,8)+'01';
 return priorDate(today,1-Number(p));
}
function filteredRows(){
 const from=filterStart(),today=isoToday();
 return records().filter(r=>!from||(r.data.periodStart>=from&&r.data.periodEnd<=today));
}
function render(){
 options();
 const search=$('simpleSearch').value.trim().toLocaleLowerCase('pt-BR'),all=filteredRows(),latest=lastChanges();
 const recent=$('simpleRecent').value,today=isoToday();
 const start=recent==='today'?today:/^(7|15|30)$/.test(recent)?priorDate(today,1-Number(recent)):null;
 const products=readProducts().filter(p=>{
  if(!(p.sku+' '+p.name).toLocaleLowerCase('pt-BR').includes(search))return false;
  const change=latest.get(p.sku);
  if(recent==='none')return !change;
  if(start){const date=change?brazilDay(change.timestamp):'';return !!date&&date>=start&&date<=today;}
  return true;
 }).sort((a,b)=>(Date.parse(latest.get(b.sku)?.timestamp||'')||0)-(Date.parse(latest.get(a.sku)?.timestamp||'')||0)||a.name.localeCompare(b.name,'pt-BR'));
 let revenue=0,ads=0,net=0,completed=0,pending=0;
 $('simpleProductRows').innerHTML=products.map(p=>{
  const entries=all.filter(r=>r.data.sku===p.sku),approved=entries.filter(r=>r.data.confirmed);
  const ok=approved.length>0;
  const totals={ads:0,net:0};
  approved.forEach(r=>{totals.ads+=r.data.adsSpend;totals.net+=resultOf(r.data)});
  const missing=!entries.length||approved.length!==entries.length;
  if(missing)pending++;
  if(ok){revenue+=approved.reduce((s,r)=>s+r.data.revenueNet,0);ads+=totals.ads;net+=totals.net;completed++;}
  const situation=!ok?'Pendente':missing?'Parcial':totals.net>0?'Lucro':totals.net<0?'Prejuízo':'Equilíbrio';
  return '<tr><td><strong>'+escapeHtml(p.name)+'</strong><small>'+escapeHtml(p.sku)+' · '+escapeHtml(getStatus(p)==='active'?'Em Ads':getStatus(p)==='removed'?'Retirado dos Ads':'Status Ads não confirmado')+'</small></td>'+
  '<td><span class="s-tag">'+escapeHtml(curveTextSaved(p))+'</span></td><td>'+escapeHtml(marketText(p))+'</td>'+
  '<td>'+(latest.has(p.sku)?'<strong>'+escapeHtml(brazilStamp(latest.get(p.sku).timestamp))+'</strong><small>'+escapeHtml((latest.get(p.sku).changes||[]).join(' + ')||'Alteração registrada')+'</small>':'<span class="s-muted">Sem registro</span>')+'</td>'+
  '<td>'+(ok?currency(totals.ads):'—')+'</td><td class="'+(totals.net<0?'s-red':totals.net>0?'s-green':'')+'">'+(ok?currency(totals.net):'—')+'</td>'+
  '<td><span class="s-tag">'+situation+'</span></td><td><div class="s-actions"><button type="button" class="btn-secondary mini" data-simple-history="'+escapeHtml(p.sku)+'">Histórico</button><button type="button" class="btn-secondary mini" data-simple-new="'+escapeHtml(p.sku)+'">Lançar</button></div></td></tr>';
 }).join('')||'<tr><td colspan="8">Nenhum produto cadastrado ou correspondente aos filtros.</td></tr>';
 $('sRevenue').textContent=completed?currency(revenue):'—';
 $('sAds').textContent=completed?currency(ads):'—';
 $('sNet').textContent=completed?currency(net):'—';
 $('sNet').className=net<0?'s-red':net>0?'s-green':'';
 $('sPending').textContent=String(pending)+' de '+products.length;
 $('sCoverage').textContent='Totais referentes aos '+products.length+' produto(s) exibidos nos filtros, dos quais '+completed+' têm lançamentos financeiros conferidos. Sem dados não significa lucro zero. O filtro de últimas alterações usa a data de registro da mudança no anúncio; o filtro financeiro usa o período das vendas. Nenhum valor é rateado.';
 const showing=all.filter(r=>(r.data.sku+' '+(readProducts().find(p=>p.sku===r.data.sku)?.name||'')).toLocaleLowerCase('pt-BR').includes(search));
 showing.sort((a,b)=>b.data.periodEnd.localeCompare(a.data.periodEnd));
 $('simpleLedgerRows').innerHTML=showing.map(r=>{
  const d=r.data,p=readProducts().find(x=>x.sku===d.sku),v=resultOf(d);
  return '<tr><td>'+escapeHtml(p?.name||d.sku)+'<small>'+escapeHtml(d.sku)+'</small></td><td>'+dateBR(d.periodStart)+' a '+dateBR(d.periodEnd)+'</td>'+
   '<td>'+currency(d.adsSpend)+'</td><td class="'+(v<0?'s-red':'s-green')+'">'+currency(v)+'</td><td>'+(d.confirmed?'Conferido manualmente':'Não conferido')+'</td>'+
   '<td><div class="s-actions"><button type="button" class="btn-secondary mini" data-simple-edit="'+escapeHtml(r.id)+'">Editar</button>'+
   '<button type="button" class="btn-secondary mini" data-simple-delete="'+escapeHtml(r.id)+'">Excluir</button></div></td></tr>';
 }).join('')||'<tr><td colspan="6">Nenhum período financeiro registrado neste filtro.</td></tr>';
}
$('simplePeriod').addEventListener('change',render);
$('simpleSearch').addEventListener('input',render);
$('simpleRecent').addEventListener('change',render);
const recentHistory=$('historyRecentFilter');
if(recentHistory){
 recentHistory.addEventListener('change',()=>{
  const value=recentHistory.value,today=isoToday();
  if(value==='custom')return;
  $('historyFromDate').value=value==='all'?'':value==='today'?today:priorDate(today,1-Number(value));
  $('historyToDate').value=value==='all'?'':today;
  renderChangeHistory();
 });
 for(const id of ['historyFromDate','historyToDate']){
  $(id).addEventListener('change',()=>{recentHistory.value='custom'});
 }
 $('historyClearDatesBtn').addEventListener('click',()=>{recentHistory.value='all'});
}
panel.addEventListener('click',event=>{
 const historyButton=event.target.closest('[data-simple-history]');
 if(historyButton){
  $('apiHistoryFilter').value='changes';
  $('historyFromDate').value='';$('historyToDate').value='';
  const filter=$('historyRecentFilter');if(filter)filter.value='all';
  switchTab('historico');
  $('changeFilter').value=historyButton.dataset.simpleHistory;
  renderChangeHistory();return;
 }
 const newButton=event.target.closest('[data-simple-new]');
 if(newButton){reset();options();$('sSku').value=newButton.dataset.simpleNew;productMarketCurveSummary();$('simpleFinanceDetails').open=true;$('simpleFinanceDetails').scrollIntoView({behavior:'smooth',block:'start'});return;}
 const edit=event.target.closest('[data-simple-edit]');
 if(edit){
  const rec=records().find(x=>x.id===edit.dataset.simpleEdit);
  if(!rec)return;
  reset();editingId=rec.id;options();
  const d=rec.data;
  $('sSku').value=d.sku;productMarketCurveSummary();$('sStart').value=d.periodStart;$('sEnd').value=d.periodEnd;
  $('sRevenueInput').value=String(d.revenueNet).replace('.',',');
  $('sCostInput').value=String(d.wedropCost).replace('.',',');
  $('sAdsInput').value=String(d.adsSpend).replace('.',',');
  $('sOtherInput').value=String(d.otherCosts).replace('.',',');
  $('sConfirmed').checked=!!d.confirmed;
  $('simpleFormHeading').textContent='Editar resultado financeiro';$('simpleSaveFinance').textContent='Salvar correção';
  $('simpleFinanceDetails').open=true;$('simpleFinanceDetails').scrollIntoView({behavior:'smooth',block:'start'});return;
 }
 const del=event.target.closest('[data-simple-delete]');
 if(del){
  const rec=records().find(x=>x.id===del.dataset.simpleDelete);
  if(!rec||!confirm('Excluir lançamento financeiro de '+rec.data.sku+' de '+dateBR(rec.data.periodStart)+' até '+dateBR(rec.data.periodEnd)+'?'))return;
  if(!setHistory(getHistory().filter(x=>x.id!==rec.id)))alert('Não foi possível salvar a exclusão. Faça backup.');
  if(editingId===rec.id)reset();
  render();
 }
});
$('simpleFinanceForm').addEventListener('submit',event=>{
 event.preventDefault();
 const sku=$('sSku').value,start=$('sStart').value,end=$('sEnd').value;
 const fields=['sRevenueInput','sCostInput','sAdsInput','sOtherInput'].map(id=>moneyFromInput($(id).value));
 if(!sku||!readProducts().some(p=>p.sku===sku)){$('sFinanceMessage').textContent='Selecione um produto cadastrado.';return;}
 if(!start||!end||start>end||end>isoToday()){$('sFinanceMessage').textContent='Informe datas válidas, até hoje, e com início anterior ao fim.';return;}
 if(fields.some(v=>v===null)||fields.slice(1).some(v=>v<0)){$('sFinanceMessage').textContent='Confira os quatro valores em reais. Custos e gasto Ads não podem ser negativos.';return;}
 const duplicate=records().find(r=>r.id!==editingId&&r.data.sku===sku&&start<=r.data.periodEnd&&end>=r.data.periodStart);
 if(duplicate){$('sFinanceMessage').textContent='Este SKU já possui lançamento sobreposto de '+dateBR(duplicate.data.periodStart)+' a '+dateBR(duplicate.data.periodEnd)+'. Corrija ou edite o lançamento existente.';return;}
 const original=records().find(r=>r.id===editingId);
 const rec={id:original?.id||(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2)),
  savedAt:new Date().toISOString(),data:{kind:KIND,sku,periodStart:start,periodEnd:end,revenueNet:fields[0],
  wedropCost:fields[1],adsSpend:fields[2],otherCosts:fields[3],confirmed:$('sConfirmed').checked}};
 if(!setHistory([rec,...getHistory().filter(r=>r.id!==rec.id)])){$('sFinanceMessage').textContent='Falha ao gravar. Faça backup antes de sair.';return;}
 reset();$('simpleFinanceDetails').open=false;render();
});
$('simpleCancelFinance').addEventListener('click',reset);
$('sSku').addEventListener('change',productMarketCurveSummary);
const previousSetHistory=setHistory;
setHistory=function(rows){const ok=previousSetHistory(rows);render();return ok;};
reset();render();switchTab('produtos');
})();
