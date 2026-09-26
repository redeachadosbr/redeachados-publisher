import express from 'express';
import session from 'express-session';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'node:url';

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

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'redeachados-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30*24*60*60*1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function defaults(){
  return { token:null, settings:{ brandName:'REDEACHADOS BR', shopeeStoreUrl:'', defaultPrivacy:'SELF_ONLY', defaultHashtagCount:6, tiktokClientKey:'', tiktokClientSecret:'', geminiApiKey:'', geminiModel:'gemini-3.5-flash-lite' }, history:[], wedropSearchAliases:{} };
}
function loadStore(){
  try { return { ...defaults(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; }
  catch { const d=defaults(); saveStore(d); return d; }
}
function saveStore(s){ fs.writeFileSync(DATA_FILE, JSON.stringify(s,null,2)); }
function envText(name){ return String(process.env[name]||'').trim(); }
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
    tiktokClientSecret: envText('TIKTOK_CLIENT_SECRET') || stored.tiktokClientSecret || ''
  };
}
function now(){ return new Date().toISOString(); }
function removeFile(p){ try{ if(p && fs.existsSync(p)) fs.unlinkSync(p); }catch{} }
function baseUrl(req){ return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/,''); }
function redirectUri(req){ return `${baseUrl(req)}/auth/tiktok/callback`; }
function safeSettings(stored){
  const s=effectiveSettings(stored||{});
  return {
    brandName:s.brandName, shopeeStoreUrl:s.shopeeStoreUrl, defaultPrivacy:s.defaultPrivacy,
    defaultHashtagCount:Number(s.defaultHashtagCount||6),
    tiktokConfigured:Boolean(s.tiktokClientKey&&s.tiktokClientSecret), geminiConfigured:Boolean(s.geminiApiKey),
    geminiModel:s.geminiModel,
    sources:{
      shopeeStoreUrl:envText('SHOPEE_STORE_URL')?'render':'local',
      geminiApiKey:envText('GEMINI_API_KEY')?'render':'local',
      tiktokCredentials:(envText('TIKTOK_CLIENT_KEY')&&envText('TIKTOK_CLIENT_SECRET'))?'render':'local'
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
  return bestScore>=0.42 ? {...best,score:Number(bestScore.toFixed(3))} : null;
}
function parseShopeeCatalog(buffer,filename){
  const book=XLSX.read(buffer,{type:'buffer'}); const ws=book.Sheets[book.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
  let h=-1; for(let i=0;i<Math.min(rows.length,20);i++){
    const cells=rows[i].map(normalizeText);
    if(cells.includes('id do produto')&&cells.includes('nome do produto')){h=i;break;}
  }
  if(h<0) throw new Error('Não encontrei as colunas ID do Produto e Nome do Produto no arquivo da Shopee.');
  const header=rows[h].map(normalizeText);
  const ixId=header.indexOf('id do produto'), ixSku=header.indexOf('sku de referencia'), ixName=header.indexOf('nome do produto'), ixDesc=header.indexOf('descricao do produto');
  const shopId='852701218', map=new Map();
  for(const row of rows.slice(h+1)){
    const id=String(row[ixId]||'').trim(), name=String(row[ixName]||'').trim();
    if(!/^\d+$/.test(id)||!name) continue;
    map.set(id,{id,sku:ixSku>=0?String(row[ixSku]||'').trim():'',name,description:ixDesc>=0?String(row[ixDesc]||'').trim():'',url:`https://shopee.com.br/product/${shopId}/${id}/`});
  }
  const products=[...map.values()]; if(!products.length) throw new Error('Nenhum produto válido foi encontrado no arquivo.');
  return {shopId,importedAt:now(),sourceFile:filename||'catalogo-shopee.xlsx',count:products.length,products};
}

app.get('/api/catalog', mustLogin, (_req,res)=>{
  const c=loadCatalog(); res.json({count:(c.products||[]).length, importedAt:c.importedAt, sourceFile:c.sourceFile, shopId:c.shopId||'852701218'});
});
app.post('/api/catalog/import', mustLogin, catalogUpload.single('catalog'), (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Selecione a planilha da Shopee.'});
    const c=parseShopeeCatalog(req.file.buffer,req.file.originalname); saveCatalog(c);
    res.json({ok:true,count:c.products.length,importedAt:c.importedAt,sourceFile:c.sourceFile});
  }catch(e){res.status(400).json({error:e.message});}
});


function findCatalogBySku(sku){
  const q=String(sku||'').trim().toUpperCase();
  if(!q) return null;
  const c=loadCatalog();
  const exact=(c.products||[]).find(p=>String(p.sku||'').trim().toUpperCase()===q);
  if(exact) return {...exact,matchType:'exact'};
  return null;
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
  // Reproduz o uso manual: tenta o título completo e vai apagando palavras do final.
  for(let n=words.length-1;n>=2 && out.length<10;n--){
    const v=words.slice(0,n).join(' ');
    const useful=catalogTokens(v);
    if(useful.length>=2) add(v);
  }
  // Uma última alternativa segura remove somente cores/tamanho que costumam ficar no fim do título.
  const removable=new Set(['branco','branca','preto','preta','azul','rosa','vermelho','vermelha','verde','cinza','sortido','sortida','grande','medio','media','pequeno','pequena']);
  const filtered=words.filter(w=>!removable.has(normalizeText(w)));
  if(filtered.length>=2)add(filtered.join(' '));
  return out.slice(0,10);
}
function getWedropAlias(sku){
  const st=loadStore(); return String(st.wedropSearchAliases?.[String(sku||'').trim().toUpperCase()]||'').trim();
}
function saveWedropAlias(sku,query){
  const key=String(sku||'').trim().toUpperCase(), q=cleanSearchTitle(query); if(!key||!q)return;
  const st=loadStore(); st.wedropSearchAliases={...(st.wedropSearchAliases||{}),[key]:q}; saveStore(st);
}
async function loadGalleryDocuments(){
  const base=envText('WEDROP_GALLERY_URL')||'https://drive-vid-gallery.lovable.app/';
  const r=await fetch(base,{headers:{'User-Agent':'Mozilla/5.0 REDEACHADOS-Publisher/5.4.1.1'}});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  const html=await r.text(); const docs=[{url:base,text:html}];
  const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>{try{return new URL(m[1],base).href}catch{return null}}).filter(Boolean).slice(0,14);
  for(const src of scripts){
    try{const rr=await fetch(src,{headers:{'User-Agent':'Mozilla/5.0 REDEACHADOS-Publisher/5.4.1.1'}});if(rr.ok){const tx=await rr.text();if(tx.length<10_000_000)docs.push({url:src,text:tx});}}catch{}
  }
  return {base,docs};
}
function collectGalleryMedia(docs){
  const raw=[];
  for(const d of docs){
    for(const u of extractUrls(d.text)){
      const pos=d.text.indexOf(u);
      raw.push({url:u,context:d.text.slice(Math.max(0,pos-1800),Math.min(d.text.length,pos+1800))});
    }
  }
  const seen=new Set();
  return raw.filter(x=>safeRemoteUrl(x.url)&&!seen.has(x.url)&&(seen.add(x.url),true));
}
function scoreMediaForQuery(media,query){
  return media.map(x=>({
    url:x.url,
    score:scoreVideoCandidate(query,x.context),
    label:(x.context.match(/.{0,100}(?:avental|mini chef|produto|brinquedo|cozinha|organizador|vídeo|video).{0,150}/i)||[])[0]||query||'Vídeo WeDrop',
    matchQuery:query
  })).sort((a,b)=>b.score-a.score);
}
async function discoverGalleryVideos(title,sku,manualQuery=''){
  const learned=getWedropAlias(sku);
  const result={galleryUrl:envText('WEDROP_GALLERY_URL')||'https://drive-vid-gallery.lovable.app/',query:title,sku,candidates:[],diagnostic:'',attempts:[],bestQuery:'',learnedQuery:learned};
  try{
    const {base,docs}=await loadGalleryDocuments(); result.galleryUrl=base;
    const media=collectGalleryMedia(docs);
    const variants=manualQuery?[cleanSearchTitle(manualQuery)]:progressiveSearchQueries(title||sku,learned);
    const threshold=0.50;
    let chosen=[];
    for(const q of variants){
      if(!q)continue;
      const ranked=scoreMediaForQuery(media,q);
      const hits=ranked.filter(x=>x.score>=threshold).slice(0,12);
      result.attempts.push({query:q,matches:hits.length,bestScore:Number((ranked[0]?.score||0).toFixed(3))});
      if(hits.length){chosen=hits;result.bestQuery=q;break;}
    }
    // Se não houve correspondência forte, mostramos no máximo candidatos moderados para revisão manual.
    if(!chosen.length && variants.length){
      const q=variants[variants.length-1];
      const ranked=scoreMediaForQuery(media,q).filter(x=>x.score>=0.36).slice(0,6);
      if(ranked.length){chosen=ranked;result.bestQuery=q;result.diagnostic='Encontrei candidatos aproximados. Confira o vídeo antes de usar.';}
    }
    result.candidates=chosen;
    if(!result.diagnostic) result.diagnostic=chosen.length
      ? `Vídeo(s) encontrado(s) após ${result.attempts.length} tentativa(s). Busca que funcionou: “${result.bestQuery}”.`
      : 'Nenhum vídeo compatível foi localizado. Tente encurtar manualmente o nome; se ainda não aparecer, provavelmente não há vídeo na galeria.';
  }catch(e){result.diagnostic=`Não foi possível consultar automaticamente a galeria pública: ${e.message}`;}
  return result;
}
app.get('/api/wedrop/lookup', mustLogin, async(req,res)=>{
  try{
    const sku=String(req.query.sku||'').trim(); if(!sku) return res.status(400).json({error:'Informe a SKU WeDrop.'});
    const manualQuery=String(req.query.q||'').trim();
    const mapped=findCatalogBySku(sku);
    const known={'VP-2383':{name:'Avental Infantil Vida Pratika Mini Chef Branco',source:'known-example'}};
    const product=mapped?{sku:mapped.sku,name:mapped.name,shopeeUrl:mapped.url,source:'shopee-catalog'}:(known[sku.toUpperCase()]||{sku,name:'',source:'unresolved'});
    if(!product.name && !manualQuery) return res.status(404).json({error:'Não encontrei esta SKU no catálogo Shopee. Atualize o catálogo ou informe o nome do produto no campo de busca manual.'});
    const gallery=await discoverGalleryVideos(product.name||manualQuery||sku,sku,manualQuery);
    res.json({ok:true,sku,product,gallery});
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/wedrop/alias', mustLogin, (req,res)=>{
  try{const sku=String(req.body.sku||'').trim(), query=String(req.body.query||'').trim(); if(!sku||!query)return res.status(400).json({error:'SKU e busca são obrigatórias.'});saveWedropAlias(sku,query);res.json({ok:true,sku,query:cleanSearchTitle(query)});}catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/wedrop/video', mustLogin, async(req,res)=>{
  try{
    const u=safeRemoteUrl(req.query.url); if(!u) return res.status(400).json({error:'URL de vídeo não permitida.'});
    const r=await fetch(u,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 REDEACHADOS-Publisher/5.4.1'}});
    if(!r.ok) return res.status(400).json({error:`Falha ao baixar vídeo (HTTP ${r.status}).`});
    const ct=r.headers.get('content-type')||'video/mp4';
    if(!/video|octet-stream/i.test(ct)) return res.status(400).json({error:'O endereço encontrado não retornou um arquivo de vídeo.'});
    res.setHeader('Content-Type',ct);
    res.setHeader('Cache-Control','no-store');
    const ab=await r.arrayBuffer();
    if(ab.byteLength>300*1024*1024) return res.status(413).json({error:'Vídeo remoto maior que 300 MB.'});
    res.send(Buffer.from(ab));
  }catch(e){res.status(400).json({error:e.message});}
});

app.get('/api/health', (_req,res)=>res.json({ok:true,service:'REDEACHADOS BR Publisher Web V5.4.1'}));
app.get('/api/auth-state',(req,res)=>res.json({locked:Boolean(process.env.APP_PASSWORD),loggedIn:!process.env.APP_PASSWORD||Boolean(req.session?.appAuth)}));
app.post('/api/login',(req,res)=>{
  if(!process.env.APP_PASSWORD){ req.session.appAuth=true; return res.json({ok:true}); }
  if(String(req.body.password||'')!==process.env.APP_PASSWORD) return res.status(401).json({error:'Senha incorreta.'});
  req.session.appAuth=true; res.json({ok:true});
});
app.post('/api/app-logout',(req,res)=>{ req.session.destroy(()=>res.json({ok:true})); });

app.get('/api/config', mustLogin, (req,res)=>{
  const s=loadStore();
  res.json({ settings:safeSettings(s.settings||{}), tiktokConnected:Boolean(s.token?.access_token), redirectUri:redirectUri(req), publicBaseUrl:baseUrl(req) });
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
    geminiApiKey:String(req.body.geminiApiKey||'').trim() || old.geminiApiKey || ''
  };
  saveStore(s);
  res.json({ok:true,settings:safeSettings(s.settings)});
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
app.get('/auth/tiktok/callback', async(req,res)=>{
  try{
    if(req.query.error) throw new Error(req.query.error_description||req.query.error);
    if(!req.query.code||req.query.state!==req.session.oauthState) throw new Error('Autorização TikTok inválida ou expirada.');
    const s=loadStore(), cfg=effectiveSettings(s.settings||{});
    const form=new URLSearchParams({client_key:cfg.tiktokClientKey,client_secret:cfg.tiktokClientSecret,code:String(req.query.code),grant_type:'authorization_code',redirect_uri:redirectUri(req)});
    const r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
    const d=await r.json(); if(!r.ok||d.error) throw new Error(d.error_description||d.error||'Falha ao conectar o TikTok.');
    s.token={...d,obtained_at:Date.now()}; saveStore(s); delete req.session.oauthState; res.redirect('/?tiktok=connected');
  }catch(e){ res.redirect('/?error='+encodeURIComponent(e.message)); }
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
  return {product,title,description,hashtags,cta,confidence:'fallback'};
}
async function generateCopyWithGemini({images,filename}){
  const s=loadStore(), cfg=effectiveSettings(s.settings||{});
  if(!cfg.geminiApiKey) return fallbackCopy(filename,cfg.brandName,cfg.shopeeStoreUrl);
  const model=cfg.geminiModel||'gemini-3.5-flash-lite';
  const prompt=`Você é um redator de e-commerce brasileiro especializado em TikTok. Analise os frames de um vídeo de produto e gere metadados para publicação. Não invente especificações, certificações, preço, desconto, garantia, material, medidas ou funções que não estejam claramente visíveis. Evite promessas absolutas, alegações médicas e linguagem enganosa. Escreva em português do Brasil, natural e comercial sem spam. NÃO coloque emojis nos campos title, description, cta ou hashtags: o aplicativo aplicará emojis automaticamente de forma visual e moderada. Retorne SOMENTE JSON válido neste formato: {"product":"nome genérico provável do produto","title":"chamada curta de até 70 caracteres","description":"descrição de 120 a 320 caracteres","hashtags":["#hashtag1","#hashtag2","#hashtag3","#hashtag4","#hashtag5","#hashtag6"],"cta":"CTA curto e natural mencionando a loja; prefira frases como Garanta o seu na REDE ACHADOS BR ou Confira na REDE ACHADOS BR, sem dizer apenas no link"}. Marca da loja: ${cfg.brandName||'REDEACHADOS BR'}. Nome do arquivo: ${filename||''}.`;
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
  if(!cta || /\bno link\b/i.test(cta)) cta=`Garanta o seu na ${cfg.brandName||'REDEACHADOS BR'}`;
  else if(!normalizeText(cta).includes(normalizeText(cfg.brandName||'REDEACHADOS BR'))) cta=`${cta.replace(/[.!]+$/,'')} na ${cfg.brandName||'REDEACHADOS BR'}`;
  return {product:String(out.product||'Produto'),title:String(out.title||'Confira esse achadinho'),description:String(out.description||''),hashtags:tags.map(x=>String(x).startsWith('#')?String(x):'#'+String(x).replace(/\s+/g,'')),cta,confidence:'ai'};
}
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

app.listen(PORT,()=>console.log(`REDEACHADOS BR Publisher Web V5.4 em http://localhost:${PORT}`));
