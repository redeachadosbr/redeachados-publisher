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
// Reconhece APENAS layouts explicitamente conhecidos do fornecedor.
// "Preço" só é custo quando pertence ao layout oficial WeDrop com 16 colunas.
const normalizeHeader=x=>String(x||'').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
export function identifyWeDropLayout(headers){
  const named=headers.map(normalizeHeader);
  const skuColumns=named.map((x,i)=>x==='sku'?i:-1).filter(x=>x>=0);
  if(skuColumns.length!==1)return {recognized:false,reason:'É necessário ter exatamente uma coluna SKU.'};
  const skuColumn=skuColumns[0];
  const costColumns=named.map((x,i)=>[
    'custo','custo wedrop','preco de custo','custo de aquisicao',
    'custo de compra','custo fornecedor','preco fornecedor'
  ].includes(x)?i:-1).filter(x=>x>=0);
  if(costColumns.length===1&&costColumns[0]!==skuColumn)
    return {recognized:true,skuColumn,costColumn:costColumns[0],schema:'explicit-unit-cost'};
  if(costColumns.length>1)
    return {recognized:false,reason:'Várias colunas de custo. Verifique qual é o custo unitário.'};
  const expected=[
    'sku','nome do produto','marca','categoria','fornecedor',
    'estado do fornecedor','preco','ean','ncm','cest',
    'peso (kg)','largura (cm)','altura (cm)','comprimento (cm)',
    'peso da caixa (kg)','imagem principal'
  ];
  const isOfficial=expected.length===named.length&&expected.every((x,i)=>x===named[i]);
  if(isOfficial)return {recognized:true,skuColumn:0,costColumn:6,schema:'wedrop-catalog-16'};
  return {recognized:false,reason:'Layout não reconhecido com segurança. A coluna Preço de uma planilha genérica pode ser preço de venda.'};
}
export function prepareAutomaticWeDropImport(raw,{skipInvalid=false}={}){
  const parsed=parseCsv(raw),layout=identifyWeDropLayout(parsed.headers);
  if(!layout.recognized)throw Error(layout.reason+' Importação automática bloqueada.');
  const prepared=prepareWeDropImport(raw,{
    skuColumn:layout.skuColumn,costColumn:layout.costColumn,skipInvalid
  });
  return {...prepared,layout:layout.schema,automatic:true,
    columnIndexes:{sku:layout.skuColumn,cost:layout.costColumn}};
}
export function previewWeDropCsv(raw){
  const parsed=parseCsv(raw);
  return {
    headers:parsed.headers,
    rowCount:parsed.rows.length,
    delimiter:parsed.delimiter===';'?'ponto e vírgula':parsed.delimiter==='\t'?'tabulação':'vírgula',
    examples:parsed.rows.slice(0,5).map(row=>row.slice(0,Math.min(20,row.length))),
    automaticLayout:identifyWeDropLayout(parsed.headers),
    warning:'Os layouts confiáveis são reconhecidos automaticamente; caso contrário, valide manualmente o custo de aquisição.'
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
  const products=prepareWeDropProducts(headers,rows,new Set(valid.keys()));
  return {costs:[...valid].map(([sku,unitCost])=>({sku,unitCost})),products,
    totalRows:rows.length,uniqueSkus:valid.size,skippedInvalid:invalid.length,
    invalidExamples:invalid.slice(0,8),skuHeader:headers[skuIndex],costHeader:headers[costIndex]};
}

// Product facts are trusted only in the official catalog layout. Preserve raw
// values: supplier shipping measurements must not become assembled dimensions.
export function prepareWeDropProducts(headers,rows,allowedSkus){
  if(identifyWeDropLayout(headers).schema!=='wedrop-catalog-16')return [];
  const products=new Map();
  const code=(value,length)=>{
    const raw=String(value||'').trim();
    const normalized=raw.replace(/[.\s-]/g,'');
    return new RegExp('^\\d{'+length+'}$').test(normalized)?normalized:null;
  };
  for(const [index,row] of rows.entries()){
    const sku=skuText(row[0]);if(!sku||!allowedSkus.has(sku))continue;
    const data={name:row[1]||'',brand:row[2]||'',category:row[3]||'',supplier:row[4]||'',supplierState:row[5]||'',
      ean:String(row[7]||'').trim(),ncm:code(row[8],8),cest:code(row[9],7),
      rawNcm:String(row[8]||''),rawCest:String(row[9]||''),
      catalogMeasurements:{weightKg:String(row[10]||''),widthCm:String(row[11]||''),heightCm:String(row[12]||''),
        lengthCm:String(row[13]||''),boxWeightKg:String(row[14]||'')},
      imageUrl:/^https:\/\//i.test(row[15]||'')?row[15]:'',
      warnings:['Peso e medidas da planilha precisam de conferência: não presumir unidade incorreta nem medidas do produto montado.',
        ...(!code(row[8],8)?['NCM ausente ou inválido na fonte.']:[]),
        ...(row[9]&&!code(row[9],7)?['CEST inválido na fonte.']:[])]};
    const previous=products.get(sku);
    if(previous&&JSON.stringify(previous.data)!==JSON.stringify(data)){
      previous.data={conflict:true,name:previous.data.name||data.name,
        warnings:['SKU repetida com dados diferentes nas linhas '+previous.sourceLine+' e '+(index+2)+'. Confira o fornecedor antes de preencher dados técnicos/fiscais.']};
    }
    if(!previous)products.set(sku,{sku,data,sourceLine:index+2});
  }
  return [...products.values()];
}

