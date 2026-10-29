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
import {loadShopeeAdsOverview,brazilAdsToday} from './adsReport.js';
import {adsSevenDayWindows,buildAdsMonitor} from './shopeeAdsInsights.js';
import {loadShopeeFinance,MAX_FINANCE_ORDERS} from './shopeeFinance.js';
import {installFinanceBridge,installWalletBridge,installAdsFinanceBridge} from './financeBridge.js';
import {buildAdsFinanceSnapshot} from './financeAdsBridge.js';
import {readShopeeAdsAccount} from './shopeeAdsAccount.js';
import {checkGmsEligibility,prepareGmsDraft} from './shopeeAdsGmsIntegration.js';
import {rankAdsCandidates} from './shopeeAdsSeo.js';
import {manualAdsPreview,manualAdsPayload,manualAdsToken,decodeManualAdsToken,verifyManualAdsCandidate} from './shopeeAdsManualCreate.js';
import {individualRoasPreview,individualRoasPayload,individualRoasToken,decodeIndividualRoasToken,validateIndividualRoasDraft} from './shopeeAdsIndividualRoas.js';
import {liveAdsCampaign,buildAdsPreview,signAdsApproval,verifyAdsApproval,adsEditRequest} from './shopeeAdsActions.js';
import {readShopeeWallet} from './shopeeWallet.js';
import {financeAdsDates,matchFinanceAds} from './financeAdsSweep.js';
import {financeRange} from './shopeeFinance.js';
import {fetchCatalogPage,fetchCatalogPrices,normalizeShopeeModels,validItemId} from './catalog.js';
import {suggestFiscalMeasureUnit} from './shopeeFiscalMeasure.js';
import {getShopeeNewListingsSummary,clearShopeeNewListingsCache} from './shopeeNewListings.js';
import {storeCatalogItems,storeCatalogModels,readCatalogCache,catalogStoreReady,findExactCatalogSku,findCatalogSkuIgnoringCase} from './catalogStore.js';
import {previewWeDropCsv,prepareWeDropImport,MAX_CSV_CHARS} from './wedropCsv.js';
import {convertWeDropExcelBase64} from './wedropExcel.js';
import {saveWeDropCosts,getWeDropCoverage,compareIncomingCosts,pendingWeDropModels,upsertWeDropSkuLink} from './wedropCosts.js';
import {saveWeDropProducts,readWeDropProduct} from './wedropCosts.js';
import {kitCatalog,suggestKits,suggestKitsForIdea,rankKitIdeaProducts,assessKitBuyerFit,composeKit,kitCreative,kitPrompts,kitPlusResearchBrief,kitPlusContentPrompt,kitContentBrief,categoryMatches,modifyKitSkus,clearKitCatalogCache,kitSku} from './shopeeKitBuilder.js';
import {saveKitStockImport,clearKitStockCache,parseWeDropAvailabilityCsv,readKitStockSnapshot} from './shopeeKitAvailability.js';
import {saveKitDraft,saveKitDraftLogistics,listKitDrafts,loadKitDraft,deleteKitDraft,recordKitOptimization} from './shopeeKitDraftStore.js';
import {validateKitOptimizationTarget,kitOptimizationLinkIsCurrent,linkedKitPricingCost} from './shopeeKitOptimization.js';
import {recoverKitDraftForEditing,matchesStoredKitPhotos,validateStoredKitDraft} from './shopeeKitDraftRecovery.js';
import {kitUploadPhoto,kitPublicationReadiness,kitPublicationPreview,kitPublishApproved,checkKitPublication,kitVideoPrepare,kitVideoAdvance,kitVideoStatus,kitVideoDiscard} from './shopeeKitPublicationService.js';
import {previewKitDiscount,executeKitDiscount} from './shopeeKitDiscountService.js';
import {discoverKitDiscountCampaigns} from './shopeeKitDiscountDiscovery.js';
import {supplierWorkflowFacts,wedropCestForSku} from './shopeeSupplierFacts.js';
import {supplierAttributeSuggestions} from './shopeeSupplierEvidenceFacts.js';
import {narrativeTechnicalSuggestions,mergeNarrativeTechnicalFacts,technicalOptionSearchTerms} from './shopeeTechnicalNarrative.js';
import {readShopeeSourceEvidence,saveShopeeSourceText,importShopeeEvidenceImage,removeShopeeEvidenceImage,downloadShopeeEvidenceImages} from './shopeeSourceEvidence.js';
import {extractSupplierScreenshotText,mergeExtractedPrints,withoutExtractedPrints} from './shopeeEvidenceVision.js';
import {fiscalMatrixSource,technicalMatrixSource,assertShopeeSupplierBrand,isShopeeCestConfirmed,REDE_ACHADOS_MARKET_RULES} from './shopeeMatrixRules.js';
import {readWeDropSyncState,getStoredWeDropCostCount} from './wedropCosts.js';
import {getSkuReview,searchSupplierSku,confirmSkuLink,undoSkuLink} from './wedropSkuReview.js';
import {auditShopeeItem,validateSkuLookup} from './productOptimizer.js';
import {buildStages,safeTitle,validateReview} from './shopeeOptimizationWorkflow.js';
import {composeShopeeDescription,isCommercialDescription,isGenericShopeeDescription} from './shopeeDescriptionComposer.js';
import {getWorkflowReview,saveWorkflowReview,mergeWorkflowTechnicalAutofill} from './shopeeOptimizationWorkflowStore.js';
import {compileShopeeExecutionPlan,confirmShopeeExecution,
  assertLiveShopeeUnchanged,verifyShopeeExecution,verifyShopeeFiscalExecution,normalizeShopeeExecutionStage,
  shopeeExecutionUnconfirmedFields,assessShopeeStableCommercialRecovery,
  approvedShopeeReadbackConvergence} from './shopeeExecutionPlan.js';
import {readShopeeExecution,saveShopeePreparedExecution,
  claimShopeePreparedExecution,finishShopeeExecution,pendingShopeeExecutions,leaseShopeeExecution,
  checkpointShopeeExecution,reconcileShopeeJob} from './shopeeExecutionStore.js';
import {advanceShopeeExecution,approvedShopeeModels,reconcileShopeeModelExecution,
 nextShopeePhaseAfterReadback} from './shopeeExecutionWorker.js';
import {shopeeExecutionProgress,withExecutionEvent} from './shopeeExecutionProgress.js';
import {recyclableShopeeMedia,archiveShopeeMedia} from './shopeeExecutionMediaReuse.js';
import {normalizedShopeeFiscalBatchSkus,checkedShopeeFiscalBatchEntries} from './shopeeExecutionBatch.js';
import {fiscalPreviewDisposition} from './shopeeFiscalReadiness.js';
import {detectShopeeExecutionIssue,needsCestRevalidation} from './shopeeExecutionIssues.js';
import {createShopeeMediaApi} from './shopeeMediaApi.js';
import {normalizeManualVideo} from './shopeeVideoValidation.js';
import * as ShopeeMarktPro from './shopeeMarktPro.js';
import {readPreparedImages,importPreparedImage,deletePreparedImage,reorderPreparedImage,downloadPreparedImage,imagesSignature,MAX_IMAGE_BYTES,rememberPublishedImages} from './shopeePreparedImages.js';
import {generateOpenAiImage,imageGenerationStatus} from './shopeeOpenAiImages.js';
import {generateKitImage,reference as kitReferencePhoto} from './shopeeKitImages.js';
import {validateVariationName,variationImagePrompt,saveVariationImage,variationImagePreview,variationImageBytes,validateVariationDetails,reviewedVariationEvidence,variationSupplierIdentity,buildVariationPayload} from './shopeeVariationMedia.js';
import {openAiKeyStatus,openAiApiKey,saveOpenAiApiKey,deleteOpenAiApiKey} from './shopeeOpenAiCredentials.js';
import {compileAttributes,compileTax,attributeAuditForChanges,selectValidTechnicalChanges,sameData,fieldsVerified} from './shopeeStructuredFields.js';
import {scopeTechnicalReviewChanges} from './shopeeTechnicalReviewScope.js';
import {applySellerDeclarations} from './shopeeTechnicalSellerEvidence.js';
import {inspectAnatelCompliance} from './shopeeAnatel.js';
import {assertSearchableAttribute,searchAttributeRequest,readSearchedAttributeOptions,hydrateSearchOptions} from './shopeeCategorySearch.js';
import {MAX_VIDEO_BYTES,getShopeeManualVideo,importShopeeManualVideo,
 signedShopeeManualVideoPreview,manualVideoPublicInfo,downloadShopeeManualVideo,rememberPublishedVideo} from './shopeeManualVideo.js';
import {findLiveShopeeSku} from './shopeeSkuFinder.js';
import {optimizerSettings,saveOptimizerSettings} from './optimizerStore.js';
import {quoteShopeePrice,normalizeShopeePricingSettings} from './shopeePricing.js';
import {lookupShopeeCompetitors,marketResearchConfigured} from './shopeeMarketResearch.js';
import {promotionFromQuote,promotionBasePrice,promotionMember,shopDiscountMembershipSignal,discountPlanSnapshot,signDiscountPreview,verifyDiscountPreview,readDiscountPages} from './shopeeDiscountPublish.js';
import {auditCatalogDiscounts} from './shopeeCatalogDiscountAudit.js';
import {discountPreviewStatus} from './shopeeDiscountDeferred.js';
import {marketFloorDiscountEligibility} from './shopeeMarketFloorApproval.js';
import {verifyShopeeListingStatus} from './shopeeListingStatus.js';
import {scanLiveNormalSku,catalogCandidatesIfNoActive} from './shopeeSkuActiveResolver.js';
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
  'inicio','produtos','kits','otimizacao','precificacao','descontos','informacoes-fiscais','pedidos','envios','ads','wedrop','financeiro','configuracoes'
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

// Kits Inteligentes WeDrop: catálogo e rascunhos não fazem operações na Shopee.
// A publicação nativa é isolada em rotas próprias de prévia + aprovação explícita.
// Disponibilidade explícita do fornecedor: somente importação de CSV WeDrop
// com SKU e coluna Disponibilidade. Não aceita declaração de estoque da Shopee.
app.post('/api/shopee/kits/availability/import',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  if(typeof req.body?.csv!=='string'||req.body.csv.length>4_000_000)
   throw Error('Envie um arquivo CSV de até 4 MB com SKU e Disponibilidade.');
  const {auth}=await getValidAuth(req);
  const imported=await saveKitStockImport(auth.shopId,req.body.csv);
  res.json({ok:true,...imported,marketplaceUpdated:false});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,520)});}
});
app.get('/api/shopee/kits/catalog',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth}=await getValidAuth(req);
  const data=await kitCatalog(auth.shopId,{
   category:String(req.query.category||'Todos').slice(0,90),
   search:String(req.query.search||'').slice(0,100),
   limit:80
  });
  res.json({ok:true,...data});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,300)});}
});
app.post('/api/shopee/kits/idea-search',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const idea=String(req.body?.idea||'').trim();
  if(idea.length<3||idea.length>160)throw Error('Escreva uma ideia entre 3 e 160 caracteres.');
  const data=await suggestKitsForIdea(auth.shopId,{
   idea,size:Number(req.body?.size||2),marginPct:Number(req.body?.marginPct??10),
   packing:Number(req.body?.packing||0),shipping:Number(req.body?.shipping||0)
  });
  res.json({ok:true,...data,readOnly:true,requiresReview:true,marketplaceUpdated:false});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,350)});}
});
app.post('/api/shopee/kits/suggest',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const data=await suggestKits(auth.shopId,{
   category:String(req.body.category||'Brinquedos').slice(0,90),
   size:Number(req.body.size||2),marginPct:Number(req.body.marginPct??15),
   packing:Number(req.body.packing||0),shipping:Number(req.body.shipping||0),
   ai:false
  });
  res.json({ok:true,...data});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,300)});}
});
app.post('/api/shopee/kits/modify',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const requested=modifyKitSkus(req.body?.skus,{
   mode:req.body?.mode,sku:req.body?.sku,replaceSku:req.body?.replaceSku
  });
  const kit=await composeKit(auth.shopId,requested,{
   marginPct:Number(req.body?.marginPct??15),
   packing:Number(req.body?.packing||0),shipping:Number(req.body?.shipping||0)
  });
  const fit=assessKitBuyerFit(kit.components);
  kit.buyerFitScore=fit.ok?fit.score:0;
  kit.reviewRequired=fit.reviewRequired===true||!fit.ok;
  kit.reviewNotes=kit.reviewRequired?(fit.reviewNotes||['Complementaridade comercial a revisar: '+fit.reason]):[];
  kit.businessReason=fit.ok?fit.reason:'REVISAR COMPOSIÇÃO: '+fit.reason;
  if(kit.reviewRequired)kit.warning+=' Atenção: '+kit.reviewNotes.join('; ')+'.';
  const creative=await kitCreative(auth.shopId,kit,{ai:false});
  res.json({ok:true,kit,creative,requiresReview:true,marketplaceUpdated:false,
   shopeePublished:false,compositionChanged:true});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,360)});}
});
app.post('/api/shopee/kits/prepare',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const kit=await composeKit(auth.shopId,req.body?.skus,{
   marginPct:Number(req.body.marginPct??15),
   packing:Number(req.body.packing||0),shipping:Number(req.body.shipping||0)
  });
  const creative=await kitCreative(auth.shopId,kit,{ai:false});
  res.json({ok:true,kit,creative,readOnly:true,requiresReview:true});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,300)});}
});
app.get('/api/shopee/kits/drafts',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{const {auth}=await getValidAuth(req);res.json({ok:true,drafts:await listKitDrafts(auth.shopId)});}
 catch(error){res.status(400).json({error:String(error.message||error).slice(0,260)});}
});
app.post('/api/shopee/kits/drafts/save',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  // A edição textual de um kit JÁ salvo pode continuar quando a atualização de
  // estoque vence. Nunca aceitar custos/preços do cliente nem alterar composição.
  const settings={
   marginPct:Number(req.body?.marginPct??15),packing:Number(req.body?.packing||0),
   shipping:Number(req.body?.shipping||0)
  };
  const stock=await readKitStockSnapshot(auth.shopId);
  let kit,stockRevalidationRequired=false;
  if(stock.ready){
   kit=await composeKit(auth.shopId,req.body?.skus,settings);
  }else{
   const requested=Array.isArray(req.body?.skus)?req.body.skus.map(String):[];
   const stored=await loadKitDraft(auth.shopId,String(req.body?.kitSku||''));
   if(!stored||requested.length!==stored.skus.length||
      requested.some((sku,i)=>sku!==String(stored.skus[i])))
    throw Error('Estoque vencido: apenas a edição textual de um kit já salvo está disponível. Atualize a WeDrop para criar ou trocar SKUs.');
   kit=validateStoredKitDraft(stored);
   if(settings.marginPct!==Number(kit.quote.targetMarginPct??15)||
      settings.packing!==Number(kit.packing||0)||
      settings.shipping!==Number(kit.shipping||0))
    throw Error('Para mudar margem, frete ou custos, atualize primeiro o catálogo e a disponibilidade WeDrop.');
   stockRevalidationRequired=true;
  }
  const creative={title:req.body.title,description:req.body.description,
   seoTitles:req.body.seoTitles,manualFacts:req.body.manualFacts,
   source:'rascunho revisado'};
  const saved=await saveKitDraft(auth.shopId,{kit,creative,logistics:req.body?.logistics});
  res.json({ok:true,...saved,shopeePublished:false,stockRevalidationRequired,
   refreshedCosts:!stockRevalidationRequired});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,260)});}
});
app.post('/api/shopee/kits/drafts/logistics',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const result=await saveKitDraftLogistics(auth.shopId,
   String(req.body?.kitSku||''),req.body?.logistics);
  res.json({ok:true,...result,shopeePublished:false});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,400)});}
});
app.post('/api/shopee/kits/drafts/delete',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const outcome=await deleteKitDraft(auth.shopId,req.body?.kitSku);
  if(!outcome.deleted)return res.status(404).json({error:'Rascunho não encontrado nesta loja.'});
  res.json({ok:true,...outcome});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,260)});}
});
app.post('/api/shopee/kits/drafts/load',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const stored=await loadKitDraft(auth.shopId,req.body?.kitSku);
  if(!stored)return res.status(404).json({error:'Rascunho não encontrado nesta loja.'});
  // Recuperar sempre o rascunho salvo, mesmo se o estoque expirou após 24 h.
  // A publicação continua exigindo uma recomposição atualizada no serviço.
  const review=await recoverKitDraftForEditing(stored,{
   shopId:auth.shopId,readStock:readKitStockSnapshot,compose:composeKit
  });
  res.json({ok:true,kit:review.kit,logistics:stored.logistics||null,creative:{...stored.creative,
   prompts:kitPrompts(review.kit,{manualFacts:stored.creative?.manualFacts||{}})},
   publication:stored.publication||{status:'local_draft',itemId:null},optimization:stored.optimization||null,
   savedAt:stored.updatedAt,refreshedCosts:review.refreshedCosts,
   stockRevalidationRequired:review.stockRevalidationRequired,
   stockReason:review.stockReason,requiresReview:true});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,260)});}
});
// Modo ChatGPT Plus: nenhuma rota de kits pode consumir tokens/imagens
// cobrados pela API. A seleção e a importação são ações explícitas.
// Kit Formal nativo da Shopee. Os cinco passos são distintos:
// resolver SKUs -> subir mídia -> prévia assinada -> aprovação -> verificar
// a publicação. NUNCA aplicar promoções dentro de add_kit_item.
// Vídeo opcional do Kit Formal: primeiro importar à mídia; depois associar ao
// add_kit_item na prévia assinada. NUNCA publicar no momento de importar.
app.post('/api/shopee/kits/video/prepare',mustLogin,requireWeDropAdmin,
 express.raw({type:'application/octet-stream',limit:'31mb'}),async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const kitSku=String(req.get('x-kit-sku')||'');
  const filename=decodeURIComponent(String(req.get('x-video-filename')||'video.mp4'));
  const result=await kitVideoPrepare({auth,kitSku,buffer:req.body,filename});
  res.json({ok:true,...result,kitPublished:false});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,460)});}
});
app.post('/api/shopee/kits/video/advance',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  res.json({ok:true,...await kitVideoAdvance({cfg,auth,kitSku:String(req.body?.kitSku||'')}),kitPublished:false});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,460)});}
});
app.post('/api/shopee/kits/video/status',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  res.json({ok:true,...kitVideoStatus(auth.shopId,String(req.body?.kitSku||''))});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,400)});}
});
app.post('/api/shopee/kits/video/discard',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  res.json({ok:true,...kitVideoDiscard(auth.shopId,String(req.body?.kitSku||'')),kitPublished:false});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,400)});}
});
app.post('/api/shopee/kits/publish/readiness',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const kitSku=String(req.body?.kitSku||'');
  const {linked,blockers,options,uploadedImageIds}=await kitPublicationReadiness({cfg,auth,kitSku});
  res.json({ok:true,kitSku,linked,blockers,channels:options.channels,
   limits:options.limits,uploadedImageIds,
   note:'Somente prévia. A criação real exige outra aprovação explícita.'});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,460)});}
});
app.post('/api/shopee/kits/publish/media',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const uploaded=await kitUploadPhoto({auth,cfg,
   kitSku:String(req.body?.kitSku||''),slot:Number(req.body?.slot),
   base64:req.body?.imageBase64,mime:req.body?.mime});
  res.json({ok:true,...uploaded,kitPublished:false});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,460)});}
});
app.post('/api/shopee/kits/publish/preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const preview=await kitPublicationPreview({cfg,auth,
   kitSku:String(req.body?.kitSku||''),input:req.body?.fields||{},secret:stateSecret()});
  res.json({ok:true,...preview,marketplaceUpdated:false});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,460)});}
});
app.post('/api/shopee/kits/publish/execute',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 if(req.body?.confirm!==true)
  return res.status(400).json({error:'Aprovação explícita de publicação não recebida.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const output=await kitPublishApproved({cfg,auth,
   kitSku:String(req.body?.kitSku||''),input:req.body?.fields||{},
   token:req.body?.token,secret:stateSecret()});
  res.json({ok:true,...output,requiresDiscountApproval:true});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,550)});}
});
app.post('/api/shopee/kits/publish/status',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  res.json({ok:true,...await checkKitPublication({cfg,auth,
   kitSku:String(req.body?.kitSku||'')})});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,400)});}
});
// Localiza Item ID da SKU principal e campanhas Minha Promoção da mesma loja.
 // Nenhuma chamada de escrita; nunca iguala Item ID ao discount_id.
 app.get('/api/shopee/kits/discount/candidates',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   const code=String(req.query?.kitSku||'').trim();
   const mainSku=validateSkuLookup(req.query?.mainSku);
   const {auth,cfg}=await getValidAuth(req);
   const saved=await loadKitDraft(auth.shopId,code);
   if(!saved?.kit||!Array.isArray(saved.skus)||!saved.skus.includes(mainSku))
    throw Error('O SKU Principal não pertence ao kit salvo. Escolha uma SKU real do kit.');
   const linked=saved.optimization;
   if(linked&&!kitOptimizationLinkIsCurrent(saved,linked))
    throw Error('O vínculo do anúncio do kit mudou. Reabra e prepare a otimização.');
   const kitItemId=linked?.itemId||saved.publication?.itemId||null;
   const live=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,mainSku,{fastOnly:true});
   const primaryCandidates=(live.matches||[]).filter(x=>
    String(x.sku||'')===mainSku&&
    ['NORMAL','UNLIST'].includes(String(x.status||'').toUpperCase())&&
    /^[1-9]\d{0,17}$/.test(String(x.itemId||'')));
   const primaryItemIds=[...new Set(primaryCandidates.map(x=>String(x.itemId)))];
   const scan=await discoverKitDiscountCampaigns({cfg,auth,call:callShopeeShopApi,
    readPages:readDiscountPages,kitItemId,primaryItemIds});
   res.json({ok:true,kitSku:code,mainSku,kitItemId:kitItemId?String(kitItemId):null,
    primaryItems:primaryCandidates.map(x=>({sku:mainSku,itemId:String(x.itemId),
      modelId:String(x.modelId??'0'),status:String(x.status)})).slice(0,10),
    primaryLookupComplete:primaryCandidates.length>0,
    primaryLookupWarnings:(live.warnings||[]).slice(0,2),
    ...scan});
  }catch(e){res.status(409).json({ok:false,error:String(e.message||e).slice(0,360),
   marketplaceUpdated:false});}
 });
 // A promoção é SEMPRE uma segunda operação, após Shopee confirmar NORMAL.
