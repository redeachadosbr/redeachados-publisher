import {parseKitChatResult} from './kit-chat-result-parser.js?v=2.5.2-theme-review';
import {scoreKitSeoTitle,parseKitSeoResponse,kitSeoRiskFlags} from './kit-seo-helper.js';
import {detectSkuMeasurements,skuMeasurementSummary} from './kit-measurements.js';
import {kitImageFilenameSlot,kitImageNextSlot,kitPlanImageImports,kitMoveImage} from './kit-gallery-order.js';
import {buildKitPlusImageBrief,kitPlusPromptLink} from './kit-plus-image-brief.js';
import {createKitPhotoStore} from './kit-extension-bridge.js';
import {createKitExtensionController} from './kit-extension-runtime.js';
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
let kitAutoImageBusy=false,kitAutoImageStop=false,kitAutoImageApiConnected=false,kitAutoImageSku=null;
let kitWatchHandle=null,kitWatchSku=null,kitWatchTimer=null,kitWatchBusy=false;
let kitWatchSeen=new Set(),kitGalleryImportBusy=false,kitDraggingSlot=null;
const kitPhotoStore=createKitPhotoStore();
let kitBridgeController=null,kitRestoredSku='';
let kitActiveDraftSku=null,kitDraftOpenRevision=0,kitDraftNeedsRefresh=false;
let kitContentSku='',kitContentManualFacts=new Map(),kitContentSeoTitles=[],
 kitContentAwaitingResponse=false,kitContentBusy=false;
