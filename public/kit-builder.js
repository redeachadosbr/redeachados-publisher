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
let marginTimer=null,marginRevision=0,suggestionContext=null,marginUpdatePending=false;
const MARGIN_MIN=0,MARGIN_MAX=70;
function normalizeKitMargin(value){
 return Math.max(MARGIN_MIN,Math.min(MARGIN_MAX,Math.round(Number(value)||0)));
}
function setKitMargin(value,{recalculate=false}={}){
 const slider=$('#kitMargin'),number=normalizeKitMargin(value);
 slider.value=String(number);
 slider.style.setProperty('--kit-margin-fill',((number-MARGIN_MIN)/(MARGIN_MAX-MARGIN_MIN)*100).toFixed(2)+'%');
 slider.setAttribute('aria-valuetext',number+' por cento');
 $('#kitMarginLabel').textContent=number+'%';
 $('#kitMarginMinus').disabled=number===MARGIN_MIN;
 $('#kitMarginPlus').disabled=number===MARGIN_MAX;
 if(recalculate)scheduleKitMarginReprice();
}
function scheduleKitMarginReprice(){
 marginRevision++;
 if(marginTimer)clearTimeout(marginTimer);
 if(!suggestions.length&&!prepared){
  status('Margem ajustada para '+$('#kitMargin').value+'%. Clique em Pesquisar kits inteligentes para calcular os valores.','info');
  return;
 }
 marginUpdatePending=true;
 $('#kitSaveDraft').disabled=true;
 status('Margem ajustada para '+$('#kitMargin').value+'%. Atualizando os preços e o lucro dos kits pela calculadora Shopee...','info');
 marginTimer=setTimeout(()=>void repriceKitMargin(marginRevision),420);
}
function refreshKitPrices(kit){
 refreshKitPrices(kit);
}
async function repriceKitMargin(revision){
 try{
  const settings=currentSettings();
  const calls=[];
  const context=suggestionContext;
  if(suggestions.length&&context&&context.category===$('#kitCategory').value&&context.size===Number($('#kitSize').value)){
   const current=suggestions.map(kit=>kit.components.map(p=>p.sku));
   calls.push(api('/api/shopee/kits/plus-import',{body:{
    category:context.category,size:context.size,kits:current,...settings
   }}).then(data=>({kind:'suggestions',data})));
  }
  if(prepared){
   calls.push(api('/api/shopee/kits/prepare',{body:{
    skus:prepared.kit.components.map(x=>x.sku),...settings
   }}).then(data=>({kind:'prepared',data})));
  }
  const outcomes=await Promise.all(calls);
  if(revision!==marginRevision)return;
  for(const outcome of outcomes){
   if(outcome.kind==='suggestions'){
    const reasons=new Map(suggestions.map(k=>[k.components.map(p=>p.sku).sort().join('|'),k.businessReason]));
    const repriced=outcome.data.results.map(k=>({
     ...k,businessReason:reasons.get(k.components.map(p=>p.sku).sort().join('|'))||k.businessReason
    }));
    renderSuggestions({...outcome.data,results:repriced,source:context.source});
   }
   if(outcome.kind==='prepared'){
    if(outcome.data.kit.kitSku!==prepared.kit.kitSku)throw Error('A cotação retornou um kit diferente.');
    prepared={...prepared,kit:outcome.data.kit};
    refreshKitPrices(prepared.kit); // Preserva textos já editados e imagens importadas.
    $('#kitWarning').textContent=prepared.kit.warning+
     ' Os preços foram recalculados para a margem escolhida e NÃO foram enviados à Shopee.';
   }
  }
  status('✓ Margem manual '+$('#kitMargin').value+'% aplicada aos kits. Preços, descontos e lucro líquido recalculados com centavos 0/9.','success');
 }catch(error){
  if(revision===marginRevision)status('Não foi possível recalcular a margem: '+error.message+'. Tente pesquisar novamente; valores antigos não devem ser publicados.','error');
 }finally{
  if(revision===marginRevision){
   marginUpdatePending=false;
   $('#kitSaveDraft').disabled=false;
  }
 }
}
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
 if(!Number.isFinite(marginPct)||marginPct<MARGIN_MIN||marginPct>MARGIN_MAX)throw Error('Margem deve ficar entre 0% e 70%.');
 if(!Number.isFinite(packing)||packing<0||packing>500||!Number.isFinite(shipping)||shipping<0||shipping>500)
  throw Error('Custos adicionais devem estar entre R$ 0 e R$ 500.');
 return {marginPct,packing,shipping,useAi:false};
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
   ['Preço exibido Shopee',money(kit.quote.marketplacePrice)],
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
  setKitMargin(d.kit.quote.targetMarginPct);
  $('#kitPacking').value=String(d.kit.packing);
  $('#kitShipping').value=String(d.kit.shipping);
  renderKit();
  status('Rascunho recuperado. Custos foram recalculados; confira preços e estoque antes de anunciar.','success');
 }catch(error){status('Não foi possível recuperar o kit: '+error.message,'error');}
}
async function saveDraft(){
 if(!prepared)return;
 if(marginUpdatePending){status('Finalize o recálculo da barra de margem antes de salvar o kit.','error');return;}
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
 if(marginTimer)clearTimeout(marginTimer);
 marginRevision++;marginUpdatePending=false;$('#kitSaveDraft').disabled=false;
 const btn=$('#kitSuggest');btn.disabled=true;prepared=null;
 $('#kitDetail').hidden=true;
 try{
  const data=await api('/api/shopee/kits/suggest',{body:{
   category:$('#kitCategory').value,size:Number($('#kitSize').value),...currentSettings()
  }});
  suggestionContext={category:$('#kitCategory').value,size:Number($('#kitSize').value),source:data.source};
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
  if(p.imageUrl){
   const link=elt('a','kit-reference-link','Abrir foto WeDrop para anexar no ChatGPT');
   link.href=p.imageUrl;link.target='_blank';link.rel='noopener noreferrer';
   text.append(link);
  }
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
 if(!prepared)return;
 for(let slot=1;slot<=9;slot++){
  const card=elt('div','kit-image-card'),image=images.get(slot);
  card.append(elt('strong','', 'Imagem '+String(slot).padStart(2,'0')));
  if(image){
   const pic=elt('img');pic.src=image;pic.alt='Imagem '+slot+' do kit importada para revisão';card.append(pic);
   const download=elt('button','kit-secondary','Baixar PNG '+slot);
   download.addEventListener('click',()=>downloadData(image,
    prepared.kit.kitSku+'-foto-'+String(slot).padStart(2,'0')+'.png'));
   card.append(download);
  }else card.append(elt('div','kit-placeholder','Imagem '+slot+' · gere no ChatGPT Plus e importe aqui'));
  const prompt=elt('button','kit-secondary','Copiar prompt + abrir ChatGPT');
  prompt.type='button';
  prompt.addEventListener('click',()=>chatgptHandoff(prepared.creative.prompts[slot-1]));
  card.append(prompt);
  const details=elt('details','kit-prompt-fallback');
  const summary=elt('summary','','Ver prompt para copiar manualmente');
  const field=elt('textarea');field.readOnly=true;field.rows=5;
  field.value=prepared.creative.prompts[slot-1];
  details.append(summary,field);card.append(details);
  const chooser=elt('input','kit-photo-upload');chooser.type='file';
  chooser.accept='image/png,image/jpeg,image/webp';
  chooser.setAttribute('aria-label','Importar foto '+slot+' gerada no ChatGPT Plus');
  chooser.addEventListener('change',()=>void uploadPhoto(slot,chooser.files?.[0]));
  card.append(chooser);
  root.append(card);
 }
}
function chatgptHandoff(prompt){
 // A aba precisa abrir no clique, não depois de um await, para que o
 // navegador não a bloqueie. Nenhuma credencial ou cookie é repassado.
 // Solicitar a cópia ainda com foco nesta aba, antes de abrir o ChatGPT.
 const copying=navigator.clipboard.writeText(prompt);
 window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
 copying.then(()=>{
  imageStatus('Prompt copiado. No ChatGPT Plus, cole com Ctrl+V; para imagens, anexe as fotos originais de TODAS as SKUs. Ao terminar, volte e importe o resultado.','success');
 }).catch(()=>imageStatus('Cópia automática bloqueada: utilize os botões de copiar ou selecione o prompt no campo.','error'));
 // Por segurança a nova aba não recebe acesso à janela da loja.
 // Com noopener o navegador pode retornar null mesmo tendo aberto a aba.
}
async function uploadPhoto(slot,file){
 if(!file)return;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){
  imageStatus('Imagem '+slot+': envie PNG, JPG ou WebP até 12 MB.','error');return;
 }
 try{
  const bitmap=await createImageBitmap(file);
  try{
   const canvas=document.createElement('canvas');
   canvas.width=1200;canvas.height=1200;
   const ctx=canvas.getContext('2d');
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1200,1200);
   const scale=Math.min(1200/bitmap.width,1200/bitmap.height);
   const w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);
   ctx.drawImage(bitmap,Math.floor((1200-w)/2),Math.floor((1200-h)/2),w,h);
   images.set(slot,canvas.toDataURL('image/png'));
  }finally{bitmap.close();}
  renderImageSlots();
  imageStatus('Imagem '+slot+' importada em PNG 1200 × 1200 para conferência. Imagens permanecem nesta aba e não são publicadas.','success');
 }catch(error){imageStatus('Falha ao importar imagem: '+error.message,'error');}
}
async function plusResearch(){
 const btn=$('#kitPlusResearch');btn.disabled=true;
 try{
  const r=await api('/api/shopee/kits/plus-brief',{body:{
   category:$('#kitCategory').value,size:Number($('#kitSize').value)
  }});
  $('#kitResearchPrompt').value=r.prompt;
  status('Pesquisa preparada com '+r.candidatesCount+' SKUs reais. Clique em "Copiar prompt + abrir ChatGPT Plus" e cole o texto no chat.','success');
 }catch(error){status(error.message,'error');}
 finally{btn.disabled=false;}
}
async function importPlusSuggestions(){
 const btn=$('#kitPlusImport');btn.disabled=true;
 try{
  const size=Number($('#kitSize').value);
  const lines=$('#kitPlusOutput').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length||lines.length>8)throw Error('Cole entre 1 e 8 linhas com SKUs reais.');
  const kits=lines.map(l=>{
   const sku=l.replace(/^[•*-\s]+/,'').split('|').map(x=>x.trim()).filter(Boolean);
   if(sku.length!==size||new Set(sku).size!==size)throw Error('Cada linha precisa conter '+size+' SKUs diferentes separados por |.');
   return sku;
  });
  const r=await api('/api/shopee/kits/plus-import',{body:{
   category:$('#kitCategory').value,size,kits,...currentSettings()
  }});
  suggestionContext={category:$('#kitCategory').value,size,source:r.source};
  renderSuggestions(r);
  status('Sugestões do ChatGPT Plus recebidas. Todos os SKUs e custos foram revalidados pelo sistema.','success');
 }catch(error){status('Não foi possível importar sugestões: '+error.message,'error');}
 finally{btn.disabled=false;}
}
async function plusText(){
 if(!prepared)return;
 const btn=$('#kitPlusText');btn.disabled=true;
 try{
  const r=await api('/api/shopee/kits/plus-content',{body:{
   skus:prepared.kit.components.map(x=>x.sku),...currentSettings()
  }});
  if(r.kitSku!==prepared.kit.kitSku)throw Error('SKU de kit diferente.');
  $('#kitContentPrompt').value=r.prompt;
  status('Orientação pronta. Clique em "Copiar orientação + abrir ChatGPT Plus" e depois importe a resposta neste painel.','success');
 }catch(error){status('Não foi possível preparar texto: '+error.message,'error');}
 finally{btn.disabled=false;}
}
function importPlusText(){
 if(!prepared)return;
 const raw=$('#kitPlusTextResult').value.trim();
 const title=raw.match(/(?:^|\n)\s*(?:T[ÍI]TULO)\s*:\s*(.+)/i);
 const start=raw.search(/(?:^|\n)\s*DESCRI[ÇC][ÃA]O\s*:/i);
 if(!title||start<0){
  status('A resposta precisa ter TÍTULO: e DESCRIÇÃO: para evitar importar texto incompleto.','error');return;
 }
 const description=raw.slice(start).replace(/^\s*DESCRI[ÇC][ÃA]O\s*:\s*/i,'').trim();
 if(title[1].trim().length<10||title[1].trim().length>120||description.length<80||description.length>2000){
  status('Título de 10 a 120 caracteres e descrição de 80 a 2000 caracteres são necessários.','error');return;
 }
 $('#kitTitle').value=title[1].trim();
 $('#kitDescription').value=description;
 status('Título e descrição importados para revisão. Salve o rascunho quando estiverem corretos.','success');
}

