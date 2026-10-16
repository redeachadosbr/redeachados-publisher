import express from 'express';
import session from 'express-session';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAuthStore} from './authStore.js';
import {mergeShopeeOrderDates} from './orderView.js';
import {createShopeeOrderMonitor} from './orderMonitor.js';
import {loadShopeeAdsOverview} from './adsReport.js';
import {fetchCatalogPage,normalizeShopeeModels,validItemId} from './catalog.js';
import {storeCatalogItems,storeCatalogModels,readCatalogCache,catalogStoreReady} from './catalogStore.js';
import {previewWeDropCsv,prepareWeDropImport,MAX_CSV_CHARS} from './wedropCsv.js';
import {saveWeDropCosts,getWeDropCoverage,compareIncomingCosts,pendingWeDropModels} from './wedropCosts.js';
import {readWeDropSyncState} from './wedropCosts.js';
import {createWeDropAutoScheduler,importSupplierAutomatically,supplierFeedConfig} from './wedropAutoSync.js';
import {
  shopeeConfig,buildShopeeAuthorizationUrl,exchangeShopeeCode,refreshShopeeToken,
  getShopeeShopInfo,normalizeShopeeTokenResult,safeShopeeStatus,callShopeeShopApi,
  shopeeProxyStatus,getShopeeOutboundIp,diagnoseShopeeSignature
} from './shopee.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR=path.join(__dirname,'data');
const AUTH_FILE=path.join(DATA_DIR,'shopee-auth.json');
fs.mkdirSync(DATA_DIR,{recursive:true});
const authStore=createAuthStore({localFile:AUTH_FILE});
const app=express();
app.set('trust proxy',1);
const PORT=Number(process.env.PORT||10000);

