// Importação CSV WeDrop: leitura local e custos explicitamente mapeados pelo vendedor.
// Nunca adivinhar que uma coluna de preço de venda é custo de compra.
export const MAX_CSV_CHARS=4_000_000;
export const MAX_CSV_ROWS=15000;
export function skuText(value){
  return String(value??'').trim();
}
function separatorCount(header,sep){
  let count=0,quoted=false;
  for(let i=0;i<header.length;i++){
    const ch=header[i];
    if(ch==='"'){
      if(quoted&&header[i+1]==='"')i++;
      else quoted=!quoted;
    }else if(!quoted&&ch===sep)count++;
  }
  return count;
}
export function detectSeparator(csv){
  const first=String(csv||'').replace(/^\uFEFF/,'').split(/\r?\n/)[0]||'';
  const scores=[';',',','\t'].map(sep=>({sep,count:separatorCount(first,sep)}))
    .sort((a,b)=>b.count-a.count);
  if(!scores[0].count)throw Error('Não encontramos colunas separadas por ponto e vírgula, vírgula ou tabulação.');
  return scores[0].sep;
}
export function parseCsv(raw){
  if(typeof raw!=='string'||!raw.trim())throw Error('Envie um CSV preenchido.');
  if(raw.length>MAX_CSV_CHARS)throw Error('CSV acima de 4 MB. Divida a exportação em partes.');
  const csv=raw.replace(/^\uFEFF/,'');
  const sep=detectSeparator(csv);
  let rows=[],fields=[],field='',quoted=false;
  for(let i=0;i<csv.length;i++){
    const ch=csv[i];
    if(ch==='"'){
      if(quoted&&csv[i+1]==='"'){field+='"';i++;}
      else if(quoted){quoted=false;}
      else if(!field.trim()){quoted=true;field='';}
      else field+='"';
    }else if(ch===sep&&!quoted){
      fields.push(field);field='';
    }else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&csv[i+1]==='\n')i++;
      fields.push(field);field='';
      if(fields.some(x=>x.trim()!==''))rows.push(fields);
      fields=[];
      if(rows.length>MAX_CSV_ROWS+1)throw Error('CSV acima de 15.000 linhas. Divida o arquivo.');
    }else field+=ch;
  }
  if(quoted)throw Error('CSV incompleto: aspas não fechadas.');
  fields.push(field);
  if(fields.some(x=>x.trim()!==''))rows.push(fields);
  if(rows.length<2)throw Error('CSV sem linhas de produtos.');
  const headers=rows.shift().map(v=>v.trim().replace(/^\uFEFF/,''));
  if(headers.length<2||headers.some(x=>!x))throw Error('Cabeçalho CSV inválido.');
  if(rows.some(x=>x.length!==headers.length))throw Error('CSV contém linhas com quantidade diferente de colunas.');
  return {headers,rows,delimiter:sep};
}
export function parseMoneyBR(raw){
  let s=String(raw??'').trim().replace(/\s/g,'').replace(/^R\$/i,'');
  if(!s||/[^\d,.]/.test(s))return null;
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
  if(comma>=0&&dot>=0){
    // O separador decimal é o último encontrado (BRL e exportação internacional).
    s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  }else if(comma>=0){
    if(/^(\d{1,3},){1,}\d{3}$/.test(s))s=s.replace(/,/g,'');
    else if(/^\d+,\d{1,2}$/.test(s))s=s.replace(',','.');
    else return null;
  }else if(dot>=0){
    if(/^(\d{1,3}\.){1,}\d{3}$/.test(s))s=s.replace(/\./g,'');
    else if(!/^\d+\.\d{1,2}$/.test(s))return null;
  }else if(!/^\d+$/.test(s))return null;
  const value=Number(s);
  if(!Number.isFinite(value)||value<=0||value>99999999)return null;
  return Math.round((value+Number.EPSILON)*100)/100;
}
export function previewWeDropCsv(raw){
  const parsed=parseCsv(raw);
  return {
    headers:parsed.headers,
    rowCount:parsed.rows.length,
    delimiter:parsed.delimiter===';'?'ponto e vírgula':parsed.delimiter==='\t'?'tabulação':'vírgula',
    examples:parsed.rows.slice(0,5).map(row=>row.slice(0,Math.min(20,row.length))),
    warning:'Selecione manualmente as colunas SKU e custo de aquisição. Não use o preço de venda como custo.'
  };
}
export function prepareWeDropImport(raw,{skuColumn,costColumn,skipInvalid=false}={}){
  const {headers,rows}=parseCsv(raw);
  const skuIndex=Number(skuColumn),costIndex=Number(costColumn);
  if(!Number.isSafeInteger(skuIndex)||!Number.isSafeInteger(costIndex)||
     skuIndex<0||costIndex<0||skuIndex>=headers.length||costIndex>=headers.length||
     skuIndex===costIndex)throw Error('Selecione colunas diferentes e válidas para SKU e custo.');
  const valid=new Map(),invalid=[],conflicts=[];
  for(let i=0;i<rows.length;i++){
    const sku=skuText(rows[i][skuIndex]);
    const cost=parseMoneyBR(rows[i][costIndex]);
    if(!sku||sku.length>140||cost===null){
      invalid.push({line:i+2,sku:sku.slice(0,100),problem:!sku?'SKU vazio':cost===null?'Custo inválido':'SKU muito longo'});
      continue;
    }
    if(valid.has(sku)){
      if(valid.get(sku)!==cost)conflicts.push({line:i+2,sku});
      continue;
    }
    valid.set(sku,cost);
  }
  if(conflicts.length)throw Error('SKUs repetidos com custos diferentes: '+conflicts.slice(0,8).map(x=>x.sku).join(', ')+'. Corrija a planilha.');
  if(invalid.length&&!skipInvalid)throw Error('Há '+invalid.length+' linhas inválidas. Corrija a planilha ou marque Ignorar linhas inválidas. Exemplos: '+invalid.slice(0,5).map(x=>x.line).join(', ')+'.');
  if(!valid.size)throw Error('Nenhum SKU com custo válido foi encontrado.');
  return {costs:[...valid].map(([sku,unitCost])=>({sku,unitCost})),
    totalRows:rows.length,uniqueSkus:valid.size,skippedInvalid:invalid.length,
    invalidExamples:invalid.slice(0,8),skuHeader:headers[skuIndex],costHeader:headers[costIndex]};
}
