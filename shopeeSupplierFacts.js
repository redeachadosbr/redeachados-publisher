// Suggestions have explicit provenance and are never an approval to publish.
const clean=value=>String(value||'').trim();
export function supplierWorkflowFacts(supplier,record,settings={}){
 const facts=supplier?.product_data||{},taxSuggestion={},attributeSuggestions=[];
 const source=supplier?'WeDrop '+supplier.source_file+' · SKU '+supplier.supplier_sku+' · linha '+supplier.source_line:'';
 const notes=clean(settings.fiscal_notes);
 const rules={origin:/Origem\s*:\s*([0-8])\b/i,same_state_cfop:/CFOP\s+Mesmo\s+Estado\s*:\s*(5\d{3})/i,
  diff_state_cfop:/CFOP\s+Outros\s+Estados\s*:\s*(6\d{3})/i,csosn:/CSOSN\s*:\s*(\d{3})/i,
  // Não herdar automaticamente CST do emissor de NF-e como dado do anúncio Shopee.
  };
 for(const [key,re] of Object.entries(rules)){const value=notes.match(re)?.[1];if(value)taxSuggestion[key]=value;}
 if(/tipo de (?:serviço|operac[aã]o|operaç[aã]o)\s*:\s*revendedor/i.test(notes))taxSuggestion.operation_type='1';
 if(/^\d{8}$/.test(facts.ncm||''))taxSuggestion.ncm=facts.ncm;
 if(/^\d{7}$/.test(facts.cest||''))taxSuggestion.cest=facts.cest;
 if(source)taxSuggestion.evidence=source+'; demais campos conforme regras fiscais salvas da loja.';
 const attrs=record.attributeAudit?.attributes||[],description=clean(record.description);
 const axes={};
 for(const [key,names] of Object.entries({length:'comprimento',width:'largura',height:'altura'})){
  const value=description.match(new RegExp('(\\d+(?:[.,]\\d+)?)\\s*cm\\s*(?:de\\s+)?'+names,'i'))?.[1];
  if(value&&Number(value.replace(',','.'))>0)axes[key]=value;
 }
 for(const attr of attrs){
  if(attr.conditional||attr.values?.length)continue;
  if(attr.id===100942&&[2,3,5].includes(Number(attr.inputType))&&Object.keys(axes).length===3)
   attributeSuggestions.push({attributeId:attr.id,values:[{valueId:0,valueName:axes.length+' x '+axes.width+' x '+axes.height+' cm'}],
    evidence:'Descrição atual desta SKU na Shopee: comprimento × largura × altura, em cm. Não usa as medidas logísticas WeDrop.'});
  if(attr.id===100413&&[2,3,5].includes(Number(attr.inputType))&&record.condition==='NEW')
   attributeSuggestions.push({attributeId:attr.id,values:[{valueId:0,valueName:'Novo'}],evidence:'Condição NEW retornada pela Shopee para este item.'});
 }
 return {supplierProduct:supplier?{...facts,sku:supplier.supplier_sku,source,importedAt:supplier.imported_at,matchedBy:supplier.matchedBy}:null,
  taxSuggestion,attributeSuggestions,fiscalNotes:notes};
}