function envText(name){return String(process.env[name]||'').trim();}
function baseUrl(req){return (envText('PUBLIC_BASE_URL')||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');}

async function getValidAuth(req){
  let auth=(await authStore.load())||{};
  const cfg=shopeeConfig(req?baseUrl(req):envText('PUBLIC_BASE_URL'));
  if(!auth.accessToken||!auth.refreshToken||!auth.shopId) throw new Error('Shopee ainda não está conectada.');
  if(auth.mode!==cfg.mode||auth.partnerId!==cfg.partnerId) throw new Error('A autorização existente pertence a outro ambiente/Partner ID. Conecte a Shopee novamente.');
  const refreshAt=Number(auth.expiresAt||0)-5*60*1000;
  if(!auth.expiresAt||Date.now()>=refreshAt){
    const data=await refreshShopeeToken(cfg,{refreshToken:auth.refreshToken,shopId:auth.shopId});
    const next=normalizeShopeeTokenResult(data,auth.shopId);
    if(!next.accessToken)throw new Error('A Shopee não retornou novo access_token.');
    auth={...auth,...next,refreshToken:next.refreshToken||auth.refreshToken,connectedAt:auth.connectedAt,shopIds:next.shopIds.length?next.shopIds:(auth.shopIds||[]),lastRefreshAt:new Date().toISOString(),mode:cfg.mode,partnerId:cfg.partnerId};
    await authStore.save(auth);
  }
  return {auth,cfg};
}
const orderMonitor=createShopeeOrderMonitor({
  getAuth:()=>getValidAuth(),
  callApi:callShopeeShopApi
});
function stateSecret(){return envText('SESSION_SECRET')||envText('APP_PASSWORD')||'redeachados-shopee-state';}
function createState(){
  if(!envText('SESSION_SECRET')) throw new Error('Configure SESSION_SECRET no Environment do serviço Shopee antes de autorizar.');
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

app.use(express.json({limit:'6mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret:stateSecret(),resave:false,saveUninitialized:false,proxy:true,
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:12*60*60*1000}
}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'Rede Achados BR Shopee API',version:'1.7.1',storage:authStore.status()}));
app.get('/api/auth-state',(req,res)=>res.json({locked:Boolean(envText('APP_PASSWORD')),loggedIn:!envText('APP_PASSWORD')||Boolean(req.session?.appAuth)}));
app.post('/api/login',(req,res)=>{
  const required=envText('APP_PASSWORD');
  if(!required||String(req.body.password||'')===required){req.session.appAuth=true;return res.json({ok:true});}
  res.status(401).json({error:'Senha incorreta.'});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get('/api/shopee/status',mustLogin,async(req,res)=>{
  try{
    const cfg=shopeeConfig(baseUrl(req));
    const auth=await authStore.load();
    res.json({...safeShopeeStatus(auth,cfg),proxy:shopeeProxyStatus(),storage:authStore.status(),oauthSecurity:{sessionSecretConfigured:Boolean(envText('SESSION_SECRET'))}});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

// Diagnóstico solicitado explicitamente pelo usuário: consulta apenas a assinatura
// e nunca devolve chave, token ou URL com sign.
let lastSignatureProbeAt=0;
app.post('/api/shopee/signature-diagnostic',mustLogin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    if(!envText('APP_PASSWORD'))return res.status(403).json({error:'Configure APP_PASSWORD para usar o diagnóstico.'});
    const now=Date.now();
    if(now-lastSignatureProbeAt<45000)return res.status(429).json({error:'Aguarde 45 segundos para repetir o diagnóstico.'});
    lastSignatureProbeAt=now;
    const cfg=shopeeConfig(baseUrl(req));
    if(cfg.mode!=='live')return res.status(400).json({error:'Diagnóstico disponível somente no ambiente Live.'});
    const result=await diagnoseShopeeSignature(cfg);
    return res.json({ok:true,...result});
  }catch(e){return res.status(400).json({error:String(e.message||e)});}
});

// Monitor exclusivo Shopee: leitura autenticada, verificação manual e alertas.
app.get('/api/shopee/monitor',mustLogin,async(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{res.json({ok:true,...await orderMonitor.dashboard()});}
  catch(e){res.status(400).json({error:String(e.message||e),monitor:orderMonitor.status()});}
});
app.get('/api/shopee/monitor/status',mustLogin,(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.json({ok:true,...orderMonitor.status()});
});
app.post('/api/shopee/monitor/check-now',mustLogin,async(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{res.json(await orderMonitor.check());}
  catch(e){res.status(400).json({error:String(e.message||e),monitor:orderMonitor.status()});}
});
app.post('/api/shopee/monitor/read',mustLogin,async(req,res)=>{
  try{
    const {auth}=await getValidAuth(req);
    res.json(await orderMonitor.markRead(Number(auth.shopId),req.body?.alert_key));
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.get('/api/shopee/proxy-test',mustLogin,async(_req,res)=>{
  try{
    const proxy=shopeeProxyStatus();
    const outbound=await getShopeeOutboundIp();
    res.json({ok:true,proxy,outbound});
  }catch(e){
    res.status(400).json({ok:false,proxy:shopeeProxyStatus(),error:String(e.message||e)});
  }
});
app.get('/auth/shopee/start',mustLogin,(req,res)=>{
  try{
    const cfg=shopeeConfig(baseUrl(req));
    const state=createState();
    const authUrl=buildShopeeAuthorizationUrl(cfg);
    res.cookie('shopee_oauth_state',state,{
      httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',
      path:'/auth/shopee',maxAge:10*60*1000
    });
    res.setHeader('Cache-Control','no-store');
    res.redirect(authUrl);
  }catch(e){
    res.status(400).type('text/plain').send('Não foi possível iniciar a conexão Shopee: '+String(e.message||e));
  }
});
app.get('/auth/shopee/callback',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  try{
    const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('shopee_oauth_state='));
    const state=cookie?decodeURIComponent(cookie.slice('shopee_oauth_state='.length)):'';
    res.clearCookie('shopee_oauth_state',{
      httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/auth/shopee'
    });
    if(!verifyState(state))throw new Error('Estado de autorização Shopee inválido ou expirado. Inicie a conexão novamente.');
    if(req.query.state&&String(req.query.state)!==state)throw new Error('A validação de segurança Shopee não corresponde à sessão.');

    const cfg=shopeeConfig(baseUrl(req));
    const shopId=Number(req.query.shop_id||0);
    const data=await exchangeShopeeCode(cfg,{code:String(req.query.code||''),shopId});
    const auth=normalizeShopeeTokenResult(data,shopId);
    if(!auth.accessToken||!auth.refreshToken||!auth.shopId)throw new Error('A Shopee não retornou todos os dados esperados.');
    await authStore.save({...auth,mode:cfg.mode,partnerId:cfg.partnerId});
    res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Shopee conectada</title><body style="font-family:Arial;padding:32px"><h2>✅ Shopee conectada com sucesso</h2><p>Shop ID: <strong>${auth.shopId}</strong></p><p>Ambiente: <strong>${cfg.mode}</strong></p><p><a href="/">Voltar ao sistema Shopee</a></p></body>`);
  }catch(e){
    res.status(400).type('text/plain').send('Não foi possível concluir a autorização Shopee: '+String(e.message||e));
  }
});
app.post('/api/shopee/refresh',mustLogin,async(req,res)=>{
  try{
    const current=(await authStore.load())||{};
    const cfg=shopeeConfig(baseUrl(req));
    if(current.mode!==cfg.mode||current.partnerId!==cfg.partnerId)throw new Error('Token de outro ambiente/Partner ID. Autorize novamente.');
    const data=await refreshShopeeToken(cfg,{refreshToken:current.refreshToken,shopId:current.shopId});
    const next=normalizeShopeeTokenResult(data,current.shopId);
    if(!next.accessToken)throw new Error('A Shopee não retornou novo access_token.');
    const auth={...current,...next,refreshToken:next.refreshToken||current.refreshToken,connectedAt:current.connectedAt,shopIds:next.shopIds.length?next.shopIds:(current.shopIds||[]),lastRefreshAt:new Date().toISOString(),mode:cfg.mode,partnerId:cfg.partnerId};
    await authStore.save(auth);res.json({ok:true,...safeShopeeStatus(auth,cfg),storage:authStore.status()});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});
app.get('/api/shopee/test-shop',mustLogin,async(req,res)=>{
  try{
    const {auth,cfg}=await getValidAuth(req);
    const data=await getShopeeShopInfo(cfg,{accessToken:auth.accessToken,shopId:auth.shopId});
    res.json({ok:true,shopId:auth.shopId,response:data});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});


// Catálogo operacional: página de anúncios enriquecida com dados de base.
// Custos WeDrop. Nenhuma operação modifica preços ou campanhas Shopee.
function requireWeDropAdmin(req,res,next){
  if(!envText('APP_PASSWORD')||!req.session?.appAuth){
    return res.status(403).json({error:'Configure APP_PASSWORD no Render e faça login para trabalhar com os custos do fornecedor.'});
  }
  next();
}
function costCsvFromBody(req){
  const raw=req.body?.csv;
  if(typeof raw!=='string'||raw.length>MAX_CSV_CHARS)
    throw Error('CSV inválido ou maior que 4 MB.');
  return raw;
}
const wedropScheduler=createWeDropAutoScheduler();
app.get('/api/shopee/wedrop/auto/status',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    const state=await readWeDropSyncState(auth.shopId);
    const feed=supplierFeedConfig();
    res.json({ok:true,shopId:auth.shopId,state,
      feedConfigured:feed.configured===true&&feed.shopId===Number(auth.shopId),
      feedIntervalMinutes:feed.configured?feed.intervalMinutes:null,
      feedStatus:feed.configured&&feed.shopId===Number(auth.shopId)
        ?'Feed autorizado configurado; consulta periódica depende do serviço estar em execução.'
        :'Atualização automática disponível ao receber um novo CSV. Para detectar alterações na WeDrop sem upload, configure um feed autorizado.'});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,350)});}
});
app.post('/api/shopee/wedrop/auto/import',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    const result=await importSupplierAutomatically(auth.shopId,costCsvFromBody(req),{
      sourceKind:'upload',sourceName:String(req.body?.fileName||'wedrop.csv').slice(0,130)
    });
    res.json({ok:true,shopId:auth.shopId,...result});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,400)});}
});
app.post('/api/shopee/wedrop/auto/check',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    const feed=supplierFeedConfig();
    if(!feed.configured||feed.shopId!==Number(auth.shopId))
      return res.status(409).json({error:'Feed WeDrop não configurado para esta loja. Use CSV ou configure feed autorizado.'});
    const result=await wedropScheduler.check();
    if(result.error)return res.status(400).json({error:result.error});
    res.json({ok:true,...result});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,400)});}
});

app.post('/api/shopee/wedrop/preview',mustLogin,requireWeDropAdmin,(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    res.json({ok:true,...previewWeDropCsv(costCsvFromBody(req))});
  }catch(error){
    res.status(400).json({error:String(error.message||error).slice(0,320)});
  }
});
// Pré-validação sem gravação: confirma que o SKU escolhido não é EAN/NCM por engano.
app.post('/api/shopee/wedrop/validate',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const prepared=prepareWeDropImport(costCsvFromBody(req),{
      skuColumn:req.body?.skuColumn,costColumn:req.body?.costColumn,
      skipInvalid:req.body?.skipInvalid===true
    });
    const {auth}=await getValidAuth(req);
    const comparison=await compareIncomingCosts(auth.shopId,prepared.costs);
    res.json({ok:true,shopId:auth.shopId,
      importedFrom:prepared.totalRows,uniqueCosts:prepared.uniqueSkus,
      skippedInvalid:prepared.skippedInvalid,invalidExamples:prepared.invalidExamples,
      skuHeader:prepared.skuHeader,costHeader:prepared.costHeader,
      comparison,
      canImport:comparison.matchedCount>0,
      requiresZeroMatchApproval:comparison.matchedCount===0
    });
  }catch(error){
    res.status(400).json({error:String(error.message||error).slice(0,420)});
  }
});

app.post('/api/shopee/wedrop/import',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const prepared=prepareWeDropImport(costCsvFromBody(req),{
      skuColumn:req.body?.skuColumn,costColumn:req.body?.costColumn,
      skipInvalid:req.body?.skipInvalid===true
    });
    const {auth}=await getValidAuth(req);
    const comparison=await compareIncomingCosts(auth.shopId,prepared.costs);
    if(!comparison.matchedCount&&req.body?.allowUnmatched!==true){
      return res.status(409).json({
        error:'Nenhum SKU da planilha corresponde ao catálogo Shopee. Faça a pré-validação e confirme explicitamente a importação sem correspondências.',
        comparison
      });
    }
    const saved=await saveWeDropCosts(auth.shopId,prepared.costs,{
      overwrite:req.body?.overwrite===true,
      sourceFile:String(req.body?.fileName||'wedrop.csv')
    });
    res.json({ok:true,shopId:auth.shopId,...saved,
      importedFrom:prepared.totalRows,
      skippedInvalid:prepared.skippedInvalid,
      invalidExamples:prepared.invalidExamples,
      comparison,
      note:'Os custos foram gravados somente no Supabase Shopee. Nenhum preço ou anúncio foi alterado.'});
  }catch(error){
    res.status(400).json({error:String(error.message||error).slice(0,450)});
  }
});
// Sincronização segura e limitada das variações faltantes (somente leitura Shopee).
app.get('/api/shopee/wedrop/models/pending',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    const exclude=String(req.query.exclude||'').split(',').filter(x=>/^\d{1,18}$/.test(x)).slice(0,500);
    const result=await pendingWeDropModels(auth.shopId,{limit:10,exclude});
    res.json({ok:true,...result});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,320)});}
});
let variantsSyncBusy=false;
app.post('/api/shopee/wedrop/models/sync',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(variantsSyncBusy)return res.status(409).json({error:'Já existe uma sincronização de variações em andamento. Aguarde.'});
  const ids=req.body?.itemIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>10||ids.some(x=>!/^\d{1,18}$/.test(String(x)))){
    return res.status(400).json({error:'Selecione até 10 anúncios válidos para consultar as variações.'});
  }
  const normalized=[...new Set(ids.map(String))];
  variantsSyncBusy=true;
  try{
    const {auth,cfg}=await getValidAuth(req);
    const permitted=await pendingWeDropModels(auth.shopId,{limit:500});
    const allowed=new Set(permitted.items.map(x=>x.itemId));
    if(normalized.some(id=>!allowed.has(id))){
      return res.status(400).json({error:'Existem anúncios que não estão pendentes no catálogo atual.'});
    }
    const details=[],failed=[];
    for(const itemId of normalized){
      try{
        const data=await callShopeeShopApi(cfg,{
          path:'/api/v2/product/get_model_list',
          accessToken:auth.accessToken,shopId:auth.shopId,
          query:{item_id:itemId}
        });
        const models=normalizeShopeeModels(data);
        if(!models.length){failed.push({itemId,reason:'Shopee retornou zero modelos; verifique o anúncio.'});continue;}
        const stored=await storeCatalogModels(auth.shopId,itemId,models);
        if(stored.warning||stored.configured===false)throw Error(stored.warning||'Persistência de variações indisponível.');
        details.push({itemId,models:models.length});
      }catch(err){
        failed.push({itemId,reason:String(err.message||err).slice(0,180)});
        if(/rate.?limit|too many|429/i.test(String(err.message||err)))break;
      }
    }
    res.json({ok:true,successful:details,failed,processed:details.length+failed.length});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,320)});}
  finally{variantsSyncBusy=false;}
});

app.get('/api/shopee/wedrop/coverage',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    const filter=String(req.query.filter||'matched');
    const offset=Number(req.query.offset||0);
    res.json({ok:true,...await getWeDropCoverage(auth.shopId,{filter,offset,limit:500})});
  }catch(error){
    res.status(400).json({error:String(error.message||error).slice(0,350)});
  }
});

app.get('/api/shopee/catalog/cache',mustLogin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    const data=await readCatalogCache(auth.shopId);
    res.json({ok:true,shopId:auth.shopId,...data});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,300)});}
});

app.get('/api/shopee/catalog/page',mustLogin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth,cfg}=await getValidAuth(req);
    const page=await fetchCatalogPage(cfg,auth,callShopeeShopApi,{
      status:String(req.query.status||'NORMAL'),
      offset:req.query.offset??0,
      pageSize:req.query.page_size??50
    });
    let persisted;
    try{persisted=await storeCatalogItems(auth.shopId,page.items);}
    catch(error){persisted={stored:0,warning:'Cache indisponível: '+String(error.message||error).slice(0,130)};}
    res.json({ok:true,shopId:auth.shopId,...page,persistence:persisted});
  }catch(error){
    res.status(400).json({error:String(error.message||error).slice(0,320)});
  }
});
app.get('/api/shopee/catalog/models',mustLogin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const itemId=validItemId(req.query.item_id);
    const {auth,cfg}=await getValidAuth(req);
    const data=await callShopeeShopApi(cfg,{
      path:'/api/v2/product/get_model_list',accessToken:auth.accessToken,
      shopId:auth.shopId,query:{item_id:itemId}
    });
    const models=normalizeShopeeModels(data);
    let persisted;
    try{persisted=await storeCatalogModels(auth.shopId,itemId,models);}
    catch(error){persisted={stored:0,warning:'Não foi possível salvar variações no histórico.'};}
    res.json({ok:true,itemId,models,persistence:persisted});
  }catch(error){
    res.status(400).json({error:String(error.message||error).slice(0,320)});
  }
});

app.get('/api/shopee/products',mustLogin,async(req,res)=>{
  try{
    const {auth,cfg}=await getValidAuth(req);
    const pageSize=Math.max(1,Math.min(100,Number(req.query.page_size||50)));
    const offset=Math.max(0,Number(req.query.offset||0));
    const status=String(req.query.item_status||'NORMAL').toUpperCase();
    const data=await callShopeeShopApi(cfg,{
      path:'/api/v2/product/get_item_list',
      accessToken:auth.accessToken,shopId:auth.shopId,
      query:{offset,page_size:pageSize,item_status:status}
    });
    res.json({ok:true,shopId:auth.shopId,...data});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.get('/api/shopee/products/base-info',mustLogin,async(req,res)=>{
  try{
    const ids=String(req.query.item_ids||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,50);
    if(!ids.length) return res.status(400).json({error:'Informe item_ids separados por vírgula.'});
    const {auth,cfg}=await getValidAuth(req);
    const data=await callShopeeShopApi(cfg,{
      path:'/api/v2/product/get_item_base_info',
      accessToken:auth.accessToken,shopId:auth.shopId,
      query:{item_id_list:ids.join(','),need_tax_info:true,need_complaint_policy:true}
    });
    res.json({ok:true,shopId:auth.shopId,...data});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.get('/api/shopee/products/extra-info',mustLogin,async(req,res)=>{
  try{
    const ids=String(req.query.item_ids||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,50);
    if(!ids.length) return res.status(400).json({error:'Informe item_ids separados por vírgula.'});
    const {auth,cfg}=await getValidAuth(req);
    const data=await callShopeeShopApi(cfg,{
      path:'/api/v2/product/get_item_extra_info',
      accessToken:auth.accessToken,shopId:auth.shopId,
      query:{item_id_list:ids.join(',')}
    });
    res.json({ok:true,shopId:auth.shopId,...data});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.get('/api/shopee/orders',mustLogin,async(req,res)=>{
  try{
    const {auth,cfg}=await getValidAuth(req);
    const nowSec=Math.floor(Date.now()/1000);
    const to=Math.min(nowSec,Number(req.query.time_to||nowSec));
    const from=Number(req.query.time_from||to-15*24*60*60);
    const pageSize=Math.max(1,Math.min(100,Number(req.query.page_size||50)));
    const query={
      time_range_field:String(req.query.time_range_field||'create_time'),
      time_from:from,time_to:to,page_size:pageSize,
      cursor:String(req.query.cursor||''),
      response_optional_fields:'order_status'
    };
    const data=await callShopeeShopApi(cfg,{
      path:'/api/v2/order/get_order_list',
      accessToken:auth.accessToken,shopId:auth.shopId,query
    });
    const base=data.response||{};
    const orderList=Array.isArray(base.order_list)?base.order_list:[];
    let detailOrders=[];
    let detailWarning=null;
    if(orderList.length){
      try{
        const orderSns=orderList.map(x=>String(x.order_sn||'')).filter(Boolean);
        for(let i=0;i<orderSns.length;i+=50){
          const batch=orderSns.slice(i,i+50);
          const detailed=await callShopeeShopApi(cfg,{
            path:'/api/v2/order/get_order_detail',
            accessToken:auth.accessToken,
            shopId:auth.shopId,
            query:{order_sn_list:batch.join(',')}
          });
          if(Array.isArray(detailed.response?.order_list))
            detailOrders.push(...detailed.response.order_list);
        }
      }catch(error){
        detailWarning='Datas indisponíveis na consulta de detalhes: '+String(error.message||error).slice(0,250);
      }
    }
    const compact=mergeShopeeOrderDates(orderList,detailOrders);
    // Nunca devolver campos pessoais que possam vir da consulta de detalhes.
    res.json({
      ok:true,shopId:auth.shopId,
      response:{
        order_list:compact,
        more:Boolean(base.more),
        next_cursor:base.more?String(base.next_cursor||''):''
      },
      detailStatus:{
        attempted:orderList.length>0,
        withCreateTime:compact.filter(x=>x.create_time!==null).length,
        warning:detailWarning
      }
    });
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.get('/api/shopee/ads/overview',mustLogin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth,cfg}=await getValidAuth(req);
    const result=await loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,{
      start:String(req.query.start_date||''),
      end:String(req.query.end_date||'')
    });
    res.json({ok:true,...result});
  }catch(error){
    const message=String(error.message||error).slice(0,320);
    const forbidden=/permission|denied|restricted|forbidden|no permission|unauthorized/i.test(message);
    res.status(forbidden?403:400).json({
      error:message,category:forbidden?'ads_permission':'ads_query',
      help:forbidden?'Confira as permissões do módulo Ads na Shopee Open Platform para o aplicativo Seller In House System.':'Verifique datas, autorização e resposta da Shopee. Nada foi alterado nas campanhas.'
    });
  }
});

app.get('/api/shopee/ads/product-campaign-performance',mustLogin,async(req,res)=>{
  try{
    const campaigns=String(req.query.campaign_ids||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,100);
    if(!campaigns.length) return res.status(400).json({error:'Informe campaign_ids separados por vírgula.'});
    const start=String(req.query.start_date||'').trim();
    const end=String(req.query.end_date||'').trim();
    if(!start||!end) return res.status(400).json({error:'Informe start_date e end_date no formato DD-MM-AAAA.'});
    const {auth,cfg}=await getValidAuth(req);
    const data=await callShopeeShopApi(cfg,{
      path:'/api/v2/ads/get_product_campaign_daily_performance',
      accessToken:auth.accessToken,shopId:auth.shopId,
      query:{start_date:start,end_date:end,campaign_id_list:campaigns.join(',')}
    });
    res.json({ok:true,shopId:auth.shopId,...data});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

orderMonitor.start();
try{wedropScheduler.start();}catch(error){console.warn('[WeDrop] Feed não iniciado:',String(error.message||error).slice(0,200));}
app.listen(PORT,()=>console.log(`Rede Achados BR Shopee API em http://localhost:${PORT}`));
