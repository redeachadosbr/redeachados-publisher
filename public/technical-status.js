// Fonte única dos números da ficha técnica: valores existentes não são publicações pendentes.
// Sugestões opcionais não viram tarefas nem tornam a revisão "concluída".
(function(root){
 'use strict';
 const id=x=>Number(x?.attributeId??x?.id);
 const validValue=v=>Number(v?.valueId)>0||
  (Number(v?.valueId)===0&&Boolean(String(v?.valueName??v?.name??'').trim()));
 const hasValues=values=>Array.isArray(values)&&values.some(v=>{
  if(!v)return false;
  if(v.valueId!==undefined)return validValue(v);
  return Boolean(String(v.name??v.valueName??'').trim());
 });
 const normalize=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/\s+/g,' ').trim();
 function compute({attributes=[],changes=[],conflicts=[],reviewed=false}={}){
  const active=attributes.filter(a=>!a.conditional);
  const ids=new Set(active.map(id));
  const live=new Set(active.filter(a=>hasValues(a.values)).map(id));
  const planned=new Map(changes.filter(x=>ids.has(id(x))&&hasValues(x.values))
   .map(x=>[id(x),x]));
  const filled=new Set([...live,...planned.keys()]);
  const mandatory=active.filter(a=>a.mandatory);
  const missing=mandatory.filter(a=>!filled.has(id(a)));
  const optional=active.filter(a=>!a.mandatory);
  const optionalUsed=optional.filter(a=>filled.has(id(a))).length;
  const differences=conflicts.filter(c=>{
   if(!ids.has(id(c)))return false;
   const edit=planned.get(id(c));
   return !edit||!edit.values.some(v=>normalize(v.valueName)===normalize(c.recommended));
  });
  return Object.freeze({
   total:active.length,inShopee:live.size,prepared:planned.size,
   filled:filled.size,mandatoryTotal:mandatory.length,mandatoryMissing:missing.length,
   optionalTotal:optional.length,optionalUsed,optionalRemaining:optional.length-optionalUsed,
   conflicts:differences.length,reviewed:Boolean(reviewed),
   readyToReview:missing.length===0&&differences.length===0
  });
 }
 root.RATechnicalStatus=Object.freeze({compute});
})(globalThis);
