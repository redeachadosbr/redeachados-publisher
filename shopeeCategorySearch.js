// Regras Shopee BR para busca de valores de atributos extensos por categoria.
// Endpoint exclusivo para atributos com support_search_value=true na árvore oficial.
const positiveId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
export function assertSearchableAttribute(record,attributeId){
 const id=Number(attributeId),meta=(record?.attributeAudit?.attributes||[]).find(x=>Number(x.id)===id);
 if(!positiveId(id)||!meta||meta.conditional||!meta.supportSearch)
  throw Error('Este atributo não oferece pesquisa oficial para a categoria atual.');
 return meta;
}
export function searchAttributeRequest({attributeId,cursor=0,limit=50,valueName=''}={}){
 if(!positiveId(attributeId))throw Error('Identificador de atributo inválido.');
 if(!Number.isSafeInteger(Number(cursor))||Number(cursor)<0||Number(cursor)>100000)
  throw Error('Página de opções inválida.');
 if(!Number.isInteger(Number(limit))||Number(limit)<1||Number(limit)>100)
  throw Error('Escolha de 1 a 100 opções por página.');
 const name=String(valueName||'').normalize('NFC').trim();
 if(name.length>90||/[\x00-\x1f]/.test(name))throw Error('Pesquisa deve ter até 90 caracteres.');
 return {attribute_id:Number(attributeId),cursor:Number(cursor),limit:Number(limit),
  ...(name?{value_name:name}:{})};
}
export function readSearchedAttributeOptions(payload,cursor=0,limit=50){
 const response=payload?.response||{};
 const raw=response.attribute_value_list||response.value_list||
  response.list||response.attribute_values||[];
 if(!Array.isArray(raw))throw Error('A Shopee não devolveu uma lista de opções para esta consulta.');
 const values=raw.map(x=>({
  id:Number(x.value_id),name:String(x.name||x.value_name||x.original_value_name||'').trim(),
  unit:String(x.value_unit||'').trim()
 })).filter(x=>positiveId(x.id)&&x.name).slice(0,100);
 const hasNext=response.has_next===true||response.has_next===1;
 const nextCursor=response.next_cursor;
 const safeNext=Number.isSafeInteger(Number(nextCursor))&&Number(nextCursor)>Number(cursor)
  ?Number(nextCursor):Number(cursor)+Number(limit);
 return {options:values,hasNext,nextCursor:hasNext?safeNext:null};
}
export async function hydrateSearchOptions(record,changes,search){
 const attrs=record?.attributeAudit?.attributes||[];
 for(const change of Array.isArray(changes)?changes:[]){
  const attr=attrs.find(x=>Number(x.id)===Number(change.attributeId));
  if(!attr?.supportSearch)continue;
  const chosen=Array.isArray(change.values)?change.values:[change];
  for(const selected of chosen){
   const valueId=Number(selected?.valueId);
   if(!positiveId(valueId)||(attr.options||[]).some(x=>Number(x.id)===valueId))continue;
   if(attr.conditional)throw Error('Escolha primeiro o atributo pai de '+attr.name+'.');
   const query=searchAttributeRequest({attributeId:attr.id,valueName:selected.valueName,limit:100});
   // Only a value confirmed by the official response may become selectable.
   const verified=readSearchedAttributeOptions(await search(query),0,100).options
    .find(x=>x.id===valueId);
   if(!verified)throw Error('A opção de '+attr.name+' não foi confirmada na Shopee. Pesquise novamente.');
   attr.options=[...(attr.options||[]),verified];
  }
 }
}
