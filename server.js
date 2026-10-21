import express from 'express';
import session from 'express-session';
import {createShopeeSessionStore,SESSION_TTL_MS} from './shopeeSessionStore.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAuthStore} from './authStore.js';
import {mergeShopeeOrderDates,mergeShopeeOrderSummaries} from './orderView.js';
import {createShopeeOrderMonitor} from './orderMonitor.js';
import {loadShopeeAdsOverview} from './adsReport.js';
import {loadShopeeFinance,MAX_FINANCE_ORDERS} from './shopeeFinance.js';
import {installFinanceBridge,installWalletBridge,installAdsFinanceBridge} from './financeBridge.js';
import {buildAdsFinanceSnapshot} from './financeAdsBridge.js';
import {readShopeeAdsAccount} from './shopeeAdsAccount.js';
import {readShopeeWallet} from './shopeeWallet.js';
import {financeAdsDates,matchFinanceAds} from './financeAdsSweep.js';
import {financeRange} from './shopeeFinance.js';
import {fetchCatalogPage,normalizeShopeeModels,validItemId} from './catalog.js';
import {getShopeeNewListingsSummary,clearShopeeNewListingsCache} from './shopeeNewListings.js';
import {storeCatalogItems,storeCatalogModels,readCatalogCache,catalogStoreReady,findExactCatalogSku,findCatalogSkuIgnoringCase} from './catalogStore.js';
import {previewWeDropCsv,prepareWeDropImport,MAX_CSV_CHARS} from './wedropCsv.js';
import {saveWeDropCosts,getWeDropCoverage,compareIncomingCosts,pendingWeDropModels} from './wedropCosts.js';
import {saveWeDropProducts,readWeDropProduct} from './wedropCosts.js';
import {supplierWorkflowFacts} from './shopeeSupplierFacts.js';
import {supplierAttributeSuggestions} from './shopeeSupplierEvidenceFacts.js';
import {readShopeeSourceEvidence,saveShopeeSourceText,importShopeeEvidenceImage,removeShopeeEvidenceImage,downloadShopeeEvidenceImages} from './shopeeSourceEvidence.js';
import {extractSupplierScreenshotText,mergeExtractedPrints,withoutExtractedPrints} from './shopeeEvidenceVision.js';
import {fiscalMatrixSource,technicalMatrixSource,assertShopeeSupplierBrand,isShopeeCestConfirmed} from './shopeeMatrixRules.js';
import {readWeDropSyncState,getStoredWeDropCostCount} from './wedropCosts.js';
import {getSkuReview,searchSupplierSku,confirmSkuLink,undoSkuLink} from './wedropSkuReview.js';
import {auditShopeeItem,validateSkuLookup} from './productOptimizer.js';
import {buildStages,safeTitle,validateReview} from './shopeeOptimizationWorkflow.js';
import {composeShopeeDescription,isCommercialDescription} from './shopeeDescriptionComposer.js';
import {getWorkflowReview,saveWorkflowReview} from './shopeeOptimizationWorkflowStore.js';
import {compileShopeeExecutionPlan,confirmShopeeExecution,
  assertLiveShopeeUnchanged,verifyShopeeExecution,normalizeShopeeExecutionStage} from './shopeeExecutionPlan.js';
import {readShopeeExecution,saveShopeePreparedExecution,
  claimShopeePreparedExecution,finishShopeeExecution,pendingShopeeExecutions,leaseShopeeExecution,
  checkpointShopeeExecution,reconcileShopeeJob} from './shopeeExecutionStore.js';
import {advanceShopeeExecution} from './shopeeExecutionWorker.js';
import {shopeeExecutionProgress,withExecutionEvent} from './shopeeExecutionProgress.js';
import {recyclableShopeeMedia,archiveShopeeMedia} from './shopeeExecutionMediaReuse.js';
import {normalizedShopeeFiscalBatchSkus,checkedShopeeFiscalBatchEntries} from './shopeeExecutionBatch.js';
import {fiscalPreviewDisposition} from './shopeeFiscalReadiness.js';
import {detectShopeeExecutionIssue,needsCestRevalidation} from './shopeeExecutionIssues.js';
import {createShopeeMediaApi} from './shopeeMediaApi.js';
import {normalizeManualVideo} from './shopeeVideoValidation.js';
import * as ShopeeMarktPro from './shopeeMarktPro.js';
import {readPreparedImages,importPreparedImage,deletePreparedImage,downloadPreparedImage,imagesSignature,MAX_IMAGE_BYTES,rememberPublishedImages} from './shopeePreparedImages.js';
import {generateOpenAiImage,imageGenerationStatus} from './shopeeOpenAiImages.js';
import {openAiKeyStatus,openAiApiKey,saveOpenAiApiKey,deleteOpenAiApiKey} from './shopeeOpenAiCredentials.js';
import {compileAttributes,compileTax,attributeAuditForChanges} from './shopeeStructuredFields.js';
import {inspectAnatelCompliance} from './shopeeAnatel.js';
import {assertSearchableAttribute,searchAttributeRequest,readSearchedAttributeOptions,hydrateSearchOptions} from './shopeeCategorySearch.js';
import {MAX_VIDEO_BYTES,getShopeeManualVideo,importShopeeManualVideo,
 signedShopeeManualVideoPreview,manualVideoPublicInfo,downloadShopeeManualVideo,rememberPublishedVideo} from './shopeeManualVideo.js';
import {findLiveShopeeSku} from './shopeeSkuFinder.js';
import {optimizerSettings,saveOptimizerSettings} from './optimizerStore.js';
import {quoteShopeePrice,normalizeShopeePricingSettings} from './shopeePricing.js';
import {lookupShopeeCompetitors,marketResearchConfigured} from './shopeeMarketResearch.js';
import {promotionFromQuote,promotionBasePrice,promotionMember,shopDiscountMembershipSignal,discountPlanSnapshot,signDiscountPreview,verifyDiscountPreview,readDiscountPages} from './shopeeDiscountPublish.js';
import {shopeePricingPreferences,saveShopeePricingPreferences,
  shopeePricingSupplierCost,shopeePricingDirectSupplierCost,
  saveShopeePricePlan,recentShopeePricePlans,
  savedShopeePricePlan,shopeeAdsReservedPricePlans} from './shopeePricingStore.js';
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

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'Rede Achados BR Shopee API',version:'1.20.9',storage:authStore.status()}));
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

