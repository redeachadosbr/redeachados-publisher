// Offline HTTP integration fixture. Every external request is intercepted.
import {approvedTitle} from './approved-content.js';
const nativeFetch=globalThis.fetch;
const send=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const listing={item_id:2,item_name:'Título atual',item_sku:'SKU',item_status:'NORMAL',category_id:3,
 description:'Descrição atual do produto com as características já confirmadas pelo fornecedor.',description_type:'normal',has_model:false,image:{image_id_list:[]},video_info:[]};
let job=null;
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
  if(u.pathname==='/rest/v1/shopee_optimizer_workflow_reviews')return send([{sku:'SKU',review_state:{stages:{seo:{reviewed:true}},draftTitle:approvedTitle}}]);
  if(u.pathname==='/rest/v1/shopee_optimizer_execution_jobs'){
   if(request.method==='POST'){job=JSON.parse(request.body)[0];return send([job]);}
   if(u.searchParams.get('state')==='eq.running')return send([]);
   return send(job?[job]:[]);
  }
  return send([]);
 }
 if(u.hostname==='partner.shopeemobile.com'){
  if(request.method==='POST')throw Error('Unexpected external mutation in preflight test');
  if(u.pathname.endsWith('/get_item_base_info'))return send({response:{item_list:[listing]}});
  if(u.pathname.endsWith('/get_attribute_tree'))return send({response:{list:[{category_id:3,attribute_tree:[]}]}});
  return send({response:{}});
 }
 throw Error('External access forbidden in test: '+u.hostname);
};
await import('../../server.js');
