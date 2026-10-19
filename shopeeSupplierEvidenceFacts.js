// Evidence-based suggestions are drafts, not merchant-certified product attributes.
const list=x=>Array.isArray(x)?x:[];
const plain=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const clean=s=>String(s||'').trim();
const equal=(a,b)=>plain(a)===plain(b);
const selectedValue=(attr,proposed)=>list(proposed).find(x=>Number(x.attributeId)===Number(attr.id))?.values?.[0]?.valueName||
 attr.values?.[0]?.name||'';
export function supplierAttributeSuggestions({attributes=[],proposed=[],supplier=null,sourceText=''}={}){
 const notes=clean(sourceText).slice(0,12000),facts=supplier?.product_data||{};
 const origin=supplier?'Ficha WeDrop '+supplier.source_file+' · SKU '+supplier.supplier_sku:'Texto do fornecedor informado pelo vendedor';
 const suggestions=[],conflicts=[],unresolved=[];
 function suggest(attr,value,evidence,{onlyIfMissing=false}={}){
  if(!value||attr.legacy||attr.conditional)return;
  const active=selectedValue(attr,proposed);
  if(equal(value,active))return;
  if(onlyIfMissing&&active)return;
  const opt=list(attr.options).find(x=>Number(x.id)>0&&equal(x.name,value));
  const custom=[2,3,5].includes(Number(attr.inputType));
  if(!opt&&!custom){
   unresolved.push({attributeId:attr.id,name:attr.name,value,reason:'Selecione opção oficial na Shopee. Se não aparecer, pesquise ou informe o suporte.'});
   return;
  }
  const candidate={attributeId:attr.id,values:[{valueId:opt?.id||0,valueName:opt?.name||value}],evidence};
  suggestions.push(candidate);
  if(active)conflicts.push({attributeId:attr.id,name:attr.name,current:active,recommended:value});
 }
 for(const attr of attributes){
  const n=plain(attr.name);
  if(n==='marca'||n==='brand'){
   const brand=clean(facts.brand);
   if(brand)suggest(attr,brand,origin+' — marca confirmada no catálogo do fornecedor.');
   else unresolved.push({attributeId:attr.id,name:attr.name,value:null,reason:'Marca não informada pela WeDrop: confirmar embalagem ou fabricante.'});
  }else if(n.includes('estampa')||n.includes('padrao')){
   if(/\bestampad[oa]\b/i.test(plain(notes)))
    suggest(attr,'Estampado','Texto colado da ficha do fornecedor · declaração de estampa.',{onlyIfMissing:true});
  }else if((n.includes('inmetro')||n.includes('numero de registro inmetro'))&&
    /(registro\s*(?:do\s*)?inmetro|inmetro|nbr)\s*[:\-]\s*(?:n\/?a|nao se aplica|isento)/i.test(plain(notes))){
   const opt=list(attr.options).find(x=>/n\/?a.*nbr.*nao aplicavel/i.test(plain(x.name)));
   if(opt)suggest(attr,opt.name,'Declaração explícita de não aplicabilidade no texto fornecido para esta SKU; confirme exigência regulatória.');
   else unresolved.push({attributeId:attr.id,name:attr.name,value:'N/A',reason:'O modelo não retornou uma opção oficial N/A. Confira antes de marcar isento.'});
  }
 }
 // Product measurements versus boxed transport dimensions are never interchangeable.
 const metrics=[];
 const m=notes.match(/dimens(?:oes|ao)?\s*[:\-]\s*(\d+(?:[.,]\d+)?)\s*cm\s*altura\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm\s*largura\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm\s*comprimento/i);
 if(m)metrics.push({name:'Dimensões declaradas no texto',value:m.slice(1).join(' × ')+' cm',
  note:'Confirmar se são medidas da piscina montada. Não usar como dimensão da embalagem.'});
 const capacity=notes.match(/(?:capacidade|volume)\s*[:\-]?\s*(\d{2,5})\s*(?:litros|l\b)/i);
 if(capacity)metrics.push({name:'Capacidade',value:capacity[1]+' litros',note:'Fonte: texto da WeDrop colado nesta SKU.'});
 if(facts.catalogMeasurements){
  const c=facts.catalogMeasurements;
  metrics.push({name:'Medidas do catálogo logístico',
   value:[c.heightCm,c.widthCm,c.lengthCm].join(' × ')+' cm',
   note:'Medidas de transporte/embalagem na planilha; não são necessariamente medidas da piscina montada.'});
  if(c.weightKg)metrics.push({name:'Peso bruto na planilha',value:String(c.weightKg),
   note:'Unidade inconsistente/pendente de conferência; NÃO preencher automaticamente em kg ou g.'});
 }
 return {suggestions,conflicts,unresolved,metrics,hasScreenshots:false};
}
