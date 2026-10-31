// Recupera os parâmetros fiscais JÁ salvos no Motor Matriz da loja.
// Não chama Shopee: usa somente o rascunho local, o catálogo WeDrop e
// revisões fiscais da própria loja, sem inferir NCM de outra SKU.
import {loadKitDraft} from './shopeeKitDraftStore.js';
import {readWeDropProduct} from './wedropCosts.js';
import {REDE_ACHADOS_FISCAL_DEFAULTS} from './shopeeMatrixRules.js';

const raw=v=>String(v??'').trim();
const fields=['origin','same_state_cfop','diff_state_cfop','csosn','measure_unit','operation_type','pis_cofins_cst'];
async function storedKitTaxReview(shopId,sku){
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
 const exact=rows.find(x=>raw(x.sku)===sku&&x.review_state?.tax&&typeof x.review_state.tax==='object');
 const template=rows.find(x=>x.review_state?.kitOptimization&&x.review_state?.tax&&
   typeof x.review_state.tax==='object'&&fields.some(f=>raw(x.review_state.tax[f])));
 return {exact:exact?.review_state?.tax||null,template:template?.review_state?.tax||null};
}
export async function readKitFiscalPreset(shopId,kitSku,requestedSku=''){
 const draft=await loadKitDraft(shopId,kitSku);
 if(!draft?.kit)throw Error('Abra um rascunho salvo antes de conferir os dados fiscais.');
 if(draft.publication?.status!=='local_draft'||draft.publication?.itemId)
  throw Error('Este kit já foi enviado. A conferência fiscal local não pode alterar a publicação.');
 const mainSku=raw(requestedSku||draft.optimization?.mainSku||
  draft.optimization?.sku||draft.kit.components?.[0]?.sku||draft.skus?.[0]);
 if(!draft.skus.includes(mainSku))throw Error('A SKU principal não pertence a este kit.');
 const [supplier,reviews]=await Promise.all([
  readWeDropProduct(shopId,{sku:mainSku}),
  storedKitTaxReview(shopId,mainSku)
 ]);
 const product=supplier?.product_data||{},template=reviews.template||{},exact=reviews.exact||{};
 const suggested=Object.fromEntries(fields.map(field=>[field,raw(template[field])]).filter(([,v])=>v));
 suggested.pis_cofins_cst=suggested.pis_cofins_cst||REDE_ACHADOS_FISCAL_DEFAULTS.pis_cofins_cst;
 const supplierNcm=raw(product.ncm);
 if(/^\d{8}$/.test(supplierNcm))suggested.ncm=supplierNcm;
 else if(/^\d{8}$/.test(raw(exact.ncm)))suggested.ncm=raw(exact.ncm);
 suggested.cest=/^\d{7}$/.test(raw(product.cest))?raw(product.cest):REDE_ACHADOS_FISCAL_DEFAULTS.cest;
 if(supplier?.source_file&&suggested.ncm)
  suggested.evidence='WeDrop '+raw(supplier.source_file).slice(0,115)+' · SKU '+mainSku+
   (supplier.source_line?' · linha '+supplier.source_line:'')+'; demais campos conforme padrão fiscal salvo da loja.';
 // A fonte exata da SKU prevalece sobre sugestões padronizadas da loja.
 const saved=Object.fromEntries(Object.entries(exact).filter(([k,v])=>
  [...fields,'ncm','evidence'].includes(k)&&typeof v==='string'&&v.length<=300));
 const sources=Object.fromEntries(Object.keys(suggested).map(k=>[k,k==='ncm'?'Catálogo WeDrop da SKU principal':
  k==='cest'?'Catálogo WeDrop / padrão fiscal existente':'Revisões fiscais já salvas desta loja']));
 return {sku:mainSku,kitSku,source:'dados locais já configurados',taxSuggestion:suggested,taxDraft:saved,
  taxSuggestionSources:sources,marketplaceQueried:false,marketplaceUpdated:false};
}
