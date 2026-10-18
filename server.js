import express from 'express';
import session from 'express-session';
import {createShopeeSessionStore,SESSION_TTL_MS} from './shopeeSessionStore.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAuthStore} from './authStore.js';
import {mergeShopeeOrderDates} from './orderView.js';
import {createShopeeOrderMonitor} from './orderMonitor.js';
import {loadShopeeAdsOverview} from './adsReport.js';
import {loadShopeeFinance,MAX_FINANCE_ORDERS} from './shopeeFinance.js';
import {installFinanceBridge,installWalletBridge,installAdsFinanceBridge} from './financeBridge.js';
import {buildAdsFinanceSnapshot} from './financeAdsBridge.js';
import {readShopeeWallet} from './shopeeWallet.js';
import {financeAdsDates,matchFinanceAds} from './financeAdsSweep.js';
import {financeRange} from './shopeeFinance.js';
import {fetchCatalogPage,normalizeShopeeModels,validItemId} from './catalog.js';
import {storeCatalogItems,storeCatalogModels,readCatalogCache,catalogStoreReady,findExactCatalogSku} from './catalogStore.js';
import {previewWeDropCsv,prepareWeDropImport,MAX_CSV_CHARS} from './wedropCsv.js';
import {saveWeDropCosts,getWeDropCoverage,compareIncomingCosts,pendingWeDropModels} from './wedropCosts.js';
import {saveWeDropProducts,readWeDropProduct} from './wedropCosts.js';
import {supplierWorkflowFacts} from './shopeeSupplierFacts.js';
import {readWeDropSyncState,getStoredWeDropCostCount} from './wedropCosts.js';
import {getSkuReview,searchSupplierSku,confirmSkuLink,undoSkuLink} from './wedropSkuReview.js';
import {auditShopeeItem,validateSkuLookup} from './productOptimizer.js';
import {buildStages,descriptionDraft,safeTitle,validateReview} from './shopeeOptimizationWorkflow.js';
import {getWorkflowReview,saveWorkflowReview} from './shopeeOptimizationWorkflowStore.js';
import {compileShopeeExecutionPlan,confirmShopeeExecution,
  assertLiveShopeeUnchanged,verifyShopeeExecution} from './shopeeExecutionPlan.js';
import {readShopeeExecution,saveShopeePreparedExecution,
  claimShopeePreparedExecution,finishShopeeExecution,pendingShopeeExecutions,leaseShopeeExecution,
  checkpointShopeeExecution,reconcileShopeeJob} from './shopeeExecutionStore.js';
import {advanceShopeeExecution} from './shopeeExecutionWorker.js';
import {createShopeeMediaApi} from './shopeeMediaApi.js';
import {normalizeManualVideo} from './shopeeVideoValidation.js';
import {readPreparedImages,importPreparedImage,downloadPreparedImage,imagesSignature,MAX_IMAGE_BYTES,rememberPublishedImages} from './shopeePreparedImages.js';
import {compileAttributes,compileTax,attributeAuditForChanges} from './shopeeStructuredFields.js';
import {MAX_VIDEO_BYTES,getShopeeManualVideo,importShopeeManualVideo,
 signedShopeeManualVideoPreview,manualVideoPublicInfo,downloadShopeeManualVideo,rememberPublishedVideo} from './shopeeManualVideo.js';
import {findLiveShopeeSku} from './shopeeSkuFinder.js';
import {optimizerSettings,saveOptimizerSettings} from './optimizerStore.js';
import {quoteShopeePrice,normalizeShopeePricingSettings} from './shopeePricing.js';
import {shopeePricingPreferences,saveShopeePricingPreferences,
  shopeePricingSupplierCost,shopeePricingDirectSupplierCost,
  saveShopeePricePlan,recentShopeePricePlans,
  savedShopeePricePlan} from './shopeePricingStore.js';
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
  store:createShopeeSessionStore(),
  secret:stateSecret(),resave:false,saveUninitialized:false,proxy:true,
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:SESSION_TTL_MS}
}));
app.use(express.static(path.join(__dirname,'public'),{
  setHeaders(res,filename){
    // Never reuse old bundles after a Shopee UI deploy, even if Chrome
    // has cached the path used by earlier releases.
    if(/(?:^|[/\\])(?:app\.js|style\.css)$/.test(filename))
      res.setHeader('Cache-Control','no-store');
  }
}));

