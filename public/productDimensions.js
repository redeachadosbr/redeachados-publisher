// Motor Matriz - leitura deterministica das MEDIDAS DO PRODUTO do texto
// WeDrop colado pelo vendedor. Nunca infere dimensoes de fotos, NCM, nome,
// campos isolados do fornecedor ou medidas de caixa/transporte.
const normalized=value=>String(value??'').replace(/\\r\\n|\\n|\\r/g,'\n').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fmtNumber=value=>String(Number(String(value).replace(',','.'))).replace('.',',');
const axisNames=Object.freeze({altura:'altura',largura:'largura',comprimento:'comprimento',profundidade:'profundidade',diametro:'diametro',diamentro:'diametro'});
const number='(\\d{1,4}(?:[.,]\\d{1,2})?)';
const axisPattern=new RegExp(number+'\\s*(cm|mm|m)\\s*(?:de\\s+)?(altura|largura|comprimento|profundidade|diametro|diamentro)\\b','gi');
// A ficha pode nomear o eixo antes do valor: "Altura: 20 cm × Largura: 15 cm".
const axisFirstPattern=new RegExp('\\b(altura|largura|comprimento|profundidade|diametro|diamentro)\\s*(?::|=|-|de\\s+)?\\s*'+number+'\\s*(cm|mm|m)\\b','gi');
export function confirmedProductDimensionsFromWeDrop(sourceText){
 const text=normalized(sourceText).replace(/\r/g,'').slice(0,12000);
 if(!text.trim())return null;
 const entries=[];
 const lines=text.split('\n');
 for(let i=0;i<lines.length;i++){
  const lineTrim=lines[i].trim();
  // A ficha real da SKU 895332 separa "Dimensões:" e "20cm altura x 19cm diamentro".
  // Aceitar continuação somente com pelo menos DOIS eixos textuais explícitos.
  // Nunca buscar números soltos nem campos de peso/embalagem nas linhas seguintes.
  const label=lineTrim.match(/^(?:[-*•]\s*)?(dimensoes|medidas)(?:\s+(?:do|da|de)\s+(?:produto|item|bicicleta|piscina|montad[oa]|brinquedo))?\s*[:\-]\s*(.*)$/i);
  if(!label||/embalagem|caixa|pacote|frete|logistic|transporte|volume da caixa/.test(lineTrim))continue;
  let axisSource=label[2].trim();
  if(!axisSource){
   let j=i+1;
   while(j<lines.length&&j<=i+3&&!lines[j].trim())j++;
   const candidate=String(lines[j]||'').trim();
   const axesNamed=candidate.match(/\b(?:altura|largura|comprimento|profundidade|diametro|diamentro)\b/g)||[];
   if(j>i+3||axesNamed.length<2||
      /embalagem|caixa|pacote|frete|logistic|transporte/.test(candidate))continue;
   axisSource=candidate;
  }
  const axes={};
  for(const m of axisSource.matchAll(axisPattern)){
   const axis=axisNames[m[3]];
   let numberValue=Number(m[1].replace(',','.'));
   if(m[2]==='m')numberValue*=100;
   if(m[2]==='mm')numberValue/=10;
   if(!Number.isFinite(numberValue)||numberValue<=0||numberValue>10000)continue;
   const value=fmtNumber(numberValue)+' cm';
   if(axes[axis]&&axes[axis]!==value){axes.invalid=true;break;}
   axes[axis]=value;
  }
  if(!axes.invalid){
   for(const m of axisSource.matchAll(axisFirstPattern)){
    const axis=axisNames[m[1]];
    let numberValue=Number(m[2].replace(',','.'));
    if(m[3]==='m')numberValue*=100;
    if(m[3]==='mm')numberValue/=10;
    if(!Number.isFinite(numberValue)||numberValue<=0||numberValue>10000)continue;
    const value=fmtNumber(numberValue)+' cm';
    if(axes[axis]&&axes[axis]!==value){axes.invalid=true;break;}
    axes[axis]=value;
   }
  }
  if(axes.invalid)continue;
  // Apenas grandezas explicitamente nomeadas, nao assumir que x/y/z sejam A/L/C.
  const measurements=['altura','largura','comprimento','profundidade','diametro'].filter(axis=>axes[axis]).map(axis=>({
   label:axis.toUpperCase(),value:axes[axis],axis
  }));
  if(measurements.length>=2)entries.push({measurements,sourceLine:axisSource===label[2].trim()?lineTrim:lineTrim+' '+axisSource});
 }
 if(!entries.length)return null;
 const signature=x=>JSON.stringify(x.measurements);
 if(entries.some(x=>signature(x)!==signature(entries[0])))return null;
 return {measurements:entries[0].measurements,source:'Informacoes da WeDrop coladas na SKU',
  sourceLine:entries[0].sourceLine};
}


