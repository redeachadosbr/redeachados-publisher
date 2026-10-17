const list=x=>Array.isArray(x)?x:[];
export function compileAttributes(changes,record,live){
 if(!Array.isArray(changes)||changes.length>60)throw Error('Ficha técnica inválida.');
 const merged=new Map(list(live.attribute_list).map(x=>[Number(x.attribute_id),x]));
 const used=new Set();
 for(const change of changes){
  const id=Number(change.attributeId),meta=record.attributeAudit?.attributes?.find(x=>x.id===id);
  if(!meta||meta.conditional||used.has(id))throw Error('Atributo não disponível nesta categoria.');
  if(String(change.evidence||'').trim().length<3)throw Error('Informe a fonte do atributo '+meta.name+'.');
  used.add(id);
  const option=meta.options?.find(x=>x.id===Number(change.valueId)&&x.id>0);
  if(!option)throw Error('Selecione um valor oficial da Shopee para '+meta.name+'.');
  merged.set(id,{attribute_id:id,attribute_value_list:[{value_id:option.id,original_value_name:option.name,
   ...(option.unit?{value_unit:option.unit}:{})}]});
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
