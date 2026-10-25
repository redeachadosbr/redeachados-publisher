import {inspect,stream,probe} from './shopeeMarktProTransport.js';

let galleryCache={loadedAt:0,base:'',records:[],bundleUrl:'',diagnostic:''};
function normalizeText(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function tokens(v){return normalizeText(v).split(' ').filter(x=>x.length>2);}
function cleanTitle(v){return String(v||'').replace(/[|•·]+/g,' ').replace(/[()\[\]{}]/g,' ').replace(/\s+/g,' ').trim();}
function scoreCandidate(query,text){const q=new Set(tokens(query)),t=new Set(tokens(text));if(!q.size||!t.size)return 0;let common=0;for(const x of q)if(t.has(x))common++;const recall=common/q.size,precision=common/Math.max(1,Math.min(t.size,q.size*3));return Math.min(1,recall*.86+precision*.14);}
function progressiveQueries(title){const out=[];const add=v=>{v=cleanTitle(v);if(!v)return;const k=normalizeText(v);if(k&&!out.some(x=>normalizeText(x)===k))out.push(v)};const full=cleanTitle(title);add(full);const words=full.split(/\s+/).filter(Boolean);for(let n=Math.min(7,words.length);n>=2;n--){const v=words.slice(0,n).join(' ');if(tokens(v).length>=2)add(v)}for(let n=words.length-1;n>=2&&out.length<24;n--){const v=words.slice(0,n).join(' ');if(tokens(v).length>=2)add(v)}const removable=new Set(['branco','branca','preto','preta','azul','rosa','vermelho','vermelha','verde','cinza','sortido','sortida','grande','medio','media','pequeno','pequena']);const filtered=words.filter(w=>!removable.has(normalizeText(w)));if(filtered.length>=2)add(filtered.join(' '));return out.slice(0,24)}
function decodeJsString(v){return String(v||'').replace(/\\u([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\n/g,' ').replace(/\\\//g,'/').replace(/\\u0026/g,'&');}
function parseRecords(text){
 const src=String(text||'').slice(0,24_000_000),out=[];
 // Lovable/Vite publica frequentemente objetos minificados com chaves sem
 // aspas: {id:"...",title:"..."}. O leitor antigo aceitava apenas JSON.
 const idKey=String.raw`(?:["']?(?:id|videoId|video_id|driveId|drive_id|fileId|file_id)["']?)`;
 const titleKey=String.raw`(?:["']?(?:title|titulo|nome|name)["']?)`;
 const ident=String.raw`["']([A-Za-z0-9_-]{12,200})["']`;
 const name=String.raw`["']([^"'{}]{4,500})["']`;
 const patterns=[
  new RegExp(idKey+'\\s*:\\s*'+ident+'[^}]{0,650}?'+titleKey+'\\s*:\\s*'+name,'g'),
  new RegExp(titleKey+'\\s*:\\s*'+name+'[^}]{0,650}?'+idKey+'\\s*:\\s*'+ident,'g')
 ];
 for(const [pindex,re] of patterns.entries()){
  for(const m of src.matchAll(re)){
   const id=decodeJsString(pindex===0?m[1]:m[2]).trim();
   const title=decodeJsString(pindex===0?m[2]:m[1]).trim();
   if(!id||!title)continue;
   const near=src.slice(Math.max(0,m.index-160),Math.min(src.length,m.index+m[0].length+400));
   const dm=near.match(/["']?(?:duration_ms|durationMs)["']?\s*:\s*["']?(\d{2,12})["']?/);
   const cm=near.match(/["']?category["']?\s*:\s*["']([^"']{2,120})["']/i);
   out.push({id,title,durationMs:dm?Number(dm[1]):0,category:cm?decodeJsString(cm[1]).trim():''});
  }
 }
 const seen=new Set();return out.filter(x=>!seen.has(x.id)&&(seen.add(x.id),true));
}
async function fetchText(url,headers,label='recurso'){const r=await fetch(url,{headers,redirect:'follow',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`${label} HTTP ${r.status}`);const length=Number(r.headers?.get?.('content-length')||0);if(length>24_000_000)throw Error(`${label} acima do limite permitido`);const text=await r.text();if(text.length>24_000_000)throw Error(`${label} muito grande`);return{text,finalUrl:r.url||url,status:r.status}}
function extractJsAssets(text,base){const out=[];const add=raw=>{raw=String(raw||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/').trim();if(!raw||!(/\.js(?:[?#]|$)/i.test(raw)))return;try{const u=new URL(raw,base);if(u.protocol==='https:'&&u.hostname===new URL(base).hostname)out.push(u.href)}catch{}};for(const m of String(text||'').matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi))add(m[1]);for(const m of String(text||'').matchAll(/["'`](\.?\/?(?:assets\/)?[A-Za-z0-9_./~-]+\.js(?:\?[^"'`]*)?)["'`]/g))add(m[1]);for(const m of String(text||'').matchAll(/(?:^|[^A-Za-z0-9_-])(routes-[A-Za-z0-9_-]+\.js)(?:[^A-Za-z0-9_-]|$)/g))add('/assets/'+m[1]);return[...new Set(out)]}
export const MARKTPRO_GALLERY_URL='https://packvideoswedrop.lovable.app/';
async function load(force=false){const base=MARKTPRO_GALLERY_URL;if(!force&&galleryCache.records.length&&Date.now()-galleryCache.loadedAt<10*60*1000&&galleryCache.base===base)return galleryCache;const headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36','Accept':'text/html,application/xhtml+xml,application/javascript,text/javascript,*/*','Accept-Language':'pt-BR,pt;q=0.9,en;q=0.8','Cache-Control':'no-cache'};const htmlInfo=await fetchText(base,headers,'HTML da galeria WeDrop');let queue=extractJsAssets(htmlInfo.text,htmlInfo.finalUrl||base),seen=new Set(),bestRecords=parseRecords(htmlInfo.text),bestUrl=htmlInfo.finalUrl||base,checked=0,failures=0,deadline=Date.now()+45000;while(queue.length&&checked<40&&Date.now()<deadline){const src=queue.shift();if(!src||seen.has(src))continue;seen.add(src);try{const info=await fetchText(src,headers,'Bundle da galeria');checked++;if(info.text.length>24_000_000)continue;const rec=parseRecords(info.text);if(rec.length>bestRecords.length){bestRecords=rec;bestUrl=src}for(const child of extractJsAssets(info.text,src))if(!seen.has(child)&&queue.length<120)queue.push(child);if(/\/routes-[^/]+\.js(?:\?|$)/i.test(src)&&rec.length>200)break}catch{failures++}}galleryCache={loadedAt:Date.now(),base,records:bestRecords,bundleUrl:bestUrl,diagnostic:
 bestRecords.length?`${bestRecords.length} registros candidatos encontrados na galeria WeDrop (${checked} scripts analisados).`:
 'Galeria WeDrop acessível, mas o formato do catálogo não forneceu links de vídeos reconhecíveis. Nenhum vídeo foi importado.'};
 return galleryCache}
const COLOR_WORDS=['preto','preta','branco','branca','azul','rosa','vermelho','vermelha','verde','cinza','amarelo','amarela','laranja','roxo','roxa','marrom','bege','dourado','dourada','prata','prateado','sortido','sortida'];
function detectedColors(v){const n=` ${normalizeText(v)} `;return [...new Set(COLOR_WORDS.filter(c=>n.includes(` ${c} `)).map(c=>c.replace(/a$/,'o')))];}
function detectedVoltages(v){return [...new Set((normalizeText(v).match(/\b(?:6|12|24|110|127|220|240)\s*v\b/g)||[]).map(x=>x.replace(/\s+/g,'')))];}
function variantSignals(product,title){
  if(!product||typeof product==='string')return{penalty:0,bonus:0,reasons:[],hardMismatch:false};
  const reasons=[];let penalty=0,bonus=0,hardMismatch=false;const t=normalizeText(title);
  const expectedColor=detectedColors(product.color||''); const gotColors=detectedColors(title);
  if(expectedColor.length&&gotColors.length){if(expectedColor.some(x=>gotColors.includes(x))){bonus+=.07;reasons.push('cor compatível')}else{penalty+=.30;hardMismatch=true;reasons.push('cor diferente')}}
  const expectedV=detectedVoltages(product.voltage||product.product||''); const gotV=detectedVoltages(title);
  if(expectedV.length&&gotV.length){if(expectedV.some(x=>gotV.includes(x))){bonus+=.06;reasons.push('voltagem compatível')}else{penalty+=.38;hardMismatch=true;reasons.push('voltagem diferente')}}
  const model=normalizeText(product.model||''); if(model&&model.length>=3){if(t.includes(model)){bonus+=.12;reasons.push('modelo exato')}}
  const brand=normalizeText(product.brand||''); if(brand&&brand.length>=3&&t.includes(brand)){bonus+=.05;reasons.push('marca compatível')}
  const cap=normalizeText(product.capacity||''); if(cap&&cap.length>=2&&t.includes(cap)){bonus+=.04;reasons.push('capacidade compatível')}
  return{penalty,bonus,reasons,hardMismatch};
}
function rank(records,query,product=null){return records.map(r=>{const base=scoreCandidate(query,r.title),sig=variantSignals(product,r.title);return{...r,textScore:base,score:Math.max(0,Math.min(1,base+sig.bonus-sig.penalty)),variantReasons:sig.reasons,hardMismatch:sig.hardMismatch}}).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'pt-BR'))}
async function search(productOrTitle,manual=''){const product=typeof productOrTitle==='object'&&productOrTitle?productOrTitle:null;const title=product?cleanTitle(product.product||product.seoTitle||product.model||product.sku):cleanTitle(productOrTitle);const inv=await load(),variants=manual?[cleanTitle(manual)]:progressiveQueries(title),result={inventoryCount:inv.records.length,diagnostic:inv.diagnostic,bestQuery:'',attempts:[],candidates:[]};for(const q of variants){if(!q)continue;const ranked=rank(inv.records,q,product);const hits=ranked.filter(x=>!x.hardMismatch&&x.score>=.46).slice(0,12);result.attempts.push({query:q,hits:hits.length});if(hits.length){result.bestQuery=q;result.candidates=hits;break}}if(!result.candidates.length&&variants.length){const q=variants.at(-1);result.bestQuery=q;result.candidates=rank(inv.records,q,product).filter(x=>!x.hardMismatch&&x.score>=.46).slice(0,6)}result.candidates=result.candidates.slice(0,5).map(x=>({...x,score:Number(x.score.toFixed(3)),textScore:Number((x.textScore||0).toFixed(3))}));return result}
export {search,stream,probe,inspect,load,normalizeText,scoreCandidate};
