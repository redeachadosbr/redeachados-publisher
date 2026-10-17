import crypto from 'node:crypto';
import {ProxyAgent} from 'undici';

function envText(name){ return String(process.env[name]||'').trim(); }

let proxyAgent=null;
let proxyAgentKey='';

function shopeeProxyConfig(){
  const host=envText('SHOPEE_PROXY_HOST');
  const port=Number(envText('SHOPEE_PROXY_PORT')||0);
  const user=envText('SHOPEE_PROXY_USER');
  const password=envText('SHOPEE_PROXY_PASSWORD');

  if(host&&Number.isInteger(port)&&port>0&&port<=65535){
    const auth=(user||password)?`${encodeURIComponent(user)}:${encodeURIComponent(password)}@`:'';
    return {
      configured:true,
      provider:'Oracle Squid',
      url:`http://${auth}${host}:${port}`,
      host,
      port,
      authenticationConfigured:Boolean(user&&password)
    };
  }

  return {
    configured:false,
    provider:'direct',
    url:'',
    host:'',
    port:0,
    authenticationConfigured:false
  };
}

function shopeeFetch(url,options={}){
  const proxy=shopeeProxyConfig();
  const request={...options,signal:options.signal??AbortSignal.timeout(15000)};
  if(!proxy.configured) return fetch(url,request);

  if(!proxyAgent||proxyAgentKey!==proxy.url){
    proxyAgent=new ProxyAgent(proxy.url);
    proxyAgentKey=proxy.url;
  }
  return fetch(url,{...request,dispatcher:proxyAgent});
}

export function shopeeProxyStatus(){
  const proxy=shopeeProxyConfig();
  return {
    configured:proxy.configured,
    provider:proxy.provider,
    host:proxy.host||undefined,
    port:proxy.port||undefined,
    authenticationConfigured:proxy.authenticationConfigured
  };
}

export async function getShopeeOutboundIp(){
  const r=await shopeeFetch('https://api.ipify.org?format=json',{headers:{Accept:'application/json,text/plain;q=0.9,*/*;q=0.8'}});
  const text=await r.text();
  if(!r.ok) throw new Error(`Proxy IP check HTTP ${r.status}`);
  try{return JSON.parse(text);}catch{return {ip:text.trim()};}
}

export function shopeeConfig(publicBaseUrl=''){
  const mode=String(envText('SHOPEE_ENV')||'sandbox').toLowerCase()==='live'?'live':'sandbox';
  const partnerId=Number(envText('SHOPEE_PARTNER_ID')||0);
  const partnerKey=envText('SHOPEE_PARTNER_KEY');
  const host=mode==='live'?'https://partner.shopeemobile.com':'https://openplatform.sandbox.test-stable.shopee.sg';
  const redirectUri=envText('SHOPEE_REDIRECT_URI') || `${String(publicBaseUrl||'').replace(/\/$/,'')}/auth/shopee/callback`;
  return {
    mode,host,partnerId,partnerKey,redirectUri,
    configured:Number.isInteger(partnerId)&&partnerId>0&&Boolean(partnerKey)&&/^https:\/\//i.test(redirectUri)
  };
}

function publicSign(cfg,path,timestamp){
  return crypto.createHmac('sha256',cfg.partnerKey)
    .update(`${cfg.partnerId}${path}${timestamp}`).digest('hex');
}
function shopSign(cfg,path,timestamp,accessToken,shopId){
  return crypto.createHmac('sha256',cfg.partnerKey)
    .update(`${cfg.partnerId}${path}${timestamp}${accessToken}${shopId}`).digest('hex');
}

