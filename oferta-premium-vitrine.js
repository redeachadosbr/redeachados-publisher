'use strict';
/* Oferta Blumenau: realistic product cards from verified API; no mock prices. */
(()=>{
const shapes={
fire:'<path d="M12 22c5 0 8-3 8-8 0-4-3-7-5-9-.2 3-2 5-4 6 1-4-.8-6-3-9C7 7 4 10 4 15c0 4 3 7 8 7Z"/>',
market:'<path d="M3 10h18v11H3zM2 10l2-7h16l2 7M8 21v-6h7v6"/>',
offer:'<path d="M3 3h2l2 12h12l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
flyer:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h5"/>',
compare:'<path d="M12 3v18M3 7h18M7 7l-4 7h8L7 7Zm10 0-4 7h8l-4-7ZM8 21h8"/>',
list:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 13h8M8 18h8"/>',
heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
home:'<path d="m3 11 9-8 9 8v10h-6v-7H9v7H3Z"/>',
coffee:'<path d="M5 8h12v6a6 6 0 0 1-12 0ZM17 10h3a3 3 0 0 1 0 6h-3M4 21h14M10 5V2M14 5V2"/>',
milk:'<path d="M7 21V8l3-5h4l3 5v13H7ZM7 8h10"/>',
leaf:'<path d="M20 4C10 4 4 9 4 16a5 5 0 0 0 5 5c7 0 12-5 11-17ZM4 21c3-5 8-9 13-12"/>',
meat:'<path d="M8 21c-6-3-6-10-2-13 2-2 3-5 7-5 6-1 10 5 8 10-2 6-8 5-11 8H8Z"/><circle cx="15" cy="10" r="2"/>',
bag:'<rect x="5" y="7" width="14" height="14" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
clean:'<rect x="6" y="9" width="12" height="12" rx="2"/><path d="M10 9V4h5v5M8 4h9M7 13h10M9 17h6"/>',
drink:'<path d="M8 3h8l-1 5H9L8 3ZM9 8v13h6V8M8 21h8"/><path d="M11 2h2"/>',
hygiene:'<path d="M7 4h10M10 4v3M14 4v3M8 7h8l2 14H6L8 7ZM9 13h6"/>',
cart:'<path d="M3 3h2l3 12h12l2-9H6"/><circle cx="10" cy="20" r="1"/><circle cx="19" cy="20" r="1"/>',
pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>'

};
const icons={ofertas:'fire',mercados:'market',encartes:'flyer',comparar:'compare',salvos:'heart',fontes:'offer',gestao:'lock'};
const icon=(name,kind)=>'<span aria-hidden="true" class="ob-icon '+(kind||name)+'"><svg viewBox="0 0 24 24">'+(shapes[name]||shapes.offer)+'</svg></span>';
const catDefs=[['Todas','offer'],['Mercearia','bag'],['Hortifruti','leaf'],['Carnes','meat'],['Laticínios','milk'],['Café','coffee'],['Limpeza','clean'],['Bebidas','drink'],['Higiene','hygiene']];
const short={'Fort Atacadista':'Fort','Brasil Atacadista':'Brasil','Unibox Dinardelli':'Unibox'};
let activeCat='Todas',ready=false;
const esc=x=>sanitize(x);
const brl=v=>money(v);
const netList=()=>[...new Set(stores.map(s=>s.rede))];

// O catálogo tem fonte única: somente ofertas aprovadas e vigentes da API/Supabase.
const visibleOffers=()=>{const day=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});return offers.filter(o=>Number(o.price)>0&&(!o.starts_on||o.starts_on<=day)&&(!o.ends_on||o.ends_on>=day));};

