// Extrator conservador para dados de logística do Kit Formal.
// Não infere medidas a partir de fotos, SKUs, textos de marketing ou placeholders.
const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/\u00a0/g,' ').replace(/[×]/g,'x').replace(/[–—]/g,'-').toLowerCase();
function decimal(raw){
 const input=String(raw||'').trim();
 if(!/^\d+(?:[.,]\d+)*$/.test(input))return NaN;
 let s=input;
 if(s.includes('.')&&s.includes(',')){
  const decimalSeparator=s.lastIndexOf(',')>s.lastIndexOf('.')?',':'.';
  s=s.replace(decimalSeparator===','?/\./g:/,/g,'').replace(decimalSeparator, '.');
 }else if(s.includes(','))s=s.replace(',','.');
 else if(/^\d{1,3}(?:\.\d{3})+$/.test(s)&&!/^0\./.test(s))s=s.replace(/\./g,'');
 return Number(s);
}
const asPositive=(num,max)=>Number.isFinite(num)&&num>0&&num<=max;
const unitCm=(n,u)=>u==='mm'?n/10:u==='m'?n*100:n;
const unitKg=(n,u)=>{
 const kg=u==='g'||u==='grama'||u==='gramas'?n/1000:n;
 // O campo de envio aceita três casas decimais: arredondar para cima evita
 // subestimar o peso do kit. 353,26 g -> 0,354 kg.
 return Math.ceil((kg-1e-10)*1000)/1000;
};
function sourceLines(text){
 const raw=normalize(text).replace(/\s+\|\s+/g,'\n').split(/\r?\n/).map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);
 const base=[];
 for(let i=0;i<raw.length;i++){
  if(/\(\s*em\s*$/.test(raw[i])&&/^(?:cm|mm|m|kg|g|gramas?)\s*\)/.test(raw[i+1]||'')){
   base.push(raw[i]+' '+raw[i+1]);i++;
  }else base.push(raw[i]);
 }
 const rows=[];
 for(let i=0;i<base.length;i++){
  const next=base[i+1]||'';
  if(/^\d+(?:[.,]\d+)*\s*(?:kg|g|gramas?|cm|mm|m)?$/i.test(next)&&
     /(?:peso|comprimento|largura|altura|prazo|dias para enviar)\b/.test(base[i])){
   rows.push(base[i]+' '+next);i++;
  }else rows.push(base[i]);
 }
 return rows;
}
function uniqueNumber(rows,re,converter,validator){
 const values=[];
 for(const line of rows){
  const m=line.match(re);if(!m)continue;
  const num=converter(m);
  if(validator(num))values.push({value:num,source:line});
 }
 const distinct=[...new Set(values.map(x=>x.value))];
 return distinct.length===1?values[0]:distinct.length>1?{conflict:true}:null;
}
function dimension(rows,name){
 const regex=new RegExp('\\b'+name+
  '(?:\\s+(?:total|(?:(?:do|da)\\s+)?(?:pacote|embalagem)|embalado))?'+
  '\\s*(?:\\(\\s*(?:em\\s+)?(cm|mm|m)\\s*\\))?\\s*(?::|=|-)?\\s*'+
  '(\\d+(?:[.,]\\d+)*)\\s*(cm|mm|m)?\\b');
 return uniqueNumber(rows,regex,m=>unitCm(decimal(m[2]),m[3]||m[1]||'cm'),n=>asPositive(n,200));
}
// Layout comum do catálogo: cinco cabeçalhos na primeira linha e cinco valores
// na segunda (Custo, Largura, Altura, Comprimento, Peso). Não usar o custo;
// alinhar somente quando a tabela for inequívoca para evitar números trocados.
function extractTotalTable(text){
 const rows=normalize(text).split(/\r?\n/).map(s=>s.trim().replace(/\s+/g,' ')).filter(Boolean);
 const headerRe=/\b(custo|largura|altura|comprimento|peso)\s+total\b(?:\s*\(\s*(?:em\s+)?(?:cm|mm|m|g|kg|gramas?)\s*\))?/g;
 const mapped={largura:'widthCm',altura:'heightCm',comprimento:'lengthCm',peso:'weightKg'};
 for(let i=0;i<rows.length;i++){
  let headerText=rows[i],valuesBegin=i+1;
  // OCR de formulário em colunas pode quebrar a linha dos cabeçalhos em duas.
  if(/\b(?:custo|largura|altura|comprimento|peso)\s+total\b/.test(rows[i+1]||'')){
   headerText+=' '+rows[i+1];valuesBegin=i+2;
  }
  const headers=[...headerText.matchAll(headerRe)].map(m=>m[1]);
  if(headers.length<4||new Set(headers).size!==headers.length)continue;
  const candidates=[];
  for(let k=valuesBegin;k<Math.min(rows.length,valuesBegin+7)&&candidates.length<headers.length;k++){
   const row=rows[k];
   if(!/^(?:r\$\s*)?\d+(?:[.,]\d+)*(?:\s+(?:r\$\s*)?\d+(?:[.,]\d+)*)*$/.test(row))break;
   candidates.push(...[...row.matchAll(/(?:r\$\s*)?\d+(?:[.,]\d+)*/g)].map(x=>x[0].replace(/^r\$\s*/,'')));
  }
  if(candidates.length!==headers.length)continue;
  const values={},evidence={};
  for(let j=0;j<headers.length;j++){
   const field=mapped[headers[j]];
   if(!field)continue;
   const n=decimal(candidates[j]);
   const value=field==='weightKg'?unitKg(n,'gramas'):n;
   const valid=field==='weightKg'?asPositive(value,30):asPositive(value,200)&&Number.isInteger(value);
   if(valid){values[field]=value;evidence[field]=headers[j]+' total: '+candidates[j];}
  }
  return {values,evidence};
 }
 return {values:{},evidence:{}};
}
const responseBool=s=>/^(sim|true|ativo|ativado|habilitado)$/.test(s)?true:
 /^(nao|false|inativo|desativado|desabilitado)$/.test(s)?false:null;
