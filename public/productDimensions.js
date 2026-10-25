// Motor Matriz - leitura deterministica das MEDIDAS DO PRODUTO do texto
// WeDrop colado pelo vendedor. Nunca infere dimensoes de fotos, NCM, nome,
// campos isolados do fornecedor ou medidas de caixa/transporte.
const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fmtNumber=value=>String(Number(String(value).replace(',','.'))).replace('.',',');
const axisNames=Object.freeze({altura:'altura',largura:'largura',comprimento:'comprimento',profundidade:'comprimento'});
const number='(\\d{1,4}(?:[.,]\\d{1,2})?)';
const axisPattern=new RegExp(number+'\\s*(cm|mm|m)\\s*(?:de\\s+)?(altura|largura|comprimento|profundidade)\\b','gi');
export function confirmedProductDimensionsFromWeDrop(sourceText){
 const text=normalized(sourceText).replace(/\r/g,'').slice(0,12000);
 if(!text.trim())return null;
 const entries=[];
 for(const line of text.split('\n')){
  const lineTrim=line.trim();
  // Aceitar exclusivamente uma declaracao "Dimensoes/Medidas" do produto.
  // Excluir caixas, pacotes e medidas logisticas mesmo quando numericas.
  const label=lineTrim.match(/^(dimensoes|medidas)(?:\s+(?:do|da|de)\s+(?:produto|item|bicicleta|piscina|montad[oa]|brinquedo))?\s*[:\-]\s*(.+)$/i);
  if(!label||/embalagem|caixa|pacote|frete|logistic|transporte|volume da caixa/.test(lineTrim))continue;
  const axes={};
  for(const m of label[2].matchAll(axisPattern)){
   const axis=axisNames[m[3]];
   let numberValue=Number(m[1].replace(',','.'));
   if(m[2]==='m')numberValue*=100;
   if(m[2]==='mm')numberValue/=10;
   if(!Number.isFinite(numberValue)||numberValue<=0||numberValue>10000)continue;
   const value=fmtNumber(numberValue)+' cm';
   if(axes[axis]&&axes[axis]!==value){axes.invalid=true;break;}
   axes[axis]=value;
  }
  if(axes.invalid)continue;
  // Apenas grandezas explicitamente nomeadas, nao assumir que x/y/z sejam A/L/C.
  const measurements=['altura','largura','comprimento'].filter(axis=>axes[axis]).map(axis=>({
   label:axis.toUpperCase(),value:axes[axis],axis
  }));
  if(measurements.length>=2)entries.push({measurements,sourceLine:lineTrim});
 }
 if(!entries.length)return null;
 const signature=x=>JSON.stringify(x.measurements);
 if(entries.some(x=>signature(x)!==signature(entries[0])))return null;
 return {measurements:entries[0].measurements,source:'Informacoes da WeDrop coladas na SKU',
  sourceLine:entries[0].sourceLine};
}