let kitCurrentMode='builder';
function setKitMode(next,{scroll=false}={}){
 if(next!=='import'&&next!=='builder')return;
 kitCurrentMode=next;
 $('#kitViewImport').hidden=next!=='import';
 $('#kitViewBuilder').hidden=next!=='builder';
 for(const [mode,id] of [['import','#kitModeImport'],['builder','#kitModeBuilder']]){
  const active=mode===next;
  $(id).setAttribute('aria-selected',active?'true':'false');
  $(id).tabIndex=active?0:-1;
 }
 $('#tab-kits').dataset.kitMode=next;
 if(scroll)$('#kitMode'+(next==='import'?'Import':'Builder')).scrollIntoView({behavior:'smooth',block:'start'});
}
let kitStockReady=false,kitStockLastCheck=null;
let kitUnifiedState=null;
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
function refreshKitEditorOverview(kit){
 const photos=$('#kitEditorProductPhotos');
 if(!photos)return;
 photos.replaceChildren();
 kit.components.forEach((p,index)=>{
   if(index){
     const plus=elt('span','kit-editor-photo-plus','+');
     plus.setAttribute('aria-hidden','true');
     photos.append(plus);
   }
   const tile=elt('div','kit-editor-product-tile');
   tile.title=p.name+' · SKU '+p.sku;
   addImage(tile,p);
   photos.append(tile);
 });
 $('#kitEditorCost').textContent=money(kit.kitCost);
 $('#kitEditorGross').textContent=money(kit.quote.grossPrice);
 $('#kitEditorDiscount').textContent=pct(kit.quote.discountPct);
 $('#kitEditorMargin').textContent=pct(kit.quote.netMarginPct);
}
function refreshKitPrices(kit){
 refreshKitEditorOverview(kit);
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
   if(context.idea){
    calls.push(api('/api/shopee/kits/idea-search',{body:{
     idea:context.idea,size:context.size,...settings
    }}).then(data=>({kind:'suggestions',data})));
   }else{
    const current=suggestions.map(kit=>kit.components.map(p=>p.sku));
    calls.push(api('/api/shopee/kits/plus-import',{body:{
     category:context.category,size:context.size,kits:current,...settings
    }}).then(data=>({kind:'suggestions',data})));
   }
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
    kitDraftNeedsRefresh=false;
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
function kitDateTime(value){
 if(!value)return 'Não informado';
 const n=Date.parse(value);
 return Number.isFinite(n)?new Date(n).toLocaleString('pt-BR'):'Não informado';
}
function displayKitStockGate(stock,catalogCount){
 kitStockReady=stock?.ready===true;
 kitStockLastCheck=stock||null;
 const catalogDate=Date.parse(stock?.catalogLastImportedAt||'');
 const catalogFresh=Number.isFinite(catalogDate)&&catalogDate<=Date.now()&&
  Date.now()-catalogDate<=24*60*60*1000;
 const gate=$('#kitStockGate');
 gate.dataset.ready=kitStockReady?'yes':'no';
 $('#tab-kits').classList.toggle('kit-stock-blocked',!kitStockReady);
 $('#kitStockBlocked').hidden=kitStockReady;
 $('#kitBuilderStockNotice').hidden=kitStockReady;
 $('#kitImportNextHint').textContent=kitStockReady?
  '✓ Catálogo e estoque confirmados. Abra a montagem para pesquisar kits com SKUs DISPONÍVEIS.':
  'Catálogo e rascunhos estão salvos. Para criar novos kits ou publicar, atualize catálogo e estoque; para continuar editando um kit, abra seu rascunho.';
 $('#kitCatalogCard').dataset.ready=catalogFresh?'yes':'no';
 $('#kitAvailabilityCard').dataset.ready=kitStockReady?'yes':'no';
 $('#kitCatalogHeadline').textContent=catalogFresh?'Catálogo WeDrop atualizado':'Catálogo salvo · atualização vencida';
 $('#kitCatalogDate').textContent='Última atualização: '+kitDateTime(stock?.catalogLastImportedAt);
 $('#kitCatalogBadge').textContent=catalogFresh?'Atualizado':'Desatualizado';
 const hasStock=Number(stock?.importedCount||0)>0;
 const stockFresh=stock?.stockRecent===true;
 $('#kitStockHeadline').textContent=stockFresh?
  'Estoque WeDrop importado':hasStock?'Estoque WeDrop vencido':'Estoque WeDrop não importado';
 $('#kitStockSubhead').textContent='Última importação: '+kitDateTime(stock?.lastSuccessAt)+
  ' · SKUs com status: '+Number(stock?.importedCount||0);
 $('#kitStockStamp').textContent=stockFresh?
  (kitStockReady?'Disponibilidade validada':'Estoque importado · catálogo pendente'):
  (hasStock?'Atualização vencida':'Importação pendente');
 $('#kitStockExplanation').textContent=hasStock?
  'Disponíveis: '+Number(stock?.availableCount||0)+' · Indisponíveis: '+
  Number(stock?.unavailableCount||0)+' · Sem informação no arquivo: '+
  Math.max(0,Number(catalogCount||0)-Number(stock?.importedCount||0))+
  '. '+(stockFresh?'Disponibilidade importada; '+(catalogFresh?'aguardando alinhamento com o catálogo.':
  'falta atualizar o catálogo de custos.'):'Atualize o arquivo de estoque WeDrop.'):
  'Importe os status DISPONÍVEL / INDISPONÍVEL de um CSV ou Excel WeDrop.';
 $('#kitBlockedTag').textContent=kitStockReady?'Geração liberada':
  (!catalogFresh?'⊘ Catálogo pendente':'⊘ Atualização pendente');
 $('#kitStockBlocked').querySelector('strong').textContent=kitStockReady?
  'Catálogo e estoque válidos para montar kits.':
  (!catalogFresh?'Atualização do catálogo pendente para novos kits e publicação.':
   !stockFresh?'Atualização de estoque pendente para novos kits e publicação.':
   'Confirme a disponibilidade após atualizar o catálogo para novos kits e publicação.');
 $('#kitStockBlocked').querySelector('p').textContent=kitStockReady?
  'Somente SKUs DISPONÍVEIS poderão ser selecionadas.':
  'O catálogo continua salvo e os rascunhos podem ser abertos e editados. Para novas combinações, alterar valores ou publicar, atualize os dados WeDrop e a disponibilidade. Não apague nem recrie seus kits.';
 for(const selector of ['#kitSuggest','#kitPlusResearch','#kitPlusAutoStart','#kitPlusClipboardImport','#kitPlusImport'])
  $(selector).disabled=!kitStockReady;
 $('#kitSource').textContent=kitStockReady?'Origem: WeDrop · estoque verificado':'ⓘ Indisponível no momento';
 if(!kitStockReady){
  // Estoque desatualizado bloqueia ações novas, não apaga edições nem
  // esconde o construtor completo anteriormente criado.
  suggestions=[];suggestionContext=null;
  clearKitPublishApproval();
  $('#kitSuggestions').replaceChildren(elt('p','',
   'Novos kits aguardam atualização da WeDrop. Os rascunhos salvos continuam acessíveis para editar textos, imagens e posições.'));
  status('Estoque sem validação atual. Acesse a aba Importação WeDrop para liberar novas pesquisas.','error');
 }else status('Estoque WeDrop confirmado. Escolha a categoria e pesquise kits compatíveis.','success');
}
function kitUploadFeedback(selector,message,error=false){
 const node=$(selector);node.textContent=message;node.dataset.state=error?'error':'success';
}
async function readKitImportFile(file,purpose){
 if(!file||!file.size||file.size>4_000_000)
  throw Error('Selecione um CSV ou Excel de até 4 MB.');
 const ext=(file.name.split('.').pop()||'').toLowerCase();
 if(!['csv','xlsx','xls'].includes(ext))
  throw Error('Formato inválido. Envie CSV, XLSX ou XLS da WeDrop.');
 if(ext==='csv')return {csv:await file.text(),name:file.name,format:'csv'};
 const base64=await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
  reader.onerror=()=>reject(Error('Não foi possível ler a planilha Excel.'));
  reader.readAsDataURL(file);
 });
 if(!base64)throw Error('O Excel está vazio.');
 const result=await api('/api/shopee/wedrop/convert-excel',{body:{
  base64,fileName:file.name,purpose
 }});
 return {csv:result.csv,name:file.name,format:result.format,sheet:result.sheetName};
}
async function importKitCatalogFile(){
 const file=$('#kitCatalogFile').files?.[0],btn=$('#kitCatalogImport');
 if(!file)return kitUploadFeedback('#kitCatalogImportStatus','Escolha um catálogo CSV ou Excel.',true);
 btn.disabled=true;
 kitUploadFeedback('#kitCatalogImportStatus','Validando arquivo, SKUs, custos e informações WeDrop...');
 try{
  const incoming=await readKitImportFile(file,'catalog');
  const result=await api('/api/shopee/wedrop/auto/import',{body:{
   csv:incoming.csv,fileName:incoming.name
  }});
  kitUploadFeedback('#kitCatalogImportStatus','✓ Catálogo atualizado: '+
   result.uniqueCosts+' SKUs com custo. '+(result.stockImported?
   'Disponibilidade importada no mesmo arquivo.':'A disponibilidade ainda precisa ser importada separadamente. ')+
   (incoming.sheet?'Aba Excel: '+incoming.sheet+'.':''));
  categoriesLoaded=false;
  await categories(true);
 }catch(error){
  kitUploadFeedback('#kitCatalogImportStatus','Importação não concluída: '+error.message,true);
 }finally{btn.disabled=!$('#kitCatalogFile').files?.length;}
}
async function importKitStockCsv(){
 const file=$('#kitStockCsv').files?.[0],btn=$('#kitStockImport');
 if(!file)return kitUploadFeedback('#kitStockImportStatus','Escolha o arquivo de disponibilidade CSV ou Excel.',true);
 btn.disabled=true;
 kitUploadFeedback('#kitStockImportStatus','Conferindo SKUs e status DISPONÍVEL/INDISPONÍVEL...');
 try{
  const incoming=await readKitImportFile(file,'availability');
  const result=await api('/api/shopee/kits/availability/import',{body:{csv:incoming.csv}});
  kitUploadFeedback('#kitStockImportStatus','✓ '+result.imported+' status importados: '+
   result.available+' DISPONÍVEIS, '+result.unavailable+' INDISPONÍVEIS; '+
   result.notCovered+' SKUs sem informação permanecem bloqueadas. '+
   (incoming.sheet?'Aba Excel: '+incoming.sheet+'.':''));
  categoriesLoaded=false;
  await categories(true);
 }catch(error){
  kitUploadFeedback('#kitStockImportStatus','Importação não concluída: '+error.message+
   '. Nenhuma disponibilidade será presumida.',true);
 }finally{btn.disabled=!$('#kitStockCsv').files?.length;}
}
function kitUnifiedStatus(message,state='info'){
 const e=$('#kitUnifiedStatus');e.textContent=message;e.dataset.state=state;
}
function chooseKitCostColumns(preview){
 const panel=$('#kitCostMappingPanel'),select=$('#kitCostColumn');
 select.replaceChildren(new Option('Selecione o custo unitário do fornecedor',''));
 const headers=preview?.headers||[];
 for(let i=0;i<headers.length;i++){
  const normalized=String(headers[i]).normalize('NFD')
   .replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(normalized.trim()==='sku'||/dispon|estoque|status|estado|marca|imagem|ean|ncm|cest|nome|categoria/.test(normalized))continue;
  if(/venda|anuncio|promoc|varejo|marketplace|lucro|margem|comissao/.test(normalized))continue;
  if(/custo|preco|valor|cost|price/.test(normalized)){
   select.append(new Option(headers[i]+' · exemplo: '+String(preview.examples?.[0]?.[i]||'—'),String(i)));
  }
 }
 panel.hidden=select.options.length<=1;
 if(!panel.hidden){
  $('#kitCostMappingReason').textContent='A coluna genérica de preço NÃO será considerada custo automaticamente. '+
   'Selecione apenas o custo unitário real da WeDrop, confirme e revise quantas SKUs serão alteradas.';
  $('#kitCostConfirm').checked=false;$('#kitCostMappingApply').disabled=true;
 }
 return !panel.hidden;
}
async function refreshKitImportData(){
 categoriesLoaded=false;
 await categories(true);
}
async function analyzeAndImportWeDrop(){
 const file=$('#kitUnifiedFile').files?.[0],button=$('#kitUnifiedImport');
 if(!file)return kitUnifiedStatus('Escolha um CSV, XLS ou XLSX da WeDrop.','error');
 button.disabled=true;$('#kitCostMappingPanel').hidden=true;kitUnifiedState=null;
 kitUnifiedStatus('Lendo o arquivo uma vez e identificando custo e disponibilidade...');
 try{
  const catalog=await readKitImportFile(file,'catalog');
  let stockCsv=null;
  try{
   const separate=await readKitImportFile(file,'availability');
   stockCsv=separate.csv;
  }catch{stockCsv=catalog.csv;}
  const [catalogInspect,stockInspect]=await Promise.all([
   api('/api/shopee/kits/import/inspect',{body:{csv:catalog.csv}})
    .catch(e=>({ok:false,error:e.message})),
   stockCsv!==catalog.csv?
    api('/api/shopee/kits/import/inspect',{body:{csv:stockCsv}})
     .catch(e=>({ok:false,error:e.message})):Promise.resolve(null)
  ]);
  const costKnown=catalogInspect.ok&&catalogInspect.automaticLayout?.recognized===true;
  const stockAvailable=stockInspect?.stock?.recognized===true||
   catalogInspect?.stock?.recognized===true;
  if(!costKnown&&!stockAvailable)throw Error(
   'Planilha não tem custo reconhecido nem disponibilidade válida. '+
   (catalogInspect.error||stockInspect?.error||'Confirme as colunas do fornecedor.')
  );
  let catalogImported=null,stockImported=null;
  if(costKnown){
   kitUnifiedStatus('Custo de compra reconhecido. Atualizando catálogo WeDrop...');
   catalogImported=await api('/api/shopee/wedrop/auto/import',{
    body:{csv:catalog.csv,fileName:file.name}
   });
  }
  if(stockAvailable&&!catalogImported?.stockImported){
   kitUnifiedStatus('Verificando disponibilidade das SKUs no catálogo WeDrop...');
   const source=stockInspect?.stock?.recognized?stockCsv:catalog.csv;
   stockImported=await api('/api/shopee/kits/availability/import',{body:{csv:source}});
  }else if(catalogImported?.stockImported)stockImported=catalogImported.stockImported;
  kitUnifiedState={catalogCsv:catalog.csv,stockCsv:stockInspect?.stock?.recognized?
   stockCsv:catalogInspect?.stock?.recognized?catalog.csv:null,preview:catalogInspect,
   fileName:file.name};
  const summary=[
   catalogImported?'Catálogo atualizado: '+catalogImported.uniqueCosts+' custos WeDrop.':
    'Custos NÃO alterados: layout sem identificação segura de custo.',
   stockImported?'Estoque importado: '+(stockImported.imported??stockImported.total??'?')+
    ' SKUs.':'Arquivo sem coluna de disponibilidade validada.'
  ].join(' ');
  const mappingNeeded=!costKnown&&catalogInspect.ok&&chooseKitCostColumns(catalogInspect);
  kitUnifiedStatus(summary+(mappingNeeded?
   ' Confirme a coluna de custo abaixo para concluir a atualização do catálogo.':
   !costKnown?' Para atualizar preços, use uma planilha com custo de aquisição explícito.':''),
   catalogImported&&stockImported?'success':stockImported?'warning':'info');
  await refreshKitImportData();
 }catch(e){
  kitUnifiedStatus('Não foi possível concluir: '+e.message,'error');
  await refreshKitImportData().catch(()=>{});
 }finally{button.disabled=!$('#kitUnifiedFile').files?.length;}
}
async function confirmKitMappedCost(){
 const state=kitUnifiedState,option=$('#kitCostColumn').value,button=$('#kitCostMappingApply');
 if(!state||!state.preview||option===''||!$('#kitCostConfirm').checked)
  return kitUnifiedStatus('Selecione e confirme o custo unitário antes de prosseguir.','error');
 button.disabled=true;
 try{
  const skuColumn=state.preview.headers.findIndex(x=>String(x).trim().toLowerCase()==='sku');
  const costColumn=Number(option);
  const preview=await api('/api/shopee/wedrop/validate',{body:{
   csv:state.catalogCsv,skuColumn,costColumn
  }});
  if(!preview.canImport)throw Error('Nenhuma SKU dessa coluna corresponde à loja. Não alterar custos.');
  const quantity=preview.uniqueCosts;
  const matched=preview.comparison?.matchedCount||0;
  if(!window.confirm('CONFIRMAR IMPORTAÇÃO DOS CUSTOS UNITÁRIOS WEDROP?\n'+
   'Coluna: '+preview.costHeader+'\nSKUs: '+quantity+
   '\nCorrespondências Shopee: '+matched+
   '\nOs custos internos serão atualizados, sem modificar preços publicados.\nConfirma?'))return;
  kitUnifiedStatus('Importando custos confirmados. Os preços da Shopee não serão alterados...');
  const catalog=await api('/api/shopee/wedrop/auto/import',{body:{
   csv:state.catalogCsv,fileName:state.fileName,
   approvedCostMapping:{skuColumn,costColumn,confirmed:true}
  }});
  let stock=null;
  if(state.stockCsv){
   stock=await api('/api/shopee/kits/availability/import',{body:{csv:state.stockCsv}});
  }
  $('#kitCostMappingPanel').hidden=true;
  kitUnifiedStatus('✓ Catálogo confirmado: '+catalog.uniqueCosts+' custos WeDrop atualizados.'+
   (stock?' Disponibilidade sincronizada: '+stock.imported+' SKUs.':' Atualize disponibilidade para gerar kits.'),'success');
  await refreshKitImportData();
 }catch(e){kitUnifiedStatus('Atualização de custo bloqueada: '+e.message,'error');}
 finally{button.disabled=!$('#kitCostConfirm').checked||!$('#kitCostColumn').value;}
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
 const commercialBlocked=uncertain||kitDraftNeedsRefresh;
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
 $('#kitPublishPreview').disabled=!saved||commercialBlocked;
 $('#kitSendPhotos').disabled=!saved||commercialBlocked;
 $('#kitPublishCheck').disabled=!saved||commercialBlocked;
 $('#kitPublishExecute').disabled=!saved||commercialBlocked;
 $('#kitPublishedMessage').textContent=kitItemId?
  'Kit criado com Item ID '+kitItemId+' · Estado: '+String(publication.status)+
  '. O desconto será uma operação posterior, com aprovação própria.':'';
 kitPublishStatus(uncertain?
  'Kit já enviado ou com resposta incerta. NÃO publique novamente; consulte Meus Kits e confirme o status com a Shopee.':
  kitDraftNeedsRefresh?'Rascunho disponível para editar e gerar imagens. Valores salvos são históricos. Atualize catálogo e estoque WeDrop antes de salvar novos preços ou publicar.':
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

let kitCompositionBusy=false;
function kitManualControls(kit,{editor=false}={}){
 const root=elt('div','kit-manual-composition'+(editor?'':' is-card'));
 const note=elt('p','kit-manual-explain',
  'Complemente com uma SKU de outra função, quando fizer sentido. 2 a 3 SKUs; custos, descontos, impostos e lucro serão recalculados.');
 root.append(note);
 const feedback=editor?$('#kitManualStatus'):elt('p','kit-manual-status','Prévia sem publicar; estoque e custo verificados pela WeDrop.');
 const row=(name,mode)=>{
  const line=elt('section','kit-manual-row');
  line.dataset.mode=mode;
  const header=elt('div','kit-manual-row-heading');
  const icon=elt('span','kit-manual-row-icon',mode==='add'?'+':'⇄');
  icon.setAttribute('aria-hidden','true');
  const headerText=elt('div','kit-manual-row-intro');
  headerText.append(elt('strong','',name),elt('small','',mode==='add'?
    'Inclua um produto complementar (2 a 3 SKUs por kit).':
    'Troque um produto do kit por outro do catálogo WeDrop.'));
  header.append(icon,headerText);
  line.append(header);
  const fields=elt('div','kit-manual-row-fields');
  let select=null;
  if(mode==='replace'){
   const choice=elt('label','','Produto a substituir');
   select=elt('select');
   for(const p of kit.components)select.append(new Option(p.sku+' · '+p.name.slice(0,38),p.sku));
   choice.append(select);fields.append(choice);
  }
  const label=elt('label','',mode==='add'?'SKU complementar':'Novo SKU');
  const inputWrap=elt('span','kit-manual-input-wrap');
  const input=elt('input');input.type='text';input.maxLength=120;
  input.placeholder='Ex.: 118004';
  input.autocomplete='off';input.setAttribute('aria-label',name);
  const lens=elt('span','kit-manual-input-lens','⌕');
  lens.setAttribute('aria-hidden','true');
  inputWrap.append(input,lens);
  label.append(inputWrap);fields.append(label);
  line.append(fields);
  const button=elt('button','kit-manual-apply',mode==='add'?'⊕  Adicionar SKU + recalcular':'⇄  Substituir SKU + recalcular');
  button.type='button';button.disabled=mode==='add'&&kit.components.length>=3;
  button.title=button.disabled?'Máximo de 3 produtos por kit':name;
  line.append(button);
  button.addEventListener('click',async()=>{
   if(kitCompositionBusy||marginUpdatePending)return;
   const sku=input.value.trim();
   if(!sku){feedback.textContent='Informe a SKU exata antes de recalcular.';feedback.dataset.state='error';return;}
   if(editor&&(['published','published_pending','publishing','uncertain'].includes(prepared?.publication?.status)||kitItemId)){
    feedback.textContent='Kit já publicado ou com envio pendente. Não é permitido mudar esta composição.';feedback.dataset.state='error';return;
   }
   kitCompositionBusy=true;button.disabled=true;feedback.textContent='Consultando SKU e recalculando todos os valores...';feedback.dataset.state='info';
   try{
    const result=await api('/api/shopee/kits/modify',{body:{
      skus:kit.components.map(x=>x.sku),mode,sku,
      replaceSku:select?.value||'',...currentSettings()
    }});
    if(!result?.kit?.components?.length)throw Error('Resposta sem composição confirmada.');
    // Rascunhos/imagens de outra composição não podem contaminar o kit alterado.
    kitStopAutoFolder({notice:false});
    images.clear();kitDraftNeedsRefresh=false;prepared=result;resetKitPublication({saved:false});
    renderKit();
    const from=kit.components.map(x=>x.sku).join(' + ');
    const to=result.kit.components.map(x=>x.sku).join(' + ');
    if(!editor){
      suggestions=suggestions.map(s=>s===kit?result.kit:s);
      renderSuggestions({results:suggestions,source:suggestionContext?.source||'WeDrop + cálculo'});
    }
    const msg='✓ '+from+' → '+to+'. Custos, impostos, descontos, preço e lucro recalculados. '+(result.kit.reviewRequired?'Revisar coerência e logística antes da publicação.':'Confira embalagem e envio conjunto.');
    $('#kitManualStatus').textContent=msg;$('#kitManualStatus').dataset.state='success';
    status(msg,'success');
   }catch(error){
    feedback.textContent='Alteração não aplicada: '+error.message;feedback.dataset.state='error';
    status('SKU não alterada: '+error.message,'error');
   }finally{kitCompositionBusy=false;button.disabled=false;}
  });
  return line;
 };
 if(kit.components.length<3)root.append(row('Adicionar SKU complementar','add'));
 root.append(row('Substituir SKU existente','replace'));
 if(!editor)root.append(feedback);
 return root;
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
  const reason=elt('small','kit-candidate-reason',
   kit.businessReason||'Complementaridade de uso estimada pelo nome e pela categoria dos produtos.');
  reason.title='Os componentes foram relacionados por função. Isto não é comprovação de vendas.';
  card.append(reason);
  card.append(kitManualControls(kit));
  if(kit.buyerFitScore!=null){
   const explanation=elt('small','kit-candidate-evidence',kit.reviewRequired?
    '⚠ RASCUNHO — REVISAR COERÊNCIA · Compatibilidade física não confirmada · SKUs WeDrop verificadas':
    '✓ Uso complementar · ✓ SKUs WeDrop verificadas · Vendas: ainda não comprovadas');
   explanation.title='A coerência comercial é uma estimativa de compra conjunta, não uma taxa de conversão.';
   card.append(explanation);
  }
  const open=elt('button','kit-primary','Preparar kit e anúncio →');
  open.type='button';open.addEventListener('click',()=>void prepare(kit));
  card.append(open);root.append(card);
 }
}

function kitEditorReturnHome(){
 const detail=$('#kitDetail'),home=$('#kitDetailHome');
 if(detail&&home&&detail.previousElementSibling!==home)home.after(detail);
 for(const card of $('#kitDraftList')?.querySelectorAll('.kit-draft-editing')||[])
  card.classList.remove('kit-draft-editing');
 for(const button of $('#kitDraftList')?.querySelectorAll('[data-draft-edit-button]')||[])
  button.setAttribute('aria-expanded','false');
}
function kitPlaceEditorUnderDraft(kitSku,{targetCard=null}={}){
 const root=$('#kitDraftList'),editor=$('#kitDetail');
 if(!root||!editor)return false;
 const key=String(kitSku||'');
 const card=targetCard?.isConnected&&targetCard.parentElement===root&&targetCard.dataset.kitDraftSku===key
  ?targetCard:[...root.querySelectorAll('[data-kit-draft-sku]')].find(el=>el.dataset.kitDraftSku===key);
 if(!card)return false;
 for(const sibling of root.querySelectorAll('.kit-draft-editing'))sibling.classList.remove('kit-draft-editing');
 for(const button of root.querySelectorAll('[data-draft-edit-button]'))button.setAttribute('aria-expanded','false');
 card.after(editor);card.classList.add('kit-draft-editing');
 card.querySelector('[data-draft-edit-button]')?.setAttribute('aria-expanded','true');
 return true;
}
function kitCloseInlineEditor(){
 kitStopKitExtension('Editor do kit encerrado.');
 kitStopAutoFolder({notice:false});
 kitActiveDraftSku=null;
 kitDraftOpenRevision++;
 $('#kitDetail').hidden=true;
 kitEditorReturnHome();
}
async function loadDrafts({restoreCurrent=true}={}){
 const root=$('#kitDraftList');if(!root)return;
 try{
  const result=await api('/api/shopee/kits/drafts');
  // Evita destruir o formulário se ele estiver dentro da lista ao atualizar.
  kitEditorReturnHome();
  root.replaceChildren();
  if(!result.drafts.length){
   const empty=elt('div','kit-empty-drafts');
   empty.append(elt('span','kit-empty-drafts-illustration','▤'),
    elt('strong','','Nenhum rascunho salvo.'),
    elt('p','','Prepare um kit para iniciar a revisão.'));
   root.append(empty);return;
  }
  for(const draft of result.drafts){
   const card=elt('article','kit-card');
   card.dataset.kitDraftSku=draft.kitSku;
   const pic=elt('div','kit-draft-images');
   for(const url of (draft.images||[]).slice(0,3)){
    const img=elt('img');img.src=url;img.alt='Produto do rascunho '+draft.kitSku;
    img.loading='lazy';img.referrerPolicy='no-referrer';pic.append(img);
   }
   if(!pic.children.length)pic.append(elt('span','','▧'));
   card.append(pic);
   const info=elt('div','kit-draft-description');
   info.append(elt('span','kit-draft-state',draft.publication==='published'?'PUBLICADO NA SHOPEE':
    draft.publication==='uncertain'?'PUBLICAÇÃO A CONFERIR':
    draft.reviewRequired?'RASCUNHO — REVISAR COERÊNCIA':'RASCUNHO NÃO PUBLICADO'));
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
   const actions=elt('div','kit-draft-actions');
   const open=elt('button','kit-secondary','Editar e continuar →');
   open.type='button';
   open.dataset.draftEditButton='';
   open.setAttribute('aria-controls','kitDetail');
   open.setAttribute('aria-expanded','false');
   open.addEventListener('click',()=>void openDraft(draft.kitSku,{targetCard:card,title:draft.title}));
   actions.append(open);
   if(draft.deletable===true){
    const remove=elt('button','kit-draft-remove','Excluir');
    remove.type='button';
    remove.title='Excluir somente este rascunho da loja, sem alterar a Shopee';
    remove.setAttribute('aria-label','Excluir rascunho '+(draft.title||draft.kitSku));
    remove.addEventListener('click',()=>void deleteDraft(draft,remove));
    actions.append(remove);
   }
   card.append(actions);root.append(card);
  }
  if(kitActiveDraftSku&&prepared&&!$('#kitDetail').hidden){
   if(!kitPlaceEditorUnderDraft(kitActiveDraftSku)){
    // Uma composição nova não salva pode não ter cartão ainda.
    kitEditorReturnHome();
    kitActiveDraftSku=null;
   }
  }else if(restoreCurrent&&!prepared&&result.drafts.length){
   // Rascunho mais recente restaurado sob o cartão sem mover a página.
   void openDraft(result.drafts[0].kitSku,{scroll:false,
    targetCard:root.querySelector('[data-kit-draft-sku]'),title:result.drafts[0].title});
  }
 }catch(error){
  kitEditorReturnHome();
  root.replaceChildren(elt('p','', 'Não foi possível consultar rascunhos: '+error.message));
 }
}
async function deleteDraft(draft,button){
 const name=String(draft.title||draft.kitSku);
 const confirmed=window.confirm('Excluir definitivamente este rascunho?\n\n'+
  name+'\nSKU: '+draft.kitSku+'\n\nEsta ação remove apenas o rascunho salvo nesta loja. Não exclui produtos da WeDrop nem anúncios da Shopee.');
 if(!confirmed)return;
 button.disabled=true;
 button.textContent='Excluindo…';
 const notice=$('#kitDraftDeleteStatus');
 try{
  const result=await api('/api/shopee/kits/drafts/delete',{body:{kitSku:draft.kitSku}});
  if(result.deleted!==true)throw Error('O servidor não confirmou a exclusão.');
  if(prepared?.kit?.kitSku===draft.kitSku){
   kitStopAutoFolder({notice:false});
   prepared=null;images.clear();kitCloseInlineEditor();
   resetKitPublication();
  }
  await loadDrafts({restoreCurrent:false});
  if(notice){notice.textContent='✓ Rascunho '+draft.kitSku+' excluído. Nenhum anúncio foi alterado na Shopee.';notice.dataset.state='success';notice.hidden=false;}
  status('✓ Rascunho '+draft.kitSku+' excluído. A Shopee não foi alterada.','success');
 }catch(error){
  if(notice){notice.textContent='Não foi possível excluir: '+error.message;notice.dataset.state='error';notice.hidden=false;}
  status('Não foi possível excluir rascunho: '+error.message,'error');
  button.disabled=false;button.textContent='Excluir';
 }
}
async function openDraft(kitSku,{scroll=true,targetCard=null,title=''}={}){
 const revision=++kitDraftOpenRevision;
 const button=targetCard?.querySelector('[data-draft-edit-button]');
 if(button){button.disabled=true;button.textContent='Abrindo editor...';}
 status('Recuperando '+kitSku+' e recalculando com preços WeDrop atuais...');
 try{
  const d=await api('/api/shopee/kits/drafts/load',{body:{kitSku}});
  if(revision!==kitDraftOpenRevision)return; // Uma escolha mais recente tem prioridade.
  kitStopKitExtension('Outro kit selecionado.');
  kitStopAutoFolder({notice:false});
  kitRestoredSku='';
  kitDraftNeedsRefresh=d.stockRevalidationRequired===true;
  prepared=d;images.clear();resetKitPublication({saved:true,publication:d.publication});
  setKitMargin(d.kit.quote.targetMarginPct);
  $('#kitPacking').value=String(d.kit.packing);
  $('#kitShipping').value=String(d.kit.shipping);
  updateKitOverview();
  kitActiveDraftSku=kitSku;
  kitPlaceEditorUnderDraft(kitSku,{targetCard});
  renderKit({scroll,displayTitle:title||d.creative?.title});
  status(kitDraftNeedsRefresh?
   '✓ Kit '+kitSku+' recuperado. Você pode editar textos e imagens. Custos e estoque NÃO foram atualizados; a publicação continua bloqueada. '+(d.stockReason||''):
   'Rascunho selecionado: '+(title||d.creative?.title||kitSku)+'. Custos e estoque recalculados.',
   kitDraftNeedsRefresh?'info':'success');
 }catch(error){
  if(revision===kitDraftOpenRevision)
   status('Não foi possível recuperar o kit '+kitSku+': '+error.message,'error');
 }finally{
  if(button?.isConnected){button.disabled=false;button.textContent='Editar e continuar →';}
 }
}
async function saveDraft(){
 if(!prepared)return;
 if(marginUpdatePending){status('Finalize o recálculo da barra de margem antes de salvar o kit.','error');return;}
 const b=$('#kitSaveDraft');b.disabled=true;
 try{
  const res=await api('/api/shopee/kits/drafts/save',{body:{
   skus:prepared.kit.components.map(x=>x.sku),kitSku:prepared.kit.kitSku,
   ...currentSettings(),title:$('#kitTitle').value,description:$('#kitDescription').value,
   seoTitles:kitContentSeoTitles.map(x=>x.title),
   manualFacts:Object.fromEntries(kitContentManualFacts.entries())
  }});
  if(!res.saved)throw Error('O servidor não confirmou a gravação do rascunho.');
  kitDraftNeedsRefresh=res.stockRevalidationRequired===true;
  resetKitPublication({saved:true});
  if(kitActiveDraftSku)kitActiveDraftSku=res.kitSku;
  status(kitDraftNeedsRefresh?
   '✓ Textos do rascunho '+res.kitSku+' salvos. Os preços e o estoque antigos ainda precisam de atualização antes de publicar.':
   '✓ Rascunho '+res.kitSku+' salvo nesta loja. A Shopee não foi alterada.','success');
  kitImportState('Textos salvos no rascunho · sem publicar na Shopee','success');
  void loadDrafts();
  return true;
 }catch(error){
  status('Não foi possível salvar kit: '+error.message,'error');
  kitImportState('Erro ao salvar: '+error.message,'error');
  return false;
 }
 finally{b.disabled=false;}
}
async function search(){
 if(!kitStockReady)return status('Atualize o catálogo e importe a disponibilidade WeDrop antes de gerar kits.','error');
 if(generationBusy)return;
 if(marginTimer)clearTimeout(marginTimer);
 marginRevision++;marginUpdatePending=false;$('#kitSaveDraft').disabled=false;
 const btn=$('#kitSuggest');btn.disabled=true;prepared=null;kitDraftNeedsRefresh=false;
 kitCloseInlineEditor();
 try{
  const idea=String($('#kitIdea')?.value||'').trim(),size=Number($('#kitSize').value);
  if(idea&&idea.length<3)throw Error('Descreva a ideia com pelo menos 3 caracteres.');
  const data=idea?
   await api('/api/shopee/kits/idea-search',{body:{idea,size,...currentSettings()}}):
   await api('/api/shopee/kits/suggest',{body:{category:$('#kitCategory').value,
    size,...currentSettings()}});
  suggestionContext={category:$('#kitCategory').value,size,idea:idea||null,source:data.source};
  renderSuggestions(data);
  status((suggestions.length?'✓ Kits montados para revisão: ':'Nenhum kit elegível: ')+
   suggestions.length+' opção(ões). '+data.disclaimer,suggestions.length?'success':'info');
 }catch(error){status(error.message,'error');}
 finally{btn.disabled=false;}
}
function renderKit({scroll=true,displayTitle=''}={}){
 if(!prepared)return;
 const {kit,creative}=prepared;
 if(kitContentSku!==kit.kitSku){
  kitContentSku=kit.kitSku;
  kitContentManualFacts=new Map(Object.entries(creative?.manualFacts||{})
   .filter(([sku,value])=>kit.components.some(p=>p.sku===sku)&&typeof value==='string'));
  kitContentSeoTitles=Array.isArray(creative?.seoTitles)&&creative.seoTitles.length===3?
   creative.seoTitles.map((title,i)=>({number:i+1,title})):[];
  kitContentAwaitingResponse=false;
  $('#kitMissingFacts').hidden=true;$('#kitMissingFactFields').replaceChildren();
  $('#kitSeoOptions').hidden=true;$('#kitSeoOptionList').replaceChildren();
  $('#kitContentPrompt').value='';$('#kitPlusTextResult').value='';
  kitImportState('Clique em Importar anúncio copiado do ChatGPT após copiar a resposta.','info');
 }
 $('#kitDetail').hidden=false;
 $('#kitSkuTitle').textContent=String(displayTitle||creative?.title||
  kit.components.map(p=>p.name).join(' + ')).trim();
 $('#kitEditingSkuCode').textContent='Código do kit: '+kit.kitSku+
  ' · '+kit.components.length+' produtos';
 refreshKitEditorOverview(kit);
 $('#kitManualComposition').replaceChildren(kitManualControls(kit,{editor:true}));
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
 $('#kitWarning').textContent=(kitDraftNeedsRefresh?
  '⚠️ RASCUNHO RECUPERADO: custos, preços, margens e estoque são da última gravação, não são valores atuais. Atualize a WeDrop antes de novos preços ou publicação. ':'')+
  kit.warning+' Texto criado por '+creative.source+'. Verifique estoque e capacidade de envio de vários SKUs.';
 $('#kitTitle').value=creative.title;
 $('#kitDescription').value=creative.description;
 updateKitTextCounters();
 if(kitContentSeoTitles.length===3)
  kitShowSeoTitles(kitContentSeoTitles);
 renderImageSlots();
 kitAutoImageUi();
 void kitCheckAutoImageAvailability();
 getKitExtensionBridge().probe();
 void kitRestoreImageGallery(kit.kitSku);
 if(scroll)$('#kitDetail').scrollIntoView({behavior:'smooth',block:'start'});
}
function kitImagePromptAt(slot){
 if(!prepared)return '';
 const components=prepared.kit.components;
 const original=prepared.creative?.prompts?.[slot-1]||'';
 const measurements=components.map(p=>{
  const manual=kitContentManualFacts.get(p.sku)||'';
  const found=detectSkuMeasurements(manual);
  return 'SKU '+p.sku+' — '+p.name+
   ': medidas WeDrop: '+(p.dimensions||'NÃO INFORMADAS')+
   '; medidas extraídas somente do texto desta SKU, ainda NÃO verificadas: '+
   (found.length?found.map(x=>x.value).join(' · '):'nenhuma com unidade explícita');
 }).join('\n');
 return original+'\n\nREGRA FINAL INEGOCIÁVEL PARA ESTA IMAGEM: mostrar TODOS os '+components.length+
  ' produtos juntos na MESMA foto, SEM colagem, SEM mosaico, SEM fotos individuais. '+ 
  (components.length===2?'Os dois produtos formam uma DUPLA e ambos aparecem inteiros, lado a lado ou num mesmo contexto realista. ':'')+
  'Dimensões e informações pertencem SOMENTE à SKU descrita. Medidas fornecidas pelo vendedor dependem de conferência antes de serem escritas em imagens:\n'+measurements;
}
function kitImageMeasurementsSummary(){
 if(!prepared)return '';
 return prepared.kit.components.map(p=>{
  const found=detectSkuMeasurements(kitContentManualFacts.get(p.sku)||'');
  return 'SKU '+p.sku+': '+(p.dimensions?
   'catálogo WeDrop '+p.dimensions:'sem medida cadastrada na WeDrop')+
   (found.length?' · texto do vendedor (conferir): '+found.map(x=>x.value).join(' · '):'');
 }).join(' | ');
}
function kitUpdateImageGuidance(){
 const helper=$('#kitImageDuoStatus');
 if(helper&&prepared)helper.textContent='✓ '+prepared.kit.components.length+
   ' produtos juntos em cada imagem, mesmo cenário, não um por foto. Medidas por SKU: '+
   kitImageMeasurementsSummary();
}
function kitInvalidatePhotoPositions(slots=[]){
 // Foto enviada na galeria Shopee não pode ser reutilizada após alteração de ordem.
 for(const slot of slots)kitShopeePhotoSlots.delete(slot);
 const verified=$('#kitPhotosReviewed');if(verified)verified.checked=false;
 const photoCount=$('#kitShopeePhotoCount');
 if(photoCount)photoCount.textContent=kitShopeePhotoSlots.size+
  ' imagens enviadas à galeria da Shopee nesta sessão (revalidar posições alteradas).';
 clearKitPublishApproval();
 kitPublishStatus('Posições de imagens alteradas: confira todas as SKUs, aprove novamente as fotos e envie as posições modificadas antes de publicar.','info');
}
async function kitRepositionImage(from,to){
 if(!prepared||kitAutoImageBusy||kitGalleryImportBusy)return;
 if(from===to)return;
 const kitSku=prepared.kit.kitSku;
 kitGalleryImportBusy=true;
 try{
  const moved=kitMoveImage(images,from,to);
  await kitPhotoStore.move(kitSku,from,to);
  if(prepared?.kit?.kitSku!==kitSku)return;
  images=moved;
  kitInvalidatePhotoPositions([from,to]);
  renderImageSlots();kitAutoImageUi();
  imageStatus('✓ Posição '+String(from).padStart(2,'0')+' movida para '+
   String(to).padStart(2,'0')+'. Se havia imagem no destino, as duas foram trocadas. '+
   'As posições foram salvas juntas; nenhuma foto foi publicada.','success');
 }catch(error){imageStatus('Troca não aplicada: '+error.message+'. Fotos anteriores preservadas.','error');}
 finally{kitGalleryImportBusy=false;}
}
function kitImageDragStart(event,slot){
 if(!images.has(slot)||kitAutoImageBusy||kitGalleryImportBusy){event.preventDefault();return;}
 kitDraggingSlot=slot;
 event.dataTransfer.effectAllowed='move';
 event.dataTransfer.setData('text/plain',String(slot));
}
function kitImageDragOver(event,card){
 const files=event.dataTransfer?.types?.includes('Files');
 if(!kitDraggingSlot&&!files)return;
 event.preventDefault();card.classList.add('kit-drop-target');
 event.dataTransfer.dropEffect=kitDraggingSlot?'move':'copy';
}
function kitImageDrop(event,slot){
 if(kitDraggingSlot!==null){
  event.preventDefault();event.stopPropagation();
  const from=kitDraggingSlot;kitDraggingSlot=null;
  kitRepositionImage(from,slot);
  return;
 }
 const files=event.dataTransfer?.files;
 if(files?.length){
  event.preventDefault();event.stopPropagation();
  void kitImportPhotoFiles(files,{targetSlot:slot});
 }
}

function renderImageSlots(){
 const root=$('#kitImages');root.replaceChildren();
 if(!prepared)return;
 for(let slot=1;slot<=9;slot++){
  const card=elt('div','kit-image-card'),image=images.get(slot);
  card.dataset.slot=String(slot);
  card.addEventListener('dragover',event=>kitImageDragOver(event,card));
  card.addEventListener('dragleave',()=>card.classList.remove('kit-drop-target'));
  card.addEventListener('drop',event=>kitImageDrop(event,slot));
  card.addEventListener('dragend',()=>{kitDraggingSlot=null;card.classList.remove('kit-drop-target');});
  card.append(elt('strong','', String(slot).padStart(2,'0')+'/09'));
  card.append(elt('small','kit-duo-label',prepared.kit.components.length+' SKUs juntas · uma cena'));
  if(image){
   const pic=elt('img');pic.src=image;pic.alt='Imagem '+slot+' do kit importada para revisão';
   pic.draggable=true;pic.title='Arraste esta imagem para outra posição na galeria';
   pic.addEventListener('dragstart',event=>kitImageDragStart(event,slot));
   card.append(pic);
   const movers=elt('div','kit-image-position-controls');
   const left=elt('button','kit-secondary','←'),right=elt('button','kit-secondary','→');
   left.type='button';right.type='button';
   left.title='Mover imagem para posição anterior';right.title='Mover imagem para próxima posição';
   left.setAttribute('aria-label','Mover foto '+slot+' para posição '+(slot-1));
   right.setAttribute('aria-label','Mover foto '+slot+' para posição '+(slot+1));
   left.disabled=slot===1;right.disabled=slot===9;
   left.addEventListener('click',()=>kitRepositionImage(slot,slot-1));
   right.addEventListener('click',()=>kitRepositionImage(slot,slot+1));
   movers.append(left,right);card.append(movers);
   const download=elt('button','kit-secondary','Baixar PNG '+slot);
   download.addEventListener('click',()=>downloadData(image,
    prepared.kit.kitSku+'-foto-'+String(slot).padStart(2,'0')+'.png'));
   card.append(download);
  }else card.append(elt('div','kit-placeholder','▧'));
  const prompt=elt('button','kit-secondary','Copiar prompt');
  prompt.type='button';
  prompt.addEventListener('click',()=>void copy(kitImagePromptAt(slot)));
  card.append(prompt);
  const generate=elt('button','kit-secondary kit-image-generate-one','Gerar esta imagem (API paga)');
  generate.type='button';
  generate.disabled=!kitAutoImageApiConnected||kitAutoImageBusy||!$('#kitApprovePaidImages')?.checked;
  generate.addEventListener('click',()=>void kitGeneratePaidImages({singleSlot:slot}));
  card.append(generate);
  const details=elt('details','kit-prompt-fallback');
  const summary=elt('summary','','Ver prompt');
  const field=elt('textarea');field.readOnly=true;field.rows=5;
  field.value=kitImagePromptAt(slot);
  details.append(summary,field);card.append(details);
  const chooser=elt('input','kit-photo-upload');chooser.type='file';
  chooser.accept='image/png,image/jpeg,image/webp';
  chooser.setAttribute('aria-label','Importar foto '+slot+' gerada no ChatGPT Plus');
  chooser.addEventListener('change',()=>void uploadPhoto(slot,chooser.files?.[0]));
  card.append(chooser);
  root.append(card);
 }
 kitUpdateImageGuidance();
 const occupied=$('#kitGalleryCount');if(occupied)occupied.textContent=images.size+' / 9 imagens prontas';
}

function kitAutoImageUi(){
 const agreed=$('#kitApprovePaidImages')?.checked===true;
 const action=$('#kitGenerateAutomatic'),stop=$('#kitStopAutomatic');
 if(action)action.disabled=kitAutoImageBusy||!kitAutoImageApiConnected||!agreed||!prepared;
 if(stop)stop.hidden=!kitAutoImageBusy;
 if(action)action.textContent=kitAutoImageBusy?'Gerando imagens...':
  images.size?'Gerar imagens faltantes ou retomar':'Gerar 9 imagens automaticamente';
}
async function kitCheckAutoImageAvailability(){
 const state=$('#kitAutomaticImageAvailability');
 if(!state)return;
 try{
  const data=await api('/api/shopee/kits/image/status');
  kitAutoImageApiConnected=data.automaticAvailable===true;
  state.dataset.state=kitAutoImageApiConnected?'ready':'inactive';
  state.textContent=kitAutoImageApiConnected?
   'API conectada · exige autorização para gerar imagens pagas':
   'API não conectada · modo automático indisponível (ChatGPT Plus permanece manual)';
 }catch(error){
  kitAutoImageApiConnected=false;
  state.textContent='Não foi possível verificar a API: '+error.message;
  state.dataset.state='inactive';
 }
 kitAutoImageUi();
}
function kitSetImageProgress(done,total,label){
 const panel=$('#kitGenerationProgress');if(!panel)return;
 panel.hidden=false;
 $('#kitGenerationProgressBar').style.width=(Math.max(0,Math.min(1,done/total))*100).toFixed(1)+'%';
 $('#kitGenerationProgressText').textContent=label||done+' de '+total+' imagens concluídas';
}
async function kitStoreGeneratedPhoto(slot,b64){
 const bin=atob(b64),bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
 try{
  const canvas=document.createElement('canvas');
  canvas.width=1200;canvas.height=1200;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Navegador não conseguiu preparar a imagem.');
  // A imagem de origem é quadrada; redimensiona para 1200 × 1200 se necessário.
  ctx.drawImage(bitmap,0,0,1200,1200);
  images.set(slot,canvas.toDataURL('image/png'));
  kitShopeePhotoSlots.delete(slot);
  clearKitPublishApproval();
 }finally{bitmap.close();}
 renderImageSlots();
}
async function kitGeneratePaidImages({singleSlot=null}={}){
 if(kitAutoImageBusy||!prepared)return;
 if(!kitAutoImageApiConnected)return imageStatus('API não conectada. No modo ChatGPT Plus a geração é manual.','error');
 if(!$('#kitApprovePaidImages').checked)
  return imageStatus('Marque a autorização explícita de API paga antes de gerar imagens.','error');
 const kit=prepared.kit,sku=kit.kitSku;
 const pending=singleSlot?[singleSlot]:Array.from({length:9},(_,i)=>i+1).filter(i=>!images.has(i));
 if(!pending.length)return imageStatus('As 9 posições já têm imagens. Para refazer uma, use o botão individual de cada posição.','success');
 const ok=window.confirm(
  'AUTORIZAÇÃO DE CUSTO: gerar '+pending.length+' imagem(ns) deste kit pela API OpenAI. Cada solicitação pode ser cobrada separadamente e NÃO está incluída no ChatGPT Plus. Nenhum anúncio será publicado. Continuar?');
 if(!ok)return;
 kitAutoImageBusy=true;kitAutoImageStop=false;kitAutoImageSku=sku;kitAutoImageUi();
 const success=[];
 try{
  for(const slot of pending){
   if(kitAutoImageStop||prepared?.kit?.kitSku!==sku)break;
   imageStatus('Gerando '+String(slot).padStart(2,'0')+'/09 com as fotos originais das '+kit.components.length+' SKUs...','info');
   kitSetImageProgress(images.size,9,'Gerando imagem '+slot+'/09 · '+images.size+' prontas');
   const data=await api('/api/shopee/kits/image',{body:{
    slot,skus:kit.components.map(p=>p.sku),...currentSettings(),
    manualFacts:Object.fromEntries(kitContentManualFacts.entries()),confirmPaidApi:true
   }});
   if(prepared?.kit?.kitSku!==sku||data.kitSku!==sku)
    throw Error('O kit mudou durante a geração. Não é seguro importar esta imagem.');
   await kitStoreGeneratedPhoto(slot,data.base64);
   success.push(slot);
   kitSetImageProgress(images.size,9,images.size+' de 9 imagens no editor');
  }
  imageStatus(kitAutoImageStop?'Geração interrompida após a imagem atual. '+images.size+' imagem(ns) disponíveis. Clique novamente para retomar apenas faltantes.':
   'Geração concluída neste lote: '+success.length+' imagem(ns). Revise se TODOS os produtos aparecem em cada cena; depois baixe as imagens.','success');
 }catch(error){
  imageStatus('Geração interrompida: '+error.message+' · '+success.length+
   ' imagem(ns) deste lote foram preservadas no editor. Clique novamente para retomar apenas faltantes.','error');
 }finally{
  kitAutoImageBusy=false;kitAutoImageSku=null;kitAutoImageUi();
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
async function uploadPhoto(slot,file,{quiet=false,kitSku=prepared?.kit?.kitSku}={}){
 if(!file)return false;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024||file.size===0){
  imageStatus('Imagem '+slot+': envie PNG, JPG ou WebP até 12 MB.','error');return false;
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
   if(prepared?.kit?.kitSku!==kitSku)throw Error('O kit mudou durante a importação. Selecione novamente as imagens.');
   const dataUrl=canvas.toDataURL('image/png');
   // Persistência antes da confirmação enviada à extensão.
   await kitPhotoStore.put(kitSku,slot,dataUrl);
   if(prepared?.kit?.kitSku!==kitSku)throw Error('A composição mudou enquanto salvava a imagem.');
   images.set(slot,dataUrl);
   kitInvalidatePhotoPositions([slot]);
  }finally{bitmap.close();}
  renderImageSlots();
  kitAutoImageUi();
  if(!quiet)imageStatus('Imagem '+slot+' importada em PNG 1200 × 1200 para conferência. Imagens permanecem nesta aba e não são publicadas.','success');
  return true;
 }catch(error){imageStatus('Falha ao importar imagem: '+error.message,'error');return false;}
}
function kitAutoImportStatus(message,state='info'){
 const node=$('#kitAutoImportStatus');
 if(node){node.textContent=message;node.dataset.state=state;}
}
function kitPhotoFileKey(file){
 return [String(file.name||'').toLowerCase(),file.size,file.lastModified].join('|');
}
function kitImageFileAllowed(file){
 return /\.(png|jpe?g|webp)$/i.test(file?.name||'')&&
  file?.size>0&&file.size<=12*1024*1024;
}
async function kitImportPhotoFiles(files,{targetSlot=null,automatic=false}={}){
 if(!prepared||kitAutoImageBusy||kitGalleryImportBusy)return {imported:0,skipped:0};
 const current=prepared.kit.kitSku;
 const incoming=[...files].filter(kitImageFileAllowed);
 if(!incoming.length){
  if(!automatic)imageStatus('Selecione PNG, JPG ou WebP de até 12 MB.','error');
  return {imported:0,skipped:0};
 }
 const targets=targetSlot!==null?
  [{file:incoming[0],slot:targetSlot},...kitPlanImageImports(incoming.slice(1),new Set([...images.keys(),targetSlot]))]:
  kitPlanImageImports(incoming,images.keys());
 kitGalleryImportBusy=true;
 let imported=0,skipped=0;
 try{
  for(const {file,slot} of targets){
   if(prepared?.kit?.kitSku!==current)throw Error('O kit foi alterado durante a importação.');
   if(slot===null){skipped++;continue;}
   const result=await uploadPhoto(slot,file,{quiet:true,kitSku:current});
   if(result)imported++;else skipped++;
  }
  imageStatus((automatic?'Importação automática da pasta: ':'Importação manual: ')+
   imported+' imagem(ns) colocada(s) nas posições disponíveis.'+
   (skipped?' '+skipped+' não importada(s); confira espaços disponíveis e formato.':'')+
   ' Revise as fotos antes de enviar à Shopee.','success');
  kitAutoImportStatus(imported?
   imported+' arquivo(s) novo(s) importado(s) para este kit.':
   'Nenhum arquivo novo importado.',imported?'success':'info');
  return {imported,skipped};
 }catch(error){
  imageStatus('Falha na importação: '+error.message,'error');
  return {imported,skipped};
 }finally{kitGalleryImportBusy=false;}
}
async function kitImportCopiedImage(){
 if(!prepared)return imageStatus('Abra um kit para importar a imagem.','error');
 if(!navigator.clipboard?.read)return imageStatus('Seu navegador não suporta imagens copiadas. Use Importar arquivos.','error');
 try{
  const items=await navigator.clipboard.read();
  const item=items.find(i=>i.types.some(t=>/^image\/(png|jpeg|webp)$/i.test(t)));
  if(!item)throw Error('Não existe uma imagem copiada. No ChatGPT, abra a imagem e use Copiar imagem.');
  const type=item.types.find(t=>/^image\/(png|jpeg|webp)$/i.test(t));
  const source=await item.getType(type);
  const extension=type.includes('png')?'png':type.includes('webp')?'webp':'jpg';
  const file=new File([source],'chatgpt-imagem.'+extension,{type,lastModified:Date.now()});
  const slot=kitImageNextSlot(images.keys());
  if(slot===null)throw Error('As nove posições estão ocupadas. Arraste imagens para trocar de lugar ou use Escolher arquivo numa posição para substituí-la.');
  await kitImportPhotoFiles([file]);
 }catch(error){imageStatus('Cópia do ChatGPT não importada: '+error.message,'error');}
}
function kitStopAutoFolder({notice=true}={}){
 if(kitWatchTimer!==null){clearInterval(kitWatchTimer);kitWatchTimer=null;}
 kitWatchHandle=null;kitWatchSku=null;kitWatchSeen=new Set();kitWatchBusy=false;
 const button=$('#kitWatchDownloads'),stop=$('#kitStopWatchDownloads');
 if(button)button.textContent='Ativar importação automática por pasta';
 if(stop)stop.hidden=true;
 if(notice)kitAutoImportStatus('Monitoramento desligado. Você ainda pode importar arquivos manualmente.','info');
}
async function kitFolderImageEntries(handle){
 const records=[];
 for await(const entry of handle.values()){
  if(entry.kind!=='file'||!/\.(png|jpe?g|webp)$/i.test(entry.name))continue;
  const file=await entry.getFile();
  if(!kitImageFileAllowed(file))continue;
  records.push({key:kitPhotoFileKey(file),file});
  if(records.length>=2500)break;
 }
 return records;
}
async function kitScanWatchedFolder(){
 if(kitWatchBusy||!kitWatchHandle||!kitWatchSku||!prepared)return;
 if(prepared.kit.kitSku!==kitWatchSku){kitStopAutoFolder();return;}
 if(kitGalleryImportBusy||kitAutoImageBusy)return;
 kitWatchBusy=true;
 try{
  const permission=await kitWatchHandle.queryPermission({mode:'read'});
  if(permission!=='granted'){kitStopAutoFolder();kitAutoImportStatus('Permissão da pasta revogada; selecione novamente.','error');return;}
  const records=await kitFolderImageEntries(kitWatchHandle);
  const unseen=records.filter(x=>!kitWatchSeen.has(x.key))
   .sort((a,b)=>a.file.lastModified-b.file.lastModified||
    a.file.name.localeCompare(b.file.name,'pt-BR',{numeric:true}));
  for(const record of unseen)kitWatchSeen.add(record.key);
  if(unseen.length){
   const imported=await kitImportPhotoFiles(unseen.map(x=>x.file),{automatic:true});
   if(imported.skipped)kitAutoImportStatus(
    imported.imported+' imagem(ns) importada(s), '+imported.skipped+
    ' não encaixada(s). Ajuste a galeria e importe as restantes manualmente.','info');
  }
 }catch(error){
  kitAutoImportStatus('Monitoramento interrompido: '+error.message,'error');
  kitStopAutoFolder({notice:false});
 }finally{kitWatchBusy=false;}
}
async function kitStartAutoFolder(){
 if(!prepared)return imageStatus('Abra um kit antes de selecionar a pasta.','error');
 if(!window.showDirectoryPicker){
  return kitAutoImportStatus('Este navegador não oferece acesso autorizado a pastas. Use Chrome no computador ou importação manual.','error');
 }
 try{
  // A escolha deve ocorrer no clique do vendedor; nenhuma pasta é acessada sem permissão.
  const handle=await window.showDirectoryPicker({mode:'read',id:'kit-chatgpt-images'});
  let permission=await handle.queryPermission({mode:'read'});
  if(permission!=='granted')permission=await handle.requestPermission({mode:'read'});
  if(permission!=='granted')throw Error('Permissão de leitura não concedida.');
  const current=prepared.kit.kitSku;
  const entries=await kitFolderImageEntries(handle);
  if(prepared?.kit?.kitSku!==current)throw Error('O kit foi alterado. Selecione a pasta novamente.');
  kitStopAutoFolder({notice:false});
  kitWatchHandle=handle;kitWatchSku=current;
  kitWatchSeen=new Set(entries.map(x=>x.key)); // Não importa arquivos antigos da pasta por engano.
  kitWatchTimer=setInterval(()=>void kitScanWatchedFolder(),4500);
  $('#kitWatchDownloads').textContent='Trocar pasta monitorada';
  $('#kitStopWatchDownloads').hidden=false;
  kitAutoImportStatus('✓ Monitorando "'+handle.name+'" neste navegador. Baixe as imagens do ChatGPT NESTA pasta: arquivos novos serão importados nas posições vazias. Arquivos anteriores não serão importados automaticamente.','success');
 }catch(error){
  if(error.name!=='AbortError')kitAutoImportStatus('Não foi possível ativar a pasta: '+error.message,'error');
 }
}
window.addEventListener('focus',()=>{if(kitWatchHandle)void kitScanWatchedFolder();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&kitWatchHandle)void kitScanWatchedFolder();});

