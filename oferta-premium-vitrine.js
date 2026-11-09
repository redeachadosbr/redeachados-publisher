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
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icons={ofertas:'fire',mercados:'market',encartes:'flyer',comparar:'compare',salvos:'list',fontes:'offer',gestao:'lock'};
const icon=(name,kind)=>'<span aria-hidden="true" class="ob-icon '+(kind||name)+'"><svg viewBox="0 0 24 24">'+(shapes[name]||shapes.offer)+'</svg></span>';
const catDefs=[['Todas','offer'],['Mercearia','bag'],['Hortifruti','leaf'],['Carnes','meat'],['Laticínios','milk'],['Café','coffee'],['Limpeza','bag'],['Bebidas','bag'],['Higiene','heart']];
const short={'Fort Atacadista':'Fort','Brasil Atacadista':'Brasil','Unibox Dinardelli':'Unibox'};
let activeCat='Todas',ready=false;
const esc=x=>sanitize(x);
const brl=v=>money(v);
const netList=()=>[...new Set(stores.map(s=>s.rede))];

// O catálogo tem fonte única: somente ofertas aprovadas e vigentes da API/Supabase.
const visibleOffers=()=>offers.filter(o=>!o.ends_on||o.ends_on>=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'}));
function marketSelect(net){
 const input=document.getElementById('filterNetwork');
 if(input){input.value=net;buildFilterStore();drawMarkets();drawOffers();selectPage('ofertas')}
}
function drawMarkets(){
 const node=document.getElementById('obMarkets');if(!node)return;
 const current=document.getElementById('filterNetwork')?.value||'';
 node.innerHTML='<button class="ob-market '+(!current?'active':'')+'" data-ob-market=""><span>'+icon('offer')+'</span><span><strong>Todos os mercados</strong><small>'+visibleOffers().length+' preços conferidos</small></span></button>'+
 netList().map(n=>{
 const num=visibleOffers().filter(o=>o.network===n).length;
 const fly=leaflets.filter(x=>x.network===n && x.valid_now && /\.(pdf|jpg|jpeg|png|webp)(?:$|[?&#])/i.test(x.asset_url||'')).length;
 return '<button class="ob-market '+(current===n?'active':'')+'" data-ob-market="'+esc(n)+'">'+icon('market')+'<span><strong>'+esc(short[n]||n)+'</strong><small>'+num+' preços · '+fly+' encartes</small></span></button>'
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
 const term=document.getElementById('searchOffer').value.toLocaleLowerCase('pt-BR');
 const net=document.getElementById('filterNetwork').value;
 const store=document.getElementById('filterStore').value;
 const found=visibleOffers().filter(o=>(!net||o.network===net)&&(!store||o.store_id===store)&&[o.name,o.brand,o.package,o.network,o.store].join(' ').toLocaleLowerCase('pt-BR').includes(term)&&matchCategory(o)).sort((a,b)=>a.price-b.price);
 document.getElementById('offersCount').textContent=found.length+' oferta'+(found.length===1?'':'s')+' verificada'+(found.length===1?'':'s');
 if(!found.length){
 const title=net?'Sem preços verificados no '+net:'Buscando promoções reais por supermercado';
 const info=net?'Ainda não há produtos com preço, embalagem, filial e validade confirmados nesta rede. Consulte os encartes oficiais.':'As redes estão cadastradas. A publicação de produtos depende da conferência dos valores dos encartes; nenhum preço estimado é exibido.';
 root.innerHTML='<div class="ob-empty">'+icon('search')+'<div><h3>'+esc(title)+'</h3><p>'+esc(info)+'</p><button type="button" data-ob-page="encartes">Ver encartes</button><button type="button" data-ob-page="gestao">Cadastrar preço conferido</button></div></div>';
 return;
 }
 root.innerHTML=found.map(o=>{
 const url=safeUrl(o.image_url||''),photo=url!=='#'?'<img loading="lazy" src="'+esc(url)+'" alt="'+esc(o.name)+'" onerror="this.remove()">':icon('bag');
 const old=Number(o.original_price)>Number(o.price)?'<span class="ob-old">'+brl(o.original_price)+'</span>':'';
 const cond=o.condition||'Preço geral';
 return '<article class="ob-product"><div class="ob-photo"><span class="ob-verified">✓ Preço conferido</span>'+photo+'</div><div class="ob-body"><span class="ob-store">'+esc(o.network)+' · '+esc(o.store)+'</span><h3>'+esc(o.name)+'</h3><div class="ob-detail">'+esc(o.brand||'Marca não informada')+' · '+esc(o.package)+'</div><div class="ob-price">'+brl(o.price)+old+'</div><div class="ob-unit">'+(o.unit_price?brl(o.unit_price)+' / '+esc(o.unit_kind):'Preço por unidade não disponível')+'</div><div class="ob-terms">'+esc(cond)+'</div></div><div class="ob-meta"><span>📍 '+esc(o.district||'Blumenau')+'</span><span>📅 Até '+fmtDate(o.ends_on)+'</span><a href="'+esc(safeUrl(o.source_url))+'" target="_blank" rel="noopener noreferrer">Conferir fonte original ↗</a></div><div class="ob-actions"><button class="primary" type="button" data-ob-list="'+esc(o.name)+'">+ Lista</button><button class="second" type="button" data-ob-compare="'+esc(o.name)+'">⚖ Comparar</button></div></article>'
 }).join('');
}
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
 const tiles=document.createElement('section');tiles.className='ob-foottiles';tiles.innerHTML='<button data-ob-page="comparar">'+icon('compare')+'<span>Comparar preços<small>Veja opções válidas para cada produto</small></span></button><button data-ob-page="encartes">'+icon('flyer')+'<span>Encartes da semana<small>Confira campanhas e folhetos oficiais</small></span></button><button data-ob-page="salvos">'+icon('list')+'<span>Minha lista<small>Salve os produtos que deseja comprar</small></span></button>';
 offersPage.after(tiles);
 drawCategories();
 document.addEventListener('click',e=>{
 const market=e.target.closest('[data-ob-market]');if(market){marketSelect(market.dataset.obMarket);return;}
 const cat=e.target.closest('[data-ob-cat]');if(cat){activeCat=cat.dataset.obCat;drawCategories();drawOffers();selectPage('ofertas');return;}
 const p=e.target.closest('[data-ob-page]');if(p){selectPage(p.dataset.obPage);return;}
 const li=e.target.closest('[data-ob-list]');if(li){document.getElementById('trackedName').value=li.dataset.obList;addTracked();return;}
 const cp=e.target.closest('[data-ob-compare]');if(cp){selectPage('comparar');document.getElementById('compareTerm').value=cp.dataset.obCompare;compare();}
 });
}
function drawCategories(){
 const root=document.getElementById('obCategories');if(!root)return;
 root.innerHTML=catDefs.map(([cat,ico])=>'<button type="button" class="ob-cat '+(cat===activeCat?'active':'')+'" data-ob-cat="'+esc(cat)+'" aria-pressed="'+(cat===activeCat)+'">'+icon(ico)+'<span>'+esc(cat)+'</span></button>').join('');
}
function init(){
 if(ready)return;ready=true;
 makeLayout();
 drawOffers=drawPremiumOffers;
 const origRefresh=refreshAll;
 refreshAll=async function(){await origRefresh();drawMarkets();drawCategories()};
 document.getElementById('refreshOffers').onclick=refreshAll;
 document.getElementById('searchOffer').oninput=()=>{const top=document.getElementById('obSearch');if(top)top.value=document.getElementById('searchOffer').value;drawOffers();};
 document.getElementById('filterNetwork').onchange=()=>{buildFilterStore();drawMarkets();drawOffers()};
 document.getElementById('filterStore').onchange=drawOffers;
 drawMarkets();drawOffers();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();