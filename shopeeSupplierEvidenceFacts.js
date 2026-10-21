// Motor Matriz: compile product facts into category-specific draft values.
// These values appear filled in the editor but are never an authorization to publish.
const list=x=>Array.isArray(x)?x:[];
const plain=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const clean=s=>String(s||'').trim();
const equal=(a,b)=>plain(a)===plain(b);
const selectedValue=(attr,proposed)=>list(proposed).find(x=>Number(x.attributeId)===Number(attr.id))?.values?.[0]?.valueName||
 attr.values?.[0]?.name||'';
const isBrand=x=>['marca','brand','marca do produto'].includes(plain(x));
const unusableBrand=x=>/^(?:importado|nacional|sem marca|marca nao informada|generico|outros?|nao informado|n\/a)$/i.test(plain(x));
const isDimensions=x=>{
 const n=plain(x);
 return /dimens|medidas?/.test(n)&&/produto|piscina|item|montad/.test(n)&&
  (!/pacote|embalagem|caixa|logist/.test(n)||/sem\s+(?:a\s+)?(?:caixa|embalagem)|sem\s+embalagem/.test(n));
};
const isPackageDimensions=x=>{
 const n=plain(x);
 return /dimens|medida|tamanho/.test(n)&&/pacote|embalagem|caixa/.test(n)&&
  !/sem\s+(?:a\s+)?(?:caixa|embalagem)|sem\s+embalagem/.test(n);
};
const sizeNumber=x=>String(x).replace(',','.');

