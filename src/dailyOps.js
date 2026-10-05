function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function money(v){return Math.round(num(v)*100)/100}
function hhmmToMinutes(v,def){const m=String(v||def||'00:00').match(/^(\d{1,2}):(\d{2})$/);if(!m)return 0;return Math.min(23,num(m[1]))*60+Math.min(59,num(m[2]))}
function zonedParts(date=new Date(),timeZone='America/Sao_Paulo'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {dayKey:`${x.year}-${x.month}-${x.day}`,minutes:num(x.hour)*60+num(x.minute),hour:num(x.hour),minute:num(x.minute)};
}
function currentCycle(settings={},date=new Date()){
  const tz=settings.dailyTimezone||'America/Sao_Paulo',p=zonedParts(date,tz);
  const afternoon=hhmmToMinutes(settings.dailyAfternoonTime,'14:00'), evening=hhmmToMinutes(settings.dailyEveningTime,'18:30');
  const cycle=p.minutes>=evening?'evening':p.minutes>=afternoon?'afternoon':'morning';
  const labels={morning:'Manhã',afternoon:'Tarde',evening:'Fechamento'};
  const time={morning:settings.dailyMorningTime||'08:00',afternoon:settings.dailyAfternoonTime||'14:00',evening:settings.dailyEveningTime||'18:30'}[cycle];
  return {cycle,label:labels[cycle],dayKey:p.dayKey,time,timeZone:tz,minutes:p.minutes};
}
// Sempre entrega primeiro o ciclo vencido mais antigo. Se o operador entrar só à tarde,
// ele faz a abertura da manhã antes de seguir para a tarde; o mesmo vale no fechamento.
function dueCycle(settings={},state={},date=new Date()){
  const tz=settings.dailyTimezone||'America/Sao_Paulo',p=zonedParts(date,tz),day=state?.days?.[p.dayKey]||{};
  const afternoon=hhmmToMinutes(settings.dailyAfternoonTime,'14:00'), evening=hhmmToMinutes(settings.dailyEveningTime,'18:30');
  const due=['morning']; if(p.minutes>=afternoon)due.push('afternoon'); if(p.minutes>=evening)due.push('evening');
  const cycle=due.find(c=>!day?.[c]?.completedAt)||due[due.length-1]||'morning';
  const labels={morning:'Manhã',afternoon:'Tarde',evening:'Fechamento'};
  const time={morning:settings.dailyMorningTime||'08:00',afternoon:settings.dailyAfternoonTime||'14:00',evening:settings.dailyEveningTime||'18:30'}[cycle];
  return {cycle,label:labels[cycle],dayKey:p.dayKey,time,timeZone:tz,minutes:p.minutes,dueCycles:due,overdue:cycle!==due[due.length-1]};
}
function alertTask(a){
  const automatic=['ITEM_STATUS','FRETE_MUDOU','PRECO_MUDOU','SEM_PROMOCAO','PROMOCAO_TERMINANDO','PROMO_TERMINANDO','ADS_SEM_VENDA','ROAS_BAIXO','ANUNCIO_PARADO','QUALIDADE_BAIXA'].includes(String(a.type||''));
  return {key:`alert:${a.id||`${a.sku}:${a.type}`}`,kind:'alert',priority:a.severity==='critical'?1:2,title:`${a.sku||'SKU'} · ${a.title||a.type}`,detail:a.message||'',solution:a.solution||'Abrir o Monitor e executar a correção recomendada.',view:'monitor',alertId:a.id||'',automatic,cta:automatic?'Corrigir agora':'Revisar agora',required:true};
}

