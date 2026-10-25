// Editor de variações por SKU. Mídia e publicação por API com confirmação; jamais auto-publica.
(()=>{
'use strict';
const el=(tag,cls,label)=>{
 const x=document.createElement(tag);if(cls)x.className=cls;
 if(label!==undefined)x.textContent=String(label);return x;
};
const $=id=>document.getElementById(id);
let context=null,saved={type:'',options:[]},loadSerial=0,busy=false,originalColor='',suggestedPrice=null,supplierEan=null;
const values=()=>String($('optimizerVariationValues')?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,20);
const type=()=>String($('optimizerVariationType')?.value||'').trim();
const currentKey=()=>context?context.sku+'|'+context.itemId+'|'+context.modelId:'';
const notify=(text,kind='info')=>{
 const target=$('optimizerVariationStatus');
 if(target){target.textContent=text;target.dataset.level=kind;}
};
const params=()=>new URLSearchParams({sku:context.sku,item_id:context.itemId,model_id:context.modelId});
const safeName=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
 .replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,25)||'VAR';
const entryFor=name=>saved?.type===type()?(saved.options||[]).find(x=>x.name===name):null;
const field=(caption,value,{kind='text',min,max,placeholder}={})=>{
 const label=el('label','optimizer-variant-field'),text=el('span','',caption),input=el('input');
 input.type=kind;input.value=String(value??'');if(min!==undefined)input.min=min;
 if(max!==undefined)input.max=max;
 if(placeholder)input.placeholder=placeholder;
 label.append(text,input);return {label,input};
};
const colorDot=name=>{
 const dot=el('span','optimizer-variation-color-dot');
 const color=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const palette={vermelho:'#f04432',vermelha:'#f04432',rosa:'#ef62ab',azul:'#3288e9',verde:'#36a86a',amarelo:'#f0c43d',amarela:'#f0c43d',preto:'#242b35',preta:'#242b35',branco:'#ffffff',branca:'#ffffff',laranja:'#f58b37',roxo:'#985dc7',roxa:'#985dc7',lilas:'#b690d3',cinza:'#8995a5',prata:'#c2cbd5',dourado:'#c6a052',dourada:'#c6a052',marrom:'#8a5a3d',bege:'#dfceb5'};
 dot.style.background=palette[color]||'#bdc9d7';dot.setAttribute('aria-hidden','true');return dot;
};
function rememberDraft(){
 const draft=collect(),previous=new Map((saved.options||[]).map(o=>[o.name,o]));
 saved={...draft,options:draft.options.map(o=>({...o,previewUrl:previous.get(o.name)?.previewUrl||null}))};
}
function render(){
 const target=$('optimizerVariationPreview');
 if(!target)return;
 target.replaceChildren();
 const actionHost=$('optimizerVariationActions');actionHost?.replaceChildren();
 const options=values(),variationType=type();
 const tags=$('optimizerVariationTags');if(tags){tags.replaceChildren();for(const option of options){const chip=el('button','optimizer-variation-chip');chip.type='button';chip.setAttribute('aria-label','Remover opção '+option);if(variationType==='Cor')chip.append(colorDot(option));chip.append(el('span','',option),el('span','optimizer-variation-chip-close','×'));chip.onclick=()=>{const t=$('optimizerVariationValues');t.value=values().filter(v=>v!==option).join('\n');t.dispatchEvent(new Event('input',{bubbles:true}));};tags.append(chip);}const add=el('button','optimizer-variation-add','＋ Adicionar opção');add.type='button';add.onclick=()=>{const next=window.prompt('Nome da nova opção:');if(next?.trim()){const t=$('optimizerVariationValues');t.value=[...values(),next.trim()].join('\n');t.dispatchEvent(new Event('input',{bubbles:true}));}};tags.append(add);}
 const notice=$('optimizerVariationOriginalNotice');if(notice){const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[ao]$/,'');const missing=variationType==='Cor'&&originalColor&&!options.some(v=>norm(v)===norm(originalColor));notice.replaceChildren();if(missing){notice.append(el('span','','⚠ Este anúncio anuncia a cor '+originalColor+'. Inclua essa opção para preservar a cor original.'));const action=el('button','secondary','Adicionar cor original');action.type='button';action.onclick=()=>{const t=$('optimizerVariationValues');t.value=[originalColor,...values()].join('\n');t.dispatchEvent(new Event('input',{bubbles:true}));};notice.append(action);}notice.hidden=!missing;}
 if(!context||!variationType||!options.length){
  target.append(el('p','optimizer-variant-help',
   'Escolha o tipo e informe cada opção (uma por linha) para editar foto, preço e estoque.'));
  return;
 }
 if(!document.getElementById('optimizerVariationStatus')){
  const note=el('p','optimizer-variant-status',
   'Preencha os dados e salve antes de gerar ou enviar fotos. Nenhuma modificação é publicada automaticamente.');
  note.id='optimizerVariationStatus';note.setAttribute('role','status');note.setAttribute('aria-live','polite');target.append(note);
 }
 const existing=new Map((saved.type===variationType?saved.options:[]).map(o=>[o.name,o]));
 const workspace=el('div','optimizer-variant-workspace');
 const left=el('div','optimizer-variant-main');
 const sectionTitle=el('div','optimizer-variant-section-title');
 const sectionCopy=el('div');
 sectionCopy.append(el('strong','','Variações do produto'),el('small','','Preencha os dados de cada variação. A configuração fica salva como prévia.'));
 sectionTitle.append(el('span','config-symbol','◇'),sectionCopy);
 left.append(sectionTitle);
 const cards=el('div','optimizer-variant-cards');
 for(const name of options){
  const prior=existing.get(name)||{},row=el('article','optimizer-variant-item');
  const normalColor=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[ao]$/,'');
  const sameOriginal=originalColor&&normalColor(name)===normalColor(originalColor);
  const verifiedEan=prior.gtin||((sameOriginal&&supplierEan)?supplierEan:'');
  row.dataset.option=name;
  const header=el('div','optimizer-variant-heading');
  const headingName=el('strong','optimizer-variant-title');
  if(variationType==='Cor')headingName.append(colorDot(name));
  headingName.append(el('span','',variationType+' · '+name));
  header.append(headingName,el('small',prior.asset||sameOriginal?'':'is-pending',sameOriginal?'✓ Cor original':prior.asset?'✓ Foto salva':'Foto pendente'));
  const body=el('div','optimizer-variant-body'),visual=el('div','optimizer-variant-photo');
  if(prior.previewUrl){
   const img=el('img');img.src=prior.previewUrl;img.alt='Prévia da opção '+name;
   img.loading='lazy';visual.append(img);
  }else visual.append(el('div','optimizer-variant-photo-placeholder','1200 × 1200'));
  const buttons=el('div','optimizer-variant-photo-actions');
  const fileInput=el('input');fileInput.type='file';fileInput.accept='image/jpeg,image/png,image/webp';
  fileInput.hidden=true;fileInput.setAttribute('aria-label','Foto da opção '+name);
  const upload=el('button','secondary');upload.append(el('span','optimizer-action-symbol','▧'),el('span','','Incluir foto'));
  const generate=el('button','secondary');generate.append(el('span','optimizer-action-symbol','✦'),el('span','','Gerar foto IA'));
  upload.type=generate.type='button';upload.onclick=()=>{fileInput.value='';fileInput.click();};
  generate.onclick=()=>void transferImage(name,'generate');
  fileInput.onchange=()=>{const selected=fileInput.files?.[0];if(selected)void transferImage(name,'upload',selected);};
  buttons.append(upload,generate,fileInput);
  const fields=el('div','optimizer-variant-inputs');
  const price=field('Preço (R$)',prior.price>0?prior.price:(suggestedPrice||''),{kind:'number',min:'0.01',placeholder:'Informe o preço'});
  price.input.step='0.01';price.input.dataset.variantField='price';
  const stock=field('Estoque (mínimo 1)',Number.isInteger(Number(prior.stock))&&Number(prior.stock)>0?prior.stock:1,{kind:'number',min:1});
  stock.input.step='1';stock.input.dataset.variantField='stock';
  const sku=field('SKU da opção na Shopee',prior.sku||((context.sku+'-'+safeName(name)).slice(0,100)),{placeholder:'SKU única'});
  sku.input.dataset.variantField='sku';sku.input.maxLength=100;
  const supplierSku=field('SKU WeDrop desta cor',prior.supplierSku||'',{placeholder:'Código exato do produto no fornecedor'});
  supplierSku.input.dataset.variantField='supplierSku';supplierSku.input.maxLength=120;
  const gtin=field('GTIN / EAN',verifiedEan,{placeholder:'Somente se existir'});
  gtin.input.dataset.variantField='gtin';gtin.input.maxLength=14;
  const noGtin=el('label','optimizer-variant-check');
  const n=el('input');n.type='checkbox';n.dataset.variantField='noGtin';n.checked=prior.noGtin===true;
  noGtin.append(n,el('span','','Item sem GTIN informado'));
  n.onchange=()=>{gtin.input.disabled=n.checked;if(n.checked)gtin.input.value='';};
  // O campo permanece editável; informar um GTIN substitui a opção salva sem GTIN.
  gtin.input.disabled=false;
  const confirmPhoto=el('label','optimizer-variant-check');
  const pc=el('input');pc.type='checkbox';pc.dataset.variantField='photoConfirmed';
  pc.checked=prior.photoConfirmed===true;confirmPhoto.append(pc,
   el('span','','Conferi a imagem: corresponde à variante real vendida'));
  const confirmStock=el('label','optimizer-variant-check');
  const sc=el('input');sc.type='checkbox';sc.dataset.variantField='stockConfirmed';
  sc.checked=prior.stockConfirmed===true;confirmStock.append(sc,
   el('span','','Confirmei pelo fornecedor que esta opção existe e há estoque disponível'));
  const save=el('button','optimizer-variant-save','Salvar dados da variação');
  save.type='button';save.onclick=async()=>{
   save.disabled=true;
   try{await persist();}catch(e){notify(e.message,'error');}finally{save.disabled=false;}
  };
  fields.append(price.label,sku.label,supplierSku.label,gtin.label,stock.label,buttons,noGtin,confirmPhoto,confirmStock,save);
  gtin.input.addEventListener('input',()=>{if(gtin.input.value.trim()){n.checked=false;gtin.input.disabled=false;}});
  body.append(visual,fields);row.append(header,body);cards.append(row);
 }
 left.append(cards);workspace.append(left);
 // Esta etapa apenas salva e confirma o rascunho. A publicação de variações,
 // fiscal e desconto pertence à execução única do anúncio-pai.
 const note=el('p','optimizer-variant-flow-note',
  'As variações serão incluídas na prévia e execução únicas, junto com imagens, título, descrição, ficha técnica, dados fiscais e desconto. Salve os dados, confira fotos e estoque reais e registre esta etapa como conferida. Nenhuma alteração é enviada à Shopee aqui.');
 target.append(workspace,note);
 target.querySelectorAll('input').forEach(input=>{
  if(input.type!=='file')input.addEventListener('input',rememberDraft);
 });
}
function collect(){
 const variationType=type(),options=[];
 for(const row of $('optimizerVariationPreview').querySelectorAll('.optimizer-variant-item')){
  const take=id=>row.querySelector('[data-variant-field="'+id+'"]');
  const previous=entryFor(row.dataset.option);
  options.push({
   name:row.dataset.option,price:Number(take('price')?.value),
   stock:Number(take('stock')?.value),sku:String(take('sku')?.value||'').trim(),
   supplierSku:String(take('supplierSku')?.value||'').trim(),
   gtin:String(take('gtin')?.value||'').trim(),
   noGtin:take('noGtin')?.checked===true,
   photoConfirmed:take('photoConfirmed')?.checked===true,
   stockConfirmed:take('stockConfirmed')?.checked===true,
   asset:previous?.asset||null
  });
 }
 return {type:variationType,options};
}
async function request(path,method,body,extra={}){
 if(!context)throw Error('Busque a SKU novamente.');
 const url=path+'?'+params();
 const raw=await fetch(url,{
  method,credentials:'same-origin',cache:'no-store',
  ...(method==='POST'?{
   headers:extra.headers||{'Content-Type':'application/json'},body:extra.raw||JSON.stringify(body)
  }:{}),
  signal:AbortSignal.timeout(extra.timeout||60000)
 });
 const result=await raw.json().catch(()=>({}));
 if(!raw.ok||result.ok!==true)throw Error(result.error||'Falha na consulta (HTTP '+raw.status+').');
 return result;
}
async function persist(){
 if(busy)throw Error('Operação em andamento.');
 if(!context)throw Error('Busque uma SKU válida.');
 const draft=collect();
 if(!draft.options.length)throw Error('Informe as opções da variação.');
 const result=await request('/api/shopee/optimizer/variants/draft','POST',{details:draft});
 const previous=new Map((saved.options||[]).map(o=>[o.name,o]));
 saved={...result.details,options:result.details.options.map(o=>({
  ...o,previewUrl:o.asset?.sha256 && previous.get(o.name)?.asset?.sha256===o.asset.sha256?
   (previous.get(o.name)?.previewUrl||null):null
 }))};
 notify('Rascunho salvo para '+context.sku+'. Nenhuma alteração enviada à Shopee.','success');
 return result;
}
async function squarePng(file){
 if(!file?.type?.startsWith('image/'))throw Error('Selecione uma imagem JPG, PNG ou WebP.');
 const bmp=await createImageBitmap(file),canvas=document.createElement('canvas');
 canvas.width=canvas.height=1200;const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('Navegador não permite converter imagem.');
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1200,1200);
 const scale=Math.min(1200/bmp.width,1200/bmp.height);
 const w=bmp.width*scale,h=bmp.height*scale;
 ctx.drawImage(bmp,(1200-w)/2,(1200-h)/2,w,h);bmp.close();
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Erro ao converter imagem.')),'image/png',1));
}
async function transferImage(name,mode,file){
 if(busy){notify('Aguarde a operação atual terminar para enviar outra foto.','info');return;}
 try{
  await persist();busy=true;
  notify(mode==='generate'?'Gerando imagem '+name+' pela API OpenAI...':'Enviando foto da opção '+name+'...');
  let result;
  if(mode==='generate')result=await request('/api/shopee/optimizer/variants/generate','POST',{option:name},{timeout:195000});
  else{
   const converted=await squarePng(file);
   const url='/api/shopee/optimizer/variants/photo?'+params()+'&option='+encodeURIComponent(name);
   const raw=await fetch(url,{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'image/png'},body:converted,signal:AbortSignal.timeout(60000)});
   result=await raw.json().catch(()=>({}));
   if(!raw.ok||!result.ok)throw Error(result.error||'Falha no upload.');
  }
  const o=(saved.options||[]).find(o=>o.name===name);
  if(o){o.asset=result.asset;o.previewUrl=result.previewUrl||null;o.photoConfirmed=false;}
  render();notify('Imagem de '+name+' salva. Confira a aparência real antes de autorizar a publicação.','success');
 }catch(e){notify('Falha na imagem de '+name+': '+e.message,'error');}
 finally{busy=false;}
}
async function load(data){
 const sku=String(data?.sku||''),itemId=String(data?.itemId||''),modelId=String(data?.modelId||0);
 if(!sku||!itemId)return;
 const seq=++loadSerial;
 context={sku,itemId,modelId};
 const title=String(data?.draftTitle||'');
 const match=title.match(/(?:-|–|—)\s*(Vermelha|Vermelho|Preta|Preto|Azul|Rosa|Branca|Branco|Verde|Amarela|Amarelo)(?:\s|$)/i);
 originalColor=match?.[1]||'';
 saved={type:'',options:[]};suggestedPrice=null;supplierEan=null;
 try{
  const result=await request('/api/shopee/optimizer/variants/draft','GET');
  if(seq!==loadSerial||currentKey()!==sku+'|'+itemId+'|'+modelId)return;
  saved=result.details||saved;
  suggestedPrice=Number(result.suggestedPrice)>0?Number(result.suggestedPrice):null;
  supplierEan=/^\d{8,14}$/.test(String(result.supplierEan||''))?String(result.supplierEan):null;
  if(saved?.type&&!type())$('optimizerVariationType').value=saved.type;
  if(saved?.options?.length&&!values().length)$('optimizerVariationValues').value=saved.options.map(o=>o.name).join('\n');
  render();
 }catch(e){if(seq===loadSerial)notify('Dados da variação indisponíveis: '+e.message,'error');}
}
globalThis.RedeVariants={load,render,transfer:transferImage,saveDraft:persist};
})();
