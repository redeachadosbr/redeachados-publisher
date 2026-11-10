/* Rede Achados BR — Decisão atual por alteração do histórico.
   Os registros delimitam fases; dias de mudança não são atribuídos a dois estados.
   O XLSX é local; a API Ads é somente leitura. Nenhuma ação na Shopee. */
(()=>{
'use strict';
const byId=id=>document.getElementById(id);
const skuSelect=byId('productSelect'),periodSelect=byId('quickPeriod'),campaignSelect=byId('quickCampaign');
if(!skuSelect||!periodSelect||!campaignSelect)return;
const DAY=86400000;
const day=(iso,n)=>new Date(Date.parse(iso+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
const countDays=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/DAY)+1;
const fmtDate=iso=>iso?.split('-').reverse().join('/')||'—';
const escapeText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const originalOptions=periodSelect.innerHTML;
const css=document.createElement('style');
css.textContent=[
'.ads-history-note{padding:10px 12px;margin-top:12px;border:1px solid #48627b;border-radius:9px;background:#162434;color:#cfe2f1;font-size:12px;line-height:1.5}',
'.ads-history-note strong{color:#f6d28c}',
'.ads-history-orders{margin-top:9px;padding:9px 10px;background:#152a26;border:1px solid #416b5b;border-radius:9px;color:#b9f2d4;font-size:11px;line-height:1.5}',
'.ads-history-orders.warn{border-color:#85663a;background:#33271b;color:#ffe0ab}',
'.ads-history-orders small{display:block;color:#b8cad4;margin-top:4px}',
'.tab[data-tab="evolucao"]{display:none!important}'
].join('\n');document.head.append(css);
const note=document.createElement('div');note.className='ads-history-note';note.hidden=true;note.setAttribute('aria-live','polite');
byId('quickStatus').insertAdjacentElement('afterend',note);
const orderNote=document.createElement('div');orderNote.className='ads-history-orders';orderNote.hidden=true;
byId('itemsSold').closest('.field').append(orderNote);
const historyLabel=periodSelect.closest('label');
const baseLabel=historyLabel?.firstChild?.nodeValue||'Período';
let phases=[],selectedSku='',phaseKey='',historySignature='',busy=false,revision=0,pending=null,lastLoaded=null,salesFlag='xlsx_unconfirmed';
function changesFor(sku){
 return getChanges().filter(x=>x.sku===sku&&historyBrazilDate(x.timestamp))
  .sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
}
function groupsFor(sku){
 const groups=new Map();
 for(const rec of changesFor(sku)){
  const date=historyBrazilDate(rec.timestamp),list=groups.get(date)||[];
  list.push(rec);groups.set(date,list);
 }
 return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
  .map(([date,records])=>({date,records,changes:[...new Set(records.flatMap(x=>x.changes||[]))],
   notes:records.map(x=>String(x.note||'')).filter(Boolean)}));
}
function phaseName(group){
 if(group.notes.some(x=>/campanha\s+(iniciad|criad|ativad)/i.test(x)))return 'Campanha iniciada';
 return group.changes.join(' + ')||'Alteração registrada';
}
function build(sku){
 const groups=groupsFor(sku),today=brazilTodayISO();
 return groups.map((group,index)=>{
  const next=groups[index+1]||null;
  const to=next?.date||today;
  // A modificação pode ter ocorrido durante o dia. Só dias completos
  // entre dois registros são atribuídos a uma configuração estável.
  const fromFull=day(group.date,1);
  const toFull=day(next?.date||today,-1);
  const eligible=fromFull<=toFull&&countDays(fromFull,toFull)>=2;
  return {sku,id:'hist:'+index,start:group.date,end:to,fromFull,toFull,eligible,
   group,next,description:phaseName(group),
   label:fmtDate(group.date)+' a '+fmtDate(to)+' · '+phaseName(group)};
 });
}
function current(){return phases.find(x=>x.id===periodSelect.value&&x.sku===skuSelect.value)||null}
function isSelected(){return !!current()}
function resetUi(){
 byId('dateStart').readOnly=false;byId('dateEnd').readOnly=false;
 byId('itemsSold').readOnly=false;
 orderNote.hidden=true;note.hidden=true;
 historyLabel.firstChild.nodeValue=baseLabel;
 salesFlag='manual_or_unknown';lastLoaded=null;pending=null;phaseKey='';
}
function signature(sku){return changesFor(sku).map(x=>[x.id,x.timestamp,(x.changes||[]).join('/'),x.note||''].join('|')).join(';')}
function refreshFromHistory(){
 const sku=skuSelect.value,now=signature(sku);
 if(!sku||historySignature===now)return false;
 onProductChange(sku);return true;
}
function onProductChange(sku,preferId){
 const currentValue=sku===selectedSku?periodSelect.value:'';
 revision++;selectedSku=sku;historySignature=signature(sku);
 phases=build(sku);
 if(phases.length){
  historyLabel.firstChild.nodeValue='Período do histórico';
  periodSelect.innerHTML=phases.map(p=>'<option value="'+escapeText(p.id)+'">'+escapeText(p.label)+'</option>').join('');
  periodSelect.value=phases.some(p=>p.id===preferId)?preferId:
    phases.some(p=>p.id===currentValue)?currentValue:phases[0].id;
  applyDates();
 }else{
  resetUi();periodSelect.innerHTML=originalOptions;periodSelect.value='7';
 }
}
function applyDates(){
 const phase=current();
 if(!phase){byId('dateStart').readOnly=false;byId('dateEnd').readOnly=false;return false}
 const key=phase.sku+'|'+phase.id;
 if(key!==phaseKey){
  phaseKey=key;
  lastLoaded=null;pending=null;salesFlag='xlsx_unconfirmed';
  campaignSelect.disabled=true;campaignSelect.innerHTML='<option value="">Aguardando consulta desta fase</option>';
  for(const k of ['spent','revenue','actual','impressions','clicks','ctrReported','orders','itemsSold','addToCart','budget'])byId(k).value='';
  byId('budgetStable').checked=false;
  byId('budgetMode').value='daily';updateBudgetMode();
  window.RedeAdsQuick?.clearPreview?.();
  byId('resultContent').hidden=true;byId('resultEmpty').style.display='flex';
  byId('resultEmpty').innerHTML='<h2>Consulta por alteração</h2><p>Selecione sua campanha e consulte o desempenho do período histórico.</p>';
 }
 byId('dateStart').value=phase.start;
 byId('dateEnd').value=phase.end;
 byId('dateStart').readOnly=true;byId('dateEnd').readOnly=true;
 byId('periodClosed').checked=phase.eligible;
 syncPeriodClosed();
 byId('itemsSold').readOnly=true;
 const full=phase.eligible?'Indicadores comparáveis: '+fmtDate(phase.fromFull)+' a '+fmtDate(phase.toFull)+'.':
  'Sem pelo menos dois dias completos consecutivos para consulta à API.';
 note.hidden=false;
 note.innerHTML='<strong>'+escapeText(phase.description)+
  '</strong> · Intervalo registrado '+escapeText(fmtDate(phase.start)+' a '+fmtDate(phase.end))+
  '.<br>'+escapeText(full)+
  ' Os dias de início e de alteração seguinte são transições, não somados a duas fases. A quantidade vendida vem somente do XLSX do SKU.';
 refreshOrders();
 return true;
}
function analysisDates(){
 const phase=current();
 return phase?.eligible?{start:phase.fromFull,end:phase.toFull}:null;
}
function salesSource(){return isSelected()?salesFlag:'manual_or_unknown'}
function refreshOrders(){
 const phase=current();if(!phase)return;
 byId('itemsSold').value='';
 orderNote.hidden=false;salesFlag='xlsx_unconfirmed';
 orderNote.className='ads-history-orders warn';
 const meta=supplierOrderMeta,sku=phase.sku;
 if(!phase.eligible){orderNote.textContent='Vendas não atribuídas a este período: não existem dois dias completos de leitura entre as alterações.';return}
 if(!meta){orderNote.textContent='Importe o XLSX de pedidos em Produtos para conferir as vendas deste período.';return}
 if(meta.formatVersion!==3){orderNote.textContent='Reimporte o XLSX de pedidos: o resumo anterior não garante a contagem correta por SKU.';return}
 const rec=supplierOrderBySku.get(sku);
 if(!rec){
  orderNote.textContent='O SKU '+sku+' não foi localizado no XLSX. Não é seguro afirmar que houve zero vendas. Confira o código do anúncio no relatório.';
  return;
 }
 const result=window.RedeOrderPhase?.calculate(meta,rec,phase.fromFull,phase.toFull);
 if(!result?.available||!result.covered){
  orderNote.textContent='O XLSX não cobre integralmente '+fmtDate(phase.fromFull)+' a '+fmtDate(phase.toFull)+
   '. Quantidade não confirmada. Datas do arquivo: '+fmtDate(meta.firstDate)+' a '+fmtDate(meta.lastDate)+'.';
  return;
 }
 // Considera como vendas confirmadas as unidades enviadas/entregues.
 // Não confunde pendentes ou valores amplos do Ads com vendas reais.
 byId('itemsSold').value=String(result.fulfilled);
 salesFlag='xlsx_fulfilled';
 orderNote.className='ads-history-orders';
 orderNote.innerHTML='<strong>Itens vendidos confirmados no XLSX: '+result.fulfilled+'</strong>'+
  '<small>Enviados/entregues: '+result.fulfilled+' · Pendentes: '+result.pending+
  ' · Cancelados/devolvidos: '+result.cancelled+
  (result.unknown?' · Status não reconhecido: '+result.unknown:'')+
  '. Pedidos totais da loja; não representam necessariamente vendas atribuídas ao Ads. Cobertura entre datas do arquivo é indicativa.</small>';
}
function historicalTarget(phase){
 const parse=x=>{
  const text=String(x||'').replace(/\s+/g,' ');
  const match=/roas(?:\s+alvo)?\D{0,8}(\d{1,3}(?:[,.]\d{1,2})?)\s*(?:para|->|→|a)\s*(\d{1,3}(?:[,.]\d{1,2})?)/i.exec(text);
  return match?{before:Number(match[1].replace(',','.')),after:Number(match[2].replace(',','.'))}:null;
 };
 // A nota da próxima alteração "ROAS 30 para 25" informa a meta anterior.
 const next=phase.next?.notes.map(parse).find(Boolean);
 if(next&&next.before>0)return {value:next.before,source:'meta antes da próxima alteração (anotação)'};
 const own=phase.group.notes.map(parse).find(Boolean);
 if(own&&own.after>0)return {value:own.after,source:'meta após a alteração (anotação)'};
 return {value:null,source:'meta histórica não registrada'};
}
function renderDiagnosis(){
 const d=getData(),errors=validate(d);
 if(errors.length===0){render(analyze(d));return}
 if(window.RedeAdsQuick?.renderProvisional?.(d,errors))return;
 byId('resultContent').hidden=true;byId('resultEmpty').style.display='flex';
 byId('resultEmpty').innerHTML='<h2>Diagnóstico parcial</h2><p>Dados de desempenho recebidos. A meta ROAS e o orçamento do período histórico precisam ser confirmados para usar as regras de investimento.</p>';
}
function fill(c,phase){
 if(current()?.id!==phase.id)return;
 apiFillCampaign(c,phase.fromFull,phase.toFull,{historical:true});
 // Repor a faixa visível do histórico; o cálculo usa apenas dias completos.
 byId('dateStart').value=phase.start;byId('dateEnd').value=phase.end;
 byId('periodClosed').checked=true;syncPeriodClosed();
 byId('budgetMode').value='daily';byId('budget').value='';
 byId('budgetStable').checked=false;updateBudgetMode();
 const parsed=historicalTarget(phase);
 byId('target').value=parsed.value===null?'':String(parsed.value).replace('.',',');
 byId('rapidBoost').value='unknown';
 refreshOrders();
 rememberApiCampaign(phase.sku,String(c.campaignId));
 apiStoreOne(c,phase.sku,phase.fromFull,phase.toFull);
 if(![...campaignSelect.options].some(o=>o.value===String(c.campaignId))){
  campaignSelect.innerHTML='<option value="'+escapeText(c.campaignId)+'">ID '+escapeText(c.campaignId)+' · '+escapeText(c.productTitle||c.name||phase.sku)+'</option>';
 }
 campaignSelect.value=String(c.campaignId);campaignSelect.disabled=false;
 lastLoaded={sku:phase.sku,phaseId:phase.id,campaignId:String(c.campaignId)};
 byId('apiStatus').textContent='✓ Campanha '+c.campaignId+' consultada para '+fmtDate(phase.fromFull)+' a '+fmtDate(phase.toFull)+'. Os dias das alterações ficaram fora da comparação.';
 byId('apiStatus').className='api-status good';
 renderDiagnosis();
 byId('quickStatus').textContent='✓ Fase histórica consultada: '+phase.label+'. '+(parsed.value!==null?
  'ROAS alvo '+parsed.value+'x conforme histórico.':'ROAS histórico não documentado.')+
  ' Orçamento histórico não confirmado; nenhuma mudança aplicada à Shopee.';
 byId('quickStatus').dataset.tone='good';
}
function chooseCampaign(id){
 if(!isSelected()||!id)return;
 const phase=current();
 if(!pending||pending.phaseId!==phase.id||pending.sku!==phase.sku){
  byId('quickStatus').textContent='Clique em Consultar e analisar para carregar a campanha dessa fase.';
  return;
 }
 const c=pending.matches.find(x=>String(x.campaignId)===String(id));
 if(!c){byId('quickStatus').textContent='ID não reconhecido nesta consulta. Confira a campanha.';return}
 fill(c,phase);
}
async function consult(){
 const phase=current();
 if(!phase)return false;
 applyDates();
 if(busy)return true;
 const sku=phase.sku,token=++revision;
 if(!phase.eligible){
  refreshOrders();
  byId('quickStatus').textContent='Essa fase contém menos de dois dias inteiros consecutivos. A API não permite análise isolada confiável; não usarei dados de outra fase.';
  byId('quickStatus').dataset.tone='warn';
  return true;
 }
 busy=true;
 const button=byId('quickRead');
 button.disabled=true;button.textContent='Consultando fase...';
 byId('quickStatus').textContent='Consultando a Shopee de '+fmtDate(phase.fromFull)+' a '+fmtDate(phase.toFull)+'...';
 byId('quickStatus').dataset.tone='';
 try{
  const response=await apiOverview(phase.fromFull,phase.toFull);
  if(token!==revision||current()?.id!==phase.id||skuSelect.value!==sku)return true;
  if(response.dateAdjustment?.shiftedDays)throw Error('A API Shopee deslocou as datas. Nenhum dado foi aplicado para não misturar períodos.');
  const product=readProducts().find(x=>x.sku===sku);
  const matches=apiReportMatches(response.campaigns,sku,product?.name,product?.linkedCampaignIds||[])
   .filter(x=>/^\d+$/.test(String(x.campaignId)));
  if(!matches.length)throw Error('Nenhuma campanha vinculada ao SKU foi confirmada nessa fase. Confira o ID em Decisão atual.');
  const known=campaignSelect.value||apiCampaignPreference(sku);
  pending={sku,phaseId:phase.id,matches};
  if(matches.length>1){
   campaignSelect.innerHTML='<option value="">Escolha a campanha do produto</option>'+matches.map(c=>
    '<option value="'+escapeText(c.campaignId)+'">ID '+escapeText(c.campaignId)+' · '+escapeText(c.productTitle||c.name||sku)+'</option>').join('');
   campaignSelect.disabled=false;
   if(matches.some(c=>String(c.campaignId)===known))campaignSelect.value=known;
   if(!campaignSelect.value){
    byId('quickStatus').textContent='Várias campanhas encontradas. Escolha o ID da campanha acima; não somarei campanhas distintas.';
    byId('quickStatus').dataset.tone='warn';return true;
   }
  }
  const chosen=matches.find(x=>String(x.campaignId)===campaignSelect.value)||matches[0];
  fill(chosen,phase);
 }catch(err){
  byId('quickStatus').textContent='Não foi possível consultar a fase: '+String(err.message||err);
  byId('quickStatus').dataset.tone='error';
 }finally{
  busy=false;button.disabled=false;button.textContent='Consultar e analisar';
 }
 return true;
}
function ordersUpdated(){
 if(!isSelected())return;
 refreshOrders();
 if(lastLoaded?.sku===skuSelect.value&&lastLoaded?.phaseId===current()?.id)renderDiagnosis();
}
function openFor(sku,changeId){
 if(!readProducts().some(x=>x.sku===sku))return false;
 byId('campaignAdsFilter').value='';
 selectProductForAds(sku,false);
 onProductChange(sku);
 const history=changesFor(sku),record=history.find(x=>String(x.id)===String(changeId));
 if(record){
  const idx=groupsFor(sku).findIndex(g=>g.records.some(x=>String(x.id)===String(changeId)));
  if(idx>=0&&phases.some(p=>p.id==='hist:'+idx))periodSelect.value='hist:'+idx;
 }
 applyDates();
 switchTab('simulador');
 void consult();
 return true;
}
const api={isSelected,applyDates,analysisDates,salesSource,consult,onProductChange,chooseCampaign,ordersUpdated,openFor,refreshFromHistory};
window.RedeAdsHistory=api;
byId('adsForm')?.addEventListener('submit',event=>{
 const p=current();
 if(p&&!p.eligible){
  event.preventDefault();event.stopImmediatePropagation();
  byId('quickStatus').textContent='Esta fase não possui dois dias completos consecutivos; não é seguro aplicar as regras Ads.';
 }
},true);
byId('dateStart').addEventListener('change',()=>{
 if(isSelected())applyDates();
});
byId('dateEnd').addEventListener('change',()=>{
 if(isSelected())applyDates();
});
// Ativação inicial ao carregar o painel ou ao voltar para ele.
if(skuSelect.value)onProductChange(skuSelect.value);
})();