// Dashboard: create_time comes from Shopee's item details, never from
// update_time or the catalog's first sync date. Read-only shop-scoped API.
app.get('/api/shopee/dashboard/new-listings',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth,cfg}=await getValidAuth(req);
  if(req.query?.fresh==='1')clearShopeeNewListingsCache(auth.shopId);
  const report=await getShopeeNewListingsSummary({cfg,auth,callApi:callShopeeShopApi});
  res.json(report);
 }catch(error){
  res.status(503).json({ok:false,unavailable:true,
   error:String(error?.message||error).slice(0,230)});
 }
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
    const deep=req.query.deep==='1';
    let matches=await findExactCatalogSku(auth.shopId,sku);
    let lookup='saved_catalog',warnings=[];
    if(!matches.length){
      // Fast path: direct official SKU search, no 12-page catalog scan for each keystroke.
      // Users can explicitly request the full fallback if directed search misses.
      const live=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,sku,{fastOnly:!deep});
      warnings=live.warnings||[];
      matches=live.matches.length?await findExactCatalogSku(auth.shopId,sku):[];
      lookup=matches.length?'live_verified':deep?'not_found':'fast_not_found';
      if(live.matches.length&&!matches.length)
        throw Error('A Shopee encontrou a SKU, mas não foi possível salvar o vínculo no catálogo. Tente novamente.');
    }
    res.json({ok:true,sku,matches,lookup,canDeepSearch:!deep&&!matches.length,warnings:warnings.slice(0,3),
      message:matches.length
        ?'SKU exata localizada '+(lookup==='live_verified'?'na Shopee e salva no catálogo.':'no catálogo salvo.')+
         ' Item ID obtido automaticamente.'
        :deep?'Busca completa não confirmou a SKU. Confira a loja e sincronize o catálogo.':
         'Pesquisa direta sem resultado; a busca aprofundada pode verificar o restante do catálogo.'});
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
    let technicalPreview=record.attributeAudit,technicalWarning='';
    if(Array.isArray(review.attributes)&&review.attributes.length){
      try{
        await hydrateCategoryChoices(record,review.attributes,cfg,auth,current);
        technicalPreview=attributeAuditForChanges(review.attributes,record,current);
      }catch(e){technicalWarning=String(e.message||e).slice(0,220);}
    }
    const [supplier,settings]=await Promise.all([
      readWeDropProduct(auth.shopId,{sku,itemId,modelId}),optimizerSettings(auth.shopId)]);
    // Supplementary supplier evidence must never block the actual category audit.
    // Storage may reject a read/signing request; the main SKU workflow stays usable.
    let sourceEvidence={sku,sourceText:'',screenshots:[],updatedAt:null};
    let sourceEvidenceWarning=null;
    try{
      sourceEvidence=await readShopeeSourceEvidence(auth.shopId,itemId,modelId,sku,{preview:true});
    }catch(error){
      sourceEvidenceWarning='As informações extras da WeDrop estão indisponíveis no momento. '+
        'A otimização principal continua funcionando. Atualize ou tente salvar os dados novamente.';
      console.warn('[shopee-source-evidence] supplementary read unavailable:',String(error.message||error).slice(0,150));
    }
    const supplierFacts=supplierWorkflowFacts(supplier,record,settings);
    let evidenceFacts=supplierAttributeSuggestions({attributes:technicalPreview.attributes,
      proposed:review.attributes||[],supplier,sourceText:sourceEvidence.sourceText,
      productDescription:record.description});
    // Brand/category option lists can be truncated. Resolve missing exact values
    // through Shopee's official search before prefilling, never manufacture IDs.
    const searchable=evidenceFacts.unresolved.filter(x=>x.value&&
      /^(marca|brand|estampa|padr[aã]o|dimens[oõ]es do produto)$/i.test(x.name||'')).slice(0,3);
    let extraOptions=false;
    for(const missing of searchable){
      const attr=technicalPreview.attributes.find(x=>Number(x.id)===Number(missing.attributeId));
      if(!attr?.supportSearch||attr.conditional)continue;
      try{
        const request=searchAttributeRequest({attributeId:attr.id,valueName:missing.value,limit:50});
        const official=readSearchedAttributeOptions(await matrixShopeeSearch(cfg,auth,request),0,50).options
          .find(x=>x.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()===
            String(missing.value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim());
        if(official){
          attr.options=[...(attr.options||[]).filter(x=>Number(x.id)!==Number(official.id)),official];
          extraOptions=true;
        }
      }catch(error){
        console.warn('[shopee-autofill] official category option unavailable:',String(error.message||error).slice(0,120));
      }
    }
    if(extraOptions)evidenceFacts=supplierAttributeSuggestions({attributes:technicalPreview.attributes,
      proposed:review.attributes||[],supplier,sourceText:sourceEvidence.sourceText,
      productDescription:record.description});
    const manualVideo=manualVideoPublicInfo(
      await getShopeeManualVideo(auth.shopId,itemId,modelId,sku));
    // Já ao consultar a SKU, uma descrição comercial pronta substitui o texto bruto.
    // Preservar somente o texto salvo que já segue integralmente as regras da loja.
    const composed=composeShopeeDescription({record,supplier,sourceText:sourceEvidence.sourceText});
    const keepReviewedDescription=isCommercialDescription(review.draftDescription);
    const finalDescription=keepReviewedDescription?review.draftDescription:composed.description;
    res.json({ok:true,readOnlyMarketplace:true,sku,itemId,modelId,manualVideo,...supplierFacts,
      sourceEvidence,sourceEvidenceWarning,sourceFacts:evidenceFacts,
      contentVariants:review.contentVariants||null,contentResearch:review.contentResearch||null,
      attributes:technicalPreview.attributes,anatel:inspectAnatelCompliance(technicalPreview),technicalWarning,attributeChanges:review.attributes||[],taxDraft:review.tax||{},taxCurrent:current.tax_info||{},
      recordedAt:stored?.updated_at||null,stages,
      variationConfig:review.variationConfig||officialVariationConfig,
      hasShopeeModels:Boolean(record.hasModel),shopeeModels:record.models||[],
      shopeeVariationTiers:record.variationTiers||[],imageNotes:review.imageNotes||{},
      draftTitle:review.draftTitle||safeTitle(record.title),
      draftDescription:finalDescription,
      descriptionAutoGenerated:!keepReviewedDescription,
      descriptionComposer:{valid:composed.valid,count:composed.characterCount,
        source:composed.source,warnings:composed.warnings},
      imageCount:record.imageCount,
      videoStatus:record.videoStatus,categoryId:record.categoryId,
      imageUrls:(record.imageUrls||[]).slice(0,9),productTitle:record.title});
  }catch(e){res.status(400).json({error:String(e.message||e).slice(0,350)});}
});
// Reference material belongs to an exact authenticated Shopee shop/item/model/SKU.
// Screenshots are private. Automatic transcription is explicit and never authorizes Shopee writes.
app.get('/api/shopee/optimizer/workflow/source',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth,itemId,modelId,sku}=await checkedWorkflowAudit(req);
  res.json({ok:true,sourceEvidence:await readShopeeSourceEvidence(auth.shopId,itemId,modelId,sku,{preview:true})});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,200)});}
});
app.post('/api/shopee/optimizer/workflow/source',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,itemId,modelId,sku}=await checkedWorkflowAudit(req);
  const action=String(req.body.action||'text');
  if(action==='text')
   await saveShopeeSourceText(auth.shopId,itemId,modelId,sku,req.body.sourceText);
  else if(action==='image')
   await importShopeeEvidenceImage(auth.shopId,itemId,modelId,sku,{
    imageBase64:req.body.imageBase64,mime:req.body.mime,filename:req.body.filename});
  else if(action==='remove'){
   await removeShopeeEvidenceImage(auth.shopId,itemId,modelId,sku,req.body.id);
   // Extraction derived from a removed print is no longer valid.
   const evidence=await readShopeeSourceEvidence(auth.shopId,itemId,modelId,sku);
   const cleaned=withoutExtractedPrints(evidence.sourceText);
   if(cleaned!==evidence.sourceText)await saveShopeeSourceText(auth.shopId,itemId,modelId,sku,cleaned);
  }
  else if(action==='extract'){
   const images=await downloadShopeeEvidenceImages(auth.shopId,itemId,modelId,sku);
   if(!images.length)throw Error('Anexe um print JPG ou PNG para a leitura automática.');
   const key=await openAiApiKey(auth.shopId);
   const transcription=await extractSupplierScreenshotText(key,images);
   const evidence=await readShopeeSourceEvidence(auth.shopId,itemId,modelId,sku);
   const merged=mergeExtractedPrints(evidence.sourceText,transcription.lines);
   if(!merged.count)throw Error('Não foi possível identificar especificações legíveis. Cole o texto da WeDrop.');
   await saveShopeeSourceText(auth.shopId,itemId,modelId,sku,merged.text);
   return res.json({ok:true,extractedCount:merged.count,
     sourceEvidence:await readShopeeSourceEvidence(auth.shopId,itemId,modelId,sku,{preview:true})});
  }
  else throw Error('Operação de evidência não reconhecida.');
  res.json({ok:true,sourceEvidence:await readShopeeSourceEvidence(auth.shopId,itemId,modelId,sku,{preview:true})});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,270)});}
});
// Category-attribute options are loaded from the official Shopee endpoint.
// Restrict searches to category/attribute pairs verified by the product audit.
async function matrixShopeeSearch(cfg,auth,request){
 return callShopeeShopApi(cfg,{path:'/api/v2/product/search_attribute_value_list',
  method:'POST',accessToken:auth.accessToken,shopId:auth.shopId,query:request});
}
async function hydrateCategoryChoices(record,changes,cfg,auth,live){
 // A selected parent may activate children not active in the live advertisement.
 // Rebuild against the draft before checking/searching dependent choices.
 if(Array.isArray(changes)&&live){
  const draft=attributeAuditForChanges(changes,record,live);
  record.attributeAudit.attributes=draft.attributes;
 }
 await hydrateSearchOptions(record,changes,request=>matrixShopeeSearch(cfg,auth,request));
}
app.post('/api/shopee/optimizer/workflow/attributes/options',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem da solicitação não permitida.'});
 try{
  const {itemId,modelId,sku,auth,cfg,record}=await checkedWorkflowAudit(req);
  const attributeId=Number(req.body.attributeId);
  const live=await shopeeLiveEditableItem(cfg,auth,itemId);
  const draft=attributeAuditForChanges(req.body.attributes||[],record,live);
  assertSearchableAttribute({...record,attributeAudit:draft},attributeId);
  const query=searchAttributeRequest({
   attributeId,valueName:req.body.valueName,cursor:req.body.cursor??0,limit:req.body.limit??50
  });
  const data=readSearchedAttributeOptions(await matrixShopeeSearch(cfg,auth,query),query.cursor,query.limit);
  res.json({ok:true,sku,itemId,modelId,categoryId:record.categoryId,attributeId,...data});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,300)});}
});
app.post('/api/shopee/optimizer/workflow/attributes/preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
  try{
    const {itemId,auth,cfg,record}=await checkedWorkflowAudit(req);
    const live=await shopeeLiveEditableItem(cfg,auth,itemId);
    await hydrateCategoryChoices(record,req.body.attributes||[],cfg,auth,live);
    const audit=attributeAuditForChanges(req.body.attributes,record,live);
    res.json({ok:true,categoryId:record.categoryId,attributes:audit.attributes,anatel:inspectAnatelCompliance(audit)});
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
      if(images.length!==9)throw Error('Gere ou importe todas as nove imagens antes de aprovar a substituição.');
      change.imagesSignature=imagesSignature(images);
    }
    if(change.stage==='technical'&&change.reviewed){
      const live=await shopeeLiveEditableItem(cfg,auth,itemId);
      const attributes=change.attributes||[];
      await hydrateCategoryChoices(record,attributes,cfg,auth,live);
      const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
      assertShopeeSupplierBrand({record,attributes,supplier});
      change.matrixTechnical=technicalMatrixSource({sku,record,attributes});
      const verifiedAttributes=attributeAuditForChanges(attributes,record,live);
      if(Number(verifiedAttributes?.missingMandatory)>0)
        throw Error('Motor Matriz: a ficha técnica ainda possui '+verifiedAttributes.missingMandatory+' atributo(s) obrigatório(s) sem preenchimento. Corrija antes de aprovar.');
      compileAttributes(attributes,record,live);
    }else if(change.attributes)compileAttributes(change.attributes,record,await shopeeLiveEditableItem(cfg,auth,itemId));
    if(change.stage==='fiscal'&&change.reviewed){
      const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
      change.matrixFiscal=fiscalMatrixSource({sku,supplier,tax:change.tax});
      // Register the accountant-supplied SKU fields in Motor Matriz even if
      // Shopee previously rejected the fiscal update due to missing CEST.
      // Validating a LOCAL draft must never require a Shopee tax_info read/write.
      // compileTax accepts an omitted CEST; it does not invent a substitute.
      compileTax(change.tax,{tax_info:{}});
    }else if(change.tax)compileTax(change.tax,{tax_info:{}});
    const state=await saveWorkflowReview(auth.shopId,itemId,modelId,sku,change);
    res.json({ok:true,saved:true,marketplaceUpdated:false,sku,itemId,modelId,
      fiscalRegistration:change.stage==='fiscal'?{
        status:'saved_in_matrix',registered:true,shopUpdated:false,
        cestOptional:true,cestProvided:isShopeeCestConfirmed(state.tax?.cest),
        message:'Dados fiscais cadastrados no Motor Matriz. CEST 00 é apenas marcador local; a Shopee não foi alterada.'
      }:null,
      stages:buildStages(record,state),attributeChanges:state.attributes||[],taxDraft:state.tax||{},draftTitle:state.draftTitle||safeTitle(record.title),
      // Se outra etapa foi salva, mantenha o rascunho gerado na tela em vez de
      // substituí-lo silenciosamente pelo anúncio antigo.
      ...(change.stage==='description'&&state.draftDescription?{draftDescription:state.draftDescription}:{}),
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
    const selectedStage=normalizeShopeeExecutionStage(req.body.stage||'all');
    // CPF/CNPJ is not a gate to saving fiscal data. Only a separately selected
    // fiscal execution may send tax_info; "all" leaves saved tax details intact.
    const review=await getWorkflowReview(auth.shopId,itemId,modelId);
    if(review&&review.sku!==sku)throw Error('SKU do plano revisado é diferente. Refaça a auditoria.');
    const live=await shopeeLiveEditableItem(cfg,auth,itemId);
    const manualVideo=await getShopeeManualVideo(auth.shopId,itemId,modelId,sku);
    const previous=await readShopeeExecution(auth.shopId,itemId,modelId);
    const verifiedVideoSha256=previous?.state==='verified'&&
      verifyShopeeExecution(previous.plan,live,previous.result)?previous.plan.video?.sha256:null;
    const manualImages=await readPreparedImages(auth.shopId,itemId,modelId,sku);
    const reviewState=review?.review_state||{};
    if(selectedStage==='fiscal'&&reviewState.stages?.fiscal?.reviewed&&reviewState.tax){
      const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
      fiscalMatrixSource({sku,supplier,tax:reviewState.tax,reviewSource:reviewState.matrixFiscal});
    }
    // Marca proveniente da WeDrop precisa coincidir com a categoria mesmo que a
    // ficha técnica não esteja aprovada; nunca publicar com Marca: Novo por engano.
    const supplierForBrand=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
    if(['all','technical'].includes(selectedStage))
      assertShopeeSupplierBrand({record,attributes:reviewState.stages?.technical?.reviewed?
        reviewState.attributes||[]:[],supplier:supplierForBrand});
    if(['all','technical'].includes(selectedStage)&&reviewState.stages?.technical?.reviewed){
      technicalMatrixSource({sku,record,attributes:reviewState.attributes||[],reviewSource:reviewState.matrixTechnical});
      await hydrateCategoryChoices(record,reviewState.attributes||[],cfg,auth,live);
    }
    const inputs={shopId:auth.shopId,itemId,modelId,sku,record,
      review:review?.review_state||{},live,manualVideo,verifiedVideoSha256,manualImages,selectedStage};
    let plan=compileShopeeExecutionPlan({...inputs,omitFiscal:selectedStage==='all'});
    // Previous Shopee validation can mean tax_info was rejected while other
    // approved changes are independent. Treat local CEST "00" as unset; OMIT tax_info entirely,
    // and let the next explicit execution try only non-fiscal changes.
    // A refusal from Shopee itself is still decisive, never silently bypassed.
    const taxDraftNcm=String(reviewState.tax?.ncm||live.tax_info?.ncm||'').trim();
    const priorFiscalDeferred=previous?.sku===sku&&previous?.plan?.fiscalDeferred===true&&
      !isShopeeCestConfirmed(reviewState.tax?.cest)&&
      !isShopeeCestConfirmed(live.tax_info?.cest)&&
      taxDraftNcm===String(previous.plan.deferredTaxDraft?.ncm||previous.plan.original?.tax_info?.ncm||'').trim();
    const deferFiscal=selectedStage==='all'&&Boolean(priorFiscalDeferred||
      (previous?.sku===sku&&needsCestRevalidation(previous.last_error,previous.plan,plan)));
    if(deferFiscal)plan=compileShopeeExecutionPlan({...inputs,deferUnconfirmedFiscal:true,
      omitFiscal:true});
    if(selectedStage==='fiscal'){
      const disposition=fiscalPreviewDisposition({plan,
        previousError:previous?.last_error,previousPlan:previous?.plan});
      if(!disposition.allowed){
        plan.canExecute=false;
        plan.blocked.push(...disposition.issues);
      }
    }
    plan.reusedMedia=recyclableShopeeMedia(previous,plan);
    plan.mediaArchive=archiveShopeeMedia(previous,plan);
    const stored=await saveShopeePreparedExecution(auth.shopId,itemId,modelId,sku,plan);
    res.json({ok:true,ready:plan.canExecute,plan,progress:shopeeExecutionProgress(stored),
      issue:deferFiscal&&!plan.canExecute?
        detectShopeeExecutionIssue(previous.last_error,previous.plan):null,
      updatedAt:stored.updated_at,executionStatus:stored.state,marketplaceUpdated:false});
  }catch(e){res.status(409).json({error:String(e.message||e).slice(0,300)});}
});
// BATCH: prepare and execute ONLY fiscal tax_info for distinct exact SKUs.
// Each item uses the same audited plan, saved review, CAS lock and durable worker
// as a single-SKU execution. A failed item never cancels other items.
app.post('/api/shopee/optimizer/batch/fiscal/prepare',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const skus=normalizedShopeeFiscalBatchSkus(req.body.skus);
  const {auth,cfg}=await getValidAuth(req);
  const results=[],usedItemIds=new Set();
  for(const requestedSku of skus){
   let sku=requestedSku;
   try{
    // A busca digitada pode ser "trc1525" embora o SKU oficial seja "TRC1525".
    // Localize ignorando caixa, mas execute SOMENTE usando o SKU real da Shopee.
    let matches=await findCatalogSkuIgnoringCase(auth.shopId,requestedSku);
    if(!matches.length){
      // Catálogo local pode estar desatualizado; consultar a API oficial, sem
      // pedir que o vendedor sincronize ou importe manualmente outra vez.
      const candidates=[...new Set([requestedSku,requestedSku.toUpperCase()])];
      for(const candidate of candidates){
        await findLiveShopeeSku(cfg,auth,callShopeeShopApi,candidate,{fastOnly:true});
        matches=await findCatalogSkuIgnoringCase(auth.shopId,requestedSku);
        if(matches.length)break;
      }
    }
    if(matches.length!==1)throw Error(matches.length?
      'Mais de um anúncio/modelo usa esta SKU. Selecione individualmente para evitar alterar o produto errado.':
      'SKU não encontrada nem no catálogo nem na consulta direcionada à Shopee. Confira o código do anúncio.');
    sku=matches[0].sku; // spelling/case verified in catalog, not fabricated.
    const {itemId,modelId}=matches[0];
    if(usedItemIds.has(String(itemId)))
     throw Error('O anúncio-pai já consta neste lote com outra variação.');
    usedItemIds.add(String(itemId));
    const record=await auditShopeeItem(cfg,auth,callShopeeShopApi,itemId,
      {expectedSku:sku,expectedModelId:String(modelId)});
    const review=await getWorkflowReview(auth.shopId,itemId,modelId);
    if(!review||review.sku!==sku||review.review_state?.stages?.fiscal?.reviewed!==true||
      !review.review_state?.tax)throw Error('Informações fiscais ainda não conferidas para esta SKU.');
    const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
    fiscalMatrixSource({sku,supplier,tax:review.review_state.tax,
      reviewSource:review.review_state.matrixFiscal});
    const live=await shopeeLiveEditableItem(cfg,auth,itemId);
    const plan=compileShopeeExecutionPlan({shopId:auth.shopId,itemId,modelId,sku,
      record,review:review.review_state,live,selectedStage:'fiscal'});
    const prior=await readShopeeExecution(auth.shopId,itemId,modelId);
    const disposition=fiscalPreviewDisposition({plan,
      previousError:prior?.last_error,previousPlan:prior?.plan});
    if(!disposition.allowed){
      results.push({sku,itemId:String(itemId),modelId:String(modelId),
        ready:false,registered:true,state:'draft_only',current:live.tax_info||{},
        proposed:plan.proposed.tax_info||null,
        blocked:plan.blocked,
        publicationPending:disposition.issues,
        warnings:plan.warnings.filter(x=>/Fiscal|CEST|NCM|Anatel/i.test(x)),
        message:'Ficha fiscal salva no Motor Matriz. Envio à Shopee pendente por exigência de CEST; os demais dados permanecem cadastrados.'});
      continue;
    }
    plan.mediaArchive=archiveShopeeMedia(prior,plan);
    const job=await saveShopeePreparedExecution(auth.shopId,itemId,modelId,sku,plan);
    results.push({sku,itemId:String(itemId),modelId:String(modelId),
      ready:plan.canExecute,state:job.state,planId:plan.planId,updatedAt:job.updated_at,
      current:live.tax_info||{},proposed:plan.proposed.tax_info||null,
      blocked:plan.blocked,warnings:plan.warnings.filter(x=>/Fiscal|CEST|NCM|Anatel/i.test(x)),
      message:plan.canExecute?'Prévia fiscal preparada; anúncio não alterado.':
       'Revisão fiscal pendente ou nenhuma alteração fiscal aprovada.'});
   }catch(error){
    results.push({sku:requestedSku,ready:false,state:'failed_preview',
      error:String(error.message||error).slice(0,230)});
   }
  }
  res.json({ok:true,stage:'fiscal',marketplaceUpdated:false,
    results,ready:results.filter(x=>x.ready).length,total:results.length});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,260)});}
});
app.post('/api/shopee/optimizer/batch/fiscal/execute',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  if(req.body.confirmation!=='EXECUTAR LOTE FISCAL'||req.body.acceptPartialExecution!==true)
   throw Error('Confirme explicitamente o lote fiscal aprovado.');
  const items=checkedShopeeFiscalBatchEntries(req.body.items);
  const {auth,cfg}=await getValidAuth(req);
  // Submission is an explicit, authenticated action after fiscal-only preview.
  // It does not issue any NF-e and does not depend on a CPF/CNPJ dropdown.
  const results=[];
  for(const item of items){
   try{
    const {sku,itemId,modelId,planId,updatedAt}=item;
    const job=await readShopeeExecution(auth.shopId,itemId,modelId);
    if(job?.sku!==sku||job.state!=='prepared'||job.plan?.planId!==planId||
       job.updated_at!==updatedAt||job.plan.selectedStage!=='fiscal'||!job.plan.canExecute||
       Object.keys(job.plan.proposed||{}).some(k=>k!=='tax_info')||
       job.plan.images?.length||job.plan.video)
       throw Error('Prévia fiscal mudou. Reprepare apenas esta SKU.');
    const record=await auditShopeeItem(cfg,auth,callShopeeShopApi,itemId,
      {expectedSku:sku,expectedModelId:modelId});
    const review=await getWorkflowReview(auth.shopId,itemId,modelId);
    if(review?.sku!==sku||!review.review_state?.stages?.fiscal?.reviewed||!review.review_state?.tax)
     throw Error('Revisão fiscal ausente ou alterada.');
    const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
    fiscalMatrixSource({sku,supplier,tax:review.review_state.tax,
      reviewSource:review.review_state.matrixFiscal});
    const live=await shopeeLiveEditableItem(cfg,auth,itemId);
    assertLiveShopeeUnchanged(job.plan,live);
    const recalculated=compileShopeeExecutionPlan({shopId:auth.shopId,itemId,modelId,sku,
      record,review:review.review_state,live,selectedStage:'fiscal'});
    if(!recalculated.canExecute||recalculated.fingerprint!==job.plan.fingerprint)
      throw Error('Valores fiscais diferentes da prévia. Revise a SKU novamente.');
    const disposition=fiscalPreviewDisposition({plan:job.plan,
      previousError:job.last_error,previousPlan:job.plan});
    if(!disposition.allowed)throw Error(disposition.issues.join(' '));
    confirmShopeeExecution(job.plan,{sku,confirmation:'EXECUTAR '+sku});
    await claimShopeePreparedExecution(auth.shopId,itemId,modelId,{
      planId,updatedAt,runId:crypto.randomUUID()});
    results.push({sku,itemId,modelId,status:'running',
      message:'Atualização fiscal autorizada, aguardando confirmação individual da Shopee.'});
   }catch(error){results.push({sku:item.sku,itemId:item.itemId,modelId:item.modelId,
     status:'failed',message:String(error.message||error).slice(0,260)});}
  }
  res.status(202).json({ok:true,stage:'fiscal',marketplaceUpdated:false,results});
  if(results.some(x=>x.status==='running'))void runOptimizerJobs();
 }catch(e){res.status(409).json({ok:false,error:String(e.message||e).slice(0,280)});}
});
app.get('/api/shopee/optimizer/batch/fiscal/status',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const raw=JSON.parse(String(req.query.items||'[]'));
  if(!Array.isArray(raw)||raw.length>12)throw Error('Lote inválido.');
  const {auth}=await getValidAuth(req);
  const results=[];
  for(const item of raw){
   const itemId=validItemId(item?.itemId),modelId=String(item?.modelId??'0');
   const sku=validateSkuLookup(item?.sku);
   if(!/^\d{1,18}$/.test(modelId))throw Error('Modelo inválido.');
   const job=await readShopeeExecution(auth.shopId,itemId,modelId);
   results.push({sku,itemId,modelId,status:job?.sku===sku?job.state:'not_found',
    issue:job?.sku===sku?detectShopeeExecutionIssue(job.last_error,job.plan):null,
    message:job?.sku===sku?(job.last_error||job.result?.phase||job.state):'Não localizada',
    verified:job?.sku===sku&&job.state==='verified'});
  }
  res.json({ok:true,results});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,220)});}
});
app.get('/api/shopee/optimizer/execution/status',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const itemId=validItemId(req.query.item_id),modelId=String(req.query.model_id||'0');
    const sku=validateSkuLookup(req.query.sku);
    if(!/^\d{1,18}$/.test(modelId))throw Error('Model ID inválido.');
    const {auth}=await getValidAuth(req);
    const job=await readShopeeExecution(auth.shopId,itemId,modelId);
    const owned=job?.sku===sku?job:null;
    res.json({ok:true,job:owned,progress:shopeeExecutionProgress(owned),
      issue:owned?detectShopeeExecutionIssue(owned.last_error,owned.plan):null});
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
  if(Object.hasOwn(plan.proposed||{},'tax_info')&&plan.selectedStage!=='fiscal')
   throw Error('Informações fiscais só podem ser enviadas em execução fiscal individual, nunca junto das outras etapas.');
  if(normalizeShopeeExecutionStage(req.body.stage||'all')!==normalizeShopeeExecutionStage(plan?.selectedStage||'all'))
   throw Error('A etapa escolhida mudou desde a prévia. Reprepare.');
  if(plan?.planId!==String(req.body.planId||'')||String(job.updated_at)!==String(req.body.updatedAt||''))
   throw Error('Plano alterado em outra sessão. Prepare novamente.');
  confirmShopeeExecution(plan,{sku,confirmation:req.body.confirmation});
  const review=await getWorkflowReview(auth.shopId,itemId,modelId);
  if(review?.sku!==sku)throw Error('Revisão da SKU mudou. Prepare novamente.');
  const reviewState=review.review_state||{};
  if(plan.selectedStage==='fiscal'&&reviewState.stages?.fiscal?.reviewed&&reviewState.tax){
    const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
    fiscalMatrixSource({sku,supplier,tax:reviewState.tax,reviewSource:reviewState.matrixFiscal});
  }
  const live=await shopeeLiveEditableItem(cfg,auth,itemId);
  const supplierForBrand=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
  if(['all','technical'].includes(plan.selectedStage||'all'))
    assertShopeeSupplierBrand({record,attributes:reviewState.stages?.technical?.reviewed?
      reviewState.attributes||[]:[],supplier:supplierForBrand});
  if(['all','technical'].includes(plan.selectedStage||'all')&&reviewState.stages?.technical?.reviewed){
    technicalMatrixSource({sku,record,attributes:reviewState.attributes||[],reviewSource:reviewState.matrixTechnical});
    await hydrateCategoryChoices(record,reviewState.attributes||[],cfg,auth,live);
  }
  assertLiveShopeeUnchanged(plan,live);
  const manualVideo=plan.video?await getShopeeManualVideo(auth.shopId,itemId,modelId,sku):null;
  const manualImages=plan.images?.length?await readPreparedImages(auth.shopId,itemId,modelId,sku):[];
  const fresh=compileShopeeExecutionPlan({shopId:auth.shopId,itemId,modelId,sku,record,
   review:review.review_state,live,manualVideo,manualImages,
   deferUnconfirmedFiscal:plan.fiscalDeferred===true,
   omitFiscal:plan.selectedStage==='all',selectedStage:plan.selectedStage||'all'});
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
    updated=await reconcileShopeeJob(job,{state:'verified',result:withExecutionEvent({...job.result,phase:'verified',verified:true},'verified','A Shopee confirmou as alterações no anúncio.','success'),lastError:null});
  }
  else if(req.body.safeRecover===true&&detectShopeeExecutionIssue(job.last_error,job.plan)?.code==='CEST_REQUIRED'){
    // Reconcile a known field-level rejection without retrying any marketplace write.
    // Only release the old uncertain job after readback confirms that the listing
    // still matches its pre-execution baseline (images, video, attributes, tax).
    assertLiveShopeeUnchanged(job.plan,live);
    updated=await reconcileShopeeJob(job,{state:'failed',
      result:withExecutionEvent({...job.result,phase:'retry_allowed'},
        'cest-confirmed-rejection','CEST pendente: a Shopee rejeitou a edição; o anúncio foi conferido sem reenvio.','warning'),
      lastError:job.last_error});
  }
  else if(req.body.reprepare===true){
    if(req.body.confirmation!=='REPREPARAR '+sku)throw Error('Confirme REPREPARAR '+sku+'.');
    if(Date.now()-Date.parse(job.updated_at)<90000)throw Error('Aguarde 90 segundos para a Shopee consolidar a atualização.');
    assertLiveShopeeUnchanged(job.plan,live);
    updated=await reconcileShopeeJob(job,{state:'failed',result:{...job.result,phase:'retry_allowed'},
      lastError:'Leitura confirmou os valores anteriores. Uma nova prévia e aprovação são necessárias.'});
  }
  res.json({ok:true,job:updated,progress:shopeeExecutionProgress(updated),
    issue:detectShopeeExecutionIssue(updated.last_error,updated.plan),verified,message:verified?'Alterações confirmadas na Shopee.':
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
      state:uncertain?'uncertain':'failed',
      result:withExecutionEvent(current.result,uncertain?'result-uncertain':'execution-failed',
       uncertain?'Resultado pendente de confirmação pela Shopee.':'Execução interrompida: '+String(e.message||e).slice(0,150),'warning'),
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
  await saveWorkflowReview(info.shopId,info.itemId,info.modelId,info.sku,{stage:'video',reviewed:false});
  res.status(201).json({ok:true,asset,publishedInShopee:false,requiresReview:true,
   message:'Vídeo importado e salvo em armazenamento privado para esta SKU. Ainda não foi publicado na Shopee.'});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,270)});}
});


