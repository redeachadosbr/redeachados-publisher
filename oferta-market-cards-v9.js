'use strict';
/* Oferta Blumenau V9 — same real market identity for all individual store cards.
   Presentation only: leaves store IDs, branch addresses, source URLs and click handlers intact. */
(function(){
  const BRANDS=[
    {name:'Rede TOP',accent:'#0b77b7',halo:'rgba(35,151,223,.18)'},
    {name:'Unibox Dinardelli',accent:'#db3644',halo:'rgba(239,80,89,.17)'},
    {name:'Fort Atacadista',accent:'#db2537',halo:'rgba(238,75,78,.18)'},
    {name:'Brasil Atacadista',accent:'#195fb3',halo:'rgba(74,131,225,.17)'},
    {name:'Bistek',accent:'#c4233b',halo:'rgba(221,63,80,.15)'},
    {name:'Cooper',accent:'#08845b',halo:'rgba(35,176,117,.18)'},
    {name:'Giassi',accent:'#d7691f',halo:'rgba(240,151,54,.18)'},
    {name:'Komprão',accent:'#d62b39',halo:'rgba(246,76,85,.17)'}
  ];
  const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
  function brandOf(text){
    const title=normalize(text);
    const found=BRANDS.find(b=>title.startsWith(normalize(b.name)+' ·')||
        title.startsWith(normalize(b.name)+' -')||
        title===normalize(b.name)||
        title.startsWith(normalize(b.name)+' –'));
    if(found)return found;
    const first=String(text||'').split(/\s+[·–-]\s+/)[0].trim();
    return first?{name:first,accent:'#0b8667',halo:'rgba(20,176,119,.15)'}:null;
  }
  function paintCard(card){
    const h=card.querySelector('h3');
    if(!h)return;
    const brand=brandOf(h.textContent);
    if(!brand)return;
    if(card.dataset.obStoreCardV9===brand.name)return;
    const header=card.querySelector('.markettop')||card;
    let mark=card.querySelector('.marketlogo');
    if(!mark){
      mark=document.createElement('div');
      mark.className='marketlogo';
      header.prepend(mark);
    }
    mark.classList.add('ob-store-logo-v9');
    mark.setAttribute('aria-label','Marca '+brand.name);
    const helper=window.OBPremiumPublic&&window.OBPremiumPublic.brandLogo;
    if(typeof helper==='function'){
      try{mark.innerHTML=helper(brand.name,false);}
      catch(_err){mark.textContent=brand.name;}
    }else mark.textContent=brand.name;
    card.style.setProperty('--ob-store-accent',brand.accent);
    card.style.setProperty('--ob-store-halo',brand.halo);
    card.classList.add('ob-store-card-v9');
    card.dataset.obStoreCardV9=brand.name;
  }
  function install(){
    const page=document.querySelector('[data-page="mercados"]');
    if(!page||page.dataset.obMarketsV9Installed==='true')return;
    page.dataset.obMarketsV9Installed='true';
    let scheduled=false;
    const render=()=>{
      page.querySelectorAll('.marketcard').forEach(paintCard);
    };
    const schedule=()=>{
      if(scheduled)return;
      scheduled=true;
      queueMicrotask(()=>{scheduled=false;render();});
    };
    const observer=new MutationObserver(schedule);
    observer.observe(page,{childList:true,subtree:true});
    render();
    window.addEventListener('load',schedule,{once:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
