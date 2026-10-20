// Fiscal-only batch orchestration built on the SAME per-SKU durable worker.
// No bulk API write is allowed without an approved, unchanged prepared plan.
export const MAX_SHOPEE_FISCAL_BATCH=12;
export function normalizedShopeeFiscalBatchSkus(raw){
 const arr=Array.isArray(raw)?raw:String(raw||'').split(/[\s,;]+/g);
 const result=[],seen=new Set();
 for(const candidate of arr){
  const sku=String(candidate??'').trim();
  if(!sku)continue;
  if(sku.length>120||/[\x00-\x1f]/.test(sku)||!/^[-\w.]+$/.test(sku))
   throw Error('SKU inválida no lote: '+sku.slice(0,80)+'.');
  const key=sku.toLowerCase();
  if(!seen.has(key)){result.push(sku);seen.add(key);}
 }
 if(result.length===0||result.length>MAX_SHOPEE_FISCAL_BATCH)
  throw Error('Informe de 1 a '+MAX_SHOPEE_FISCAL_BATCH+' SKUs distintas por lote.');
 return result;
}
export function checkedShopeeFiscalBatchEntries(raw){
 if(!Array.isArray(raw)||raw.length===0||raw.length>MAX_SHOPEE_FISCAL_BATCH)
  throw Error('Lote fiscal não possui prévias aprovadas válidas.');
 const ids=new Set(),codes=new Set();
 return raw.map(entry=>{
  const sku=String(entry?.sku||'').trim(),
   itemId=String(entry?.itemId||''),modelId=String(entry?.modelId??'0'),
   planId=String(entry?.planId||''),updatedAt=String(entry?.updatedAt||'');
  if(!sku||sku.length>120||!/^\d{1,18}$/.test(itemId)||!/^\d{1,18}$/.test(modelId)||
   !/^[0-9a-f-]{36}$/i.test(planId)||!updatedAt||!Number.isFinite(Date.parse(updatedAt)))
    throw Error('Prévia do lote inválida ou desatualizada.');
  if(ids.has(itemId)||codes.has(sku.toLowerCase()))
   throw Error('O lote não pode alterar duas vezes o mesmo anúncio-pai ou repetir uma SKU.');
  ids.add(itemId);codes.add(sku.toLowerCase());
  return {sku,itemId,modelId,planId,updatedAt};
 });
}
