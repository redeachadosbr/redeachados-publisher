// Evidência declarada pelo vendedor para campos simples e não regulatórios.
// País de origem só é considerado quando um valor foi explicitamente selecionado;
// nunca infira país de fabricação a partir do país da loja ou da venda.
const normal=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/\s+/g,' ').trim();
const countries=new Set(['pais ou regiao de origem','country or region of origin','country of origin']);
const amounts=new Set(['quantidade','quantity']);
export function isSellerDeclaredTechnicalField(meta){
 const name=normal(meta?.name);
 return countries.has(name)||amounts.has(name);
}
export function sellerDeclarationEvidence(change,meta){
 const evidence=String(change?.evidence??'').trim();
 if(evidence)return evidence;
 if(!isSellerDeclaredTechnicalField(meta))return evidence;
 const values=Array.isArray(change?.values)?change.values:[];
 if(!values.length||values.some(v=>{
  const id=Number(v?.valueId);
  return !(id>0||id===0&&String(v?.valueName??'').trim());
 }))return evidence;
 return 'Informado e confirmado pelo vendedor';
}
export function applySellerDeclarations(changes,attributes){
 const lookup=new Map((Array.isArray(attributes)?attributes:[]).map(a=>[Number(a.id),a]));
 return (Array.isArray(changes)?changes:[]).map(change=>{
  const meta=lookup.get(Number(change?.attributeId));
  const evidence=sellerDeclarationEvidence(change,meta);
  return evidence===String(change.evidence??'').trim()?change:{...change,evidence};
 });
}
