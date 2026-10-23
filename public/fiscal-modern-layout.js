/* Rede Achados BR — Etapa 07 — aparência fiscal aprovada.
 * Reorganiza o formulário existente, sem criar campos fiscais paralelos.
 * O envio continua sendo exclusivamente pelo fluxo de revisão da SKU. */
(()=>{
'use strict';
const get=id=>document.getElementById(id);
const make=(tag,cls,text)=>{
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(text!==undefined)e.textContent=String(text);
 return e;
};
const action=(label,fn,cls='')=>{
 const b=make('button',cls,label);b.type='button';b.addEventListener('click',fn);return b;
};
const info=(label,body)=>{
 const d=make('details','ra-fiscal-modern-help');
 const summary=make('summary','','?');summary.title=label;summary.setAttribute('aria-label',label);
 d.append(summary,make('div','ra-fiscal-modern-popover',body));return d;
};
const tips={
 ncm:'Classificação fiscal NCM de 8 dígitos: consulte a nota, fabricante ou catálogo oficial da SKU.',
 origin:'Origem fiscal da mercadoria. Este código NÃO é o país de fabricação deduzido do endereço da loja.',
 measure_unit:'Unidade comercial do produto, como UN, conforme o cadastro e a nota do fornecedor.',
 cest:'CEST conforme NCM e legislação aplicável. O valor 00 é um marcador de cadastro interno, não substitui um CEST oficial.',
 same_state_cfop:'CFOP de operações dentro do estado, sujeito à conferência contábil.',
 diff_state_cfop:'CFOP para operações entre estados, sujeito à conferência contábil.',
 csosn:'Código de situação da operação no Simples Nacional, quando aplicável.',
 pis_cofins_cst:'CST do cadastro Shopee, distinto da apuração e emissão da NF-e.',
 operation_type:'Tipo de operação registrado: 1 revendedor / 2 fabricante, conforme sua atividade.',
 evidence:'Registre a fonte e a validação dos dados desta SKU para revisão posterior.'
};
let opened=false, active=null,unsubscribe=[];
function jump(id){
 const el=get(id);if(!el)return;
 if(el.tagName==='DETAILS')el.open=true;
 el.hidden=false;
 el.scrollIntoView({behavior:'smooth',block:'center'});
 if(el.tagName==='DETAILS')el.querySelector('summary')?.focus({preventScroll:true});
}
function field(fieldElement,key){
 fieldElement.classList.add('ra-fiscal-modern-field');
 fieldElement.dataset.fiscalKey=key;
 const input=fieldElement.querySelector('input[data-tax-field]');
 if(!input)return fieldElement;
 const name=fieldElement.firstChild;
 const row=make('div','ra-fiscal-modern-field-label');
 // Preserve the existing label text, help text, provenance and input.
 const title=make('span','',name?.textContent?.trim()||key);
 if(name?.nodeType===3){fieldElement.dataset.originalFiscalLabel=name.textContent;name.textContent='';}
 row.append(title,info('Ajuda: '+title.textContent,tips[key]||'Verifique o cadastro deste produto.'));
 fieldElement.insertBefore(row,fieldElement.firstChild);
 return fieldElement;
}
function makePanel(style,title,subtitle,symbol){
 const card=make('section','ra-fiscal-modern-card '+style);
 const heading=make('div','ra-fiscal-modern-card-head');
 const icon=make('span','ra-fiscal-modern-card-icon',symbol);
 const words=make('div','ra-fiscal-modern-card-words');
 words.append(make('strong','',title),make('small','',subtitle));
 heading.append(icon,words);card.append(heading);
 const fields=make('div','ra-fiscal-modern-card-body');
 card.append(fields);
 return {card,fields};
}
function update(data){
 const editor=get('optimizerWorkflowEditor');if(!editor?.classList.contains('ra-fiscal-modern-active'))return;
 const stage=data?.stages?.find(s=>s.key==='fiscal')||active?.stages?.find(s=>s.key==='fiscal');
 const reviewed=stage?.reviewed===true;
 const pill=get('raFiscalModernStatus');
 if(pill){
  pill.classList.toggle('is-saved',reviewed);
  const title=pill.querySelector('strong'),subtitle=pill.querySelector('small');
  if(title)title.textContent=reviewed?'✓ Dados fiscais salvos':'◷ Dados fiscais em revisão';
  if(subtitle)subtitle.textContent=reviewed?'Revisão gravada nesta SKU':'Confira e salve antes da execução';
 }
}
function close(){
 unsubscribe.splice(0).forEach(dispose=>dispose());
 const editor=get('optimizerWorkflowEditor'),fiscal=get('optimizerFiscalPanel');
 const fields=get('optimizerFiscalFields'),actions=get('optimizerWorkflowReview')?.parentElement;
 const layout=get('raFiscalModernLayout');
 const video=get('optimizerVideoManualPanel');
 if(!editor||!opened)return;
 // DOM restoration: original fiscal renderer and API serializer keep their elements.
 if(fields){
  fields.querySelectorAll('label[data-fiscal-key]').forEach(label=>{
   const row=label.querySelector('.ra-fiscal-modern-field-label');
   row?.remove();
   const textNode=label.firstChild;
   if(textNode?.nodeType===3&&label.dataset.originalFiscalLabel!==undefined)
    textNode.textContent=label.dataset.originalFiscalLabel;
   delete label.dataset.originalFiscalLabel;
   fields.append(label);label.classList.remove('ra-fiscal-modern-field');
   delete label.dataset.fiscalKey;
  });
  fields.querySelectorAll('.ra-fiscal-modern-card').forEach(card=>card.remove());
 }
 if(fiscal&&video)editor.insertBefore(fiscal,video);
 fiscal?.querySelector(':scope > strong')?.removeAttribute('hidden');
 fiscal?.querySelector(':scope > p.optimizer-video-help')?.removeAttribute('hidden');
 const disclaimer=editor.querySelector('.optimizer-workflow-disclaimer');
 if(actions&&disclaimer&&layout?.contains(actions))editor.insertBefore(actions,disclaimer);
 if(disclaimer&&layout?.contains(disclaimer))editor.append(disclaimer);
 layout?.remove();
 editor.classList.remove('ra-fiscal-modern-active');
 opened=false;active=null;
}
function open(data){
 close();
 const editor=get('optimizerWorkflowEditor'),fiscal=get('optimizerFiscalPanel');
 const fields=get('optimizerFiscalFields'),actions=get('optimizerWorkflowReview')?.parentElement;
 if(!editor||!fiscal||!fields||!actions||!data)return;
 const originalLabels=[...fields.querySelectorAll('label')];
 if(!originalLabels.length)return;
 active=data;opened=true;
 editor.classList.add('ra-fiscal-modern-active');
 const root=make('div','ra-fiscal-modern-layout');root.id='raFiscalModernLayout';
 editor.insertBefore(root,editor.firstChild);

 const header=make('section','ra-fiscal-modern-header');
 const heading=make('div','ra-fiscal-modern-heading');
 heading.append(make('span','ra-fiscal-modern-step','ETAPA 07'),
  make('h2','','Informações fiscais'),
  make('p','','Revise e confirme os dados fiscais do produto antes da execução e do envio pela API.'));
 const controls=make('div','ra-fiscal-modern-header-actions');
 const status=make('div','ra-fiscal-modern-status');status.id='raFiscalModernStatus';
 status.append(make('strong','','◷ Dados fiscais em revisão'),
  make('small','','Confira e salve antes da execução'));
 const openShopee=action('Conferir anúncio na Shopee ↗',()=>{
  const original=get('optimizerWorkflowShopee');
  if(original?.href&&original.href!=='#')window.open(original.href,'_blank','noopener,noreferrer');
 },'ra-fiscal-modern-open');
 controls.append(status,openShopee);header.append(heading,controls);root.append(header);

 const supplier=data.supplierProduct||{};
 const source=make('section','ra-fiscal-modern-supplier');
 const photo=make('div','ra-fiscal-modern-photo');
 const url=(Array.isArray(data.imageUrls)?data.imageUrls:[]).find(x=>/^https:\/\//i.test(String(x||'')));
 if(url){const img=make('img');img.src=url;img.loading='lazy';img.alt='Foto da SKU '+String(data.sku||'');photo.append(img);}
 else photo.append(make('span','','▧'));
 const details=make('div','ra-fiscal-modern-supplier-text');
 details.append(make('strong','',(supplier.source||'Catálogo WeDrop')+' · SKU '+String(data.sku||'')+(supplier.sourceLine?' · linha '+supplier.sourceLine:'')),
  make('p','',[supplier.name||data.productTitle||'Produto Shopee',supplier.brand||'',supplier.ncm?'NCM: '+supplier.ncm:'',supplier.ean?'EAN: '+supplier.ean:''].filter(Boolean).join(' · ')));
 const warnings=Array.isArray(supplier.warnings)?supplier.warnings.filter(Boolean):[];
 const warning=make('div','ra-fiscal-modern-warning',
  warnings[0]||'Confira os dados com a nota, o catálogo do fornecedor e a contabilidade antes de executar.');
 details.append(warning);
 source.append(photo,details);root.append(source);

 const content=make('div','ra-fiscal-modern-content');
 const classification=makePanel('classification','Classificação fiscal','Dados principais de classificação do produto.','▤');
 const operation=makePanel('operation','Operação e tributação','CFOP, CSOSN e impostos do produto.','⚙');
 const provenance=makePanel('provenance','Fonte e validação','Origem dos dados e regras de preenchimento.','▥');

 // Relocate the original form, not copies: optimizerFiscalValues() still reads these inputs.
 content.append(classification.card,operation.card,provenance.card);
 root.append(fiscal);fiscal.append(fields);
 fiscal.querySelector(':scope > strong')?.setAttribute('hidden','');
 fiscal.querySelector(':scope > p.optimizer-video-help')?.setAttribute('hidden','');
 fields.replaceChildren(...originalLabels);
 const slots={
  ncm:classification.fields,origin:classification.fields,measure_unit:classification.fields,cest:classification.fields,
  same_state_cfop:operation.fields,diff_state_cfop:operation.fields,
  csosn:operation.fields,pis_cofins_cst:operation.fields,operation_type:operation.fields,
  evidence:provenance.fields
 };
 for(const label of originalLabels){
  const k=label.querySelector('input[data-tax-field]')?.dataset.taxField;
  if(k&&slots[k])slots[k].append(field(label,k));
  else provenance.fields.append(label);
 }
 const notes=make('div','ra-fiscal-modern-tax-note');
 notes.append(make('strong','','💡 Motor Matriz · orientações fiscais'),
  make('p','',
   'Os dados seguem as regras salvas por SKU. PIS/COFINS CST 99 pode ser revisto pela contabilidade. O cadastro Shopee não substitui a emissão correta da NF-e.'));
 provenance.fields.insertBefore(notes,provenance.fields.firstChild);
 const cest=fields.querySelector('input[data-tax-field="cest"]');
 if(cest){
  const caution=make('small','ra-fiscal-modern-cest-alert',
   '⚠ Confira o CEST de 7 dígitos quando aplicável. “00” não é um CEST válido para emissão.');
  cest.closest('label')?.append(caution);
 }
 // Keep the cards inside #optimizerFiscalFields; optimizerFiscalValues() reads these inputs.
 fields.append(content);
 const disclaimer=editor.querySelector('.optimizer-workflow-disclaimer');
 root.append(actions);
 if(disclaimer)root.append(disclaimer);
 const quick=make('nav','ra-fiscal-modern-quick');
 quick.setAttribute('aria-label','Ações complementares da ficha fiscal');
 for(const [symbol,label,explanation,id] of [
  ['we','Informações da WeDrop','Dados da planilha e processamento','optimizerSourcePanel'],
  ['☼','Regras salvas da loja','Regras fiscais e padrões','optimizerRulesDetails'],
  ['◇','Auditoria técnica do anúncio','Fotos, atributos e revisão detalhada','optimizerAuditPanel']
 ]){
  const btn=action('',()=>jump(id),'ra-fiscal-modern-quick-link');
  const icon=make('span','ra-fiscal-modern-quick-icon',symbol);
  const text=make('span','ra-fiscal-modern-quick-text');
  text.append(make('strong','',label),make('small','',explanation));
  btn.append(icon,text,make('span','ra-fiscal-modern-chevron','›'));quick.append(btn);
 }
 root.append(quick);
 update(data);
}
globalThis.ShopeeFiscalStudio={open,close,update};
})();