// The product order on the official Shopee category is A x L x C.
// Never transfer supplier shipping/box measurements into this product field.
export function supplierProductDimensions(text){
 const source=String(text||'').slice(0,24000);
 const n='(\\d{1,4}(?:[.,]\\d{1,2})?)';
 // Labeled dimensions, with one unit per axis (supplier text in any order).
 const pattern=new RegExp(
  '(?:dimens(?:oes|ao)|medidas?)\\s*(?:(?:descritas?\\s+)?(?:para|da|do)\\s+(?:(?:a|o)\\s+)?(?:piscina\\s+montada|produto|piscina|item))?\\s*[:\\-]\\s*'+
  n+'\\s*cm\\s*(?:de\\s+)?altura\\s*[x×|;,]+\\s*'+
  n+'\\s*cm\\s*(?:de\\s+)?largura\\s*[x×|;,]+\\s*'+
  n+'\\s*cm\\s*(?:de\\s+)?comprimento','i');
 const matches=[...plain(source).matchAll(new RegExp(pattern.source,'gi'))];
 for(const item of matches){
  const window=plain(source).slice(Math.max(0,item.index-75),item.index);
  if(/(?:embalagem|logist|pacote|caixa)(?:\\s+\\w+){0,2}\\s*$/.test(window))continue;
  const dimensions=item.slice(1,4).map(sizeNumber);
  if(dimensions.every(x=>Number(x)>0&&Number(x)<10000))
   return {height:dimensions[0],width:dimensions[1],length:dimensions[2],
    value:dimensions.join(' x ')+' cm',provenance:item[0]};
 }
 // Ficha do produto pode usar o próprio nome em vez de "produto":
 // "Dimensões da mochila: 30cm de altura x 25cm de largura x 15cm de comprimento".
 // NÃO aceitar o campo se ele tratar de caixa, pacote ou embalagem.
 const named=new RegExp('dimens(?:oes|ao)\\s+(?:da|do)\\s+([a-z ]{3,65})\\s*:\\s*'+
   n+'\\s*cm\\s*(?:de\\s+)?altura\\s*[x×|;,]+\\s*'+
   n+'\\s*cm\\s*(?:de\\s+)?largura\\s*[x×|;,]+\\s*'+
   n+'\\s*cm\\s*(?:de\\s+)?comprimento','gi');
 for(const hit of plain(source).matchAll(named)){
  const label=hit[1].trim(),nums=hit.slice(2,5).map(sizeNumber);
  if(/embalagem|pacote|caixa|logistica|frete|transporte/.test(label))continue;
  if(nums.every(v=>Number(v)>0&&Number(v)<10000)){
   return {height:nums[0],width:nums[1],length:nums[2],
    value:nums.join(' x ')+' cm',provenance:hit[0]};
  }
 }
 // Many WeDrop descriptions use 'Dimensões: 43cm Altura x 135cm Largura x 88cm Comprimento'.
 // If the dimensions line explicitly says "da embalagem", it is excluded.
 const loose=new RegExp('^\\s*(?:dimens(?:oes|ao)|medidas?)\\s*[:\\-]\\s*'+
   n+'\\s*cm\\s*altura\\s*[x×]\\s*'+
   n+'\\s*cm\\s*largura\\s*[x×]\\s*'+
   n+'\\s*cm\\s*comprimento\\s*$','mi');
 const match=plain(source).match(loose);
 if(match&&match.slice(1,4).every(x=>Number(sizeNumber(x))>0))
  return {height:sizeNumber(match[1]),width:sizeNumber(match[2]),length:sizeNumber(match[3]),
   value:match.slice(1,4).map(sizeNumber).join(' x ')+' cm',provenance:match[0]};
 return null;
}
export function supplierAttributeSuggestions({attributes=[],proposed=[],supplier=null,sourceText='',productDescription=''}={}){
 const facts=supplier?.product_data||{},notes=clean(sourceText).slice(0,12000);
 const officialDescription=clean(facts.description||facts.details||'').slice(0,12000);
 const fallbackDescription=clean(productDescription).slice(0,12000);
 const sources=[{text:notes,label:'Informações fornecidas para a SKU'},
  {text:officialDescription,label:'Descrição do catálogo WeDrop'},
  {text:fallbackDescription,label:'Descrição existente do anúncio (conferir com fabricante)'}].filter(x=>x.text);
 const supplierName=supplier?'WeDrop '+supplier.source_file+' · SKU '+supplier.supplier_sku:'';
 const suggestions=[],conflicts=[],unresolved=[];
 function suggest(attr,value,evidence,{onlyIfMissing=false}={}){
  if(!value||attr.legacy||attr.conditional)return;
  const active=selectedValue(attr,proposed);
  if(equal(value,active))return;
  if(onlyIfMissing&&active)return;
  // Tamanho N2/Nº 2 pode estar grafado de formas diferentes na opção oficial.
  // Só reconciliar essas grafias para atributo de tamanho, mantendo ID original.
  const isNumericSize=/^(?:ball size|tamanho da bola)$/.test(plain(attr.name));
  const normalizedNumber=x=>plain(x).replace(/^(?:n(?:umero)?[.º°o]*\s*)?(\d{1,2})$/,'$1');
  const official=list(attr.options).find(x=>Number(x.id)>0&&
    (equal(x.name,value)||(isNumericSize&&normalizedNumber(x.name)===normalizedNumber(value)&&
    /^\d{1,2}$/.test(normalizedNumber(value)))));
  const custom=[2,3,5].includes(Number(attr.inputType));
  if(!official&&!custom){
   unresolved.push({attributeId:attr.id,name:attr.name,value,
     reason:attr.supportSearch?'A opção deve ser consultada na lista oficial da Shopee.':
     'A categoria exige uma opção oficial; não inventar código ou selecionar outra marca.'});
   return;
  }
  // Custom free-text with format_type=2 requires an official unit. Dimensions
  // presented as a single formatted value should never be coerced to a number.
  if(!official&&Number(attr.validationType)===1&&!/^\d+$/.test(value) ||
    !official&&Number(attr.validationType)===3&&!/^-?\d+(?:[.,]\d+)?$/.test(value)){
    unresolved.push({attributeId:attr.id,name:attr.name,value,
      reason:'O formato deste atributo não aceita esse texto. Confira a unidade/opção oficial.'});
    return;
  }
  if(!official&&Number(attr.formatType)===2){
    const units=list(attr.allowedUnits).map(x=>typeof x==='string'?x:x?.unit||x?.name||'');
    if(!units.length){
     unresolved.push({attributeId:attr.id,name:attr.name,value,
       reason:'A Shopee exige unidade da categoria ainda não confirmada.'});return;
    }
    const unit=units.find(u=>plain(u)==='cm');
    if(!unit){unresolved.push({attributeId:attr.id,name:attr.name,value,
      reason:'Não há unidade cm na categoria; conferir formato antes de preencher.'});return;}
    // Shopee's structured numeric measurement should not receive an arbitrary
    // composite string even when the category supports a unit.
    if(!/^\d+(?:[.,]\d+)?$/.test(value)){
     unresolved.push({attributeId:attr.id,name:attr.name,value,
      reason:'O atributo exige valor numérico com unidade, não medida composta.'});return;}
  }
  const entry={attributeId:attr.id,values:[{valueId:official?.id||0,valueName:official?.name||value}],
   evidence,autoFilled:true};
  suggestions.push(entry);
  if(active)conflicts.push({attributeId:attr.id,name:attr.name,current:active,recommended:value});
 }
 function specifiedText(re){
  for(const src of sources){const m=plain(src.text).match(re);if(m)return {value:m[1]||m[0],source:src.label};}
  return null;
 }
 const dims=sources.map(src=>({value:supplierProductDimensions(src.text),label:src.label}))
  .find(x=>x.value)?.value||null;
 const dimSource=sources.find(src=>supplierProductDimensions(src.text))?.label||'';
 for(const attr of attributes){
  const n=plain(attr.name);
  if(isBrand(n)){
   // Always prefer supplier-confirmed brand over wrong 'Novo' inherited from condition NEW.
   const brand=clean(facts.brand)||specifiedText(/(?:^|\n)\s*marca\s*[:\-]\s*([^\n.;]+)/)?.value;
   if(brand&&!unusableBrand(brand))suggest(attr,brand,(supplierName||'Ficha desta SKU')+' — marca confirmada na fonte da SKU.');
   if(brand&&unusableBrand(brand))unresolved.push({attributeId:attr.id,name:attr.name,value:brand,
     reason:'IMPORTADO/GENÉRICO indica origem ou ausência de marca; não usar como marca sem comprovação.'});
   else if(!brand)unresolved.push({attributeId:attr.id,name:attr.name,value:null,reason:'Marca não confirmada pelo fornecedor.'});
  }else if(n==='material'||n.startsWith('material ')||n.includes('composicao')){
   const explicit=specifiedText(/(?:^|\n)\s*(?:material|composicao)\s*[:\-]\s*([^\n.;]{2,75})/)||
    specifiedText(/(?:produto|brinquedo|conjunto)\s+(?:fabricado|feito|produzido)\s+em\s+([a-z]{2,32})\b/);
   if(explicit)suggest(attr,plain(explicit.value)==='pp'?'PP':clean(explicit.value),explicit.source+' — material expresso no texto desta SKU.',{onlyIfMissing:true});
  }else if(n.includes('inmetro')||n.includes('certificacao')||n.includes('certificado')){
   const officialNumber=specifiedText(/(?:registro|certificado|certificacao|numero\s+de\s+registro)\s*(?:do\s*)?inmetro\s*[:\-]\s*(\d{3,12}\/\d{4}|\d{5,14})\b/)||
    specifiedText(/(?:registro|numero)\s*(?:do\s*)?inmetro\s*(?:n[oº°]\.?)?\s*(\d{3,12}\/\d{4}|\d{5,14})\b/);
   if(officialNumber)suggest(attr,officialNumber.value,officialNumber.source+' — registro informado na ficha; validar no Inmetro.',{onlyIfMissing:true});
   else if(sources.some(src=>/\bcertificad[oa]\s+pelo\s+inmetro\b/i.test(plain(src.text))))
    unresolved.push({attributeId:attr.id,name:attr.name,value:null,
     reason:'A fonte cita Inmetro, mas não apresenta número de registro validado. Não preencher certificação automaticamente.'});
  }else if(n==='cor'||n.startsWith('cor ')||n==='cores'){
   const color=specifiedText(/(?:^|\n)\s*cor(?:es)?\s*[:\-]\s*([a-z ]{3,30})\b/);
   if(color)suggest(attr,clean(color.value),color.source+' — cor explicitamente declarada.',{onlyIfMissing:true});
  }else if(n==='modelo'||n.includes('modelo do produto')){
   const model=specifiedText(/(?:^|\n)\s*modelo\s*[:\-]\s*([^\n.;]{2,55})/);
   if(model)suggest(attr,clean(model.value),model.source+' — modelo explicitamente declarado.',{onlyIfMissing:true});
  }else if(n.includes('estampa')||n.includes('padrao')||n.includes('estampado')){
   const stamp=specifiedText(/(?:^|\n)\s*(?:estampa|padrao)\s*[:\-]\s*(estampad[oa])\b/);
   if(stamp)suggest(attr,'Estampado',stamp.source+' — estampa explicitamente declarada.',{onlyIfMissing:true});
  }else if(isDimensions(n)){
   if(dims)suggest(attr,dims.value,dimSource+' — medidas do produto (A x L x C); NÃO são dimensões da embalagem.',{onlyIfMissing:true});
  }else if(isPackageDimensions(n)){
   // Never conflate with product dimensions. Catalogue CSV sizes have uncertain
   // shipping meaning and therefore remain review-only.
  }else if(n.includes('idade recomendada')){
   const found=specifiedText(/idade\s+recomendada\s*[:\-]\s*(\d{1,2})\s*(?:anos|ano)/)||
    specifiedText(/(?:indicad[oa]s?\s+para\s+criancas|a\s+partir\s+de)\s+(?:a\s+partir\s+de\s+)?(\d{1,2})\s*anos/);
   if(found)suggest(attr,found.value+' anos',found.source+' — idade expressamente informada.',{onlyIfMissing:true});
  }else if(n.includes('quantidade')&&n.includes('embalagem')){
   const found=specifiedText(/quantidade\s+(?:incluida|por\s+embalagem)\s*[:\-]\s*(\d{1,3})\b/);
   if(found)suggest(attr,found.value,found.source+' — quantidade confirmada.',{onlyIfMissing:true});

  }
 }

 // Matching bilingual Shopee attributes to facts explicitly supplied for THIS SKU.
 // Never assume shipping dimensions are dimensions of the product.
 function labeledField(labels){
  const labelsPlain=labels.map(plain);
  for(const src of sources){
   const lines=String(src.text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
   for(let i=0;i<lines.length;i++){
    const normalized=plain(lines[i]);
    const colon=normalized.match(/^([^:=-]{2,65})\s*[:=-]\s*(.{1,110})$/);
    let candidate=null;
    if(colon&&labelsPlain.includes(colon[1].trim()))candidate=lines[i].match(/^[^:=-]{2,65}\s*[:=-]\s*(.{1,110})$/)?.[1]?.trim()||colon[2];
    if(!candidate&&labelsPlain.includes(normalized.replace(/[:=-]\s*$/,''))&&i+1<lines.length&&lines[i+1].length<=90)
      candidate=lines[i+1];
    if(candidate&&candidate.length<=110)return {value:candidate.trim(),source:src.label};
   }
  }
  return null;
 }
 function suppliedValue(keys,labels=[]){
  for(const name of keys){
   const item=facts[name];
   if((typeof item==='string'||typeof item==='number')&&String(item).trim())
    return {value:String(item).trim(),source:supplierName+' · campo '+name};
  }
  return labeledField(labels);
 }
 function normalizeSize(raw){
  return String(raw||'').normalize('NFC').replace(/\b(?:numero|n[.º°o]*)\s*(\d+)\b/ig,'$1').trim();
 }
 const sourceName=String(facts.name||facts.title||'');
 for(const attr of attributes){
  if(attr.legacy||attr.conditional||attr.values?.length||
     suggestions.some(x=>Number(x.attributeId)===Number(attr.id)))continue;
  const n=plain(attr.name);
  let hit=null;
  if(/^(?:model|modelo|product model)$/.test(n))
   hit=suppliedValue(['model','modelo'],['modelo','model','modelo do produto']);
  else if(/^(?:material|composition|composicao|material do produto)$/.test(n))
   hit=suppliedValue(['material','composition'],['material','composicao','composition']);
  else if(/^(?:color|colour|cor|cores)$/.test(n))
   hit=suppliedValue(['color','cor'],['cor','cores','color','colour']);
  else if(/^(?:ball diameter|diametro da bola|diametro)$/.test(n)){
   hit=suppliedValue(['ballDiameter'],['diametro da bola','ball diameter','diametro do produto']);
  }else if(/^(?:ball size|tamanho da bola)$/.test(n)){
   hit=suppliedValue(['ballSize'],['tamanho da bola','ball size']);
   if(!hit&&/\bbola\b/i.test(sourceName)){
    const explicit=sourceName.match(/\b(?:n[.º°o]*\s*|tamanho\s*)(\d{1,2})\b/i);
    if(explicit)hit={value:explicit[1],source:supplierName+' · tamanho indicado no nome do produto'};
   }
  }else if(/^(?:quantity per pack|quantidade por pacote|unidades por pacote)$/.test(n)){
   hit=suppliedValue(['quantityPerPack'],['quantidade por pacote','unidades por pacote','quantity per pack']);
  }else if(/^(?:warranty duration|prazo de garantia|tempo de garantia)$/.test(n)){
   hit=suppliedValue(['warrantyDuration'],['prazo de garantia','tempo de garantia','warranty duration']);
  }else if(/^(?:region of origin|pais de origem|regiao de origem)$/.test(n)){
   hit=suppliedValue(['countryOfOrigin'],['pais de origem','regiao de origem','region of origin']);
  }else if(/^(?:length|comprimento|comprimento do produto)$/.test(n)){
   if(dims)hit={value:dims.length,source:dimSource+' · comprimento do produto em cm'};
   else hit=labeledField(['comprimento do produto','product length']);
  }else if(/^(?:height|altura|altura do produto)$/.test(n)){
   if(dims)hit={value:dims.height,source:dimSource+' · altura do produto em cm'};
   else hit=labeledField(['altura do produto','product height']);
  }else if(/^(?:width|largura|largura do produto)$/.test(n)){
   if(dims)hit={value:dims.width,source:dimSource+' · largura do produto em cm'};
   else hit=labeledField(['largura do produto','product width']);
  }else if(/^(?:quantity|quantidade)$/.test(n)){
   hit=labeledField(['quantidade do produto','quantidade de itens','quantidade incluida','quantidade incluida no pacote']);
  }else if(/^(?:size|tamanho)$/.test(n)){
   hit=suppliedValue(['size','tamanho'],['tamanho do produto','size','tamanho']);
  }
  if(!hit)continue;
  const raw=String(hit.value).trim();
  const numeric=raw.match(/^(\d{1,4}(?:[.,]\d{1,2})?)\s*(cm|mm|m|kg|g)?\s*$/i);
  let value=/^(?:ball size|tamanho da bola|size|tamanho)$/.test(n)?normalizeSize(raw):raw;
  let unit='';
  // Structured measurement fields require a Shopee-approved unit.
  if(numeric&&Number(attr.formatType)===2){
   const units=list(attr.allowedUnits).map(u=>typeof u==='string'?u:u?.unit||u?.name||'').filter(Boolean);
   const match=units.find(u=>plain(u)===plain(numeric[2]||'cm'));
   if(!match)continue;
   value=numeric[1].replace(',','.');unit=match;
  }
  const previous=suggestions.length;
  suggest(attr,value,hit.source+' — valor explícito desta SKU.',{onlyIfMissing:true});
  if(suggestions.length>previous&&unit){
   suggestions[suggestions.length-1].values[0].unit=unit;
  }
 }

 const metrics=[];
 if(dims)metrics.push({name:'Dimensões do produto (A × L × C)',value:dims.value,
  note:dimSource+'; confirmar medidas montadas. Não utilizar dimensões logísticas.'});
 const capacity=specifiedText(/(?:capacidade|volume)\s*[:\-]?\s*(\d{2,5})\s*(?:litros|l\b)/);
 if(capacity)metrics.push({name:'Capacidade',value:capacity.value+' litros',note:capacity.source});
 if(facts.catalogMeasurements){
  const c=facts.catalogMeasurements;
  metrics.push({name:'Medidas do catálogo logístico',value:[c.heightCm,c.widthCm,c.lengthCm].join(' × ')+' cm',
   note:'Medidas de transporte/embalagem na planilha; não são necessariamente medidas da piscina ou do produto montado.'});
  if(c.weightKg)metrics.push({name:'Peso bruto na planilha',value:String(c.weightKg),
   note:'Unidade inconsistente/pendente de conferência; NÃO preencher automaticamente em kg ou g.'});
 }
 return {suggestions,conflicts,unresolved,metrics,hasScreenshots:false};
}
