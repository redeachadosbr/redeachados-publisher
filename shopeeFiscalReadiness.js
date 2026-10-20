// Fiscal readiness is a seller-declared administrative state for ONE Shopee shop.
// Never infer completed CPF->CNPJ migration from fiscal drafts or send tax_info
// before both explicit acknowledgements. We do not store a CPF or CNPJ here.
const allowed=new Set(['cpf_atual','cnpj_preparacao','cnpj_ativo']);
const text=x=>String(x??'');
const shop=id=>{
 const n=Number(id);
 if(!Number.isSafeInteger(n)||n<=0)throw Error('Shop ID inválido.');
 return n;
};
function config(){
 const url=text(process.env.SUPABASE_URL).trim().replace(/\/$/,'');
 const key=text(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY).trim();
 if(!/^https:\/\//.test(url)||!key)throw Error('Configuração fiscal indisponível no Supabase.');
 return {url,headers:{apikey:key,'Content-Type':'application/json',Accept:'application/json',
  ...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})}};
}
async function fetchRows(query,options={}){
 const {url,headers}=config();
 const resp=await fetch(url+'/rest/v1/shopee_optimizer_fiscal_readiness'+query,{
  ...options,headers:{...headers,...(options.headers||{})},signal:AbortSignal.timeout(15000)
 });
 if(!resp.ok)throw Error('Não foi possível carregar o estado fiscal (HTTP '+resp.status+').');
 if(options.method==='POST')return [];
 return resp.json();
}
export const pendingFiscalReason='Cadastro Shopee em CPF / migração para CNPJ não confirmada. Os dados fiscais ficam preparados, sem envio à Shopee.';
export function fiscalCanPublish(state){
 return state?.mode==='cnpj_ativo'&&
  state?.migrationConfirmed===true&&state?.accountantConfirmed===true;
}
function publicState(row){
 return {mode:row?.mode||'cpf_atual',migrationConfirmed:row?.migration_confirmed===true,
 accountantConfirmed:row?.accountant_confirmed===true,
 fiscalPublishingEnabled:row?.mode==='cnpj_ativo'&&row?.migration_confirmed===true&&row?.accountant_confirmed===true,
 updatedAt:row?.updated_at||null};
}
export async function readShopeeFiscalReadiness(shopId){
 const data=await fetchRows('?shop_id=eq.'+shop(shopId)+'&select=mode,migration_confirmed,accountant_confirmed,updated_at&limit=1');
 return publicState(data[0]);
}
export async function saveShopeeFiscalReadiness(shopId,{mode,migrationConfirmed=false,accountantConfirmed=false}={}){
 const id=shop(shopId),state=text(mode||'').trim();
 if(!allowed.has(state))throw Error('Situação fiscal inválida.');
 const activated=state==='cnpj_ativo';
 // Only active mode can have these flags. No affirmative inference from drafts.
 if(activated&&(migrationConfirmed!==true||accountantConfirmed!==true))
  throw Error('Confirme a migração real para CNPJ na Shopee e a validação fiscal com seu contador antes de ativar o envio.');
 const data={shop_id:id,mode:state,migration_confirmed:activated,
  accountant_confirmed:activated,updated_at:new Date().toISOString()};
 await fetchRows('?on_conflict=shop_id',{method:'POST',
  headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify([data])});
 return readShopeeFiscalReadiness(id);
}
export function fiscalPreviewDisposition({readiness,stage,plan,previousError='',previousPlan=null}={}){
 const allowedToSend=fiscalCanPublish(readiness);
 const previousCestError=/Please upload the corresponding CEST of NCM/i.test(text(previousError));
 const ncm=text(plan?.proposed?.tax_info?.ncm||plan?.original?.tax_info?.ncm||'').trim();
 const lastNcm=text(previousPlan?.proposed?.tax_info?.ncm||previousPlan?.original?.tax_info?.ncm||'').trim();
 const emptyCest=!text(plan?.proposed?.tax_info?.cest||plan?.original?.tax_info?.cest).trim();
 const knownCest=previousCestError&&emptyCest&&ncm&&ncm===lastNcm;
 const issues=[];
 if(!allowedToSend)issues.push(pendingFiscalReason);
 if(knownCest)issues.push('A Shopee já exigiu o CEST para este NCM. Consulte a WeDrop/contabilidade ou abra ticket na Shopee; não use um CEST de outro segmento.');
 return {allowed:allowedToSend&&!knownCest,knownCest:!!knownCest,issues,
  stage,mode:readiness?.mode||'cpf_atual'};
}
