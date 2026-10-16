import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  buildShopeeAuthorizationUrl,exchangeShopeeCode,refreshShopeeToken,
  getShopeeShopInfo,callShopeeShopApi,safeShopeeStatus,normalizeShopeeTokenResult
} from '../shopee.js';

const cfg={
  configured:true,mode:'live',host:'https://partner.shopeemobile.com',
  partnerId:2047694,partnerKey:'chave-local-apenas-para-teste',
  redirectUri:'https://redeachados-shopee.onrender.com/auth/shopee/callback'
};
function expectedSign(path,timestamp,tail=''){
  return crypto.createHmac('sha256',cfg.partnerKey)
    .update(`${cfg.partnerId}${path}${timestamp}${tail}`).digest('hex');
}
test('link de autorização Shopee V2 é assinado e aponta ao serviço Shopee',()=>{
  const url=new URL(buildShopeeAuthorizationUrl(cfg));
  assert.equal(url.host,'partner.shopeemobile.com');
  assert.equal(url.pathname,'/api/v2/shop/auth_partner');
  assert.equal(url.searchParams.get('partner_id'),String(cfg.partnerId));
  assert.equal(url.searchParams.get('redirect'),cfg.redirectUri);
  assert.equal(url.searchParams.get('sign'),expectedSign(url.pathname,url.searchParams.get('timestamp')));
  assert.equal(url.searchParams.has('state'),false);
  assert.ok(Math.abs(Date.now()/1000-Number(url.searchParams.get('timestamp')))<15);
});
test('assinatura bloqueia config sem chave',()=>{
  assert.throws(()=>buildShopeeAuthorizationUrl({...cfg,configured:false}),/Configure/);
});
test('troca code por token com assinatura pública, sem divulgar chave',async()=>{
  const old=globalThis.fetch;
  let url,opt;
  globalThis.fetch=async(u,o)=>{
    url=new URL(u);opt=o;
    return new Response(JSON.stringify({access_token:'token',refresh_token:'refresh',shop_id:123,expire_in:14400}),{status:200});
  };
  try{
    const data=await exchangeShopeeCode(cfg,{code:'abc',shopId:123});
    assert.equal(data.shop_id,123);
    assert.equal(url.pathname,'/api/v2/auth/token/get');
    assert.equal(url.searchParams.get('sign'),expectedSign(url.pathname,url.searchParams.get('timestamp')));
    assert.deepEqual(JSON.parse(opt.body),{code:'abc',partner_id:cfg.partnerId,shop_id:123});
    assert.ok(!url.href.includes(cfg.partnerKey));
  }finally{globalThis.fetch=old;}
});
test('renova token com assinatura pública e shop_id correto',async()=>{
  const old=globalThis.fetch;
  let url,body;
  globalThis.fetch=async(u,o)=>{
    url=new URL(u);body=JSON.parse(o.body);
    return new Response(JSON.stringify({access_token:'novo',refresh_token:'novo-refresh'}),{status:200});
  };
  try{
    await refreshShopeeToken(cfg,{refreshToken:'anterior',shopId:123});
    assert.equal(url.pathname,'/api/v2/auth/access_token/get');
    assert.equal(url.searchParams.get('sign'),expectedSign(url.pathname,url.searchParams.get('timestamp')));
    assert.equal(body.shop_id,123);
    assert.equal(body.refresh_token,'anterior');
  }finally{globalThis.fetch=old;}
});
test('consultas autenticadas incluem token e shop na assinatura',async()=>{
  const old=globalThis.fetch;
  let url;
  globalThis.fetch=async(u)=>{url=new URL(u);return new Response(JSON.stringify({shop_name:'Rede Achados'}),{status:200});};
  try{
    const info=await getShopeeShopInfo(cfg,{accessToken:'tok',shopId:852701218});
    assert.equal(info.shop_name,'Rede Achados');
    assert.equal(url.searchParams.get('sign'),expectedSign(url.pathname,url.searchParams.get('timestamp'),'tok852701218'));
    const data=await callShopeeShopApi(cfg,{path:'/api/v2/product/get_item_list',accessToken:'tok',shopId:852701218,query:{offset:0,page_size:50,item_status:'NORMAL'}});
    assert.equal(data.shop_name,'Rede Achados');
    assert.equal(url.searchParams.get('page_size'),'50');
  }finally{globalThis.fetch=old;}
});
test('Sandbox não aparece como Live conectado e status esconde segredos',()=>{
  const auth={accessToken:'private',refreshToken:'secret',shopId:11,mode:'sandbox',partnerId:1247051};
  let status=safeShopeeStatus(auth,cfg);
  assert.equal(status.connected,false);
  assert.equal(JSON.stringify(status).includes('private'),false);
  assert.equal(JSON.stringify(status).includes('secret'),false);
  status=safeShopeeStatus({...auth,mode:'live',partnerId:cfg.partnerId},cfg);
  assert.equal(status.connected,true);
});
test('normaliza acesso e expiração de token',()=>{
  const auth=normalizeShopeeTokenResult({shop_id:11,access_token:'a',refresh_token:'b',expire_in:14400});
  assert.equal(auth.shopId,11);
  assert.ok(auth.expiresAt>Date.now()+14300*1000);
});