function qualityActionLabels(row={}){
  const labels=[],add=x=>{if(x&&!labels.includes(x))labels.push(x)};
  const scan=t=>{
    t=String(t||'').toLowerCase();
    if(/picture|image|photo|foto|thumbnail|miniatura/.test(t))add('FOTO');
    if(/video|clip/.test(t))add('VÍDEO');
    if(/attribute|technical|specification|spec|characteristic|caracter|ficha|gtin|ean|brand|marca|model|modelo/.test(t)){
      if(/primary|primar|principal/.test(t))add('CARACTERÍSTICAS PRIMÁRIAS');
      else if(/secondary|secund/.test(t))add('CARACTERÍSTICAS SECUNDÁRIAS');
      else add('CARACTERÍSTICAS');
    }
    if(/title|titulo|título/.test(t))add('TÍTULO');
  };
  for(const issue of Array.isArray(row.qualityPending)?row.qualityPending:[])scan(`${issue?.key||''} ${issue?.title||''} ${issue?.bucket||''} ${issue?.variable||''}`);
  scan(row.qualityHint||'');
  return labels;
}
function qualityTask(row={},qualityAlert=null,settings={}){
  const score=num(row.qualityScore,101),critical=score<Math.max(1,num(settings.dailyQualityCriticalScore,80)),actions=qualityActionLabels(row);
  if(score>Math.max(80,num(settings.dailyQualityReviewMaxScore,95)))return null;
  return {
    key:`quality:${row.itemId||row.sku}`,
    kind:'quality',
    priority:critical?1:2,
    title:`${row.sku||row.itemId||'SKU'} · QUALIDADE ${Math.round(score)}/100`,
    detail:actions.length?`CORRIGIR: ${actions.join(' · ')}`:'ATUALIZAR ANÁLISE DE QUALIDADE',
    solution:actions.length?`Corrigir somente ${actions.join(', ')}. O sistema tenta usar dados confirmados; se não encontrar informação confiável, marca a etapa como MANUAL.`:'Consultar novamente as pendências oficiais antes de alterar o anúncio.',
    qualityActions:actions,
    qualityScore:score,
    qualityBand:critical?'critical':'improve',
    legacy:Boolean(row.externalAccountItem),
    legacySource:row.externalAccountItem?'WeDrop + Mercado Livre':'Publisher + Mercado Livre',
    view:'monitor',
    alertId:qualityAlert?.id||'',
    automatic:Boolean(qualityAlert?.id),
    cta:'Corrigir agora',
    required:true
  };
}

function commercialTask(issue={}){
  const type=String(issue.type||'').toUpperCase();
  const view=issue.view||(type.includes('ADS')?'ads':type.includes('PROMO')||type.includes('DISCOUNT')?'promos':'pricing');
  const labels={PRICE_BELOW_MIN:'PREÇO',PRICE_INVALID:'PREÇO',DISCOUNT_BELOW_MIN:'DESCONTO',PROMO_EXPIRING:'PROMOÇÃO',ADS_NO_SALES:'ADS',ADS_LOW_ROAS:'ADS',ADS_MARGIN_RISK:'ADS',SHIPPING_PRICE_UP:'FRETE API',SHIPPING_PRICE_DOWN:'FRETE API',SHIPPING_REVIEW:'FRETE API'};
  const label=labels[type]||issue.label||'REVISÃO COMERCIAL';
  return {
    key:`commercial:${issue.itemId||issue.sku}:${type||issue.code||'issue'}`,kind:'commercial',priority:2,
    title:`${issue.sku||issue.itemId||'SKU'} · ${label}`,detail:issue.message||issue.detail||'Correção comercial necessária.',
    solution:issue.solution||'Abra a etapa indicada, corrija somente o desvio identificado e valide novamente no Mercado Livre.',
    view,cta:issue.cta||`Corrigir ${String(label).toLowerCase()}`,required:true,commercialType:type,commercialIssue:issue,
    sku:issue.sku||'',itemId:issue.itemId||''
  };
}

