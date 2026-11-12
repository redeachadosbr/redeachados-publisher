// Rede Achados BR — análise única por campanha, sem cenários automáticos de ROAS/orçamento.
// Somente leitura; distingue resultado financeiro estimado de repasse confirmado.
(()=>{
'use strict';
const byId=id=>document.getElementById(id);
const number=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const money=x=>x===null||!Number.isFinite(x)?'—':x.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const ratio=x=>x===null||!Number.isFinite(x)?'—':x.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'x';
const percent=x=>x===null||!Number.isFinite(x)?'—':x.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const count=x=>x===null||!Number.isFinite(x)?'—':x.toLocaleString('pt-BR',{maximumFractionDigits:0});
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>String(x||'').split('-').reverse().join('/');
const roundMoney=x=>Math.round((x+Number.EPSILON)*100)/100;
const daysBetween=(a,b)=>{
 const start=Date.parse(String(a||'')+'T12:00:00Z'),end=Date.parse(String(b||'')+'T12:00:00Z');
 return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.round((end-start)/86400000)+1:null;
};
function analyze(d,financeCalculator){
 const spent=number(d.spent),clicks=number(d.clicks),impressions=number(d.impressions);
 const orders=number(d.orders),itemsSold=number(d.itemsSold);
 const revenueReported=number(d.revenue);
 const revenue=revenueReported!==null?revenueReported:
  (spent!==null&&number(d.actual)!==null?roundMoney(spent*number(d.actual)):null);
 const actual=spent>0&&revenue!==null?revenue/spent:null;
 const ctr=impressions>0&&clicks!==null?clicks/impressions*100:number(d.ctrReported);
 const cpc=spent!==null&&clicks>0?spent/clicks:null;
 const conversion=orders!==null&&clicks>0?orders/clicks*100:null;
 const cpa=spent!==null&&orders>0?spent/orders:null;
 const fin=typeof financeCalculator==='function'?financeCalculator(d,actual):null;
 const costGaps=Array.isArray(fin?.unfilled)?fin.unfilled:[];
 const financialReady=!!fin&&Number(d.price)>0&&!costGaps.length;
 // Projeção proporcional: receita da campanha / preço de catálogo
 // Não equiparar a pedidos pagos nem misturar com repasse efetivo da Shopee.
 const estimatedUnits=financialReady&&revenue!==null?revenue/d.price:null;
 const estimatedNet=financialReady&&estimatedUnits!==null&&spent!==null?
  roundMoney(fin.contrib*estimatedUnits-spent):null;
 const estimatedMargin=estimatedNet!==null&&revenue>0?estimatedNet/revenue*100:null;
 const afterAds=revenue!==null&&spent!==null?roundMoney(revenue-spent):null;
 const days=daysBetween(d.dateStart,d.dateEnd);
 const limitedSample=(clicks!==null&&clicks<20)||(orders!==null&&orders<3)||days!==null&&days<7;
 const warnings=[];
 if(d.periodClosed!==true)warnings.push('Período em andamento ou não confirmado como fechado: diagnóstico provisório.');
 if(limitedSample)warnings.push('Amostra pequena: poucos cliques, pedidos ou dias. Não concluir que o retorno continuará igual.');
 if(d.actual!==null&&d.actual!==undefined&&actual!==null&&Math.abs(number(d.actual)-actual)>0.1)
  warnings.push('O ROAS exibido e a divisão vendas ÷ gasto diferem; conferir a mesma campanha e a janela de atribuição.');
 if(revenueReported===null&&revenue!==null)
  warnings.push('Receita derivada do ROAS informado, não confirmada separadamente pela API.');
 if(!fin)warnings.push('Sem preço, custo WeDrop ou taxas completos: lucro líquido não validado.');
 else if(costGaps.length)warnings.push('Existem custos em branco ('+costGaps.join(', ')+'); não será estimado lucro líquido como se fossem zero.');
 if(revenue!==null&&revenue>0)warnings.push('Vendas atribuídas pela Shopee Ads podem incluir outros produtos e não equivalem ao repasse líquido de pedidos.');
 let title='Manter e acompanhar',action='Acompanhe a campanha sem modificar orçamento ou ROAS agora.',tone='neutral';
 if(spent===null||revenue===null){
  title='Dados insuficientes para concluir';tone='neutral';
  action='Confira gasto e vendas atribuídas para o mesmo anúncio e período. Não altere a campanha com dados incompletos.';
 }else if(spent===0){
  title='Sem investimento no período';tone='neutral';
  action='Confirme o status da campanha e a entrega. Sem gasto não há ROAS real comparável.';
 }else if(revenue<=0){
  title='Atenção: gasto sem vendas atribuídas';tone='risk';
  action='Evite ampliar o investimento. Revise preço, frete, capa, descrição, estoque e histórico antes de testar ajustes.';
 }else if(fin&&(!Number.isFinite(fin.breakeven)||actual<fin.breakeven||estimatedNet!==null&&estimatedNet<0)){
  title='Risco de prejuízo no anúncio';tone='risk';
  action='Priorize proteger a margem: confira custos WeDrop, taxas, preço e repasses. Não reduza o ROAS-alvo nem aumente orçamento antes de validar a conta.';
 }else if(fin&&(!Number.isFinite(fin.minRoas)||actual<fin.minRoas)){
  title='Margem desejada não atingida';tone='warn';
  action='Mantenha investimento controlado e revise a oferta. O retorno não cobre com segurança a margem desejada cadastrada.';
 }else if(estimatedNet===null){
  title='ROAS positivo; lucro ainda não validado';tone='warn';
  action='Mantenha sem escalar até confirmar custo, taxas e lucro real por pedido. ROAS alto não significa lucro.';
 }else if(limitedSample){
  title='Bom retorno, mas com poucas vendas/cliques';tone='healthy';
  action='Mantenha orçamento e ROAS-alvo atuais. Acompanhe mais dias e novas vendas antes de pensar em aumentar investimento.';
 }else if(number(d.target)>0&&actual<number(d.target)){
  title='ROAS abaixo da meta configurada';tone='warn';
  action='Observe a consistência do retorno e revise competitividade, capa e frete. Evite aumentar verba sem novos dados.';
 }else{
  title='Resultado favorável para acompanhar';tone='healthy';
  action='Mantenha a configuração e acompanhe a margem após Ads. Só considere ampliar verba com vários dias estáveis e lucro confirmado.';
 }
 const suggestions=[];
 if(impressions!==null&&impressions>=100&&ctr!==null&&ctr<1)
  suggestions.push('CTR de '+percent(ctr)+': compare a capa e o título com concorrentes; menos cliques não comprovam sozinho problema na imagem.');
 if(clicks!==null&&clicks>=30&&orders===0)
  suggestions.push('Foram '+count(clicks)+' cliques sem pedido atribuído: confira preço final, frete, avaliações e descrição.');
 if(cpc!==null)suggestions.push('Cada clique custou, em média, '+money(cpc)+'.');
 if(fin&&Number.isFinite(fin.breakeven))suggestions.push('ROAS de equilíbrio estimado: '+ratio(fin.breakeven)+'. ROAS para margem desejada: '+ratio(fin.minRoas)+'.');
 if(orders!==null&&clicks>0)suggestions.push('Pedidos ÷ cliques: '+percent(conversion)+' (indicador aproximado, sujeito às janelas de atribuição).');
 if(suggestions.length===0)suggestions.push('Confira estoque, preço, frete e anúncios concorrentes antes de qualquer alteração.');
 return {
  d,spent,revenue,revenueSource:revenueReported===null?'roas_informado':'receita_atribuida',
  actual,ctr,cpc,conversion,cpa,impressions,clicks,orders,itemsSold,
  days,fin,afterAds,estimatedNet,estimatedMargin,estimatedUnits,financialReady,
  title,tone,action,suggestions,warnings,limitedSample,scenario:null,previewScenario:null,
  suggestedBudget:null,suggestedROAS:null,alerts:warnings.map(text=>({level:'warn',text})),
  rule:'Diagnóstico único por desempenho e lucratividade; sem aplicação de regras percentuais de orçamento e ROAS.',
  safeAction:action
 };
}
const style=document.createElement('style');
style.textContent=[
 '.single-ads{margin:16px 0}.single-ads-head{font-size:12px;font-weight:800;color:#e8c68c;letter-spacing:.8px}',
 '.single-ads h3{font-size:19px;margin:8px 0 3px;color:#f6faff}',
 '.single-ads .intro{font-size:12px;color:#bbc9d6;margin:0 0 14px}',
 '.single-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}',
 '.single-kpis .tile{background:#131c28;border:1px solid #395069;padding:12px;border-radius:12px;min-width:0}',
 '.single-kpis .tile small{display:block;color:#b8c8d9;font-size:11px}',
 '.single-kpis .tile strong{display:block;color:#fff;font-size:21px;line-height:1.45;overflow-wrap:anywhere}',
 '.single-kpis .tile p{font-size:10px;color:#becbd6;margin:2px 0 0}',
 '.single-ads .diagnosis{padding:15px;border:1px solid #51677e;border-left:4px solid #e5b763;border-radius:11px;background:#202d3b}',
 '.single-ads .diagnosis.healthy{border-left-color:#71dbaa}.single-ads .diagnosis.risk{border-left-color:#f2888a}',
 '.single-ads .diagnosis strong{font-size:16px}.single-ads .diagnosis p{font-size:13px;color:#e3e9f2;margin:7px 0 0}',
 '.single-ads .analysis-list{margin:10px 0 8px;padding-left:19px;font-size:12px;color:#d4dfeb;line-height:1.65}',
 '.single-ads .disclaimer{padding:12px;border-radius:9px;background:#171f2a;color:#bfcada;font-size:11px;line-height:1.5;margin-top:14px}',
 '@media(max-width:490px){.single-kpis{grid-template-columns:1fr 1fr}.single-kpis .tile strong{font-size:17px}}',
 '@media print{.single-kpis .tile{background:#eee;color:#111}.single-kpis .tile strong{color:#111}.single-ads .diagnosis{background:#eee;color:#111}}'
].join('\n');
document.head.append(style);
function render(r){
 const content=byId('resultContent'),legacy=byId('essentialDecision'),details=byId('adsDetails');
 if(!content)return;
 if(legacy)legacy.hidden=true;
 if(details)details.hidden=true;
 let holder=byId('singleAdsResult');
 if(!holder){
  holder=document.createElement('section');
  holder.id='singleAdsResult';
  holder.className='single-ads';
  holder.setAttribute('aria-live','polite');
  if(legacy)content.insertBefore(holder,legacy);
  else content.prepend(holder);
 }
 const tile=(title,value,note)=>'<div class="tile"><small>'+safe(title)+'</small><strong>'+safe(value)+'</strong>'+(note?'<p>'+safe(note)+'</p>':'')+'</div>';
 holder.innerHTML='<div class="single-ads-head">ANÁLISE INTELIGENTE · SHOPEE ADS</div>'+
  '<h3>'+safe(r.title)+'</h3>'+
  '<p class="intro">'+safe(r.d.campaign)+' · '+safe(date(r.d.dateStart))+' a '+safe(date(r.d.dateEnd))+'</p>'+
  '<div class="single-kpis">'+
  tile('Investimento Ads',money(r.spent),'Gasto atribuído à campanha')+
  tile('Vendas atribuídas',money(r.revenue),r.revenueSource==='roas_informado'?'Derivadas do ROAS':'Receita da campanha, não repasse')+
  tile('ROAS real',ratio(r.actual),'Vendas ÷ investimento')+
  tile('Lucro líquido estimado',money(r.estimatedNet),r.estimatedNet===null?'Custos insuficientes':'Simulação, não valor recebido')+
  tile('Impressões',count(r.impressions),'Exibições do anúncio')+
  tile('Cliques',count(r.clicks),'Interações pagas')+
  tile('CTR',percent(r.ctr),'Cliques ÷ impressões')+
  tile('Custo por clique',money(r.cpc),'Investimento ÷ cliques')+
  tile('Pedidos atribuídos',count(r.orders),'Dado da campanha')+
  tile('Itens vendidos',count(r.itemsSold),r.itemsSold===null?'Não fornecidos pela API':'Informados/associados à campanha')+
  tile('Saldo após Ads, antes dos custos',money(r.afterAds),'NÃO é lucro líquido')+
  tile('ROAS de equilíbrio',r.fin?ratio(r.fin.breakeven):'—','Estimativa do cadastro do SKU')+
  '</div>'+
  '<div class="diagnosis '+safe(r.tone)+'"><strong>'+safe(r.title)+'</strong><p>'+safe(r.action)+'</p></div>'+
  '<h3>O que os números indicam</h3>'+
  '<ul class="analysis-list">'+r.suggestions.map(s=>'<li>'+safe(s)+'</li>').join('')+'</ul>'+
  (r.warnings.length?'<h3>Cuidados com os dados</h3><ul class="analysis-list">'+r.warnings.map(s=>'<li>'+safe(s)+'</li>').join('')+'</ul>':'')+
  '<p class="disclaimer"><strong>Como o lucro estimado é calculado:</strong> (vendas atribuídas ÷ preço cadastrado × contribuição antes dos Ads por unidade) − investimento em Ads. Usa custo WeDrop e taxas cadastradas, assume preço/custo uniformes e não valida reembolsos, repasses ou produtos adicionais. O lucro realizado exige conciliação dos pedidos efetivos. Nenhuma mudança é feita automaticamente na Shopee.</p>';
 const heading=byId('resultScenario');if(heading)heading.textContent='Diagnóstico de desempenho';
 const badge=byId('resultBadge');
 if(badge){badge.className='status '+(r.tone==='healthy'?'green':r.tone==='risk'?'red':'');badge.textContent=r.limitedSample?'Amostra pequena':r.tone==='risk'?'Risco financeiro':r.estimatedNet===null?'Lucro pendente':'Analisado';}
}
function summary(r){
 return [
  'Rede Achados BR — análise única Shopee Ads',r.d.campaign,
  'Período: '+r.d.dateStart+' a '+r.d.dateEnd,
  'Investimento: '+money(r.spent),
  'Vendas atribuídas: '+money(r.revenue),
  'ROAS real: '+ratio(r.actual),
  'Cliques: '+count(r.clicks)+' / impressões: '+count(r.impressions),
  'CTR: '+percent(r.ctr)+' / CPC: '+money(r.cpc),
  'Pedidos: '+count(r.orders)+' / itens: '+count(r.itemsSold),
  'Sobra após Ads antes de outros custos: '+money(r.afterAds),
  'Lucro líquido estimado: '+money(r.estimatedNet),
  'ROAS de equilíbrio: '+(r.fin?ratio(r.fin.breakeven):'Não validado'),
  'Recomendação: '+r.action,
  'Alertas: '+r.warnings.join(' | '),
  'Estimativas não equivalem a repasses confirmados; nenhuma campanha foi alterada.'
 ].join('\n');
}
window.RedeAdsSingle={analyze,render,summary};
})();
