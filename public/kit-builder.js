// Kits Inteligentes WeDrop — somente prévias, não executa escrita Shopee.
const $=s=>document.querySelector(s);
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=n=>Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const status=(v,state='info')=>{const el=$('#kitStatus');if(el){el.textContent=v;el.dataset.state=state;}};
const imageStatus=(v,state='info')=>{const el=$('#kitImageStatus');el.textContent=v;el.dataset.state=state;};
async function api(path,{body,signal}={}){
 const response=await fetch(path,{
  ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),
  ...(signal?{signal}:{})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Consulta não concluída.');
 return data;
}
let categoriesLoaded=false,suggestions=[],prepared=null,images=new Map(),generationBusy=false;
function elt(tag,className='',text=''){
 const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;
}
function addImage(parent,product){
 if(product.imageUrl){
  const img=elt('img');img.alt='Fotografia WeDrop de '+product.name;img.src=product.imageUrl;
  img.loading='lazy';img.referrerPolicy='no-referrer';parent.append(img);
 }else parent.append(elt('span','', 'Sem foto'));
}
function currentSettings(){
 const marginPct=Number($('#kitMargin').value),packing=Number($('#kitPacking').value),
 shipping=Number($('#kitShipping').value);
 if(!Number.isFinite(marginPct)||marginPct<5||marginPct>65)throw Error('Margem deve ficar entre 5% e 65%.');
 if(!Number.isFinite(packing)||packing<0||packing>500||!Number.isFinite(shipping)||shipping<0||shipping>500)
  throw Error('Custos adicionais devem estar entre R$ 0 e R$ 500.');
 return {marginPct,packing,shipping,useAi:$('#kitUseAi').checked};
}
async function categories(){
 if(categoriesLoaded)return;
 categoriesLoaded=true;
 try{
  const data=await api('/api/shopee/kits/catalog?category=Todos&limit=1');
  const select=$('#kitCategory'),keep=select.value;
  select.replaceChildren();
  for(const name of data.categories){
   const option=elt('option','',name);option.value=name;select.append(option);
  }
  select.value=data.categories.includes(keep)?keep:data.categories.includes('Brinquedos')?'Brinquedos':'Todos';
  status(data.catalogCount+' SKUs com custos conferidos na WeDrop. Escolha a categoria e inicie a pesquisa.','success');
 }catch(error){categoriesLoaded=false;status('Não foi possível acessar as categorias: '+error.message,'error');}
}
function renderSuggestions(data){
 suggestions=data.results||[];
 const root=$('#kitSuggestions');root.replaceChildren();
 $('#kitSource').textContent='Origem: '+data.source;
 if(!suggestions.length){root.append(elt('p','', 'Nenhum kit confiável encontrado com esses filtros. Experimente outra categoria.'));return;}
 for(const [index,kit] of suggestions.entries()){
  const card=elt('article','kit-card');
  const pics=elt('div','kit-picture-row');
  kit.components.forEach(p=>addImage(pics,p));card.append(pics);
  card.append(elt('strong','',kit.components.map(p=>p.name).join(' + ')));
  card.append(elt('small','',kit.components.map(p=>'SKU '+p.sku+' · '+money(p.unitCost)).join(' | ')));
  const pricing=elt('div','kit-mini-prices');
  const pairs=[['Custo WeDrop (soma)',money(kit.componentCost)],
   ['Anúncio bruto',money(kit.quote.grossPrice)],
   ['Shopee após 20% / plano',money(kit.quote.marketplacePrice)],
   ['Lucro líquido estimado',money(kit.quote.netProfit)]];
  for(const [label,value] of pairs){
   const cell=elt('div');cell.append(elt('span','',label),elt('b','',value));pricing.append(cell);
  }
  card.append(pricing);
  card.append(elt('small','',pct(kit.quote.netMarginPct)+' margem · '+kit.businessReason));
  const open=elt('button','kit-primary','Preparar kit e anúncio →');open.type='button';
  open.addEventListener('click',()=>void prepare(kit));
  card.append(open);root.append(card);
 }
}
async function loadDrafts(){
 const root=$('#kitDraftList');if(!root)return;
 try{
  const data=await api('/api/shopee/kits/drafts');
  root.replaceChildren();
  if(!data.drafts.length){root.append(elt('p','','Nenhum kit salvo. Prepare uma opção e clique em Salvar rascunho.'));return;}
  for(const draft of data.drafts){
   const card=elt('article','kit-card');
   card.append(elt('strong','',draft.title||draft.kitSku));
   card.append(elt('small','',draft.kitSku+' · '+draft.skus.join(' + ')));
   card.append(elt('small','',draft.updatedAt?'Atualizado '+new Date(draft.updatedAt).toLocaleString('pt-BR'):'Rascunho'));
   if(draft.quote){
    const pricing=elt('div','kit-mini-prices');
    for(const [name,value] of [['Preço bruto',money(draft.quote.grossPrice)],
      ['Lucro líquido estimado',money(draft.quote.netProfit)]]){
     const cell=elt('div');cell.append(elt('span','',name),elt('b','',value));pricing.append(cell);
    }
    card.append(pricing);
   }
   const btn=elt('button','kit-secondary','Reabrir e recalcular custo');
   btn.addEventListener('click',()=>void openDraft(draft.kitSku));
   card.append(btn);root.append(card);
  }
 }catch(error){root.replaceChildren(elt('p','', 'Rascunhos indisponíveis: '+error.message));}
}
async function openDraft(kitSku){
 status('Recuperando '+kitSku+' e recalculando com preços WeDrop atuais...');
 try{
  const d=await api('/api/shopee/kits/drafts/load',{body:{kitSku}});
  prepared=d;images.clear();
  $('#kitMargin').value=String(d.kit.quote.targetMarginPct);
  $('#kitPacking').value=String(d.kit.packing);
  $('#kitShipping').value=String(d.kit.shipping);
  renderKit();
  status('Rascunho recuperado. Custos foram recalculados; confira preços e estoque antes de anunciar.','success');
 }catch(error){status('Não foi possível recuperar o kit: '+error.message,'error');}
}
async function saveDraft(){
 if(!prepared)return;
 const b=$('#kitSaveDraft');b.disabled=true;
 try{
  const res=await api('/api/shopee/kits/drafts/save',{body:{
   skus:prepared.kit.components.map(x=>x.sku),
   ...currentSettings(),title:$('#kitTitle').value,description:$('#kitDescription').value
  }});
  if(!res.saved)throw Error('O servidor não confirmou a gravação do rascunho.');
  status('✓ Rascunho '+res.kitSku+' salvo nesta loja. A Shopee não foi alterada.','success');
  void loadDrafts();
 }catch(error){status('Não foi possível salvar kit: '+error.message,'error');}
 finally{b.disabled=false;}
}
async function search(){
 if(generationBusy)return;
 const btn=$('#kitSuggest');btn.disabled=true;prepared=null;
 $('#kitDetail').hidden=true;
 try{
  const data=await api('/api/shopee/kits/suggest',{body:{
   category:$('#kitCategory').value,size:Number($('#kitSize').value),...currentSettings()
  }});
  renderSuggestions(data);
  status('Análise concluída: '+suggestions.length+' opções. '+data.disclaimer,'success');
 }catch(error){status(error.message,'error');}
 finally{btn.disabled=false;}
}
function renderKit(){
 if(!prepared)return;
 const {kit,creative}=prepared;
 $('#kitDetail').hidden=false;
 $('#kitSkuTitle').textContent=kit.kitSku;
 const items=$('#kitComponents');items.replaceChildren();
 for(const p of kit.components){
  const card=elt('div','kit-component');addImage(card,p);
  const text=elt('div');text.append(elt('strong','',p.name),
    elt('small','','')); // Corrigido imediatamente abaixo sem HTML dinâmico.
  text.lastChild.textContent='SKU '+p.sku+' · 1 unidade · Custo '+money(p.unitCost);
  card.append(text);items.append(card);
 }
 const prices=$('#kitNumbers');prices.replaceChildren();
 for(const [label,value] of [
  ['Custos dos produtos',money(kit.componentCost)],
  ['Custo total com extras',money(kit.kitCost)],
  ['Preço bruto',money(kit.quote.grossPrice)],
  ['Desconto base',pct(kit.quote.discountPct)],
  ['Vitrine Shopee',money(kit.quote.marketplacePrice)],
  ['Com cupom',money(kit.quote.afterCoupon)],
  ['Lucro líquido',money(kit.quote.netProfit)],
  ['Margem líquida',pct(kit.quote.netMarginPct)]
 ]){
  const cell=elt('div');cell.append(elt('span','',label),elt('b','',value));prices.append(cell);
 }
 $('#kitWarning').textContent=kit.warning+' Texto criado por '+creative.source+'. Verifique estoque e capacidade de envio de vários SKUs.';
 $('#kitTitle').value=creative.title;
 $('#kitDescription').value=creative.description;
 renderImageSlots();
 $('#kitDetail').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderImageSlots(){
 const root=$('#kitImages');root.replaceChildren();
 for(let slot=1;slot<=9;slot++){
  const card=elt('div','kit-image-card'),image=images.get(slot);
  card.append(elt('strong','', 'Imagem '+String(slot).padStart(2,'0')));
  if(image){
   const pic=elt('img');pic.src='data:image/png;base64,'+image;pic.alt='Imagem '+slot+' do kit gerada pela IA';card.append(pic);
   const download=elt('button','kit-secondary','Baixar PNG '+slot);
   download.addEventListener('click',()=>downloadData('data:image/png;base64,'+image,
    prepared.kit.kitSku+'-foto-'+String(slot).padStart(2,'0')+'.png'));
   card.append(download);
  }else{
   card.append(elt('div','kit-placeholder','Fotografia comercial '+slot+' ainda não gerada'));
   const generate=elt('button','kit-secondary','Gerar esta foto');
   generate.disabled=generationBusy;
   generate.addEventListener('click',()=>void generatePhoto(slot));
   card.append(generate);
  }
  const prompt=elt('button','kit-secondary','Copiar prompt '+slot);
  prompt.disabled=generationBusy;
  prompt.addEventListener('click',()=>void copy(prepared.creative.prompts[slot-1]));
  card.append(prompt);root.append(card);
 }
}
async function prepare(kit){
 if(generationBusy)return;
 status('Gerando composição comercial do kit '+kit.kitSku+'...', 'info');
 try{
  const data=await api('/api/shopee/kits/prepare',{body:{
   skus:kit.components.map(x=>x.sku),...currentSettings()
  }});
  prepared=data;images.clear();renderKit();
  status('Kit '+data.kit.kitSku+' preparado para revisão. Nenhum anúncio criado na Shopee.','success');
 }catch(error){status('Preparação não concluída: '+error.message,'error');}
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);imageStatus('Texto copiado para a área de transferência.','success');}
 catch{imageStatus('O navegador bloqueou a cópia. Selecione e copie manualmente o conteúdo.','error');}
}
function downloadData(url,name){
 const a=elt('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
}
async function generatePhoto(slot){
 if(!prepared||generationBusy)return false;
 generationBusy=true;renderImageSlots();$('#kitGenerateAll').disabled=true;
 imageStatus('Gerando imagem '+slot+'/9 com referências WeDrop das '+prepared.kit.components.length+' SKUs...', 'info');
 try{
  const result=await api('/api/shopee/kits/image',{body:{
   skus:prepared.kit.components.map(x=>x.sku),slot,...currentSettings()
  }});
  if(result.kitSku!==prepared.kit.kitSku)throw Error('Imagem retornou uma SKU de kit diferente.');
  images.set(slot,result.base64);
  imageStatus('Foto '+slot+' disponível para baixar. Confira cada componente antes de aprovar.','success');
  return true;
 }catch(error){imageStatus('Foto '+slot+' não gerada: '+error.message,'error');return false;}
 finally{generationBusy=false;$('#kitGenerateAll').disabled=false;renderImageSlots();}
}
async function generateAll(){
 if(!prepared||generationBusy)return;
 $('#kitGenerateAll').disabled=true;
 try{
  for(let i=1;i<=9;i++){
   if(images.has(i))continue;
   const ok=await generatePhoto(i);
   if(!ok)break;
  }
  if(images.size===9)imageStatus('As 9 fotografias foram geradas. Confira fidelidade e baixe cada PNG; não foram enviadas à Shopee.','success');
 }finally{$('#kitGenerateAll').disabled=false;}
}
function exportPack(){
 if(!prepared)return;
 const {kit,creative}=prepared;
 const txt=[
  'REDE ACHADOS BR – FICHA DE KIT',kit.kitSku,
  'ORIGEM: WE DROP – somente SKUs reais',
  'ITENS:',...kit.components.map(p=>'1x '+p.sku+' — '+p.name+' — '+money(p.unitCost)),
  'Custo produtos: '+money(kit.componentCost),
  'Custo extra: '+money(kit.packing+kit.shipping),
  'Preço bruto: '+money(kit.quote.grossPrice),
  'Desconto base: '+pct(kit.quote.discountPct),
  'Preço Shopee: '+money(kit.quote.marketplacePrice),
  'Após cupom: '+money(kit.quote.afterCoupon),
  'Lucro líquido estimado: '+money(kit.quote.netProfit),
  'Margem líquida estimada: '+pct(kit.quote.netMarginPct),
  'AVISO: sem comprovação de demanda, frete de kit ou estoque; não publicado.',
  'TÍTULO:', $('#kitTitle').value,'DESCRIÇÃO:',$('#kitDescription').value,
  ...creative.prompts.map((p,i)=>'\n===== IMAGEM '+(i+1)+' =====\n'+p)
 ].join('\n');
 const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 downloadData(url,kit.kitSku+'-ficha-prompts.txt');
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$('#kitSuggest')?.addEventListener('click',()=>void search());
$('#kitGenerateAll')?.addEventListener('click',()=>void generateAll());
$('#kitDownloadPack')?.addEventListener('click',exportPack);
$('#kitSaveDraft')?.addEventListener('click',()=>void saveDraft());
$('#kitRefreshDrafts')?.addEventListener('click',()=>void loadDrafts());
$('#kitCopyTitle')?.addEventListener('click',()=>void copy($('#kitTitle').value));
$('#kitCopyDescription')?.addEventListener('click',()=>void copy($('#kitDescription').value));
$('#kitCopyAllPrompts')?.addEventListener('click',()=>prepared&&void copy(prepared.creative.prompts.join('\n\n\n')));
$('#kitClose')?.addEventListener('click',()=>{$('#kitDetail').hidden=true;});
window.RAKitBuilderLoad=()=>{void categories();void loadDrafts();};
if(location.pathname.replace(/\/$/,'').endsWith('/kits'))window.RAKitBuilderLoad();
document.querySelector('a[data-tab="kits"]')?.addEventListener('click',()=>window.RAKitBuilderLoad());
