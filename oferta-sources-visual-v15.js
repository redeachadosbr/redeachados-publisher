'use strict';
/* Oferta Blumenau V15: apresentação e filtros locais de fontes já verificadas.
   Não coleta dados, não muda status e não publica preços. */
(function(root,factory){
 const api=factory();
 if(root)root.OBSourcesVisualV15=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document!=='undefined'){
   const init=()=>api.init();
   if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
   else init();
 }
})(typeof globalThis==='object'?globalThis:window,function(){
 const stateFor=label=>{
   const s=String(label||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
   if(s.includes('pagina lida'))return 'read';
   if(s.includes('falha')||s.includes('erro')||s.includes('bloqueado'))return 'error';
   return 'pending';
 };
 const svg=state=>{
   const paths={
     read:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
     error:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v5"/><path d="M12 17h.01"/>',
     pending:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
   };
   return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[state]+'</svg>';
 };
 let state='all',grid=null,panel=null,ready=false,queued=false,observer=null;
 function classify(){
   const cards=[...grid.querySelectorAll(':scope > .marketcard')];
   const counts={all:cards.length,read:0,error:0,pending:0};
   for(const [idx,card] of cards.entries()){
     const chip=card.querySelector('.statuschip');
     const type=stateFor(chip?.textContent);
     counts[type]++;
     if(card.dataset.obvSourceState!==type)card.dataset.obvSourceState=type;
     card.classList.add('obv-source-card');
     const mark=card.querySelector('.markettop .marketlogo');
     if(mark&&mark.dataset.obvSourceSymbol!==type){
       mark.dataset.obvSourceSymbol=type;
       mark.innerHTML=svg(type);
       mark.setAttribute('aria-hidden','true');
     }
     const title=card.querySelector('h3');
     if(title&&title.id==='')title.id='obv-source-name-'+idx;
     if(title)card.setAttribute('aria-labelledby',title.id);
     card.hidden=state!=='all'&&type!==state;
   }
   return counts;
 }
 function createToolbar(page){
   let el=page.querySelector('#obvSourcesToolbar');
   if(el)return el;
   el=document.createElement('div');
   el.id='obvSourcesToolbar';
   el.className='obv-source-toolbar';
   el.innerHTML='<div class="obv-toolbar-copy"><div class="obv-toolbar-eyebrow">PAINEL DE ACOMPANHAMENTO</div>'+
    '<strong>Monitoramento das fontes</strong>'+
    '<p>Uma página acessível não garante preços ou ofertas confirmadas.</p></div>'+
    '<div class="obv-filter-row" role="group" aria-label="Filtrar fontes pelo resultado">'+
     '<button type="button" data-obv-filter="all" aria-pressed="true">Todas <b data-obv-count="all">0</b></button>'+
     '<button type="button" data-obv-filter="read" aria-pressed="false">Página lida <b data-obv-count="read">0</b></button>'+
     '<button type="button" data-obv-filter="error" aria-pressed="false">Falha de acesso <b data-obv-count="error">0</b></button>'+
     '<button type="button" data-obv-filter="pending" aria-pressed="false">Não verificadas <b data-obv-count="pending">0</b></button>'+
    '</div>';
   grid.before(el);
   el.addEventListener('click',event=>{
     const button=event.target.closest('[data-obv-filter]');
     if(!button||!el.contains(button))return;
     const next=button.dataset.obvFilter;
     if(!['all','read','error','pending'].includes(next))return;
     state=next;render();
   });
   return el;
 }
 function render(){
   if(!grid||!panel)return;
   const counts=classify();
   panel.querySelectorAll('[data-obv-count]').forEach(el=>{
     const n=String(counts[el.dataset.obvCount]??0);
     if(el.textContent!==n)el.textContent=n;
   });
   panel.querySelectorAll('[data-obv-filter]').forEach(el=>{
     const active=el.dataset.obvFilter===state;
     if(el.getAttribute('aria-pressed')!==String(active))el.setAttribute('aria-pressed',String(active));
   });
   let empty=document.getElementById('obvSourcesEmpty');
   if(!empty){
     empty=document.createElement('p');
     empty.id='obvSourcesEmpty';empty.className='obv-source-empty';
     grid.after(empty);
   }
   const n=counts[state]??0;
   empty.hidden=n!==0;
   if(n===0){
     const txt=counts.all===0?'As fontes ainda não foram carregadas.':
       'Nenhuma fonte corresponde ao filtro selecionado.';
     if(empty.textContent!==txt)empty.textContent=txt;
   }
 }
 function init(){
   if(ready)return;
   const page=document.querySelector('[data-page="fontes"]');
   grid=page?.querySelector('#sourcesGrid');
   if(!grid)return;
   ready=true;
   page.classList.add('obv-sources-page');
   panel=createToolbar(page);
   observer=new MutationObserver(()=>{
     if(queued)return;
     queued=true;
     requestAnimationFrame(()=>{queued=false;render()});
   });
   observer.observe(grid,{childList:true,subtree:true});
   render();
   // DOM rewrites made by the existing drawSources() are observed and restyled.
 }
 return {init,stateFor,render};
});