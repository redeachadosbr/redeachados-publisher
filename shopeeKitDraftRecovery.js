// Reabrir um rascunho não depende de estoque atualizado.
// Valores antigos servem somente à edição; publicação revalida tudo.
export function validateStoredKitDraft(stored){
 const kit=stored?.kit,skus=stored?.skus;
 if(!kit||!Array.isArray(skus)||skus.length<2||skus.length>3||
    !Array.isArray(kit.components)||kit.components.length!==skus.length||
    String(kit.kitSku)!==String(stored.kitSku)||
    skus.some((sku,index)=>String(kit.components[index]?.sku)!==String(sku))||
    !kit.quote||!Number.isFinite(Number(kit.quote.grossPrice)))
  throw Error('Rascunho incompleto. Consulte os dados salvos antes de continuar.');
 return kit;
}
const shortage=e=>/^(?:Kit bloqueado: SKU |SKU não encontrada com custo WeDrop válido)/.test(String(e?.message||''));
export async function recoverKitDraftForEditing(stored,{shopId,readStock,compose}){
 const savedKit=validateStoredKitDraft(stored);
 const fallback=reason=>({kit:savedKit,refreshedCosts:false,stockRevalidationRequired:true,
  stockReason:String(reason||'Estoque ou catálogo WeDrop precisa ser atualizado.').slice(0,340)});
 let stock;
 try{stock=await readStock(shopId);}
 catch(error){return fallback('Não foi possível conferir o estoque agora: '+error.message);}
 if(!stock?.ready)return fallback(stock?.reason);
 try{
  const kit=await compose(shopId,stored.skus,{
   marginPct:Number(savedKit.quote.targetMarginPct??15),
   packing:Number(savedKit.packing||0),shipping:Number(savedKit.shipping||0)
  });
  return {kit,refreshedCosts:true,stockRevalidationRequired:false,stockReason:''};
 }catch(error){
  if(shortage(error))return fallback(error.message);
  throw error;
 }
}
export function matchesStoredKitPhotos(stored,skus){
 try{
  const kit=validateStoredKitDraft(stored);
  return skus.length===kit.components.length&&skus.every((sku,i)=>String(sku)===String(kit.components[i].sku));
 }catch{return false;}
}
