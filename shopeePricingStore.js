// Supabase persistence scoped only to the authenticated Shopee shop.
// Existing marketplace price fields, seller promos, stock, Mercado Livre and orders are untouched.
import {normalizeShopeePricingSettings} from './shopeePricing.js';
const env=k=>String(process.env[k]||'').trim();
const validShop=id=>{
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1)throw Error('Shop ID Shopee inválido.');
  return n;
};
function config(){
  const url=env('SUPABASE_URL').replace(/\/$/,'');
  const key=env('SUPABASE_SECRET_KEY')||env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)throw Error('Supabase Shopee não configurado.');
  const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
  return {url,key,headers};
}
async function request(table,query,{method='GET',body}={}){
  const c=config();
  const headers={...c.headers};
  if(method==='POST')headers.Prefer='resolution=merge-duplicates,return=minimal';
  const r=await fetch(c.url+'/rest/v1/'+table+query,{method,headers,
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(16000)});
  if(!r.ok)throw Error('Não foi possível acessar a precificação Shopee salva (HTTP '+r.status+').');
  return method==='GET'?await r.json():[];
}
export async function shopeePricingPreferences(shopId){
  const rows=await request('shopee_optimizer_pricing_preferences',
    '?shop_id=eq.'+validShop(shopId)+'&select=settings&limit=1');
  return normalizeShopeePricingSettings(rows[0]?.settings||{});
}
export async function saveShopeePricingPreferences(shopId,settings){
  const validated=normalizeShopeePricingSettings(settings);
  await request('shopee_optimizer_pricing_preferences','?on_conflict=shop_id',{
    method:'POST',body:[{shop_id:validShop(shopId),settings:validated,updated_at:new Date().toISOString()}]});
  return validated;
}
// Busca exata no catálogo WeDrop, independente da existência de anúncio no cache Shopee.
// Não associa anúncio/modelo sem validação nem salva plano de promoção.
export async function shopeePricingDirectSupplierCost(shopId,sku){
  const id=validShop(shopId),code=String(sku??'').trim();
  if(!code||code.length>120||/[\x00-\x1F]/.test(code))throw Error('SKU WeDrop inválida.');
  const rows=await request('shopee_wedrop_costs',
    '?shop_id=eq.'+id+'&supplier_sku=eq.'+encodeURIComponent(code)+
    '&select=supplier_sku,unit_cost,imported_at&limit=2');
  // The imported supplier SKU is authoritative. Only permit a case-insensitive
  // fallback when it identifies exactly one supplier record; never guess a cost
  // from a different SKU, substring, Shopee product or model.
  let matches=rows;
  if(matches.length===0&&/^[a-zA-Z0-9-]+$/.test(code)){
    const candidates=await request('shopee_wedrop_costs',
      '?shop_id=eq.'+id+'&supplier_sku=ilike.'+encodeURIComponent(code)+
      '&select=supplier_sku,unit_cost,imported_at&limit=20');
    matches=candidates.filter(row=>String(row.supplier_sku).toUpperCase()===code.toUpperCase());
  }
  if(matches.length!==1)return null;
  const cost=Number(matches[0].unit_cost);
  if(!Number.isFinite(cost)||cost<=0)return null;
  return {supplierSku:String(matches[0].supplier_sku),unitCost:cost,
    costUpdatedAt:matches[0].imported_at||null};
}

