import crypto from 'node:crypto';
export const IMAGE_BUCKET='shopee-optimizer-images';
export const MAX_IMAGE_BYTES=10*1024*1024;
function config(){
 const url=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!/^https:\/\//.test(url)||!key)throw Error('Armazenamento de imagens indisponível.');
 const headers={apikey:key,Accept:'application/json'};
 if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
 return {url,headers};
}
const num=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Identificador inválido.');return n};
const where=(shop,item,model)=>'?shop_id=eq.'+num(shop)+'&item_id=eq.'+num(item)+'&model_id=eq.'+num(model);
async function api(path,options={}){
 const c=config();const res=await fetch(c.url+path,{...options,headers:{...c.headers,...options.headers},signal:AbortSignal.timeout(60000)});
 if(!res.ok)throw Error('Armazenamento de imagens retornou HTTP '+res.status+'.');
 return res;
}
export function imageDimensions(b,mime){
 if(!Buffer.isBuffer(b)||b.length<24||b.length>MAX_IMAGE_BYTES)throw Error('Imagem deve ter até 10 MB.');
 if(mime==='image/png'&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
  return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),extension:'png'};
 if(mime==='image/jpeg'&&b[0]===255&&b[1]===216){
  let i=2;
  while(i+8<b.length){
   if(b[i]!==255)break;
   while(b[i]===255)i++;
   const marker=b[i++];if(marker===217||marker===218)break;
   const length=b.readUInt16BE(i);if(length<2||i+length>b.length)break;
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))
    return {width:b.readUInt16BE(i+5),height:b.readUInt16BE(i+3),extension:'jpg'};
   i+=length;
  }
 }
 throw Error('Arquivo não é uma imagem JPG ou PNG válida.');
}
export async function readPreparedImages(shop,item,model,sku,{preview=false}={}){
 const r=await api('/rest/v1/shopee_optimizer_images'+where(shop,item,model)+'&select=*&order=slot.asc');
 const images=(await r.json()).filter(x=>x.sku===sku);
 if(preview){
  for(const row of images){
   const r=await api('/storage/v1/object/sign/'+IMAGE_BUCKET+'/'+row.storage_path,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:600})});
   const j=await r.json(),relative=String(j.signedURL||j.signedUrl||'');
   if(!relative.startsWith('/object/sign/'))throw Error('Prévia de imagem inválida.');
   row.previewUrl=config().url+'/storage/v1'+relative;
  }
 }
 return images;
}
export async function importPreparedImage({shopId,itemId,modelId,sku,slot,file,mime,filename}){
 const position=num(slot);if(position<1||position>9)throw Error('Posição de imagem deve ser de 1 a 9.');
 const dims=imageDimensions(file,mime);
 if(dims.width!==1200||dims.height!==1200)throw Error('Use imagem de 1200 × 1200 pixels conforme o padrão da loja.');
 const sha256=crypto.createHash('sha256').update(file).digest('hex');
 // A lost response may cause the bridge to resend the same file. Reuse the
 // confirmed slot instead of uploading another object or clearing publication state.
 const rows=await readPreparedImages(shopId,itemId,modelId,sku);
 const existing=rows.find(row=>Number(row.slot)===position&&row.sha256===sha256);
 if(existing)return existing;
 const duplicate=rows.find(row=>Number(row.slot)!==position&&row.sha256===sha256);
 if(duplicate)throw Error('A foto é idêntica à imagem '+String(duplicate.slot).padStart(2,'0')+
  '. Escolha uma imagem diferente para a posição '+String(position).padStart(2,'0')+'.');
 const storage_path=[num(shopId),num(itemId),num(modelId),crypto.randomUUID()+'.'+dims.extension].join('/');
 await api('/storage/v1/object/'+IMAGE_BUCKET+'/'+storage_path,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:file});
 const data={shop_id:num(shopId),item_id:num(itemId),model_id:num(modelId),sku,slot:position,storage_path,
  filename:String(filename||'imagem').replace(/[\/\\\x00-\x1f\x7f]/g,'_').slice(0,130),mime_type:mime,
  size_bytes:file.length,shopee_image_id:null,sha256,updated_at:new Date().toISOString()};
 const r=await api('/rest/v1/shopee_optimizer_images?on_conflict=shop_id,item_id,model_id,slot',{method:'POST',
  headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([data])});
 return (await r.json())[0];
}
// Altera a ordem da galeria privada em uma transação. Não publica na Shopee.
export async function reorderPreparedImage(shop,item,model,sku,fromSlot,toSlot,fromSha256,toSha256=null){
 const from=num(fromSlot),to=num(toSlot);
 if(from<1||from>9||to<1||to>9||from===to)throw Error('Escolha outra posição entre 1 e 9.');
 if(!/^[a-f0-9]{64}$/.test(String(fromSha256||''))||
    (toSha256!==null&&!/^[a-f0-9]{64}$/.test(String(toSha256))))
  throw Error('Atualize a galeria antes de mover a imagem.');
 const r=await api('/rest/v1/rpc/swap_shopee_optimizer_images',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
   p_shop_id:num(shop),p_item_id:num(item),p_model_id:num(model),p_sku:String(sku),
   p_from_slot:from,p_to_slot:to,p_from_sha256:fromSha256,p_to_sha256:toSha256
  })
 });
 return r.json();
}
// Remove somente o arquivo preparado na galeria privada; nunca toca nas imagens publicadas na Shopee.
export async function deletePreparedImage(shop,item,model,sku,slot){
 const position=num(slot);
 if(position<1||position>9)throw Error('Posição inválida: escolha de 1 a 9.');
 const rows=await readPreparedImages(shop,item,model,sku);
 const current=rows.find(x=>Number(x.slot)===position);
 if(!current)return {deleted:false,slot:position,marketplaceUpdated:false};
 // Constrain DELETE to the exact version; a concurrent replacement must not be removed.
 const identity=where(shop,item,model)+'&slot=eq.'+position+
  '&sku=eq.'+encodeURIComponent(String(sku))+'&sha256=eq.'+encodeURIComponent(current.sha256);
 const removed=await api('/rest/v1/shopee_optimizer_images'+identity,{
  method:'DELETE',headers:{Prefer:'return=representation'}
 });
 const deleted=await removed.json();
 if(!Array.isArray(deleted)||deleted.length!==1)
  throw Error('A imagem foi alterada durante a exclusão. Atualize a galeria antes de tentar novamente.');
 // Metadata is authoritative. If storage cleanup fails, the orphan is private
 // and must never be reused: its database record was already invalidated.
 try{
  await api('/storage/v1/object/'+IMAGE_BUCKET+'/'+current.storage_path,{method:'DELETE'});
 }catch(e){
  console.warn('[optimizer-images] A limpeza privada ficou pendente após excluir um slot.',String(e.message||e).slice(0,140));
 }
 return {deleted:true,slot:position,marketplaceUpdated:false};
}
export async function downloadPreparedImage(asset){
 if(!/^\d+\/\d+\/\d+\/[a-f0-9-]+\.(jpg|png)$/.test(asset?.storage_path||''))throw Error('Imagem aprovada inválida.');
 const r=await api('/storage/v1/object/authenticated/'+IMAGE_BUCKET+'/'+asset.storage_path);
 const file=Buffer.from(await r.arrayBuffer());
 if(file.length!==asset.size_bytes||file.length>MAX_IMAGE_BYTES||crypto.createHash('sha256').update(file).digest('hex')!==asset.sha256)
  throw Error('A imagem armazenada difere da imagem aprovada.');
 return file;
}
export const imagesSignature=images=>images.map(x=>x.slot+':'+x.sha256).join('|');
export async function rememberPublishedImages(plan,result){
 for(const [index,asset] of (plan.images||[]).entries()){
  const id=result.imageIds?.[index];if(!id)continue;
  await api('/rest/v1/shopee_optimizer_images'+where(plan.shopId,plan.itemId,plan.modelId)+
   '&slot=eq.'+num(asset.slot)+'&sha256=eq.'+encodeURIComponent(asset.sha256),{method:'PATCH',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({shopee_image_id:id})});
 }
}
