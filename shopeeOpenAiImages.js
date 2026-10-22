// Geração de imagens comerciais via API OpenAI. Nunca publica diretamente na Shopee.
import {spawn} from 'node:child_process';
import {imageDimensions,MAX_IMAGE_BYTES} from './shopeePreparedImages.js';

export const IMAGE_STORYBOARD=Object.freeze([
 'FOTO 01 — CAPA: fundo ambientado coerente com a categoria. Produto original em primeiro plano ocupando aproximadamente 85% da composição, sem textos, nova marca ou acessórios inventados.',
 'FOTO 02 — DIMENSÕES: fundo ambientado, produto em perspectiva 3D realista e cotas aplicadas ao redor do próprio produto, apenas para altura/largura/profundidade comprovadas como medidas DO PRODUTO. Sem medidas confiáveis, destacar vista dimensional sem valores numéricos e sem inventar escala.',
 'FOTO 03 — PUBLICIDADE 3D ANAMÓRFICA: efeito convincente de profundidade e perspectiva com o MESMO produto parecendo saltar para fora de uma moldura, painel, caixa cenográfica ou espaço visual coerente com sua categoria; jamais criar partes ou funções no produto.',
 'FOTO 04 — DETALHES: ambiente coerente, destaque macro em acabamentos, materiais e elementos realmente visíveis na referência, com pequenas legendas em português somente para informações confirmadas.',
 'FOTO 05 — BENEFÍCIOS: fundo ambientado, evidenciar de forma visual motivos reais para a compra e benefícios efetivamente apoiados nas características do produto. Não criar promessas ou usos falsos.',
 'FOTO 06 — CARACTERÍSTICAS: fundo ambientado, ângulo diferente da capa, características verdadeiras do produto destacadas de maneira limpa e eventualmente com textos curtos em português.',
 'FOTO 07 — ANTES E DEPOIS: duas situações realistas mostrando a diferença entre não ter e ter o produto, sem prometer resultados não comprovados, com o produto idêntico à referência na cena DEPOIS.',
 'FOTO 08 — PRODUTO EM USO: mostrar pessoa ou contexto cotidiano usando o produto de forma realista, segura e correta, com o produto fiel à referência claramente destacado.',
 'FOTO 09 — CTA: fundo ambientado, produto original ocupando aproximadamente 85% da composição em ângulo visivelmente diferente da capa; chamada curta de venda em português, sem preço, urgência falsa ou promoções não confirmadas.'
]);

