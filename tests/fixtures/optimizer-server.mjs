// Offline HTTP integration fixture. Every external request is intercepted.
import {approvedTitle} from './approved-content.js';
const nativeFetch=globalThis.fetch;
const send=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const listing={item_id:2,item_name:'Título atual',item_sku:'SKU',item_status:'NORMAL',category_id:3,
 description:'Descrição atual do produto com as características já confirmadas pelo fornecedor.',description_type:'normal',has_model:false,image:{image_id_list:[]},video_info:[]};
let job=process.env.FIXTURE_RECOVERY_JOB?JSON.parse(process.env.FIXTURE_RECOVERY_JOB):null;
const fixtureModels=JSON.parse(process.env.FIXTURE_MODELS||'[]');
if(fixtureModels.length)listing.has_model=true;
listing.tax_info=JSON.parse(process.env.FIXTURE_TAX||'{}');
// PostgreSQL jsonb does not preserve object insertion order. Keep array order,
// but round-trip every execution write using jsonb's length/byte key ordering.
const databaseJson=value=>Array.isArray(value)?value.map(databaseJson):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).sort((a,b)=>Buffer.byteLength(a)-Buffer.byteLength(b)||
  Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k=>[k,databaseJson(value[k])])):value;
const variations=process.env.FIXTURE_VARIATION_FLOW==='true';
const withVideo=process.env.FIXTURE_WITH_VIDEO==='true';
const at=new Date().toISOString();
const review={stages:{seo:{reviewed:true}},draftTitle:approvedTitle};
if(variations){
 listing.price_info=[{original_price:745.99,currency:'BRL'}];
 review.variationConfig={enabled:true,type:'Cor',values:['Vermelho','Rosa']};
 review.modelDiscountCampaignId='123';
 review.variationDetails={type:'Cor',options:['Vermelho','Rosa'].map((name,i)=>({
  name,sku:'SKU-'+name.toUpperCase(),supplierSku:i?'SOURCE-PINK':'SKU',price:745.99,
  stock:1,stockConfirmed:true,photoConfirmed:true,noGtin:true,gtin:'',
  asset:{storagePath:'1/2/0/variations/'+(i?'bb':'aa')+'.png',sha256:(i?'b':'a').repeat(64)}}))};
}
if(withVideo){
 listing.video_info=[{video_url:'https://fixture.invalid/original.mp4',duration:10,
  thumbnail_url:'https://fixture.invalid/thumbnail.png'}];
 review.stages.video={reviewed:true};review.videoSha256='c'.repeat(64);
}
const quote={sku:'SKU',itemId:'2',modelId:'0',grossPrice:740,discountPct:25,couponPct:1,
 customerPrice:549.45,unitCost:350,netMarginPct:20,minMarginPct:10,
 readyForManualReview:true,appliedInShopee:false,calculatedAt:at,
 marketResearch:{verified:true,source:'shopee_affiliate_product_offers',researchedAt:at,count:2},
 discountRecommendationSource:'researched'};
const sessions=new Map();
globalThis.fetch=async(url,request={})=>{
 const u=new URL(url);
 if(u.hostname==='127.0.0.1')return nativeFetch(url,request);
 if(u.hostname==='fixture.supabase.co'){
  if(u.pathname==='/rest/v1/shopee_app_sessions'){
   const id=u.searchParams.get('session_key')?.slice(3),row=sessions.get(id);
   if(request.method==='POST'){const saved=JSON.parse(request.body)[0];sessions.set(saved.session_key,saved);return send(null);}
   if(request.method==='DELETE'){sessions.delete(id);return send(null);}
   const active=row&&row.expires_at>(u.searchParams.get('expires_at')?.slice(3)||'');
   if(request.method==='PATCH'){if(active)Object.assign(row,JSON.parse(request.body));return send(null);}
   return send(active?[row]:[]);
  }
  if(u.pathname==='/rest/v1/shopee_auth')return send([{shop_id:1,shop_ids:[1],access_token:'fixture-token',refresh_token:'fixture-refresh',expires_at:Date.now()+3600000,mode:'live',partner_id:12}]);
  if(u.pathname==='/rest/v1/shopee_optimizer_workflow_reviews'){
   const current=structuredClone(review);
   if(job&&process.env.FIXTURE_CHANGE_STOCK_AFTER_PREPARE==='true')current.variationDetails.options[1].stock=2;
   return send([{sku:'SKU',review_state:databaseJson(current)}]);
  }
  if(withVideo&&u.pathname==='/rest/v1/shopee_optimizer_manual_videos')
   return send([{sku:'SKU',filename:'Approved video.mp4',sha256:review.videoSha256,publication:null}]);
  if(variations){
   if(u.pathname==='/rest/v1/shopee_catalog_items')return send([{item_id:2,sku:'SKU'}]);
   if(u.pathname==='/rest/v1/shopee_optimizer_price_plans')return send([{sku:'SKU',quote}]);
   if(u.pathname==='/rest/v1/shopee_wedrop_costs')
    return send([{supplier_sku:u.searchParams.get('supplier_sku').slice(3),unit_cost:350,imported_at:at}]);
   if(u.pathname==='/rest/v1/shopee_wedrop_products'){
    const code=u.searchParams.get('supplier_sku').slice(3);
    return send([{supplier_sku:code,product_data:{name:'Moto Infantil '+(code==='SKU'?'Vermelha':'Rosa')}}]);
   }
  }
  if(u.pathname==='/rest/v1/shopee_optimizer_execution_jobs'){
   if(request.method==='POST'){job=databaseJson(JSON.parse(request.body)[0]);return send([job]);}
   if(request.method==='PATCH'){job=databaseJson({...job,...JSON.parse(request.body)});return send([job]);}
   if(u.searchParams.get('state')==='eq.running')return send([]);
   return send(job?[job]:[]);
  }
  return send([]);
 }
 if(u.hostname==='partner.shopeemobile.com'){
  if(request.method==='POST')throw Error('Unexpected external mutation in preflight test');
  if(u.pathname.endsWith('/get_item_base_info'))return send({response:{item_list:[listing]}});
  if(u.pathname.endsWith('/get_model_list'))return send({response:{model:fixtureModels}});
  if(u.pathname.endsWith('/get_attribute_tree'))return send({response:{list:[{category_id:3,attribute_tree:[]}]}});
  if(variations&&u.pathname.endsWith('/get_discount'))return send({response:{discount_id:123,
   status:'ongoing',end_time:Math.floor(Date.now()/1000)+86400,discount_name:'Fixture promotion',item_list:[],more:false}});
  return send({response:{}});
 }
 throw Error('External access forbidden in test: '+u.hostname);
};
await import('../../server.js');
