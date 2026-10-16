import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  shopeeConfig, buildShopeeAuthorizationUrl, exchangeShopeeCode,
  refreshShopeeToken, getShopeeShopInfo, normalizeShopeeTokenResult, safeShopeeStatus
} from '../shopee.js';

const cfg={
  mode:'live', host:'https://partner.shopeemobile.com', partnerId:2047694,
  partnerKey:'segredo-apenas-de-teste',
  redirectUri:'https://exemplo.com/auth/shopee/callback', configured:true
};
function sign(path,ts,tail=''){
  return crypto.createHmac('sha256',cfg.partnerKey)
    .update(`${cfg.partnerId}${path}${ts}${tail}`).digest('hex');
}

test('link de autorização V2 contém path, timestamp, sign e redirect',()=>{
  const u=new URL(buildShopeeAuthorizationUrl(cfg));
  assert.equal(u.pathname,'/api/v2/shop/auth_partner');
  assert.equal(u.searchParams.get('partner_id'),'2047694');
  assert.equal(u.searchParams.get('redirect'),cfg.redirectUri);
  const ts=Number(u.searchParams.get('timestamp'));
  assert.ok(Math.abs(Date.now()/1000-ts)<10);
  assert.equal(u.searchParams.get('sign'),sign(u.pathname,ts));
  assert.equal(u.searchParams.has('partner_key'),false);
});
test('não permite link com chaves ausentes',()=>{
  assert.throws(()=>buildShopeeAuthorizationUrl({...cfg,configured:false}),/Configure/);
});
test('token get usa assinatura pública e shop_id no POST',async()=>{
  const old=globalThis.fetch;
  try {
    let seen;
    globalThis.fetch=async(url,options)=>{
      seen={url:new URL(url),options};
      return new Response(JSON.stringify({access_token:'a',refresh_token:'r',shop_id:123,expire_in:14400}),{status:200});
    };
    const result=await exchangeShopeeCode(cfg,{code:'cod',shopId:123});
    assert.equal(result.shop_id,123);
    assert.equal(seen.url.pathname,'/api/v2/auth/token/get');
    assert.equal(seen.url.searchParams.get('sign'),sign(seen.url.pathname,seen.url.searchParams.get('timestamp')));
    assert.deepEqual(JSON.parse(seen.options.body),{code:'cod',partner_id:2047694,shop_id:123});
  } finally {globalThis.fetch=old;}
});
test('refresh usa assinatura pública e código certo',async()=>{
  const old=globalThis.fetch;
  try {
    let seen;
    globalThis.fetch=async(url,options)=>{
      seen={url:new URL(url),options};
      return new Response(JSON.stringify({access_token:'novo',refresh_token:'novo-refresh'}),{status:200});
    };
    await refreshShopeeToken(cfg,{refreshToken:'anterior',shopId:42});
    assert.equal(seen.url.pathname,'/api/v2/auth/access_token/get');
    assert.equal(seen.url.searchParams.get('sign'),sign(seen.url.pathname,seen.url.searchParams.get('timestamp')));
    assert.equal(JSON.parse(seen.options.body).shop_id,42);
  } finally {globalThis.fetch=old;}
});
test('consulta da loja inclui assinatura vinculada ao access_token e shop_id',async()=>{
  const old=globalThis.fetch;
  try {
    let u;
    globalThis.fetch=async(url)=>{u=new URL(url);return new Response(JSON.stringify({shop_name:'teste'}),{status:200});};
    const v=await getShopeeShopInfo(cfg,{accessToken:'acesso',shopId:852701218});
    assert.equal(v.shop_name,'teste');
    assert.equal(u.searchParams.get('sign'),sign(u.pathname,u.searchParams.get('timestamp'),'acesso852701218'));
  } finally {globalThis.fetch=old;}
});
test('status não revela tokens nem aceita Sandbox como conexão Live',()=>{
  const auth={accessToken:'segredo',refreshToken:'refresh',shopId:42,mode:'sandbox',partnerId:1247051};
  const status=safeShopeeStatus(auth,cfg);
  assert.equal(status.connected,false);
  assert.equal(JSON.stringify(status).includes('segredo'),false);
  const connected=safeShopeeStatus({...auth,mode:'live',partnerId:2047694},cfg);
  assert.equal(connected.connected,true);
});
test('normaliza validade e identificador do token',()=>{
  const r=normalizeShopeeTokenResult({access_token:'a',refresh_token:'b',shop_id:12,expire_in:14400});
  assert.equal(r.shopId,12);
  assert.equal(r.shopIds.length,0);
  assert.ok(r.expiresAt>Date.now()+14000*1000);
});
