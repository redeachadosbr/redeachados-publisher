// Shopee Ads: preparação individual por SKU e criação com lances CPC manuais.
// Não confundir ROAS de acompanhamento com alvo de lance automático GMV Max.
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
  const brazil=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const [y,m,dd]=brazil.split('-');
  return dd+'-'+m+'-'+y;
 };
 function editor(candidate){
  const root=el('details','ads-manual-editor'),head=el('summary','','Configurar campanha manual • CPC');
  root.append(head);
  const inner=el('div','ads-manual-fields'),note=el('p','ads-manual-note',
   'Modo manual: você define palavras-chave e CPC. ROAS é referência de desempenho e NÃO é transmitido como lance automático.');
  const budget=field('Orçamento diário (R$)','number',candidate.suggestedDailyBudget||10,{min:5,max:300,step:0.01});
  const roas=field('ROAS de referência (x)','number',candidate.roasTarget||5,{min:1,max:100,step:0.1});
  const begin=field('Início • DD-MM-AAAA','text',textDate(1),{placeholder:'DD-MM-AAAA'});
  const end=field('Fim opcional • DD-MM-AAAA','text','',{placeholder:'DD-MM-AAAA'});
  const kwLabel=el('label','ads-manual-field ads-manual-full'),kwHelp=el('small','',
   'Palavras-chave: uma por linha, no formato termo | exata ou ampla | CPC em R$');
  const keywords=el('textarea','ads-manual-keywords');
  keywords.rows=3;keywords.placeholder='ex.: mochila ferramentas | exata | 0.35';
  kwLabel.append(kwHelp,keywords);
  const confirm=el('label','ads-manual-consent');
  const check=el('input');check.type='checkbox';
  confirm.append(check,el('span','',
   'Confirmei que o preço e o desconto com a reserva Ads já foram publicados na Shopee. Quero criar uma campanha com custo real.'));
  const previewBtn=el('button','ads-manual-cta','Conferir prévia manual');
  previewBtn.type='button';const status=el('p','ads-manual-feedback','Nenhuma campanha foi criada.');
  inner.append(note,budget.wrap,roas.wrap,begin.wrap,end.wrap,kwLabel,confirm,previewBtn,status);
  const review=el('div','ads-manual-review');inner.append(review);
  root.append(inner);
  const setStatus=(message,kind='info')=>{status.textContent=message;status.dataset.kind=kind;};
  const invalidate=()=>{review.replaceChildren();};
  for(const input of [budget.input,roas.input,begin.input,end.input,keywords,check])
   input.addEventListener('input',invalidate);
  previewBtn.addEventListener('click',async()=>{
   invalidate();previewBtn.disabled=true;setStatus('Validando plano salvo e requisitos da campanha...');
   try{
    const lines=keywords.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const kw=lines.map(line=>{
     const parts=line.split('|').map(x=>x.trim());
     if(parts.length!==3)throw Error('Use termo | exata ou ampla | CPC por linha.');
     return {keyword:parts[0],matchType:parts[1].toLowerCase()==='ampla'?'broad':
      parts[1].toLowerCase()==='exata'?'exact':parts[1],bid:Number(parts[2].replace(',','.'))};
    });
    const payload={sku:candidate.sku,itemId:candidate.itemId,
     dailyBudget:Number(budget.input.value),roasReference:Number(roas.input.value),
     reservePct:Number(root.closest('.ads-seo-card')?.querySelector('.ads-manual-reserve-input')?.value||0),
     startDate:begin.input.value.trim(),endDate:end.input.value.trim(),keywords:kw,
     priceConfirmed:check.checked};
    const resp=await fetch('/api/shopee/ads/manual/preview',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await resp.json();
    if(!resp.ok||!result.ok)throw Error(result.error||'Prévia não autorizada.');
    const p=result.preview,approval=result.approval;
    review.append(el('strong','', 'Prévia da campanha MANUAL — confirme os dados'),
     el('p','',candidate.sku+' · '+cash(p.product.currentPrice)+' preço planejado · '+p.draft.reservePct+'% reserva Ads · '+
      cash(p.draft.dailyBudget)+'/dia · '+p.draft.keywords.length+' palavra(s)-chave'),
     el('p','', 'ROAS '+p.draft.roasReference+'x é meta de acompanhamento, não estratégia automática. CPC e correspondência são enviados à API.'));
    const execute=el('button','ads-manual-execute','Confirmar e criar campanha pela API');
    execute.type='button';review.append(execute);
    execute.addEventListener('click',async()=>{
     if(!window.confirm('Criar campanha MANUAL para '+candidate.sku+' com '+cash(p.draft.dailyBudget)+
      ' de orçamento diário? Isso poderá gastar dinheiro real.'))return;
     execute.disabled=true;setStatus('Criando uma campanha manual na Shopee. Não repita a operação se houver timeout.');
     try{
      const response=await fetch('/api/shopee/ads/manual/create',{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({approval,confirm:true})});
      const out=await response.json();
      if(!response.ok||!out.ok)throw Error(out.error||'Shopee não confirmou criação.');
      setStatus('Campanha MANUAL criada. ID Shopee: '+out.campaignId+'.','success');
      review.replaceChildren();
     }catch(e){setStatus('Não foi possível confirmar: '+e.message+' Não repita antes de conferir campanhas.','error');}
     finally{execute.disabled=false;}
    });
    setStatus('Prévia pronta. Nada foi enviado à Shopee.','success');
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
