// Rede Achados BR — Shopee Ads 2026. Preview e execução por API, nunca navega ao Seller Center.
(()=>{
 'use strict';
 const find=id=>document.getElementById(id);
 const els={panel:find('adsReviewPanel'),rows:find('adsReviewRows'),notice:find('adsReviewNotice')};
 if(!els.panel||!els.rows)return;
 let all=[],current=null,approval=null,busy=false;
 const e=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=String(text);
  return node;
 };
 function showMessage(message,tone='info'){
  const node=find('adsV3ActionStatus');
  if(node){node.textContent=message;node.dataset.tone=tone;}
 }
 function kind(c){
  const type=String(c?.adType||'').toLowerCase();
  return /gms|gmv|max/.test(type)?'gms':/manual/.test(type)?'manual':/^auto$|auto_product/.test(type)?'auto':null;
 }
 function shortText(c){
  if(c.impressions>=100&&c.clicks===0)return 'Tem impressões, mas não houve cliques. Melhore capa, título e preço antes de investir mais.';
  if(c.clicks>=20&&c.directOrdersObserved&&c.directOrders===0)return 'Há cliques sem pedidos diretos. Confira preço concorrente, frete, avaliações e conversão.';
  if(c.acos!==null&&c.acos>30)return 'ACOS elevado. Confira a margem antes de aumentar orçamento.';
  if(c.ctr!==null&&c.impressions>=100&&c.ctr<1)return 'CTR baixo. Teste foto, palavras-chave e relevância da oferta.';
  if(c.statusGroup!=='active')return 'Campanha não ativa ou sem status confirmado; verifique antes de retomar.';
  return 'Acompanhar cliques, conversões, ROAS e margem. Não mudar orçamento sem evidências.';
 }
 const actions=c=>{
  const type=kind(c);
  if(!type)return [];
  const x=[];
  if(c.statusGroup==='active')x.push(['pause','Pausar campanha']);
  if(c.status==='paused')x.push(['resume','Retomar campanha']);
  x.push(['change_budget','Alterar orçamento diário']);
  if(type==='gms')x.push(['change_roas_target','Alterar ROAS-alvo']);
  return x;
 };
 function chooseCampaign(c){
  current=c;approval=null;els.rows.replaceChildren();
  const head=e('div','ads-v3-selected-product');
  if(c.productImage){
   try{
    const url=new URL(c.productImage);
    if(url.protocol==='https:'&&['shopee.com.br','susercontent.com','shopeeusercontent.com','shopeemobile.com'].some(d=>url.hostname===d||url.hostname.endsWith('.'+d))){
     const img=e('img','ads-v3-product-preview');img.src=url.href;img.referrerPolicy='no-referrer';
     img.alt='Foto do produto';head.append(img);
    }
   }catch{}
  }
  const text=e('div');
  text.append(e('strong','',c.productTitle||c.name||'Campanha'),e('small','',c.productSku?'SKU '+c.productSku+' · ID '+c.campaignId:'Campanha '+c.campaignId));
  head.append(text);els.rows.append(head);
  const label=e('div','ads-v3-diagnosis');label.append(e('strong','',c.statusGroup==='active'?'Em veiculação':'Status: '+String(c.status||'não confirmado')),e('p','',shortText(c)));els.rows.append(label);
  const info=e('div','ads-v3-insight');info.append(e('strong','','Solução identificada'),e('p','',shortText(c)));
  if(c.priceEvidence){
    const market=c.priceEvidence;
    const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    info.append(e('p','ads-v3-price-evidence',
     'Seu preço estimado: '+money(market.price)+' · Média comparável: '+money(market.marketAverage)+
     ' · Diferença: '+market.differencePct.toLocaleString('pt-BR')+'%. '+market.note));
   }
  if(c.clicks>=20&&c.directOrdersObserved&&c.directOrders===0){
   info.append(e('small','','Para comparar preço de mercado com precisão, use a pesquisa da SKU na Otimização. Ajustes de foto, título e preço seguem o fluxo de aprovação do anúncio.'));
  }
  if(c.productSku){
   const edit=e('button','secondary','Revisar anúncio e pesquisa de preço');
   edit.type='button';edit.onclick=()=>{
    document.querySelector('[data-tab="optimizer"]')?.click();
    const sku=find('optimizerSku');if(sku){sku.value=c.productSku;sku.dispatchEvent(new Event('input',{bubbles:true}));}
   };info.append(edit);
  }
  els.rows.append(info);
  const available=actions(c);
  const area=e('div','ads-v3-api-action');
  area.append(e('strong','','Ajustar campanha pela API Shopee'),e('small','',
   'A execução exige prévia, confirmação e permissão Ads da sua conta.'));
  if(!available.length){
   area.append(e('p','ads-v3-hint','Tipo de campanha não reconhecido pela API. Nenhuma alteração será enviada.'));
   els.rows.append(area);return;
  }
  const select=e('select','ads-v3-action-select');
  for(const [value,label] of available){const option=e('option','',label);option.value=value;select.append(option);}
  const amount=e('input','ads-v3-action-value');
  amount.type='number';amount.step='0.01';amount.min='5';amount.max='300';
  amount.value='10';amount.setAttribute('aria-label','Novo orçamento diário ou ROAS');
  const valueLabel=e('label','ads-v3-amount-label');
  valueLabel.append(e('small','','Novo orçamento diário (R$)'),amount);
  const refreshField=()=>{
   approval=null;
   const action=select.value,needs=action.startsWith('change_');
   valueLabel.hidden=!needs;
   if(action==='change_roas_target'){amount.step='0.1';amount.min='1';amount.max='100';amount.value='5';valueLabel.querySelector('small').textContent='Novo ROAS-alvo (x)';}
   else if(action==='change_budget'){amount.step='0.01';amount.min='5';amount.max='300';amount.value='10';valueLabel.querySelector('small').textContent='Novo orçamento diário (R$)';}
   const previous=find('adsV3Approval');if(previous)previous.remove();
   showMessage('Selecione a ação e gere uma prévia para conferir antes de enviar.');
  };
  select.addEventListener('change',refreshField);
  amount.addEventListener('input',()=>{approval=null;find('adsV3Approval')?.remove();});
  const previewButton=e('button','ads-v3-preview-button','Gerar prévia da alteração');
  previewButton.type='button';
  previewButton.addEventListener('click',async()=>{
   if(busy)return;
   const request={campaignId:c.campaignId,action:select.value};
   if(select.value.startsWith('change_'))request.value=amount.value;
   busy=true;previewButton.disabled=true;showMessage('Validando campanha e permissões na Shopee...');
   find('adsV3Approval')?.remove();
   try{
    const resp=await fetch('/api/shopee/ads/campaigns/preview',{method:'POST',
     credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
    const data=await resp.json();if(!resp.ok||!data.ok)throw Error(data.error||'A Shopee não autorizou esta prévia.');
    if(current!==c)return;
    approval=data.approval;
    const box=e('div','ads-v3-confirm');box.id='adsV3Approval';
    box.append(e('strong','','Prévia confirmada pela API'),e('p','',
     data.preview.label+' · Campanha '+data.preview.campaignId+
     (data.preview.value!==null?' · Novo valor: '+data.preview.value:'')+
     '. A alteração afetará a campanha real.'));
    const submit=e('button','ads-v3-execute','Confirmar e executar na Shopee');
    submit.type='button';box.append(submit);area.append(box);
    submit.addEventListener('click',async()=>{
     if(busy||!approval)return;
     if(!window.confirm('Confirmar '+data.preview.label+' na Shopee para campanha '+c.campaignId+'? A ação poderá alterar seus gastos reais.'))return;
     busy=true;submit.disabled=true;showMessage('Enviando UMA alteração à API oficial Shopee...');
     try{
      const applied=await fetch('/api/shopee/ads/campaigns/apply',{method:'POST',
       credentials:'same-origin',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({approval,confirm:true})});
      const out=await applied.json();if(!applied.ok||!out.ok)throw Error(out.error||'Alteração não confirmada.');
      approval=null;box.remove();
      showMessage(out.message+(out.verificationWarning?' '+out.verificationWarning:''),'success');
      find('loadAdsAutoBtn')?.click();
     }catch(err){showMessage('Falha ou estado incerto: '+err.message+' Verifique os dados antes de reenviar.','error');}
     finally{busy=false;submit.disabled=false;}
    });
    showMessage('Prévia criada. A campanha ainda NÃO foi modificada.','success');
   }catch(err){showMessage('Prévia indisponível: '+err.message,'error');}
   finally{busy=false;previewButton.disabled=false;}
  });
  area.append(select,valueLabel,previewButton);
  const feedback=e('p','ads-v3-result','Nenhuma alteração foi enviada.');feedback.id='adsV3ActionStatus';
  area.append(feedback,e('small','ads-v3-hint','Limite recomendado pela Shopee: não exceder 10 ações por item/dia. Editar ROAS pode afetar a Proteção de ROAS do dia.'));
  els.rows.append(area);
  refreshField();
 }
 function openReview(ids,rows){
  all=Array.isArray(rows)?rows:[];
  const chosen=(Array.isArray(ids)?ids:[]).map(String);
  const candidates=chosen.length?all.filter(c=>chosen.includes(String(c.campaignId))):all.filter(c=>c.statusGroup==='active');
  const sorted=[...candidates].sort((a,b)=>Number(b.statusGroup==='active')-Number(a.statusGroup==='active'));
  els.panel.hidden=false;
  const first=sorted[0]||all.find(c=>c.statusGroup==='active')||all[0];
  if(!first){els.rows.replaceChildren(e('p','','Nenhuma campanha disponível para revisão.'));return;}
  chooseCampaign(first);
  if(sorted.length>1){
   const switcher=e('select','ads-v3-multiple');
   for(const item of sorted){
    const opt=e('option','',String(item.productTitle||item.name||item.campaignId).slice(0,65));
    opt.value=String(item.campaignId);switcher.append(opt);
   }
   switcher.addEventListener('change',()=>{const c=sorted.find(x=>String(x.campaignId)===switcher.value);if(c)chooseCampaign(c);});
   els.rows.prepend(switcher);
  }
  if(els.notice)els.notice.textContent='Diagnóstico no sistema, com prévia e execução pela API Shopee mediante confirmação.';
 }
 function onData(rows){
  if(!rows?.length)return;
  const active=rows.filter(c=>c.statusGroup==='active');
  const candidate=(active.length?active:rows).find(c=>c.daysWithData&&
   (c.directOrdersObserved&&c.directOrders===0&&c.expense>=10||c.ctr!==null&&c.ctr<1))||
   active[0]||rows[0];
  openReview([candidate.campaignId],rows);
 }
 globalThis.RedeAdsPremium={openReview,onData};
 find('adsOpenSeller')?.remove();
})();
