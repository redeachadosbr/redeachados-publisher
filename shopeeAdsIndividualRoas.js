// Shopee Ads: seleção INDIVIDUAL de produto + GMV Max Meta de ROAS.
// A API create_manual_product_ads nomeia a seleção do produto, NÃO lances CPC manuais.
// bidding_method:"auto" + roas_target>0 = ROAS-alvo. Não enviar selected_keywords.
import crypto from 'node:crypto';
import {verifyManualAdsCandidate,calculateAdsReserve} from './shopeeAdsManualCreate.js';
export const PRODUCT_ROAS_CREATE_PATH='/api/v2/ads/create_manual_product_ads';
const validId=v=>/^[1-9]\d{0,15}$/.test(String(v??''))&&Number.isSafeInteger(Number(v));
const date=value=>{
 if(typeof value!=='string'||!/^\d{2}-\d{2}-\d{4}$/.test(value))
  throw Error('Data deve estar em DD-MM-AAAA.');
 const [d,m,y]=value.split('-').map(Number),day=new Date(Date.UTC(y,m-1,d));
 if(day.getUTCDate()!==d||day.getUTCMonth()!==m-1||day.getUTCFullYear()!==y)throw Error('Data inválida.');
 return day;
};
export function validateIndividualRoasDraft(input,{today=new Date()}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Preencha a campanha individual.');
 const allowed=new Set(['sku','itemId','dailyBudget','roasTarget','reservePct','startDate','endDate','priceConfirmed','productSelection','biddingMethod','strategy']);
 if(Object.keys(input).some(k=>!allowed.has(k)))throw Error('Campo não permitido para GMV Max Meta de ROAS.');
 if(input.productSelection!==undefined&&input.productSelection!=='manual')throw Error('Seleção de produto não é individual.');
 if(input.biddingMethod!==undefined&&input.biddingMethod!=='auto')throw Error('Meta ROAS exige lance automático GMV Max.');
 if(input.strategy!==undefined&&input.strategy!=='GMV Max - Meta de ROAS')throw Error('Estratégia de lance não corresponde à Meta de ROAS.');
 if(!validId(input.itemId))throw Error('Item ID inválido.');
 const sku=String(input.sku||'').trim();
 if(!sku||sku.length>120||/[\x00-\x1f]/.test(sku))throw Error('SKU inválida.');
 const budget=Number(input.dailyBudget),roas=Number(input.roasTarget),reserve=Number(input.reservePct);
 if(!Number.isFinite(budget)||budget<5||budget>300||Math.abs(budget*100-Math.round(budget*100))>1e-6)
  throw Error('Orçamento diário entre R$ 5 e R$ 300 com centavos válidos.');
 if(!Number.isFinite(roas)||roas<=0||roas>100||Math.abs(roas*10-Math.round(roas*10))>1e-6)
  throw Error('Meta de ROAS deve ser positiva, até 100x, com uma casa decimal.');
 if(!Number.isFinite(reserve)||reserve<=0||reserve>40)throw Error('Reserva Ads deve ser entre 0,01% e 40%.');
 const start=date(input.startDate);
 const base=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
 if(start<base)throw Error('Início da campanha não pode ser anterior à data atual.');
 let endDate=null;
 if(input.endDate){
  if(date(input.endDate)<start)throw Error('Data final deve ser igual ou posterior ao início.');
  endDate=input.endDate;
 }
 if(input.priceConfirmed!==true)throw Error('Confirme que preço, desconto e reserva Ads foram publicados na Shopee.');
 return {sku,itemId:Number(input.itemId),dailyBudget:budget,roasTarget:roas,
  reservePct:reserve,startDate:input.startDate,endDate,priceConfirmed:true,
  productSelection:'manual',biddingMethod:'auto',strategy:'GMV Max - Meta de ROAS'};
}
export function individualRoasPayload(draft,referenceId){
 return {path:PRODUCT_ROAS_CREATE_PATH,method:'POST',body:{
  reference_id:referenceId,item_id:draft.itemId,bidding_method:'auto',
  roas_target:draft.roasTarget,budget:draft.dailyBudget,start_date:draft.startDate,
  ...(draft.endDate?{end_date:draft.endDate}:{})
 }};
}
export function individualRoasPreview(input,catalog,plans,{today=new Date()}={}){
 const draft=validateIndividualRoasDraft(input,{today});
 const product=verifyManualAdsCandidate(draft,catalog,plans);
 const reserve=calculateAdsReserve({currentPrice:product.currentPrice,
  currentAdsPct:product.adsBudgetPct,desiredAdsPct:draft.reservePct,netMarginPct:product.netMarginPct});
 const impliedAdsPct=Math.round(10000/draft.roasTarget)/100;
 const coverageGapPct=Math.max(0,Math.round((impliedAdsPct-draft.reservePct)*100)/100);
 return {draft,product,reserve,impliedAdsPct,coverageGapPct,api:PRODUCT_ROAS_CREATE_PATH,
  requiresConfirmation:true,financialRisk:true,
  warning:'Seleção individual GMV Max Meta de ROAS. A equivalência 100/ROAS refere-se ao faturamento atribuído; não é gasto garantido por venda ou margem efetiva. O algoritmo controla os lances, enquanto o orçamento diário gera gasto real. Impulsão Rápida e Proteção ROAS não são configuradas neste endpoint.'};
}
const sign=(body,key)=>crypto.createHmac('sha256',key).update(body).digest('base64url');
export function individualRoasToken(payload,secret){
 if(typeof secret!=='string'||secret.length<32)throw Error('Segredo de aprovação não configurado.');
 const raw=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return raw+'.'+sign(raw,secret);
}
export function decodeIndividualRoasToken(token,secret,{shopId,now=Date.now()}={}){
 if(typeof secret!=='string'||secret.length<32)throw Error('Segredo de aprovação não configurado.');
 const [body,mac,...extra]=String(token||'').split('.');
 if(!body||!mac||extra.length||body.length>8000||mac.length>100)throw Error('Prévia de campanha inválida.');
 const current=sign(body,secret),a=Buffer.from(current),b=Buffer.from(mac);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error('Assinatura de aprovação inválida.');
 let value;try{value=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw Error('Prévia ilegível.');}
 if(String(value?.shopId)!==String(shopId)||typeof value?.nonce!=='string'||value.nonce.length<18||
  !Number.isFinite(value.at)||value.at>now+30000||now-value.at>300000)
  throw Error('Prévia expirada ou pertencente a outra loja.');
 return {...value,draft:validateIndividualRoasDraft(value.draft,{today:new Date(value.at)})};
}