// Reutiliza Minha Promoção e a mesma política de pesquisa e finais 0/9.
app.post('/api/shopee/kits/discount/preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const code=String(req.body?.kitSku||'');
  const preview=await previewKitDiscount({cfg,auth,kitSku:code,
   discountId:String(req.body?.discountId||''),secret:stateSecret()});
  // Check 08: prévia preparada, NÃO promoção publicada. Salvar somente
  // sob a SKU principal e o Item ID/modelo previamente vinculados ao kit.
  const saved=await loadKitDraft(auth.shopId,code);
  const link=saved?.optimization;
  let reviewSaved=false;
  if(link&&link.sku===link.mainSku&&kitOptimizationLinkIsCurrent(saved,link)&&
    String(link.itemId)===String(preview.itemId)&&
    String(link.modelId||'0')===String(preview.modelId||'0')){
   await saveWorkflowReview(auth.shopId,link.itemId,link.modelId,link.sku,{
    kitDiscountPreview:{kitSku:code,itemId:String(link.itemId),
      modelId:String(link.modelId||'0'),discountId:String(preview.discountId),
      gross:preview.gross,promo:preview.promo,afterCoupon:preview.afterCoupon,
      preparedAt:new Date().toISOString(),status:'prepared'}
   });
   reviewSaved=true;
  }
  res.json({ok:true,...preview,reviewSaved,marketplaceUpdated:false});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,500)});}
});
app.post('/api/shopee/kits/discount/execute',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 if(req.body?.confirm!==true)return res.status(400).json({error:'Aprovação do desconto ausente.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const code=String(req.body?.kitSku||'');
  const out=await executeKitDiscount({cfg,auth,kitSku:code,
   discountId:String(req.body?.discountId||''),
   token:String(req.body?.token||''),secret:stateSecret()});
  // Só a confirmação read-back da Shopee marca como APLICADO.
  if(out?.status==='discount_confirmed'){
   const saved=await loadKitDraft(auth.shopId,code),link=saved?.optimization;
   if(link&&link.sku===link.mainSku&&kitOptimizationLinkIsCurrent(saved,link)&&
     String(link.itemId)===String(out.itemId)){
    await saveWorkflowReview(auth.shopId,link.itemId,link.modelId,link.sku,{
     kitDiscountPublication:{kitSku:code,itemId:String(out.itemId),
      modelId:String(link.modelId||'0'),discountId:String(out.discountId),
      promo:out.promo,confirmedAt:new Date().toISOString(),status:'confirmed'}
    });
   }
  }
  res.json(out);
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,500)});}
});
app.post('/api/shopee/kits/plus-brief',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  res.json({ok:true,...await kitPlusResearchBrief(auth.shopId,{
   category:String(req.body?.category||'Brinquedos').slice(0,90),
   size:Number(req.body?.size||2),idea:String(req.body?.idea||'').slice(0,160),
   desiredKits:Number(req.body?.desiredKits||10)
  })});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,300)});}
});
app.post('/api/shopee/kits/plus-import',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const category=String(req.body?.category||'Brinquedos').slice(0,90);
  const idea=String(req.body?.idea||'').trim().slice(0,160);
  const size=Number(req.body?.size||2),raw=req.body?.kits;
  const desiredKits=Number(req.body?.desiredKits||10);
  if(![2,3].includes(size)||!Number.isInteger(desiredKits)||desiredKits<5||desiredKits>10||
      !Array.isArray(raw)||raw.length<1||raw.length>10)
   throw Error('Informe até dez kits de dois ou três SKUs, com meta entre 5 e 10.');
  const seen=new Set(),kits=[],rejected=[];
  for(const [index,input] of raw.slice(0,desiredKits).entries()){
   try{
    if(!Array.isArray(input)||input.length<2||input.length>3||
       input.some(x=>typeof x!=='string'||x.length>120)||new Set(input).size!==input.length)
     throw Error('Cada kit precisa de 2 ou 3 SKUs diferentes e válidas.');
    const key=input.slice().sort().join('|');
    if(seen.has(key))continue;
    seen.add(key);
    // Não confiar em códigos gerados por IA: só componentes reais, com
    // custo e estoque disponíveis no fornecedor, podem entrar no kit.
    const kit=await composeKit(auth.shopId,input,{
     marginPct:Number(req.body?.marginPct??15),
     packing:Number(req.body?.packing||0),
     shipping:Number(req.body?.shipping||0)
    });
    if(!kit.components.every(p=>categoryMatches(p.category,category))){
     // A pesquisa de brinquedos também inclui acessórios úteis à rotina do bebê.
     const hasToy=kit.components.some(p=>categoryMatches(p.category,category));
     const complementary=assessKitBuyerFit(kit.components);
     if(!hasToy||!complementary.ok||!complementary.reason.includes('cuidados de higiene'))
      throw Error('Uma ou mais SKUs estão fora da categoria e não complementam o kit.');
    }
    // A ideia direciona a pesquisa, mas não autoriza resultados irrelevantes.
    if(idea&&!rankKitIdeaProducts(idea,kit.components).products.length)
     throw Error('Produtos sem correspondência com a ideia informada.');
    const fit=assessKitBuyerFit(kit.components);
    // Rejeitar erros objetivos; compatibilidade comercial incerta NÃO apaga
    // um kit infantil cuja composição, custo e estoque foram verificados.
    const allToys=kit.components.every(p=>/brinqued|boneca|casinha|carrinho|pista|jogos|educativ|bebe|passeio/.test(
     String(p.category||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
    if(!fit.ok&&!allToys)throw Error('Falta coerência de uso: '+fit.reason);
    const reviewRequired=fit.reviewRequired===true||!fit.ok;
    kit.reviewRequired=reviewRequired;
    kit.reviewNotes=reviewRequired?(fit.reviewNotes||[
     'Coerência comercial ainda não comprovada: '+fit.reason,
     'Compatibilidade física não confirmada; verificar antes de publicar'
    ]):[];
    if(reviewRequired)kit.warning+=' Kit temático em revisão: '+kit.reviewNotes.join('; ')+'.';
    const previous=await loadKitDraft(auth.shopId,kit.kitSku);
    const creative=previous?.creative?.title&&previous?.creative?.description?
     previous.creative:await kitCreative(auth.shopId,kit,{ai:false});
    const created=await saveKitDraft(auth.shopId,{kit,creative});
    kits.push({...kit,buyerFitScore:fit.ok?fit.score:0,
     matchSignals:fit.signals||[],reviewRequired,reviewNotes:kit.reviewNotes,
     importIndex:index+1,status:reviewRequired?'pending_review':'draft',
     businessReason:(fit.ok?fit.reason:'Coerência a revisar: '+fit.reason)+
      '. Sugestão ChatGPT Plus conferida no catálogo WeDrop. Vendas não comprovadas.',
     demandEvidence:'não verificada',draftSaved:created.saved===true});
   }catch(error){
    rejected.push({index:index+1,skus:Array.isArray(input)?input.map(x=>String(x).slice(0,40)):[],
     reason:String(error.message||error).slice(0,180)});
   }
  }
  kits.sort((a,b)=>b.buyerFitScore-a.buyerFitScore||b.quote.netProfit-a.quote.netProfit);
  res.json({ok:true,source:'ChatGPT Plus + catálogo completo WeDrop verificado',
   disclaimer:'Kits salvos como rascunhos para revisão, sem publicação. Potencial comercial estimado, sem vendas comprovadas.',
   results:kits,accepted:kits.length,rejected,
   received:raw.slice(0,desiredKits).length,
   saved:kits.filter(x=>x.draftSaved).length,
   pendingReview:kits.filter(x=>x.reviewRequired).length,
   targetCount:desiredKits,marketplaceUpdated:false,shopeePublished:false});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,300)});}
});
app.post('/api/shopee/kits/plus-content',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const kit=await composeKit(auth.shopId,req.body?.skus,{
   marginPct:Number(req.body?.marginPct??15),
   packing:Number(req.body?.packing||0),
   shipping:Number(req.body?.shipping||0)
  });
  res.json({ok:true,kitSku:kit.kitSku,...kitContentBrief(kit,{manualFacts:req.body?.manualFacts||{}}),requiresReview:true,marketplaceUpdated:false});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,300)});}
});
// Foto real de referência da WeDrop para cada SKU confirmada do kit.
 // Proxy de imagens restrito ao domínio oficial do fornecedor: não usa API paga.
app.get('/api/shopee/kits/reference-photo',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth}=await getValidAuth(req);
  const skus=String(req.query?.skus||'').split(',').map(x=>x.trim());
  const index=Number(req.query?.index);
  if(skus.length<2||skus.length>3||skus.some(x=>!x||x.length>90)||
    !Number.isInteger(index)||index<0||index>=skus.length)
   return res.status(400).json({error:'Selecione 2 ou 3 SKUs e a fotografia correspondente.'});
  // Fotos de um kit já salvo continuam acessíveis mesmo com estoque vencido.
  // Referências fora do kit persistido precisam da composição WeDrop atual.
  const saved=await loadKitDraft(auth.shopId,kitSku(skus));
  const kit=saved&&matchesStoredKitPhotos(saved,skus)?saved.kit:
   await composeKit(auth.shopId,skus,{marginPct:15,packing:0,shipping:0});
  if(kit.components[index]?.sku!==skus[index])throw Error('O kit foi alterado. Reabra-o.');
  if(!kit.components[index]?.imageUrl)return res.status(409).json({error:'SKU sem foto WeDrop.'});
  const photo=await kitReferencePhoto(kit.components[index].imageUrl);
  res.setHeader('Content-Type',photo.mime);
  res.setHeader('Content-Length',String(photo.data.length));
  res.send(photo.data);
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,200)});}
});
const kitImageOperations=new Set();
app.get('/api/shopee/kits/image/status',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth}=await getValidAuth(req);
  const key=await openAiKeyStatus(auth.shopId);
  res.json({ok:true,automaticAvailable:key.configured===true,
   mode:'opt_in_paid_api',requiresExplicitConsent:true,oneImagePerRequest:true,
   chatGptPlusMode:'manual',marketplaceUpdated:false,source:key.source,
   message:key.configured?'API de imagem disponível apenas mediante confirmação do custo por geração.':
    'ChatGPT Plus não automatiza imagens de aplicações externas. Conecte uma API paga para geração automática ou use o modo manual.'});
 }catch(e){res.status(503).json({error:String(e.message||e).slice(0,220)});}
});
app.post('/api/shopee/kits/image',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 if(req.body?.confirmPaidApi!==true)return res.status(403).json({
  error:'Esta geração pode gerar custo na API OpenAI. Marque a autorização explícita de API paga para cada lote.'});
 const slot=Number(req.body?.slot);
 if(!Number.isInteger(slot)||slot<1||slot>9)return res.status(400).json({error:'Selecione uma imagem de 1 a 9.'});
 let lock='';
 try{
  const {auth}=await getValidAuth(req);
  const key=await openAiApiKey(auth.shopId);
  if(!key)return res.status(409).json({error:'API de imagens não conectada. ChatGPT Plus não é uma chave de API. Configure sua chave antes de gerar automaticamente.'});
  const kit=await composeKit(auth.shopId,req.body?.skus,{
   marginPct:Number(req.body?.marginPct??15),
   packing:Number(req.body?.packing||0),shipping:Number(req.body?.shipping||0)});
  const manualFacts=req.body?.manualFacts||{};
  const prompt=kitPrompts(kit,{manualFacts})[slot-1];
  lock=auth.shopId+':'+kit.kitSku;
  if(kitImageOperations.has(lock))return res.status(409).json({error:'Já existe uma imagem sendo gerada para este kit. Não inicie outra solicitação.'});
  kitImageOperations.add(lock);
  const result=await generateKitImage({kit,slot,key,prompt});
  res.json({ok:true,...result,kitSku:kit.kitSku,marketplaceUpdated:false,
   requiresManualReview:true,autoPublished:false});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,360)});}
 finally{if(lock)kitImageOperations.delete(lock);}
});
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
// XLS/XLSX percorre o MESMO validador CSV. Só converte arquivo para texto
// estruturado; nenhuma operação de importação ou publicação ocorre aqui.
app.post('/api/shopee/wedrop/convert-excel',mustLogin,requireWeDropAdmin,(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
  try{
    const purpose=req.body?.purpose==='availability'?'availability':'catalog';
    const result=convertWeDropExcelBase64(req.body?.base64,req.body?.fileName,{purpose});
    res.json({ok:true,...result});
  }catch(error){res.status(400).json({error:String(error.message||error).slice(0,330)});}
});
// Prévia sem escrita: um arquivo WeDrop pode ter SKUs/estoque e custo
// identificável ou não. Evitar importar a mesma planilha em dois controles.
app.post('/api/shopee/kits/import/inspect',mustLogin,requireWeDropAdmin,(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const preview=previewWeDropCsv(costCsvFromBody(req));
  let stock=null;
  try{const parsed=parseWeDropAvailabilityCsv(costCsvFromBody(req));
   stock={recognized:true,count:parsed.total,available:parsed.availableCount,
    unavailable:parsed.unavailableCount};
  }catch(error){stock={recognized:false,reason:String(error.message).slice(0,260)};}
  const mayMapCost=preview.headers.some(h=>/custo|pre[çc]o|valor|cost|price/i.test(h)&&
   !/venda|an[uú]ncio|promoc|varejo|marketplace|lucro|margem|comiss[aã]o/i.test(h));
  if(!preview.automaticLayout?.recognized&&!stock.recognized&&!mayMapCost)
   return res.status(400).json({error:
    'Arquivo não contém custo WeDrop identificável nem disponibilidade válida. '+preview.automaticLayout?.reason,
    preview});
  res.json({ok:true,headers:preview.headers,rows:preview.rowCount,
   examples:preview.examples.slice(0,3),automaticLayout:preview.automaticLayout,
   stock,mappingRequired:!preview.automaticLayout?.recognized});
 }catch(error){res.status(400).json({error:String(error.message||error).slice(0,420)});}
});
app.post('/api/shopee/wedrop/auto/import',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
    const {auth}=await getValidAuth(req);
    const result=await importSupplierAutomatically(auth.shopId,costCsvFromBody(req),{
      sourceKind:'upload',sourceName:String(req.body?.fileName||'wedrop.csv').slice(0,130),
      approvedCostMapping:req.body?.approvedCostMapping||null
    });
    // Importação manual: a próxima consulta de kits deve buscar o catálogo
    // e status recém-importados, não a janela anterior de cache.
    clearKitCatalogCache(auth.shopId);
    clearKitStockCache(auth.shopId);
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

// Auditoria somente leitura: acesso à mesma loja autenticada, sem alterar anúncios.
app.post('/api/shopee/catalog/discount-audit',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 const ids=req.body?.itemIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>2000||
  ids.some(x=>!/^[1-9][0-9]{0,17}$/.test(String(x))))
  return res.status(400).json({error:'Informe de 1 a 2000 Item IDs válidos.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const report=await auditCatalogDiscounts({cfg,auth,call:callShopeeShopApi,
   readPages:readDiscountPages,itemIds:[...new Set(ids.map(String))]});
  res.json({ok:true,...report,marketplaceUpdated:false});
 }catch(error){res.status(503).json({error:String(error.message||error).slice(0,260)});}
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
// Atualiza o histórico com preços CONSULTADOS, sem alterar anúncios na Shopee.
app.post('/api/shopee/catalog/prices/recover',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 const ids=req.body?.itemIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>10||
  ids.some(x=>!/^[1-9][0-9]{0,17}$/.test(String(x))))
  return res.status(400).json({error:'Selecione de 1 a 10 Item IDs válidos.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const report=await fetchCatalogPrices(cfg,auth,callShopeeShopApi,ids.map(String));
  let persistence;
  try{persistence=await storeCatalogItems(auth.shopId,report.verified);}
  catch(error){persistence={stored:0,warning:'Preço consultado, mas não salvo no histórico: '+String(error.message||error).slice(0,100)};}
  res.json({ok:true,...report,persistence,marketplaceUpdated:false});
 }catch(error){res.status(503).json({error:String(error.message||error).slice(0,280)});}
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
// Conferência oficial SOMENTE LEITURA: diferencia anúncios de SKUs/modelos.
// O total oficial de anúncios jamais deve ser inferido do histórico local de 38 SKUs.
app.get('/api/shopee/optimizer/fiscal-migration/catalog-census',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth,cfg}=await getValidAuth(req);
  const statuses=['NORMAL','UNLIST','REVIEWING','BANNED'];
  const results=await Promise.all(statuses.map(async status=>{
   const data=await callShopeeShopApi(cfg,{path:'/api/v2/product/get_item_list',
    accessToken:auth.accessToken,shopId:auth.shopId,
    query:{item_status:status,offset:0,page_size:1}});
   const body=data?.response||{};
   const total=Number(body.total_count);
   if(!Number.isSafeInteger(total)||total<0)
    throw Error('Shopee não confirmou a contagem de anúncios do status '+status+'.');
   return {status,items:total};
  }));
  const totals=Object.fromEntries(results.map(x=>[x.status,x.items]));
  res.json({ok:true,source:'shopee-api-live',asOf:new Date().toISOString(),
   unit:'anuncios-pai-sem-contar-variacoes',
   statuses:totals,totalListings:results.reduce((n,x)=>n+x.items,0),
   executableStatuses:['NORMAL','UNLIST']});
 }catch(error){res.status(503).json({ok:false,verified:false,
  error:'Não foi possível verificar todo o catálogo diretamente na Shopee: '+
   String(error.message||error).slice(0,220)});}
});
// Rotina assistida de migração CPF -> CNPJ: descoberta SOMENTE LEITURA.
// Não altera anúncios nem ignora a revisão fiscal obrigatória.
app.get('/api/shopee/optimizer/fiscal-migration/active-skus',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth,cfg}=await getValidAuth(req);
  const status=String(req.query.status||'NORMAL').toUpperCase();
  if(!['NORMAL','UNLIST'].includes(status))throw Error('Status não editável para o fiscal em massa.');
  const fast=String(req.query.fast||'')==='1';
  const offset=Math.max(0,Number(req.query.offset)||0);
  if(!Number.isSafeInteger(offset)||offset>100000)throw Error('Paginação inválida.');
  const page=await fetchCatalogPage(cfg,auth,callShopeeShopApi,{status,offset,pageSize:50});
  // A mesma listagem utilizada para executar deve alimentar o cache de SKUs,
  // evitando uma busca remota adicional para cada um dos centenas de anúncios.
  await storeCatalogItems(auth.shopId,page.items||[]);
  // Consultas em pequenos grupos evitam timeouts HTTP 502 ao examinar mais de 400 SKUs.
  // Não consultar get_model_list em produtos sem variações: uma chamada desnecessária
  // por anúncio fazia cada página levar dezenas de segundos.
  const items=page.items||[],results=[];
  if(items.some(item=>!item.baseLoaded))
    throw Error('Shopee não retornou todos os detalhes desta página. Nenhuma lista parcial foi aceita; tente novamente.');
  for(let at=0;at<items.length;at+=5){
    const batch=await Promise.all(items.slice(at,at+5).map(async item=>{
      const itemId=String(item.itemId||'');
      if(!/^\d+$/.test(itemId))return [];
      let models=[];
      if(item.hasModel){
        const data=await callShopeeShopApi(cfg,{path:'/api/v2/product/get_model_list',
          accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id:Number(itemId)}});
        models=normalizeShopeeModels(data);
        await storeCatalogModels(auth.shopId,itemId,models);
        if(!models.length)throw Error('Anúncio '+itemId+' informou variações, mas nenhuma foi retornada.');
      }
      const candidates=item.hasModel?models.map(m=>({sku:m.sku,modelId:m.modelId,status:m.status}))
        :[{sku:item.sku,modelId:'0',status:'NORMAL'}];
      const output=[];
      for(const candidate of candidates){
        // get_model_list retorna MODEL_NORMAL/MODEL_UNAVAILABLE, não NORMAL/UNLIST.
        // Excluir esses modelos omitia silenciosamente todas as variações com SKU.
        if(!candidate.sku||candidate.status&&!['NORMAL','UNLIST','MODEL_NORMAL','MODEL_UNAVAILABLE'].includes(candidate.status))continue;
        // Inventário para execução não precisa fazer 742 consultas separadas
        // ao Supabase. A revisão será consultada durante a execução da SKU.
        const review=fast?null:await getWorkflowReview(auth.shopId,itemId,candidate.modelId);
        const checked=Boolean(review?.sku===candidate.sku&&
          review?.review_state?.stages?.fiscal?.reviewed&&review?.review_state?.tax?.ncm);
        output.push({sku:candidate.sku,itemId,modelId:candidate.modelId,
          title:item.title||'',listingStatus:status,unitSuggestion:suggestFiscalMeasureUnit(item.title).unit,reviewed:checked,
          status:checked?'revisado':'requer revisão fiscal'});
      }
      return output;
    }));
    for(const found of batch)results.push(...found);
  }
  res.json({ok:true,source:'shopee-api-live',status,
    items:results,pageItemCount:(page.items||[]).length,
    pageItemIds:(page.items||[]).map(item=>String(item.itemId)),
    totalCount:page.totalCount,
    hasNext:Boolean(page.hasNext),nextOffset:page.nextOffset,
    warnings:page.warnings||[]});
 }catch(error){res.status(400).json({ok:false,error:String(error.message||error).slice(0,260)});}
});
// Prepara no Motor Matriz, SEM autorizar envio ou marcar revisão fiscal como concluída.
// Processa apenas 12 SKUs por chamada para que a UI possa avançar em lotes seguros.
app.post('/api/shopee/optimizer/fiscal-migration/prepare-drafts',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const rows=req.body?.items;
  if(!Array.isArray(rows)||rows.length<1||rows.length>12)throw Error('Informe de 1 a 12 anúncios.');
  const {auth,cfg}=await getValidAuth(req);
  const results=[];const seen=new Set();
  for(const x of rows){
   const sku=validateSkuLookup(x?.sku),itemId=validItemId(x?.itemId),modelId=String(x?.modelId??'0');
   if(!/^\d{1,18}$/.test(modelId))throw Error('Modelo inválido.');
   const identity=itemId+':'+modelId;
   if(seen.has(identity))throw Error('SKU duplicada no lote.');seen.add(identity);
   try{
    const existing=await getWorkflowReview(auth.shopId,itemId,modelId);
    if(existing?.sku===sku&&existing.review_state?.stages?.fiscal?.reviewed){
     results.push({sku,status:'already_reviewed'});continue;
    }
    // Confirmar identidade e status diretamente na Shopee antes de salvar no banco.
    const record=await auditShopeeItem(cfg,auth,callShopeeShopApi,itemId,
      {expectedSku:sku,expectedModelId:modelId});
    if(!['NORMAL','UNLIST'].includes(record.status))throw Error('Anúncio não está ativo.');
    const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
    if(!supplier||!['exact-sku','reviewed-link'].includes(supplier.matchedBy))
      throw Error('Correspondência WeDrop não confirmada.');
    const supplierNcm=String(supplier.product_data?.ncm??'').replace(/\D/g,'');
    const previous=existing?.sku===sku?existing.review_state?.tax||{}:{};
    const manualNcm=String(previous.ncm||'').replace(/\D/g,'');
    const ncm=manualNcm||supplierNcm;
    if(!/^\d{8}$/.test(ncm))throw Error('NCM de oito dígitos não confirmado na ficha manual nem na WeDrop.');
    if(/^\d{8}$/.test(supplierNcm)&&manualNcm&&manualNcm!==supplierNcm)
      throw Error('NCM manual difere do NCM WeDrop. A informação manual foi preservada; confira a divergência.');
    const unit=suggestFiscalMeasureUnit(record.title||x.title||'',supplier.product_data?.title||'');
    const measureUnit=String(previous.measure_unit||'').trim()||unit.unit;
    if(!measureUnit)throw Error(unit.reason);
    // Valores digitados têm prioridade: nunca sobrescrever NCM, unidade ou
    // justificativa fiscal manual com uma nova sugestão do catálogo.
    const tax={...previous,ncm,origin:previous.origin||'2',
      same_state_cfop:previous.same_state_cfop||'5106',
      diff_state_cfop:previous.diff_state_cfop||'6106',
      csosn:previous.csosn||'102',pis_cofins_cst:previous.pis_cofins_cst||'99',
      cest:wedropCestForSku(supplier),measure_unit:measureUnit,
      evidence:previous.evidence||('NCM WeDrop '+supplier.supplier_sku+' · '+(supplier.source_file||'cadastro importado'))};
    fiscalMatrixSource({sku,supplier,tax});
    compileTax(tax,{tax_info:{}});
    await saveWorkflowReview(auth.shopId,itemId,modelId,sku,
      {stage:'fiscal',reviewed:false,tax});
    results.push({sku,status:'draft_saved',ncm,unit:unit.unit,cest:tax.cest,
      message:'Rascunho salvo. Exige revisão e aprovação fiscal antes de enviar.'});
   }catch(error){results.push({sku,status:'pending',message:String(error.message||error).slice(0,200)});}
  }
  res.json({ok:true,marketplaceUpdated:false,results});
 }catch(error){res.status(400).json({ok:false,error:String(error.message||error).slice(0,260)});}
});
// Migração excepcional: validação fiscal com rastreabilidade por SKU.
// Autorização expressa da loja, sem modificar preço, imagens ou outros campos.
app.post('/api/shopee/optimizer/fiscal-migration/validate-one',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
 try{
  if(req.body?.confirmation!=='VALIDAR FISCAL MIGRACAO')
   throw Error('Autorização fiscal explícita ausente.');
  const sku=validateSkuLookup(req.body?.sku),itemId=validItemId(req.body?.itemId);
  const modelId=String(req.body?.modelId??'0');
  if(!/^\d{1,18}$/.test(modelId))throw Error('Identificador do modelo inválido.');
  const {auth,cfg}=await getValidAuth(req);
  const existing=await getWorkflowReview(auth.shopId,itemId,modelId);
  if(existing?.sku!==sku)throw Error('SKU não corresponde à ficha fiscal armazenada.');
  if(existing.review_state?.stages?.fiscal?.reviewed===true)
   return res.json({ok:true,status:'already_reviewed',sku});
  const record=await auditShopeeItem(cfg,auth,callShopeeShopApi,itemId,
   {expectedSku:sku,expectedModelId:modelId});
  if(!['NORMAL','UNLIST'].includes(record.status))throw Error('Anúncio não está ativo.');
  const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
  if(!supplier||!['exact-sku','reviewed-link'].includes(supplier.matchedBy))
   throw Error('Não há vínculo WeDrop exato ou vínculo aprovado para esta SKU.');
  const tax=existing.review_state?.tax;
  if(!tax)throw Error('Rascunho fiscal ausente.');
  if(String(tax.cest??'').trim()!==wedropCestForSku(supplier))
   throw Error('CEST divergente da planilha WeDrop desta SKU. Reabra a revisão fiscal para atualizar o rascunho.');
  const source=fiscalMatrixSource({sku,supplier,tax});
  const unit=suggestFiscalMeasureUnit(record.title||'',supplier.product_data?.title||'');
  if(!tax.measure_unit)throw Error('Unidade de medida fiscal ausente.');
  // Uma unidade informada manualmente tem precedência sobre heurística de título.
  // compileTax verifica se a unidade é aceita pelo esquema, sem reescrever o valor.
  const ncm=String(supplier.product_data?.ncm||'').replace(/\D/g,'');
  if(!/^\d{8}$/.test(String(tax.ncm))||(/^\d{8}$/.test(ncm)&&ncm!==String(tax.ncm)))
   throw Error('NCM da ficha ausente ou divergente da WeDrop. Valor manual preservado para correção.');
  if(!['00',...[]].includes(String(tax.cest||''))&&!/^\d{7}$/.test(String(tax.cest||'')))
   throw Error('CEST fora do padrão autorizado.');
  const required={origin:'2',same_state_cfop:'5106',diff_state_cfop:'6106',
   csosn:'102',pis_cofins_cst:'99'};
  for(const [field,value] of Object.entries(required))
   if(String(tax[field])!==value)throw Error('Revisão de '+field+' necessária.');
  compileTax(tax,{tax_info:{}});
  const prior=await readShopeeExecution(auth.shopId,itemId,modelId);
  if(/Please upload the corresponding CEST of NCM/i.test(String(prior?.last_error||''))&&
      String(tax.cest)==='00')
   throw Error('Shopee já rejeitou CEST 00 para esta SKU; obter CEST oficial.');
  await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{
   stage:'fiscal',reviewed:true,tax,matrixFiscal:source
  });
  res.json({ok:true,status:'validated',sku,ncm,cest:tax.cest,
   message:'Dados da ficha confirmados com a WeDrop; envio ainda depende de prévia individual.'});
 }catch(error){res.status(409).json({ok:false,error:String(error.message||error).slice(0,240)});}
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

