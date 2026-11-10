// Decisão atual | leitura automática por SKU. Não altera campanhas.
(()=>{
'use strict';
const byId=id=>document.getElementById(id);
const note=byId('selectedProductPhotoNote');
if(!note||!byId('productSelect'))return;
const css=document.createElement('style');
css.textContent=[
'.ads-quick{border:1px solid #536a85;background:#1b2533;border-radius:13px;padding:14px;margin:14px 0}',
'.ads-quick h3{font-size:15px;color:#fff;margin:0 0 5px}',
'.ads-quick p{font-size:11px;line-height:1.5;color:#c5d2e0;margin:5px 0 10px}',
'.ads-quick-grid{display:grid;grid-template-columns:minmax(155px,1.5fr) minmax(125px,1fr);gap:10px;align-items:end}',
'.ads-quick-grid label{display:grid;gap:6px;color:#e1e9f4;font-size:12px}',
'.ads-quick-grid select{width:100%;min-width:0;background:#101925;border:1px solid #657890;color:#fff;border-radius:9px;padding:10px}',
'.ads-quick-grid button{grid-column:1/-1;padding:11px}',
'.ads-quick-status{border-top:1px solid #394b60;padding-top:9px!important;margin-top:12px!important;color:#c6d6e6!important;white-space:pre-line}',
'.ads-quick-status[data-tone=good]{color:#b4f4d7!important}',
'.ads-quick-status[data-tone=warn]{color:#f8d89c!important}',
'.ads-quick-status[data-tone=error]{color:#ffc2c6!important}',
'.ads-quick-help{margin-top:9px;display:none;border:1px solid #715739;background:#332719;border-radius:9px;padding:10px;color:#ffe0b5;font-size:12px}',
'.ads-quick-help button{margin-top:8px;display:block}',
'.ads-provisional{padding:5px 2px 20px}',
'.ads-provisional .ads-provisional-head{font-size:11px;font-weight:800;color:#f0c777;letter-spacing:1.1px}',
'.ads-provisional h3{font-size:23px;line-height:1.18;margin:10px 0;color:#f6faff}',
'.ads-provisional .ads-p-meta{color:#bed0e1;font-size:12px;margin:3px 0 17px}',
'.ads-provisional .ads-p-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:15px 0}',
'.ads-provisional .ads-p-kpis>div{background:#14202f;border:1px solid #41566c;border-radius:11px;padding:13px}',
'.ads-provisional .ads-p-kpis small{display:block;color:#b2c8db;font-size:11px}',
'.ads-provisional .ads-p-kpis strong{font-size:21px;color:#f5fbff;line-height:1.45}',
'.ads-provisional .ads-p-action{background:#243044;border:1px solid #52657b;border-left:4px solid #e3b460;padding:15px;border-radius:10px;color:#dce9f8;font-size:13px;line-height:1.55}',
'.ads-provisional .ads-p-action strong{display:block;color:#fff;font-size:16px;margin-bottom:6px}',
'.ads-provisional .ads-p-note{font-size:12px;color:#c2d3e6;margin-top:13px;line-height:1.55}',
'.ads-provisional .ads-p-warn{color:#f3d29d;font-size:12px;border-top:1px solid #41566a;margin-top:14px;padding-top:12px}',
'@media(max-width:520px){.ads-quick-grid{grid-template-columns:1fr}}'
].join('\n');
document.head.append(css);
const root=document.createElement('section');
root.className='ads-quick';
root.setAttribute('aria-label','Selecionar campanha e consultar Shopee Ads');
root.innerHTML='<h3>Selecione sua campanha Shopee</h3>'+
 '<p>Escolha o produto acima. A campanha e o período ficam aqui, e os números são preenchidos pela Shopee.</p>'+
 '<div class="ads-quick-grid"><label>Campanha do produto<select id="quickCampaign"><option value="">Escolha um produto</option></select></label>'+
 '<label>Período<select id="quickPeriod"><option value="7">7 dias completos</option><option value="14">14 dias completos</option><option value="30">30 dias completos</option></select></label>'+
 '<button id="quickRead" type="button" class="btn-primary mini">Consultar e analisar</button></div>'+
 '<p id="quickStatus" class="ads-quick-status" role="status" aria-live="polite">Selecione um produto para buscar suas campanhas.</p>'+
 '<div class="ads-quick-help" id="quickHelp"><span id="quickHelpText"></span>'+
 '<button id="quickComplete" type="button" class="btn-secondary mini">Completar orçamento e ROAS</button></div>';
note.insertAdjacentElement('afterend',root);
const e=id=>root.querySelector('#'+id);
const selected=e('quickCampaign'),period=e('quickPeriod'),button=e('quickRead');
const status=(message,tone='')=>{e('quickStatus').textContent=message;e('quickStatus').dataset.tone=tone};
const help=(text='')=>{
 e('quickHelp').style.display=text?'block':'none';e('quickHelpText').textContent=text;
};
const escapeText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const move=(iso,n)=>new Date(Date.parse(iso+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const setDates=()=>{
 if(window.RedeAdsHistory?.applyDates?.())return;
 const end=move(brazilTodayISO(),-1);
 byId('dateEnd').value=end;byId('dateStart').value=move(end,1-Number(period.value));syncPeriodClosed();
};
const clearCampaign=()=>{
 selected.disabled=true;selected.innerHTML='<option value="">Buscando campanhas…</option>';help('');
};
let active=false,queued=false,changes=0,latestProduct='',lastCampaign='';
function showChoices(campaigns,options={}){
 const unique=new Map();
 for(const c of campaigns)if(/^\d+$/.test(String(c.campaignId||'')))unique.set(String(c.campaignId),c);
 const sku=byId('productSelect').value,preferred=apiCampaignPreference(sku);
 selected.innerHTML='<option value="">Escolha a campanha</option>'+
 [...unique.values()].map(c=>{
  const state=c.statusGroup==='active'?'Ativa':c.statusGroup==='inactive'?'Pausada':'Status não confirmado';
  const name=String(c.productTitle||c.name||'Campanha').slice(0,80);
  return '<option value="'+escapeText(c.campaignId)+'">'+escapeText(state+' · ID '+c.campaignId+' · '+name)+'</option>';
 }).join('');
 selected.disabled=false;
 if(!options.unmatched&&unique.has(preferred))selected.value=preferred;
 else selected.value='';
 status(options.unmatched?
 'A Shopee não confirmou qual campanha corresponde a esta SKU. Selecione o ID após conferir na Central do Vendedor; será solicitada confirmação do vínculo.':
 'Encontradas '+unique.size+' campanhas. Selecione uma acima para importar os indicadores.','warn');
 changes++;
}
function campaignFilled(c,start,end){
 lastCampaign=String(c.campaignId||'');
 if(![...selected.options].some(o=>o.value===lastCampaign))
  selected.innerHTML='<option value="'+escapeText(lastCampaign)+'">ID '+escapeText(lastCampaign)+' · '+escapeText(c.productTitle||c.name||'Campanha')+'</option>';
 selected.value=lastCampaign;selected.disabled=false;
 const required=[];
 if(byId('budgetMode').value==='daily'&&!(val('budget')>0))required.push('orçamento diário real');
 if(!(val('target')>0))required.push('meta de ROAS');
 if(required.length){
  status('Dados da campanha '+lastCampaign+' importados. O diagnóstico já está disponível à direita. Falta confirmar: '+required.join(' e ')+'.','warn');
  help('O diagnóstico já pode ser consultado. Para calcular o cenário por consumo de orçamento, confirme '+required.join(' e ')+'.');
  renderProvisional(getData(),validate(getData()));
 }else if(byId('budgetMode').value==='daily'&&!byId('budgetStable').checked){
  status('Campanha '+lastCampaign+' consultada. Configuração de orçamento ATUAL carregada; não é histórico confirmado.','warn');
  help('A Shopee informou o orçamento atual. Só marque Orçamento constante se ele realmente não mudou durante os dias escolhidos.');
 }else{
  status('Campanha '+lastCampaign+' consultada. Diagnóstico exibido à direita.','good');
  help('');
 }
 changes++;
}

const preview=document.createElement('section');
preview.className='ads-provisional';
preview.hidden=true;
preview.setAttribute('aria-label','Diagnóstico parcial de Shopee Ads');
byId('resultEmpty').after(preview);
function clearPreview(){
 preview.hidden=true;
}
function isProvisional(){return !preview.hidden;}
function renderProvisional(d,errors=[]){
 // Não classificar consumo nem inventar orçamento: só resumo confiável da API.
 if(!d||!d.sku||d.sku!==byId('productSelect').value||!Array.isArray(errors)||!errors.length)return false;
 const allowed=/Informe um orçamento diário maior que zero|Informe um ROAS alvo maior que zero/;
 if(errors.some(x=>!allowed.test(x)))return false;
 if(d.spent===null||d.spent<0||(d.revenue===null&&d.actual===null))return false;
 const realised=d.spent>0?(d.revenue!==null?d.revenue/d.spent:d.actual):null;
 const ctr=d.impressions>0&&d.clicks!==null?d.clicks/d.impressions*100:null;
 const finance=calcFinance(d,realised);
 const min=finance&&Number.isFinite(finance.minRoas)?finance.minRoas:null;
 const balance=finance&&Number.isFinite(finance.breakeven)?finance.breakeven:null;
 let headline='Acompanhar antes de alterar';
 let advice='Ainda não há volume suficiente para concluir o desempenho. Mantenha a campanha em observação e confira os dados do anúncio.';
 if(realised!==null&&finance&&(!Number.isFinite(finance.breakeven)||realised<finance.breakeven)){
  headline='Risco de margem negativa';
  advice='O ROAS realizado está abaixo do equilíbrio estimado pelo cadastro. Revise preço, custo WeDrop, taxas e atribuição das vendas antes de manter ou aumentar os gastos.';
 }else if(realised!==null&&finance&&(!Number.isFinite(finance.minRoas)||realised<finance.minRoas)){
  headline='Margem desejada não atingida';
  advice='O ROAS da campanha está abaixo do necessário para a margem desejada cadastrada. Não aumente o investimento e verifique a rentabilidade antes de reduzir a meta.';
 }else if(realised!==null&&d.target>0&&realised<d.target){
  headline='ROAS abaixo da meta';
  advice='O ROAS realizado não alcançou a meta. Revise custo, preço, frete e o potencial de conversão sem modificar vários elementos ao mesmo tempo.';
 }else if(d.clicks!==null&&d.clicks<20){
  headline='Poucos cliques para concluir';
  advice='A quantidade de cliques ainda é pequena. Acompanhe mais dias antes de uma decisão de orçamento ou mudança de capa.';
 }
 if(ctr!==null&&d.impressions>=100&&ctr<1){
  advice+=' O CTR está abaixo da referência interna de 1%; vale comparar capa e título, mas isso não comprova que a imagem seja o problema.';
 }
 const brMoney=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const brNum=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:0});
 const brRatio=value=>value===null||!Number.isFinite(value)?'—':value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'x';
 const brPct=value=>value===null||!Number.isFinite(value)?'—':value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
 const label=(name,value)=>'<div><small>'+escapeText(name)+'</small><strong>'+escapeText(value)+'</strong></div>';
 const note=errors.some(x=>/orçamento diário/.test(x))?
  'O orçamento diário não foi confirmado. O diagnóstico acima está disponível, mas os quatro cenários de consumo ficam pendentes.':
  'A meta de ROAS não foi confirmada. O diagnóstico de vendas e margem continua disponível.';
 preview.innerHTML='<span class="ads-provisional-head">DIAGNÓSTICO DOS DADOS DISPONÍVEIS</span>'+
  '<h3>'+escapeText(headline)+'</h3>'+
  '<p class="ads-p-meta">'+escapeText(d.campaign)+' · '+escapeText(d.dateStart.split('-').reverse().join('/')+' a '+d.dateEnd.split('-').reverse().join('/'))+'</p>'+
  '<div class="ads-p-kpis">'+
   label('Investimento',brMoney(d.spent))+
   label('ROAS realizado',brRatio(realised))+
   label('Vendas atribuídas',d.revenue===null?'Não informado':brMoney(d.revenue))+
   label('Cliques / CTR',brNum(d.clicks)+' / '+brPct(ctr))+
   label('Meta de ROAS',d.target>0?brRatio(d.target):'Não confirmada')+
   label('ROAS p/ margem desejada',min===null?(finance?'Inviável':'Não validado'):brRatio(min))+
   '</div>'+
  '<div class="ads-p-action"><strong>'+escapeText(headline)+'</strong>'+escapeText(advice)+'</div>'+
  '<p class="ads-p-note">Base: dados da campanha selecionada. GMV amplo da Shopee pode incluir outros produtos e não representa lucro líquido. Comparações de margem são estimativas conforme o cadastro.</p>'+
  '<p class="ads-p-warn">'+escapeText(note)+'</p>';
 preview.hidden=false;
 byId('resultContent').hidden=true;
 byId('resultEmpty').style.display='none';
 byId('resultTimestamp').textContent='Diagnóstico parcial · '+d.dateStart.split('-').reverse().join('/')+' a '+d.dateEnd.split('-').reverse().join('/');
 return true;
}
window.RedeAdsQuick={showChoices,campaignFilled,clearPreview,isProvisional,renderProvisional};
e('quickComplete').addEventListener('click',()=>{
 const key=byId('budgetMode').value==='daily'&&!(val('budget')>0)?'budget':
  !(val('target')>0)?'target':
  byId('budgetMode').value==='daily'&&!byId('budgetStable').checked?'budgetStable':'budget';
 byId(key).scrollIntoView({behavior:'smooth',block:'center'});byId(key).focus();
});
async function consult(){
 if(window.RedeAdsHistory?.isSelected?.())return window.RedeAdsHistory.consult();
 const sku=byId('productSelect').value;
 if(!sku){status('Selecione um produto primeiro.','warn');return}
 if(active){queued=true;return}
 active=true;const revision=changes;
 button.disabled=true;button.textContent='Consultando...';clearCampaign();
 try{
  status('Consultando indicadores oficiais da Shopee…');
  await apiLoadRange(false);
  if(byId('productSelect').value!==sku)return;
  if(changes===revision){
   const api=byId('apiStatus');
   status(api.textContent||'Não foi possível confirmar a campanha.',api.classList.contains('error')?'error':'warn');
  }
 }catch(err){status('Erro: '+String(err.message||err),'error')}
 finally{
  active=false;button.disabled=false;button.textContent='Consultar e analisar';
  if(queued){queued=false;void consult()}
 }
}
button.addEventListener('click',()=>{setDates();void consult()});
period.addEventListener('change',()=>{if(byId('productSelect').value){setDates();void consult()}});
selected.addEventListener('change',()=>{
 const id=selected.value;
 if(window.RedeAdsHistory?.isSelected?.())return window.RedeAdsHistory.chooseCampaign(id);
 if(!id||!pendingApiCampaigns)return;
 byId('apiCampaignSearch').value=id;refreshApiCampaignChoices();
 byId('apiCampaignChoice').value=id;
 if(byId('apiCampaignChoice').value!==id){
  status('Não foi possível selecionar esse ID. Consulte novamente.','error');return;
 }
 // Executa a mesma confirmação de vínculo já existente; não modifica anúncios.
 byId('apiApplyCampaignBtn').click();
});
byId('productSelect').addEventListener('change',event=>{
 if(!event.isTrusted)return; // Não substituir período de comparação aberto pelo Histórico.
 const sku=byId('productSelect').value;
 if(!sku){
  latestProduct='';lastCampaign='';selected.disabled=true;
  selected.innerHTML='<option value="">Escolha um produto</option>';status('Selecione um produto para consultar.');help('');return;
 }
 if(sku===latestProduct)return;
 latestProduct=sku;lastCampaign='';
 window.RedeAdsHistory?.onProductChange?.(sku);
 for(const id of ['spent','revenue','actual','impressions','clicks','ctrReported','orders','itemsSold','addToCart','budget'])byId(id).value='';
 byId('budgetMode').value='daily';updateBudgetMode();
 setDates();void consult();
});
if(byId('productSelect').value){
 latestProduct=byId('productSelect').value;setDates();
 status('Produto selecionado. Clique em Consultar e analisar para carregar as campanhas.');
}
})();