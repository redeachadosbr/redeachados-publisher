import express from 'express';
import session from 'express-session';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
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
  return { token:null, settings:{ brandName:'REDEACHADOS BR', shopeeStoreUrl:'', defaultPrivacy:'SELF_ONLY', defaultHashtagCount:6, tiktokClientKey:'', tiktokClientSecret:'', geminiApiKey:'', geminiModel:'gemini-2.5-flash-lite' }, history:[] };
}
function loadStore(){
  try { return { ...defaults(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; }
  catch { const d=defaults(); saveStore(d); return d; }
}
function saveStore(s){ fs.writeFileSync(DATA_FILE, JSON.stringify(s,null,2)); }
function now(){ return new Date().toISOString(); }
function removeFile(p){ try{ if(p && fs.existsSync(p)) fs.unlinkSync(p); }catch{} }
function baseUrl(req){ return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/,''); }
function redirectUri(req){ return `${baseUrl(req)}/auth/tiktok/callback`; }
function safeSettings(s){ return { brandName:s.brandName||'REDEACHADOS BR', shopeeStoreUrl:s.shopeeStoreUrl||'', defaultPrivacy:s.defaultPrivacy||'SELF_ONLY', defaultHashtagCount:Number(s.defaultHashtagCount||6), tiktokConfigured:Boolean(s.tiktokClientKey&&s.tiktokClientSecret), geminiConfigured:Boolean(s.geminiApiKey), geminiModel:s.geminiModel||'gemini-2.5-flash-lite' }; }
function mustLogin(req,res,next){
  const required = process.env.APP_PASSWORD;
  if(!required || req.session?.appAuth) return next();
  res.status(401).json({error:'LOGIN_REQUIRED'});
}

app.get('/api/health', (_req,res)=>res.json({ok:true,service:'REDEACHADOS BR Publisher Web V4'}));
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
  s.settings={
    ...old,
    brandName:String(req.body.brandName||old.brandName||'REDEACHADOS BR').trim(),
    shopeeStoreUrl:String(req.body.shopeeStoreUrl??old.shopeeStoreUrl??'').trim(),
    defaultPrivacy:String(req.body.defaultPrivacy||old.defaultPrivacy||'SELF_ONLY'),
    defaultHashtagCount:Math.max(3,Math.min(10,Number(req.body.defaultHashtagCount||old.defaultHashtagCount||6))),
    geminiModel:String(req.body.geminiModel||old.geminiModel||'gemini-2.5-flash-lite').trim(),
    tiktokClientKey:String(req.body.tiktokClientKey||'').trim() || old.tiktokClientKey || '',
    tiktokClientSecret:String(req.body.tiktokClientSecret||'').trim() || old.tiktokClientSecret || '',
    geminiApiKey:String(req.body.geminiApiKey||'').trim() || old.geminiApiKey || ''
  };
  saveStore(s);
  res.json({ok:true,settings:safeSettings(s.settings)});
});

async function refreshTokenIfNeeded(force=false){
  const s=loadStore(); const token=s.token; const cfg=s.settings||{};
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
  if(!r.ok||(d.error?.code&&d.error.code!=='ok')) throw new Error(d?.error?.message||d?.error_description||`TikTok HTTP ${r.status}`);
  return d;
}
async function creatorInfo(){ const d=await tiktokJson('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',body:'{}'}); return d.data||{}; }

