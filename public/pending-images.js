// Otimização Pendente: fila persistente, atualizada por varredura solicitada.
// A Shopee (não o checklist, o upload ou o cache) confirma 9 fotos.
(()=>{
 'use strict';
 const root=document.getElementById('tab-pending-images');
 if(!root)return;
 const byId=id=>document.getElementById(id);
 const statuses=['NORMAL','UNLIST','REVIEWING','BANNED'];
 const labels={active_with_stock:'Ativos com estoque',active_no_stock:'Ativos sem estoque',
  inactive:'Inativos',unverified:'Dados não confirmados'};
 const collection=new Map(),confirmed=new Map(),verifying=new Map();
 let shopId='',checkedAt='',scannedListings=0,totalListings=0,
  initialized=false,loading=false,completed=false,running=false,
  controller=null,shown=80,scanSerial=0;
 function num(n){return Number(n||0).toLocaleString('pt-BR')}
 function state(message,type='info'){const x=byId('pendingImagesStatus');x.textContent=message;x.dataset.status=type}
 function progress(n){byId('pendingImagesProgress').style.width=Math.max(0,Math.min(100,n))+'%';
  byId('pendingImagesTrack').setAttribute('aria-valuenow',String(Math.round(n)))}
 function date(v){const d=new Date(v);return Number.isFinite(d.getTime())?
  d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',
   hour:'2-digit',minute:'2-digit'}):'não disponível'}
 function element(parent,tag,value='',className=''){
  const x=document.createElement(tag);x.textContent=String(value??'');
  if(className)x.className=className;parent.append(x);return x;
 }
 const rows=group=>[...collection.values()].filter(r=>
  !confirmed.has(String(r.itemId))&&r.category===group);
 const uniqueSku=items=>new Set(items.map(x=>String(x.sku||'')).filter(Boolean));
 function finishedSku(){
  const all=new Set();
  for(const record of confirmed.values())
   for(const sku of record.skus||[])if(sku)all.add(String(sku));
  return all;
 }
 function renderMetrics(){
  const pending=rows('active_with_stock');
  const pendingSkus=uniqueSku(pending);
  const finished=finishedSku();
  const all=new Set([...pendingSkus,...finished]);
  const set=(id,v)=>{byId(id).textContent=completed?num(v):'—'};
  set('pendingImagesActive',pendingSkus.size);
  set('pendingImagesConfirmed',finished.size);
  set('pendingImagesTotal',all.size);
  set('pendingImagesNoStock',uniqueSku(rows('active_no_stock')).size);
  set('pendingImagesInactive',uniqueSku(rows('inactive')).size);
  set('pendingImagesUnknown',rows('unverified').length);
  const parents=new Map(pending.map(r=>[String(r.itemId),r.missingImages||0]));
  byId('pendingImagesActiveDetail').textContent=completed?
   num(pending.length)+' registros em '+num(parents.size)+' anúncios-pai':
   'Nenhum relatório completo salvo';
  byId('pendingImagesConfirmedDetail').textContent=completed?
   num(confirmed.size)+' anúncios-pai com 9/9 confirmadas pela Shopee.':
   'Sem confirmações persistidas';
  byId('pendingImagesScanned').textContent=completed?
   'Relatório salvo: '+num(scannedListings)+' anúncios conferidos em '+date(checkedAt)+
   '. '+num([...parents.values()].reduce((a,b)=>a+b,0))+
   ' vagas de imagem pendentes, sem duplicar variações.':
   'Nenhuma varredura completa foi salva.';
  byId('pendingImagesAsOf').textContent=completed?
   'Varredura de '+date(checkedAt)+(shopId?' · Loja '+shopId:'')+
   ' · permanece gravada até você solicitar nova varredura.':
   'Sem lista salva. Os zeros não são considerados dados oficiais.';
  byId('pendingImagesExport').disabled=!completed;
 }
 function renderDone(){
  const target=byId('pendingImagesDoneRows');
  if(!target)return;
  target.replaceChildren();
  const list=[...confirmed.values()].sort((a,b)=>
   String(b.verifiedAt||'').localeCompare(String(a.verifiedAt||'')));
  for(const item of list){
   const row=element(target,'div','','pending-images-done-row');
   element(row,'strong','✓ OK · 9/9 imagens');
   element(row,'span','SKU'+(item.skus?.length>1?'s':'')+': '+
    (item.skus||[]).join(', ')+(item.skus?.length?' · ':'')+'Item ID '+item.itemId);
   element(row,'small','Conferido na Shopee em '+date(item.verifiedAt));
  }
  if(!list.length)element(target,'p','Nenhuma SKU da fila foi confirmada 9/9 ainda.');
  const summary=byId('pendingImagesDoneTitle');
  if(summary)summary.textContent='Ver otimizadas — '+num(finishedSku().size)+' SKUs';
 }
 function renderTable(){
  // Exclusivamente SKUs ativas com estoque; não existe modo "todos abaixo de 9".
  const search=byId('pendingImagesSearch').value.trim().toLocaleLowerCase('pt-BR');
  const list=rows('active_with_stock').filter(r=>!search||
   [r.sku,r.itemId,r.title].some(v=>
    String(v||'').toLocaleLowerCase('pt-BR').includes(search)));
  list.sort((a,b)=>(a.imageCount??10)-(b.imageCount??10)||
   Number(b.stock||0)-Number(a.stock||0)||String(a.sku).localeCompare(String(b.sku)));
  const table=byId('pendingImagesRows');table.replaceChildren();
  for(const row of list.slice(0,shown)){
   const tr=element(table,'tr');
   const product=element(tr,'td');
   const wrap=element(product,'div','','pending-images-product');
   if(row.imageUrl){
    const img=element(wrap,'img');img.src=row.imageUrl;
    img.loading='lazy';img.alt='';
   }else element(wrap,'span','▧','no-photo');
   const name=element(wrap,'span',row.title||'Anúncio sem título');
   const probableKit=/^(?:kit|combo)(?:\b|\s*[-:/])/i.test(String(row.title||'').trim())||
    /^KIT-[A-Z0-9-]{4,115}$/i.test(String(row.sku||''));
   if(probableKit){
    name.title='Possível kit: o sistema confirmará o Item ID e o vínculo salvo antes de abrir o editor.';
    element(wrap,'small','KIT · conferir vínculo','pending-images-kit-badge');
   }
   const sku=element(tr,'td');
   element(sku,'strong',row.sku);
   element(sku,'div','Item ID '+row.itemId+
    (String(row.modelId)!=='0'?' · Modelo '+row.modelId:''));
   element(tr,'td',row.listingStatus);
   element(tr,'td',row.stock===null?'Sem confirmação':num(row.stock));
   const images=element(tr,'td');
   element(images,'strong',(row.imageCount??'—')+' / 9','pending-images-count');
   element(images,'div','Faltam '+row.missingImages);
   const action=element(tr,'td');
   const defaultText=probableKit?'Otimizar kit':'Otimizar imagens';
   const button=element(action,'button',defaultText);
   button.type='button';button.addEventListener('click',async()=>{
    if(button.disabled)return;
    button.disabled=true;button.textContent='Confirmando na Shopee…';
    try{
     const result=await verifyItem(row.itemId,{force:true});
     // Nenhuma navegação se a Shopee confirmou as 9/9 imagens ou falhou.
     if(result?.status!=='pending')return;
     button.textContent='Identificando kit…';
     const answer=await fetch('/api/shopee/optimizer/pending-images/editor?'+
      new URLSearchParams({item_id:String(row.itemId),sku:String(row.sku||'')}),{
       credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
      });
     const data=await answer.json().catch(()=>({}));
     if(!answer.ok||data.ok!==true||!data.editor?.kind)
      throw Error(data.error||'Não foi possível identificar o tipo de anúncio.');
     const editor=data.editor;
     if(String(editor.itemId)!==String(row.itemId))
      throw Error('O tipo retornado pertence a outro Item ID.');
     if(editor.kind==='ambiguous'){
      state(editor.message||'Vários kits vinculados ao anúncio. Confira antes de editar.','error');
      return;
     }
     if(editor.kind==='kit'||editor.kind==='kit-unlinked'){
      if(typeof globalThis.RAOpenPendingImageKit!=='function')
       throw Error('Otimizador de kits indisponível. Atualize a página.');
      globalThis.RAOpenPendingImageKit(editor);
      return;
     }
     if(editor.kind==='single'){
      if(typeof globalThis.RAOpenPendingImageSku!=='function')
       throw Error('Otimizador individual indisponível.');
      globalThis.RAOpenPendingImageSku(row.sku);
      return;
     }
     throw Error('Tipo de anúncio não reconhecido. A edição foi interrompida.');
    }catch(error){
     state('Não foi possível abrir o editor correto do Item ID '+row.itemId+
      ': '+String(error.message||error)+'. Nenhum anúncio foi modificado.','error');
    }finally{button.disabled=false;button.textContent=defaultText;}
   });
  }
  byId('pendingImagesVisible').textContent=completed?
   num(list.length)+' SKUs ativas, com estoque e menos de 9 imagens':
   'Nenhum relatório salvo';
  byId('pendingImagesMore').hidden=list.length<=shown;
  byId('pendingImagesMore').textContent='Mostrar mais '+num(Math.min(80,list.length-shown))+' SKUs';
  byId('pendingImagesEmpty').hidden=list.length>0;
  byId('pendingImagesEmpty').textContent=completed?
   '✓ Nenhuma SKU ativa com estoque está pendente neste filtro.':
   'Aguardando a primeira varredura completa da Shopee.';
 }
 function render(){renderMetrics();renderTable();renderDone();}
 function applySnapshot(snapshot){
  if(!snapshot)return false;
  shopId=String(snapshot.shop_id||'');
  checkedAt=String(snapshot.scanned_at||'');
  scannedListings=Number(snapshot.scanned_listings)||0;
  totalListings=Number(snapshot.total_listings)||0;
  completed=true;
  collection.clear();confirmed.clear();
  for(const row of snapshot.rows||[])
   if(row?.key)collection.set(String(row.key),row);
  for(const [id,value] of Object.entries(snapshot.optimized||{}))
   if(value?.imageCount>=9)confirmed.set(String(id),value);
  progress(100);render();return true;
 }
 async function loadSnapshot(){
  const response=await fetch('/api/shopee/optimizer/pending-images/snapshot',{
   credentials:'same-origin',cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||result.ok!==true)
   throw Error(result.error||'O servidor não conseguiu recuperar a lista gravada.');
  if(result.exists&&result.snapshot){
   applySnapshot(result.snapshot);
   state('✓ Fila de SKUs recuperada do banco da loja. '+num(finishedSku().size)+
    ' otimizadas e '+num(uniqueSku(rows('active_with_stock')).size)+
    ' faltam. Nova varredura somente pelo botão.','success');
   return true;
  }
  return false;
 }
 async function verifyItem(itemId,{force=false}={}){
  const id=String(itemId||'').trim();
  if(!/^[1-9]\d{0,17}$/.test(id))return {status:'unverified'};
  if(!force&&confirmed.has(id))return {status:'confirmed'};
  if(verifying.has(id))return verifying.get(id);
  const promise=(async()=>{
   try{
    // Servidor faz a consulta oficial e persiste o resultado; cliente
    // nunca envia quantidade de fotos ou sinalizador "OK".
    const response=await fetch('/api/shopee/optimizer/pending-images/confirm',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({itemId:id})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.ok!==true||String(result.itemId)!==id)
     throw Error(result.error||'Resposta inválida da Shopee.');
    if(result.snapshot)applySnapshot(result.snapshot);
    if(result.status==='confirmed'&&result.optimized){
     state('✓ OK · 9/9 imagens confirmadas pela Shopee no Item ID '+id+
      '. SKUs retiradas da fila e histórico salvo.','success');
    }else if(result.status==='pending'){
     // O registro permanece na fila original até uma varredura solicitada.
     for(const row of collection.values())if(String(row.itemId)===id){
      row.imageCount=result.imageCount;row.missingImages=result.missingImages;
     }
     render();
     state('Item ID '+id+' ainda tem '+result.imageCount+
      ' / 9 imagens na Shopee. Continua pendente.','info');
    }else if(result.status==='unverified'){
     state('A Shopee não informou a quantidade de imagens do Item ID '+id+
      '. Não foi marcado como otimizado.','error');
    }
    return result;
   }catch(error){
    state('Falha ao confirmar Item ID '+id+': '+String(error.message||error)+
     '. Nenhuma SKU foi retirada da fila.','error');
    return {status:'unverified',error:String(error.message||error)};
   }finally{verifying.delete(id);}
  })();
  verifying.set(id,promise);return promise;
 }
 function exportCsv(){
  if(!completed)return;
  const lines=[['Situação','SKU','Item ID','Modelo','Produto','Estoque','Imagens','Faltam']];
  for(const row of collection.values())lines.push([
   confirmed.has(String(row.itemId))?'OTIMIZADA 9/9':row.category==='active_with_stock'?
    'PENDENTE':labels[row.category]||row.category,
   row.sku,row.itemId,row.modelId,row.title,row.stock??'',row.imageCount??'',row.missingImages??'']);
  for(const item of confirmed.values())if(![...collection.values()].some(x=>
   String(x.itemId)===String(item.itemId)))
   for(const sku of item.skus||[])lines.push(['OTIMIZADA 9/9',sku,item.itemId,'','','',9,0]);
  const csv='\ufeff'+lines.map(line=>line.map(cell=>
   '"'+String(cell??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download='otimizacao-pendente-'+new Date().toISOString().slice(0,10)+'.csv';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function run({explicit=false}={}){
  if(running)return;
  // O registro salvo NUNCA é sobrescrito se a varredura falhar.
  running=true;
  const serial=++scanSerial;
  controller=new AbortController();
  byId('pendingImagesRefresh').disabled=true;
  byId('pendingImagesCancel').hidden=false;
  progress(0);
  const work=new Map();
  let workingShop='',total=0,scanned=0;
  state('Conferindo anúncios e estoques na Shopee. O relatório salvo permanece preservado até a conclusão…','loading');
  try{
   for(let i=0;i<statuses.length;i++){
    const status=statuses[i];let offset=0,expected=null;
    for(let page=0;page<4000;page++){
     if(controller.signal.aborted||scanSerial!==serial)
      throw Error('Varredura interrompida pelo operador.');
     const url='/api/shopee/optimizer/pending-images/page?'+
      new URLSearchParams({status,offset:String(offset)});
     const response=await fetch(url,{
      credentials:'same-origin',cache:'no-store',signal:controller.signal});
     const data=await response.json().catch(()=>({}));
     if(!response.ok||data.ok!==true)
      throw Error(data.error||'Erro na página '+status+' / '+offset);
     if(!data.shopId||workingShop&&workingShop!==String(data.shopId))
      throw Error('A loja mudou durante a leitura.');
     workingShop=String(data.shopId);
     if(data.status!==status||data.offset!==offset||
       !Array.isArray(data.rows)||!Number.isSafeInteger(data.scannedListings))
      throw Error('Página inválida da Shopee.');
     if(expected===null)expected=data.totalCount;
     if(!Number.isSafeInteger(expected)||expected!==data.totalCount)
      throw Error('Contagem Shopee variou durante a leitura. Refaça a varredura.');
     for(const row of data.rows){
      const checkedAt=data.asOf;
      if(!row.key||work.has(row.key))
       throw Error('SKU/modelo duplicado na leitura. Refaça a varredura.');
      work.set(row.key,{...row,checkedAt});
     }
     scanned+=data.scannedListings;
     const next=Number(data.nextOffset);
     if(!Number.isSafeInteger(next)||next<offset||
       data.hasNext&&next===offset)
      throw Error('Paginação Shopee não avançou.');
     offset=next;
     progress(Math.min(99,100*(i+(expected?Math.min(1,offset/expected):1))/statuses.length));
     state('Lendo '+status+' · '+num(offset)+' de '+num(expected)+
      ' anúncios; '+num(scanned)+' consultados. A fila gravada não foi alterada.','loading');
     if(!data.hasNext)break;
    }
    if(offset!==expected)throw Error('Leitura '+status+' incompleta: '+
      num(offset)+' / '+num(expected)+'.');
    total+=expected;
   }
   if(scanned!==total||scanSerial!==serial)
    throw Error('A leitura terminou com contagem divergente; nenhum relatório foi salvo.');
   state('Consulta concluída. Gravando a lista de SKUs no banco da loja…','loading');
   const response=await fetch('/api/shopee/optimizer/pending-images/snapshot',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({rows:[...work.values()],scannedListings:scanned,totalListings:total})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data.ok!==true||!data.snapshot)
    throw Error(data.error||'O banco não confirmou a gravação.');
   applySnapshot(data.snapshot);
   state('✓ Varredura completa salva: '+num(uniqueSku(rows('active_with_stock')).size)+
    ' SKUs pendentes e '+num(finishedSku().size)+' já confirmadas com 9/9.'+
    ' A fila ficará gravada até você solicitar nova varredura.','success');
  }catch(error){
   state('Varredura não concluída: '+String(error.message||error)+
    (completed?' A lista salva anteriormente foi preservada.':
     ' Nenhuma contagem foi considerada oficial.'),'error');
   progress(completed?100:0);
  }finally{
   if(scanSerial===serial){
    running=false;controller=null;
    byId('pendingImagesRefresh').disabled=false;
    byId('pendingImagesCancel').hidden=true;
   }
  }
 }
 async function onOpen(){
  if(initialized)return;
  initialized=true;loading=true;
  state('Carregando a lista de SKUs já gravada no banco da loja…','loading');
  try{
   const exists=await loadSnapshot();
   if(!exists)await run();
  }catch(error){
   state('Não foi possível carregar o histórico salvo: '+String(error.message||error)+
    '. O sistema NÃO fará uma varredura automática nem exibirá zeros como resultado.','error');
  }finally{loading=false;}
 }
 byId('pendingImagesRefresh').addEventListener('click',()=>void run({explicit:true}));
 byId('pendingImagesCancel').addEventListener('click',()=>controller?.abort());
 byId('pendingImagesExport').addEventListener('click',exportCsv);
 byId('pendingImagesSearch').addEventListener('input',()=>{shown=80;renderTable();});
 byId('pendingImagesMore').addEventListener('click',()=>{shown+=80;renderTable();});
 globalThis.PendingImagesUI={onOpen,refresh:()=>run({explicit:true}),verifyItem};
 render();
 if(root.classList.contains('active'))void onOpen();
})();