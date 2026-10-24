/* Rede Achados BR — layout compacto do Título SEO, usando a geração IA e salvamento existentes. */
(function(){
'use strict';
const original=globalThis.ShopeeTitleStudio;
if(!original?.open)return;
const node=(tag,cls,text)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined)e.textContent=String(text);return e;
};
const help=(message,name='Ajuda')=>{
 const d=node('details','seo-modern-help'),s=node('summary','','?');
 s.setAttribute('aria-label',name);s.title=name;
 d.append(s,node('div','seo-modern-help-content',message));return d;
};
const action=(text,handler,cls='')=>{
 const b=node('button',cls,text);b.type='button';b.addEventListener('click',handler);return b;
};
const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
const count=s=>[...String(s||'').normalize('NFC')].length;
const key=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
let draftHandler=null;
function close(){
 const mount=document.getElementById('optimizerTitleVariants');
 const draft=document.getElementById('optimizerWorkflowDraftWrap');
 const field=document.getElementById('optimizerWorkflowDraft');
 if(field&&draftHandler)field.removeEventListener('input',draftHandler);
 draftHandler=null;
 if(mount&&draft&&mount.contains(draft)&&mount.parentNode)
  mount.parentNode.insertBefore(draft,mount);
 document.getElementById('optimizerWorkflowEditor')?.classList.remove('seo-modern-editor');
}
function jump(id){
 const p=document.getElementById(id);
 if(!p)return;
 if(p.tagName==='DETAILS')p.open=true;
 p.hidden=false;
 p.scrollIntoView({behavior:'smooth',block:'center'});
 p.querySelector('summary')?.focus({preventScroll:true});
}
function modernize(data){
 const editor=document.getElementById('optimizerWorkflowEditor');
 const mount=document.getElementById('optimizerTitleVariants');
 const draft=document.getElementById('optimizerWorkflowDraftWrap');
 const field=document.getElementById('optimizerWorkflowDraft');
 if(!mount||!editor||!draft||!field)return;
 const grid=mount.querySelector('.seo-studio-grid');
 const manual=mount.querySelector('.seo-studio-custom');
 const aiButton=mount.querySelector('.seo-studio-rebuild');
 const recoverButton=mount.querySelector('.seo-studio-recover');
 const pasteDirect=mount.querySelector('.seo-studio-direct-import');
 const notice=mount.querySelector('.seo-studio-market-status');
 const status=mount.querySelector('.seo-studio-status');
 const importPanel=mount.querySelector('.seo-studio-manual-import');
 const researchPanel=mount.querySelector('.seo-studio-research');
 if(!grid||!manual||!aiButton||!notice||!status)return;
 const p=data.supplierProduct||{},sku=clean(data.sku||'');
 editor.classList.add('seo-modern-editor');
 editor.insertBefore(mount,editor.firstChild);
 mount.classList.add('seo-modern-studio');

 const content=node('div','seo-modern-content');
 const product=node('section','seo-modern-product');
 const pic=node('div','seo-modern-photo');
 const imageUrl=(Array.isArray(data.imageUrls)?data.imageUrls:[]).find(x=>/^https:\/\//i.test(String(x||'')));
 if(imageUrl){
  const img=node('img');img.src=imageUrl;img.loading='lazy';
  img.alt='Foto do anúncio da SKU '+sku;pic.append(img);
 }else pic.append(node('span','','▧'));
 const productText=node('div','seo-modern-product-text'),tagline=node('div','seo-modern-tags');
 tagline.append(node('span','seo-modern-sku','SKU '+(sku||'—')));
 if(p.source)tagline.append(node('span','seo-modern-file-source',clean(p.source).slice(0,85)));
 const title=clean(data.productTitle||p.name||data.draftTitle||'Produto Shopee');
 productText.append(tagline,node('h3','',title));
 const facts=[p.brand?'Marca: '+p.brand:'',p.ncm?'NCM: '+p.ncm:'',p.ean?'EAN: '+p.ean:''].filter(Boolean);
 if(facts.length)productText.append(node('p','seo-modern-product-facts',facts.join('   |   ')));
 const view=action('◉ Ver anúncio na Shopee ↗',()=>{
  const link=document.getElementById('optimizerWorkflowShopee');
  if(link?.href&&link.href!=='#')window.open(link.href,'_blank','noopener,noreferrer');
 },'seo-modern-shopee');
 product.append(pic,productText,view);content.append(product);

 const top=node('div','seo-modern-top');
 const editorCard=node('section','seo-modern-editor-card');
 const editorHeader=node('div','seo-modern-head');
 const label=node('div','seo-modern-label');
 label.append(node('span','seo-modern-symbol','✎'),node('strong','','Título SEO'));
 const indicator=node('div','seo-modern-indicator');
 const meterLabel=node('span','seo-modern-meter-label','0 / 120 caracteres');
 const meter=node('progress','seo-modern-meter');meter.max=120;meter.value=0;
 meter.setAttribute('aria-label','Caracteres do título SEO');
 indicator.append(meterLabel,meter,help('O título é salvo como rascunho ao editar. Para registrar a conferência, use entre 100 e 120 caracteres e somente dados comprovados.','Limites do título'));
 editorHeader.append(label,indicator);
 editorCard.append(editorHeader);
 draft.hidden=false;field.rows=2;field.setAttribute('aria-label','Título SEO editável');editorCard.append(draft);
 const saveManual=action('💾 Salvar título manual',async()=>{
  saveManual.disabled=true;
  try{
   const out=await globalThis.ShopeeSeoSaveManual?.();
   if(!out?.saved)throw Error('A confirmação do servidor não foi recebida.');
   status.textContent='✓ Título manual salvo na SKU '+sku+' ('+out.length+'/120). '+
    (out.length>=100&&out.length<=120?'Pronto para conferência.':'Rascunho salvo; ajuste para 100 a 120 caracteres antes de aprovar.');
  }catch(error){status.textContent='Não foi possível salvar: '+error.message;}
  finally{saveManual.disabled=false;}
 },'seo-modern-save-manual');
 const chipRow=node('div','seo-modern-keyword-row'),chips=node('div','seo-modern-keyword-list');
 const keywordEntry=node('div','seo-modern-keyword-editor');keywordEntry.hidden=true;
 const keywordInput=node('input','seo-modern-keyword-input');keywordInput.type='text';keywordInput.maxLength=55;
 keywordInput.placeholder='Termo comprovado';keywordInput.setAttribute('aria-label','Nova palavra-chave');
 const addTerm=action('Adicionar',()=>{
  const term=clean(keywordInput.value),now=clean(field.value);
  if(!term)return;
  if(key(now).includes(key(term))){status.textContent='Termo já presente no título.';return;}
  const next=clean(now+(now?' · ':'')+term);
  if(count(next)>120){status.textContent='Não adicionado: ultrapassaria 120 caracteres.';return;}
  field.value=next;field.dispatchEvent(new Event('input',{bubbles:true}));
  keywordInput.value='';keywordEntry.hidden=true;
 },'seo-modern-add-confirm');
 keywordInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addTerm.click();}});
 keywordEntry.append(keywordInput,addTerm);
 const addKeyword=action('＋ Adicionar palavra-chave',()=>{
  keywordEntry.hidden=!keywordEntry.hidden;if(!keywordEntry.hidden)keywordInput.focus();
 },'seo-modern-add-keyword');
 chipRow.append(chips,addKeyword,keywordEntry);editorCard.append(chipRow,saveManual,status);

 function showKeywords(){
  chips.replaceChildren();const seen=new Set();
  const terms=clean(field.value).replace(/\s*(?:[|·–-])\s*/g,' ')
    .match(/(?:moto\s+el[eé]trica|bola\s+de\s+futebol|garrafa\s+t[eé]rmica)|[^\s]+/giu)||[];
  for(const term of terms){
   if(term.length<2||seen.has(key(term)))continue;seen.add(key(term));
   const chip=action(term+' ×',()=>{
    const value=field.value,index=value.toLocaleLowerCase('pt-BR').indexOf(term.toLocaleLowerCase('pt-BR'));
    if(index<0)return;
    field.value=clean(value.slice(0,index)+value.slice(index+term.length));
    field.dispatchEvent(new Event('input',{bubbles:true}));
   },'seo-modern-keyword');
   chip.title='Remover '+term+' do título';chips.append(chip);
   if(seen.size>=8)break;
  }
 }
 draftHandler=()=>{
  const n=count(field.value);
  meterLabel.textContent=n+' / 120 caracteres';
  meter.value=Math.min(120,n);
  indicator.dataset.valid=n>=100&&n<=120?'true':'false';
  showKeywords();
 };
 field.addEventListener('input',draftHandler);
 top.append(editorCard);

 const suggestions=node('aside','seo-modern-suggestions'),suggestHead=node('div','seo-modern-head');
 const suggestionLabel=node('div','seo-modern-label');
 suggestionLabel.append(node('span','seo-modern-symbol','☆'),node('strong','','Sugestões de título'));
 suggestHead.append(suggestionLabel,help('As sugestões utilizam os dados da SKU e, quando disponíveis, ofertas verificadas. A pontuação é apenas estrutural, não representa volume de buscas.','Sobre as sugestões'));
 suggestions.append(suggestHead);
 aiButton.classList.add('seo-modern-generate');aiButton.textContent='✦ Gerar 4 títulos com ChatGPT';suggestions.append(aiButton);
 if(recoverButton){recoverButton.classList.add('seo-modern-recover');suggestions.append(recoverButton);}
 if(pasteDirect){suggestions.append(pasteDirect);}
 const supplierButton=action('▤ Usar título da WeDrop',()=>{
  const name=clean(p.name||data.productTitle||'');
  if(!name)return;
  field.value=name;field.dispatchEvent(new Event('input',{bubbles:true}));
  status.textContent='Título WeDrop inserido. Edite antes de conferir.';
 },'seo-modern-supplier-button');
 supplierButton.disabled=!p.name;supplierButton.title=p.name?'Preencher título a partir do catálogo':'Nome WeDrop não encontrado';
 suggestions.append(supplierButton);
 const extra=node('details','seo-modern-extra'),extraSummary=node('summary','','Termos extras confirmados ▾');
 extra.append(extraSummary,manual);suggestions.append(extra,notice);
 if(importPanel)suggestions.append(importPanel);
 top.append(suggestions);content.append(top);
 grid.classList.add('seo-modern-grid');content.append(grid);
 // As fontes e os termos permanecem disponíveis, mas começam recolhidos.
 // O DOM original recebe atualizações assíncronas do ChatGPT: manter o mesmo nó.
 if(researchPanel){
  const references=node('details','seo-modern-research-details');
  const summary=node('summary','','▸ Ver palavras-chave e URLs da pesquisa');
  summary.setAttribute('aria-label','Expandir ou recolher fontes e palavras-chave da pesquisa');
  references.append(summary,researchPanel);
  content.append(references);
 }
 // Os blocos duplicados "Informações da WeDrop" e "Ações rápidas" foram
 // removidos APENAS deste resumo visual. A ficha original e demais áreas
 // do Shopee Manager continuam disponíveis e alimentam a pesquisa SEO.

 mount.replaceChildren(content);draftHandler();
}
function open(data,onChoose){
 close();
 original.open(data,onChoose);
 modernize(data);
}
globalThis.ShopeeTitleStudio={...original,open,close};
})();