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
 let running=false,completed=false,shopId='',checkedAt='',scannedListings=0,
  totalListings=0,loadedStatuses=0,controller=null,scanSerial=0,shown=80,hasVisited=false;
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
  find('pendingImagesActiveDetail').textContent=
   num(byCategory.active_with_stock)+' anúncios/variações · 0 a 8 imagens';
  find('pendingImagesScanned').textContent=(completed?'Auditoria completa: ':'Leitura parcial: ')+
   num(scannedListings)+' anúncios consultados'+(totalListings?' de '+num(totalListings):'')+
   '. '+num(groupRows('active_with_stock').reduce((n,x)=>n+Number(x.missingImages||0),0))+
   ' imagens faltantes nos registros ativos com estoque.';
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
    button.addEventListener('click',()=>{
     if(typeof globalThis.RAOpenPendingImageSku==='function')
      globalThis.RAOpenPendingImageSku(button.dataset.sku);
     else state('Não foi possível abrir a otimização desta SKU. Use a busca em Otimização de anúncios.','error');
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
 function save(){
  try{sessionStorage.setItem(cacheKey,JSON.stringify({shopId,checkedAt,completed,
   scannedListings,totalListings,rows:[...collection.values()]}));}catch{}
 }
 function restore(){
  if(collection.size||running||completed)return false;
  let data=null;
  try{data=JSON.parse(sessionStorage.getItem(cacheKey)||'null');}catch{}
  if(!data?.completed||!Array.isArray(data.rows)||
     Date.now()-Date.parse(data.checkedAt||'')>10*60000)return false;
  shopId=data.shopId||'';checkedAt=data.checkedAt;completed=true;
  scannedListings=Number(data.scannedListings)||0;
  totalListings=Number(data.totalListings)||0;loadedStatuses=4;
  collection.clear();
  for(const row of data.rows)if(row?.key)collection.set(row.key,row);
  progress(100);render();
  state('Resultado da última auditoria concluída em '+safeDate(checkedAt)+
   '. Clique em “Atualizar auditoria” para conferir novamente a Shopee.','success');
  return true;
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
   save();render();
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
  if(!hasVisited){
   hasVisited=true;
   if(!restore())void run();
  }
 }
 find('pendingImagesRefresh').addEventListener('click',()=>void run());
 find('pendingImagesCancel').addEventListener('click',()=>{
  controller?.abort();
 });
 find('pendingImagesExport').addEventListener('click',exportCsv);
 find('pendingImagesFilter').addEventListener('change',()=>{shown=80;renderTable();});
 find('pendingImagesSearch').addEventListener('input',()=>{shown=80;renderTable();});
 find('pendingImagesMore').addEventListener('click',()=>{shown+=80;renderTable();});
 globalThis.PendingImagesUI={onOpen,refresh:run};
 if(root.classList.contains('active'))onOpen();
})();
