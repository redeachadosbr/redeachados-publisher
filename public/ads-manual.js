// Shopee Ads: produto escolhido individualmente e GMV Max com Meta de ROAS (lance automático).
(()=>{
 'use strict';
 const cash=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
 const field=(label,type,value,{min,max,step,placeholder}={})=>{
  const wrap=el('label','ads-manual-field'),title=el('small','',label),input=el('input','');
  input.type=type;input.value=String(value??'');if(min!==undefined)input.min=min;
  if(max!==undefined)input.max=max;if(step!==undefined)input.step=step;
  if(placeholder)input.placeholder=placeholder;
  wrap.append(title,input);return {wrap,input};
 };
 const textDate=(shift=0)=>{
  const d=new Date(Date.now()+shift*86400000);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',
   year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return map.day+'-'+map.month+'-'+map.year;
 };
 function editor(candidate){
  const root=el('details','ads-manual-editor'),head=el('summary','','Criar Anúncio Individual • GMV Max — Meta de ROAS');
  root.append(head);
  const inner=el('div','ads-manual-fields');
  const note=el('p','ads-manual-note',
   'Promover Meus Produtos → Anúncios Individuais → GMV Max - Meta de ROAS. Você escolhe o produto e define o ROAS; a Shopee otimiza os lances automaticamente.');
  const budget=field('Orçamento diário por produto (R$)','number',candidate.suggestedDailyBudget||10,{min:5,max:300,step:0.01});
  const roas=field('Meta de ROAS (x)','number',Math.round(Number(candidate.roasTarget||5)*10)/10,{min:0.1,max:100,step:0.1});
  const begin=field('Início • DD-MM-AAAA','text',textDate(1),{placeholder:'DD-MM-AAAA'});
  const end=field('Fim opcional • DD-MM-AAAA','text','',{placeholder:'Sem data final'});
  const selected=el('div','ads-roas-choice');
  selected.append(el('strong','','✓ Anúncios Individuais'),
   el('small','','✓ Produto selecionado manualmente · 1 SKU por campanha'),
   el('strong','','✓ GMV Max — Meta de ROAS'));
  const estimate=el('div','ads-roas-estimate');
  const percentage=el('strong');
  const applyReserve=el('button','secondary','Aplicar % equivalente à reserva');
  applyReserve.type='button';
  const updateEstimate=()=>{
   const target=Number(roas.input.value);
   const implied=target>0?100/target:null;
   percentage.textContent=implied!==null?
    'Custo Ads equivalente ao ROAS-alvo: '+implied.toLocaleString('pt-BR',{maximumFractionDigits:2})+
    '% do GMV atribuído':'Informe ROAS positivo.';
   applyReserve.disabled=!(implied>0&&implied<=40);
   applyReserve.title=implied>40?'Mais de 40% não pode ser reservado automaticamente. Revise o alvo de ROAS.':
    'Aplicar somente à estimativa; preço e desconto ainda precisam ser recalculados.';
  };
  applyReserve.addEventListener('click',()=>{
   const amount=100/Number(roas.input.value),input=root.closest('.ads-seo-card')?.querySelector('.ads-manual-reserve-input');
   if(!input||!Number.isFinite(amount)||amount>40)return;
   input.value=(Math.ceil(amount*10)/10).toFixed(1);
   input.dispatchEvent(new Event('input',{bubbles:true}));
   setStatus('Reserva pré-preenchida. Clique em Preparar preço/desconto e publique os ajustes antes de criar GMV Max.');
   invalidate();
  });
  roas.input.addEventListener('input',updateEstimate);updateEstimate();
  estimate.append(percentage,el('small','',
   'Conta indicativa 100 ÷ ROAS, não equivale necessariamente ao custo sobre todas as vendas nem garante conversão.'),applyReserve);
  const warning=el('p','ads-manual-note',
   'Impulsão Rápida, recomendação oficial de ROAS e Proteção ROAS não podem ser presumidas: dependem da elegibilidade Shopee e não são configuradas por este endpoint. ROAS-alvo não garante resultado.');
  const confirm=el('label','ads-manual-consent');
  const check=el('input');check.type='checkbox';
  confirm.append(check,el('span','',
   'Confirmei que o preço e o desconto já foram publicados com a reserva Ads necessária. Autorizarei o gasto somente ao clicar em Confirmar e criar campanha.'));
  const previewBtn=el('button','ads-manual-cta','Conferir prévia de GMV Max');
  previewBtn.type='button';
  const status=el('p','ads-manual-feedback','Campanha não criada.');
  const review=el('div','ads-manual-review');
  inner.append(selected,note,roas.wrap,budget.wrap,estimate,begin.wrap,end.wrap,warning,confirm,previewBtn,status,review);
  root.append(inner);
  const setStatus=(message,kind='info')=>{status.textContent=message;status.dataset.kind=kind;};
  const invalidate=()=>review.replaceChildren();
  for(const field of [budget.input,roas.input,begin.input,end.input,check])field.addEventListener('input',invalidate);
  previewBtn.addEventListener('click',async()=>{
   invalidate();previewBtn.disabled=true;setStatus('Validando preço publicado, reserva e dados da campanha...');
   try{
    const payload={sku:candidate.sku,itemId:candidate.itemId,
     dailyBudget:Number(budget.input.value),roasTarget:Number(roas.input.value),
     reservePct:Number(root.closest('.ads-seo-card')?.querySelector('.ads-manual-reserve-input')?.value||0),
     startDate:begin.input.value.trim(),endDate:end.input.value.trim(),priceConfirmed:check.checked};
    const response=await fetch('/api/shopee/ads/product-roas/preview',{method:'POST',
     credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok||!result.ok)throw Error(result.error||'Não foi possível preparar a campanha.');
    const p=result.preview,approval=result.approval;
    review.append(el('strong','','Prévia — Anúncio Individual com Meta de ROAS'),
     el('p','','Produto '+p.product.sku+' · Item ID '+p.product.itemId+' · Preço do plano '+cash(p.product.currentPrice)),
     el('p','','ROAS-alvo '+p.draft.roasTarget+'x · Orçamento '+cash(p.draft.dailyBudget)+'/dia · Reserva Ads '+p.draft.reservePct+'%'),
     el('p','','Equivalência indicativa pelo ROAS: '+p.impliedAdsPct+'% do GMV atribuído. Diferença para a reserva: '+p.coverageGapPct+' pontos percentuais.'),
     el('p','',p.draft.endDate?'Período '+p.draft.startDate+' a '+p.draft.endDate:
       'Início '+p.draft.startDate+' · sem data final'),
     el('p','',p.warning));
    const execute=el('button','ads-manual-execute','Confirmar e criar GMV Max na Shopee');
    execute.type='button';review.append(execute);
    execute.addEventListener('click',async()=>{
     if(!window.confirm('Criar ANÚNCIO INDIVIDUAL GMV Max — Meta de ROAS para '+candidate.sku+
      ', ROAS '+p.draft.roasTarget+'x e '+cash(p.draft.dailyBudget)+'/dia? A campanha pode gerar cobranças reais.'))return;
     execute.disabled=true;setStatus('Enviando UMA criação para a Shopee. Em falha, não repita sem conferir.');
     try{
      const api=await fetch('/api/shopee/ads/product-roas/create',{method:'POST',
       credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({approval,confirm:true})});
      const outcome=await api.json();
      if(!api.ok||!outcome.ok)throw Error(outcome.error||'A Shopee não confirmou a criação.');
      setStatus('Campanha GMV Max Meta de ROAS criada! ID '+outcome.campaignId+'.','success');
      review.replaceChildren();root.open=false;
      document.getElementById('adsSeoRefresh')?.click();
     }catch(e){setStatus('Criação não confirmada: '+e.message+' Confira a Shopee antes de repetir.','error');}
     finally{execute.disabled=false;}
    });
    setStatus('Prévia concluída. A campanha ainda NÃO foi publicada.','success');
   }catch(e){setStatus(e.message,'error');}
   finally{previewBtn.disabled=false;}
  });
  return root;
 }
 function attach(candidate,card){
  const current=Number(candidate.adsReservePct)||0;
  const recommended=Number(candidate.recommendedAdsReservePct)||0;
  const reserve=el('div','ads-manual-reserve'),header=el('div','ads-manual-reserve-head');
  const title=el('strong','','Reserva Ads para este produto'),tag=el('span','ads-manual-reserve-tag',
   candidate.adsReserveIncluded?'Incluída na precificação':'Sem reserva no preço');
  header.append(title,tag);
  const grid=el('div','ads-manual-reserve-controls');
  const pct=field('Reserva (%)','number',recommended||current||5,{min:0.01,max:40,step:0.5});
  pct.input.className='ads-manual-reserve-input';
  const estimated=el('span','ads-manual-estimate');
  const explain=()=>{
   const rate=Number(pct.input.value)||0;
   const price=Number(candidate.quoteCustomerPrice)||0;
   estimated.textContent='Reserva estimada: '+cash(price*rate/100)+'/venda · preço do plano: '+cash(price)+
    '. O novo valor só será confiável após recalcular preço, taxas e desconto.';
  };
  pct.input.addEventListener('input',explain);explain();
  grid.append(pct.wrap,estimated);
  const prepare=el('button','ads-manual-prepare','Preparar preço/desconto com esta reserva');
  prepare.type='button';
  prepare.addEventListener('click',()=>{
   if(!Number.isFinite(Number(pct.input.value))||Number(pct.input.value)<=0||Number(pct.input.value)>40)return;
   const ok=globalThis.redeAdsPrepareReserve?.(candidate.sku,Number(pct.input.value));
   if(!ok)alert('Não foi possível abrir a Precificação. Atualize a página.');
  });
  reserve.append(header,grid,prepare,
   el('p','ads-manual-note',
    'A reserva é percentual por venda, não dinheiro depositado. Preço/desconto precisam ser recalculados e publicados pelo fluxo da loja antes de criar a campanha.'));
  card.append(reserve);
  if(candidate.hasActiveCampaign){
   card.append(el('p','ads-manual-existing','Já existe campanha ativa deste produto. A criação de uma duplicada não é oferecida.'));
  }else{
   card.append(editor(candidate));
  }
 }
 globalThis.RedeAdsManual={attach};
})();