// Pesquisa MarktPro da mesma biblioteca já usada no Publisher do Mercado Livre.
// O servidor lê metadados do catálogo; a escolha importa o vídeo apenas para a SKU conferida.
function marktProTitle(req,info,matches){
 const exact=matches.find(x=>String(x.itemId)===String(info.itemId)&&String(x.modelId)===String(info.modelId));
 const suggested=String(req.query?.title||'').replace(/[\x00-\x1F]/g,' ').trim().slice(0,250);
 const official=String(exact?.title||'');
 // Título da variação no cache pode ser apenas "Variação do Item ..."
 return (official&&!/^Variação do Item \d+$/i.test(official)?official:suggested)||info.sku;
}
async function marktProCandidates(req,info){
 const matches=await findExactCatalogSku(info.shopId,info.sku);
 const title=marktProTitle(req,info,matches);
 const results=await ShopeeMarktPro.search(title);
 return {title,results};
}
function marktProCandidateFor(id,results){
 if(!/^[A-Za-z0-9_-]{8,200}$/.test(String(id||'')))throw Error('Identificador de vídeo inválido.');
 const candidate=results.candidates?.find(x=>x.id===id);
 if(!candidate||candidate.hardMismatch||candidate.score<.46)
  throw Error('O vídeo não pertence às opções encontradas para este produto. Faça nova busca.');
 return candidate;
}
app.get('/api/shopee/optimizer/video/marktpro/search',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const info=await checkedManualVideoIdentity(req);
  const {title,results}=await marktProCandidates(req,info);
  res.json({ok:true,sku:info.sku,itemId:info.itemId,modelId:info.modelId,title,
   inventoryCount:results.inventoryCount,bestQuery:results.bestQuery,
   candidates:results.candidates.slice(0,5).map(x=>({id:x.id,title:x.title,score:x.score,durationMs:x.durationMs,
    category:x.category,hardMismatch:x.hardMismatch,variantReasons:x.variantReasons})),source:'MarktPro',publication:false});
 }catch(e){res.status(503).json({error:'Busca MarktPro indisponível: '+String(e.message||e).slice(0,210)});}
});
app.get('/api/shopee/optimizer/video/marktpro/stream',mustLogin,requireWeDropAdmin,async(req,res)=>{
 try{
  const info=await checkedManualVideoIdentity(req);
  const {results}=await marktProCandidates(req,info);
  marktProCandidateFor(String(req.query?.id||''),results);
  await ShopeeMarktPro.stream(req.query.id,String(req.headers.range||''),res,false);
 }catch(e){if(!res.headersSent)res.status(400).json({error:String(e.message||e).slice(0,230)});}
});
app.post('/api/shopee/optimizer/video/marktpro/select',
 mustLogin,requireWeDropAdmin,express.json({limit:'5kb'}),async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const info=await checkedManualVideoIdentity(req);
  const {results}=await marktProCandidates(req,info);
  const video=marktProCandidateFor(String(req.body?.id||''),results);
  if(video.durationMs && (video.durationMs<10000||video.durationMs>60000))
   throw Error('Este vídeo não atende ao limite de 10 a 60 segundos.');
  const active=await readShopeeExecution(info.shopId,info.itemId,info.modelId);
  if(['running','uncertain'].includes(active?.state))
   throw Error('Conclua a execução em andamento antes de trocar o vídeo.');
  const {response}=await ShopeeMarktPro.inspect(video.id);
  const size=Number(response.headers.get('content-length')||0);
  if(size>MAX_VIDEO_BYTES){await response.body?.cancel?.();throw Error('Vídeo excede o limite de 30 MB.');}
  if(!response.body)throw Error('Fonte do vídeo indisponível.');
  const reader=response.body.getReader(),buffers=[];
  let bytes=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    bytes+=value.byteLength;
    if(bytes>MAX_VIDEO_BYTES)throw Error('Vídeo excede o limite de 30 MB.');
    buffers.push(Buffer.from(value));
   }
  }finally{await reader.cancel().catch(()=>{});}
  const normalized=await normalizeManualVideo(Buffer.concat(buffers,bytes));
  const asset=await importShopeeManualVideo(info.shopId,info.itemId,info.modelId,info.sku,
   normalized.buffer,{mime:'video/mp4',filename:'marktpro-'+video.id+'.mp4'});
  // A escolha de um arquivo novo revoga uma aprovação de vídeo anterior.
  await saveWorkflowReview(info.shopId,info.itemId,info.modelId,info.sku,{stage:'video',reviewed:false});
  res.status(201).json({ok:true,asset,publishedInShopee:false,requiresReview:true,
    message:'Vídeo MarktPro selecionado e salvo para revisão da SKU. Ainda não publicado na Shopee.'});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,260)});}
});

