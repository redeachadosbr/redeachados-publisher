// Interface de otimização de um anúncio de kit já existente. Preparação nunca publica.
const $=selector=>document.querySelector(selector);
export function initExistingKitOptimization({getContext,api,money,onMainSkuChange}){
 let target=null,busy=false,discountToken=null,discountLookupSeq=0,discountSearching=false;
 const ctx=()=>getContext(),kitSku=()=>ctx().prepared?.kit?.kitSku||'';
 function notice(message,state='info'){
  const el=$('#kitOptimizeStatus');if(el){el.textContent=message;el.dataset.state=state;}
 }
 function paint(){
  const {kitSaved}=ctx(),valid=Boolean(target&&target.kitSku===kitSku());
  $('#kitOptimizeLookup').disabled=busy||!kitSaved;
  $('#kitOptimizeStart').disabled=busy||!kitSaved;
  $('#kitOptimizePrepare').disabled=busy||!kitSaved||!valid||!$('#kitOptimizeConfirm').checked;
  $('#kitOptimizeImages').disabled=busy||!kitSaved||!valid||!target.prepared;
  $('#kitOptimizeOpen').disabled=busy||!kitSaved||!valid||!target.prepared;
  $('#kitOptimizeDiscountPreview').disabled=busy||discountSearching||!kitSaved||!valid||!target.prepared||!$('#kitOptimizeDiscountId').value;
  $('#kitOptimizeDiscountRefresh').disabled=discountSearching||!kitSaved||!$('#kitOptimizeMainSku').value;
 }
 function resetDiscountDiscovery(){
  ++discountLookupSeq;discountSearching=false;discountToken=null;
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
  }catch(e){
   if(seq!==discountLookupSeq)return;
   select.replaceChildren(new Option('Consulta indisponível',''));
   msg.textContent='Não foi possível consultar os IDs: '+e.message+'. Nenhum ID foi presumido.';
   msg.dataset.state='error';
  }finally{if(seq===discountLookupSeq){discountSearching=false;paint();}}
 }
 function restore(link=null){
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
  if(link?.mainSku)void resolveDiscountIds();
 }
 async function lookup({automatic=false}={}){
  const {kitSaved}=ctx(),code=$('#kitOptimizeListingSku').value.trim(),current=kitSku();
  if(busy||!kitSaved||!current)return;
  if(!code)return notice('Informe a SKU exata do anúncio existente.','error');
  busy=true;target=null;resetDiscountDiscovery();
  $('#kitOptimizeConfirm').checked=false;paint();
  const root=$('#kitOptimizeCandidates');root.replaceChildren();
  notice('Consultando a SKU '+code+' no catálogo Shopee...');
  try{
   const data=await api('/api/shopee/optimizer/find?'+new URLSearchParams({sku:code,deep:'1'}));
   if(kitSku()!==current)return;
   const matches=(data.matches||[]).filter(x=>['NORMAL','UNLIST'].includes(String(x.status).toUpperCase()));
   if(!matches.length)throw Error('Anúncio não encontrado como ativo. Confira em Produtos Shopee.');
   if(automatic&&matches.length===1){
    const m=matches[0];
    target={kitSku:current,sku:code,itemId:String(m.itemId),
      modelId:String(m.modelId??'0'),prepared:false,autoVerified:true};
    $('#kitOptimizeConfirm').checked=true;
    $('#kitOptimizeSelected').textContent='Kit encontrado · Item ID '+m.itemId;
    notice('Anúncio único do kit localizado pela SKU exata. Preparando a revisão...','success');
    paint();return target;
   }
   for(const m of matches){
    const button=document.createElement('button');button.type='button';button.className='kit-secondary';
    button.textContent='Item ID '+m.itemId+' · '+(m.title||code)+' · Modelo '+String(m.modelId??'0');
    button.addEventListener('click',()=>{
     if(kitSku()!==current)return;
     target={kitSku:current,sku:code,itemId:String(m.itemId),modelId:String(m.modelId??'0'),prepared:false};
     $('#kitOptimizeConfirm').checked=false;
     $('#kitOptimizeSelected').textContent='SELECIONADO: '+(m.title||code)+' | Item ID '+m.itemId+
      ' · Modelo '+String(m.modelId??'0');
     notice('Confira se este anúncio representa o kit completo, depois confirme.','info');
     void resolveDiscountIds();paint();
    });
    root.append(button);
   }
   if(automatic){
    $('#kitOptimizeAdvanced').open=true;
    notice('Foram encontrados '+matches.length+' anúncios. Selecione, confirme e clique em Iniciar novamente.','warning');
   }else notice(matches.length+' anúncio(s) encontrado(s). Selecione o Item ID correto.','success');
   return null;
  }catch(e){notice('Consulta não concluída: '+e.message,'error');}
  finally{busy=false;paint();}
 }
 async function prepare(){
  if(busy||!target||!ctx().kitSaved)return;
  if(!$('#kitOptimizeConfirm').checked)return notice('Confirme o Item ID do kit.','error');
  const primary=$('#kitOptimizeMainSku').value;
  if(!primary)return notice('Selecione o SKU principal WeDrop.','error');
  const selected={...target},current=kitSku();
  busy=true;paint();notice('Revalidando custo completo do kit e anúncio Shopee...');
  try{
   const result=await api('/api/shopee/kits/optimization/prepare',{body:{
    kitSku:current,sku:selected.sku,itemId:selected.itemId,modelId:selected.modelId,
    mainSku:primary,confirmedItemId:selected.itemId
   }});
   if(kitSku()!==current)return;
   target={kitSku:current,...result.target,prepared:true};
   discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
   void resolveDiscountIds();
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
   const imported=newlyPrepared?await transferImages({automatic:true,optional:true}):false;
   if(imported)notice('9 imagens disponíveis para revisão. Abrindo as etapas do kit...','success');
   else notice('Abrindo as etapas. Confira as imagens no passo 01.','info');
   open();
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
 $('#kitOptimizeStart')?.addEventListener('click',()=>void startKitOptimization());
 $('#kitWorkflowImportImages')?.addEventListener('click',()=>void transferImages());
 $('#kitOptimizePrepare')?.addEventListener('click',()=>void prepare());
 $('#kitOptimizeImages')?.addEventListener('click',()=>void transferImages());
 $('#kitOptimizeOpen')?.addEventListener('click',open);
 $('#kitOptimizeConfirm')?.addEventListener('change',paint);
 $('#kitOptimizeMainSku')?.addEventListener('change',()=>{
  if(target)target.prepared=false;
  onMainSkuChange?.($('#kitOptimizeMainSku').value);
  void resolveDiscountIds();paint();
 });
 $('#kitOptimizeListingSku')?.addEventListener('input',()=>{
  globalThis.redeKitCloseOptimizerWorkspace?.();
  target=null;resetDiscountDiscovery();
  $('#kitOptimizeConfirm').checked=false;
  $('#kitOptimizeSelected').textContent='SKU alterada. Localize novamente o anúncio correto.';
  paint();
 });
 return {restore};
}
