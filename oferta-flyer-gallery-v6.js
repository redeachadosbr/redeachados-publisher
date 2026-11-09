'use strict';
/* Oferta Blumenau V6 — dedicated leaflet gallery, no individual-product cards.
   One publication per cover; retain exact official market URL for each store.
   Validity comes only from catalog date fields, never inferred from image text.
*/
(function(root,factory){
 const app=factory();
 if(root)root.OBFlyerGalleryV6=app;
 if(typeof module==='object'&&module.exports)module.exports=app;
 if(typeof document!=='undefined'){
   const boot=()=>app.init();
   if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
   else boot();
 }
})(typeof globalThis==='object'?globalThis:window,function(){
 const FAV_KEY='oferta-blumenau-flyers-fav-v6';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validHttps=value=>{try{const x=new URL(String(value||''));return x.protocol==='https:'&&!x.username&&!x.password?x.href:null}catch{return null}};
 const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
 const isValid=(d,day=today())=>!!(d&&/^\d{4}-\d{2}-\d{2}$/.test(String(d.starts_on||''))&&
   /^\d{4}-\d{2}-\d{2}$/.test(String(d.ends_on||''))&&d.starts_on<=day&&d.ends_on>=day&&d.valid_now!==false);
 const imageUrl=l=>{
   const u=validHttps(l?.asset_url);
   if(!u)return null;
   try{const parsed=new URL(u);const pathname=decodeURIComponent(parsed.pathname);
     if(!/\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(pathname))return null;
   }catch{return null}
   return u;
 };
 const prettyDate=v=>{
   const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
   if(!m)return 'Não informada';
   const names=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
   const idx=Number(m[2])-1;
   return Number(m[3])+' '+names[idx]+' '+m[1];
 };
 const labelTitle=t=>String(t||'Encarte oficial').replace(/_/g,' ').replace(/\s+/g,' ').trim();
 const icon=(which,extra='')=>{
   const shapes={
     eye:'<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/>',
     share:'<circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/>',
     heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
     download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
     check:'<path d="m5 12 4 4L19 6"/>',
     calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18"/>',
     tag:'<path d="m3 11 9-9h8v8l-9 9L3 11Z"/><circle cx="16" cy="6" r="1"/>',
     shop:'<path d="M3 10h18v11H3zM2 10l2-7h16l2 7M8 21v-6h7v6"/>',
     close:'<path d="M5 5l14 14M19 5 5 19"/>',
     external:'<path d="M14 4h6v6M11 13l9-9M20 13v7H4V4h7"/>',
     copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"/>',
   };
   return '<svg class="'+extra+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">'+(shapes[which]||shapes.tag)+'</svg>';
 };
 function group(docs,stores,opts={}){
   const day=opts.day||today(),validOnly=opts.validOnly!==false;
   const byCover=new Map();
   for(const l of Array.isArray(docs)?docs:[]){
     if(!l||typeof l!=='object')continue;
     const cover=imageUrl(l);
     if(!cover)continue; // This screen is a leaflet cover gallery, not a generic source directory.
     if(validOnly&&!isValid(l,day))continue;
     const key=[l.network||'',cover,l.starts_on||'',l.ends_on||''].join('|');
     let g=byCover.get(key);
     if(!g){
       g={id:String(l.id??key),network:l.network||'Supermercado',title:l.title||'Encarte',
         cover,starts_on:l.starts_on||null,ends_on:l.ends_on||null,
         current:isValid(l,day),source_url:validHttps(l.source_url),links:[],itemCount:0,sortId:Number(l.id)||0};
       byCover.set(key,g);
     }
     g.itemCount++;
     g.sortId=Math.max(g.sortId,Number(l.id)||0);
     const s=Array.isArray(stores)?stores.find(x=>x.id===l.store_id):null;
     const source=validHttps(l.source_url)||validHttps(s?.url_ofertas);
     if(source&&!g.links.some(x=>x.url===source)){
       g.links.push({url:source,store_id:l.store_id||null,
         label:s?(s.filial||s.bairro||s.nome||s.id):'Página oficial'});
     }
   }
   return [...byCover.values()].sort((a,b)=>(b.current?1:0)-(a.current?1:0)||
     String(b.ends_on||'').localeCompare(String(a.ends_on||''))||b.sortId-a.sortId);
 }
 let saved=new Set(),inited=false;
 function favorites(){
   try{const raw=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');
     return new Set(Array.isArray(raw)?raw.filter(x=>typeof x==='string').slice(0,120):[])
   }catch{return new Set()}
 }
 function remember(){
   try{localStorage.setItem(FAV_KEY,JSON.stringify([...saved].slice(0,120)))}catch(_e){}
 }
 function toast(message){
   let t=document.getElementById('obfToast');
   if(!t){t=document.createElement('div');t.id='obfToast';t.className='obf-toast';t.setAttribute('role','status');document.body.append(t)}
   t.textContent=message;
   t.classList.add('visible');
   if(root.OBFlyerToastTimeout)clearTimeout(root.OBFlyerToastTimeout);
   root.OBFlyerToastTimeout=setTimeout(()=>t.classList.remove('visible'),3500);
 }
 function branchSelect(g,i){
   if(g.links.length<=1)return '';
   return '<label class="obf-branch"><span>Escolha a filial</span><select data-obf-store="'+i+'" aria-label="Filial da '+escape(g.network)+'">'+
     g.links.map((x,ix)=>'<option value="'+ix+'">'+escape(x.label)+'</option>').join('')+'</select></label>';
 }
 function card(g,i){
   const status=g.current?'<span class="obf-valid">'+icon('check')+' Dentro do período</span>':
     '<span class="obf-unknown">Validade não confirmada ou encerrada</span>';
   const until=g.ends_on?'<span class="obf-date">'+icon('calendar')+'<span>Válido até <strong>'+escape(prettyDate(g.ends_on))+'</strong></span></span>':
     '<span class="obf-date is-unknown">'+icon('calendar')+'<span>Validade <strong>não informada</strong></span></span>';
   const url=g.links[0]?.url||g.source_url;
   const official=url?'<a class="obf-market-link" target="_blank" rel="noopener noreferrer" href="'+escape(url)+'" data-obf-market="'+i+'">'+icon('shop')+' Ofertas no mercado '+icon('external')+'</a>':
     '<span class="obf-no-link">Link oficial não disponível</span>';
   const favored=saved.has(g.cover);
   return '<article class="obf-card" data-obf-card="'+i+'">'+
     '<div class="obf-cover-shell"><button class="obf-cover-button" type="button" data-obf-view="'+i+'" aria-label="Ampliar encarte '+escape(labelTitle(g.title))+'">'+
       '<img class="obf-cover" src="'+escape(g.cover)+'" alt="Capa original do encarte '+escape(g.network)+' — '+escape(labelTitle(g.title))+'" loading="'+(i<3?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false">'+
       '<div class="obf-image-unavailable" hidden>'+icon('tag')+'<strong>Imagem indisponível</strong><small>Abra o encarte no site oficial</small></div></button>'+
     '</div>'+
     '<div class="obf-card-details">'+
       '<div class="obf-status">'+status+until+'</div>'+
       '<h3 title="'+escape(g.title)+'">'+escape(labelTitle(g.title))+'</h3>'+
       '<div class="obf-market-name">'+icon('shop')+'<span>'+escape(g.network)+(g.links.length>1?' · '+g.links.length+' filiais':' · '+escape(g.links[0]?.label||'Fonte oficial'))+'</span></div>'+
       branchSelect(g,i)+
       '<div class="obf-actions"><button class="obf-view" type="button" data-obf-view="'+i+'">'+icon('eye')+' Visualizar encarte</button>'+
         '<button class="obf-round" type="button" data-obf-share="'+i+'" title="Compartilhar encarte" aria-label="Compartilhar encarte">'+icon('share')+'</button>'+
         '<button class="obf-round obf-fav '+(favored?'selected':'')+'" type="button" data-obf-save="'+i+'" title="'+(favored?'Remover dos favoritos':'Favoritar encarte')+'" aria-label="'+(favored?'Remover dos favoritos':'Favoritar encarte')+'" aria-pressed="'+favored+'">'+icon('heart')+'</button>'+
         '<a class="obf-round" href="'+escape(g.cover)+'" target="_blank" rel="noopener noreferrer" download title="Abrir arquivo para salvar" aria-label="Abrir imagem original para salvar">'+icon('download')+'</a>'+
       '</div>'+
       '<div class="obf-market-bottom">'+official+'</div>'+
     '</div></article>';
 }
 function ensureModal(){
   let dlg=document.getElementById('obfDialog');
   if(dlg)return dlg;
   dlg=document.createElement('dialog');dlg.id='obfDialog';dlg.className='obf-dialog';
   dlg.innerHTML='<div class="obf-dialog-head"><strong id="obfDialogTitle">Encarte</strong><button type="button" data-obf-close aria-label="Fechar visualização">'+icon('close')+'</button></div>'+
     '<div class="obf-dialog-img"><img id="obfDialogImage" alt="Imagem ampliada do encarte" decoding="async"><p>Se não conseguir ler, use “Abrir imagem” para consultar o arquivo original.</p></div>'+
     '<div class="obf-dialog-footer"><a id="obfDialogOriginal" target="_blank" rel="noopener noreferrer">'+icon('external')+' Abrir imagem</a><a id="obfDialogMarket" target="_blank" rel="noopener noreferrer">'+icon('shop')+' Ofertas do mercado</a></div>';
   document.body.append(dlg);
   dlg.querySelector('[data-obf-close]').addEventListener('click',()=>dlg.close());
   dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
   return dlg;
 }
 function preview(g,i){
   const dlg=ensureModal();
   dlg.querySelector('#obfDialogTitle').textContent=labelTitle(g.title);
   const img=dlg.querySelector('#obfDialogImage');
   img.src=g.cover;
   img.alt='Encarte '+g.network+' ampliado';
   dlg.querySelector('#obfDialogOriginal').href=g.cover;
   const market=dlg.querySelector('#obfDialogMarket');
   const selected=document.querySelector('[data-obf-store="'+i+'"]');
   const n=selected?Number(selected.value):0;
   const link=g.links[n]?.url||g.links[0]?.url||g.source_url;
   market.hidden=!link;
   if(link)market.href=link;else market.removeAttribute('href');
   if(typeof dlg.showModal==='function')dlg.showModal();
   else root.open(g.cover,'_blank','noopener,noreferrer');
 }
 function getDocs(){try{return Array.isArray(leaflets)?leaflets:[]}catch{return []}}
 function getStores(){try{return Array.isArray(stores)?stores:[]}catch{return []}}
 function activeFilter(){try{return onlyActive===true}catch{return true}}
 function render(){
   const el=document.getElementById('leafletGrid');if(!el)return;
   const groups=group(getDocs(),getStores(),{day:today(),validOnly:activeFilter()});
   el.classList.add('obf-grid');el.dataset.leafletCount=String(groups.length);
   const page=document.querySelector('[data-page="encartes"]');
   if(page)page.classList.add('obf-scene');
   el.innerHTML=groups.length?
     groups.map(card).join(''):
     '<div class="obf-empty">'+icon('tag')+'<h3>Nenhum encarte com capa disponível neste filtro</h3>'+
     '<p>Mostramos somente publicações reais. Use “Mostrar todos” para consultar encartes sem validade confirmada.</p></div>';
   el._obfGroups=groups;
   const button=document.getElementById('onlyActive');
   if(button){
     button.classList.add('obf-filter');
     button.setAttribute('aria-pressed',String(activeFilter()));
     button.innerHTML=icon('check')+(activeFilter()?' Somente válidos':' Mostrar somente válidos');
   }
   const title=page?.querySelector('.secthead h2');
   if(title)title.innerHTML='Encartes <em>encontrados</em>';
   const subtitle=page?.querySelector('.secthead p');
   if(subtitle)subtitle.textContent='Capas originais por mercado, com validade identificada e acesso direto às ofertas oficiais.';
 }
 async function share(g,i){
   const sel=document.querySelector('[data-obf-store="'+i+'"]');
   const link=g.links[sel?Number(sel.value):0]?.url||g.links[0]?.url||g.source_url||g.cover;
   const title='Encarte '+g.network+' — '+labelTitle(g.title);
   if(navigator.share){
     try{await navigator.share({title,text:'Consulte a oferta no site oficial do mercado.',url:link});return}
     catch(e){if(e.name==='AbortError')return}
   }
   try{
     if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);toast('Link oficial copiado.')}
     else{
       const t=document.createElement('textarea');t.value=link;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();
       if(!document.execCommand('copy'))throw Error('Cópia indisponível');
       t.remove();toast('Link oficial copiado.');
     }
   }catch{toast('Não foi possível copiar. Abra o encarte pelo botão de ofertas.')}
 }
 function bind(){
   const grid=document.getElementById('leafletGrid');if(!grid)return;
   grid.addEventListener('click',e=>{
     const groups=grid._obfGroups||[];
     const get=(selector,key)=>{const btn=e.target.closest(selector);return btn?{el:btn,i:Number(btn.dataset[key])}:null};
     let action=get('[data-obf-view]','obfView');
     if(action&&groups[action.i]){preview(groups[action.i],action.i);return}
     action=get('[data-obf-share]','obfShare');
     if(action&&groups[action.i]){share(groups[action.i],action.i);return}
     action=get('[data-obf-save]','obfSave');
     if(action&&groups[action.i]){
       const key=groups[action.i].cover;
       if(saved.has(key))saved.delete(key);else saved.add(key);
       remember();const selected=saved.has(key);
       action.el.classList.toggle('selected',selected);
       action.el.setAttribute('aria-pressed',String(selected));
       const label=selected?'Remover dos favoritos':'Favoritar encarte';
       action.el.title=label;action.el.setAttribute('aria-label',label);
       toast(selected?'Encarte salvo nos favoritos.':'Encarte retirado dos favoritos.');
     }
   });
   grid.addEventListener('change',e=>{
     const sel=e.target.closest('[data-obf-store]');if(!sel)return;
     const i=Number(sel.dataset.obfStore);
     const group=grid._obfGroups?.[i];
     if(!group)return;
     const market=grid.querySelector('[data-obf-market="'+i+'"]');
     const chosen=group.links[Number(sel.value)];
     if(market&&chosen)market.href=chosen.url;
   });
 }
 function init(){
   if(inited)return;
   const page=document.querySelector('[data-page="encartes"]');
   const grid=document.getElementById('leafletGrid');
   if(!page||!grid)return;
   inited=true;
   saved=favorites();
   page.classList.add('obf-scene');
   // Default to dated, currently valid leaflets. The original toggle still works.
   try{onlyActive=true}catch(_e){}
   bind();
   // Keep refreshAll()/original navigation compatible: replace only the gallery renderer.
   try{drawLeaflets=render}catch(_e){}
   render();
 }
 return {init,render,group,isValid,imageUrl,prettyDate};
});