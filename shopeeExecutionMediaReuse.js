// Safely reuse uploaded MEDIA IDs after a rejected item update. This is not
// proof of publication: images/video become published only after Shopee readback.
const ids=x=>Array.isArray(x)?x:[];
export function recyclableShopeeMedia(oldJob,newPlan){
 if(!oldJob||!newPlan||oldJob.sku!==newPlan.sku||
  String(oldJob.shop_id)!==String(newPlan.shopId)||
  String(oldJob.item_id)!==String(newPlan.itemId)||
  String(oldJob.model_id)!==String(newPlan.modelId)||
  !['failed','verified'].includes(oldJob.state))return null;
 const old=oldJob.plan||{},result=oldJob.result||{};
 const media={imageIds:[],video:null};
 const before=ids(old.images),current=ids(newPlan.images),existing=ids(result.imageIds);
 if(current.length&&current.length===before.length&&existing.length===before.length&&
  current.every((asset,i)=>Number(asset.slot)===Number(before[i].slot)&&
   /^[a-f0-9]{64}$/.test(asset.sha256||'')&&asset.sha256===before[i].sha256&&
   typeof existing[i]==='string'&&existing[i].length>=5)){
   media.imageIds=existing.slice();
 }
 if(newPlan.video&&old.video?.sha256===newPlan.video.sha256&&result.video?.phase==='ready'&&
  typeof result.video.id==='string'&&result.video.id.length>5){
  media.video=result.video;
 }
 return media.imageIds.length||media.video?media:null;
}