async function prepare(kit){
 if(generationBusy||marginUpdatePending)return;
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
function openChatGPTImages(){
 if(!prepared)return;
 chatgptHandoff(prepared.creative.prompts.join('\n\n--- PRÓXIMA IMAGEM ---\n\n'));
 imageStatus('Copiadas as nove instruções. Gere e importe cada imagem separadamente; anexe ao ChatGPT as fotos de referência de todas as SKUs.','success');
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
// Mesmo mecanismo da barra de Otimização: arraste, toque ou use as setas.
$('#kitMargin')?.addEventListener('input',()=>setKitMargin($('#kitMargin').value,{recalculate:true}));
for(const [selector,step] of [['#kitMarginPlus',1],['#kitMarginMinus',-1]]){
 $(selector)?.addEventListener('click',()=>setKitMargin(Number($('#kitMargin').value)+step,{recalculate:true}));
}
setKitMargin($('#kitMargin').value);
$('#kitSuggest')?.addEventListener('click',()=>void search());
$('#kitPlusResearch')?.addEventListener('click',()=>void plusResearch());
$('#kitPlusImport')?.addEventListener('click',()=>void importPlusSuggestions());
$('#kitOpenResearchPrompt')?.addEventListener('click',()=>{
 const prompt=$('#kitResearchPrompt').value;
 if(prompt)chatgptHandoff(prompt);else status('Prepare primeiro a pesquisa com os SKUs WeDrop.','error');
});
$('#kitOpenContentPrompt')?.addEventListener('click',()=>{
 const prompt=$('#kitContentPrompt').value;
 if(prompt)chatgptHandoff(prompt);else status('Prepare primeiro o prompt de título e descrição.','error');
});
$('#kitPlusText')?.addEventListener('click',()=>void plusText());
$('#kitImportText')?.addEventListener('click',importPlusText);

$('#kitGenerateAll')?.addEventListener('click',openChatGPTImages);
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
