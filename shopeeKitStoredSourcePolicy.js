// Catálogo/estoque WeDrop importados permanecem disponíveis até atualização ou remoção.
// A idade é apenas um alerta: jamais transformar SKU sem status em DISPONÍVEL.
export const KIT_IMPORT_STALE_WARNING_MS=24*60*60*1000;
export function storedKitSourceState({
 catalogTimestamp,stockTimestamp,now=Date.now(),verifiedSkuCount=0
}={}){
 const isRecorded=x=>Number.isFinite(x)&&x>0&&x<=now+60_000;
 const catalogImported=isRecorded(catalogTimestamp);
 const stockImported=isRecorded(stockTimestamp)&&verifiedSkuCount>0;
 const catalogRecent=catalogImported&&now-catalogTimestamp<=KIT_IMPORT_STALE_WARNING_MS;
 const stockRecent=stockImported&&now-stockTimestamp<=KIT_IMPORT_STALE_WARNING_MS;
 const stockAfterCatalog=stockImported&&catalogImported&&stockTimestamp>=catalogTimestamp-60_000;
 const ready=catalogImported&&stockImported;
 const reason=!catalogImported?'Catálogo WeDrop ainda não foi importado.':
  !stockImported?'Não existe disponibilidade WeDrop importada para as SKUs. Importe a coluna SKU + Disponibilidade ao menos uma vez.':
  (!catalogRecent||!stockRecent)?
   'Catálogo e disponibilidade salvos e liberados. Dados antigos: confirme com a WeDrop a disponibilidade atual dos produtos antes de publicar.':
   'Catálogo e disponibilidade salvos. Somente SKUs explicitamente DISPONÍVEIS podem ser usadas.';
 return {ready,reason,catalogImported,stockImported,catalogRecent,stockRecent,
  stockAfterCatalog,warningOutdated:ready&&(!catalogRecent||!stockRecent)};
}
