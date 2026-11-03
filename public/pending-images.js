// Otimização Pendente — auditoria completa, sem escrita e sem números inventados.
(()=>{
 'use strict';
 const root=document.getElementById('tab-pending-images');
 if(!root)return;
 const find=id=>document.getElementById(id);
 const statuses=['NORMAL','UNLIST','REVIEWING','BANNED'];
 const labels={active_with_stock:'Ativos com estoque',active_no_stock:'Ativos sem estoque',
  inactive:'Inativos',unverified:'Não confirmados'};
 const cacheKey='ra-pending-image-audit-v1';
 const collection=new Map();
 // Confirmação SEMPRE se baseia no readback oficial do Item ID.
 const confirmed=new Map(),verifying=new Set();
 let running=false,completed=false,shopId='',checkedAt='',scannedListings=0,
  totalListings=0,loadedStatuses=0,controller=null,scanSerial=0,shown=80;
 function distinct(group){
  return new Set([...collection.values()].filter(x=>x.category===group&&x.sku)
   .map(x=>x.sku)).size;
 }
 function groupRows(group){
  return [...collection.values()].filter(row=>row.category===group);
 }
 function num(v){return Number(v||0).toLocaleString('pt-BR')}
 function state(text,state='info'){
  const box=find('pendingImagesStatus');
  box.textContent=text;box.dataset.status=state;
 }
 function progress(percent){
  find('pendingImagesProgress').style.width=Math.max(0,Math.min(100,percent))+'%';
  find('pendingImagesTrack').setAttribute('aria-valuenow',String(Math.round(percent)));
 }
 function safeDate(v){
  const d=new Date(v);return Number.isNaN(d.getTime())?'sem horário':
   d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 }
 function build(text,parent,tag,cls=''){
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  el.textContent=String(text??'');
  parent.append(el);return el;
 }
 function renderMetrics(){
  const byCategory={};
  for(const category of Object.keys(labels))byCategory[category]=groupRows(category).length;
  const setMetric=(id,group)=>{
   find(id).textContent=num(group==='unverified'?byCategory[group]:distinct(group));
  };
  setMetric('pendingImagesActive','active_with_stock');
  setMetric('pendingImagesNoStock','active_no_stock');
  setMetric('pendingImagesInactive','inactive');
  setMetric('pendingImagesUnknown','unverified');
  find('pendingImagesConfirmed').textContent=num(confirmed.size);
  find('pendingImagesConfirmedDetail').textContent=
   confirmed.size?'Anúncios-pai retirados da fila após leitura oficial 9/9.':
   'Somente após leitura de 9 imagens na Shopee.';
  // Uma galeria é única por anúncio-pai: cinco SKUs de variação não
  // significam cinco fotografias faltantes no mesmo anúncio.
  const priority=groupRows('active_with_stock');
  const parents=new Map(priority.map(x=>[x.itemId,x.missingImages||0]));
  const missingPhotos=[...parents.values()].reduce((total,n)=>total+n,0);
  find('pendingImagesActiveDetail').textContent=
   num(byCategory.active_with_stock)+' registros de SKUs em '+
   num(parents.size)+' anúncios-pai';
  find('pendingImagesScanned').textContent=(completed?'Auditoria completa: ':'Leitura parcial: ')+
   num(scannedListings)+' anúncios consultados'+(totalListings?' de '+num(totalListings):'')+
   '. Prioridade: '+num(parents.size)+' anúncios-pai e '+
   num(missingPhotos)+' imagens faltantes (sem duplicar variações).';
  find('pendingImagesAsOf').textContent=
   (completed?'Última leitura integral: ':'Resultado parcial: ')+
   (checkedAt?safeDate(checkedAt):'não concluída')+
   (shopId?' · Loja '+shopId:'');
  find('pendingImagesExport').disabled=!completed||!collection.size;
  find('pendingImagesFilters').disabled=!collection.size;
 }
 function renderTable(){
  const category=find('pendingImagesFilter').value;
  const query=find('pendingImagesSearch').value.trim().toLocaleLowerCase('pt-BR');
  const matches=[...collection.values()].filter(row=>
   (category==='all'||row.category===category)&&
   (!query||[row.sku,row.itemId,row.title].some(v=>
    String(v||'').toLocaleLowerCase('pt-BR').includes(query))));
  matches.sort((a,b)=>(a.imageCount===null?10:a.imageCount)-
   (b.imageCount===null?10:b.imageCount)||
   Number(b.stock||0)-Number(a.stock||0)||String(a.sku).localeCompare(String(b.sku)));
  const body=find('pendingImagesRows');body.replaceChildren();
  for(const row of matches.slice(0,shown)){
   const tr=build('',body,'tr');
   const product=build('',tr,'td');
   const wrapper=build('',product,'div','pending-images-product');
   if(row.imageUrl){
    const img=build('',wrapper,'img');
    img.src=row.imageUrl;img.alt='';
    img.loading='lazy';
   }else build('▧',wrapper,'span','no-photo');
   const productTitle=build(row.title||'Anúncio sem título',wrapper,'span');
   productTitle.title=row.title||'';
   const sku=build('',tr,'td');
   build(row.sku||'SKU não informada',sku,'strong');
   build('Item ID '+row.itemId+(row.modelId!=='0'?' · Modelo '+row.modelId:''),sku,'div');
   build(row.listingStatus+(row.modelStatus?' · '+row.modelStatus:''),tr,'td');
   build(row.stock===null?'Não confirmado':num(row.stock),tr,'td');
   const image=build('',tr,'td');
   build(row.imageCount===null?'—':row.imageCount+' / 9',image,'span','pending-images-count');
   build(row.missingImages===null?'Sem leitura válida':
    'Faltam '+row.missingImages,image,'div');
   const next=build('',tr,'td');
   if(row.category==='active_with_stock'&&row.sku){
    const button=build('Otimizar imagens',next,'button');
    button.type='button';button.dataset.sku=row.sku;
    button.addEventListener('click',async()=>{
     if(button.disabled)return;
     button.disabled=true;button.textContent='Conferindo Shopee…';
     try{
      // Não reabrir a otimização de uma SKU já corrigida: ler sempre a
      // galeria na API antes de liberar o botão, independentemente do cache.
      const check=await verifyItem(row.itemId,{force:true,sku:row.sku});
      if(check?.status==='confirmed')return;
      if(check?.status!=='pending')return;
      if(typeof globalThis.RAOpenPendingImageSku==='function')
       globalThis.RAOpenPendingImageSku(button.dataset.sku);
      else state('Não foi possível abrir a otimização da SKU.','error');
     }finally{
      button.disabled=false;button.textContent='Otimizar imagens';
     }
    });
   }else build(row.reason||labels[row.category]||'Sem ação disponível',next,'span');
  }
  find('pendingImagesVisible').textContent=
   num(matches.length)+' registro(s) no filtro'+(completed?' · auditoria confirmada':' · resultado parcial');
  const more=find('pendingImagesMore');
  more.hidden=matches.length<=shown;
  more.textContent='Mostrar mais '+num(Math.min(80,matches.length-shown))+' registros';
  const empty=find('pendingImagesEmpty');
  empty.hidden=matches.length>0;
  if(!matches.length)empty.textContent=
   completed?'Nenhum registro encontrado neste filtro.':
   'Nenhum registro neste filtro até o momento. A auditoria ainda não foi concluída.';
 }
 function render(){renderMetrics();renderTable();}
 // Registros anteriores NÃO são usados para manter pendências antigas.
 // Ao voltar ao menu, uma varredura nova usa a Shopee como única verdade.
 async function verifyItem(itemId,{force=false,sku=''}={}){
  const id=String(itemId||'').trim();
  if(!/^[1-9]\d{0,17}$/.test(id))return {status:'unverified'};
  if(verifying.has(id))return {status:'checking'};
  if(!force&&confirmed.has(id))return {status:'confirmed'};
  verifying.add(id);
  try{
   const response=await fetch('/api/shopee/optimizer/pending-images/verify?'+
    new URLSearchParams({item_id:id}),{
     credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}
    });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||result.ok!==true||String(result.itemId)!==id)
    throw Error(result.error||'Shopee não confirmou o Item ID consultado.');
   if(shopId&&String(result.shopId)!==String(shopId))
    throw Error('A loja da confirmação é diferente da loja do relatório.');
   if(result.status==='confirmed'&&result.complete===true&&result.imageCount>=9){
    const rows=[...collection.values()].filter(row=>String(row.itemId)===id);
    const names=[...new Set([...rows.map(row=>row.sku),sku].filter(Boolean))];
    for(const row of rows)collection.delete(row.key);
    confirmed.set(id,{itemId:id,skus:names,verifiedAt:result.verifiedAt});
    render();
    state('✓ OK 9/9 confirmado pela Shopee — Item ID '+id+
     (names.length?' · '+names.join(', '):'')+
     '. Retirado da lista pendente; não será otimizado duas vezes.','success');
   }else if(result.status==='pending'&&Number.isInteger(result.imageCount)){
    confirmed.delete(id);
    for(const row of collection.values())if(String(row.itemId)===id){
     row.imageCount=result.imageCount;
     row.missingImages=Math.max(0,9-result.imageCount);
    }
    render();
    state('Item ID '+id+': a Shopee confirmou '+result.imageCount+
     ' de 9 imagens. Ainda faltam '+result.missingImages+
     '. A otimização pode continuar sem repetir etapas já publicadas.','info');
   }else{
    state('Item ID '+id+': a Shopee não confirmou a quantidade de imagens. '+
     'Mantido para conferência; nenhuma conclusão foi registrada.','error');
   }
   return result;
  }catch(error){
   state('Não foi possível conferir as imagens do Item ID '+id+': '+
    String(error.message||error)+'. A SKU continua pendente.','error');
   return {status:'unverified',error:String(error.message||error)};
  }finally{verifying.delete(id);}
 }
 function exportCsv(){
  if(!completed)return;
  const rows=[['SKU','Item ID','Model ID','Título','Status anúncio','Status modelo',
   'Estoque disponível','Imagens','Faltam','Classificação']];
  for(const item of collection.values())rows.push([item.sku,item.itemId,item.modelId,
   item.title,item.listingStatus,item.modelStatus,item.stock??'não confirmado',
   item.imageCount??'não confirmado',item.missingImages??'não confirmado',
   labels[item.category]||item.category]);
  const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"')
   .join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');
  link.href=url;link.download='otimizacao-pendente-imagens-'+
   new Date().toISOString().slice(0,10)+'.csv';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function run(){
  if(running)return;
  running=true;completed=false;checkedAt='';shopId='';scannedListings=0;
  totalListings=0;loadedStatuses=0;shown=80;collection.clear();
  const serial=++scanSerial;
  controller=new AbortController();
  find('pendingImagesRefresh').disabled=true;
  find('pendingImagesCancel').hidden=false;
  find('pendingImagesExport').disabled=true;
  progress(0);render();
  state('Conectando à Shopee e verificando 9 imagens, anúncios e estoque por SKU…','loading');
  try{
   for(let i=0;i<statuses.length;i++){
    const status=statuses[i];let offset=0,pages=0,expected=null;
    do{
     if(controller.signal.aborted||serial!==scanSerial)throw Error('Conferência interrompida.');
     if(++pages>4000)throw Error('Limite de páginas de segurança atingido.');
     const url='/api/shopee/optimizer/pending-images/page?'+
      new URLSearchParams({status,offset:String(offset)});
     const response=await fetch(url,{signal:controller.signal,credentials:'same-origin',
      headers:{'Accept':'application/json','Cache-Control':'no-cache'}});
     const payload=await response.json().catch(()=>({}));
     if(!response.ok||payload.ok!==true)
      throw Error(payload.error||'Shopee não confirmou a página '+status+' '+offset);
     if(!payload.shopId||shopId&&String(payload.shopId)!==String(shopId))
      throw Error('A identificação da loja mudou durante a conferência.');
     shopId=String(payload.shopId);
     if(payload.status!==status||payload.offset!==offset)
      throw Error('A página retornada não corresponde à consulta da Shopee.');
     if(expected===null)expected=payload.totalCount;
     if(expected!==payload.totalCount)
      throw Error('A quantidade de anúncios '+status+' mudou durante a consulta. Refaça a auditoria.');
     if(!Number.isSafeInteger(payload.scannedListings)||!Array.isArray(payload.rows))
      throw Error('Leitura incompleta das fotos, estoque ou variações.');
     for(const row of payload.rows){
      if(!row?.key||collection.has(row.key))
       throw Error('Um anúncio mudou de status ou apareceu duplicado durante a leitura. Refaça a auditoria.');
      // Se a confirmação pontual foi MAIS RECENTE que a leitura da página,
      // não ressuscitar a pendência com uma resposta de paginação antiga.
      const old=confirmed.get(String(row.itemId));
      if(old&&Date.parse(old.verifiedAt)>=Date.parse(payload.asOf||''))continue;
      if(old)confirmed.delete(String(row.itemId));
      collection.set(row.key,row);
     }
     scannedListings+=payload.scannedListings;
     const next=Number(payload.nextOffset);
     if(!Number.isSafeInteger(next)||next<offset||
       payload.hasNext&&next===offset)
      throw Error('Paginação não avançou na Shopee.');
     offset=next;
     const pct=100*(i+(expected?Math.min(1,offset/expected):1))/statuses.length;
     progress(Math.min(99,pct));
     state('Verificando '+status+': '+num(offset)+' de '+num(expected)+
      ' anúncios. '+num(scannedListings)+' consultados no total. Os números são parciais.','loading');
     render();
     if(!payload.hasNext)break;
    }while(true);
    if(offset!==expected)
     throw Error('A Shopee retornou '+offset+' anúncios '+status+', mas informou '+expected+'.');
    totalListings+=expected;loadedStatuses++;
   }
   if(serial!==scanSerial)return;
   completed=true;checkedAt=new Date().toISOString();progress(100);
   state('Auditoria concluída: '+num(scannedListings)+' anúncios conferidos nos quatro status. '+
    num(distinct('active_with_stock'))+' SKUs ativas com estoque e menos de 9 imagens identificadas.','success');
   render();
  }catch(error){
   if(serial!==scanSerial)return;
   completed=false;
   state('Auditoria NÃO concluída: '+String(error.message||error)+
    ' Os totais exibidos são PARCIAIS; use “Atualizar auditoria” para repetir a leitura.','error');
   render();
  }finally{
   if(serial===scanSerial){
    running=false;controller=null;
    find('pendingImagesRefresh').disabled=false;
    find('pendingImagesCancel').hidden=true;
   }
  }
 }
 function onOpen(){
  // Sempre consultar a Shopee ao reentrar, inclusive depois de publicar
  // imagens pelo editor. Não restaurar lista pendente de sessionStorage.
  if(!running)void run();
 }
 find('pendingImagesRefresh').addEventListener('click',()=>void run());
 find('pendingImagesCancel').addEventListener('click',()=>{
  controller?.abort();
 });
 find('pendingImagesExport').addEventListener('click',exportCsv);
 find('pendingImagesFilter').addEventListener('change',()=>{shown=80;renderTable();});
 find('pendingImagesSearch').addEventListener('input',()=>{shown=80;renderTable();});
 find('pendingImagesMore').addEventListener('click',()=>{shown+=80;renderTable();});
 globalThis.PendingImagesUI={onOpen,refresh:run,verifyItem};
 if(root.classList.contains('active'))onOpen();
})();