export async function shopeePricingSupplierCost(shopId,{sku,itemId,modelId}){
  const id=validShop(shopId),code=String(sku||'').trim();
  if(!code||code.length>120)throw Error('SKU inválida.');
  // An exact match is authoritative. A manual link is used only when it still
  // names this exact item, model, and current Shopee SKU.
  let supplierSku=code;
  let rows=await request('shopee_wedrop_costs',
    '?shop_id=eq.'+id+'&supplier_sku=eq.'+encodeURIComponent(supplierSku)+
    '&select=supplier_sku,unit_cost,imported_at&limit=2');
  if(rows.length===0){
    const link=await request('shopee_wedrop_sku_links',
      '?shop_id=eq.'+id+'&item_id=eq.'+Number(itemId)+
      '&model_id=eq.'+Number(modelId||0)+'&select=shopee_sku,supplier_sku&limit=2');
    const choice=link.length===1&&String(link[0].shopee_sku)===code
      ?String(link[0].supplier_sku||'').trim():'';
    if(choice){
      supplierSku=choice;
      rows=await request('shopee_wedrop_costs','?shop_id=eq.'+id+
        '&supplier_sku=eq.'+encodeURIComponent(supplierSku)+
        '&select=supplier_sku,unit_cost,imported_at&limit=2');
    }
  }
  if(rows.length!==1||!Number.isFinite(Number(rows[0].unit_cost))||Number(rows[0].unit_cost)<=0)
    throw Error('Custo WeDrop não vinculado à SKU '+code+'. Faça o vínculo na área Fornecedor WeDrop antes de calcular.');
  return {supplierSku,unitCost:Number(rows[0].unit_cost),costUpdatedAt:rows[0].imported_at||null};
}
export async function saveShopeePricePlan(shopId,{itemId,modelId,sku,supplierSku,quote}){
  const id=validShop(shopId);
  await request('shopee_optimizer_price_plans','?on_conflict=shop_id,item_id,model_id',{
    method:'POST',body:[{shop_id:id,item_id:Number(itemId),model_id:Number(modelId||0),
      sku:String(sku),supplier_sku:String(supplierSku),quote,
      updated_at:new Date().toISOString()}]});
}
export async function recentShopeePricePlans(shopId,{limit=20}={}){
  const safeLimit=Math.min(1000,Math.max(1,Math.trunc(Number(limit)||20)));
  const rows=await request('shopee_optimizer_price_plans',
    '?shop_id=eq.'+validShop(shopId)+
    '&select=item_id,model_id,sku,supplier_sku,quote,updated_at&order=updated_at.desc&limit='+safeLimit);
  return rows.map(x=>({itemId:String(x.item_id),modelId:String(x.model_id),
    sku:x.sku,supplierSku:x.supplier_sku,updatedAt:x.updated_at,quote:x.quote}));
}
export async function savedShopeePricePlan(shopId,itemId,modelId=0){
  const rows=await request('shopee_optimizer_price_plans','?shop_id=eq.'+validShop(shopId)+
    '&item_id=eq.'+Number(itemId)+'&model_id=eq.'+Number(modelId)+
    '&select=item_id,model_id,sku,supplier_sku,quote,updated_at&limit=1');
  return rows[0]||null;
}

// Projetos de Ads: exclusivamente cotações salvas por SKU com reserva
// explicitamente marcada. Não representam campanhas ativas ou verba paga.
// Filtro aplicado no banco para não transportar planos sem Ads.
export async function shopeeAdsReservedPricePlans(shopId){
 const id=validShop(shopId),plans=[];
 for(let offset=0;offset<3000;offset+=200){
  const query='?shop_id=eq.'+id+
   '&'+encodeURIComponent('quote->>adsBudgetEnabled')+'=eq.true'+
   '&select=item_id,model_id,sku,supplier_sku,quote,updated_at'+
   '&order=updated_at.desc&limit=200&offset='+offset;
  const page=await request('shopee_optimizer_price_plans',query);
  for(const row of page){
   const q=row.quote||{};
   if(q.adsBudgetEnabled!==true||!Number.isFinite(Number(q.adsBudgetPct))||
     Number(q.adsBudgetPct)<=0||Number(q.adsBudgetPct)>60||
     !Number.isFinite(Number(q.customerPrice))||Number(q.customerPrice)<=0||
     !Number.isFinite(Number(q.breakdown?.ads))||Number(q.breakdown.ads)<=0||
     q.readyForManualReview!==true||q.appliedInShopee!==false)continue;
   plans.push({sku:row.sku,itemId:String(row.item_id),modelId:String(row.model_id),
    supplierSku:row.supplier_sku,adsBudgetPct:Number(q.adsBudgetPct),
    adsReserveAmount:Number(q.breakdown.ads),grossPrice:Number(q.grossPrice),
    customerPrice:Number(q.customerPrice),netProfit:Number(q.netProfit),
    netMarginPct:Number(q.netMarginPct),minMarginPct:Number(q.minMarginPct),
    updatedAt:row.updated_at,appliedInShopee:false});
  }
  if(page.length<200)return {plans,complete:true};
 }
 return {plans,complete:false};
}