// Cada foto é gerada isoladamente: progresso fica persistido no Supabase.
// Chave OpenAI permanece exclusivamente no backend. Nenhuma publicação automática.
const shopeeImageGenerationLocks=new Set();
app.get('/api/shopee/optimizer/images/generation/status',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth}=await getValidAuth(req);
  const status=await openAiKeyStatus(auth.shopId);
  res.json({ok:true,...imageGenerationStatus(),...status,mode:'manual_approval',marketplaceUpdated:false});
 }catch(e){res.status(503).json({error:'Não foi possível verificar a integração OpenAI. '+String(e.message||e).slice(0,160)});}
});
let openAiLastKeyAttemptAt=0;
app.post('/api/shopee/optimizer/images/generation/connect',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 // Evitar verificações excessivas de credenciais, mesmo com sessão administrativa.
 if(Date.now()-openAiLastKeyAttemptAt<5000)return res.status(429).json({error:'Aguarde cinco segundos antes de tentar novamente.'});
 openAiLastKeyAttemptAt=Date.now();
 try{
  if(typeof req.body?.apiKey!=='string')throw Error('Cole uma chave de API OpenAI válida.');
  const {auth}=await getValidAuth(req);
  const status=await saveOpenAiApiKey(auth.shopId,req.body.apiKey);
  res.json({ok:true,...status,model:imageGenerationStatus().model,
   message:'Chave verificada e protegida. A geração de imagens já pode ser iniciada.'});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,240)});}
});
app.post('/api/shopee/optimizer/images/generation/disconnect',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const status=await deleteOpenAiApiKey(auth.shopId);
  res.json({ok:true,...status,message:status.source==='render'
   ?'Credencial removida do cofre. Existe uma credencial gerenciada pelo Render.'
   :'Credencial removida. A geração por IA está desativada.'});
 }catch(e){res.status(400).json({error:'Falha ao desconectar a integração OpenAI.'});}
});
app.post('/api/shopee/optimizer/images/generate',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 const position=Number(req.body?.slot);
 if(!Number.isInteger(position)||position<1||position>9)
  return res.status(400).json({error:'Selecione uma imagem de 1 a 9.'});
 let lock='';
 try{
  const {itemId,modelId,sku,auth,record}=await checkedWorkflowAudit(req);
  const apiKey=await openAiApiKey(auth.shopId);
  if(!apiKey)throw Error('Conecte a API OpenAI no painel do Gerador de imagens antes de iniciar.');
  lock=[auth.shopId,itemId,modelId,sku].join(':');
  if(shopeeImageGenerationLocks.has(lock))return res.status(409).json({error:'Já existe uma imagem sendo gerada para esta SKU. Aguarde terminar.'});
  shopeeImageGenerationLocks.add(lock);
  const job=await readShopeeExecution(auth.shopId,itemId,modelId);
  if(['running','uncertain'].includes(job?.state))
   throw Error('Aguarde a confirmação da execução em andamento antes de substituir fotografias.');
  const existing=await readPreparedImages(auth.shopId,itemId,modelId,sku);
  if(existing.some(x=>Number(x.slot)===position)&&req.body?.replace!==true)
   return res.status(409).json({error:'A posição já possui imagem. Use Refazer para autorizar a substituição.'});
  const [settings,stored]=await Promise.all([
   optimizerSettings(auth.shopId),getWorkflowReview(auth.shopId,itemId,modelId)
  ]);
  const review=stored?.sku===sku?stored.review_state||{}:{};
  const references=(record.imageUrls||[]).slice(0,2);
  if(!references.length)throw Error('Sem foto original disponível na Shopee para esta SKU. Faça a importação manual.');
  const output=await generateOpenAiImage({
   record,slot:position,referenceUrls:references,apiKey,
   masterPrompt:settings.image_prompt||'',note:review.imageNotes?.[position]||''
  });
  const image=await importPreparedImage({
   shopId:auth.shopId,itemId,modelId,sku,slot:position,file:output.file,mime:output.mime,
   filename:'openai-'+String(position).padStart(2,'0')+'.png'
  });
  await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{stage:'images',reviewed:false});
  return res.status(201).json({ok:true,image,slot:position,model:output.model,
   saved:true,requiresReview:true,marketplaceUpdated:false});
 }catch(e){
  const msg=String(e.message||e).slice(0,360);
  const status=/Conecte a API OpenAI|não configurad/i.test(msg)?503:/HTTP 429/.test(msg)?429:400;
  res.status(status).json({error:msg,marketplaceUpdated:false});
 }finally{if(lock)shopeeImageGenerationLocks.delete(lock);}
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
  // Um arquivo alterado nunca herda aprovação da versão anterior da imagem.
  await saveWorkflowReview(x.shopId,x.itemId,x.modelId,x.sku,{stage:'images',reviewed:false});
  res.status(201).json({ok:true,image,requiresReview:true,marketplaceUpdated:false});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,250)});}
});