// URLs próprias por setor do painel: recarregar/compartilhar não causa 404.
// A sessão e autenticação das APIs continuam protegidas pelos mesmos middlewares.
const appPagePaths=new Set([
  'inicio','produtos','otimizacao','precificacao','descontos','pedidos','envios','ads','wedrop','financeiro','configuracoes'
]);
app.get('/app/:section',(req,res)=>{
  if(!appPagePaths.has(String(req.params.section||'')))return res.status(404).send('Página não encontrada.');
  res.setHeader('Cache-Control','no-cache');
  res.sendFile(path.join(__dirname,'public','index.html'));
});
app.get('/app',(_req,res)=>res.redirect(302,'/app/inicio'));

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'Rede Achados BR Shopee API',version:'1.18.3',storage:authStore.status()}));
app.get('/api/auth-state',(req,res)=>res.json({locked:Boolean(envText('APP_PASSWORD')),loggedIn:!envText('APP_PASSWORD')||Boolean(req.session?.appAuth)}));
app.post('/api/login',(req,res)=>{
  const required=envText('APP_PASSWORD');
  if(!required||String(req.body.password||'')===required){
    return req.session.regenerate(error=>{
      if(error)return res.status(503).json({error:'Não foi possível iniciar a sessão. Tente novamente.'});
      req.session.appAuth=true;
      req.session.save(error=>error
        ?res.status(503).json({error:'Não foi possível salvar o acesso. Tente novamente.'})
        :res.json({ok:true}));
    });
  }
  res.status(401).json({error:'Senha incorreta.'});
});
app.post('/api/logout',(req,res)=>req.session.destroy(error=>error
  ?res.status(503).json({error:'Não foi possível encerrar a sessão. Tente novamente.'})
  :res.clearCookie('connect.sid').json({ok:true})));

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
    const [state,storedCosts]=await Promise.all([
      readWeDropSyncState(auth.shopId),getStoredWeDropCostCount(auth.shopId)
    ]);
    const feed=supplierFeedConfig();
    res.json({ok:true,shopId:auth.shopId,state,
      catalogStored:storedCosts>0,storedCosts,
      savedCatalogName:state?.source_name||'Catálogo WeDrop armazenado',
      savedAt:state?.last_success_at||null,
      rawCsvStored:false,
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
    const productFactsSaved=await saveWeDropProducts(auth.shopId,prepared.products,{
      sourceFile:String(req.body?.fileName||'wedrop.csv'),sourceHash:crypto.createHash('sha256').update(costCsvFromBody(req),'utf8').digest('hex')});
    res.json({ok:true,shopId:auth.shopId,...saved,
      productFactsSaved,
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

// Revisão de SKUs — somente conta autenticada. Alterações limitadas a
// vínculos de custo internos; nunca alteram o anúncio oficial na Shopee.
app.get('/api/shopee/wedrop/sku-review',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    res.json({ok:true,...await getSkuReview(auth.shopId)});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,300)});}
});
app.get('/api/shopee/wedrop/sku-search',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    const term=String(req.query.q||'');
    if(term.length>120)return res.status(400).json({error:'Pesquisa muito longa.'});
    res.json({ok:true,results:await searchSupplierSku(auth.shopId,term)});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,300)});}
});
function verifiedSameOrigin(req){
  const origin=String(req.get('origin')||'');
  const base=baseUrl(req);
  try{return !origin||new URL(origin).origin===new URL(base).origin;}catch{return false;}
}
app.post('/api/shopee/wedrop/sku-link',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem da solicitação não permitida.'});
  try{
    const {auth}=await getValidAuth(req);
    res.json({ok:true,...await confirmSkuLink(auth.shopId,req.body||{})});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,320)});}
});
app.post('/api/shopee/wedrop/sku-unlink',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem da solicitação não permitida.'});
  try{
    const {auth}=await getValidAuth(req);
    res.json({ok:true,...await undoSkuLink(auth.shopId,req.body||{})});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,320)});}
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

