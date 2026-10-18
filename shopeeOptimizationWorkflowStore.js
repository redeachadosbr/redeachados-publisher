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
 const state=existing?.review_state||{},stages={...(state.stages||{})};
 stages[change.stage]={reviewed:change.reviewed,reviewedAt:change.reviewed?new Date().toISOString():null};
 const next={...state,stages};
 if(change.assetSha256!==undefined)next.videoSha256=change.assetSha256;
 if(change.attributes!==undefined)next.attributes=change.attributes;
 if(change.tax!==undefined)next.tax=change.tax;
 if(change.imagesSignature!==undefined)next.imagesSignature=change.imagesSignature;
 if(change.variationConfig!==undefined)next.variationConfig=change.variationConfig;
 if(change.imageNotes!==undefined)next.imageNotes={...(state.imageNotes||{}),...change.imageNotes};
 if(change.title!==undefined)next.draftTitle=change.title;
 if(change.description!==undefined)next.draftDescription=change.description;
 await api('?on_conflict=shop_id,item_id,model_id',{
   method:'POST',body:[{shop_id:num(shop),item_id:num(item),model_id:num(model),
     sku,review_state:next,updated_at:new Date().toISOString()}]
 });
 return next;
}