export function parseKitLogisticsText(text){
 const rows=sourceLines(text),values={},evidence={},warnings=[];
 const put=(key,result)=>{
  if(result?.conflict){warnings.push('Há valores diferentes para '+key+'; campo ignorado.');return;}
  if(result&&result.value!==undefined){values[key]=result.value;evidence[key]=result.source;}
 };
 const weight=uniqueNumber(rows,
  /\b(?:peso\s+(?:total\s+embalado|total\s+do\s+pacote|total|embalado|do\s+pacote|da\s+embalagem)|peso\s*\(\s*kg\s*\))\s*(?:\(\s*(?:em\s+)?(kg|g|gramas?)\s*\))?\s*(?::|=|-)?\s*(\d+(?:[.,]\d+)*)\s*(kg|g|gramas?)?\b/,
  m=>unitKg(decimal(m[2]),m[3]||m[1]||'kg'),n=>asPositive(n,30));
 put('weightKg',weight);
 for(const [label,key] of [['comprimento','lengthCm'],['largura','widthCm'],['altura','heightCm']]){
  put(key,dimension(rows,label));
 }
 const totalGrid=extractTotalTable(text);
 for(const [key,value] of Object.entries(totalGrid.values)){
  if(values[key]===undefined){values[key]=value;evidence[key]=totalGrid.evidence[key];}
 }
 for(const line of rows){
  if(!/(?:dimensoes|medidas).*(?:pacote|embalagem)|(?:c\s*x\s*l\s*x\s*a|comprimento\s*x\s*largura\s*x\s*altura)/.test(line))continue;
  if(!/(?:\bc\s*x\s*l\s*x\s*a\b|comprimento\s*x\s*largura\s*x\s*altura)/.test(line))continue;
  const match=line.match(/(\d+(?:[.,]\d+)*)\s*x\s*(\d+(?:[.,]\d+)*)\s*x\s*(\d+(?:[.,]\d+)*)\s*(cm|mm|m)?/);
  if(!match)continue;
  ['lengthCm','widthCm','heightCm'].forEach((field,i)=>{
   if(values[field]!==undefined)return;
   const num=unitCm(decimal(match[i+1]),match[4]||'cm');
   if(asPositive(num,200)){values[field]=num;evidence[field]=line;}
  });
 }
 const keyLabel=/\b(?:componente\s+principal|sku\s+principal)\s*(?::|=|-)\s*(?:sku\s*)?([a-z0-9][a-z0-9._-]{2,39})\b/;
 for(const line of rows){
  const m=line.match(keyLabel);if(m){values.mainSku=m[1].toUpperCase();evidence.mainSku=line;break;}
 }
 for(const line of rows){
  const m=line.match(/\b(?:canal\s+de\s+envio(?:\s+shopee)?|transportadora|logistica)\s*(?::|=|-)\s*([^;,]{2,100})/);
  if(m&&!/^(consultar|selecione|escolha|nenhum|nao informado)/.test(m[1].trim())){
   values.logisticName=m[1].trim();evidence.logisticName=line;break;
  }
 }
 for(const line of rows){
  const m=line.match(/\b(?:kit\s+)?(?:sob\s+encomenda|pre[- ]?venda)\s*(?::|=|-)\s*(sim|nao|true|false|ativo|ativado|inativo|desativado)\b/);
  if(m){const value=responseBool(m[1]);if(value!==null){values.preOrder=value;evidence.preOrder=line;break;}}
 }
 for(const line of rows){
  const m=line.match(/\b(?:sincronizar\s+dias\s+de\s+envio|sincronizacao\s+de\s+envio)\s*(?::|=|-)\s*(sim|nao|true|false|ativo|ativado|inativo|desativado)\b/);
  if(m){const value=responseBool(m[1]);if(value!==null){values.autoSyncDts=value;evidence.autoSyncDts=line;break;}}
 }
 put('daysToShip',uniqueNumber(rows,
  /\b(?:dias\s+para\s+enviar(?:\s*\(sob\s+encomenda\))?|prazo\s+(?:de\s+envio|de\s+preparacao)|tempo\s+de\s+preparacao)\s*(?::|=|-)\s*(\d{1,2})\s*(?:dias?)?\b/,
  m=>Number(m[1]),n=>Number.isInteger(n)&&n>=3&&n<=30));
 for(const key of ['lengthCm','widthCm','heightCm']){
  if(values[key]!==undefined&&!Number.isInteger(values[key])){
   warnings.push('Medida fracionada em '+key+'; informe centímetros inteiros no campo da Shopee.');
   delete values[key];delete evidence[key];
  }
 }
 if(Object.keys(values).some(key=>['weightKg','lengthCm','widthCm','heightCm'].includes(key))&&
    /\b(?:peso|comprimento|largura|altura)\s+total\b/.test(normalize(text)))
  warnings.push('Medidas totais do fornecedor: confirme se representam o kit completo embalado. O custo do print não foi aplicado.');
 return {values,evidence,warnings,recognized:rows.join('\n')};
}
