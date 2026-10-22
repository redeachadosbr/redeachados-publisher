import test from 'node:test';
import assert from 'node:assert/strict';
import {
 adsEditType,validateAdsChange,buildAdsPreview,signAdsApproval,
 verifyAdsApproval,adsEditRequest,liveAdsCampaign
} from '../shopeeAdsActions.js';

const secret='a-signing-secret-with-at-least-32-characters';
const now=Date.parse('2026-10-22T12:00:00Z');
test('Tipos de campanhas oficiais são roteados a endpoints de edição adequados',()=>{
 assert.equal(adsEditType('manual'),'manual');
 assert.equal(adsEditType('gms'),'gms');
 assert.equal(adsEditType('auto'),'auto');
 assert.equal(adsEditType('desconhecido'),null);
 const base={campaignId:123,status:'ongoing',statusGroup:'active',name:'Ads real',kind:'gms',adType:'gms'};
 const preview=buildAdsPreview({campaignId:123,action:'change_budget',value:25.5},base);
 assert.equal(preview.value,25.5);
 assert.deepEqual(adsEditRequest(preview,'nonce-123'),{path:'/api/v2/ads/edit_gms_product_campaign',
 method:'POST',body:{campaign_id:123,edit_action:'change_budget',reference_id:'nonce-123',daily_budget:25.5}});
 assert.equal(adsEditRequest({...preview,type:'manual'},'x').body.budget,25.5);
 assert.equal(adsEditRequest({...preview,type:'auto'},'x').path,'/api/v2/ads/edit_auto_product_ads');
});
test('Assinatura vincula autorização a uma loja, prazo e estado de campanha',()=>{
 const preview=buildAdsPreview({campaignId:123,action:'pause'},{
  campaignId:123,status:'ongoing',statusGroup:'active',name:'Teste',kind:'manual',adType:'manual'});
 const token=signAdsApproval({shopId:'321',at:now,nonce:'unique-id-0000001',preview},secret);
 assert.equal(verifyAdsApproval(token,secret,{shopId:'321',now:now+1000}).preview.action,'pause');
 assert.throws(()=>verifyAdsApproval(token,secret,{shopId:'999',now}),/outra loja/);
 assert.throws(()=>verifyAdsApproval(token,secret,{shopId:'321',now:now+301000}),/expirada/);
 assert.throws(()=>verifyAdsApproval(token+'x',secret,{shopId:'321',now}),/Assinatura/);
});
test('Recusa ações sem status confirmado, parâmetros desconhecidos ou fora da política',()=>{
 assert.throws(()=>validateAdsChange({campaignId:'123',action:'change_budget',value:1000}),/Orçamento/);
 assert.throws(()=>validateAdsChange({campaignId:'123',action:'delete'}),/não suportada/);
 assert.throws(()=>validateAdsChange({campaignId:'123',action:'pause',value:10}),/não aceita valor/);
 assert.throws(()=>buildAdsPreview({campaignId:123,action:'resume'},{kind:'gms',statusGroup:'active'}),/pausada/);
 assert.throws(()=>buildAdsPreview({campaignId:123,action:'change_roas_target',value:5},{kind:'manual'}),/GMS/);
});
test('Busca campanha no catálogo oficial da loja e confirma status antes da edição',async()=>{
 const calls=[];
 const result=await liveAdsCampaign({}, {shopId:1,accessToken:'fake'},async(_cfg,req)=>{
  calls.push(req.path);
  if(req.path.includes('campaign_id_list'))
   return {response:{has_next_page:false,campaign_list:[{campaign_id:123,ad_type:'manual'}]}};
  if(req.path.includes('campaign_setting_info'))
   return {response:{campaign_list:[{campaign_id:123,common_info:{campaign_status:'ongoing',ad_name:'Meu Ads'}}]}};
  throw Error('Unexpected endpoint');
 },123);
 assert.equal(result.kind,'manual');assert.equal(result.status,'ongoing');
 assert.equal(calls.length,2);
});
