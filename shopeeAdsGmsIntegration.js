// Shopee Ads Open API V2 — integração segura: elegibilidade e prévia, sem escrita publicitária.
// A criação GMS é uma operação com custo potencial e requer um consentimento futuro, separado.
export const ADS_GMS_ELIGIBILITY_PATH='/api/v2/ads/check_create_gms_product_campaign_eligibility';
export const ADS_GMS_CREATE_PATH='/api/v2/ads/create_gms_product_campaign';
const datePattern=/^\d{2}-\d{2}-\d{4}$/;
function parseDate(value){
 if(typeof value!=='string'||!datePattern.test(value))throw Error('Data deve estar em DD-MM-AAAA.');
 const [dd,mm,yyyy]=value.split('-').map(Number);
 const d=new Date(Date.UTC(yyyy,mm-1,dd));
 if(d.getUTCDate()!==dd||d.getUTCMonth()!==mm-1||d.getUTCFullYear()!==yyyy)throw Error('Data inválida.');
 return d;
}
export function prepareGmsDraft(payload,{today=new Date()}={}){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Informe a campanha.');
 const keys=Object.keys(payload);
 if(keys.some(k=>!['daily_budget','start_date','end_date','roas_target','reference_id'].includes(k)))throw Error('Campo de campanha não reconhecido.');
 const budget=Number(payload.daily_budget);
 if(!Number.isFinite(budget)||budget<=0||budget>1000000)throw Error('Orçamento diário inválido.');
 const start=parseDate(payload.start_date);
 const now=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
 if(start<now)throw Error('O início da campanha não pode ser anterior a hoje.');
 const draft={daily_budget:budget,start_date:payload.start_date};
 if(payload.end_date!==undefined&&payload.end_date!==''){
  const end=parseDate(payload.end_date);
  if(end<start)throw Error('Término anterior ao início.');
  draft.end_date=payload.end_date;
 }
 if(payload.roas_target!==undefined&&payload.roas_target!==''){
  const roas=Number(payload.roas_target);
  if(!Number.isFinite(roas)||roas<0||roas>1000)throw Error('ROAS-alvo inválido.');
  draft.roas_target=roas;
 }
 if(payload.reference_id!==undefined&&payload.reference_id!==''){
  if(typeof payload.reference_id!=='string'||payload.reference_id.length>80||!/^[a-zA-Z0-9_-]+$/.test(payload.reference_id))throw Error('Referência inválida.');
  draft.reference_id=payload.reference_id;
 }
 return {campaign:draft,api:ADS_GMS_CREATE_PATH,requiresExplicitApproval:true,
  publicationEnabled:false,warning:'SIMULAÇÃO. Nenhuma campanha foi criada, nenhum orçamento foi comprometido.'};
}
export async function checkGmsEligibility(cfg,auth,callApi){
 const result=await callApi(cfg,{path:ADS_GMS_ELIGIBILITY_PATH,method:'GET',
  accessToken:auth.accessToken,shopId:auth.shopId});
 return {checkedAt:new Date().toISOString(),result:result?.response??null,
  api:ADS_GMS_ELIGIBILITY_PATH,creationEnabled:false};
}