// Localizar anuncio existente do KIT pela SKU exata, sem percorrer 40 paginas.
app.get('/api/shopee/kits/optimization/find',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const kitSku=String(req.query?.kitSku||'').trim(),sku=validateSkuLookup(req.query?.sku);
  const {auth,cfg}=await getValidAuth(req);
  const saved=await loadKitDraft(auth.shopId,kitSku);
  if(!saved?.kit||!Array.isArray(saved.skus))
   throw Error('Kit nao salvo. Salve o rascunho antes de localizar o anuncio na Shopee.');
  if(!saved.skus.includes(sku)||String(req.query?.mainSku||sku).trim()!==sku)
   throw Error('Selecione a SKU principal do kit. A Shopee utiliza somente essa SKU única.');
  const search=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,sku,{fastOnly:true});
  const matches=(search.matches||[]).filter(x=>String(x.sku)===sku&&
   ['NORMAL','UNLIST'].includes(String(x.status).toUpperCase()))
   .map(x=>({itemId:String(x.itemId),modelId:String(x.modelId??0),
    sku,title:String(x.title||sku),status:String(x.status)}));
  res.json({ok:true,kitSku,sku,searchMode:'direct_exact',
   matches,notFound:!matches.length,canDeepSearch:true,
   warnings:(search.warnings||[]).slice(0,2),marketplaceUpdated:false,
   message:matches.length?'Anuncio encontrado na Shopee.':
    'Nao ha anuncio com a SKU exata do kit confirmado na busca rapida. SKU de componente nao equivale ao kit.'});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,340),marketplaceUpdated:false});}
});
// Preparação assistida de anúncios. Somente leitura da Shopee nesta versão;
// auditoria jamais dispara update_item, mídia, alteração de preço ou estoque.
app.get('/api/shopee/optimizer/find',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const sku=validateSkuLookup(req.query.sku);
  const {auth,cfg}=await getValidAuth(req);
  const deep=req.query.deep==='1';
  const cached=await findExactCatalogSku(auth.shopId,sku);
  // Para SKUs ausentes do cache, pesquisar pelo SKU EXATO na API antes de
  // fazer 15 páginas de varredura. Não presumir ausência definitiva:
  // a busca aprofundada continua disponível se o endpoint dirigido não achar.
  // Se encontrar candidato, a verificação NORMAL atual permanece obrigatória.
  if(!deep&&!cached.length){
    const quick=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,sku,{fastOnly:true});
    const candidates=(quick.matches||[]).filter(x=>
      ['NORMAL','UNLIST','REVIEWING'].includes(String(x.status||'').toUpperCase()));
    if(!candidates.length){
      return res.json({ok:true,sku,matches:[],lookup:'direct_not_found',
        verifiedLive:false,canDeepSearch:true,retiredItemIds:[],
        warnings:(quick.warnings||[]).slice(0,3),
        message:'SKU não localizada no catálogo salvo nem na busca direta. '+
          'A busca aprofundada verifica as páginas restantes; a precificação WeDrop é independente.'});
    }
  }
  // Antigos IDs SELLER_DELETE permanecem no cache; não são candidatos ativos.
  // SEMPRE consultar a listagem NORMAL em tempo real antes de escolher o item.
  let catalogWriteWarning='';
  const authoritative=await scanLiveNormalSku({
   sku,cached,
   maxPages:deep?40:15,
   getPage:args=>fetchCatalogPage(cfg,auth,callShopeeShopApi,args),
   onMatch:async matches=>{
    // Atualizar somente os IDs encontrados ATIVOS no anúncio verdadeiro.
    // Não transferir plano de preço, descrição ou autorização entre item IDs.
    try{
     await storeCatalogItems(auth.shopId,matches.map(x=>({
      ...x,baseLoaded:true
     })));
    }catch(error){
     // A prova oficial NORMAL pode ser exibida mesmo com cache indisponível,
     // mas não tratar como pronta para promoção sem plano atrelado ao ID real.
     catalogWriteWarning='A lista ativa confirmou a SKU, mas o cache não foi atualizado: '+
      String(error.message||error).slice(0,130);
    }
   }
  });
  let matches=authoritative.matches;
  let warnings=catalogWriteWarning?[catalogWriteWarning]:[],lookup='live_normal_verified';
  if(!matches.length){
   // Listagem ativa foi percorrida integralmente; procurar UNLIST/REVIEWING
   // apenas na busca direcionada, NUNCA trazer SELLER_DELETE do cache.
   const alternative=await findLiveShopeeSku(cfg,auth,callShopeeShopApi,sku,{
    fastOnly:!deep
   });
   warnings.push(...(alternative.warnings||[]));
   matches=catalogCandidatesIfNoActive({
    cached,sku,live:alternative.matches,normalScanComplete:true
   });
   lookup=matches.length?'live_secondary_verified':'not_found';
  }
  const retired=authoritative.replacedIds;
  const active=matches.filter(x=>String(x.status||'').toUpperCase()==='NORMAL');
  const notice=retired.length&&active.length
   ?' Vínculo antigo do catálogo ('+retired.slice(0,4).join(', ')+') ignorado; foi encontrado anúncio ativo ID '+active.map(x=>x.itemId).join(', ')+'. O plano de preço antigo NÃO será transferido automaticamente.'
   :'';
  res.json({
   ok:true,sku,matches,lookup,verifiedLive:true,
   retiredItemIds:retired,canDeepSearch:!deep&&!matches.length,
   warnings:warnings.slice(0,3),
   message:matches.length
    ?'SKU exata localizada na Shopee, IDs verificados no catálogo ativo.'+notice
    :'Nenhum anúncio NORMAL confirmado para esta SKU. IDs excluídos do cache não serão selecionados.'
  });
 }catch(error){
  res.status(409).json({ok:false,error:'Não foi possível identificar o anúncio ativo da SKU: '+
   String(error.message||error).slice(0,270)+'. Nenhuma alteração será enviada à Shopee.'});
 }
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
// Preparação do anúncio de KIT já existente na Shopee. Sem publicação/criação.
app.post('/api/shopee/kits/optimization/prepare',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,cfg}=await getValidAuth(req),body=req.body||{};
  const kitSku=String(body.kitSku||'').trim(),sku=validateSkuLookup(body.sku);
  if(sku!==String(body.mainSku||'').trim())
   throw Error('O anúncio da Shopee deve usar a mesma SKU principal escolhida em Kits.');
  const itemId=validItemId(body.itemId),modelId=String(body.modelId??'0');
  if(!/^\d{1,18}$/.test(modelId))throw Error('Modelo Shopee inválido.');
  const saved=await loadKitDraft(auth.shopId,kitSku);
  if(!saved?.kit)throw Error('Salve o rascunho do kit antes de vincular um anúncio.');
  const kit=await composeKit(auth.shopId,saved.skus,{
   marginPct:Number(saved.kit.quote?.targetMarginPct??15),
   packing:Number(saved.kit.packing||0),shipping:Number(saved.kit.shipping||0)
  });
  const record=await auditShopeeItem(cfg,auth,callShopeeShopApi,itemId,{
   expectedSku:sku,expectedModelId:modelId
  });
  const link=validateKitOptimizationTarget({saved,kit,record,targetSku:sku,itemId,
   modelId,mainSku:body.mainSku,confirmedItemId:body.confirmedItemId});
  const prior=await getWorkflowReview(auth.shopId,itemId,modelId);
  if(prior?.sku&&prior.sku!==sku)throw Error('O Item ID pertence a outra SKU.');
  if(prior?.review_state?.kitOptimization?.kitSku&&
   prior.review_state.kitOptimization.kitSku!==kitSku)
   throw Error('Este anúncio já pertence à otimização de outro kit.');
  const job=await readShopeeExecution(auth.shopId,itemId,modelId);
  if(['running','uncertain'].includes(job?.state))
   throw Error('Execução já iniciada ou sem confirmação. Confira o progresso.');
  if(saved.optimization?.itemId&&String(saved.optimization.itemId)!==String(itemId)){
   const old=saved.optimization;
   if(old.sku===old.mainSku)
    throw Error('Kit já vinculado a outro Item ID da SKU principal. Confira o vínculo antes de trocar.');
   // Migração da regra antiga: não transferir prévias entre os Item IDs.
   const former=await readShopeeExecution(auth.shopId,old.itemId,old.modelId);
   if(['running','uncertain'].includes(former?.state))
    throw Error('Execução do vínculo antigo pendente. Confirme antes de migrar.');
  }
  await recordKitOptimization(auth.shopId,kitSku,link);
  // O vendedor já selecionou e salvou título/descrição na área superior do KIT.
  // Validar a fonte existente (sem gerar outra vez) e registrar sua revisão
  // SOMENTE se passar as mesmas regras do otimizador. Nada publica na Shopee.
  let seoReviewed=false,seoError='';
  try{validateReview({stage:'seo',reviewed:true,title:link.title});seoReviewed=true;}
  catch(e){seoError=String(e.message||e).slice(0,220);}
  let descriptionReviewed=false,descriptionError='';
  try{validateReview({stage:'description',reviewed:true,description:link.description});descriptionReviewed=true;}
  catch(e){descriptionError=String(e.message||e).slice(0,220);}
  await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{
   stage:'seo',reviewed:seoReviewed,title:link.title,titleOrigin:'kit-wedrop',
   kitOptimization:link,resetKitStages:true
  });
  await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{
   stage:'description',reviewed:descriptionReviewed,description:link.description,
   descriptionOrigin:'kit-wedrop'
  });
  const warnings=[...(seoError?['Título salvo no kit exige correção acima: '+seoError]:[]),
   ...(descriptionError?['Descrição salva no kit exige correção acima: '+descriptionError]:[])];
  res.json({ok:true,prepared:true,marketplaceUpdated:false,
   target:{sku,itemId:String(itemId),modelId,mainSku:link.mainSku,title:record.title,status:record.status},
   quote:{componentCost:link.componentCost,kitCost:link.kitCost,
    grossPrice:link.grossPrice,promoPrice:link.promoPrice},
   reusedContent:{seoReviewed,descriptionReviewed,imagesRequiresConfirmedImport:true},
   warnings,
   message:'Título e descrição do kit reutilizados; apenas os textos validados são marcados como revisados. Não houve publicação na Shopee.'});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,340)});}
});
app.post('/api/shopee/kits/optimization/image',mustLogin,requireWeDropAdmin,
 express.raw({type:['image/png','image/jpeg'],limit:MAX_IMAGE_BYTES}),async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,cfg}=await getValidAuth(req),kitSku=String(req.query.kit_sku||'').trim();
  const saved=await loadKitDraft(auth.shopId,kitSku),link=saved?.optimization;
  if(!kitOptimizationLinkIsCurrent(saved,link))
   throw Error('Vínculo ou conteúdo do kit alterado; prepare novamente.');
  const slot=Number(req.query.slot);
  if(!Number.isInteger(slot)||slot<1||slot>9)throw Error('Posição inválida, escolha 1 a 9.');
  const job=await readShopeeExecution(auth.shopId,link.itemId,link.modelId);
  if(['running','uncertain'].includes(job?.state))
   throw Error('Execução pendente; importação bloqueada até confirmação.');
  const record=await auditShopeeItem(cfg,auth,callShopeeShopApi,link.itemId,{
   expectedSku:link.sku,expectedModelId:link.modelId
  });
  if(!['NORMAL','UNLIST'].includes(String(record.status).toUpperCase()))
   throw Error('O anúncio não está editável na Shopee.');
  const image=await importPreparedImage({shopId:auth.shopId,itemId:link.itemId,
   modelId:link.modelId,sku:link.sku,slot,file:req.body,
   mime:String(req.get('content-type')||'').split(';')[0],filename:'kit-'+kitSku+'-'+slot});
  await saveWorkflowReview(auth.shopId,link.itemId,link.modelId,link.sku,{
   stage:'images',reviewed:false
  });
  res.status(201).json({ok:true,image,slot,requiresReview:true,marketplaceUpdated:false});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,340)});}
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
  const linked=(await getWorkflowReview(auth.shopId,itemId,modelId))?.review_state?.kitOptimization;
  if(linked){
   const kit=await loadKitDraft(auth.shopId,linked.kitSku);
   if(!kitOptimizationLinkIsCurrent(kit,linked))
    throw Error('Kit, custos ou vínculo mudaram. Volte aos Kits e prepare novamente.');
  }
  return {itemId,modelId,sku,auth,cfg,record};
}

// SEO research is read-only. These are observed offer titles, NOT search-volume rankings.
// Some Shopee Affiliate offers are not comparable; never use their unconfirmed claims.

// A loja optou por NÃO consumir créditos da API OpenAI em títulos SEO.
// Neutralize esta rota antiga para proteger contra clientes com JS em cache.
// O novo gerador de títulos funciona localmente no navegador, sem API paga.
app.post('/api/shopee/optimizer/workflow/title-ai',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
 return res.status(409).json({ok:false,source:'local_generator',titles:[],
  error:'Geração de títulos pela API OpenAI desativada para evitar consumo de créditos. Atualize a página para usar o gerador gratuito.'});
});

app.get('/api/shopee/optimizer/workflow/title-research',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {itemId,sku,modelId,auth,record}=await checkedWorkflowAudit(req);
    const market=await lookupShopeeCompetitors({
      title:String(record.title||'').slice(0,200),
      ownShopId:auth.shopId,ownItemId:itemId
    });
    const sample=(market.sample||[]).slice(0,5).map(row=>({
      title:String(row.title||'').slice(0,180),
      url:row.url||null,
      similarity:Number(row.similarity)||0
    }));
    res.json({ok:true,sku,itemId,modelId,
      source:'Shopee Afiliados · amostra de ofertas por termos relacionados',
      verifiedSample:market.verified===true,
      sample,
      researchedAt:market.researchedAt||null,
      status:market.status||'unavailable',
      message:market.message||market.reason||'Pesquisa externa não confirmada.',
      note:'Recorrência dos termos nos anúncios não comprova volume de buscas. Apenas termos sustentados pelo produto podem compor o título.'
    });
  }catch(err){
    res.status(400).json({ok:false,error:String(err.message||err).slice(0,220)});
  }
});

app.get('/api/shopee/optimizer/workflow',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {itemId,modelId,sku,auth,cfg,record}=await checkedWorkflowAudit(req);
    const stored=await getWorkflowReview(auth.shopId,itemId,modelId);
    let review=stored?.sku===sku?stored.review_state||{}:{};
    let stages=buildStages(record,review);
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
    const primarySku=review.kitOptimization?.mainSku||sku;
    const [supplier,settings]=await Promise.all([
      readWeDropProduct(auth.shopId,primarySku===sku?{sku,itemId,modelId}:{sku:primarySku}),
      optimizerSettings(auth.shopId)]);
    // Somente a WeDrop desta SKU pode definir o CEST interno, nunca a API Shopee.
    // Corrigir também revisões fiscais antigas gravadas com CEST de outra origem.
    const sourceCest=wedropCestForSku(supplier);
    if(review.tax&&String(review.tax.cest??'').trim()!==sourceCest){
      review=await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{
        stage:'fiscal',reviewed:false,tax:{...review.tax,cest:sourceCest}
      });
      stages=buildStages(record,review);
    }
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
    const collectEvidenceFacts=()=>{
      const basic=supplierAttributeSuggestions({attributes:technicalPreview.attributes,
        proposed:review.attributes||[],supplier,sourceText:sourceEvidence.sourceText,
        productDescription:record.description});
      const inferred=narrativeTechnicalSuggestions({attributes:technicalPreview.attributes,
        supplier,sourceText:sourceEvidence.sourceText,productDescription:record.description,
        productTitle:record.title,existing:basic.suggestions});
      return mergeNarrativeTechnicalFacts(basic,inferred);
    };
    let evidenceFacts=collectEvidenceFacts();
    // Brand/category option lists can be truncated. Resolve missing exact values
    // through Shopee's official search before prefilling, never manufacture IDs.
    const searchable=evidenceFacts.unresolved.filter(x=>x.value&&
      typeof x.value==='string'&&x.value.length<=100).slice(0,8);
    // Search category options only for values explicitly found in supplier evidence;
    // only exact official matches are ever used in the prepared draft.
    let extraOptions=false;
    // Limit the total official lookups per SKU so dynamic research never
    // multiplies into dozens of requests on a slow Shopee connection.
    let categoryOptionLookups=0;
    for(const missing of searchable){
      if(categoryOptionLookups>=10)break;
      const attr=technicalPreview.attributes.find(x=>Number(x.id)===Number(missing.attributeId));
      if(!attr?.supportSearch||attr.conditional)continue;
      try{
        // Motor Matriz: pesquisa para QUALQUER SKU e categoria, não apenas motos.
        // Consultar primeiro o valor literal e depois equivalentes exatos seguros.
        // O código/ID precisa ser devolvido pela API oficial da Shopee.
        const variants=technicalOptionSearchTerms(attr.name,missing.value).slice(0,3);
        for(const value of variants){
          if(categoryOptionLookups>=10)break;
          categoryOptionLookups++;
          const request=searchAttributeRequest({attributeId:attr.id,valueName:value,limit:50});
          const items=readSearchedAttributeOptions(await matrixShopeeSearch(cfg,auth,request),0,50).options;
          const normalized=String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
          const official=items.find(x=>String(x.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()===normalized);
          if(official){
            attr.options=[...(attr.options||[]).filter(x=>Number(x.id)!==Number(official.id)),official];
            extraOptions=true;
            break;
          }
        }
      }catch(error){
        console.warn('[shopee-autofill] official category option unavailable:',String(error.message||error).slice(0,120));
      }
    }
    if(extraOptions)evidenceFacts=collectEvidenceFacts();
    // Merge confirmed source-backed values into the SKU's existing draft,
    // not into the published listing and never over an earlier manual edit.
    let persistedTechnicalDraft=review.technicalDraft||null;
    if(evidenceFacts.suggestions?.length){
      try{
        persistedTechnicalDraft=await mergeWorkflowTechnicalAutofill(auth.shopId,itemId,modelId,sku,
          technicalPreview.attributes,evidenceFacts.suggestions)||persistedTechnicalDraft;
      }catch(error){
        technicalWarning=(technicalWarning?technicalWarning+' ':'')+
          'Preenchimento sugerido, mas salvamento automático pendente: '+
          String(error.message||error).slice(0,130);
      }
    }
    const manualVideo=manualVideoPublicInfo(
      await getShopeeManualVideo(auth.shopId,itemId,modelId,sku));
    // A descrição é preparada em segundo plano na primeira consulta da SKU,
    // usando o catálogo WeDrop e as informações adicionais salvas pelo vendedor.
    // Não chama a API OpenAI nem utiliza créditos de IA.
    const composed=composeShopeeDescription({record,supplier,sourceText:sourceEvidence.sourceText});
    const storedDescription=String(review.draftDescription||'');
    // Texto do antigo modelo genérico é identificável mesmo se uma
    // conferência antiga o rotulou incorretamente como "manual".
    // Edição verdadeiramente personalizada continua protegida.
    const legacyTemplate=isGenericShopeeDescription(storedDescription);
    const manuallyEdited=review.descriptionOrigin==='manual'&&!legacyTemplate;
    const autoRefreshable=Boolean(storedDescription)&&!manuallyEdited&&
      (review.descriptionOrigin==='auto-refreshed'||legacyTemplate);
    const shouldSaveAuto=composed.valid&&(!storedDescription||
      autoRefreshable&&composed.description!==storedDescription);
    if(shouldSaveAuto){
      // Publicação não é feita; apenas salva rascunho de descrição por SKU.
      // A aprovação antiga é invalidada somente quando o texto automático muda.
      const refreshed=await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{
        stage:'description',reviewed:false,description:composed.description,
        descriptionOrigin:'auto-refreshed',
        ...(storedDescription?{previousGeneratedDescription:storedDescription}:{})
      });
      review=refreshed;
      stages=buildStages(record,review);
    }
    const finalDescription=review.draftDescription||composed.description;

    res.json({ok:true,readOnlyMarketplace:true,sku,itemId,modelId,manualVideo,...supplierFacts,
      sourceEvidence,sourceEvidenceWarning,sourceFacts:evidenceFacts,technicalDraft:persistedTechnicalDraft,shopId:auth.shopId,
      contentVariants:review.contentVariants||null,contentResearch:review.contentResearch||null,
      attributes:technicalPreview.attributes,anatel:inspectAnatelCompliance(technicalPreview),technicalWarning,attributeChanges:review.attributes||[],taxDraft:review.tax||{},taxCurrent:current.tax_info||{},
      recordedAt:stored?.updated_at||null,stages,
      variationConfig:review.variationConfig||officialVariationConfig,
      hasShopeeModels:Boolean(record.hasModel),shopeeModels:record.models||[],
      shopeeVariationTiers:record.variationTiers||[],imageNotes:review.imageNotes||{},imagePrompts:review.imagePrompts||{},
      kitOptimization:review.kitOptimization||null,
      kitDiscountPreview:review.kitDiscountPreview||null,
      kitDiscountPublication:review.kitDiscountPublication||null,
      draftTitle:review.draftTitle||safeTitle(record.title),
      draftDescription:finalDescription,
      descriptionAutoGenerated:!review.draftDescription||review.descriptionOrigin==='auto-refreshed',
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
   req.supplierExtractedCount=merged.count;
  }
  else throw Error('Operação de evidência não reconhecida.');
  // Novas informações do fornecedor podem alterar a qualidade da descrição,
  // dos atributos e das imagens. Não apagar conteúdos manuais nem aprovar
  // publicação automaticamente: marcar apenas revisão necessária.
  let reviewWarning=null;
  try{
   await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{stage:'technical',reviewed:false});
   await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{stage:'images',reviewed:false});
   await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{stage:'description',reviewed:false});
  }catch(error){
   reviewWarning='Fonte salva; não foi possível reabrir a revisão automaticamente.';
   console.warn('[supplier-evidence] review invalidation:',String(error.message||error).slice(0,160));
  }
  res.json({ok:true,reviewWarning,extractedCount:Number(req.supplierExtractedCount||0),sourceEvidence:await readShopeeSourceEvidence(auth.shopId,itemId,modelId,sku,{preview:true})});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,270)});}
});
// Store user-entered technical values immediately, including incomplete drafts.
// This is not approval and does not update the Shopee listing.
app.post('/api/shopee/optimizer/workflow/technical-draft',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const {auth,itemId,modelId,sku,record}=await checkedWorkflowAudit(req);
  const input=req.body?.fields;
  if(!Array.isArray(input)||input.length>160)throw Error('Rascunho técnico inválido.');
  const validIds=new Set((record.attributeAudit?.attributes||[]).map(a=>Number(a.id)));
  const used=new Set();
  const fields=input.map(f=>{
   const id=Number(f.attributeId);
   if(!Number.isSafeInteger(id)||id<=0||!validIds.has(id)||used.has(id))
    throw Error('Atributo técnico não pertence à categoria deste produto.');
   used.add(id);
   if(typeof f.enabled!=='boolean'||!Array.isArray(f.values)||f.values.length>20)
    throw Error('Campos da ficha inválidos.');
   const evidence=String(f.evidence??'').normalize('NFC');
   if(evidence.length>500)throw Error('Comprovação excede o limite.');
   const values=f.values.map(v=>{
    const valueId=Number(v.valueId);
    if(!Number.isSafeInteger(valueId)||valueId< -1||valueId>2147483647)
     throw Error('Opção fiscal inválida.');
    const valueName=String(v.valueName??'').normalize('NFC'),unit=String(v.unit??'').normalize('NFC');
    if(valueName.length>500||unit.length>35)throw Error('Valor manual excede o limite.');
    return {valueId,valueName,unit};
   });
   return {attributeId:id,enabled:f.enabled,userDisabled:f.userDisabled===true,evidence,values};
  });
  // Preencher apenas a origem da informação, nunca inventar o valor do país
  // ou da quantidade. Valor escolhido pelo vendedor é uma fonte legítima.
  const normalizedFields=applySellerDeclarations(fields.filter(x=>x.enabled),record.attributeAudit?.attributes||[]);
  const evidenceById=new Map(normalizedFields.map(f=>[f.attributeId,f.evidence]));
  for(const field of fields)if(evidenceById.has(field.attributeId))field.evidence=evidenceById.get(field.attributeId);
  const technicalDraft={fields,updatedAt:new Date().toISOString()};
  await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{
   stage:'technical',reviewed:false,technicalDraft
  });
  res.json({ok:true,saved:true,sku,technicalDraft,marketplaceUpdated:false});
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,230)});}
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
// Salva o título/descrição DIGITADOS antes de trocar etapas, sem publicar.
// Revisão aprovada é invalidada somente se o texto foi realmente modificado.
app.post('/api/shopee/optimizer/workflow/content-draft',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
 try{
  const stage=String(req.body?.stage||'');
  if(!['seo','description'].includes(stage))throw Error('Etapa de texto inválida.');
  const raw=stage==='seo'?req.body?.title:req.body?.description;
  if(typeof raw!=='string')throw Error('O texto editado não foi enviado.');
  const content=validateReview({stage,reviewed:false,
    ...(stage==='seo'?{title:raw}:{description:raw})});
  const {itemId,modelId,sku,auth}=await checkedWorkflowAudit(req);
  const stored=await getWorkflowReview(auth.shopId,itemId,modelId);
  if(stored?.sku&&stored.sku!==sku)throw Error('Rascunho pertence a outra SKU.');
  const previous=stored?.review_state||{};
  const field=stage==='seo'?'draftTitle':'draftDescription';
  const value=stage==='seo'?content.title:content.description;
  if(String(previous[field]||'')===value)
    return res.json({ok:true,saved:true,unchanged:true,sku,stage,
      reviewed:previous.stages?.[stage]?.reviewed===true});
  await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{
    stage,reviewed:false,
    ...(stage==='seo'?{title:value,titleOrigin:'manual'}:
      {description:value,descriptionOrigin:'manual'})
  });
  return res.json({ok:true,saved:true,sku,stage,reviewed:false,
    message:'Rascunho manual salvo no banco por SKU; conferência anterior invalidada.'});
 }catch(error){
  res.status(400).json({ok:false,error:String(error.message||error).slice(0,260)});
 }
});

