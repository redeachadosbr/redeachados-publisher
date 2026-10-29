import crypto from 'node:crypto';
import fs from 'node:fs';
import {readSandboxToken,saveSandboxToken} from './tiktokSandboxStore.js';
const ORIGIN='https://open.tiktokapis.com';
const COOKIE='ra_tiktok_sandbox_state';
function credentials(){
 const clientKey=String(process.env.TIKTOK_SANDBOX_CLIENT_KEY||'').trim();
 const clientSecret=String(process.env.TIKTOK_SANDBOX_CLIENT_SECRET||'').trim();
 const stateSecret=String(process.env.SESSION_SECRET||'').trim();
 if(!clientKey||!clientSecret||!stateSecret)throw Error('Configuração de Sandbox incompleta no Render.');
 return {clientKey,clientSecret,stateSecret};
}
function signature(secret,value){return crypto.createHmac('sha256',secret).update(value).digest('base64url');}
function oauthCookie(req,res,value){
 res.cookie(COOKIE,value,{httpOnly:true,sameSite:'lax',
  secure:req.secure||req.get('x-forwarded-proto')==='https',
  path:'/auth/tiktok/callback',maxAge:600000});
}
function clearState(req,res){
 res.clearCookie(COOKIE,{path:'/auth/tiktok/callback',sameSite:'lax',
  secure:req.secure||req.get('x-forwarded-proto')==='https'});
}
function validState(req,c){
 const state=String(req.query.state||'');
 const [mode,nonce,exp,mac,...extra]=state.split('.');
 if(mode!=='sandbox'||!/^[a-f0-9]{48}$/.test(nonce||'')||extra.length)return false;
 const expires=Number(exp);
 if(!Number.isSafeInteger(expires)||expires<Date.now()||expires>Date.now()+600000)return false;
 let actual='';try{
  const found=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  actual=decodeURIComponent(found?.slice(COOKIE.length+1)||'');
 }catch{}
 if(actual!==state)return false;
 const expected=signature(c.stateSecret,mode+'.'+nonce+'.'+exp);
 const a=Buffer.from(mac||''),b=Buffer.from(expected);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function safe(value){return String(value||'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
function authPage(message,success){
 return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Sandbox TikTok</title><style>body{font:16px system-ui;max-width:540px;padding:35px;margin:10vh auto;line-height:1.6}</style><h1>'+
 (success?'Conta de teste conectada':'Erro na conexão de teste')+'</h1><p>'+safe(message)+
 '</p><a href="/tiktok-sandbox.html">Voltar aos testes do Publisher</a></html>';
}
async function token(){
 const t=await readSandboxToken();
 if(!t)throw Error('Conecte a conta privada de teste no Sandbox.');
 if(t.access_token&&Date.now()<Number(t.obtained_at||0)+Number(t.expires_in||0)*1000-600000)return t.access_token;
 const c=credentials();
 const f=new URLSearchParams({client_key:c.clientKey,client_secret:c.clientSecret,grant_type:'refresh_token',refresh_token:t.refresh_token});
 const r=await fetch(ORIGIN+'/v2/oauth/token/',{method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},body:f,signal:AbortSignal.timeout(15000)});
 const next=await r.json().catch(()=>({}));
 if(!r.ok||next.error||!next.access_token)throw Error('A conexão de teste expirou. Reconecte a conta no Sandbox.');
 await saveSandboxToken({...t,...next,obtained_at:Date.now()});
 return next.access_token;
}
async function call(path,body){
 const key=await token();
 const r=await fetch(ORIGIN+path,{method:'POST',headers:{Authorization:'Bearer '+key,
  'Content-Type':'application/json; charset=UTF-8'},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(20000)});
 const result=await r.json().catch(()=>({}));
 if(!r.ok||(result.error?.code&&result.error.code!=='ok')){
  const code=String(result.error?.code||'').slice(0,90);
  const msg=String(result.error?.message||'TikTok recusou a solicitação.').slice(0,500);
  if(code==='unaudited_client_can_only_post_to_private_accounts')
   throw Error('O TikTok exige uma conta privada para este teste. Verifique se autorizou a conta de teste. Código: '+code);
  throw Error(msg+(code?' | Código: '+code:''));
 }
 return result.data||{};
}
const creator=()=>call('/v2/post/publish/creator_info/query/',{});
function blockForeignOrigin(req,res,next){
 const origin=req.get('origin');if(origin){
  try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Origem não autorizada.'});}
  catch{return res.status(403).json({error:'Origem inválida.'});}
 }
 next();
}
function plan(size){
 const max=64*1024*1024,min=5*1024*1024;
 if(size<=max)return {chunkSize:size,totalChunks:1};
 let n=Math.ceil(size/max),chunkSize=Math.floor(size/n);
 if(chunkSize<min){n=Math.max(1,Math.floor(size/min));chunkSize=Math.floor(size/n);}
 return {chunkSize,totalChunks:Math.ceil(size/chunkSize)};
}
export function registerTikTokSandbox(app,{mustLogin,upload,baseUrl}){
 app.get('/auth/tiktok/sandbox',(req,res,next)=>{
  // Requisição aberta pelo navegador: encaminha para login em vez de exibir JSON cru.
  // A proteção permanece ativa; não iniciamos o OAuth sem sessão autenticada.
  if(process.env.APP_PASSWORD && !req.session?.appAuth) return res.redirect(302,'/?loginFor=tiktok-sandbox');
  next();
 },(req,res)=>{
  try{
   const c=credentials(),nonce=crypto.randomBytes(24).toString('hex'),exp=String(Date.now()+600000);
   const body='sandbox.'+nonce+'.'+exp,state=body+'.'+signature(c.stateSecret,body);
   oauthCookie(req,res,state);
   const u=new URLSearchParams({client_key:c.clientKey,response_type:'code',
    scope:'user.info.basic,video.publish,video.upload',
    redirect_uri:baseUrl(req)+'/auth/tiktok/callback',state});
   res.redirect('https://www.tiktok.com/v2/auth/authorize/?'+u.toString());
  }catch(e){res.status(400).send(authPage(e.message,false));}
 });
 async function handleCallback(req,res){
  try{
   const c=credentials();
   if(req.query.error)throw Error(String(req.query.error_description||req.query.error));
   if(!req.query.code||!validState(req,c))throw Error('Autorização do Sandbox inválida ou expirada.');
   const f=new URLSearchParams({client_key:c.clientKey,client_secret:c.clientSecret,
    code:String(req.query.code),grant_type:'authorization_code',
    redirect_uri:baseUrl(req)+'/auth/tiktok/callback'});
   const r=await fetch(ORIGIN+'/v2/oauth/token/',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body:f,signal:AbortSignal.timeout(15000)});
   const t=await r.json().catch(()=>({}));
   if(!r.ok||t.error||!t.access_token||!t.refresh_token)throw Error(t.error_description||t.error||'Falha na autorização do Sandbox.');
   await saveSandboxToken({...t,obtained_at:Date.now()});
   clearState(req,res);
   res.type('html').send(authPage('A conta de teste foi conectada ao Sandbox, sem substituir a conta principal.',true));
  }catch(e){clearState(req,res);res.status(400).type('html').send(authPage(e.message,false));}
 }
 app.get('/api/tiktok/sandbox/account',mustLogin,async(_req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   credentials();
   const t=await readSandboxToken();
   if(!t)return res.json({connected:false,configured:true});
   const info=await creator();
   res.json({connected:true,configured:true,
    username:String(info.creator_username||info.creator_nickname||'Conta de teste').slice(0,100),
    privacyOptions:Array.isArray(info.privacy_level_options)?info.privacy_level_options:[],
    maxDuration:Number(info.max_video_post_duration_sec||0)});
  }catch(e){res.status(400).json({connected:false,error:e.message});}
 });
 app.post('/api/tiktok/sandbox/publish',mustLogin,blockForeignOrigin,upload.single('video'),async(req,res)=>{
  const file=req.file;
  try{
   if(!file||!file.path)throw Error('Selecione um vídeo MP4.');
   if(file.size<1024||file.size>300*1024*1024)throw Error('O vídeo deve ter até 300 MB.');
   if(!/\.mp4$/i.test(file.originalname))throw Error('Para o teste, utilize um arquivo MP4.');
   if(req.body.confirm!=='yes')throw Error('Revise e autorize o envio antes de publicar.');
   if(req.body.privacy!=='SELF_ONLY')throw Error('Sandbox: selecione a privacidade Somente eu.');
   const caption=String(req.body.caption||'').trim();
   if(!caption||caption.length>2200)throw Error('Informe uma legenda de até 2.200 caracteres.');
   const info=await creator();
   if(!info.privacy_level_options?.includes('SELF_ONLY'))throw Error('O TikTok não disponibilizou a opção privada.');
   const {chunkSize,totalChunks}=plan(file.size);
   const init=await call('/v2/post/publish/video/init/',{
    post_info:{title:caption,privacy_level:'SELF_ONLY',disable_duet:true,disable_stitch:true,
     disable_comment:Boolean(info.comment_disabled),video_cover_timestamp_ms:1000,
     brand_organic_toggle:true,brand_content_toggle:false,is_aigc:req.body.ai==='yes'},
    source_info:{source:'FILE_UPLOAD',video_size:file.size,chunk_size:chunkSize,total_chunk_count:totalChunks}
   });
   const url=String(init.upload_url||''),publishId=String(init.publish_id||'');
   if(!/^https:\/\//.test(url)||!publishId)throw Error('TikTok não retornou o endereço de upload.');
   const fd=fs.openSync(file.path,'r');let start=0;
   try{
    while(start<file.size){
     let end=Math.min(start+chunkSize,file.size);
     if(file.size-end>0&&file.size-end<5*1024*1024)end=file.size;
     const len=end-start,buf=Buffer.allocUnsafe(len);
     fs.readSync(fd,buf,0,len,start);
     const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'video/mp4',
      'Content-Length':String(len),'Content-Range':'bytes '+start+'-'+(end-1)+'/'+file.size},
      body:buf,signal:AbortSignal.timeout(120000)});
     if(![201,206].includes(r.status))throw Error('Falha ao transmitir o vídeo (HTTP '+r.status+').');
     start=end;
    }
   }finally{fs.closeSync(fd);}
   res.json({ok:true,publishId});
  }catch(e){res.status(400).json({error:e.message});}
  finally{try{if(file?.path)fs.unlinkSync(file.path);}catch{}}
 });
 app.post('/api/tiktok/sandbox/status',mustLogin,blockForeignOrigin,async(req,res)=>{
  try{
   const publishId=String(req.body.publishId||'');
   if(!/^[A-Za-z0-9:_-]{5,160}$/.test(publishId))throw Error('Identificador inválido.');
   const info=await call('/v2/post/publish/status/fetch/',{publish_id:publishId});
   res.setHeader('Cache-Control','no-store');
   res.json({status:info.status||'UNKNOWN',failReason:info.fail_reason||''});
  }catch(e){res.status(400).json({error:e.message});}
 });
 return {handleCallback};
}
