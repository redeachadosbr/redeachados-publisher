import {normalizeAttributeAudit} from './productOptimizer.js';
import {assertAnatelCompliance} from './shopeeAnatel.js';
const list=x=>Array.isArray(x)?x:[];
export function attributeAuditForChanges(changes,record,live){
 if(!record.attributeAudit?.schema)return record.attributeAudit;
 if(!Array.isArray(changes)||changes.length>300)throw Error('Ficha técnica inválida.');
 const selected=new Map(list(live.attribute_list).map(x=>[Number(x.attribute_id),x]));
 for(const change of changes){
  selected.set(Number(change.attributeId),{attribute_id:Number(change.attributeId),
   attribute_value_list:(Array.isArray(change.values)?change.values:[change]).map(x=>({value_id:Number(x.valueId),
    original_value_name:String(x.valueName||''),value_unit:String(x.unit||'')}))});
 }
 const audit=normalizeAttributeAudit({...live,attribute_list:[...selected.values()]},record.attributeAudit.schema);
 // Official search results validated by the backend may not be in the initial
 // get_attribute_tree response. Preserve them only for the same attribute ID.
 for(const meta of audit.attributes){
  const source=record.attributeAudit.attributes?.find(x=>Number(x.id)===meta.id);
  if(!source?.supportSearch)continue;
  const combined=new Map((meta.options||[]).map(x=>[Number(x.id),x]));
  for(const option of source.options||[])if(Number(option.id)>0&&!combined.has(Number(option.id)))
   combined.set(Number(option.id),option);
  meta.options=[...combined.values()];
 }
 return audit;
}
export function attributeInputRules(meta){
 const type=Number(meta.inputType);
 return {custom:[2,3,5].includes(type),multiple:[4,5].includes(type),
  max:[4,5].includes(type)?(Number(meta.maxValues)>0?Number(meta.maxValues):20):1,
  units:list(meta.allowedUnits).map(x=>typeof x==='string'?x:String(x?.unit||x?.name||'')).filter(Boolean)};
}
function attributeValue(raw,meta){
 const rules=attributeInputRules(meta),id=Number(raw.valueId);
 if(!Number.isSafeInteger(id)||id<0)throw Error('Valor inválido para '+meta.name+'.');
 if(id>0){
  const option=meta.options?.find(x=>x.id===id);
  if(!option)throw Error('Selecione um valor oficial da Shopee para '+meta.name+'.');
  return {value_id:id,original_value_name:option.name,...(option.unit?{value_unit:option.unit}:{})};
 }
 if(!rules.custom)throw Error('Este atributo exige uma opção oficial: '+meta.name+'.');
 let value=String(raw.valueName||'').normalize('NFC').trim();
 if(!value||[...value].length>500||/[\x00-\x1f]/.test(value))throw Error('Preencha um valor válido para '+meta.name+'.');
 const validation=Number(meta.validationType);
 if(validation===1&&!/^\d+$/.test(value))throw Error(meta.name+' exige um número inteiro.');
 if(validation===3){value=value.replace(',','.');if(!/^-?\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw Error(meta.name+' exige um número.');}
 if(validation===4&&!/^\d{1,12}$/.test(value))throw Error(meta.name+' exige uma data válida.');
 const unit=String(raw.unit||'').trim();
 if(Number(meta.formatType)===2&&(!unit||!rules.units.includes(unit)))throw Error('Selecione a unidade oficial de '+meta.name+'.');
 if(unit&&!rules.units.includes(unit))throw Error('Unidade não permitida para '+meta.name+'.');
 return {value_id:0,original_value_name:value,...(unit?{value_unit:unit}:{})};
}
export function compileAttributes(changes,record,live){
 if(!Array.isArray(changes)||changes.length>300)throw Error('Ficha técnica inválida.');
 const audit=attributeAuditForChanges(changes,record,live);
 const merged=new Map(list(live.attribute_list).map(x=>[Number(x.attribute_id),x]));
 const used=new Set();
 for(const change of changes){
  const id=Number(change.attributeId),meta=audit?.attributes?.find(x=>x.id===id);
  if(!meta||meta.conditional||used.has(id))throw Error('Atributo não disponível nesta categoria.');
  if(String(change.evidence||'').trim().length<3)throw Error('Informe a fonte do atributo '+meta.name+'.');
  used.add(id);
  const values=Array.isArray(change.values)?change.values:[change];
  if(!values.length||values.length>attributeInputRules(meta).max)throw Error('Quantidade de valores não permitida para '+meta.name+'.');
  const compiled=values.map(x=>attributeValue(x,meta));
  if(new Set(compiled.map(x=>JSON.stringify(x))).size!==compiled.length)throw Error('Valores repetidos para '+meta.name+'.');
  merged.set(id,{attribute_id:id,attribute_value_list:compiled});
 }
 if(changes.length){
  for(const meta of audit?.attributes||[]){
   if(meta.conditional){merged.delete(meta.id);continue;}
   if(meta.mandatory&&(meta.state==='missing'||!merged.get(meta.id)?.attribute_value_list?.length))
    throw Error('Preencha o atributo obrigatório '+meta.name+' após selecionar os campos relacionados.');
  }
  assertAnatelCompliance(audit);
 }
 return [...merged.values()];
}
const units=new Set('AMPOLA BALDE BANDEJ BARRA BISNAG BLOCO BOBINA BOMB CAPS CART CENTO CJ CM CM2 CX CX2 CX3 CX5 CX10 CX15 CX20 CX25 CX50 CX100 DISP DUZIA EMBAL FARDO FOLHA FRASCO GALAO GF GRAMAS JOGO KG KIT LATA LITRO M M2 M3 MILHEI ML MWH PACOTE PALETE PARES PC POTE K RESMA ROLO SACO SACOLA TAMBOR TANQUE TON TUBO UN VASIL VIDRO'.split(' '));
export function compileTax(input,live){
 if(!input||typeof input!=='object'||String(input.evidence||'').trim().length<3)
  throw Error('Informe a fonte fiscal confirmada para esta SKU.');
 const patterns={ncm:/^\d{8}$/,origin:/^[0-8]$/,same_state_cfop:/^5\d{3}$/,
  diff_state_cfop:/^6\d{3}$/,csosn:/^\d{3}$/,cest:/^(\d{7}|00)$/,pis_cofins_cst:/^\d{2}$/,operation_type:/^[12]$/};
 const tax={...(live.tax_info||{})};
 for(const [key,regex] of Object.entries(patterns)){
  if(input[key]===undefined||String(input[key]).trim()==='')continue;
  const value=String(input[key]).trim();if(!regex.test(value))throw Error('Campo fiscal '+key+' inválido.');
  tax[key]=value;
 }
 if(!patterns.ncm.test(String(tax.ncm||'')))throw Error('NCM confirmado com 8 dígitos é obrigatório para preparar o fiscal.');
 if(input.measure_unit){
  const unit=String(input.measure_unit).toUpperCase().trim();
  if(!units.has(unit))throw Error('Unidade fiscal não aceita pela Shopee.');
  tax.measure_unit=unit;
 }
 return tax;
}
// Shopee may reorder the attribute list and its value lists on readback.
// Compare ALL attribute identities and value triples, not array order or volatile API metadata.
export function sameShopeeAttributes(left,right){
 const normalize=raw=>(Array.isArray(raw)?raw:[]).map(a=>({
  attribute_id:String(a?.attribute_id??''),
  attribute_value_list:(Array.isArray(a?.attribute_value_list)?a.attribute_value_list:[])
   .map(v=>({
    value_id:String(v?.value_id??''),
    original_value_name:String(v?.original_value_name??''),
    value_unit:String(v?.value_unit??'')
   }))
   .sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y)))
 })).sort((x,y)=>Number(x.attribute_id)-Number(y.attribute_id)||
  JSON.stringify(x).localeCompare(JSON.stringify(y)));
 return JSON.stringify(normalize(left))===JSON.stringify(normalize(right));
}
export function sameData(a,b){
 const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalize(value[k])])):value;
 return JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
}
export function fieldsVerified(proposed,item){
 return Object.entries(proposed).every(([key,value])=>{
  if(key==='attribute_list')return value.every(x=>{
   const actual=list(item.attribute_list).find(y=>Number(y.attribute_id)===Number(x.attribute_id));
   return x.attribute_value_list?.every(v=>actual?.attribute_value_list?.some(w=>
    Number(w.value_id)===Number(v.value_id)&&(Number(v.value_id)>0||String(w.original_value_name)===String(v.original_value_name))&&
    String(w.value_unit||'')===String(v.value_unit||'')));
  });
  if(key==='tax_info')return Object.entries(value).every(([k,v])=>String(item.tax_info?.[k]??'')===String(v??''));
  return String(item?.[key]??'').replace(/\r\n?/g,'\n').trim()===String(value??'').replace(/\r\n?/g,'\n').trim();
 });
}