// Uma revisão aprovada não pode ficar com atributos de publicação vazios
// enquanto o próprio rascunho contém opções completas. Fonte por SKU.
function approvedTechnicalDraftChanges(draft,{reviewedAt=null}={}){
 const fields=Array.isArray(draft?.fields)?draft.fields:[];
 if(fields.length>300)throw Error('Rascunho técnico inválido.');
 if(reviewedAt){
  const a=Date.parse(String(reviewedAt||'')),b=Date.parse(String(draft?.updatedAt||''));
  if(!Number.isFinite(a)||!Number.isFinite(b)||b>a)
   throw Error('Ficha técnica alterada após aprovação. Reabra e confira a revisão.');
 }
 const ids=new Set(),changes=[];
 for(const f of fields){
  const id=Number(f?.attributeId);
  if(!Number.isSafeInteger(id)||id<=0||ids.has(id))
   throw Error('Identificador técnico inválido ou duplicado.');
  ids.add(id);
  if(!f.enabled||f.userDisabled)continue;
  const values=Array.isArray(f.values)?f.values:[];
  if(!values.length||values.some(v=>!(Number(v?.valueId)>0||
    Number(v?.valueId)===0&&String(v?.valueName||'').trim())))continue;
  changes.push({attributeId:id,values:values.map(v=>({valueId:Number(v.valueId),
   valueName:String(v.valueName||''),unit:String(v.unit||'')})),
   evidence:String(f.evidence||'').slice(0,350)});
 }
 return changes;
}
app.post('/api/shopee/optimizer/workflow/review',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem da solicitação não permitida.'});
  try{
    const {itemId,modelId,sku,auth,cfg,record}=await checkedWorkflowAudit(req);
    // Apenas o kit já vinculado e auditado pode confirmar seu título salvo,
    // mesmo abaixo da meta SEO de 100 caracteres (mínimo 10, máximo 120).
    const linkedKit=(await getWorkflowReview(auth.shopId,itemId,modelId))?.review_state?.kitOptimization;
    const allowShortKitTitle=Boolean(req.body?.stage==='seo'&&
      req.body?.kitPreparedTitle===true&&linkedKit?.kitSku&&
      String(linkedKit.mainSku)===String(sku));
    const change=validateReview(req.body,{allowShortKitTitle});
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
      const storedTechnical=await getWorkflowReview(auth.shopId,itemId,modelId);
      if(storedTechnical?.sku&&storedTechnical.sku!==sku)
       throw Error('O rascunho técnico salvo pertence a outra SKU.');
      // O editor conserva sugestões e decisões em technicalDraft. Se o array
      // do formulário estiver vazio, não converter "conferido" em "nada a enviar".
      if(!change.attributes?.length){
       const source=storedTechnical?.review_state?.technicalDraft;
       if(Array.isArray(source?.fields)&&source.fields.length)
        change.attributes=approvedTechnicalDraftChanges(source);
      }
      const live=await shopeeLiveEditableItem(cfg,auth,itemId);
      // Ignore inactive conditional children and the live values the seller did
      // not edit. A real mandatory child activated by a parent is still checked.
      const scoped=scopeTechnicalReviewChanges(
        applySellerDeclarations(change.attributes||[],record.attributeAudit?.attributes||[]),{
        record,live,auditChanges:attributeAuditForChanges
      });
      const proposed=scoped.changes;
      await hydrateCategoryChoices(record,proposed,cfg,auth,live);
      const proposedAudit=attributeAuditForChanges(proposed,record,live);
      // Opcional inválido não impede registrar conferência local.
      // Nenhuma sugestão descartada entra no plano de publicação.
      const {valid,skipped}=selectValidTechnicalChanges(proposed,proposedAudit);
      change.attributes=valid;
      change.technicalSkipped=skipped;
      // Conferir não envia dados à Shopee; divergências de marca devem
      // ser bloqueadas apenas no preparo/execução, que já revalida a marca.
      change.matrixTechnical=technicalMatrixSource({sku,record,attributes:valid});
      const verifiedAttributes=attributeAuditForChanges(valid,record,live);
      if(Number(verifiedAttributes?.missingMandatory)>0)
        throw Error('Motor Matriz: a ficha técnica ainda possui '+verifiedAttributes.missingMandatory+' atributo(s) obrigatório(s) sem preenchimento. Corrija antes de aprovar.');
      compileAttributes(valid,record,live);
    }else if(change.attributes)compileAttributes(change.attributes,record,await shopeeLiveEditableItem(cfg,auth,itemId));
    // O anúncio de kit usa a SKU principal REAL como referência fiscal.
    // Nunca descartar a fonte WeDrop vinculada só por ser um kit:
    // fiscalMatrixSource ainda confere SKU, vínculo, NCM e evidência.
    // Nenhum dado dos componentes adicionais é presumido como NCM do kit.
    const fiscalSku=String(linkedKit?.mainSku||sku);
    if(linkedKit&&fiscalSku!==String(sku))
      throw Error('Motor Matriz: SKU principal do kit diverge da SKU auditada na Shopee. Refaça o vínculo do kit.');
    const taxSupplier=change.tax?await readWeDropProduct(auth.shopId,{sku,itemId,modelId}):null;
    if(change.tax)change.tax={...change.tax,cest:wedropCestForSku(taxSupplier)};
    if(change.stage==='fiscal'&&change.reviewed){
      // Mesmo caminho seguro das SKUs simples: permite apenas vínculo
      // exato/revisado e bloqueia fonte WeDrop inexistente ou NCM diferente.
      change.matrixFiscal=fiscalMatrixSource({sku,supplier:taxSupplier,tax:change.tax});
      // Register the accountant-supplied SKU fields in Motor Matriz even if
      // Shopee previously rejected the fiscal update due to missing CEST.
      // Validating a LOCAL draft must never require a Shopee tax_info read/write.
      // compileTax accepts an omitted CEST; it does not invent a substitute.
      compileTax(change.tax,{tax_info:{}});
    }else if(change.tax)compileTax(change.tax,{tax_info:{}});
    if(change.stage==='description'&&change.description!==undefined){
      // Aprovar uma sugestão automática sem editar não é edição manual.
      // Só a edição efetiva do vendedor deve impedir futura regeneração
      // ao salvar novas informações da WeDrop.
      const currentReview=await getWorkflowReview(auth.shopId,itemId,modelId);
      const previous=currentReview?.sku===sku?currentReview.review_state||{}:{};
      const same=String(previous.draftDescription||'')===String(change.description||'');
      change.descriptionOrigin=same&&previous.descriptionOrigin==='auto-refreshed'
        ?'auto-refreshed':'manual';
    }
    if(change.stage==='seo'&&change.title!==undefined)
      change.titleOrigin='manual';
    const state=await saveWorkflowReview(auth.shopId,itemId,modelId,sku,change);
    res.json({ok:true,saved:true,marketplaceUpdated:false,sku,itemId,modelId,
      fiscalRegistration:change.stage==='fiscal'?{
        status:'saved_in_matrix',registered:true,shopUpdated:false,
        cestOptional:true,cestProvided:Boolean(String(state.tax?.cest||'').trim()),
        message:'Dados fiscais cadastrados no Motor Matriz. CEST 00 poderá ser enviado após autorização explícita; nenhum dado foi alterado na Shopee por esta conferência.'
      }:null,
      stages:buildStages(record,state),attributeChanges:state.attributes||[],
      ...(change.stage==='technical'?{technicalSkipped:change.technicalSkipped||[]}:{}),
      taxDraft:state.tax||{},draftTitle:state.draftTitle||safeTitle(record.title),
      // Se outra etapa foi salva, mantenha o rascunho gerado na tela em vez de
      // substituí-lo silenciosamente pelo anúncio antigo.
      ...(state.draftDescription?{draftDescription:state.draftDescription}:{}),
      variationConfig:state.variationConfig||{enabled:Boolean(record.hasModel),type:'',values:[]},imageNotes:state.imageNotes||{},imagePrompts:state.imagePrompts||{}});
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
async function shopeeLiveVariationState(cfg,auth,itemId,knownItem=null){
 const item=knownItem||await shopeeLiveEditableItem(cfg,auth,itemId);
 const models=item.has_model?(await callShopeeShopApi(cfg,{
  path:'/api/v2/product/get_model_list',accessToken:auth.accessToken,shopId:auth.shopId,
  query:{item_id:Number(itemId)}})).response?.model||[]:[];
 return {item,models};
}
// Regra única de evidência aplicável a toda SKU e aos múltiplos caminhos de execução.
function variationEvidenceApproved(details,reviewState){
 const options=details?.options||[];
 return reviewedVariationEvidence(details,reviewState?.stages?.variants)||
  (options.length>0&&options.every(o=>o.photoConfirmed===true&&o.stockConfirmed===true));
}
async function prepareExecutionVariations({auth,cfg,sku,itemId,modelId},reviewState,live){
 if(!reviewState.variationDetails)throw Error('Configure as variações reais e suas fotos antes da prévia única.');
 const details=validateVariationDetails(reviewState.variationDetails,{
  requirePhotos:!live.has_model,approvedReview:reviewState.stages?.variants
 });
 if(details.options.length<2)throw Error('A execução automática exige a opção original e pelo menos uma variação.');
 if(!live.has_model&&details.options.some(o=>!variantAssetBelongsTo(o.asset,auth,itemId,modelId)))
  throw Error('Alguma foto de variação não pertence a este anúncio.');
 const source=await verifiedVariationSupplierCosts({auth,sku,itemId,modelId},{
  ...details,reviewed:variationEvidenceApproved(reviewState.variationDetails,reviewState)
 });
 const prepared={type:details.type,alreadyCreated:live.has_model===true,
  options:details.options.map(o=>({...o,cost:source.find(s=>s.sku===o.sku)?.unitCost||null}))};
 if(prepared.options.some(o=>!o.cost))throw Error('Custo WeDrop não confirmado para todas as opções.');
 if(live.has_model){
  const current=approvedShopeeModels({modelVariations:prepared},
   await shopeeLiveVariationState(cfg,auth,itemId,live));
  if(!current)throw Error('Modelos diferentes das variações aprovadas. Refaça a prévia.');
  prepared.options=prepared.options.map((o,i)=>{
   const price=Number(current[i].price_info?.[0]?.original_price??current[i].original_price);
   if(!Number.isFinite(price)||price<=0)throw Error('Preço atual não confirmado para '+o.name+'.');
   return {...o,price,modelId:String(current[i].model_id)};
  });
 }
 return prepared;
}
// Comparar a soma dos SKUs WeDrop novamente antes de qualquer execução.
async function verifiedLinkedKitQuote(auth,link){
 const draft=await loadKitDraft(auth.shopId,link.kitSku);
 if(!kitOptimizationLinkIsCurrent(draft,link))
  throw Error('O kit, os custos ou o vínculo foram alterados. Prepare novamente.');
 const live=await composeKit(auth.shopId,draft.skus,{
  marginPct:Number(draft.kit.quote?.targetMarginPct??15),
  packing:Number(draft.kit.packing||0),shipping:Number(draft.kit.shipping||0)
 });
 if(Math.abs(Number(live.kitCost)-Number(link.kitCost))>.011||
    Math.abs(Number(live.quote.grossPrice)-Number(link.grossPrice))>.011||
    Math.abs(Number(live.quote.marketplacePrice)-Number(link.promoPrice))>.011)
  throw Error('Os custos, margem ou preço do kit mudaram. Recalcule antes de executar.');
 return {draft,live};
}
app.post('/api/shopee/optimizer/execution/prepare',mustLogin,requireWeDropAdmin,async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
  try{
    const {itemId,modelId,sku,auth,cfg,record}=await checkedWorkflowAudit(req);
    const selectedStage=normalizeShopeeExecutionStage(req.body.stage||'all');
    let allowDiscountOnly=false,approvedCampaignId='';
    if(selectedStage==='all'&&req.body?.discountApprovalToken){
     const approved=verifyDiscountPreview(req.body.discountApprovalToken,envText('SESSION_SECRET'),auth.shopId);
     if(approved.sku!==sku||String(approved.itemId)!==String(itemId)||
       String(approved.modelId)!==String(modelId))
      throw Error('A prévia de desconto não corresponde à SKU preparada.');
     allowDiscountOnly=true;
     approvedCampaignId=String(approved.discountId||'').trim();
    }
    // CPF/CNPJ não impede guardar rascunho. all publica fiscal por último, em segunda escrita com conferência.
    const review=await getWorkflowReview(auth.shopId,itemId,modelId);
    if(review&&review.sku!==sku)throw Error('SKU do plano revisado é diferente. Refaça a auditoria.');
    const kitLink=review?.review_state?.kitOptimization;
    if(kitLink){
     await verifiedLinkedKitQuote(auth,kitLink);
     if(req.body?.discountApprovalToken)
      throw Error('Kit composto: prepare o desconto específico após otimização confirmada.');
     if(review.review_state?.variationConfig?.enabled===true)
      throw Error('Kit: criação de variações com custo individual bloqueada. Mantenha apenas as variações existentes.');
    }
    const live=await shopeeLiveEditableItem(cfg,auth,itemId);
    const manualVideo=await getShopeeManualVideo(auth.shopId,itemId,modelId,sku);
    const previous=await readShopeeExecution(auth.shopId,itemId,modelId);
    const verifiedVideoSha256=previous?.state==='verified'&&
      verifyShopeeExecution(previous.plan,live,previous.result)?previous.plan.video?.sha256:null;
    const manualImages=await readPreparedImages(auth.shopId,itemId,modelId,sku);
    const reviewState={...(review?.review_state||{})};
    // Evitar ficha técnica aprovada e invisível na publicação. O rascunho
    // precisa ser anterior à revisão e os campos devem continuar elegíveis
    // pela categoria Shopee atual. Não aprovar dados novos automaticamente.
    if(['all','technical'].includes(selectedStage)&&
       reviewState.stages?.technical?.reviewed===true&&
       !reviewState.attributes?.length&&
       Array.isArray(reviewState.technicalDraft?.fields)&&
       reviewState.technicalDraft.fields.length){
      const source=approvedTechnicalDraftChanges(reviewState.technicalDraft,{
       reviewedAt:reviewState.stages.technical.reviewedAt
      });
      if(source.length){
       const scoped=scopeTechnicalReviewChanges(
        applySellerDeclarations(source,record.attributeAudit?.attributes||[]),{
         record,live,auditChanges:attributeAuditForChanges
        });
       await hydrateCategoryChoices(record,scoped.changes,cfg,auth,live);
       const audited=attributeAuditForChanges(scoped.changes,record,live);
       const classified=selectValidTechnicalChanges(scoped.changes,audited);
       // Os campos incompatíveis continuam como pendência explícita.
       reviewState.attributes=classified.valid;
       reviewState._technicalRecoveredFromApprovedDraft=true;
       reviewState._technicalSkipped=classified.skipped;
      }
    }
    // Variações conferidas são parte da execução completa, nunca um envio
    // manual em outra tela. Dados e custos vêm do rascunho salvo da SKU.
    let modelVariations=null;
    if(['all','remaining'].includes(selectedStage)&&reviewState.variationConfig?.enabled===true)
     modelVariations=await prepareExecutionVariations({auth,cfg,sku,itemId,modelId},reviewState,live);
    let autoModelDiscountToken=null,autoModelDiscountPreview=null;
    if(modelVariations){
     const campaignId=String(req.body?.campaignId||approvedCampaignId||
      reviewState.modelDiscountCampaignId||'').trim();
     if(approvedCampaignId&&campaignId!==approvedCampaignId)
      throw Error('A campanha selecionada difere da que foi autorizada nesta SKU. Refaça a prévia da promoção.');
     if(!/^\d{1,18}$/.test(campaignId))
      throw Error('Informe uma vez a campanha Minha Promoção na etapa Desconto; ela será incluída automaticamente na prévia única.');
     // Preparar é uma consulta SEM ESCRITA. Avaliar a exceção >25% aqui
     // permite apresentar os valores e solicitar autorização depois.
     // A execução exige consentimento EXPLÍCITO separado, revalidado na API.
     const financial=await discountExecutionInputs(req,sku,itemId,modelId,campaignId,{
      allowModels:live.has_model===true,expectedModels:modelVariations,
      allowOver25:true});
     const marketOverrideRequired=financial.quote.status==='MERCADO_ABAIXO_DO_PISO'&&
      Number(financial.quote.marketGapPct)>25;
     // Cada modelo tem custo próprio; a barra principal fornece UMA meta de margem.
     // Recalcular o preço BRUTO individual sem reduzir o desconto para mascarar custos.
     const settings=normalizeShopeePricingSettings({
      ...await shopeePricingPreferences(auth.shopId),
      marginPct:Number(financial.quote.targetMarginPct),
      minMarginPct:Math.max(8,Number(financial.quote.minMarginPct)||8),
      discountPct:Number(financial.snapshot.discountPct),
      couponPct:Number(financial.snapshot.couponPct)
     });
     const modelQuotes=modelVariations.options.map(option=>{
      const quote=quoteShopeePrice({unitCost:Number(option.cost),settings,marginOverride:true});
      const promo=Number(quote.marketplaceDisplayPrice),gross=Number(quote.grossPrice);
      if(!Number.isFinite(gross)||!Number.isFinite(promo)||promo>=gross||
       quote.netMarginPct+1e-7<settings.minMarginPct)
       throw Error('Margem ou preço inválido na variação '+option.name);
      const ending=value=>Math.round(value*100)%10;
      if(![0,9].includes(ending(promo))||![0,9].includes(ending(quote.buyerAfterCoupon)))
       throw Error('Não existe terminação 0/9 segura para '+option.name);
      return {name:option.name,sku:option.sku,supplierSku:option.supplierSku,
       cost:option.cost,gross,promo,buyerAfterCoupon:quote.buyerAfterCoupon,
       profit:quote.netProfit,margin:quote.netMarginPct};
     });
     const approved=financial.snapshot;
     modelVariations.promotion={discountId:campaignId,gross:approved.gross,promo:approved.promo,
      discountPct:approved.discountPct,couponPct:approved.couponPct,
      buyerAfterCoupon:approved.buyerAfterCoupon,quoteAt:approved.quoteAt,
      originalPrice:approved.originalPrice,existingPrice:approved.existingPrice,
      action:approved.action,promotionSignal:approved.promotionSignal,
      needsBasePriceUpdate:approved.needsBasePriceUpdate,
      modelQuotes,marginPct:settings.marginPct,minMarginPct:settings.minMarginPct,
      allowOver25:marketOverrideRequired,
      marketOverrideRequired,marketGapPct:Number(financial.quote.marketGapPct),
      marketReference:Number(financial.quote.marketResearch?.reference),
      netMarginPct:Number(financial.quote.netMarginPct),
      netProfit:Number(financial.quote.netProfit),
      modelPriceChange:modelVariations.options.some(o=>
       Math.round(o.price*100)!==Math.round(modelQuotes.find(m=>m.sku===o.sku).gross*100))};
     // Guardar a campanha escolhida nesta SKU: nas próximas variações
     // o Motor Matriz poderá reutilizar o ID após revalidar tudo pela API.
     if(String(reviewState.modelDiscountCampaignId||'')!==campaignId)
      await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{modelDiscountCampaignId:campaignId});
     autoModelDiscountToken=signDiscountPreview(approved,envText('SESSION_SECRET'));
     autoModelDiscountPreview={...modelVariations.promotion,
      models:modelVariations.options.map(o=>({name:o.name,sku:o.sku,supplierSku:o.supplierSku,
       cost:o.cost,originalPrice:o.price,...modelQuotes.find(m=>m.sku===o.sku)})),
      netMarginPct:financial.quote.netMarginPct,minMarginPct:financial.quote.minMarginPct,
      marketOverrideRequired,marketGapPct:Number(financial.quote.marketGapPct),
      marketReference:Number(financial.quote.marketResearch?.reference),
      netProfit:Number(financial.quote.netProfit)};
    }
    if(selectedStage==='fiscal'&&reviewState.stages?.fiscal?.reviewed&&reviewState.tax){
      const supplier=kitLink?null:await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
      fiscalMatrixSource({sku,supplier,tax:reviewState.tax,reviewSource:reviewState.matrixFiscal});
    }
    // Marca proveniente da WeDrop precisa coincidir com a categoria mesmo que a
    // ficha técnica não esteja aprovada; nunca publicar com Marca: Novo por engano.
    const supplierForBrand=await readWeDropProduct(auth.shopId,kitLink?
     {sku:kitLink.mainSku}:{sku,itemId,modelId});
    if(['all','technical'].includes(selectedStage))
      assertShopeeSupplierBrand({record,attributes:reviewState.stages?.technical?.reviewed?
        reviewState.attributes||[]:[],supplier:supplierForBrand});
    if(['all','technical'].includes(selectedStage)&&reviewState.stages?.technical?.reviewed){
      technicalMatrixSource({sku,record,attributes:reviewState.attributes||[],reviewSource:reviewState.matrixTechnical});
      await hydrateCategoryChoices(record,reviewState.attributes||[],cfg,auth,live);
    }
    const inputs={shopId:auth.shopId,itemId,modelId,sku,record,
      review:reviewState,live,manualVideo,verifiedVideoSha256,manualImages,selectedStage,allowDiscountOnly,modelVariations};
    let plan=compileShopeeExecutionPlan({...inputs,omitFiscal:false});
    if(['all','technical'].includes(selectedStage)&&reviewState.stages?.technical?.reviewed&&
       !reviewState.attributes?.length&&reviewState.technicalDraft?.fields?.length&&
       !plan.confirmedStages?.technical){
      plan.warnings.push('Ficha técnica aprovada sem atributos elegíveis para envio. '+
       'Confira a etapa técnica; a Shopee não recebeu esses campos.');
    }
    // Previous Shopee validation can mean tax_info was rejected while other
    // approved changes are independent. A first explicit "00" submission is allowed,
    // and let the next explicit execution try only non-fiscal changes.
    // A refusal from Shopee itself is still decisive, never silently bypassed.
    const taxDraftNcm=String(reviewState.tax?.ncm||live.tax_info?.ncm||'').trim();
    // Somente uma recusa da MESMA combinação CEST/NCM adia a etapa fiscal.
    // Se antes não se enviava "00", permitir sua primeira tentativa explicitamente autorizada.
    const reviewedCest=String(reviewState.tax?.cest||'').trim();
    const previousSentCest=String(previous?.plan?.finalFiscal?.cest||
      previous?.plan?.proposed?.tax_info?.cest||'').trim();
    const previouslyRejected=previous?.sku===sku&&
      /corresponding CEST of NCM|CEST.{0,50}(required|obrigat)/i.test(String(previous.last_error||''))&&
      !isShopeeCestConfirmed(live.tax_info?.cest)&&
      (!reviewedCest||(reviewedCest==='00'&&previousSentCest==='00'))&&
      taxDraftNcm===String(previous.plan?.finalFiscal?.ncm||
        previous.plan?.proposed?.tax_info?.ncm||previous.plan?.original?.tax_info?.ncm||'').trim();
    const deferFiscal=selectedStage==='all'&&Boolean(previouslyRejected);
    if(deferFiscal)plan=compileShopeeExecutionPlan({...inputs,deferUnconfirmedFiscal:true,omitFiscal:false});
    if(reviewState._technicalRecoveredFromApprovedDraft)
     plan.warnings.push('Ficha técnica: recuperação validada do rascunho aprovado desta SKU. '+
      (reviewState.attributes?.length||0)+' campo(s) elegível(is) conferidos para a prévia; '+
      (reviewState._technicalSkipped?.length||0)+' campo(s) opcional(is) incompatível(is) mantidos como pendência.');
    if(plan.finalFiscal&&['all','remaining'].includes(selectedStage)){
      // A última etapa usa o mesmo vínculo WeDrop/NCM que a execução fiscal isolada.
      const supplier=kitLink?null:await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
      fiscalMatrixSource({sku,supplier,tax:reviewState.tax,reviewSource:reviewState.matrixFiscal});
    }
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
    res.json({ok:true,ready:stored.plan.canExecute,plan:stored.plan,progress:shopeeExecutionProgress(stored),
      issue:deferFiscal&&!plan.canExecute?
        detectShopeeExecutionIssue(previous.last_error,previous.plan):null,
      updatedAt:stored.updated_at,executionStatus:stored.state,marketplaceUpdated:false,
      autoModelDiscountPreview,autoModelDiscountToken});
  }catch(e){res.status(409).json({error:String(e.message||e).slice(0,300)});}
});
// Validação fiscal leve: consulta apenas anúncio + eventual modelo. Não busca
// esquema de atributos, mídia ou preço, pois só envia tax_info.
async function auditFiscalSkuLight(cfg,auth,itemId,modelId,sku){
 const live=await shopeeLiveEditableItem(cfg,auth,itemId);
 const status=String(live.item_status||'');
 if(!['NORMAL','UNLIST'].includes(status))
  throw Error('Anúncio não está em estado editável na Shopee.');
 if(String(live.item_id)!==String(itemId))throw Error('Item ID divergente.');
 if(String(modelId)!=='0'){
  if(!live.has_model)throw Error('Anúncio não possui o modelo solicitado.');
  const raw=await callShopeeShopApi(cfg,{
   path:'/api/v2/product/get_model_list',accessToken:auth.accessToken,
   shopId:auth.shopId,query:{item_id:Number(itemId)}
  });
  const model=normalizeShopeeModels(raw).find(x=>x.modelId===String(modelId));
  if(!model||model.sku!==sku)
   throw Error('SKU ou modelo diverge da listagem oficial Shopee.');
  if(!['MODEL_NORMAL','MODEL_UNAVAILABLE','NORMAL','UNLIST'].includes(model.status))
   throw Error('Modelo não editável no momento: '+model.status);
 }else if(live.has_model||String(live.item_sku||'').trim()!==sku){
  throw Error('SKU principal não corresponde ao anúncio Shopee sem variações.');
 }
 const record={itemId:String(itemId),selectedModelId:String(modelId),sku,
  title:String(live.item_name||''),status,hasModel:Boolean(live.has_model),
  categoryId:Number(live.category_id)||0,imageCount:0,videoStatus:'Não consultado',
  attributeAudit:{attributes:[],missingMandatory:0}};
 return {record,live};
}
// Execução fiscal direta: um único roundtrip de preparação + validação +
// agendamento durável. A autorização veio do único botão autenticado da loja.
// Não emite NF-e e só altera tax_info no anúncio; nunca preço, imagens ou vídeo.
app.post('/api/shopee/optimizer/fiscal-migration/execute-one',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
 try{
  if(req.body?.confirmation!=='EXECUTAR FISCAL SKU')
   throw Error('A operação fiscal precisa de autorização expressa.');
  const sku=validateSkuLookup(req.body?.sku),itemId=validItemId(req.body?.itemId);
  const modelId=String(req.body?.modelId??'0');
  if(!/^\d{1,18}$/.test(modelId))throw Error('Modelo inválido.');
  const {auth,cfg}=await getValidAuth(req);
  const previousJob=await readShopeeExecution(auth.shopId,itemId,modelId);
  if(previousJob?.sku===sku&&['running','uncertain'].includes(previousJob.state))
   return res.json({ok:true,sku,itemId,modelId,status:previousJob.state,
    message:previousJob.state==='running'?'Envio fiscal já em andamento.':
      'Envio anterior ainda sem confirmação; a operação não será repetida.'});
  // Revalidar identidade e dados atuais sem consultar ficha técnica, vídeo,
  // imagens ou preço: esses campos não participam da atualização fiscal.
  const {record,live}=await auditFiscalSkuLight(cfg,auth,itemId,modelId,sku);
  const existing=await getWorkflowReview(auth.shopId,itemId,modelId);
  if(existing&&existing.sku!==sku)throw Error('A revisão salva pertence a outra SKU.');
  const previousTax=existing?.review_state?.tax||{};
  const supplier=await readWeDropProduct(auth.shopId,{sku,itemId,modelId});
  const supplierLinked=supplier&&['exact-sku','reviewed-link'].includes(supplier.matchedBy);
  const sourceNcm=String(supplierLinked?supplier.product_data?.ncm||'':'').replace(/\D/g,'');
  const manuallySaved=String(previousTax.ncm||'').replace(/\D/g,'');
  const ncm=manuallySaved||sourceNcm;
  if(!/^\d{8}$/.test(ncm))
   throw Error('NCM da SKU ausente: confira cadastro fiscal manual ou importação WeDrop.');
  if(/^\d{8}$/.test(sourceNcm)&&manuallySaved&&manuallySaved!==sourceNcm)
   throw Error('NCM manual diferente da WeDrop. Preservado no cadastro para revisão, sem envio.');
  const unit=suggestFiscalMeasureUnit(record.title||'',supplierLinked?supplier.product_data?.title||'':'');
  const measureUnit=String(previousTax.measure_unit||'').trim()||unit.unit;
  if(!measureUnit)throw Error('Unidade fiscal sem informação suficiente: '+unit.reason);
  const evidence=String(previousTax.evidence||'').trim()||
   (supplierLinked?'NCM WeDrop '+supplier.supplier_sku+' · '+(supplier.source_file||'catálogo validado'):'');
  if(!evidence)throw Error('NCM manual sem fonte fiscal registrada; dados preservados para revisão.');
  const tax={...previousTax,ncm,origin:previousTax.origin||'2',
   same_state_cfop:previousTax.same_state_cfop||'5106',
   diff_state_cfop:previousTax.diff_state_cfop||'6106',
   csosn:previousTax.csosn||'102',
   pis_cofins_cst:previousTax.pis_cofins_cst||'99',
   cest:wedropCestForSku(supplierLinked?supplier:null),measure_unit:measureUnit,evidence};
  // Validar antes da revisão: demais dados permanecem; CEST é exclusivo da WeDrop
  // ou 00 no cadastro interno. Nunca inferir CEST real a partir do NCM/Shopee.
  compileTax(tax,{tax_info:{}});
  const source=fiscalMatrixSource({sku,supplier:supplierLinked?supplier:null,tax});
  // Completar campos ausentes até mesmo nas fichas já marcadas como
  // revisadas, sem sobrescrever um único valor manual preexistente.
  const needsSave=!existing?.review_state?.stages?.fiscal?.reviewed||
   Object.entries(tax).some(([key,value])=>
    String(previousTax[key]??'')!==String(value??''));
  if(needsSave){
   await saveWorkflowReview(auth.shopId,itemId,modelId,sku,{
    stage:'fiscal',reviewed:true,tax,matrixFiscal:source
   });
  }
  const review=await getWorkflowReview(auth.shopId,itemId,modelId);
  const reviewedTax=review?.review_state?.tax;
  if(review?.sku!==sku||!review.review_state?.stages?.fiscal?.reviewed||!reviewedTax)
   throw Error('Os dados fiscais não foram persistidos; operação cancelada.');
  fiscalMatrixSource({sku,supplier:supplierLinked?supplier:null,tax:reviewedTax,
   reviewSource:review.review_state.matrixFiscal});
  // tax_info pertence ao anúncio-pai na API Shopee. Não sobrescrever
  // o NCM de outra variação sem verificar o enquadramento do anúncio inteiro.
  const liveNcm=String(live.tax_info?.ncm||'').replace(/\D/g,'');
  if(record.hasModel&&/^\d{8}$/.test(liveNcm)&&liveNcm!==String(reviewedTax.ncm)){
   return res.json({ok:true,sku,itemId,modelId,status:'blocked',
    message:'Este anúncio possui variações com NCM fiscal divergente: Shopee '+
      liveNcm+' / ficha '+reviewedTax.ncm+
      '. A API fiscal altera o anúncio-pai. Corrija o vínculo fiscal antes de substituir dados de outras variações.'});
  }
  const plan=compileShopeeExecutionPlan({shopId:auth.shopId,itemId,modelId,sku,
   record,review:review.review_state,live,selectedStage:'fiscal'});
  if(!plan.canExecute&&!plan.blocked.length&&!plan.proposed.tax_info)
   return res.json({ok:true,sku,itemId,modelId,status:'already_current',
    message:'Os campos fiscais da ficha já constam na Shopee; leitura oficial confirmada.'});
  const disposition=fiscalPreviewDisposition({plan,previousError:previousJob?.last_error,
   previousPlan:previousJob?.plan});
  if(!disposition.allowed)
   return res.json({ok:true,sku,itemId,modelId,status:'blocked',
    message:disposition.issues.join(' '),needsReview:true});
  if(!plan.canExecute||Object.keys(plan.proposed||{}).some(k=>k!=='tax_info')||
    !plan.proposed.tax_info||plan.images?.length||plan.video)
   return res.json({ok:true,sku,itemId,modelId,status:'blocked',
    message:plan.blocked.join(' · ')||'Informação fiscal não elegível para envio.'});
  confirmShopeeExecution(plan,{sku,confirmation:'EXECUTAR '+sku});
  const saved=await saveShopeePreparedExecution(auth.shopId,itemId,modelId,sku,plan);
  await claimShopeePreparedExecution(auth.shopId,itemId,modelId,{
   planId:plan.planId,updatedAt:saved.updated_at,runId:crypto.randomUUID()
  });
  res.status(202).json({ok:true,sku,itemId,modelId,status:'running',
   message:'Atualização fiscal iniciada; aguardando confirmação oficial por SKU.'});
  void runOptimizerJobs();
 }catch(error){
  res.status(409).json({ok:false,error:String(error.message||error).slice(0,280)});
 }
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
    if(String(review.review_state.tax.cest??'').trim()!==wedropCestForSku(supplier))
     throw Error('CEST salvo não corresponde à planilha WeDrop da SKU. Reabra a ficha fiscal.');
    fiscalMatrixSource({sku,supplier,tax:review.review_state.tax,
      reviewSource:review.review_state.matrixFiscal});
    // Nunca reutilizar um plano fiscal preparado com CEST antigo da API:
    // a execução em lote só autoriza CEST idêntico ao CSV WeDrop da SKU.
    const expectedCest=wedropCestForSku(supplier);
    if(String(job.plan?.proposed?.tax_info?.cest??'')!==expectedCest)
      throw Error('CEST da prévia fiscal diverge da WeDrop ('+expectedCest+
        '). Reprepare a SKU antes de autorizar; não foi enviado nenhum valor.');
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
    // Não transformar uma SKU já cadastrada na Shopee em "pendência".
    // Quando o plano não tem nenhuma diferença e não há bloqueios,
    // a leitura oficial já confirmou que os campos revisados estão presentes.
    if(!plan.canExecute&&!plan.blocked.length&&!plan.proposed.tax_info){
      results.push({sku,itemId:String(itemId),modelId:String(modelId),
        ready:false,state:'already_current',marketplaceUpdated:false,registered:true,
        current:live.tax_info||{},proposed:null,blocked:[],
        message:'Informações fiscais da ficha já estão cadastradas na Shopee. Nenhum reenvio necessário.'});
      continue;
    }
    // Expor o bloqueio REAL e não sobrescrever um job confirmado por
    // um plano blocked que não executará nenhum update.
    if(!plan.canExecute){
      results.push({sku,itemId:String(itemId),modelId:String(modelId),
        ready:false,state:'blocked_validation',registered:true,
        current:live.tax_info||{},proposed:plan.proposed.tax_info||null,
        blocked:plan.blocked,
        message:plan.blocked.join(' · ')||
          'A ficha fiscal revisada não apresentou alterações elegíveis. Confira NCM e dados já existentes.'});
      continue;
    }
    plan.mediaArchive=archiveShopeeMedia(prior,plan);
    const job=await saveShopeePreparedExecution(auth.shopId,itemId,modelId,sku,plan);
    results.push({sku,itemId:String(itemId),modelId:String(modelId),
      ready:true,state:job.state,planId:plan.planId,updatedAt:job.updated_at,
      current:live.tax_info||{},proposed:plan.proposed.tax_info||null,
      blocked:plan.blocked,warnings:plan.warnings.filter(x=>/Fiscal|CEST|NCM|Anatel/i.test(x)),
      message:'Alteração fiscal preparada para envio autorizado à Shopee.'});
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
  let job=await readShopeeExecution(auth.shopId,itemId,modelId);
  if(job?.sku!==sku||job.state!=='prepared')throw Error('Plano não preparado ou já iniciado. Confira o andamento.');
  const linkedKit=(await getWorkflowReview(auth.shopId,itemId,modelId))?.review_state?.kitOptimization;
  if(linkedKit){
   await verifiedLinkedKitQuote(auth,linkedKit);
   if(req.body?.discountApprovalToken)
    throw Error('Kit composto: desconto exige a confirmação própria da etapa 08.');
   if(!(Date.parse(job.updated_at)>=Date.parse(linkedKit.preparedAt)))
    throw Error('A prévia é anterior à preparação do kit. Gere uma nova prévia antes de executar.');
  }
  const previousPlan=job.plan;
  let plan=previousPlan;
  const remainingOnly=req.body.remainingOnly===true;
  if(remainingOnly){
   if(previousPlan.selectedStage!=='all'||!previousPlan.modelVariations?.promotion)
    throw Error('A execução só das etapas pendentes exige variações e desconto aprovados no plano atual.');
   // Autorização é o clique nesta ação específica. Reconstituir somente as
   // três etapas pendentes a partir de dados atuais da Shopee e WeDrop:
   // jamais escrever título, descrição, imagens, vídeo ou ficha técnica.
   const savedReview=await getWorkflowReview(auth.shopId,itemId,modelId);
   if(savedReview?.sku!==sku)throw Error('Revisão da SKU mudou. Reprepare antes de executar.');
   const currentLive=await shopeeLiveEditableItem(cfg,auth,itemId);
   const currentVariations=await prepareExecutionVariations({auth,cfg,sku,itemId,modelId},
     savedReview?.review_state||{},currentLive);
   const approvedOptions=previousPlan.modelVariations.options||[];
   const identity=options=>JSON.stringify(options.map(o=>({
    name:o.name,sku:o.sku,supplierSku:o.supplierSku,cost:Number(o.cost),
    price:Number(o.price),stock:Number(o.stock),gtin:o.gtin||'',noGtin:o.noGtin===true,
    photo:o.asset?.sha256||null,modelId:String(o.modelId||'')
   })));
   if(identity(approvedOptions)!==identity(currentVariations.options))
    throw Error('Variações, custos ou estoque WeDrop mudaram desde a prévia. Reprepare a execução.');
   plan=compileShopeeExecutionPlan({
    shopId:auth.shopId,itemId,modelId,sku,record,
    review:savedReview?.review_state||{},live:currentLive,selectedStage:'remaining',
    deferUnconfirmedFiscal:previousPlan.fiscalDeferred===true,
    modelVariations:{...currentVariations,promotion:previousPlan.modelVariations.promotion}
   });
   if(!plan.canExecute)
    throw Error('Etapas pendentes não estão prontas: '+(plan.blocked.join('; ')||'sem alterações aprovadas'));
   if(previousPlan.finalFiscal){
    if(plan.finalFiscal&&!sameData(previousPlan.finalFiscal,plan.finalFiscal))
     throw Error('Os dados fiscais mudaram após aprovação. Confira novamente os valores fiscais.');
    if(!plan.finalFiscal&&!fieldsVerified({tax_info:previousPlan.finalFiscal},currentLive))
     throw Error('Os dados fiscais antigos não foram confirmados na Shopee. Nova conferência fiscal necessária.');
   }
   plan.mediaArchive=archiveShopeeMedia(job,plan);
  }
  let commercialDiscount=null;
  if(['all','remaining'].includes(plan.selectedStage)&&plan.fiscalDeferred)
   throw Error('Etapa fiscal pendente: revise os dados fiscais antes de aprovar o desconto final.');
  // Kit composto: primeiro o anuncio, depois a promocao do kit pela rota
  // especifica, apenas apos a execucao ser confirmada pela Shopee.
  if(['all','remaining'].includes(plan.selectedStage)&&!linkedKit){
   // Em planos de variação, o clique autenticado + o plano imutável no banco
   // autorizam a promoção exibida. O token de 10 minutos não pode bloquear
   // anúncio e mídia depois de o usuário ter aprovado essa mesma prévia.
   // A API, o custo WeDrop, a pesquisa e os valores permanecem revalidados.
   const modelPromo=plan.modelVariations?.promotion||null;
   if(plan.modelVariations&&!modelPromo)
    throw Error('A promoção das variações não foi preparada. Revalide a prévia.');
   const approved=plan.modelVariations?modelPromo:
    verifyDiscountPreview(req.body?.discountApprovalToken,envText('SESSION_SECRET'),auth.shopId);
   if(!plan.modelVariations&&
     (approved.sku!==sku||String(approved.itemId)!==String(itemId)||String(approved.modelId)!==String(modelId)))
    throw Error('A aprovação da campanha pertence a outra SKU.');
   const over25Consent=req.body?.allowOver25===true;
   if(plan.modelVariations?.promotion?.marketOverrideRequired&&!over25Consent)
    throw Error('Preço mais de 25% acima da média. Marque a autorização excepcional na prévia da SKU antes de executar. Nenhum envio foi iniciado.');
   const fresh=(await discountExecutionInputs(req,sku,itemId,modelId,approved.discountId,{
    allowModels:Boolean(plan.modelVariations),expectedModels:plan.modelVariations,
    allowOver25:approved.allowOver25===true&&over25Consent})).snapshot;
   const fields=plan.modelVariations?
    ['discountId','gross','promo','buyerAfterCoupon','couponPct','discountPct','quoteAt']:
    ['shopId','sku','itemId','modelId','discountId','gross','promo','buyerAfterCoupon',
      'couponPct','discountPct','quoteAt','originalPrice','action','existingPrice','promotionSignal','needsBasePriceUpdate'];
   if(plan.modelVariations)
    for(const k of ['originalPrice','existingPrice','action','promotionSignal','needsBasePriceUpdate'])
     if(Object.hasOwn(modelPromo,k))fields.push(k);
   for(const k of fields)
    if(String(fresh[k]??'')!==String(approved[k]??''))
     throw Error('A prévia da promoção mudou ('+k+'). Refaça a conferência antes de executar.');
   if(fresh.needsBasePriceUpdate&&req.body?.allowPriceChange!==true)
    throw Error('Autorize também o ajuste do preço bruto na etapa 08.');
   if(plan.modelVariations){
    const sourceSettings=await shopeePricingPreferences(auth.shopId);
    const settings=normalizeShopeePricingSettings({...sourceSettings,
     marginPct:Number(modelPromo.marginPct),minMarginPct:Number(modelPromo.minMarginPct),
     discountPct:Number(modelPromo.discountPct),couponPct:Number(modelPromo.couponPct)});
    if(!Array.isArray(modelPromo.modelQuotes)||
       modelPromo.modelQuotes.length!==plan.modelVariations.options.length)
     throw Error('Faltam preços individuais no plano de variações. Refaça a prévia.');
    for(const option of plan.modelVariations.options){
     const approvedModel=modelPromo.modelQuotes.find(m=>m.sku===option.sku);
     if(!approvedModel||Math.abs(Number(approvedModel.cost)-Number(option.cost))>0.009)
      throw Error('Custo ou SKU de variação mudou. Refaça a prévia.');
     const newQuote=quoteShopeePrice({unitCost:Number(option.cost),settings,marginOverride:true});
     if(Math.round(Number(newQuote.grossPrice)*100)!==Math.round(Number(approvedModel.gross)*100)||
      Math.round(Number(newQuote.marketplaceDisplayPrice)*100)!==Math.round(Number(approvedModel.promo)*100)||
      newQuote.netMarginPct+1e-7<Math.max(8,settings.minMarginPct))
      throw Error('Margem ou desconto de '+option.name+' mudou. Refaça a prévia.');
    }
    if(modelPromo.modelPriceChange&&req.body?.allowPriceChange!==true)
     throw Error('Autorize o preço bruto individual das variações antes de executar.');
   }
   commercialDiscount={snapshot:plan.modelVariations?{...fresh,modelQuotes:modelPromo.modelQuotes}:fresh,
    allowPriceChange:req.body?.allowPriceChange===true};
  }
  if(Object.hasOwn(plan.proposed||{},'tax_info')&&plan.selectedStage!=='fiscal')
   throw Error('Informações fiscais só podem ser enviadas em execução fiscal individual, nunca junto das outras etapas.');
  if(normalizeShopeeExecutionStage(req.body.stage||'all')!==normalizeShopeeExecutionStage(previousPlan?.selectedStage||'all'))
   throw Error('A etapa escolhida mudou desde a prévia. Reprepare.');
  if(previousPlan?.planId!==String(req.body.planId||'')||String(job.updated_at)!==String(req.body.updatedAt||''))
   throw Error('Plano alterado em outra sessão. Prepare novamente.');
  confirmShopeeExecution(plan,{sku,confirmation:req.body.confirmation});
  const review=await getWorkflowReview(auth.shopId,itemId,modelId);
  if(review?.sku!==sku)throw Error('Revisão da SKU mudou. Prepare novamente.');
  const reviewState=review.review_state||{};
  if((plan.selectedStage==='fiscal'||plan.finalFiscal)&&reviewState.stages?.fiscal?.reviewed&&reviewState.tax){
    const supplier=await readWeDropProduct(auth.shopId,linkedKit?
      {sku:linkedKit.mainSku}:{sku,itemId,modelId});
    fiscalMatrixSource({sku,supplier,tax:reviewState.tax,reviewSource:reviewState.matrixFiscal});
    // Protege tanto fluxo completo como exclusivamente fiscal: mesmo se
    // a revisão persistida diz 00, um plano antigo não pode carregar 2806100.
    const expectedCest=wedropCestForSku(supplier);
    const plannedTax=plan.finalFiscal||plan.proposed?.tax_info;
    if(plannedTax&&String(plannedTax.cest??'')!==expectedCest)
      throw Error('CEST antigo na prévia ('+String(plannedTax.cest||'vazio')+
        '). A WeDrop desta SKU informa '+expectedCest+
        '. Prepare uma nova prévia fiscal; nada foi enviado.');
  }
  const live=await shopeeLiveEditableItem(cfg,auth,itemId);
  const supplierForBrand=await readWeDropProduct(auth.shopId,linkedKit?
    {sku:linkedKit.mainSku}:{sku,itemId,modelId});
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
   omitFiscal:false,selectedStage:plan.selectedStage||'all',
   allowDiscountOnly:plan.discountOnly===true,
   modelVariations:plan.modelVariations?
    {...await prepareExecutionVariations({auth,cfg,sku,itemId,modelId},reviewState,live),
     promotion:plan.modelVariations.promotion}:null});
  if(fresh.fingerprint!==plan.fingerprint||!fresh.canExecute){
   // Conteúdo que a Shopee acabou de confirmar não deve invalidar a autorização
   // para os OUTROS campos idênticos da mesma prévia. Esta exceção só permite
   // uma convergência monotônica: o conjunto aprovado ENCOLHE, nunca cresce.
   if(!approvedShopeeReadbackConvergence(plan,fresh,live))
    throw Error('A prévia tem alterações novas ou divergentes. Atualize a prévia antes de executar.');
  }
  if(remainingOnly){
   // Só trocar o plano após TODAS as validações, sem duplicar alterações.
   job=await saveShopeePreparedExecution(auth.shopId,itemId,modelId,sku,plan);
  }
  await claimShopeePreparedExecution(auth.shopId,itemId,modelId,{
   planId:plan.planId,updatedAt:job.updated_at,runId:crypto.randomUUID(),commercialDiscount});
  // Only this explicit authenticated action starts the durable runner.
  res.status(202).json({ok:true,status:'running',marketplaceUpdated:false,
   mode:remainingOnly?'remaining':'standard',
   message:remainingOnly?'Iniciando SOMENTE variações, fiscal e desconto, sem alterar imagens, vídeo, título, descrição nem ficha técnica.':
    'Execução iniciada. Acompanhe as etapas; você pode sair e voltar para esta SKU.'});
  void runOptimizerJobs();
 }catch(e){
   // Um 409 não pode desaparecer atrás de uma barra otimista de 69%.
   // Log mínimo: nunca registrar tokens, headers, orçamento ou requisição bruta.
   console.warn('[shopee-execution-start-rejected]',JSON.stringify({
    sku:String(req.body?.sku||'').slice(0,36),
    itemId:String(req.body?.itemId||'').slice(0,24),
    reason:String(e.message||e).slice(0,280)}));
   res.status(409).json({ok:false,error:String(e.message||e).slice(0,280)});
 }
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
  const phase=String(job.result?.phase||'');
  const fiscalPhase=/^fiscal_|^verified_partial$/.test(phase);
  const discountPhase=/^discount_/.test(phase);
  const modelPhase=/^variation_|^model_discount_/.test(phase);
  const verified=discountPhase||modelPhase?false:fiscalPhase?
    verifyShopeeFiscalExecution(job.plan,live,job.result||{}):
    verifyShopeeExecution(job.plan,live,job.result||{});
  let updated=job,recoveryReady=false,recoveryDetails=null,modelPending='';
  if(modelPhase){
   const outcome=await reconcileShopeeModelExecution(job,{
    variationRead:()=>shopeeLiveVariationState(cfg,auth,itemId,live),
    variationCost:supplierSku=>shopeePricingDirectSupplierCost(auth.shopId,supplierSku),
    variationPromotionRead:async(discountId,targetItemId)=>{
     const d=await readDiscountPages(callShopeeShopApi,{cfg,auth,discountId});
     const member=promotionMember(d.pages,targetItemId);
     return {status:String(d.record?.status||'').toLowerCase(),member,action:member?'update':'add'};
    }
   });
   if(outcome.state==='uncertain')modelPending=outcome.lastError;
   else{
    updated=await reconcileShopeeJob(job,outcome);
    if(outcome.state==='running')void runOptimizerJobs();
   }
  }
  else if(discountPhase&&job.plan?.commercialDiscount){
   const approved=job.plan.commercialDiscount.snapshot;
   const snap=(await discountExecutionInputs(req,sku,itemId,modelId,approved.discountId,{allowOver25:approved.allowOver25===true})).snapshot;
   if(snap.action==='already'&&Math.abs(Number(snap.originalPrice)-Number(approved.gross))<0.011&&
      Math.abs(Number(snap.promo)-Number(approved.promo))<0.011){
    updated=await reconcileShopeeJob(job,{state:'verified',
     result:withExecutionEvent({...job.result,phase:'verified',verified:true,
       discount:{status:'verified'}},'discount-verified','Promoção confirmada pela Shopee.','success'),lastError:null});
   }
  }
  else if(verified){
    await rememberPublishedVideo(job.plan,job.result||{});
    await rememberPublishedImages(job.plan,job.result||{});
    const next=nextShopeePhaseAfterReadback(job.plan,{fiscalVerified:fiscalPhase});
    updated=await reconcileShopeeJob(job,{state:next==='verified'?'verified':'running',
     result:withExecutionEvent({...job.result,phase:next,primaryVerified:true,
       ...(fiscalPhase?{fiscal:{status:'verified'}}:{})},
       next==='verified'?'verified':'resume-readback',
       next==='verified'?'Alterações confirmadas.':
        'Confirmação obtida; continuando somente as etapas ainda não executadas.','success'),
     lastError:null});
    if(next!=='verified')void runOptimizerJobs();
  }
  else if(!fiscalPhase&&req.body.safeRecover===true&&detectShopeeExecutionIssue(job.last_error,job.plan)?.code==='CEST_REQUIRED'){
    // Reconcile a known field-level rejection without retrying any marketplace write.
    // Only release the old uncertain job after readback confirms that the listing
    // still matches its pre-execution baseline (images, video, attributes, tax).
    assertLiveShopeeUnchanged(job.plan,live);
    updated=await reconcileShopeeJob(job,{state:'failed',
      result:withExecutionEvent({...job.result,phase:'retry_allowed'},
        'cest-confirmed-rejection','CEST pendente: a Shopee rejeitou a edição; o anúncio foi conferido sem reenvio.','warning'),
      lastError:job.last_error});
  }
  else if(!fiscalPhase&&!discountPhase&&(req.body.recover===true||req.body.reprepare===true)){
    // Conferência e liberação são SOMENTE leituras. O write antigo nunca é repetido.
    // Duas observações Shopee após a janela de propagação permitem preparar
    // uma nova prévia baseada no anúncio atual, mesmo parcialmente atualizado.
    if(req.body.reprepare===true&&req.body.confirmation!=='REPREPARAR '+sku)
     throw Error('Confirme REPREPARAR '+sku+'.');
    await new Promise(resolve=>setTimeout(resolve,1600));
    const confirmedAgain=await shopeeLiveEditableItem(cfg,auth,itemId);
    recoveryDetails=assessShopeeStableCommercialRecovery(job,live,confirmedAgain);
    const notes=recoveryDetails.pending;
    const nextResult=withExecutionEvent({...job.result,phase:'retry_allowed',
      recovery:{...recoveryDetails,kind:'stable_readback_no_write'}},
      'stable-recovery','Shopee consultada duas vezes. Nova prévia liberada sem reenviar a atualização anterior.','success');
    updated=await reconcileShopeeJob(job,{state:'failed',result:nextResult,
      lastError:notes.length?'Nova prévia necessária: '+notes.join('; ').slice(0,175):
        'Leitura estável. Refazer prévia apenas para o que estiver pendente.'});
    recoveryReady=true;
  }
  else if(req.body.reprepare===true){
    if(fiscalPhase)throw Error('Parte comercial já executada. O resultado fiscal precisa de conferência antes de outra tentativa.');
    if(req.body.confirmation!=='REPREPARAR '+sku)throw Error('Confirme REPREPARAR '+sku+'.');
    if(Date.now()-Date.parse(job.updated_at)<90000)throw Error('Aguarde 90 segundos para a Shopee consolidar a atualização.');
    assertLiveShopeeUnchanged(job.plan,live);
    updated=await reconcileShopeeJob(job,{state:'failed',result:{...job.result,phase:'retry_allowed'},
      lastError:'Leitura confirmou os valores anteriores. Uma nova prévia e aprovação são necessárias.'});
  }
  const pending=updated.state==='uncertain'?(modelPhase?[modelPending||'Variações aguardando confirmação individual.']:
   shopeeExecutionUnconfirmedFields(job.plan,live,job.result||{})):[];
  res.json({ok:true,job:updated,recoveryReady,recoveryDetails,progress:shopeeExecutionProgress(updated),
    issue:detectShopeeExecutionIssue(updated.last_error,updated.plan),
    pendingChecks:pending,verified:updated.state==='verified',
    message:updated.state==='verified'?'Todas as alterações confirmadas.':
      updated.state==='running'?'Leitura confirmada; prosseguindo com as próximas etapas.':
      recoveryReady?'Execução antiga liberada com duas leituras estáveis. Gere nova prévia apenas das alterações pendentes. Nenhum envio foi repetido.':
      'Ainda não confirmado: '+pending.join('; ')+'. Nenhuma alteração foi reenviada.'});
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
      update:body=>callShopeeShopApi(cfg,{...common,path:'/api/v2/product/update_item',method:'POST',body}),
      // Fases duráveis por variação: biblioteca de mídia, UMA criação de
      // modelos, leitura por modelo, NCM, preço e campanha como etapas distintas.
      variationRead:()=>shopeeLiveVariationState(cfg,auth,job.item_id),
      variationImage:async asset=>{
       const file=await variationImageBytes(asset);
       return createShopeeMediaApi(cfg,auth).image(file,asset.mime);
      },
      variationPublish:body=>callShopeeShopApi(cfg,{
       ...common,path:'/api/v2/product/init_tier_variation',method:'POST',body
      }),
      variationLink:async(plan,models)=>{
       for(let i=0;i<plan.modelVariations.options.length;i++){
        const option=plan.modelVariations.options[i];
        const fromWeDrop=await shopeePricingDirectSupplierCost(auth.shopId,option.supplierSku);
        if(!fromWeDrop||Math.round(fromWeDrop.unitCost*100)!==Math.round(option.cost*100))
         throw Error('Custo WeDrop mudou para '+option.name+'.');
        await upsertWeDropSkuLink(auth.shopId,{itemId:plan.itemId,
         modelId:models[i].model_id,shopeeSku:option.sku,supplierSku:option.supplierSku});
       }
      },
      variationCost:sku=>shopeePricingDirectSupplierCost(auth.shopId,sku),
      variationUpdatePrices:(models)=>callShopeeShopApi(cfg,{
       ...common,path:'/api/v2/product/update_price',method:'POST',
       body:{item_id:Number(job.item_id),price_list:models.map(m=>({
        model_id:Number(m.modelId),original_price:Number(m.gross)}))}
      }),
      variationPromotionRead:async(discountId,itemId)=>{
       const d=await readDiscountPages(callShopeeShopApi,{cfg,auth,discountId});
       const member=promotionMember(d.pages,itemId);
       return {status:String(d.record?.status||'').toLowerCase(),member,action:member?'update':'add'};
      },
      variationDiscountPublish:async(approved,models,action)=>{
       const key=[auth.shopId,job.item_id,approved.discountId].join(':');
       if(activeDiscountWrites.has(key))throw Error('Promoção já em execução.');
       activeDiscountWrites.add(key);
       try{
        const out=await callShopeeShopApi(cfg,{
         ...common,path:action==='add'?'/api/v2/discount/add_discount_item':
          '/api/v2/discount/update_discount_item',method:'POST',
         body:{discount_id:Number(approved.discountId),item_list:[{
          item_id:Number(job.item_id),...(action==='add'?{purchase_limit:0}:{}),
          model_list:models.map(m=>({model_id:Number(m.modelId),model_promotion_price:m.promo}))
         }]}
        });
        const errors=out.response?.error_list||[];
        if(errors.length)throw Error('Shopee recusou a promoção: '+
         String(errors[0].fail_message||errors[0].fail_error||'erro desconhecido'));
        return out;
       }finally{activeDiscountWrites.delete(key);}
      },
      discountRead:async approved=>(await discountExecutionInputs(null,
       approved.sku,approved.itemId,approved.modelId,approved.discountId,{allowOver25:approved.allowOver25===true})).snapshot,
      discountUpdatePrice:async approved=>{
       const {auth:a,cfg:c}=await getValidAuth();
       return callShopeeShopApi(c,{path:'/api/v2/product/update_price',method:'POST',
        accessToken:a.accessToken,shopId:a.shopId,
        body:{item_id:Number(approved.itemId),price_list:[{original_price:approved.gross}]}});
      },
      discountPublish:async(approved,live)=>{
       const {auth:a,cfg:c}=await getValidAuth();
       const key=[approved.shopId,approved.itemId,approved.discountId].join(':');
       if(activeDiscountWrites.has(key))throw Error('A promoção já está sendo atualizada em outro processo.');
       activeDiscountWrites.add(key);
       try{
        const action=live.action;
        const x=await callShopeeShopApi(c,{
         path:action==='add'?'/api/v2/discount/add_discount_item':'/api/v2/discount/update_discount_item',
         method:'POST',accessToken:a.accessToken,shopId:a.shopId,
         body:{discount_id:Number(approved.discountId),item_list:[{item_id:Number(approved.itemId),
           item_promotion_price:approved.promo,...(action==='add'?{purchase_limit:0}:{})}]}
        });
        const err=x.response?.error_list||[];
        if(err.length)throw Error('Shopee rejeitou o desconto: '+String(err[0].fail_message||err[0].fail_error||'erro da promoção').slice(0,150));
        if(action==='add'&&Number(x.response?.count)!==1)throw Error('A inclusão da SKU ainda não foi confirmada.');
        return x;
       }finally{activeDiscountWrites.delete(key);}
      }
    });
    if(out.state==='running'){
      await checkpointShopeeExecution(job,out.result,out.delay);
      // Ao concluir uma parte/imagem, acionar o próximo checkpoint na data
      // de liberação da lease, sem aguardar o tick genérico de 4 segundos.
      // O CAS no Supabase evita execução simultânea/dobrada no Render.
      setTimeout(()=>void runOptimizerJobs(),
       Math.max(500,Math.min(15000,Number(out.delay)||1000))).unref();
    }else {
      if(out.state==='verified'){
        await rememberPublishedVideo(job.plan,out.result);
        await rememberPublishedImages(job.plan,out.result);
      }
      await finishShopeeExecution(job.shop_id,job.item_id,job.model_id,job.run_id,out);
    }
   }catch(e){
    const current=await readShopeeExecution(job.shop_id,job.item_id,job.model_id);
    if(current?.run_id!==job.run_id||current.state!=='running')continue;
    // Uma falha após a escrita fiscal pode ter sido aceita pela Shopee.
    // NUNCA reenviar automaticamente; consultar o resultado antes de qualquer retry.
    const uncertain=['updating','verifying','fiscal_updating','fiscal_verifying',
      'variation_updating','variation_verifying',
      'model_discount_price_updating','model_discount_price_verifying',
      'model_discount_updating','model_discount_verifying',
      'discount_price_updating','discount_price_verifying','discount_updating','discount_verifying']
      .includes(current.result?.phase);
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
 const [matches,supplier]=await Promise.all([
  findExactCatalogSku(info.shopId,info.sku),
  readWeDropProduct(info.shopId,{sku:info.sku,itemId:info.itemId,modelId:info.modelId})
   .catch(()=>null)
 ]);
 const shopeeTitle=marktProTitle(req,info,matches);
 // A busca do produto do vídeo deve começar pelo título exato do catálogo
 // WeDrop, quando houver vínculo inequívoco. SEO da Shopee pode ser longo
 // ou ter palavras promocionais que atrapalham a correspondência.
 const data=supplier?.product_data||{};
 const name=String(data.name||data.title||'').trim().slice(0,250);
 const title=name||shopeeTitle;
 const color=String(data.color||'').trim().slice(0,60);
 const product={product:title,color};
 let results=await ShopeeMarktPro.search(product);
 if(!results.candidates.length&&name&&name.toLocaleLowerCase('pt-BR')!==shopeeTitle.toLocaleLowerCase('pt-BR')){
  const second=await ShopeeMarktPro.search(shopeeTitle);
  if(second.candidates.length)results=second;
 }
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
   diagnostic:results.diagnostic,
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
// Variações com fotografia por opção: persistência privada antes da publicação.
const activeVariationOps=new Set(),consumedVariationApprovals=new Set();
function variationSigned(state,secret){
 const encoded=Buffer.from(JSON.stringify(state)).toString('base64url');
 return encoded+'.'+crypto.createHmac('sha256',secret).update(encoded).digest('base64url');
}
function variationVerify(token,secret,shopId){
 const [encoded,mac,extra]=String(token||'').split('.');
 if(!encoded||!mac||extra||encoded.length>4000)throw Error('Prévia de variação inválida.');
 const expect=crypto.createHmac('sha256',secret).update(encoded).digest('base64url');
 const a=Buffer.from(mac),b=Buffer.from(expect);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw Error('Assinatura de variação inválida.');
 let state;try{state=JSON.parse(Buffer.from(encoded,'base64url').toString());}catch{throw Error('Prévia de variação inválida.');}
 if(String(state.shopId)!==String(shopId)||!Number.isFinite(state.at)||
  Date.now()-state.at>300000||state.at>Date.now()+30000||!state.nonce)
  throw Error('Prévia de variação expirada ou pertencente a outra loja.');
 return state;
}
async function variationContext(req){
 const ctx=await checkedWorkflowAudit(req);
 const entry=await getWorkflowReview(ctx.auth.shopId,ctx.itemId,ctx.modelId);
 if(entry&&entry.sku!==ctx.sku)throw Error('SKU mudou desde a última revisão.');
 return {...ctx,details:entry?.review_state?.variationDetails||null,review:entry?.review_state||{}};
}
function variantAssetBelongsTo(asset,auth,itemId,modelId){
 const prefix=[auth.shopId,itemId,Number(modelId)||0,'variations'].join('/')+'/';
 return asset?.storagePath?.startsWith(prefix)===true;
}
function mergeVariationDetails(input,current,ctx){
 const requested=validateVariationDetails(input);
 const prior=new Map((current?.type===requested.type?current.options:[]||[])
  .map(o=>[o.name.toLocaleLowerCase('pt-BR'),o]));
 const options=requested.options.map(o=>{
  const saved=prior.get(o.name.toLocaleLowerCase('pt-BR'));
  return {...o,asset:saved?.asset&&variantAssetBelongsTo(saved.asset,ctx.auth,ctx.itemId,ctx.modelId)?
   saved.asset:null,photoConfirmed:saved?.asset?o.photoConfirmed:false};
 });
 return {type:requested.type,options,updatedAt:new Date().toISOString()};
}
app.get('/api/shopee/optimizer/variants/draft',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const x=await variationContext(req);
  const draft=x.details||{type:'',options:[]};
  const options=await Promise.all((draft.options||[]).map(async o=>({...o,
   previewUrl:o.asset?await variationImagePreview(o.asset):null})));
  // EAN do fornecedor pertence ao SKU físico; não herdar para cores novas.
  let supplierEan=null;
  try{
   const supplier=await readWeDropProduct(x.auth.shopId,{sku:x.sku,itemId:x.itemId,modelId:x.modelId});
   const facts=supplier?.product_data||{};
   const candidates=[facts.ean,facts.EAN,facts.gtin,facts.GTIN,facts.barcode,facts.codigo_barras,facts.codigoDeBarras];
   supplierEan=candidates.map(v=>String(v??'').trim()).find(v=>/^\d{8,14}$/.test(v))||null;
  }catch{ /* mantém edição manual se fornecedor indisponível */ }
  let suggestedPrice=null,liveHasModel=null,modelSkus=[];
  try{
   const live=await shopeeLiveEditableItem(x.cfg,x.auth,x.itemId);
   liveHasModel=live.has_model===true;
   const priceRows=Array.isArray(live.price_info)?live.price_info:[live.price_info||{}];
   const candidates=[...priceRows.map(p=>p?.original_price),live.original_price,live.price];
   suggestedPrice=candidates.map(Number).find(p=>Number.isFinite(p)&&p>0)||null;
   if(liveHasModel){
    const models=await callShopeeShopApi(x.cfg,{path:'/api/v2/product/get_model_list',
      accessToken:x.auth.accessToken,shopId:x.auth.shopId,query:{item_id:Number(x.itemId)}});
    modelSkus=(models.response?.model||[]).map(m=>String(m.model_sku||'')).filter(Boolean);
   }
  }catch{ /* não inventar informações se a Shopee não responder */ }
  const expected=(draft.options||[]).map(o=>o.sku);
  const allModelsConfirmed=liveHasModel===true&&expected.length>=2&&
    expected.every(sku=>modelSkus.includes(sku));
  // Prévia financeira por SKU física: a mesma barra da precificação do anúncio-pai.
  // Somente leitura; nenhuma alteração na Shopee. Nunca inventar custo ausente.
  const parentPlan=await savedShopeePricePlan(x.auth.shopId,x.itemId,x.modelId).catch(()=>null);
  const preferences=await shopeePricingPreferences(x.auth.shopId);
  const parentQuote=parentPlan?.quote;
  const variantSettings=normalizeShopeePricingSettings({...preferences,
   marginPct:Number(parentQuote?.targetMarginPct??preferences.marginPct),
   minMarginPct:Math.max(8,Number(parentQuote?.minMarginPct??preferences.minMarginPct??8)),
   discountPct:Number(parentQuote?.discountPct??preferences.discountPct),
   couponPct:Number(parentQuote?.couponPct??preferences.couponPct)});
  const prices=await Promise.all(options.map(async option=>{
   const supplierSku=String(option.supplierSku||'').trim();
   if(!supplierSku)return {name:option.name,status:'missing_sku'};
   try{
    const source=await shopeePricingDirectSupplierCost(x.auth.shopId,supplierSku);
    if(!source||Number(source.unitCost)<=0)return {name:option.name,status:'missing_cost'};
    const quote=quoteShopeePrice({unitCost:Number(source.unitCost),
     settings:variantSettings,marginOverride:true});
    return {name:option.name,supplierSku,status:'calculated',cost:Number(source.unitCost),
     gross:quote.grossPrice,promo:quote.marketplaceDisplayPrice,
     checkout:quote.buyerAfterCoupon,profit:quote.netProfit,margin:quote.netMarginPct,
     discountPct:quote.discountPct,marginTarget:variantSettings.marginPct};
   }catch(error){return {name:option.name,status:'blocked',
    message:String(error.message||error).slice(0,180)};}
  }));
  res.json({ok:true,sku:x.sku,supplierEan,eanSource:supplierEan?'WeDrop':null,suggestedPrice,
   priceSource:suggestedPrice?'Shopee API':null,liveHasModel,modelSkus,allModelsConfirmed,
   details:{...draft,options},variantPriceQuotes:prices,marketplaceUpdated:false});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,300)});}
});
app.post('/api/shopee/optimizer/variants/draft',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const x=await variationContext(req);
  const details=mergeVariationDetails(req.body.details,x.details,x);
  await saveWorkflowReview(x.auth.shopId,x.itemId,x.modelId,x.sku,
   {stage:'variants',reviewed:false,variationDetails:details,
    variationConfig:{enabled:true,type:details.type,values:details.options.map(o=>o.name)}});
  res.json({ok:true,saved:true,details,marketplaceUpdated:false});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,330)});}
});
app.post('/api/shopee/optimizer/variants/photo',mustLogin,requireWeDropAdmin,
 express.raw({type:['image/png','image/jpeg'],limit:MAX_IMAGE_BYTES}),async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const x=await variationContext(req);
  const value=validateVariationName(req.query.option);
  const target=x.details?.options?.find(o=>o.name.toLocaleLowerCase('pt-BR')===value.toLocaleLowerCase('pt-BR'));
  if(!target)throw Error('Salve primeiro a opção da variação.');
  const job=await readShopeeExecution(x.auth.shopId,x.itemId,x.modelId);
  // Salvar imagem no rascunho não modifica a Shopee. Uma execução ANTIGA
  // com resultado incerto não deve bloquear o preparo de fotos de variação.
  if(job?.state==='running')throw Error('Execução em andamento; aguarde confirmação.');
  const asset=await saveVariationImage({shopId:x.auth.shopId,itemId:x.itemId,modelId:x.modelId,
   file:req.body,mime:String(req.get('content-type')||'').split(';')[0]});
  const details={...x.details,options:x.details.options.map(o=>o.name===target.name?
   {...o,asset,photoConfirmed:false}:o)};
  await saveWorkflowReview(x.auth.shopId,x.itemId,x.modelId,x.sku,
   {stage:'variants',reviewed:false,variationDetails:details});
  res.status(201).json({ok:true,asset,previewUrl:await variationImagePreview(asset),
   requiresConfirmation:true,marketplaceUpdated:false});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,350)});}
});
app.post('/api/shopee/optimizer/variants/generate',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 let lock='';
 try{
  const x=await variationContext(req),value=validateVariationName(req.body?.option);
  const target=x.details?.options?.find(o=>o.name.toLocaleLowerCase('pt-BR')===value.toLocaleLowerCase('pt-BR'));
  if(!target)throw Error('Salve primeiro a opção.');
  lock=[x.auth.shopId,x.itemId,x.modelId].join(':');
  if(activeVariationOps.has(lock))return res.status(409).json({error:'Outra foto de variação está sendo gerada.'});
  activeVariationOps.add(lock);
  const key=await openAiApiKey(x.auth.shopId);
  if(!key)throw Error('Conecte a API OpenAI no Gerador de imagens.');
  if(!x.record.imageUrls?.length)throw Error('Produto sem foto original; use o envio manual da foto.');
  const picture=await generateOpenAiImage({record:x.record,slot:1,apiKey:key,
   referenceUrls:x.record.imageUrls,
   overridePrompt:variationImagePrompt(x.record,x.details.type,target.name)});
  const asset=await saveVariationImage({shopId:x.auth.shopId,itemId:x.itemId,modelId:x.modelId,
   file:picture.file,mime:picture.mime});
  // Releia: não sobrescrever edições feitas enquanto a geração ocorria.
  const latest=await variationContext(req);
  if(!latest.details?.options?.some(o=>o.name===target.name&&latest.details.type===x.details.type))
   throw Error('As opções da SKU mudaram. A foto não foi associada a uma opção diferente.');
  const details={...latest.details,options:latest.details.options.map(o=>o.name===target.name?
   {...o,asset,photoConfirmed:false}:o)};
  await saveWorkflowReview(x.auth.shopId,x.itemId,x.modelId,x.sku,
   {stage:'variants',reviewed:false,variationDetails:details});
  res.status(201).json({ok:true,asset,previewUrl:await variationImagePreview(asset),
   generated:true,requiresReview:true,marketplaceUpdated:false});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,350)});}
 finally{if(lock)activeVariationOps.delete(lock);}
});
// Vínculo genérico por opção/SKU/EAN físico, independente do título comercial.
async function verifiedVariationSupplierCosts(x,details){
 const parent=await readWeDropProduct(x.auth.shopId,{sku:x.sku,itemId:x.itemId,modelId:x.modelId});
 const original=details.options.find(o=>String(o.supplierSku)===String(x.sku));
 const used=new Set(),rows=[];
 for(const option of details.options){
  const supplierSku=String(option.supplierSku||'').trim();
  if(!supplierSku)throw Error('Informe o SKU WeDrop da opção '+option.name+'.');
  if(used.has(supplierSku))throw Error('Cada variação deve corresponder a um SKU WeDrop distinto.');
  used.add(supplierSku);
  const [supplier,cost]=await Promise.all([
   readWeDropProduct(x.auth.shopId,{sku:supplierSku,itemId:x.itemId,modelId:x.modelId}),
   shopeePricingDirectSupplierCost(x.auth.shopId,supplierSku)
  ]);
  const facts=supplier?.product_data||{};
  const supplierEan=[
   facts.ean,facts.EAN,facts.gtin,facts.GTIN,facts.barcode,
   facts.codigo_barras,facts.codigoDeBarras
  ].map(v=>String(v??'').trim()).find(v=>/^[0-9]{8,14}$/.test(v))||'';
  const identity=variationSupplierIdentity({
   parentName:parent?.product_data?.name,supplierName:facts.name,
   originalOption:original?.name,optionName:option.name,
   expectedEan:option.gtin,sourceEan:supplierEan,reviewed:details.reviewed===true
  });
  if(!cost||!supplier||supplier.supplier_sku!==supplierSku||!identity.ok)
   throw Error('A variação '+option.name+' não foi confirmada para o SKU WeDrop '+
    supplierSku+': '+(identity.reason||'custo ou identidade indisponíveis')+'.');
  rows.push({name:option.name,sku:option.sku,supplierSku,unitCost:cost.unitCost,
   importedAt:cost.costUpdatedAt});
 }
 return rows;
}
app.post('/api/shopee/optimizer/variants/preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const x=await variationContext(req);
  if(!x.details)throw Error('Salve o rascunho das opções.');
  const data=validateVariationDetails(x.details,{requirePhotos:true,
   approvedReview:x.review?.stages?.variants});
  const suppliers=await verifiedVariationSupplierCosts(x,{...data,
   reviewed:variationEvidenceApproved(x.details,x.review)});
  if(data.options.length<2)throw Error('Para criar variações sem apagar a opção original, informe também a cor/modelo original e a nova opção (mínimo duas).');
  if(!data.options.every(o=>variantAssetBelongsTo(o.asset,x.auth,x.itemId,x.modelId)))
   throw Error('Alguma foto não pertence a este anúncio.');
  const live=await shopeeLiveEditableItem(x.cfg,x.auth,x.itemId);
  if(live.has_model||x.record.hasModel)throw Error('Este anúncio já possui modelos. A atualização não pode sobrescrever variações existentes automaticamente.');
  if(String(live.item_status).toUpperCase()!=='NORMAL')throw Error('Anúncio não está ativo.');
  const approval=variationSigned({shopId:x.auth.shopId,itemId:x.itemId,modelId:x.modelId,
   sku:x.sku,nonce:crypto.randomUUID(),at:Date.now(),
   fingerprint:crypto.createHash('sha256').update(JSON.stringify(x.details)).digest('hex')},adsApprovalSecret());
  res.json({ok:true,approval,preview:{type:data.type,options:data.options.map(o=>({
   name:o.name,sku:o.sku,price:o.price,stock:o.stock,gtin:o.gtin||null,hasImage:true,
   supplierSku:suppliers.find(s=>s.sku===o.sku)?.supplierSku||null,
   unitCost:suppliers.find(s=>s.sku===o.sku)?.unitCost||null})),
   itemId:x.itemId,notice:'Aplicar converterá o anúncio atual para modelos de uma variação. Estoque informado deve existir realmente na WeDrop. Não reenviar em erro de rede.'},
   marketplaceUpdated:false});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,350)});}
});
app.post('/api/shopee/optimizer/variants/apply',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req)||req.body?.confirm!==true)
  return res.status(403).json({ok:false,error:'Confirmação explícita obrigatória.'});
 let key='';
 try{
  const x=await variationContext(req),token=variationVerify(req.body.approval,adsApprovalSecret(),x.auth.shopId);
  if(String(token.itemId)!==x.itemId||String(token.sku)!==x.sku||String(token.modelId)!==x.modelId)
   throw Error('Prévia não corresponde a esta SKU.');
  key=String(x.auth.shopId)+':'+x.itemId;
  if(activeVariationOps.has(key)||consumedVariationApprovals.has(token.nonce))
   throw Error('Esta variação já está em execução ou a aprovação já foi utilizada.');
  activeVariationOps.add(key);consumedVariationApprovals.add(token.nonce);
  if(!x.details||crypto.createHash('sha256').update(JSON.stringify(x.details)).digest('hex')!==token.fingerprint)
   throw Error('Dados da variação mudaram após a prévia.');
  const details=validateVariationDetails(x.details,{requirePhotos:true,
   approvedReview:x.review?.stages?.variants});
  const suppliers=await verifiedVariationSupplierCosts(x,{...details,
   reviewed:variationEvidenceApproved(x.details,x.review)});
  if(details.options.length<2)throw Error('Informe a opção original e a nova variação para preservar o produto atual.');
  if(details.options.some(o=>!variantAssetBelongsTo(o.asset,x.auth,x.itemId,x.modelId)))
   throw Error('Fotos não pertencem a esta loja.');
  const live=await shopeeLiveEditableItem(x.cfg,x.auth,x.itemId);
  if(live.has_model||x.record.hasModel)throw Error('Anúncio já possui modelos; atualização não destrutiva requer fluxo separado.');
  const ids=[];
  for(const option of details.options){
   const file=await variationImageBytes(option.asset);
   ids.push(await createShopeeMediaApi(x.cfg,x.auth).image(file,option.asset.mime));
  }
  const payload=buildVariationPayload(x.itemId,details,ids);
  // Uma única mutação de produto, sem repetição automática em timeout.
  const response=await callShopeeShopApi(x.cfg,{path:'/api/v2/product/init_tier_variation',
   method:'POST',accessToken:x.auth.accessToken,shopId:x.auth.shopId,body:payload});
  const verified=await callShopeeShopApi(x.cfg,{path:'/api/v2/product/get_model_list',
   accessToken:x.auth.accessToken,shopId:x.auth.shopId,query:{item_id:x.itemId}});
  const models=verified?.response?.model||[];
  const realSkus=new Set(models.map(m=>String(m.model_sku||'')));
  const allModelsConfirmed=details.options.length>=2&&details.options.every(o=>realSkus.has(o.sku));
  let supplierLinksConfirmed=false,supplierLinkWarning=null;
  if(allModelsConfirmed){
   try{
    for(const option of details.options){
     const model=models.find(m=>String(m.model_sku)===option.sku);
     const cost=suppliers.find(a=>a.sku===option.sku);
     if(!Number.isSafeInteger(Number(model?.model_id))||Number(model.model_id)<=0||!cost)
      throw Error('Modelo ou fornecedor não identificado no resultado da Shopee.');
     await upsertWeDropSkuLink(x.auth.shopId,{itemId:x.itemId,modelId:model.model_id,
      shopeeSku:option.sku,supplierSku:cost.supplierSku});
    }
    supplierLinksConfirmed=true;
   }catch(error){supplierLinkWarning='Os modelos estão na Shopee, mas o vínculo WeDrop ainda precisa ser conferido: '+error.message;}
  }
  res.json({ok:true,marketplaceUpdated:allModelsConfirmed,modelsConfirmed:models.length,
   allModelsConfirmed,supplierLinksConfirmed,supplierLinkWarning,
   message:allModelsConfirmed?
    'Variações confirmadas na Shopee: '+details.options.map(o=>o.name).join(' / ')+'.':
    'A Shopee recebeu a solicitação, mas ainda não confirmou todos os modelos. Consulte o anúncio; não repita o envio.'});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,360),
  warning:'Se houve timeout após envio, consulte a Shopee antes de tentar outra vez.'});}
 finally{if(key)activeVariationOps.delete(key);}
});

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
  const selected=existing.find(x=>Number(x.slot)===position);
  if(selected&&req.body?.replace!==true)
   return res.status(409).json({error:'A posição já possui imagem. Use Refazer para autorizar a substituição.'});
  const editCurrent=req.body?.editCurrent===true;
  if(editCurrent&&!selected)throw Error('Para ajustar uma foto existente, selecione uma posição com imagem preparada.');
  const referenceImages=editCurrent?[{file:await downloadPreparedImage(selected),mime:selected.mime_type}]:[];
  const [settings,stored]=await Promise.all([
   optimizerSettings(auth.shopId),getWorkflowReview(auth.shopId,itemId,modelId)
  ]);
  const review=stored?.sku===sku?stored.review_state||{}:{};
  const references=(record.imageUrls||[]).slice(0,2);
  if(!references.length&&!referenceImages.length)throw Error('Sem fotografia de referência disponível nesta SKU.');
  // Aproveitar informações do fornecedor apenas como dados auxiliares.
  // Falhas de leitura complementar não devem impedir a geração de imagens.
  const [supplierEvidenceResult,supplierCatalogResult]=await Promise.allSettled([
   readShopeeSourceEvidence(auth.shopId,itemId,modelId,sku),
   readWeDropProduct(auth.shopId,{sku,itemId,modelId})
  ]);
  const supplierSourceText=supplierEvidenceResult.status==='fulfilled'
   ?String(supplierEvidenceResult.value.sourceText||''):'';
  const product=supplierCatalogResult.status==='fulfilled'?supplierCatalogResult.value?.product_data||{}:{};
  const supplierCatalogInfo=[product.name,product.brand,product.description||product.details]
   .filter(x=>typeof x==='string'&&x.trim()).join('\n').slice(0,1700);
  const output=await generateOpenAiImage({
   record,slot:position,referenceUrls:references,referenceImages,apiKey,
   masterPrompt:settings.image_prompt||'',note:review.imageNotes?.[position]||'',
   supplierSourceText,supplierCatalogInfo
  });
  if(editCurrent){
   const latest=await readPreparedImages(auth.shopId,itemId,modelId,sku);
   if(latest.find(x=>Number(x.slot)===position)?.sha256!==selected.sha256)
    return res.status(409).json({error:'A imagem mudou durante o ajuste. Atualize a galeria antes de gerar novamente.'});
  }
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
// Referência PRIVADA da posição selecionada para edição no ChatGPT.
// Só pode ser lida pelo vendedor autenticado e pela SKU exata; sem link público.
app.get('/api/shopee/optimizer/images/reference',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const x=await checkedManualVideoIdentity(req);
  const slot=Number(req.query.slot);
  if(!Number.isInteger(slot)||slot<1||slot>9)return res.status(400).json({error:'Posição de imagem inválida.'});
  const images=await readPreparedImages(x.shopId,x.itemId,x.modelId,x.sku);
  const selected=images.find(row=>Number(row.slot)===slot);
  if(!selected)return res.status(404).json({error:'Esta posição ainda não tem imagem comercial preparada.'});
  const file=await downloadPreparedImage(selected);
  res.setHeader('Content-Type',selected.mime_type==='image/jpeg'?'image/jpeg':'image/png');
  res.setHeader('Content-Length',String(file.length));
  res.setHeader('X-Image-SHA256',selected.sha256);
  res.status(200).end(file);
 }catch(e){res.status(400).json({error:String(e.message||e).slice(0,230)});}
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

