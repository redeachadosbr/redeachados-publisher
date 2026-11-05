// Curvas A/B — pesquisa explícita e somente leitura. Nunca cria campanhas.
(function(){
 'use strict';
 const q=id=>document.getElementById(id);
 const state={busy:false,last:null};
 const nf=new Intl.NumberFormat('pt-BR');
 const money=value=>value===null||value===undefined?'—':
  new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));
 const t=(tag,className,content)=>{
  const e=document.createElement(tag);
  if(className)e.className=className;
  if(content!==undefined)e.textContent=String(content);
  return e;
 };
 const status=(message,kind='info')=>{
  const el=q('curveNotice');if(!el)return;
  el.textContent=message;
  el.className='curve-notice'+(kind==='error'?' is-error':kind==='warning'?' is-warning':'');
 };
 const metric=(label,value)=>{
  const wrap=t('div',''),small=t('span','',label),strong=t('b','',value);
  wrap.append(small,strong);return wrap;
 };

 function appendCopy(parent,value,label){
  const button=t('button','',label);button.type='button';
  button.addEventListener('click',async()=>{
   try{
    await navigator.clipboard.writeText(String(value||''));
    button.textContent='✓ Copiado';
    status('Texto copiado. Revise antes de publicar na Shopee.');
   }catch(e){status('Não foi possível copiar automaticamente: selecione o texto e copie manualmente.','warning');}
  });
  parent.append(button);return button;
 }
 function appendSEO(main,row){
  const section=t('section','curve-seo');
  section.append(t('h5','','Palavras-chave e título sugerido para Shopee'));
  section.append(t('p','curve-seo-subtitle',
   'Até 5 termos recorrentes na amostra de títulos concorrentes. Não são volumes oficiais de busca.'));
  const list=t('div','curve-keyword-list');
  for(const item of row.keywords||[]){
   const pill=t('a','curve-keyword-pill',item.term);
   if(item.searchUrl&&item.searchUrl.startsWith('https://shopee.com.br/search?')){
    pill.href=item.searchUrl;pill.target='_blank';pill.rel='noopener noreferrer';
    pill.title=item.mentions>0?
     'Termo encontrado em '+item.mentions+' anúncio(s) da amostra. Conferir Em Destaque.':
     'Termo WeDrop sem evidência de demanda. Conferir Em Destaque.';
   }else pill.removeAttribute('href');
   const count=t('small','',item.mentions>0?item.mentions+' anúncio(s)':'WeDrop');
   const box=t('span','curve-keyword-tag');
   box.append(pill,count);list.append(box);
  }
  if(!row.keywords?.length)list.append(t('span','curve-seo-subtitle',
   'Sem expressões verificáveis nesta amostra.'));
  section.append(list);
  const titleRow=t('div','curve-seo-title');
  const title=t('p','',row.seoTitle||'Não há dados suficientes para criar título.');
  const label=t('small','','Título SEO sugerido • conferir dados técnicos • '+
   [...String(row.seoTitle||'')].length+'/120 caracteres');
  titleRow.append(label,title);
  if(row.seoTitle)appendCopy(titleRow,row.seoTitle,'Copiar título SEO');
  section.append(titleRow);
  main.append(section);
 }
 function appendPrices(main,row){
  const details=t('details','curve-competitors');
  const count=Number(row.competitorOfferCount||0);
  details.append(t('summary','','Ver anúncios usados para comparar os preços ('+count+')'));
  details.append(t('p','curve-evidence',row.priceEvidence||'Média indisponível.'));
  const list=t('ol','curve-offers-list');
  for(const offer of row.competitorOffers||[]){
   const li=t('li','');
   const a=t('a','',offer.title+' — '+money(offer.price));
   if(/^https:\/\/shopee\.com\.br\/product\/\d+\/\d+$/.test(offer.url||'')){
    a.href=offer.url;a.target='_blank';a.rel='noopener noreferrer';
   }
   li.append(a);list.append(li);
  }
  details.append(list);main.append(details);
 }
 let categoryLoaded=false,categoryBusy=false;
 async function loadCategories(){
  if(categoryLoaded||categoryBusy||!q('curveCategory'))return;
  categoryBusy=true;
  try{
   const response=await fetch('/api/shopee/kits/catalog?category=Todos&limit=1',{
    credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(35000)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!Array.isArray(data.categories))throw Error(data.error||'Falha na consulta de categorias');
   const select=q('curveCategory'),keep=select.value;
   select.replaceChildren();
   for(const category of data.categories){
    const op=t('option','',category==='Todos'?'Todas as categorias':category);
    op.value=category;select.append(op);
   }
   if(data.categories.includes(keep))select.value=keep;
   categoryLoaded=true;refreshFeaturedLink();
  }catch(error){
   status('Não foi possível recuperar categorias WeDrop: '+String(error.message||error)+
    '. A pesquisa geral continua disponível.','warning');
  }finally{categoryBusy=false;}
 }
 function refreshFeaturedLink(){
  const link=q('curveFeaturedLink');if(!link)return;
  const keyword=q('curveKeyword')?.value.trim()||'';
  const category=q('curveCategory')?.value||'Todos';
  const term=keyword||(category==='Todos'?'':category);
  const params=new URLSearchParams({keyword:term,page:'0',sortBy:'sales'});
  link.href='https://shopee.com.br/search?'+params.toString();
 }

 function card(row){
  const box=t('article','curve-card'),frame=t('div',''),main=t('div','curve-card-main');
  if(row.imageUrl&&/^https:\/\/[^/]+\.digitaloceanspaces\.com\//.test(row.imageUrl)){
   const image=t('img','curve-card-image');
   image.loading='lazy';image.decoding='async';image.src=row.imageUrl;
   image.alt='Produto do catálogo WeDrop: '+row.name;
   image.referrerPolicy='no-referrer';
   frame.append(image);
  }else frame.append(t('div','curve-card-image curve-card-placeholder','Imagem WeDrop não disponível'));
  const top=t('div','curve-card-top'),title=t('h4','',row.name);
  const curve=t('span','curve-curve '+(row.curve==='A'?'a':'b'),
    row.verified30?'Curva '+row.curve:'Potencial '+row.curve);
  top.append(title,curve);
  const sku=t('div','curve-sku');sku.append('SKU WeDrop: ',t('b','',row.sku));
  const facts=t('div','curve-metrics');
  facts.append(
   metric(row.sales30!==null?'Vendas observadas em ~30 dias':'Vendas exibidas na Shopee',
    nf.format(row.sales30!==null?row.sales30:row.salesDisplayed)),
   metric('Preço do anúncio comparado',money(row.competitorPrice)),
   metric('Média dos concorrentes'+(row.avgCompetitorPrice!==null?' ('+row.competitorOfferCount+' lojas)':''),money(row.avgCompetitorPrice)),
   metric('Custo WeDrop',money(row.cost)),
   metric('Correspondência de nomes',nf.format(Math.round(100*Number(row.matchScore||0)))+'%')
  );
  const competitor=t('p','curve-evidence','Oferta comparada: '+row.competitorName);
  const evidence=t('p','curve-evidence',row.verified30?
   'Curva calculada pela diferença de duas leituras acumuladas separadas por '+row.observedDays+' dias.':
   'Sem histórico completo de 30 dias: classificação apenas indicativa, por vendas acumuladas.');
  const stock=t('div','curve-stock'+(row.inStock?'':' not'),
   row.inStock?(row.availability?'WeDrop: '+row.availability:'Estoque WeDrop não confirmado'):
    'WeDrop: '+(row.availability||'Indisponível'));
  const actions=t('div','curve-card-actions');
  const copy=t('button','','Copiar SKU para Ads');copy.type='button';
  copy.addEventListener('click',async()=>{
   try{
    await navigator.clipboard.writeText(row.sku);
    copy.textContent='✓ SKU copiada';
    status('SKU '+row.sku+' copiada. Abra a área Shopee Ads para revisar a inclusão do produto. Nenhuma campanha foi criada.');
   }catch(error){
    status('Não foi possível copiar automaticamente. SKU: '+row.sku,'warning');
   }
  });
  const link=t('a','','Ver anúncio na Shopee');
  if(/^https:\/\/shopee\.com\.br\/product\/\d+\/\d+$/.test(row.competitorUrl||'')){
   link.href=row.competitorUrl;link.target='_blank';link.rel='noopener noreferrer';
  }else link.hidden=true;
  const featured=t('a','','Conferir Em Destaque');
  if(/^https:\/\/shopee\.com\.br\/search\?/.test(row.featuredSearchUrl||'')){
   featured.href=row.featuredSearchUrl;featured.target='_blank';featured.rel='noopener noreferrer';
   actions.append(featured);
  }
  actions.append(copy,link);
  main.append(top,sku,facts,competitor,evidence,stock,actions);
  appendPrices(main,row);
  appendSEO(main,row);
  box.append(frame,main);return box;
 }
 function render(result){
  const grid=q('curveResults'),stats=q('curveStats');
  if(!grid||!stats)return;
  grid.replaceChildren();
  if(!result.configured){
   stats.hidden=true;
   q('curveContinueSearch').hidden=true;
   q('curveProgressNote').textContent='Busca automática indisponível: falta conexão da API Afiliados.';
   grid.append(t('div','curve-empty',
    'Pesquisa ainda não configurada. Conecte a API Shopee Afiliados no Render para consultar as ofertas em destaque.'));
   status(result.warning||'Credenciais de ofertas da Shopee não configuradas.','warning');
   return;
  }
  const found=Number(result.found)||0;
  stats.hidden=false;
  q('curveCatalogCount').textContent=nf.format(result.catalogCount||0);
  q('curveScannedCount').textContent=nf.format(result.skuSearchesCompleted||0);
  q('curveOfferCount').textContent=nf.format(result.offerCount||0);
  q('curveFoundCount').textContent=nf.format(found);
  q('curveVerifiedCount').textContent=nf.format(result.rowsWith30Days||0);
  q('curveResultsMeta').textContent=(result.items||[]).length+' de '+result.requested+
   ' solicitados · '+nf.format(result.skuQueriesCompleted||0)+' buscas por SKU · consulta '+
   (result.checkedAt?new Date(result.checkedAt).toLocaleString('pt-BR'):'atual');
  q('curveProgressNote').textContent=
   nf.format(result.skuSearchesCompleted||0)+' SKUs pesquisadas · '+
   nf.format(result.catalogCount||0)+' SKUs da categoria · '+
   nf.format(result.remainingSkuQueries||0)+' consultas ainda não efetuadas.';
  q('curveContinueSearch').hidden=!result.hasMore||!result.shortage||Boolean(result.apiLimited);
  for(const item of result.items||[])grid.append(card(item));
  if(!result.items?.length){
   grid.append(t('div','curve-empty',
    'Nenhuma correspondência confiável encontrada nesta amostra. Tente outra categoria ou pesquise novamente depois.'));
  }
  const prefix=result.shortage?
   'Encontrados '+result.items.length+' dos '+result.requested+
   ' solicitados. A pesquisa terminou normalmente; não há bloqueio. ':
   'Pesquisa concluída: '+result.items.length+' produtos selecionados. ';
  const next=result.hasMore&&result.shortage?
   ' Há mais SKUs para pesquisar; use Pesquisar mais SKUs desta categoria.':'';
  const limitWarning=result.apiLimited?
   ' A API Afiliados interrompeu as consultas. Verifique limite e autorização.':'';
  const errors=result.successfulQueries===0&&result.queryCount>0?
   ' Não houve resposta válida da API: '+String(result.warning||'').slice(-420):'';
  const foot=' Fonte automática: API Shopee Afiliados ordenada por vendas (não é leitura direta da aba Em Destaque). Vendas acumuladas não comprovam vendas mensais.';
  status(prefix+next+limitWarning+errors+foot,
   result.shortage||result.apiLimited?'warning':'info');
 }
 async function search(event,{advance=false}={}){
  event?.preventDefault?.();
  if(state.busy)return;
  state.busy=true;
  const button=q('curveSearchBtn'),amount=q('curveLimit')?.value||'10',
   curve=q('curveType')?.value||'ALL',category=q('curveCategory')?.value||'Todos',
   keyword=q('curveKeyword')?.value.trim()||'';
  refreshFeaturedLink();
  button.disabled=true;button.textContent='Consultando SKUs WeDrop…';
  q('curveContinueSearch').disabled=true;
  status('Varredura automática: lendo as SKUs da categoria e pesquisando títulos de cada produto por lotes na API de ofertas Shopee. Não precisa escrever uma palavra-chave.');
  try{
   const params=new URLSearchParams({limit:amount,curve,category,keyword});
   if(advance)params.set('advance','1');
   const response=await fetch('/api/shopee/curvas-ab/search?'+params,{
    credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(90000)
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Shopee não respondeu (HTTP '+response.status+').');
   if(data.ok!==true)throw Error('Retorno de pesquisa inválido.');
   state.last=data;render(data);
  }catch(error){
   status('Não foi possível concluir a pesquisa: '+String(error.message||error)+
    '. Nenhuma alteração foi feita na Shopee.','error');
  }finally{
   state.busy=false;button.disabled=false;
   q('curveContinueSearch').disabled=false;
   button.textContent='Pesquisar SKUs automaticamente';
  }
 }
 const form=q('curveSearchForm');
 if(form)form.addEventListener('submit',search);
 q('curveContinueSearch')?.addEventListener('click',()=>search(null,{advance:true}));
 q('curveKeyword')?.addEventListener('input',refreshFeaturedLink);
 q('curveCategory')?.addEventListener('change',refreshFeaturedLink);
 refreshFeaturedLink();
 globalThis.RACurvesAB={onOpen:()=>{
  void loadCategories();
  refreshFeaturedLink();
  if(state.last)render(state.last);
 }};
})();
