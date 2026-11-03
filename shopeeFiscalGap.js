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
export function inspectShopeeFiscalGap(raw, reference=null){
 const tax=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 // Com ficha de referência: somente campos que a tabela define são
 // obrigatórios. Campos vazios fora dela NÃO constituem pendência.
 const allFields=[...SHOPEE_FISCAL_REQUIRED_FIELDS,...SHOPEE_FISCAL_OPTIONAL_FIELDS];
 const hasReference=Boolean(reference&&typeof reference==='object'&&!Array.isArray(reference));
 const expected=hasReference?allFields.filter(k=>present(reference[k])):allFields;
 const missingCore=SHOPEE_FISCAL_REQUIRED_FIELDS.filter(k=>expected.includes(k)&&!present(tax[k]));
 const missingConfigured=SHOPEE_FISCAL_OPTIONAL_FIELDS.filter(k=>expected.includes(k)&&!present(tax[k]));
 const missing=[...missingCore,...missingConfigured];
 const filled=SHOPEE_FISCAL_REQUIRED_FIELDS.filter(k=>expected.includes(k)&&present(tax[k])).length;
 const validations={
  ncm:/^\d{8}$/,cest:/^(?:00|\d{7})$/,origin:/^[0-8]$/,
  same_state_cfop:/^5\d{3}$/,diff_state_cfop:/^6\d{3}$/,
  csosn:/^\d{3}$/,pis_cofins_cst:/^\d{2}$/,operation_type:/^[12]$/
 };
 const invalid=expected.filter(k=>present(tax[k])&&validations[k]&&
  !validations[k].test(String(tax[k]).trim()));
 const mismatched=hasReference?expected.filter(k=>present(tax[k])&&
  String(tax[k]).trim()!==String(reference[k]).trim()):[];
 // NCM sempre precisa de classificação específica da SKU; na ausência
 // dessa referência, não declarar o anúncio como verificado.
 const unverified=hasReference&&!present(reference.ncm)?['ncm']:[];
 const hasAny=expected.some(k=>present(tax[k]));
 return {
  status:!hasAny?'empty':missing.length||invalid.length||mismatched.length||unverified.length?'partial':'complete',
  missing,missingCore,missingConfigured,invalid,mismatched,unverified,filled,
  required:SHOPEE_FISCAL_REQUIRED_FIELDS.filter(k=>expected.includes(k)).length,
  configured:SHOPEE_FISCAL_OPTIONAL_FIELDS.filter(k=>expected.includes(k)).length
 };
}
// The seller's approved fiscal template may fill ONLY blank Shopee fields.
// Existing tax_info values are authoritative; mismatches need manual review.
export function fiscalFillMissingOnly(liveTax,approvedTax){
 if(!approvedTax||typeof approvedTax!=='object')throw Error('Ficha fiscal aprovada ausente.');
 const old=liveTax&&typeof liveTax==='object'&&!Array.isArray(liveTax)?liveTax:{};
 const gap=inspectShopeeFiscalGap(old);
 // Do not send a no-op update for invalid live values; replacing those
 // values requires an explicit manual review, not a fill-missing operation.
 if(gap.invalid.length)throw Error('Dados fiscais existentes inválidos; revisar antes do envio: '+gap.invalid.join(', '));
 const merged={...old};
 const missingSource=[];
 for(const key of gap.missing){
  const value=String(approvedTax[key]??'').trim();
  if(!value)missingSource.push(key);
  else merged[key]=value;
 }
 if(missingSource.length)throw Error('Ficha fiscal incompleta: '+missingSource.join(', '));
 const proposed=inspectShopeeFiscalGap(merged);
 if(proposed.invalid.length||proposed.missing.length)
  throw Error('Ficha fiscal com valores ausentes ou inválidos: '+[...proposed.missing,...proposed.invalid].join(', '));
 return {tax:merged,gap,changed:Object.keys(merged)
  .filter(k=>String(merged[k]??'')!==String(old[k]??''))};
}
