/* Fill official Shopee category attributes from already-saved SKU text, never from guessed facts. */
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const clean=s=>String(s??'').trim();
const list=x=>Array.isArray(x)?x:[];
const key=s=>norm(s).replace(/[^a-z0-9]/g,'');
const labels={
 quantity:/^(?:quantity|quantidade|quantity per pack|items per pack|pack quantity|quantidade por embalagem|quantidade por pacote|unidades por pacote|quantidade incluida|quantidade inclusa|quantidade de itens)$/,
 powerSource:/^(?:power source|power supply|energy source|tipo de alimentacao|fonte de energia|fonte de alimentacao|alimentacao)$/,
 use:/^(?:indication|indication of use|usage|usage indication|indicacao|indicacao de uso|uso indicado|uso recomendado|finalidade|aplicacao)$/,
 age:/^(?:recommended age|age recommendation|age range|idade recomendada|faixa etaria|idade indicada|idade minima)$/,
 builtInBattery:/^(?:built.in battery|build.in battery|integrated battery|bateria embutida|bateria integrada|possui bateria)$/,
 rechargeable:/^(?:rechargeable|rechargeable battery|bateria recarregavel|recarregavel)$/
};
const blocked=/^(?:region of origin|country of origin|pais de origem|pais de fabricacao|regiao de origem|made in|certific|bsmi|inmetro|anatel|homologac)/;
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
 const common=norm(name).replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
  .filter(x=>x.length>2&&!['para','com','kit','jogo','conjunto','vintage','vermelha','azul',
  'branco','branca','preta','preto','sortida','sortido','infantil','adulto','premium','nova','novo'].includes(x))
  .slice(0,3);
 if(!common.length)return null;
 for(const source of sources){
  const lines=norm(source.text).split(/\r?\n/);
  let within=false;
  for(const raw of lines){
   const line=raw.trim();
   if(/^(?:contem|itens? inclusos?|conteudo(?: da embalagem)?|acompanha)\s*:\s*$/.test(line)){within=true;continue;}
   if(within&&/^(?:especificacoes|dimensoes|composicao|registro|ncm|marca|dados tecnicos)\s*:/.test(line))within=false;
   if(!within)continue;
   const match=line.match(/^[-•]?\s*0*([1-9]\d{0,2})\s*(?:x|×|-)?\s+(.+)$/);
   if(match&&common.filter(term=>match[2].includes(term)).length>=Math.min(2,common.length))
    return {value:String(Number(match[1])),evidence:source.label+' · quantidade da unidade principal em Itens inclusos'};
  }
 }
 return null;
}
function declaredAge(sources){
 return fromText(sources,/(?:idade (?:recomendada|indicada)\s*:\s*(?:a partir de\s*)?|a partir de\s*|idade minima\s*:\s*)(\d{1,2})\s*anos?\b/,
  m=>'A partir de '+Number(m[1])+' anos');
}
function powerSource(sources){
 return fromText(sources,/\b(?:bateria\s+(?:recarregavel|integrada|interna|embutida)|equipad[oa]\s+com\s+bateria)\b/,
  ()=>'Bateria');
}
function indication(sources){
 // Independente do produto: a descrição deve declarar o uso.
 return fromText(sources,/(?:^|\n)\s*(?:indicacao de uso|uso indicado|uso recomendado|finalidade|aplicacao)\s*:\s*([^\n.;!?]{4,110})/,
  m=>m[1])||
 fromText(sources,/\b(?:ideal para|indicado para|utilizado para|serve para|proprio para|desenvolvido para|usado para)\s+([^\n.;!?]{5,90})/,
  m=>m[1].replace(/\s+(?:com|oferecendo|garantindo|transformando)\s+.*$/,''));
}
function ageThreshold(value){
 const s=norm(value);
 let m=s.match(/^(?:a partir de\s*)?(\d{1,2})\s*anos?\s*(?:ou mais|\+)?$/);
 if(m&&/(?:a partir de|ou mais|\+)/.test(s))return Number(m[1]);
 m=s.match(/^(\d{1,2})\s*(?:years?|yrs?)\s*(?:old\s*)?(?:and (?:above|up|over)|\+)$/);
 if(m)return Number(m[1]);
 m=s.match(/^(\d{1,2})\+\s*(?:years?|anos?)$/);
 return m?Number(m[1]):null;
}
function equivalentNames(kind,value){
 const v=norm(value);
 const names=new Set([v]);
 if(kind==='powerSource'){
  const equivalents={
   bateria:['battery','battery power','battery powered','battery operated','battery-operated','rechargeable battery'],
   pilhas:['battery','batteries','battery powered','battery operated'],
   eletricidade:['ac power','mains power','electricity']
  };
  for(const name of equivalents[v]||[])names.add(name);
 }
 if(kind==='builtInBattery'||kind==='rechargeable'){
  const sets={sim:['yes','true'],nao:['no','false']};
  for(const name of sets[v]||[])names.add(name);
 }
 if(kind==='age'){
  const n=ageThreshold(value);
  if(n!==null)for(const name of [
   n+' years and above',n+' years old and above',n+' years and up',n+'+ years',n+' anos ou mais'])
   names.add(name);
 }
 return [...names];
}
export function technicalOptionSearchTerms(attributeName,value){
 const kind=Object.keys(labels).find(x=>labels[x].test(norm(attributeName)))||'';
 return equivalentNames(kind,value).slice(0,6);
}
function optionsFor(attr,value,kind){
 const synonyms=equivalentNames(kind,value);
 const candidates=list(attr.options).filter(x=>Number(x.id)>0&&synonyms.includes(norm(x.name)));
 return candidates.length===1?candidates[0]:null;
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
  if(attr.conditional||attr.legacy||blocked.test(norm(attr.name))||list(attr.values).length||already.has(Number(attr.id)))continue;
  const label=norm(attr.name);
  let match=null,type='';
  if(labels.quantity.test(label))match=quantity(sources,name);
  else if(labels.powerSource.test(label)){match=powerSource(sources);type='powerSource';}
  else if(labels.use.test(label))match=indication(sources);
  else if(labels.age.test(label)){match=declaredAge(sources);type='age';}
  else if(labels.builtInBattery.test(label)){
   const own=fromText(sources,/(?:^|\n)\s*(?:bateria integrada|bateria embutida|built.in battery)\s*:\s*(sim|nao|yes|no)/,m=>m[1]);
   const source=own||fromText(sources,/\bbateria\s+(?:recarregavel|integrada|interna|embutida)\b/,()=>'Sim');
   if(source)match={...source,value:/^(nao|no)$/i.test(source.value)?'Não':'Sim'};
   type='builtInBattery';
  }else if(labels.rechargeable.test(label)){
   match=fromText(sources,/\bbateria recarregavel\b/,()=>'Sim');type='rechargeable';
  }
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
