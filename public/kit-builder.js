// Kits Inteligentes WeDrop — Kit Formal enviado à Shopee somente após aprovação explícita.
const $=s=>document.querySelector(s);
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const status=(v,state='info')=>{const el=$('#kitStatus');if(el){el.textContent=v;el.dataset.state=state;}};
const imageStatus=(v,state='info')=>{const el=$('#kitImageStatus');el.textContent=v;el.dataset.state=state;};
async function api(path,{body,signal}={}){
 const response=await fetch(path,{
  ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),
  ...(signal?{signal}:{})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Consulta não concluída.');
 return data;
}
let categoriesLoaded=false,suggestions=[],prepared=null,images=new Map(),generationBusy=false;
let kitStockReady=false,kitStockLastCheck=null;
let kitPublishToken=null,kitDiscountToken=null,kitSaved=false,kitPublishBusy=false,kitReadiness=null,kitShopeePhotoSlots=new Map(),kitItemId=null;
let marginTimer=null,marginRevision=0,suggestionContext=null,marginUpdatePending=false;
function updateKitOverview(){
 $('#kitOverviewCategory').textContent=$('#kitCategory')?.value||'Brinquedos';
 $('#kitOverviewSize').textContent=($('#kitSize')?.value||2)+' SKUs';
 $('#kitOverviewMargin').textContent=$('#kitMargin')?.value+'%';
 $('#kitOverviewFreight').textContent=money(Number($('#kitShipping')?.value||0));
}
function updateKitTextCounters(){
 $('#kitTitleCount').textContent=$('#kitTitle').value.length+'/120';
 $('#kitDescriptionCount').textContent=$('#kitDescription').value.length+'/2000';
}
function onKitContentEdit(){
 if(!prepared)return;
 kitSaved=false;clearKitPublishApproval();updateKitTextCounters();
 kitPublishStatus('Título/descrição alterados: salve novamente o rascunho antes de publicar.','info');
}
const MARGIN_MIN=0,MARGIN_MAX=70;
function normalizeKitMargin(value){
 return Math.max(MARGIN_MIN,Math.min(MARGIN_MAX,Math.round(Number(value)||0)));
}
function setKitMargin(value,{recalculate=false}={}){
 const slider=$('#kitMargin'),number=normalizeKitMargin(value);
 slider.value=String(number);
 slider.style.setProperty('--kit-margin-fill',((number-MARGIN_MIN)/(MARGIN_MAX-MARGIN_MIN)*100).toFixed(2)+'%');
 slider.setAttribute('aria-valuetext',number+' por cento');
 $('#kitMarginLabel').textContent=number+'%';
 $('#kitMarginMinus').disabled=number===MARGIN_MIN;
 $('#kitMarginPlus').disabled=number===MARGIN_MAX;
 updateKitOverview();
 if(recalculate)scheduleKitMarginReprice();
}
function scheduleKitMarginReprice(){
 marginRevision++;
 if(marginTimer)clearTimeout(marginTimer);
 if(!suggestions.length&&!prepared){
  status('Margem ajustada para '+$('#kitMargin').value+'%. Clique em Pesquisar kits inteligentes para calcular os valores.','info');
  return;
 }
 marginUpdatePending=true;
 $('#kitSaveDraft').disabled=true;
 status('Margem ajustada para '+$('#kitMargin').value+'%. Atualizando os preços e o lucro dos kits pela calculadora Shopee...','info');
 marginTimer=setTimeout(()=>void repriceKitMargin(marginRevision),420);
}
function refreshKitPrices(kit){
 const root=$('#kitNumbers');root.replaceChildren();
 for(const [label,value] of [
  ['Custos dos produtos',money(kit.componentCost)],
  ['Custo total com extras',money(kit.kitCost)],
  ['Preço bruto',money(kit.quote.grossPrice)],
  ['Desconto base',pct(kit.quote.discountPct)],
  ['Vitrine Shopee',money(kit.quote.marketplacePrice)],
  ['Com cupom',money(kit.quote.afterCoupon)],
  ['Lucro líquido',money(kit.quote.netProfit)],
  ['Margem líquida',pct(kit.quote.netMarginPct)]
 ]){
  const card=elt('div');card.append(elt('span','',label),elt('b','',value));root.append(card);
 }
}
async function repriceKitMargin(revision){
 try{
  const settings=currentSettings();
  const calls=[];
  const context=suggestionContext;
  if(suggestions.length&&context&&context.category===$('#kitCategory').value&&context.size===Number($('#kitSize').value)){
   const current=suggestions.map(kit=>kit.components.map(p=>p.sku));
   calls.push(api('/api/shopee/kits/plus-import',{body:{
    category:context.category,size:context.size,kits:current,...settings
   }}).then(data=>({kind:'suggestions',data})));
  }
  if(prepared){
   calls.push(api('/api/shopee/kits/prepare',{body:{
    skus:prepared.kit.components.map(x=>x.sku),...settings
   }}).then(data=>({kind:'prepared',data})));
  }
  const outcomes=await Promise.all(calls);
  if(revision!==marginRevision)return;
  for(const outcome of outcomes){
   if(outcome.kind==='suggestions'){
    const reasons=new Map(suggestions.map(k=>[k.components.map(p=>p.sku).sort().join('|'),k.businessReason]));
    const repriced=outcome.data.results.map(k=>({
     ...k,businessReason:reasons.get(k.components.map(p=>p.sku).sort().join('|'))||k.businessReason
    }));
    renderSuggestions({...outcome.data,results:repriced,source:context.source});
   }
   if(outcome.kind==='prepared'){
    if(outcome.data.kit.kitSku!==prepared.kit.kitSku)throw Error('A cotação retornou um kit diferente.');
    prepared={...prepared,kit:outcome.data.kit};
    kitSaved=false;clearKitPublishApproval();
    kitPublishStatus('Custo ou margem alterados. Salve novamente o rascunho e refaça a prévia antes de publicar.','info');
    refreshKitPrices(prepared.kit); // Preserva textos já editados e imagens importadas.
    $('#kitWarning').textContent=prepared.kit.warning+
     ' Os preços foram recalculados para a margem escolhida e NÃO foram enviados à Shopee.';
   }
  }
  status('✓ Margem manual '+$('#kitMargin').value+'% aplicada aos kits. Preços, descontos e lucro líquido recalculados com centavos 0/9.','success');
 }catch(error){
  if(revision===marginRevision)status('Não foi possível recalcular a margem: '+error.message+'. Tente pesquisar novamente; valores antigos não devem ser publicados.','error');
 }finally{
  if(revision===marginRevision){
   marginUpdatePending=false;
   $('#kitSaveDraft').disabled=false;
  }
 }
}
function elt(tag,className='',text=''){
 const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;
}
function addImage(parent,product){
 if(product.imageUrl){
  const img=elt('img');img.alt='Fotografia WeDrop de '+product.name;img.src=product.imageUrl;
  img.loading='lazy';img.referrerPolicy='no-referrer';parent.append(img);
 }else parent.append(elt('span','', 'Sem foto'));
}
function currentSettings(){
 const marginPct=Number($('#kitMargin').value),packing=Number($('#kitPacking').value),
 shipping=Number($('#kitShipping').value);
 if(!Number.isFinite(marginPct)||marginPct<MARGIN_MIN||marginPct>MARGIN_MAX)throw Error('Margem deve ficar entre 0% e 70%.');
 if(!Number.isFinite(packing)||packing<0||packing>500||!Number.isFinite(shipping)||shipping<0||shipping>500)
  throw Error('Custos adicionais devem estar entre R$ 0 e R$ 500.');
 return {marginPct,packing,shipping,useAi:false};
}
function displayKitStockGate(stock,catalogCount){
 kitStockReady=stock?.ready===true;
 kitStockLastCheck=stock||null;
 const gate=$('#kitStockGate');
 gate.dataset.ready=kitStockReady?'yes':'no';
 $('#kitStockHeadline').textContent=kitStockReady?
  '✓ Catálogo e estoque WeDrop atualizados — somente SKUs DISPONÍVEIS':
  'Atualize o catálogo e importe os status de estoque antes de gerar kits';
 const date=value=>value?new Date(value).toLocaleString('pt-BR'):'não informado';
 $('#kitStockStamp').textContent=kitStockReady?
  'Válido até '+date(stock.expiresAt):'Bloqueado';
 $('#kitStockExplanation').textContent=(stock?.reason||'Não foi possível comprovar estoque.')+
  ' · Catálogo: '+date(stock?.catalogLastImportedAt)+
  ' · Estoque: '+date(stock?.lastSuccessAt)+
  ' · Disponíveis: '+Number(stock?.availableCount||0)+
  ' · Indisponíveis: '+Number(stock?.unavailableCount||0)+
  ' · Sem status no último arquivo: '+Math.max(0,Number(catalogCount||0)-Number(stock?.importedCount||0))+
  '. Atualize no máximo a cada 24 horas.';
 for(const selector of ['#kitSuggest','#kitPlusResearch','#kitPlusImport'])
  $(selector).disabled=!kitStockReady;
 if(!kitStockReady){
  suggestions=[];suggestionContext=null;prepared=null;images.clear();
  $('#kitSuggestions').replaceChildren(elt('p','', 'Geração bloqueada até importar a disponibilidade WeDrop. Não serão usados SKUs sem status confiável.'));
  $('#kitDetail').hidden=true;
  status('Atualização obrigatória: '+(stock?.reason||'Importe o catálogo e os status WeDrop.'),'error');
 }
}
async function importKitStockCsv(){
 const file=$('#kitStockCsv').files?.[0];
 if(!file)return $('#kitStockImportStatus').textContent='Selecione um CSV exportado da WeDrop com SKU e Disponibilidade.';
 if(file.size>4_000_000||file.size===0)
  return $('#kitStockImportStatus').textContent='Arquivo deve conter dados e ter no máximo 4 MB.';
 const button=$('#kitStockImport');button.disabled=true;
 $('#kitStockImportStatus').textContent='Conferindo linhas, SKUs e disponibilidade do catálogo...';
 try{
  const csv=await file.text();
  const result=await api('/api/shopee/kits/availability/import',{body:{csv}});
  $('#kitStockImportStatus').textContent='✓ '+result.imported+
   ' status importados: '+result.available+' DISPONÍVEIS e '+
   result.unavailable+' INDISPONÍVEIS; '+result.notCovered+
   ' SKUs não constam no arquivo e permanecem bloqueadas.';
  categoriesLoaded=false;await categories(true);
 }catch(error){
  $('#kitStockImportStatus').textContent='Importação não concluída: '+error.message+
   ' Nenhum kit será gerado sem estoque confirmado.';
 }finally{button.disabled=!$('#kitStockCsv').files?.length;}
}
async function categories(force=false){
 if(categoriesLoaded&&!force)return;
 categoriesLoaded=true;
 try{
  const data=await api('/api/shopee/kits/catalog?category=Todos&limit=1');
  const select=$('#kitCategory'),keep=select.value;
  select.replaceChildren();
  for(const name of data.categories){
   const option=elt('option','',name);option.value=name;select.append(option);
  }
  select.value=data.categories.includes(keep)?keep:data.categories.includes('Brinquedos')?'Brinquedos':'Todos';
  updateKitOverview();
  displayKitStockGate(data.stock,data.catalogCount);
  if(data.stock?.ready)status(data.availableMatched+' SKUs DISPONÍVEIS nesta categoria para montar kits. Apenas esses produtos serão usados.','success');
 }catch(error){categoriesLoaded=false;displayKitStockGate(null,0);status('Não foi possível acessar as categorias: '+error.message,'error');}
}
function kitPublishStatus(text,state='info'){
 const node=$('#kitPublishStatus');node.textContent=text;node.dataset.state=state;
}
function clearKitPublishApproval(){
 kitPublishToken=null;kitDiscountToken=null;
 $('#kitPublishPreviewBox').hidden=true;
 $('#kitDiscountPreviewBox').hidden=true;
}
function resetKitPublication({saved=false,publication=null}={}){
 kitSaved=saved;kitPublishBusy=false;kitReadiness=null;kitShopeePhotoSlots.clear();
 clearKitPublishApproval();
 kitItemId=publication?.itemId||null;
 const uncertain=['publishing','uncertain','published_pending','published']
  .includes(String(publication?.status||''));
 kitDiscountToken=null;$('#kitDiscountPreviewBox').hidden=true;
 $('#kitShopeePhotoCount').textContent='0 fotos enviadas à galeria da Shopee nesta sessão (não publicadas).';
 $('#kitContentsReviewed').checked=false;$('#kitPhotosReviewed').checked=false;
 $('#kitMainSku').replaceChildren();
 const root=$('#kitMainSku');
 root.append(new Option('Selecione o SKU principal',''));
 for(const p of prepared?.kit?.components||[])root.append(new Option(p.sku+' · '+p.name,p.sku));
 $('#kitLogisticId').replaceChildren(new Option('Consultar opções da Shopee',''));
 $('#kitPublishLinks').replaceChildren();
 $('#kitDiscountNext').hidden=!kitItemId&&!uncertain;
 $('#kitPublishPreview').disabled=!saved||uncertain;
 $('#kitSendPhotos').disabled=!saved||uncertain;
 $('#kitPublishCheck').disabled=!saved||uncertain;
 $('#kitPublishExecute').disabled=!saved||uncertain;
 $('#kitPublishedMessage').textContent=kitItemId?
  'Kit criado com Item ID '+kitItemId+' · Estado: '+String(publication.status)+
  '. O desconto será uma operação posterior, com aprovação própria.':'';
 kitPublishStatus(uncertain?
  'Kit já enviado ou com resposta incerta. NÃO publique novamente; consulte Meus Kits e confirme o status com a Shopee.':
  saved?'Rascunho salvo. Consulte os vínculos dos componentes para preparar o kit na Shopee.':
  'Primeiro salve o rascunho com título, descrição e margem revisados.',
  kitItemId?'success':uncertain?'error':'info');
}
function kitPublishFields(){
 if(!prepared)throw Error('Selecione um kit.');
 return {
  title:$('#kitTitle').value.trim(),description:$('#kitDescription').value.trim(),
  mainSku:$('#kitMainSku').value,logisticId:$('#kitLogisticId').value,
  weightKg:Number($('#kitWeightKg').value),lengthCm:Number($('#kitLengthCm').value),
  widthCm:Number($('#kitWidthCm').value),heightCm:Number($('#kitHeightCm').value),
  autoSyncDts:$('#kitAutoSyncDts').checked,preOrder:$('#kitPreOrder').checked,
  daysToShip:Number($('#kitDaysToShip').value),
  contentsReviewed:$('#kitContentsReviewed').checked,
  photosReviewed:$('#kitPhotosReviewed').checked,
  imageIds:[...kitShopeePhotoSlots.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]),
  singleParcelConfirmed:$('#kitSingleParcelConfirmed').checked
 };
}
async function kitReadinessCheck(){
 if(!prepared||!kitSaved)return kitPublishStatus('Salve o kit antes de consultar a Shopee.','error');
 if(kitPublishBusy)return;
 kitPublishBusy=true;$('#kitPublishCheck').disabled=true;clearKitPublishApproval();
 kitPublishStatus('Validando itens, variações, canais e limites do Kit Formal na Shopee...');
 try{
  const result=await api('/api/shopee/kits/publish/readiness',{body:{kitSku:prepared.kit.kitSku}});
  kitReadiness=result;
  const components=$('#kitPublishLinks');components.replaceChildren();
  for(const x of result.linked){
   const line=elt('div','kit-component');
   line.textContent='WeDrop '+x.supplierSku+' → Shopee Item ID '+x.itemId+
    (Number(x.modelId)>0?' · Modelo '+x.modelId:'')+
    ' · '+x.title;components.append(line);
  }
  const channelSelect=$('#kitLogisticId'),chosen=channelSelect.value;
  channelSelect.replaceChildren(new Option('Selecione um canal ativo',''));
  for(const x of result.channels)channelSelect.append(new Option(x.name+' (ID '+x.id+')',x.id));
  if(result.channels.some(x=>x.id===chosen))channelSelect.value=chosen;
  kitPublishStatus(result.blockers?.length?
   'PUBLICAÇÃO BLOQUEADA: '+result.blockers.join(' | '):
   'Todos os componentes estão vinculados a anúncios ativos. Confirme peso e dimensões medidos e envie as fotografias.',
   result.blockers?.length?'error':'success');
 }catch(error){kitPublishStatus('Falha na conferência: '+error.message,'error');}
 finally{kitPublishBusy=false;$('#kitPublishCheck').disabled=false;}
}
async function kitSendPhotos(){
 if(!prepared||!kitSaved)return kitPublishStatus('Salve o rascunho antes de enviar imagens.','error');
 if(kitPublishBusy)return;
 if(!kitReadiness||kitReadiness.blockers?.length)
  return kitPublishStatus('Conclua primeiro a verificação dos componentes Shopee.','error');
 if(!images.size)return kitPublishStatus('Importe ao menos uma foto do kit gerada no ChatGPT Plus.','error');
 if(!$('#kitPhotosReviewed').checked)
  return kitPublishStatus('Confirme que todas as imagens representam fielmente os componentes.','error');
 kitPublishBusy=true;$('#kitSendPhotos').disabled=true;clearKitPublishApproval();
 try{
  for(const [slot,photo] of [...images.entries()].sort((a,b)=>a[0]-b[0])){
   if(kitShopeePhotoSlots.has(slot))continue;
   kitPublishStatus('Enviando foto '+slot+' para Shopee MediaSpace, SEM publicar o anúncio...');
   const result=await api('/api/shopee/kits/publish/media',{body:{
    kitSku:prepared.kit.kitSku,slot,mime:'image/png',imageBase64:photo.split(',')[1]
   }});
   kitShopeePhotoSlots.set(slot,result.imageId);
   $('#kitShopeePhotoCount').textContent=kitShopeePhotoSlots.size+
    ' foto(s) armazenada(s) na galeria Shopee, ainda SEM publicação.';
  }
  kitPublishStatus('Fotos enviadas. Gere a prévia final para verificar preços, IDs, composição e logística.','success');
 }catch(error){kitPublishStatus('Envio interrompido: '+error.message+
  '. Fotos confirmadas permanecem na galeria; retome sem reenviar as mesmas posições.','error');}
 finally{kitPublishBusy=false;$('#kitSendPhotos').disabled=false;}
}
async function kitPreparePublishPreview(){
 if(!prepared||!kitSaved)return kitPublishStatus('Salve o kit primeiro.','error');
 if(kitPublishBusy)return;
 if(!kitReadiness||kitReadiness.blockers?.length)
  return kitPublishStatus('Resolva todos os vínculos de SKU e logística antes da prévia.','error');
 kitPublishBusy=true;$('#kitPublishPreview').disabled=true;clearKitPublishApproval();
 try{
  const result=await api('/api/shopee/kits/publish/preview',{body:{
   kitSku:prepared.kit.kitSku,fields:kitPublishFields()
  }});
  kitPublishToken=result.token;
  const x=result.payloadSummary;
  $('#kitPublishSummary').textContent=[
   'KIT '+result.kitSku,
   'Componentes: '+x.skus.join(' + '),
   'Nome: '+x.title,
   'Preço BRUTO de cadastro: '+money(x.gross),
   'Preço da Minha Promoção DEPOIS da publicação: '+money(x.promoAfterPublication),
   'Preço com cupom de loja (simulado): '+money(x.couponAfterPromo),
   'Lucro líquido estimado: '+pct(x.margin),
   'Fotografias: '+x.images,
   'Peso total: '+x.weightKg+' kg',
   'Embalagem: '+x.dimensions.join(' × ')+' cm',
   'Canal logístico: '+x.logisticId,
   'ATENÇÃO: esta ação cria um novo Kit Formal NA SHOPEE, com preço BRUTO, sem desconto.'
  ].join('\n');
  $('#kitPublishPreviewBox').hidden=false;
  kitPublishStatus('Prévia segura gerada. Confira os dados e confirme a publicação com o botão destacado abaixo.','success');
 }catch(error){kitPublishStatus('Prévia bloqueada: '+error.message,'error');}
 finally{kitPublishBusy=false;$('#kitPublishPreview').disabled=false;}
}
async function kitPublishExecute(){
 if(!prepared||!kitPublishToken||kitPublishBusy)return;
 const name=prepared.kit.kitSku;
 const confirmed=window.confirm('PUBLICAR NOVO KIT FORMAL NA SHOPEE?\n'+
  name+'\nPreço bruto: '+money(prepared.kit.quote.grossPrice)+
  '\nA promoção não será aplicada agora. Esta criação pode gerar um anúncio real. Confirma?');
 if(!confirmed)return;
 kitPublishBusy=true;$('#kitPublishExecute').disabled=true;
 kitPublishStatus('Shopee recebendo criação do Kit Formal. Não repita o envio se houver erro ou tempo esgotado...');
 try{
  const done=await api('/api/shopee/kits/publish/execute',{body:{
   kitSku:name,fields:kitPublishFields(),token:kitPublishToken,confirm:true
  }});
  kitItemId=done.itemId;clearKitPublishApproval();
  $('#kitDiscountNext').hidden=false;
  $('#kitPublishedMessage').textContent='Kit '+name+' · Item ID '+done.itemId+
   ' · Status '+done.status+'. '+done.message;
  kitPublishStatus('✓ Shopee retornou Item ID '+done.itemId+'. O desconto ainda NÃO foi aplicado.','success');
  $('#kitPublishCheck').disabled=true;$('#kitSendPhotos').disabled=true;
  $('#kitPublishPreview').disabled=true;
  void loadDrafts();
 }catch(error){
  clearKitPublishApproval();
  kitPublishStatus('Atenção: '+error.message+
   ' Não tente publicar novamente antes de consultar Meus Kits na Shopee.','error');
  $('#kitVerifyPublished').disabled=false;
  $('#kitDiscountNext').hidden=false;
  $('#kitPublishedMessage').textContent='Verifique a existência deste kit pelo código '+name+
   ' na Central do Vendedor antes de qualquer novo envio.';
 }finally{kitPublishBusy=false;$('#kitPublishExecute').disabled=false;}
}
async function kitDiscountPrepare(){
 if(!prepared||!kitItemId)return kitPublishStatus('Confirme o novo Item ID antes do desconto.','error');
 if(kitPublishBusy)return;
 const discountId=$('#kitDiscountId').value.trim();
 if(!/^[1-9]\d{0,17}$/.test(discountId))
  return kitPublishStatus('Informe o ID válido de uma campanha Minha Promoção ativa ou agendada.','error');
 kitPublishBusy=true;$('#kitDiscountPreview').disabled=true;
 kitDiscountToken=null;$('#kitDiscountPreviewBox').hidden=true;
 kitPublishStatus('Conferindo Kit Formal publicado, preços 0/9, pesquisa de concorrentes e Minha Promoção...');
 try{
  const preview=await api('/api/shopee/kits/discount/preview',{body:{
   kitSku:prepared.kit.kitSku,discountId
  }});
  kitDiscountToken=preview.token;
  $('#kitDiscountSummary').textContent=[
   'Kit '+preview.kitSku+' · Item ID '+preview.itemId,
   'Campanha: '+preview.discountName+' (ID '+preview.discountId+')',
   'Ação: '+(preview.action==='add'?'ADICIONAR à promoção':'ATUALIZAR promoção existente'),
   'Preço bruto publicado: '+money(preview.gross),
   'Preço promocional desejado: '+money(preview.promo),
   'Após cupom opcional: '+money(preview.afterCoupon),
   'Margem líquida: '+pct(preview.margin),
   'Comparáveis verificados: '+preview.marketOffers,
   'Esta operação altera APENAS o desconto do kit e requer outra aprovação.'
  ].join('\n');
  $('#kitDiscountPreviewBox').hidden=false;
  kitPublishStatus('Prévia do desconto preparada. Confira a campanha e autorize a segunda etapa.','success');
 }catch(error){kitPublishStatus('Desconto bloqueado: '+error.message+
  ' O Kit Formal continua cadastrado na Shopee.','error');}
 finally{kitPublishBusy=false;$('#kitDiscountPreview').disabled=false;}
}
async function kitDiscountApply(){
 if(!prepared||!kitDiscountToken||kitPublishBusy)return;
 const discountId=$('#kitDiscountId').value.trim();
 if(!window.confirm('CONFIRMAR DESCONTO NA SHOPEE?\n'+prepared.kit.kitSku+
  '\nCampanha ID '+discountId+'\nPreço promocional conforme a prévia acima.\nConfirma?'))return;
 kitPublishBusy=true;$('#kitDiscountExecute').disabled=true;
 kitPublishStatus('Aplicando desconto ao novo Kit Formal. Não repita a operação se a resposta for incerta...');
 try{
  const data=await api('/api/shopee/kits/discount/execute',{body:{
   kitSku:prepared.kit.kitSku,discountId,token:kitDiscountToken,confirm:true
  }});
  kitDiscountToken=null;$('#kitDiscountPreviewBox').hidden=true;
  kitPublishStatus(data.status==='discount_confirmed'?
   '✓ Minha Promoção confirmada na Shopee. Preço: '+money(data.promo):
   data.message,data.status==='discount_confirmed'?'success':'info');
  $('#kitPublishedMessage').textContent=data.message;
 }catch(error){
  kitDiscountToken=null;$('#kitDiscountPreviewBox').hidden=true;
  kitPublishStatus('Status do desconto não confirmado: '+error.message+
   ' Consulte Minha Promoção antes de enviar novamente.','error');
 }finally{kitPublishBusy=false;$('#kitDiscountExecute').disabled=false;}
}
async function kitVerifyPublished(){
 if(!prepared||kitPublishBusy)return;
 kitPublishBusy=true;
 try{
  const v=await api('/api/shopee/kits/publish/status',{body:{kitSku:prepared.kit.kitSku}});
  kitItemId=v.publication?.itemId||null;
  $('#kitDiscountNext').hidden=!kitItemId&&v.publication?.status!=='uncertain';
  $('#kitPublishedMessage').textContent=v.publication?.message||
   'Status da Shopee não confirmado. Consulte Meus Kits antes de qualquer novo envio.';
  kitPublishStatus(v.discountReady?
   '✓ Kit NORMAL confirmado. Agora selecione uma Minha Promoção em Descontos preparados para preparar o desconto.':
   'Kit ainda pendente de confirmação; desconto não pode ser aplicado.',
   v.discountReady?'success':'info');
 }catch(error){kitPublishStatus('Status não confirmado: '+error.message,'error');}
 finally{kitPublishBusy=false;}
}
function renderSuggestions(data){
 suggestions=data.results||[];
 const root=$('#kitSuggestions');root.replaceChildren();
 $('#kitSource').textContent='Origem: '+String(data.source||'WeDrop + calculadora Shopee');
 if(!suggestions.length){
  root.append(elt('p','', 'Nenhum kit elegível. Apenas SKUs com estoque WeDrop confirmado podem ser sugeridas.'));return;
 }
 for(const kit of suggestions){
  const card=elt('article','kit-card'),pics=elt('div','kit-picture-row');
  kit.components.forEach(product=>addImage(pics,product));
  pics.append(elt('span','kit-margin-bubble',pct(kit.quote.netMarginPct)+' margem'));
  card.append(pics);
  card.append(elt('strong','kit-candidate-title',kit.components.map(x=>x.name).join(' + ')));
  card.append(elt('small','kit-candidate-skus',
   kit.components.map(x=>'SKU '+x.sku+' · '+money(x.unitCost)).join(' | ')));
  const prices=elt('div','kit-mini-prices');
  for(const [label,value] of [
   ['Custo WeDrop',money(kit.componentCost)],['Anúncio bruto',money(kit.quote.grossPrice)],
   ['Preço Shopee',money(kit.quote.marketplacePrice)],['Lucro líquido',money(kit.quote.netProfit)]
  ]){
   const p=elt('div');p.append(elt('span','',label),elt('b','',value));prices.append(p);
  }
  card.append(prices);
  const reason=elt('small','kit-candidate-reason',kit.businessReason||'Produtos complementares');
  reason.title='Estimativa comercial, sem comprovação de demanda de vendas.';
  card.append(reason);
  const open=elt('button','kit-primary','Preparar kit e anúncio →');
  open.type='button';open.addEventListener('click',()=>void prepare(kit));
  card.append(open);root.append(card);
 }
}
async function loadDrafts(){
 const root=$('#kitDraftList');if(!root)return;
 try{
  const result=await api('/api/shopee/kits/drafts');
  root.replaceChildren();
  if(!result.drafts.length){
   root.append(elt('p','', 'Nenhum rascunho salvo. Prepare um kit para iniciar a revisão.'));return;
  }
  for(const draft of result.drafts){
   const card=elt('article','kit-card');
   const pic=elt('div','kit-draft-images');
   for(const url of (draft.images||[]).slice(0,3)){
    const img=elt('img');img.src=url;img.alt='Produto do rascunho '+draft.kitSku;
    img.loading='lazy';img.referrerPolicy='no-referrer';pic.append(img);
   }
   if(!pic.children.length)pic.append(elt('span','','▧'));
   card.append(pic);
   const info=elt('div','kit-draft-description');
   info.append(elt('span','kit-draft-state',draft.publication==='published'?'PUBLICADO NA SHOPEE':
    draft.publication==='uncertain'?'PUBLICAÇÃO A CONFERIR':'RASCUNHO NÃO PUBLICADO'));
   info.append(elt('strong','',draft.title||draft.kitSku));
   info.append(elt('small','',draft.skus.join(' + ')+' · '+draft.skus.length+' unidades'));
   info.append(elt('small','',draft.updatedAt?'Atualizado '+new Date(draft.updatedAt).toLocaleString('pt-BR'):'Em revisão'));
   card.append(info);
   if(draft.quote){
    const prices=elt('div','kit-draft-metrics');
    for(const [label,value] of [
     ...(Number.isFinite(draft.kitCost)?[['Custo total',money(draft.kitCost)]]:[]),
     ['Preço bruto',money(draft.quote.grossPrice)],
     ['Desconto',pct(draft.quote.discountPct)],['Margem',pct(draft.quote.netMarginPct)]
    ]){
     const cell=elt('div');cell.append(elt('small','',label),elt('strong','',value));prices.append(cell);
    }
    card.append(prices);
   }
   const open=elt('button','kit-secondary','Editar e continuar →');
   open.type='button';open.addEventListener('click',()=>void openDraft(draft.kitSku));
   card.append(open);root.append(card);
  }
 }catch(error){
  root.replaceChildren(elt('p','', 'Não foi possível consultar rascunhos: '+error.message));
 }
}
async function openDraft(kitSku){
 status('Recuperando '+kitSku+' e recalculando com preços WeDrop atuais...');
 try{
  const d=await api('/api/shopee/kits/drafts/load',{body:{kitSku}});
  prepared=d;images.clear();resetKitPublication({saved:true,publication:d.publication});
  setKitMargin(d.kit.quote.targetMarginPct);
  $('#kitPacking').value=String(d.kit.packing);
  $('#kitShipping').value=String(d.kit.shipping);
  updateKitOverview();
  renderKit();
  status('Rascunho recuperado. Custos foram recalculados; confira preços e estoque antes de anunciar.','success');
 }catch(error){status('Não foi possível recuperar o kit: '+error.message,'error');}
}
async function saveDraft(){
 if(!prepared)return;
 if(marginUpdatePending){status('Finalize o recálculo da barra de margem antes de salvar o kit.','error');return;}
 const b=$('#kitSaveDraft');b.disabled=true;
 try{
  const res=await api('/api/shopee/kits/drafts/save',{body:{
   skus:prepared.kit.components.map(x=>x.sku),
   ...currentSettings(),title:$('#kitTitle').value,description:$('#kitDescription').value
  }});
  if(!res.saved)throw Error('O servidor não confirmou a gravação do rascunho.');
  resetKitPublication({saved:true});
  status('✓ Rascunho '+res.kitSku+' salvo nesta loja. A Shopee não foi alterada.','success');
  void loadDrafts();
 }catch(error){status('Não foi possível salvar kit: '+error.message,'error');}
 finally{b.disabled=false;}
}
async function search(){
 if(!kitStockReady)return status('Atualize o catálogo e importe a disponibilidade WeDrop antes de gerar kits.','error');
 if(generationBusy)return;
 if(marginTimer)clearTimeout(marginTimer);
 marginRevision++;marginUpdatePending=false;$('#kitSaveDraft').disabled=false;
 const btn=$('#kitSuggest');btn.disabled=true;prepared=null;
 $('#kitDetail').hidden=true;
 try{
  const data=await api('/api/shopee/kits/suggest',{body:{
   category:$('#kitCategory').value,size:Number($('#kitSize').value),...currentSettings()
  }});
  suggestionContext={category:$('#kitCategory').value,size:Number($('#kitSize').value),source:data.source};
  renderSuggestions(data);
  status('Análise concluída: '+suggestions.length+' opções. '+data.disclaimer,'success');
 }catch(error){status(error.message,'error');}
 finally{btn.disabled=false;}
}
function renderKit(){
 if(!prepared)return;
 const {kit,creative}=prepared;
 $('#kitDetail').hidden=false;
 $('#kitSkuTitle').textContent=kit.kitSku;
 const items=$('#kitComponents');items.replaceChildren();
 for(const p of kit.components){
  const card=elt('div','kit-component');addImage(card,p);
  const text=elt('div');text.append(elt('strong','',p.name),
    elt('small','','')); // Corrigido imediatamente abaixo sem HTML dinâmico.
  text.lastChild.textContent='SKU '+p.sku+' · 1 unidade · Custo '+money(p.unitCost);
  if(p.imageUrl){
   const link=elt('a','kit-reference-link','Abrir foto WeDrop para anexar no ChatGPT');
   link.href=p.imageUrl;link.target='_blank';link.rel='noopener noreferrer';
   text.append(link);
  }
  card.append(text);items.append(card);
 }
 const prices=$('#kitNumbers');prices.replaceChildren();
 for(const [label,value] of [
  ['Custos dos produtos',money(kit.componentCost)],
  ['Custo total com extras',money(kit.kitCost)],
  ['Preço bruto',money(kit.quote.grossPrice)],
  ['Desconto base',pct(kit.quote.discountPct)],
  ['Vitrine Shopee',money(kit.quote.marketplacePrice)],
  ['Com cupom',money(kit.quote.afterCoupon)],
  ['Lucro líquido',money(kit.quote.netProfit)],
  ['Margem líquida',pct(kit.quote.netMarginPct)]
 ]){
  const cell=elt('div');cell.append(elt('span','',label),elt('b','',value));prices.append(cell);
 }
 $('#kitWarning').textContent=kit.warning+' Texto criado por '+creative.source+'. Verifique estoque e capacidade de envio de vários SKUs.';
 $('#kitTitle').value=creative.title;
 $('#kitDescription').value=creative.description;
 updateKitTextCounters();
 renderImageSlots();
 $('#kitDetail').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderImageSlots(){
 const root=$('#kitImages');root.replaceChildren();
 if(!prepared)return;
 for(let slot=1;slot<=9;slot++){
  const card=elt('div','kit-image-card'),image=images.get(slot);
  card.append(elt('strong','', String(slot).padStart(2,'0')+'/09'));
  if(image){
   const pic=elt('img');pic.src=image;pic.alt='Imagem '+slot+' do kit importada para revisão';card.append(pic);
   const download=elt('button','kit-secondary','Baixar PNG '+slot);
   download.addEventListener('click',()=>downloadData(image,
    prepared.kit.kitSku+'-foto-'+String(slot).padStart(2,'0')+'.png'));
   card.append(download);
  }else card.append(elt('div','kit-placeholder','▧'));
  const prompt=elt('button','kit-secondary','Copiar prompt');
  prompt.type='button';
  prompt.addEventListener('click',()=>void copy(prepared.creative.prompts[slot-1]));
  card.append(prompt);
  const details=elt('details','kit-prompt-fallback');
  const summary=elt('summary','','Ver prompt');
  const field=elt('textarea');field.readOnly=true;field.rows=5;
  field.value=prepared.creative.prompts[slot-1];
  details.append(summary,field);card.append(details);
  const chooser=elt('input','kit-photo-upload');chooser.type='file';
  chooser.accept='image/png,image/jpeg,image/webp';
  chooser.setAttribute('aria-label','Importar foto '+slot+' gerada no ChatGPT Plus');
  chooser.addEventListener('change',()=>void uploadPhoto(slot,chooser.files?.[0]));
  card.append(chooser);
  root.append(card);
 }
}
function chatgptHandoff(prompt){
 // A aba precisa abrir no clique, não depois de um await, para que o
 // navegador não a bloqueie. Nenhuma credencial ou cookie é repassado.
 // Solicitar a cópia ainda com foco nesta aba, antes de abrir o ChatGPT.
 const copying=navigator.clipboard.writeText(prompt);
 window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
 copying.then(()=>{
  imageStatus('Prompt copiado. No ChatGPT Plus, cole com Ctrl+V; para imagens, anexe as fotos originais de TODAS as SKUs. Ao terminar, volte e importe o resultado.','success');
 }).catch(()=>imageStatus('Cópia automática bloqueada: utilize os botões de copiar ou selecione o prompt no campo.','error'));
 // Por segurança a nova aba não recebe acesso à janela da loja.
 // Com noopener o navegador pode retornar null mesmo tendo aberto a aba.
}
async function uploadPhoto(slot,file){
 if(!file)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){
  imageStatus('Imagem '+slot+': envie PNG, JPG ou WebP até 12 MB.','error');return;
 }
 try{
  const bitmap=await createImageBitmap(file);
  try{
   const canvas=document.createElement('canvas');
   canvas.width=1200;canvas.height=1200;
   const ctx=canvas.getContext('2d');
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1200,1200);
   const scale=Math.min(1200/bitmap.width,1200/bitmap.height);
   const w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);
   ctx.drawImage(bitmap,Math.floor((1200-w)/2),Math.floor((1200-h)/2),w,h);
   images.set(slot,canvas.toDataURL('image/png'));
   kitShopeePhotoSlots.delete(slot);
   clearKitPublishApproval();
  }finally{bitmap.close();}
  renderImageSlots();
  imageStatus('Imagem '+slot+' importada em PNG 1200 × 1200 para conferência. Imagens permanecem nesta aba e não são publicadas.','success');
 }catch(error){imageStatus('Falha ao importar imagem: '+error.message,'error');}
}
async function plusResearch(){
 if(!kitStockReady)return status('Estoque WeDrop não conferido; importação obrigatória.','error');
 const btn=$('#kitPlusResearch');btn.disabled=true;
 try{
  const r=await api('/api/shopee/kits/plus-brief',{body:{
   category:$('#kitCategory').value,size:Number($('#kitSize').value)
  }});
  $('#kitResearchPrompt').value=r.prompt;
  status('Pesquisa preparada com '+r.candidatesCount+' SKUs reais. Clique em "Copiar prompt + abrir ChatGPT Plus" e cole o texto no chat.','success');
 }catch(error){status(error.message,'error');}
 finally{btn.disabled=false;}
}
async function importPlusSuggestions(){
 if(!kitStockReady)return status('Estoque WeDrop não conferido; não é permitido importar kits.','error');
 const btn=$('#kitPlusImport');btn.disabled=true;
 try{
  const size=Number($('#kitSize').value);
  const lines=$('#kitPlusOutput').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length||lines.length>8)throw Error('Cole entre 1 e 8 linhas com SKUs reais.');
  const kits=lines.map(l=>{
   const sku=l.replace(/^[•*-\s]+/,'').split('|').map(x=>x.trim()).filter(Boolean);
   if(sku.length!==size||new Set(sku).size!==size)throw Error('Cada linha precisa conter '+size+' SKUs diferentes separados por |.');
   return sku;
  });
  const r=await api('/api/shopee/kits/plus-import',{body:{
   category:$('#kitCategory').value,size,kits,...currentSettings()
  }});
  suggestionContext={category:$('#kitCategory').value,size,source:r.source};
  renderSuggestions(r);
  status('Sugestões do ChatGPT Plus recebidas. Todos os SKUs e custos foram revalidados pelo sistema.','success');
 }catch(error){status('Não foi possível importar sugestões: '+error.message,'error');}
 finally{btn.disabled=false;}
}
async function plusText(){
 if(!prepared)return;
 const btn=$('#kitPlusText');btn.disabled=true;
 try{
  const r=await api('/api/shopee/kits/plus-content',{body:{
   skus:prepared.kit.components.map(x=>x.sku),...currentSettings()
  }});
  if(r.kitSku!==prepared.kit.kitSku)throw Error('SKU de kit diferente.');
  $('#kitContentPrompt').value=r.prompt;
  $('#kitContentDetails').open=true;
  status('Orientação pronta. Clique em "Copiar orientação + abrir ChatGPT Plus" e depois importe a resposta neste painel.','success');
 }catch(error){status('Não foi possível preparar texto: '+error.message,'error');}
 finally{btn.disabled=false;}
}
function importPlusText(){
 if(!prepared)return;
 const raw=$('#kitPlusTextResult').value.trim();
 const title=raw.match(/(?:^|\n)\s*(?:T[ÍI]TULO)\s*:\s*(.+)/i);
 const start=raw.search(/(?:^|\n)\s*DESCRI[ÇC][ÃA]O\s*:/i);
 if(!title||start<0){
  status('A resposta precisa ter TÍTULO: e DESCRIÇÃO: para evitar importar texto incompleto.','error');return;
 }
 const description=raw.slice(start).replace(/^\s*DESCRI[ÇC][ÃA]O\s*:\s*/i,'').trim();
 if(title[1].trim().length<10||title[1].trim().length>120||description.length<80||description.length>2000){
  status('Título de 10 a 120 caracteres e descrição de 80 a 2000 caracteres são necessários.','error');return;
 }
 $('#kitTitle').value=title[1].trim();
 $('#kitDescription').value=description;
 updateKitTextCounters();
 kitSaved=false;clearKitPublishApproval();
 status('Título e descrição importados. Salve o rascunho atualizado antes de publicar.','success');
}