function dateKey(value,timeZone='America/Sao_Paulo'){
  if(!value)return ''; const d=new Date(value); if(Number.isNaN(d.getTime()))return ''; return zonedParts(d,timeZone).dayKey;
}
function publishedToday(ctx={}){
  const tz=ctx.settings?.dailyTimezone||'America/Sao_Paulo',today=zonedParts(new Date(),tz).dayKey,seen=new Set();
  for(const p of ctx.products||[]){if(dateKey(p.publishedAt,tz)!==today)continue;const k=String(p.ml_item_id||p.sku||p.id||'');if(k)seen.add(k)}
  for(const r of ctx.monitoring?.accountInventory||ctx.inventory||[]){if(dateKey(r.dateCreated||r.createdAt,tz)!==today)continue;const k=String(r.itemId||r.sku||'');if(k)seen.add(k)}
  return seen.size;
}
function growthTask(cycle,ctx={}){
  const settings=ctx.settings||{},done=publishedToday(ctx),goal=Math.max(0,Math.round(num(settings.dailyNewProductGoal,2))),stretch=Math.max(goal,Math.round(num(settings.dailyNewProductStretchGoal,5)));
  if(goal<=0)return null;
  if(done>=goal)return {key:'growth-new-products',kind:'growth',priority:7,title:`Meta diária de novos produtos cumprida · ${done}/${goal}`,detail:`Hoje já foram publicados ${done} produto(s). Meta principal ${goal}; meta de aceleração ${stretch}.`,solution:'A operação está em dia. Se houver capacidade, continue até a meta de aceleração sem sacrificar qualidade.',view:'import',cta:'Adicionar mais produtos',required:false,autoComplete:true,growth:{done,goal,stretch}};
  const remaining=goal-done;
  return {key:'growth-new-products',kind:'growth',priority:7,title:`Crescimento do dia · faltam ${remaining} novo(s) produto(s)`,detail:`Publicados hoje: ${done}/${goal}. Meta de aceleração: ${stretch} produtos/dia.`,solution:'Depois de deixar os anúncios atuais saudáveis, importe novas SKUs e conclua o fluxo completo até publicação. O sistema acompanha essa meta automaticamente.',view:'import',cta:cycle==='evening'?'Ver meta de produtos':'Subir novos produtos',required:false,growth:{done,goal,stretch}};
}
function buildTasks(cycle,ctx={}){
  const monitoring=ctx.monitoring||{},allAlerts=(monitoring.alerts||[]).filter(a=>a&&!a.waitingStock);
  const rows=monitoring.rows||[],ads=ctx.ads||{},promos=ctx.promotions||{},promoRows=promos.rows||[],accounting=ctx.accounting||{},settings=ctx.settings||{},commercialAudit=monitoring.commercialAudit||{},shippingAudit=monitoring.shippingAudit||{};
  const tasks=[]; const add=t=>{if(t&&!tasks.some(x=>x.key===t.key))tasks.push(t)};

  // Ordem operacional:
  // 1) bloqueios/estoque/status críticos;
  // 2) qualidade abaixo de 80;
  // 3) demais alertas;
  // 4) qualidade entre 80 e 95;
  // acima de 95 não entra na rotina de qualidade.
  const qualityAlerts=allAlerts.filter(a=>a.type==='QUALIDADE_BAIXA');
  const commercialCovered=new Set(['FRETE_MUDOU','PRECO_MUDOU','SEM_PROMOCAO','PROMO_TERMINANDO','PROMOCAO_TERMINANDO','ADS_SEM_VENDA','ROAS_BAIXO']);
  const normalAlerts=allAlerts.filter(a=>{const type=String(a.type||'');if(type==='QUALIDADE_BAIXA')return false;if(type==='FRETE_MUDOU'&&shippingAudit.lastRunAt)return false;if(commercialAudit.lastRunAt&&commercialCovered.has(type))return false;return true;});
  const criticalOps=normalAlerts.filter(a=>a.severity==='critical');
  const otherOps=normalAlerts.filter(a=>a.severity!=='critical');

  criticalOps.sort((a,b)=>String(a.type)==='ITEM_STATUS'?-1:String(b.type)==='ITEM_STATUS'?1:0).slice(0,30).forEach(a=>add(alertTask(a)));

  const rowRefs=new Set(rows.map(r=>`${String(r.itemId||'')}|${String(r.sku||'')}`));
  const fallbackQualityRows=qualityAlerts.filter(a=>!rows.some(r=>String(a.itemId||'')&&String(r.itemId||'')===String(a.itemId)||String(r.sku||'')===String(a.sku||''))).map(a=>{
    const m=String(a.message||'').match(/(\d{1,3})\s*\/\s*100/),score=Number(a.qualityPlan?.score??(m?m[1]:79));
    return {sku:a.sku||a.itemId,itemId:a.itemId||'',qualityScore:score,qualityPending:[],qualityHint:`${a.title||''} ${a.message||''} ${a.solution||''}`,externalAccountItem:false,_fallbackAlertId:a.id};
  });
  const qualityRows=[...rows,...fallbackQualityRows]
    .filter(r=>!r.waitingStock&&Number.isFinite(Number(r.qualityScore))&&num(r.qualityScore,101)<=Math.max(80,num(settings.dailyQualityReviewMaxScore,95))&&qualityActionLabels(r).length>0)
    .sort((a,b)=>{
      const ac=num(a.qualityScore,101)<num(settings.dailyQualityCriticalScore,80)?0:1;
      const bc=num(b.qualityScore,101)<num(settings.dailyQualityCriticalScore,80)?0:1;
      return ac-bc||num(a.qualityScore,101)-num(b.qualityScore,101);
    });
  const qAlertFor=row=>qualityAlerts.find(a=>String(a.id||'')===String(row._fallbackAlertId||'')||String(a.sku||'')===String(row.sku||'')||(String(a.itemId||'')&&String(a.itemId||'')===String(row.itemId||'')))||null;
  qualityRows.filter(r=>num(r.qualityScore,101)<num(settings.dailyQualityCriticalScore,80)).forEach(r=>add(qualityTask(r,qAlertFor(r),settings)));

  // Preço, promoções, descontos e ADS são auditados para TODAS as SKUs da conta, sem depender da nota de qualidade.
  // Se a auditoria de frete já explicou a correção de preço daquela SKU, evitamos duplicar a mesma ação como PRICE_BELOW_MIN.
  const shippingActionItems=new Set((shippingAudit.issues||[]).map(i=>String(i.itemId||i.sku||'')));
  // Só entra na fila aquilo que realmente exige uma ação do operador.
  // Promoção terminando não pode virar uma etapa genérica de “ir para a tela”: se já existe
  // próxima campanha programada, não há nada a fazer; se não existe oferta segura, o sistema
  // apenas monitora. A rotina só interrompe o operador quando há uma promoção segura e aplicável.
  for(const issue of Array.isArray(commercialAudit.issues)?commercialAudit.issues:[]){
    const type=String(issue?.type||issue?.code||'').toUpperCase();
    if(type==='PRICE_BELOW_MIN'&&shippingActionItems.has(String(issue.itemId||issue.sku||'')))continue;
    if(type==='PROMO_EXPIRING'){
      const same=promoRows.filter(r=>String(r.itemId||'')===String(issue.itemId||'')||(issue.sku&&String(r.sku||'').toLowerCase()===String(issue.sku||'').toLowerCase()));
      const scheduled=same.some(r=>String(r.status||'').toLowerCase()==='pending'||String(r.recommendation||'').toUpperCase()==='PROGRAMADA');
      if(scheduled)continue;
      const safe=same.filter(r=>r.eligible&&String(r.recommendation||'').toUpperCase()==='APTA'&&String(r.status||'').toLowerCase()==='candidate').sort((a,b)=>num(b.projectedMargin)-num(a.projectedMargin));
      if(!safe.length)continue;
      const best=safe[0],task=commercialTask(issue);
      task.promoAction='apply-safe';task.cta='Aplicar próxima promoção segura';
      task.solution=`O Publisher encontrou uma próxima oferta segura para esta mesma SKU. Confirme a aplicação; o sistema envia, valida no Mercado Livre e libera a próxima etapa.`;
      task.promoCandidate={rowId:best.id,itemId:best.itemId||issue.itemId||'',sku:best.sku||issue.sku||'',name:best.name||best.typeLabel||best.type||'Oferta do Mercado Livre',typeLabel:best.typeLabel||best.type||'Promoção',originalPrice:num(best.originalPrice),promoPrice:num(best.promoPrice),discountPct:num(best.discountPct),projectedProfit:num(best.projectedProfit),projectedMargin:num(best.projectedMargin)};
      add(task);continue;
    }
    add(commercialTask(issue));
  }

  // Frete é auditado diretamente pela API do Mercado Livre. O Helper do navegador não participa.
  for(const issue of Array.isArray(shippingAudit.issues)?shippingAudit.issues:[]) add(commercialTask(issue));

  // Quando o Mercado Livre bloqueia um anúncio em "Verificar produto", a ação entra
  // automaticamente na fila. A política Rede Achados é manter o anúncio fora do catálogo
  // opcional; a UI orienta o único clique que a API pública não expõe e valida depois.
  const catalogGuard=monitoring.catalogGuard||{};
  for(const row of Array.isArray(catalogGuard.productVerificationRequired)?catalogGuard.productVerificationRequired:[]){
    add({
      key:`catalog-verify:${row.itemId||row.sku}`,
      kind:'catalogVerify',
      priority:2,
      title:`${row.sku||row.itemId||'SKU'} · VERIFICAR PRODUTO`,
      detail:'O Mercado Livre exige uma confirmação do produto antes de liberar o anúncio.',
      solution:'Abrir “Verificar produto” e marcar “Não, é diferente” / “Não é parecido” nas sugestões, mantendo o anúncio fora do catálogo opcional. O Publisher valida o resultado automaticamente.',
      view:'monitor',
      itemId:row.itemId||'',
      userProductId:row.userProductId||'',
      sku:row.sku||'',
      manualAction:'catalog-product-verification',
      cta:'Resolver Verificar produto',
      required:true
    });
  }

  otherOps.slice(0,30).forEach(a=>add(alertTask(a)));

  qualityRows.filter(r=>num(r.qualityScore,101)>=num(settings.dailyQualityCriticalScore,80)).forEach(r=>add(qualityTask(r,qAlertFor(r),settings)));

  const adsRows=ads.rows||[],adsSpend=adsRows.reduce((sum,r)=>sum+num(r.metrics?.cost),0),badAds=adsRows.filter(r=>num(r.metrics?.cost)>0&&(num(r.metrics?.sales||r.metrics?.units_quantity,0)===0||num(r.metrics?.roas,999)<num(settings.adsTargetRoas,6)));
  if(!commercialAudit.lastRunAt&&badAds.length&&!normalAlerts.some(a=>['ADS_SEM_VENDA','ROAS_BAIXO'].includes(a.type)))add({key:'ads-attention',kind:'review',priority:3,title:`ADS: ${badAds.length} SKU(s) pedem atenção`,detail:`Gasto monitorado: R$ ${money(adsSpend).toFixed(2).replace('.',',')}. Há campanhas sem venda ou abaixo do ROAS alvo.`,solution:'Revise o gasto por SKU; pause desperdício e corrija oferta antes de aumentar orçamento.',view:'ads',cta:'Analisar ADS',required:true});
  const promoIssues=promoRows.filter(r=>r.type==='NONE'||String(r.recommendation||'').toUpperCase()==='REVISAR');
  if(!commercialAudit.lastRunAt&&promoIssues.length&&!normalAlerts.some(a=>['SEM_PROMOCAO','PROMO_TERMINANDO','PROMOCAO_TERMINANDO'].includes(a.type)))add({key:'promo-attention',kind:'review',priority:3,title:`Promoções: ${promoIssues.length} oportunidade(s)/pendência(s)`,detail:'Alguns anúncios estão sem promoção adequada ou precisam de revisão de margem.',solution:'Verifique campanhas disponíveis e aplique somente promoções que preservem a margem mínima.',view:'promos',cta:'Revisar promoções',required:true});
  const total=accounting.summary?.total||{};
  if(cycle==='morning'&&settings.catalogAutoGuardEnabled!==false){
    const manual=num(catalogGuard.manualDeclineRequired,0),errors=(catalogGuard.errors||[]).length,actions=(catalogGuard.actions||[]).length;
    if(manual>0)add({key:'catalog-optional-decline',kind:'review',priority:3,title:`Catálogo: ${manual} anúncio(s) elegível(is) para recusa opcional`,detail:`A proteção diária já bloqueia opt-in pelo Publisher e tratou ${actions} criação(ões) automáticas segura(s).`,solution:'Abra a Proteção de Catálogo e trate somente os casos que exigem ação manual.',view:'monitor',cta:'Ver proteção de catálogo',required:true});
    if(errors>0)add({key:'catalog-guard-errors',kind:'review',priority:3,title:`Proteção de catálogo: ${errors} consulta(s) precisam repetir`,detail:'Algumas verificações de elegibilidade/obrigatoriedade não foram conclusivas.',solution:'Execute novamente a proteção. Nenhum item incerto será alterado automaticamente.',view:'monitor',cta:'Repetir verificação',required:true});
  }
  if(cycle==='morning'){
    add({key:'morning-sales',kind:'info',priority:4,title:'Abertura financeira e vendas recentes',detail:`Faturamento sincronizado: R$ ${money(total.gross).toFixed(2).replace('.',',')} · resultado após ADS: R$ ${money(total.netAfterAdsActual??total.net).toFixed(2).replace('.',',')}.`,solution:'Confirme se há SKU com prejuízo ou margem baixa. Se houver, corrija preço/ADS antes de escalar.',view:'accounting',cta:'Conferir resultado',required:true});
  }
  if(cycle==='afternoon'){
    const dormant=allAlerts.filter(a=>a.type==='ANUNCIO_PARADO').length;
    add({key:'afternoon-conversion',kind:'info',priority:4,title:'Revisar ritmo de vendas e conversão',detail:`${dormant} anúncio(s) parado(s) detectado(s). Compare visitas, vendas, preço, frete, promoção e ADS.`,solution:'Corrija primeiro anúncios com tráfego e baixa conversão; depois os que nem estão recebendo visitas.',view:'monitor',cta:'Ver desempenho',required:true});
  }
  if(cycle==='evening'){
    add({key:'evening-close',kind:'info',priority:4,title:'Fechamento do dia: vendas, ADS e lucro',detail:`Faturamento: R$ ${money(total.gross).toFixed(2).replace('.',',')} · ADS real: R$ ${money(total.adsActual).toFixed(2).replace('.',',')} · resultado: R$ ${money(total.netAfterAdsActual??total.net).toFixed(2).replace('.',',')}.`,solution:'Finalize o dia com pendências críticas resolvidas e deixe as prioridades de amanhã identificadas.',view:'accounting',cta:'Fazer fechamento',required:true});
  }
  const growth=growthTask(cycle,ctx); if(growth)add(growth);
  const required=tasks.filter(t=>t.required!==false);
  if(!required.length)add({key:'operation-stable',kind:'ok',priority:5,title:'Operação obrigatória deste período está em dia',detail:'Nenhuma SKU está abaixo da faixa de qualidade definida e não há outra ação operacional obrigatória agora.',solution:'Você pode seguir para as atividades de crescimento orientadas pelo sistema.',view:'dashboard',cta:'Operação em dia',autoComplete:true,required:true});
  return tasks.sort((a,b)=>num(a.priority,9)-num(b.priority,9));
}
function summary(cycle,ctx,tasks=[]){
  const rows=ctx.monitoring?.rows||[],alerts=ctx.monitoring?.alerts||[],stockWait=rows.filter(r=>r.waitingStock).length,total=ctx.accounting?.summary?.total||{},adsRows=ctx.ads?.rows||[],adsAuditRows=ctx.ads?.auditRows||[],adsSpend=adsRows.reduce((sum,r)=>sum+num(r.metrics?.cost),0),published=publishedToday(ctx),goal=Math.max(0,Math.round(num(ctx.settings?.dailyNewProductGoal,2))),stretch=Math.max(goal,Math.round(num(ctx.settings?.dailyNewProductStretchGoal,5)));
  const criticalScore=num(ctx.settings?.dailyQualityCriticalScore,80),reviewMax=num(ctx.settings?.dailyQualityReviewMaxScore,95);
  const eligible=rows.filter(r=>!r.waitingStock&&Number.isFinite(Number(r.qualityScore))&&num(r.qualityScore,101)<=reviewMax&&qualityActionLabels(r).length>0);
  const commercial=ctx.monitoring?.commercialAudit||{},shipping=ctx.monitoring?.shippingAudit||{},commercialIssues=Array.isArray(commercial.issues)?commercial.issues:[],shippingIssues=Array.isArray(shipping.issues)?shipping.issues:[],adsCommercialIssues=commercialIssues.filter(i=>/ADS/.test(String(i.type||i.code||'').toUpperCase()));
  const badAds=adsRows.filter(r=>num(r.metrics?.cost)>0&&(num(r.metrics?.sales||r.metrics?.units_quantity,0)===0||num(r.metrics?.roas,999)<num(ctx.settings?.adsTargetRoas,6)));
  const adsActive=adsAuditRows.length?adsAuditRows.filter(r=>r.active).length:adsRows.filter(r=>!['paused','inactive'].includes(String(r.status||r.planStatus||'').toLowerCase())).length;
  const adsProblemCount=commercial.lastRunAt?adsCommercialIssues.length:badAds.length;
  const catalogVerifyPending=Array.isArray(ctx.monitoring?.catalogGuard?.productVerificationRequired)?ctx.monitoring.catalogGuard.productVerificationRequired.length:0;
  return {
    cycle,monitored:rows.length,critical:alerts.filter(a=>a.severity==='critical').length,
    actions:tasks.filter(t=>!t.autoComplete&&t.required!==false).length,growthActions:tasks.filter(t=>!t.autoComplete&&t.required===false).length,
    waitingStock:stockWait,adsSpend:money(adsSpend),adsActive,adsProblemCount,adsHealthy:adsProblemCount===0,adsCheckedAt:ctx.ads?.lastScanAt||ctx.ads?.updatedAt||null,
    gross:money(total.gross),net:money(total.netAfterAdsActual??total.net),
    qualityBelow:eligible.length,qualityCritical:eligible.filter(r=>num(r.qualityScore,101)<criticalScore).length,qualityImprove:eligible.filter(r=>num(r.qualityScore,101)>=criticalScore).length,
    commercialReviewed:num(commercial.verified??commercial.reviewed),commercialTotal:num(commercial.total),commercialAligned:num(commercial.aligned),
    commercialCorrections:commercialIssues.length+shippingIssues.length,commercialErrors:(Array.isArray(commercial.errors)?commercial.errors.length:0)+(Array.isArray(shipping.errors)?shipping.errors.length:0),shippingReviewed:num(shipping.reviewed),shippingChanges:num(shipping.changes),shippingActions:num(shipping.actions),
    catalogVerifyPending,publishedToday:published,newProductGoal:goal,newProductStretchGoal:stretch
  };
}
module.exports={currentCycle,dueCycle,buildTasks,summary,zonedParts,publishedToday,qualityActionLabels,qualityTask,commercialTask};
