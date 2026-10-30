// Integra somente evidencias da SKU principal de um KIT com seu rascunho
// de ficha tecnica. Nao grava dados no otimizador e nao altera a Shopee.
export function kitPrincipalTechnicalEvidence({kitDraft,kitLink,sku,itemId,sourceText=''}={}){
 const existing=String(sourceText||'');
 const code=String(sku||''),kitSku=String(kitLink?.kitSku||'');
 if(!kitSku||!code||String(kitLink?.mainSku||'')!==code||
    String(kitLink?.itemId||'')!==String(itemId||''))return existing;
 if(kitDraft?.kitSku!==kitSku||!Array.isArray(kitDraft.skus)||
    !kitDraft.skus.some(s=>String(s)===code))return existing;
 const savedLink=kitDraft.optimization;
 if(!savedLink||String(savedLink.kitSku||'')!==kitSku||
    String(savedLink.mainSku||'')!==code||
    String(savedLink.itemId||'')!==String(itemId||''))return existing;
 const mainFacts=String(kitDraft.creative?.manualFacts?.[code]||'').trim().slice(0,1700);
 if(!mainFacts||existing.includes(mainFacts))return existing;
 // A primeira evidencia deve pertencer somente a SKU exata do anuncio.
 return [mainFacts,existing.trim()].filter(Boolean).join('\n\n');
}
