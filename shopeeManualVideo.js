import crypto from 'node:crypto';

// Importação privada de vídeo de propriedade do lojista — NÃO envia à Shopee.
export const VIDEO_BUCKET='shopee-optimizer-videos';
export const MAX_VIDEO_BYTES=30*1024*1024;
const mimeToExtension={'video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'};
const n=(v,allowZero=false)=>{
 const x=Number(v);
 if(!Number.isSafeInteger(x)||x<(allowZero?0:1))throw Error('Identificador inválido.');
 return x;
};
function config(){
 const url=String(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!/^https:\/\//.test(url)||!key)throw Error('Armazenamento privado da Shopee indisponível.');
 const headers={apikey:key,Accept:'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {url,headers};
}
function validateFile(buffer,mime){
 if(!Buffer.isBuffer(buffer)||buffer.length<16||buffer.length>MAX_VIDEO_BYTES)
   throw Error('Selecione um vídeo entre 16 bytes e 30 MB.');
 if(!(mime in mimeToExtension))throw Error('Formato não aceito. Selecione MP4, MOV ou WebM.');
 const isMp4OrMov=buffer.toString('ascii',4,8)==='ftyp';
 const isWebm=buffer[0]===0x1a&&buffer[1]===0x45&&buffer[2]===0xdf&&buffer[3]===0xa3;
 if(mime==='video/webm'?!isWebm:!isMp4OrMov)throw Error('Conteúdo do arquivo não corresponde ao formato declarado.');
 return mimeToExtension[mime];
}
const safeName=name=>String(name||'video').replace(/[\/\\\x00-\x1f\x7f]/g,'_').slice(0,130)||'video';
function resource(shopId,itemId,modelId){
 return {shopId:n(shopId),itemId:n(itemId),modelId:n(modelId,true)};
}
async function readRows(filter,{method='GET',body}={}){
 const {url,headers}=config();
 const h={...headers};
 if(method!=='GET')h['Content-Type']='application/json';
 if(method==='POST')h.Prefer='resolution=merge-duplicates,return=representation';
 if(method==='PATCH')h.Prefer='return=representation';
 const result=await fetch(url+'/rest/v1/shopee_optimizer_manual_videos'+filter,{
  method,headers:h,...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(20000)
 });
 if(!result.ok)throw Error('Não foi possível salvar/consultar o vídeo privado (HTTP '+result.status+').');
 return result.json();
}
export async function getShopeeManualVideo(shopId,itemId,modelId=0,sku=''){
 const id=resource(shopId,itemId,modelId);
 const filter='?shop_id=eq.'+id.shopId+'&item_id=eq.'+id.itemId+
  '&model_id=eq.'+id.modelId+'&select=sku,filename,mime_type,size_bytes,sha256,status,imported_at,storage_path,publication&limit=1';
 const rows=await readRows(filter);
 const row=rows[0]||null;
 if(row&&String(row.sku)!==String(sku))return null;
 return row;
}
export async function importShopeeManualVideo(shopId,itemId,modelId,sku,file,{mime,filename}={}){
 const id=resource(shopId,itemId,modelId),code=String(sku||'').trim();
 if(!code||code.length>120)throw Error('SKU do anúncio inválida.');
 const ext=validateFile(file,mime),name=safeName(filename);
 const sha256=crypto.createHash('sha256').update(file).digest('hex');
 const storagePath=[id.shopId,id.itemId,id.modelId,crypto.randomUUID()+'.'+ext].join('/');
 const {url,headers}=config();
 const resp=await fetch(url+'/storage/v1/object/'+VIDEO_BUCKET+'/'+storagePath,{
   method:'POST',headers:{...headers,'Content-Type':mime,'x-upsert':'false'},
   body:file,signal:AbortSignal.timeout(90000)
 });
 if(!resp.ok)throw Error('Falha no armazenamento privado do vídeo (HTTP '+resp.status+').');
 const record={shop_id:id.shopId,item_id:id.itemId,model_id:id.modelId,sku:code,
   storage_path:storagePath,filename:name,mime_type:mime,size_bytes:file.length,
   sha256,publication:null,status:'manual_imported',imported_at:new Date().toISOString()};
 const data=await readRows('?on_conflict=shop_id,item_id,model_id',{method:'POST',body:[record]});
 if(!Array.isArray(data)||data.length!==1)throw Error('O arquivo foi recebido, mas o registro da SKU não foi confirmado.');
 return {sku:data[0].sku,filename:data[0].filename,mimeType:data[0].mime_type,
   sizeBytes:data[0].size_bytes,sha256:data[0].sha256,status:data[0].status,
   importedAt:data[0].imported_at,uploadedToShopee:false};
}
export async function signedShopeeManualVideoPreview(shopId,itemId,modelId,sku){
 const saved=await getShopeeManualVideo(shopId,itemId,modelId,sku);
 if(!saved)return null;
 const {url,headers}=config();
 const resp=await fetch(url+'/storage/v1/object/sign/'+VIDEO_BUCKET+'/'+saved.storage_path,{
  method:'POST',headers:{...headers,'Content-Type':'application/json'},
  body:JSON.stringify({expiresIn:600}),signal:AbortSignal.timeout(18000)
 });
 if(!resp.ok)throw Error('Prévia do vídeo não disponível (HTTP '+resp.status+').');
 const body=await resp.json(),relative=String(body.signedURL||body.signedUrl||'');
 if(!relative.startsWith('/object/sign/')&&!relative.startsWith('/storage/v1/object/sign/'))
   throw Error('O armazenamento não retornou uma URL de prévia válida.');
 return url+(relative.startsWith('/storage/v1/')?relative:'/storage/v1'+relative);
}
export function manualVideoPublicInfo(saved){
 if(!saved)return null;
 return {sku:saved.sku,filename:saved.filename,mimeType:saved.mime_type,
   sizeBytes:saved.size_bytes,sha256:saved.sha256,status:saved.status,importedAt:saved.imported_at,
   uploadedToShopee:Boolean(saved.publication?.sha256===saved.sha256),publishedAt:saved.publication?.verifiedAt||null};
}


// Cache curto por objeto imutável + SHA do vídeo revisado. Uma execução
// multipartes não deve baixar TODO o MP4 do Supabase a cada parte de 4 MB.
// Em reinício o cache some e a cópia é baixada/validada de novo.
const verifiedVideoDownloads=new Map(),VIDEO_DOWNLOAD_TTL=12*60*1000;
export function clearVerifiedVideoDownloadCache(){verifiedVideoDownloads.clear();}
function verifiedVideoCacheKey(asset){
 return [asset.storage_path,asset.sha256,asset.size_bytes].join('|');
}
// Only read the immutable object referenced by a server-side approved plan.
export async function downloadShopeeManualVideo(asset){
 if(!asset||!/^\d+\/\d+\/\d+\/[a-f0-9-]+\.(mp4|mov|webm)$/.test(asset.storage_path||''))
  throw Error('Arquivo privado do plano inválido.');
 const key=verifiedVideoCacheKey(asset),hit=verifiedVideoDownloads.get(key);
 if(hit&&Date.now()<hit.expiresAt){return hit.file;}
 if(hit)verifiedVideoDownloads.delete(key);
 const {url,headers}=config();
 const res=await fetch(url+'/storage/v1/object/authenticated/'+VIDEO_BUCKET+'/'+asset.storage_path,
  {headers,signal:AbortSignal.timeout(60000)});
 if(!res.ok)throw Error('Não foi possível recuperar o vídeo aprovado (HTTP '+res.status+').');
 const file=Buffer.from(await res.arrayBuffer());
 if(file.length!==asset.size_bytes||file.length>MAX_VIDEO_BYTES||
   crypto.createHash('sha256').update(file).digest('hex')!==asset.sha256)
  throw Error('O vídeo armazenado difere do arquivo aprovado. Importe novamente.');
 // Não armazenar arquivos maiores do que o limite oficial de importação.
 // Guardar até duas mídias ativas; nenhuma cópia é compartilhada por outra SKU.
 verifiedVideoDownloads.set(key,{file,expiresAt:Date.now()+VIDEO_DOWNLOAD_TTL});
 while(verifiedVideoDownloads.size>2)
  verifiedVideoDownloads.delete(verifiedVideoDownloads.keys().next().value);
 return file;
}
export async function rememberPublishedVideo(plan,result){
 if(!plan.video||!result.video)return;
 const filter='?shop_id=eq.'+n(plan.shopId)+'&item_id=eq.'+n(plan.itemId)+'&model_id=eq.'+n(plan.modelId,true)+
  '&sha256=eq.'+encodeURIComponent(plan.video.sha256);
 await readRows(filter,{method:'PATCH',body:{publication:{sha256:plan.video.sha256,video:result.video,verifiedAt:new Date().toISOString()}}});
}
