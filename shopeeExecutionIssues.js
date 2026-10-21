// Shopee Open Platform returns technical errors. Convert only well-known,
// deterministic business rejections into actionable notices; never infer tax codes.
const text=x=>String(x??'').trim();
const cestIssue=/\bCEST\b/i;
const cestRequired=/(corresponding\s+CEST\s+of\s+NCM|CEST.{0,70}(NCM|missing|required|obrigat|ausente|informe)|NCM.{0,70}CEST)/i;
export function detectShopeeExecutionIssue(error,plan={}){
 const raw=text(error);
 if(!raw||!cestIssue.test(raw)||!cestRequired.test(raw))return null;
 const supplied=plan?.finalFiscal||plan?.proposed?.tax_info||plan?.original?.tax_info||{};
 const ncm=text(supplied.ncm).replace(/\D/g,'');
 const currentCest=text(supplied.cest);
 return {
  code:'CEST_REQUIRED',section:'fiscal',field:'cest',
  title:'Shopee exige conferência do CEST',
  source:'Resposta da API Shopee',
  ncm:/^\d{8}$/.test(ncm)?ncm:null,
  suppliedCest:currentCest||null,
  reason:'A Shopee rejeitou a atualização porque não encontrou um CEST correspondente ao NCM informado.',
  action:'Corrigir informações fiscais',
  guidance:'Abra Informações fiscais e confira NCM e CEST na nota fiscal/XML da compra ou com a WeDrop/contabilidade. O CEST depende do enquadramento da mercadoria e da operação. Não copie um código de outro produto nem use 00 sem validação fiscal.',
  retry:'Após corrigir e conferir o cadastro, faça uma nova prévia. O sistema não reenviará automaticamente o anúncio.'
 };
}
// Explicit product.error_busi response with specific mandatory field is not a
// network timeout. Preserve uncertain status for timeouts and unknown failures.
export function isDefinitiveShopeeRejection(error){
 const raw=text(error);
 return Boolean(detectShopeeExecutionIssue(raw))&&/product\.error_busi/i.test(raw);
}
export function needsCestRevalidation(lastError,oldPlan,newPlan){
 if(!detectShopeeExecutionIssue(lastError,oldPlan))return false;
 const former=text(oldPlan?.finalFiscal?.ncm||oldPlan?.proposed?.tax_info?.ncm||oldPlan?.original?.tax_info?.ncm);
 const next=text(newPlan?.finalFiscal?.ncm||newPlan?.proposed?.tax_info?.ncm||newPlan?.original?.tax_info?.ncm);
 const cest=text(newPlan?.finalFiscal?.cest||newPlan?.proposed?.tax_info?.cest||newPlan?.original?.tax_info?.cest);
 return Boolean(former&&former===next&&!cest);
}