const KIT_CHAT_SESSION_KEY='raKitPlusResearchV1';
let kitChatPending=null,kitChatClipboardBusy=false,kitResearchCatalogContent='';
let kitChatFilePickerOpen=false,kitChatQueuedManualImport=null;
function kitDownloadFullCatalog(){
 if(!kitResearchCatalogContent)throw Error('Prepare novamente a pesquisa para baixar o catálogo completo.');
 const content=new Blob([kitResearchCatalogContent],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(content);
 try{downloadData(url,'wedrop-skus-pesquisa-kits.txt');}
 finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
}

try{
 const stored=JSON.parse(sessionStorage.getItem(KIT_CHAT_SESSION_KEY)||'null');
 if(stored&&Date.now()-stored.at<60*60*1000&&Array.isArray(stored.candidateSkus))kitChatPending=stored;
}catch{}
function kitPlusNotice(message,state='info'){
 const node=$('#kitPlusAutoStatus');
 if(node){node.textContent=message;node.dataset.state=state;}
 const fileStatus=$('#kitPlusFileStatus');
 if(fileStatus){
  fileStatus.textContent=message;
  fileStatus.dataset.state=state;
  fileStatus.hidden=false;
 }
 status(message,state);
}
function kitResearchContext(){
 return {category:$('#kitCategory').value,size:Number($('#kitSize').value),
  idea:String($('#kitIdea')?.value||'').trim(),desiredKits:Number($('#kitTargetCount').value||10)};
}
function kitChatValidateContext(){
 if(!kitChatPending)throw Error('Prepare a pesquisa antes de importar o retorno do ChatGPT.');
 const context=kitResearchContext();
 if(kitChatPending.category!==context.category||
    kitChatPending.size!==context.size||kitChatPending.idea!==context.idea||
    kitChatPending.desiredKits!==context.desiredKits)
  throw Error('Categoria, ideia ou quantidade mudaram. Prepare nova pesquisa antes de importar SKUs.');
 if(Date.now()-kitChatPending.at>60*60*1000)
  throw Error('A pesquisa expirou. Atualize a lista de SKUs e disponibilidade WeDrop.');
 return context;
}
function kitChatExtractLines(raw,size,allowedCodes,targetCount=10){
 // A resposta pode ser JSON, tabela Markdown, texto integral, 2 ou 3 SKUs.
 // Cada código deve pertencer ao catálogo WeDrop selecionado.
 return parseKitChatResult(raw,{allowedCodes,limit:targetCount});
}
async function kitChatEnsureFreshResearch(){
 const context=kitResearchContext();
 try{
  kitChatValidateContext();
  return context;
 }catch{
  // A importação de um arquivo gerado anteriormente não deve obrigar o
  // vendedor a copiar códigos nem reiniciar a pesquisa no ChatGPT.
  // Atualiza a whitelist da categoria WeDrop antes de aceitar qualquer SKU.
  const response=await api('/api/shopee/kits/plus-brief',{body:context});
  kitChatPending={...context,at:Date.now(),nonce:crypto.randomUUID(),
   candidateSkus:response.candidateSkus||[],
   requiresAttachment:Boolean(response.requiresAttachment)};
  sessionStorage.setItem(KIT_CHAT_SESSION_KEY,JSON.stringify(kitChatPending));
  return context;
 }
}
async function kitChatImportFile(file){
 if(!file)return;
 kitPlusNotice('Arquivo selecionado: '+file.name+' ('+Math.ceil(file.size/1024)+' KB). Iniciando leitura...','info');
 if(!/\.(?:json|txt|md)$/i.test(file.name||'')||file.size>1000000){
  kitPlusNotice('Envie um arquivo .json, .txt ou .md de até 1 MB com os kits gerados pelo ChatGPT.','error');
  return;
 }
 try{
  const data=await file.text();
  if(!data.trim())throw Error('Arquivo vazio. Verifique o download no ChatGPT.');
  kitPlusNotice('Arquivo '+file.name+' lido. Identificando kits e validando SKUs WeDrop...','info');
  await importPlusSuggestions({uploadedText:data});
 }catch(error){
  kitPlusNotice('Não foi possível importar o arquivo completo: '+error.message,'error');
 }
}
async function plusResearch({openChat=false}={}){
 if(!kitStockReady)return kitPlusNotice('Estoque WeDrop não conferido; atualize antes da pesquisa.','error');
 // Pesquisa previamente preparada: COPIAR durante o clique (gesto do vendedor),
 // antes de abrir a aba. Isso evita perder a permissão ao trocar o foco.
 if(openChat&&kitChatPending&&$('#kitResearchPrompt').value){
  try{
   kitChatValidateContext();
   if(kitChatPending.requiresAttachment)kitDownloadFullCatalog();
   const copy=navigator.clipboard.writeText($('#kitResearchPrompt').value);
   window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
   try{
    await copy;
    kitPlusNotice('Pesquisa de '+kitChatPending.candidateSkus.length+' SKUs preparada. ChatGPT aberto: '+
     (kitChatPending.requiresAttachment?'ANEXE o TXT baixado, depois cole (Ctrl+V) e envie. ':'Cole (Ctrl+V) e envie. ')+
     'Copie a resposta com até '+kitChatPending.desiredKits+' kits e volte para importar e salvar os rascunhos.','success');
   }catch{kitPlusNotice('ChatGPT aberto. Cópia bloqueada pelo Chrome; copie o prompt manualmente do campo da pesquisa.','warning');}
   return;
  }catch{ /* Parâmetros da pesquisa mudaram: preparar nova lista WeDrop. */ }
 }
 if(openChat)window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
 const btn=openChat?$('#kitPlusAutoStart'):$('#kitPlusResearch');btn.disabled=true;
 try{
  const context=kitResearchContext();
  const r=await api('/api/shopee/kits/plus-brief',{body:context});
  kitChatPending={...context,nonce:crypto.randomUUID(),at:Date.now(),
   candidateSkus:r.candidateSkus||[],requiresAttachment:Boolean(r.requiresAttachment)};
  kitResearchCatalogContent=r.catalogFileContent||'';
  $('#kitPlusDownloadCatalog').hidden=!r.requiresAttachment;
  sessionStorage.setItem(KIT_CHAT_SESSION_KEY,JSON.stringify(kitChatPending));
  if(openChat&&r.requiresAttachment)kitDownloadFullCatalog();
  $('#kitResearchPrompt').value=r.prompt;
  $('#kitPlusOutput').value='';
  if(openChat){
   try{
    await navigator.clipboard.writeText(r.prompt);
    kitPlusNotice('ChatGPT aberto com '+r.candidatesCount+' SKUs da categoria. '+
     (r.requiresAttachment?'ANEXE o TXT baixado, ':'')+
     'cole o comando com Ctrl+V e envie. Copie as sugestões e retorne: tentarei importar automaticamente.','success');
   }catch{
    kitPlusNotice('ChatGPT aberto, mas o Chrome bloqueou a cópia automática. Volte ao Manager, copie o prompt no campo, cole no ChatGPT e copie a resposta.','warning');
   }
  }else kitPlusNotice('Pesquisa completa preparada com '+r.candidatesCount+
   ' SKUs disponíveis'+(r.requiresAttachment?' e arquivo TXT para anexar':'')+
   '. Selecione Abrir ChatGPT e pesquisar kits.','success');
 }catch(error){kitPlusNotice('Pesquisa não preparada: '+error.message,'error');}
 finally{btn.disabled=false;}
}
function renderKitImportReport(result,parserRejected=0){
 const root=$('#kitImportReport');if(!root)return;
 root.replaceChildren();
 const received=Number(result.received||0)+parserRejected;
 const saved=Number(result.saved??(result.results||[]).filter(k=>k.draftSaved).length);
 const pending=Number(result.pendingReview??(result.results||[]).filter(k=>k.reviewRequired).length);
 const rejected=(result.rejected||[]).length+parserRejected;
 root.append(elt('strong','','Resultado: '+received+' recebidos · '+saved+
  ' rascunhos salvos · '+pending+' para revisão · '+rejected+' rejeitados.'));
 for(const kit of result.results||[]){
  root.append(elt('p','', '✓ Kit '+(kit.importIndex||'?')+' ('+
   kit.components.map(p=>p.sku).join(' + ')+'): '+
   (kit.reviewRequired?'Rascunho — revisar coerência. '+kit.reviewNotes.join('; '):
    'Rascunho verificado; confira o anúncio antes de publicar.')));
 }
 for(const item of result.rejected||[]){
  root.append(elt('p','', '✕ Kit '+(item.index||'?')+' ('+(item.skus||[]).join(' + ')+
   '): '+item.reason));
 }
 if(parserRejected)root.append(elt('p','','⚠ '+parserRejected+
  ' combinação(ões) rejeitada(s) na leitura por SKU ausente, duplicada ou estrutura inválida.'));
 root.hidden=false;
}
async function importPlusSuggestions({readClipboard=false,silent=false,uploadedText=null}={}){
 // Importação explícita nunca depende apenas do indicador visual de estoque:
 // a API atualiza a disponibilidade e valida cada SKU novamente no servidor.
 if(kitChatClipboardBusy){
  if(!silent&&uploadedText!==null){
   kitChatQueuedManualImport={uploadedText,silent:false};
   kitPlusNotice('Arquivo lido. Aguardando a verificação anterior terminar para importar os kits deste arquivo.','info');
  }else if(!silent){
   kitPlusNotice('Outra importação está em andamento. Acompanhe o resultado neste campo.','info');
  }
  return false;
 }
 kitChatClipboardBusy=true;
 const btn=$('#kitPlusImport'),clipBtn=$('#kitPlusClipboardImport');
 btn.disabled=true;if(clipBtn)clipBtn.disabled=true;
 try{
  const context=await kitChatEnsureFreshResearch();
  let response=uploadedText!==null?uploadedText:$('#kitPlusOutput').value;
  if(readClipboard){
   if(!navigator.clipboard?.readText)throw Error('O navegador não permite ler a área de transferência.');
   response=await navigator.clipboard.readText();
  }
  const parsed=kitChatExtractLines(response,context.size,kitChatPending.candidateSkus,context.desiredKits);
  const rows=parsed.kits;
  if(!rows.length){
   if(!silent)throw Error('Arquivo lido, mas nenhum kit de 2 ou 3 SKUs corresponde ao catálogo disponível da categoria selecionada. Verifique se a categoria está correta ou se o JSON contém códigos válidos.');
   return false;
  }
  kitPlusNotice('Importando '+rows.length+' kits do '+(parsed.format==='json'?'JSON':'texto')+
   '; validando custos, estoque e coerência na WeDrop...','info');
  const r=await api('/api/shopee/kits/plus-import',{body:{
   ...context,kits:rows,...currentSettings()
  }});
  renderKitImportReport(r,parsed.rejected);
  if(!Array.isArray(r.results)||!r.results.length){
   const firstRejected=(r.rejected||[]).slice(0,2).map(x=>x.reason).join(' / ');
   throw Error('Nenhum dos '+rows.length+' kits passou na validação WeDrop. '+firstRejected);
  }
  $('#kitPlusOutput').value=rows.map(x=>x.join(' | ')).join('\n');
  suggestionContext={category:context.category,size:context.size,idea:context.idea,source:r.source};
  renderSuggestions(r);
  kitChatPending=null;sessionStorage.removeItem(KIT_CHAT_SESSION_KEY);
  kitResearchCatalogContent='';
  $('#kitPlusDownloadCatalog').hidden=true;
  await loadDrafts();
  const skipped=(r.rejected||[]).length;
  const reasons=(r.rejected||[]).slice(0,2).map(x=>x.reason).join('; ');
  kitPlusNotice('✓ '+(r.received||rows.length)+' kits recebidos; '+
   (r.saved??r.results.length)+' rascunhos salvos; '+
   (r.pendingReview||0)+' para revisão; '+
   (skipped+parsed.rejected)+' rejeitados. '+
   (skipped?'Motivos: '+reasons+'. ':'')+
   'Nenhuma publicação na Shopee. Confira o relatório por kit abaixo.','success');
  $('#kitSuggestions')?.scrollIntoView({behavior:'smooth',block:'start'});
  return true;
 }catch(error){
  if(!silent)kitPlusNotice('Não foi possível importar os kits: '+error.message,'error');
  return false;
 }finally{
  kitChatClipboardBusy=false;btn.disabled=!kitStockReady;
  if(clipBtn)clipBtn.disabled=!kitStockReady;
  // O retorno da caixa de seleção pode disparar importação silenciosa pelo
  // clipboard no mesmo instante do upload manual. O arquivo sempre vence.
  const queued=kitChatQueuedManualImport;
  kitChatQueuedManualImport=null;
  if(queued)void importPlusSuggestions(queued);
 }
}
// Outra aba não pode ser lida por segurança do navegador. Com permissão
// já concedida, o Manager tenta reconhecer as SKUs copiadas quando voltar.
// Caso contrário, o botão explícito solicita a permissão no clique.
async function kitChatTryAutoClipboard(){
 if(!kitChatPending||!kitStockReady||!document.hasFocus()||kitChatClipboardBusy||
     kitChatFilePickerOpen||kitChatQueuedManualImport)return;
 try{
  if(!navigator.permissions?.query)return;
  const permission=await navigator.permissions.query({name:'clipboard-read'});
  if(permission.state!=='granted')return;
  await importPlusSuggestions({readClipboard:true,silent:true});
 }catch{}
}
window.addEventListener('focus',()=>void kitChatTryAutoClipboard());
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible')void kitChatTryAutoClipboard();
});