app.delete('/api/shopee/optimizer/images/manual',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const x=await checkedManualVideoIdentity(req);
  const position=Number(req.query.slot);
  if(!Number.isInteger(position)||position<1||position>9)
   return res.status(400).json({error:'Posição inválida (1 a 9).'});
  const lock=[x.shopId,x.itemId,x.modelId,x.sku].join(':');
  if(shopeeImageGenerationLocks.has(lock))
   return res.status(409).json({error:'Existe uma geração de imagem em andamento. Aguarde terminar para excluir.'});
  const job=await readShopeeExecution(x.shopId,x.itemId,x.modelId);
  if(['running','uncertain'].includes(job?.state))
   return res.status(409).json({error:'Uma execução está em andamento ou sem confirmação. Não exclua imagens antes de reconciliar.'});
  // Invalidate approval first: never leave a previously approved signature active.
  await saveWorkflowReview(x.shopId,x.itemId,x.modelId,x.sku,{stage:'images',reviewed:false});
  const result=await deletePreparedImage(x.shopId,x.itemId,x.modelId,x.sku,position);
  res.json({ok:true,...result,requiresReview:true});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,260)});}
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

// Cotação por SKU não escreve na Shopee. A publicação foi isolada em
// /optimizer/discounts/preview (read-only) + /execute (autorização explícita),
// com leitura de volta e sem alterar anúncios não selecionados.
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

