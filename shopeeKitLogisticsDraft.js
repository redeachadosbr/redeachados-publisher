// Logística de Kit Formal: dados parciais do vendedor, não custo de catálogo.
// É apenas um rascunho. Validar novamente no momento de publicar.
const decimal=(raw,max,integer=false)=>{
 if(raw===null||raw===undefined||raw==='')return null;
 const value=Number(String(raw).replace(',','.'));
 if(!Number.isFinite(value)||value<=0||value>max||(integer&&!Number.isInteger(value)))
  return null;
 return value;
};
export function normalizeKitLogistics(input,kit){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const codes=(kit?.components||[]).map(x=>String(x.sku));
 const mainSku=codes.includes(String(input.mainSku||''))?String(input.mainSku):'';
 const id=String(input.logisticId||'').trim();
 const logisticId=/^[1-9]\d{0,17}$/.test(id)&&Number.isSafeInteger(Number(id))?id:'';
 return {
  mainSku,logisticId,
  weightKg:decimal(input.weightKg,30),
  lengthCm:decimal(input.lengthCm,200,true),
  widthCm:decimal(input.widthCm,200,true),
  heightCm:decimal(input.heightCm,200,true),
  autoSyncDts:input.autoSyncDts===true,
  preOrder:false,
  daysToShip:0,
  updatedAt:new Date().toISOString()
 };
}