// Preparação assistida de anúncios. Somente leitura da Shopee nesta versão;
// auditoria jamais dispara update_item, mídia, alteração de preço ou estoque.
app.get('/api/shopee/optimizer/find',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const sku=validateSkuLookup(req.query.sku);
    const {auth,cfg}=await getValidAuth(req);
    let matches=await findExactCatalogSku(auth.shopId,sku);
    let lookup='saved_catalog',warnings=[];
    if(!matches.length){
      // Cache parcial ou desatualizado: pesquisa oficial Shopee, leitura somente.
      // Também recupera os detalhes e vincula a SKU ao catálogo persistente.
      const live=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,sku);
      warnings=live.warnings||[];
      matches=await findExactCatalogSku(auth.shopId,sku);
      lookup=matches.length?'live_verified':'not_found';
      if(live.matches.length&&!matches.length)
        throw Error('A Shopee encontrou a SKU, mas não foi possível salvar o vínculo no catálogo. Tente novamente.');
    }
    res.json({ok:true,sku,matches,lookup,warnings:warnings.slice(0,3),
      message:matches.length
        ?'SKU exata localizada '+(lookup==='live_verified'?'na Shopee e salva no catálogo.':'no catálogo salvo.')+
         ' Item ID obtido automaticamente.'
        :'A Shopee não confirmou a SKU na pesquisa. Confira se está na mesma loja e tente sincronizar Produtos e anúncios.'});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,240)});}
});
app.get('/api/shopee/optimizer/audit',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const itemId=validItemId(req.query.item_id);
    const expectedSku=req.query.sku?validateSkuLookup(req.query.sku):'';
    const expectedModelId=String(req.query.model_id||'').trim();
    if(expectedModelId&&!/^[0-9]{1,18}$/.test(expectedModelId))
      throw Error('Modelo Shopee inválido.');
    const {auth,cfg}=await getValidAuth(req);
    const record=await auditShopeeItem(cfg,auth,callShopeeShopApi,itemId,{
      expectedSku,expectedModelId
    });
    res.json({ok:true,readOnly:true,record});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,320)});}
});
// Stage reviews are internal Shopee records. No marketplace API writes.
async function checkedWorkflowAudit(req){
  const itemId=validItemId(req.query?.item_id??req.body?.itemId);
  const sku=validateSkuLookup(req.query?.sku??req.body?.sku);
  const modelId=String(req.query?.model_id??req.body?.modelId??'0');
  if(!/^\d{1,18}$/.test(modelId))throw Error('Variação Shopee inválida.');
  const {auth,cfg}=await getValidAuth(req);
  const record=await auditShopeeItem(cfg,auth,callShopeeShopApi,itemId,
    {expectedSku:sku,expectedModelId:modelId});
  return {itemId,modelId,sku,auth,cfg,record};
}
app.get('/api/shopee/optimizer/workflow',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {itemId,modelId,sku,auth,cfg,record}=await checkedWorkflowAudit(req);
    const stored=await getWorkflowReview(auth.shopId,itemId,modelId);
    const review=stored?.sku===sku?stored.review_state||{}:{};
    const stages=buildStages(record,review);
    const existingTier=record.variationTiers?.[0];
    const officialVariationConfig=existingTier?{enabled:true,
      type:['Cor','Tamanho','Unidades por pacote','Modelo','Variação','Voltagem','Print','Quantidade'].includes(existingTier.name)?existingTier.name:'',
      values:existingTier.options.map(x=>x.name)}:{enabled:Boolean(record.hasModel),type:'',values:[]};
    const current=await shopeeLiveEditableItem(cfg,auth,itemId);
    const [supplier,settings]=await Promise.all([
      readWeDropProduct(auth.shopId,{sku,itemId,modelId}),optimizerSettings(auth.shopId)]);
    const supplierFacts=supplierWorkflowFacts(supplier,record,settings);
    const manualVideo=manualVideoPublicInfo(
      await getShopeeManualVideo(auth.shopId,itemId,modelId,sku));
    res.json({ok:true,readOnlyMarketplace:true,sku,itemId,modelId,manualVideo,...supplierFacts,
      contentVariants:review.contentVariants||null,contentResearch:review.contentResearch||null,
      attributes:record.attributeAudit.attributes,attributeChanges:review.attributes||[],taxDraft:review.tax||{},taxCurrent:current.tax_info||{},
      recordedAt:stored?.updated_at||null,stages,
      variationConfig:review.variationConfig||officialVariationConfig,
      hasShopeeModels:Boolean(record.hasModel),shopeeModels:record.models||[],
      shopeeVariationTiers:record.variationTiers||[],imageNotes:review.imageNotes||{},
      draftTitle:review.draftTitle||safeTitle(record.title),
      draftDescription:review.draftDescription||descriptionDraft(record),
      imageCount:record.imageCount,
      videoStatus:record.videoStatus,categoryId:record.categoryId});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,350)});}
});
app.post('/api/shopee/optimizer/workflow/attributes/preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
  try{
    const {itemId,auth,cfg,record}=await checkedWorkflowAudit(req);
    const live=await shopeeLiveEditableItem(cfg,auth,itemId);
    const audit=attributeAuditForChanges(req.body.attributes,record,live);
    res.json({ok:true,attributes:audit.attributes.map(a=>({...a,values:record.attributeAudit.attributes.find(x=>x.id===a.id)?.values||[]}))});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,300)});}
});
app.post('/api/shopee/optimizer/workflow/review',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem da solicitação não permitida.'});
  try{
    const change=validateReview(req.body);
    const {itemId,modelId,sku,auth,cfg,record}=await checkedWorkflowAudit(req);
    if(change.stage==='video'&&change.reviewed){
      const asset=await getShopeeManualVideo(auth.shopId,itemId,modelId,sku);
      if(!asset)throw Error('Importe e visualize o vídeo antes de aprovar esta etapa.');
      change.assetSha256=asset.sha256;
    }
    if(change.stage==='images'&&change.reviewed){
      const images=await readPreparedImages(auth.shopId,itemId,modelId,sku);
      if(images.length&&images.length!==9)throw Error('Importe as nove imagens para revisar a substituição completa.');
      change.imagesSignature=imagesSignature(images);
    }
    if(change.attributes)compileAttributes(change.attributes,record,await shopeeLiveEditableItem(cfg,auth,itemId));
    if(change.tax)compileTax(change.tax,await shopeeLiveEditableItem(cfg,auth,itemId));
    const state=await saveWorkflowReview(auth.shopId,itemId,modelId,sku,change);
    res.json({ok:true,saved:true,marketplaceUpdated:false,sku,itemId,modelId,
      stages:buildStages(record,state),attributeChanges:state.attributes||[],taxDraft:state.tax||{},draftTitle:state.draftTitle||safeTitle(record.title),
      draftDescription:state.draftDescription||descriptionDraft(record),
      variationConfig:state.variationConfig||{enabled:Boolean(record.hasModel),type:'',values:[]},imageNotes:state.imageNotes||{}});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,350)});}
});

