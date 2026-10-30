// Interface de otimização de um anúncio de kit já existente. Preparação nunca publica.
const $=selector=>document.querySelector(selector);
const USER_CONFIRMED_KIT_TARGETS=Object.freeze({'KIT-103006-CO6968126-TRC7085':'58271858695'});
const KIT_STAGE_LABELS=[['video','Vídeo'],['technical','Ficha técnica'],['fiscal','Dados fiscais'],['variants','Variações']];
export function initExistingKitOptimization({getContext,api,money,onMainSkuChange}){
 let target=null,busy=false,discountToken=null,discountLookupSeq=0,discountSearching=false,latestCampaigns=[];
 let lookupSerial=0,lookupController=null;
 let workflowStages=null,technicalProgress=null,discountConfirmed=false;
 const imageSyncAttempts=new Set();
 function renderJourney(){
  const list=$('#kitOptimizeStageSteps'),track=$('#kitOptimizeProgressTrack');
  if(!list||!track)return;
  list.replaceChildren();
  let reviewed=0;
  const steps=KIT_STAGE_LABELS.filter(([key])=>key!=='variants'||
   workflowStages?.some(x=>x.key==='variants'&&!x.skipped));
  for(const [index,[key,label]] of steps.entries()){
   const stage=workflowStages?.find(x=>x.key===key);
   const done=stage?.reviewed===true;
   const skipped=stage?.skipped===true;
   if(done||skipped)reviewed++;
   const item=document.createElement('li');
   item.className='kit-flow-stage is-'+(done?'done':skipped?'skipped':stage?.blocking?'attention':'pending');
   const number=document.createElement('span');number.className='kit-flow-stage-number';
   number.textContent=done?'✓':skipped?'—':String(index+1).padStart(2,'0');
   const title=document.createElement('strong');title.textContent=label;
   const state=document.createElement('small');
   state.textContent=done?'Conferida':skipped?'Nao aplicavel':stage?.blocking?'Revisar':
    stage?'Pendente':'Aguardando';
   item.append(number,title,state);list.append(item);
  }
  track.setAttribute('aria-valuemax',String(steps.length));
  track.setAttribute('aria-valuenow',String(reviewed));
  $('#kitOptimizeProgressFill').style.width=(steps.length?reviewed/steps.length*100:0)+'%';
  $('#kitOptimizeProgressCount').textContent=reviewed+' / '+steps.length+' complementares conferidas';
 }
 function renderTechnical(){
  const block=$('#kitOptimizeLiveProgress');
  if(!block)return;
  block.replaceChildren();
  block.hidden=!technicalProgress;
  if(!technicalProgress)return;
  const p=technicalProgress,pct=Math.max(0,Math.min(100,Number(p.percent)||0));
  const title=document.createElement('strong');
  title.textContent='Progresso tecnico da Shopee: '+pct+'% · '+String(p.title||'Aguardando');
  const track=document.createElement('div');track.className='kit-flow-live-track';
  track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');
  track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(pct));
  const fill=document.createElement('span');fill.style.width=pct+'%';track.append(fill);
  const note=document.createElement('small');
  note.textContent=String(p.message||'')+
   ' O percentual indica progresso tecnico, nao confirma que todas as etapas foram publicadas.';
  block.append(title,track,note);
  for(const stage of (p.steps||[]).slice(0,8)){
   const line=document.createElement('small');
   const names={done:'Confirmado',staged:'Midia pronta',checking:'Verificando Shopee',
    active:'Em andamento',waiting:'Aguardando',skipped:'Nao incluido',
    review:'Nao incluido',attention:'Verificar',authorization:'Aguardando autorizacao'};
   line.textContent=stage.label+' · '+(names[stage.status]||stage.status||'Pendente');
   block.append(line);
  }
 }
 function progressNote(text){
  const p=$('#kitOptimizeProgressText');if(p)p.textContent=text;
 }

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
  $('#kitOptimizeDiscountApply').disabled=busy||!discountToken;
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
  $('#kitOptimizeDiscountToExecution').hidden=true;
  $('#kitOptimizeDiscountApply').hidden=false;
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
  // Atualização automática da lista não é alteração manual da campanha.
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
  workflowStages=null;technicalProgress=null;discountConfirmed=false;
  renderJourney();renderTechnical();
  progressNote('Aguardando anuncio de KIT para iniciar as etapas. Nenhuma publicacao iniciada.');
  globalThis.redeKitCloseOptimizerWorkspace?.();
  const correctedId=USER_CONFIRMED_KIT_TARGETS[kitSku()];
  // Vínculo obsoleto nunca pode reabrir etapas ou continuar uma execução.
  target=link?.itemId&&link.sku===link.mainSku&&(!correctedId||String(link.itemId)===correctedId)?{...link,prepared:true}:null;
  imageSyncAttempts.clear();
  resetDiscountDiscovery();
  const select=$('#kitOptimizeMainSku');
  select.replaceChildren(new Option('Selecione o SKU principal',''));
  for(const x of ctx().prepared?.kit?.components||[])
   select.append(new Option(x.sku+' · '+x.name,x.sku));
  const main=link?.mainSku||$('#kitPrincipalSku')?.value||ctx().prepared?.kit?.components?.[0]?.sku;
  if(main&&[...select.options].some(o=>o.value===main))select.value=main;
  $('#kitOptimizeListingSku').value=main||'';
  $('#kitOptimizeCandidates').replaceChildren();
  $('#kitOptimizeConfirm').checked=false;
  $('#kitOptimizeSelected').textContent=target?.itemId?
   'SKU principal '+main+' · Item ID '+target.itemId+' · Modelo '+target.modelId:
   'Localização automática do anúncio na SKU principal escolhida.';
  if(link?.itemId&&!target)
   notice('Vínculo antigo '+link.itemId+' ignorado. Novo Item ID informado: '+(correctedId||'consultar Shopee')+'. Será validado antes de preparar.','warning');
  paint();
  // Evitar consulta demorada de dezenas de campanhas antes da etapa 08.
 }
 async function lookup({automatic=false,deep=false}={}){
  const {kitSaved}=ctx(),code=$('#kitOptimizeMainSku').value.trim(),current=kitSku();
  if(busy||!kitSaved||!current)return null;
  if(!code)return notice('Selecione a SKU principal para usar como SKU única na Shopee.','error');
  if(!(ctx().prepared?.kit?.components||[]).some(x=>String(x.sku)===code))
   return notice('A SKU principal não pertence a este kit salvo.','error');
  $('#kitOptimizeListingSku').value=code;
  const seq=++lookupSerial,controller=new AbortController();
  lookupController=controller;busy=true;target=null;resetDiscountDiscovery();
  $('#kitOptimizeConfirm').checked=false;paint();
  const root=$('#kitOptimizeCandidates');root.replaceChildren();
  $('#kitOptimizeSelected').textContent='Consultando SKU principal '+code+' na Shopee...';
  notice(deep?'Pesquisando catalogo completo para '+code+' (consulta opcional)...':
   'Buscando SKU exata '+code+' diretamente na Shopee...');
  globalThis.RAKitLookupPhase?.('Localizando Item ID da SKU principal '+code+' na Shopee.');
  const reminder=setTimeout(()=>{
   if(seq===lookupSerial)notice('A Shopee ainda esta respondendo. Voce pode cancelar esta consulta.','warning');
  },6500);
  try{
   const endpoint='/api/shopee/optimizer/find?'+new URLSearchParams({sku:code,deep:'1'});
   const data=await api(endpoint,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(deep?45000:18000)])});
   if(seq!==lookupSerial||kitSku()!==current)return null;
   const matches=(data.matches||[]).filter(x=>['NORMAL','UNLIST'].includes(String(x.status).toUpperCase()));
   if(!matches.length){
    $('#kitOptimizeAdvanced').open=true;
    $('#kitOptimizeSelected').textContent='Anúncio da SKU principal não localizado';
    notice('A Shopee não confirmou anúncio da SKU principal '+code+'. Confira essa SKU em Produtos e anúncios ou use a pesquisa completa. Não cadastre outra SKU de kit.','warning');
    globalThis.RAKitLookupPhase?.('Busca sem Item ID da SKU principal. Nenhum anúncio foi alterado.');
    return null;
   }
   const correctedId=USER_CONFIRMED_KIT_TARGETS[current];
   const choose=m=>{
    target={kitSku:current,sku:code,itemId:String(m.itemId),
     modelId:String(m.modelId??'0'),prepared:false,autoVerified:false};
    $('#kitOptimizeConfirm').checked=false;
    $('#kitOptimizeSelected').textContent='Item ID '+m.itemId+' · SKU '+code;
    notice(target.autoVerified?'SKU principal e Item ID confirmados. Validando composição WeDrop...':
     'Anúncio da SKU principal localizado. Confirme o Item ID antes de otimizar.','success');
    globalThis.RAKitLookupPhase?.('Item ID '+m.itemId+' confirmado na consulta da Shopee.');
    paint();
   };
   // Prioridade: data real de criação da Shopee, nunca o Item ID salvo anteriormente.
   // Conferência humana e auditoria de composição continuam obrigatórias.
   const preferred=matches.find(m=>String(m.itemId)===String(correctedId||data.preferredItemId||''));
   if(preferred){
    choose(preferred);
    notice('Anúncio mais recente confirmado pela Shopee: Item ID '+preferred.itemId+
     '. Confirme este vínculo e valide a composição do kit antes de preparar.','success');
   }
   // Manter alternativas visíveis para auditoria, sem escolher IDs antigos automaticamente.
   $('#kitOptimizeAdvanced').open=true;
   for(const m of matches){
    const button=document.createElement('button');button.type='button';button.className='kit-secondary';
    button.textContent='Item ID '+m.itemId+' · '+(m.title||code)+' · Modelo '+String(m.modelId??'0');
    button.addEventListener('click',()=>{if(kitSku()===current)choose(m);});
    root.append(button);
   }
   if(!preferred)notice(correctedId?'O ID informado '+correctedId+' ainda não foi comprovado na listagem da Shopee. Não retomar o anúncio antigo.':'Encontrados '+matches.length+' anúncios. Confirme manualmente o ID do kit.','warning');
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
  if(!primary)return notice('Selecione a SKU principal WeDrop.','error');
  if(String(target.sku)!==String(primary))return notice('A SKU da Shopee deve ser a SKU principal. Localize novamente.','error');
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
   const review=await api('/api/shopee/optimizer/workflow/review',{body:{
    sku:selected.sku,itemId:selected.itemId,modelId:selected.modelId,stage:'images',reviewed:true
   }});
   if(!review?.saved||review.stages?.find(x=>x.key==='images')?.reviewed!==true)
    throw Error('Os nove arquivos foram copiados, mas a revisão não foi confirmada pelo servidor.');
   if(kitSku()===current&&target?.itemId===selected.itemId)
    globalThis.RAKitWorkflowSyncReview?.({kitSku:current,itemId:selected.itemId,modelId:selected.modelId,review});
   notice('✓ Nove imagens da galeria vinculadas e confirmadas no rascunho Shopee, sem publicar.','success');
   progressNote('✓ 9/9 imagens já prontas sincronizadas com a SKU principal.');
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
  if(!main)return notice('Selecione a SKU principal usada no anúncio Shopee.','error');
  $('#kitOptimizeListingSku').value=main;
  if(target?.sku!==main||USER_CONFIRMED_KIT_TARGETS[kitSku()]&&String(target?.itemId)!==USER_CONFIRMED_KIT_TARGETS[kitSku()])target=null;
  if(!target||target.kitSku!==kitSku()){
   await lookup({automatic:true,deep:true});
   if(!target)return notice('O ID correto precisa ser confirmado pela API Shopee. O anúncio antigo não será usado.','warning');
  }
  let newlyPrepared=false;
  if(!target.prepared){
   if(!target.autoVerified&&!$('#kitOptimizeConfirm').checked){
    $('#kitOptimizeAdvanced').open=true;
    return notice('Confirme o Item ID do anúncio da SKU principal.','warning');
   }
   if(!await prepare())return;
   newlyPrepared=true;
  }
  const btn=$('#kitOptimizeStart');
  btn.disabled=true;btn.textContent='Preparando etapas...';
  try{
   notice('Carregando somente vídeo, ficha técnica e dados fiscais.','info');
   globalThis.RAKitLookupPhase?.('Reaproveitando imagens, título, descrição e preço já preparados no kit.');
   open();
  }finally{btn.disabled=false;btn.textContent='↻ Continuar otimização do kit';}
 }
 globalThis.RAKitOptimizerReady=data=>{
  if(data?.kitOptimization?.kitSku!==kitSku()||String(target?.itemId)!==String(data.itemId))return;
  notice('Etapas complementares abertas. Imagens e textos serão reaproveitados.','success');
  $('#kitOptimizeStart').textContent='↻ Continuar otimização do kit';
  $('#kitOptimizerWorkspace')?.scrollIntoView({behavior:'smooth',block:'start'});
  const imageStage=data.stages?.find(x=>x.key==='images');
  const identity=kitSku()+'|'+data.itemId+'|'+String(data.modelId||'0');
  if(!imageStage?.reviewed&&!imageSyncAttempts.has(identity)){
   imageSyncAttempts.add(identity);
   void transferImages({automatic:true,optional:true}).then(done=>{
    if(!done&&kitSku()===data.kitOptimization.kitSku)
     progressNote('Galeria ainda não confirmada na SKU principal. Confira 9/9 imagens na seção Galeria de imagens e use Sincronizar imagens.');
   });
  }
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
 // Substitui o <pre> genérico e escuro por conteúdo estruturado e legível.
 // Sem innerHTML: preços e nomes das campanhas vêm da API Shopee.
 function renderDiscountSummary(result,planned,current){
  const box=$('#kitOptimizeDiscountSummary');if(!box)return;
  box.replaceChildren();
  const head=document.createElement('div');head.className='kit-discount-summary-heading';
  const title=document.createElement('strong');
  title.textContent=planned?'Prévia preparada para conferência':'Prévia validada para autorização';
  const badge=document.createElement('span');
  badge.className='kit-discount-summary-badge';
  badge.textContent=planned?'Não publicado':'Aplicação ainda pendente';
  head.append(title,badge);box.append(head);
  const grid=document.createElement('dl');grid.className='kit-discount-summary-grid';
  const rows=[
   ['Kit',current],['Item ID',String(result.itemId||'')],
   ['Minha Promoção',String(result.discountName||'')+' · ID '+String(result.discountId||'')],
   ['Preço bruto planejado',money(result.gross)],
   ...(result.currentGross!=null?[['Preço atual na Shopee',money(result.currentGross)]]:[]),
   ['PREÇO PROMOCIONAL A EXECUTAR',money(result.promo)],
   ['Preço após cupom (estimado)',money(result.afterCoupon)],
   ['Margem líquida estimada',Number(result.margin).toFixed(2)+'%'],
   ...(result.marketOffers!=null&&Number.isFinite(Number(result.marketOffers))?
    [['Ofertas comparáveis verificadas',String(result.marketOffers)]]:[]),
   ['Ação futura',result.action==='update'?'Atualizar promoção':'Incluir nesta promoção'],
   ['Otimização executada',result.executionVerified?'Confirmada':'Aguardando confirmação'],
   ['Situação do preço bruto',result.priceAligned?'Já corresponde ao calculado':'Ajuste necessário antes da promoção']
  ];
  for(const [name,value] of rows){
   const row=document.createElement('div');row.className='kit-discount-summary-row';
   const label=document.createElement('dt');label.textContent=name;
   const content=document.createElement('dd');content.textContent=value;
   row.append(label,content);grid.append(row);
  }
  box.append(grid);
  const note=document.createElement('p');note.className='kit-discount-summary-note';
  note.textContent=planned?
   (!result.priceAligned?'Preço atual da Shopee diferente do bruto do kit: escolha “Somente preço bruto + desconto do kit” em Prévia e execução, revise os valores e autorize. Nenhuma alteração foi enviada.':
    'Prévia de planejamento pronta. Confira a execução específica da etapa 08. Nenhum desconto foi publicado.'):
   'Confira os valores e autorize a aplicação separadamente. Nenhum desconto foi publicado.';
  box.append(note);
 }
 async function previewDiscount(){
  if(busy||!target?.prepared)return;
  const current=kitSku(),discountId=$('#kitOptimizeDiscountId').value.trim();
  if(!/^[1-9]\d{0,17}$/.test(discountId))
   return discountNotice('Informe o ID válido da Minha Promoção Shopee.','error');
  busy=true;discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;paint();
  discountNotice('Consultando campanha, valores e situação do kit na Shopee, sem publicar...');
  try{
   const result=await api('/api/shopee/kits/discount/preview',{body:{kitSku:current,discountId}});
   if(kitSku()!==current)return;
   const planned=result.status==='planning'||result.approvalReady===false;
   discountToken=!planned&&result.token?result.token:null;
   renderDiscountSummary(result,planned,current);
   $('#kitOptimizeDiscountBox').hidden=false;
   const apply=$('#kitOptimizeDiscountApply');
   apply.hidden=planned;
   apply.disabled=planned;
   const goExecution=$('#kitOptimizeDiscountToExecution');
   if(goExecution)goExecution.hidden=!planned;
   globalThis.RAKitDiscountPrepared?.({kitSku:current,itemId:String(result.itemId),
    discountId:String(result.discountId),reviewSaved:result.reviewSaved===true,preview:result});
   discountNotice(planned?
     (result.reviewSaved?'✓ Conferência da etapa 08 registrada. A promoção ainda não foi aplicada.':
       'Prévia exibida, mas a conferência não foi salva para esta SKU. Confira o vínculo do kit.')+
       (result.priceAligned?' Abra Prévia e execução para autorizar a etapa 08.':' Selecione “Somente preço bruto + desconto do kit” em Prévia e execução.'):
     (result.reviewSaved?'✓ Etapa 08 conferida. ':'Prévia verificada. ')+
       'Confira os valores e autorize a aplicação separadamente.',
     result.reviewSaved?'success':'warning');
  }catch(e){discountNotice('Não foi possível preparar a prévia: '+e.message,'error');}
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
   if(result.status==='discount_confirmed'){
    discountConfirmed=true;renderJourney();
    globalThis.RAKitDiscountConfirmed?.({kitSku:current,itemId:String(result.itemId)});
   }
   discountNotice(result.status==='discount_confirmed'?
    '✓ Desconto confirmado no anúncio '+result.itemId+' · Preço '+money(result.promo):
    (result.message||'Resposta pendente de conferência na Shopee.'),
    result.status==='discount_confirmed'?'success':'info');
  }catch(e){discountNotice('Status não confirmado: '+e.message+
   '. Confira Minha Promoção na Shopee ANTES de reenviar.','error');}
  finally{busy=false;paint();}
 }
 $('#kitOptimizeDiscountPreview')?.addEventListener('click',()=>void previewDiscount());
 $('#kitOptimizeDiscountToExecution')?.addEventListener('click',()=>{
  const button=$('#optimizerShowExecution');
  if(!button)return notice('Abra o fluxo do kit para conferir a execução do anúncio.','warning');
  button.click();
  $('#optimizerExecutionPanel')?.scrollIntoView?.({behavior:'smooth',block:'start'});
 });
 $('#kitOptimizeDiscountApply')?.addEventListener('click',()=>void applyDiscount());
 $('#kitOptimizeDiscountId')?.addEventListener('change',()=>{
  discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
  $('#kitOptimizeDiscountApply').hidden=false;
  $('#kitOptimizeDiscountToExecution').hidden=true;
  globalThis.RAKitDiscountPrepared?.({kitSku:kitSku(),clear:true});
  paint();
 });
 $('#kitOptimizeDiscountRefresh')?.addEventListener('click',()=>void resolveDiscountIds());
 $('#kitOptimizeLookup')?.addEventListener('click',()=>void lookup());
 globalThis.RAKitLookupPhase=message=>{
  if(typeof message==='string'&&message)progressNote(message);
 };
 globalThis.RAKitAuditPhase=message=>{
  if(target?.kitSku===kitSku()&&typeof message==='string')progressNote(message);
 };
 globalThis.RAKitWorkflowProgress=({kitSku:code,itemId,stages}={})=>{
  if(code!==kitSku()||!target||String(target.itemId)!==String(itemId))return;
  workflowStages=Array.isArray(stages)?stages:null;
  renderJourney();
  progressNote('Vídeo, ficha técnica e dados fiscais usam a revisão original. Imagens e textos são reutilizados dos blocos abaixo.');
 };
 globalThis.RAKitTechnicalProgress=({kitSku:code,itemId,progress}={})=>{
  if(code!==kitSku()||!target||String(target.itemId)!==String(itemId))return;
  technicalProgress=progress||null;renderTechnical();
 };

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
 $('#kitWorkflowDiscountLater')?.addEventListener('click',()=>{
  if(!target?.prepared){
   notice('Vincule primeiro a SKU principal e carregue a otimização.','warning');
   return;
  }
  if(typeof globalThis.RAKitOpenDiscountReview==='function')globalThis.RAKitOpenDiscountReview();
  else notice('Abra a otimização do kit antes de conferir Minha Promoção.','warning');
 });
 $('#kitOptimizePrepare')?.addEventListener('click',()=>void prepare());
 $('#kitOptimizeImages')?.addEventListener('click',()=>void transferImages());
 $('#kitOptimizeOpen')?.addEventListener('click',open);
 $('#kitOptimizeConfirm')?.addEventListener('change',paint);
 $('#kitOptimizeMainSku')?.addEventListener('change',()=>{
  workflowStages=null;technicalProgress=null;discountConfirmed=false;renderJourney();renderTechnical();
  lookupSerial++;lookupController?.abort();lookupController=null;busy=false;
  globalThis.redeKitCloseOptimizerWorkspace?.();
  target=null;resetDiscountDiscovery();
  const main=$('#kitOptimizeMainSku').value;
  $('#kitOptimizeListingSku').value=main;
  $('#kitOptimizeConfirm').checked=false;
  $('#kitOptimizeCandidates').replaceChildren();
  $('#kitOptimizeSelected').textContent=main?'Buscar anúncio Shopee da SKU '+main:'Selecione a SKU principal';
  onMainSkuChange?.(main);
  progressNote('SKU única Shopee: '+(main||'não selecionada')+'. Os demais componentes são vinculados na WeDrop.');
  paint();
 });
 // SKU do anúncio é informativa e deriva exclusivamente da escolha principal.
 renderJourney();
 return {restore};
}