app.get('/api/shopee/optimizer/pricing/market-status',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth}=await getValidAuth(req);
  res.json({ok:true,shopId:String(auth.shopId),
   provider:'Shopee Affiliate Open API (ofertas)',configured:marketResearchConfigured(),
   requiredVariables:['SHOPEE_AFFILIATE_APP_ID','SHOPEE_AFFILIATE_SECRET'],
   note:marketResearchConfigured()?'Pesquisa disponível. A qualidade depende de ofertas equivalentes retornadas.':
   'Configure as credenciais separadas de afiliado no Render para ativar a pesquisa automática.'});
 }catch(e){res.status(503).json({error:String(e.message||e).slice(0,240)});}
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
// Seleção autenticada por item/modelo/SKU; não deduzir reserva Ads
// de outro produto da mesma loja nem de preferências globais.
app.get('/api/shopee/optimizer/pricing/selection',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const sku=validateSkuLookup(req.query?.sku),itemId=validItemId(req.query?.itemId);
  const modelId=String(req.query?.modelId??'0');
  if(!/^\d{1,18}$/.test(modelId))throw Error('Variação inválida.');
  const {auth}=await getValidAuth(req);
  const matches=await findExactCatalogSku(auth.shopId,sku);
  if(!matches.some(x=>String(x.itemId)===itemId&&String(x.modelId)===modelId))
   return res.status(409).json({error:'Vínculo da SKU alterado. Refaça a busca.'});
  const saved=await savedShopeePricePlan(auth.shopId,itemId,modelId);
  res.json({ok:true,sku,itemId,modelId,
   adsBudgetEnabled:saved?.sku===sku&&saved?.quote?.adsBudgetEnabled===true,
   adsBudgetPct:saved?.sku===sku&&saved?.quote?.adsBudgetEnabled===true
    ?Number(saved.quote.adsBudgetPct||0):0,
   updatedAt:saved?.sku===sku?saved.updated_at:null,
   marketplaceUpdated:false});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,240)});}
});
app.get('/api/shopee/optimizer/pricing/ads-reserved',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth}=await getValidAuth(req);
  const data=await shopeeAdsReservedPricePlans(auth.shopId);
  res.json({ok:true,...data,source:'saved_pricing_plans',marketplaceUpdated:false});
 }catch(e){res.status(503).json({error:String(e.message||e).slice(0,240)});}
});
// Consulta do plano aprovado localmente, sem recalcular nem mudar o percentual Ads
// quando o usuário apenas abre a página de Descontos preparados.
app.get('/api/shopee/optimizer/pricing/saved',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const sku=validateSkuLookup(req.query?.sku),itemId=validItemId(req.query?.itemId);
  const modelId=String(req.query?.modelId??'0');
  if(!/^\d{1,18}$/.test(modelId))throw Error('Variação inválida.');
  const {auth}=await getValidAuth(req);
  const matches=await findExactCatalogSku(auth.shopId,sku);
  if(!matches.some(x=>String(x.itemId)===itemId&&String(x.modelId)===modelId))
   return res.status(409).json({error:'SKU mudou de anúncio. Faça uma nova busca.'});
  const row=await savedShopeePricePlan(auth.shopId,itemId,modelId);
  if(!row||String(row.sku)!==sku||String(row.quote?.sku)!==sku)
   return res.status(404).json({error:'Nenhum plano salvo para esta SKU.'});
  res.json({ok:true,saved:true,quote:row.quote,updatedAt:row.updated_at,marketplaceUpdated:false});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,240)});}
});
app.post('/api/shopee/optimizer/pricing/prepare',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const sku=validateSkuLookup(req.body?.sku);
    const itemId=validItemId(req.body?.itemId);
    const modelId=String(req.body?.modelId??'0');
    if(!/^\d{1,18}$/.test(modelId))throw Error('ID da variação inválido.');
    const {auth,cfg}=await getValidAuth(req);
    // Não aceitar item/variação alterados ou de outro SKU por texto arbitrário.
    const matches=await findExactCatalogSku(auth.shopId,sku);
    if(!matches.some(x=>String(x.itemId)===itemId&&String(x.modelId)===modelId))
      return res.status(409).json({error:'A SKU não corresponde mais a esse Item ID/variação. Localize novamente na Otimização.'});
    const sourceSettings=req.body?.settings===undefined
      ?await shopeePricingPreferences(auth.shopId)
      :normalizeShopeePricingSettings(req.body.settings);
    const cost=await shopeePricingSupplierCost(auth.shopId,{sku,itemId,modelId});
    const previous=await savedShopeePricePlan(auth.shopId,itemId,modelId);
    // O percentual de Ads só entra se o checkbox da SKU estiver marcado;
    // jamais herdar reserva de outro anúncio nem usar o valor global.
    const adsBudgetEnabled=req.body?.adsBudgetEnabled===true;
    const adsBudgetPct=adsBudgetEnabled?Number(req.body?.adsBudgetPct):0;
    if(adsBudgetEnabled&&(!Number.isFinite(adsBudgetPct)||adsBudgetPct<=0||adsBudgetPct>60))
      throw Error('Marque Ads e informe uma reserva entre 0,1% e 60% para esta SKU.');
    const settings={...sourceSettings,adsPct:adsBudgetPct};
    // Referências de concorrentes: consulta automática separada da API de seller.
    // Não herdar um valor manual antigo como se fosse pesquisa verificada.
    const live=await shopeeLiveEditableItem(cfg,auth,itemId);
    const market=await lookupShopeeCompetitors({
      title:live.item_name||'',ownShopId:auth.shopId,ownItemId:itemId
    });
    const rawManual=req.body?.marketAverage;
    const manual=rawManual===null||rawManual===undefined||rawManual===''?null:Number(rawManual);
    if(manual!==null&&(!Number.isFinite(manual)||manual<=0||manual>100000))
      throw Error('Média de mercado manual inválida.');
    const reference=market.verified?market.reference:manual;
    const source=market.verified?'researched_affiliate_offers':
      manual!==null?'manual_unverified':'no_verified_competitors';
    const quote=quoteShopeePrice({
      unitCost:cost.unitCost,settings,marketAverage:reference
    });
    quote.marketResearch={...market,sourceType:source,
      manualMarketReference:manual!==null&&!market.verified?manual:null,
      verified:market.verified===true};
    quote.sku=sku;
    quote.itemId=itemId;
    quote.modelId=modelId;
    quote.supplierSku=cost.supplierSku;
    quote.costUpdatedAt=cost.costUpdatedAt;
    quote.pricingSettings=settings;
    quote.adsBudgetEnabled=adsBudgetEnabled;
    quote.adsBudgetPct=adsBudgetPct;
    quote.adsBudgetSource='reserved_in_saved_price_plan';
    quote.adsActualSpent=false;
    quote.calculatedAt=new Date().toISOString();
    // O desconto base nunca deve receber etiqueta de recomendação de mercado.
    quote.discountRecommendationSource=market.verified?'researched':'base_not_researched';
    // Parâmetros globais de tarifa são salvos sem Ads; Ads é EXCLUSIVO da SKU.
    if(req.body?.settings!==undefined)
      await saveShopeePricingPreferences(auth.shopId,{...sourceSettings,adsPct:0});
    await saveShopeePricePlan(auth.shopId,{itemId,modelId,sku,supplierSku:cost.supplierSku,quote});
    res.json({ok:true,readOnly:true,saved:true,quote});
  }catch(e){
    const message=String(e.message||e).slice(0,300);
    res.status(/não vinculado|não corresponde|não disponível/i.test(message)?409:400).json({error:message});
  }
});

