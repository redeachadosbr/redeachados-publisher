// Fiscal information is saved per SKU in the Motor Matriz, independent of
// the seller's CPF/CNPJ registration. Saving a draft is NOT issuing an NF-e,
// and is never itself an authorization to update an advertisement.
// O fluxo fiscal individual e a etapa final de "todas as etapas" são explicitamente autorizados.
// Salvar rascunho não publica. "00" pode ser tentado literalmente por decisão do vendedor;
// a Shopee pode recusar esse valor e sua aceitação precisa ser comprovada por leitura da API.
const text=x=>String(x??'').trim();
export function fiscalPreviewDisposition({plan,previousError='',previousPlan=null}={}){
 const previousCestError=/Please upload the corresponding CEST of NCM/i.test(text(previousError));
 const ncm=text(plan?.finalFiscal?.ncm||plan?.proposed?.tax_info?.ncm||plan?.original?.tax_info?.ncm);
 const previousNcm=text(previousPlan?.finalFiscal?.ncm||previousPlan?.proposed?.tax_info?.ncm||previousPlan?.original?.tax_info?.ncm);
 const cest=text(plan?.finalFiscal?.cest||plan?.proposed?.tax_info?.cest||plan?.original?.tax_info?.cest);
 const oldCest=text(previousPlan?.finalFiscal?.cest||previousPlan?.proposed?.tax_info?.cest);
 // Se a Shopee já rejeitou o MESMO CEST para o MESMO NCM, não permitir repetição automática.
 // Antes, ausência de CEST podia bloquear até o valor "00" nunca enviado anteriormente.
 const sameRejected=previousCestError&&ncm&&ncm===previousNcm;
 const knownCest=Boolean(sameRejected&&(!cest||(cest==='00'&&oldCest==='00')));
 const issues=[];
 if(knownCest)issues.push(
  'A Shopee já recusou a mesma combinação CEST/NCM. O cadastro no Motor Matriz permanece salvo. '+
  'Confira o enquadramento com a contabilidade ou solicite esclarecimento à Shopee; não invente um CEST.');
 return {allowed:!knownCest,knownCest,issues};
}
