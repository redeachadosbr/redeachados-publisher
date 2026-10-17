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