// Reorganização da galeria comercial: só altera a posição privada, nunca a Shopee.
app.post('/api/shopee/optimizer/images/reorder',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const x=await checkedManualVideoIdentity(req);
  const from=Number(req.body?.fromSlot),to=Number(req.body?.toSlot);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||from>9||to<1||to>9||from===to)
   return res.status(400).json({error:'Escolha duas posições diferentes de 1 a 9.'});
  const lock=[x.shopId,x.itemId,x.modelId,x.sku].join(':');
  if(shopeeImageGenerationLocks.has(lock))
   return res.status(409).json({error:'Existe uma geração de imagem em andamento. Aguarde terminar para reorganizar.'});
  const job=await readShopeeExecution(x.shopId,x.itemId,x.modelId);
  if(['running','uncertain'].includes(job?.state))
   return res.status(409).json({error:'Há execução em andamento ou sem confirmação. Reorganize após a conferência.'});
  // A ordem aprovada não pode continuar válida após mover imagens.
  await saveWorkflowReview(x.shopId,x.itemId,x.modelId,x.sku,{stage:'images',reviewed:false});
  const result=await reorderPreparedImage(
   x.shopId,x.itemId,x.modelId,x.sku,from,to,
   req.body?.fromSha256,req.body?.toSha256??null
  );
  res.json({ok:true,...result,requiresReview:true,marketplaceUpdated:false});
 }catch(e){res.status(409).json({error:String(e.message||e).slice(0,260)});}
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
    // Preço e custo são consultas independentes. Mesmo quando a simulação
    // não encontra uma terminação segura, devolver o custo WeDrop confirmado.
    const [cost,baseSettings]=await Promise.all([
      shopeePricingDirectSupplierCost(auth.shopId,sku),
      req.body?.settings===undefined?shopeePricingPreferences(auth.shopId):
        Promise.resolve(normalizeShopeePricingSettings(req.body.settings))
    ]);
    if(!cost)return res.json({ok:true,found:false,sku,
      message:'Esta SKU ainda não possui custo WeDrop salvo. Consulte a área Fornecedor WeDrop.'});
    const settings=req.body?.marginOverride===true&&req.body.marginPct!==undefined
      ?normalizeShopeePricingSettings({...baseSettings,marginPct:req.body.marginPct}):baseSettings;
    const marketAverage=req.body?.marketAverage===undefined?null:req.body.marketAverage;
    let quote=null,pricingError=null;
    try{
      quote=quoteShopeePrice({unitCost:cost.unitCost,settings,marketAverage,
        marginOverride:req.body?.marginOverride===true});
    }catch(error){pricingError=String(error.message||error).slice(0,240);}
    res.json({ok:true,found:true,sku,supplierSku:cost.supplierSku,
      unitCost:cost.unitCost,costUpdatedAt:cost.costUpdatedAt,
      pricingError,
      quote:quote?{...quote,sku,supplierSku:cost.supplierSku,
        source:'wedrop_only',saved:false,listingVerified:false,
        notice:quote.notice+' SKU reconhecida na WeDrop; vínculo com anúncio Shopee ainda em verificação.'}:null,
      message:pricingError?'Custo WeDrop localizado; ajuste de preço pendente: '+pricingError:
        'SKU '+sku+' localizada no catálogo WeDrop. A associação com a Shopee será conferida separadamente.'});
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
    const review=await getWorkflowReview(auth.shopId,itemId,modelId);
    const kitLink=review?.review_state?.kitOptimization;
    const linkedKit=kitLink?await verifiedLinkedKitQuote(auth,kitLink):null;
    const cost=linkedKit?
      linkedKitPricingCost({saved:linkedKit.draft,link:kitLink,live:linkedKit.live,sku,itemId,modelId}):
      await shopeePricingSupplierCost(auth.shopId,{sku,itemId,modelId});
    const previous=await savedShopeePricePlan(auth.shopId,itemId,modelId);
    // O percentual de Ads só entra se o checkbox da SKU estiver marcado;
    // jamais herdar reserva de outro anúncio nem usar o valor global.
    const adsBudgetEnabled=req.body?.adsBudgetEnabled===true;
    const adsBudgetPct=adsBudgetEnabled?Number(req.body?.adsBudgetPct):0;
    if(adsBudgetEnabled&&(!Number.isFinite(adsBudgetPct)||adsBudgetPct<=0||adsBudgetPct>60))
      throw Error('Marque Ads e informe uma reserva entre 0,1% e 60% para esta SKU.');
    const settings={...sourceSettings,adsPct:adsBudgetPct,
      ...(linkedKit?{shipping:Math.max(sourceSettings.shipping,cost.shipping),
        packing:Math.max(sourceSettings.packing,cost.packing)}:{})};
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
      unitCost:cost.unitCost,settings,marketAverage:reference,
      marginOverride:req.body?.marginOverride===true
    });
    quote.marketResearch={...market,sourceType:source,
      manualMarketReference:manual!==null&&!market.verified?manual:null,
      verified:market.verified===true};
    quote.sku=sku;
    quote.itemId=itemId;
    quote.modelId=modelId;
    quote.supplierSku=cost.supplierSku;
    quote.costUpdatedAt=cost.costUpdatedAt||null;
    if(linkedKit){
      quote.source='kit_wedrop_components';
      quote.kitSku=cost.kitSku;
      quote.mainSku=cost.supplierSku;
      quote.componentSkus=cost.componentSkus;
      quote.componentCost=cost.unitCost;
      quote.kitCost=Number((cost.unitCost+settings.shipping+settings.packing).toFixed(2));
      quote.kitExtrasProtected=true;
    }
    quote.pricingSettings=settings;
    quote.adsBudgetEnabled=adsBudgetEnabled;
    quote.adsBudgetPct=adsBudgetPct;
    quote.adsBudgetSource='reserved_in_saved_price_plan';
    quote.adsActualSpent=false;
    quote.calculatedAt=new Date().toISOString();
    // O desconto base nunca deve receber etiqueta de recomendação de mercado.
    quote.discountRecommendationSource=market.verified?'researched':'base_not_researched';
    // Parâmetros globais de tarifa são salvos sem Ads; Ads é EXCLUSIVO da SKU.
    // Frete/embalagem do kit não podem contaminar a configuração global das SKUs individuais.
    if(req.body?.settings!==undefined&&!linkedKit)
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
async function discountExecutionInputs(req,sku,itemId,modelId,discountId,{allowModels=false,expectedModels=null,allowDeferredPreview=false,allowOver25=false}={}){
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
 // Motor Matriz: comparação de 2 a 5 lojas verificadas, com URLs e dados
 // atuais. Uma simulação sem duas ofertas permanece não publicável.
 const research=quote.marketResearch;
 if(research?.verified!==true||
    research.source!=='shopee_affiliate_product_offers'||
    !Number.isFinite(Date.parse(research.researchedAt))||
    Date.now()-Date.parse(research.researchedAt)>48*3600000||
    research.count<REDE_ACHADOS_MARKET_RULES.minimumOffers||
    quote.discountRecommendationSource!=='researched')
  throw Error('Desconto ainda sem pesquisa de concorrentes validada. Conecte a API de ofertas Shopee e recalcule a SKU em Precificação antes de executar.');
 // A pesquisa é VÁLIDA. Quando o PREÇO escolhIDO pelo vendedor preserva
 // margem mínima acima do piso, não confundir preço do concorrente abaixo
 // do piso com desconto do vendedor abaixo do piso.
 const marketFloor=marketFloorDiscountEligibility(quote,{allowOver25});
 if(!marketFloor.allowed)throw Error(marketFloor.message);
 const beforePublish=promotionFromQuote(quote);
 const attractiveVisiblePrice=value=>{
  const cents=Math.round(Number(value)*100)%10;
  return cents===0||cents===9;
 };
 // Revalidar sempre AMBOS os preços efetivos do plano salvo e a versão
 // da política. Não confundir a vitrine com checkout após o cupom opcional.
 if(!attractiveVisiblePrice(beforePublish.promo)||
    !attractiveVisiblePrice(beforePublish.buyerAfterCoupon))
  throw Error('Plano de desconto fora da regra 0/9: Shopee R$ '+
   beforePublish.promo.toFixed(2)+' e com cupom R$ '+
   beforePublish.buyerAfterCoupon.toFixed(2)+
   '. Recalcule a SKU na Otimização. Nenhum preço ou desconto foi enviado.');
 if(!Number.isFinite(Date.parse(quote.calculatedAt))||
    Date.now()-Date.parse(quote.calculatedAt)>7*86400000)
  throw Error('Plano de preço antigo. Recalcule na Precificação antes de executar.');
 const cost=await shopeePricingSupplierCost(auth.shopId,{sku,itemId,modelId});
 if(Math.abs(Number(cost.unitCost)-Number(quote.unitCost))>0.009)
  throw Error('O custo WeDrop foi alterado após o plano. Recalcule na Precificação antes de publicar.');
 const live=await shopeeLiveEditableItem(cfg,auth,itemId);
 if(live.item_sku&&String(live.item_sku)!==sku)
  throw Error('A SKU da Shopee mudou. Publicação cancelada.');
 // Mesmo se o vendedor mantiver a tela aberta com um plano antigo, detectar
 // o vínculo SELLER_DELETE antes de liberar uma nova promoção.
 if(String(live.item_status||'').toUpperCase()==='SELLER_DELETE'){
  const activeSku=await scanLiveNormalSku({
   sku,cached:[],getPage:args=>fetchCatalogPage(cfg,auth,callShopeeShopApi,args),
   maxPages:20
  });
  const replacement=activeSku.matches.filter(x=>String(x.itemId)!==String(itemId));
  if(replacement.length)
   throw Error('VINCULO_DESATUALIZADO: SKU '+sku+' está ativa no Item ID '+
    replacement.map(x=>x.itemId).join(', ')+
    ', mas a prévia utiliza o anúncio excluído '+itemId+
    '. O Manager precisa recarregar o anúncio ativo e recalcular o desconto; nenhum preço ou promoção foi enviado.');
 }
 // A Central do Vendedor usa a listagem de anúncios ativos. Confirmar nela
 // o item_id EXATO se get_item_base_info informar status antigo/ausente.
 const listingStatus=await verifyShopeeListingStatus({
  itemId,baseStatus:live.item_status,
  fetchNormalPage:async({offset,pageSize})=>
   callShopeeShopApi(cfg,{path:'/api/v2/product/get_item_list',
    accessToken:auth.accessToken,shopId:auth.shopId,
    query:{item_status:'NORMAL',offset,page_size:pageSize}})
 });
 let publicationState;
 try{publicationState=discountPreviewStatus(listingStatus.status,{
  allowDeferred:allowDeferredPreview
 });}
 catch(error){
  throw Error('Anúncio '+itemId+' · status da ficha '+listingStatus.baseStatus+
   ' · conferência da lista de ativos: '+(listingStatus.listConfirmed?'NORMAL':'não encontrado')+
   '. '+error.message);
 }
 if(typeof live.has_model!=='boolean')
  throw Error('Não foi possível confirmar se o anúncio possui variações. Nada foi enviado.');
 let originalPrice;
 if(live.has_model&&allowModels&&expectedModels){
  const list=approvedShopeeModels({modelVariations:expectedModels},
   await shopeeLiveVariationState(cfg,auth,itemId,live));
  if(!list)
   throw Error('Modelos diferentes das variações aprovadas. Refaça a prévia.');
  originalPrice=Number((list[0]?.price_info||[])[0]?.original_price??list[0]?.original_price);
  if(!Number.isFinite(originalPrice)||originalPrice<=0)
   throw Error('Preço do modelo original não foi confirmado na Shopee.');
 }else originalPrice=promotionBasePrice(live);
 const {record,pages}=await readDiscountPages(callShopeeShopApi,{cfg,auth,discountId});
 const existing=promotionMember(pages,itemId);
 // has_promotion é genérico: NÃO comprova inscrição em outra Minha Promoção.
 // A inclusão na campanha escolhida depende da verificação do item_list e
 // das regras validadas pela API add_discount_item da própria Shopee.
 const promoMembership=shopDiscountMembershipSignal(live,existing);
 const snapshot={...discountPlanSnapshot({shopId:auth.shopId,sku,itemId,modelId,discountId,
   quote,record,existing,originalPrice}),
   promotionSignal:promoMembership.kind,
   promotionNotice:promoMembership.warning,
   marketFloorNotice:marketFloor.message,allowOver25:allowOver25===true};
 return {auth,cfg,quote,snapshot,originalPrice,deferred:publicationState.deferred,
  liveItemStatus:publicationState.status,
  liveStatusSource:listingStatus.source,baseItemStatus:listingStatus.baseStatus,
  listingPagesChecked:listingStatus.pagesChecked};
}
// Desconto por MODELO (após init_tier_variation) — não reutiliza IDs do
// anúncio sem modelos. Custos e SKUs são conferidos individualmente na WeDrop.
// O preço bruto de cada modelo não é alterado nesta operação.
async function variationModelDiscountContext(req){
 const x=await variationContext(req);
 const discountId=String(req.body?.discountId||req.query?.discountId||'').trim();
 if(!/^\d{1,18}$/.test(discountId))throw Error('Informe o ID da campanha Minha Promoção.');
 const details=validateVariationDetails(x.details,{requirePhotos:true,
  approvedReview:x.review?.stages?.variants});
 if(details.options.length<2)throw Error('Conclua as variações antes de preparar a campanha.');
 const suppliers=await verifiedVariationSupplierCosts(x,{...details,
  reviewed:variationEvidenceApproved(x.details,x.review)});
 const live=await shopeeLiveEditableItem(x.cfg,x.auth,x.itemId);
 if(live.has_model!==true||String(live.item_status).toUpperCase()!=='NORMAL')
  throw Error('A Shopee ainda não confirmou as variações neste anúncio ativo.');
 const modelsResult=await callShopeeShopApi(x.cfg,{path:'/api/v2/product/get_model_list',
  accessToken:x.auth.accessToken,shopId:x.auth.shopId,query:{item_id:Number(x.itemId)}});
 const models=modelsResult.response?.model||[];
 if(models.length!==details.options.length)throw Error('A Shopee retornou uma quantidade de modelos diferente das opções aprovadas.');
 const plan=await savedShopeePricePlan(x.auth.shopId,x.itemId,0);
 const quote=plan?.quote;
 if(plan?.sku!==x.sku||!quote||String(quote.sku)!==x.sku||
   quote.marketResearch?.verified!==true||
   quote.marketResearch.source!=='shopee_affiliate_product_offers'||
   quote.marketResearch.count<REDE_ACHADOS_MARKET_RULES.minimumOffers||
   !Number.isFinite(Date.parse(quote.marketResearch.researchedAt))||
   Date.now()-Date.parse(quote.marketResearch.researchedAt)>48*3600000||
   quote.discountRecommendationSource!=='researched'||
   !marketFloorDiscountEligibility(quote).allowed||
   !Number.isFinite(Date.parse(quote.calculatedAt))||
   Date.now()-Date.parse(quote.calculatedAt)>7*86400000)
  throw Error('Preço e pesquisa de concorrentes precisam ser recalculados antes de publicar a promoção por variação.');
 const pricePlan=promotionFromQuote(quote);
 const checked=[];
 for(const option of details.options){
  const model=models.find(m=>String(m.model_sku||'')===option.sku);
  if(!model||!Number.isSafeInteger(Number(model.model_id))||Number(model.model_id)<=0)
   throw Error('A variação '+option.name+' não foi confirmada pelo SKU no anúncio da Shopee.');
  const source=suppliers.find(a=>a.sku===option.sku);
  let link;
  try{
   link=await shopeePricingSupplierCost(x.auth.shopId,{
    sku:option.sku,itemId:x.itemId,modelId:model.model_id});
  }catch(error){
   // Modelo e SKU WeDrop já conferidos por nome/cor/custo: reparar SOMENTE
   // o vínculo interno, sem editar preço nem anúncio na Shopee.
   if(!source||source.supplierSku!==option.supplierSku)throw error;
   await upsertWeDropSkuLink(x.auth.shopId,{
    itemId:x.itemId,modelId:model.model_id,shopeeSku:option.sku,supplierSku:source.supplierSku});
   link=await shopeePricingSupplierCost(x.auth.shopId,{
    sku:option.sku,itemId:x.itemId,modelId:model.model_id});
  }
  if(link.supplierSku!==option.supplierSku||link.supplierSku!==source?.supplierSku||
    Math.abs(link.unitCost-source.unitCost)>0.009||
    Math.abs(link.unitCost-Number(quote.unitCost))>0.009)
   throw Error('Custo WeDrop da cor '+option.name+' mudou ou não corresponde ao preço aprovado.');
  const row=(model.price_info||[])[0]||{};
  const base=Number(row.original_price??model.original_price);
  if(!Number.isFinite(base)||base<=pricePlan.promo||base>pricePlan.gross*1.35)
   throw Error('Preço base da cor '+option.name+' incompatível com a promoção. Revise a precificação.');
  checked.push({name:option.name,sku:option.sku,modelId:String(model.model_id),
   supplierSku:link.supplierSku,cost:link.unitCost,base:Number(base.toFixed(2)),promo:pricePlan.promo});
 }
 const {record,pages}=await readDiscountPages(callShopeeShopApi,
  {cfg:x.cfg,auth:x.auth,discountId});
 if(!['upcoming','ongoing'].includes(String(record.status||'').toLowerCase())||
    Number(record.end_time)<=Math.floor(Date.now()/1000))
  throw Error('Campanha não ativa ou agendada. Escolha uma Minha Promoção válida.');
 const existing=promotionMember(pages,x.itemId);
 const existingModels=existing?.model_list||[];
 const already=Boolean(existing)&&checked.every(m=>
  existingModels.some(o=>String(o.model_id)===m.modelId&&
   Math.abs(Number(o.model_promotion_price)-m.promo)<=0.011));
 const action=already?'already':existing?'update':'add';
 const snap={kind:'variation_models_discount',shopId:String(x.auth.shopId),
  sku:x.sku,itemId:String(x.itemId),discountId,quoteAt:String(quote.calculatedAt),
  unitCost:Number(quote.unitCost),discountPct:Number(quote.discountPct),
  couponPct:Number(quote.couponPct),netMarginPct:Number(quote.netMarginPct),
  minMarginPct:Number(quote.minMarginPct),action,
  models:checked.map(o=>({...o}))};
 return {...x,discountId,quote,snapshot:snap,record};
}
app.post('/api/shopee/optimizer/variants-discount/preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const data=await variationModelDiscountContext(req);
  res.json({ok:true,approvalToken:signDiscountPreview(data.snapshot,envText('SESSION_SECRET')),
   preview:data.snapshot,notice:'Valores conferidos por modelo e custo WeDrop. Nenhuma promoção foi publicada.'});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,370)});}
});
app.post('/api/shopee/optimizer/variants-discount/execute',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req)||req.body?.confirm!==true)
  return res.status(403).json({ok:false,error:'Aprovação explícita da promoção obrigatória.'});
 let key=null,attempted=false;
 try{
  const {auth}=await getValidAuth(req);
  const approved=verifyDiscountPreview(req.body.approvalToken,
   envText('SESSION_SECRET'),auth.shopId);
  if(approved.kind!=='variation_models_discount')
   throw Error('A autorização não pertence à promoção por variações.');
  // A campanha e todos os modelos precisam continuar IDÊNTICOS à prévia.
  req.body.discountId=approved.discountId;
  const fresh=await variationModelDiscountContext(req);
  const {expiresAt,nonce,...approvedValues}=approved;
  if(JSON.stringify(fresh.snapshot)!==JSON.stringify(approvedValues))
   throw Error('O preço, os modelos ou a campanha mudaram. Revise a prévia antes de aplicar.');
  key=[auth.shopId,approved.itemId,approved.discountId].join(':');
  if(activeDiscountWrites.has(key))throw Error('Essa campanha já está sendo alterada.');
  activeDiscountWrites.add(key);
  if(fresh.snapshot.action==='already')
   return res.json({ok:true,verified:true,status:'already',message:'Todos os modelos já têm o preço promocional confirmado.'});
  const payload={discount_id:Number(approved.discountId),item_list:[{
   item_id:Number(approved.itemId),purchase_limit:0,
   model_list:approved.models.map(m=>({model_id:Number(m.modelId),model_promotion_price:m.promo}))
  }]};
  // ÚNICO POST de escrita. Nunca repetir automaticamente após erro ou timeout.
  attempted=true;
  const write=await callShopeeShopApi(fresh.cfg,{
   path:approved.action==='add'?'/api/v2/discount/add_discount_item':
    '/api/v2/discount/update_discount_item',
   method:'POST',accessToken:fresh.auth.accessToken,shopId:fresh.auth.shopId,body:payload});
  const errors=write.response?.error_list||[];
  if(errors.length)throw Error('Shopee recusou a promoção: '+
    String(errors[0].fail_message||errors[0].fail_error||'erro da campanha').slice(0,170));
  const checked=await readDiscountPages(callShopeeShopApi,
   {cfg:fresh.cfg,auth:fresh.auth,discountId:approved.discountId});
  const member=promotionMember(checked.pages,approved.itemId);
  const list=member?.model_list||[];
  const verified=approved.models.every(m=>list.some(x=>String(x.model_id)===m.modelId&&
   Math.abs(Number(x.model_promotion_price)-m.promo)<=0.011));
  res.json({ok:true,verified,status:verified?'verified':'confirmation_pending',
   message:verified?'Desconto confirmado na Shopee para todas as variações.':
    'A Shopee recebeu a atualização, mas ainda não confirmou todos os modelos. Consulte antes de tentar novamente.'});
 }catch(e){
  res.status(attempted?409:400).json({ok:false,verified:false,uncertain:attempted,
   error:(attempted?'Envio sem confirmação: ':'Prévia não validada: ')+
    String(e.message||e).slice(0,260)+
    (attempted?'. Confira a campanha antes de qualquer nova tentativa.':' Nenhum desconto foi enviado.')});
 }finally{if(key)activeDiscountWrites.delete(key);}
});
app.post('/api/shopee/optimizer/discounts/preview',mustLogin,requireWeDropAdmin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!verifiedSameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
 try{
  const sku=validateSkuLookup(req.body?.sku),itemId=validItemId(req.body?.itemId);
  const modelId=String(req.body?.modelId??'0');
  const discountId=String(req.body?.discountId||'').trim();
  if(!/^\d{1,18}$/.test(discountId)||!Number.isSafeInteger(Number(discountId))||
     !/^\d{1,18}$/.test(modelId))throw Error('ID de promoção ou variação inválido.');
  // UNLIST pode ser conferido/assinalado para o fluxo completo, mas nunca
  // recebe autorização de ESCRITA. A execução pedirá prévia NORMAL atualizada.
  const data=await discountExecutionInputs(req,sku,itemId,modelId,discountId,{
   allowDeferredPreview:req.body?.allowDeferredPreview===true,
   allowOver25:req.body?.allowOver25===true
  });
  const signature=data.deferred?null:
   signDiscountPreview(data.snapshot,envText('SESSION_SECRET'));
  res.json({ok:true,readOnly:true,preview:data.snapshot,approvalToken:signature,
   deferred:data.deferred,liveItemStatus:data.liveItemStatus,
   itemId:String(itemId),baseItemStatus:data.baseItemStatus,
   liveStatusSource:data.liveStatusSource,
   listingPagesChecked:data.listingPagesChecked,
   warning:data.deferred?'Anúncio '+itemId+' · status '+data.liveItemStatus+
    ' confirmado. Desconto preparado, sem escrita até NORMAL e nova verificação da campanha.':
    'Anúncio '+itemId+' confirmado como NORMAL por '+data.liveStatusSource+
    '. Nenhum desconto ou preço foi alterado; a promoção está pronta para a conferência.'});
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
    approved.modelId,approved.discountId,{allowOver25:approved.allowOver25===true&&req.body?.allowOver25===true});
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

// Integração Ads exigida no Task Center: diagnóstico e prévia seguros.
app.get('/api/shopee/ads/seo/candidates',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {auth,cfg}=await getValidAuth(req);
  const [catalog,plans]=await Promise.all([readCatalogCache(auth.shopId),recentShopeePricePlans(auth.shopId,{limit:1000})]);
  const financialCandidates=rankAdsCandidates(catalog.items,plans,{limit:1000});
  const windows=adsSevenDayWindows(brazilAdsToday());
  let recent=null,previous=null,adsWarning=null;
  // Disponibilidade parcial de Ads nunca deve esconder o ranking de produtos e margens.
  try{
   recent=await loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,{
    start:windows.recent.start,end:windows.recent.end,allowDateFallback:true
   });
   try{
    previous=await loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,{
     start:windows.previous.start,end:windows.previous.end,allowDateFallback:true
    });
   }catch(e){adsWarning='Comparação com os sete dias anteriores indisponível: '+String(e.message||e).slice(0,180);}
  }catch(e){
   adsWarning='Dados de campanhas Ads indisponíveis: '+String(e.message||e).slice(0,180)+
    '. Verifique permissão Ads no Open Platform. A triagem financeira continua disponível.';
  }
  const intelligence=buildAdsMonitor({
   catalog:catalog.items,plans,candidates:financialCandidates,recent,previous
  });
  res.json({ok:true,mode:'read_only',scope:'Triagem de até 1000 planos de preço recentes, com monitoramento de campanhas Ads retornadas pela Shopee',
   catalogUpdatedAt:catalog.lastSavedAt||null,examinedPlans:plans.length,
   period:{recent:recent?.dates||windows.recent,previous:previous?.dates||windows.previous},
   adsAvailable:Boolean(recent),adsWarning:adsWarning||recent?.statusWarning||null,
   ...intelligence,
   warning:'Somente leitura. ROAS e orçamento sugeridos não são garantias de venda. Nenhuma campanha foi criada ou alterada.'});
 }catch(error){res.status(400).json({ok:false,error:String(error?.message||error).slice(0,260)});}
});
// Campanhas Shopee Ads com CPC MANUAL (nunca GMS/ROAS automático).
// Preparar prévia e enviar só após confirmação expressa do usuário.
const adsManualCreateUsed=new Map();
app.post('/api/shopee/ads/manual/preview',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!adsBrowserOrigin(req))return res.status(403).json({ok:false,error:'Origem não permitida.'});
 try{
  const {auth}=await getValidAuth(req);
  const [catalog,plans]=await Promise.all([readCatalogCache(auth.shopId),recentShopeePricePlans(auth.shopId,{limit:1000})]);
  const preview=manualAdsPreview(req.body,catalog.items,plans);
  const approval=manualAdsToken({shopId:String(auth.shopId),nonce:crypto.randomUUID(),
   at:Date.now(),draft:req.body,quotedPrice:preview.product.currentPrice,
   quotedUpdatedAt:preview.product.pricePlanUpdatedAt},adsApprovalSecret());
  res.json({ok:true,preview,approval,created:false});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,380),created:false});}
});
app.post('/api/shopee/ads/manual/create',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!adsBrowserOrigin(req))return res.status(403).json({ok:false,error:'Origem não permitida.'});
 if(req.body?.confirm!==true)return res.status(400).json({ok:false,error:'Confirmação expressa obrigatória.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const signed=decodeManualAdsToken(req.body.approval,adsApprovalSecret(),{shopId:auth.shopId});
  const nonce='manual-'+signed.nonce;
  if(adsManualCreateUsed.has(nonce))
   return res.status(409).json({ok:false,error:'Esta aprovação já foi usada. Confira a Shopee antes de tentar criar outra campanha.'});
  adsManualCreateUsed.set(nonce,'reserved');
  const [catalog,plans]=await Promise.all([readCatalogCache(auth.shopId),recentShopeePricePlans(auth.shopId,{limit:1000})]);
  const actualPlan=verifyManualAdsCandidate(signed.draft,catalog.items,plans);
  if(Math.abs(actualPlan.currentPrice-Number(signed.quotedPrice))>.011||
     actualPlan.pricePlanUpdatedAt!==signed.quotedUpdatedAt)
   throw Error('Preço/planilha de desconto mudou após a prévia. Confirme novamente antes de criar Ads.');
  // Conferência adicional do anúncio ao vivo: só produtos NORMAL podem receber anúncio.
  const live=await callShopeeShopApi(cfg,{path:'/api/v2/product/get_item_base_info',
   accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id_list:String(signed.draft.itemId)}});
  const info=(live?.response?.item_list||[]).find(x=>String(x.item_id)===String(signed.draft.itemId));
  if(!info||String(info.item_status||'').toUpperCase()!=='NORMAL')
   throw Error('Produto indisponível para Ads na Shopee; nenhuma campanha criada.');
  const liveSku=String(info.item_sku||'').trim();
  if(liveSku&&liveSku!==signed.draft.sku)
   throw Error('SKU do produto mudou na Shopee. Refaça a prévia antes de anunciar.');
  // Evitar campanha duplicada para um produto que já está em Ads.
  // A comparação usa o status atual, não o gasto histórico do período.
  const today=brazilAdsToday();
  const earlier=new Date(Date.parse(today+'T00:00:00Z')-7*86400000).toISOString().slice(0,10);
  const existing=await loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,{
   start:earlier,end:today,allowDateFallback:false
  });
  if(existing.statusWarning)throw Error('Status Ads não confirmado. Não é seguro criar possível duplicata.');
  if((existing.campaigns||[]).some(c=>c.statusGroup==='active'&&
   (c.itemIdList||[]).some(id=>String(id)===String(signed.draft.itemId))))
   throw Error('Este produto já participa de uma campanha ativa. Nenhuma duplicata será criada.');
  const reqApi=manualAdsPayload(signed.draft,signed.nonce);
  // Não repetir chamada POST por timeout; reference_id permite deduplicação na Shopee.
  adsManualCreateUsed.set(nonce,'sending');
  const response=await callShopeeShopApi(cfg,{...reqApi,
   accessToken:auth.accessToken,shopId:auth.shopId});
  const campaignId=response?.response?.campaign_id;
  if(!campaignId)throw Error('A Shopee não confirmou o ID da campanha criada. Verifique o painel antes de reenviar.');
  adsManualCreateUsed.set(nonce,'created');
  res.json({ok:true,created:true,campaignId:String(campaignId),biddingMethod:'manual',
   note:'Campanha criada com lances CPC manuais. ROAS é indicador de desempenho, não controle automático de lance.'});
 }catch(e){res.status(400).json({ok:false,created:false,error:String(e.message||e).slice(0,380),
  warning:'Se houve falha ou timeout após o envio, confira a Shopee antes de tentar novamente.'});}
});
// Produto escolhido manualmente + GMV Max Meta de ROAS (lances automáticos controlados pelo ROAS-alvo).
// Rotas separadas de CPC por palavras-chave: nenhuma criação sem dupla confirmação do usuário.
const adsRoasUsed=new Map();
app.post('/api/shopee/ads/product-roas/preview',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!adsBrowserOrigin(req))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
 try{
  const {auth}=await getValidAuth(req);
  const [catalog,plans]=await Promise.all([
   readCatalogCache(auth.shopId),recentShopeePricePlans(auth.shopId,{limit:1000})
  ]);
  const preview=individualRoasPreview(req.body,catalog.items,plans);
  const approval=individualRoasToken({shopId:String(auth.shopId),at:Date.now(),
   nonce:crypto.randomUUID(),draft:preview.draft},adsApprovalSecret());
  res.json({ok:true,preview,approval,created:false});
 }catch(e){res.status(400).json({ok:false,error:String(e.message||e).slice(0,380),created:false});}
});
app.post('/api/shopee/ads/product-roas/create',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!adsBrowserOrigin(req))return res.status(403).json({ok:false,error:'Origem não autorizada.'});
 if(req.body?.confirm!==true)return res.status(400).json({ok:false,error:'Confirmação expressa obrigatória.'});
 try{
  const {auth,cfg}=await getValidAuth(req);
  const signed=decodeIndividualRoasToken(req.body.approval,adsApprovalSecret(),{shopId:auth.shopId});
  const nonce='individual-roas-'+signed.nonce;
  if(adsRoasUsed.has(nonce))return res.status(409).json({ok:false,error:'Prévia já utilizada. Confira se a campanha existe antes de uma nova tentativa.'});
  adsRoasUsed.set(nonce,'reserved');
  const [catalog,plans]=await Promise.all([
   readCatalogCache(auth.shopId),recentShopeePricePlans(auth.shopId,{limit:1000})
  ]);
  individualRoasPreview(signed.draft,catalog.items,plans,{today:new Date(signed.at)});
  const live=await callShopeeShopApi(cfg,{path:'/api/v2/product/get_item_base_info',
   accessToken:auth.accessToken,shopId:auth.shopId,query:{item_id_list:String(signed.draft.itemId)}});
  const product=(live?.response?.item_list||[]).find(x=>String(x.item_id)===String(signed.draft.itemId));
  if(!product||String(product.item_status||'').toUpperCase()!=='NORMAL')
   throw Error('Produto não está ativo na Shopee. Campanha não criada.');
  const liveSku=String(product.item_sku||'').trim();
  if(liveSku&&liveSku!==signed.draft.sku)throw Error('SKU mudou na Shopee. Refaça a análise.');
  const day=brazilAdsToday(),from=new Date(Date.parse(day+'T00:00:00Z')-7*86400000).toISOString().slice(0,10);
  const existing=await loadShopeeAdsOverview(cfg,auth,callShopeeShopApi,{start:from,end:day,allowDateFallback:false});
  if(existing.statusWarning)throw Error('Status Ads não confirmado. Criação bloqueada para evitar campanha duplicada.');
  if((existing.campaigns||[]).some(c=>c.statusGroup==='active'&&
    (c.itemIdList||[]).some(id=>String(id)===String(signed.draft.itemId))))
   throw Error('Este produto já possui campanha ativa. Criação de duplicata bloqueada.');
  const request=individualRoasPayload(signed.draft,signed.nonce);
  adsRoasUsed.set(nonce,'sending');
  // APENAS UMA CHAMADA POST. Em timeout, nunca repetir automaticamente.
  const response=await callShopeeShopApi(cfg,{...request,accessToken:auth.accessToken,shopId:auth.shopId});
  const campaignId=response?.response?.campaign_id;
  if(!campaignId)throw Error('Shopee não confirmou o ID da campanha. Confira a plataforma antes de tentar de novo.');
  adsRoasUsed.set(nonce,'created');
  res.json({ok:true,created:true,campaignId:String(campaignId),
   productSelection:'manual',biddingMethod:'auto',roasTarget:signed.draft.roasTarget,
   message:'Campanha individual GMV Max Meta de ROAS criada. Lances são otimizados automaticamente pela Shopee.'});
 }catch(e){res.status(400).json({ok:false,created:false,error:String(e.message||e).slice(0,380),
  warning:'Em erro após envio, não repita sem confirmar se a campanha foi criada.'});}
});

