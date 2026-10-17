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
 const storage_path=[num(shopId),num(itemId),num(modelId),crypto.randomUUID()+'.'+dims.extension].join('/');
 await api('/storage/v1/object/'+IMAGE_BUCKET+'/'+storage_path,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:file});
 const data={shop_id:num(shopId),item_id:num(itemId),model_id:num(modelId),sku,slot:position,storage_path,
  filename:String(filename||'imagem').replace(/[\/\\\x00-\x1f\x7f]/g,'_').slice(0,130),mime_type:mime,
  size_bytes:file.length,shopee_image_id:null,sha256:crypto.createHash('sha256').update(file).digest('hex'),updated_at:new Date().toISOString()};
 const r=await api('/rest/v1/shopee_optimizer_images?on_conflict=shop_id,item_id,model_id,slot',{method:'POST',
  headers:{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify([data])});
 return (await r.json())[0];
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
