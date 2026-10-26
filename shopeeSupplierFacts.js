// Suggestions have explicit provenance and are never an approval to publish.
import {fiscalStoreDefaults} from './shopeeMatrixRules.js';
const clean=value=>String(value||'').trim();
// Fonte exclusiva do CEST no Motor Matriz: catálogo WeDrop vinculado à SKU.
// Sem código de sete dígitos confirmado na planilha, guardar somente o marcador interno 00.
export function wedropCestForSku(supplier){
 const linked=Boolean(supplier&&(!supplier.matchedBy||['exact-sku','reviewed-link'].includes(supplier.matchedBy)));
 const value=linked?String(supplier.product_data?.cest??'').trim():'';
 return /^\d{7}$/.test(value)?value:'00';
}
export function supplierWorkflowFacts(supplier,record,settings={}){
 const facts=supplier?.product_data||{},taxSuggestion={},attributeSuggestions=[];
 const source=supplier?'WeDrop '+supplier.source_file+' · SKU '+supplier.supplier_sku+' · linha '+supplier.source_line:'';
 const notes=clean(settings.fiscal_notes);
 // Sugestão de padrão da loja (99 = Outras Operações), nunca aprovação de
 // publicação; um CST salvo especificamente na SKU continua prioritário.
 Object.assign(taxSuggestion,fiscalStoreDefaults(notes));
 const rules={origin:/Origem\s*:\s*([0-8])\b/i,same_state_cfop:/CFOP\s+Mesmo\s+Estado\s*:\s*(5\d{3})/i,
  diff_state_cfop:/CFOP\s+Outros\s+Estados\s*:\s*(6\d{3})/i,csosn:/CSOSN\s*:\s*(\d{3})/i,
  // CST do anúncio é uma regra da própria loja; não herdar CST da NF-e.
  };
 for(const [key,re] of Object.entries(rules)){const value=notes.match(re)?.[1];if(value)taxSuggestion[key]=value;}
 if(/tipo de (?:serviço|operac[aã]o|operaç[aã]o)\s*:\s*revendedor/i.test(notes))taxSuggestion.operation_type='1';
 if(/^\d{8}$/.test(facts.ncm||''))taxSuggestion.ncm=facts.ncm;
 taxSuggestion.cest=wedropCestForSku(supplier);
 // Ausência de CEST válido na planilha: manter marcador 00 do Motor Matriz.
 if(source)taxSuggestion.evidence=source+'; demais campos conforme regras fiscais salvas da loja.';
 // Unidade padrão só é inferida quando há comprovação explícita para esta SKU.
 // Não tratar kit, metro ou pacote como UN apenas porque a loja é revendedora.
 const explicitUnit=clean(facts.measure_unit||facts.measureUnit||facts.unitOfMeasure||'').toUpperCase();
 if(['UN','UND','UNIDADE'].includes(explicitUnit))taxSuggestion.measure_unit='UN';
 else if(['KIT','KT'].includes(explicitUnit))taxSuggestion.measure_unit='KIT';
 else if(['M','MT','METRO'].includes(explicitUnit))taxSuggestion.measure_unit='M';
 else if(['KG','QUILOGRAMA'].includes(explicitUnit))taxSuggestion.measure_unit='KG';
 // O catálogo WeDrop frequentemente não contém measure_unit, mas declara
 // claramente a unidade comercial no nome. KIT é o conjunto vendido como
 // UMA oferta; UN é o artigo avulso. Não usar quantidade de peças para
 // supor a unidade e jamais substituir unidade explicitamente cadastrada.
 if(!taxSuggestion.measure_unit){
  const commercialName=clean(facts.name||facts.title||record.title);
  const normalizedName=commercialName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const declaredKit=/\b(?:kit|conjunto|jogo)\b/.test(normalizedName);
  const avulso=/\b(?:avulso|unidade avulsa|peca avulsa)\b/.test(normalizedName);
  if(declaredKit&&!avulso)taxSuggestion.measure_unit='KIT';
  else if(commercialName&&!declaredKit)taxSuggestion.measure_unit='UN';
 }
 const description=clean(record.description);
 const attrs=record.attributeAudit?.attributes||[];
 const singularQuantity=attrs.find(x=>/quantidade\s+(?:da|por)\s+embalagem|quantidade\s+incluida/i.test(
   String(x.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')))?.values?.[0]?.name;
 if(!taxSuggestion.measure_unit&&String(singularQuantity||'').trim()==='1'&&
   !/\b(kit|jogo|conjunto|metro|pacote de|fardo)\b/i.test(String(facts.name||record.title||'')))
  taxSuggestion.measure_unit='UN';
 // Nesta SKU, a própria ficha WeDrop declara "01 Super Mochila Construtor 3 em 1".
 // UN é comprovada pela unidade comercial principal, sem confundir seus acessórios.
 if(!taxSuggestion.measure_unit&&/^super mochila construtor 3 em 1\b/i.test(clean(facts.name||record.title))&&
   /(?:^|\n)\s*0?1\s+super mochila construtor 3 em 1\b/i.test(description))
  taxSuggestion.measure_unit='UN';
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
  // A condição NEW nunca autoriza preencher Marca com 'Novo': o ID da categoria
  // é dinâmico. Marca é obtida do catálogo WeDrop e validada pela árvore Shopee.
 }
 return {supplierProduct:supplier?{...facts,sku:supplier.supplier_sku,source,importedAt:supplier.imported_at,matchedBy:supplier.matchedBy}:null,
  taxSuggestion,attributeSuggestions,fiscalNotes:notes,
  taxSuggestionSources:Object.fromEntries(Object.keys(taxSuggestion).map(key=>[key,
   ['ncm','measure_unit'].includes(key)||key==='cest'&&taxSuggestion.cest!=='00'?(source||'Ficha técnica do produto'):
    key==='pis_cofins_cst'?'Motor Matriz · padrão fiscal da loja: 99 — Outras Operações':
    key==='cest'&&taxSuggestion.cest==='00'?'Motor Matriz · marcador 00 (sem CEST confirmado; não enviar à Shopee)':'Regras fiscais salvas da loja']))};
}
