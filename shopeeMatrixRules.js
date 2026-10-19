// Regras permanentes do Motor Matriz Shopee: independentes de produto, SKU e categoria.
// Sugestões WeDrop nunca autorizam publicações ou mudanças fiscais automaticamente.
const normal=x=>String(x??'').trim();
const ncmPattern=/^\d{8}$/;
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
