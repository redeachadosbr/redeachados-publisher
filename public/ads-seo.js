// Painel SEO de Ads: recomendações somente leitura.
(()=>{
 const button=document.getElementById('adsSeoRefresh');
 const result=document.getElementById('adsSeoResults');
 const status=document.getElementById('adsSeoStatus');
 if(!button||!result||!status)return;
 const fmt=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=String(value);return el;};
 button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Analisando estoque, margem e pesquisas salvas...';result.replaceChildren();
  try{
   const r=await fetch('/api/shopee/ads/seo/candidates',{credentials:'same-origin',cache:'no-store'});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||'Falha na consulta');
   status.textContent=data.candidates.length+
    ' SKU(s) qualificadas nos '+data.examinedPlans+' planos recentes. '+data.warning;
   if(!data.candidates.length){
    result.append(text('p','Nenhuma SKU apresenta estoque, preço e margem mínima de 8% com dados suficientes. Atualize o catálogo e a precificação.'));
    return;
   }
   for(const item of data.candidates){
    const card=document.createElement('article');
    card.style.cssText='border:1px solid #d9e6ed;border-radius:14px;padding:14px;background:#fff;display:grid;gap:8px';
    card.append(text('strong',item.title),text('small','SKU '+item.sku+' · Estoque '+item.stock));
    const metrics=document.createElement('div');metrics.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:7px';
    for(const [label,value] of [
      ['Pontuação de triagem',item.score+'/100'],['Margem antes Ads',item.marginPct+'%'],
      ['ROAS sugerido',item.roasTarget+'x'],['Orçamento diário sugerido',fmt(item.suggestedDailyBudget)]
    ]){
      const tile=document.createElement('div');tile.style.cssText='padding:9px;background:#f3f7fc;border-radius:9px';
      tile.append(text('small',label),text('div',value));metrics.append(tile);
    }
    card.append(metrics,text('small',item.reason),
      text('small','Confiança: '+item.confidence+' · Estimativas para teste, não previsão de vendas.'));
    const view=document.createElement('button');view.type='button';view.className='secondary';
    view.textContent='Analisar esta SKU';
    view.addEventListener('click',()=>{
      const sku=document.getElementById('optimizerSku');
      if(sku){sku.value=item.sku;sku.dispatchEvent(new Event('input',{bubbles:true}));sku.scrollIntoView({behavior:'smooth',block:'center'});}
    });
    card.append(view);result.append(card);
   }
  }catch(err){status.textContent='Não foi possível analisar: '+err.message;}
  finally{button.disabled=false;}
 });
})();
