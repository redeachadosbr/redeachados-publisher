import express from 'express';
import session from 'express-session';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { parseCatalogSheets, lookupCatalogSku, linkCatalogSku, catalogStats } from './catalog.js';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { shopeeConfig, buildShopeeAuthorizationUrl, exchangeShopeeCode, refreshShopeeToken, getShopeeShopInfo, normalizeShopeeTokenResult, safeShopeeStatus } from './shopee.js';
import { spawn } from 'node:child_process';
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
const catalogUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }
});

app.use(express.json({ limit: '25mb', verify:(req,_res,buf)=>{ req.rawBody=Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'redeachados-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30*24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function defaults(){
  return {
    token:null,
    settings:{
      brandName:'REDEACHADOS BR', shopeeStoreUrl:'', defaultPrivacy:'SELF_ONLY', defaultHashtagCount:6,
      tiktokClientKey:'', tiktokClientSecret:'', geminiApiKey:'', geminiModel:'gemini-3.5-flash-lite',
      instagramAccessToken:'', instagramUserId:'17841480462088551', metaGraphVersion:'v26.0',
      instagramTokenManaged:false, instagramTokenExpiresAt:0, instagramTokenLastCheckedAt:0, instagramTokenLastRefreshAt:0,
      instagramDmEnabled:true, instagramDmKeyword:'QUERO',
      instagramDmTemplate:'Oi! 👋 Aqui está o link do produto que você pediu: {link}',
      instagramPublicReplyEnabled:true, instagramPublicReplyTemplate:'Enviei o link no seu Direct ✅',
      metaPageId:'', metaAdAccountId:'', metaAdSetId:'', metaAdsAccessToken:'', metaWebhookVerifyToken:'',
      metaCreateAdDefault:false, metaAdDefaultStatus:'PAUSED'
    },
    history:[], wedropSearchAliases:{}, wedropProductAliases:{}, instagramRules:[], instagramDmLog:[], shopeeAuth:null
  };
}
function loadStore(){
  try { return { ...defaults(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; }
  catch { const d=defaults(); saveStore(d); return d; }
}
function saveStore(s){ fs.writeFileSync(DATA_FILE, JSON.stringify(s,null,2)); }
function envText(name){ return String(process.env[name]||'').trim(); }
function envBool(name,fallback=false){ const v=envText(name).toLowerCase(); return v?['1','true','yes','on'].includes(v):fallback; }
function networkErrorDetails(error){
  const cause=error?.cause||{};
  return [error?.message,cause?.code,cause?.hostname,cause?.syscall].filter(Boolean).join(' | ')||'erro de rede desconhecido';
}
async function fetchWithRetry(url,options={},label='Requisição externa',{attempts=3,timeoutMs=15000}={}){
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{...options,signal:controller.signal});
      clearTimeout(timer);
      return response;
    }catch(error){
      clearTimeout(timer);
      lastError=error;
      if(attempt<attempts) await new Promise(r=>setTimeout(r,700*attempt));
    }
  }
  throw new Error(`${label}: falha de rede após ${attempts} tentativa(s) · ${networkErrorDetails(lastError)}`);
}
function supabaseCommerceConfig(){
  const url=envText('SUPABASE_URL').replace(/\/$/,'');
  const key=envText('SUPABASE_SECRET_KEY') || envText('SUPABASE_SERVICE_ROLE_KEY');
  return {url,key,configured:Boolean(url&&key)};
}
function supabaseInstagramWebhookUrl(){
  const override=envText('SUPABASE_INSTAGRAM_WEBHOOK_URL');
  if(override)return override;
  const cfg=supabaseCommerceConfig();
  return cfg.url?`${cfg.url}/functions/v1/instagram-commerce`:'';
}
async function syncInstagramRuleToSupabase(rule){
  const cfg=supabaseCommerceConfig();
  if(!rule?.mediaId) return {configured:cfg.configured,synced:false,reason:'MEDIA_ID_PENDING'};
  if(!cfg.configured) return {configured:false,synced:false,reason:'SUPABASE_NOT_CONFIGURED'};
  if(!rule.shopeeUrl) return {configured:true,synced:false,reason:'PRODUCT_URL_EMPTY'};
  const row={
    instagram_media_id:String(rule.mediaId),
    sku:String(rule.sku||'').trim()||null,
    product_name:String(rule.product||'Produto').trim()||'Produto',
    product_url:String(rule.shopeeUrl).trim(),
    keyword:String(rule.keyword||'QUERO').trim()||'QUERO',
    auto_dm_enabled:Boolean(rule.dmEnabled),
    public_reply_enabled:Boolean(rule.publicReplyEnabled),
    public_reply_text:String(rule.publicReplyTemplate||'Enviei o link no seu Direct ✅'),
    dm_message_template:String(rule.dmTemplate||'Oi! 👋 Aqui está o link do produto que você pediu: {link}'),
    active:Boolean(rule.dmEnabled),
    updated_at:now()
  };
  const headers={
    apikey:cfg.key,
    'Content-Type':'application/json',
    Prefer:'resolution=merge-duplicates,return=minimal'
  };
  // New Supabase sb_secret_* keys are opaque API keys, not JWTs.
  // Send them only as `apikey`. Legacy service_role JWTs still accept Bearer auth.
  if(/^eyJ[A-Za-z0-9_-]*\./.test(cfg.key)) headers.Authorization=`Bearer ${cfg.key}`;
  const endpoint=`${cfg.url}/rest/v1/reel_links?on_conflict=instagram_media_id`;
  const r=await fetchWithRetry(endpoint,{
    method:'POST',
    headers,
    body:JSON.stringify([row])
  },'Supabase reel_links');
  if(!r.ok){
    const body=await r.text().catch(()=> '');
    throw new Error(`Supabase reel_links HTTP ${r.status}${body?`: ${body.slice(0,300)}`:''}`);
  }
  return {configured:true,synced:true};
}
function effectiveSettings(stored={}){
  return {
    ...defaults().settings,
    ...(stored||{}),
    brandName: envText('BRAND_NAME') || stored.brandName || 'REDEACHADOS BR',
    shopeeStoreUrl: envText('SHOPEE_STORE_URL') || stored.shopeeStoreUrl || '',
    defaultPrivacy: envText('DEFAULT_PRIVACY') || stored.defaultPrivacy || 'SELF_ONLY',
    geminiModel: envText('GEMINI_MODEL') || stored.geminiModel || 'gemini-3.5-flash-lite',
    geminiApiKey: envText('GEMINI_API_KEY') || stored.geminiApiKey || '',
    tiktokClientKey: envText('TIKTOK_CLIENT_KEY') || stored.tiktokClientKey || '',
    tiktokClientSecret: envText('TIKTOK_CLIENT_SECRET') || stored.tiktokClientSecret || '',
    instagramAccessToken: ((stored.instagramTokenManaged && stored.instagramAccessToken && (!stored.instagramTokenExpiresAt || Number(stored.instagramTokenExpiresAt) > Math.floor(Date.now()/1000)+300)) ? stored.instagramAccessToken : '') || envText('INSTAGRAM_ACCESS_TOKEN') || stored.instagramAccessToken || '',
    instagramUserId: envText('INSTAGRAM_USER_ID') || stored.instagramUserId || '17841480462088551',
    metaGraphVersion: envText('META_GRAPH_VERSION') || stored.metaGraphVersion || 'v26.0',
    instagramTokenManaged:Boolean(stored.instagramTokenManaged),
    instagramTokenExpiresAt:Number(stored.instagramTokenExpiresAt||0),
    instagramTokenLastCheckedAt:Number(stored.instagramTokenLastCheckedAt||0),
    instagramTokenLastRefreshAt:Number(stored.instagramTokenLastRefreshAt||0),
    instagramDmEnabled: envText('INSTAGRAM_DM_ENABLED') ? envBool('INSTAGRAM_DM_ENABLED') : stored.instagramDmEnabled!==false,
    instagramDmKeyword: envText('INSTAGRAM_DM_KEYWORD') || stored.instagramDmKeyword || 'QUERO',
    instagramDmTemplate: envText('INSTAGRAM_DM_TEMPLATE') || stored.instagramDmTemplate || 'Oi! 👋 Aqui está o link do produto que você pediu: {link}',
    instagramPublicReplyEnabled: envText('INSTAGRAM_PUBLIC_REPLY_ENABLED') ? envBool('INSTAGRAM_PUBLIC_REPLY_ENABLED') : stored.instagramPublicReplyEnabled!==false,
    instagramPublicReplyTemplate: envText('INSTAGRAM_PUBLIC_REPLY_TEMPLATE') || stored.instagramPublicReplyTemplate || 'Enviei o link no seu Direct ✅',
    metaPageId: envText('META_PAGE_ID') || stored.metaPageId || '',
    metaAdAccountId: envText('META_AD_ACCOUNT_ID') || stored.metaAdAccountId || '',
    metaAdSetId: envText('META_AD_SET_ID') || stored.metaAdSetId || '',
    metaAdsAccessToken: envText('META_ADS_ACCESS_TOKEN') || stored.metaAdsAccessToken || '',
    metaWebhookVerifyToken: envText('META_WEBHOOK_VERIFY_TOKEN') || stored.metaWebhookVerifyToken || '',
    metaCreateAdDefault: envText('META_CREATE_AD_DEFAULT') ? envBool('META_CREATE_AD_DEFAULT') : Boolean(stored.metaCreateAdDefault),
    metaAdDefaultStatus: String(envText('META_AD_DEFAULT_STATUS') || stored.metaAdDefaultStatus || 'PAUSED').toUpperCase()==='ACTIVE'?'ACTIVE':'PAUSED'
  };
}
function now(){ return new Date().toISOString(); }
function removeFile(p){ try{ if(p && fs.existsSync(p)) fs.unlinkSync(p); }catch{} }
function baseUrl(req){ return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/,''); }
function storyShareSecret(){ return envText('STORY_SHARE_SECRET') || envText('SESSION_SECRET') || 'redeachados-story-share-dev-secret'; }
function safeStoryDownloadName(value='story'){ return String(value||'story').replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'story'; }
function createStoryShareToken(payload){
  const body=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
  const sig=crypto.createHmac('sha256',storyShareSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function readStoryShareToken(raw){
  const token=String(raw||'').trim();
  const [body,sig,...rest]=token.split('.');
  if(!body||!sig||rest.length) throw new Error('Link do Story inválido. Gere um novo QR Code.');
  const expected=crypto.createHmac('sha256',storyShareSecret()).update(body).digest('base64url');
  const a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) throw new Error('Link do Story inválido. Gere um novo QR Code.');
  let data;
  try{data=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch{throw new Error('Link do Story inválido. Gere um novo QR Code.');}
  if(!data?.exp || Number(data.exp)<Date.now()) throw new Error('Este QR Code expirou. Gere outro no Publisher.');
  if(!['remote','upload'].includes(data.source)) throw new Error('Origem do vídeo inválida.');
  return data;
}
function storySharePayload({source,id='',file='',title='',productUrl=''}){
  const exp=Date.now()+30*60*1000;
  return {v:1,source,id:String(id||''),file:String(file||''),title:String(title||'Story REDE ACHADOS BR').slice(0,120),productUrl:String(productUrl||'').slice(0,1500),exp};
}
function validateStoryProductUrl(raw){
  const value=String(raw||'').trim();
  if(!value) throw new Error('Informe o link do produto Shopee.');
  let u;try{u=new URL(value);}catch{throw new Error('O link do produto não é uma URL válida.');}
  if(!/^https?:$/.test(u.protocol)) throw new Error('Use um link http ou https para o produto.');
  return u.toString();
}
async function makeStoryShareResponse(req,payload){
  const token=createStoryShareToken(payload);
  const url=`${baseUrl(req)}/story-mobile?t=${encodeURIComponent(token)}`;
  const qrDataUrl=await QRCode.toDataURL(url,{width:360,margin:1,errorCorrectionLevel:'M'});
  return {ok:true,url,qrDataUrl,expiresAt:new Date(payload.exp).toISOString()};
}
function redirectUri(req){ return `${baseUrl(req)}/auth/tiktok/callback`; }
function safeSettings(stored){
  const s=effectiveSettings(stored||{});
  return {
    brandName:s.brandName, shopeeStoreUrl:s.shopeeStoreUrl, defaultPrivacy:s.defaultPrivacy,
    defaultHashtagCount:Number(s.defaultHashtagCount||6),
    tiktokConfigured:Boolean(s.tiktokClientKey&&s.tiktokClientSecret), geminiConfigured:Boolean(s.geminiApiKey),
    instagramConfigured:Boolean(s.instagramAccessToken&&s.instagramUserId), instagramUserId:s.instagramUserId, metaGraphVersion:s.metaGraphVersion,
    instagramTokenManaged:Boolean(s.instagramTokenManaged), instagramTokenExpiresAt:Number(s.instagramTokenExpiresAt||0),
    instagramDmEnabled:Boolean(s.instagramDmEnabled), instagramDmKeyword:s.instagramDmKeyword,
    instagramDmTemplate:s.instagramDmTemplate, instagramPublicReplyEnabled:Boolean(s.instagramPublicReplyEnabled), instagramPublicReplyTemplate:s.instagramPublicReplyTemplate,
    metaPageId:s.metaPageId, metaAdAccountId:s.metaAdAccountId, metaAdSetId:s.metaAdSetId,
    metaAdsConfigured:Boolean((s.metaAdsAccessToken||s.instagramAccessToken)&&s.metaAdAccountId&&s.metaAdSetId&&s.metaPageId&&s.instagramUserId),
    metaAdsTokenConfigured:Boolean(s.metaAdsAccessToken||s.instagramAccessToken),
    metaWebhookConfigured:Boolean(s.metaWebhookVerifyToken),
    metaCreateAdDefault:Boolean(s.metaCreateAdDefault), metaAdDefaultStatus:s.metaAdDefaultStatus,
    metaTokenAutomationConfigured:Boolean(envText('META_APP_ID')&&envText('META_APP_SECRET')),
    metaAppIdConfigured:Boolean(envText('META_APP_ID')), metaAppSecretConfigured:Boolean(envText('META_APP_SECRET')),
    supabaseCommerceConfigured:supabaseCommerceConfig().configured,
    geminiModel:s.geminiModel,
    sources:{
      shopeeStoreUrl:envText('SHOPEE_STORE_URL')?'render':'local',
      geminiApiKey:envText('GEMINI_API_KEY')?'render':'local',
      tiktokCredentials:(envText('TIKTOK_CLIENT_KEY')&&envText('TIKTOK_CLIENT_SECRET'))?'render':'local',
      instagramAccessToken:envText('INSTAGRAM_ACCESS_TOKEN')?'render':'local',
      instagramUserId:envText('INSTAGRAM_USER_ID')?'render':'local',
      metaAdsAccessToken:envText('META_ADS_ACCESS_TOKEN')?'render':'local',
      metaWebhookVerifyToken:envText('META_WEBHOOK_VERIFY_TOKEN')?'render':'local',
      supabaseCommerce:supabaseCommerceConfig().configured?'render':'not-configured'
    }
  };
}
function mustLogin(req,res,next){
  const required = process.env.APP_PASSWORD;
  if(!required || req.session?.appAuth) return next();
  res.status(401).json({error:'LOGIN_REQUIRED'});
}


function normalizeText(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function loadCatalog(){
  try { return JSON.parse(fs.readFileSync(CATALOG_FILE,'utf8')); }
  catch { return {shopId:'852701218',importedAt:null,sourceFile:null,products:[]}; }
}
function saveCatalog(c){ fs.writeFileSync(CATALOG_FILE, JSON.stringify(c,null,2)); }
function catalogTokens(v){
  const stop=new Set(['para','com','sem','kit','produto','branco','preto','sortido','unidade','unidades','novo','nova','oferta']);
  return normalizeText(v).split(' ').filter(x=>x.length>=3&&!stop.has(x));
}
function scoreCatalog(query,name){
  const q=normalizeText(query), n=normalizeText(name); if(!q||!n) return 0;
  if(n.includes(q)||q.includes(n)) return 0.98;
  const qa=new Set(catalogTokens(q)), na=new Set(catalogTokens(n)); if(!qa.size||!na.size) return 0;
  let common=0; for(const t of qa) if(na.has(t)) common++;
  const recall=common/qa.size, precision=common/na.size;
  return Math.min(0.95, recall*0.78 + precision*0.22);
}
function findCatalogMatch(query){
  const c=loadCatalog(); let best=null, bestScore=0;
  for(const p of c.products||[]){
    const score=scoreCatalog(query,p.name);
    if(score>bestScore){best=p;bestScore=score;}
  }
  return bestScore>=0.78 ? {...best,score:Number(bestScore.toFixed(3))} : null;
}
function parseShopeeCatalog(buffer,filename){
  const book=XLSX.read(buffer,{type:'buffer'});
  const sheets=book.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:false})}));
  return parseCatalogSheets(sheets,{filename,previous:loadCatalog(),importedAt:now()});
}