// Execution uses reviewed content, frozen media and a persisted one-step worker.
async function shopeeLiveEditableItem(cfg,auth,itemId){
  const d=await callShopeeShopApi(cfg,{
    path:'/api/v2/product/get_item_base_info',accessToken:auth.accessToken,
    shopId:auth.shopId,query:{item_id_list:itemId,need_tax_info:true}});
  const x=(d?.response?.item_list||[]).find(i=>String(i.item_id)===String(itemId));
  if(!x)throw Error('O anúncio não pôde ser confirmado na Shopee.');
  return x;
}
app.post('/api/shopee/optimizer/execution/prepare',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
  try{
    const {itemId,modelId,sku,auth,cfg,record}=await checkedWorkflowAudit(req);
    const review=await getWorkflowReview(auth.shopId,itemId,modelId);
    if(review&&review.sku!==sku)throw Error('SKU do plano revisado é diferente. Refaça a auditoria.');
    const live=await shopeeLiveEditableItem(cfg,auth,itemId);
    const manualVideo=await getShopeeManualVideo(auth.shopId,itemId,modelId,sku);
    const previous=await readShopeeExecution(auth.shopId,itemId,modelId);
    const verifiedVideoSha256=previous?.state==='verified'&&
      verifyShopeeExecution(previous.plan,live,previous.result)?previous.plan.video?.sha256:null;
    const manualImages=await readPreparedImages(auth.shopId,itemId,modelId,sku);
    const plan=compileShopeeExecutionPlan({shopId:auth.shopId,itemId,modelId,
      sku,record,review:review?.review_state||{},live,manualVideo,verifiedVideoSha256,manualImages});
    const stored=await saveShopeePreparedExecution(auth.shopId,itemId,modelId,sku,plan);
    res.json({ok:true,ready:plan.canExecute,plan,
      updatedAt:stored.updated_at,executionStatus:stored.state,marketplaceUpdated:false});
  }catch(e){res.status(409).json({error:String(e.message||e).slice(0,300)});}
});
app.get('/api/shopee/optimizer/execution/status',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const itemId=validItemId(req.query.item_id),modelId=String(req.query.model_id||'0');
    const sku=validateSkuLookup(req.query.sku);
    if(!/^\d{1,18}$/.test(modelId))throw Error('Model ID inválido.');
    const {auth}=await getValidAuth(req);
    const job=await readShopeeExecution(auth.shopId,itemId,modelId);
    res.json({ok:true,job:job?.sku===sku?job:null});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,300)});}
});
app.post('/api/shopee/optimizer/execution/execute',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  if(req.body?.acceptPartialExecution!==true)throw Error('Confirme as alterações da prévia.');
  const {itemId,modelId,sku,auth,cfg,record}=await checkedWorkflowAudit(req);
  const job=await readShopeeExecution(auth.shopId,itemId,modelId);
  if(job?.sku!==sku||job.state!=='prepared')throw Error('Plano não preparado ou já iniciado. Confira o andamento.');
  const plan=job.plan;
  if(plan?.planId!==String(req.body.planId||'')||String(job.updated_at)!==String(req.body.updatedAt||''))
   throw Error('Plano alterado em outra sessão. Prepare novamente.');
  confirmShopeeExecution(plan,{sku,confirmation:req.body.confirmation});
  const review=await getWorkflowReview(auth.shopId,itemId,modelId);
  if(review?.sku!==sku)throw Error('Revisão da SKU mudou. Prepare novamente.');
  const live=await shopeeLiveEditableItem(cfg,auth,itemId);
  assertLiveShopeeUnchanged(plan,live);
  const manualVideo=plan.video?await getShopeeManualVideo(auth.shopId,itemId,modelId,sku):null;
  const manualImages=plan.images?.length?await readPreparedImages(auth.shopId,itemId,modelId,sku):[];
  const fresh=compileShopeeExecutionPlan({shopId:auth.shopId,itemId,modelId,sku,record,
   review:review.review_state,live,manualVideo,manualImages});
  if(fresh.fingerprint!==plan.fingerprint||!fresh.canExecute)throw Error('Conteúdo ou aprovação mudou. Prepare novamente.');
  await claimShopeePreparedExecution(auth.shopId,itemId,modelId,{
   planId:plan.planId,updatedAt:job.updated_at,runId:crypto.randomUUID()});
  // Only this explicit authenticated action starts the durable runner.
  res.status(202).json({ok:true,status:'running',marketplaceUpdated:false,
   message:'Execução iniciada. Acompanhe as etapas; você pode sair e voltar para esta SKU.'});
  void runOptimizerJobs();
 }catch(e){res.status(409).json({ok:false,error:String(e.message||e).slice(0,280)});}
});
app.post('/api/shopee/optimizer/execution/reconcile',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {itemId,modelId,sku,auth,cfg}=await checkedWorkflowAudit(req);
  const job=await readShopeeExecution(auth.shopId,itemId,modelId);
  if(job?.sku!==sku)throw Error('Nenhuma execução encontrada para esta SKU.');
  if(job.state!=='uncertain')return res.json({ok:true,job});
  const live=await shopeeLiveEditableItem(cfg,auth,itemId);
  const verified=verifyShopeeExecution(job.plan,live,job.result||{});
  let updated=job;
  if(verified){
    await rememberPublishedVideo(job.plan,job.result||{});
    await rememberPublishedImages(job.plan,job.result||{});
    updated=await reconcileShopeeJob(job,{state:'verified',result:{...job.result,phase:'verified',verified:true},lastError:null});
  }
  else if(req.body.reprepare===true){
    if(req.body.confirmation!=='REPREPARAR '+sku)throw Error('Confirme REPREPARAR '+sku+'.');
    if(Date.now()-Date.parse(job.updated_at)<90000)throw Error('Aguarde 90 segundos para a Shopee consolidar a atualização.');
    assertLiveShopeeUnchanged(job.plan,live);
    updated=await reconcileShopeeJob(job,{state:'failed',result:{...job.result,phase:'retry_allowed'},
      lastError:'Leitura confirmou os valores anteriores. Uma nova prévia e aprovação são necessárias.'});
  }
  res.json({ok:true,job:updated,verified,message:verified?'Alterações confirmadas na Shopee.':
    'Resultado ainda não confirmado. Nenhuma alteração foi reenviada.'});
 }catch(e){res.status(409).json({ok:false,error:String(e.message||e).slice(0,280)});}
});
let optimizerWorkerBusy=false;
async function runOptimizerJobs(){
 if(optimizerWorkerBusy)return;
 optimizerWorkerBusy=true;
 try{
  const jobs=await pendingShopeeExecutions();
  for(const candidate of jobs){
   const job=await leaseShopeeExecution(candidate,crypto.randomUUID());
   if(!job)continue;
   try{
    const {auth,cfg}=await getValidAuth();
    if(Number(auth.shopId)!==Number(job.shop_id))throw Error('Loja vinculada diferente do plano aprovado.');
    const common={accessToken:auth.accessToken,shopId:auth.shopId};
    const out=await advanceShopeeExecution(job,{
      read:()=>shopeeLiveEditableItem(cfg,auth,job.item_id),
      validateIdentity:()=>auditShopeeItem(cfg,auth,callShopeeShopApi,job.item_id,
        {expectedSku:job.sku,expectedModelId:String(job.model_id)}),
      download:downloadShopeeManualVideo,downloadImage:downloadPreparedImage,media:createShopeeMediaApi(cfg,auth),
      beforeWrite:result=>checkpointShopeeExecution(job,result,90000),
      update:body=>callShopeeShopApi(cfg,{...common,path:'/api/v2/product/update_item',method:'POST',body})
    });
    if(out.state==='running')await checkpointShopeeExecution(job,out.result,out.delay);
    else {
      if(out.state==='verified'){
        await rememberPublishedVideo(job.plan,out.result);
        await rememberPublishedImages(job.plan,out.result);
      }
      await finishShopeeExecution(job.shop_id,job.item_id,job.model_id,job.run_id,out);
    }
   }catch(e){
    const current=await readShopeeExecution(job.shop_id,job.item_id,job.model_id);
    if(current?.run_id!==job.run_id||current.state!=='running')continue;
    const uncertain=['updating','verifying'].includes(current.result?.phase);
    const attempts=Number(current.result?.attempts||0)+1;
    if(!uncertain&&attempts<3&&/fetch|timeout|network|HTTP 5|error_rate_limit/i.test(String(e.message))){
     await checkpointShopeeExecution(job,{...current.result,attempts},attempts*15000);
    }else await finishShopeeExecution(job.shop_id,job.item_id,job.model_id,job.run_id,{
      state:uncertain?'uncertain':'failed',result:current.result,
      lastError:String(e.message||e).slice(0,250)});
   }
  }
 }catch(e){console.warn('[Shopee optimizer] execução aguardando persistência:',String(e.message||e).slice(0,180));}
 finally{optimizerWorkerBusy=false;}
}

