// Criar campanhas de SELEÇÃO MANUAL de produtos, com CPC por palavra-chave.
// ROAS no painel é referência financeira. O endpoint manual NÃO recebe roas_target.
import crypto from 'node:crypto';
export const MANUAL_CREATE_PATH='/api/v2/ads/create_manual_product_ads';
const validId=v=>/^\d{1,16}$/.test(String(v??''))&&Number.isSafeInteger(Number(v))&&Number(v)>0;
const round=(v,d=2)=>Math.round(v*10**d)/10**d;
const validDate=value=>{
 if(typeof value!=='string'||!/^\d{2}-\d{2}-\d{4}$/.test(value))throw Error('Data de campanha deve ser DD-MM-AAAA.');
 const [d,m,y]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCDate()!==d||date.getUTCMonth()!==m-1||date.getUTCFullYear()!==y)throw Error('Data de campanha inválida.');
 return date;
};
export function calculateAdsReserve({currentPrice,currentAdsPct=0,desiredAdsPct=0,minimumMarginPct=5,netMarginPct}){
 const price=Number(currentPrice),current=Number(currentAdsPct),desired=Number(desiredAdsPct),margin=Number(netMarginPct);
 if(!Number.isFinite(price)||price<=0||price>100000)throw Error('Preço final não confirmado.');
 if(![current,desired,margin].every(Number.isFinite)||current<0||current>60||desired<=0||desired>40)throw Error('Percentual Ads inválido.');
 const min=Number(minimumMarginPct);
 if(!Number.isFinite(min)||min<0||min>70)throw Error('Margem mínima inválida.');
 // Projeção grosseira de equilíbrio: acréscimo percentual sobre faturamento, NÃO taxa fixa de ROAS.
 // O cálculo fiscal/comissões/desconto por faixa deve ser refeito no motor de Precificação.
 const extra=Math.max(0,desired-current);
 const approximateFloor=round(price/(1-extra/100));
 return {currentAdsPct:current,desiredAdsPct:desired,additionalReservePct:round(extra),
  reservedPerSale:round(price*desired/100),additionalReservePerSale:round(price*extra/100),
  approximatePriceFloor:approximateFloor,netMarginPct:margin,
  minimumMarginPct:min,needsRepricing:extra>0,
  warning:'Estimativa, NÃO é novo preço autorizado. Recalcule no motor Shopee para incluir comissão, cupom, frete, impostos, desconto e margem. Nenhuma promoção será alterada automaticamente.'};
}
export function validateManualAdsDraft(input,{today=new Date()}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Campanha inválida.');
 const keys=['sku','itemId','dailyBudget','startDate','endDate','keywords','reservePct','roasReference','priceConfirmed'];
 if(Object.keys(input).some(k=>!keys.includes(k)))throw Error('Campo não reconhecido na campanha.');
 if(!validId(input.itemId))throw Error('Item ID Shopee inválido.');
 const sku=String(input.sku||'').trim();
 if(!sku||sku.length>120||/[\x00-\x1f]/.test(sku))throw Error('SKU inválida.');
 const dailyBudget=Number(input.dailyBudget);
 if(!Number.isFinite(dailyBudget)||dailyBudget<5||dailyBudget>300||Math.abs(dailyBudget*100-Math.round(dailyBudget*100))>1e-6)
  throw Error('Orçamento diário deve estar entre R$ 5,00 e R$ 300,00.');
 const start=validDate(input.startDate),now=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
 if(start<now)throw Error('Data inicial anterior a hoje.');
 let endDate=null;
 if(input.endDate){const end=validDate(input.endDate);if(end<start)throw Error('Data final anterior ao início.');endDate=input.endDate;}
 const reservePct=Number(input.reservePct),roasReference=Number(input.roasReference);
 if(!Number.isFinite(reservePct)||reservePct<=0||reservePct>40)throw Error('Reserva de Ads deve ficar entre 0,01% e 40%.');
 if(!Number.isFinite(roasReference)||roasReference<1||roasReference>100)throw Error('ROAS de referência inválido.');
 if(!Array.isArray(input.keywords)||input.keywords.length<1||input.keywords.length>20)throw Error('Informe de 1 a 20 palavras-chave e seus lances CPC manuais.');
 const used=new Set();
 const keywords=input.keywords.map(entry=>{
  const keyword=String(entry.keyword||'').trim(),matchType=String(entry.matchType||'exact');
  const bid=Number(entry.bid);
  if(!keyword||keyword.length>80||/[\x00-\x1f]/.test(keyword))throw Error('Palavra-chave inválida.');
  if(!['exact','broad'].includes(matchType))throw Error('Correspondência de palavra-chave inválida.');
  if(!Number.isFinite(bid)||bid<.01||bid>100||Math.abs(bid*100-Math.round(bid*100))>1e-6)throw Error('Lance CPC deve estar entre R$ 0,01 e R$ 100,00.');
  const identity=keyword.toLocaleLowerCase('pt-BR')+'|'+matchType;
  if(used.has(identity))throw Error('Palavras-chave duplicadas.');used.add(identity);
  return {keyword,match_type:matchType,bid_price_per_click:bid};
 });
 if(input.priceConfirmed!==true)throw Error('Confirme que o preço e desconto com reserva Ads já foram publicados na Shopee.');
 return {sku,itemId:Number(input.itemId),dailyBudget,startDate:input.startDate,
  endDate,keywords,reservePct,roasReference,priceConfirmed:true,
  biddingMethod:'manual'};
}
export function verifyManualAdsCandidate(draft,catalog,plans){
 const item=(catalog||[]).find(c=>String(c.itemId)===String(draft.itemId)&&String(c.sku)===draft.sku);
 if(!item||!['NORMAL','ACTIVE'].includes(String(item.status||'').toUpperCase())||Number(item.stock)<=0)
  throw Error('O produto não está ativo, não tem estoque ou não corresponde à SKU Shopee.');
 const p=(plans||[]).find(x=>String(x.itemId)===String(draft.itemId)&&String(x.sku)===draft.sku);
 const q=p?.quote||{};
 if(!p||q.adsBudgetEnabled!==true||Number(q.adsBudgetPct)<draft.reservePct-.001)
  throw Error('Reserva Ads insuficiente no plano de Precificação. Configure e salve a margem antes de criar.');
 if(Number(q.netMarginPct)<5||Number(q.netProfit)<=0||Number(q.customerPrice)<=0)
  throw Error('Preço ou lucro líquido estimado insuficiente para criar Ads.');
 if(!Number.isFinite(Date.parse(p.updatedAt))||Date.now()-Date.parse(p.updatedAt)>14*86400000)
  throw Error('Plano Ads desatualizado. Recalcule a precificação.');
 return {itemId:draft.itemId,sku:draft.sku,title:item.title,imageUrl:item.imageUrl||'',
  currentPrice:Number(q.customerPrice),netMarginPct:Number(q.netMarginPct),
  adsBudgetPct:Number(q.adsBudgetPct),pricePlanUpdatedAt:p.updatedAt};
}
export function manualAdsPayload(draft,referenceId){
 return {path:MANUAL_CREATE_PATH,method:'POST',body:{
  bidding_method:'manual',item_id:draft.itemId,budget:draft.dailyBudget,
  start_date:draft.startDate,...(draft.endDate?{end_date:draft.endDate}:{}),
  selected_keywords:draft.keywords,enhanced_cpc:false,reference_id:referenceId
  // roas_target é propositalmente AUSENTE do modo manual.
 }};
}
export function manualAdsPreview(input,catalog,plans,{today=new Date()}={}){
 const draft=validateManualAdsDraft(input,{today});
 const product=verifyManualAdsCandidate(draft,catalog,plans);
 const reserve=calculateAdsReserve({currentPrice:product.currentPrice,currentAdsPct:product.adsBudgetPct,
  desiredAdsPct:draft.reservePct,netMarginPct:product.netMarginPct});
 return {draft,product,reserve,api:MANUAL_CREATE_PATH,requiresConfirmation:true,
  financialRisk:true,warning:'A criação real ativará uma campanha e poderá consumir o orçamento diário. ROAS exibido é referência de acompanhamento, não alvo automático enviado à Shopee.'};
}
export function manualAdsToken(payload,secret){
 if(typeof secret!=='string'||secret.length<32)throw Error('Segredo de aprovação Ads insuficiente.');
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const mac=crypto.createHmac('sha256',secret).update(body).digest('base64url');
 return body+'.'+mac;
}
export function decodeManualAdsToken(token,secret,{shopId,now=Date.now()}={}){
 const [body,mac,...extra]=String(token||'').split('.');
 if(!body||!mac||extra.length||body.length>9000||mac.length>100)throw Error('Prévia inválida.');
 const actual=crypto.createHmac('sha256',secret).update(body).digest('base64url');
 const a=Buffer.from(mac),b=Buffer.from(actual);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error('Assinatura inválida.');
 let signed;try{signed=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw Error('Prévia inválida.');}
 if(String(signed.shopId)!==String(shopId)||!signed.nonce||signed.nonce.length<18||
  !Number.isFinite(signed.at)||signed.at>now+30000||now-signed.at>5*60000)
  throw Error('A aprovação expirou ou pertence a outra loja.');
 const draft=validateManualAdsDraft(signed.draft,{today:new Date(signed.at)});
 return {...signed,draft};
}
