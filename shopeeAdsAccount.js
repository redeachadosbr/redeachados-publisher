// Official Shopee Ads V2 account diagnostics. Read only; no private tokens leave Render.
// Credit balance is NOT withdrawable wallet cash and is NOT a recharge transaction list.
const safeBalance=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))||Number(value)<0?
 null:Math.round(Number(value)*100)/100;
const safeTime=value=>{
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<=0)return null;
 const ms=n>1e12?n:n*1000;
 const d=new Date(ms);
 return Number.isFinite(d.getTime())?d.toISOString():null;
};
export function normalizeShopeeAdsAccount(balanceData,toggleData){
 const balance=balanceData?.response;
 const toggle=toggleData?.response;
 const credit=safeBalance(balance?.total_balance);
 const creditTimestamp=safeTime(balance?.data_timestamp);
 const topup=typeof toggle?.auto_top_up==='boolean'?toggle.auto_top_up:null;
 return {
  schema:'ra-ads-account-v1',
  balance:{status:credit!==null&&creditTimestamp?'confirmed':'unavailable',
    amount:credit!==null&&creditTimestamp?credit:null,observedAt:creditTimestamp},
  automaticRecharge:{status:topup!==null?'confirmed':'unavailable',
    enabled:topup,observedAt:safeTime(toggle?.data_timestamp)},
  source:'Shopee Ads V2: get_total_balance / get_shop_toggle_info',
  limitation:'Balance is total Ads credit (paid + free), not merchant cash. Toggle is not proof that any individual SPM_DEDUCT funded Ads.'
 };
}
export async function readShopeeAdsAccount(cfg,auth,callApi){
 const request=path=>callApi(cfg,{path,method:'GET',accessToken:auth.accessToken,shopId:auth.shopId});
 const [balance,toggle]=await Promise.allSettled([
  request('/api/v2/ads/get_total_balance'),
  request('/api/v2/ads/get_shop_toggle_info')
 ]);
 // Each endpoint can lack permission independently. Never report R$0 on failure.
 return normalizeShopeeAdsAccount(balance.status==='fulfilled'?balance.value:null,
   toggle.status==='fulfilled'?toggle.value:null);
}
