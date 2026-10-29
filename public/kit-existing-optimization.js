// Interface de otimização de um anúncio de kit já existente. Preparação nunca publica.
const $=selector=>document.querySelector(selector);
export function initExistingKitOptimization({getContext,api,money,onMainSkuChange}){
 let target=null,busy=false,discountToken=null,discountLookupSeq=0,discountSearching=false,latestCampaigns=[];
 let lookupSerial=0,lookupController=null;
 const ctx=()=>getContext(),kitSku=()=>ctx().prepared?.kit?.kitSku||'';
 function notice(message,state='info'){
  const el=$('#kitOptimizeStatus');if(el){el.textContent=message;el.dataset.state=state;}
 }
 function paint(){
  const {kitSaved}=ctx(),valid=Boolean(target&&target.kitSku===kitSku());
  $('#kitOptimizeLookup').disabled=busy||!kitSaved;
  $('#kitOptimizeDeepLookup').disabled=busy||!kitSaved;
  $('#kitOptimizeCancelLookup').hidden=!lookupController;
  $('#kitOptimizeStart').disabled=busy||!kitSaved;
  $('#kitOptimizePrepare').disabled=busy||!kitSaved||!valid||!$('#kitOptimizeConfirm').checked;
  $('#kitOptimizeImages').disabled=busy||!kitSaved||!valid||!target.prepared;
  $('#kitOptimizeOpen').disabled=busy||!kitSaved||!valid||!target.prepared;
  $('#kitOptimizeDiscountPreview').disabled=busy||discountSearching||!kitSaved||!valid||!target.prepared||!$('#kitOptimizeDiscountId').value;
  $('#kitOptimizeDiscountRefresh').disabled=discountSearching||!kitSaved||!$('#kitOptimizeMainSku').value;
 }
 function syncWorkflowCampaigns(){
  const section=$('#optimizerExecDiscountFinal'),workspace=$('#kitOptimizerWorkspace');
  if(!section||workspace?.hidden)return;
  let wrapper=section.querySelector('#kitWorkflowCampaignChooser');
  if(!wrapper){
   wrapper=document.createElement('div');wrapper.id='kitWorkflowCampaignChooser';
   wrapper.className='kit-workflow-campaign-chooser';
   const label=document.createElement('label');label.textContent='Minha Promoção do kit';
   const picker=document.createElement('select');picker.id='kitWorkflowCampaignPicker';
   picker.setAttribute('aria-label','Escolha a campanha Minha Promoção para a etapa 08');
   picker.addEventListener('change',()=>{
    const input=$('#optimizerExecDiscountCampaign');
    if(input){input.value=picker.value;input.dispatchEvent(new Event('input',{bubbles:true}));}
   });
   label.append(picker);
   const refresh=document.createElement('button');refresh.type='button';
   refresh.className='secondary';refresh.textContent='↻ Atualizar campanhas';
   refresh.addEventListener('click',()=>void resolveDiscountIds());
   wrapper.append(label,refresh);
   const controls=section.querySelector('.optimizer-exec-discount-controls');
   if(controls)section.insertBefore(wrapper,controls);
   else section.append(wrapper);
  }
  const select=wrapper.querySelector('select'),current=$('#optimizerExecDiscountCampaign')?.value||'';
  select.replaceChildren(new Option('Selecione uma campanha da sua loja',''));
  for(const c of latestCampaigns)
   select.append(new Option(c.name+' · ID '+c.discountId+
    ' · '+(c.status==='ongoing'?'Ativa':'Programada')+
    (c.containsKit?' · KIT confirmado':''),c.discountId));
  if([...select.options].some(o=>o.value===current))select.value=current;
  wrapper.hidden=!latestCampaigns.length;
  const original=$('#optimizerExecDiscountCampaign')?.closest('label');
  if(original)original.classList.toggle('kit-workflow-original-campaign',Boolean(latestCampaigns.length));
 }
 function resetDiscountDiscovery(){
  ++discountLookupSeq;discountSearching=false;discountToken=null;latestCampaigns=[];
  $('#kitWorkflowCampaignChooser')?.remove();
  $('#optimizerExecDiscountCampaign')?.closest('label')?.classList.remove('kit-workflow-original-campaign');
  $('#kitOptimizeDiscountBox').hidden=true;
  $('#kitOptimizeKitItemId').value='';$('#kitOptimizePrimaryItemId').value='';
  $('#kitOptimizeDiscountId').replaceChildren(new Option('Consultar campanhas da Shopee',''));
  const msg=$('#kitOptimizeDiscountAutoStatus');
  msg.textContent='Selecione a SKU Principal para consultar anúncios e campanhas.';
  msg.dataset.state='info';
 }
 async function resolveDiscountIds(){
  const {kitSaved}=ctx(),current=kitSku(),main=$('#kitOptimizeMainSku').value;
  const seq=++discountLookupSeq,select=$('#kitOptimizeDiscountId'),msg=$('#kitOptimizeDiscountAutoStatus');
  discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
  select.replaceChildren(new Option('Consultando Shopee...',''));
  $('#kitOptimizeKitItemId').value=target?.itemId||ctx().prepared?.optimization?.itemId||'';
  $('#kitOptimizePrimaryItemId').value='';
  if(!kitSaved||!current||!main){
   select.replaceChildren(new Option('Selecione uma SKU Principal',''));
   msg.textContent='Selecione um kit salvo e sua SKU Principal.';msg.dataset.state='info';paint();return;
  }
  discountSearching=true;paint();
  msg.textContent='Consultando IDs e Minha Promoção da loja Shopee...';msg.dataset.state='info';
  try{
   const data=await api('/api/shopee/kits/discount/candidates?'+
    new URLSearchParams({kitSku:current,mainSku:main}));
   if(seq!==discountLookupSeq||kitSku()!==current||$('#kitOptimizeMainSku').value!==main)return;
   $('#kitOptimizeKitItemId').value=data.kitItemId||target?.itemId||'';
   const primary=Array.isArray(data.primaryItems)?data.primaryItems:[];
   $('#kitOptimizePrimaryItemId').value=primary.length===1?String(primary[0].itemId):
    primary.length>1?'Vários anúncios — conferir':'Não confirmado';
   const campaigns=Array.isArray(data.campaigns)?data.campaigns:[];
   latestCampaigns=campaigns;
   select.replaceChildren(new Option(campaigns.length?'Selecione a campanha':'Nenhuma campanha confirmada',''));
   for(const c of campaigns){
    const member=c.containsKit?' · KIT incluído':c.containsPrimary?' · Principal incluída':' · Disponível';
    select.append(new Option(c.name+' · ID '+c.discountId+' · '+
     (c.status==='ongoing'?'Ativa':'Programada')+member,c.discountId));
   }
   const suggested=String(data.suggested?.discountId||'');
   if(data.complete===true&&suggested&&[...select.options].some(o=>o.value===suggested)){
    select.value=suggested;
    const input=$('#optimizerExecDiscountCampaign');
    if(input&&!input.value){input.value=suggested;input.dispatchEvent(new Event('input',{bubbles:true}));}
   }
   msg.textContent=(!data.kitItemId?'Vincule o anúncio do KIT antes de aplicar desconto. ':'')+
    (!primary.length?' SKU Principal sem Item ID confirmado na busca rápida. ':'')+
    (campaigns.length?'Shopee confirmou '+campaigns.length+' campanha(s). '+
     (select.value?'ID '+select.value+' sugerido — confirme na prévia.':'Selecione a campanha correta.'):
     'Nenhuma campanha ativa ou programada confirmada.')+
    (data.complete===false?' Consulta parcial: confira na Shopee.':'')+
    (data.warnings?.length?' '+data.warnings.join(' | '):'');
   msg.dataset.state=data.complete===false||!data.kitItemId?'warning':campaigns.length?'success':'info';
   syncWorkflowCampaigns();
  }catch(e){
   if(seq!==discountLookupSeq)return;
   latestCampaigns=[];syncWorkflowCampaigns();
   select.replaceChildren(new Option('Consulta indisponível',''));
   msg.textContent='Não foi possível consultar os IDs: '+e.message+'. Nenhum ID foi presumido.';
   msg.dataset.state='error';
  }finally{if(seq===discountLookupSeq){discountSearching=false;paint();}}
 }
 function restore(link=null){
  lookupController?.abort();lookupSerial++;lookupController=null;busy=false;
  globalThis.redeKitCloseOptimizerWorkspace?.();
  target=link?.itemId?{...link,prepared:true}:null;
  resetDiscountDiscovery();
  const select=$('#kitOptimizeMainSku');
  select.replaceChildren(new Option('Selecione o SKU principal',''));
  for(const x of ctx().prepared?.kit?.components||[])
   select.append(new Option(x.sku+' · '+x.name,x.sku));
  const main=link?.mainSku||$('#kitPrincipalSku')?.value||ctx().prepared?.kit?.components?.[0]?.sku;
  if(main&&[...select.options].some(o=>o.value===main))select.value=main;
  $('#kitOptimizeListingSku').value=link?.sku||kitSku();
  $('#kitOptimizeCandidates').replaceChildren();
  $('#kitOptimizeConfirm').checked=false;
  $('#kitOptimizeSelected').textContent=link?.itemId?
   'Anúncio vinculado: Item ID '+link.itemId+' · SKU '+link.sku+' · Modelo '+link.modelId:
   'Escolha o Item ID do anúncio de kit que já está em Produtos Shopee.';
  paint();
  // Evitar consulta demorada de dezenas de campanhas antes da etapa 08.
 }
 async function lookup({automatic=false,deep=false}={}){
  const {kitSaved}=ctx(),code=$('#kitOptimizeListingSku').value.trim(),current=kitSku();
  if(busy||!kitSaved||!current)return null;
  if(!code)return notice('Informe a SKU do anuncio completo do kit.','error');
  if((ctx().prepared?.kit?.components||[]).some(x=>String(x.sku)===code)){
   $('#kitOptimizeAdvanced').open=true;
   return notice('A SKU '+code+' e de um componente. Informe a SKU do anuncio de KIT.','warning');
  }
  const seq=++lookupSerial,controller=new AbortController();
  lookupController=controller;busy=true;target=null;resetDiscountDiscovery();
  $('#kitOptimizeConfirm').checked=false;paint();
  const root=$('#kitOptimizeCandidates');root.replaceChildren();
  $('#kitOptimizeSelected').textContent='Verificando SKU do KIT na Shopee...';
  notice(deep?'Pesquisando catalogo completo para '+code+' (consulta opcional)...':
   'Buscando SKU exata '+code+' diretamente na Shopee...');
  globalThis.RAKitLookupPhase?.('Localizando SKU do KIT · somente leitura na Shopee.');
  const reminder=setTimeout(()=>{
   if(seq===lookupSerial)notice('A Shopee ainda esta respondendo. Voce pode cancelar esta consulta.','warning');
  },6500);
  try{
   const endpoint=deep?'/api/shopee/optimizer/find?'+new URLSearchParams({sku:code,deep:'1'}):
    '/api/shopee/kits/optimization/find?'+new URLSearchParams({kitSku:current,sku:code});
   const data=await api(endpoint,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(deep?45000:18000)])});
   if(seq!==lookupSerial||kitSku()!==current)return null;
   const matches=(data.matches||[]).filter(x=>['NORMAL','UNLIST'].includes(String(x.status).toUpperCase()));
   if(!matches.length){
    $('#kitOptimizeAdvanced').open=true;
    $('#kitOptimizeSelected').textContent='Anuncio do KIT nao localizado';
    notice('A Shopee nao confirmou o anuncio de KIT com SKU '+code+'. O rascunho WeDrop nao cria esse anuncio. Confira a SKU ou utilize Criar Kit Formal na Shopee.','warning');
    globalThis.RAKitLookupPhase?.('Busca concluida sem Item ID do KIT. Nenhum anuncio foi modificado.');
    return null;
   }
   const choose=m=>{
    target={kitSku:current,sku:code,itemId:String(m.itemId),
     modelId:String(m.modelId??'0'),prepared:false,autoVerified:automatic&&matches.length===1};
    $('#kitOptimizeConfirm').checked=Boolean(target.autoVerified);
    $('#kitOptimizeSelected').textContent='Item ID '+m.itemId+' · SKU '+code;
    notice(target.autoVerified?'SKU exata e Item ID confirmados. Validando o kit...':
     'Anuncio encontrado. Confirme que representa o kit completo.','success');
    globalThis.RAKitLookupPhase?.('Item ID '+m.itemId+' confirmado na consulta da Shopee.');
    paint();
   };
   if(automatic&&matches.length===1){choose(matches[0]);return target;}
   $('#kitOptimizeAdvanced').open=true;
   for(const m of matches){
    const button=document.createElement('button');button.type='button';button.className='kit-secondary';
    button.textContent='Item ID '+m.itemId+' · '+(m.title||code)+' · Modelo '+String(m.modelId??'0');
    button.addEventListener('click',()=>{if(kitSku()===current)choose(m);});
    root.append(button);
   }
   notice('Encontrados '+matches.length+' anuncios. Selecione o Item ID do KIT e confirme antes de prosseguir.','warning');
   return null;
  }catch(e){
   if(seq!==lookupSerial)return null;
   $('#kitOptimizeAdvanced').open=true;
   $('#kitOptimizeSelected').textContent='Consulta sem confirmacao';
   const timeout=e.name==='TimeoutError'||e.name==='AbortError';
   notice(timeout?'Busca interrompida por demora. Tente novamente ou use a pesquisa completa nas opcoes avancadas.':
    'Consulta nao concluida: '+e.message,'error');
   globalThis.RAKitLookupPhase?.('Consulta encerrada sem validacao da SKU; nao houve publicacao.');
   return null;
  }finally{
   clearTimeout(reminder);
   if(seq===lookupSerial){busy=false;lookupController=null;paint();}
  }
 }
 async function prepare(){
  if(busy||!target||!ctx().kitSaved)return;
  if(!$('#kitOptimizeConfirm').checked)return notice('Confirme o Item ID do kit.','error');
  const primary=$('#kitOptimizeMainSku').value;
  if(!primary)return notice('Selecione o SKU principal WeDrop.','error');
  const selected={...target},current=kitSku();
  busy=true;paint();notice('Revalidando custo completo do kit e anúncio Shopee...');
  globalThis.RAKitLookupPhase?.('Validando custos de todos os componentes e Item ID antes da revisao.');
  try{
   const result=await api('/api/shopee/kits/optimization/prepare',{signal:AbortSignal.timeout(35000),body:{
    kitSku:current,sku:selected.sku,itemId:selected.itemId,modelId:selected.modelId,
    mainSku:primary,confirmedItemId:selected.itemId
   }});
   if(kitSku()!==current)return;
   target={kitSku:current,...result.target,prepared:true};
   discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
   // Consulta de campanhas somente quando abrir a etapa 08.
   notice('✓ Item ID '+result.target.itemId+' vinculado. Custo total do kit: '+
    money(result.quote.kitCost)+'. Revise o título, as imagens e os campos fiscais. '+
    (result.warnings||[]).join(' '),'success');
   return target;
  }catch(e){notice('Preparação bloqueada: '+e.message,'error');return null;}
  finally{busy=false;paint();}
 }
 async function convert(data){
  const response=await fetch(data),blob=await response.blob();
  if(['image/png','image/jpeg'].includes(blob.type))return blob;
  const image=new Image();image.src=data;await image.decode();
  const canvas=document.createElement('canvas');
  canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  canvas.getContext('2d').drawImage(image,0,0);
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!png)throw Error('Não foi possível converter esta foto em PNG.');
  return png;
 }
 async function transferImages({automatic=false,optional=false}={}){
  if(busy||!target?.prepared)return;
  const selected={...target},current=kitSku(),{images,kitPhotoStore}=ctx();
  busy=true;paint();
  try{
   const saved=await kitPhotoStore.list(current);
   for(const row of saved){
    if(Number.isInteger(row.slot)&&row.slot>=1&&row.slot<=9&&!images.has(row.slot))
     images.set(row.slot,row.dataUrl);
   }
   if(Array.from({length:9},(_,i)=>i+1).some(n=>!images.has(n))){
    if(optional)return false;
    throw Error('Complete as nove imagens do kit antes de importar para revisão.');
   }
   if(!automatic&&!window.confirm('Importar 9 imagens para a REVISÃO do Item ID '+selected.itemId+
    '? A Shopee ainda não terá imagens publicadas.'))return;
   for(let slot=1;slot<=9;slot++){
    if(kitSku()!==current||target?.itemId!==selected.itemId)
     throw Error('O kit ou Item ID mudou durante a importação.');
    notice('Importando imagem '+slot+'/9 para a revisão do Item ID '+selected.itemId+'...');
    globalThis.RAKitLookupPhase?.('Importacao de imagens: '+slot+'/9 para revisao, sem publicar.');
    const blob=await convert(images.get(slot));
    const params=new URLSearchParams({kit_sku:current,slot:String(slot)});
    const response=await fetch('/api/shopee/kits/optimization/image?'+params,{
     method:'POST',headers:{'Content-Type':blob.type},body:blob
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error('Imagem '+slot+': '+(result.error||'não confirmada'));
   }
   notice('✓ Nove imagens preparadas na revisão. Nenhuma foto foi publicada.','success');
   return true;
  }catch(e){notice('Importação interrompida: '+e.message+
   '. As imagens já confirmadas permanecem armazenadas.','error');return false;}
  finally{busy=false;paint();}
 }
 async function startKitOptimization(){
  const state=ctx(),kit=state.prepared?.kit;
  if(!kit)return notice('Primeiro selecione um kit inteligente.','error');
  if(!state.kitSaved){
   notice('Salve o rascunho do kit antes da otimização.','error');
   $('#kitSaveDraft')?.scrollIntoView({behavior:'smooth',block:'center'});return;
  }
  let main=$('#kitOptimizeMainSku').value;
  if(!main){
   main=$('#kitPrincipalSku')?.value||kit.components?.[0]?.sku||'';
   if(main&&[...$('#kitOptimizeMainSku').options].some(o=>o.value===main))
    $('#kitOptimizeMainSku').value=main;
  }
  if(!main)return notice('Selecione o SKU Principal do kit.','error');
  if(!target||target.kitSku!==kitSku()){
   if(!await lookup({automatic:true}))return;
  }
  let newlyPrepared=false;
  if(!target.prepared){
   if(!target.autoVerified&&!$('#kitOptimizeConfirm').checked){
    $('#kitOptimizeAdvanced').open=true;
    return notice('Confirme que o Item ID escolhido é o anúncio do kit completo.','warning');
   }
   if(!await prepare())return;
   newlyPrepared=true;
  }
  const btn=$('#kitOptimizeStart');
  btn.disabled=true;btn.textContent='Preparando etapas...';
  try{
   notice('Abrindo as oito etapas do kit. As imagens estao sendo preparadas sem bloquear a tela.','info');
   globalThis.RAKitLookupPhase?.('Carregando o fluxo de oito etapas no Kit.');
   open();
   if(newlyPrepared)void transferImages({automatic:true,optional:true});
  }finally{btn.disabled=false;btn.textContent='↻ Continuar otimização do kit';}
 }
 globalThis.RAKitOptimizerReady=data=>{
  if(data?.kitOptimization?.kitSku!==kitSku())return;
  notice('Fluxo do kit carregado: siga as etapas 01 a 08 e depois Prévia e execução.','success');
  $('#kitOptimizeStart').textContent='↻ Continuar otimização do kit';
  $('#kitOptimizerWorkspace')?.scrollIntoView({behavior:'smooth',block:'start'});
 };
 function open(){
  if(!target?.prepared||target.kitSku!==kitSku())
   return notice('Prepare o vínculo do anúncio antes de abrir a revisão.','error');
  if(typeof globalThis.redeKitOpenOptimizerTarget!=='function'||
    !globalThis.redeKitOpenOptimizerTarget({...target,
     targetMarginPct:Number(ctx().prepared?.kit?.quote?.targetMarginPct),
     shipping:Number(ctx().prepared?.kit?.shipping||0),
     packing:Number(ctx().prepared?.kit?.packing||0)}))
   notice('Não foi possível abrir a Otimização. Atualize a página e tente novamente.','error');
 }
 function discountNotice(msg,state='info'){
  const el=$('#kitOptimizeDiscountStatus');if(el){el.textContent=msg;el.dataset.state=state;}
 }
 async function previewDiscount(){
  if(busy||!target?.prepared)return;
  const current=kitSku(),discountId=$('#kitOptimizeDiscountId').value.trim();
  if(!/^[1-9]\d{0,17}$/.test(discountId))
   return discountNotice('Informe o ID válido da Minha Promoção Shopee.','error');
  busy=true;discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;paint();
  discountNotice('Conferindo a execução do kit, valores e campanha na Shopee...');
  try{
   const result=await api('/api/shopee/kits/discount/preview',{body:{kitSku:current,discountId}});
   if(kitSku()!==current)return;
   discountToken=result.token;
   $('#kitOptimizeDiscountSummary').textContent=[
    'Kit: '+current,'Anúncio Item ID: '+result.itemId,
    'Campanha: '+result.discountName+' (ID '+result.discountId+')',
    'Preço bruto: '+money(result.gross),'Preço promocional: '+money(result.promo),
    'Preço após cupom (estimado): '+money(result.afterCoupon),
    'Margem líquida estimada: '+Number(result.margin).toFixed(2)+'%',
    'Ofertas comparáveis verificadas: '+result.marketOffers,
    'Ação: '+(result.action==='update'?'Atualizar desconto':'Incluir nesta promoção'),
    'A Shopee ainda NÃO foi alterada.'
   ].join('\n');
   $('#kitOptimizeDiscountBox').hidden=false;
   discountNotice('Prévia confirmada. Confira os valores e autorize no botão abaixo.','success');
  }catch(e){discountNotice('Desconto bloqueado: '+e.message,'error');}
  finally{busy=false;paint();}
 }
 async function applyDiscount(){
  if(!target?.prepared||!discountToken||busy)return;
  const current=kitSku(),discountId=$('#kitOptimizeDiscountId').value.trim();
  if(!window.confirm('Aplicar desconto do kit '+current+' na campanha '+discountId+
   '? Esta ação ALTERA o anúncio existente na Shopee. Confirme somente após revisar os valores.'))return;
  const token=discountToken;discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
  busy=true;paint();discountNotice('Enviando desconto à Shopee; não repita se a resposta for incerta...');
  try{
   const result=await api('/api/shopee/kits/discount/execute',{body:{
    kitSku:current,discountId,token,confirm:true
   }});
   if(result.status==='discount_confirmed')
    globalThis.RAKitDiscountConfirmed?.({kitSku:current,itemId:String(result.itemId)});
   discountNotice(result.status==='discount_confirmed'?
    '✓ Desconto confirmado no anúncio '+result.itemId+' · Preço '+money(result.promo):
    (result.message||'Resposta pendente de conferência na Shopee.'),
    result.status==='discount_confirmed'?'success':'info');
  }catch(e){discountNotice('Status não confirmado: '+e.message+
   '. Confira Minha Promoção na Shopee ANTES de reenviar.','error');}
  finally{busy=false;paint();}
 }
 $('#kitOptimizeDiscountPreview')?.addEventListener('click',()=>void previewDiscount());
 $('#kitOptimizeDiscountApply')?.addEventListener('click',()=>void applyDiscount());
 $('#kitOptimizeDiscountId')?.addEventListener('change',()=>{
  discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;paint();
 });
 $('#kitOptimizeDiscountRefresh')?.addEventListener('click',()=>void resolveDiscountIds());
 $('#kitOptimizeLookup')?.addEventListener('click',()=>void lookup());
 $('#kitOptimizeDeepLookup')?.addEventListener('click',()=>void lookup({deep:true}));
 $('#kitOptimizeCancelLookup')?.addEventListener('click',()=>{
  lookupSerial++;lookupController?.abort();lookupController=null;busy=false;
  notice('Consulta cancelada. Nenhuma alteracao foi enviada a Shopee.','warning');
  globalThis.RAKitLookupPhase?.('Consulta cancelada antes de vincular o anuncio.');
  paint();
 });
 globalThis.RAKitDiscountStageOpened=()=>{
  if(target?.prepared&&!discountSearching)void resolveDiscountIds();
 };
 $('#kitOptimizeStart')?.addEventListener('click',()=>void startKitOptimization());
 $('#kitWorkflowImportImages')?.addEventListener('click',()=>void transferImages());
 $('#kitOptimizePrepare')?.addEventListener('click',()=>void prepare());
 $('#kitOptimizeImages')?.addEventListener('click',()=>void transferImages());
 $('#kitOptimizeOpen')?.addEventListener('click',open);
 $('#kitOptimizeConfirm')?.addEventListener('change',paint);
 $('#kitOptimizeMainSku')?.addEventListener('change',()=>{
  lookupSerial++;lookupController?.abort();lookupController=null;busy=false;
  globalThis.redeKitCloseOptimizerWorkspace?.();
  if(target)target.prepared=false;
  onMainSkuChange?.($('#kitOptimizeMainSku').value);
  void resolveDiscountIds();paint();
 });
 $('#kitOptimizeListingSku')?.addEventListener('input',()=>{
  lookupSerial++;lookupController?.abort();lookupController=null;busy=false;
  globalThis.redeKitCloseOptimizerWorkspace?.();
  target=null;resetDiscountDiscovery();
  $('#kitOptimizeConfirm').checked=false;
  $('#kitOptimizeSelected').textContent='SKU alterada. Localize novamente o anúncio correto.';
  paint();
 });
 return {restore};
}
