import crypto from 'node:crypto';
// Somente leitura; nao expoe tokens da Shopee ou dados pessoais.
const path='/api/finance-bridge/v1/snapshot';
const allowedOrigins=new Set(['https://redeachadosbrfinancas.netlify.app','http://127.0.0.1:8765','http://localhost:8765']);
function header(req,res){
  const origin=String(req.headers.origin||'');
  if(origin&&!allowedOrigins.has(origin)){res.status(403).json({error:'Origem nao autorizada.'});return false;}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return true;
}
function authorized(req,res,next){
  if(!header(req,res))return;
  const expected=String(process.env.FINANCE_BRIDGE_KEY||'');
  if(expected.length<32)return res.status(503).json({error:'Ponte financeira nao configurada no servidor.'});
  const actual=String(req.headers['x-finance-bridge-key']||'');
  const a=Buffer.from(expected),b=Buffer.from(actual);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Chave da ponte financeira invalida.'});
  next();
}
// O relatório envolve muitas chamadas à Shopee (um repasse por pedido).
// Nunca bloquear a função Netlify enquanto essa coleta é feita.
export function installFinanceBridge(app,loadSnapshot){
  const TTL_MS=10*60*1000;
  const RETRY_AFTER_FAILURE_MS=30000;
  let cached=null,storedAt=0,job=null,lastFailure=null;
  const begin=()=>{
    if(job)return;
    job=Promise.resolve().then(()=>loadSnapshot()).then(data=>{
      if(data?.schema!=='ra-finance-bridge-v1'||data?.platform!=='shopee'||!Array.isArray(data.orders))
        throw Error('SHOPEE_BRIDGE_INVALID_RESULT');
      cached=data;storedAt=Date.now();lastFailure=null;
    }).catch(e=>{
      const msg=String(e?.message||e||'');
      const code=/permission|denied|forbidden|403/i.test(msg)?'PERMISSION_DENIED':
        /autoriz|token|shop.*conectad/i.test(msg)?'SHOPEE_AUTH_REQUIRED':'COLLECTION_FAILED';
      lastFailure={at:Date.now(),code};
      console.warn('[Finance Bridge] Shopee collection failed:',code);
    }).finally(()=>{job=null;});
  };
  app.options(path,(req,res)=>{
    if(!header(req,res))return;
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','X-Finance-Bridge-Key, Accept');
    res.status(204).end();
  });
  app.get(path,authorized,(req,res)=>{
    const now=Date.now();
    if(cached){
      if(now-storedAt>TTL_MS&&(!lastFailure||now-lastFailure.at>RETRY_AFTER_FAILURE_MS))begin();
      return res.json({
        ...cached,
        cache:{status:job?'updating':'ready',ageSeconds:Math.max(0,Math.floor((now-storedAt)/1000))}
      });
    }
    if(!job && lastFailure && now-lastFailure.at<RETRY_AFTER_FAILURE_MS)
      return res.status(503).json({error:lastFailure.code,retryAfterSeconds:30});
    begin();
    res.setHeader('Retry-After','12');
    return res.status(202).json({status:'pending',retryAfterSeconds:12,
      message:'Coleta financeira Shopee em andamento. Nenhum valor foi considerado zero.'});
  });
}

const walletPath='/api/finance-bridge/v1/wallet';
export function installWalletBridge(app,loadWallet){
 let cache=null,storedAt=0,job=null,failed=null;
 const ttl=5*60*1000;
 const begin=()=>{
  if(job)return;
  job=Promise.resolve().then(loadWallet).then(v=>{
   if(v?.schema!=='ra-wallet-bridge-v1'||v.platform!=='shopee'||!Array.isArray(v.movements))
    throw Error('WALLET_RESPONSE_INVALID');
   cache=v;storedAt=Date.now();failed=null;
  }).catch(err=>{
   const msg=String(err?.message||err||'');
   failed={at:Date.now(),code:/permission|denied|forbidden|403|not.allowed/i.test(msg)
    ?'PAYMENT_PERMISSION_REQUIRED':/auth|token|conectad/i.test(msg)?'SHOPEE_AUTH_REQUIRED':'WALLET_UNAVAILABLE'};
   console.warn('[Finance Wallet] Shopee wallet unavailable:',failed.code);
  }).finally(()=>{job=null});
 };
 app.options(walletPath,(req,res)=>{
  if(!header(req,res))return;
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','X-Finance-Bridge-Key, Accept');
  res.status(204).end();
 });
 app.get(walletPath,authorized,(_req,res)=>{
  const now=Date.now();
  if(cache&&now-storedAt<ttl)return res.json(cache);
  if(failed&&now-failed.at<30000)return res.status(503).json({error:failed.code});
  begin();
  res.setHeader('Retry-After','8');
  return res.status(202).json({status:'pending',retryAfterSeconds:8});
 });
}


const adsPath='/api/finance-bridge/v1/ads';
export function installAdsFinanceBridge(app,loadAds){
 const cache=new Map(),jobs=new Map(),failures=new Map(),ttl=15*60*1000;
 app.get(adsPath,authorized,(req,res)=>{
  const month=String(req.query?.month||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
   return res.status(400).json({error:'INVALID_ADS_MONTH'});
  const last=cache.get(month),now=Date.now();
  if(last&&now-last.at<ttl)return res.json(last.data);
  if(last&&!jobs.has(month)){
   Promise.resolve().then(()=>loadAds(month)).then(data=>{
    if(data?.schema!=='ra-ads-report-v1'||data.platform!=='shopee')
     throw Error('INVALID_SHOPEE_ADS_RESPONSE');
    cache.set(month,{data,at:Date.now()});failures.delete(month);
   }).catch(err=>{
    const message=String(err?.message||'');
    failures.set(month,{at:Date.now(),code:/permission|forbidden|denied|unauthorized|403/i.test(message)
     ?'SHOPEE_ADS_PERMISSION_REQUIRED':message==='ADS_PERIOD_EXPIRED'?'SHOPEE_ADS_PERIOD_EXPIRED':'SHOPEE_ADS_UNAVAILABLE'});
   }).finally(()=>jobs.delete(month)).then(()=>{});
  }
  if(last)return res.json({...last.data,cache:{status:jobs.has(month)?'refreshing':'stale'}});
  const failure=failures.get(month);
  if(failure&&now-failure.at<45000)
   return res.status(503).json({error:failure.code,retryAfterSeconds:45});
  if(!jobs.has(month)){
   const job=Promise.resolve().then(()=>loadAds(month)).then(data=>{
    if(data?.schema!=='ra-ads-report-v1'||data.platform!=='shopee')
     throw Error('INVALID_SHOPEE_ADS_RESPONSE');
    cache.set(month,{data,at:Date.now()});failures.delete(month);
   }).catch(err=>{
    const message=String(err?.message||'');
    failures.set(month,{at:Date.now(),code:/permission|forbidden|denied|unauthorized|403/i.test(message)
     ?'SHOPEE_ADS_PERMISSION_REQUIRED':message==='ADS_PERIOD_EXPIRED'?'SHOPEE_ADS_PERIOD_EXPIRED':'SHOPEE_ADS_UNAVAILABLE'});
   }).finally(()=>jobs.delete(month));
   jobs.set(month,job);
  }
  res.setHeader('Retry-After','7');
  return res.status(202).json({status:'pending',retryAfterSeconds:7});
 });
}
