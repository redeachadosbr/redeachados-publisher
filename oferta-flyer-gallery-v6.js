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
 const root=typeof globalThis==='object'?globalThis:(typeof window==='object'?window:null);
 const FAV_KEY='oferta-blumenau-flyers-fav-v6';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validHttps=value=>{try{const x=new URL(String(value||''));return x.protocol==='https:'&&!x.username&&!x.password?x.href:null}catch{return null}};
 const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
 const isValid=(d,day=today())=>!!(d&&/^\d{4}-\d{2}-\d{2}$/.test(String(d.starts_on||''))&&
   /^\d{4}-\d{2}-\d{2}$/.test(String(d.ends_on||''))&&d.starts_on<=day&&d.ends_on>=day&&d.valid_now!==false);
 // Resolve public image URLs to the original image, never to an OSuper 0x330 thumbnail.
 // Other hosts are not unwrapped; the signed/thumbnail URL remains the fallback.
 const isImageFile=value=>{
   const u=validHttps(value);if(!u)return false;
   try{return /\.(?:jpe?g|png|webp)$/i.test(decodeURIComponent(new URL(u).pathname));}catch{return false}
 };
 const fullImageUrl=value=>{
   const raw=validHttps(value);if(!raw)return null;
   try{
     const u=new URL(raw);
     if(u.hostname!=='edge.osuper.com.br')return isImageFile(raw)?raw:null;
     const marker='/smart/',at=u.pathname.indexOf(marker);
     if(at===-1)return isImageFile(raw)?raw:null;
     const nested=decodeURIComponent(u.pathname.slice(at+marker.length))+(u.search||'');
     const direct=validHttps(nested);
     if(direct&&new URL(direct).hostname==='osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com'
       &&isImageFile(direct))return direct;
   }catch(_e){}
   return isImageFile(raw)?raw:null;
 };
 const bestFlyerImage=l=>{
   for(const field of ['asset_url','image_url','document_url','source_url']){
     const raw=validHttps(l?.[field]),src=fullImageUrl(raw);
     if(src)return {src,fallback:raw!==src&&isImageFile(raw)?raw:null};
   }
   return null;
 };
 const imageUrl=l=>bestFlyerImage(l)?.src||null;
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
     const candidate=bestFlyerImage(l),cover=candidate?.src;
     if(!cover)continue; // This screen is a leaflet cover gallery, not a generic source directory.
     if(validOnly&&!isValid(l,day))continue;
     const key=[l.network||'',cover,l.starts_on||'',l.ends_on||''].join('|');
     let g=byCover.get(key);
     if(!g){
       g={id:String(l.id??key),network:l.network||'Supermercado',title:l.title||'Encarte',
         cover,rawCover:validHttps(l.asset_url)||cover,fallback:candidate?.fallback||null,
         starts_on:l.starts_on||null,ends_on:l.ends_on||null,
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
   const favored=saved.has(g.cover)||saved.has(g.rawCover);
   return '<article class="obf-card" data-obf-card="'+i+'">'+
     '<div class="obf-cover-shell"><button class="obf-cover-button" type="button" data-obf-view="'+i+'" aria-label="Ampliar encarte '+escape(labelTitle(g.title))+'">'+
       '<img class="obf-cover" src="'+escape(g.cover)+'" alt="Capa original do encarte '+escape(g.network)+' — '+escape(labelTitle(g.title))+'" loading="'+(i<3?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer">'+
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
 // Zoom real da visualização: largura em pixels, não uma porcentagem instável.
 // 100% = imagem encaixada na largura; 200% = duas vezes a largura de encaixe.
 let currentZoom=1,fitWidth=0,loadId=0,pinchStart=null;
 const zoomTarget=(from,delta)=>delta===0?1:Math.max(1,Math.min(6,Math.round((from+(delta>0?.5:-.5))*10)/10));
 const imageQuality=(width,height)=>{
   if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)
     return {low:true,text:'Resolução da imagem indisponível. Confira a fonte oficial.'};
   const small=width<1100;
   return {low:small,text:small?
     'Atenção: o arquivo publicado tem '+width+' × '+height+' pixels. Ampliar não recupera detalhes ausentes. Consulte também o encarte oficial.':
     'Imagem de origem: '+width+' × '+height+' pixels. Arraste ou role para ler outras partes da página.'};
 };
 function updateQuality(img){
   const dlg=document.getElementById('obfDialog');if(!dlg)return;
   const p=dlg.querySelector('#obfImageQuality');if(!p)return;
   const info=imageQuality(img.naturalWidth,img.naturalHeight);
   if(p.textContent!==info.text)p.textContent=info.text;
   p.classList.toggle('is-low',info.low);
 }
 function zoomTo(next,focusX,focusY){
   const dlg=document.getElementById('obfDialog');if(!dlg)return;
   const viewport=dlg.querySelector('#obfDialogViewport'),img=dlg.querySelector('#obfDialogImage');
   const avail=Math.max(260,viewport.clientWidth-18);
   if(!fitWidth)fitWidth=avail;
   const previous=currentZoom,oldWidth=Math.max(1,fitWidth*previous);
   const nextWidth=Math.max(260,Math.round(fitWidth*Math.max(1,Math.min(6,next))));
   const pointX=Number.isFinite(focusX)?focusX:viewport.clientWidth/2;
   const pointY=Number.isFinite(focusY)?focusY:viewport.clientHeight/2;
   const srcX=(viewport.scrollLeft+pointX)/oldWidth;
   const srcY=(viewport.scrollTop+pointY)/oldWidth;
   currentZoom=nextWidth/fitWidth;
   img.style.width=nextWidth+'px';
   img.style.maxWidth='none';
   img.style.maxHeight='none';
   const label=dlg.querySelector('#obfZoomLabel');
   if(label)label.textContent=Math.round(currentZoom*100)+'%';
   // A posição em zoom permanece sobre o mesmo produto/preço no centro da tela.
   viewport.scrollLeft=Math.max(0,Math.round(srcX*nextWidth-pointX));
   viewport.scrollTop=Math.max(0,Math.round(srcY*nextWidth-pointY));
 }
 function setZoom(action){
   zoomTo(zoomTarget(currentZoom,action));
 }
 function ensureModal(){
   let dlg=document.getElementById('obfDialog');
   if(dlg)return dlg;
   dlg=document.createElement('dialog');dlg.id='obfDialog';dlg.className='obf-dialog';
   dlg.innerHTML='<div class="obf-dialog-head"><strong id="obfDialogTitle">Encarte</strong>'+
     '<div class="obf-zoom-controls"><button type="button" data-obf-zoom="-1" aria-label="Diminuir zoom">−</button>'+
     '<output id="obfZoomLabel" aria-live="polite">200%</output>'+
     '<button type="button" data-obf-zoom="1" aria-label="Aumentar zoom">+</button>'+
     '<button type="button" data-obf-fit>Encaixar</button>'+
     '<button type="button" data-obf-close aria-label="Fechar visualização">'+icon('close')+'</button></div></div>'+
     '<div class="obf-dialog-img" id="obfDialogViewport" tabindex="0" aria-label="Imagem do encarte: role para navegar, use mais ou menos para ampliar">'+
     '<img id="obfDialogImage" alt="Imagem ampliada do encarte" decoding="async"></div>'+
     '<div class="obf-dialog-footer"><div class="obf-dialog-guidance">'+
     '<strong>Zoom funcional: + e −, Ctrl + rolagem, ou dois dedos no celular.</strong>'+
     '<small id="obfImageQuality" role="status">Carregando resolução do encarte…</small></div>'+
     '<a id="obfDialogOriginal" target="_blank" rel="noopener noreferrer">'+icon('external')+' Abrir imagem original</a>'+
     '<a id="obfDialogMarket" target="_blank" rel="noopener noreferrer">'+icon('shop')+' Ofertas do mercado</a></div>';
   document.body.append(dlg);
   dlg.querySelector('[data-obf-close]').addEventListener('click',()=>dlg.close());
   dlg.addEventListener('click',e=>{
     if(e.target===dlg){dlg.close();return}
     const z=e.target.closest('[data-obf-zoom]');
     if(z){e.preventDefault();setZoom(Number(z.dataset.obfZoom));return}
     if(e.target.closest('[data-obf-fit]')){e.preventDefault();setZoom(0)}
   });
   const viewport=dlg.querySelector('#obfDialogViewport');
   viewport.addEventListener('wheel',e=>{
     if(!(e.ctrlKey||e.metaKey))return;
     e.preventDefault();
     const rect=viewport.getBoundingClientRect();
     zoomTo(zoomTarget(currentZoom,e.deltaY<0?1:-1),e.clientX-rect.left,e.clientY-rect.top);
   },{passive:false});
   viewport.addEventListener('touchstart',e=>{
     if(e.touches.length!==2){pinchStart=null;return}
     const x=e.touches[0].clientX-e.touches[1].clientX,y=e.touches[0].clientY-e.touches[1].clientY;
     pinchStart={distance:Math.hypot(x,y),zoom:currentZoom};
   },{passive:true});
   viewport.addEventListener('touchmove',e=>{
     if(!pinchStart||e.touches.length!==2)return;
     const x=e.touches[0].clientX-e.touches[1].clientX,y=e.touches[0].clientY-e.touches[1].clientY;
     const distance=Math.hypot(x,y);
     if(pinchStart.distance<8)return;
     e.preventDefault();
     const rect=viewport.getBoundingClientRect();
     const midX=(e.touches[0].clientX+e.touches[1].clientX)/2-rect.left;
     const midY=(e.touches[0].clientY+e.touches[1].clientY)/2-rect.top;
     zoomTo(pinchStart.zoom*distance/pinchStart.distance,midX,midY);
   },{passive:false});
   viewport.addEventListener('touchend',e=>{if(e.touches.length<2)pinchStart=null},{passive:true});
   dlg.addEventListener('keydown',e=>{
     if(e.target?.closest('input,textarea,select'))return;
     if(e.key==='+'||e.key==='='){e.preventDefault();setZoom(1)}
     else if(e.key==='-'){e.preventDefault();setZoom(-1)}
     else if(e.key==='0'){e.preventDefault();setZoom(0)}
   });
   return dlg;
 }
 function preview(g,i){
   const dlg=ensureModal(),img=dlg.querySelector('#obfDialogImage');
   const viewport=dlg.querySelector('#obfDialogViewport');
   dlg.querySelector('#obfDialogTitle').textContent=labelTitle(g.title);
   img.alt='Encarte '+g.network+' ampliado';
   const original=dlg.querySelector('#obfDialogOriginal');
   const message=dlg.querySelector('#obfImageQuality');
   if(message)message.textContent='Carregando imagem original…';
   let retried=false;const ticket=++loadId;
   img.onload=()=>{
     if(ticket!==loadId)return;
     // Guardar a dimensão e posicionar o zoom apenas APÓS o modal ganhar largura.
     updateQuality(img);
     fitWidth=Math.max(260,viewport.clientWidth-18);
     currentZoom=1;
     img.style.width=Math.round(fitWidth)+'px';
     viewport.scrollLeft=0;viewport.scrollTop=0;
     zoomTo(2,0,0);
     viewport.scrollLeft=0;viewport.scrollTop=0;
   };
   img.onerror=()=>{
     if(ticket!==loadId)return;
     if(!retried&&g.fallback&&g.fallback!==g.cover){
       retried=true;img.src=g.fallback;original.href=g.fallback;
     }else {
       const msg='Imagem indisponível. Consulte o encarte no site oficial.';
       if(message)message.textContent=msg;toast(msg);
     }
   };
   const market=dlg.querySelector('#obfDialogMarket');
   const selected=i>=0?document.querySelector('[data-obf-store="'+i+'"]'):null;
   const n=selected?Number(selected.value):0;
   const link=g.links[n]?.url||g.links[0]?.url||g.source_url;
   market.hidden=!link;
   if(link)market.href=link;else market.removeAttribute('href');
   original.href=g.cover;
   // showModal before reading clientWidth: previously the dialog was hidden at 0px.
   if(typeof dlg.showModal==='function'){
     if(!dlg.open)dlg.showModal();
   } else {
     root.open(g.cover,'_blank','noopener,noreferrer');return;
   }
   fitWidth=Math.max(260,viewport.clientWidth-18);
   currentZoom=1;
   img.src=g.cover;
   // Same URL may already be in cache; an onload on a cached resource is not guaranteed on all browsers.
   if(img.complete&&img.naturalWidth>0)img.onload();
 }
 function openImage(l,title,marketUrl){
   const candidate=bestFlyerImage(typeof l==='string'?{asset_url:l}:l);
   if(!candidate)return false;
   const official=validHttps(marketUrl)||(typeof l==='object'?validHttps(l?.source_url):null);
   preview({cover:candidate.src,fallback:candidate.fallback,
      title:title||l?.title||'Encarte oficial',network:l?.network||'Supermercado',
      links:official?[{url:official}]:[],source_url:official},-1);
   return true;
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
   el.querySelectorAll('.obf-cover').forEach(img=>img.addEventListener('error',()=>{
     const g=groups[Number(img.closest('[data-obf-card]')?.dataset.obfCard)];
     if(g?.fallback&&img.dataset.obfFallbackTried!=='1'){
       img.dataset.obfFallbackTried='1';img.src=g.fallback;return;
     }
     img.hidden=true;
     const panel=img.nextElementSibling;if(panel)panel.hidden=false;
   }));
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
       const legacy=groups[action.i].rawCover;
       const before=saved.has(key)||saved.has(legacy);
       if(before){saved.delete(key);saved.delete(legacy)}else saved.add(key);
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
 return {init,render,group,isValid,imageUrl,fullImageUrl,bestFlyerImage,openImage,zoomTarget,imageQuality,prettyDate};
});