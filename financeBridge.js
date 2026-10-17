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
export function installFinanceBridge(app,loadSnapshot){
  app.options(path,(req,res)=>{if(!header(req,res))return;res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','X-Finance-Bridge-Key, Accept');res.status(204).end();});
  app.get(path,authorized,async(req,res)=>{
    try{res.json(await loadSnapshot(req));}
    catch(e){const raw=String(e?.message||e);res.status(/permission|denied|403|forbidden/i.test(raw)?403:502).json({error:'Nao foi possivel consultar dados financeiros Shopee. Confira autorizacao Payment e Ads no Publisher.'});}
  });
}
