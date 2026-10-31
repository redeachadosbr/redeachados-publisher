// Importar kits completos do ChatGPT sem copiar SKUs individuais.
// Nomes e custos do ChatGPT não são confiáveis: só as SKUs do catálogo importado.
const normalizedKey=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const SKU_FIELDS=new Set(['sku','skuwedrop','skuswedrop','suppliersku','codigosku','codigo','codigowedrop','skucomponente','skuitem']);
const KIT_FIELDS=new Set(['skus','skuswedrop','skusdosprodutos','listaskus','produtos','componentes','itens','products','items','composicao','combinacao','skucombo','skucombination','codigos','skulist']);
const ROOT_FIELDS=new Set(['kits','combinacoes','sugestoes','resultados','propostas','data','results','suggestions','kitlist','listakits','kitsugeridos','kitsinteligentes']);
const CODE_REGEX=/[A-Za-z0-9][A-Za-z0-9._-]*/g;
const asSku=value=>String(value||'').trim().toUpperCase();
const fromText=(text,allowed)=>[...new Set((String(text).match(CODE_REGEX)||[]).map(asSku).filter(x=>allowed.has(x)))];
function tryJson(v){
 if(typeof v!=='string')return v;
 const source=v.replace(/^\uFEFF/,'').trim();
 const options=[source];
 for(const m of source.matchAll(/\x60{3}(?:json)?\s*([\s\S]*?)\x60{3}/gi))options.push(m[1].trim());
 for(const part of options)if(/^[\[{]/.test(part)){try{return JSON.parse(part);}catch{}}
 return null;
}
export function parseKitChatResult(input,{allowedCodes=[],limit=10,size=null}={}){
 const allowed=new Set([...allowedCodes].map(asSku).filter(Boolean));
 if(!allowed.size)throw Error('SKUs WeDrop ainda não carregadas. Atualize a pesquisa antes da importação.');
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Limite inválido para kits.');
 if(size!==null&&![2,3].includes(size))throw Error('Quantidade de SKUs por kit inválida.');
 const raw=typeof input==='string'?input:JSON.stringify(input);
 if(!raw||raw.length>1000000)throw Error('Arquivo muito grande. Importe somente o JSON ou tabela de kits (até 1 MB).');
 const kits=[],seen=new Set();let rejected=0;
 const add=codes=>{
  const values=codes.map(asSku).filter(Boolean);
  if(values.length<2||values.length>3||new Set(values).size!==values.length||
   values.some(x=>!allowed.has(x))||(size!==null&&values.length!==size)){rejected++;return;}
  const key=values.slice().sort().join('|');
  if(!seen.has(key)){seen.add(key);if(kits.length<limit)kits.push(values);}
 };
 function parts(v,depth=0,explicitSku=false){
  if(depth>5)return [];
  if(typeof v==='string'||typeof v==='number')
   return explicitSku?String(v).split(/[\s+,;|]+/).map(asSku).filter(Boolean):fromText(v,allowed);
  if(Array.isArray(v))return v.flatMap(x=>parts(x,depth+1,explicitSku));
  if(v&&typeof v==='object'){
   for(const [k,x] of Object.entries(v))if(SKU_FIELDS.has(normalizedKey(k)))
    return parts(x,depth+1,true);
  }
  return [];
 }
 function walk(v,depth=0){
  if(depth>8||v==null)return;
  if(Array.isArray(v)){
   if(v.length>=2&&v.length<=3&&v.every(x=>typeof x==='string'||typeof x==='number')){
    add(parts(v));return;
   }
   for(const row of v.slice(0,100))walk(row,depth+1);
   return;
  }
  if(typeof v!=='object')return;
  for(const [k,x] of Object.entries(v))if(KIT_FIELDS.has(normalizedKey(k))){
   const list=parts(x,depth+1,true);
   if(list.length){add(list);return;}
  }
  const columns=[];
  for(const [k,x] of Object.entries(v))if(/^sku[123]$/.test(normalizedKey(k))||
   /^codigoproduto[123]$/.test(normalizedKey(k)))columns.push(...parts(x,depth+1,true));
  if(columns.length){add(columns);return;}
  for(const [k,x] of Object.entries(v))if(ROOT_FIELDS.has(normalizedKey(k)))walk(x,depth+1);
 }
 const json=tryJson(input);
 if(json!==null)walk(json);
 if(!kits.length&&typeof input==='string'){
  // Inclui tabelas Markdown e linhas "Nome | SKU1 + SKU2 | R$ xx".
  for(const line of input.split(/\r?\n/).slice(0,500)){
   // Uma linha de SKUs explícitos deve ser validada INTEIRA.
   // Nunca remover um SKU fora da whitelist e salvar um kit truncado.
   const groups=line.split('|').map(c=>{
    const cell=c.trim();
    const explicit=/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\s*[+,;]\s*[A-Za-z0-9][A-Za-z0-9._-]*){1,2}$/.test(cell);
    return explicit?cell.split(/\s*[+,;]\s*/).map(asSku):fromText(cell,allowed);
   }).filter(x=>x.length>=2&&x.length<=3);
   if(groups.length){add(groups[0]);continue;}
   const direct=line.trim().replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '');
   if(/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\s*[+|;,]\s*[A-Za-z0-9][A-Za-z0-9._-]*){1,2}$/.test(direct)){
    add(direct.split(/\s*[+|;,]\s*/));continue;
   }
   const all=fromText(line,allowed);
   if(all.length>=2&&all.length<=3)add(all);
  }
 }
 return {kits,rejected,format:json!==null?'json':'text'};
}