function kitImportState(message,state='info'){
 const el=$('#kitImportState');
 if(el){el.textContent=message;el.dataset.state=state;}
}
function kitContentFeedback(message,state='info'){
 const el=$('#kitContentFeedback');if(el){el.textContent=message;el.dataset.state=state;}
 status(message,state);
}
function kitContentOpenTab(){
 // Abrir no clique do usuário, ANTES do await, para evitar bloqueio de popup.
 const tab=window.open('about:blank','_blank');
 if(tab)tab.opener=null;
 return tab;
}
function kitContentHandoff(prompt,tab=null){
 if(!prompt.trim())throw Error('Orientação vazia. Prepare o conteúdo novamente.');
 // O link preenche a caixa de texto do ChatGPT quando suportado pelo navegador.
 // O envio depende do ChatGPT e poderá requerer clique em Enviar.
 const url='https://chatgpt.com/?prompt='+encodeURIComponent(prompt);
 if(tab){try{tab.location.replace(url);}catch{tab.location.href=url;}}
 else window.open(url,'_blank','noopener,noreferrer');
 if(navigator.clipboard?.writeText)
  void navigator.clipboard.writeText(prompt).catch(()=>{});
 kitContentAwaitingResponse=true;
 $('#kitContentDetails').open=false; // Prompt enviado é avançado; importação simples permanece visível.
 kitImportState('Aguardando resposta do ChatGPT · copie o bloco do anúncio','info');
 kitContentFeedback('No ChatGPT, gere a resposta e clique no ícone Copiar no bloco com os 3 títulos e a descrição. Volte aqui e clique em Importar anúncio copiado.','info');
}
function kitContentReadManual(){
 const data={};
 for(const box of $('#kitMissingFactFields').querySelectorAll('textarea[data-kit-fact-sku]')){
  const sku=box.dataset.kitFactSku,value=box.value.trim();
  if(value)data[sku]=value.slice(0,1700);
  kitContentManualFacts.set(sku,value);
 }
 return data;
}
function kitContentShowMissing(rows){
 const root=$('#kitMissingFactFields');
 root.replaceChildren();
 for(const component of rows){
  const card=elt('div','kit-missing-card');
  card.append(elt('strong','',component.name+' · SKU '+component.sku));
  card.append(elt('small','','Falta no catálogo: '+component.fields.join(' e ')+
    '. Cole a informação correspondente somente a esta SKU.'));
  const box=elt('textarea');box.maxLength=1700;box.rows=4;
  box.dataset.kitFactSku=component.sku;
  box.placeholder='Ex.: descrição, dimensões e características reais da SKU '+component.sku+'...';
  box.value=kitContentManualFacts.get(component.sku)||'';
  box.setAttribute('aria-label','Informações adicionais SKU '+component.sku);
  const measurements=elt('p','kit-measure-identified');
  measurements.setAttribute('aria-live','polite');
  const refresh=()=>{
   const found=detectSkuMeasurements(box.value);
   measurements.textContent='SKU '+component.sku+' — '+(found.length?
    'Medidas reconhecidas (conferir): '+found.map(x=>x.value).join(' · '):
    'Nenhuma medida com unidade detectada. Ex.: 20 × 15 × 10 cm ou altura: 15 cm.');
   measurements.dataset.state=found.length?'found':'missing';
   kitContentManualFacts.set(component.sku,box.value);
   kitUpdateImageGuidance();
  };
  box.addEventListener('input',refresh);
  refresh();
  card.append(box,measurements);root.append(card);
 }
 $('#kitMissingFacts').hidden=false;
 $('#kitContentDetails').open=true;
 $('#kitMissingFacts').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function plusText({proceedWithoutDetails=false}={}){
 if(!prepared||kitContentBusy)return;
 const currentSku=prepared.kit.kitSku;
 const button=proceedWithoutDetails?$('#kitContinueContent'):$('#kitPlusText');
 const tab=kitContentOpenTab();
 kitContentBusy=true;button.disabled=true;
 kitContentFeedback('Consultando descrições e medidas de cada SKU no catálogo WeDrop...','info');
 try{
  const data=await api('/api/shopee/kits/plus-content',{body:{
   skus:prepared.kit.components.map(p=>p.sku),...currentSettings(),
   manualFacts:proceedWithoutDetails?kitContentReadManual():
    Object.fromEntries(kitContentManualFacts.entries())
  }});
  if(prepared?.kit?.kitSku!==currentSku||data.kitSku!==currentSku)
   throw Error('A composição do kit mudou. Reabra a geração para evitar misturar SKUs.');
  $('#kitContentPrompt').value=data.prompt;
  if(Array.isArray(data.imagePrompts)&&data.imagePrompts.length===9){
   prepared.creative.prompts=data.imagePrompts;
   prepared.creative.manualFacts=Object.fromEntries(kitContentManualFacts.entries());
   renderImageSlots();
  }
  $('#kitContentDetails').open=true;
  if(data.missingDetails?.length&&!proceedWithoutDetails){
   tab?.close();
   kitContentShowMissing(data.missingDetails);
   kitContentFeedback('A WeDrop não trouxe todos os dados. Cole informações dos produtos se tiver, ou continue sem inventar medidas.','info');
  }else{
   $('#kitMissingFacts').hidden=true;
   kitContentHandoff(data.prompt,tab);
  }
 }catch(error){
  tab?.close();
  kitContentFeedback('Não foi possível preparar o kit: '+error.message,'error');
 }finally{kitContentBusy=false;button.disabled=false;}
}
function kitShowSeoTitles(options){
 const root=$('#kitSeoOptionList');root.replaceChildren();
 for(const title of options){
  const metrics=scoreKitSeoTitle(title.title,prepared.kit.components);
  const button=elt('button','kit-seo-option'+($('#kitTitle').value===title.title?' is-selected':''));
  button.type='button';button.setAttribute('aria-pressed',$('#kitTitle').value===title.title?'true':'false');
  const head=elt('span','kit-seo-option-head');
  head.append(elt('span','','Opção '+title.number+' · '+metrics.label),
   elt('span','kit-seo-option-score',metrics.score+'/100 · Nota SEO estimada'));
  button.append(head,elt('span','kit-seo-option-title',title.title));
  button.title=metrics.note;
  button.addEventListener('click',()=>{
   $('#kitTitle').value=title.title;
   for(const b of root.querySelectorAll('.kit-seo-option')){
    b.classList.remove('is-selected');b.setAttribute('aria-pressed','false');
   }
   button.classList.add('is-selected');button.setAttribute('aria-pressed','true');
   onKitContentEdit();
   $('#kitSkuTitle').textContent=title.title;
   kitContentFeedback('Título '+title.number+' selecionado (nota SEO estimada '+metrics.score+'/100). Salve o rascunho para preservar a escolha.','success');
  });
  root.append(button);
 }
 $('#kitSeoOptions').hidden=false;
}
function importPlusText({silent=false}={}){
 if(!prepared)return false;
 try{
  const result=parseKitSeoResponse($('#kitPlusTextResult').value);
  // Exibir a classificação por critérios objetivos, não inventar ranking da Shopee.
  const scored=result.titles.map(x=>({...x,...scoreKitSeoTitle(x.title,prepared.kit.components)}))
   .sort((a,b)=>b.score-a.score||a.number-b.number);
  kitContentSeoTitles=result.titles;
  $('#kitTitle').value=scored[0].title;
  $('#kitDescription').value=result.description;
  $('#kitSkuTitle').textContent=scored[0].title;
  kitShowSeoTitles(scored);
  const review=kitSeoRiskFlags(result.titles.map(x=>x.title).join(' ')+' '+result.description,
   prepared.kit.components);
  const box=$('#kitSeoWarnings');
  box.hidden=review.length===0;
  box.textContent=review.length?'⚠ Revisão necessária antes de publicar: '+review.join(' · ')+
   '. Confira também as informações acrescentadas pelo vendedor.':'';
  onKitContentEdit();updateKitTextCounters();
  kitSaved=false;clearKitPublishApproval();
  kitContentAwaitingResponse=false;
  $('#kitContentDetails').open=false;
  kitImportState('3 títulos e descrição importados · salvando rascunho...','info');
  kitContentFeedback('Os 3 títulos e a descrição foram colocados no editor. Confirme a opção escolhida e revise eventuais alertas.','success');
  $('#kitSeoOptions').scrollIntoView({behavior:'smooth',block:'nearest'});
  void saveDraft().then(saved=>{
   if(saved){
    kitImportState('✓ Anúncio importado e salvo no rascunho','success');
    const line=$('#kitSeoSaveStatus');
    if(line)line.textContent='✓ Três títulos e descrição salvos. Se mudar o título, clique em Salvar textos.';
   }
  });
  return true;
 }catch(error){
  if(!silent){
   kitImportState('Importação não concluída','error');
   kitContentFeedback('Resposta não importada: '+error.message,'error');
   $('#kitContentDetails').open=true;
   $('#kitPlusTextResult').focus();
  }
  return false;
 }
}
async function kitImportCopiedContent(){
 if(!navigator.clipboard?.readText){
  kitContentFeedback('O navegador não autorizou colar automaticamente. Use Ctrl+V no campo de resposta.','error');return;
 }
 try{
  const content=await navigator.clipboard.readText();
  if(!content.trim())throw Error('Área de transferência vazia.');
  $('#kitPlusTextResult').value=content;
  importPlusText();
 }catch(error){
  kitImportState('Use Colar manualmente','error');
  kitContentFeedback('Não foi possível acessar o texto copiado: '+error.message+
    '. Clique em Colar manualmente, use Ctrl+V e depois Importar texto colado.','error');
  $('#kitContentDetails').open=true;
 }
}
async function kitTryAutoContentImport(){
 if(!kitContentAwaitingResponse||!prepared||!document.hasFocus()||
  !navigator.permissions?.query||!navigator.clipboard?.readText)return;
 try{
  const permission=await navigator.permissions.query({name:'clipboard-read'});
  if(permission.state!=='granted')return;
  const text=await navigator.clipboard.readText();
  // Se o clipboard ainda contém a orientação, não sobrescrever campos nem exibir sucesso.
  if(!/(?:^|\n)\s*(?:\*\*)?T[ÍI]TULO\s*1\s*:/im.test(text)||
    !/DESCRI[ÇC][ÃA]O\s*:/i.test(text))return;
  try{parseKitSeoResponse(text);}catch{return;}
  $('#kitPlusTextResult').value=text;
  importPlusText({silent:true});
 }catch{}
}
window.addEventListener('focus',()=>void kitTryAutoContentImport());

async function prepare(kit){
 if(generationBusy||marginUpdatePending)return;
 status('Gerando composição comercial do kit '+kit.kitSku+'...', 'info');
 try{
  const data=await api('/api/shopee/kits/prepare',{body:{
   skus:kit.components.map(x=>x.sku),...currentSettings()
  }});
  kitCloseInlineEditor();
  kitRestoredSku='';
  kitDraftNeedsRefresh=false;
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
function kitPlusGenerationStatus(message,state='info'){
 const node=$('#kitPlusGenerationStatus');
 if(node){node.textContent=message;node.dataset.state=state;}
}

function kitExtensionStatus(message,state='info'){
 const element=$('#kitExtensionStatus');
 if(element){element.textContent=message;element.dataset.state=state;}
 imageStatus(message,state);
}
function getKitExtensionBridge(){
 if(kitBridgeController)return kitBridgeController;
 kitBridgeController=createKitExtensionController({
  getKit:()=>prepared?.kit||null,
  getPrompts:()=>Array.from({length:9},(_,i)=>kitImagePromptAt(i+1)),
  getImages:()=>images,
  onPhoto:async({slot,dataUrl,kitSku})=>{
   const blob=await(await fetch(dataUrl)).blob();
   if(blob.size>12*1024*1024||!/^image\/(?:png|jpeg|webp)$/.test(blob.type))
    throw Error('Arquivo devolvido pela extensão não é imagem válida.');
   const ext=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':'png';
   return uploadPhoto(slot,new File([blob],'kit-ext-'+slot+'.'+ext,{type:blob.type}),
    {quiet:true,kitSku});
  },
  onProgress:slot=>kitSetImageProgress(images.size,9,
   'Ponte ChatGPT · imagem '+slot+'/09 · '+images.size+' salvas'),
  onStatus:(msg,state)=>{
   kitExtensionStatus(msg,state);
   const active=Boolean(kitBridgeController?.activeJob());
   const stop=$('#kitStopExtension');if(stop)stop.hidden=!active;
   const button=$('#kitGenerateAll');
   if(button)button.textContent=active?'Geração em andamento pela extensão...':
    'Gerar 9 imagens automaticamente pela extensão';
  }
 });
 return kitBridgeController;
}
function kitStopKitExtension(reason='Geração de imagens do kit interrompida.'){
 if(kitBridgeController?.activeJob())kitBridgeController.stop(reason,{notice:false});
 const stop=$('#kitStopExtension');if(stop)stop.hidden=true;
 const btn=$('#kitGenerateAll');
 if(btn)btn.textContent='Gerar 9 imagens automaticamente pela extensão';
}
async function kitRestoreImageGallery(kitSku){
 if(!kitSku||kitRestoredSku===kitSku)return;
 kitRestoredSku=kitSku;
 try{
  const rows=await kitPhotoStore.list(kitSku);
  if(prepared?.kit?.kitSku!==kitSku)return;
  let count=0;
  for(const row of rows)if(!images.has(row.slot)&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(row.dataUrl)){
   images.set(row.slot,row.dataUrl);count++;
  }
  if(count){renderImageSlots();kitAutoImageUi();
   kitExtensionStatus(count+' imagens antigas recuperadas deste kit. Revise todas antes de publicar.','success');}
 }catch(error){kitRestoredSku='';kitExtensionStatus('Recuperação de fotos indisponível: '+error.message,'error');}
}
async function kitStartExtensionImages(){
 const btn=$('#kitGenerateAll');
 if(btn.disabled)return;
 btn.disabled=true;
 try{
  await getKitExtensionBridge().start();
  $('#kitStopExtension').hidden=false;
 }catch(error){kitExtensionStatus(error.message,'error');}
 finally{btn.disabled=false;}
}

function openChatGPTImages(){
 if(!prepared)return imageStatus('Abra o kit antes de iniciar as imagens.','error');
 let prompt;
 try{prompt=buildKitPlusImageBrief(prepared.kit,{manualFacts:Object.fromEntries(kitContentManualFacts.entries())});}
 catch(error){return imageStatus(error.message,'error');}
 // Gesto direto do usuário: cópia começa antes da abertura da aba.
 const clipboardPromise=navigator.clipboard?.writeText?
  navigator.clipboard.writeText(prompt):Promise.reject(new Error('Área de transferência indisponível'));
 const url=kitPlusPromptLink(prompt);
 const tab=window.open(url,'_blank','noopener,noreferrer');
 $('#kitPlusImagePrompt').value=prompt;
 $('#kitPlusInstructions').hidden=false;
 kitPlusGenerationStatus('Prompt preparado. Na aba do ChatGPT, anexe as fotos reais das '+prepared.kit.components.length+
  ' SKUs, confira se o pedido foi preenchido e clique em Enviar. Depois baixe cada imagem para a pasta monitorada.','info');
 imageStatus('Abertura do ChatGPT Plus solicitada com o pedido de imagens. Sem API, o envio e a geração dependem da sua ação no ChatGPT. A importação dos arquivos baixados pode ser automática por pasta.','info');
 void clipboardPromise.then(()=>kitPlusGenerationStatus('Prompt copiado e abertura solicitada. Se o ChatGPT aparecer vazio, pressione Ctrl+V, anexe as fotos reais das SKUs e clique em Enviar.','success'))
 .catch(()=>kitPlusGenerationStatus('Não foi possível copiar automaticamente. Use o botão Copiar prompt no painel, anexe as fotos e clique em Enviar no ChatGPT.','error'));
 if(!tab&&url.startsWith('https://chatgpt.com/')){
  // noopener pode retornar null mesmo abrindo a aba: não afirmar bloqueio.
 }
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
  ...creative.prompts.map((p,i)=>'\n===== IMAGEM '+(i+1)+' =====\n'+kitImagePromptAt(i+1))
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
$('#kitImportImages')?.addEventListener('click',()=>{
 if(!prepared)return imageStatus('Abra um rascunho antes de importar imagens.','error');
 $('#kitMultiPhotoFiles').click();
});
$('#kitMultiPhotoFiles')?.addEventListener('change',event=>{
 const selected=event.target.files;
 if(selected?.length)void kitImportPhotoFiles(selected);
 event.target.value='';
});
$('#kitImportCopiedImage')?.addEventListener('click',()=>void kitImportCopiedImage());
$('#kitImportImagesAlt')?.addEventListener('click',()=>$('#kitMultiPhotoFiles').click());
$('#kitWatchDownloads')?.addEventListener('click',()=>void kitStartAutoFolder());
$('#kitStopWatchDownloads')?.addEventListener('click',()=>kitStopAutoFolder());
$('#kitTitle')?.addEventListener('input',onKitContentEdit);
$('#kitDescription')?.addEventListener('input',onKitContentEdit);
for(const [fileSelector,buttonSelector,nameSelector] of [
 ['#kitCatalogFile','#kitCatalogImport','#kitCatalogFileName'],
 ['#kitStockCsv','#kitStockImport','#kitStockFileName']
]){
 $(fileSelector)?.addEventListener('change',()=>{
  const file=$(fileSelector).files?.[0];
  $(buttonSelector).disabled=!file;
  $(nameSelector).textContent=file?file.name:'Nenhum arquivo selecionado';
 });
}
$('#kitModeBuilder')?.addEventListener('click',()=>setKitMode('builder'));
$('#kitModeImport')?.addEventListener('click',()=>setKitMode('import'));
$('#kitGoImport')?.addEventListener('click',()=>setKitMode('import',{scroll:true}));
$('#kitGoBuilder')?.addEventListener('click',()=>setKitMode('builder',{scroll:true}));
$('#kitUnifiedFile')?.addEventListener('change',()=>{
 const file=$('#kitUnifiedFile').files?.[0];
 $('#kitUnifiedImport').disabled=!file;
 $('#kitUnifiedFileName').textContent=file?file.name:'Nenhum arquivo selecionado';
 $('#kitCostMappingPanel').hidden=true;kitUnifiedState=null;
 kitUnifiedStatus(file?'Arquivo selecionado. Clique em Verificar e atualizar.':
  'Selecione um arquivo da WeDrop para começar.');
});
$('#kitUnifiedImport')?.addEventListener('click',()=>void analyzeAndImportWeDrop());
$('#kitCostColumn')?.addEventListener('change',()=>{
 $('#kitCostConfirm').checked=false;$('#kitCostMappingApply').disabled=true;
});
$('#kitCostConfirm')?.addEventListener('change',()=>{
 $('#kitCostMappingApply').disabled=!$('#kitCostConfirm').checked||!$('#kitCostColumn').value;
});
$('#kitCostMappingApply')?.addEventListener('click',()=>void confirmKitMappedCost());
$('#kitCatalogImport')?.addEventListener('click',()=>void importKitCatalogFile());
$('#kitStockImport')?.addEventListener('click',()=>void importKitStockCsv());
$('#kitStockReload')?.addEventListener('click',()=>{categoriesLoaded=false;void categories(true);});
$('#kitIdea')?.addEventListener('input',()=>{
 const idea=String($('#kitIdea').value||'').trim();
 $('#kitSuggest').lastChild.textContent=idea?' Encontrar SKUs e montar kit':' Pesquisar kits inteligentes';
 if(suggestionContext?.idea!==idea)status(idea?
  'Ideia pronta. Clique em Encontrar SKUs e montar kit para consultar a WeDrop importada.':
  'Pesquisa por categoria pronta. Clique em Pesquisar kits inteligentes.','info');
});
$('#kitIdea')?.addEventListener('keydown',event=>{
 if(event.key==='Enter'){event.preventDefault();void search();}
});
$('#kitSuggest')?.addEventListener('click',()=>void search());
$('#kitPlusDownloadCatalog')?.addEventListener('click',()=>{
 try{kitDownloadFullCatalog();}catch(error){kitPlusNotice(error.message,'error');}
});
const fileInput=$('#kitPlusFile');
fileInput?.addEventListener('pointerdown',()=>{kitChatFilePickerOpen=true;});
fileInput?.addEventListener('click',event=>{
 // Limpar ANTES do seletor, não depois: após escolher, o nome fica
 // visível e o mesmo arquivo poderá ser escolhido novamente.
 event.currentTarget.value='';
 kitChatFilePickerOpen=true;
});
fileInput?.addEventListener('keydown',event=>{
 if(event.key==='Enter'||event.key===' ')kitChatFilePickerOpen=true;
});
fileInput?.addEventListener('cancel',()=>{
 kitChatFilePickerOpen=false;
 kitPlusNotice('Seleção cancelada. Nenhum arquivo novo foi enviado.','info');
});
fileInput?.addEventListener('change',event=>{
 const file=event.target.files?.[0];
 // Priorizar o arquivo selecionado, mesmo se voltar à aba disparar focus.
 kitChatFilePickerOpen=false;
 if(file)void kitChatImportFile(file);
 else kitPlusNotice('Nenhum arquivo selecionado. Escolha o JSON ou TXT gerado pelo ChatGPT.','info');
 // Não limpar event.target.value aqui: o usuário precisa VER o nome.
});
const drop=$('.kit-chat-file-import');
if(drop){
 for(const type of ['dragenter','dragover'])drop.addEventListener(type,event=>{
  event.preventDefault();drop.classList.add('kit-chat-file-drag');
 });
 for(const type of ['dragleave','drop'])drop.addEventListener(type,event=>{
  event.preventDefault();drop.classList.remove('kit-chat-file-drag');
 });
 drop.addEventListener('drop',event=>{
  const file=event.dataTransfer?.files?.[0];
  if(file)void kitChatImportFile(file);
 });
}
$('#kitPlusAutoStart')?.addEventListener('click',()=>void plusResearch({openChat:true}));
$('#kitPlusResearch')?.addEventListener('click',()=>void plusResearch());
$('#kitPlusClipboardImport')?.addEventListener('click',()=>void importPlusSuggestions({readClipboard:true}));
$('#kitPlusImport')?.addEventListener('click',()=>void importPlusSuggestions());
$('#kitExpandResearch')?.addEventListener('click',()=>{
 const expanded=$('#kitResearchDetails');
 expanded.open=!expanded.open;
 $('#kitExpandResearch').setAttribute('aria-expanded',expanded.open?'true':'false');
});
$('#kitResearchDetails')?.addEventListener('toggle',()=>{
 const open=$('#kitResearchDetails').open;
 $('#kitExpandResearch')?.setAttribute('aria-expanded',open?'true':'false');
 // Ao abrir a pesquisa avançada, preparar a lista WeDrop em leitura,
 // permitindo que o botão "Abrir ChatGPT" copie ANTES da troca de abas.
 if(open&&kitStockReady){
  let same=false;
  try{kitChatValidateContext();same=Boolean($('#kitResearchPrompt').value);}catch{}
  if(!same)void plusResearch();
 }
});
$('#kitOpenResearchPrompt')?.addEventListener('click',()=>{
 const prompt=$('#kitResearchPrompt').value;
 if(prompt)chatgptHandoff(prompt);else status('Prepare primeiro a pesquisa com os SKUs WeDrop.','error');
});
$('#kitOpenContentPrompt')?.addEventListener('click',()=>{
 const prompt=$('#kitContentPrompt').value;
 if(prompt)kitContentHandoff(prompt);
 else kitContentFeedback('Prepare primeiro o texto com as SKUs verificadas.','error');
});
$('#kitPlusText')?.addEventListener('click',()=>void plusText());
$('#kitContinueContent')?.addEventListener('click',()=>void plusText({proceedWithoutDetails:true}));
$('#kitImportCopiedText')?.addEventListener('click',()=>void kitImportCopiedContent());
$('#kitManualContentPaste')?.addEventListener('click',()=>{
 $('#kitContentDetails').open=true;
 $('#kitPlusTextResult').focus();
 kitImportState('Cole a resposta completa no campo abaixo e clique Importar texto colado','info');
});
$('#kitImportText')?.addEventListener('click',()=>importPlusText());
$('#kitSaveSeoContent')?.addEventListener('click',async()=>{
 kitImportState('Salvando os textos selecionados...','info');
 const saved=await saveDraft();
 if(saved){
  kitImportState('✓ Três títulos e descrição salvos no rascunho','success');
  $('#kitSeoSaveStatus').textContent='✓ Textos atualizados no rascunho, sem publicar.';
 }
});

$('#kitGenerateAll')?.addEventListener('click',()=>void kitStartExtensionImages());
$('#kitStopExtension')?.addEventListener('click',()=>kitStopKitExtension('Geração pausada por solicitação. Fotos já salvas preservadas.'));
$('#kitPlusManualFallback')?.addEventListener('click',openChatGPTImages);
$('#kitPlusCopyGeneratedPrompt')?.addEventListener('click',()=>void copy($('#kitPlusImagePrompt').value));
$('#kitPlusNextImagePrompt')?.addEventListener('click',()=>{
 if(!prepared)return;
 const next=kitImageNextSlot(images.keys());
 if(next===null)return kitPlusGenerationStatus('As nove imagens estão ocupadas. Revise a galeria.','success');
 const prompt=kitImagePromptAt(next)+'\n\nGERE AGORA A IMAGEM '+String(next).padStart(2,'0')+
  '/09, não escreva apenas o prompt. Use as fotos anexadas nesta conversa como referências. Entregue uma imagem individual.';
 void copy(prompt);
 kitPlusGenerationStatus('Prompt da imagem '+String(next).padStart(2,'0')+
  ' copiado. Cole na conversa do ChatGPT em andamento, gere e baixe a imagem para a pasta monitorada.','success');
});
$('#kitApprovePaidImages')?.addEventListener('change',()=>{
 kitAutoImageUi();if(prepared)renderImageSlots();
});
$('#kitGenerateAutomatic')?.addEventListener('click',()=>void kitGeneratePaidImages());
$('#kitStopAutomatic')?.addEventListener('click',()=>{
 kitAutoImageStop=true;
 imageStatus('Parada solicitada. A imagem que já está sendo gerada poderá ser cobrada e será recebida antes da interrupção.','info');
});
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
$('#kitTitle')?.addEventListener('input',()=>{
 const heading=$('#kitSkuTitle');
 if(heading&&prepared)heading.textContent=$('#kitTitle').value.trim()||
  prepared.kit.components.map(p=>p.name).join(' + ');
});
$('#kitCopyTitle')?.addEventListener('click',()=>void copy($('#kitTitle').value));
$('#kitCopyDescription')?.addEventListener('click',()=>void copy($('#kitDescription').value));
$('#kitCopyAllPrompts')?.addEventListener('click',()=>prepared&&void copy(
 Array.from({length:9},(_,i)=>kitImagePromptAt(i+1)).join('\n\n--- PRÓXIMA IMAGEM ---\n\n')));
$('#kitClose')?.addEventListener('click',()=>kitCloseInlineEditor());
window.RAKitBuilderLoad=async()=>{
 setKitMode(kitCurrentMode);
 await categories();
 await loadDrafts();
};
if(location.pathname.replace(/\/$/,'').endsWith('/kits'))window.RAKitBuilderLoad();
document.querySelector('a[data-tab="kits"]')?.addEventListener('click',()=>window.RAKitBuilderLoad());
