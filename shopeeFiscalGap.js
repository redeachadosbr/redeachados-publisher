// Official Shopee tax_info readback: never infer completion from a saved draft.
// A parent Item ID owns one fiscal record even when it has several model SKUs.
export const SHOPEE_FISCAL_REQUIRED_FIELDS=Object.freeze([
 'ncm','origin','measure_unit','same_state_cfop','diff_state_cfop','csosn'
]);
export const SHOPEE_FISCAL_OPTIONAL_FIELDS=Object.freeze([
 'pis_cofins_cst','operation_type','cest'
]);
const present=x=>String(x??'').trim().length>0;
export function inspectShopeeFiscalGap(raw){
 const tax=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const missing=SHOPEE_FISCAL_REQUIRED_FIELDS.filter(k=>!present(tax[k]));
 const filled=SHOPEE_FISCAL_REQUIRED_FIELDS.length-missing.length;
 const invalid=[
  ...(present(tax.ncm)&&!/^\d{8}$/.test(String(tax.ncm))?['ncm']:[]),
  ...(present(tax.cest)&&String(tax.cest)==='00'?['cest']:[])
 ];
 return {
  status:!filled?'empty':missing.length||invalid.length?'partial':'complete',
  missing,invalid,filled,required:SHOPEE_FISCAL_REQUIRED_FIELDS.length
 };
}
// Prepared fiscal evidence may fill ONLY blank Shopee fields.
// Existing values are authoritative for this fill-only workflow.
export function fiscalFillMissingOnly(liveTax,approvedTax){
 if(!approvedTax||typeof approvedTax!=='object')throw Error('Ficha fiscal aprovada ausente.');
 const old=liveTax&&typeof liveTax==='object'&&!Array.isArray(liveTax)?liveTax:{};
 const gap=inspectShopeeFiscalGap(old);
 const merged={...old};
 const missingSource=[];
 for(const key of gap.missing){
  const value=String(approvedTax[key]??'').trim();
  if(!value)missingSource.push(key);
  else merged[key]=value;
 }
 // Optional fields are not grounds to overwrite already-published values.
 for(const key of SHOPEE_FISCAL_OPTIONAL_FIELDS){
  if(present(old[key]))continue;
  const value=String(approvedTax[key]??'').trim();
  if(!value||key==='cest'&&!/^\d{7}$/.test(value))continue;
  merged[key]=value;
 }
 if(missingSource.length)throw Error('Ficha fiscal incompleta: '+missingSource.join(', '));
 return {tax:merged,gap,changed:Object.keys(merged).filter(k=>String(merged[k]??'')!==String(old[k]??''))};
}
