// Safely reuse uploaded MEDIA IDs after a rejected item update. This is not
// proof of publication: images/video become published only after Shopee readback.
const ids=x=>Array.isArray(x)?x:[];
// A fiscal-only preview must not discard image/video media IDs uploaded during
// an earlier rejected content execution for this exact SKU.
export function archiveShopeeMedia(oldJob,newPlan){
 if(!oldJob||!newPlan||oldJob.sku!==newPlan.sku||
  String(oldJob.shop_id)!==String(newPlan.shopId)||
  String(oldJob.item_id)!==String(newPlan.itemId)||
  String(oldJob.model_id)!==String(newPlan.modelId))return null;
 const previous=oldJob.plan||{},result=oldJob.result||{};
 const existing=previous.mediaArchive||null;
 const images=ids(previous.images).map(x=>({slot:x.slot,sha256:x.sha256}));
 const imageIds=ids(result.imageIds).length===images.length&&images.length?
  result.imageIds:ids(previous.reusedMedia?.imageIds);
 const video=previous.video?.sha256&&result.video?.phase==='ready'?
  {sha256:previous.video.sha256,ready:result.video}:
  previous.video?.sha256&&previous.reusedMedia?.video?.phase==='ready'?
  {sha256:previous.video.sha256,ready:previous.reusedMedia.video}:null;
 if(images.length&&imageIds.length===images.length||video)
  return {images,imageIds,video};
 return existing;
}
export function recyclableShopeeMedia(oldJob,newPlan){
 if(!oldJob||!newPlan||oldJob.sku!==newPlan.sku||
  String(oldJob.shop_id)!==String(newPlan.shopId)||
  String(oldJob.item_id)!==String(newPlan.itemId)||
  String(oldJob.model_id)!==String(newPlan.modelId)||
  !['failed','verified','blocked','prepared'].includes(oldJob.state))return null;
 const old=oldJob.plan||{},archived=old.mediaArchive||null,
  effectiveImages=ids(old.images).length?ids(old.images):ids(archived?.images),
  result={
  imageIds:oldJob.result?.imageIds?.length?oldJob.result.imageIds:
   oldJob.plan?.reusedMedia?.imageIds?.length?oldJob.plan.reusedMedia.imageIds:archived?.imageIds||[],
  video:oldJob.result?.video?.phase==='ready'?oldJob.result.video:
   oldJob.plan?.reusedMedia?.video?.phase==='ready'?oldJob.plan.reusedMedia.video:archived?.video?.ready||null
 };
 const media={imageIds:[],video:null};
 const before=effectiveImages,current=ids(newPlan.images),existing=ids(result.imageIds);
 if(current.length&&current.length===before.length&&existing.length===before.length&&
  current.every((asset,i)=>Number(asset.slot)===Number(before[i].slot)&&
   /^[a-f0-9]{64}$/.test(asset.sha256||'')&&asset.sha256===before[i].sha256&&
   typeof existing[i]==='string'&&existing[i].length>=5)){
   media.imageIds=existing.slice();
 }
 if(newPlan.video&&(old.video?.sha256||archived?.video?.sha256)===newPlan.video.sha256&&result.video?.phase==='ready'&&
  typeof result.video.id==='string'&&result.video.id.length>5){
  media.video=result.video;
 }
 return media.imageIds.length||media.video?media:null;
}
