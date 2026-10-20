// Fiscal information is saved per SKU in the Motor Matriz, independent of
// the seller's CPF/CNPJ registration. Saving a draft is NOT issuing an NF-e,
// and is never itself an authorization to update an advertisement.
// Only an explicit fiscal-only execution can include tax_info. The standard
// 'all' execution keeps tax_info out, preserving future-ready fiscal drafts.
const text=x=>String(x??'').trim();
export function fiscalPreviewDisposition({plan,previousError='',previousPlan=null}={}){
 const previousCestError=/Please upload the corresponding CEST of NCM/i.test(text(previousError));
 const ncm=text(plan?.proposed?.tax_info?.ncm||plan?.original?.tax_info?.ncm);
 const previousNcm=text(previousPlan?.proposed?.tax_info?.ncm||previousPlan?.original?.tax_info?.ncm);
 const cest=text(plan?.proposed?.tax_info?.cest||plan?.original?.tax_info?.cest);
 const knownCest=Boolean(previousCestError&&!cest&&ncm&&ncm===previousNcm);
 const issues=[];
 if(knownCest)issues.push(
  'A Shopee já recusou o envio fiscal sem CEST para este NCM. O cadastro no Motor Matriz permanece salvo. '+
  'Confira o enquadramento com a contabilidade ou solicite esclarecimento à Shopee; não invente um CEST.');
 return {allowed:!knownCest,knownCest,issues};
}