export async function callShopeeShopApi(cfg,{path,method='GET',accessToken,shopId,query={},body=null}={}){
  requireConfigured(cfg);
  if(!path||!String(path).startsWith('/api/v2/')) throw new Error('Caminho da API Shopee inválido.');
  if(!accessToken||!shopId) throw new Error('access_token/shop_id da Shopee ausentes.');
  const timestamp=Math.floor(Date.now()/1000);
  const url=new URL(cfg.host+path);
  url.searchParams.set('partner_id',String(cfg.partnerId));
  url.searchParams.set('timestamp',String(timestamp));
  url.searchParams.set('access_token',String(accessToken));
  url.searchParams.set('shop_id',String(shopId));
  url.searchParams.set('sign',shopSign(cfg,path,timestamp,String(accessToken),Number(shopId)));
  for(const [key,value] of Object.entries(query||{})){
    if(value===undefined||value===null||value==='') continue;
    if(Array.isArray(value)) url.searchParams.set(key,value.join(','));
    else url.searchParams.set(key,String(value));
  }
  const options={method:String(method||'GET').toUpperCase(),headers:{Accept:'application/json'}};
  if(body!==null&&body!==undefined){
    options.headers['Content-Type']='application/json';
    options.body=JSON.stringify(body);
  }
  return readJson(await shopeeFetch(url,options));
}
// MediaSpace upload_part/complete are Public APIs: do not use shop signatures.
export async function callShopeePublicMediaApi(cfg,{path,form,body}={}){
 requireConfigured(cfg);
 if(!['/api/v2/media_space/upload_video_part','/api/v2/media_space/complete_video_upload',
     '/api/v2/media_space/upload_image'].includes(path))throw Error('Operação de mídia inválida.');
 const timestamp=Math.floor(Date.now()/1000),url=new URL(cfg.host+path);
 url.searchParams.set('partner_id',String(cfg.partnerId));
 url.searchParams.set('timestamp',String(timestamp));
 url.searchParams.set('sign',publicSign(cfg,path,timestamp));
 const headers={Accept:'application/json'};
 if(!form)headers['Content-Type']='application/json';
 return readJson(await shopeeFetch(url,{method:'POST',headers,
   body:form||JSON.stringify(body),signal:AbortSignal.timeout(60000)}));
}
function requireConfigured(cfg){
  if(!cfg?.configured) throw new Error('Configure SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY e SHOPEE_REDIRECT_URI.');
}
async function readJson(response){
  const text=await response.text();
  let data={};
  try{data=text?JSON.parse(text):{};}catch{data={message:text||`HTTP ${response.status}`};}
  if(!response.ok) throw new Error(data?.message||data?.error||`Shopee HTTP ${response.status}`);
  if(data?.error){
    const requestId=data?.request_id?` · request_id: ${data.request_id}`:'';
    throw new Error(`${data.error}${data.message?': '+data.message:''}${requestId}`);
  }
  return data;
}
export function buildShopeeAuthorizationUrl(cfg){
  requireConfigured(cfg);
  const path='/api/v2/shop/auth_partner';
  const timestamp=Math.floor(Date.now()/1000);
  const url=new URL(cfg.host+path);
  url.searchParams.set('partner_id',String(cfg.partnerId));
  url.searchParams.set('timestamp',String(timestamp));
  url.searchParams.set('sign',publicSign(cfg,path,timestamp));
  url.searchParams.set('redirect',cfg.redirectUri);
  return url.toString();
}
/**
 * Verifica a aceitação da assinatura no endpoint de autorização sem expor a
 * Partner Key, URLs assinadas ou tokens. Requisições apenas de leitura.
 * O navegador do lojista continua sendo necessário para a autorização real.
 */
export async function diagnoseShopeeSignature(cfg,{httpFetch=fetch}={}){
  requireConfigured(cfg);
  const candidates=[{format:'as_configured',key:cfg.partnerKey}];
  if(/^shpk/i.test(cfg.partnerKey)&&cfg.partnerKey.length>4){
    candidates.push({format:'without_shpk_prefix',key:cfg.partnerKey.slice(4)});
  }
  const results=[];
  for(const candidate of candidates){
    let response;
    try {
      // Endpoint consultado diretamente, como acontece no navegador.
      // Não encaminhar chave em corpo, URL ou header.
      const url=buildShopeeAuthorizationUrl({...cfg,partnerKey:candidate.key});
      response=await httpFetch(url,{
        method:'GET',redirect:'manual',
        headers:{Accept:'text/html,application/json'},
        signal:AbortSignal.timeout(9000)
      });
      const contentType=String(response.headers?.get?.('content-type')||'').toLowerCase();
      const raw=(await response.text()).slice(0,1500);
      let data={};
      if(contentType.includes('json')||raw.trimStart().startsWith('{')){
        try{data=JSON.parse(raw);}catch{}
      }
      const error=String(data.error||'').slice(0,80);
      const classification=error==='error_sign'?'wrong_sign'
        :error?'different_api_error'
        :response.status>=300&&response.status<400?'authorization_redirect'
        :response.ok&&contentType.includes('text/html')?'authorization_page'
        :'inconclusive';
      const dateHeader=response.headers?.get?.('date');
      const serverMs=dateHeader?Date.parse(dateHeader):NaN;
      const driftSeconds=Number.isFinite(serverMs)?Math.round(Math.abs(Date.now()-serverMs)/1000):null;
      results.push({
        format:candidate.format,
        classification,
        httpStatus:response.status,
        errorCode:error||null,
        requestId:typeof data.request_id==='string'?data.request_id.slice(0,80):null,
        clockDriftSeconds:driftSeconds
      });
    }catch{
      results.push({format:candidate.format,classification:'network_error',httpStatus:null,errorCode:null,requestId:null,clockDriftSeconds:null});
    }
  }
  const first=results[0];
  const second=results[1];
  let recommendation='A resposta não permitiu confirmar a assinatura. Verifique a conexão com a Shopee e tente novamente.';
  if(first.classification==='wrong_sign'&&second?.classification==='wrong_sign'){
    recommendation='Ambos os formatos retornaram Wrong sign. Confira a Live Partner Key no console e substitua apenas SHOPEE_PARTNER_KEY no Render, sem divulgá-la.';
  }else if(first.classification==='wrong_sign'&&
    ['authorization_redirect','authorization_page'].includes(second?.classification)){
    recommendation='O teste indica que a assinatura sem o prefixo shpk passou da etapa que rejeitava a chave completa. É necessário ajustar o formato antes de conectar.';
  }else if(['authorization_redirect','authorization_page'].includes(first.classification)){
    recommendation='A assinatura original não retornou Wrong sign neste teste. Tente uma nova autorização pelo botão Conectar Shopee; não reutilize links antigos.';
  }else if(first.classification==='wrong_sign'){
    recommendation='A assinatura atual foi rejeitada. Confira a Live Partner Key no Render e o Partner ID correspondente.';
  }else if(first.classification==='different_api_error'){
    recommendation='A assinatura não apresentou Wrong sign, mas a Shopee retornou outro erro. Verifique código e request ID.';
  }
  return {
    mode:cfg.mode,partnerId:cfg.partnerId,
    keyHasShpkPrefix:/^shpk/i.test(cfg.partnerKey),
    checkedAt:new Date().toISOString(),
    results,recommendation
  };
}

