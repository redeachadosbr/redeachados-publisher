// Rede Achados BR — planejamento puro de correção de SKU cadastrada.
// Troca somente a chave interna do cadastro; não altera SKU/Item ID na Shopee.
(()=>{
'use strict';
const skuValue=x=>String(x??'').trim().toUpperCase();
const copyRows=a=>Array.isArray(a)?a:[];
function plan(input){
 const before=skuValue(input.oldSku),after=skuValue(input.newSku);
 if(!before)throw Error('Selecione um produto cadastrado para corrigir a SKU.');
 if(!after)throw Error('Informe a nova SKU.');
 if(after.length>70||!(/^[A-Z0-9][A-Z0-9._/-]*$/).test(after))
  throw Error('SKU inválida: use até 70 caracteres, letras, números, ponto, hífen, barra ou sublinhado, sem espaços.');
 const products=copyRows(input.products);
 const original=products.find(p=>skuValue(p.sku)===before);
 if(!original)throw Error('A SKU original não existe mais no cadastro. Atualize a lista.');
 if(after!==before&&products.some(p=>skuValue(p.sku)===after))
  throw Error('A nova SKU já está cadastrada. Escolha o código correto; não é permitido sobrescrever outro produto.');
 const changed=after!==before;
 const updated=input.editedProduct&&typeof input.editedProduct==='object'?input.editedProduct:original;
 const nextProducts=products.map(p=>skuValue(p.sku)===before?
  {...p,...updated,sku:after,updatedAt:input.at||new Date().toISOString()}:p);
 const updateRecord=x=>x&&skuValue(x.sku)===before?{...x,sku:after}:x;
 const changes=copyRows(input.changes).map(updateRecord);
 const adsSnapshots=copyRows(input.adsSnapshots).map(updateRecord);
 const history=copyRows(input.history).map(row=>{
  if(!row||typeof row!=='object')return row;
  let result=updateRecord(row);
  if(row.data&&typeof row.data==='object'&&skuValue(row.data.sku)===before)
   result={...result,data:{...row.data,sku:after}};
  return result;
 });
 const preferences={...(input.preferences||{})};
 if(changed&&Object.prototype.hasOwnProperty.call(preferences,before)){
  preferences[after]=preferences[before];delete preferences[before];
 }
 const profitKeys={...(input.profitKeys||{})};
 if(changed)for(const k of Object.keys(profitKeys)){
  if(!k.startsWith(before+'|'))continue;
  const target=after+k.slice(before.length);
  profitKeys[target]=profitKeys[k];delete profitKeys[k];
 }
 return {before,after,changed,products:nextProducts,changes,adsSnapshots,history,preferences,profitKeys,
  affected:{changes:changes.filter(x=>x&&skuValue(x.sku)===after).length,
   adsSnapshots:adsSnapshots.filter(x=>x&&skuValue(x.sku)===after).length,
   history:history.filter(x=>x&&(skuValue(x.sku)===after||skuValue(x.data?.sku)===after)).length}};
}
window.RedeAdsSkuRename={plan};
})();
