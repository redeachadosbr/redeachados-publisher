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
  details.append(t('summary','',row.avgCompetitorPrice===null?
   'Amostra parcial: '+count+' anúncio(s) • mínimo de 2 ofertas do mesmo produto':
   'Média do preço Shopee: '+count+' ofertas equivalentes (mesma loja permitida)'));
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

 function card(row,{pending=false,rejected=false}={}){
  const box=t('article','curve-card'),frame=t('div',''),main=t('div','curve-card-main');
  if(row.imageUrl&&/^https:\/\/[^/]+\.digitaloceanspaces\.com\//.test(row.imageUrl)){
   const image=t('img','curve-card-image');
   image.loading='lazy';image.decoding='async';image.src=row.imageUrl;
   image.alt='Produto do catálogo WeDrop: '+row.name;
   image.referrerPolicy='no-referrer';
   frame.append(image);
  }else frame.append(t('div','curve-card-image curve-card-placeholder','Imagem WeDrop não disponível'));
  const top=t('div','curve-card-top'),title=t('h4','',row.name);
  const pendingLabel=row.adsCompetitiveness?.status==='missing_market'?
   'Pendente • preço insuficiente':row.adsCompetitiveness?.status==='missing_cost'?
   'Pendente • custo WeDrop':'Pendente • vendas mensais';
  const curve=t('span','curve-curve '+(rejected?'pending':row.curve==='A'?'a':row.curve==='B'?'b':'pending'),
    rejected?'Inviável para Ads':pending?pendingLabel:
     row.verified30?(row.curve==='LOW'?'Abaixo de 700':'Curva '+row.curve):'Pendente • 30 dias');
  top.append(title,curve);
  const sku=t('div','curve-sku');sku.append('SKU WeDrop: ',t('b','',row.sku));
  const fit=row.adsCompetitiveness||null;
  const maxAboveMarketPct=Number(fit?.maxAboveMarketPct??60);
  const fitTag=!pending&&fit?.eligible?t('div','curve-ads-fit',
   fit.status==='within_market'?'Pré-qualificada • preço na média':
   'Pré-qualificada • até '+maxAboveMarketPct+'% acima da média'):null;
  const facts=t('div','curve-metrics');
  facts.append(
   metric(row.periodSource?.includes('Em Destaque')?'Vendido/Mês • Shopee':
     row.sales30!==null?'Vendas apuradas em ~30 dias':'Vendas acumuladas • período não confirmado',
    row.sales30==null&&row.salesDisplayed==null?'—':nf.format(row.sales30??row.salesDisplayed)),
   metric(row.avgCompetitorPrice===null?
     'Preço observado no anúncio (não é média)':'Preço do anúncio comparado',
     money(row.competitorPrice)),
   metric('Média do preço de venda na Shopee'+
    (row.avgCompetitorPrice!==null?' ('+row.competitorOfferCount+' anúncios)':''),money(row.avgCompetitorPrice)),
   metric('Custo WeDrop',money(row.cost)),
   ...(fit?.eligible?[
    metric('Preço sugerido para Ads',money(fit.suggestedSalePrice)),
    metric('Teto competitivo (+'+maxAboveMarketPct+'%)',money(fit.maxMarketPrice)),
    metric('Lucro líquido estimado',money(fit.estimatedNetProfit))
   ]:[]),
   metric('Correspondência de nomes',nf.format(Math.round(100*Number(row.matchScore||0)))+'%')
  );
  const competitor=t('p','curve-evidence','Oferta comparada: '+row.competitorName+
   ' • Fonte: '+(row.source==='shopee-featured-chrome'?'Ponte Chrome • Em Destaque Shopee':
     row.source==='shopee-featured-public'?'busca pública Em Destaque Shopee':'API Afiliados Shopee'));
  const issues=[];
  const monthlyCount=Number(row.monthlyCompetitorCount||0);
  const inCurve=(row.monthlyCompetitors||[]).filter(x=>Number(x.monthlySold)>=700).length;
  if(monthlyCount<2||inCurve<2)
   issues.push('Demanda: '+inCurve+'/2 lojas com pelo menos 700 vendas/mês comprovadas. '+
    'A extensão e a vitrine pública tentam recuperar os dados que faltam.');
  if(row.avgCompetitorPrice===null)
   issues.push('Preço de mercado: '+Number(row.competitorOfferCount||0)+
    '/2 anúncios validados; '+Number(row.marketCandidateCount||0)+
    ' anúncio(s) com título/modelo relacionado identificados nesta SKU. '+
    (Number(row.chromeCapturedOffers)>0?
      'Ponte recebeu '+row.chromeCapturedOffers+' anúncios distintos ('+
      Number(row.chromeCapturedWithPrice||0)+' com preço); apenas '+
      Number(row.marketCandidateCount||0)+' relacionado(s) a esta SKU. ':
      '')+
     'Sem média significa captura/vínculo insuficiente, NÃO ausência de preços na Shopee. '+
     (row.priceEvidence||'Amostra de preço insuficiente.'));
  if(!row.inStock)issues.push('Estoque WeDrop não disponível.');
  if(!Number.isFinite(Number(row.cost))||Number(row.cost)<=0)
   issues.push('Custo WeDrop não cadastrado.');
  if(fit?.eligible===false&&fit.reason&&fit.status!=='missing_market')
   issues.push('Viabilidade de Ads: '+fit.reason);
  const issueNote=pending&&issues.length?
   t('p','curve-evidence','Dados pendentes: '+issues.join(' • ')):null;
  const rejectedNote=rejected?t('p','curve-evidence',
   'DESCARTADA PARA ADS: '+(fit?.reason||'Custo, estoque ou margem incompatíveis.')+
   ' • Custo WeDrop: '+money(row.cost)+' • Média do mercado: '+
   money(row.avgCompetitorPrice)+'. Somente reavaliar se custo, preço ou estoque mudarem.'):null;
  const evidence=t('p','curve-evidence',rejected?
   'Somente no histórico de auditoria; esta SKU não é oportunidade Ads nas condições atuais.':
   row.periodSource?'Fonte da classificação: '+row.periodSource+'.':
   'Somente vendas acumuladas disponíveis; vendas mensais ainda não comprovadas.');
  const fitScenario=fit?.eligible?t('p','curve-ads-scenario',
   'Simulação: custo WeDrop, taxas padrão, 10% para Ads e margem líquida mínima de 5%. Confira taxas e ROAS reais antes de anunciar.'):null;
  const proof=t('details','curve-monthly-competitors');
  const count=Number(row.monthlyCompetitorCount||0);
  proof.append(t('summary','',count+' lojas com vendas mensais'+
   (count>=2?' • amostra mínima encontrada':' • mínimo 2 lojas na curva')));
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
  const copy=t('button','',rejected?'Descartada para Ads':
   pending?'Aguardando dados para Ads':'Copiar SKU para Ads');copy.type='button';
  copy.disabled=pending||rejected;
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
   if(!rejected)actions.append(featured);
  }
  actions.append(copy,link);
  main.append(top,sku,...(fitTag?[fitTag]:[]),facts,competitor,
   ...(issueNote?[issueNote]:[]),...(rejectedNote?[rejectedNote]:[]),evidence,
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
  const pending=Array.isArray(result.pendingItems)?result.pendingItems:[];
  const discarded=Array.isArray(result.discardedItems)?result.discardedItems:[];
  if(pending.length){
   const note=t('p','curve-evidence','Pendentes de dados: '+result.pendingCount+
    ' SKU(s) sem comprovação mensal ou com preço/custo ainda insuficientes. '+
    'Itens com inviabilidade financeira comprovada NÃO aparecem nesta lista.');
   note.style.gridColumn='1 / -1';grid.append(note);
   for(const item of pending)grid.append(card(item,{pending:true}));
  }
  if(Number(result.discardedCount)>0){
   const audit=t('details','curve-discarded-audit');
   audit.style.gridColumn='1 / -1';audit.style.width='100%';
   audit.style.padding='12px 15px';audit.style.border='1px solid #e2d2cf';
   audit.style.borderRadius='12px';
   audit.append(t('summary','',
    'Descartados para Ads: '+result.discardedCount+
    ' SKU(s) — custo maior que a média, margem inviável ou estoque indisponível. Ver auditoria.'));
   const auditGrid=t('div','curve-discarded-grid');
   auditGrid.style.display='grid';
   auditGrid.style.gridTemplateColumns='repeat(auto-fit,minmax(320px,1fr))';
   auditGrid.style.gap='12px';auditGrid.style.marginTop='12px';
   for(const item of discarded)auditGrid.append(card(item,{rejected:true}));
   audit.append(auditGrid);grid.append(audit);
  }
  if(!result.items?.length&&!pending.length&&!Number(result.discardedCount))
   grid.append(t('div','curve-empty',
    'Nenhuma oportunidade encontrada. Verifique a correspondência e as fontes da pesquisa.'));
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
   ' '+Number(result.discardedCount||0)+' SKU(s) descartadas para Ads por custo, margem ou estoque; '+
   Number(result.pendingCount||0)+' SKU(s) aguardam informações. Teto +'+
   Number(result.pricePolicy?.maxAboveMarketPct??60)+'% aplicado.':'';
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

