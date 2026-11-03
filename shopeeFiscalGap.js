// Official Shopee tax_info readback: never infer completion from a saved draft.
// A parent Item ID owns one fiscal record even when it has several model SKUs.
// Separate required Shopee fields from the additional seller-approved template.
// The template is a store preference, NOT a universal tax classification.
export const SHOPEE_FISCAL_REQUIRED_FIELDS=Object.freeze([
 'ncm','origin','measure_unit','same_state_cfop','diff_state_cfop','csosn'
]);
export const SHOPEE_FISCAL_OPTIONAL_FIELDS=Object.freeze([
 'pis_cofins_cst','operation_type','cest'
]);
const present=x=>String(x??'').trim().length>0;
export function inspectShopeeFiscalGap(raw){
 const tax=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const missingCore=SHOPEE_FISCAL_REQUIRED_FIELDS.filter(k=>!present(tax[k]));
 // Rede Achados BR requested these three otherwise-optional fields be filled,
 // too. Missing configured values are a seller-template gap, not an API error.
 const missingConfigured=SHOPEE_FISCAL_OPTIONAL_FIELDS.filter(k=>!present(tax[k]));
 const missing=[...missingCore,...missingConfigured];
 const filled=SHOPEE_FISCAL_REQUIRED_FIELDS.length-missingCore.length;
 const invalid=[
  ...(present(tax.ncm)&&!/^\d{8}$/.test(String(tax.ncm).trim())?['ncm']:[]),
  ...(present(tax.cest)&&!/^(?:00|\d{7})$/.test(String(tax.cest).trim())?['cest']:[]),
  ...(present(tax.origin)&&!/^[0-8]$/.test(String(tax.origin).trim())?['origin']:[]),
  ...(present(tax.same_state_cfop)&&!/^5\d{3}$/.test(String(tax.same_state_cfop).trim())?['same_state_cfop']:[]),
  ...(present(tax.diff_state_cfop)&&!/^6\d{3}$/.test(String(tax.diff_state_cfop).trim())?['diff_state_cfop']:[]),
  ...(present(tax.csosn)&&!/^\d{3}$/.test(String(tax.csosn).trim())?['csosn']:[]),
  ...(present(tax.pis_cofins_cst)&&!/^\d{2}$/.test(String(tax.pis_cofins_cst).trim())?['pis_cofins_cst']:[]),
  ...(present(tax.operation_type)&&!/^[12]$/.test(String(tax.operation_type).trim())?['operation_type']:[])
 ];
 const hasAny=[...SHOPEE_FISCAL_REQUIRED_FIELDS,...SHOPEE_FISCAL_OPTIONAL_FIELDS]
  .some(k=>present(tax[k]));
 return {
  status:!hasAny?'empty':missing.length||invalid.length?'partial':'complete',
  missing,missingCore,missingConfigured,invalid,filled,
  required:SHOPEE_FISCAL_REQUIRED_FIELDS.length,
  configured:SHOPEE_FISCAL_OPTIONAL_FIELDS.length
 };
}
// The seller's approved fiscal template may fill ONLY blank Shopee fields.
// Existing tax_info values are authoritative; mismatches need manual review.
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
 if(missingSource.length)throw Error('Ficha fiscal incompleta: '+missingSource.join(', '));
 return {tax:merged,gap,changed:Object.keys(merged)
  .filter(k=>String(merged[k]??'')!==String(old[k]??''))};
}