app.get('/auth/tiktok', mustLogin, (req,res)=>{
  const cfg=loadStore().settings||{};
  if(!cfg.tiktokClientKey||!cfg.tiktokClientSecret) return res.status(400).send('Abra Configurações e informe Client Key e Client Secret do TikTok Developers.');
  const state=crypto.randomBytes(24).toString('hex'); req.session.oauthState=state;
  const p=new URLSearchParams({client_key:cfg.tiktokClientKey,response_type:'code',scope:'user.info.basic,video.publish',redirect_uri:redirectUri(req),state});
  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${p}`);
});
app.get('/auth/tiktok/callback', async(req,res)=>{
  try{
    if(req.query.error) throw new Error(req.query.error_description||req.query.error);
    if(!req.query.code||req.query.state!==req.session.oauthState) throw new Error('Autorização TikTok inválida ou expirada.');
    const s=loadStore(), cfg=s.settings||{};
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
  const title=`Olha esse achadinho 👀`;
  const description=`${product}. Uma opção prática para facilitar a rotina. Veja os detalhes e confira se combina com você.`;
  const hashtags=['#achadinhos','#utilidades','#comprasonline','#dicas','#'+String(brand||'redeachadosbr').toLowerCase().replace(/[^a-z0-9]/g,'')];
  const cta=shopUrl?'Confira na Shopee pelo link 👇':'Confira mais produtos no perfil.';
  return {product,title,description,hashtags,cta,confidence:'fallback'};
}
async function generateCopyWithGemini({images,filename}){
  const s=loadStore(), cfg=s.settings||{};
  if(!cfg.geminiApiKey) return fallbackCopy(filename,cfg.brandName,cfg.shopeeStoreUrl);
  const model=cfg.geminiModel||'gemini-2.5-flash-lite';
  const prompt=`Você é um redator de e-commerce brasileiro especializado em TikTok. Analise os frames de um vídeo de produto e gere metadados para publicação. Não invente especificações, certificações, preço, desconto, garantia, material, medidas ou funções que não estejam claramente visíveis. Evite promessas absolutas, alegações médicas e linguagem enganosa. Escreva em português do Brasil, natural e comercial sem spam. Retorne SOMENTE JSON válido neste formato: {"product":"nome genérico provável do produto","title":"chamada curta de até 70 caracteres","description":"descrição de 120 a 320 caracteres","hashtags":["#hashtag1","#hashtag2","#hashtag3","#hashtag4","#hashtag5","#hashtag6"],"cta":"chamada curta para conferir o produto"}. Marca da loja: ${cfg.brandName||'REDEACHADOS BR'}. Nome do arquivo: ${filename||''}.`;
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
  return {product:String(out.product||'Produto'),title:String(out.title||'Confira esse achadinho'),description:String(out.description||''),hashtags:tags.map(x=>String(x).startsWith('#')?String(x):'#'+String(x).replace(/\s+/g,'')),cta:String(out.cta||'Confira mais detalhes.'),confidence:'ai'};
}
app.post('/api/ai/generate', mustLogin, async(req,res)=>{
  try{ const out=await generateCopyWithGemini({images:req.body.images,filename:req.body.filename}); res.json(out); }
  catch(e){ res.status(400).json({error:e.message}); }
});

function buildCaption(meta, settings){
  const tags=(meta.hashtags||[]).slice(0,Math.max(3,Math.min(10,Number(settings.defaultHashtagCount||6)))).join(' ');
  const chunks=[meta.title,meta.description,meta.cta];
  if(settings.shopeeStoreUrl) chunks.push(settings.shopeeStoreUrl);
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
app.post('/api/publish', mustLogin, upload.single('video'), async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'Selecione um vídeo.'});
    const meta=JSON.parse(req.body.meta||'{}'); const s=loadStore(), settings=s.settings||{};
    const caption=buildCaption(meta,settings);
    const publishId=await publishFile(req.file,caption,{
      privacy:req.body.privacy||settings.defaultPrivacy||'SELF_ONLY',duration:Number(req.body.duration||0),
      disableComment:req.body.disableComment==='true',disableDuet:req.body.disableDuet==='true',disableStitch:req.body.disableStitch==='true',isAigc:req.body.isAigc==='true'
    });
    s.history.unshift({id:crypto.randomUUID(),publishId,filename:req.file.originalname,product:meta.product||'',caption,status:'PROCESSING_UPLOAD',createdAt:now()});
    s.history=s.history.slice(0,200); saveStore(s); removeFile(req.file.path);
    res.json({ok:true,publishId,caption});
  }catch(e){ if(req.file) removeFile(req.file.path); res.status(400).json({error:e.message}); }
});
app.get('/api/history', mustLogin, (_req,res)=>res.json(loadStore().history||[]));
app.post('/api/status/:publishId', mustLogin, async(req,res)=>{
  try{const d=await tiktokJson('https://open.tiktokapis.com/v2/post/publish/status/fetch/',{method:'POST',body:JSON.stringify({publish_id:req.params.publishId})});res.json(d.data||{});}catch(e){res.status(400).json({error:e.message});}
});

app.listen(PORT,()=>console.log(`REDEACHADOS BR Publisher Web V4 em http://localhost:${PORT}`));
