// Mede apenas grandezas com unidade explícita. Sem deduções por idade,
// quantidade de peças, números de SKU ou dimensões sem unidade.
const text=s=>typeof s==='string'?s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,2200):'';
const NUMBER=String.raw`\d{1,4}(?:[.,]\d{1,2})?`;
const LENGTH=String.raw`(?:cm|mm|m|cent[ií]metros?|mil[ií]metros?|metros?)`;
const WEIGHT=String.raw`(?:kg|g|gramas?|quilos?|quilogramas?)`;
const wordBoundaryBefore='(?:^|[^\\p{L}\\d])';
const trailingBoundary='(?=$|[^\\p{L}])';
const canonicalUnit=u=>{
 const x=u.toLowerCase();
 if(x.startsWith('cent'))return 'cm';
 if(x.startsWith('mil'))return 'mm';
 if(x.startsWith('met'))return 'm';
 if(x.startsWith('quilo')||x==='kg')return 'kg';
 if(x.startsWith('gram')||x==='g')return 'g';
 return x;
};
export function detectSkuMeasurements(input){
 const s=text(input), found=[], seen=new Set();
 function add(kind,value){
  const normalized=value.replace(/\s+/g,' ').replace(/(\d),(\d)/g,'$1,$2').trim();
  const k=kind+':'+normalized.toLowerCase();
  if(!seen.has(k)){seen.add(k);found.push({kind,value:normalized});}
 }
 // 20 x 30 x 40 cm (2 ou 3 eixos) — não inferir ordem L×A×C.
 const triples=new RegExp(wordBoundaryBefore+'('+NUMBER+'(?:\\s*[x×]\\s*'+NUMBER+'){1,2})\\s*('+LENGTH+')'+trailingBoundary,'giu');
 let m;
 while((m=triples.exec(s))!==null)add('dimensions',m[1].replace(/\s*[x×]\s*/g,' × ')+' '+canonicalUnit(m[2]));
 // comprimento: 20 cm, altura de 12 cm, largura 8 cm, diâmetro 9 cm.
 const named=new RegExp(wordBoundaryBefore+'(comprimento|largura|altura|profundidade|di[aâ]metro|espessura)\\s*(?::|=|de|do|da)?\\s*('+NUMBER+')\\s*('+LENGTH+')'+trailingBoundary,'giu');
 while((m=named.exec(s))!==null)add('dimensions',m[1].toLowerCase()+': '+m[2]+' '+canonicalUnit(m[3]));
 const reverse=new RegExp(wordBoundaryBefore+'('+NUMBER+')\\s*('+LENGTH+')\\s*de?\\s+(comprimento|largura|altura|profundidade|di[aâ]metro)'+trailingBoundary,'giu');
 while((m=reverse.exec(s))!==null)add('dimensions',m[3].toLowerCase()+': '+m[1]+' '+canonicalUnit(m[2]));
 const mass=new RegExp(wordBoundaryBefore+'(?:peso|massa)\\s*(?::|=|de)?\\s*('+NUMBER+')\\s*('+WEIGHT+')'+trailingBoundary,'giu');
 while((m=mass.exec(s))!==null)add('weight','peso: '+m[1]+' '+canonicalUnit(m[2]));
 const cap=new RegExp(wordBoundaryBefore+'(?:capacidade|volume)\\s*(?::|=|de)?\\s*('+NUMBER+')\\s*(ml|l|litros?|mililitros?)'+trailingBoundary,'giu');
 while((m=cap.exec(s))!==null)add('capacity','capacidade: '+m[1]+' '+(m[2].toLowerCase().startsWith('mili')?'ml':m[2].toLowerCase().startsWith('litr')?'L':m[2]));
 // Restringe a saída: textos de terceiros nunca se tornam instruções executáveis.
 return found.slice(0,12);
}
export function dimensionsFromSkuText(input){
 return detectSkuMeasurements(input).filter(x=>x.kind==='dimensions').map(x=>x.value).join(' · ').slice(0,300);
}
export function skuMeasurementSummary(input){
 const parts=detectSkuMeasurements(input);
 return parts.length?parts.map(x=>x.value).join(' · '):'Nenhuma medida com unidade identificada';
}
