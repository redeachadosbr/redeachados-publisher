// Motor Matriz — scope only actual category-active edits during technical review.
// Unchanged live attributes are not "new changes": do not require a fresh
// evidence field for values the seller did not modify. Inactive conditional
// children must not be submitted or requested until their parent activates them.
const list=x=>Array.isArray(x)?x:[];
const num=x=>Number(x);
const text=x=>String(x??'').normalize('NFC').trim();
const canonicalValue=v=>{
 const id=num(v?.valueId??v?.value_id??-1);
 return {id,name:text(v?.valueName??v?.original_value_name),unit:text(v?.unit??v?.value_unit)};
};
export const hasTechnicalValue=v=>{
 const value=canonicalValue(v);
 return Number.isSafeInteger(value.id)&&value.id>0||
  value.id===0&&value.name.length>0;
};
export const hasCompletedTechnicalChange=x=>
 Array.isArray(x?.values)&&x.values.length>0&&x.values.every(hasTechnicalValue);
function comparableValues(listing){
 return list(listing).map(v=>{
  const c=canonicalValue(v);
  return c.id>0?String(c.id):'0:'+c.name+':'+c.unit;
 }).sort();
}
export function unchangedTechnicalAttribute(change,live){
 const current=list(live?.attribute_list).find(x=>num(x?.attribute_id)===num(change.attributeId));
 if(!current)return false;
 const left=comparableValues(change.values),right=comparableValues(current.attribute_value_list);
 return left.length===right.length&&left.every((v,i)=>v===right[i]);
}
export function scopeTechnicalReviewChanges(changes,{record,live,auditChanges}={}){
 if(!Array.isArray(changes)||changes.length>300)throw Error('Ficha técnica inválida.');
 if(typeof auditChanges!=='function')throw Error('Validação técnica indisponível.');
 const ids=new Set(),clean=[];
 const permitted=new Set(list(record?.attributeAudit?.attributes).map(x=>num(x.id)));
 for(const change of changes){
  const id=num(change?.attributeId);
  if(!Number.isSafeInteger(id)||id<=0||ids.has(id)||!permitted.has(id))
   throw Error('Atributo técnico inválido ou repetido para esta categoria.');
  ids.add(id);
  // An unchecked or half-filled optional field is draft-only, not a change.
  // Mandatory active fields will still be checked using the official tree below.
  if(!hasCompletedTechnicalChange(change))continue;
  clean.push({...change,attributeId:id});
 }
 const preliminary=auditChanges(clean,record,live);
 const active=clean.filter(c=>{
  const attr=list(preliminary?.attributes).find(x=>num(x.id)===c.attributeId);
  return attr&&!attr.legacy&&!attr.conditional;
 });
 // Re-check dependencies after discarding conditional children. A changed
 // parent that activates a mandatory child will still be detected by the
 // caller's mandatory audit; no waiver of actual Shopee requirements.
 const finalAudit=auditChanges(active,record,live);
 const applicable=active.filter(c=>list(finalAudit?.attributes)
  .some(x=>num(x.id)===c.attributeId&&!x.conditional&&!x.legacy));
 const actual=applicable.filter(c=>!unchangedTechnicalAttribute(c,live));
 return {changes:actual,ignoredConditional:clean.length-applicable.length,
  ignoredUnchanged:applicable.length-actual.length,ignoredIncomplete:changes.length-clean.length};
}
