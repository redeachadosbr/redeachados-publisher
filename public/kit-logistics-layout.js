// Reconhecimento geométrico de tabelas horizontais estreitas da WeDrop.
// Não atribui valores quando o print não possui cabeçalhos reconhecíveis.
const norm=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const WIDE_TOTAL_FIELDS=[
 {key:'widthCm',label:'Largura Total (Em cm)',index:1},
 {key:'heightCm',label:'Altura Total (Em cm)',index:2},
 {key:'lengthCm',label:'Comprimento Total (Em cm)',index:3},
 {key:'weightKg',label:'Peso Total (em gramas)',index:4}
];
export function isWideTotalsPrint(width,height,text){
 const ratio=width/Math.max(height,1),source=norm(text);
 const labels=['largura total','altura total','comprimento total','peso total'];
 return ratio>=3.4&&ratio<=7.5&&width>=900&&height>=130&&
  labels.filter(label=>source.includes(label)).length>=3;
}
export function wideTotalsRegions(width,height){
 // No print WeDrop, os cabeçalhos ocupam a metade superior e os números
 // aparecem em caixas na faixa inferior. A última coluna pode ser cortada.
 // Cortar colunas isoladas evita que OCR de página inteira confunda a ordem.
 const columnWidth=width*.21;
 return WIDE_TOTAL_FIELDS.map(({key,label,index})=>({
  key,label,index,x:Math.floor(columnWidth*index),
  y:Math.floor(height*.63),
  width:Math.max(1,Math.min(width-Math.floor(columnWidth*index),
   Math.ceil(columnWidth))),
  height:Math.floor(height*.97)-Math.floor(height*.63)
 }));
}
export function parseIsolatedTotalNumber(text,key){
 const tokens=String(text||'').replace(/[^\d.,\s]/g,' ').match(/\d+(?:[,.]\d+)?/g)||[];
 if(tokens.length!==1)return null;
 const n=Number(tokens[0].replace(',','.'));
 if(!Number.isFinite(n)||n<=0)return null;
 if(key==='weightKg'){
  // Etiqueta identificada: "Peso Total (em gramas)".
  // Sem aumentar o peso estimado além do arredondamento ao miligrama.
  if(n>30000)return null;
  return Math.ceil((n/1000-1e-10)*1000)/1000;
 }
 return Number.isInteger(n)&&n<=200?n:null;
}
export function totalFieldsToLabeledText(values){
 return WIDE_TOTAL_FIELDS.filter(field=>values[field.key]!=null).map(field=>
  field.key==='weightKg'?
   'Peso total (kg): '+values.weightKg:
   field.label+': '+values[field.key]).join('\n');
}
