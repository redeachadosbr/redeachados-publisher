import express from 'express';
import session from 'express-session';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  shopeeConfig,buildShopeeAuthorizationUrl,exchangeShopeeCode,refreshShopeeToken,
  getShopeeShopInfo,normalizeShopeeTokenResult,safeShopeeStatus
} from './shopee.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR=path.join(__dirname,'data');
const AUTH_FILE=path.join(DATA_DIR,'shopee-auth.json');
fs.mkdirSync(DATA_DIR,{recursive:true});
const app=express();
app.set('trust proxy',1);
const PORT=Number(process.env.PORT||10000);

function envText(name){return String(process.env[name]||'').trim();}
function baseUrl(req){return (envText('PUBLIC_BASE_URL')||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');}
function loadAuth(){try{return JSON.parse(fs.readFileSync(AUTH_FILE,'utf8'));}catch{return null;}}
function saveAuth(auth){fs.writeFileSync(AUTH_FILE,JSON.stringify(auth,null,2));}
function stateSecret(){return envText('SESSION_SECRET')||envText('APP_PASSWORD')||'redeachados-shopee-state';}
function createState(){
  const body=Buffer.from(JSON.stringify({v:1,ts:Date.now(),nonce:crypto.randomBytes(18).toString('hex')}),'utf8').toString('base64url');
  const sig=crypto.createHmac('sha256',stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyState(raw){
  try{
    const [body,sig,...rest]=String(raw||'').split('.');
    if(!body||!sig||rest.length)return false;
    const expected=crypto.createHmac('sha256',stateSecret()).update(body).digest('base64url');
    const a=Buffer.from(sig),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return false;
    const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    return p?.v===1&&Date.now()-Number(p.ts)<=10*60*1000&&Date.now()>=Number(p.ts)-60000;
  }catch{return false;}
}
function mustLogin(req,res,next){
  const required=envText('APP_PASSWORD');
  if(!required||req.session?.appAuth)return next();
  if(req.path.startsWith('/api/'))return res.status(401).json({error:'LOGIN_REQUIRED'});
  return res.redirect('/');
}

app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret:stateSecret(),resave:false,saveUninitialized:false,proxy:true,
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:12*60*60*1000}
}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'Rede Achados BR Shopee API',version:'1.0.0'}));
app.get('/api/auth-state',(req,res)=>res.json({locked:Boolean(envText('APP_PASSWORD')),loggedIn:!envText('APP_PASSWORD')||Boolean(req.session?.appAuth)}));
app.post('/api/login',(req,res)=>{
  const required=envText('APP_PASSWORD');
  if(!required||String(req.body.password||'')===required){req.session.appAuth=true;return res.json({ok:true});}
  res.status(401).json({error:'Senha incorreta.'});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get('/api/shopee/status',mustLogin,(req,res)=>{
  const cfg=shopeeConfig(baseUrl(req));
  res.json(safeShopeeStatus(loadAuth(),cfg));
});
app.get('/auth/shopee/start',mustLogin,(req,res)=>{
  try{res.redirect(buildShopeeAuthorizationUrl(shopeeConfig(baseUrl(req)),createState()));}
  catch(e){res.status(400).send(`<h2>Shopee API não configurada</h2><p>${String(e.message||e)}</p><p><a href="/">Voltar</a></p>`);}
});
app.get('/auth/shopee/callback',async(req,res)=>{
  try{
    if(!verifyState(req.query.state))throw new Error('Estado de autorização Shopee inválido ou expirado.');
    const cfg=shopeeConfig(baseUrl(req));
    const shopId=Number(req.query.shop_id||0);
    const data=await exchangeShopeeCode(cfg,{code:String(req.query.code||''),shopId});
    const auth=normalizeShopeeTokenResult(data,shopId);
    if(!auth.accessToken||!auth.refreshToken||!auth.shopId)throw new Error('A Shopee não retornou todos os dados esperados.');
    saveAuth({...auth,mode:cfg.mode,partnerId:cfg.partnerId});
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Shopee conectada</title><body style="font-family:Arial;padding:32px"><h2>✅ Shopee conectada com sucesso</h2><p>Shop ID: <strong>${auth.shopId}</strong></p><p>Ambiente: <strong>${cfg.mode}</strong></p><p><a href="/">Voltar ao sistema Shopee</a></p></body>`);
  }catch(e){
    res.status(400).type('html').send(`<!doctype html><meta charset="utf-8"><title>Erro Shopee</title><body style="font-family:Arial;padding:32px"><h2>❌ Não foi possível concluir a autorização</h2><p>${String(e.message||e)}</p><p><a href="/">Voltar</a></p></body>`);
  }
});
app.post('/api/shopee/refresh',mustLogin,async(req,res)=>{
  try{
    const current=loadAuth()||{};
    const cfg=shopeeConfig(baseUrl(req));
    const data=await refreshShopeeToken(cfg,{refreshToken:current.refreshToken,shopId:current.shopId});
    const next=normalizeShopeeTokenResult(data,current.shopId);
    const auth={...current,...next,shopIds:next.shopIds.length?next.shopIds:(current.shopIds||[]),lastRefreshAt:new Date().toISOString()};
    saveAuth(auth);res.json({ok:true,...safeShopeeStatus(auth,cfg)});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});
app.get('/api/shopee/test-shop',mustLogin,async(req,res)=>{
  try{
    const auth=loadAuth()||{};
    const cfg=shopeeConfig(baseUrl(req));
    const data=await getShopeeShopInfo(cfg,{accessToken:auth.accessToken,shopId:auth.shopId});
    res.json({ok:true,shopId:auth.shopId,response:data});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.listen(PORT,()=>console.log(`Rede Achados BR Shopee API em http://localhost:${PORT}`));