// Diagnóstico somente de PRESENÇA da configuração, sem revelar Partner ID, Key ou token.
// Uma sessão "conectada" não prova que as credenciais necessárias aos writes ainda existem.
app.get('/api/shopee/optimizer/execution/diagnostic',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const cfg=shopeeConfig(baseUrl(req)),auth=await authStore.load();
  const checks={
   SHOPEE_PARTNER_ID:Number.isSafeInteger(cfg.partnerId)&&cfg.partnerId>0,
   SHOPEE_PARTNER_KEY:Boolean(cfg.partnerKey),
   SHOPEE_REDIRECT_URI:/^https:\/\//i.test(cfg.redirectUri),
   SHOP_TOKEN_SAVED:Boolean(auth?.shopId&&auth?.accessToken&&auth?.refreshToken),
   SHOP_PARTNER_MATCH:Boolean(auth?.partnerId&&cfg.partnerId&&auth.partnerId===cfg.partnerId),
   SHOP_ENV_MATCH:Boolean(auth?.mode&&auth.mode===cfg.mode)
  };
  const missing=Object.entries(checks).filter(([,value])=>!value).map(([key])=>key);
  res.json({ok:true,ready:missing.length===0,checks,missing,
   message:missing.length
    ?'A loja pode mostrar API conectada, mas a execução requer todas as configurações válidas no Render do serviço redeachados-shopee.'
    :'Configuração básica presente. Ainda será necessário confirmar permissão e resposta da API Shopee para executar.'});
 }catch(e){res.status(503).json({error:'Não foi possível consultar o diagnóstico das configurações Shopee.'});}
});
// Importar o vídeo manual depende somente da loja autenticada e do SKU do cache.
// Funciona como preparo privado mesmo quando a Partner Key está ausente.
async function checkedManualVideoIdentity(req){
 const itemId=validItemId(req.query?.item_id),sku=validateSkuLookup(req.query?.sku);
 const modelId=String(req.query?.model_id??'0');
 if(!/^\d{1,18}$/.test(modelId))throw Error('Model ID inválido.');
 const auth=await authStore.load();
 const cfg=shopeeConfig(baseUrl(req));
 if(!auth?.shopId||!auth?.accessToken||auth.mode!==cfg.mode)
   throw Error('Reconecte a conta da loja Shopee antes de importar o vídeo.');
 if(cfg.partnerId>0&&Number(auth.partnerId)!==cfg.partnerId)
   throw Error('O vínculo da loja é diferente do ambiente atual.');
 const matches=await findExactCatalogSku(auth.shopId,sku);
 if(!matches.some(x=>String(x.itemId)===itemId&&String(x.modelId)===modelId))
   throw Error('A SKU e o Item ID/variação não coincidem com o catálogo Shopee sincronizado.');
 return {shopId:auth.shopId,itemId,modelId,sku};
}
app.get('/api/shopee/optimizer/video/manual',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const info=await checkedManualVideoIdentity(req);
  const asset=await getShopeeManualVideo(info.shopId,info.itemId,info.modelId,info.sku);
  const previewUrl=asset&&req.query.preview==='1'
    ?await signedShopeeManualVideoPreview(info.shopId,info.itemId,info.modelId,info.sku):null;
  res.json({ok:true,asset:manualVideoPublicInfo(asset),previewUrl,
    publishedInShopee:Boolean(asset?.publication?.sha256===asset?.sha256)});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,250)});}
});
app.post('/api/shopee/optimizer/video/manual',
 mustLogin,requireWeDropAdmin,
 express.raw({type:['video/mp4','video/quicktime','video/webm'],limit:MAX_VIDEO_BYTES}),
 async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem da solicitação não autorizada.'});
 try{
  const info=await checkedManualVideoIdentity(req);
  let name='video';
  try{name=decodeURIComponent(String(req.get('x-video-filename')||'video'));}
  catch{throw Error('Nome de arquivo inválido.');}
  const active=await readShopeeExecution(info.shopId,info.itemId,info.modelId);
  if(['running','uncertain'].includes(active?.state))throw Error('Conclua ou confira a execução em andamento antes de trocar o vídeo.');
  const normalized=await normalizeManualVideo(req.body);
  const asset=await importShopeeManualVideo(info.shopId,info.itemId,info.modelId,
    info.sku,normalized.buffer,{mime:'video/mp4',filename:name.replace(/\.[^.]+$/,'')+'.mp4'});
  res.status(201).json({ok:true,asset,publishedInShopee:false,
   message:'Vídeo importado e salvo em armazenamento privado para esta SKU. Ainda não foi publicado na Shopee.'});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,270)});}
});

