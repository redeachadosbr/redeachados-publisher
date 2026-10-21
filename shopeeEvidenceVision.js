// Explicit screenshot transcription for supplier facts; no Shopee marketplace writes.
const BEGIN='[LEITURA DE PRINTS WEDROP - INÍCIO]';
const END='[LEITURA DE PRINTS WEDROP - FIM]';
export function withoutExtractedPrints(input){
 const value=String(input||'').normalize('NFC').replace(/\r\n?/g,'\n');
 const start=value.indexOf(BEGIN),end=value.indexOf(END,start<0?0:start);
 if(start<0||end<start)return value.trim();
 return (value.slice(0,start)+value.slice(end+END.length)).replace(/\n{3,}/g,'\n\n').trim();
}
export function mergeExtractedPrints(existing,lines){
 const base=withoutExtractedPrints(existing);
 const cleaned=[...new Set((Array.isArray(lines)?lines:[]).filter(x=>typeof x==='string').map(x=>
  x.normalize('NFC').replace(/[\x00-\x1f]+/g,' ').replace(/\s+/g,' ').trim()
 ).filter(x=>x.length>=4&&x.length<=190))].slice(0,45);
 if(!cleaned.length)return {text:base,count:0};
 const block=BEGIN+'\n'+cleaned.join('\n')+'\n'+END;
 if([...base].length+[...block].length+2>12000)throw Error('O texto da ficha está no limite. Reduza-o para incluir dados dos prints.');
 return {text:[base,block].filter(Boolean).join('\n\n'),count:cleaned.length};
}
export async function extractSupplierScreenshotText(apiKey,images){
 const key=String(apiKey||'').trim();
 if(!key)throw Error('Conecte a API OpenAI do Shopee Manager para ler automaticamente os prints. Texto colado funciona sem IA.');
 if(!Array.isArray(images)||!images.length)return {lines:[],message:'Nenhum print anexado nesta SKU.'};
 const parts=[{type:'text',text:[
  'Transcreva SOMENTE especificações visíveis do MESMO produto presentes nas imagens anexadas.',
  'Retorne JSON com campo lines, lista de linhas curtas no formato Chave: valor.',
  'Priorize: nome exato, material, idade recomendada, dimensões do PRODUTO (não da embalagem), certificação/registro somente se número legível, capacidade, quantidade, cores, marca explícita, conteúdo da embalagem, modelo, conectividade.',
  'Ignore navegador, banners, preço, frete, avaliações, dados pessoais e anúncios de outros produtos.',
  'Não invente unidades, números, certificações ou propriedades. Se estiver ilegível, omita.',
  'Não chame fornecedor ou origem "Importado" de marca. Não transforme "certificado" sem número em registro válido.',
  'Não faça interpretação nem explique. Até 45 linhas.'
 ].join(' ')}];
 for(const im of images.slice(0,4)){
  parts.push({type:'image_url',image_url:{url:'data:'+im.mime+';base64,'+im.bytes.toString('base64'),detail:'high'}});
 }
 const response=await fetch('https://api.openai.com/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({model:String(process.env.OPENAI_SUPPLIER_VISION_MODEL||'gpt-4.1-mini'),
   response_format:{type:'json_object'},max_tokens:1400,temperature:0,
   messages:[{role:'system',content:'Você é um transcritor literal de fichas de produto. Nunca deduza atributos. JSON válido.'},
    {role:'user',content:parts}]}),signal:AbortSignal.timeout(90000)
 });
 if(!response.ok){
  // Do not expose remote payloads, keys, signed URLs or identifying details.
  throw Error('A leitura dos prints pela IA falhou (HTTP '+response.status+'). Confira a integração OpenAI.');
 }
 const payload=await response.json();
 let parsed;
 try{parsed=JSON.parse(String(payload?.choices?.[0]?.message?.content||'{}'));}
 catch{throw Error('A IA não retornou uma ficha legível. Cole as especificações em texto.');}
 const lines=Array.isArray(parsed?.lines)?parsed.lines:[];
 return {lines:lines.filter(x=>typeof x==='string').slice(0,45)};
}
