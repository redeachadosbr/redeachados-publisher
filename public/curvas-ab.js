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
  el.hidden=false;
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
  const section=t('details','curve-seo');
  section.append(t('summary','','Palavras-chave e título sugerido para Shopee'));
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
  details.append(t('summary','','Ver os '+count+' anúncios considerados na média de venda Shopee'));
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
  const curve=t('span','curve-curve '+(row.curve==='A'?'a':row.curve==='B'?'b':'pending'),
     row.verified30?(row.curve==='LOW'?'Abaixo de 700':'Curva '+row.curve):'Pendente • 30 dias');
  top.append(title,curve);
  const sku=t('div','curve-sku');sku.append('SKU WeDrop: ',t('b','',row.sku));
  const fit=row.adsCompetitiveness||null;
  const fitTag=fit?.eligible?t('div','curve-ads-fit',
   fit.status==='within_market'?'Pré-qualificada • preço na média':
   'Pré-qualificada • até 40% acima da média'):null;
  const facts=t('div','curve-metrics');
  facts.append(
   metric(row.periodSource?.includes('Em Destaque')?'Vendido/Mês • Shopee':
     row.sales30!==null?'Vendas apuradas em ~30 dias':'Vendas acumuladas • período não confirmado',
    nf.format(row.sales30!==null?row.sales30:row.salesDisplayed)),
   metric('Preço do anúncio comparado',money(row.competitorPrice)),
   metric('Média do preço de venda na Shopee'+
    (row.avgCompetitorPrice!==null?' ('+row.competitorOfferCount+' anúncios)':''),money(row.avgCompetitorPrice)),
   metric('Custo WeDrop',money(row.cost)),
   ...(fit?.eligible?[
    metric('Preço sugerido para Ads',money(fit.suggestedSalePrice)),
    metric('Teto competitivo (+40%)',money(fit.maxMarketPrice)),
    metric('Lucro líquido estimado',money(fit.estimatedNetProfit))
   ]:[]),
   metric('Correspondência de nomes',nf.format(Math.round(100*Number(row.matchScore||0)))+'%')
  );
  const competitor=t('p','curve-evidence','Oferta comparada: '+row.competitorName+
   ' • Fonte: '+(row.source==='shopee-featured-chrome'?'Ponte Chrome • Em Destaque Shopee':
     row.source==='shopee-featured-public'?'busca pública Em Destaque Shopee':'API Afiliados Shopee'));
  const evidence=t('p','curve-evidence',row.periodSource?
   'Fonte da classificação: '+row.periodSource+'.':
   'Somente vendas acumuladas disponíveis: classificação potencial, não vendas confirmadas em 30 dias.');
  const fitScenario=fit?.eligible?t('p','curve-ads-scenario',
   'Simulação: custo WeDrop, taxas padrão, 10% para Ads e margem líquida mínima de 5%. Confira taxas e ROAS reais antes de anunciar.'):null;
  const proof=t('details','curve-monthly-competitors');
  const count=Number(row.monthlyCompetitorCount||0);
  proof.append(t('summary','',count+' lojas com vendas mensais'+
   (count>=3?' • amostra comprovada':' • mínimo 3 lojas')));
  const salesProof=t('ol','curve-offers-list');
  for(const company of row.monthlyCompetitors||[]){
   const li=t('li','');
   const link=t('a','',company.title+' — '+nf.format(company.monthlySold)+' vendidos/30 dias');
   if(/^https:\/\/shopee\.com\.br\/product\/\d+\/\d+$/.test(company.url||'')){
    link.href=company.url;link.target='_blank';link.rel='noopener noreferrer';
   }
   li.append(link);salesProof.append(li);
  }
  proof.append(salesProof);
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
  main.append(top,sku,...(fitTag?[fitTag]:[]),facts,competitor,evidence,
   ...(fitScenario?[fitScenario]:[]),proof,stock,actions);
  appendPrices(main,row);
  appendSEO(main,row);
  box.append(frame,main);return box;
 }
 function reportSource(result){
  const label=q('curveSourceStatus'),detail=q('curveSourceDetail');
  if(!label||!detail)return;
  const feat=Number(result?.sources?.featured||0),aff=Number(result?.sources?.affiliate||0),chromeCount=Number(result?.sources?.chrome||0);
  const available=Boolean(result?.providers?.affiliate?.configured);
  const block=result?.providers?.featured?.state==='blocked';
  if(chromeCount>0){
   label.textContent='Ponte Chrome Em Destaque: '+chromeCount+' consultas visíveis recebidas';
   detail.textContent='A/B exige vendas mensais explícitas na vitrine. Sem mês, a SKU permanece pendente.';
  }else if(feat>0){
   label.textContent='Busca pública Shopee Em Destaque: retornou ofertas em '+feat+' consultas';
   detail.textContent='Os anúncios com campo sold mensal podem receber classificação A/B mensal. Demais ofertas ficam como potencial.';
  }else if(aff>0){
   label.textContent='Pesquisa pela API Shopee Afiliados: '+aff+' consultas';
   detail.textContent='A vitrine direta não retornou ofertas utilizáveis. Os números Afiliados não são vendidos/mês.';
  }else{
   label.textContent=block?'Shopee restringiu a leitura automática da vitrine':'Nenhuma fonte de vendas respondeu';
   detail.textContent=available?
    'Afiliados configurado, mas ainda não retornou ofertas. Veja o diagnóstico ou tente outra categoria.':
    'Afiliados não configurado: esta fonte alternativa precisa de App ID e App Secret da Shopee Afiliados no Render.';
  }
 }
 async function checkSources(probe=false){
  const btn=q('curveTestSources'),label=q('curveSourceStatus'),detail=q('curveSourceDetail');
  if(btn){btn.disabled=true;btn.textContent='Verificando…';}
  try{
   const result=await fetch('/api/shopee/curvas-ab/sources'+(probe?'?probe=1':''),{
    credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(18000)});
   const data=await result.json().catch(()=>({}));
   if(!result.ok||!data.ok)throw Error(data.error||'Erro na consulta');
   const pub=data.storefront||{};
   const aff=data.affiliate||{};
   if(label)label.textContent=
    'Em Destaque: '+(pub.status==='accessible'?'acessível':pub.status==='blocked'?'acesso restrito':pub.status==='unknown'?'não testado':'indisponível')+
    ' · Afiliados: '+(aff.status==='accessible'?'respondendo':aff.status==='error'?'erro na API':
     data.affiliateConfigured?'configurado, não testado':'não configurado');
   if(detail)detail.textContent=[
    pub.message||(pub.returnedOffers!==null?
     pub.returnedOffers+' ofertas públicas retornadas; '+pub.returnedMonthly+' com indicador mensal.':''),
    aff.message||'',
    !probe?'Clique em Testar fontes para verificar o acesso em tempo real.':''
   ].filter(Boolean).join(' | ');
   if(probe&&q('curveSourceDiagnostics'))q('curveSourceDiagnostics').open=true;
  }catch(error){
   if(label)label.textContent='Falha ao verificar as fontes';
   if(detail)detail.textContent=String(error.message||error);
   if(q('curveSourceDiagnostics'))q('curveSourceDiagnostics').open=true;
  }finally{if(btn){btn.disabled=false;btn.textContent='Testar fontes';}}
 }
 function render(result){
  const grid=q('curveResults'),stats=q('curveStats');
  if(!grid||!stats)return;
  grid.replaceChildren();
  reportSource(result);
  if(!result.configured){
   stats.hidden=true;
   q('curveResultsMeta').textContent='Pesquisa indisponível';
   if(q('curveSourceDiagnostics'))q('curveSourceDiagnostics').open=true;
   q('curveContinueSearch').hidden=true;
   q('curveProgressNote').textContent='Fontes de pesquisa indisponíveis ou sem ofertas; confira o diagnóstico acima.';
   grid.append(t('div','curve-empty',
    'A busca pública não retornou ofertas utilizáveis e a API Afiliados não está respondendo. Teste as fontes para identificar a conexão necessária.'));
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
  q('curveContinueSearch').hidden=true;
  for(const item of result.items||[])grid.append(card(item));
  if(!result.items?.length){
    const pending=Array.isArray(result.pendingItems)?result.pendingItems:[];
    if(pending.length){
     grid.append(t('p','curve-evidence',
      'Nenhuma Curva A/B comprovada nesta consulta. Encontramos '+result.pendingCount+
      ' SKUs WeDrop com anúncios concorrentes equivalentes. Os itens abaixo ainda NÃO estão classificados porque faltam vendas dos últimos 30 dias.'));
     for(const item of pending)grid.append(card(item));
    }else grid.append(t('div','curve-empty',
     result.competitiveOnly?
      'Nenhuma SKU A/B com custo e preço viáveis para Ads nesta etapa. '+
      Number(result.excludedByPrice||0)+' SKU(s) A/B rejeitadas por preço/custo, estoque ou ausência de média confiável. Continue a pesquisa.':
      'Nenhuma SKU comprovada nesta etapa da varredura. Continue a pesquisa ou confira o acesso a vendas mensais na aba Em Destaque.'));
   }
  const prefix=result.shortage?
   (result.competitiveOnly?'Curvas A/B competitivas para Ads: ':result.verifiedOnly?'Curvas mensais confirmadas: ':'Oportunidades potenciais: ')+
   result.items.length+' dos '+result.requested+
   ' solicitados. Confira a fonte: sem dados mensais não é possível confirmar curvas. ':
   'Pesquisa concluída: '+result.items.length+' produtos selecionados. ';
  const next=result.hasMore&&result.shortage?
   ' Há mais SKUs para pesquisar; utilize a Ponte Chrome novamente.':'';
  const limitWarning=result.apiLimited?
   ' A API Afiliados interrompeu as consultas. Verifique limite e autorização.':'';
  const errors=result.successfulQueries===0&&result.queryCount>0?
   ' Não houve resposta válida da API: '+String(result.warning||'').slice(-420):'';
  const feature=Number(result.sources?.featured||0);
  const affiliate=Number(result.sources?.affiliate||0);
   const chromeCount=Number(result.sources?.chrome||0);
  const marketNotice=result.competitiveOnly?
   ' '+Number(result.excludedByPrice||0)+' SKU(s) A/B excluídas por preço/custo, estoque ou média indisponível. Teto +40%, cenário de Ads aplicado.':'';
  const foot=' Fonte: '+(feature?'busca pública Em Destaque Shopee ('+feature+' consultas). ':'')+
   (affiliate?'API Afiliados ('+affiliate+' consultas). ':'')+
    (chromeCount?'Ponte Chrome ('+chromeCount+' consultas visíveis). ':'')+
   'Somente os anúncios com vendas mensais disponíveis ou histórico de 30 dias podem ter curva mensal confirmada.';
  status(prefix+next+limitWarning+errors+marketNotice+foot,
   result.shortage||result.apiLimited?'warning':'info');
 }
 q('curveTestSources')?.addEventListener('click',()=>checkSources(true));
 q('curveKeyword')?.addEventListener('input',refreshFeaturedLink);
 q('curveCategory')?.addEventListener('change',refreshFeaturedLink);
 refreshFeaturedLink();
 globalThis.RACurvesAB={showChromeResults(result){state.last=result;render(result);},onOpen:()=>{
  void loadCategories();
  // Fontes avançadas são consultadas somente quando o usuário solicita diagnóstico.
  refreshFeaturedLink();
  if(state.last)render(state.last);
 }};
})();