app.get('/api/shopee/optimizer/images/manual',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const x=await checkedManualVideoIdentity(req);
  const images=await readPreparedImages(x.shopId,x.itemId,x.modelId,x.sku,{preview:true});
  res.json({ok:true,images});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,250)});}
});
app.post('/api/shopee/optimizer/images/manual',mustLogin,requireWeDropAdmin,
 express.raw({type:['image/png','image/jpeg'],limit:MAX_IMAGE_BYTES}),async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const x=await checkedManualVideoIdentity(req),job=await readShopeeExecution(x.shopId,x.itemId,x.modelId);
  if(['running','uncertain'].includes(job?.state))throw Error('Aguarde ou confira a execução antes de trocar as imagens.');
  const image=await importPreparedImage({...x,slot:req.query.slot,file:req.body,
   mime:String(req.get('content-type')||'').split(';')[0],filename:decodeURIComponent(req.get('x-image-filename')||'imagem')});
  res.status(201).json({ok:true,image,marketplaceUpdated:false});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,250)});}
});

app.get('/api/shopee/optimizer/settings',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    res.json({ok:true,settings:await optimizerSettings(auth.shopId)});
  }catch(e){res.status(503).json({error:String(e.message||e).slice(0,240)});}
});
app.post('/api/shopee/optimizer/settings',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    res.json({ok:true,settings:await saveOptimizerSettings(auth.shopId,{
      imagePrompt:req.body?.imagePrompt,fiscalNotes:req.body?.fiscalNotes
    })});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,240)});}
});

