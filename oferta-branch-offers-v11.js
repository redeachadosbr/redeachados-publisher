'use strict';
/* Oferta Blumenau V11 — ofertas por FILIAL, sem herdar preços de outra loja.
   Fonte: registros existentes de lojas, ofertas aprovadas e encartes do servidor.
   Nunca cria valores nem atribui uma campanha genérica a uma filial. */
(function(root,factory){
  const api=factory();
  if(root)root.OBBranchOffersV11=api;
  if(typeof document!=='undefined'){
    const start=()=>api.init();
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
  }
})(typeof globalThis!=='undefined'?globalThis:window,function(){
  const clean=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,' ').trim();
  const escape=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const now=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;
  const money=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const safeUrl=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
  const data=()=>{
    let ss=[],oo=[],ll=[];
    try{if(typeof stores!=='undefined'&&Array.isArray(stores))ss=stores}catch(e){}
    try{if(typeof offers!=='undefined'&&Array.isArray(offers))oo=offers}catch(e){}
    try{if(typeof leaflets!=='undefined'&&Array.isArray(leaflets))ll=leaflets}catch(e){}
    return {stores:ss,offers:oo,leaflets:ll};
  };
  const activeOffer=(o,day=now())=>o&&Number.isFinite(Number(o.price))&&Number(o.price)>0&&
    date(o.starts_on)&&date(o.ends_on)&&o.starts_on<=day&&o.ends_on>=day;
  const activeFlyer=(l,day=now())=>l&&date(l.starts_on)&&date(l.ends_on)&&
    l.starts_on<=day&&l.ends_on>=day&&l.valid_now!==false;
  function findStore(card,all){
    const hints=[card.dataset.storeId,card.dataset.storeid,card.querySelector('[data-store-id]')?.dataset.storeId]
      .filter(Boolean);
    for(const id of hints){const found=all.find(s=>String(s.id)===String(id));if(found)return found}
    const title=clean(card.querySelector('h3')?.textContent||'');
    if(!title)return null;
    // Strict match of complete network + branch; a shared bairro is NOT enough.
    const matches=all.filter(s=>[s.rede+' · '+(s.filial||''),s.rede+' - '+(s.filial||''),
      s.rede+' · '+(s.nome||''),s.rede+' · '+(s.bairro||'')]
      .some(x=>clean(x)===title));
    return matches.length===1?matches[0]:null;
  }
  function byBranch(store,db,day=now()){
    const id=String(store?.id||'');
    if(!id)return {offers:[],flyers:[]};
    const products=(db.offers||[]).filter(o=>String(o.store_id||'')===id&&activeOffer(o,day));
    const unique=new Map();
    products.forEach(o=>{
      const key=[clean(o.name),clean(o.brand),clean(o.package),Number(o.price).toFixed(2)].join('|');
      if(!unique.has(key))unique.set(key,o);
    });
    const documents=(db.leaflets||[]).filter(l=>String(l.store_id||'')===id&&activeFlyer(l,day));
    const magazines=new Map();
    documents.forEach(l=>{
      const url=safeUrl(l.asset_url)||safeUrl(l.source_url);
      const key=[clean(l.title),url||'',l.ends_on].join('|');
      if(!magazines.has(key))magazines.set(key,l);
    });
    return {offers:[...unique.values()].sort((a,b)=>Number(a.price)-Number(b.price)),
      flyers:[...magazines.values()].sort((a,b)=>String(b.ends_on).localeCompare(String(a.ends_on)))};
  }
  const statusText=(o,f)=>o?o+' produto'+(o===1?'':'s')+' com preço confirmado':
    f?f+' encarte'+(f===1?'':'s')+' vigente'+(f===1?'':'s'):'Sem ofertas verificadas';
  function cardFor(card,db){
    const store=findStore(card,db.stores);
    let button=card.querySelector('.ob-branch-offers-btn');
    if(!button){
      button=document.createElement('button');
      button.className='ob-branch-offers-btn';
      button.type='button';
      button.innerHTML='<span aria-hidden="true">🏷️</span><span>Ofertas</span><span class="ob-branch-offers-count" aria-hidden="true"></span>';
      const link=card.querySelector('a.ctaLink');
      if(link)link.before(button);else card.appendChild(button);
    }
    if(store){
      button.dataset.obBranchId=String(store.id);
      button.disabled=false;
      button.setAttribute('aria-label','Ver ofertas da filial '+(store.filial||store.nome||store.bairro||store.id));
      const counts=byBranch(store,db);
      const label=button.querySelector('.ob-branch-offers-count');
      if(label){const amount=String(counts.offers.length);if(label.textContent!==amount)label.textContent=amount}
      let summary=card.querySelector('.ob-branch-availability');
      if(!summary){
        summary=document.createElement('p');summary.className='ob-branch-availability';
        button.before(summary);
      }
      const message=statusText(counts.offers.length,counts.flyers.length);
      if(summary.textContent!==message)summary.textContent=message;
      summary.classList.toggle('is-empty',!counts.offers.length);
      card.classList.add('ob-branch-ready');
    }else{
      button.disabled=true;
      button.removeAttribute('data-ob-branch-id');
      const count=button.querySelector('.ob-branch-offers-count');
      if(count)count.textContent='—';
    }
  }
  function dialog(){
    let el=document.getElementById('obBranchOffersDialog');
    if(el)return el;
    el=document.createElement('dialog');
    el.id='obBranchOffersDialog';el.className='ob-branch-dialog';
    el.setAttribute('aria-label','Ofertas por filial');
    el.innerHTML='<div class="ob-branch-modal"><header class="ob-branch-modal-head"><div class="ob-branch-modal-heading" id="obBranchModalHeading"></div><button type="button" class="ob-branch-close" aria-label="Fechar painel de ofertas">✕</button></header><div class="ob-branch-modal-content" id="obBranchModalContent"></div></div>';
    document.body.appendChild(el);
    el.querySelector('.ob-branch-close').addEventListener('click',()=>el.close());
    el.addEventListener('click',e=>{if(e.target===el)el.close()});
    return el;
  }
  function show(store){
    const db=data(),{offers:products,flyers}=byBranch(store,db);
    const el=dialog(), title=store.rede+' · '+(store.filial||store.nome||store.bairro||store.id);
    const heading=el.querySelector('#obBranchModalHeading');
    heading.innerHTML='<span class="ob-branch-kicker">OFERTAS DESTA UNIDADE</span><h2>'+escape(title)+'</h2>'+
      '<p>'+escape([store.bairro,store.endereco||store.address].filter(Boolean).join(' · '))+'</p>';
    const renderProduct=o=>{
      const source=safeUrl(o.source_url);
      const verified=source?'<a target="_blank" rel="noopener noreferrer" href="'+escape(source)+'">Consultar fonte</a>':'';
      return '<article class="ob-branch-product"><div><strong>'+escape(o.name||'Produto')+'</strong>'+
        '<small>'+escape([o.brand,o.package].filter(Boolean).join(' · '))+'</small>'+
        '<span class="ob-branch-terms">Válido até '+escape(o.ends_on)+' · Preço aprovado para esta filial</span>'+
        verified+'</div><span class="ob-branch-price">'+escape(money(o.price))+'</span></article>';
    };
    const renderFlyer=l=>{
      const dest=safeUrl(l.source_url)||safeUrl(l.asset_url);
      const preview=safeUrl(l.asset_url);
      const image=preview&&/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(preview)?
        '<img src="'+escape(preview)+'" alt="Capa do encarte" loading="lazy">':'<span class="ob-branch-leaf-icon">📰</span>';
      return '<article class="ob-branch-flyer">'+image+'<div><strong>'+escape(l.title||'Encarte oficial')+'</strong>'+
        '<small>Encarte associado a esta filial · até '+escape(l.ends_on)+'</small>'+
        '<small>Os preços das páginas não foram convertidos automaticamente em ofertas de produtos.</small>'+
        (dest?'<a href="'+escape(dest)+'" target="_blank" rel="noopener noreferrer">Abrir encarte ↗</a>':'')+'</div></article>';
    };
    const official=safeUrl(store.url_ofertas);
    let content='<div class="ob-branch-summary"><strong>'+products.length+'</strong> produtos com preço e validade confirmados <span>·</span> <strong>'+flyers.length+'</strong> encartes vigentes vinculados à filial</div>';
    if(products.length){
      content+='<section class="ob-branch-section"><h3>Promoções confirmadas</h3><div class="ob-branch-products">'+products.map(renderProduct).join('')+'</div>'+
        '<button type="button" class="ob-branch-open-vitrine" data-ob-branch-vitrine="'+escape(store.id)+'">Ver na vitrine e adicionar à lista de compras</button></section>';
    }else{
      content+='<div class="ob-branch-empty"><strong>Nenhum preço promocional confirmado nesta filial.</strong>'+
        '<p>A página oficial ou um encarte não confirma, sozinho, o preço individual. O sistema mostra produtos somente após validação de preço, embalagem, filial e vigência.</p></div>';
    }
    if(flyers.length)content+='<section class="ob-branch-section"><h3>Encartes vigentes desta filial</h3>'+flyers.map(renderFlyer).join('')+'</section>';
    if(official)content+='<div class="ob-branch-official"><span>A consulta oficial pode exigir que você selecione a filial novamente.</span>'+
      '<a href="'+escape(official)+'" target="_blank" rel="noopener noreferrer">Consultar site oficial ↗</a></div>';
    el.querySelector('#obBranchModalContent').innerHTML=content;
    if(typeof el.showModal==='function')el.showModal();else el.setAttribute('open','');
  }
  function openInVitrine(id){
    const s=data().stores.find(x=>String(x.id)===String(id));
    if(!s)return;
    dialog().close();
    try{
      const network=document.getElementById('filterNetwork'),store=document.getElementById('filterStore');
      if(network)network.value=s.rede;
      if(typeof buildFilterStore==='function')buildFilterStore();
      if(store)store.value=s.id;
      if(typeof selectPage==='function')selectPage('ofertas');
      if(typeof drawOffers==='function')drawOffers();
    }catch(err){console.warn('Filtro da filial indisponível',err)}
  }
  let initialized=false,queued=false;
  function paint(){
    const page=document.querySelector('[data-page="mercados"]');
    if(!page)return;
    const db=data();
    page.querySelectorAll('.marketcard').forEach(card=>cardFor(card,db));
  }
  function init(){
    if(initialized)return;
    const page=document.querySelector('[data-page="mercados"]');
    if(!page)return;
    initialized=true;
    const schedule=()=>{
      if(queued)return;
      queued=true;
      queueMicrotask(()=>{queued=false;paint()});
    };
    new MutationObserver(schedule).observe(page,{childList:true,subtree:true,characterData:false});
    page.addEventListener('click',e=>{
      const btn=e.target.closest('.ob-branch-offers-btn');
      if(!btn||btn.disabled)return;
      const store=data().stores.find(s=>String(s.id)===btn.dataset.obBranchId);
      if(store){e.preventDefault();e.stopPropagation();show(store)}
    });
    document.addEventListener('click',e=>{
      const target=e.target.closest('[data-ob-branch-vitrine]');
      if(target)openInVitrine(target.dataset.obBranchVitrine);
    });
    paint();
    window.addEventListener('load',paint,{once:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint()});
  }
  return {init,byBranch,findStore,activeOffer,activeFlyer,paint};
});
