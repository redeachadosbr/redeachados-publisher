'use strict';
/* Oferta Blumenau V4: offers by category, cross-chain price comparison, and list-first shopping.
 * No extra browser permissions, no synthetic products, no background notifications.
 * The existing localStorage shopping list is the sole list of record.
 */
(()=>{
const Engine=window.OBCompareEngine;
if(!Engine)return;
const $=id=>document.getElementById(id);
const escape=s=>typeof sanitize==='function'?sanitize(String(s??'')):
 String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
const TRUST_META='oferta-blumenau-watch-intents-v4';
const WATCH_SNAP='oferta-blumenau-watch-last-price-v4';
const category=()=>document.querySelector('#obCategories .ob-cat.active')?.dataset.obCat||'Todas';
const inventory=()=>Engine.verifiedActive(typeof offers==='undefined'?[]:offers);
const networkCount=()=>new Set((typeof stores==='undefined'?[]:stores).map(s=>s.rede)).size;
const observedChains=()=>new Set(inventory().map(o=>o.network)).size;
const cssBrand=n=>{const root=window.OBPremiumPublic;return root?.brandAttr?root.brandAttr(n):'';};
const brand=n=>{const root=window.OBPremiumPublic;return root?.brandLogo?root.brandLogo(n,true):'<span class="ob-best-network-fallback">🏬 '+escape(n)+'</span>';};
const pict=o=>{
 const root=window.OBPremiumPublic;
 if(root?.sourceImage){
   const found=root.sourceImage(o);
   if(found?.src)return '<img alt="'+escape(found.alt||o.name)+'" src="'+escape(found.src)+'" loading="lazy" decoding="async" onerror="this.style.display=\'none\'"/>';
 }
 return '<span class="ob-best-emoji">🛍️</span>';
};
let mode='exact',freshSince=0;
function readObject(key){try{const x=JSON.parse(localStorage.getItem(key)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return {}}}
function writeObject(key,data){try{localStorage.setItem(key,JSON.stringify(data))}catch(_e){}}
function intents(){return readObject(TRUST_META)}
function rememberTerm(term,details){
 if(!term||!details?.brand&&!details?.package)return;
 const all=intents();all[Engine.norm(term)]={brand:details.brand||'',package:details.package||''};
 writeObject(TRUST_META,all);
}
function forgetTerm(term){
 const all=intents();delete all[Engine.norm(term)];writeObject(TRUST_META,all);
}
function sourceLink(o){
 const url=String(o.source_url||'');
 try{const parsed=new URL(url);if(parsed.protocol!=='https:')return '';return '<a href="'+escape(url)+'" rel="noopener noreferrer" target="_blank">Fonte ↗</a>'}
 catch{return ''}
}
function pageInit(){
 const page=document.querySelector('[data-page="ofertas"]');
 if(!page||$('obBestPrices'))return;
 const section=document.createElement('section');section.id='obBestPrices';section.className='ob-section ob-smart-compare';
 section.innerHTML='<div class="ob-label"><h3>🏆 Melhores preços entre mercados</h3><small>Comparação responsável</small></div>'+
 '<p class="ob-smart-text">Comparamos o mesmo produto e a mesma embalagem. Quando a embalagem muda, indicamos o preço por kg ou litro. Não chamamos produtos diferentes de equivalentes.</p>'+
 '<div class="ob-smart-controls"><button class="ob-smart-opt active" data-ob-smart-mode="exact" aria-pressed="true">Mesma embalagem</button>'+
 '<button class="ob-smart-opt" data-ob-smart-mode="unit" aria-pressed="false">Por kg / litro</button>'+
 '<button class="ob-smart-opt" data-ob-smart-refresh>Atualizar preços</button></div>'+
 '<div class="ob-smart-insight" id="obSmartInsight" aria-live="polite">Verificando preços publicados...</div>'+
 '<div id="obBestCompare" class="ob-smart-grid"></div>';
 // Keep the shopping products first. Detailed price rankings belong below the product grid.
 page.append(section);
 const savedPage=document.querySelector('[data-page="salvos"]');
 if(savedPage){
  const listPanel=document.createElement('section');listPanel.className='ob-section ob-smart-basket';listPanel.id='obSmartBasket';
  listPanel.innerHTML='<div class="ob-label"><h3>🧠 Buscador da sua lista</h3><small>Reanalisa a cada atualização</small></div>'+
    '<p class="ob-smart-text">Os itens salvos são pesquisados nas promoções verificadas. Só indicamos economia entre redes se a marca e a embalagem forem equivalentes.</p>'+
    '<div id="obSmartBasketSummary" class="ob-smart-insight" aria-live="polite"></div>'+
    '<button class="ob-smart-refresh-list" type="button" data-ob-smart-refresh>Pesquisar ofertas da lista agora</button>';
  savedPage.prepend(listPanel);
 }
 const comparePage=document.querySelector('[data-page="comparar"]');
 if(comparePage){
  const info=document.createElement('aside');info.id='obSmartCompareHelp';info.className='ob-smart-insight';
  info.textContent='Resultados agrupados por produto, marca e embalagem. A melhor oferta entre redes só será destacada quando houver dois supermercados diferentes com valores comprovados.';
  const target=$('compareResults');if(target)target.before(info);
 }
 section.addEventListener('click',e=>{
  const b=e.target.closest('[data-ob-smart-mode]');
  if(b){
   mode=b.dataset.obSmartMode==='unit'?'unit':'exact';
   section.querySelectorAll('[data-ob-smart-mode]').forEach(x=>{
    const on=x.dataset.obSmartMode===mode;
    x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on));
   });
   leaders();
  }
 });
 document.addEventListener('click',e=>{
  const source=e.target.closest('[data-ob-list]');
  if(source){
   const term=source.dataset.obList||'';
   rememberTerm(term,{brand:source.dataset.obBrand||'',package:source.dataset.obPackage||''});
  }
  const removal=e.target.closest('[data-untrack]');
  if(removal){
   const idx=Number(removal.dataset.untrack);
   if(typeof tracked!=='undefined'&&Number.isInteger(idx)&&tracked[idx])forgetTerm(tracked[idx]);
  }
 },true);
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-ob-cat]')||e.target.closest('[data-ob-market]')){
   requestAnimationFrame(()=>{leaders();basketSummary();});
  }
  if(e.target.closest('[data-ob-smart-refresh]')){
   e.preventDefault();smartRefresh();
  }
 });
 $('filterNetwork')?.addEventListener('change',()=>{leaders();basketSummary()});
 $('filterStore')?.addEventListener('change',()=>leaders());
}
function insight(){
 const root=$('obSmartInsight');if(!root)return;
 const n=networkCount(),active=observedChains();
 const list=Engine.groups(inventory(),{day:Engine.dateNow(),category:category()==='Todas'?null:category(),mode});
 const competitive=list.filter(g=>g.competing).length;
 root.innerHTML='<strong>'+active+' de '+n+' redes com preços comprovados</strong><span> · '+list.length+
   ' produtos com embalagem identificada · '+competitive+' com concorrência entre redes'+
   (category()!=='Todas'?' · categoria: <b>'+escape(category())+'</b>':'')+
   '</span><small>Os mercados sem ofertas verificadas não entram no ranking. Preço fiscal observado não é apresentado como promoção.</small>';
}
function rankCard(group){
 const first=group.first.offer,second=group.second?.offer;
 const rank=group.ranks;
 const label=group.competing?(group.marketSavingPercent!=null?
   'Menor preço entre '+group.networkCount+' redes':'Mesmo preço entre redes'):
    'Preço encontrado em 1 rede';
 const saving=group.marketSavingPercent!=null?
    '<span class="ob-smart-saving">Economia de '+brl(group.marketSavingAmount)+
    (group.mode==='unit'?'/'+escape(group.kind):'')+
    ' frente à 2ª rede</span>':'';
 const primary=group.mode==='unit'?brl(group.first.metric)+'/'+escape(group.kind):brl(first.price);
 const packageTag=escape(first.package||'Apresentação não informada');
 const next=second?
  '<div class="ob-smart-next">Outra rede: '+escape(second.network)+' · '+
     (group.mode==='unit'?brl(group.second.metric)+'/'+escape(group.kind):brl(second.price))+'</div>':
  '<div class="ob-smart-next">Sem concorrente confirmado para esta referência.</div>';
 return '<article class="ob-smart-card" '+cssBrand(first.network)+'>'+
 '<div class="ob-smart-topline">'+brand(first.network)+'<span>'+escape(first.network)+'</span>'+
 (group.competing?'<span class="ob-smart-win">Comparado</span>':'<span class="ob-smart-uncompared">Sem comparação</span>')+'</div>'+
 '<div class="ob-smart-product">'+pict(first)+'<div><b>'+escape(first.name)+'</b><small>'+escape(first.brand||'Marca não informada')+
 ' · '+packageTag+'</small></div></div>'+
 '<div class="ob-smart-badge">'+escape(label)+'</div>'+
 '<div class="ob-smart-pricerow"><strong>'+primary+'</strong><span>'+escape(first.store||first.district||'Blumenau')+'</span></div>'+
 saving+next+'<div class="ob-smart-foot"><span>📅 Até '+escape(first.ends_on)+'</span>'+
 sourceLink(first)+'</div></article>';
}
function leaders(){
 const root=$('obBestCompare');if(!root)return;
 insight();
 const chosen=category(),cat=chosen==='Todas'?null:chosen;
 const all=Engine.groups(inventory(),{day:Engine.dateNow(),category:cat,mode});
 if(!all.length){
  root.innerHTML='<div class="ob-smart-empty">Ainda não há produtos com embalagem e preços comprovados para esta categoria. Não publicamos classificações fictícias.</div>';
  return;
 }
 const multi=all.filter(x=>x.competing);
 const chosenGroups=multi.length?multi.slice(0,8):all.slice(0,8);
 const message=multi.length?
  '<div class="ob-smart-disclaimer">Melhores preços entre redes disponíveis, do mesmo produto. A economia é calculada contra o segundo menor preço comprovado, não contra um preço de tabela.</div>':
  '<div class="ob-smart-disclaimer">Ainda não há o mesmo produto comprovado em duas redes distintas nesta categoria. Exibimos ofertas individuais para consulta, sem declarar vencedores ou descontos inexistentes.</div>';
 root.innerHTML=message+chosenGroups.map(rankCard).join('');
}
function compareSmart(){
 const q=($('compareTerm')?.value||'').trim();
 const target=$('compareResults');if(!target)return;
 if(q.length<2){target.innerHTML='<div class="ob-smart-empty">Digite um produto, marca ou categoria para consultar os preços publicados.</div>';return;}
 const inv=inventory();
 const wanted=Engine.matchSaved(q,inv,Engine.dateNow());
 if(!wanted.valid.length){
  target.innerHTML='<div class="ob-smart-empty">Não há promoção comprovada para '+escape(q)+
    '. Sua pesquisa será verificada novamente sempre que o catálogo for atualizado.</div>';return;
 }
 const groups=Engine.groups(wanted.valid,{day:Engine.dateNow(),mode:'exact'}).slice(0,35);
 const win=groups.filter(g=>g.competing).length;
 target.innerHTML='<div class="ob-smart-disclaimer">'+wanted.valid.length+' registros encontrados · '+
   wanted.networkCount+' redes diferentes · '+groups.length+' combinações de produto/embalagem · '+
   win+' comparações entre redes. Outros tamanhos, marcas e sabores aparecem separados.</div>'+
 groups.map(g=>{
  const first=g.first.offer;
  return '<section class="ob-smart-comparison-group"><h4>'+escape(first.name)+' · '+escape(first.package||'')+
    '</h4><p>'+escape(first.brand||'Marca não informada')+' · '+(g.competing?
    'Comparação entre '+g.networkCount+' redes':'Apenas uma rede com preço confirmado')+'</p>'+
   (g.marketSavingAmount!=null?'<div class="ob-smart-saving">Menor preço: '+brl(g.first.metric)+
     ' · '+brl(g.marketSavingAmount)+' abaixo da segunda rede</div>':'')+
   g.ranks.map((row,i)=>'<div class="ob-smart-compare-row" '+cssBrand(row.offer.network)+'>'+
     '<div>'+brand(row.offer.network)+'<span><b>'+escape(row.offer.network)+'</b><small>'+
     escape(row.offer.store||row.offer.district||'Blumenau')+'</small></span></div>'+
     '<strong>'+brl(row.offer.price)+'</strong>'+
     (i===0&&g.competing?'<em>Menor preço</em>':'')+sourceLink(row.offer)+'</div>').join('')+
   '</section>';
 }).join('');
}
function miniOffer(o,comp=null){
 const label=comp&&comp.savingAmount>0?'<span class="ob-smart-saving">−'+
  brl(comp.savingAmount)+' vs próxima rede</span>':'';
 return '<div class="ob-watch-quote" '+cssBrand(o.network)+'>'+
   brand(o.network)+'<div><b>'+escape(o.network)+'</b><small>'+escape(o.store||o.district||'Blumenau')+
   ' · '+escape(o.package||'Embalagem a confirmar')+'</small></div><strong>'+brl(o.price)+'</strong>'+
   sourceLink(o)+label+'</div>';
}
function watchHtml(term,intent,offers){
 const r=Engine.matchSaved(term,offers,Engine.dateNow(),intent||{});
 const index=tracked.indexOf(term);
 if(!r.best){
  return '<article class="ob-watch-card missing"><div class="ob-watch-heading"><strong>♡ '+
  escape(term)+'</strong><button type="button" data-untrack="'+index+
  '" aria-label="Remover '+escape(term)+'">Remover</button></div>'+
  '<p>Sem oferta comprovada agora. A pesquisa será refeita quando os preços forem atualizados.</p></article>';
 }
 const badge=r.ambiguous?'Opções diferentes — confira marca e embalagem':
    r.networkCount>1?'Mesmo produto em '+r.networkCount+' redes':'Produto em uma rede';
 const win=r.competition?.savingAmount>0?' · '+brl(r.competition.savingAmount)+' abaixo da outra rede':'';
 return '<article class="ob-watch-card"><div class="ob-watch-heading"><strong>♡ '+escape(term)+
  '</strong><button type="button" data-untrack="'+index+'" aria-label="Remover '+
   escape(term)+'">Remover</button></div><p>'+escape(badge)+escape(win)+'</p>'+
   '<div class="ob-watch-found">'+r.options.slice(0,3).map((o,i)=>miniOffer(o,i===0?r.competition:null)).join('')+'</div>'+
   (r.ambiguous?'<small>Pesquisa por palavra-chave: resultados podem ser embalagens ou variedades diferentes. Não calculamos descontos entre esses itens.</small>':
    '<small>Preço válido conforme a fonte indicada. Confira condições da loja.</small>')+
 '</article>';
}
function basketSummary(){
 const target=$('obSmartBasketSummary');if(!target)return;
 if(typeof tracked==='undefined'||!tracked.length){target.textContent='Adicione produtos à sua lista para buscar as ofertas automaticamente.';return;}
 const result=Engine.optimizeBasket(tracked,inventory(),Engine.dateNow(),intents());
 const matches=result.available.length,missing=result.missing.length;
 let message='<strong>🔎 '+matches+' de '+tracked.length+' itens encontrados</strong> em ofertas com fonte e validade conferidas.';
 if(missing)message+=' <span>'+missing+' item(ns) sem preço verificado.</span>';
 if(result.ambiguous.length)message+=' <span>'+result.ambiguous.length+
 ' busca(s) com opções diferentes: confirme marca e embalagem antes de somar.</span>';
 if(result.comparable){
  message+='<span>Total do menor preço por item: <b>'+brl(result.splitTotal)+
   '</b> (pode exigir compras em mais de uma rede; sem frete/deslocamento).</span>';
  if(result.bestSingleNetwork){
   message+='<span>Rede que atende toda a lista com os menores preços cadastrados: <b>'+
    escape(result.bestSingleNetwork.network)+'</b> · '+brl(result.bestSingleNetwork.total)+'</span>';
  }else{message+='<span>Nenhuma rede tem todos os itens verificados. Considere dividir a compra entre mercados.</span>';}
 }else{message+='<small>Não mostramos total de compras enquanto faltarem itens ou houver produtos diferentes na mesma pesquisa.</small>';}
 message+='<small>Cobertura: '+observedChains()+' de '+networkCount()+
   ' redes com ofertas verificadas; os mercados ainda não integrados não foram comparados.</small>';
 target.innerHTML=message;
}
function drawWatch(){
 const area=$('trackedList');if(!area)return;
 if(typeof tracked==='undefined'||!tracked.length){
  area.innerHTML='<div class="ob-smart-empty">Sua lista ainda está vazia. Salve um produto na vitrine ou digite o nome aqui.</div>';
  basketSummary();return;
 }
 const inv=inventory(),meta=intents();
 area.innerHTML=tracked.slice(0,50).map(term=>watchHtml(term,meta[Engine.norm(term)]||{},inv)).join('');
 basketSummary();
}
function snapAlerts(){
 const past=readObject(WATCH_SNAP),next={};let drops=0;
 if(typeof tracked==='undefined')return;
 for(const term of tracked){
  const meta=intents()[Engine.norm(term)]||{};
  const r=Engine.matchSaved(term,inventory(),Engine.dateNow(),meta);
  if(!r.best||r.ambiguous||!r.exactProduct)continue;
  const ident=Engine.productIdentity(r.best);
  if(!ident)continue;
  const key=Engine.norm(term),prior=past[key],price=Number(r.best.price);
  if(prior&&prior.key===ident.exact&&price<prior.price-.005)drops++;
  next[key]={key:ident.exact,price,network:r.best.network,at:new Date().toISOString()};
 }
 writeObject(WATCH_SNAP,next);
 const badge=$('obPriceDropAlert');
 if(badge){badge.textContent=drops?drops+' favorito(s) com preço menor desde a consulta anterior':'';
  badge.hidden=!drops;}
}
function update(){
 if(!Array.isArray(offers)||!Array.isArray(stores))return;
 leaders();drawWatch();if($('compareTerm')?.value.trim())compareSmart();
 freshSince=Date.now();
}
async function smartRefresh(){
 const btn=document.querySelector('[data-ob-smart-refresh]');
 if(btn){btn.disabled=true;btn.textContent='Consultando...';}
 try{await refreshAll();}
 finally{if(btn){btn.disabled=false;btn.textContent='Atualizar preços';}}
}
function init(){
 pageInit();
 if(typeof drawTracked!=='undefined')drawTracked=drawWatch;
 if(typeof compare!=='undefined')compare=compareSmart;
 const existing=refreshAll;
 if(typeof existing==='function')refreshAll=async function(){
   await existing();
   update();snapAlerts();
 };
 const compareButton=$('compareBtn');if(compareButton)compareButton.onclick=compareSmart;
 const compareTerm=$('compareTerm');if(compareTerm)compareTerm.onkeydown=e=>{if(e.key==='Enter')compareSmart()};
 update();
 // On mobile resume, recheck only if >15 minutes; never assert background push notifications.
 document.addEventListener('visibilitychange',()=>{
   if(!document.hidden&&Date.now()-freshSince>15*60*1000)smartRefresh();
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