// Cotação e plano por SKU, exclusivos Shopee. Nenhum endpoint escreve preços,
// promoções ou descontos na Central do Vendedor: revisão obrigatória.
// Prévia independente do anúncio: fornecedor WeDrop pode possuir SKU
// que ainda não está no cache Shopee. Nunca confundir este preview com
// promoção publicada ou vínculo validado de item/modelo Shopee.
app.post('/api/shopee/optimizer/pricing/supplier-preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const sku=validateSkuLookup(req.body?.sku);
    const {auth}=await getValidAuth(req);
    const cost=await shopeePricingDirectSupplierCost(auth.shopId,sku);
    if(!cost)return res.json({ok:true,found:false,sku,
      message:'Esta SKU ainda não possui custo WeDrop salvo. Consulte a área Fornecedor WeDrop.'});
    const settings=req.body?.settings===undefined
      ?await shopeePricingPreferences(auth.shopId)
      :normalizeShopeePricingSettings(req.body.settings);
    const marketAverage=req.body?.marketAverage===undefined?null:req.body.marketAverage;
    const quote=quoteShopeePrice({unitCost:cost.unitCost,settings,marketAverage});
    res.json({ok:true,found:true,sku,costUpdatedAt:cost.costUpdatedAt,
      quote:{...quote,sku,supplierSku:cost.supplierSku,
        source:'wedrop_only',saved:false,listingVerified:false,
        notice:quote.notice+' SKU reconhecida na WeDrop; vínculo com anúncio Shopee ainda em verificação.'},
      message:'SKU '+sku+' localizada no catálogo WeDrop. A associação com a Shopee será conferida separadamente.'});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,280)});}
});

app.get('/api/shopee/optimizer/pricing/settings',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    res.json({ok:true,settings:await shopeePricingPreferences(auth.shopId)});
  }catch(e){res.status(503).json({error:String(e.message||e).slice(0,280)});}
});
app.post('/api/shopee/optimizer/pricing/settings',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    res.json({ok:true,settings:await saveShopeePricingPreferences(auth.shopId,req.body?.settings)});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,280)});}
});
app.get('/api/shopee/optimizer/pricing/recent',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth}=await getValidAuth(req);
    res.json({ok:true,plans:await recentShopeePricePlans(auth.shopId),executed:false});
  }catch(e){res.status(503).json({error:String(e.message||e).slice(0,280)});}
});
app.post('/api/shopee/optimizer/pricing/prepare',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const sku=validateSkuLookup(req.body?.sku);
    const itemId=validItemId(req.body?.itemId);
    const modelId=String(req.body?.modelId??'0');
    if(!/^\d{1,18}$/.test(modelId))throw Error('ID da variação inválido.');
    const {auth}=await getValidAuth(req);
    // Não aceitar item/variação alterados ou de outro SKU por texto arbitrário.
    const matches=await findExactCatalogSku(auth.shopId,sku);
    if(!matches.some(x=>String(x.itemId)===itemId&&String(x.modelId)===modelId))
      return res.status(409).json({error:'A SKU não corresponde mais a esse Item ID/variação. Localize novamente na Otimização.'});
    const settings=req.body?.settings===undefined
      ?await shopeePricingPreferences(auth.shopId)
      :normalizeShopeePricingSettings(req.body.settings);
    const cost=await shopeePricingSupplierCost(auth.shopId,{sku,itemId,modelId});
    const previous=await savedShopeePricePlan(auth.shopId,itemId,modelId);
    const marketAverage=req.body?.marketAverage===undefined
      ?previous?.sku===sku?previous?.quote?.marketAverage??null:null
      :req.body.marketAverage;
    const quote=quoteShopeePrice({
      unitCost:cost.unitCost,settings,marketAverage
    });
    quote.sku=sku;
    quote.itemId=itemId;
    quote.modelId=modelId;
    quote.supplierSku=cost.supplierSku;
    quote.costUpdatedAt=cost.costUpdatedAt;
    quote.pricingSettings=settings;
    quote.calculatedAt=new Date().toISOString();
    // Evitar persistir configuração inválida/inviável ou uma SKU não encontrada.
    if(req.body?.settings!==undefined)
      await saveShopeePricingPreferences(auth.shopId,settings);
    await saveShopeePricePlan(auth.shopId,{itemId,modelId,sku,supplierSku:cost.supplierSku,quote});
    res.json({ok:true,readOnly:true,saved:true,quote});
  }catch(e){
    const message=String(e.message||e).slice(0,300);
    res.status(/não vinculado|não corresponde|não disponível/i.test(message)?409:400).json({error:message});
  }
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

