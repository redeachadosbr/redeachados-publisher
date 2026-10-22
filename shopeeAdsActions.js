// Mutação de Ads exclusivamente mediante prévia assinada e confirmação individual.
// Endpoints: Shopee Open Platform /api/v2/ads/edit_manual_product_ads e edit_gms_product_campaign.
import crypto from 'node:crypto';
import {discoverShopeeCampaigns,fetchShopeeCampaignSettings} from './adsReport.js';
export const ADS_EDIT_PATHS=Object.freeze({
 manual:'/api/v2/ads/edit_manual_product_ads',
 auto:'/api/v2/ads/edit_auto_product_ads',
 gms:'/api/v2/ads/edit_gms_product_campaign'
});
const ALLOWED=new Set(['pause','resume','change_budget','change_roas_target']);
const toId=value=>{
 const str=String(value??'').trim(),id=Number(str);
 if(!/^[1-9]\d{0,15}$/.test(str)||!Number.isSafeInteger(id))throw Error('ID da campanha inválido.');
 return id;
};
export function adsEditType(value){
 const s=String(value??'').toLowerCase();
 if(/gms|gmv|max|shop_ads/.test(s))return 'gms';
 if(/manual/.test(s))return 'manual';
 if(/^auto$|auto_product/.test(s))return 'auto';
 return null;
}
export function validateAdsChange(change){
 if(!change||typeof change!=='object'||Array.isArray(change))throw Error('Ação Ads inválida.');
 const keys=Object.keys(change);
 if(keys.some(k=>!['campaignId','action','value'].includes(k)))throw Error('Parâmetro Ads não permitido.');
 const campaignId=toId(change.campaignId),action=String(change.action||'');
 if(!ALLOWED.has(action))throw Error('Ação Ads não suportada.');
 let value=null;
 if(action==='change_budget'){
  value=Number(change.value);
  if(!Number.isFinite(value)||value<5||value>300||Math.abs(Math.round(value*100)-value*100)>1e-7)
   throw Error('Orçamento diário permitido nesta interface: de R$ 5,00 a R$ 300,00.');
 }else if(action==='change_roas_target'){
  value=Number(change.value);
  if(!Number.isFinite(value)||value<1||value>100||Math.abs(Math.round(value*10)-value*10)>1e-7)
   throw Error('ROAS-alvo entre 1,0x e 100,0x em passos de 0,1x.');
 }else if(change.value!==undefined&&change.value!==null&&change.value!=='')
  throw Error('Esta ação não aceita valor.');
 return {campaignId,action,value};
}
export async function liveAdsCampaign(cfg,auth,callApi,campaignId){
 const entries=await discoverShopeeCampaigns(cfg,auth,callApi);
 const match=entries.find(x=>String(x.campaignId)===String(campaignId));
 if(!match)throw Error('Campanha não pertence à loja autorizada ou não foi localizada.');
 const kind=adsEditType(match.adType);
 if(!kind)throw Error('Tipo de campanha não reconhecido. Não é seguro modificar por API.');
 const settings=await fetchShopeeCampaignSettings(cfg,auth,callApi,[match]);
 const info=settings.get(String(campaignId));
 if(!info)throw Error('Não foi possível confirmar o status oficial da campanha.');
 return {...match,kind,status:info.status,statusGroup:info.statusGroup,
  name:info.name||'Campanha '+campaignId};
}
export function buildAdsPreview(change,live){
 const requested=validateAdsChange(change);
 if(requested.action==='change_roas_target'&&live.kind!=='gms')
  throw Error('Alteração de ROAS nesta interface limitada às campanhas GMS confirmadas.');
 if(requested.action==='pause'&&live.statusGroup!=='active')
  throw Error('A Shopee não confirma que a campanha esteja ativa para pausar.');
 if(requested.action==='resume'&&live.statusGroup!=='inactive')
  throw Error('A Shopee não confirma que a campanha esteja pausada para retomar.');
 if(!ADS_EDIT_PATHS[live.kind])throw Error('API não habilitada para este tipo de campanha.');
 const actions={pause:'Pausar campanha',resume:'Retomar campanha',
  change_budget:'Alterar orçamento diário',change_roas_target:'Alterar ROAS-alvo'};
 return {campaignId:requested.campaignId,type:live.kind,adType:live.adType,
  name:live.name,statusBefore:live.status,action:requested.action,value:requested.value,
  label:actions[requested.action],costImpact:requested.action==='resume'||
  requested.action==='change_budget'||requested.action==='change_roas_target',
  warning:'Operação real na Shopee. Pode alterar o investimento ou interromper a publicidade. Confirme somente após revisar.'};
}
const sign=(raw,secret)=>crypto.createHmac('sha256',secret).update(raw).digest('base64url');
export function signAdsApproval(payload,secret){
 if(!secret||secret.length<12)throw Error('Segredo de aprovação Ads não configurado.');
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return body+'.'+sign(body,secret);
}
export function verifyAdsApproval(token,secret,{shopId,now=Date.now()}={}){
 const [body,mac,extra]=String(token||'').split('.');
 if(!body||!mac||extra||body.length>4000||mac.length>100)throw Error('Prévia Ads inválida.');
 const expected=sign(body,secret);
 const a=Buffer.from(mac),b=Buffer.from(expected);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error('Assinatura da prévia Ads inválida.');
 let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw Error('Prévia Ads inválida.');}
 if(!p||String(p.shopId)!==String(shopId)||typeof p.nonce!=='string'||
  p.nonce.length<16||p.nonce.length>80||!Number.isFinite(p.at)||
  p.at>now+30000||p.at<now-5*60*1000)
  throw Error('Prévia Ads expirada ou pertence a outra loja.');
 validateAdsChange({campaignId:p.preview.campaignId,action:p.preview.action,value:p.preview.value});
 return p;
}
export function adsEditRequest(preview,referenceId){
 const p=validateAdsChange({campaignId:preview.campaignId,action:preview.action,value:preview.value});
 const kind=preview.type;
 if(!ADS_EDIT_PATHS[kind])throw Error('Tipo de campanha não suportado.');
 if(p.action==='change_roas_target'&&kind!=='gms')throw Error('ROAS nesta tela apenas GMS.');
 const body={campaign_id:p.campaignId,edit_action:p.action,reference_id:referenceId};
 if(p.action==='change_budget')body[kind==='gms'?'daily_budget':'budget']=p.value;
 if(p.action==='change_roas_target')body.roas_target=p.value;
 return {path:ADS_EDIT_PATHS[kind],method:'POST',body};
}