const BRANDS={
 'Bistek':{key:'bistek',primary:'#c51e32',secondary:'#ffd228',word:'Bistek', logo:'https://institucional.bistek.com.br/img/icons/facebook.jpg',site:'https://www.bistek.com.br'},
 'Cooper':{key:'cooper',primary:'#007752',secondary:'#cbec4b',word:'Cooper', logo:'https://www.cooper.coop.br/image/logo-cooper.png?a1',site:'https://www.cooper.coop.br'},
 'Fort Atacadista':{key:'fort',primary:'#ed1524',secondary:'#ffdd17',word:'FORT',logo:'https://edge.osuper.com.br/NHpE3t0gKRkjY-Vpbl0H_Vs1KJ8=/600x0/smart/https://osuper-ecommerce-fortatacadista.s3.sa-east-1.amazonaws.com/5e9121b8-fortcompactada400-1.png',site:'https://www.fortatacadista.com.br'},
 'Giassi':{key:'giassi',primary:'#ec771d',secondary:'#153a67',word:'Giassi',logo:'https://institucional.giassi.com.br/favicon.ico',site:'https://institucional.giassi.com.br'},
 'Rede TOP':{key:'top',primary:'#0066ad',secondary:'#ffe500',word:'TOP',logo:'https://www.redetop.com.br/institucional/img/logo-rede-top.jpg',site:'https://www.redetop.com.br'},
 'Komprão':{key:'komprao',primary:'#ea222c',secondary:'#181e27',word:'Komprão',logo:'https://komprao.com.br/wp-content/themes/komprao/assets/imgs/home/LogoKomprao.webp',site:'https://komprao.com.br'},
 'Unibox Dinardelli':{key:'unibox',primary:'#e32936',secondary:'#1360a0',word:'UNIBOX',logo:'https://www.uniboxdinardelli.com.br/wp-content/uploads/2022/11/image-23.png',site:'https://www.uniboxdinardelli.com.br'},
 'Brasil Atacadista':{key:'brasil',primary:'#114cb0',secondary:'#f9d41d',word:'Brasil',logo:'https://brasilatacadista.com.br/wp-content/uploads/2025/12/Colorida-Principal.png',site:'https://brasilatacadista.com.br'}
};
const brandFor=n=>BRANDS[n]||{key:'other',primary:'#0b8667',secondary:'#d7f59b',word:n,logo:'',site:''};
function brandLogo(n,compact=false){
 const b=brandFor(n);
 const word='<span class="ob-logo-text" aria-hidden="true">'+esc(b.word)+'</span>';
 const img=b.logo?'<img src="'+esc(b.logo)+'" alt="Logo '+esc(n)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true">'+word:word;
 return '<span class="ob-logo '+(compact?'compact':'')+'" data-brand="'+esc(b.key)+'">'+img+'</span>';
}
const brandAttr=n=>{const b=brandFor(n);return 'data-brand="'+esc(b.key)+'" style="--shop-color:'+b.primary+';--shop-accent:'+b.secondary+'"';};
const approvedDiscount=o=>{
 const price=Number(o.price), old=Number(o.original_price);
 // An amount is not a verified "de" price until its evidence was reviewed.
 const verified=o.discount_evidence_verified===true||o.previous_price_verified===true;
 if(!verified||!Number.isFinite(price)||!Number.isFinite(old)||old<=price||price<=0)return null;
 const pct=Math.round((old-price)/old*100);
 return pct>=1&&pct<=95?{pct,old}:null;
};
const proofStatus=o=>o.source_type==='fiscal'?'Preço observado em documento fiscal':'Preço conferido no encarte';
const REFERENCE_PRODUCT_IMAGES={
 'Creme Dental Colgate Luminous White|140 g':{url:'https://imgprd.martinsatacado.com.br/catalogoimg/19202/02_19202_03.jpg?v=260420213559%3Bims%3D1000x',source:'Martins Atacado'},
 'Creme Dental Colgate Total|180 g':{url:'https://static.paodeacucar.com/img/uploads/1/467/648467.jpg',source:'Pão de Açúcar'},
 'Queijo Polenghi Cream Cheese Tradicional ou Light|150 g':{url:'https://coopsp.vtexassets.com/arquivos/ids/252320-800-auto?aspect=true&height=auto&v=639071238147330000&width=800',source:'Coop SP'},
 'Requeijão Cremoso Lac Lélo Tradicional ou Light|180 g':{url:'https://bistek.vtexassets.com/arquivos/ids/211219/2170108%20Requeijao%20Cremoso%20Tradicional%20Lac%20Lelo%20Copo%20180g.png?v=639050328104870000',source:'Bistek'},
 'Massa Grano Duro Granoro|500 g':{url:'https://www.rommac.com.br/imagens/produtos/605x605/25469_PASTA_G.DURO_GRANORO_500G_PENNE_RIGATE_1.jpg',source:'Rommac'},
 'Iogurte Vigor|90 g':{url:'https://static.paodeacucar.com/img/uploads/1/868/23724868.jpg',source:'Pão de Açúcar'},
 'Lasanha Congelada Seara Presunto e Queijo ou Bolonhesa|600 g':{url:'https://mercantilatacado.vtexassets.com/arquivos/ids/182656/654a9febc214713490e023f5.jpg?v=638349862228930000',source:'Mercantil Atacado'},
 'Tira-Manchas em Pó Vanish Sachê|1 kg':{url:'https://carrefourbrfood.vtexassets.com/arquivos/ids/215689980/5559430_1.jpg?v=639184189306270000',source:'Carrefour'},
 'Escova Dental Colgate Luminous White Charcoal|2 unidades':{url:'https://cdn.ultrafarma.com.br/static/produtos/832566/large-639062372078740478-832566_9.jpg',source:'Ultrafarma'},
 'Escova Dental Colgate ZigZag Carvão|4 unidades':{url:'https://product-data.raiadrogasil.io/images/19166576.webp',source:'Droga Raia'},
 'Iogurte Tirol Garrafa|830 g':{url:'https://carrefourbrfood.vtexassets.com/arquivos/ids/33471486/6085261_1.jpg?v=637789806144300000',source:'Carrefour'},
 'Pão Pullman Artesano Tradicional|500 g':{url:'https://comper.vteximg.com.br/arquivos/ids/207377-500-500/7896002302197_2.jpg?v=637788254540700000',source:'Comper'},
 'Tira-Manchas em Pó Vanish Refil|400 g':{url:'https://eletroangeloni.vtexassets.com/arquivos/ids/4121510/7891035051272_99_1_1200_72_RGB.png?v=639014055680370000',source:'Angeloni'},
 'Tira-Manchas em Pó Vanish 240g|240 g':{url:'https://bistek.vtexassets.com/arquivos/ids/209998/2048787%20Tira-Manchas%20Po%20Vanish%20Oxi%20Action%20240g.png?v=639026369329600000',source:'Bistek'},
 'Creme Dental Colgate Sensitive Original|110 g':{url:'https://drogariaspacheco.vteximg.com.br/arquivos/ids/1401137-1000-1000/387428---Pasta-de-Dente-Colgate-Sensitive-Pro-Alivio-Original-110g-3.jpg.jpg?v=638793859282200000',source:'Drogarias Pacheco'},
 'Creme Dental Colgate Tripla Ação Menta|180 g':{url:'https://drogal.vtexassets.com/arquivos/ids/245388/126303.jpg?v=638731476050500000',source:'Drogal'},
 'Creme Dental Colgate Tripla Ação X-White|120 g':{url:'https://prezunic.vtexassets.com/arquivos/ids/228822/69ce54bac6bf1e5a4eeead58.jpg?v=639107265931600000',source:'Prezunic'},
 'Café Melitta Tradicional ou Extraforte|500 g':{url:'https://www.redesuperbom.com.br/uploads/produtos/1392_barcelos_cafe-moido_cafe-melitta-500g-tradicional.jpg',source:'Rede Superbom'},
 'Suco Bistek 100% Laranja|900 ml':{url:'https://bistek.vtexassets.com/arquivos/ids/207889-600-600?aspect=true&height=600&v=638945034546430000&width=600',source:'Bistek'},
 'Tomate Pelado Noel|400 g':{url:'https://santaluzia.vtexassets.com/arquivos/ids/991269/3167526.jpg?v=638315081245030000',source:'Casa Santa Luzia'},
 'Lava-Roupas em Pó Omo Todo Ciclo|2 kg':{url:'https://multicanalatacado.agilecdn.com.br/492982.png',source:'Multicanal Atacado'},
 'Iogurte Nestlé Ninho Bandeja|540 g':{url:'https://static.paodeacucar.com/img/uploads/1/827/24599827.jpg',source:'Pão de Açúcar'}
};
function sourceImage(o){
 const img=safeUrl(o.image_url||'');
 if(img!=='#')return {src:img,kind:'product',alt:'Foto verificada de '+o.name};
 const item=REFERENCE_PRODUCT_IMAGES[String(o.name||'')+'|'+String(o.package||'')];
 if(item&&safeUrl(item.url)!=='#')return {src:item.url,kind:'reference',alt:'Imagem ilustrativa da embalagem de '+o.name+' — origem: '+item.source,credit:item.source};
 const proof=safeUrl(o.source_url||'');
 if(proof!=='#'&&/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(proof))return {src:proof,kind:'flyer',alt:'Imagem original do encarte — não é foto individual do produto'};
 return null;
}
const productGlyph=o=>{
 const s=[o.name,o.category].join(' ').toLowerCase();
 if(/café|cafe/.test(s))return '☕';
 if(/iogurte|leite|queijo|requeij|láctea|lactea|pudim/.test(s))return '🥛';
 if(/lasanha|massa|macarrão|arroz|trigo|pão|tomate/.test(s))return '🍝';
 if(/suco|bebida/.test(s))return '🧃';
 if(/creme dental|escova dental|enxaguante|sabonete/.test(s))return '🪥';
 if(/lava-roupas|manchas|omo|vanish/.test(s))return '🧼';
 if(/azeite|óleo/.test(s))return '🫒';
 return '🛍️';
};

