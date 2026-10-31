// Exportação independente da importação de rascunhos: sempre gera um arquivo
// .json real a partir das combinações verificadas contra a lista WeDrop.
import {parseKitChatResult} from './kit-chat-result-parser.js';

const asSku = value => String(value ?? '').trim().toUpperCase();
const keyFor = codes => codes.map(asSku).sort().join('|');

function readResponseObject(raw){
 if(raw && typeof raw==='object')return raw;
 if(typeof raw!=='string')return null;
 const source=raw.replace(/^\uFEFF/,'').trim();
 const segments=[source];
 for(const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
  segments.push(match[1].trim());
 for(const part of segments){
  if(!/^[\[{]/.test(part))continue;
  try{return JSON.parse(part);}catch{}
 }
 return null;
}

export function kitJsonFileName(category,size){
 const safe=String(category||'categoria').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'categoria';
 if(![2,3].includes(Number(size)))throw Error('Quantidade de SKUs do arquivo inválida.');
 return 'kits-'+safe+'-'+Number(size)+'-skus.json';
}

export function buildKitResearchJson(raw,{category,size,desiredKits=20,allowedCodes=[]}={}){
 const parsed=parseKitChatResult(raw,{allowedCodes,limit:Number(desiredKits),size:Number(size)});
 if(!parsed.kits.length)
  throw Error('Nenhum kit válido para gerar JSON. Confira SKUs e categoria WeDrop.');
 const object=readResponseObject(raw);
 const sourceKits=Array.isArray(object?.kits)?object.kits:[];
 const details=new Map();
 for(const source of sourceKits){
  if(!source || typeof source!=='object' || Array.isArray(source) ||
    !Array.isArray(source.skus))continue;
  const key=keyFor(source.skus);
  if(!details.has(key))details.set(key,source);
 }
 const kits=parsed.kits.map(skus=>{
  const detail=details.get(keyFor(skus));
  const motivo=typeof detail?.motivo==='string'?detail.motivo.slice(0,1600):'';
  const fontes=Array.isArray(detail?.fontes)?detail.fontes.filter(x=>
   typeof x==='string' && x.length<=1600 && /^https?:\/\//i.test(x)).slice(0,12):[];
  return {skus,motivo,fontes};
 });
 return {
  filename:kitJsonFileName(category,size),
  content:JSON.stringify({kits},null,2)+'\n',
  count:kits.length,
  rejected:parsed.rejected,
  format:parsed.format
 };
}
