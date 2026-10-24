/* Rede Achados BR — Ponte SEO: títulos gerados pelo ChatGPT na aba autorizada. */
(function(){
 'use strict';
 const ORIGIN='https://redeachados-shopee.onrender.com';
 const clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
 const count=s=>[...clean(s)].length;
 const signature=s=>clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 const emojiCount=s=>(String(s||'').match(/\p{Extended_Pictographic}/gu)||[]).length;
 function prompt(data,extraTerms='',previousTitles=[]){
  const supplier=data?.supplierProduct||{};
  const spec=Array.isArray(data?.attributes)?data.attributes.slice(0,20).map(x=>({
   name:String(x?.name||x?.attribute_name||x?.label||'').slice(0,100),
   value:String(x?.value||x?.valueName||x?.value_name||'').slice(0,160)
  })).filter(x=>x.name&&x.value):[];
  const facts={
   produto:clean(data?.productTitle||data?.title||data?.draftTitle||supplier?.name||'').slice(0,280),
   nomeFornecedor:clean(supplier?.name||'').slice(0,280),
   marcaConfirmada:clean(supplier?.brand||'').slice(0,80),
   atributosConfirmados:spec,
   termosExtrasConfirmados:clean(extraTerms).slice(0,450),
   titulosAnteriores:(Array.isArray(previousTitles)?previousTitles:[]).map(clean).slice(0,4)
  };
  return [
   'Você é especialista brasileiro em SEO de anúncios Shopee da Rede Achados BR.',
   'PESQUISE NA WEB as expressões realmente usadas por compradores para este tipo EXATO de produto: busca e anúncios equivalentes na Shopee, buscas relacionadas e, quando possível, Google Trends. Não trate recorrência em anúncios como volume oficial de buscas. Não invente números de volume, fontes ou links.',
   'Gere exatamente QUATRO títulos DIFERENTES, ângulos: 1 busca direta; 2 sinônimos/palavras-chave; 3 uso real; 4 descoberta. Priorize termos fortes no início. Use SOMENTE características confirmadas no objeto abaixo; não invente medidas, funções, idade, brindes, certificações, marca ou acessórios.',
   'REGRA OBRIGATÓRIA em CADA título: mínimo 100 e máximo 120 caracteres Unicode, IDEAL 120; exatamente 2 EMOJIS; termos relevantes e leitura natural; sem código SKU; não repetir as quatro frases. Valide as quatro contagens antes de responder.',
   'Responda SOMENTE JSON válido (sem Markdown): {"titles":[{"title":"...","reason":"por que estes termos"},{"title":"...","reason":"..."},{"title":"...","reason":"..."},{"title":"...","reason":"..."}],"keywords":["termo1","termo2"],"sources":["https://url-real-1","https://url-real-2"],"researchStatus":"verified|unverified"}.',
   'Use researchStatus="verified" apenas se pesquisou de fato e conseguir citar URLs reais; senão marque "unverified", fontes vazias e explique nos motivos que as palavras-chave são hipóteses SEO não verificadas. Não invente fonte.',
   'DADOS COMPROVADOS DA SKU: '+JSON.stringify(facts)
  ].join('\n\n');
 }
 function parse(raw){
  let body=String(raw||'').trim();
  if(body.length>40000)throw Error('A resposta do ChatGPT excedeu o tamanho permitido.');
  body=body.replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,'');
  let answer;
  try{answer=JSON.parse(body);}catch{
   const a=body.indexOf('{'),b=body.lastIndexOf('}');
   if(a<0||b<=a)throw Error('O ChatGPT não devolveu JSON. Peça para responder somente no formato solicitado.');
   try{answer=JSON.parse(body.slice(a,b+1));}catch{throw Error('A resposta não é um JSON válido com quatro títulos.');}
  }
  if(!answer||!Array.isArray(answer.titles)||answer.titles.length!==4)
   throw Error('O ChatGPT precisa retornar exatamente quatro títulos.');
  const seen=new Set();
  const titles=answer.titles.map((item,i)=>{
   const title=clean(typeof item==='string'?item:item?.title);
   const length=count(title);
   if(length<100||length>120)throw Error('Opção '+(i+1)+' possui '+length+' caracteres; exigidos 100 a 120.');
   if(emojiCount(title)!==2)throw Error('Opção '+(i+1)+' precisa ter exatamente 2 emojis.');
   const k=signature(title);
   if(seen.has(k))throw Error('O ChatGPT repetiu uma sugestão. Gere quatro opções distintas.');
   seen.add(k);
   return {title,length,reason:clean(item?.reason||'Termos comerciais sugeridos pelo ChatGPT').slice(0,320)};
  });
  const sources=(Array.isArray(answer.sources)?answer.sources:[]).map(String)
   .filter(v=>{try{const u=new URL(v);return (u.protocol==='https:'||u.protocol==='http:')&&u.hostname.includes('.');}catch{return false;}})
   .slice(0,8);
  const researchStatus=answer.researchStatus==='verified'&&sources.length?'verified':'unverified';
  return {titles,keywords:(Array.isArray(answer.keywords)?answer.keywords:[]).map(clean).filter(Boolean).slice(0,15),
   sources,researchStatus,source:'chatgpt_browser',
   message:researchStatus==='verified'
    ?'ChatGPT retornou quatro títulos e links de pesquisa para conferência.'
    :'ChatGPT retornou quatro títulos, mas NÃO apresentou fontes verificáveis de pesquisa. Confira palavras-chave antes de usar.'};
 }
 function request(data,{extraTerms='',previousTitles=[]}={}){
  if(location.origin!==ORIGIN)return Promise.reject(Error('Abra o Shopee Manager oficial para usar a ponte.'));
  if(!crypto?.randomUUID)return Promise.reject(Error('Chrome não suporta esta sessão. Atualize o navegador.'));
  const nonce=crypto.randomUUID(),sku=clean(data?.sku||''),itemId=String(data?.itemId||'');
  const modelId=String(data?.modelId??data?.selectedModelId??'0');
  if(!sku||!itemId)return Promise.reject(Error('Carregue a SKU antes de pesquisar títulos.'));
  return new Promise((resolve,reject)=>{
   let done=false;
   const finish=(error,result)=>{
    if(done)return;done=true;window.clearTimeout(timer);
    window.removeEventListener('message',listener);
    if(error)reject(error instanceof Error?error:Error(String(error)));
    else resolve(result);
   };
   const listener=event=>{
    if(event.source!==window||event.origin!==ORIGIN||event.data?.nonce!==nonce)return;
    const m=event.data;
    if(m.kind==='RA_EXTENSION_SEO_START_RESULT'&&m.ok===false)
     return finish(Error(m.error||'A extensão rejeitou a pesquisa.'));
    if(m.kind==='RA_EXTENSION_SEO_RESULT'){
     if(m.sku!==sku||String(m.itemId)!==itemId||String(m.modelId)!==modelId)return;
     if(m.ok!==true)return finish(Error(m.error||'O ChatGPT não retornou os títulos.'));
     try{finish(null,parse(m.rawText));}catch(err){finish(err);}
    }
   };
   window.addEventListener('message',listener);
   const timer=window.setTimeout(()=>finish(Error('Sem resposta da Ponte ChatGPT. Instale a versão 1.0.27, confira o login do ChatGPT e tente novamente.')),145000);
   window.postMessage({kind:'RA_SITE_SEO_START',payload:{nonce,sku,itemId,modelId,
    prompt:prompt(data,extraTerms,previousTitles)}},ORIGIN);
  });
 }
 globalThis.RASeoChatGPT={request,parse,prompt,count,emojiCount};
})();