function marketSelect(net){
 const input=document.getElementById('filterNetwork');
 if(input){input.value=net;buildFilterStore();drawMarkets();drawOffers();refreshTrustStrip();selectPage('ofertas')}
}
function drawMarkets(){
 const node=document.getElementById('obMarkets');if(!node)return;
 const selected=document.getElementById('filterNetwork')?.value||'';
 const valid=visibleOffers(), names=netList();
 node.innerHTML='<button class="ob-market ob-all-markets '+(!selected?'active':'')+'" type="button" data-ob-market="" aria-pressed="'+(!selected)+'"><span class="ob-market-globe">'+icon('market')+'</span><span class="ob-market-copy"><strong>Todos os mercados</strong><small>'+valid.length+' ofertas cadastradas</small></span></button>'+
 names.map(n=>{
   const total=valid.filter(o=>o.network===n).length;
   const docs=leaflets.filter(x=>x.network===n&&x.valid_now&&/\.(pdf|jpe?g|png|webp)(?:$|[?&#])/i.test(x.asset_url||'')).length;
   const descr=total?total+' preços conferidos':docs?docs+' encartes para conferir':'Sem ofertas verificadas';
   return '<button class="ob-market ob-market-brand '+(selected===n?'active':'')+'" '+brandAttr(n)+' type="button" data-ob-market="'+esc(n)+'" aria-pressed="'+(selected===n)+'">'+brandLogo(n)+
     '<span class="ob-market-copy"><strong>'+esc(n)+'</strong><small>'+esc(descr)+'</small></span><span class="ob-market-enter" aria-hidden="true">›</span></button>';
 }).join('');
}

function matchCategory(o){
 if(activeCat==='Todas')return true;
 const txt=[o.category,o.name,o.brand].join(' ').toLocaleLowerCase('pt-BR');
 const groups={'Café':['café','cafe'],'Laticínios':['leite','queijo','laticínio','iogurte'],'Mercearia':['mercearia','arroz','feijão','farinha','macarrão','óleo','açúcar'],'Hortifruti':['hortifruti','fruta','verdura','legume'],'Carnes':['carne','frango','bovino','pernil','linguiça'],'Limpeza':['limpeza','sabão','detergente','amaciante'],'Bebidas':['bebida','suco','refrigerante','água'],'Higiene':['higiene','sabonete','shampoo']};
 return(groups[activeCat]||[activeCat.toLowerCase()]).some(w=>txt.includes(w));
}
function drawPremiumOffers(){
 const root=document.getElementById('offersGrid');if(!root)return;
 root.classList.add('ob-photo-grid');
 const term=(document.getElementById('searchOffer')?.value||'').toLocaleLowerCase('pt-BR');
 const network=document.getElementById('filterNetwork')?.value||'';
 const sid=document.getElementById('filterStore')?.value||'';
 const eligible=visibleOffers().filter(o=>(!network||o.network===network)&&(!sid||o.store_id===sid)&&
   [o.name,o.brand,o.package,o.network,o.store].join(' ').toLocaleLowerCase('pt-BR').includes(term)&&matchCategory(o))
   .sort((a,b)=>Number(a.price)-Number(b.price));
 // Multiple branches of the SAME chain should not create eight duplicate product photos.
 // Preserve all branch observations behind the selected store filter.
 const unique=new Map();
 const nameKey=x=>String(x||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ');
 for(const o of eligible){
   const key=[o.network,nameKey(o.name),nameKey(o.brand),nameKey(o.package),Number(o.price).toFixed(2)].join('|');
   const prev=unique.get(key);
   if(!prev){unique.set(key,{offer:o,branchIds:new Set([o.store_id])});continue;}
   prev.branchIds.add(o.store_id);
 }
 const found=[...unique.values()];
 const count=document.getElementById('offersCount');
 if(count)count.textContent=found.length+' produto'+(found.length===1?'':'s')+' com oferta verificada'+(found.length===1?'':'s');
 if(!found.length){
   const title=network?'Nenhuma oferta confirmada em '+network:'Sua próxima economia está aqui';
   const info='Não há produtos com preço, filial e vigência conferidos para este filtro. Explore os encartes oficiais; não publicamos valores estimados.';
   root.innerHTML='<div class="ob-empty">'+icon('search')+'<div><h3>'+esc(title)+'</h3><p>'+esc(info)+'</p><button type="button" data-ob-page="encartes">Ver encartes</button><button type="button" data-ob-page="gestao">Conferir fontes</button></div></div>';
   return;
 }
 const listIcon='<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h12M8 12h8M8 18h8"/><path d="m3 6 1.5 1.5L7 5M3 12h3M4.5 10.5v3M3 18h3M4.5 16.5v3"/></svg>';
 const savedKeys=new Set(typeof tracked!=='undefined'&&Array.isArray(tracked)?tracked.map(nameKey):[]);
 root.innerHTML=found.map(({offer:o,branchIds})=>{
   const disc=approvedDiscount(o);
   const source=sourceImage(o);
   const media=source&&['product','reference'].includes(source.kind)?source:null;
   const photo=media?
      '<img class="ob-mini-photo" src="'+esc(media.src)+'" alt="'+esc(media.alt)+'" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">'+
      '<div class="ob-mini-fallback" hidden><span>'+productGlyph(o)+'</span><small>Sem foto do produto</small></div>':
      '<div class="ob-mini-fallback"><span>'+productGlyph(o)+'</span><small>Foto ainda indisponível</small></div>';
   const imageTag=media&&media.kind==='reference'?'<small class="ob-mini-image-credit">Foto ilustrativa</small>':'';
   const pct=disc?'<span class="ob-mini-discount">−'+disc.pct+'%</span>':'';
   const old=disc?'<s>'+brl(disc.old)+'</s>':'';
   const branchHint=branchIds.size>1?branchIds.size+' filiais':esc(o.store||o.district||'Blumenau');
   const sourceUrl=safeUrl(o.source_url||'');
   const proof=sourceUrl!=='#'?'<a href="'+esc(sourceUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="Ver encarte de '+esc(o.name)+'">Fonte ↗</a>':'';
   const added=savedKeys.has(nameKey(o.name));
   const buttonText=added?'Na sua lista':'Adicionar à lista de compras';
   return '<article class="ob-mini-offer" '+brandAttr(o.network)+'>'+
      '<div class="ob-mini-photo-box">'+
        '<span class="ob-mini-brand" aria-label="'+esc(o.network)+'">'+brandLogo(o.network,true)+'</span>'+
        pct+photo+imageTag+
      '</div>'+
      '<div class="ob-mini-content">'+
        '<h3 title="'+esc(o.name)+'">'+esc(o.name)+'</h3>'+
        '<div class="ob-mini-package">'+esc(o.package||'Embalagem não informada')+'</div>'+
        '<div class="ob-mini-market">'+esc(o.network)+' · '+branchHint+'</div>'+
        '<div class="ob-mini-price-row">'+
          '<div class="ob-mini-price-col">'+old+'<strong>'+brl(o.price)+'</strong></div>'+
          '<button class="ob-mini-add '+(added?'is-saved':'')+'" type="button" data-ob-list="'+esc(o.name)+'" data-ob-brand="'+esc(o.brand||'')+'" data-ob-package="'+esc(o.package||'')+'"'+
          ' aria-label="'+esc(buttonText+': '+o.name)+'" title="'+esc(buttonText)+'" aria-pressed="'+(added?'true':'false')+'">'+listIcon+'</button>'+
        '</div>'+
        '<div class="ob-mini-proof"><span>Até '+esc(fmtDate(o.ends_on))+'</span>'+proof+'</div>'+
      '</div>'+
    '</article>';
 }).join('');
}

async function hydrateVerifiedLeaflets(){
 // Resilient: if the authenticated evidence service is unavailable, keep legacy offers unchanged.
 try{
   const response=await fetch('/api/verified-leaflet-offers?limit=400',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)return;
   const result=await response.json();
   if(!result||result.ok!==true||!Array.isArray(result.data))return;
   const day=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
   for(let i=offers.length-1;i>=0;i--){
      if(String(offers[i].id||'').startsWith('ob-v3-evidence-'))offers.splice(i,1);
   }
   const norm=x=>String(x||'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
   for(const ev of result.data.slice(0,400)){
     const store=stores.find(x=>x.id===ev.store_id);
     const price=Number(ev.promotional_price),old=Number(ev.prior_price);
     if(!store||!ev.source_url||!(price>0&&price<100000)||!ev.product_name||
       !ev.valid_from||!ev.valid_until||ev.valid_from>day||ev.valid_until<day)continue;
     const discountOk=Number.isFinite(old)&&old>price&&old<100000;
     const existing=offers.find(x=>x.store_id===ev.store_id&&norm(x.name)===norm(ev.product_name)&&
        Number(x.price)===price&&(!ev.package||norm(x.package)===norm(ev.package)));
     if(existing){
       if(discountOk){
         existing.original_price=old;existing.discount_evidence_verified=true;
       }
       continue;
     }
     const item={
       id:'ob-v3-evidence-'+ev.id,store_id:ev.store_id,network:ev.network||store.rede,
       name:ev.product_name,brand:ev.brand||'',package:ev.package||'',category:'Outros',
       store:store.filial||store.nome||store.bairro||ev.store_id,
       district:store.bairro||'Blumenau',
       price:price,original_price:discountOk?old:null,
       discount_evidence_verified:discountOk,starts_on:ev.valid_from,ends_on:ev.valid_until,
       image_url:ev.image_url||null,source_url:ev.document_url||ev.source_url,
       condition:'Evidência de encarte aprovada e vigente',
       source_type:'leaflet',verified_at:ev.reviewed_at||null,
     };
     offers.push(item);
   }
 }catch(_err){/* Old verified offers must remain usable if provenance is offline. */}
}
function refreshTrustStrip(){
 const root=document.getElementById('obTrustStrip');if(!root)return;
 const visible=visibleOffers();
 const fiscal=Math.max(visible.filter(x=>x.source_type==='fiscal').length,Number(window.obFiscalVerifiedCount||0));
 const promo=visible.filter(x=>x.source_type!=='fiscal').length;
 const dist=visible.filter(x=>approvedDiscount(x)).length;
 root.innerHTML='<div class="ob-trust-stat"><strong>✓ '+promo+' ofertas conferidas</strong><small>Produtos aprovados com fonte original e validade</small></div>'+
 '<div class="ob-trust-stat"><strong>◉ '+fiscal+' preços fiscais</strong><small>Somente observações integradas com origem autorizada</small></div>'+
 '<div class="ob-trust-stat"><strong>−'+dist+' descontos comprovados</strong><small>Percentual visível só com preço anterior verificado</small></div>';
}
window.obRefreshTrustStrip=refreshTrustStrip;
function makeLayout(){
 document.body.classList.add('ob-premium');
 const nav=document.querySelector('.sidebar');
 if(nav){nav.querySelectorAll('.sidebtn[data-tab]').forEach(b=>{const type=icons[b.dataset.tab];if(type)b.innerHTML=icon(type)+(b.dataset.tab==='ofertas'?'Ofertas do dia':b.dataset.tab==='mercados'?'Supermercados':b.dataset.tab==='encartes'?'Encartes':b.dataset.tab==='comparar'?'Comparar preços':b.dataset.tab==='salvos'?'Minha lista':b.dataset.tab==='fontes'?'Fontes oficiais':'Gestão privada')+'<span class="ob-arrow">›</span>';});}
 document.querySelectorAll('.bottomnav [data-tab]').forEach(b=>{const typ=icons[b.dataset.tab];if(typ)b.innerHTML=icon(typ)+'<span>'+esc(b.dataset.tab==='ofertas'?'Ofertas':b.dataset.tab==='mercados'?'Mercados':b.dataset.tab==='encartes'?'Encartes':b.dataset.tab==='comparar'?'Comparar':'Minha lista')+'</span>'});
 const hero=document.querySelector('.hero');if(hero){const h=hero.querySelector('h1');if(h)h.innerHTML='Economize em <em>Blumenau</em><br>todos os dias.';const p=hero.querySelector('p');if(p)p.textContent='Busque promoções por supermercado, compare preços e monte sua lista com valores reais e conferidos.';}
 const search=document.createElement('label');search.className='ob-search';search.innerHTML=icon('search')+'<input type="search" id="obSearch" aria-label="Pesquisar produtos" placeholder="Buscar arroz, leite, café, marcas e mercados...">';
 document.querySelector('.topinner').insertBefore(search,document.querySelector('.headright'));
 search.querySelector('input').addEventListener('input',e=>{document.getElementById('searchOffer').value=e.target.value;selectPage('ofertas');drawOffers()});
 const offersPage=document.querySelector('[data-page="ofertas"]');
 const categories=document.createElement('section');categories.className='ob-section';categories.innerHTML='<div class="ob-label"><h3>Explore por categoria</h3><small>Escolha o que precisa</small></div><div class="ob-categories" id="obCategories"></div>';
 offersPage.prepend(categories);
 const markets=document.createElement('section');markets.className='ob-section';markets.innerHTML='<div class="ob-label"><h3>Ofertas por supermercado</h3><small>Filtre sua rede favorita</small></div><div id="obMarkets" class="ob-markets"></div>';
 categories.after(markets);
 const trust=document.createElement('section');
 trust.className='ob-section';
 trust.innerHTML='<div class="ob-label"><h3>Informação que você pode conferir</h3><small>Preços sem simulação</small></div>'+
 '<div id="obTrustStrip" class="ob-trust-strip" aria-live="polite"></div>'+
 '<div class="ob-evidence-legend"><span>✓ Encarte verificado</span><span>◉ Preço fiscal observado</span><span>％ Desconto com comparação comprovada</span></div>'+
 '<small class="ob-trust-note">Preço observado não significa promoção. Percentuais de desconto só aparecem após comprovação da base de comparação.</small>';
 markets.after(trust);
 const tiles=document.createElement('section');tiles.className='ob-foottiles';tiles.innerHTML='<button data-ob-page="comparar">'+icon('compare')+'<span>Comparar preços<small>Veja opções válidas para cada produto</small></span></button><button data-ob-page="encartes">'+icon('flyer')+'<span>Encartes da semana<small>Confira campanhas e folhetos oficiais</small></span></button><button data-ob-page="salvos">'+icon('list')+'<span>Minha lista<small>Salve os produtos que deseja comprar</small></span></button>';
 offersPage.after(tiles);
 drawCategories();
 document.addEventListener('click',e=>{
 const market=e.target.closest('[data-ob-market]');if(market){marketSelect(market.dataset.obMarket);return;}
 const cat=e.target.closest('[data-ob-cat]');if(cat){activeCat=cat.dataset.obCat;drawCategories();drawOffers();selectPage('ofertas');return;}
 const p=e.target.closest('[data-ob-page]');if(p){selectPage(p.dataset.obPage);return;}
 const li=e.target.closest('[data-ob-list]');if(li){
   const field=document.getElementById('trackedName');
   if(!field)return;
   const wasSaved=typeof tracked!=='undefined'&&Array.isArray(tracked)&&
     tracked.some(x=>String(x).toLocaleLowerCase('pt-BR')===String(li.dataset.obList).toLocaleLowerCase('pt-BR'));
   field.value=li.dataset.obList;
   addTracked();
   if(!wasSaved){
     li.classList.add('is-saved');
     li.setAttribute('aria-pressed','true');
     li.setAttribute('aria-label','Produto adicionado à lista: '+li.dataset.obList);
     li.title='Produto na lista';
   }
   drawOffers();
   return;
 }
 const cp=e.target.closest('[data-ob-compare]');if(cp){selectPage('comparar');document.getElementById('compareTerm').value=cp.dataset.obCompare;compare();}
 });
}
function drawCategories(){
 const root=document.getElementById('obCategories');if(!root)return;
 root.innerHTML=catDefs.map(([cat,ico])=>'<button type="button" class="ob-cat '+(cat===activeCat?'active':'')+'" data-ob-cat="'+esc(cat)+'" aria-pressed="'+(cat===activeCat)+'">'+icon(ico)+'<span>'+esc(cat)+'</span></button>').join('');
}
window.OBPremiumPublic={brandLogo,brandAttr,icon,sourceImage};
function init(){
 if(ready)return;ready=true;
 makeLayout();
 drawOffers=drawPremiumOffers;
 const origRefresh=refreshAll;
 refreshAll=async function(){await origRefresh();await hydrateVerifiedLeaflets();drawMarkets();drawCategories();refreshTrustStrip();drawOffers()};
 document.getElementById('refreshOffers').onclick=refreshAll;
 document.getElementById('searchOffer').oninput=()=>{const top=document.getElementById('obSearch');if(top)top.value=document.getElementById('searchOffer').value;drawOffers();};
 document.getElementById('filterNetwork').onchange=()=>{buildFilterStore();drawMarkets();drawOffers()};
 document.getElementById('filterStore').onchange=drawOffers;
 drawMarkets();drawOffers();refreshTrustStrip();refreshAll();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();