export async function exchangeShopeeCode(cfg,{code,shopId}={}){
  requireConfigured(cfg);
  if(!code)throw new Error('Shopee não retornou o code de autorização.');
  const path='/api/v2/auth/token/get';
  const timestamp=Math.floor(Date.now()/1000);
  const url=new URL(cfg.host+path);
  url.searchParams.set('partner_id',String(cfg.partnerId));
  url.searchParams.set('timestamp',String(timestamp));
  url.searchParams.set('sign',publicSign(cfg,path,timestamp));
  const body={code:String(code),partner_id:cfg.partnerId};
  if(shopId)body.shop_id=Number(shopId);
  return readJson(await shopeeFetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)}));
}
export async function refreshShopeeToken(cfg,{refreshToken,shopId}={}){
  requireConfigured(cfg);
  if(!refreshToken||!shopId)throw new Error('refresh_token/shop_id da Shopee ausentes.');
  const path='/api/v2/auth/access_token/get';
  const timestamp=Math.floor(Date.now()/1000);
  const url=new URL(cfg.host+path);
  url.searchParams.set('partner_id',String(cfg.partnerId));
  url.searchParams.set('timestamp',String(timestamp));
  url.searchParams.set('sign',publicSign(cfg,path,timestamp));
  const body={partner_id:cfg.partnerId,refresh_token:String(refreshToken),shop_id:Number(shopId)};
  return readJson(await shopeeFetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)}));
}
export async function getShopeeShopInfo(cfg,{accessToken,shopId}={}){
  requireConfigured(cfg);
  if(!accessToken||!shopId)throw new Error('access_token/shop_id da Shopee ausentes.');
  const path='/api/v2/shop/get_shop_info';
  const timestamp=Math.floor(Date.now()/1000);
  const url=new URL(cfg.host+path);
  url.searchParams.set('partner_id',String(cfg.partnerId));
  url.searchParams.set('timestamp',String(timestamp));
  url.searchParams.set('access_token',String(accessToken));
  url.searchParams.set('shop_id',String(shopId));
  url.searchParams.set('sign',shopSign(cfg,path,timestamp,String(accessToken),Number(shopId)));
  return readJson(await shopeeFetch(url,{headers:{Accept:'application/json'}}));
}
export function normalizeShopeeTokenResult(data,requestedShopId=0){
  const shopIds=Array.isArray(data?.shop_id_list)?data.shop_id_list.map(Number).filter(Boolean):[];
  const shopId=Number(requestedShopId||data?.shop_id||shopIds[0]||0);
  const expireIn=Number(data?.expire_in||0);
  const expiresAt=expireIn>1000000000?expireIn*1000:(expireIn>0?Date.now()+expireIn*1000:0);
  return {
    shopId,shopIds,accessToken:String(data?.access_token||''),refreshToken:String(data?.refresh_token||''),
    expiresAt,connectedAt:new Date().toISOString()
  };
}
export function safeShopeeStatus(auth,cfg){
  return {
    configured:Boolean(cfg?.configured),mode:cfg?.mode||'sandbox',partnerId:cfg?.partnerId||0,
    redirectUri:cfg?.redirectUri||'',apiHost:cfg?.host||'',
    connected:Boolean(auth?.accessToken&&auth?.refreshToken&&auth?.shopId&&auth?.mode===cfg?.mode&&auth?.partnerId===cfg?.partnerId),
    shopId:Number(auth?.shopId||0),shopIds:Array.isArray(auth?.shopIds)?auth.shopIds:[],
    expiresAt:Number(auth?.expiresAt||0),connectedAt:auth?.connectedAt||null,lastRefreshAt:auth?.lastRefreshAt||null
  };
}

