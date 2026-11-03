// Ranking TOP 10 Orgânico: abre ao autenticar ou atualizar, usa exclusivamente
// relatório orgânico salvo (nunca /ads/). Sem dados, mostra a importação.
(()=>{
 'use strict';
 function start(){
  const modal=document.getElementById('organicTop10Overlay');
  if(!modal)return;
  const $=id=>document.getElementById(id);
  const group=$('organicTop10Sorts'),list=$('organicTop10List');
  const importBox=$('organicTop10Import'),status=$('organicTop10Status');
  const sorts=[...group.querySelectorAll('button[data-sort]')];
  let visible=false,autoShown=false,loading=false,sort='combined',last=null,
   focusBefore=null,loadSequence=0;
  const fmt=new Intl.NumberFormat('pt-BR');
  const dec=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const number=v=>v===null||v===undefined?'—':fmt.format(Number(v));
  const percent=v=>v===null||v===undefined?'—':dec.format(Number(v))+'%';
  const period=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?
   d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
  const date=v=>{
   const parsed=Date.parse(String(v||''));
   return Number.isFinite(parsed)?new Date(parsed).toLocaleString('pt-BR',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
   }):'não informada';
  };
  function notice(text,kind='info'){
   status.hidden=false;
   status.textContent=String(text);
   status.dataset.status=kind;
  }
  function el(parent,tag,text='',className=''){
   const node=document.createElement(tag);
   node.textContent=String(text??'');
   if(className)node.className=className;
   parent.append(node);
   return node;
  }
  function render(rows){
   list.replaceChildren();
   const input=Array.isArray(rows)?rows:[];
   input.forEach((row,index)=>{
    const card=el(list,'article','','organic-top10-item');
    card.style.animationDelay=Math.min(index*35,300)+'ms';
    const product=el(card,'div','','organic-top10-product');
    el(product,'span',String(index+1).padStart(2,'0'),'organic-top10-rank');
    if(/^https:\/\//i.test(String(row.imageUrl||''))){
     const photo=el(product,'img','','organic-top10-thumb');
     photo.src=row.imageUrl;photo.alt='Miniatura do produto '+String(row.sku||'');
     photo.loading=index>3?'lazy':'eager';
     photo.referrerPolicy='no-referrer';
     photo.onerror=()=>{
      const replacement=document.createElement('span');
      replacement.className='organic-top10-thumb organic-top10-thumb-placeholder';
      replacement.textContent='▧';photo.replaceWith(replacement);
     };
    }else el(product,'span','▧','organic-top10-thumb organic-top10-thumb-placeholder');
    const title=el(product,'div');
    const name=el(title,'strong',row.title||'Produto Shopee','organic-top10-product-name');
    name.title=row.title||'Produto Shopee';
    el(title,'small','SKU '+(row.sku||'não identificada')+
     (row.itemId?' · Item '+row.itemId:''),'organic-top10-product-code');
    const add=(value,label,cls='')=>{
     const col=el(card,'div','','organic-top10-value '+cls);
     el(col,'span',value);
     el(col,'small',label);
    };
    add(number(row.impressions),'Impressões');
    add(number(row.visits),'Visitas');
    add(number(row.clicks),'Cliques');
    add(percent(row.ctr),'CTR','organic-top10-ctr');
    const action=el(card,'button','Ver SKU','organic-top10-open-item');
    action.type='button';
    action.disabled=!row.sku||typeof globalThis.RAOpenPendingImageSku!=='function';
    action.title=action.disabled?'SKU sem vínculo no catálogo':'Abrir otimização da SKU';
    action.addEventListener('click',()=>{
     if(!row.sku)return;
     close();
     globalThis.RAOpenPendingImageSku?.(row.sku);
    });
   });
  }
  async function refresh(){
   if(loading)return;
   loading=true;const serial=++loadSequence;
   notice('Carregando o ranking orgânico salvo, sem consultar métricas de Ads…');
   try{
    const response=await fetch('/api/shopee/organic/top10?'+
     new URLSearchParams({sort}),{credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(serial!==loadSequence)return;
    if(!response.ok||data.ok!==true)throw Error(data.error||'Não foi possível ler os dados orgânicos.');
    last=data;
    if(!data.available){
     render([]);
     $('organicTop10Period').textContent='Período: sem relatório salvo';
     $('organicTop10Count').textContent='Dados orgânicos indisponíveis';
     $('organicTop10Footnote').textContent=
      'Nenhuma métrica orgânica foi importada. O sistema não usa indicadores de Shopee Ads como substituto.';
     notice('Nenhum relatório orgânico foi salvo nesta loja. Para mostrar produtos reais, importe o relatório de Informações Gerenciais, filtrado para tráfego sem Ads.');
     importBox.hidden=false;
     sorts.forEach(b=>b.disabled=b.dataset.sort!=='combined');
     return;
    }
    const items=data.list||[];
    const available=data.metadata?.metrics||{};
    $('organicTop10Period').textContent='Período: '+
     period(data.period?.start)+' a '+period(data.period?.end);
    $('organicTop10Count').textContent=
     items.length+' de '+number(data.rowCount)+' SKUs · atualizado em '+date(data.importedAt);
    $('organicTop10Footnote').textContent=
     'Fonte: relatório orgânico importado em '+date(data.importedAt)+
     '. Sem vinculação aos relatórios Shopee Ads. Campos ausentes são mostrados como “—”.'+
     (data.catalogWarning?' '+data.catalogWarning:'');
    sorts.forEach(button=>{
     button.disabled=button.dataset.sort!=='combined'&&available[button.dataset.sort]===false;
     button.setAttribute('aria-pressed',String(button.dataset.sort===sort));
    });
    status.hidden=true;
    render(items);
    // Importação opcional enquanto já há dados; não toma a tela inteira.
    if(importBox.dataset.open!=='manual')importBox.hidden=true;
   }catch(error){
    render([]);
    notice('Não foi possível carregar o ranking orgânico salvo: '+String(error.message||error)+
     '. As métricas de Ads não serão usadas.', 'error');
    $('organicTop10Count').textContent='Consulta indisponível';
    importBox.hidden=true;
   }finally{
    loading=false;
   }
  }
  function open({auto=false}={}){
   if(auto&&autoShown)return;
   if(auto)autoShown=true;
   if(visible)return;
   visible=true;focusBefore=document.activeElement;
   modal.hidden=false;document.body.classList.add('organic-top10-open');
   $('organicTop10Close').focus({preventScroll:true});
   void refresh();
  }
  function close(){
   if(!visible)return;
   visible=false;modal.hidden=true;
   document.body.classList.remove('organic-top10-open');
   if(focusBefore&&typeof focusBefore.focus==='function')
    focusBefore.focus({preventScroll:true});
  }
  $('organicTop10Close').addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close()});
  document.addEventListener('keydown',event=>{
   if(!visible)return;
   if(event.key==='Escape'){event.preventDefault();close();}
   if(event.key==='Tab'){
    const focusable=[...modal.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden])')]
     .filter(x=>x.getClientRects().length);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  });
  $('organicTop10Open')?.addEventListener('click',()=>open());
  $('organicTop10Update').addEventListener('click',()=>void refresh());
  $('organicTop10ShowImport').addEventListener('click',()=>{
   importBox.hidden=false;importBox.dataset.open='manual';
   $('organicTop10File').focus();
  });
  $('organicTop10CancelImport').addEventListener('click',()=>{
   importBox.hidden=true;importBox.dataset.open='';
  });
  group.addEventListener('click',event=>{
   const button=event.target.closest('button[data-sort]');
   if(!button||button.disabled)return;
   sort=button.dataset.sort;
   sorts.forEach(x=>x.setAttribute('aria-pressed',String(x===button)));
   void refresh();
  });
  const localDate=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000)
   .toISOString().slice(0,10);
  const end=new Date(),startDay=new Date();
  startDay.setDate(startDay.getDate()-29);
  $('organicTop10Start').value=localDate(startDay);
  $('organicTop10End').value=localDate(end);
  $('organicTop10Import').addEventListener('submit',async event=>{
   event.preventDefault();
   const button=$('organicTop10Upload');
   const note=$('organicTop10ImportNotice');
   const file=$('organicTop10File').files?.[0];
   if(!file){note.textContent='Selecione um relatório CSV/Excel.';return;}
   if(file.size>4_000_000){
    note.textContent='Arquivo maior que 4 MB. Exporte um período menor.';return;
   }
   if(!$('organicTop10OrganicConfirmed').checked){
    note.textContent='Confirme que as métricas são exclusivamente orgânicas.';return;
   }
   button.disabled=true;note.dataset.kind='info';
   note.textContent='Validando o período e os dados orgânicos…';
   try{
    const base64=await new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));
     reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
     reader.readAsDataURL(file);
    });
    const res=await fetch('/api/shopee/organic/top10/import',{
     method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({fileName:file.name,base64,
      periodStart:$('organicTop10Start').value,
      periodEnd:$('organicTop10End').value,
      organicConfirmed:true})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||data.ok!==true)throw Error(data.error||'Importação não confirmada.');
    note.textContent=number(data.rowCount)+' SKUs orgânicas salvas na loja.';
    note.dataset.kind='success';
    importBox.hidden=true;importBox.dataset.open='';
    sort='combined';
    void refresh();
   }catch(error){
    note.textContent=String(error.message||error);
    note.dataset.kind='error';
   }finally{button.disabled=false;}
  });
  // O evento vem APENAS depois de autenticação real da tela, tanto no
  // primeiro carregamento quanto após o login manual.
  window.addEventListener('ra:app-authorized',()=>open({auto:true}));
  if(!document.getElementById('app')?.classList.contains('hidden')&&
     document.getElementById('login')?.classList.contains('hidden'))
   open({auto:true});
  globalThis.RAOrganicTop10={open,refresh,close};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