// O ID vem do usuário e é confirmado pela API da loja. A prévia somente lê.
const activeDiscountWrites=new Set();
async function discountExecutionInputs(req,sku,itemId,modelId,discountId){
 const {auth,cfg}=await getValidAuth(req);
 const matches=await findExactCatalogSku(auth.shopId,sku);
 if(!matches.some(x=>String(x.itemId)===String(itemId)&&String(x.modelId)===String(modelId)))
  throw Error('A SKU não corresponde a esse anúncio. Pesquise novamente.');
 if(String(modelId)!=='0')throw Error('A publicação de descontos de SKUs com variações necessita validação de modelos individuais. Não houve alteração.');
 const saved=await savedShopeePricePlan(auth.shopId,itemId,modelId);
 if(!saved||saved.sku!==sku||saved.quote?.sku!==sku||
   String(saved.quote?.itemId)!==String(itemId)||String(saved.quote?.modelId)!==String(modelId))
  throw Error('Plano não encontrado ou pertence a outra SKU. Recalcule em Precificação.');
 const quote=saved.quote;
 // A cotação só é publicável como promoção competitiva se possuir
 // comparação atual de pelo menos três lojas; plano base continua disponível
 // para simulação, mas não pode ser anunciado como pesquisa automática.
 const research=quote.marketResearch;
 if(research?.verified!==true||
    research.source!=='shopee_affiliate_product_offers'||
    !Number.isFinite(Date.parse(research.researchedAt))||
    Date.now()-Date.parse(research.researchedAt)>48*3600000||
    research.count<3||
    quote.discountRecommendationSource!=='researched')
  throw Error('Desconto ainda sem pesquisa de concorrentes validada. Conecte a API de ofertas Shopee e recalcule a SKU em Precificação antes de executar.');
 if(quote.status==='MERCADO_ABAIXO_DO_PISO')
  throw Error('Preços de concorrentes abaixo da margem mínima. Nenhum desconto será aplicado.');
 promotionFromQuote(quote);
 if(!Number.isFinite(Date.parse(quote.calculatedAt))||
    Date.now()-Date.parse(quote.calculatedAt)>7*86400000)
  throw Error('Plano de preço antigo. Recalcule na Precificação antes de executar.');
 const cost=await shopeePricingSupplierCost(auth.shopId,{sku,itemId,modelId});
 if(Math.abs(Number(cost.unitCost)-Number(quote.unitCost))>0.009)
  throw Error('O custo WeDrop foi alterado após o plano. Recalcule na Precificação antes de publicar.');
 const live=await shopeeLiveEditableItem(cfg,auth,itemId);
 if(live.item_sku&&String(live.item_sku)!==sku)
  throw Error('A SKU da Shopee mudou. Publicação cancelada.');
 if(live.item_status&&String(live.item_status)!=='NORMAL')
  throw Error('O anúncio não está em situação NORMAL na Shopee; a promoção não será alterada.');
 if(typeof live.has_model!=='boolean')
  throw Error('Não foi possível confirmar se o anúncio possui variações. Nada foi enviado.');
 const originalPrice=promotionBasePrice(live);
 const {record,pages}=await readDiscountPages(callShopeeShopApi,{cfg,auth,discountId});
 const existing=promotionMember(pages,itemId);
 // has_promotion é genérico: NÃO comprova inscrição em outra Minha Promoção.
 // A inclusão na campanha escolhida depende da verificação do item_list e
 // das regras validadas pela API add_discount_item da própria Shopee.
 const promoMembership=shopDiscountMembershipSignal(live,existing);
 const snapshot={...discountPlanSnapshot({shopId:auth.shopId,sku,itemId,modelId,discountId,
   quote,record,existing,originalPrice}),
   promotionSignal:promoMembership.kind,
   promotionNotice:promoMembership.warning};
 return {auth,cfg,quote,snapshot,originalPrice};
}
app.post('/api/shopee/optimizer/discounts/preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const sku=validateSkuLookup(req.body?.sku),itemId=validItemId(req.body?.itemId);
  const modelId=String(req.body?.modelId??'0');
  const discountId=String(req.body?.discountId||'').trim();
  if(!/^\d{1,18}$/.test(discountId)||!Number.isSafeInteger(Number(discountId))||
     !/^\d{1,18}$/.test(modelId))throw Error('ID de promoção ou variação inválido.');
  const data=await discountExecutionInputs(req,sku,itemId,modelId,discountId);
  const signature=signDiscountPreview(data.snapshot,envText('SESSION_SECRET'));
  res.json({ok:true,readOnly:true,preview:data.snapshot,approvalToken:signature,
   warning:'Nenhum desconto ou preço foi alterado. Execute apenas após verificar os valores.'});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,350)});}
});
app.post('/api/shopee/optimizer/discounts/execute',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 if(req.body?.confirm!==true)return res.status(400).json({error:'É necessária aprovação explícita da prévia.'});
 let lock=null,originalPriceChanged=false,posted=false;
 try{
  const approved=verifyDiscountPreview(req.body?.approvalToken,envText('SESSION_SECRET'),
    (await getValidAuth(req)).auth.shopId);
  lock=[approved.shopId,approved.itemId,approved.discountId].join(':');
  if(activeDiscountWrites.has(lock))throw Error('Esta SKU já está em execução. Aguarde e atualize a promoção.');
  activeDiscountWrites.add(lock);
  // Reconsultar preço, custo, SKU, campanha inteira e estado antes de QUALQUER escrita.
  const data=await discountExecutionInputs(req,approved.sku,approved.itemId,
    approved.modelId,approved.discountId);
  const current=data.snapshot;
  for(const key of ['shopId','sku','itemId','modelId','discountId','gross','promo',
    'buyerAfterCoupon','discountPct','couponPct','originalPrice','action','existingPrice','quoteAt',
    'promotionSignal']){
    if(current[key]!==approved[key])
      throw Error('A prévia ficou desatualizada ('+key+'). Gere outra prévia antes de executar.');
  }
  if(current.action==='already')
   return res.json({ok:true,status:'already_applied',verified:true,
     sku:approved.sku,discountId:approved.discountId,promotionPrice:current.promo,
     message:'A SKU já está nesta promoção com o valor previsto. Nada foi reenviado.'});
  if(current.needsBasePriceUpdate){
   if(req.body?.allowPriceChange!==true)
    throw Error('O preço bruto da Shopee está diferente do plano. Autorize também a atualização do preço bruto ou ajuste-o manualmente.');
   // A alteração do preço original é uma operação à parte, expressamente autorizada.
   await callShopeeShopApi(data.cfg,{path:'/api/v2/product/update_price',method:'POST',
    accessToken:data.auth.accessToken,shopId:data.auth.shopId,
    body:{item_id:Number(approved.itemId),price_list:[{original_price:current.gross}]}});
   originalPriceChanged=true;
   const checked=await shopeeLiveEditableItem(data.cfg,data.auth,approved.itemId);
   if(Math.abs(promotionBasePrice(checked)-current.gross)>0.011)
    return res.status(409).json({ok:false,status:'price_confirmation_pending',
     priceUpdated:true,promotionUpdated:false,
     error:'A Shopee recebeu a atualização do preço bruto, mas a nova leitura ainda não confirmou o valor. Nenhum desconto foi enviado. Consulte o anúncio antes de tentar novamente.'});
  }
  const payload={discount_id:Number(approved.discountId),item_list:[{
    item_id:Number(approved.itemId),item_promotion_price:current.promo,
    ...(current.action==='add'?{purchase_limit:0}:{})
  }]};
  const result=await callShopeeShopApi(data.cfg,{
   path:current.action==='add'?'/api/v2/discount/add_discount_item':'/api/v2/discount/update_discount_item',
   method:'POST',accessToken:data.auth.accessToken,shopId:data.auth.shopId,body:payload});
  const errors=result.response?.error_list||[];
  if(Array.isArray(errors)&&errors.length)
    throw Error('A Shopee recusou a SKU na promoção: '+String(errors[0].fail_message||errors[0].fail_error||'erro de validação').slice(0,250));
  if(current.action==='add'&&Number(result.response?.count)!==1)
    throw Error('A API não confirmou a inclusão da SKU. Confira a campanha antes de tentar novamente.');
  posted=true;
  const check=await readDiscountPages(callShopeeShopApi,{cfg:data.cfg,auth:data.auth,discountId:approved.discountId});
  const entry=promotionMember(check.pages,approved.itemId);
  const verified=Boolean(entry&&Math.abs(Number(entry.item_promotion_price)-current.promo)<0.011);
  res.json({ok:true,status:verified?'confirmed':'awaiting_verification',
   verified,sku:approved.sku,discountId:approved.discountId,
   promotionPrice:current.promo,basePriceUpdated:originalPriceChanged,
   message:verified?'Shopee confirmou a SKU e seu preço promocional na campanha.'
    :'Shopee recebeu a operação, mas a leitura ainda não confirmou o desconto. Confira na Central do Vendedor e não reenvie automaticamente.'});
 }catch(e){
  res.status(409).json({error:String(e.message||e).slice(0,400),
   status:originalPriceChanged?'partial_price_changed':posted?'awaiting_verification':'not_applied',
   basePriceUpdated:originalPriceChanged,discountConfirmed:false});
 }finally{if(lock)activeDiscountWrites.delete(lock);}
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
            query:{order_sn_list:batch.join(','),response_optional_fields:'item_list,total_amount'}
          });
          if(Array.isArray(detailed.response?.order_list))
            detailOrders.push(...detailed.response.order_list);
        }
      }catch(error){
        detailWarning='Datas indisponíveis na consulta de detalhes: '+String(error.message||error).slice(0,250);
      }
    }
    const compact=mergeShopeeOrderSummaries(orderList,detailOrders);
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
  const range=financeRange({days:30},to);
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
    orders,ads,coverage:{note:'Somente pedidos COMPLETED criados na janela de 30 dias; enviados sem repasse confirmado permanecem pendentes; limite '+MAX_FINANCE_ORDERS+' pedidos. Repasse nao equivale ao saldo sacavel.'},
    diagnostics:{ordersExamined:orders.length,complete:financial.complete===true,
      permissionWarning:Boolean(financial.paymentAccessWarning),truncated:Boolean(financial.skippedCompleted)}};
});

// Relatório privado Shopee Ads de anúncios de produtos, consultado por mês.
installAdsFinanceBridge(app,async month=>{
 const {auth,cfg}=await getValidAuth();
 const [report,account]=await Promise.all([
  buildAdsFinanceSnapshot(month,dates=>loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,dates)),
  readShopeeAdsAccount(cfg,auth,callShopeeShopApi)
 ]);
 return {...report,account};
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
      end:String(req.query.end_date||''),
      allowDateFallback:true
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