// Bridge apenas de leitura: as credenciais oficiais Shopee nunca sao expostas.
installFinanceBridge(app,async(req)=>{
  const {auth,cfg}=await getValidAuth(req);
  const to=Math.floor(Date.now()/1000);
  const range=financeRange({days:15},to);
  const financial=await loadShopeeFinance(cfg,auth,callShopeeShopApi,{now:to,timeRange:range});
  const orders=(financial.rows||[]).map(o=>({
    orderId:String(o.orderSn||''),date:null,
    netReceived:o.payout!==null&&o.payout!==undefined&&Number.isFinite(Number(o.payout))?Math.round(Number(o.payout)*100)/100:null
  }));
  let ads={status:'unknown',amount:null,source:'Shopee Ads API'};
  try{
    const report=await loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,financeAdsDates(range));
    if(report?.total?.expense!==null&&report?.total?.expense!==undefined&&Number.isFinite(Number(report.total.expense)))
      ads={status:'confirmed',amount:Math.round(Number(report.total.expense)*100)/100,source:'Shopee Ads API · campanhas de produtos'};
  }catch(_){/* sem acesso Ads, não inventar R$0 */}
  return {schema:'ra-finance-bridge-v1',platform:'shopee',generatedAt:new Date().toISOString(),
    orders,ads,coverage:{note:'Somente pedidos concluidos CRIADOS na janela de 15 dias; limite '+MAX_FINANCE_ORDERS+' pedidos. Repasse nao equivale ao saldo sacavel.'},
    diagnostics:{ordersExamined:orders.length,complete:financial.complete===true,
      permissionWarning:Boolean(financial.paymentAccessWarning),truncated:Boolean(financial.skippedCompleted)}};
});

// Relatório privado Shopee Ads de anúncios de produtos, consultado por mês.
installAdsFinanceBridge(app,async month=>{
 const {auth,cfg}=await getValidAuth();
 return buildAdsFinanceSnapshot(month,dates=>
  loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,dates));
});

// Extrato da carteira Shopee: não confundir com repasse de pedidos.
installWalletBridge(app,async()=>{
 const {auth,cfg}=await getValidAuth();
 return readShopeeWallet(cfg,auth,callShopeeShopApi);
});

// Financeiro Shopee baseado nos pedidos concluídos e no repasse efetivo da API Payment.
// Retorna somente campos necessários, sem nome, telefone ou endereço de compradores.
app.get('/api/shopee/finance/orders',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {auth,cfg}=await getValidAuth(req);
    const to=Math.floor(Date.now()/1000);
    const range=financeRange({
      days:req.query.days??15,
      start:String(req.query.start||''),
      end:String(req.query.end||'')
    },to);
    const dates=financeAdsDates(range);
    // Consultas em paralelo, sem permitir que a negação de Ads esconda o
    // financeiro de repasse/custos. Nunca atribuir zero quando não autorizado.
    const [finance,adsResult]=await Promise.all([
      loadShopeeFinance(cfg,auth,callShopeeShopApi,{now:to,timeRange:range}),
      loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,dates)
        .then(value=>({ok:true,value}))
        .catch(error=>({ok:false,error:String(error.message||error).slice(0,250)}))
    ]);
    const adsSweep=adsResult.ok
      ?{...matchFinanceAds(finance,adsResult.value),dates}
      :{status:'unavailable',dates,error:adsResult.error,
        message:'Não foi possível concluir a varredura de Ads. O custo de publicidade e o resultado após Ads continuam indisponíveis; NÃO considere R$ 0.'};
    res.json({ok:true,...finance,adsSweep});
  }catch(e){
    const error=String(e.message||e).slice(0,360);
    const forbidden=/permission|denied|403|forbidden/i.test(error);
    res.status(forbidden?403:400).json({error,category:forbidden?'finance_permission':'finance_query',
      help:forbidden
        ?'Verifique a permissão Payment / get_escrow_detail na Shopee Open Platform.'
        :'Consulte um período menor ou verifique os detalhes dos pedidos na Shopee.'});
  }
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

setInterval(()=>void runOptimizerJobs(),4000).unref();
void runOptimizerJobs();
orderMonitor.start();
try{wedropScheduler.start();}catch(error){console.warn('[WeDrop] Feed não iniciado:',String(error.message||error).slice(0,200));}
app.listen(PORT,()=>console.log(`Rede Achados BR Shopee API em http://localhost:${PORT}`));

