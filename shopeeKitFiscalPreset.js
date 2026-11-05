// Recupera os parâmetros fiscais JÁ salvos no Motor Matriz da loja.
// Não chama Shopee: usa somente o rascunho local, o catálogo WeDrop e
// revisões fiscais da própria loja, sem inferir NCM de outra SKU.
import {loadKitDraft} from './shopeeKitDraftStore.js';
import {readWeDropProduct} from './wedropCosts.js';
import {REDE_ACHADOS_FISCAL_DEFAULTS} from './shopeeMatrixRules.js';

const raw=v=>String(v??'').trim();
const fields=['origin','same_state_cfop','diff_state_cfop','csosn','measure_unit','operation_type','pis_cofins_cst'];
// A origem de fabricação e o NCM são próprios de cada SKU; nunca herdar de outra.
const sharedDefaults=['same_state_cfop','diff_state_cfop','csosn','measure_unit','operation_type','pis_cofins_cst'];
async function storedKitTaxReviews(shopId,skus){
 const base=raw(process.env.SUPABASE_URL).replace(/\/$/,'');
 const key=raw(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);
 if(!base.startsWith('https://')||!key)throw Error('Motor Matriz não conectado.');
 const headers={apikey:key,Accept:'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))headers.Authorization='Bearer '+key;
 const url=base+'/rest/v1/shopee_optimizer_workflow_reviews?shop_id=eq.'+Number(shopId)+
  '&select=sku,review_state&order=updated_at.desc&limit=1000';
 const res=await fetch(url,{headers,signal:AbortSignal.timeout(18000)});
 if(!res.ok)throw Error('Revisões fiscais salvas temporariamente indisponíveis (HTTP '+res.status+').');
 const rows=await res.json();
 const exact=new Map(skus.map(sku=>[sku,rows.find(x=>raw(x.sku)===sku&&x.review_state?.tax&&typeof x.review_state.tax==='object')?.review_state?.tax||{}]));
 const template=rows.find(x=>x.review_state?.kitOptimization&&x.review_state?.tax&&
   typeof x.review_state.tax==='object'&&fields.some(f=>raw(x.review_state.tax[f])));
 return {exact,template:template?.review_state?.tax||{}};
}
export async function readKitFiscalPreset(shopId,kitSku,requestedSku=''){
 const draft=await loadKitDraft(shopId,kitSku);
 if(!draft?.kit)throw Error('Abra um rascunho salvo antes de conferir os dados fiscais.');
 if(draft.publication?.status!=='local_draft'||draft.publication?.itemId)
  throw Error('Este kit já foi enviado. A conferência fiscal local não pode alterar a publicação.');
 const mainSku=raw(requestedSku||draft.optimization?.mainSku||
  draft.optimization?.sku||draft.kit.components?.[0]?.sku||draft.skus?.[0]);
 if(!draft.skus.includes(mainSku))throw Error('A SKU principal não pertence a este kit.');
 const skus=[mainSku,...draft.skus.filter(sku=>sku!==mainSku)];
 const [suppliers,reviews]=await Promise.all([
  Promise.all(skus.map(sku=>readWeDropProduct(shopId,{sku}))),
  storedKitTaxReviews(shopId,skus)
 ]);
 const skuPresets=skus.map((sku,index)=>{
  const supplier=suppliers[index],product=supplier?.product_data||{};
  const exact=reviews.exact.get(sku)||{},template=reviews.template||{};
  // Tabela fiscal da Rede Achados BR, previamente aprovada pelo vendedor.
  // Uma revisão de OUTRA SKU não é fonte confiável para estes campos.
  // Os valores específicos desta SKU (saved) continuam prevalecendo.
  const storeFiscalDefaults={
   same_state_cfop:'5106',diff_state_cfop:'6106',csosn:'102',
   measure_unit:'UN',operation_type:'1',
   pis_cofins_cst:REDE_ACHADOS_FISCAL_DEFAULTS.pis_cofins_cst
  };
  const suggestion=Object.fromEntries(sharedDefaults.map(field=>
   [field,raw(storeFiscalDefaults[field])]).filter(([,v])=>v));
  const supplierNcm=raw(product.ncm);
  const exactNcm=raw(exact.ncm);
  if(/^\d{8}$/.test(supplierNcm))suggestion.ncm=supplierNcm;
  else if(/^\d{8}$/.test(exactNcm))suggestion.ncm=exactNcm;
  suggestion.cest=/^\d{7}$/.test(raw(product.cest))?raw(product.cest):REDE_ACHADOS_FISCAL_DEFAULTS.cest;
  const saved=Object.fromEntries(Object.entries(exact).filter(([key,v])=>
   [...fields,'ncm','evidence'].includes(key)&&typeof v==='string'&&v.length<=300));
  const confirmedOrigin=raw(draft.creative?.fiscalBySku?.[sku]?.origin);
  if(/^[0-8]$/.test(confirmedOrigin)){
   // Revisão explícita por SKU neste kit prevalece sobre a ficha de outro
   // produto ou revisão anterior. Nunca inferir a origem pelo NCM.
   saved.origin=confirmedOrigin;
  }
  // NCM oficial da SKU no catálogo prevalece sobre revisão antiga divergente.
  const ncmConflict=Boolean(/^\d{8}$/.test(supplierNcm)&&/^\d{8}$/.test(exactNcm)&&supplierNcm!==exactNcm);
  if(ncmConflict)delete saved.ncm;
  if(supplier?.source_file&&suggestion.ncm&&!saved.evidence)
   suggestion.evidence='WeDrop '+raw(supplier.source_file).slice(0,115)+' · SKU '+sku+
    (supplier.source_line?' · linha '+supplier.source_line:'')+
    '; demais valores são parâmetros fiscais para conferência.';
  const taxSuggestionSources=Object.fromEntries(Object.keys(suggestion).map(key=>
   [key,key==='ncm'?'NCM da SKU no catálogo WeDrop':key==='cest'?
    'CEST da SKU WeDrop ou 00 sem informação':'Tabela fiscal aprovada da loja; exceções da SKU preservadas']));
  if(confirmedOrigin)taxSuggestionSources.origin='Origem confirmada e gravada para esta SKU no kit';
  const name=raw(draft.kit.components.find(p=>p.sku===sku)?.name||product.name||sku);
  return {sku,name,taxSuggestion:suggestion,taxDraft:saved,taxSuggestionSources,
   ncmConflict,ncmSource:supplier?.source_file||null,
   ncm:raw(saved.ncm||suggestion.ncm),cest:suggestion.cest,
   marketplaceQueried:false,marketplaceUpdated:false};
 });
 const primary=skuPresets[0];
 return {sku:mainSku,kitSku,source:'dados locais já configurados',
  taxSuggestion:primary.taxSuggestion,taxDraft:primary.taxDraft,
  taxSuggestionSources:primary.taxSuggestionSources,skuPresets,
  marketplaceQueried:false,marketplaceUpdated:false};
}