export function imageGenerationStatus(){
 return {configured:Boolean(String(process.env.OPENAI_API_KEY||'').trim()),
  provider:'OpenAI',model:String(process.env.OPENAI_IMAGE_MODEL||'gpt-image-2')};
}
export function validateImageSourceUrl(input){
 let url;
 try{url=new URL(String(input||''));}catch{throw Error('URL da fotografia original inválida.');}
 const domain=url.hostname.toLowerCase();
 const accepted=['susercontent.com','shopee.com.br','shopeeusercontent.com','shopeemobile.com'];
 if(url.protocol!=='https:'||url.username||url.password||url.port||!accepted.some(x=>domain===x||domain.endsWith('.'+x)))
  throw Error('Fotografia original fora dos domínios autorizados da Shopee.');
 return url.toString();
}
export function imagePrompt({record,slot,masterPrompt='',note='',sourceImageCount=1}){
 const position=Number(slot);
 if(!Number.isInteger(position)||position<1||position>9)throw Error('Posição inválida (1 a 9).');
 const attributes=(record?.attributeAudit?.attributes||[])
  .filter(x=>x.state==='filled'&&Array.isArray(x.values)&&x.values.length)
  .slice(0,18).map(x=>String(x.name)+': '+x.values.map(v=>v.name+(v.unit?' '+v.unit:'')).join(', '));
 const product=String(record?.title||'Produto do anúncio Shopee').slice(0,240);
 return [
  'FOTOGRAFIA COMERCIAL BRASILEIRA, QUADRADA, 1200 x 1200. Entregue uma única imagem final, não uma grade.',
  'O(s) arquivo(s) anexado(s) são fotos reais do MESMO produto comercializado. Preserve com prioridade absoluta a forma, proporções, peças, quantidade, cor, acabamento, textura, logotipos existentes, identificação e acessórios da referência. Não trocar modelo nem criar produto parecido.',
  'SKU '+String(record?.sku||'').slice(0,120)+'. Produto: '+product+'.',
  'REFERÊNCIAS RECEBIDAS: '+sourceImageCount+'. Observe-as para preservar a identidade visual.',
  'POSIÇÃO '+position+'/9: '+IMAGE_STORYBOARD[position-1],
  'CRIE UMA CENA VISUAL DIFERENTE DAS OUTRAS OITO: novo ângulo, enquadramento e narrativa. Mantenha idêntico o produto de referência, não apenas um produto parecido.',
  attributes.length?'CARACTERÍSTICAS CONFIRMADAS PELA FICHA ATUAL: '+attributes.join('; ').slice(0,1800):'Nenhuma especificação técnica independente foi confirmada. Evite inserir números, medidas, selos, certificações ou alegações técnicas.',
  'REGRA FIXA: fotografia fotorrealista profissional, objeto em foco, ambiente ambientado à utilidade real do produto, 1200 × 1200, sem preço, marca d’água ou logo novo. Foto 01 sem texto; fotos 02, 04, 05, 06 e 09 podem conter apenas informações discretas e comprovadas em português. Não invente embalagem, conteúdo, medidas ou funções. Medidas de pacote/embalagem NÃO são medidas do produto. Na ausência de prova, não desenhe números ou atributos fictícios.',
  'INSTRUÇÕES COMERCIAIS SALVAS DA LOJA (subordinadas à fidelidade factual): '+String(masterPrompt||'Nenhuma adicional.').slice(0,9000),
  'AJUSTE ESPECÍFICO DESTA POSIÇÃO: '+String(note||'Manter fidelidade à foto original.').slice(0,500)
 ].join('\n');
}
function sniffImage(bytes){
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216)return 'image/jpeg';
 if(bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 throw Error('A Shopee não retornou fotografia PNG, JPEG ou WebP válida.');
}
export async function fetchShopeeReference(input){
 let url=validateImageSourceUrl(input);
 for(let redirect=0;redirect<3;redirect++){
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(25000),
   headers:{Accept:'image/png,image/jpeg,image/webp'}});
  if([301,302,303,307,308].includes(response.status)){
   const next=response.headers.get('location');
   if(!next)throw Error('Redirecionamento inválido da foto Shopee.');
   url=validateImageSourceUrl(new URL(next,url).toString());
   continue;
  }
  if(!response.ok)throw Error('Falha ao ler a foto original da Shopee (HTTP '+response.status+').');
  const length=Number(response.headers.get('content-length')||0);
  if(length>MAX_IMAGE_BYTES)throw Error('Foto original acima de 10 MB.');
  const body=Buffer.from(await response.arrayBuffer());
  if(body.length<24||body.length>MAX_IMAGE_BYTES)throw Error('Foto original vazia ou grande demais.');
  return {file:body,mime:sniffImage(body)};
 }
 throw Error('A foto Shopee teve redirecionamentos excessivos.');
}
function resizeImagePng(bytes){
 return new Promise((resolve,reject)=>{
  const ff=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-vf','scale=1200:1200:flags=lanczos','-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1'],{stdio:['pipe','pipe','pipe']});
  let size=0;const chunks=[],errors=[];
  const timeout=setTimeout(()=>ff.kill('SIGKILL'),30000);
  ff.stdout.on('data',chunk=>{size+=chunk.length;if(size>MAX_IMAGE_BYTES){ff.kill('SIGKILL');return;}chunks.push(chunk);});
  ff.stderr.on('data',chunk=>{if(errors.length<10)errors.push(chunk);});
  ff.on('error',e=>{clearTimeout(timeout);reject(Error('FFmpeg indisponível: '+e.message));});
  ff.on('close',code=>{
   clearTimeout(timeout);
   if(code!==0||size>MAX_IMAGE_BYTES)return reject(Error('Falha ao converter fotografia para 1200 × 1200: '+Buffer.concat(errors).toString('utf8').slice(0,160)));
   resolve(Buffer.concat(chunks));
  });
  ff.stdin.on('error',()=>{});
  ff.stdin.end(bytes);
 });
}
export async function generateOpenAiImage({record,slot,masterPrompt='',note='',referenceUrls=[],apiKey='',overridePrompt=null}){
 const status=imageGenerationStatus();
 const token=String(apiKey||process.env.OPENAI_API_KEY||'').trim();
 if(!token)throw Error('Conecte sua conta da API OpenAI em Otimização > Gerador de imagens.');
 const sources=[...new Set(referenceUrls.filter(Boolean))].slice(0,1);
 if(!sources.length)throw Error('Nenhuma fotografia original encontrada na Shopee. Importação manual necessária.');
 const originals=[];
 for(const u of sources)originals.push(await fetchShopeeReference(u));
 const form=new FormData();
 form.set('model',status.model);
 form.set('size',status.model.startsWith('gpt-image-1')?'1024x1024':'1200x1200');
 form.set('quality',String(process.env.OPENAI_IMAGE_QUALITY||'medium'));
 form.set('output_format','png');
 form.set('n','1');
 form.set('prompt',overridePrompt||imagePrompt({record,slot,masterPrompt,note,sourceImageCount:originals.length}));
 for(const [i,x] of originals.entries())form.append('image[]',new Blob([x.file],{type:x.mime}),'original-'+i+(x.mime==='image/png'?'.png':x.mime==='image/webp'?'.webp':'.jpg'));
 const response=await fetch('https://api.openai.com/v1/images/edits',{
  method:'POST',headers:{Authorization:'Bearer '+token},
  body:form,signal:AbortSignal.timeout(165000)
 });
 if(!response.ok){
  let message='';
  try{const data=await response.json();message=String(data?.error?.message||'').slice(0,260);}catch{}
  throw Error('OpenAI retornou HTTP '+response.status+(message?': '+message:'')+'. Confira a chave, o saldo da API e acesso ao modelo.');
 }
 const result=await response.json(),encoded=result?.data?.[0]?.b64_json;
 if(typeof encoded!=='string'||encoded.length<500)throw Error('OpenAI não retornou os bytes da fotografia.');
 let file=Buffer.from(encoded,'base64');
 let dimensions;
 try{dimensions=imageDimensions(file,'image/png');}catch{dimensions=null;}
 if(!dimensions||dimensions.width!==1200||dimensions.height!==1200)file=await resizeImagePng(file);
 imageDimensions(file,'image/png');
 if(file.length>MAX_IMAGE_BYTES)throw Error('Imagem gerada acima do limite de 10 MB.');
 return {file,mime:'image/png',model:status.model,usage:result.usage||null};
}
