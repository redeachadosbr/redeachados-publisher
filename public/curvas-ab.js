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
   metric('Preço do anúncio concorrente',money(row.competitorPrice)),
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
  actions.append(copy,link);
  main.append(top,sku,facts,competitor,evidence,stock,actions);
  box.append(frame,main);return box;
 }
 function render(result){
  const grid=q('curveResults'),stats=q('curveStats');
  if(!grid||!stats)return;
  grid.replaceChildren();
  if(!result.configured){
   stats.hidden=true;
   grid.append(t('div','curve-empty',
    'Pesquisa ainda não configurada. Conecte a API Shopee Afiliados no Render para consultar as ofertas em destaque.'));
   status(result.warning||'Credenciais de ofertas da Shopee não configuradas.','warning');
   return;
  }
  const found=Number(result.found)||0;
  stats.hidden=false;
  q('curveCatalogCount').textContent=nf.format(result.catalogCount||0);
  q('curveOfferCount').textContent=nf.format(result.offerCount||0);
  q('curveFoundCount').textContent=nf.format(found);
  q('curveVerifiedCount').textContent=nf.format(result.rowsWith30Days||0);
  q('curveResultsMeta').textContent=(result.items||[]).length+' de '+result.requested+
   ' solicitados · consulta '+(result.checkedAt?new Date(result.checkedAt).toLocaleString('pt-BR'):'atual');
  for(const item of result.items||[])grid.append(card(item));
  if(!result.items?.length){
   grid.append(t('div','curve-empty',
    'Nenhuma correspondência confiável encontrada nesta amostra. Tente outra categoria ou pesquise novamente depois.'));
  }
  const prefix=result.shortage?
   'Encontrados '+result.items.length+' dos '+result.requested+
   ' solicitados. A pesquisa terminou normalmente; não há bloqueio. ':
   'Pesquisa concluída: '+result.items.length+' produtos selecionados. ';
  const foot='Vendas totais da Shopee não equivalem a vendas em 30 dias. Revise os anúncios antes de criar Ads.';
  status(prefix+foot,result.shortage?'warning':'info');
 }
 async function search(event){
  event?.preventDefault?.();
  if(state.busy)return;
  state.busy=true;
  const button=q('curveSearchBtn'),amount=q('curveLimit')?.value||'10',
   curve=q('curveType')?.value||'ALL',keyword=q('curveKeyword')?.value.trim()||'';
  button.disabled=true;button.textContent='Pesquisando ofertas…';
  status('Consultando ofertas ordenadas por vendas na Shopee e cruzando com as SKUs WeDrop. A primeira busca pode demorar por causa das consultas externas.');
  try{
   const params=new URLSearchParams({limit:amount,curve,keyword});
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
  }finally{state.busy=false;button.disabled=false;button.textContent='Pesquisar oportunidades';}
 }
 const form=q('curveSearchForm');
 if(form)form.addEventListener('submit',search);
 globalThis.RACurvesAB={onOpen:()=>{if(state.last)render(state.last);}};
})();
