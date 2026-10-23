/* Rede Achados BR — Ficha Técnica, layout da referência, sem alterar APIs/salvamento. */
(function(){
 'use strict';
 const $=selector=>document.querySelector(selector);
 const element=(tag,cls,text)=>{
   const e=document.createElement(tag);
   if(cls)e.className=cls;
   if(text!==undefined)e.textContent=String(text);
   return e;
 };
 const panel=$('#optimizerTechnicalPanel');
 if(!panel||panel.dataset.raTechnicalStudio==='1')return;
 const originalHeader=panel.querySelector('.optimizer-technical-header');
 const source=panel.querySelector('.optimizer-technical-import');
 const preview=$('#optimizerTechnicalSummary');
 const review=$('#optimizerTechnicalAdvanced');
 const fields=$('#optimizerTechnicalFields');
 if(!originalHeader||!source||!preview||!review||!fields)return;
 panel.dataset.raTechnicalStudio='1';
 panel.classList.add('ra-tech-studio');
 const heading=element('header','ra-tech-heading');
 const titleWrap=element('div','ra-tech-heading-copy');
 titleWrap.append(
   element('small','ra-tech-kicker','ETAPA 04'),
   element('h2','','Ficha técnica'),
   element('p','','Preencha e revise as informações técnicas do produto. Use os dados da WeDrop e confira os campos antes de continuar.')
 );
 const close=element('button','secondary ra-tech-close','×  Fechar etapa');
 close.type='button';
 close.addEventListener('click',()=>$('#optimizerWorkflowClose')?.click());
 const originalSku=originalHeader.querySelector('#optimizerTechSku');
 heading.append(titleWrap);
 if(originalSku)heading.append(originalSku);
 heading.append(close);

 const metrics=element('div','ra-tech-metrics');
 const metaCards=[
   ['filled','▤','Atributos preenchidos','Dados disponíveis'],
   ['optional','☷','Opcionais preenchidos','Da categoria'],
   ['pending','⚠','Obrigatórios pendentes','Requerem atenção'],
   ['review','✓','Conferência de campos','Resumo atual']
 ];
 const metricMap={};
 for(const [id,icon,name,hint] of metaCards){
   const card=element('div','ra-tech-metric ra-tech-metric-'+id);
   const symbol=element('div','ra-tech-metric-icon',icon);
   const content=element('div','ra-tech-metric-copy');
   const value=element('strong','', '—');value.id='raTechMetric'+id;
   const label=element('span','',name),small=element('small','',hint);
   metricMap[id]={value,small};
   content.append(value,label,small);card.append(symbol,content);metrics.append(card);
 }
 const main=element('div','ra-tech-main');
 const sourceTitle=source.querySelector('.optimizer-tech-import-title');
 sourceTitle?.querySelector('strong')?.replaceChildren(document.createTextNode('Fonte de dados da SKU'));
 const intro=element('p','ra-tech-intro','Preencha pela WeDrop ou confirme os dados abaixo.');
 sourceTitle?.insertAdjacentElement('afterend',intro);
 const product=element('div','ra-tech-product');
 const photo=element('img','ra-tech-product-photo');photo.alt='Imagem do produto na Shopee';
 const productCopy=element('div','ra-tech-product-description');
 const productName=element('strong','','Produto da SKU');
 const productDetails=element('small','','Informações da WeDrop e Shopee');
 productCopy.append(productName,productDetails);
 const productTag=element('span','ra-tech-product-sku','SKU');
 product.append(photo,productCopy,productTag);
 intro.insertAdjacentElement('afterend',product);
 const supplierNumbers=element('p','ra-tech-measurements');
 const measureWarning=element('p','ra-tech-measure-warning');
 product.insertAdjacentElement('afterend',supplierNumbers);
 supplierNumbers.insertAdjacentElement('afterend',measureWarning);
 // A caixa de texto é um complemento, não precisa ocupar a tela inteira.
 const textLabel=source.querySelector('label[for=optimizerTechText]');
 if(textLabel){
   const more=element('details','ra-tech-source-more');
   const summary=element('summary','','＋ Informações adicionais da WeDrop (opcional)');
   more.append(summary,textLabel);
   measureWarning.insertAdjacentElement('afterend',more);
 }
 preview.classList.add('ra-tech-preview');
 const previewExtra=element('div','ra-tech-category');
 preview.append(previewExtra);
 main.append(source,preview);
 review.classList.add('ra-tech-review');
 const reviewSummary=review.querySelector(':scope > summary');
 if(reviewSummary){
   reviewSummary.querySelector('span:first-child')?.replaceChildren(document.createTextNode('③ Conferir ou editar campos'));
   reviewSummary.querySelector('small')?.replaceChildren(document.createTextNode('Abrir ou recolher opções'));
 }
 const categoryGroups=element('div','ra-tech-field-groups');
 fields.parentNode.insertBefore(categoryGroups,fields);
 categoryGroups.append(fields);
 const shortcutRow=element('nav','ra-tech-shortcuts');
 shortcutRow.setAttribute('aria-label','Atalhos da ficha técnica');
 function shortcut(icon,title,desc,action){
   const b=element('button','ra-tech-shortcut');
   b.type='button';
   b.append(element('span','ra-tech-shortcut-icon',icon));
   const txt=element('span','ra-tech-shortcut-copy');
   txt.append(element('strong','',title),element('small','',desc));
   b.append(txt,element('span','ra-tech-shortcut-arrow','›'));
   b.addEventListener('click',action);
   return b;
 }
 shortcutRow.append(
   shortcut('▤','Informações da WeDrop','Dados extras, observações e prints',()=>{
     const inputDetails=source.querySelector('.ra-tech-source-more');if(inputDetails)inputDetails.open=true;
     source.scrollIntoView({behavior:'smooth',block:'center'});
     $('#optimizerTechText')?.focus({preventScroll:true});
   }),
   shortcut('⚙','Regras salvas da loja','Padrões cadastrados da loja',()=>{
     const el=$('#optimizerRulesDetails');if(!el)return;
     el.open=true;el.scrollIntoView({behavior:'smooth',block:'start'});
   }),
   shortcut('◇','Auditoria técnica do anúncio','Fotos, atributos e revisão',()=>{
     const target=$('#optimizerAuditPanel')||$('#optimizerDashAudit');
     if(target){
       target.hidden=false;
       if(target.tagName==='DETAILS')target.open=true;
       target.scrollIntoView({behavior:'smooth',block:'start'});
     }
     if(target?.tagName==='BUTTON')target.click();
   })
 );
 panel.replaceChildren(heading,metrics,main,review,shortcutRow);
 function number(id,value,hint){
   metricMap[id].value.textContent=String(value);
   metricMap[id].small.textContent=String(hint);
 }
 function disclosure(label,count,note,cls,items,defaultOpen=false){
   const d=element('details','ra-tech-attribute-group '+cls);
   if(defaultOpen)d.open=true;
   const sum=element('summary');
   sum.append(
     element('span','ra-tech-group-icon',cls==='required'?'!':cls==='optional'?'☷':cls==='conditional'?'◇':'✓'),
     element('strong','',label+' ('+count+')'),
     element('span','ra-tech-group-note',note),
     element('span','ra-tech-group-count',count+' campos'),
     element('span','ra-tech-chevron','⌄')
   );
   const body=element('div','ra-tech-group-body');
   if(items.length)for(const item of items){item.hidden=false;body.append(item);}
   else body.append(element('p','ra-tech-empty','Nenhum campo para apresentar.'));
   d.append(sum,body);return d;
 }
 function groups(data){
   const attributes=data.attributes||[];
   const attrById=new Map(attributes.map(x=>[Number(x.id),x]));
   const current=[...fields.querySelectorAll('fieldset[data-attribute-id]')];
   const intro=[...fields.children].filter(x=>x.tagName!=='FIELDSET'&&!x.querySelector?.('fieldset'));
   const optionalDetails=fields.querySelector('.optimizer-tech-optional');
   const fieldsets=current;
   const saved=[],optional=[],conditional=[],required=[];
   for(const field of fieldsets){
     const attr=attrById.get(Number(field.dataset.attributeId));
     if(!attr){optional.push(field);continue;}
     if(attr.conditional)conditional.push(field);
     else if(field.dataset.autofilled==='true')saved.push(field);
     else if(attr.mandatory)required.push(field);
     else optional.push(field);
   }
   // Keep the existing fieldset elements, dataset, event listeners, and live inputs.
   // They must all remain under #optimizerTechnicalFields for autosave/approval.
   fields.replaceChildren();
   const notices=element('div','ra-tech-notices');
   for(const notice of intro){
     if(notice===optionalDetails||notice.classList.contains('optimizer-tech-compact-summary'))continue;
     notices.append(notice);
   }
   if(notices.childElementCount)fields.append(notices);
   fields.append(
     disclosure('Preenchidos ou recuperados',saved.length,'Valores da SKU, Shopee e WeDrop', 'filled',saved),
     disclosure('Obrigatórios para revisar',required.length,
       required.length?'Precisam de informação comprovada':'Nenhum obrigatório pendente','required',required),
     disclosure('Opcionais sugeridos',optional.length,'Abra apenas se desejar preencher','optional',optional),
     disclosure('Dependências e condicionais',conditional.length,
       'Dependem de outros atributos da categoria','conditional',conditional)
   );
 }
 function render(data,{regroup=true}={}){
   if(!data||panel.hidden)return;
   const attrs=data.attributes||[],suggested=data.sourceFacts?.suggestions||[];
   const changes=[...fields.querySelectorAll('fieldset[data-attribute-id]')];
   // Called directly after the existing renderer; don't rebuild the form on
   // every keystroke. Each field stays attached with the original listeners.
   if(regroup)groups(data);
   const savedIds=new Set(attrs.filter(x=>Array.isArray(x.values)&&x.values.length).map(x=>Number(x.id)));
   const suggestedIds=new Set();
   // Only count enabled, populated inputs or already-filled Shopee fields.
   // A mere suggestion must not become a confirmed attribute.
   const manuallySelected=[...fields.querySelectorAll('fieldset[data-attribute-id]')]
      .filter(field=>field.querySelector('[data-attribute-enabled]')?.checked&&
        [...field.querySelectorAll('[data-attribute-value]')].some(row=>{
          const input=row.querySelector('[data-value-name]');
          const select=row.querySelector('[data-value-id]');
          return Boolean(input?.value?.trim()||(select?.value&&Number(select.value)>0));
        }));
   for(const field of manuallySelected)suggestedIds.add(Number(field.dataset.attributeId));
   const completed=new Set([...savedIds,...suggestedIds].filter(id=>attrs.some(a=>Number(a.id)===id)));
   const optionalCount=attrs.filter(x=>!x.mandatory&&!x.conditional).length;
   const optionalComplete=attrs.filter(x=>!x.mandatory&&!x.conditional&&completed.has(Number(x.id))).length;
   const mandatory=attrs.filter(x=>x.mandatory&&!x.conditional);
   const missing=mandatory.filter(x=>!completed.has(Number(x.id))).length;
   const conflicts=(data.sourceFacts?.conflicts||[]).length;
   number('filled',completed.size,'de '+attrs.length+' atributos retornados');
   number('optional',optionalComplete,'de '+optionalCount+' opcionais');
   number('pending',missing,missing?'Verifique os obrigatórios':'Todos os obrigatórios atendidos');
   number('review',Math.max(0,mandatory.length-missing)+'/'+mandatory.length,
     conflicts?conflicts+' divergência(s) para conferir':missing?'Conferência pendente':'Sem divergências identificadas');
   const supplier=data.supplierProduct||{};
   productName.textContent=supplier.name||data.productTitle||data.draftTitle||'Produto da SKU';
   productDetails.textContent=[
     supplier.brand||'',supplier.ncm?'NCM: '+supplier.ncm:'',supplier.ean?'EAN: '+supplier.ean:''
   ].filter(Boolean).join(' · ')||'Dados da Shopee · WeDrop';
   productTag.textContent='SKU '+String(data.sku||'—');
   const image=(data.imageUrls||[]).find(x=>typeof x==='string'&&x.startsWith('https://'));
   if(image){photo.src=image;photo.hidden=false;}else photo.hidden=true;
   const m=supplier.catalogMeasurements;
   const haveMeasures=m&&[m.lengthCm,m.widthCm,m.heightCm,m.weightKg].some(v=>v!==null&&v!==undefined&&String(v).trim()!=='');
   supplierNumbers.hidden=!haveMeasures;
   measureWarning.hidden=!haveMeasures;
   if(haveMeasures){
     supplierNumbers.textContent='Valores brutos da planilha: C '+(m.lengthCm??'—')+
       ' × L '+(m.widthCm??'—')+' × A '+(m.heightCm??'—')+
       ' cm; peso na coluna kg: '+(m.weightKg??'—')+'.';
     measureWarning.textContent='⚠ Peso e medidas precisam de conferência: podem ser dados da embalagem ou unidades diferentes.';
   }
   const cat=String(data.categoryId||'—');
   if(!preview.contains(previewExtra))preview.append(previewExtra);
   previewExtra.replaceChildren();
   const head=element('strong','','☷ Resumo da categoria');
   previewExtra.append(head);
   for(const [label,value] of [
     ['Categoria Shopee',cat],
     ['Atributos obrigatórios',mandatory.length-missing+' de '+mandatory.length],
     ['Opcionais preenchidos',optionalComplete+' de '+optionalCount],
     ['Atributos retornados pela API',attrs.length+' campos']
   ]){
     const row=element('div','ra-tech-category-row');
     row.append(element('span','',label),element('strong','',value));
     previewExtra.append(row);
   }
   review.open=true;
   reviewSummary?.querySelector('small')?.replaceChildren(document.createTextNode(
     missing+' obrigatório(s) pendente(s) · '+completed.size+' preenchido(s)'));
 }
 globalThis.RATechnicalStudio={render,refresh:data=>render(data,{regroup:false})};
})();