app.get('/api/catalog', mustLogin, (_req,res)=>{
  const c=loadCatalog(); res.json({...catalogStats(c), importedAt:c.importedAt, sourceFile:c.sourceFile, shopId:c.shopId||'852701218'});
});
app.post('/api/catalog/import', mustLogin, catalogUpload.single('catalog'), (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Selecione a planilha da Shopee.'});
    const c=parseShopeeCatalog(req.file.buffer,req.file.originalname); saveCatalog(c);
    res.json({ok:true,...catalogStats(c),importedAt:c.importedAt,sourceFile:c.sourceFile});
  }catch(e){res.status(400).json({error:e.message});}
});

app.post('/api/catalog/sku-alias', mustLogin, (req,res)=>{
  try{
    const c=linkCatalogSku(loadCatalog(),req.body.productId,req.body.sku);
    saveCatalog(c);
    res.json({ok:true,...catalogStats(c)});
  }catch(e){res.status(400).json({error:e.message});}
});


function findCatalogBySku(sku,productId=''){
  return lookupCatalogSku(loadCatalog(),sku,productId);
}
function safeRemoteUrl(raw){
  try{
    const u=new URL(String(raw||''));
    if(u.protocol!=='https:') return null;
    const h=u.hostname.toLowerCase();
    const allowed=['drive-vid-gallery.lovable.app','lovable.app','googleusercontent.com','googlevideo.com','storage.googleapis.com','supabase.co','supabase.in','cloudfront.net','cdn.jsdelivr.net'];
    if(!allowed.some(x=>h===x||h.endsWith('.'+x))) return null;
    return u;
  }catch{return null;}
}
function extractUrls(text){
  const urls=[];
  const re=/https?:\/\/[^\s"'<>\\]+/g;
  for(const m of String(text||'').matchAll(re)){
    const u=m[0].replace(/\u0026/g,'&').replace(/\\\//g,'/');
    if(/\.(mp4|mov|webm)(?:[?#]|$)/i.test(u)||/drive\.google\.com|googleusercontent|googlevideo|storage\.googleapis|supabase/i.test(u)) urls.push(u);
  }
  return [...new Set(urls)];
}
const GENERIC_SEARCH_TOKENS=new Set(['mini','kit','infantil','crianca','criancas','brinquedo','brinquedos','cores','cor','sortida','sortido','sortidas','sortidos','presente','oferta','flash','promocao','educativo','classico','super','top','luxo','pronta','entrega','unidade','unidades','com','para','de','da','do','das','dos','em','no','na','nos','nas','sem','por','um','uma','e']);
const EXCLUSIVE_TOKEN_GROUPS=[
  ['veiculo',['carro','carrinho','jeep','moto','motoca','quadriciclo','kart','bike','bicicleta','triciclo','patinete','scooter','caminhao','caminhaozinho','caminhonete']],
  ['musical',['bateria','tambor','tambores','baqueta','baquetas','musical','musica','guitarra','violao','teclado','microfone','instrumento','instrumentos']],
  ['cozinha',['panela','frigideira','chaleira','talher','talheres','garfo','faca','colher','jarra','copo','copos','taca','tacas','pote','potes','tabua','tabuas']],
  ['organizacao',['cabide','cabides','organizadora','organizador','organizadores','gaveta','gavetas','vacuo','armario','roupeiro','guarda','roupa']],
  ['pet',['pet','pets','cachorro','cachorros','cao','caes','gato','gatos','comedouro','bebedouro','coleira','pelos']]
];
function informativeTokens(v){
  const uniq=[];
  for(const token of catalogTokens(v)){
    if(token.length<3) continue;
    if(GENERIC_SEARCH_TOKENS.has(token)) continue;
    if(/^\d+[a-z]*$/i.test(token)) continue;
    if(!uniq.includes(token)) uniq.push(token);
  }
  return uniq;
}
function detectExclusiveGroups(tokens){
  const set=new Set(tokens);
  return EXCLUSIVE_TOKEN_GROUPS.filter(([,list])=>list.some(token=>set.has(token))).map(([name])=>name);
}
function semanticMatchMeta(query,title){
  const qInfo=informativeTokens(query);
  const tInfo=informativeTokens(title);
  const shared=qInfo.filter(token=>tInfo.includes(token));
  const qGroups=detectExclusiveGroups(qInfo);
  const tGroups=detectExclusiveGroups(tInfo);
  const sameGroup=qGroups.filter(group=>tGroups.includes(group));
  const conflictingGroups=qGroups.length&&tGroups.length&&!sameGroup.length;
  const genericQuery=qInfo.length===0;
  return {qInfo,tInfo,shared,genericQuery,conflictingGroups};
}
function scoreVideoCandidate(query,text){
  const q=new Set(catalogTokens(query)), t=new Set(catalogTokens(text));
  if(!q.size||!t.size) return 0; let common=0; for(const x of q) if(t.has(x)) common++;
  const recall=common/q.size;
  const precision=common/Math.max(1,Math.min(t.size,q.size*3));
  return Math.min(1,recall*0.86+precision*0.14);
}
function cleanSearchTitle(v){
  return String(v||'').replace(/[|•·]+/g,' ').replace(/[()\[\]{}]/g,' ').replace(/\s+/g,' ').trim();
}
function progressiveSearchQueries(title, learned=''){
  const out=[]; const add=v=>{v=cleanSearchTitle(v); if(!v)return; const k=normalizeText(v); if(k && !out.some(x=>normalizeText(x)===k))out.push(v)};
  add(learned);
  const full=cleanSearchTitle(title); add(full);
  const words=full.split(/\s+/).filter(Boolean);
  // V5.4.3: além do título completo, sempre inclui prefixos fortes de 6 até 2 palavras.
  // Isso evita o erro anterior em títulos longos, onde o limite de tentativas podia acabar
  // antes de chegar em uma busca simples como "Pista Carrinho".
  const strong=[];
  for(let n=Math.min(6,words.length);n>=2;n--){
    const v=words.slice(0,n).join(' ');
    if(catalogTokens(v).length>=2) strong.push(v);
  }
  strong.forEach(add);
  // Depois, tenta o comportamento manual real: remove uma palavra por vez do final.
  for(let n=words.length-1;n>=2 && out.length<24;n--){
    const v=words.slice(0,n).join(' ');
    if(catalogTokens(v).length>=2) add(v);
  }
  // Alternativa removendo cores/tamanhos que normalmente não fazem parte do nome do vídeo.
  const removable=new Set(['branco','branca','preto','preta','azul','rosa','vermelho','vermelha','verde','cinza','sortido','sortida','grande','medio','media','pequeno','pequena']);
  const filtered=words.filter(w=>!removable.has(normalizeText(w)));
  if(filtered.length>=2)add(filtered.join(' '));
  return out.slice(0,24);
}
function getWedropAlias(sku){
  const st=loadStore(); return String(st.wedropSearchAliases?.[String(sku||'').trim().toUpperCase()]||'').trim();
}
function saveWedropAlias(sku,query){
  const key=String(sku||'').trim().toUpperCase(), q=cleanSearchTitle(query); if(!key||!q)return;
  const st=loadStore(); st.wedropSearchAliases={...(st.wedropSearchAliases||{}),[key]:q}; saveStore(st);
}
function getWedropProductAlias(sku){
  const key=String(sku||'').trim().toUpperCase();
  const st=loadStore();
  const saved=String(st.wedropProductAliases?.[key]||'').trim();
  if(saved) return saved;
  // Correção confirmada pelo catálogo/usuário: esta SKU duplicada deve abrir o anúncio com movimento.
  const confirmed={'NTM3001127V':'22699708957'};
  return confirmed[key]||'';
}
function saveWedropProductAlias(sku,productId){
  const key=String(sku||'').trim().toUpperCase(), id=String(productId||'').trim(); if(!key||!/^\d+$/.test(id))return;
  const st=loadStore(); st.wedropProductAliases={...(st.wedropProductAliases||{}),[key]:id}; saveStore(st);
}
let galleryCache={loadedAt:0,base:'',records:[],bundleUrl:'',diagnostic:''};
function decodeJsString(v){
  try{return JSON.parse('"'+String(v||'').replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"')}catch{return String(v||'').replace(/\\u([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\n/g,' ').replace(/\\\//g,'/');}
}
function parseGalleryRecords(text){
  const src=String(text||'');
  const out=[];
  // Estrutura confirmada no bundle da galeria WeDrop/Lovable:
  // {"id":"ID_GOOGLE_DRIVE","title":"Nome do vídeo", ...}
  const re=/["']id["']\s*:\s*["']([^"']{8,200})["']\s*,\s*["']title["']\s*:\s*["']([^"']{2,500})["']/g;
  for(const m of src.matchAll(re)){
    const id=decodeJsString(m[1]).trim();
    const title=decodeJsString(m[2]).trim();
    if(!id||!title) continue;
    const near=src.slice(m.index,Math.min(src.length,m.index+1200));
    const dm=near.match(/["']duration_ms["']\s*:\s*["']?(\d{2,12})["']?/);
    const cm=near.match(/["']category["']\s*:\s*["']([^"']{2,120})["']/i);
    out.push({id,title,durationMs:dm?Number(dm[1]):0,category:cm?decodeJsString(cm[1]).trim():''});
  }
  const seen=new Set();
  return out.filter(x=>!seen.has(x.id)&&(seen.add(x.id),true));
}
async function fetchGalleryText(url,headers,label='recurso'){
  const r=await fetch(url,{headers,redirect:'follow'});
  if(!r.ok) throw new Error(`${label} HTTP ${r.status}`);
  return {text:await r.text(),finalUrl:r.url||url,status:r.status,contentType:r.headers.get('content-type')||''};
}
function extractJsAssetUrls(text,base){
  const out=[];
  const add=raw=>{
    raw=String(raw||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/').trim();
    if(!raw||!(/\.js(?:[?#]|$)/i.test(raw))) return;
    try{
      const u=new URL(raw,base);
      if(u.protocol==='https:' && u.hostname===new URL(base).hostname) out.push(u.href);
    }catch{}
  };
  // HTML: scripts e modulepreload/preload.
  for(const m of String(text||'').matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi)) add(m[1]);
  // Bundles Vite/Lovable: imports/chunks referenciados como ./routes-xxxx.js, /assets/x.js ou assets/x.js.
  for(const m of String(text||'').matchAll(/["'`](\.?\/?(?:assets\/)?[A-Za-z0-9_./~-]+\.js(?:\?[^"'`]*)?)["'`]/g)) add(m[1]);
  // Fallback específico para nomes de chunk sem caminho explícito.
  for(const m of String(text||'').matchAll(/(?:^|[^A-Za-z0-9_-])(routes-[A-Za-z0-9_-]+\.js)(?:[^A-Za-z0-9_-]|$)/g)) add('/assets/'+m[1]);
  return [...new Set(out)];
}
async function loadGalleryInventory(force=false){
  const base=envText('WEDROP_GALLERY_URL')||'https://drive-vid-gallery.lovable.app/';
  if(!force && galleryCache.records.length && Date.now()-galleryCache.loadedAt<10*60*1000 && galleryCache.base===base) return galleryCache;
  const headers={
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36',
    'Accept':'text/html,application/xhtml+xml,application/javascript,text/javascript,*/*',
    'Accept-Language':'pt-BR,pt;q=0.9,en;q=0.8',
    'Cache-Control':'no-cache',
    'Pragma':'no-cache'
  };
  const diagnostics=[];
  let htmlInfo;
  try{
    htmlInfo=await fetchGalleryText(base,headers,'HTML da galeria');
  }catch(e){
    galleryCache={loadedAt:Date.now(),base,records:[],bundleUrl:'',diagnostic:`Falha ao abrir a galeria: ${e.message}`};
    throw e;
  }
  const html=htmlInfo.text;
  diagnostics.push(`HTML ${htmlInfo.status}, ${html.length} bytes`);
  let queue=extractJsAssetUrls(html,htmlInfo.finalUrl||base);
  diagnostics.push(`${queue.length} asset(s) JS encontrado(s) no HTML`);
  const seen=new Set();
  let bestRecords=[],bestUrl='',checked=0,failures=0;
  // Percorre também imports dinâmicos. Isso é necessário porque a Lovable normalmente
  // inclui apenas index-*.js no HTML; routes-*.js é descoberto a partir desse bundle.
  while(queue.length && checked<60){
    const src=queue.shift();
    if(!src||seen.has(src)) continue;
    seen.add(src);
    try{
      const info=await fetchGalleryText(src,headers,'Bundle da galeria');
      checked++;
      const tx=info.text;
      if(tx.length>24_000_000){diagnostics.push(`ignorado ${new URL(src).pathname.split('/').pop()}: ${tx.length} bytes`);continue;}
      const records=parseGalleryRecords(tx);
      if(records.length>bestRecords.length){bestRecords=records;bestUrl=src;}
      const children=extractJsAssetUrls(tx,src);
      for(const child of children) if(!seen.has(child) && queue.length<120) queue.push(child);
      diagnostics.push(`${new URL(src).pathname.split('/').pop()}: ${records.length} registro(s), ${children.length} chunk(s)`);
      if(/\/routes-[^/]+\.js(?:\?|$)/i.test(src) && records.length>200) break;
    }catch(e){
      failures++;
      diagnostics.push(`${src.split('/').pop()}: ${e.message}`);
    }
  }
  const bundleName=bestUrl?new URL(bestUrl).pathname.split('/').pop():'nenhum bundle';
  let diagnostic=`${bestRecords.length} vídeos indexados a partir de ${bundleName} (${checked} bundle(s) verificado(s)`;
  if(failures) diagnostic+=`, ${failures} falha(s)`;
  diagnostic+=`).`;
  if(!bestRecords.length) diagnostic+=` Diagnóstico: ${diagnostics.slice(0,12).join(' | ')}`;
  galleryCache={loadedAt:Date.now(),base,records:bestRecords,bundleUrl:bestUrl,diagnostic,debug:diagnostics};
  return galleryCache;
}

function scoreGalleryRecord(query,record){
  const title=record?.title||'';
  const meta=semanticMatchMeta(query,title);
  if(meta.genericQuery) return 0;
  let score=scoreVideoCandidate(query,title);
  const nq=normalizeText(query), nt=normalizeText(title);
  if(nq && nt){
    if(nt===nq) score=Math.max(score,1);
    else if(nt.includes(nq)||nq.includes(nt)) score=Math.max(score,0.92);
    const q2=catalogTokens(query).slice(0,2).join(' '), t2=catalogTokens(title).slice(0,2).join(' ');
    if(q2 && q2===t2) score=Math.max(score,0.70);
  }
  if(meta.conflictingGroups) score=Math.min(score,0.18);
  if(meta.qInfo.length>=4 && meta.shared.length<2) score=Math.min(score,0.24);
  else if(meta.qInfo.length>=2 && meta.shared.length===0) score=Math.min(score,0.18);
  else if(meta.qInfo.length>=3 && meta.shared.length===1) score=Math.min(score,0.42);
  if(meta.shared.length>=2) score=Math.max(score,Math.min(0.96,0.58+(meta.shared.length*0.11)));
  return Math.min(1,score);
}
function rankGalleryRecords(records,query){
  return records.map(r=>({...r,score:scoreGalleryRecord(query,r),label:r.title,matchQuery:query}))
    .sort((a,b)=>b.score-a.score || a.title.localeCompare(b.title,'pt-BR'));
}
async function discoverGalleryVideos(title,sku,manualQuery=''){
  const learned=getWedropAlias(sku);
  const result={galleryUrl:envText('WEDROP_GALLERY_URL')||'https://drive-vid-gallery.lovable.app/',query:title,sku,candidates:[],diagnostic:'',attempts:[],bestQuery:'',learnedQuery:learned};
  try{
    const inv=await loadGalleryInventory(); result.galleryUrl=inv.base; result.inventoryCount=inv.records.length; result.bundleUrl=inv.bundleUrl;
    const variants=manualQuery?[cleanSearchTitle(manualQuery)]:progressiveSearchQueries(title||sku,learned);
    const threshold=0.46;
    let chosen=[];
    let genericOnly=true;
    for(const q of variants){
      if(!q)continue;
      const meta=semanticMatchMeta(q,q);
      if(meta.genericQuery){
        result.attempts.push({query:q,matches:0,bestScore:0,generic:true});
        continue;
      }
      genericOnly=false;
      const ranked=rankGalleryRecords(inv.records,q);
      const hits=ranked.filter(x=>x.score>=threshold).slice(0,12);
      result.attempts.push({query:q,matches:hits.length,bestScore:Number((ranked[0]?.score||0).toFixed(3))});
      if(hits.length){chosen=hits;result.bestQuery=q;break;}
    }
    if(!chosen.length && variants.length && !genericOnly){
      const q=[...variants].reverse().find(item=>!semanticMatchMeta(item,item).genericQuery)||variants[variants.length-1];
      const ranked=rankGalleryRecords(inv.records,q).filter(x=>x.score>=0.32).slice(0,6);
      if(ranked.length){chosen=ranked;result.bestQuery=q;result.diagnostic='Encontrei candidatos aproximados, mas descartei vídeos incompatíveis com o tipo principal do produto.';}
    }
    result.candidates=chosen.map(x=>({id:x.id,title:x.title,label:x.title,durationMs:x.durationMs||0,category:x.category||'',score:Number(x.score.toFixed(3)),matchQuery:x.matchQuery}));
    if(!result.diagnostic) result.diagnostic=genericOnly
      ? 'A busca informada está ampla demais para escolher vídeo com segurança. Digite pelo menos 2 palavras específicas do produto, por exemplo “mini bateria tambores” em vez de apenas “mini”.'
      : chosen.length
        ? `${chosen.length} vídeo(s) encontrado(s) no catálogo de ${inv.records.length} vídeos. Busca que funcionou: “${result.bestQuery}”.`
        : (inv.records.length===0
          ? `Não consegui indexar o catálogo interno da galeria. ${inv.diagnostic||'Use “Abrir galeria” como alternativa.'}`
          : `Nenhum vídeo compatível foi localizado entre ${inv.records.length} vídeos indexados. Refine a busca com palavras específicas do produto.`);
  }catch(e){result.diagnostic=`Não foi possível consultar automaticamente o catálogo da galeria: ${e.message}`;}
  return result;
}
app.get('/api/wedrop/lookup', mustLogin, async(req,res)=>{
  try{
    const sku=String(req.query.sku||'').trim(); if(!sku) return res.status(400).json({error:'Informe a SKU WeDrop.'});
    const manualQuery=String(req.query.q||'').trim();
    const explicitProductId=String(req.query.productId||'').trim();
    const rememberedProductId=explicitProductId?'':getWedropProductAlias(sku);
    let mapped;
    try{mapped=findCatalogBySku(sku,explicitProductId||rememberedProductId);}
    catch(e){
      if(rememberedProductId&&!explicitProductId){
        try{mapped=findCatalogBySku(sku,'');}
        catch(inner){if(inner.code==='SKU_AMBIGUOUS')return res.status(409).json({error:inner.message,code:inner.code,candidates:inner.candidates});throw inner;}
      }else if(e.code==='SKU_AMBIGUOUS')return res.status(409).json({error:e.message,code:e.code,candidates:e.candidates});
      else throw e;
    }
    if(explicitProductId&&mapped) saveWedropProductAlias(sku,mapped.id);
    const known={'VP-2383':{name:'Avental Infantil Vida Pratika Mini Chef Branco',source:'known-example'}};
    const product=mapped?{id:mapped.id,sku:mapped.matchedSku||mapped.sku,parentSku:mapped.sku,name:mapped.name,shopeeUrl:mapped.url,source:'shopee-catalog',matchType:mapped.matchType}:(known[sku.toUpperCase()]||{sku,name:'',source:'unresolved'});
    if(!product.name && !manualQuery) return res.status(404).json({code:'SKU_NOT_FOUND',error:'Esta SKU não está no catálogo importado. A planilha de informações básicas contém apenas o SKU principal. Para uma variação, importe uma planilha com os SKUs das variações ou vincule o código em Configurações > Loja e catálogo. Você também pode buscar pelo nome abaixo.'});
    const gallery=await discoverGalleryVideos(product.name||manualQuery||sku,sku,manualQuery);
    res.json({ok:true,sku,product,gallery});
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/wedrop/alias', mustLogin, (req,res)=>{
  try{const sku=String(req.body.sku||'').trim(), query=String(req.body.query||'').trim(); if(!sku||!query)return res.status(400).json({error:'SKU e busca são obrigatórias.'});saveWedropAlias(sku,query);res.json({ok:true,sku,query:cleanSearchTitle(query)});}catch(e){res.status(400).json({error:e.message});}
});
function driveCandidateUrls(id){
  return [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`
  ];
}
async function fetchDriveResponse(id, range=''){
  let last='';
  for(const raw of driveCandidateUrls(id)){
    try{
      const headers={
        'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Chrome/153 Mobile Safari/604.1',
        'Accept':'video/*,application/octet-stream,*/*',
        'Accept-Encoding':'identity'
      };
      if(range) headers.Range=range;
      const r=await fetch(raw,{redirect:'follow',headers});
      if(!r.ok && r.status!==206){last=`HTTP ${r.status}`;continue;}
      const ct=(r.headers.get('content-type')||'').toLowerCase();
      if(/text\/html|application\/json/.test(ct)){last='o Google Drive retornou uma página em vez do arquivo';continue;}
      return r;
    }catch(e){last=e.message;}
  }
  throw new Error(last||'fonte indisponível');
}
function remoteMime(response){
  const ct=(response.headers.get('content-type')||'').toLowerCase();
  const cd=response.headers.get('content-disposition')||'';
  if(/video\//.test(ct)) return ct.split(';')[0];
  if(/\.mov/i.test(cd)) return 'video/quicktime';
  if(/\.webm/i.test(cd)) return 'video/webm';
  return 'video/mp4';
}
app.get('/api/wedrop/video', mustLogin, async(req,res)=>{
  try{
    const id=String(req.query.id||'').trim();
    if(!id || !/^[A-Za-z0-9_-]{8,200}$/.test(id)) return res.status(400).json({error:'ID de vídeo não permitido.'});
    const range=String(req.headers.range||'').trim();
    const r=await fetchDriveResponse(id,range);
    const ct=remoteMime(r);
    res.status(r.status===206?206:200);
    res.setHeader('Content-Type',ct);
    res.setHeader('Accept-Ranges',r.headers.get('accept-ranges')||'bytes');
    const len=r.headers.get('content-length'); if(len) res.setHeader('Content-Length',len);
    const cr=r.headers.get('content-range'); if(cr) res.setHeader('Content-Range',cr);
    res.setHeader('Cache-Control','private, max-age=300');
    res.setHeader('Content-Disposition','inline');
    if(!r.body) return res.end();
    Readable.fromWeb(r.body).on('error',()=>{try{res.destroy();}catch{}}).pipe(res);
  }catch(e){ if(!res.headersSent) res.status(400).json({error:`Não consegui transmitir o vídeo do Google Drive (${e.message}).`}); }
});
async function downloadDriveToTemp(id, filename='wedrop-video.mp4'){
  const r=await fetchDriveResponse(id,'');
  const mime=remoteMime(r);
  const ext=mime.includes('quicktime')?'.mov':mime.includes('webm')?'.webm':'.mp4';
  const safeBase=path.basename(filename,path.extname(filename)).replace(/[^A-Za-z0-9._ -]+/g,' ').trim().slice(0,80)||'wedrop-video';
  const filePath=path.join(UPLOAD_DIR,`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safeBase}${ext}`);
  const ws=fs.createWriteStream(filePath);
  let size=0;
  await new Promise((resolve,reject)=>{
    const rs=Readable.fromWeb(r.body);
    rs.on('data',chunk=>{size+=chunk.length;if(size>300*1024*1024){rs.destroy(new Error('Vídeo remoto maior que 300 MB.'));}});
    rs.on('error',reject); ws.on('error',reject); ws.on('finish',resolve); rs.pipe(ws);
  });
  if(size<1024){removeFile(filePath);throw new Error('Arquivo retornado muito pequeno.');}
  return {path:filePath,size,mimetype:mime,originalname:`${safeBase}${ext}`};
}

const REMOTE_CACHE_DIR=path.join(UPLOAD_DIR,'remote-cache');
fs.mkdirSync(REMOTE_CACHE_DIR,{recursive:true});
const remotePreparePromises=new Map();
function preparedDrivePath(id){return path.join(REMOTE_CACHE_DIR,`${String(id).replace(/[^A-Za-z0-9_-]/g,'_')}.mp4`);}
async function inspectMediaFile(filePath){
  return await new Promise((resolve)=>{
    const cp=spawn(ffmpegPath,['-hide_banner','-i',filePath],{stdio:['ignore','ignore','pipe']});
    let err='';
    cp.stderr.on('data',d=>{err+=String(d);if(err.length>50000)err=err.slice(-50000)});
    const finish=()=>{
      const v=(err.match(/Video:\s*([^,\s]+)/i)||[])[1]||'';
      const a=(err.match(/Audio:\s*([^,\s]+)/i)||[])[1]||'';
      const dm=err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
      const duration=dm?(Number(dm[1])*3600+Number(dm[2])*60+Number(dm[3])):0;
      resolve({videoCodec:v.toLowerCase(),audioCodec:a.toLowerCase(),duration:Number(duration||0)});
    };
    cp.on('error',()=>resolve({videoCodec:'',audioCodec:'',duration:0}));
    cp.on('close',finish);
  });
}
async function prepareDriveVideo(id,filename='wedrop-video.mp4'){
  if(!/^[A-Za-z0-9_-]{8,200}$/.test(String(id||'')))throw new Error('ID de vídeo inválido.');
  const target=preparedDrivePath(id);
  try{const st=fs.statSync(target);if(st.size>1024)return {path:target,size:st.size,mimetype:'video/mp4',originalname:path.basename(target),...(await inspectMediaFile(target)),cached:true};}catch{}
  if(remotePreparePromises.has(id))return remotePreparePromises.get(id);
  const promise=(async()=>{
    let remote=null,tmp='';
    try{
      remote=await downloadDriveToTemp(id,filename);
      const info=await inspectMediaFile(remote.path);
      tmp=`${target}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp.mp4`;
      const common=['-hide_banner','-loglevel','error','-i',remote.path,'-map','0:v:0','-map','0:a?'];
      if(info.videoCodec==='h264' && (!info.audioCodec || info.audioCodec==='aac')){
        await runFfmpeg([...common,'-c','copy','-movflags','+faststart','-y',tmp]);
      }else if(info.videoCodec==='h264'){
        await runFfmpeg([...common,'-c:v','copy','-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart','-y',tmp]);
      }else{
        await runFfmpeg([...common,'-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart','-y',tmp]);
      }
      const st=fs.statSync(tmp);if(st.size<1024)throw new Error('O vídeo preparado ficou inválido.');
      try{removeFile(target)}catch{}
      fs.renameSync(tmp,target);tmp='';
      const finalInfo=await inspectMediaFile(target);
      setTimeout(()=>removeFile(target),2*60*60*1000).unref?.();
      return {path:target,size:fs.statSync(target).size,mimetype:'video/mp4',originalname:path.basename(target),...finalInfo,cached:false};
    }finally{
      if(remote?.path)removeFile(remote.path);
      if(tmp)removeFile(tmp);
    }
  })().finally(()=>remotePreparePromises.delete(id));
  remotePreparePromises.set(id,promise);
  return promise;
}
function serveLocalVideo(req,res,filePath,{cache='private, max-age=300',download=false,name='video.mp4'}={}){
  if(!fs.existsSync(filePath))return res.status(404).send('Vídeo temporário não encontrado.');
  const st=fs.statSync(filePath);const range=String(req.headers.range||'').trim();
  res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control',cache);
  const safeName=String(name||'video.mp4').replace(/[\"\r\n]/g,'_');
  res.setHeader('Content-Disposition',`${download?'attachment':'inline'}; filename="${safeName}"`);
  if(range){
    const m=range.match(/bytes=(\d*)-(\d*)/);
    if(m){const start=Number(m[1]||0),end=Math.min(Number(m[2]||st.size-1),st.size-1);if(start<=end){res.status(206);res.setHeader('Content-Range',`bytes ${start}-${end}/${st.size}`);res.setHeader('Content-Length',end-start+1);return fs.createReadStream(filePath,{start,end}).pipe(res);}}
  }
  res.status(200);res.setHeader('Content-Length',st.size);return fs.createReadStream(filePath).pipe(res);
}

app.post('/api/wedrop/prepare',mustLogin,async(req,res)=>{
  try{
    const id=String(req.body.remoteVideoId||'').trim();
    const prepared=await prepareDriveVideo(id,String(req.body.filename||'video-wedrop.mp4'));
    res.json({ok:true,streamUrl:`/api/wedrop/prepared?id=${encodeURIComponent(id)}&v=552`,duration:prepared.duration||0,size:prepared.size,videoCodec:prepared.videoCodec||'',audioCodec:prepared.audioCodec||'',cached:Boolean(prepared.cached)});
  }catch(e){res.status(400).json({error:`Não consegui preparar o vídeo (${e.message}).`});}
});
app.get('/api/wedrop/prepared',mustLogin,async(req,res)=>{
  try{const id=String(req.query.id||'').trim();const prepared=await prepareDriveVideo(id,'video-wedrop.mp4');return serveLocalVideo(req,res,prepared.path,{cache:'private, max-age=600',name:'redeachados-video.mp4'});}catch(e){if(!res.headersSent)res.status(400).json({error:`Vídeo preparado indisponível (${e.message}).`});}
});

async function runFfmpeg(args){
  await new Promise((resolve,reject)=>{
    const cp=spawn(ffmpegPath,args,{stdio:['ignore','ignore','pipe']});
    let err='';
    cp.stderr.on('data',d=>{err+=String(d); if(err.length>12000) err=err.slice(-12000)});
    cp.on('error',err=>reject(new Error(`Não foi possível iniciar o FFmpeg (${err.message}).`)));
    cp.on('close',code=>code===0?resolve():reject(new Error(`FFmpeg falhou (código ${code}). ${err.split('\n').slice(-6).join(' ')}`)));
  });
}
async function extractRemoteFrames(id, filename, durationSec){
  const prepared=await prepareDriveVideo(id,filename||'wedrop-video.mp4'); const made=[];
  try{
    const dur=Number(durationSec||prepared.duration||0);
    const points=dur>1 ? [0.15,0.5,0.85].map(p=>Math.max(0.1,Math.min(Math.max(0.1,dur-0.15),dur*p))) : [0.5,1.5,2.5];
    const images=[];
    for(let i=0;i<points.length;i++){
      const out=path.join(UPLOAD_DIR,`${Date.now()}-${crypto.randomBytes(4).toString('hex')}-frame-${i+1}.jpg`);
      made.push(out);
      await runFfmpeg(['-hide_banner','-loglevel','error','-ss',String(points[i]),'-i',prepared.path,'-frames:v','1','-vf','scale=720:-2:force_original_aspect_ratio=decrease','-q:v','3','-y',out]);
      const buf=fs.readFileSync(out);
      if(buf.length<500) throw new Error(`Frame ${i+1} inválido.`);
      images.push(`data:image/jpeg;base64,${buf.toString('base64')}`);
    }
    return images;
  }finally{for(const f of made) removeFile(f);}
}

// Story assistido para iPhone: o desktop gera um QR Code temporário e o celular recebe o vídeo + link da Shopee.
app.post('/api/story-share/remote',mustLogin,async(req,res)=>{
  try{
    const id=String(req.body.remoteVideoId||'').trim();
    if(!/^[A-Za-z0-9_-]{8,200}$/.test(id))return res.status(400).json({error:'ID de vídeo não permitido.'});
    await prepareDriveVideo(id,String(req.body.title||'story-rede-achados')+'.mp4');
    const productUrl=validateStoryProductUrl(req.body.productUrl);
    const payload=storySharePayload({source:'remote',id,title:req.body.title||'Story REDE ACHADOS BR',productUrl});
    res.json(await makeStoryShareResponse(req,payload));
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/story-share/upload',mustLogin,upload.single('video'),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'Envie um vídeo.'});
    const productUrl=validateStoryProductUrl(req.body.productUrl);
    const filename=path.basename(req.file.path);
    const payload=storySharePayload({source:'upload',file:filename,title:req.body.title||req.file.originalname||'Story REDE ACHADOS BR',productUrl});
    setTimeout(()=>removeFile(req.file.path),70*60*1000).unref?.();
    res.json(await makeStoryShareResponse(req,payload));
  }catch(e){if(req.file?.path)removeFile(req.file.path);res.status(400).json({error:e.message});}
});
app.get('/api/story-share/info',(req,res)=>{
  try{
    const payload=readStoryShareToken(req.query.t);
    res.setHeader('Cache-Control','no-store');
    const token=encodeURIComponent(String(req.query.t||''));
    const videoUrl=`/api/story-share/video?t=${token}`;
    const downloadUrl=`${videoUrl}&download=1`;
    res.json({ok:true,title:payload.title,productUrl:payload.productUrl,expiresAt:new Date(payload.exp).toISOString(),videoUrl,downloadUrl,metaAppId:envText('META_APP_ID')||''});
  }catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/story-share/video',async(req,res)=>{
  try{
    const payload=readStoryShareToken(req.query.t);
    if(payload.source==='remote'){
      if(!/^[A-Za-z0-9_-]{8,200}$/.test(payload.id||''))throw new Error('Vídeo remoto inválido.');
      const prepared=await prepareDriveVideo(payload.id,String(payload.title||'story')+'.mp4');
      return serveLocalVideo(req,res,prepared.path,{cache:'private, max-age=600',download:String(req.query.download||'')==='1',name:`${safeStoryDownloadName(payload.title||'story')}.mp4`});
    }
    const file=path.basename(String(payload.file||''));
    if(!file||file!==payload.file)throw new Error('Arquivo temporário inválido.');
    const filePath=path.join(UPLOAD_DIR,file);if(!fs.existsSync(filePath))return res.status(410).json({error:'O vídeo temporário expirou. Gere um novo QR Code no Publisher.'});
    res.setHeader('Cache-Control','private, max-age=300');
    const disposition=String(req.query.download||'')==='1'?'attachment':'inline';
    res.sendFile(filePath,{headers:{'Content-Disposition':`${disposition}; filename="${safeStoryDownloadName(payload.title||'story')}.mp4"`}});
  }catch(e){if(!res.headersSent)res.status(400).json({error:e.message});}
});
app.get('/story-mobile',(_req,res)=>res.sendFile(path.join(__dirname,'public','story-mobile.html')));

// Public legal pages required by platform reviews. These routes never require app login.
app.get(['/privacy','/privacy-policy'], (_req,res)=>res.sendFile(path.join(__dirname,'public','privacy.html')));
app.get('/data-deletion', (_req,res)=>res.sendFile(path.join(__dirname,'public','privacy.html')));

app.get('/api/health', (_req,res)=>res.json({ok:true,service:'REDEACHADOS BR Publisher Web V5.5.20',shopeeApi:true}));
app.get('/api/auth-state',(req,res)=>res.json({locked:Boolean(process.env.APP_PASSWORD),loggedIn:!process.env.APP_PASSWORD||Boolean(req.session?.appAuth)}));
app.post('/api/login',(req,res)=>{
  if(!process.env.APP_PASSWORD){ req.session.appAuth=true; return res.json({ok:true}); }
  if(String(req.body.password||'')!==process.env.APP_PASSWORD) return res.status(401).json({error:'Senha incorreta.'});
  req.session.appAuth=true; res.json({ok:true});
});
app.post('/api/app-logout',(req,res)=>{ req.session.destroy(()=>res.json({ok:true})); });

app.get('/api/config', mustLogin, (req,res)=>{
  const s=loadStore();
  const shopeeCfg=shopeeConfig(baseUrl(req));
  res.json({
    settings:safeSettings(s.settings||{}), tiktokConnected:Boolean(s.token?.access_token), redirectUri:redirectUri(req), publicBaseUrl:baseUrl(req),
    instagramWebhookUrl:`${baseUrl(req)}/webhooks/meta/instagram`,
    shopee:safeShopeeStatus(s.shopeeAuth||null,shopeeCfg)
  });
});

app.get('/api/shopee/status', mustLogin, (req,res)=>{
  const s=loadStore();
  const cfg=shopeeConfig(baseUrl(req));
  res.json(safeShopeeStatus(s.shopeeAuth||null,cfg));
});

app.get('/auth/shopee/start', mustLogin, (req,res)=>{
  try{
    const cfg=shopeeConfig(baseUrl(req));
    const state=crypto.randomBytes(24).toString('hex');
    req.session.shopeeOAuthState={value:state,createdAt:Date.now()};
    res.redirect(buildShopeeAuthorizationUrl(cfg,state));
  }catch(e){
    res.status(400).send(`<h2>Shopee API não configurada</h2><p>${String(e.message||e)}</p><p><a href="/">Voltar ao Publisher</a></p>`);
  }
});

app.get('/auth/shopee/callback', async(req,res)=>{
  try{
    const code=String(req.query.code||'').trim();
    const shopId=Number(req.query.shop_id||0);
    const state=String(req.query.state||'').trim();
    const expected=req.session?.shopeeOAuthState;
    if(!expected?.value || !state || state!==expected.value || Date.now()-Number(expected.createdAt||0)>10*60*1000){
      throw new Error('Estado de autorização Shopee inválido ou expirado. Inicie a conexão novamente pelo Publisher.');
    }
    delete req.session.shopeeOAuthState;
    const cfg=shopeeConfig(baseUrl(req));
    const tokenData=await exchangeShopeeCode(cfg,{code,shopId});
    const auth=normalizeShopeeTokenResult(tokenData,shopId);
    if(!auth.accessToken||!auth.refreshToken||!auth.shopId) throw new Error('A Shopee não retornou todos os dados de autorização esperados.');
    const s=loadStore();
    s.shopeeAuth={...auth,mode:cfg.mode,partnerId:cfg.partnerId};
    saveStore(s);
    res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Shopee conectada</title><body style="font-family:Arial,sans-serif;padding:32px"><h2>✅ Shopee conectada com sucesso</h2><p>Shop ID: <strong>${auth.shopId}</strong></p><p>Ambiente: <strong>${cfg.mode}</strong></p><p><a href="/">Voltar ao Rede Achados BR Publisher</a></p></body></html>`);
  }catch(e){
    res.status(400).type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Erro Shopee</title><body style="font-family:Arial,sans-serif;padding:32px"><h2>❌ Não foi possível concluir a autorização da Shopee</h2><p>${String(e.message||e)}</p><p><a href="/">Voltar ao Publisher</a></p></body></html>`);
  }
});

app.post('/api/shopee/refresh', mustLogin, async(req,res)=>{
  try{
    const s=loadStore();
    const current=s.shopeeAuth||{};
    const cfg=shopeeConfig(baseUrl(req));
    const data=await refreshShopeeToken(cfg,{refreshToken:current.refreshToken,shopId:current.shopId});
    const next=normalizeShopeeTokenResult(data,current.shopId);
    s.shopeeAuth={...current,...next,shopIds:next.shopIds.length?next.shopIds:(current.shopIds||[]),lastRefreshAt:new Date().toISOString(),mode:cfg.mode,partnerId:cfg.partnerId};
    saveStore(s);
    res.json({ok:true,...safeShopeeStatus(s.shopeeAuth,cfg)});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.get('/api/shopee/test-shop', mustLogin, async(req,res)=>{
  try{
    const s=loadStore();
    const auth=s.shopeeAuth||{};
    const cfg=shopeeConfig(baseUrl(req));
    const data=await getShopeeShopInfo(cfg,{accessToken:auth.accessToken,shopId:auth.shopId});
    res.json({ok:true,shopId:auth.shopId,response:data});
  }catch(e){res.status(400).json({error:String(e.message||e)});}
});

app.post('/api/settings', mustLogin, (req,res)=>{
  const s=loadStore();
  const old=s.settings||{};
  const current=effectiveSettings(old);
  s.settings={
    ...old,
    brandName:String(req.body.brandName||current.brandName||'REDEACHADOS BR').trim(),
    shopeeStoreUrl:String(req.body.shopeeStoreUrl??current.shopeeStoreUrl??'').trim(),
    defaultPrivacy:String(req.body.defaultPrivacy||current.defaultPrivacy||'SELF_ONLY'),
    defaultHashtagCount:Math.max(3,Math.min(10,Number(req.body.defaultHashtagCount||current.defaultHashtagCount||6))),
    geminiModel:String(req.body.geminiModel||current.geminiModel||'gemini-3.5-flash-lite').trim(),
    tiktokClientKey:String(req.body.tiktokClientKey||'').trim() || old.tiktokClientKey || '',
    tiktokClientSecret:String(req.body.tiktokClientSecret||'').trim() || old.tiktokClientSecret || '',
    geminiApiKey:String(req.body.geminiApiKey||'').trim() || old.geminiApiKey || '',
    instagramAccessToken:String(req.body.instagramAccessToken||'').trim() || old.instagramAccessToken || '',
    instagramUserId:String(req.body.instagramUserId||current.instagramUserId||'17841480462088551').trim(),
    metaGraphVersion:String(req.body.metaGraphVersion||current.metaGraphVersion||'v26.0').trim(),
    instagramDmEnabled:req.body.instagramDmEnabled===undefined?Boolean(current.instagramDmEnabled):Boolean(req.body.instagramDmEnabled),
    instagramDmKeyword:String(req.body.instagramDmKeyword??current.instagramDmKeyword??'QUERO').trim().slice(0,40)||'QUERO',
    instagramDmTemplate:String(req.body.instagramDmTemplate??current.instagramDmTemplate??'Oi! 👋 Aqui está o link do produto que você pediu: {link}').trim().slice(0,900),
    instagramPublicReplyEnabled:req.body.instagramPublicReplyEnabled===undefined?Boolean(current.instagramPublicReplyEnabled):Boolean(req.body.instagramPublicReplyEnabled),
    instagramPublicReplyTemplate:String(req.body.instagramPublicReplyTemplate??current.instagramPublicReplyTemplate??'Enviei o link no seu Direct ✅').trim().slice(0,250),
    metaPageId:String(req.body.metaPageId??current.metaPageId??'').trim(),
    metaAdAccountId:String(req.body.metaAdAccountId??current.metaAdAccountId??'').trim(),
    metaAdSetId:String(req.body.metaAdSetId??current.metaAdSetId??'').trim(),
    metaAdsAccessToken:String(req.body.metaAdsAccessToken||'').trim() || old.metaAdsAccessToken || '',
    metaWebhookVerifyToken:String(req.body.metaWebhookVerifyToken||'').trim() || old.metaWebhookVerifyToken || '',
    metaCreateAdDefault:req.body.metaCreateAdDefault===undefined?Boolean(current.metaCreateAdDefault):Boolean(req.body.metaCreateAdDefault),
    metaAdDefaultStatus:String(req.body.metaAdDefaultStatus||current.metaAdDefaultStatus||'PAUSED').toUpperCase()==='ACTIVE'?'ACTIVE':'PAUSED',
    instagramTokenManaged:String(req.body.instagramAccessToken||'').trim()?false:Boolean(old.instagramTokenManaged),
    instagramTokenExpiresAt:String(req.body.instagramAccessToken||'').trim()?0:Number(old.instagramTokenExpiresAt||0),
    instagramTokenLastCheckedAt:String(req.body.instagramAccessToken||'').trim()?0:Number(old.instagramTokenLastCheckedAt||0),
    instagramTokenLastRefreshAt:Number(old.instagramTokenLastRefreshAt||0)
  };
  saveStore(s);
  res.json({ok:true,settings:safeSettings(s.settings)});
});




const DAY_SEC=24*60*60;
let instagramMaintenancePromise=null;
function metaAppCredentials(){ return {appId:envText('META_APP_ID'),appSecret:envText('META_APP_SECRET')}; }
function graphVersionFrom(cfg){ return /^v\d+\.\d+$/.test(cfg.metaGraphVersion)?cfg.metaGraphVersion:'v26.0'; }
async function debugMetaToken(token,cfg){
  const {appId,appSecret}=metaAppCredentials();
  if(!appId||!appSecret||!token) return null;
  const version=graphVersionFrom(cfg);
  const u=new URL(`https://graph.facebook.com/${version}/debug_token`);
  u.searchParams.set('input_token',token);
  u.searchParams.set('access_token',`${appId}|${appSecret}`);
  const r=await fetch(u,{headers:{Accept:'application/json'}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.error) throw new Error(d.error?.message||`Meta debug_token HTTP ${r.status}`);
  return d.data||null;
}
async function exchangeMetaLongLived(token,cfg){
  const {appId,appSecret}=metaAppCredentials();
  if(!appId||!appSecret) throw new Error('Configure META_APP_ID e META_APP_SECRET no Environment do Render.');
  const version=graphVersionFrom(cfg);
  const u=`https://graph.facebook.com/${version}/oauth/access_token`;
  const body=new URLSearchParams({grant_type:'fb_exchange_token',client_id:appId,client_secret:appSecret,fb_exchange_token:token});
  const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.error||!d.access_token) throw new Error(d.error?.message||`Não foi possível converter o token para longa duração (HTTP ${r.status}).`);
  return d;
}
async function maintainInstagramToken({force=false}={}){
  if(instagramMaintenancePromise) return instagramMaintenancePromise;
  instagramMaintenancePromise=(async()=>{
    const s=loadStore();
    const cfg=effectiveSettings(s.settings||{});
    const creds=metaAppCredentials();
    if(!cfg.instagramAccessToken) return {configured:false,automationConfigured:Boolean(creds.appId&&creds.appSecret),message:'Token do Instagram não configurado.'};
    if(!creds.appId||!creds.appSecret) return {configured:true,automationConfigured:false,managed:Boolean(cfg.instagramTokenManaged),expiresAt:Number(cfg.instagramTokenExpiresAt||0),message:'Adicione META_APP_ID e META_APP_SECRET no Render para ativar a manutenção automática.'};
    const nowSec=Math.floor(Date.now()/1000);
    let info;
    try{ info=await debugMetaToken(cfg.instagramAccessToken,cfg); }
    catch(e){ return {configured:true,automationConfigured:true,managed:Boolean(cfg.instagramTokenManaged),expiresAt:Number(cfg.instagramTokenExpiresAt||0),error:e.message}; }
    if(!info?.is_valid){
      return {configured:true,automationConfigured:true,managed:Boolean(cfg.instagramTokenManaged),expiresAt:Number(info?.expires_at||cfg.instagramTokenExpiresAt||0),valid:false,error:'O token da Meta está inválido ou expirado. Gere um novo token uma vez e salve; o Publisher fará a conversão automática para longa duração.'};
    }
    let expiresAt=Number(info.expires_at||0);
    const remaining=expiresAt?expiresAt-nowSec:999999999;
    const lastRefresh=Number(s.settings?.instagramTokenLastRefreshAt||0);
    const shouldExchange=force || (!cfg.instagramTokenManaged && expiresAt>0 && remaining < 3*DAY_SEC) || (cfg.instagramTokenManaged && expiresAt>0 && remaining < 7*DAY_SEC && nowSec-lastRefresh>DAY_SEC);
    let refreshed=false, refreshNote='';
    if(shouldExchange){
      try{
        const ex=await exchangeMetaLongLived(cfg.instagramAccessToken,cfg);
        const newToken=String(ex.access_token||'').trim();
        const newInfo=await debugMetaToken(newToken,cfg);
        const newExp=Number(newInfo?.expires_at||0);
        if(newInfo?.is_valid && newToken){
          s.settings={...(s.settings||{}),instagramAccessToken:newToken,instagramTokenManaged:true,instagramTokenExpiresAt:newExp,instagramTokenLastCheckedAt:nowSec,instagramTokenLastRefreshAt:nowSec};
          saveStore(s); refreshed=true; expiresAt=newExp;
          refreshNote=(newExp && (!info.expires_at || newExp>Number(info.expires_at)+DAY_SEC))?'Token convertido/estendido automaticamente.':'Token validado; a Meta não ampliou a validade nesta tentativa.';
        }
      }catch(e){ refreshNote=`Não foi possível estender automaticamente agora: ${e.message}`; }
    }else{
      s.settings={...(s.settings||{}),instagramTokenManaged:Boolean(cfg.instagramTokenManaged),instagramTokenExpiresAt:expiresAt,instagramTokenLastCheckedAt:nowSec,instagramTokenLastRefreshAt:lastRefresh};
      saveStore(s);
    }
    return {configured:true,automationConfigured:true,managed:Boolean(s.settings?.instagramTokenManaged),valid:true,expiresAt:Number(expiresAt||0),refreshed,refreshNote,scopes:info.scopes||[],message:refreshNote||'Token válido. O Publisher verifica a validade automaticamente antes de publicar.'};
  })().finally(()=>{instagramMaintenancePromise=null;});
  return instagramMaintenancePromise;
}

function instagramSecret(){ return process.env.SESSION_SECRET || 'redeachados-dev-secret'; }
function instagramMediaSig(kind,id,exp){
  return crypto.createHmac('sha256',instagramSecret()).update(`${kind}:${id}:${exp}`).digest('hex');
}
function instagramPublicMediaUrl(req,kind,id,ttlSec=1800){
  const exp=Math.floor(Date.now()/1000)+ttlSec;
  const sig=instagramMediaSig(kind,id,exp);
  return `${baseUrl(req)}/media/instagram/${encodeURIComponent(kind)}/${encodeURIComponent(id)}?exp=${exp}&sig=${sig}`;
}
function validInstagramMediaSig(kind,id,exp,sig){
  const n=Number(exp||0); if(!Number.isFinite(n)||n<Math.floor(Date.now()/1000)||n>Math.floor(Date.now()/1000)+7200) return false;
  const expected=instagramMediaSig(kind,id,n);
  try{return crypto.timingSafeEqual(Buffer.from(String(sig||'')),Buffer.from(expected));}catch{return false;}
}
async function pipeRemoteResponse(r,res,cache='public, max-age=300'){
  const ct=remoteMime(r);
  res.status(r.status===206?206:200);
  res.setHeader('Content-Type',ct);
  res.setHeader('Accept-Ranges',r.headers.get('accept-ranges')||'bytes');
  const len=r.headers.get('content-length'); if(len) res.setHeader('Content-Length',len);
  const cr=r.headers.get('content-range'); if(cr) res.setHeader('Content-Range',cr);
  res.setHeader('Cache-Control',cache);
  res.setHeader('Content-Disposition','inline');
  if(!r.body) return res.end();
  Readable.fromWeb(r.body).on('error',()=>{try{res.destroy();}catch{}}).pipe(res);
}
app.get('/media/instagram/:kind/:id', async(req,res)=>{
  try{
    const kind=String(req.params.kind||''), id=String(req.params.id||'');
    if(!validInstagramMediaSig(kind,id,req.query.exp,req.query.sig)) return res.status(403).send('Link expirado ou inválido.');
    const range=String(req.headers.range||'').trim();
    if(kind==='wedrop'){
      if(!/^[A-Za-z0-9_-]{8,200}$/.test(id)) return res.status(400).send('ID inválido.');
      const prepared=await prepareDriveVideo(id,'instagram-redeachados.mp4');
      return serveLocalVideo(req,res,prepared.path,{cache:'public, max-age=600',name:'instagram-redeachados.mp4'});
    }
    if(kind==='upload'){
      const filename=path.basename(id); const full=path.join(UPLOAD_DIR,filename);
      if(!fs.existsSync(full)) return res.status(404).send('Arquivo não encontrado.');
      const st=fs.statSync(full); const ext=path.extname(filename).toLowerCase(); const ct=ext==='.mov'?'video/quicktime':ext==='.webm'?'video/webm':'video/mp4';
      res.setHeader('Content-Type',ct);res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','public, max-age=300');res.setHeader('Content-Disposition','inline');
      if(range){
        const m=range.match(/bytes=(\d*)-(\d*)/); if(m){const start=Number(m[1]||0),end=Math.min(Number(m[2]||st.size-1),st.size-1); if(start<=end){res.status(206);res.setHeader('Content-Range',`bytes ${start}-${end}/${st.size}`);res.setHeader('Content-Length',end-start+1);return fs.createReadStream(full,{start,end}).pipe(res);}}
      }
      res.setHeader('Content-Length',st.size); return fs.createReadStream(full).pipe(res);
    }
    res.status(404).send('Tipo de mídia inválido.');
  }catch(e){if(!res.headersSent)res.status(400).send(`Falha ao servir vídeo: ${e.message}`);}
});
async function instagramGraph(pathname,{method='GET',params={}}={}){
  await maintainInstagramToken().catch(()=>null);
  const cfg=effectiveSettings(loadStore().settings||{});
  if(!cfg.instagramAccessToken||!cfg.instagramUserId) throw new Error('Configure o token do Instagram e o Instagram Business Account ID.');
  const version=/^v\d+\.\d+$/.test(cfg.metaGraphVersion)?cfg.metaGraphVersion:'v26.0';
  const url=new URL(`https://graph.facebook.com/${version}/${String(pathname).replace(/^\//,'')}`);
  const body=new URLSearchParams();
  for(const [k,v] of Object.entries(params||{})){if(v!==undefined&&v!==null&&String(v)!=='')body.set(k,String(v));}
  body.set('access_token',cfg.instagramAccessToken);
  let r;
  if(method==='GET'){
    for(const [k,v] of body)url.searchParams.set(k,v);
    r=await fetchWithRetry(url,{headers:{Accept:'application/json'}},'Meta Graph');
  } else {
    r=await fetchWithRetry(url,{method,headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body},'Meta Graph');
  }
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.error){const e=d.error||{};throw new Error([e.message||`Meta HTTP ${r.status}`,e.code?`Código ${e.code}`:'',e.error_subcode?`Subcódigo ${e.error_subcode}`:''].filter(Boolean).join(' | '));}
  return d;
}
async function instagramAccountInfo(){
  const cfg=effectiveSettings(loadStore().settings||{});
  return instagramGraph(`${cfg.instagramUserId}`,{params:{fields:'id,username'}});
}
async function publishInstagramReel({req,videoUrl,caption}){
  const cfg=effectiveSettings(loadStore().settings||{});
  const created=await instagramGraph(`${cfg.instagramUserId}/media`,{method:'POST',params:{media_type:'REELS',video_url:videoUrl,caption:String(caption||'').slice(0,2200),share_to_feed:'true'}});
  const creationId=created.id; if(!creationId) throw new Error('A Meta não retornou o ID do container do Reel.');
  let last={status_code:'IN_PROGRESS',status:'Processando'};
  for(let i=0;i<18;i++){
    await new Promise(r=>setTimeout(r,i===0?2500:3500));
    last=await instagramGraph(`${creationId}`,{params:{fields:'status_code,status'}});
    if(last.status_code==='FINISHED') break;
    if(['ERROR','EXPIRED'].includes(last.status_code)) throw new Error(last.status||`Container do Instagram: ${last.status_code}`);
  }
  if(last.status_code!=='FINISHED') return {ok:true,pending:true,creationId,status:last.status_code||'IN_PROGRESS',message:'O Instagram ainda está processando o Reel. Tente finalizar em alguns segundos.'};
  const published=await instagramGraph(`${cfg.instagramUserId}/media_publish`,{method:'POST',params:{creation_id:creationId}});
  return {ok:true,pending:false,creationId,mediaId:published.id,status:'PUBLISHED',message:'Reel publicado no Instagram.'};
}

async function publishInstagramStory({req,videoUrl}){
  const cfg=effectiveSettings(loadStore().settings||{});
  const created=await instagramGraph(`${cfg.instagramUserId}/media`,{method:'POST',params:{media_type:'STORIES',video_url:videoUrl}});
  const creationId=created.id;
  if(!creationId) throw new Error('A Meta não retornou o ID do container do Story.');
  let last={status_code:'IN_PROGRESS',status:'Processando'};
  for(let i=0;i<18;i++){
    await new Promise(r=>setTimeout(r,i===0?2500:3500));
    last=await instagramGraph(`${creationId}`,{params:{fields:'status_code,status'}});
    if(last.status_code==='FINISHED') break;
    if(['ERROR','EXPIRED'].includes(last.status_code)) throw new Error(last.status||`Container do Story: ${last.status_code}`);
  }
  if(last.status_code!=='FINISHED') return {ok:true,pending:true,creationId,status:last.status_code||'IN_PROGRESS',message:'O Instagram ainda está processando o Story. Tente finalizar em alguns segundos.'};
  const published=await instagramGraph(`${cfg.instagramUserId}/media_publish`,{method:'POST',params:{creation_id:creationId}});
  return {ok:true,pending:false,creationId,mediaId:published.id,status:'PUBLISHED',message:'Story publicado automaticamente no Instagram (sem adesivo de link).'};
}

function normalizeAdAccountId(v=''){ return String(v||'').trim().replace(/^act_/i,''); }
function renderCommerceTemplate(template,ctx={}){
  return String(template||'')
    .replace(/\{link\}/gi,String(ctx.link||''))
    .replace(/\{product\}/gi,String(ctx.product||''))
    .replace(/\{keyword\}/gi,String(ctx.keyword||''))
    .trim();
}
function keywordMatches(text,keyword){
  const hay=normalizeText(text), needle=normalizeText(keyword); if(!hay||!needle)return false;
  return (` ${hay} `).includes(` ${needle} `) || hay===needle;
}
async function metaAdsGraph(pathname,{method='GET',params={}}={}){
  const cfg=effectiveSettings(loadStore().settings||{});
  const token=cfg.metaAdsAccessToken||cfg.instagramAccessToken;
  if(!token) throw new Error('Configure um token da Meta com ads_management para criar anúncios.');
  const version=graphVersionFrom(cfg);
  const url=new URL(`https://graph.facebook.com/${version}/${String(pathname).replace(/^\//,'')}`);
  const body=new URLSearchParams();
  for(const [k,v] of Object.entries(params||{})){ if(v!==undefined&&v!==null&&String(v)!=='') body.set(k,String(v)); }
  body.set('access_token',token);
  let r;
  if(method==='GET'){ for(const [k,v] of body) url.searchParams.set(k,v); r=await fetch(url,{headers:{Accept:'application/json'}}); }
  else r=await fetch(url,{method,headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.error){ const e=d.error||{}; throw new Error([e.message||`Meta Ads HTTP ${r.status}`,e.code?`Código ${e.code}`:'',e.error_subcode?`Subcódigo ${e.error_subcode}`:''].filter(Boolean).join(' | ')); }
  return d;
}
async function createMetaAdForReel({mediaId,shopeeUrl,product,status='PAUSED'}={}){
  const cfg=effectiveSettings(loadStore().settings||{});
  const accountId=normalizeAdAccountId(cfg.metaAdAccountId), adSetId=String(cfg.metaAdSetId||'').trim(), pageId=String(cfg.metaPageId||'').trim();
  if(!mediaId) throw new Error('O Reel ainda não tem Media ID.');
  if(!shopeeUrl) throw new Error('Informe o link do produto Shopee para criar o anúncio.');
  if(!accountId||!adSetId||!pageId||!cfg.instagramUserId) throw new Error('Configure Page ID, Ad Account ID e Ad Set ID em Instagram / Meta.');
  const stamp=new Date().toISOString().replace('T',' ').slice(0,16);
  const name=`RA | ${String(product||'Reel').slice(0,70)} | ${stamp}`;
  const creative=await metaAdsGraph(`act_${accountId}/adcreatives`,{method:'POST',params:{
    name, object_id:pageId, instagram_user_id:cfg.instagramUserId, source_instagram_media_id:mediaId,
    call_to_action:JSON.stringify({type:'SHOP_NOW',value:{link:shopeeUrl}})
  }});
  if(!creative.id) throw new Error('A Meta não retornou o ID do criativo do anúncio.');
  const ad=await metaAdsGraph(`act_${accountId}/ads`,{method:'POST',params:{
    name, adset_id:adSetId, creative:JSON.stringify({creative_id:creative.id}), status:String(status).toUpperCase()==='ACTIVE'?'ACTIVE':'PAUSED'
  }});
  if(!ad.id) throw new Error('A Meta não retornou o ID do anúncio.');
  return {ok:true,creativeId:creative.id,adId:ad.id,status:String(status).toUpperCase()==='ACTIVE'?'ACTIVE':'PAUSED'};
}
function inputBool(v,fallback=false){ if(v===undefined||v===null||v==='')return fallback; if(typeof v==='boolean')return v; return ['1','true','yes','on'].includes(String(v).trim().toLowerCase()); }
function normalizeCommerceOptions(body={},cfg=effectiveSettings(loadStore().settings||{})){
  const dmEnabled=inputBool(body.dmEnabled,Boolean(cfg.instagramDmEnabled));
  const keyword=String(body.dmKeyword||cfg.instagramDmKeyword||'QUERO').trim().slice(0,40)||'QUERO';
  const publicReplyEnabled=inputBool(body.publicReplyEnabled,Boolean(cfg.instagramPublicReplyEnabled));
  return {
    dmEnabled, keyword, publicReplyEnabled,
    dmTemplate:String(body.dmTemplate||cfg.instagramDmTemplate||'Oi! 👋 Aqui está o link do produto que você pediu: {link}').trim().slice(0,900),
    publicReplyTemplate:String(body.publicReplyTemplate||cfg.instagramPublicReplyTemplate||'Enviei o link no seu Direct ✅').trim().slice(0,250),
    sku:String(body.sku||'').trim().slice(0,128),
    product:String(body.product||'').trim().slice(0,180), shopeeUrl:String(body.shopeeUrl||'').trim(),
    createAd:inputBool(body.createAd,Boolean(cfg.metaCreateAdDefault)),
    adStatus:String(body.adStatus||cfg.metaAdDefaultStatus||'PAUSED').toUpperCase()==='ACTIVE'?'ACTIVE':'PAUSED'
  };
}

async function registerInstagramCommerce(result,body={}){
  const options=normalizeCommerceOptions(body);
  if((options.dmEnabled||options.createAd)&&!options.shopeeUrl){
    options.dmEnabled=false; options.createAd=false; options.warning='Link do produto não informado; Direct automático e anúncio foram desativados para este Reel.';
  }
  const rule=upsertInstagramRule({creationId:result.creationId||'',mediaId:result.mediaId||'',options});
  let supabaseSync={configured:supabaseCommerceConfig().configured,synced:false,reason:result.mediaId?'NOT_ATTEMPTED':'MEDIA_ID_PENDING'};
  if(result.mediaId){
    try{supabaseSync=await syncInstagramRuleToSupabase(rule);}
    catch(e){supabaseSync={configured:true,synced:false,error:e.message};options.warning=[options.warning,e.message].filter(Boolean).join(' | ');}
  }
  let ad=null,adError='';
  if(result.mediaId&&options.createAd){
    try{ad=await createMetaAdForReel({mediaId:result.mediaId,shopeeUrl:options.shopeeUrl,product:options.product,status:options.adStatus});rule.adId=ad.adId;rule.creativeId=ad.creativeId;rule.adStatus=ad.status;rule.adCreatedAt=now();upsertInstagramRule({creationId:rule.creationId,mediaId:rule.mediaId,options:rule});}
    catch(e){adError=e.message;rule.adError=e.message;upsertInstagramRule({creationId:rule.creationId,mediaId:rule.mediaId,options:rule});}
  }
  return {...result,commerce:{dmEnabled:Boolean(options.dmEnabled),keyword:options.keyword,createAd:Boolean(options.createAd),ad,adError,supabaseSync,warning:options.warning||''}};
}
function updateInstagramHistoryAfterFinalize(creationId,mediaId,commerce={}){
  const s=loadStore();const row=(s.history||[]).find(x=>x.platform==='instagram'&&x.creationId===creationId);
  if(row){row.mediaId=mediaId;row.status='PUBLISHED';if(commerce?.ad?.adId)row.adId=commerce.ad.adId;if(commerce?.adError)row.adError=commerce.adError;saveStore(s);}
}
function upsertInstagramRule({creationId='',mediaId='',options={}}={}){
  const s=loadStore(); s.instagramRules=Array.isArray(s.instagramRules)?s.instagramRules:[];
  let r=s.instagramRules.find(x=>(mediaId&&x.mediaId===mediaId)||(creationId&&x.creationId===creationId));
  if(!r){ r={id:crypto.randomUUID(),createdAt:now()}; s.instagramRules.unshift(r); }
  Object.assign(r,{creationId:creationId||r.creationId||'',mediaId:mediaId||r.mediaId||'',updatedAt:now(),...options});
  s.instagramRules=s.instagramRules.slice(0,500); saveStore(s); return r;
}
function finishInstagramRule(creationId,mediaId){
  const s=loadStore(); s.instagramRules=Array.isArray(s.instagramRules)?s.instagramRules:[];
  const r=s.instagramRules.find(x=>x.creationId===creationId); if(r){r.mediaId=mediaId;r.updatedAt=now();saveStore(s);} return r||null;
}
function findInstagramRule(mediaId){ const s=loadStore(); return (s.instagramRules||[]).find(x=>x.mediaId===mediaId&&x.dmEnabled); }
function hasDmLog(commentId){ const s=loadStore(); return (s.instagramDmLog||[]).some(x=>x.commentId===commentId&&x.status==='SENT'); }
function saveDmLog(row){ const s=loadStore(); s.instagramDmLog=Array.isArray(s.instagramDmLog)?s.instagramDmLog:[]; s.instagramDmLog.unshift({id:crypto.randomUUID(),createdAt:now(),...row}); s.instagramDmLog=s.instagramDmLog.slice(0,1000); saveStore(s); }
async function sendInstagramPrivateReply(commentId,message){
  const cfg=effectiveSettings(loadStore().settings||{});
  try{
    return await instagramGraph(`${cfg.instagramUserId}/messages`,{method:'POST',params:{recipient:JSON.stringify({comment_id:commentId}),message:JSON.stringify({text:message})}});
  }catch(primaryError){
    try{ return await instagramGraph(`${commentId}/private_replies`,{method:'POST',params:{message}}); }
    catch(fallbackError){ throw new Error(`${primaryError.message} | Fallback private_replies: ${fallbackError.message}`); }
  }
}
async function replyInstagramComment(commentId,message){ return instagramGraph(`${commentId}/replies`,{method:'POST',params:{message}}); }
function verifyMetaWebhookSignature(req){
  const secret=envText('META_APP_SECRET'); if(!secret)return true;
  const sig=String(req.get('x-hub-signature-256')||''); if(!sig.startsWith('sha256='))return false;
  const expected='sha256='+crypto.createHmac('sha256',secret).update(req.rawBody||Buffer.alloc(0)).digest('hex');
  try{return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}
}
function extractInstagramCommentEvents(payload){
  const out=[];
  for(const entry of payload?.entry||[]){
    for(const change of entry?.changes||[]){
      if(change?.field && !['comments','feed'].includes(change.field))continue;
      const v=change?.value||{}; const commentId=String(v.id||v.comment_id||'').trim();
      if(!commentId)continue;
      out.push({commentId,text:String(v.text||v.message||''),mediaId:String(v.media?.id||v.media_id||v.media?.media_id||''),username:String(v.from?.username||v.from?.name||v.username||''),fromId:String(v.from?.id||v.user_id||'')});
    }
  }
  return out;
}
async function processInstagramCommentEvent(ev){
  try{
    if(!ev.commentId||hasDmLog(ev.commentId))return;
    let mediaId=ev.mediaId, text=ev.text, username=ev.username;
    if(!mediaId||!text){
      try{const d=await instagramGraph(ev.commentId,{params:{fields:'id,text,from,media'}});mediaId=mediaId||String(d.media?.id||'');text=text||String(d.text||'');username=username||String(d.from?.username||d.from?.name||'');}catch{}
    }
    const rule=findInstagramRule(mediaId); if(!rule||!keywordMatches(text,rule.keyword))return;
    const message=renderCommerceTemplate(rule.dmTemplate,{link:rule.shopeeUrl,product:rule.product,keyword:rule.keyword});
    if(!message||!rule.shopeeUrl){saveDmLog({commentId:ev.commentId,mediaId,status:'SKIPPED',reason:'Regra sem link/mensagem',username});return;}
    const dm=await sendInstagramPrivateReply(ev.commentId,message);
    if(rule.publicReplyEnabled&&rule.publicReplyTemplate){ try{await replyInstagramComment(ev.commentId,renderCommerceTemplate(rule.publicReplyTemplate,{link:rule.shopeeUrl,product:rule.product,keyword:rule.keyword}));}catch{} }
    saveDmLog({commentId:ev.commentId,mediaId,status:'SENT',messageId:String(dm?.message_id||dm?.id||''),username,keyword:rule.keyword});
  }catch(e){ saveDmLog({commentId:ev.commentId,mediaId:ev.mediaId||'',status:'ERROR',error:e.message,username:ev.username||''}); }
}
// V5.5.6 — ponte pública Cloudflare -> Render -> Supabase Edge Function.
// O Worker continua sendo o callback da Meta; esta rota evita o erro DNS 530/1016
// observado em subrequests diretos Cloudflare -> *.supabase.co.
app.get('/api/instagram/webhook',(req,res)=>{
  const cfg=effectiveSettings(loadStore().settings||{});
  const mode=String(req.query['hub.mode']||''), token=String(req.query['hub.verify_token']||''), challenge=String(req.query['hub.challenge']||'');
  if(mode==='subscribe'&&cfg.metaWebhookVerifyToken&&token===cfg.metaWebhookVerifyToken)return res.status(200).type('text/plain').send(challenge);
  res.status(403).type('text/plain').send('Webhook verification failed');
});
app.post('/api/instagram/webhook',async(req,res)=>{
  if(!verifyMetaWebhookSignature(req))return res.status(401).json({ok:false,error:'Invalid Meta webhook signature'});
  const target=supabaseInstagramWebhookUrl();
  if(!target)return res.status(503).json({ok:false,error:'SUPABASE_URL/SUPABASE_INSTAGRAM_WEBHOOK_URL not configured'});
  const rawBody=req.rawBody||Buffer.from(JSON.stringify(req.body||{}));
  const headers={
    'Content-Type':String(req.get('content-type')||'application/json'),
    'X-RedeAchados-Bridge':'render-v5.5.6'
  };
  const sig=req.get('x-hub-signature');
  const sig256=req.get('x-hub-signature-256');
  if(sig)headers['X-Hub-Signature']=sig;
  if(sig256)headers['X-Hub-Signature-256']=sig256;
  const targetUrl=new URL(target);
  targetUrl.search=req.originalUrl.includes('?')?req.originalUrl.slice(req.originalUrl.indexOf('?')):'';
  try{
    console.log(`[instagram-webhook-bridge] POST -> ${targetUrl.toString()} bytes=${rawBody.length}`);
    const upstream=await fetchWithRetry(targetUrl.toString(),{method:'POST',headers,body:rawBody},'Instagram webhook bridge',{attempts:3,timeoutMs:20000});
    const responseBody=await upstream.text();
    console.log(`[instagram-webhook-bridge] Supabase HTTP ${upstream.status} ${responseBody.slice(0,300)}`);
    res.status(upstream.status);
    res.set('Content-Type',upstream.headers.get('content-type')||'text/plain; charset=utf-8');
    return res.send(responseBody||'OK');
  }catch(error){
    const details=networkErrorDetails(error);
    console.error('[instagram-webhook-bridge] erro:',details);
    return res.status(502).json({ok:false,error:'Render -> Supabase bridge failed',details});
  }
});

app.get('/webhooks/meta/instagram',(req,res)=>{
  const cfg=effectiveSettings(loadStore().settings||{}); const mode=String(req.query['hub.mode']||''), token=String(req.query['hub.verify_token']||''), challenge=String(req.query['hub.challenge']||'');
  if(mode==='subscribe'&&cfg.metaWebhookVerifyToken&&token===cfg.metaWebhookVerifyToken)return res.status(200).send(challenge);
  res.sendStatus(403);
});
app.post('/webhooks/meta/instagram',(req,res)=>{
  if(!verifyMetaWebhookSignature(req))return res.sendStatus(401);
  const events=extractInstagramCommentEvents(req.body);res.sendStatus(200);
  for(const ev of events)Promise.resolve().then(()=>processInstagramCommentEvent(ev)).catch(()=>{});
});
app.get('/api/instagram/commerce-status',mustLogin,async(req,res)=>{
  const s=loadStore(), cfg=effectiveSettings(s.settings||{});
  const supabaseConfigured=supabaseCommerceConfig().configured;
  const localWebhookConfigured=Boolean(cfg.metaWebhookVerifyToken);
  res.json({
    dmConfigured:Boolean(cfg.instagramAccessToken&&cfg.instagramUserId&&(supabaseConfigured||localWebhookConfigured)),
    supabaseConfigured,
    localWebhookConfigured,
    adsConfigured:Boolean((cfg.metaAdsAccessToken||cfg.instagramAccessToken)&&cfg.metaAdAccountId&&cfg.metaAdSetId&&cfg.metaPageId&&cfg.instagramUserId),
    webhookUrl:`${baseUrl(req)}/webhooks/meta/instagram`, keyword:cfg.instagramDmKeyword,
    rules:(s.instagramRules||[]).filter(x=>x.mediaId).length, sent:(s.instagramDmLog||[]).filter(x=>x.status==='SENT').length,
    recentDm:(s.instagramDmLog||[]).slice(0,10)
  });
});
app.post('/api/instagram/sync-latest-reel',mustLogin,async(req,res)=>{
  let stage='PREPARAR';
  try{
    const options=normalizeCommerceOptions(req.body||{});
    if(!options.shopeeUrl)return res.status(400).json({error:'Informe o link do produto Shopee antes de sincronizar.',stage});

    const suppliedMediaId=String(req.body?.mediaId||'').trim();
    const s=loadStore();
    const localRules=Array.isArray(s.instagramRules)?s.instagramRules:[];
    const localHistory=Array.isArray(s.history)?s.history:[];
    const localRule=localRules.find(x=>x?.mediaId);
    const localPublished=localHistory.find(x=>x?.platform==='instagram'&&x?.mediaId);

    let reel=null;
    let source='';
    if(suppliedMediaId){
      reel={id:suppliedMediaId};
      source='BROWSER_LAST_MEDIA_ID';
    } else if(localRule?.mediaId){
      reel={id:String(localRule.mediaId),permalink:localRule.permalink||'',timestamp:localRule.updatedAt||localRule.createdAt||''};
      source='LOCAL_RULE';
    } else if(localPublished?.mediaId){
      reel={id:String(localPublished.mediaId),permalink:localPublished.permalink||'',timestamp:localPublished.createdAt||''};
      source='LOCAL_HISTORY';
    } else {
      stage='META_LISTAR_REELS';
      const cfg=effectiveSettings(s.settings||{});
      const recent=await instagramGraph(`${cfg.instagramUserId}/media`,{params:{fields:'id,media_type,media_product_type,caption,timestamp,permalink',limit:'10'}});
      const items=Array.isArray(recent?.data)?recent.data:[];
      reel=items.find(x=>String(x.media_product_type||'').toUpperCase()==='REELS') || items.find(x=>String(x.media_type||'').toUpperCase()==='VIDEO');
      source='META_LATEST_REEL';
    }
    if(!reel?.id)return res.status(404).json({error:'Não encontrei um Reel recente nesta conta do Instagram.',stage,source});

    stage='SUPABASE_UPSERT';
    const rule=upsertInstagramRule({mediaId:String(reel.id),options});
    const supabaseSync=await syncInstagramRuleToSupabase(rule);
    console.info('[SYNC-LATEST-REEL] OK',{mediaId:String(reel.id),source,stage});
    res.json({ok:true,mediaId:String(reel.id),permalink:reel.permalink||'',timestamp:reel.timestamp||'',source,supabaseSync});
  }catch(e){
    const details=networkErrorDetails(e);
    console.error('[SYNC-LATEST-REEL] ERROR',{stage,error:details});
    res.status(400).json({error:e.message||details,stage,details});
  }
});

app.get('/api/meta/ads/status',mustLogin,async(_req,res)=>{
  try{
    const cfg=effectiveSettings(loadStore().settings||{}), accountId=normalizeAdAccountId(cfg.metaAdAccountId);
    if(!accountId||!cfg.metaAdSetId)return res.json({configured:false,error:'Informe Ad Account ID e Ad Set ID.'});
    const [account,adset]=await Promise.all([
      metaAdsGraph(`act_${accountId}`,{params:{fields:'id,name,account_status,currency,timezone_name'}}),
      metaAdsGraph(cfg.metaAdSetId,{params:{fields:'id,name,status,effective_status,campaign{id,name,status}'}})
    ]);
    res.json({configured:true,connected:true,account,adset});
  }catch(e){res.json({configured:true,connected:false,error:e.message});}
});

app.get('/api/instagram/token-status',mustLogin,async(_req,res)=>{try{res.json(await maintainInstagramToken());}catch(e){res.status(400).json({error:e.message});}});
app.post('/api/instagram/token-maintain',mustLogin,async(_req,res)=>{try{res.json(await maintainInstagramToken({force:true}));}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/instagram/status',mustLogin,async(_req,res)=>{try{const cfg=effectiveSettings(loadStore().settings||{});if(!cfg.instagramAccessToken||!cfg.instagramUserId)return res.json({configured:false,userId:cfg.instagramUserId||''});const info=await instagramAccountInfo();res.json({configured:true,connected:true,...info});}catch(e){res.json({configured:true,connected:false,error:e.message});}});
app.post('/api/instagram/publish-remote',mustLogin,async(req,res)=>{
  try{
    const id=String(req.body.remoteVideoId||'').trim(); if(!/^[A-Za-z0-9_-]{8,200}$/.test(id))return res.status(400).json({error:'ID do vídeo WeDrop inválido.'});
    await prepareDriveVideo(id,String(req.body.filename||'instagram-reel.mp4'));
    const caption=String(req.body.caption||'').trim(); const videoUrl=instagramPublicMediaUrl(req,'wedrop',id,3600);
    let result=await publishInstagramReel({req,videoUrl,caption}); result=await registerInstagramCommerce(result,req.body||{});
    const o=normalizeCommerceOptions(req.body||{}),s=loadStore();s.history.unshift({id:crypto.randomUUID(),platform:'instagram',mediaId:result.mediaId||'',creationId:result.creationId||'',filename:String(req.body.filename||'video-wedrop'),product:o.product,shopeeUrl:o.shopeeUrl,caption,dmKeyword:o.keyword,adId:result.commerce?.ad?.adId||'',status:result.status||'PROCESSING',createdAt:now()});s.history=s.history.slice(0,100);saveStore(s);
    res.json(result);
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/instagram/publish',mustLogin,upload.single('video'),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'Envie um vídeo.'});
    const caption=String(req.body.caption||'').trim(); const filename=path.basename(req.file.path); const videoUrl=instagramPublicMediaUrl(req,'upload',filename,3600);
    let result=await publishInstagramReel({req,videoUrl,caption}); result=await registerInstagramCommerce(result,req.body||{});
    const o=normalizeCommerceOptions(req.body||{}),s=loadStore();s.history.unshift({id:crypto.randomUUID(),platform:'instagram',mediaId:result.mediaId||'',creationId:result.creationId||'',filename:req.file.originalname,product:o.product,shopeeUrl:o.shopeeUrl,caption,dmKeyword:o.keyword,adId:result.commerce?.ad?.adId||'',status:result.status||'PROCESSING',createdAt:now()});s.history=s.history.slice(0,100);saveStore(s);
    setTimeout(()=>removeFile(req.file.path),10*60*1000).unref?.();
    res.json(result);
  }catch(e){if(req.file?.path)setTimeout(()=>removeFile(req.file.path),10*60*1000).unref?.();res.status(400).json({error:e.message});}
});
app.post('/api/instagram/story/publish-remote',mustLogin,async(req,res)=>{
  try{
    const id=String(req.body.remoteVideoId||'').trim();
    if(!/^[A-Za-z0-9_-]{8,200}$/.test(id))return res.status(400).json({error:'ID do vídeo WeDrop inválido.'});
    await prepareDriveVideo(id,String(req.body.filename||'instagram-story.mp4'));
    const videoUrl=instagramPublicMediaUrl(req,'wedrop',id,3600);
    const result=await publishInstagramStory({req,videoUrl});
    const s=loadStore();
    s.history.unshift({id:crypto.randomUUID(),platform:'instagram-story',mediaId:result.mediaId||'',creationId:result.creationId||'',filename:String(req.body.filename||'video-wedrop'),product:String(req.body.product||''),shopeeUrl:String(req.body.shopeeUrl||''),status:result.status||'PROCESSING',createdAt:now()});
    s.history=s.history.slice(0,100);saveStore(s);
    res.json(result);
  }catch(e){res.status(400).json({error:`Story: ${e.message}`});}
});
app.post('/api/instagram/story/publish',mustLogin,upload.single('video'),async(req,res)=>{
  try{
    if(!req.file)return res.status(400).json({error:'Envie um vídeo.'});
    const filename=path.basename(req.file.path);
    const videoUrl=instagramPublicMediaUrl(req,'upload',filename,3600);
    const result=await publishInstagramStory({req,videoUrl});
    const s=loadStore();
    s.history.unshift({id:crypto.randomUUID(),platform:'instagram-story',mediaId:result.mediaId||'',creationId:result.creationId||'',filename:req.file.originalname,product:String(req.body.product||''),shopeeUrl:String(req.body.shopeeUrl||''),status:result.status||'PROCESSING',createdAt:now()});
    s.history=s.history.slice(0,100);saveStore(s);
    setTimeout(()=>removeFile(req.file.path),10*60*1000).unref?.();
    res.json(result);
  }catch(e){if(req.file?.path)setTimeout(()=>removeFile(req.file.path),10*60*1000).unref?.();res.status(400).json({error:`Story: ${e.message}`});}
});
app.post('/api/instagram/story/finalize',mustLogin,async(req,res)=>{
  try{
    const creationId=String(req.body.creationId||'').trim();
    if(!/^\d+$/.test(creationId))return res.status(400).json({error:'Container de Story inválido.'});
    const st=await instagramGraph(`${creationId}`,{params:{fields:'status_code,status'}});
    if(st.status_code!=='FINISHED')return res.json({ok:true,pending:true,creationId,status:st.status_code||'IN_PROGRESS',message:st.status||'Story ainda processando.'});
    const cfg=effectiveSettings(loadStore().settings||{});
    const p=await instagramGraph(`${cfg.instagramUserId}/media_publish`,{method:'POST',params:{creation_id:creationId}});
    const s=loadStore();
    const item=(s.history||[]).find(x=>x.creationId===creationId&&x.platform==='instagram-story');
    if(item){item.mediaId=p.id;item.status='PUBLISHED';item.updatedAt=now();saveStore(s);}
    res.json({ok:true,pending:false,creationId,mediaId:p.id,status:'PUBLISHED',message:'Story publicado automaticamente no Instagram (sem adesivo de link).'});
  }catch(e){res.status(400).json({error:`Story: ${e.message}`});}
});

app.post('/api/instagram/finalize',mustLogin,async(req,res)=>{
  try{
    const creationId=String(req.body.creationId||'').trim();if(!/^\d+$/.test(creationId))return res.status(400).json({error:'Container inválido.'});
    const st=await instagramGraph(`${creationId}`,{params:{fields:'status_code,status'}});if(st.status_code!=='FINISHED')return res.json({ok:true,pending:true,creationId,status:st.status_code||'IN_PROGRESS',message:st.status||'Ainda processando.'});
    const cfg=effectiveSettings(loadStore().settings||{});const p=await instagramGraph(`${cfg.instagramUserId}/media_publish`,{method:'POST',params:{creation_id:creationId}});
    const rule=finishInstagramRule(creationId,p.id);let ad=null,adError='',supabaseSync={configured:supabaseCommerceConfig().configured,synced:false};
    if(rule){try{supabaseSync=await syncInstagramRuleToSupabase(rule);}catch(e){supabaseSync={configured:true,synced:false,error:e.message};}}
    if(rule?.createAd){try{ad=await createMetaAdForReel({mediaId:p.id,shopeeUrl:rule.shopeeUrl,product:rule.product,status:rule.adStatus});upsertInstagramRule({creationId,mediaId:p.id,options:{...rule,adId:ad.adId,creativeId:ad.creativeId,adCreatedAt:now()}});}catch(e){adError=e.message;upsertInstagramRule({creationId,mediaId:p.id,options:{...rule,adError}});}}
    const result={ok:true,pending:false,creationId,mediaId:p.id,status:'PUBLISHED',message:'Reel publicado no Instagram.',commerce:{dmEnabled:Boolean(rule?.dmEnabled),keyword:rule?.keyword||'',createAd:Boolean(rule?.createAd),ad,adError,supabaseSync}};
    updateInstagramHistoryAfterFinalize(creationId,p.id,result.commerce);res.json(result);
  }catch(e){res.status(400).json({error:e.message});}
});

async function refreshTokenIfNeeded(force=false){
  const s=loadStore(); const token=s.token; const cfg=effectiveSettings(s.settings||{});
  if(!token?.refresh_token) throw new Error('Conecte sua conta TikTok primeiro.');
  const expiresAt=Number(token.obtained_at||0)+Number(token.expires_in||0)*1000;
  if(!force && Date.now()<expiresAt-10*60*1000) return token.access_token;
  const form=new URLSearchParams({client_key:cfg.tiktokClientKey,client_secret:cfg.tiktokClientSecret,grant_type:'refresh_token',refresh_token:token.refresh_token});
  const r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
  const d=await r.json();
  if(!r.ok||d.error) throw new Error(d.error_description||d.error||'Não foi possível renovar o acesso ao TikTok.');
  s.token={...d,obtained_at:Date.now()}; saveStore(s); return d.access_token;
}
async function tiktokJson(url,options={}){
  const token=await refreshTokenIfNeeded();
  const r=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json; charset=UTF-8',...(options.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||(d.error?.code&&d.error.code!=='ok')) {
    const code=d?.error?.code||d?.error||'';
    const msg=d?.error?.message||d?.error_description||`TikTok HTTP ${r.status}`;
    const logId=d?.error?.log_id||d?.log_id||'';
    throw new Error([msg,code&&`Código: ${code}`,logId&&`Log: ${logId}`].filter(Boolean).join(' | '));
  }
  return d;
}
async function creatorInfo(){ const d=await tiktokJson('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',body:'{}'}); return d.data||{}; }

app.get('/auth/tiktok', mustLogin, (req,res)=>{
  const cfg=effectiveSettings(loadStore().settings||{});
  if(!cfg.tiktokClientKey||!cfg.tiktokClientSecret) return res.status(400).send('Abra Configurações e informe Client Key e Client Secret do TikTok Developers.');
  const state=crypto.randomBytes(24).toString('hex'); req.session.oauthState=state;
  const p=new URLSearchParams({client_key:cfg.tiktokClientKey,response_type:'code',scope:'user.info.basic,video.publish,video.upload',redirect_uri:redirectUri(req),state});
  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${p}`);
});
function tiktokAuthResultPage(status,message=''){
  const payload=JSON.stringify({source:'redeachados-publisher-tiktok',status,message:String(message||''),at:Date.now()}).replace(/</g,'\\u003c');
  const ok=status==='connected';
  const title=ok?'TikTok conectado':'Falha na conexão do TikTok';
  const rawDetail=ok?'Sua publicação foi preservada. Esta aba pode ser fechada.':String(message||'Não foi possível concluir a autorização.');
  const detail=rawDetail.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f6f8f3;color:#273027;display:grid;place-items:center;min-height:100vh}.box{width:min(520px,calc(100% - 32px));background:#fff;border:1px solid #dfe6db;border-radius:18px;padding:28px;box-shadow:0 18px 55px rgba(33,44,31,.10);text-align:center}h1{font-size:24px;margin:0 0 10px}p{color:#667161;line-height:1.6}a{display:inline-block;margin-top:10px;padding:11px 16px;border-radius:10px;background:#263126;color:#fff;text-decoration:none;font-weight:700}</style></head><body><main class="box"><h1>${title}</h1><p>${detail}</p><a href="/">Voltar ao Publisher</a></main><script>(()=>{const payload=${payload};try{localStorage.setItem('redeachados_tiktok_auth_event_v1',JSON.stringify(payload))}catch{}try{const c=new BroadcastChannel('redeachados_tiktok_auth_v1');c.postMessage(payload);setTimeout(()=>c.close(),500)}catch{}try{if(window.opener)window.opener.postMessage(payload,location.origin)}catch{}${ok?"setTimeout(()=>{try{window.close()}catch{}},900);":""}})();</script></body></html>`;
}
app.get('/auth/tiktok/callback', async(req,res)=>{
  try{
    if(req.query.error) throw new Error(req.query.error_description||req.query.error);
    if(!req.query.code||req.query.state!==req.session.oauthState) throw new Error('Autorização TikTok inválida ou expirada.');
    const s=loadStore(), cfg=effectiveSettings(s.settings||{});
    const form=new URLSearchParams({client_key:cfg.tiktokClientKey,client_secret:cfg.tiktokClientSecret,code:String(req.query.code),grant_type:'authorization_code',redirect_uri:redirectUri(req)});
    const r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
    const d=await r.json(); if(!r.ok||d.error) throw new Error(d.error_description||d.error||'Falha ao conectar o TikTok.');
    s.token={...d,obtained_at:Date.now()}; saveStore(s); delete req.session.oauthState; res.type('html').send(tiktokAuthResultPage('connected'));
  }catch(e){res.status(400).type('html').send(tiktokAuthResultPage('error',e.message));}
});
app.post('/api/tiktok/disconnect', mustLogin, (_req,res)=>{ const s=loadStore(); s.token=null; saveStore(s); res.json({ok:true}); });
app.get('/api/creator', mustLogin, async(_req,res)=>{ try{res.json(await creatorInfo());}catch(e){res.status(400).json({error:e.message});} });

function sanitizeJsonText(text){
  const t=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  const first=t.indexOf('{'), last=t.lastIndexOf('}');
  return first>=0&&last>first?t.slice(first,last+1):t;
}
function fallbackCopy(filename, brand, shopUrl){
  const raw=String(filename||'produto').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const product=raw && !/^video\s*\d*$/i.test(raw) ? raw : 'Achadinho para o dia a dia';
  const title=`Olha esse achadinho`;
  const description=`${product}. Uma opção prática para facilitar a rotina. Veja os detalhes e confira se combina com você.`;
  const hashtags=['#achadinhos','#utilidades','#comprasonline','#dicas','#'+String(brand||'redeachadosbr').toLowerCase().replace(/[^a-z0-9]/g,'')];
  const cta=shopUrl?`Garanta o seu na ${brand||'REDEACHADOS BR'}`:`Confira mais produtos na ${brand||'REDEACHADOS BR'}.`;
  const instagramDescription=`✨ ${product}\n\nUma opção prática para o dia a dia, pensada para facilitar sua rotina. Confira os detalhes no vídeo e veja se combina com o que você procura.\n\n💥 Por que vale conhecer?\n\n✅ Prático para o uso diário\n✅ Fácil de incluir na rotina\n✅ Opção versátil para casa ou dia a dia\n\n👉 Veja os detalhes e escolha a opção ideal para você.`;
  return {product,title,description,instagramDescription,hashtags,cta,confidence:'fallback'};
}
async function generateCopyWithGemini({images,filename,productContext=null}){
  const s=loadStore(), cfg=effectiveSettings(s.settings||{});
  if(!cfg.geminiApiKey){
    const out=fallbackCopy(productContext?.name||filename,cfg.brandName,cfg.shopeeStoreUrl);
    if(productContext?.name) out.product=productContext.name;
    return out;
  }
  const model=cfg.geminiModel||'gemini-3.5-flash-lite';
  const authoritative=productContext?.name?`\n\nPRODUTO CONFIRMADO PELO CATÁLOGO SHOPEE (FONTE AUTORITATIVA): ${productContext.name}. SKU: ${productContext.sku||''}. ID do anúncio: ${productContext.id||''}. O vídeo foi escolhido a partir desta SKU/anúncio. NÃO troque por outro produto visualmente parecido. Use os frames apenas para estilo, contexto de uso e características realmente visíveis; se houver dúvida, mantenha o nome e a identidade do produto confirmado pelo catálogo.`:'';
  const prompt=`Você é um redator de e-commerce brasileiro especializado em TikTok e Instagram. Analise os frames de um vídeo de produto e gere metadados para publicação. Não invente especificações, certificações, preço, desconto, garantia, material, medidas, fragrâncias, quantidades, funções ou resultados que não estejam claramente visíveis ou sustentados pelo nome do arquivo ou pelo produto confirmado no catálogo. Evite promessas absolutas, alegações médicas e linguagem enganosa. Escreva em português do Brasil, natural, comercial e sem spam.${authoritative}

Para TikTok: title curto, description entre 120 e 320 caracteres e CTA curto. NÃO coloque emojis nesses três campos.

Para Instagram: crie instagramDescription mais completa, com aproximadamente 650 a 1400 caracteres, usando emojis moderados e quebras de linha. Estrutura desejada: 1) gancho forte; 2) parágrafo explicando o produto; 3) se houver opções/variações realmente identificáveis, liste-as; 4) bloco "💥 Por que você pode gostar desse produto?"; 5) de 4 a 6 benefícios em linhas com ✅; 6) uma frase conectando com o problema/uso cotidiano; 7) uma frase sobre uso/resultado sem promessa absoluta. NÃO inclua URL, preço, desconto, estoque, hashtags nem CTA final na instagramDescription, pois o aplicativo adicionará esses itens.

Retorne SOMENTE JSON válido neste formato: {"product":"nome genérico provável do produto","title":"chamada curta de até 70 caracteres","description":"descrição curta para TikTok","instagramDescription":"descrição longa estruturada para Instagram","hashtags":["#hashtag1","#hashtag2","#hashtag3","#hashtag4","#hashtag5","#hashtag6"],"cta":"CTA curto e natural mencionando a loja; prefira frases como Garanta o seu na REDE ACHADOS BR ou Confira na REDE ACHADOS BR, sem dizer apenas no link"}. Marca da loja: ${cfg.brandName||'REDEACHADOS BR'}. Nome do arquivo: ${filename||''}.`;
  const parts=[{text:prompt}];
  for(const img of (images||[]).slice(0,3)){
    const m=String(img).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s); if(m) parts.push({inline_data:{mime_type:m[1],data:m[2]}});
  }
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':cfg.geminiApiKey},
    body:JSON.stringify({contents:[{parts}],generationConfig:{responseMimeType:'application/json'}})
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d?.error?.message||'Falha ao gerar texto com IA.');
  const text=d?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
  let out; try{out=JSON.parse(sanitizeJsonText(text));}catch{throw new Error('A IA não retornou um JSON válido. Tente novamente.');}
  const tags=Array.isArray(out.hashtags)?out.hashtags:[];
  let cta=String(out.cta||'').trim();
  const brand=String(cfg.brandName||'REDE ACHADOS BR').trim();
  const brandKey=normalizeText(brand).replace(/[^a-z0-9]/g,'');
  const ctaKey=normalizeText(cta).replace(/[^a-z0-9]/g,'');
  if(!cta || /\bno link\b/i.test(cta)) {
    cta=`Garanta o seu na ${brand}`;
  } else if(!ctaKey.includes(brandKey)) {
    cta=`${cta.replace(/[.!]+$/,'')} na ${brand}`;
  }
  // Remove duplicação acidental da marca, inclusive variações com/sem espaço.
  cta=cta
    .replace(/\bna\s+REDE\s*ACHADOS\s*BR\s+na\s+REDE\s*ACHADOS\s*BR\b/ig,'na REDE ACHADOS BR')
    .replace(/\bREDE\s*ACHADOS\s*BR\s+REDE\s*ACHADOS\s*BR\b/ig,'REDE ACHADOS BR')
    .replace(/\s{2,}/g,' ')
    .trim();
  return {product:String(out.product||'Produto'),title:String(out.title||'Confira esse achadinho'),description:String(out.description||''),instagramDescription:String(out.instagramDescription||''),hashtags:tags.map(x=>String(x).startsWith('#')?String(x):'#'+String(x).replace(/\s+/g,'')),cta,confidence:'ai'};
}

app.post('/api/ai/generate-remote', mustLogin, async(req,res)=>{
  try{
    const id=String(req.body.remoteVideoId||'').trim();
    if(!id || !/^[A-Za-z0-9_-]{8,200}$/.test(id)) return res.status(400).json({error:'Vídeo remoto inválido.'});
    const filename=String(req.body.filename||'video-wedrop.mp4');
    const duration=Number(req.body.duration||0);
    const images=await extractRemoteFrames(id,filename,duration);
    const catalogSku=String(req.body.catalogSku||'').trim();
    const catalogProductId=String(req.body.catalogProductId||'').trim();
    let authoritativeProduct=null;
    if(catalogSku&&catalogProductId){
      try{authoritativeProduct=findCatalogBySku(catalogSku,catalogProductId);}catch{}
    }
    const productContext=authoritativeProduct?{id:authoritativeProduct.id,sku:catalogSku,name:authoritativeProduct.name,url:authoritativeProduct.url}:null;
    const out=await generateCopyWithGemini({images,filename,productContext});
    if(authoritativeProduct){
      out.product=authoritativeProduct.name;
      out.shopeeUrl=authoritativeProduct.url;
      out.catalogMatch={id:authoritativeProduct.id,sku:catalogSku,name:authoritativeProduct.name,score:1,source:'sku-selected'};
    }else{
      const match=findCatalogMatch(out.product);
      if(match){ out.shopeeUrl=match.url; out.catalogMatch={id:match.id,sku:match.sku,name:match.name,score:match.score,source:'ai-fuzzy'}; }
    }
    out.analysisMode='server-ffmpeg';
    res.json(out);
  }catch(e){ res.status(400).json({error:`Falha na análise do vídeo no servidor: ${e.message}`}); }
});

app.post('/api/ai/generate', mustLogin, async(req,res)=>{
  try{
    const out=await generateCopyWithGemini({images:req.body.images,filename:req.body.filename});
    const match=findCatalogMatch(out.product);
    if(match){ out.shopeeUrl=match.url; out.catalogMatch={id:match.id,sku:match.sku,name:match.name,score:match.score}; }
    res.json(out);
  }catch(e){ res.status(400).json({error:e.message}); }
});

function productEmoji(meta={}){
  const text=`${meta.product||''} ${meta.title||''} ${meta.description||''}`.toLowerCase();
  if(/avental|mini chef|chef|cozinha infantil/.test(text)) return '👩‍🍳';
  if(/cozinha|panela|cafeteira|chaleira|frigideira|utens[ií]lio|assadeira|pote|galheteiro/.test(text)) return '🍳';
  if(/brinqued|infantil|crian[cç]a|bonec|carrinho|pista|jogo/.test(text)) return '🎁';
  if(/organiz|gaveta|prateleira|porta joia|armazen/.test(text)) return '✨';
  if(/limp|mop|escova|pano|vassoura/.test(text)) return '🧼';
  if(/luz|led|lumin[aá]ria|sensor/.test(text)) return '💡';
  if(/beleza|maquiagem|pincel|joia|brinco/.test(text)) return '💖';
  if(/fitness|balan[cç]a|treino|academia/.test(text)) return '💪';
  return '✨';
}
function noLeadingEmoji(text=''){ return String(text||'').replace(/^\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u,'').trim(); }
function buildCaption(meta, settings){
  const tags=(meta.hashtags||[]).slice(0,Math.max(3,Math.min(10,Number(settings.defaultHashtagCount||6)))).join(' ');
  const emoji=productEmoji(meta);
  const title=noLeadingEmoji(meta.title);
  const description=noLeadingEmoji(meta.description);
  const cta=noLeadingEmoji(meta.cta);
  const chunks=[];
  if(title) chunks.push(`${emoji} ${title}`);
  if(description) chunks.push(`📝 ${description}`);
  if(cta) chunks.push(`🛍️ ${cta}`);
  const directUrl=String(meta.shopeeUrl||'').trim();
  const link=directUrl || String(settings.shopeeStoreUrl||'').trim();
  if(link) chunks.push(`🔗 ${link}`);
  if(tags) chunks.push(tags);
  let caption=chunks.filter(Boolean).join('\n\n').trim();
  if(caption.length>2200) caption=caption.slice(0,2197)+'...';
  return caption;
}
function chunkPlan(size){
  const MIN=5*1024*1024, MAX=64*1024*1024;
  if(size<=MAX) return {chunkSize:size,totalChunks:1};
  let chunks=Math.ceil(size/MAX), chunkSize=Math.floor(size/chunks);
  if(chunkSize<MIN){chunks=Math.max(1,Math.floor(size/MIN));chunkSize=Math.floor(size/chunks);}
  return {chunkSize,totalChunks:Math.max(1,Math.ceil(size/chunkSize))};
}

async function uploadDraftFile(file){
  const size=file.size, {chunkSize,totalChunks}=chunkPlan(size);
  const payload={
    source_info:{source:'FILE_UPLOAD',video_size:size,chunk_size:chunkSize,total_chunk_count:totalChunks}
  };
  const init=await tiktokJson('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',{method:'POST',body:JSON.stringify(payload)});
  const uploadUrl=init?.data?.upload_url,publishId=init?.data?.publish_id;
  if(!uploadUrl||!publishId) throw new Error('TikTok não retornou os dados de upload do rascunho.');
  const fd=fs.openSync(file.path,'r'); let start=0;
  try{
    while(start<size){
      let end=Math.min(start+chunkSize,size); if(size-end>0&&size-end<5*1024*1024) end=size;
      const len=end-start,buf=Buffer.allocUnsafe(len); fs.readSync(fd,buf,0,len,start);
      const put=await fetch(uploadUrl,{method:'PUT',headers:{'Content-Type':file.mimetype,'Content-Length':String(len),'Content-Range':`bytes ${start}-${end-1}/${size}`},body:buf});
      if(![201,206].includes(put.status)) throw new Error(`Falha ao enviar o rascunho ao TikTok (HTTP ${put.status}).`);
      start=end;
    }
  }finally{fs.closeSync(fd);}
  return publishId;
}

async function publishFile(file, caption, options={}){
  const creator=await creatorInfo();
  const privacy=options.privacy||'SELF_ONLY';
  const allowed=creator.privacy_level_options||[];
  if(!allowed.includes(privacy)) throw new Error(`Privacidade ${privacy} não está disponível nesta conta.`);
  if(Number(creator.max_video_post_duration_sec||0)>0 && Number(options.duration||0)>Number(creator.max_video_post_duration_sec)) throw new Error(`O vídeo excede a duração permitida pela conta (${creator.max_video_post_duration_sec}s).`);
  const size=file.size, {chunkSize,totalChunks}=chunkPlan(size);
  const payload={
    post_info:{
      title:String(caption||'').slice(0,2200),privacy_level:privacy,
      disable_duet:Boolean(options.disableDuet),disable_comment:Boolean(options.disableComment),disable_stitch:Boolean(options.disableStitch),
      video_cover_timestamp_ms:1000,brand_organic_toggle:true,is_aigc:Boolean(options.isAigc)
    },
    source_info:{source:'FILE_UPLOAD',video_size:size,chunk_size:chunkSize,total_chunk_count:totalChunks}
  };
  const init=await tiktokJson('https://open.tiktokapis.com/v2/post/publish/video/init/',{method:'POST',body:JSON.stringify(payload)});
  const uploadUrl=init?.data?.upload_url,publishId=init?.data?.publish_id;
  if(!uploadUrl||!publishId) throw new Error('TikTok não retornou os dados de upload.');
  const fd=fs.openSync(file.path,'r'); let start=0;
  try{
    while(start<size){
      let end=Math.min(start+chunkSize,size); if(size-end>0&&size-end<5*1024*1024) end=size;
      const len=end-start,buf=Buffer.allocUnsafe(len); fs.readSync(fd,buf,0,len,start);
      const put=await fetch(uploadUrl,{method:'PUT',headers:{'Content-Type':file.mimetype,'Content-Length':String(len),'Content-Range':`bytes ${start}-${end-1}/${size}`},body:buf});
      if(![201,206].includes(put.status)) throw new Error(`Falha ao enviar o vídeo ao TikTok (HTTP ${put.status}).`);
      start=end;
    }
  }finally{fs.closeSync(fd);}
  return publishId;
}
app.post('/api/upload-draft-remote', mustLogin, async(req,res)=>{
  let remoteFile=null;
  try{
    const id=String(req.body.remoteVideoId||'').trim();
    if(!id || !/^[A-Za-z0-9_-]{8,200}$/.test(id)) return res.status(400).json({error:'Vídeo remoto inválido.'});
    const meta=req.body.meta||{}; const s=loadStore(), settings=effectiveSettings(s.settings||{});
    const manualCaption=String(req.body.caption||'').trim();
    const caption=(manualCaption||buildCaption(meta,settings)).slice(0,2200);
    remoteFile=await downloadDriveToTemp(id,String(req.body.filename||meta.product||'wedrop-video'));
    const publishId=await uploadDraftFile(remoteFile);
    s.history.unshift({id:crypto.randomUUID(),publishId,filename:remoteFile.originalname,product:meta.product||'',shopeeUrl:meta.shopeeUrl||'',caption,status:'SENT_TO_TIKTOK_INBOX',mode:'draft-remote',createdAt:now()});
    s.history=s.history.slice(0,200); saveStore(s); removeFile(remoteFile.path);
    res.json({ok:true,publishId,caption,message:'Vídeo remoto enviado como rascunho ao TikTok.'});
  }catch(e){ if(remoteFile?.path) removeFile(remoteFile.path); res.status(400).json({error:e.message}); }
});

app.post('/api/upload-draft', mustLogin, upload.single('video'), async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Selecione um vídeo.'});
    const meta=JSON.parse(req.body.meta||'{}'); const s=loadStore(), settings=effectiveSettings(s.settings||{});
    const manualCaption=String(req.body.caption||'').trim();
    const caption=(manualCaption||buildCaption(meta,settings)).slice(0,2200);
    const publishId=await uploadDraftFile(req.file);
    s.history.unshift({id:crypto.randomUUID(),publishId,filename:req.file.originalname,product:meta.product||'',shopeeUrl:meta.shopeeUrl||'',caption,status:'SENT_TO_TIKTOK_INBOX',mode:'draft',createdAt:now()});
    s.history=s.history.slice(0,200); saveStore(s); removeFile(req.file.path);
    res.json({ok:true,publishId,caption,message:'Vídeo enviado como rascunho. Abra o TikTok e toque na notificação da caixa de entrada para concluir a edição e publicar.'});
  }catch(e){ if(req.file) removeFile(req.file.path); res.status(400).json({error:e.message}); }
});

app.post('/api/publish', mustLogin, upload.single('video'), async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Selecione um vídeo.'});
    const meta=JSON.parse(req.body.meta||'{}'); const s=loadStore(), settings=effectiveSettings(s.settings||{});
    const manualCaption=String(req.body.caption||'').trim();
    const caption=(manualCaption||buildCaption(meta,settings)).slice(0,2200);
    const publishId=await publishFile(req.file,caption,{
      privacy:req.body.privacy||settings.defaultPrivacy||'SELF_ONLY',duration:Number(req.body.duration||0),
      disableComment:req.body.disableComment==='true',disableDuet:req.body.disableDuet==='true',disableStitch:req.body.disableStitch==='true',isAigc:req.body.isAigc==='true'
    });
    s.history.unshift({id:crypto.randomUUID(),publishId,filename:req.file.originalname,product:meta.product||'',shopeeUrl:meta.shopeeUrl||'',caption,status:'PROCESSING_UPLOAD',createdAt:now()});
    s.history=s.history.slice(0,200); saveStore(s); removeFile(req.file.path);
    res.json({ok:true,publishId,caption});
  }catch(e){ if(req.file) removeFile(req.file.path); res.status(400).json({error:e.message}); }
});
app.get('/api/history', mustLogin, (_req,res)=>res.json(loadStore().history||[]));
app.post('/api/status/:publishId', mustLogin, async(req,res)=>{
  try{const d=await tiktokJson('https://open.tiktokapis.com/v2/post/publish/status/fetch/',{method:'POST',body:JSON.stringify({publish_id:req.params.publishId})});res.json(d.data||{});}catch(e){res.status(400).json({error:e.message});}
});

app.listen(PORT,()=>console.log(`REDEACHADOS BR Publisher Web V5.5.20 em http://localhost:${PORT}`));
