// Regras permanentes do Motor Matriz Shopee: independentes de produto, SKU e categoria.
// Sugestões WeDrop nunca autorizam publicações ou mudanças fiscais automaticamente.
// Motor Matriz: regras fixas da descrição para todas as SKUs.
export const REDE_ACHADOS_DESCRIPTION_RULES=Object.freeze({
 minChars:1400,maxChars:1440,cta:'🛒 Gostou? Adicione ao carrinho e aproveite!',
 sections:5,faqCount:5,reasonsCount:10,compactPreview:true
});
const normal=x=>String(x??'').trim();
const ncmPattern=/^\d{8}$/;
// Padrão de cadastro do vendedor Rede Achados BR, confirmado para seus anúncios
// Shopee. Não é um CST universal de NF-e; a contabilidade pode orientar
// exceções por SKU e o valor salvo/revisado da SKU tem precedência.
// Nunca aplicar esta regra para inferir CEST, CFOP ou NCM.
// CEST "00" é valor literal solicitado pela loja e pode ser enviado após autorização. Não presume enquadramento fiscal de 7 dígitos.
export const REDE_ACHADOS_FISCAL_DEFAULTS=Object.freeze({pis_cofins_cst:'99',cest:'00'});
export const isShopeeCestConfirmed=value=>/^\d{7}$/.test(String(value??'').trim());
export function fiscalStoreDefaults(fiscalNotes=''){
 const notes=normal(fiscalNotes);
 const approved=notes.match(/(?:PIS\s*(?:e|\/|&)\s*COFINS\s*CST|CST\s*PIS\s*(?:e|\/)\s*COFINS|PISCOFIS|PIS\s*COFINS)\s*:\s*(\d{2})\b/i)?.[1];
 return {pis_cofins_cst:approved||REDE_ACHADOS_FISCAL_DEFAULTS.pis_cofins_cst,
  cest:REDE_ACHADOS_FISCAL_DEFAULTS.cest};
}
export function fiscalMatrixSource({sku,supplier,tax,reviewSource=null}={}){
 const listingSku=normal(sku),supplierSku=normal(supplier?.supplier_sku);
 if(!listingSku)throw Error('Motor Matriz: SKU do anúncio não confirmada.');
 if(supplier){
  if(!supplierSku||(!['exact-sku','reviewed-link'].includes(supplier.matchedBy)))
   throw Error('Motor Matriz: correspondência WeDrop não revisada; confira o vínculo da SKU.');
  if(supplier.matchedBy==='exact-sku'&&supplierSku!==listingSku)
   throw Error('Motor Matriz: SKU do fornecedor diverge da SKU Shopee.');
 }
 const confirmed=normal(supplier?.product_data?.ncm);
 const chosen=normal(tax?.ncm);
 if(tax&&(!ncmPattern.test(chosen)))
  throw Error('Motor Matriz: NCM fiscal obrigatório com oito dígitos.');
 if(tax&&ncmPattern.test(confirmed)&&chosen!==confirmed)
  throw Error('Motor Matriz: NCM revisado diverge da ficha WeDrop da SKU '+listingSku+'. Confira o fornecedor antes de executar.');
 const proof=normal(tax?.evidence);
 if(tax&&!proof)throw Error('Motor Matriz: informe a fonte fiscal do NCM desta SKU.');
 if(tax&&!supplier&&/\bwedrop\b/i.test(proof))
  throw Error('Motor Matriz: a fonte WeDrop citada não está vinculada à SKU atual. Reimporte ou confirme o vínculo.');
 if(reviewSource&&tax){
  if(normal(reviewSource.sku)!==listingSku)
   throw Error('Motor Matriz: aprovação fiscal pertence a outra SKU.');
  if(reviewSource.supplierSku&&(!supplier||supplierSku!==normal(reviewSource.supplierSku)))
   throw Error('Motor Matriz: o vínculo WeDrop foi alterado após aprovação fiscal.');
  if(normal(reviewSource.ncm)!==chosen)
   throw Error('Motor Matriz: o NCM aprovado mudou. Refaça a revisão fiscal.');
 }
 return {sku:listingSku,ncm:chosen,supplierSku:supplierSku||null,
  source:supplier?.matchedBy||'manual-verified',file:supplier?.source_file||null};
}
// A Marca cadastrada é um atributo por categoria, nunca a condição NEW.
export function assertShopeeSupplierBrand({record,attributes=[],supplier}={}){
 const brand=normal(supplier?.product_data?.brand);
 if(!brand)return;
 const fmt=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const brandAttr=(record?.attributeAudit?.attributes||[]).find(x=>fmt(x.name)==='marca');
 if(!brandAttr)return;
 const saved=attributes.find(x=>Number(x.attributeId)===Number(brandAttr.id));
 const chosen=normal(saved?.values?.[0]?.valueName||brandAttr.values?.[0]?.name);
 if(chosen&&fmt(chosen)!==fmt(brand))
  throw Error('Motor Matriz: Marca "'+chosen+'" diverge da marca "'+brand+
   '" informada pela WeDrop. Abra Ficha técnica, selecione a marca oficial e aprove novamente.');
}
export function technicalMatrixSource({sku,record,attributes=[],reviewSource=null}={}){
 const listingSku=normal(sku),categoryId=Number(record?.categoryId);
 if(!listingSku||record?.sku!==listingSku)throw Error('Motor Matriz: ficha técnica pertence a outra SKU.');
 if(!Number.isSafeInteger(categoryId)||categoryId<=0)
  throw Error('Motor Matriz: categoria oficial Shopee não confirmada.');
 if(!Array.isArray(attributes))throw Error('Motor Matriz: atributos inválidos para revisão.');
 const schemaIds=new Set((record?.attributeAudit?.attributes||[]).filter(x=>!x.legacy).map(x=>Number(x.id)));
 const ids=new Set();
 for(const attr of attributes){
  const id=Number(attr?.attributeId);
  if(!Number.isSafeInteger(id)||ids.has(id)||!schemaIds.has(id))
   throw Error('Motor Matriz: atributo não pertence à categoria oficial ou está repetido.');
  ids.add(id);
  if(!normal(attr.evidence))
   throw Error('Motor Matriz: informe a fonte de cada característica preenchida.');
 }
 if(reviewSource&&(normal(reviewSource.sku)!==listingSku||Number(reviewSource.categoryId)!==categoryId))
  throw Error('Motor Matriz: a SKU ou a categoria técnica mudou após a revisão. Refaça a conferência.');
 return {sku:listingSku,categoryId};
}