async function prepare(kit){
 if(generationBusy||marginUpdatePending)return;
 status('Gerando composição comercial do kit '+kit.kitSku+'...', 'info');
 try{
  const data=await api('/api/shopee/kits/prepare',{body:{
   skus:kit.components.map(x=>x.sku),...currentSettings()
  }});
  prepared=data;images.clear();resetKitPublication({saved:false});renderKit();
  status('Kit '+data.kit.kitSku+' preparado para revisão. Nenhum anúncio criado na Shopee.','success');
 }catch(error){status('Preparação não concluída: '+error.message,'error');}
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);imageStatus('Texto copiado para a área de transferência.','success');}
 catch{imageStatus('O navegador bloqueou a cópia. Selecione e copie manualmente o conteúdo.','error');}
}
function downloadData(url,name){
 const a=elt('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
}
function openChatGPTImages(){
 if(!prepared)return;
 chatgptHandoff(prepared.creative.prompts.join('\n\n--- PRÓXIMA IMAGEM ---\n\n'));
 imageStatus('Copiadas as nove instruções. Gere e importe cada imagem separadamente; anexe ao ChatGPT as fotos de referência de todas as SKUs.','success');
}

function exportPack(){
 if(!prepared)return;
 const {kit,creative}=prepared;
 const txt=[
  'REDE ACHADOS BR – FICHA DE KIT',kit.kitSku,
  'ORIGEM: WE DROP – somente SKUs reais',
  'ITENS:',...kit.components.map(p=>'1x '+p.sku+' — '+p.name+' — '+money(p.unitCost)),
  'Custo produtos: '+money(kit.componentCost),
  'Custo extra: '+money(kit.packing+kit.shipping),
  'Preço bruto: '+money(kit.quote.grossPrice),
  'Desconto base: '+pct(kit.quote.discountPct),
  'Preço Shopee: '+money(kit.quote.marketplacePrice),
  'Após cupom: '+money(kit.quote.afterCoupon),
  'Lucro líquido estimado: '+money(kit.quote.netProfit),
  'Margem líquida estimada: '+pct(kit.quote.netMarginPct),
  'AVISO: sem comprovação de demanda, frete de kit ou estoque; não publicado.',
  'TÍTULO:', $('#kitTitle').value,'DESCRIÇÃO:',$('#kitDescription').value,
  ...creative.prompts.map((p,i)=>'\n===== IMAGEM '+(i+1)+' =====\n'+p)
 ].join('\n');
 const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 downloadData(url,kit.kitSku+'-ficha-prompts.txt');
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
// Mesmo mecanismo da barra de Otimização: arraste, toque ou use as setas.
$('#kitMargin')?.addEventListener('input',()=>setKitMargin($('#kitMargin').value,{recalculate:true}));
for(const [selector,step] of [['#kitMarginPlus',1],['#kitMarginMinus',-1]]){
 $(selector)?.addEventListener('click',()=>setKitMargin(Number($('#kitMargin').value)+step,{recalculate:true}));
}
setKitMargin($('#kitMargin').value);
updateKitOverview();
function clearKitSearchSelection(){
 updateKitOverview();suggestionContext=null;suggestions=[];
 $('#kitSuggestions').replaceChildren(elt('p','', 'Configuração alterada. Pesquise novamente para recalcular sugestões desta categoria.'));
 $('#kitSource').textContent='Aguardando pesquisa com filtros atuais';
}
$('#kitCategory')?.addEventListener('change',clearKitSearchSelection);
$('#kitSize')?.addEventListener('change',clearKitSearchSelection);
$('#kitShipping')?.addEventListener('input',()=>{
 updateKitOverview();scheduleKitMarginReprice();
});
$('#kitPacking')?.addEventListener('input',()=>scheduleKitMarginReprice());
$('#kitTitle')?.addEventListener('input',onKitContentEdit);
$('#kitDescription')?.addEventListener('input',onKitContentEdit);
$('#kitStockCsv')?.addEventListener('change',()=>{
 $('#kitStockImport').disabled=!$('#kitStockCsv').files?.length;
});
$('#kitStockImport')?.addEventListener('click',()=>void importKitStockCsv());
$('#kitStockReload')?.addEventListener('click',()=>{categoriesLoaded=false;void categories(true);});
$('#kitSuggest')?.addEventListener('click',()=>void search());
$('#kitPlusResearch')?.addEventListener('click',()=>void plusResearch());
$('#kitPlusImport')?.addEventListener('click',()=>void importPlusSuggestions());
$('#kitOpenResearchPrompt')?.addEventListener('click',()=>{
 const prompt=$('#kitResearchPrompt').value;
 if(prompt)chatgptHandoff(prompt);else status('Prepare primeiro a pesquisa com os SKUs WeDrop.','error');
});
$('#kitOpenContentPrompt')?.addEventListener('click',()=>{
 const prompt=$('#kitContentPrompt').value;
 if(prompt)chatgptHandoff(prompt);else status('Prepare primeiro o prompt de título e descrição.','error');
});
$('#kitPlusText')?.addEventListener('click',()=>void plusText());
$('#kitImportText')?.addEventListener('click',importPlusText);

$('#kitGenerateAll')?.addEventListener('click',openChatGPTImages);
$('#kitDownloadPack')?.addEventListener('click',exportPack);
$('#kitSaveDraft')?.addEventListener('click',()=>void saveDraft());
$('#kitPublishCheck')?.addEventListener('click',()=>void kitReadinessCheck());
$('#kitSendPhotos')?.addEventListener('click',()=>void kitSendPhotos());
$('#kitPublishPreview')?.addEventListener('click',()=>void kitPreparePublishPreview());
$('#kitPublishExecute')?.addEventListener('click',()=>void kitPublishExecute());
$('#kitVerifyPublished')?.addEventListener('click',()=>void kitVerifyPublished());
$('#kitDiscountPreview')?.addEventListener('click',()=>void kitDiscountPrepare());
$('#kitDiscountExecute')?.addEventListener('click',()=>void kitDiscountApply());
$('#kitDiscountId')?.addEventListener('input',()=>{kitDiscountToken=null;$('#kitDiscountPreviewBox').hidden=true;});

$('#kitPreOrder')?.addEventListener('change',()=>{
 $('#kitDaysToShip').disabled=!$('#kitPreOrder').checked;clearKitPublishApproval();
});
for(const selector of ['#kitMainSku','#kitLogisticId','#kitWeightKg','#kitLengthCm',
 '#kitWidthCm','#kitHeightCm','#kitAutoSyncDts','#kitPreOrder','#kitDaysToShip',
 '#kitContentsReviewed','#kitPhotosReviewed','#kitSingleParcelConfirmed','#kitTitle','#kitDescription']){
 $(selector)?.addEventListener('change',clearKitPublishApproval);
}

$('#kitRefreshDrafts')?.addEventListener('click',()=>void loadDrafts());
$('#kitCopyTitle')?.addEventListener('click',()=>void copy($('#kitTitle').value));
$('#kitCopyDescription')?.addEventListener('click',()=>void copy($('#kitDescription').value));
$('#kitCopyAllPrompts')?.addEventListener('click',()=>prepared&&void copy(prepared.creative.prompts.join('\n\n\n')));
$('#kitClose')?.addEventListener('click',()=>{$('#kitDetail').hidden=true;});
window.RAKitBuilderLoad=()=>{void categories();void loadDrafts();};
if(location.pathname.replace(/\/$/,'').endsWith('/kits'))window.RAKitBuilderLoad();
document.querySelector('a[data-tab="kits"]')?.addEventListener('click',()=>window.RAKitBuilderLoad());
