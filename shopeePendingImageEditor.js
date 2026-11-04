// Decisão SOMENTE de navegação, nunca publicação: identificar kit pelo vínculo
// salvo do Item ID na loja. O título isolado indica apenas possível kit.
export function classifyPendingImageEditor({itemId,sku='',title='',linkedKits=[]}={}){
 const id=String(itemId||'').trim();
 if(!/^[1-9]\d{0,18}$/.test(id))throw Error('Item ID inválido.');
 const matches=(Array.isArray(linkedKits)?linkedKits:[])
  .filter(k=>k&&String(k.itemId)===id&&/^KIT-[A-Z0-9-]{4,115}$/.test(String(k.kitSku||'')));
 const unique=[...new Map(matches.map(k=>[String(k.kitSku),k])).values()];
 if(unique.length>1)return {kind:'ambiguous',itemId:id,
  kitSkus:unique.map(k=>k.kitSku),
  message:'O anúncio possui vínculos com vários kits. Confira o Item ID e escolha o kit antes de editar.'};
 if(unique.length===1){
  const kit=unique[0],editable=kit.optimized!==true&&kit.publication!=='published';
  return {kind:'kit',itemId:id,kitSku:kit.kitSku,
   mainSku:String(kit.mainSku||''),title:String(kit.title||title||''),
   editable,linkSource:'saved_item_id',
   message:editable?'Kit vinculado ao Item ID na loja. Abrir a etapa de imagens.':
    'Kit vinculado ao Item ID, mas a publicação ou otimização foi finalizada. Conferir sem modificar.'};
 }
 const name=String(title||'').trim(),code=String(sku||'').trim();
 const probable=/^(?:kit|combo)(?:\b|\s*[-:/])/i.test(name)||
  /^KIT-[A-Z0-9-]{4,115}$/i.test(code);
 if(probable)return {kind:'kit-unlinked',itemId:id,sku:code,title:name,
  linkSource:'title_only_unverified',
  message:'O anúncio parece um kit, mas não há vínculo salvo por Item ID. Escolha e vincule o kit no otimizador antes de editar imagens.'};
 return {kind:'single',itemId:id,sku:code,title:name,linkSource:'no_kit_link'};
}
