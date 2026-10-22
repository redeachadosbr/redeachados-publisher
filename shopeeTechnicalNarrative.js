/* Fill official Shopee category attributes from already-saved SKU text, never from guessed facts. */
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const clean=s=>String(s??'').trim();
const list=x=>Array.isArray(x)?x:[];
const matchingLabel=(name,rule)=>rule.test(norm(name));
const key=s=>norm(s).replace(/[^a-z0-9]/g,'');
function fromText(sources,re,format=x=>x){
 for(const source of sources){
  const match=norm(source.text).match(re);
  if(match)return {value:format(match),evidence:source.label+' · informação expressa na descrição da SKU'};
 }
 return null;
}
function quantity(sources,name){
 const explicit=fromText(sources,/(?:^|\n)\s*(?:quantidade(?:\s+(?:por|da)\s+embalagem)?|quantity(?: per pack)?)\s*:\s*([1-9]\d{0,2})\b/,m=>m[1]);
 if(explicit)return explicit;
 // A charger and manual do not multiply the quantity of the main product.
 const common=norm(name).split(/\s+/).filter(x=>x.length>2&&!['para','com','estilo','vintage','vermelha','sortido','branco'].includes(x)).slice(0,2);
 if(!common.length)return null;
 for(const source of sources){
  const lines=norm(source.text).split('\n');
  let within=false;
  for(const raw of lines){
   const line=raw.trim();
   if(/^(?:cont[eé]m|itens? inclusos?|conteudo(?: da embalagem)?)\s*:$/.test(line)){within=true;continue;}
   if(within&&/^(?:especificacoes|dimensoes|composicao|registro|ncm|marca)\s*:/.test(line))within=false;
   if(!within)continue;
   const m=line.match(/^[-•]?\s*0*([1-9]\d{0,2})\s*(?:x|×|-)?\s+(.+)$/);
   if(m&&common.every(k=>m[2].includes(k)))return {value:String(Number(m[1])),
    evidence:source.label+' · unidade principal declarada em Itens inclusos/Contém'};
  }
 }
 return null;
}
function declaredAge(sources){
 return fromText(sources,
  /(?:idade recomendada\s*:\s*(?:a partir de\s*)?|a partir de\s*)(\d{1,2})\s*anos?\b/,
  m=>'A partir de '+m[1]+' anos');
}
function powerSource(sources){
 return fromText(sources,/\b(?:bateria\s+(?:recarregavel|integrada|interna|embutida)|equipad[oa]\s+com\s+bateria)\b/,
  ()=>'Bateria');
}
function indication(sources){
 for(const source of sources){
  const v=norm(source.text);
  if(/\bmoto\b/.test(v)&&/\b(?:criancas?|infantil)\b/.test(v)&&
    /\b(?:passeios?|brincadeiras|aventuras sobre rodas)\b/.test(v)){
   const age=v.match(/a partir de\s*(\d{1,2})\s*anos?/);
   return {value:'Passeio recreativo infantil'+(age?' a partir de '+age[1]+' anos':''),
    evidence:source.label+' · uso infantil/passeio explicitamente descrito'};
  }
 }
 return null;
}
const mappings={
 battery:[['bateria','battery','battery powered','battery-operated','battery operated','rechargeable battery','battery power']],
 age:[['a partir de 3 anos','3 years old and above','3 years and above','3 years and up','3+ years','3 anos ou mais']],
 yes:[['sim','yes','true']]
};
function optionsFor(attr,value,kind){
 const group=(mappings[kind]||[]).find(g=>g.includes(norm(value)));
 if(!group)return null;
 const selected=list(attr.options).filter(o=>Number(o.id)>0&&group.includes(norm(o.name)));
 return selected.length===1?selected[0]:null;
}
export function narrativeTechnicalSuggestions({attributes=[],supplier=null,sourceText='',productDescription='',existing=[]}={}){
 const facts=supplier?.product_data||{},sources=[
  {text:sourceText,label:'Informações e prints salvos para esta SKU'},
  {text:facts.description||facts.details||'',label:'Descrição WeDrop'},
  {text:productDescription,label:'Descrição atual do anúncio Shopee'}
 ].filter(x=>clean(x.text));
 const found=[],unresolved=[],already=new Set(list(existing).map(x=>Number(x.attributeId)));
 const name=facts.name||facts.title||'';
 for(const attr of attributes){
  if(attr.conditional||attr.legacy||list(attr.values).length||already.has(Number(attr.id)))continue;
  const label=norm(attr.name);
  let match=null,type='';
  if(/^(?:quantity|quantidade|quantity per pack|quantidade por embalagem|quantidade por pacote|unidades por pacote|quantidade incluida)$/.test(label))
   match=quantity(sources,name);
  else if(/^(?:power source|fonte de energia|fonte de alimentacao|tipo de alimentacao|alimentacao)$/.test(label))
   {match=powerSource(sources);type='battery';}
  else if(/^(?:indication|indicacao|indicacao de uso|uso indicado|uso recomendado)$/.test(label))
   match=indication(sources);
  else if(/^(?:recommended age|idade recomendada|faixa etaria|idade indicada)$/.test(label))
   {match=declaredAge(sources);type='age';}
  else if(/^(?:built.in battery|bateria embutida|bateria integrada)$/.test(label))
   {const foundBattery=powerSource(sources);if(foundBattery)match={...foundBattery,value:'Sim'};type='yes';}
  if(!match)continue;
  const equivalent=optionsFor(attr,match.value,type);
  const official=list(attr.options).find(o=>Number(o.id)>0&&norm(o.name)===norm(match.value));
  const selected=equivalent||official;
  const custom=[2,3,5].includes(Number(attr.inputType));
  // A category-controlled dropdown requires a REAL official option ID.
  if(!selected&&!custom){
   unresolved.push({attributeId:attr.id,name:attr.name,value:match.value,
    reason:'Valor confirmado na descrição, mas ainda sem opção equivalente da categoria Shopee.'});
   continue;
  }
  if(!selected&&Number(attr.validationType)===1&&!/^\d+$/.test(match.value))continue;
  const value=selected?{valueId:Number(selected.id),valueName:selected.name}:
   {valueId:0,valueName:match.value};
  found.push({attributeId:attr.id,values:[value],
   evidence:match.evidence+' · revise antes de publicar.',autoFilled:true});
 }
 return {suggestions:found,unresolved};
}
export function mergeNarrativeTechnicalFacts(base,narrative){
 const seen=new Set(list(base.suggestions).map(s=>Number(s.attributeId)));
 const additions=list(narrative.suggestions).filter(s=>!seen.has(Number(s.attributeId)));
 const complete=new Set(additions.map(s=>Number(s.attributeId)));
 return {...base,suggestions:[...list(base.suggestions),...additions],
  unresolved:[...list(base.unresolved).filter(x=>!complete.has(Number(x.attributeId))),
   ...list(narrative.unresolved).filter(x=>!seen.has(Number(x.attributeId)))]};
}