app.get('/api/shopee/ads/gms/eligibility',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {cfg,auth}=await getValidAuth(req);
  const result=await checkGmsEligibility(cfg,auth,callShopeeShopApi);
  res.json({ok:true,...result});
 }catch(error){
  const message=String(error?.message||error).slice(0,260);
  res.status(/permission|denied|403|forbidden/i.test(message)?403:400).json({
   ok:false,error:message,creationEnabled:false,
   help:'Confira permissão Ads, autorização da loja e elegibilidade para campanhas GMS na Shopee.'
  });
 }
});
app.post('/api/shopee/ads/gms/preview',mustLogin,(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const draft=prepareGmsDraft(req.body);
  res.json({ok:true,...draft});
 }catch(error){res.status(400).json({ok:false,error:String(error?.message||error).slice(0,260)});}
});
// Nenhuma rota de criação/publicação é habilitada nesta implantação.

// Cada mutação de Ads requer prévia assinada (5 minutos) e confirmação separada.
// Nunca aplicar soluções textuais a campanhas sem aprovação explícita.
const adsActionUsed=new Map();
function adsApprovalSecret(){
 const secret=envText('ADS_APPROVAL_SECRET')||envText('SESSION_SECRET');
 if(secret.length<32)throw Error('Configure SESSION_SECRET ou ADS_APPROVAL_SECRET com 32+ caracteres no Render para liberar alterações de Ads.');
 return secret;
}
function adsBrowserOrigin(req){
 const origin=String(req.get('origin')||'');
 const expected=req.protocol+'://'+req.get('host');
 return origin===expected;
}
app.post('/api/shopee/ads/campaigns/preview',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!adsBrowserOrigin(req))return res.status(403).json({error:'Origem da sessão não autorizada para gerenciar Ads.'});
 try{
  const {cfg,auth}=await getValidAuth(req);
  const live=await liveAdsCampaign(cfg,auth,callShopeeShopApi,req.body?.campaignId);
  const preview=buildAdsPreview(req.body,live);
  const approval=signAdsApproval({shopId:String(auth.shopId),at:Date.now(),
   nonce:crypto.randomUUID(),preview},adsApprovalSecret());
  res.json({ok:true,preview,approval,requiresConfirmation:true,executed:false});
 }catch(error){res.status(400).json({ok:false,error:String(error?.message||error).slice(0,320),executed:false});}
});
app.post('/api/shopee/ads/campaigns/apply',mustLogin,async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!adsBrowserOrigin(req))return res.status(403).json({error:'Origem da sessão não autorizada para alterar Ads.'});
 if(req.body?.confirm!==true)return res.status(400).json({error:'Confirmação explícita obrigatória.'});
 try{
  const {cfg,auth}=await getValidAuth(req);
  const approval=verifyAdsApproval(req.body.approval,adsApprovalSecret(),{shopId:auth.shopId});
  const {preview,nonce}=approval;
  const prior=adsActionUsed.get(nonce);
  if(prior)return res.status(409).json({error:'Esta aprovação já foi usada; atualize as campanhas para confirmar a operação.',state:prior});
  adsActionUsed.set(nonce,'sending');
  // Reconsultar proprietário, tipo e status antes de escrever na Shopee.
  const live=await liveAdsCampaign(cfg,auth,callShopeeShopApi,preview.campaignId);
  if(live.kind!==preview.type||live.status!==preview.statusBefore)
   throw Error('Campanha mudou após a prévia. Recarregue a página antes de executar.');
  const request=adsEditRequest(preview,nonce);
  // Uma única chamada à API. Nunca repetir automaticamente em erro de rede.
  const accepted=await callShopeeShopApi(cfg,{...request,accessToken:auth.accessToken,shopId:auth.shopId});
  adsActionUsed.set(nonce,'accepted');
  let verified=null,verificationWarning=null;
  try{
   const after=await liveAdsCampaign(cfg,auth,callShopeeShopApi,preview.campaignId);
   if(preview.action==='pause')verified=after.statusGroup==='inactive';
   else if(preview.action==='resume')verified=after.statusGroup==='active';
   else verificationWarning='A Shopee aceitou a operação. Consulte o orçamento/ROAS atualizado na próxima sincronização; resposta de configurações não confirma esse campo.';
  }catch(e){verificationWarning='Enviado à Shopee, mas a releitura de confirmação não ficou disponível: '+String(e.message||e).slice(0,120);}
  res.json({ok:true,acceptedByApi:true,verified,verificationWarning,
   campaignId:preview.campaignId,action:preview.action,
   responseCampaignId:accepted?.response?.campaign_id||null,
   message:verified===true?'Alteração confirmada pelo status Shopee.':
    'Requisição aceita pela API; atualize os dados para confirmar a configuração atual.'});
 }catch(error){
  res.status(400).json({ok:false,error:String(error?.message||error).slice(0,320),
   note:'Se houve timeout na API, confira a campanha antes de tentar novamente.'});
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
    // Ligação segura pelo item_id oficial. Campanhas multiproduto não têm miniatura atribuída.
    try{
      const [catalog,plans]=await Promise.all([readCatalogCache(auth.shopId),recentShopeePricePlans(auth.shopId,{limit:1000})]);
      const byPrice=new Map(plans.map(p=>[String(p.itemId)+'|'+String(p.sku),p]));
      const items=new Map((catalog.items||[]).map(c=>[String(c.itemId),c]));
      for(const c of result.campaigns||[]){
        if(c.itemIdList?.length!==1)continue;
        const product=items.get(String(c.itemIdList[0]));
        if(!product)continue;
        c.productImage=String(product.imageUrl||'');
        c.productTitle=String(product.title||'');
        c.productSku=String(product.sku||'');
        const plan=byPrice.get(String(c.itemIdList[0])+'|'+String(product.sku||''));
        const q=plan?.quote||{},mr=q.marketResearch||{};
        const observed=Date.parse(mr.researchedAt||'');
        const fresh=mr.verified===true&&Number(mr.count)>=2&&Number(mr.count)<=5&&
          Number.isFinite(observed)&&observed<=Date.now()&&Date.now()-observed<=48*3600000;
        const price=Number(q.customerPrice),ref=Number(mr.reference);
        if(fresh&&price>0&&ref>0){
         c.priceEvidence={price,marketAverage:ref,compared:Number(mr.count),
          differencePct:Math.round((price/ref-1)*1000)/10,
          note:'Pesquisa de 2 a 5 ofertas Shopee Afiliados; não cobre todo o mercado.'};
        }
      }
    }catch(e){result.productMediaWarning='Miniaturas indisponíveis: '+String(e.message||e).slice(0,120);}
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

