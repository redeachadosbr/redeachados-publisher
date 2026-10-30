// Vínculo seguro do rascunho de kit WeDrop a um anúncio de KIT já existente.
// Não cria anúncio, não envia mídia e não aprova etapas automaticamente.
const str=x=>String(x??'').trim();
const money=x=>Number(x);
// Falhar com segurança: SKU principal pode ser reutilizada em vários anúncios.
// Antes de preparar/executar, a ficha oficial do Item ID deve comprovar todos os
// produtos do kit. Não usar somente o código SKU nem a confirmação do navegador.
const normalizeKitTitle=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const genericTerms=new Set(['kit','combo','conjunto','com','sem','de','da','do','das','dos',
 'para','em','e','a','o','um','uma','peca','pecas','unidade','unidades','produto',
 'produtos','br','inox','aco','vidro','infantil','bebe','original','premium']);
const singularTerm=t=>t.length>=5&&t.endsWith('s')?t.slice(0,-1):t;
const kitProductAnchor=name=>singularTerm(normalizeKitTitle(name).split(' ').find(t=>
 t.length>=4&&!genericTerms.has(t)&&!/^[0-9]+$/.test(t))||'');
function kitProductSizes(name){
 const found=new Set();
 for(const x of normalizeKitTitle(name).matchAll(/\b(\d{1,4})\s*(ml|cm|litros?)\b/g))
  found.add(x[1]+(x[2].startsWith('litro')?'litro':x[2]));
 return [...found];
}
export function assertKitListingComposition({kit,record}={}){
 const parts=kit?.components||[],itemId=String(record?.itemId||record?.item_id||'');
 const official=normalizeKitTitle((record?.title||record?.item_name||'')+' '+(record?.description||''));
 if(!itemId||!Array.isArray(parts)||parts.length<2||parts.length>3||official.length<12)
  throw Error('Item ID sem ficha oficial suficiente para comprovar o kit. Execução bloqueada.');
 const terms=official.split(' '),compact=official.replace(/\s/g,''),missing=[];
 for(const p of parts){
  const anchor=kitProductAnchor(p.name);
  if(!anchor||!terms.some(t=>singularTerm(t)===anchor)){
   missing.push('SKU '+p.sku+' ('+(anchor||'nome não confirmado')+')');continue;
  }
  for(const size of kitProductSizes(p.name))
   if(!compact.includes(size))missing.push('SKU '+p.sku+' (medida '+size+')');
 }
 if(missing.length)throw Error('BLOQUEIO DE SEGURANÇA: Item ID '+itemId+
  ' não comprova a composição do kit '+String(kit?.kitSku||'')+': '+missing.join('; ')+
  '. Não alterar título, imagens, descrição, preço ou desconto. Confirme na Shopee o Item ID do kit correto ou crie um Kit Formal com ID próprio.');
 return {itemId,kitSku:String(kit.kitSku),componentSkus:parts.map(p=>String(p.sku))};
}
export function validateKitOptimizationTarget({saved,kit,record,targetSku,itemId,modelId,mainSku,confirmedItemId}){
 const parts=Array.isArray(saved?.skus)?saved.skus.map(str):[];
 if(!saved?.kit||!kit||parts.length<2||parts.length>3||
   new Set(parts).size!==parts.length)throw Error('Salve o kit de 2 ou 3 SKUs WeDrop.');
 if(str(saved.kitSku)!==str(kit.kitSku)||
    parts.join('|')!==kit.components.map(x=>str(x.sku)).join('|'))
  throw Error('A composição do kit foi alterada. Reabra e salve novamente.');
 if(!parts.includes(str(mainSku)))throw Error('Selecione um SKU principal real deste kit.');
 if(!/^[1-9]\d{0,17}$/.test(str(itemId))||str(confirmedItemId)!==str(itemId))
  throw Error('Confirme o Item ID do anúncio de kit existente.');
 if(!/^\d{1,18}$/.test(str(modelId)))throw Error('Model ID Shopee inválido.');
 if(!str(targetSku)||str(targetSku).length>120||str(targetSku)!==str(mainSku))
  throw Error('A Shopee deve utilizar SOMENTE a SKU principal selecionada; SKUs complementares são vinculadas na WeDrop.');
 if(str(record?.itemId)!==str(itemId)||str(record?.sku)!==str(targetSku)||
  str(record?.selectedModelId??0)!==str(modelId))
  throw Error('O anúncio, a SKU ou o modelo diverge da auditoria oficial da Shopee.');
 if(!['NORMAL','UNLIST'].includes(str(record?.status).toUpperCase()))
  throw Error('O anúncio selecionado não está em estado editável confirmado.');
 if(!(money(kit.componentCost)>0&&money(kit.kitCost)>=money(kit.componentCost))||
    Math.abs(money(saved.kit.componentCost)-money(kit.componentCost))>.011||
    Math.abs(money(saved.kit.kitCost)-money(kit.kitCost))>.011||
    Math.abs(money(saved.kit.quote?.grossPrice)-money(kit.quote?.grossPrice))>.011)
  throw Error('Custos ou preço WeDrop mudaram. Recalcule e salve o kit antes de preparar.');
 const title=str(saved.creative?.title),description=str(saved.creative?.description);
 if(!title||!description)throw Error('Salve título e descrição antes de otimizar.');
 return {kitSku:str(kit.kitSku),itemId:str(itemId),modelId:str(modelId),
  sku:str(targetSku),mainSku:str(mainSku),componentSkus:parts,
  componentCost:money(kit.componentCost),kitCost:money(kit.kitCost),
  grossPrice:money(kit.quote.grossPrice),promoPrice:money(kit.quote.marketplacePrice),
  title,description,preparedAt:new Date().toISOString()};
}
// O SKU principal identifica a referencia; nunca substitui o custo somado.
export function linkedKitPricingCost({saved,link,live,sku,itemId,modelId}={}){
 if(!kitOptimizationLinkIsCurrent(saved,link))throw Error('Vínculo do kit alterado. Prepare novamente.');
 if(str(link.sku)!==str(sku)||str(link.itemId)!==str(itemId)||str(link.modelId)!==str(modelId))
  throw Error('Anúncio Shopee diferente do kit vinculado.');
 const actual=Array.isArray(live?.components)?live.components.map(p=>str(p.sku)):[];
 if(str(live?.kitSku)!==str(link.kitSku)||actual.join('|')!==link.componentSkus.map(str).join('|')||
    !actual.includes(str(link.mainSku))||!(money(live?.componentCost)>0)||
    Math.abs(money(live.componentCost)-money(link.componentCost))>.011)
  throw Error('Custo ou composição WeDrop mudaram; atualize o kit antes de precificar.');
 return {unitCost:money(live.componentCost),supplierSku:str(link.mainSku),componentSkus:actual,
  kitSku:str(link.kitSku),shipping:money(live.shipping||0),packing:money(live.packing||0),
  kitCost:money(live.kitCost)};
}
export function kitOptimizationLinkIsCurrent(saved,link){
 return Boolean(saved?.optimization&&link&&
  str(saved.kitSku)===str(link.kitSku)&&
  str(saved.optimization.itemId)===str(link.itemId)&&
  str(saved.optimization.modelId)===str(link.modelId)&&
  str(saved.optimization.sku)===str(link.sku)&&
  str(saved.optimization.mainSku)===str(link.mainSku)&&
  str(link.sku)===str(link.mainSku)&&
  Array.isArray(saved.skus)&&saved.skus.map(str).includes(str(link.mainSku))&&
  Array.isArray(link.componentSkus)&&saved.skus.map(str).join('|')===link.componentSkus.map(str).join('|')&&
  str(saved.creative?.title)===str(link.title)&&
  str(saved.creative?.description)===str(link.description)&&
  Number(saved.kit?.kitCost)===Number(link.kitCost)&&
  Number(saved.kit?.quote?.grossPrice)===Number(link.grossPrice));
}
