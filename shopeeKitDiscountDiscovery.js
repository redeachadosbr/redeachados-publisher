// Leitura somente da Shopee: encontra Minha Promoção do anúncio do kit e do SKU principal.
// Item ID de produto NUNCA é usado como discount_id.
const valid=x=>/^[1-9]\d{0,17}$/.test(String(x||''))&&Number.isSafeInteger(Number(x));
export function pickKitDiscountCandidate(campaigns,{kitItemId,primaryItemIds,complete}={}){
 const candidates=campaigns.filter(c=>valid(c.discountId));
 const primaryIds=(primaryItemIds||[]).map(String);
 const matches=candidates.filter(c=>c.itemIds.includes(String(kitItemId))&&valid(kitItemId));
 if(complete&&matches.length===1)return {discountId:matches[0].discountId,reason:'kit_membership'};
 // O SKU principal também pode participar da mesma Minha Promoção; NÃO confundir item e promoção.
 const primary=candidates.filter(c=>primaryIds.some(id=>c.itemIds.includes(id)));
 if(complete&&primary.length===1)return {discountId:primary[0].discountId,reason:'primary_sku_membership'};
 if(complete&&candidates.length===1)return {discountId:candidates[0].discountId,reason:'only_campaign'};
 return {discountId:null,reason:!complete?'incomplete':'choose'};
}
export async function discoverKitDiscountCampaigns({
 cfg,auth,call,readPages,kitItemId,primaryItemIds=[],maxDetailCampaigns=35
}={}){
 const found=[],warnings=[];let complete=true,successful=0;
 for(const status of ['ongoing','upcoming']){
  for(let page=1;page<=4;page++){
   try{
    const d=await call(cfg,{path:'/api/v2/discount/get_discount_list',method:'POST',
     accessToken:auth.accessToken,shopId:auth.shopId,
     body:{discount_status:status,page_no:String(page),page_size:'100'}});
    const response=d?.response;
    if(!Array.isArray(response?.discount_list)||typeof response.more!=='boolean')
     throw Error('Lista de campanhas não confirmada pela Shopee.');
    successful++;
    for(const c of response.discount_list)if(valid(c.discount_id))
     found.push({discountId:String(c.discount_id),name:String(c.discount_name||'Minha Promoção').slice(0,110),status});
    if(!response.more)break;
    if(page===4){complete=false;warnings.push('Existem mais campanhas que o limite consultado.');}
   }catch(e){complete=false;warnings.push('Consulta '+status+': '+String(e.message||e).slice(0,115));break;}
  }
 }
 if(!successful)throw Error('A Shopee não confirmou as campanhas Minha Promoção. '+warnings.join(' | '));
 const dedup=[...new Map(found.map(c=>[c.discountId,c])).values()];
 if(dedup.length>maxDetailCampaigns){complete=false;warnings.push('Muitas campanhas: consulta parcial.');}
 const campaigns=[];
 for(const c of dedup.slice(0,maxDetailCampaigns)){
  try{
   const d=await readPages(call,{cfg,auth,discountId:c.discountId,maxPages:20});
   const rec=d.record;
   const status=String(rec?.status||c.status).toLowerCase();
   if(!d.complete||!['ongoing','upcoming'].includes(status)||
      Number(rec?.end_time)<=Math.floor(Date.now()/1000))continue;
   const itemIds=[...new Set(d.pages.flatMap(p=>Array.isArray(p.item_list)?p.item_list:[])
    .map(p=>String(p.item_id||'')).filter(valid))];
   campaigns.push({...c,name:String(rec.discount_name||c.name).slice(0,110),
    status,itemIds,containsKit:valid(kitItemId)&&itemIds.includes(String(kitItemId)),
    containsPrimary:(primaryItemIds||[]).some(id=>itemIds.includes(String(id)))});
  }catch(e){complete=false;warnings.push('Campanha '+c.discountId+': '+String(e.message||e).slice(0,95));}
 }
 const suggested=pickKitDiscountCandidate(campaigns,{kitItemId,primaryItemIds,complete});
 return {complete,campaigns:campaigns.map(({itemIds,...c})=>c),suggested,
   discovered:dedup.length,checked:campaigns.length,
   warnings:warnings.slice(0,4),marketplaceUpdated:false};
}
