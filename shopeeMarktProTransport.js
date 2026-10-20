'use strict';
// MercadoPro gallery stores shared video IDs in Google Drive. This read-only
// transport negotiates byte ranges, handles the official download confirmation,
// and never treats HTML confirmation/login pages as playable MP4 data.
import {Readable} from 'node:stream';
const sourceUrls=id=>[
 'https://drive.usercontent.google.com/download?id='+encodeURIComponent(id)+'&export=download&confirm=t',
 'https://drive.google.com/uc?export=download&confirm=t&id='+encodeURIComponent(id),
 'https://drive.google.com/uc?export=download&id='+encodeURIComponent(id)
];
const mediaType=v=>String(v||'').split(';')[0].toLowerCase().trim();
const sourceError=new Error('Arquivo indisponível no acervo.');
function parseConfirmPage(html,base,id){
 const page=String(html||'').slice(0,200000);
 for(const form of page.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi)||[]){
  const start=form.match(/^<form\b[^>]*>/i)?.[0]||'';
  if(/method=["']?post\b/i.test(start))continue;
  const raw=(start.match(/\baction=["']([^"']+)["']/i)||[])[1];
  if(!raw)continue;
  let u;try{u=new URL(raw.replaceAll('&amp;','&'),base)}catch(_){continue}
  if(u.protocol!=='https:'||!['drive.usercontent.google.com','drive.google.com'].includes(u.hostname))continue;
  if(!/\/(?:download|uc)(?:\?|$)/.test(u.pathname+'?'))continue;
  for(const input of form.match(/<input\b[^>]*>/gi)||[]){
   const name=(input.match(/\bname=["']([^"']+)["']/i)||[])[1];
   const value=(input.match(/\bvalue=["']([^"']*)["']/i)||[])[1]||'';
   if(['id','export','confirm','uuid'].includes(name))u.searchParams.set(name,value.replaceAll('&amp;','&'));
  }
  if(u.searchParams.get('id')!==id)continue;
  if(!u.searchParams.has('confirm'))u.searchParams.set('confirm','t');
  return u.href;
 }
 return null;
}
async function inspect(id,range='',options={}){
 if(!/^[A-Za-z0-9_-]{8,200}$/.test(id))throw Error('Identificador de vídeo inválido.');
 let last='',attempts=0;
 const headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36',
  'Accept':'video/mp4,video/*,application/octet-stream,*/*','Accept-Encoding':'identity'};
 if(range)headers.Range=range;
 for(const original of sourceUrls(id)){
  let next=original;
  for(let i=0;i<2&&next;i++){
   attempts++;
   try{
    const r=await (options.fetch||fetch)(next,{headers,redirect:'follow',signal:AbortSignal.timeout(18000)});
    if(!r.ok){last='Google Drive HTTP '+r.status;await r.body?.cancel?.();break}
    const ct=mediaType(r.headers.get('content-type'));
    if(ct==='text/html'||ct==='application/json'||ct==='text/plain'){
     const txt=(await r.text()).slice(0,200000);
     if(/sign in|fazer login|request access|solicitar acesso/i.test(txt))
      last='Arquivo exige permissão de acesso no Google Drive';
     else if(/quota exceeded|muitas vezes|too many users|too many requests/i.test(txt))
      last='Limite de acesso do arquivo no Google Drive';
     else last='Google Drive devolveu uma página no lugar do vídeo';
     next=i===0?parseConfirmPage(txt,r.url||next,id):null;
     continue;
    }
    if(r.status===206&&range&&!r.headers.get('content-range')){
     last='Origem respondeu com faixa incompleta sem Content-Range';
     await r.body?.cancel?.();break;
    }
    return {response:r,contentType:ct||'application/octet-stream',source:'Google Drive',attempts};
   }catch(e){last=e?.name==='TimeoutError'?'Google Drive não respondeu em 18 segundos':String(e.message||e).slice(0,150);break}
  }
 }
 const err=new Error('Vídeo do acervo indisponível: '+(last||sourceError.message));
 err.code='GALLERY_VIDEO_SOURCE_UNAVAILABLE';err.attempts=attempts;throw err;
}
async function probe(id,fetchImpl){
 const {response:r,contentType,attempts}=await inspect(id,'bytes=0-1023',{fetch:fetchImpl});
 let first=new Uint8Array();
 if(r.body){
  const reader=r.body.getReader();
  try{const part=await reader.read();first=part.value||first}finally{await reader.cancel().catch(()=>{})}
 }
 const type=contentType.startsWith('video/')||contentType==='application/octet-stream';
 const mp4=first.length>=12&&String.fromCharCode(...first.subarray(4,8))==='ftyp';
 const html=first.length>0&&/^\s*(?:<!doctype html|<html|<script)/i.test(new TextDecoder().decode(first.subarray(0,200)));
 return {ok:type&&!html&&(mp4||contentType.startsWith('video/')),
  source:'Google Drive',httpStatus:r.status,contentType,acceptRanges:r.headers.get('accept-ranges')||'',
  attempts,reason:html?'A origem devolveu HTML no lugar de um vídeo':!type?'Tipo de arquivo incompatível':
   !mp4&&contentType==='application/octet-stream'?'Arquivo não identificado como MP4':'',
  partial:r.status===206};
}
async function stream(id,range,res,download=false){
 const {response:r,contentType}=await inspect(id,range);
 res.status(r.status===206?206:200);
 res.setHeader('Content-Type',contentType.startsWith('video/')?contentType:'video/mp4');
 if(r.status===206){
  for(const h of ['content-range','content-length','accept-ranges']){
   const val=r.headers.get(h);if(val)res.setHeader(h,val);
  }
 }else{
  const len=r.headers.get('content-length');if(len)res.setHeader('Content-Length',len);
  res.setHeader('Accept-Ranges','none');
 }
 res.setHeader('Cache-Control','private, max-age=120');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Content-Disposition',download?`attachment; filename="clip-${id}.mp4"`:'inline');
 if(!r.body){res.end();return}
 Readable.fromWeb(r.body).on('error',()=>{try{res.destroy()}catch(_){}}).pipe(res);
}
export {stream,probe,inspect,parseConfirmPage};
