// Fila persistente de otimização de imagens, isolada por loja.
// O Supabase só é acessado no backend com chave de serviço; o navegador nunca
// recebe credenciais. Aprovação 9/9 vem EXCLUSIVAMENTE da leitura oficial Shopee.
const TABLE='shopee_pending_image_audits';
const MAX_ROWS=25000;
const categorySet=new Set(['active_with_stock','active_no_stock','inactive','unverified']);
const numeric=id=>{const n=Number(id);if(!Number.isSafeInteger(n)||n<=0)throw Error('Shop ID inválido.');return n;};
const idString=id=>{
 const s=String(id||'').trim();
 if(!/^[1-9]\d{0,17}$/.test(s))throw Error('Item ID inválido.');
 return s;
};
function config(){
 const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!url||!key)throw Error('Supabase da loja não configurado para salvar a fila de otimização.');
 const headers={apikey:key,Accept:'application/json','Content-Type':'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 return {url,headers};
}
async function request(query,{method='GET',data,prefer=''}={}){
 const c=config();
 const resp=await fetch(c.url+'/rest/v1/'+TABLE+query,{
  method,headers:{...c.headers,...(prefer?{Prefer:prefer}:{})},
  ...(data!==undefined?{body:JSON.stringify(data)}:{}),
  signal:AbortSignal.timeout(20000)
 });
 if(!resp.ok){
  const body=await resp.text().catch(()=>String(resp.status));
  throw Error('Fila de otimização não salva (HTTP '+resp.status+'): '+body.slice(0,140));
 }
 const text=await resp.text();
 return text?JSON.parse(text):[];
}
const query=shopId=>'?shop_id=eq.'+numeric(shopId);
export async function getPendingImageSnapshot(shopId){
 const rows=await request(query(shopId)+
  '&select=shop_id,scanned_at,scanned_listings,total_listings,rows,optimized,updated_at&limit=1');
 return rows[0]||null;
}
function validateSnapshot(input){
 const scannedListings=Number(input?.scannedListings);
 const totalListings=Number(input?.totalListings);
 const rows=input?.rows;
 if(!Number.isSafeInteger(scannedListings)||scannedListings<0||
    !Number.isSafeInteger(totalListings)||totalListings<0||
    scannedListings!==totalListings||totalListings>100000)
  throw Error('A conferência dos anúncios não terminou; o resultado parcial não foi salvo.');
 if(!Array.isArray(rows)||rows.length>MAX_ROWS)
  throw Error('A lista de SKUs ultrapassa o limite permitido.');
 const seen=new Set();
 const clean=rows.map(row=>{
  const itemId=idString(row?.itemId);
  const modelId=String(row?.modelId??'0');
  if(!/^\d{1,18}$/.test(modelId)||!categorySet.has(row?.category)||
     !['NORMAL','UNLIST','REVIEWING','BANNED'].includes(row?.listingStatus))
   throw Error('Registro de anúncio inválido: '+itemId);
  const key=itemId+':'+modelId;
  if(seen.has(key))throw Error('SKU/modelo duplicado na varredura: '+key);
  seen.add(key);
  const imageCount=row.imageCount===null?null:Number(row.imageCount);
  if(imageCount!==null&&(!Number.isSafeInteger(imageCount)||imageCount<0||imageCount>=9))
   throw Error('Somente anúncios com menos de 9 imagens pertencem à fila.');
  const stock=row.stock===null?null:Number(row.stock);
  if(stock!==null&&(!Number.isSafeInteger(stock)||stock<0))
   throw Error('Estoque sem validação na SKU '+String(row.sku||''));
  if(row.category==='active_with_stock'&&
     (row.listingStatus!=='NORMAL'||!(stock>0)||imageCount===null||!row.sku))
   throw Error('SKU de prioridade sem estoque e imagens confirmados.');
  const checkedAt=String(row.checkedAt||'');
  if(!Number.isFinite(Date.parse(checkedAt)))throw Error('Falta a data da leitura Shopee.');
  return {key,itemId,modelId,sku:String(row.sku||'').slice(0,150),
   title:String(row.title||'').slice(0,300),listingStatus:row.listingStatus,
   modelStatus:String(row.modelStatus||'').slice(0,55),
   stock,imageCount,missingImages:imageCount===null?null:Math.max(0,9-imageCount),
   imageUrl:/^https:\/\//i.test(String(row.imageUrl||''))?String(row.imageUrl).slice(0,600):'',
   category:row.category,reason:String(row.reason||'').slice(0,250),checkedAt};
 });
 return {rows:clean,scannedListings,totalListings};
}
function carryForward(previous,rows){
 const optimized={...(previous?.optimized||{})};
 for(const row of rows){
  const old=optimized[row.itemId];
  if(old&&row.imageCount!==null&&row.imageCount<9&&
    Date.parse(row.checkedAt)>Date.parse(old.verifiedAt||''))delete optimized[row.itemId];
 }
 return optimized;
}
export async function savePendingImageSnapshot(shopId,input){
 const validated=validateSnapshot(input);
 const scannedAt=new Date().toISOString();
 const id=numeric(shopId);
 for(let attempt=0;attempt<3;attempt++){
  const previous=await getPendingImageSnapshot(id);
  const data={shop_id:id,scanned_at:scannedAt,
   scanned_listings:validated.scannedListings,total_listings:validated.totalListings,
   rows:validated.rows,optimized:carryForward(previous,validated.rows),
   updated_at:new Date().toISOString()};
  const result=previous?
   await request(query(id)+'&updated_at=eq.'+
     encodeURIComponent(previous.updated_at)+'&select=*',{
     method:'PATCH',data,prefer:'return=representation'}):
   await request('?on_conflict=shop_id&select=*',{
    method:'POST',data:[data],prefer:'resolution=ignore-duplicates,return=representation'});
  if(result?.length===1)return result[0];
 }
 throw Error('Outra aba atualizou o relatório durante a gravação; recarregue a fila.');
}
export async function reconcilePendingImageVerification(shopId,readback){
 const id=numeric(shopId),itemId=idString(readback?.itemId);
 // Somente o backend deve fornecer o resultado obtido diretamente na Shopee.
 if(!['confirmed','pending','unverified'].includes(readback?.status))
  throw Error('Confirmação Shopee inválida.');
 for(let attempt=0;attempt<3;attempt++){
  const prev=await getPendingImageSnapshot(id);
  if(!prev)return {persisted:false,optimized:false,reason:'Nenhuma varredura salva ainda.'};
  const matching=(prev.rows||[]).filter(x=>x.itemId===itemId);
  const optimized={...(prev.optimized||{})};
  if(readback.status==='confirmed'&&readback.complete===true&&
      readback.imageCount>=9){
   const priority=matching.filter(x=>x.category==='active_with_stock');
   const skus=[...new Set(priority.map(x=>x.sku).filter(Boolean))];
   if(skus.length||optimized[itemId]){
    optimized[itemId]={itemId,skus:skus.length?skus:optimized[itemId].skus,
     verifiedAt:readback.verifiedAt,imageCount:readback.imageCount};
   }
  }else if(readback.status==='pending'&&readback.imageCount<9){
   // 9/9 que depois ficou incompleto volta a ser pendência.
   delete optimized[itemId];
  }else return {persisted:true,optimized:Boolean(optimized[itemId]),snapshot:prev};
  const updatedAt=new Date().toISOString();
  const result=await request(query(id)+'&updated_at=eq.'+
   encodeURIComponent(prev.updated_at)+'&select=*',{
   method:'PATCH',data:{optimized,updated_at:updatedAt},prefer:'return=representation'});
  if(result?.length===1)return {persisted:true,optimized:Boolean(optimized[itemId]),
   snapshot:result[0]};
 }
 throw Error('A fila foi atualizada em outra aba; repita somente a conferência.');
}
