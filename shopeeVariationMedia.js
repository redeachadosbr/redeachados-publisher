// Fotos de variações em storage PRIVADO existente. Identidade da loja permanece no backend.
import crypto from 'node:crypto';
import {imageDimensions,MAX_IMAGE_BYTES,IMAGE_BUCKET} from './shopeePreparedImages.js';
const num=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw Error('Identificador inválido.');return n};
function config(){
 const url=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!/^https:\/\//.test(url)||!key)throw Error('Armazenamento privado de imagens indisponível.');
 return {url,headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})}};
}
const clean=x=>String(x||'').normalize('NFC').trim();
export function validateVariationName(value){
 const name=clean(value);
 if(!name||[...name].length>60||/[\x00-\x1f]/.test(name))throw Error('Opção de variação inválida.');
 return name;
}
export function variationImagePrompt(record,type,value){
 const option=validateVariationName(value),kind=clean(type);
 if(!kind||kind.length>50)throw Error('Selecione o tipo da variação.');
 return [
  'Gere UMA FOTOGRAFIA quadrada 1200x1200 de e-commerce, sem texto, preço, marca d’água ou selos adicionais.',
  'As imagens anexadas mostram o produto REAL do fornecedor. Mantenha rigorosamente geometria, dimensões visuais, quantidade de rodas e peças, forma, acessórios, marcas existentes, acabamento e proporções.',
  'Variação desejada: '+kind+' = '+option+'. Altere SOMENTE a característica '+kind+' conforme a opção, sem modificar o modelo.',
  'Se for cor, mantenha SOMENTE a coloração da peça variável conforme '+option+', mantendo outras partes e cores originais.',
  'Produto: '+String(record?.title||'').slice(0,230)+'. Fundo ambientado coerente e limpo, objeto em destaque ocupando aproximadamente 85% da fotografia.',
  'Esta é uma proposta visual para revisão da variante física, nunca uma prova de disponibilidade ou estoque do fornecedor.'
 ].join('\n');
}
export async function saveVariationImage({shopId,itemId,modelId=0,file,mime}){
 if(!['image/png','image/jpeg'].includes(mime))throw Error('Envie PNG ou JPG.');
 const dims=imageDimensions(file,mime);
 if(dims.width!==1200||dims.height!==1200)throw Error('A foto da variação deve ter 1200 × 1200 pixels.');
 if(file.length>MAX_IMAGE_BYTES)throw Error('Imagem acima de 10 MB.');
 const extension=dims.extension;
 const pathname=[num(shopId),num(itemId),Number(modelId)||0,'variations',crypto.randomUUID()+'.'+extension].join('/');
 const {url,headers}=config();
 const response=await fetch(url+'/storage/v1/object/'+IMAGE_BUCKET+'/'+pathname,{
  method:'POST',headers:{...headers,'Content-Type':mime,'x-upsert':'false'},body:file,signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('Não foi possível armazenar a foto da variação (HTTP '+response.status+').');
 return {storagePath:pathname,mime,sha256:crypto.createHash('sha256').update(file).digest('hex'),
  size:file.length,savedAt:new Date().toISOString()};
}
export async function variationImageBytes(asset){
 const pathname=String(asset?.storagePath||'');
 if(!/^\d+\/\d+\/\d+\/variations\/[0-9a-f-]+\.(png|jpg)$/.test(pathname))
  throw Error('Foto da variação não foi salva corretamente.');
 const {url,headers}=config();
 const response=await fetch(url+'/storage/v1/object/'+IMAGE_BUCKET+'/'+pathname,{
  headers,signal:AbortSignal.timeout(40000)});
 if(!response.ok)throw Error('Não foi possível recuperar a foto da variação.');
 const file=Buffer.from(await response.arrayBuffer());
 if(crypto.createHash('sha256').update(file).digest('hex')!==asset.sha256)throw Error('Foto mudou desde a conferência.');
 imageDimensions(file,asset.mime);
 return file;
}
export async function variationImagePreview(asset){
 if(!asset?.storagePath)return null;
 const {url,headers}=config();
 const r=await fetch(url+'/storage/v1/object/sign/'+IMAGE_BUCKET+'/'+asset.storagePath,{
  method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:600}),signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('Não foi possível disponibilizar a prévia da foto.');
 const json=await r.json(),relative=String(json.signedURL||json.signedUrl||'');
 if(!relative.startsWith('/object/sign/'))throw Error('Assinatura de foto inválida.');
 return url+'/storage/v1'+relative;
}
export function validateVariationDetails(body,{requirePhotos=false}={}){
 const type=clean(body?.type),raw=body?.options;
 if(!type||type.length>50||!Array.isArray(raw)||!raw.length||raw.length>20)
  throw Error('Informe tipo e até 20 opções de variação.');
 const names=new Set();
 const options=raw.map((entry,i)=>{
  const name=validateVariationName(entry.name);
  const key=name.toLocaleLowerCase('pt-BR');
  if(names.has(key))throw Error('Opções repetidas não são permitidas.');
  names.add(key);
  const price=Number(entry.price),stock=Number(entry.stock),sku=clean(entry.sku);
  if(!Number.isFinite(price)||price<0||price>999999||(requirePhotos&&price<=0))
   throw Error('Informe preço maior que zero para '+name+'.');
  if(!Number.isInteger(stock)||stock<1||stock>999999)throw Error('Estoque de '+name+' deve ser pelo menos 1.');
  if(!sku||sku.length>100||/[\x00-\x1f]/.test(sku))throw Error('Informe SKU distinta para '+name+'.');
  const gtin=clean(entry.gtin),noGtin=entry.noGtin===true;
  const supplierSku=clean(entry.supplierSku);
  if(supplierSku.length>120||/[\x00-\x1f]/.test(supplierSku))
   throw Error('SKU WeDrop inválida na variação '+name+'.');
  if(!noGtin&&gtin&&!/^\d{8,14}$/.test(gtin))throw Error('GTIN de '+name+' deve ter de 8 a 14 dígitos.');
  const asset=entry.asset;
  if(requirePhotos&&(!asset?.storagePath||!asset.sha256))throw Error('Foto pendente da opção '+name+'.');
  return {name,price,stock,sku,supplierSku,gtin:noGtin?'':gtin,noGtin,asset:asset||null,
   stockConfirmed:entry.stockConfirmed===true,photoConfirmed:entry.photoConfirmed===true,
   index:i};
 });
 if(new Set(options.map(x=>x.sku.toLowerCase())).size!==options.length)
  throw Error('Cada variação exige SKU diferente.');
 if(requirePhotos&&options.some(x=>!x.stockConfirmed||!x.photoConfirmed))
  throw Error('Confirme foto e disponibilidade real de cada variação no fornecedor.');
 return {type,options};
}
export function buildVariationPayload(itemId,draft,ids){
 const options=draft.options.map((o,i)=>({option:o.name,image:{image_id:ids[i]}}));
 const standard=draft.options.map((o,i)=>({variation_option_name:o.name,image_id:ids[i],variation_option_id:0}));
 return {item_id:Number(itemId),
  tier_variation:[{name:draft.type,option_list:options}],
  standardise_tier_variation:[{variation_id:0,variation_name:draft.type,variation_option_list:standard}],
  model:draft.options.map((o,i)=>({tier_index:[i],original_price:o.price,
    model_sku:o.sku,seller_stock:[{stock:o.stock}],...(o.gtin?{gtin_code:o.gtin}:{})}))};
}
