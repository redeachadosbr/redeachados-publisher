/* Rede Achados BR — Etapa 05 / Descrição compacta. Reutiliza os controles existentes. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const el=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=String(text);
  return node;
 };
 const button=(label,fn,cls='')=>{
  const b=el('button',cls,label);b.type='button';b.addEventListener('click',fn);return b;
 };
 const help=(label,message)=>{
  const wrap=el('details','desc-modern-help');
  const trigger=el('summary','','?');trigger.title=label;trigger.setAttribute('aria-label',label);
  wrap.append(trigger,el('p','',message));return wrap;
 };
 const safeText=s=>String(s??'').trim();
 const sourceUrl=url=>typeof url==='string'&&/^https:\/\//i.test(url)?url:'';
 let identity='',listeners=[],countNode=null,barNode=null,sourceNode=null;
 const listen=(node,event,callback)=>{
  node?.addEventListener(event,callback);
  listeners.push(()=>node?.removeEventListener(event,callback));
 };
 function jump(id){
  const dest=$(id);
  if(!dest)return;
  if(dest.tagName==='DETAILS')dest.open=true;
  dest.hidden=false;
  dest.scrollIntoView({behavior:'smooth',block:'center'});
  dest.querySelector('summary')?.focus({preventScroll:true});
 }
 function close(){
  for(const unsubscribe of listeners.splice(0))unsubscribe();
  const editor=$('optimizerWorkflowEditor');
  const preview=$('optimizerDescriptionCompact'),draft=$('optimizerWorkflowDraftWrap');
  const research=$('optimizerContentResearch'),variants=$('optimizerTitleVariants');
  const toggle=$('optimizerDescriptionToggle');
  if(!editor)return;
  // Restore DOM ownership so every other workflow stage retains its native controls.
  const full=$('optimizerDescriptionFullPreview');
  const footer=preview?.querySelector('.ra-description-preview-footer');
  if(full&&footer&&!preview.contains(full))preview.insertBefore(full,footer);
  else if(full&&footer&&full.parentNode!==preview)preview.insertBefore(full,footer);
  if(toggle&&footer&&!footer.contains(toggle))footer.append(toggle);
  preview?.querySelectorAll('[data-description-generated]').forEach(node=>node.remove());
  if(preview&&variants)editor.insertBefore(preview,variants);
  if(draft&&variants)editor.insertBefore(draft,variants);
  if(research&&$('optimizerImagesPanel'))editor.insertBefore(research,$('optimizerImagesPanel'));
  $('optimizerDescriptionModern')?.remove();
  editor.classList.remove('desc-modern-editor');
  countNode=null;barNode=null;sourceNode=null;identity='';
 }
 function sync(){
  const editor=$('optimizerWorkflowEditor');
  if(!editor?.classList.contains('desc-modern-editor')||!countNode)return;
  const draft=$('optimizerWorkflowDraft');
  const raw=safeText(draft?.value);
  const length=[...raw.normalize('NFC')].length;
  countNode.textContent=length+' / 1440 caracteres';
  countNode.setAttribute('aria-label',length+' caracteres na descrição');
  const pct=Math.min(100,Math.round(length/1440*100));
  if(barNode){barNode.value=Math.min(length,1440);barNode.title=pct+'% do alvo de 1440 caracteres';}
  // Descrição verdadeira pode ser curta; não premiar enchimento artificial.
  const valid=length>=400&&length<=1440;
  const counts=editor.querySelectorAll('.desc-modern-count');
  counts.forEach(n=>n.dataset.valid=valid?'true':'false');
  const tags=editor.querySelectorAll('[data-desc-part]');
  const tests={
   specifications:/especifica[çc][õo]es|caracter[ií]sticas|material|composi[çc][ãa]o/i,
   measures:/medidas|dimens[õo]es|comprimento|largura|altura/i,
   doubts:/d[uú]vidas|perguntas frequentes|faq/i,
   reasons:/motivos|benef[ií]cios|vantagens/i
  };
  for(const tag of tags){
   const rule=tests[tag.dataset.descPart];
   const exists=Boolean(rule?.test(raw));
   tag.hidden=!exists;
  }
  const intro=$('optimizerDescriptionPreviewSummary'),cta=$('optimizerDescriptionPreviewCta');
  const parts=raw.replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
  const firstSection=parts.findIndex(x=>/^(?:✅\s*benef[ií]cios|💡\s*por que comprar|❓\s*d[uú]vidas|⚙️?\s*caracter[ií]sticas|📦\s*o que)/iu.test(x));
  const paragraphs=(firstSection<0?parts:parts.slice(0,firstSection))
   .filter(x=>!/^(?:🛒|⚙️|📦|📏)/u.test(x));
  const opening=paragraphs.slice(0,2).join(' ').trim();
  if(intro)intro.textContent=opening?([...opening].slice(0,360).join('')+(opening.length>360?'…':'')):
   'A prévia aparecerá quando a descrição estiver preenchida.';
  const lastCta=parts.findLast(x=>x.startsWith('🛒'));
  if(cta){cta.textContent=lastCta||'Convite à compra ainda não incluído — confira a descrição completa.';
   cta.dataset.present=lastCta?'true':'false';}
  if(sourceNode){
   const source=safeText($('optimizerContentResearch')?.textContent);
   sourceNode.textContent=source||'Dados da SKU e anúncio Shopee. Confira os fatos antes de publicar.';
  }
 }
 function open(data){
  close();
  const editor=$('optimizerWorkflowEditor'),preview=$('optimizerDescriptionCompact');
  const draft=$('optimizerWorkflowDraftWrap'),field=$('optimizerWorkflowDraft');
  const research=$('optimizerContentResearch'),toggle=$('optimizerDescriptionToggle');
  if(!editor||!preview||!draft||!field||!research||!toggle||!data)return;
  identity=[data.sku,data.itemId,data.modelId].join(':');
  editor.classList.add('desc-modern-editor');
  const layout=el('div','desc-modern-layout');layout.id='optimizerDescriptionModern';
  editor.insertBefore(layout,editor.firstChild);

  const supplier=data.supplierProduct||{};
  const headline=el('section','desc-modern-hero');
  const photo=el('div','desc-modern-photo');
  const imageUrl=(Array.isArray(data.imageUrls)?data.imageUrls:[]).map(sourceUrl).find(Boolean);
  if(imageUrl){
   const img=el('img');img.src=imageUrl;img.loading='lazy';
   img.alt='Fotografia original do anúncio SKU '+safeText(data.sku);
   photo.append(img);
  }else photo.append(el('span','', '▧'));
  const heroText=el('div','desc-modern-hero-text');
  const badges=el('div','desc-modern-hero-badges');
  badges.append(el('span','desc-modern-sku','SKU '+safeText(data.sku)));
  if(supplier.source)badges.append(el('span','desc-modern-origin',safeText(supplier.source)));
  heroText.append(badges,el('h3','',safeText(data.productTitle||supplier.name||data.draftTitle||'Produto Shopee')));
  const meta=[supplier.brand||'',supplier.ncm?'NCM: '+supplier.ncm:'',supplier.ean?'EAN: '+supplier.ean:''].filter(Boolean);
  if(meta.length)heroText.append(el('p','desc-modern-metadata',meta.join('  |  ')));
  const market=button('◉ Conferir anúncio na Shopee ↗',()=>{
   const link=$('optimizerWorkflowShopee');
   if(link?.href&&link.href!=='#')window.open(link.href,'_blank','noopener,noreferrer');
  },'desc-modern-market');
  headline.append(photo,heroText,market);layout.append(headline);

  const section=el('section','desc-modern-main');
  const heading=el('div','desc-modern-head');
  const step=el('span','desc-modern-step','ETAPA 05');
  const headingText=el('div','desc-modern-heading-text');
  const h=el('div','desc-modern-title-line');
  h.append(el('strong','','Descrição'),
   help('Revisão da descrição','Revise todas as informações antes de registrar a etapa. Registrar a conferência não publica alterações na Shopee.'));
  headingText.append(h,el('p','','Revise, edite e valide o texto comercial antes de gravar na Shopee.'));
  const state=el('div','desc-modern-state');
  state.append(el('strong','','✓ '+(data.descriptionAutoGenerated?'Descrição gerada automaticamente':'Descrição preparada para revisão')),
   el('small','',data.descriptionAutoGenerated?'Baseada nos dados da SKU, WeDrop e Shopee.':'Texto preservado para revisão da SKU.'));
  const gauge=el('div','desc-modern-count');
  countNode=el('span','desc-modern-count-text','0 / 1440 caracteres');
  barNode=el('progress','desc-modern-progress');barNode.max=1440;barNode.value=0;
  barNode.setAttribute('aria-label','Progresso de caracteres na descrição');
  gauge.append(countNode,barNode);
  heading.append(step,headingText,state,gauge);section.append(heading);
  // O usuário controla cada geração. Nunca abrir uma aba ao carregar a SKU.
  const descIdentity={sku:String(data.sku||''),itemId:String(data.itemId||''),
   modelId:String(data.modelId??data.selectedModelId??0)};
  const sourceIdentity=identity;
  const controls=el('div','desc-modern-chatgpt-controls');
  const status=el('div','desc-modern-chatgpt-status',
   'O ChatGPT usa a ficha da WeDrop e as informações salvas desta SKU. Nada é publicado automaticamente.');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const generate=button('✨ Gerar descrição com ChatGPT',()=>{void runGenerate();},'desc-modern-chatgpt-generate');
  const importCopied=button('📋 Importar descrição copiada',()=>{void runImportCopied();},'desc-modern-chatgpt-import');
  const recover=button('↻ Recuperar descrição do ChatGPT',()=>{void runRecover();},'desc-modern-chatgpt-recover');
  const line=el('div','desc-modern-chatgpt-buttons');
  line.append(generate,recover,importCopied);controls.append(line);
  const manual=el('details','desc-modern-manual-import');
  const manualSummary=el('summary','','Se necessário, cole a resposta completa do ChatGPT ▾');
  const manualArea=el('textarea','desc-modern-manual-text');
  manualArea.rows=5;manualArea.placeholder='Cole aqui a resposta completa do ChatGPT com o campo description.';
  const manualButton=button('Importar texto colado',()=>{void runManual();},'desc-modern-manual-confirm');
  manual.append(manualSummary,manualArea,manualButton);controls.append(manual,status);
  section.append(controls);
  let busy=false,saving=false,recovering=false,importingCopied=false;
  let generationAbort=null,autoPasteTimer=null;
  const current=()=>identity===sourceIdentity&&
   $('optimizerWorkflowEditor')?.classList.contains('desc-modern-editor')&&
   $('optimizerWorkflowDraft')===field;
  async function applyDescription(result,{fallback=false}={}){
   if(saving)throw Error('Um salvamento de descrição já está em andamento.');
   if(!current())throw Error('A SKU ou etapa de descrição mudou. Reabra a etapa.');
   if(!globalThis.ShopeeDescriptionSaveChatGPT)throw Error('Salvamento do Manager indisponível. Recarregue a página.');
   saving=true;
   try{
    const saved=await globalThis.ShopeeDescriptionSaveChatGPT(result.description,descIdentity);
    if(!saved?.saved)throw Error('O banco não confirmou o salvamento.');
    generate.textContent='↻ Gerar nova descrição com ChatGPT';
    state.querySelector('strong').textContent='✓ Descrição gerada pelo ChatGPT e salva para revisão';
    status.textContent='✓ Descrição importada e salva para SKU '+descIdentity.sku+
     ' ('+saved.length+' caracteres). Revise o conteúdo antes de publicar.';
    sync();
    // O fallback pode concluir mesmo enquanto a extensão está aguardando resposta.
    // Cancelar a espera SÓ após confirmação no servidor impede retorno antigo
    // de substituir o texto já salvo (ou exibir erro falso cinco minutos depois).
    if(fallback)generationAbort?.abort();
    return true;
   }finally{saving=false;}
  }
  async function runGenerate(){
   if(busy||saving||recovering)return;
   busy=true;generate.disabled=true;
   const controller=new AbortController();generationAbort=controller;
   status.textContent='Preparando descrição comercial com dados da WeDrop…';
   try{
    if(!globalThis.RADescriptionChatGPT?.request)
     throw Error('Módulo da descrição não carregou. Recarregue com Ctrl+Shift+R.');
    const result=await globalThis.RADescriptionChatGPT.request(data,
     message=>{if(current()&&!controller.signal.aborted)status.textContent=message;},
     {signal:controller.signal});
    if(controller.signal.aborted)return;
    await applyDescription(result);
    // Fecha SOMENTE a aba que a própria Ponte abriu, após gravar o rascunho.
    globalThis.RADescriptionChatGPT.acknowledge(result);
   }catch(error){
    if(current()&&!controller.signal.aborted)
     status.textContent='Não foi possível importar automaticamente: '+error.message+
      ' Você pode recuperar ou colar a resposta completa sem precisar reiniciar a etapa.';
   }finally{
    if(generationAbort===controller)generationAbort=null;
    busy=false;generate.disabled=false;
   }
  }
  async function runRecover(){
   if(recovering||saving)return;
   recovering=true;recover.disabled=true;
   status.textContent='Recuperando a descrição já gerada para esta SKU no ChatGPT…';
   try{
    if(!globalThis.RADescriptionChatGPT?.recover)throw Error('Instale a Ponte 1.0.35 e atualize o Manager.');
    const result=await globalThis.RADescriptionChatGPT.recover(data,
     message=>{if(current())status.textContent=message;});
    await applyDescription(result,{fallback:true});
    globalThis.RADescriptionChatGPT.acknowledgeRecovery(result);
   }catch(error){
    if(current()){
     manual.open=true;
     manualArea.focus({preventScroll:true});
     status.textContent='A Ponte não localizou uma resposta vinculada à SKU '+descIdentity.sku+
      ': '+error.message+
      ' A descrição exibida na prévia não foi recuperada do ChatGPT. Copie somente a resposta desta SKU e cole no campo aberto; o sistema validará e salvará sem outro clique.';
    }
   }finally{recovering=false;recover.disabled=false;}
  }
  async function runManual({automatic=false}={}){
   if(saving)return;
   try{
    const result=globalThis.RADescriptionChatGPT?.parse(manualArea.value);
    if(!result)throw Error('Cole a descrição completa do ChatGPT antes de importar.');
    await applyDescription(result,{fallback:true});
    manual.open=false;manualArea.value='';
   }catch(error){
    if(!automatic){manual.open=true;status.textContent='Não foi possível importar: '+error.message;}
   }
  }
  // A própria colagem é a confirmação de importação: assim que o texto
  // estiver completo, gravar na SKU sem exigir outro clique. Isso continua
  // funcionando se a extensão ficar em "aguardando" por vários minutos.
  listen(manualArea,'input',()=>{
   clearTimeout(autoPasteTimer);
   if(!current()||manualArea.value.trim().length<250)return;
   autoPasteTimer=setTimeout(()=>{
    if(!current()||saving||manualArea.value.trim().length<250)return;
    try{globalThis.RADescriptionChatGPT?.parse(manualArea.value);}
    catch{return;} // Não importar um texto ainda sendo composto.
    void runManual({automatic:true});
   },750);
  });
  listeners.push(()=>clearTimeout(autoPasteTimer));
  async function runImportCopied(){
   if(importingCopied||saving)return;
   importingCopied=true;importCopied.disabled=true;
   try{
    const raw=await navigator.clipboard.readText();
    const result=globalThis.RADescriptionChatGPT?.parse(raw);
    if(!result)throw Error('Copie toda a descrição pronta do ChatGPT.');
    await applyDescription(result,{fallback:true});
   }catch(error){
    manual.open=true;manualArea.focus();
    if(current())status.textContent='Não foi possível ler a área de transferência: '+error.message+
     ' Cole toda a resposta com Ctrl+V no campo aberto; o salvamento é automático.';
   }finally{importingCopied=false;importCopied.disabled=false;}
  }

  const strip=el('div','desc-modern-supplier');
  strip.append(el('span','desc-modern-supplier-icon','▤'));
  const stripText=el('div');
  stripText.append(el('strong','',supplier.source||'Informações da WeDrop'),
   el('small','',[supplier.name||data.productTitle||'SKU '+data.sku,supplier.brand||'',
    supplier.ncm?'NCM: '+supplier.ncm:'',supplier.ean?'EAN: '+supplier.ean:''].filter(Boolean).join(' · ')));
  strip.append(stripText);section.append(strip);

  const columns=el('div','desc-modern-columns');
  const left=el('section','desc-modern-panel desc-modern-preview-panel');
  const leftHeader=el('div','desc-modern-panel-head');
  const leftTitle=el('div','desc-modern-panel-title');
  leftTitle.append(el('span','desc-modern-panel-icon','◉'),el('strong','','Prévia da descrição'),
   help('Prévia resumida','A prévia exibe apenas a introdução e os principais blocos. O texto completo fica no editor à direita.'));
  leftHeader.append(leftTitle,el('span','desc-modern-preview-label','Resumo visual'));
  columns.append(left);
  left.append(leftHeader,preview);
  preview.hidden=false;
  const summary=el('div','desc-modern-preview-summary','');
  summary.id='optimizerDescriptionPreviewSummary';summary.dataset.descriptionGenerated='true';
  const chips=el('div','desc-modern-chips');chips.dataset.descriptionGenerated='true';
  for(const [name,label] of [
   ['specifications','⚙ Especificações'],['measures','📏 Medidas'],
   ['doubts','❓ Dúvidas'],['reasons','✅ Benefícios']]){
   const chip=el('span','',label);chip.dataset.descPart=name;chips.append(chip);
  }
  const cta=el('div','desc-modern-cta');
  cta.id='optimizerDescriptionPreviewCta';cta.dataset.descriptionGenerated='true';
  // Manter a prévia integral ligada ao código existente, mas oculta na coluna
  // esquerda. O texto completo permanece acessível pelo editor à direita.
  preview.prepend(summary,chips,cta);
  draft.hidden=false;
  // O editor permanece sempre aberto à direita. O botão antigo da prévia
  // continua em seu rodapé original, oculto enquanto esta etapa está aberta.
  toggle.textContent='Recolher edição ⌃';

  const right=el('section','desc-modern-panel desc-modern-editor-panel');
  const rightHeader=el('div','desc-modern-panel-head');
  const rightTitle=el('div','desc-modern-panel-title');
  rightTitle.append(el('span','desc-modern-panel-icon purple','✎'),
   el('strong','','Rascunho da descrição'),
   help('Editor completo','O mesmo campo original do Shopee Manager, com salvamento automático por SKU. Use Registrar etapa como conferida para confirmar sua revisão.'));
  rightHeader.append(rightTitle,el('small','desc-modern-editor-counter','Edição automática por SKU'));
  right.append(rightHeader,draft);
  field.rows=9;field.setAttribute('aria-label','Editar descrição do anúncio Shopee');
  const source=el('div','desc-modern-source');
  source.append(el('span','desc-modern-source-icon','▤'));
  const sourceText=el('div');
  sourceText.append(el('strong','','Fonte do rascunho'),
   help('Origem do texto','As especificações usadas pelo sistema vêm do cadastro da SKU e das fontes salvas. Revise informações que possam estar incompletas.'));
  sourceNode=el('p','','');
  sourceText.append(sourceNode);
  source.append(sourceText);right.append(source);
  columns.append(right);section.append(columns);

  const tools=el('div','desc-modern-tools');
  for(const [icon,title,detail,id] of [
   ['▤','Informações da WeDrop','Dados, textos e prints desta SKU','optimizerSourcePanel'],
   ['◇','Regras salvas da loja','Diretrizes e padrões de descrições','optimizerRulesDetails'],
   ['▣','Auditoria técnica do anúncio','Fotos, atributos e informações obrigatórias','optimizerAuditPanel']
  ]){
   const link=button('',()=>jump(id),'desc-modern-tool');
   link.replaceChildren(el('span','desc-modern-tool-icon',icon));
   const description=el('span','desc-modern-tool-copy');
   description.append(el('strong','',title),el('small','',detail));
   link.append(description,el('span','desc-modern-tool-arrow','›'));
   tools.append(link);
  }
  section.append(tools);layout.append(section);
  // Preserve the provenance text node and its source-refresh logic.
  section.append(research);
  research.hidden=false;
  const onInput=()=>sync();
  listen(field,'input',onInput);
  const onToggle=()=>requestAnimationFrame(sync);
  listen(toggle,'click',onToggle);
  sync();
 }
 globalThis.ShopeeDescriptionStudio={open,close,sync};
})();