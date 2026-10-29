// Shop-scoped Supabase state for Shopee optimization review, no Shopee writes.
const num=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('Identificador inválido.');return n};
function conf(){
 const u=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!u||!key)throw Error('Banco Shopee não configurado.');
 const h={apikey:key,'Content-Type':'application/json',Accept:'application/json'};
 if(/^eyJ[A-Za-z0-9_-]*\./.test(key))h.Authorization='Bearer '+key;
 return {u,h};
}
const query=(shop,item,model)=>{
 if(num(shop)<1||num(item)<1)throw Error('Identificador inválido.');
 return '?shop_id=eq.'+num(shop)+'&item_id=eq.'+num(item)+'&model_id=eq.'+num(model);
};
async function api(q,options={}){
 const {u,h}=conf();
 const res=await fetch(u+'/rest/v1/shopee_optimizer_workflow_reviews'+q,{
  method:options.method||'GET',headers:{...h,...(options.method?{Prefer:'resolution=merge-duplicates,return=minimal'}:{})},
  ...(options.body?{body:JSON.stringify(options.body)}:{}),signal:AbortSignal.timeout(18000)
 });
 if(!res.ok)throw Error('Falha ao acessar a revisão salva da Shopee (HTTP '+res.status+').');
 return options.method?null:res.json();
}
export async function getWorkflowReview(shop,item,model=0){
 const rows=await api(query(shop,item,model)+'&select=sku,review_state,updated_at&limit=1');
 return rows[0]||null;
}
export async function saveWorkflowReview(shop,item,model,sku,change){
 const existing=await getWorkflowReview(shop,item,model);
 if(existing&&existing.sku!==sku)throw Error('SKU do anúncio alterada: refaça a auditoria.');
 const state=existing?.review_state||{};
 const newKit=change.kitOptimization&&(
  !state.kitOptimization||state.kitOptimization.kitSku!==change.kitOptimization.kitSku||
  state.kitOptimization.itemId!==change.kitOptimization.itemId);
 const stages=change.resetKitStages?{}:{...(state.stages||{})};
 if(change.stage)stages[change.stage]={reviewed:change.reviewed,
  reviewedAt:change.reviewed?new Date().toISOString():null};
 const next={...state,stages};
 if(change.kitOptimization!==undefined)next.kitOptimization=change.kitOptimization;
 if(change.resetKitStages){
  next.attributes=[];next.tax=null;next.imagesSignature=null;
  next.technicalDraft=null;next.matrixFiscal=null;next.matrixTechnical=null;
  next.modelDiscountCampaignId='';
  next.kitDiscountPreview=null;
  next.kitDiscountPublication=null;
  next.variationConfig={enabled:false,type:'',values:[]};
  next.variationDetails=null;
 }
 if(change.assetSha256!==undefined)next.videoSha256=change.assetSha256;
 if(change.attributes!==undefined)next.attributes=change.attributes;
 if(change.technicalDraft!==undefined)next.technicalDraft=change.technicalDraft;
 // Preserve original technical draft, including optional values that could not
 // pass Shopee's field-type validation; review stores only safe changes.
 if(change.tax!==undefined)next.tax=change.tax;
 if(change.matrixFiscal!==undefined)next.matrixFiscal=change.matrixFiscal;
 if(change.matrixTechnical!==undefined)next.matrixTechnical=change.matrixTechnical;
 if(change.imagesSignature!==undefined)next.imagesSignature=change.imagesSignature;
 if(change.variationConfig!==undefined)next.variationConfig=change.variationConfig;
 if(change.variationDetails!==undefined)next.variationDetails=change.variationDetails;
 // Preparação da etapa 08 é independente da publicação.
 // Só o servidor grava estas informações após verificar a origem Shopee.
 if(change.kitDiscountPreview!==undefined)next.kitDiscountPreview=change.kitDiscountPreview;
 if(change.kitDiscountPublication!==undefined)next.kitDiscountPublication=change.kitDiscountPublication;
 if(change.modelDiscountCampaignId!==undefined){
  const id=String(change.modelDiscountCampaignId||'').trim();
  if(id&&!/^\d{1,18}$/.test(id))throw Error('ID Minha Promoção inválido.');
  next.modelDiscountCampaignId=id;
 }
 if(change.imageNotes!==undefined)next.imageNotes={...(state.imageNotes||{}),...change.imageNotes};
 if(change.imagePrompts!==undefined)next.imagePrompts={...(state.imagePrompts||{}),...change.imagePrompts};
 if(change.title!==undefined)next.draftTitle=change.title;
 if(change.description!==undefined)next.draftDescription=change.description;
 if(change.titleOrigin!==undefined)next.titleOrigin=String(change.titleOrigin);
 if(change.descriptionOrigin!==undefined)next.descriptionOrigin=String(change.descriptionOrigin);
 if(change.previousGeneratedDescription!==undefined)
   next.previousGeneratedDescription=String(change.previousGeneratedDescription);
 await api('?on_conflict=shop_id,item_id,model_id',{
   method:'POST',body:[{shop_id:num(shop),item_id:num(item),model_id:num(model),
     sku,review_state:next,updated_at:new Date().toISOString()}]
 });
 return next;
}


