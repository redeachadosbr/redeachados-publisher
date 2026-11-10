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
  status('Indicadores importados da campanha '+lastCampaign+' ('+start+' a '+end+'). Falta confirmar '+required.join(' e ')+'.','warn');
  help('Esses valores não foram fornecidos pela consulta da API. Preencha-os conforme a configuração da campanha na Shopee para concluir a decisão.');
 }else{
  status('Campanha '+lastCampaign+' consultada. A decisão foi exibida no painel à direita.','good');
  help('');
 }
 changes++;
}
window.RedeAdsQuick={showChoices,campaignFilled};
e('quickComplete').addEventListener('click',()=>{
 const key=byId('budgetMode').value==='daily'&&!(val('budget')>0)?'budget':'target';
 byId(key).scrollIntoView({behavior:'smooth',block:'center'});byId(key).focus();
});
async function consult(){
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
 const id=selected.value;if(!id||!pendingApiCampaigns)return;
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
 for(const id of ['spent','revenue','actual','impressions','clicks','ctrReported','orders','itemsSold','addToCart','budget'])byId(id).value='';
 byId('budgetMode').value='daily';updateBudgetMode();
 setDates();void consult();
});
if(byId('productSelect').value){
 latestProduct=byId('productSelect').value;setDates();
 status('Produto selecionado. Clique em Consultar e analisar para carregar as campanhas.');
}
})();