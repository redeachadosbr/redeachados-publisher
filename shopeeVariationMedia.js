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
// A revisão geral equivale à conferência de cada opção SOMENTE quando
// posterior ao último salvamento de rascunho e das imagens associadas.
export function reviewedVariationEvidence(body,review){
 if(review?.reviewed!==true)return false;
 const approved=Date.parse(String(review.reviewedAt||''));
 if(!Number.isFinite(approved))return false;
 const modified=Date.parse(String(body?.updatedAt||''));
 if(!Number.isFinite(modified)||modified>approved)return false;
 const options=body?.options;
 return Array.isArray(options)&&options.length>0&&options.every(option=>{
  const media=option?.asset;
  const saved=Date.parse(String(media?.savedAt||''));
  return Boolean(media?.storagePath&&media?.sha256)&&Number.isFinite(saved)&&saved<=approved;
 });
}
// Validador universal de identidade fornecedor ↔ opção: dados comprovados
// (SKU, EAN e opção) têm prioridade sobre nomes comerciais inconsistentes.
const normalizedVariationText=value=>String(value||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();

const dimensionUnits='CM|MM|ML|KG|G|L|M';
const sizeTokens=value=>{
 const normalized=normalizedVariationText(value);
 return [...normalized.matchAll(new RegExp('\\b([0-9]{1,4})\\s*('+dimensionUnits+')\\b','g'))]
  .map(match=>match[1]+match[2]);
};
const dimensionFamily=value=>normalizedVariationText(value)
 .replace(new RegExp('\\b[0-9]{1,4}\\s*(?:'+dimensionUnits+')\\b','g'),' ')
 .replace(/\b(?:AZUL|VERMELHA?|VERMELHO|PRETA?|PRETO|BRANCA?|BRANCO|VERDE|AMARELA?|AMARELO|ROSA|LILAS|CINZA)\b/g,' ')
 .replace(/\s+/g,' ').trim();
const dimensionalProductFamily=(parent,actual,option)=>{
 const optionFamily=dimensionFamily(option);
 const parentTokens=dimensionFamily(parent).split(' ').filter(token=>token.length>=6);
 const actualTokens=new Set(dimensionFamily(actual).split(' '));
 const optionTokens=optionFamily.split(' ').filter(token=>token.length>=6&&token!=='TAMANHO'&&token!=='MODELO');
 const shared=parentTokens.filter(token=>actualTokens.has(token));
 // Nomes como FRIGIDEIRA 26 CM exigem a categoria FRIGIDEIRA nos dois títulos.
 return shared.some(token=>optionTokens.length===0||optionTokens.includes(token));
};

export function variationSupplierIdentity({
 parentName,supplierName,originalOption,optionName,expectedEan='',sourceEan='',reviewed=false
}={}){
 const parent=normalizedVariationText(parentName);
 const actual=normalizedVariationText(supplierName);
 const option=normalizedVariationText(optionName);
 const original=normalizedVariationText(originalOption);
 if(!parent||!actual||!option)return {ok:false,reason:'Dados de identidade da variação incompletos'};
 const baseByOption=original&&parent.endsWith(' '+original)
  ?parent.slice(0,-original.length-1):parent;
 // Remove sufixos de cor SOMENTE ao comparar nomes, não da SKU/EAN.
 const base=baseByOption.replace(/ (?:VERMELHA?|VERMELHO|ROSA|PRETA?|PRETO|AZUL|BRANCA?|BRANCO|AMARELA?|AMARELO|VERDE)$/,'');
 const stem=option.replace(/[AO]$/,'');
 const optionMeasurements=sizeTokens(option),actualMeasurements=sizeTokens(actual);
 const dimensionOption=optionMeasurements.length>0;
 // Ex.: "FRIGIDEIRA 26 CM" equivale a "Frigideira Antiaderente 26cm - Azul".
 // O tamanho deve ser exato e inequívoco: nunca aceitar 24/20/28 cm para 26 cm.
 const exactDimension=dimensionOption&&optionMeasurements.length===1&&
  actualMeasurements.length===1&&optionMeasurements[0]===actualMeasurements[0];
 const dimensionalFamily=exactDimension&&dimensionalProductFamily(parent,actual,option);
 const hasOption=dimensionOption?dimensionalFamily:
  actual.endsWith(' '+option)||
  stem.length>=3&&(actual.endsWith(' '+stem+'A')||actual.endsWith(' '+stem+'O'))||
  (' '+actual+' ').includes(' '+option+' ');
 if(!hasOption)return {ok:false,reason:dimensionOption?
  'O título WeDrop não comprova tamanho e tipo exatos para '+option:
  'O fornecedor não confirma a opção '+option};
 const normalFamily=base.length>=8&&(actual===base||actual.startsWith(base+' '))||
  (dimensionalFamily&&dimensionFamily(parent)===dimensionFamily(actual));
 const validEan=value=>/^[0-9]{8,14}$/.test(String(value||''));
 const expected=String(expectedEan||'').trim(),source=String(sourceEan||'').trim();
 if(validEan(expected)&&validEan(source)&&expected!==source)
  return {ok:false,reason:'EAN do fornecedor divergente do EAN aprovado'};
 // Títulos com nomes distintos (inclusive outras categorias e modelos)
 // só passam com SKU físico validado à parte, EAN exato e revisão registrada.
 const exactEan=validEan(expected)&&validEan(source)&&expected===source;
 if(!normalFamily&&!(reviewed===true&&exactEan))
  return {ok:false,reason:'Nome comercial distinto sem aprovação de SKU/EAN exatos'};
 return {ok:true,reason:normalFamily?'família e opção confirmadas':'EAN e opção revisados'};
}
export function validateVariationDetails(body,{requirePhotos=false,approvedReview=null}={}){
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
 // A conferência global registrada depois das duas fotos e do rascunho
 // não deve exigir duas caixas redundantes por opção. Uma foto/edição posterior
 // invalida esta equivalência (e exige nova conferência da etapa).
 if(requirePhotos&&!reviewedVariationEvidence(body,approvedReview)&&
    options.some(x=>!x.stockConfirmed||!x.photoConfirmed))
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