/**
 * Persist verified-source autofill as a technical DRAFT without marking the
 * SKU reviewed or overwriting existing Shopee/manual values. Idempotent.
 */
export async function mergeWorkflowTechnicalAutofill(shop,item,model,sku,attributes,suggestions){
 if(!Array.isArray(suggestions)||!suggestions.length)return null;
 const existing=await getWorkflowReview(shop,item,model);
 if(existing&&existing.sku!==sku)throw Error('SKU alterada durante o preenchimento técnico.');
 const state=existing?.review_state||{};
 const manual=Array.isArray(state.technicalDraft?.fields)?state.technicalDraft.fields:[];
 const manualMap=new Map(manual.map(x=>[Number(x.attributeId),x]));
 const savedMap=new Set((state.attributes||[]).map(x=>Number(x.attributeId)));
 const validMap=new Map((attributes||[]).map(x=>[Number(x.id),x]));
 const additional=[];
 for(const suggestion of suggestions){
  const id=Number(suggestion.attributeId),attr=validMap.get(id);
  if(!attr||attr.conditional||attr.legacy||attr.values?.length||savedMap.has(id))continue;
  const previous=manualMap.get(id);
  // Explicit manual choices, even drafts, take precedence.
  // Evidence-only notes do not mean that an actual option was filled.
  if(previous?.values?.some(x=>String(x.valueName||'').trim()||Number(x.valueId)>0))
   continue;
  if(previous&&!previous.enabled&&previous.userDisabled)continue;
  const values=(suggestion.values||[]).filter(v=>
   (Number(v.valueId)>0||String(v.valueName||'').trim())&&
   String(v.valueName||'').length<=500&&String(v.unit||'').length<=35).map(v=>({
    valueId:Number(v.valueId)||0,valueName:String(v.valueName||'').trim(),
    unit:String(v.unit||'').trim()
   }));
  if(!values.length)continue;
  const originalNote=previous?.source==='wedrop-auto'?'':String(previous?.evidence||'').trim();
  const evidence=String(suggestion.evidence||'')+
    (originalNote?' · Observação manual anterior: '+originalNote:'');
  const field={attributeId:id,enabled:true,evidence:evidence.slice(0,500),
   source:'wedrop-auto',values};
  const old=manualMap.get(id);
  if(old?.source==='wedrop-auto'&&JSON.stringify(old.values)===JSON.stringify(values))continue;
  additional.push(field);
 }
 if(!additional.length)return state.technicalDraft||null;
 const replaced=new Map(manual.map(f=>[Number(f.attributeId),f]));
 for(const field of additional)replaced.set(field.attributeId,field);
 const next={...state,technicalDraft:{fields:[...replaced.values()],
  updatedAt:new Date().toISOString(),autoFilledCount:additional.length}};
 await api('?on_conflict=shop_id,item_id,model_id',{
  method:'POST',body:[{shop_id:num(shop),item_id:num(item),model_id:num(model),sku,
   review_state:next,updated_at:new Date().toISOString()}]});
 return next.technicalDraft;
}