// Fichas WeDrop às vezes trazem "Dimensões: 10 x 10 x 14", sem
// nomear eixos ou unidades. NUNCA inferir a partir desses números sozinhos.
// Conciliar SOMENTE com a ficha de catálogo vinculada à SKU exata, cujo
// próprio campo widthCm/heightCm/lengthCm determina unidade e eixo.
// Exigir texto salvo e os três valores idênticos, na ordem dos campos da
// planilha; em caso de divergência, não montar cotas.
export function confirmedCatalogCrossCheckedDimensionsFromWeDrop(sourceText,{
 sku='',sourceEvidenceSku='',sourceSaved=false,supplierMatchedBy='',
 catalogMeasurements=null
}={}){
 if(!sku||String(sku).trim()!==String(sourceEvidenceSku).trim()||
  !sourceSaved||!['exact-sku','reviewed-link'].includes(String(supplierMatchedBy))||
  !catalogMeasurements)return null;
 const values=['heightCm','widthCm','lengthCm'].map(k=>{
  const n=Number(String(catalogMeasurements[k]??'').replace(',','.'));
  return Number.isFinite(n)&&n>0&&n<=10000?n:null;
 });
 if(values.some(x=>x===null))return null;
 const text=normalized(sourceText).slice(0,12000),matches=[];
 for(const line of text.split('\n')){
  const match=line.trim().match(/^(?:[-*•]\s*)?(?:dimensoes|medidas)(?:\s+(?:do|da|de)\s+(?:produto|item))?\s*[:\-]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:cm)?\s*[x×]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:cm)?\s*[x×]\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:cm)?\s*$/i);
  if(!match||/embalagem|caixa|pacote|frete|transport/.test(line))continue;
  const nums=match.slice(1,4).map(x=>Number(x.replace(',','.')));
  if(nums.some(x=>!Number.isFinite(x)||x<=0))return null;
  matches.push(nums);
 }
 if(!matches.length)return null;
 // A ordem visual do triplo (A×L×C, C×L×A, L×C×A etc.) não informa
 // qual eixo é qual. Os eixos vêm EXCLUSIVAMENTE dos campos nomeados
 // heightCm/widthCm/lengthCm da MESMA SKU, já conferida por vínculo salvo.
 // A linha só confirma os três valores, inclusive em ordem diferente.
 const catalogSorted=[...values].sort((a,b)=>a-b);
 if(!matches.every(arr=>[...arr].sort((a,b)=>a-b)
   .every((value,i)=>value===catalogSorted[i])))return null;
 return {measurements:[
  {label:'ALTURA',value:fmtNumber(values[0])+' cm',axis:'altura'},
  {label:'LARGURA',value:fmtNumber(values[1])+' cm',axis:'largura'},
  {label:'COMPRIMENTO',value:fmtNumber(values[2])+' cm',axis:'comprimento'}
 ],source:'Texto salvo WeDrop reconciliado com as medidas catalogadas da mesma SKU',
  sourceLine:'Dimensões: '+matches[0].map(fmtNumber).join(' × ')};
}

// Informações laterais opcionais da imagem 03. A fonte é EXCLUSIVAMENTE
// o campo "Informações da WeDrop" da mesma SKU, nunca dados logísticos.
// Medidas de uma PISTA montada são do conjunto, NUNCA do carrinho
// individual. Só podem aparecer com esse sujeito explícito em legenda,
// nunca como setas de altura/largura/comprimento sobre a miniatura.
export function confirmedAssembledTrackDimensionsFromWeDrop(sourceText){
 const text=normalized(sourceText).slice(0,12000);
 const lines=text.split('\n').map(x=>x.trim());
 const result=[];
 for(const line of lines){
  if(!/^(?:[-*•]\s*)?dimensoes\s+da\s+pista\s+montada\s*[:\-]/.test(line))continue;
  const found={};
  for(const m of line.matchAll(axisPattern)){
   const raw=Number(m[1].replace(',','.'));
   const cm=m[2]==='m'?raw*100:m[2]==='mm'?raw/10:raw;
   const axis=m[3];
   if(!Number.isFinite(cm)||cm<=0||cm>10000)continue;
   found[axis]=fmtNumber(cm)+' cm';
  }
  if(found.comprimento&&found.largura&&found.altura)
   result.push(found.comprimento+' × '+found.largura+' × '+found.altura);
 }
 return result.length&&result.every(x=>x===result[0])?{
  subject:'pista montada',value:result[0]
 }:null;
}
export function confirmedProductSideFactsFromWeDrop(sourceText){
 const text=normalized(sourceText).replace(/\r/g,'').slice(0,12000);
 if(!text.trim())return [];
 const facts=[];
 const assembled=confirmedAssembledTrackDimensionsFromWeDrop(sourceText);
 if(assembled)facts.push({label:'Pista montada',value:assembled.value});
 const definitions=[
  {name:'Capacidade',re:/^(?:capacidade\s*(?:litros|em\s*litros|volumetrica)|capacidade)\s*[:\-]\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*(litros?|l)\b/i,unit:'L'},
  {name:'Conjunto',re:/^capacidade\s*[:\-]\s*(\d{1,4})\s*(pecas?)\b/i,unit:'peças'},
  {name:'Suporta',re:/^(?:capacidade\s*(?:peso|de\s*peso)|peso\s*(?:suportado|maximo)|suporta)\s*[:\-]\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*(kg|g)\b/i,unit:null},
  {name:'Peso',re:/^peso\s*(?:do\s*produto|liquido)?\s*[:\-]\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*(kg|g)\b/i,unit:null},
  {name:'Cor',re:/^cor\s*[:\-]\s*([\p{L}]+(?:\s+[\p{L}]+){0,2})\s*$/iu,unit:null}
 ];
 for(const definition of definitions){
  const values=[];
  for(const raw of text.split('\n')){
   const line=raw.trim().replace(/^[-*•]\s*/,'');
   if(/embalagem|caixa|pacote|frete|logistic|transporte|bruto/i.test(line))continue;
   const m=line.match(definition.re);
   if(!m)continue;
   const value=definition.name==='Cor'?m[1].trim():
    m[1].trim().replace('.',',')+' '+(definition.unit||m[2]);
   if(!values.includes(value))values.push(value);
  }
  if(values.length===1)facts.push({label:definition.name,value:values[0]});
 }
 return facts.slice(0,4);
}
