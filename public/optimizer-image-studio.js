
/* Commercial Image Studio · non-invasive UI for the existing Shopee optimizer */
(function(){
 'use strict';
 const $=selector=>document.querySelector(selector);
 const el=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
 };
 const panel=$('#optimizerImagesPanel');
 if(!panel||panel.dataset.raStudio==='1')return;
 const layout=panel.querySelector('.optimizer-commercial-layout');
 const main=layout?.querySelector('.optimizer-commercial-main');
 const aside=layout?.querySelector('.optimizer-commercial-rework');
 const gallery=panel.querySelector('.optimizer-commercial-gallery-section');
 const heading=main?.querySelector('.optimizer-commercial-heading');
 const chat=$('#optimizerChatgptAuto');
 const select=$('#optimizerImageCorrectionSlot');
 const rework=aside?.querySelector('.optimizer-image-rework');
 if(!layout||!main||!aside||!gallery||!heading||!chat||!select||!rework)return;
 panel.dataset.raStudio='1';panel.classList.add('ra-studio');
 let slot=Math.max(1,Math.min(9,Number(select.value)||1));
 const bridge=()=>window.RACommercialStudioBridge||null;
 const currentPlan=()=>bridge()?.getPlan?.()||null;
 const statusLine=el('div','ra-studio-status','Galeria preparada para revisão. Nenhuma foto será publicada sem aprovação.');
 statusLine.setAttribute('role','status');statusLine.setAttribute('aria-live','polite');
 const head=el('header','ra-studio-header');
 const product=el('div','ra-studio-product');
 const productPhoto=el('img');productPhoto.alt='Imagem do produto selecionado';
 const productCopy=el('div');
 const productSku=el('strong','','SKU atual');
 const productName=el('span','','Produto em revisão');
 productCopy.append(productSku,productName);
 product.append(productPhoto,productCopy);
 const progress=el('div','ra-studio-progress');
 const progressValue=el('strong','','0/9');
 progress.append(progressValue,el('small','','Imagens preparadas'));
 head.append(heading,product,progress);
 const toolbar=el('nav','ra-studio-toolbar');
 toolbar.setAttribute('aria-label','Ações comerciais para as imagens');
 const makeButton=(label,cls,action)=>{
  const b=el('button',cls,label);b.type='button';b.addEventListener('click',action);return b;
 };
 const extra=el('details','ra-studio-advanced');
 const extraLabel=el('summary','','⚙ Ferramentas avançadas · API, importação, orientações e progresso');
 extra.append(extraLabel,main);
 function openExtra(target){
  extra.open=true;
  if(target){target.open=true;target.scrollIntoView({block:'nearest',behavior:'smooth'});}
  else extra.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 const generateSingle=()=> {
  const card=gallery.querySelector('.optimizer-commercial-image-card[data-slot="'+slot+'"]');
  if(card){card.querySelector('.optimizer-commercial-image-actions button:first-child')?.click();return;}
  $('#optimizerImagesFilterAll')?.click();
  statusLine.textContent='Exiba todas as posições e selecione a imagem a gerar.';
 };
 toolbar.append(
  chat,
  makeButton('▧ Gerar apenas a imagem selecionada','ra-toolbar-single',generateSingle),
  makeButton('☁ Importar imagens','ra-toolbar-import',()=>openExtra($('.optimizer-image-manual-fallback'))),
  makeButton('▣ Novas fotos na galeria','ra-toolbar-gallery',()=>{
   $('#optimizerImagesFilterAll')?.click();gallery.scrollIntoView({block:'start',behavior:'smooth'});
  }),
  makeButton('ⓘ Ver regras','ra-toolbar-rules',()=>$('#optimizerCommercialShowRules')?.click())
 );
 const workspace=el('div','ra-studio-workspace');
 const galleryColumn=el('div','ra-studio-gallery-column');
 galleryColumn.append(gallery);
 workspace.append(galleryColumn,aside);
 const nav=el('div','ra-studio-slot-controls');
 const navLabel=el('strong','');
 const prev=makeButton('‹','',()=>setSlot(slot===1?9:slot-1));
 const next=makeButton('›','',()=>setSlot(slot===9?1:slot+1));
 prev.setAttribute('aria-label','Imagem anterior');
 next.setAttribute('aria-label','Próxima imagem');
 nav.append(navLabel,prev,next);
 rework.insertBefore(nav,rework.querySelector('.optimizer-rework-fields'));
 // Reutilizar os botões originais com os listeners de app.js já associados.
 // Não criar controles visuais duplicados nem redirecionar para geração genérica.
 const quick=el('div','ra-studio-quick-actions');
 const editField=$('#optimizerImageCorrection');
 const editOrientation=$('#optimizerImageEditOrientation');
 const improveAI=$('#optimizerImageImproveAI');
 const removeBackground=$('#optimizerImageRemoveBackground');
 const duplicateToolbar=rework.querySelector('.optimizer-image-edit-toolbar');
 const swapPhoto=makeButton('▧ Trocar imagem','',()=>$('#optimizerImageCorrectionChoose')?.click());
 quick.append(swapPhoto);
 for(const button of [editOrientation,improveAI,removeBackground]){
  if(!button)continue;
  button.classList.remove('secondary');
  if(button===removeBackground)button.textContent='▨ Remover fundo';
  quick.append(button); // mover conserva listeners e IDs
 }
 duplicateToolbar?.remove(); // wrapper verde já não contém os botões
 rework.insertBefore(quick,rework.querySelector('.optimizer-workflow-actions'));
 const originalReady=rework.querySelector('.optimizer-image-ready-actions');
 const savedPreview=rework.querySelector('#optimizerImageCorrectionPreview');
 if(originalReady||savedPreview){
  const ready=el('details','ra-studio-extra-tools');
  ready.id='raCommercialPasteReady';
  const readySummary=el('summary','','📋 Copiar e colar imagem já pronta');
  readySummary.setAttribute('aria-label','Abrir ferramentas para colar ou selecionar imagem pronta e visualizar a foto atual');
  const readyHelp=el('p','ra-studio-paste-help','Copie a imagem no ChatGPT e cole com Ctrl + V, ou selecione um arquivo. A substituição será salva na posição escolhida.');
  ready.append(readySummary,readyHelp);
  if(savedPreview)ready.append(savedPreview);
  if(originalReady)ready.append(originalReady);
  rework.insertBefore(ready,$('#optimizerImageCorrectionStatus'));
 }
 const bulk=el('section','ra-studio-bulk');
 bulk.append(el('strong','','☷ Ações em lote'));
 function status(message){statusLine.textContent=message;}
 const filterAll=()=>$('#optimizerImagesFilterAll')?.click();
 bulk.append(makeButton('☷ Ver ordem 1–9','',()=>{filterAll();status('Sequência ordenada por posição. Arraste cartões para trocar imagens já preparadas.');}));
 bulk.append(makeButton('▣ Importar da galeria','',()=>openExtra($('.optimizer-image-manual-fallback'))));
 const download=makeButton('↓ Baixar todas','',async()=>{
  const w=currentPlan();
  if(!w){status('Selecione uma SKU antes de baixar as imagens.');return;}
  download.disabled=true;
  try{
   const qs=new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId});
   const res=await fetch('/api/shopee/optimizer/images/manual?'+qs);
   if(!res.ok)throw Error('Falha na consulta das imagens');
   const data=await res.json();const images=data.images||[];
   if(!images.length)throw Error('Não há imagens comerciais salvas nesta SKU.');
   const entries=[];
   for(const image of images){
    const result=await fetch(image.previewUrl);
    if(!result.ok)throw Error('Não foi possível baixar a imagem '+image.slot);
    const bytes=new Uint8Array(await result.arrayBuffer());
    const type=result.headers.get('content-type')||'';
    const ext=type.includes('jpeg')?'jpg':type.includes('webp')?'webp':'png';
    entries.push({name:String(image.slot).padStart(2,'0')+'.'+ext,bytes});
   }
   const blob=buildZip(entries);
   const href=URL.createObjectURL(blob);
   const link=el('a');link.href=href;link.download='imagens-comerciais-'+w.sku+'.zip';
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(href),30000);
   status(entries.length+' imagens preparadas no arquivo ZIP. Nenhuma foto da Shopee foi alterada.');
  }catch(err){status('Não foi possível baixar: '+err.message);}finally{download.disabled=false;}
 });
 const deleteAll=makeButton('▤ Limpar todas','ra-bulk-delete',async()=>{
  const w=currentPlan();
  if(!w){status('Selecione uma SKU antes de excluir.');return;}
  if(!confirm('Excluir TODAS as imagens comerciais preparadas da SKU '+w.sku+'?\nEsta ação não altera as imagens já publicadas na Shopee, mas não pode ser desfeita.'))return;
  deleteAll.disabled=true;
  let done=0;
  try{
   const qs=new URLSearchParams({sku:w.sku,item_id:w.itemId,model_id:w.modelId});
   const response=await fetch('/api/shopee/optimizer/images/manual?'+qs);
   if(!response.ok)throw Error('Não foi possível consultar as imagens salvas.');
   const current=(await response.json()).images||[];
   for(const photo of current){
    const active=currentPlan();
    if(!active||active.sku!==w.sku||active.itemId!==w.itemId||active.modelId!==w.modelId)throw Error('A SKU mudou durante a operação.');
    const url='/api/shopee/optimizer/images/manual?'+new URLSearchParams({
     sku:w.sku,item_id:w.itemId,model_id:w.modelId,slot:photo.slot
    });
    const res=await fetch(url,{method:'DELETE'});
    if(!res.ok)throw Error('Não foi possível limpar a posição '+photo.slot);
    done++;
    status('Excluindo imagens preparadas: '+done+'/'+current.length);
   }
   bridge()?.invalidate?.();
   status(done+' imagens comerciais removidas. As fotos da Shopee foram preservadas.');
  }catch(err){status('Exclusão parcial ('+done+'): '+err.message);}
  finally{deleteAll.disabled=false;filterAll();await bridge()?.reload?.();}
 });
 bulk.append(deleteAll);
 galleryColumn.append(bulk);
 layout.remove();
 panel.replaceChildren(head,toolbar,workspace,extra,statusLine);
 // Keep the server's real controls and their listeners; only relocate them.
 select.addEventListener('change',()=>{slot=Number(select.value)||1;refreshSelected();});
 function setSlot(value){
  slot=Math.max(1,Math.min(9,Number(value)||1));
  select.value=String(slot);
  select.dispatchEvent(new Event('change',{bubbles:true}));
  refreshSelected();
 }
 function refreshSelected(){
  navLabel.textContent=String(slot).padStart(2,'0')+' / 09';
  gallery.querySelectorAll('.optimizer-commercial-image-card').forEach(card=>
   card.classList.toggle('ra-selected',Number(card.dataset.slot)===slot));
 }
 function decorateCards(){
  for(const card of gallery.querySelectorAll('.optimizer-commercial-image-card:not([data-ra-decorated])')){
   card.dataset.raDecorated='1';
   const target=Number(card.dataset.slot);
   const thumb=card.querySelector('.optimizer-commercial-thumb');
   if(thumb){
    thumb.tabIndex=0;thumb.setAttribute('role','button');
    thumb.setAttribute('aria-label','Selecionar imagem '+target);
    thumb.addEventListener('click',()=>setSlot(target));
    thumb.addEventListener('keydown',event=>{
     if(event.key==='Enter'||event.key===' '){event.preventDefault();setSlot(target);}
    });
   }
   const move=card.querySelector('.optimizer-commercial-move-select');
   const menu=el('details','ra-card-menu');
   const trigger=el('summary','','⋮');
   trigger.setAttribute('aria-label','Mais ações da imagem '+target);
   const content=el('div','ra-card-menu-content');
   content.append(el('label','','Mover ou trocar de posição'));
   if(move)content.append(move);
   menu.append(trigger,content);
   card.append(menu);
   const edit=card.querySelector('.optimizer-commercial-image-actions button:nth-child(2)');
   edit?.addEventListener('click',()=>{setSlot(target);editField?.focus();});
  }
  refreshSelected();
  const count=$('#optimizerCommercialPreparedCount')?.textContent?.trim()||'0';
  progressValue.textContent=count+'/9';
  const w=currentPlan();
  const sku=w?.sku||$('#optimizerExecutionSku')?.textContent?.trim();
  if(sku&&sku!=='SKU')productSku.textContent='SKU '+String(sku).replace(/^SKU\s*/i,'');
  const title=w?.draftTitle||w?.title||w?.name||$('#optimizerExecutionProductTitle')?.textContent?.trim();
  if(title&&title!=='Anúncio Shopee')productName.textContent=title;
  const url=w?.imageUrls?.find?.(Boolean)||
   $('#optimizerExecutionProductImage')?.getAttribute('src')||
   gallery.querySelector('.optimizer-commercial-thumb img')?.src;
  if(url&&productPhoto.getAttribute('src')!==url)productPhoto.src=url;
 }
 const galleryObserver=new MutationObserver(decorateCards);
 const grid=$('#optimizerImagesGallery');
 if(grid)galleryObserver.observe(grid,{childList:true});
 const counter=$('#optimizerCommercialPreparedCount');
 if(counter)new MutationObserver(decorateCards).observe(counter,{childList:true,characterData:true,subtree:true});
 const providerStatus=$('#optimizerChatgptBridgeStatus');
 const apiStatus=$('#optimizerImagesStatus');
 const correctionStatus=$('#optimizerImageCorrectionStatus');
 function syncStatus(){
  const candidates=[correctionStatus,providerStatus,apiStatus].map(node=>node?.textContent?.trim()).filter(Boolean);
  const message=candidates.find(s=>/erro|falha|reconect|envi|geran|preparand|pausad|salva|conclu|interromp|imagem \d/i.test(s));
  if(message)statusLine.textContent=message.slice(0,420);
 }
 for(const node of [providerStatus,apiStatus,correctionStatus])
  if(node)new MutationObserver(syncStatus).observe(node,{childList:true,characterData:true,subtree:true});
 decorateCards();
 // In-page ZIP (uncompressed): no dependency, no remote upload of photos.
 function buildZip(entries){
  const encoder=new TextEncoder(),parts=[],central=[];
  let offset=0;const u16=(view,i,v)=>view.setUint16(i,v,true),u32=(view,i,v)=>view.setUint32(i,v>>>0,true);
  const crc32=bytes=>{
   let crc=-1;
   for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
   return (crc^(-1))>>>0;
  };
  for(const file of entries){
   const name=encoder.encode(file.name),data=file.bytes,crc=crc32(data);
   const lh=new Uint8Array(30+name.length),lv=new DataView(lh.buffer);
   u32(lv,0,0x04034b50);u16(lv,4,20);u16(lv,6,0);u16(lv,8,0);
   u32(lv,14,crc);u32(lv,18,data.length);u32(lv,22,data.length);u16(lv,26,name.length);lh.set(name,30);
   parts.push(lh,data);
   const ch=new Uint8Array(46+name.length),cv=new DataView(ch.buffer);
   u32(cv,0,0x02014b50);u16(cv,4,20);u16(cv,6,20);u32(cv,16,crc);
   u32(cv,20,data.length);u32(cv,24,data.length);u16(cv,28,name.length);u32(cv,42,offset);ch.set(name,46);
   central.push(ch);offset+=lh.length+data.length;
  }
  let centralSize=0;for(const chunk of central)centralSize+=chunk.length;
  const end=new Uint8Array(22),dv=new DataView(end.buffer);
  u32(dv,0,0x06054b50);u16(dv,8,entries.length);u16(dv,10,entries.length);
  u32(dv,12,centralSize);u32(dv,16,offset);
  return new Blob([...parts,...central,end],{type:'application/zip'});
 }
})();
