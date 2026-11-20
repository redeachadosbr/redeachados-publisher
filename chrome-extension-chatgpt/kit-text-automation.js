'use strict';
// Recupera SOMENTE texto de anúncios de kit na aba ChatGPT autorizada pelo usuário.
// v1.0.61: o ChatGPT pode recolher/virtualizar o prompt do usuário. Nessa situação,
// validar TODOS os nomes dos componentes na própria resposta comercial.
// Não lê cookies, tokens, conversas sem SKU correspondente ou mensagens de outros sites.
const RAKitTextAutomation=(()=>{
 function scanDOM(request){
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const visible=e=>Boolean(e)&&(!e.getClientRects||e.getClientRects().length>0);
  const text=e=>String(e?.innerText||e?.textContent||'').replace(/\r\n?/g,'\n').trim();
  const skus=Array.isArray(request?.skus)?request.skus.map(s=>String(s).trim()).filter(Boolean).slice(0,4):[];
  const kitSku=String(request?.kitSku||'').trim();
  if(!/^KIT[-_]/i.test(kitSku)||skus.length<2)return {ok:false,error:'Composição do kit inválida.'};
  const userEls=[...document.querySelectorAll('[data-message-author-role="user"], [data-testid="conversation-turn-user"]')];
  const users=userEls.map(text).filter(Boolean);
  const messages=users.join('\n');
  const matchedKit=norm(messages).includes(norm(kitSku));
  const count=skus.filter(s=>norm(messages).includes(norm(s))).length;
  const names=Array.isArray(request?.products)?request.products.slice(0,4):[];
  const stopped=new Set(['kit','combo','conjunto','jogo','de','da','do','das','dos','com','para','em','a','o','e','ou','peca','pecas','unidade','unidades','brinquedo','produto']);
  function nameMatched(reply,name){
   const words=[...new Set(norm(name).split(/[^a-z0-9]+/).filter(x=>x.length>=4&&!stopped.has(x)))];
   if(!words.length)return false;
   const target=' '+norm(reply).replace(/[^a-z0-9]+/g,' ')+' ';
   // Exigir duas expressões distintas do mesmo produto, quando existirem.
   const hits=words.slice(0,7).filter(w=>target.includes(' '+w+' '));
   return hits.length>=Math.min(2,words.length) && hits.includes(words[0]);
  }
  // Se o usuário estiver realmente vendo OUTRO identificador de kit,
  // jamais atribuir uma resposta semelhante ao kit ativo.
  const foreignKit=[...messages.matchAll(/\bKIT[-_][A-Za-z0-9_-]{4,140}\b/gi)]
   .some(m=>norm(m[0])!==norm(kitSku));
  if(foreignKit&&!matchedKit)return {ok:false,error:'Conversa vinculada a outro kit.'};
  const assistants=[...document.querySelectorAll('[data-message-author-role="assistant"], [data-testid="conversation-turn-assistant"], article[data-role="assistant"]')];
  const extraSelectors='[data-testid="writing-block"], [data-testid="artifact-content"], [data-testid="code-block"], .markdown, .prose, pre';
  const candidates=[];
  for(const el of assistants){
   if(!visible(el)&&!text(el))continue;
   candidates.push(text(el));
   for(const inner of el.querySelectorAll(extraSelectors))if(visible(inner))candidates.push(text(inner));
  }
  // Blocos Escrita podem ser renderizados em um container independente do turno.
  const main=document.querySelector('main')||document.querySelector('[role="main"]');
  if(main){
   for(const el of main.querySelectorAll(extraSelectors))if(visible(el))candidates.push(text(el));
   // Última alternativa para o layout Escrita fora dos seletores conhecidos:
   // extrair o ÚLTIMO bloco de título dentro do main e confirmar cada produto.
   const full=text(main);
   if(full.length>=160&&full.length<100000)candidates.push(full);
  }
  // A versão atual do ChatGPT também pode usar um writing block fora do main.
  for(const el of document.querySelectorAll('[data-testid="writing-block"], [data-testid="artifact-content"]'))
   if(visible(el))candidates.push(text(el));
  const complete=s=>{const t=norm(s);
   return /(?:^|\n)\s*(?:\*\*)?titulo\s*1\s*[:：—–-]/m.test(t)&&
    /(?:^|\n)\s*(?:\*\*)?titulo\s*2\s*[:：—–-]/m.test(t)&&
    /(?:^|\n)\s*(?:\*\*)?titulo\s*3\s*[:：—–-]/m.test(t)&&
    /(?:^|\n)\s*(?:\*\*)?descricao\s*[:：—–-]/m.test(t);};
  let best='',bestMethod='',matchedProducts=0;
  for(const candidate of candidates){
   if(candidate.length>15000||candidate.length<160||!complete(candidate))continue;
   // Tomar o último bloco TÍTULO 1 dentro do turno, não a instrução exemplificativa.
   const matches=[...candidate.matchAll(/(?:^|\n)\s*(?:\*\*)?T[ÍI]TULO\s*1\s*[:：—–-]/gim)];
   for(const match of matches){
    const tail=candidate.slice(match.index).trim();
    if(!complete(tail)||tail.length>13000)continue;
    const productMatches=names.filter(p=>nameMatched(tail,p.name)).length;
    const fromPrompt=matchedKit||count===skus.length;
    // Sem acesso aos detalhes do prompt, aceitar APENAS resposta que descreva
    // todos os nomes dos itens; não fazer seleção baseada no nome genérico do kit.
    if(!fromPrompt&&(names.length!==skus.length||productMatches!==skus.length))continue;
    const desc=/\bDESCRI[ÇC][ÃA]O\s*[:：—–-]/i.exec(tail);
    if(!desc||tail.length-desc.index<120)continue;
    // Blocos de escrita reais são preferidos a texto bruto que inclui outras mensagens.
    if(!best||tail.length<best.length){
     best=tail;bestMethod=fromPrompt?'user_skus':'all_product_names';matchedProducts=productMatches;
    }
   }
  }
  if(!best)return {ok:false,error:'A resposta com os três títulos e a descrição ainda não apareceu nesta conversa.'};
  const generating=Boolean(document.querySelector('[data-testid="stop-button"], button[aria-label="Parar de gerar"], button[aria-label="Stop generating"]'));
  if(generating)return {ok:false,error:'O ChatGPT ainda está gerando; não importar resposta incompleta.'};
  return {ok:true,rawText:best,kitSku,matchedSkus:count,matchedKit,matchedProducts,matchMethod:bestMethod};
 }
 async function recover(payload){
  const kitSku=String(payload?.kitSku||'').trim(),skus=Array.isArray(payload?.skus)?payload.skus.map(String):[];
  const products=Array.isArray(payload?.products)?payload.products.slice(0,4).map(p=>({sku:String(p.sku||''),name:String(p.name||'').slice(0,180)})):[];
  if(!/^KIT[-_][a-z0-9_-]{3,120}$/i.test(kitSku)||skus.length<2||skus.length>4||
    skus.some(s=>!/^[-a-z0-9]{2,80}$/i.test(s))||products.length!==skus.length||
    products.some((p,i)=>p.sku!==skus[i]||!p.name.trim()))throw Error('Kit, nomes ou SKUs inválidos para recuperação.');
  const chats=(await chrome.tabs.query({url:['https://chatgpt.com/*']}))
   .filter(tab=>Number.isInteger(tab.id)&&!tab.discarded);
  if(!chats.length)throw Error('Não encontrei nenhuma aba aberta do ChatGPT.');
  const evaluated=[];
  for(const tab of chats){
   try{
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:scanDOM,args:[{kitSku,skus,products}]});
    for(const frame of results||[]){
     const result=frame?.result;
     if(result?.ok&&result.kitSku===kitSku){
      evaluated.push({tabId:tab.id,rawText:result.rawText,matchedKit:result.matchedKit,
       matchedSkus:result.matchedSkus,matchedProducts:result.matchedProducts,matchMethod:result.matchMethod,
       lastAccessed:tab.lastAccessed||0,active:tab.active});
     }
    }
   }catch{/* Ignorar aba em navegação ou domínio cujo frame não permita inspeção. */}
  }
  if(!evaluated.length)throw Error('A Ponte não identificou uma resposta completa e única correspondente aos produtos deste kit. Confira a conversa aberta e os nomes das SKUs.');
  evaluated.sort((a,b)=>Number(b.matchedKit)-Number(a.matchedKit)||b.matchedSkus-a.matchedSkus||
   b.matchedProducts-a.matchedProducts||Number(b.active)-Number(a.active)||b.lastAccessed-a.lastAccessed);
  if(evaluated.length>1&&!evaluated.some(x=>x.matchedKit||x.matchedSkus===skus.length)){
   // Pode haver múltiplas conversas com a mesma composição textual; só
   // aceitar se elas contiverem o MESMO anúncio, evitando troca de rascunhos.
   const replies=new Set(evaluated.map(x=>x.rawText.replace(/\s+/g,' ').trim()));
   if(replies.size>1)throw Error('Há mais de uma conversa com produtos equivalentes. Feche as outras abas do ChatGPT e tente novamente.');
  }
  const picked=evaluated[0];
  return {ok:true,kitSku,rawText:picked.rawText,source:'Ponte ChatGPT v1.0.61',matchedSkus:picked.matchedSkus,matchMethod:picked.matchMethod};
 }
 return {recover,scanDOM};
})();
