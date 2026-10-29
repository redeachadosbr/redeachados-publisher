// Interface de otimização de um anúncio de kit já existente. Preparação nunca publica.
const $=selector=>document.querySelector(selector);
export function initExistingKitOptimization({getContext,api,money,onMainSkuChange}){
 let target=null,busy=false,discountToken=null;
 const ctx=()=>getContext(),kitSku=()=>ctx().prepared?.kit?.kitSku||'';
 function notice(message,state='info'){
  const el=$('#kitOptimizeStatus');if(el){el.textContent=message;el.dataset.state=state;}
 }
 function paint(){
  const {kitSaved}=ctx(),valid=Boolean(target&&target.kitSku===kitSku());
  $('#kitOptimizeLookup').disabled=busy||!kitSaved;
  $('#kitOptimizePrepare').disabled=busy||!kitSaved||!valid||!$('#kitOptimizeConfirm').checked;
  $('#kitOptimizeImages').disabled=busy||!kitSaved||!valid||!target.prepared;
  $('#kitOptimizeOpen').disabled=busy||!kitSaved||!valid||!target.prepared;
  $('#kitOptimizeDiscountPreview').disabled=busy||!kitSaved||!valid||!target.prepared;
 }
 function restore(link=null){
  target=link?.itemId?{...link,prepared:true}:null;
  discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
  const select=$('#kitOptimizeMainSku');
  select.replaceChildren(new Option('Selecione o SKU principal',''));
  for(const x of ctx().prepared?.kit?.components||[])
   select.append(new Option(x.sku+' · '+x.name,x.sku));
  if(link?.mainSku&&[...select.options].some(o=>o.value===link.mainSku))
   select.value=link.mainSku;
  $('#kitOptimizeListingSku').value=link?.sku||kitSku();
  $('#kitOptimizeCandidates').replaceChildren();
  $('#kitOptimizeConfirm').checked=false;
  $('#kitOptimizeSelected').textContent=link?.itemId?
   'Anúncio vinculado: Item ID '+link.itemId+' · SKU '+link.sku+' · Modelo '+link.modelId:
   'Escolha o Item ID do anúncio de kit que já está em Produtos Shopee.';
  paint();
 }
 async function lookup(){
  const {kitSaved}=ctx(),code=$('#kitOptimizeListingSku').value.trim(),current=kitSku();
  if(busy||!kitSaved||!current)return;
  if(!code)return notice('Informe a SKU exata do anúncio existente.','error');
  busy=true;target=null;discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
  $('#kitOptimizeConfirm').checked=false;paint();
  const root=$('#kitOptimizeCandidates');root.replaceChildren();
  notice('Consultando a SKU '+code+' no catálogo Shopee...');
  try{
   const data=await api('/api/shopee/optimizer/find?'+new URLSearchParams({sku:code,deep:'1'}));
   if(kitSku()!==current)return;
   const matches=(data.matches||[]).filter(x=>['NORMAL','UNLIST'].includes(String(x.status).toUpperCase()));
   if(!matches.length)throw Error('Anúncio não encontrado como ativo. Confira em Produtos Shopee.');
   for(const m of matches){
    const button=document.createElement('button');button.type='button';button.className='kit-secondary';
    button.textContent='Item ID '+m.itemId+' · '+(m.title||code)+' · Modelo '+String(m.modelId??'0');
    button.addEventListener('click',()=>{
     if(kitSku()!==current)return;
     target={kitSku:current,sku:code,itemId:String(m.itemId),modelId:String(m.modelId??'0'),prepared:false};
     $('#kitOptimizeConfirm').checked=false;
     $('#kitOptimizeSelected').textContent='SELECIONADO: '+(m.title||code)+' | Item ID '+m.itemId+
      ' · Modelo '+String(m.modelId??'0');
     notice('Confira se este anúncio representa o kit completo, depois confirme.','info');
     paint();
    });
    root.append(button);
   }
   notice(matches.length+' anúncio(s) encontrado(s). Selecione o Item ID correto.','success');
  }catch(e){notice('Consulta não concluída: '+e.message,'error');}
  finally{busy=false;paint();}
 }
 async function prepare(){
  if(busy||!target||!ctx().kitSaved)return;
  if(!$('#kitOptimizeConfirm').checked)return notice('Confirme o Item ID do kit.','error');
  const primary=$('#kitOptimizeMainSku').value;
  if(!primary)return notice('Selecione o SKU principal WeDrop.','error');
  const selected={...target},current=kitSku();
  busy=true;paint();notice('Revalidando custo completo do kit e anúncio Shopee...');
  try{
   const result=await api('/api/shopee/kits/optimization/prepare',{body:{
    kitSku:current,sku:selected.sku,itemId:selected.itemId,modelId:selected.modelId,
    mainSku:primary,confirmedItemId:selected.itemId
   }});
   if(kitSku()!==current)return;
   target={kitSku:current,...result.target,prepared:true};
   discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
   notice('✓ Item ID '+result.target.itemId+' vinculado. Custo total do kit: '+
    money(result.quote.kitCost)+'. Revise o título, as imagens e os campos fiscais. '+
    (result.warnings||[]).join(' '),'success');
  }catch(e){notice('Preparação bloqueada: '+e.message,'error');}
  finally{busy=false;paint();}
 }
 async function convert(data){
  const response=await fetch(data),blob=await response.blob();
  if(['image/png','image/jpeg'].includes(blob.type))return blob;
  const image=new Image();image.src=data;await image.decode();
  const canvas=document.createElement('canvas');
  canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  canvas.getContext('2d').drawImage(image,0,0);
  const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!png)throw Error('Não foi possível converter esta foto em PNG.');
  return png;
 }
 async function transferImages(){
  if(busy||!target?.prepared)return;
  const selected={...target},current=kitSku(),{images,kitPhotoStore}=ctx();
  busy=true;paint();
  try{
   const saved=await kitPhotoStore.list(current);
   for(const row of saved){
    if(Number.isInteger(row.slot)&&row.slot>=1&&row.slot<=9&&!images.has(row.slot))
     images.set(row.slot,row.dataUrl);
   }
   if(Array.from({length:9},(_,i)=>i+1).some(n=>!images.has(n)))
    throw Error('Complete as nove imagens do kit antes de importar para revisão.');
   if(!window.confirm('Importar 9 imagens para a REVISÃO do Item ID '+selected.itemId+
    '? A Shopee ainda não terá imagens publicadas.'))return;
   for(let slot=1;slot<=9;slot++){
    if(kitSku()!==current||target?.itemId!==selected.itemId)
     throw Error('O kit ou Item ID mudou durante a importação.');
    notice('Importando imagem '+slot+'/9 para a revisão do Item ID '+selected.itemId+'...');
    const blob=await convert(images.get(slot));
    const params=new URLSearchParams({kit_sku:current,slot:String(slot)});
    const response=await fetch('/api/shopee/kits/optimization/image?'+params,{
     method:'POST',headers:{'Content-Type':blob.type},body:blob
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error('Imagem '+slot+': '+(result.error||'não confirmada'));
   }
   notice('✓ Nove imagens preparadas no otimizador. Falta revisar e executar.','success');
  }catch(e){notice('Importação interrompida: '+e.message+
   '. As imagens já confirmadas permanecem armazenadas.','error');}
  finally{busy=false;paint();}
 }
 function open(){
  if(!target?.prepared||target.kitSku!==kitSku())
   return notice('Prepare o vínculo do anúncio antes de abrir a revisão.','error');
  if(typeof globalThis.redeKitOpenOptimizerTarget!=='function'||
    !globalThis.redeKitOpenOptimizerTarget({...target,
     targetMarginPct:Number(ctx().prepared?.kit?.quote?.targetMarginPct),
     shipping:Number(ctx().prepared?.kit?.shipping||0),
     packing:Number(ctx().prepared?.kit?.packing||0)}))
   notice('Não foi possível abrir a Otimização. Atualize a página e tente novamente.','error');
 }
 function discountNotice(msg,state='info'){
  const el=$('#kitOptimizeDiscountStatus');if(el){el.textContent=msg;el.dataset.state=state;}
 }
 async function previewDiscount(){
  if(busy||!target?.prepared)return;
  const current=kitSku(),discountId=$('#kitOptimizeDiscountId').value.trim();
  if(!/^[1-9]\d{0,17}$/.test(discountId))
   return discountNotice('Informe o ID válido da Minha Promoção Shopee.','error');
  busy=true;discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;paint();
  discountNotice('Conferindo a execução do kit, valores e campanha na Shopee...');
  try{
   const result=await api('/api/shopee/kits/discount/preview',{body:{kitSku:current,discountId}});
   if(kitSku()!==current)return;
   discountToken=result.token;
   $('#kitOptimizeDiscountSummary').textContent=[
    'Kit: '+current,'Anúncio Item ID: '+result.itemId,
    'Campanha: '+result.discountName+' (ID '+result.discountId+')',
    'Preço bruto: '+money(result.gross),'Preço promocional: '+money(result.promo),
    'Preço após cupom (estimado): '+money(result.afterCoupon),
    'Margem líquida estimada: '+Number(result.margin).toFixed(2)+'%',
    'Ofertas comparáveis verificadas: '+result.marketOffers,
    'Ação: '+(result.action==='update'?'Atualizar desconto':'Incluir nesta promoção'),
    'A Shopee ainda NÃO foi alterada.'
   ].join('\n');
   $('#kitOptimizeDiscountBox').hidden=false;
   discountNotice('Prévia confirmada. Confira os valores e autorize no botão abaixo.','success');
  }catch(e){discountNotice('Desconto bloqueado: '+e.message,'error');}
  finally{busy=false;paint();}
 }
 async function applyDiscount(){
  if(!target?.prepared||!discountToken||busy)return;
  const current=kitSku(),discountId=$('#kitOptimizeDiscountId').value.trim();
  if(!window.confirm('Aplicar desconto do kit '+current+' na campanha '+discountId+
   '? Esta ação ALTERA o anúncio existente na Shopee. Confirme somente após revisar os valores.'))return;
  const token=discountToken;discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
  busy=true;paint();discountNotice('Enviando desconto à Shopee; não repita se a resposta for incerta...');
  try{
   const result=await api('/api/shopee/kits/discount/execute',{body:{
    kitSku:current,discountId,token,confirm:true
   }});
   discountNotice(result.status==='discount_confirmed'?
    '✓ Desconto confirmado no anúncio '+result.itemId+' · Preço '+money(result.promo):
    (result.message||'Resposta pendente de conferência na Shopee.'),
    result.status==='discount_confirmed'?'success':'info');
  }catch(e){discountNotice('Status não confirmado: '+e.message+
   '. Confira Minha Promoção na Shopee ANTES de reenviar.','error');}
  finally{busy=false;paint();}
 }
 $('#kitOptimizeDiscountPreview')?.addEventListener('click',()=>void previewDiscount());
 $('#kitOptimizeDiscountApply')?.addEventListener('click',()=>void applyDiscount());
 $('#kitOptimizeDiscountId')?.addEventListener('input',()=>{
  discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
 });
 $('#kitOptimizeLookup')?.addEventListener('click',()=>void lookup());
 $('#kitOptimizePrepare')?.addEventListener('click',()=>void prepare());
 $('#kitOptimizeImages')?.addEventListener('click',()=>void transferImages());
 $('#kitOptimizeOpen')?.addEventListener('click',open);
 $('#kitOptimizeConfirm')?.addEventListener('change',paint);
 $('#kitOptimizeMainSku')?.addEventListener('change',()=>{if(target)target.prepared=false;onMainSkuChange?.($('#kitOptimizeMainSku').value);paint();});
 $('#kitOptimizeListingSku')?.addEventListener('input',()=>{
  target=null;discountToken=null;$('#kitOptimizeDiscountBox').hidden=true;
  $('#kitOptimizeConfirm').checked=false;
  $('#kitOptimizeSelected').textContent='SKU alterada. Localize novamente o anúncio correto.';
  paint();
 });
 return {restore};
}
