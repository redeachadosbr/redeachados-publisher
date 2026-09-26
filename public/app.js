const $=s=>document.querySelector(s);
let config=null, selectedFile=null, duration=0, frames=[], generated=null;

const DRAFT_KEY='redeachados_publisher_draft_v541';
let captionManual=false;
function saveDraft(){
  try{
    const data={
      product:$('#product')?.value||'', shopeeUrl:$('#shopeeUrl')?.value||'', title:$('#title')?.value||'',
      description:$('#description')?.value||'', cta:$('#cta')?.value||'', hashtags:$('#hashtags')?.value||'',
      privacy:$('#privacy')?.value||'SELF_ONLY', disableComment:Boolean($('#disableComment')?.checked),
      disableDuet:Boolean($('#disableDuet')?.checked), disableStitch:Boolean($('#disableStitch')?.checked),
      isAigc:Boolean($('#isAigc')?.checked), caption:$('#captionPreview')?.value||'', captionManual:Boolean(captionManual), savedAt:Date.now()
    };
    localStorage.setItem(DRAFT_KEY,JSON.stringify(data));
  }catch{}
}
function restoreDraft(){
  try{
    const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null'); if(!d)return;
    for(const id of ['product','shopeeUrl','title','description','cta','hashtags']) if(d[id] && $('#'+id)) $('#'+id).value=d[id];
    if(d.privacy && $('#privacy')) $('#privacy').value=d.privacy;
    if($('#disableComment')) $('#disableComment').checked=Boolean(d.disableComment);
    if($('#disableDuet')) $('#disableDuet').checked=Boolean(d.disableDuet);
    if($('#disableStitch')) $('#disableStitch').checked=Boolean(d.disableStitch);
    if($('#isAigc')) $('#isAigc').checked=Boolean(d.isAigc);
    captionManual=Boolean(d.captionManual);
    if(d.product||d.title||d.description||d.cta||d.hashtags){ generated={...(generated||{}),product:d.product||'',shopeeUrl:d.shopeeUrl||'',title:d.title||'',description:d.description||'',cta:d.cta||'',hashtags:String(d.hashtags||'').split(/\s+/).filter(x=>x.startsWith('#'))}; }
    if(captionManual && d.caption && $('#captionPreview')) $('#captionPreview').value=d.caption; else updateCaption(true);
  }catch{}
}
function clearDraft(){try{localStorage.removeItem(DRAFT_KEY)}catch{}}

function toast(msg,err=false){const d=document.createElement('div');d.className='toast'+(err?' err':'');d.textContent=msg;$('#toast').appendChild(d);setTimeout(()=>d.remove(),5000)}
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{...(opt.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Erro inesperado.');return d}
async function boot(){
  const a=await api('/api/auth-state');
  if(a.locked&&!a.loggedIn){$('#loginScreen').classList.remove('hidden');return}
  $('#app').classList.remove('hidden'); await loadConfig(); restoreDraft(); await loadHistory();
}
async function loadConfig(){
  config=await api('/api/config');
  const s=config.settings;
  $('#brandName').value=s.brandName||'REDEACHADOS BR';$('#shopeeStoreUrl').value=s.shopeeStoreUrl||'';$('#geminiModel').value=s.geminiModel||'gemini-3.5-flash-lite';$('#redirectUri').value=config.redirectUri;
  $('#geminiApiKey').placeholder=s.geminiConfigured?'Configurado ✓ — deixe em branco para manter':'Cole a chave aqui';
  $('#tiktokClientKey').placeholder=s.tiktokConfigured?'Configurado ✓ — deixe em branco para manter':'Client Key do TikTok';
  $('#tiktokClientSecret').placeholder=s.tiktokConfigured?'Configurado ✓ — deixe em branco para manter':'Client Secret do TikTok';
  await loadCatalogStatus();
  $('#connectionText').textContent=config.tiktokConnected?'Conta conectada e pronta para enviar rascunhos.':'Conta ainda não conectada.';
  $('#connectBtn').textContent=config.tiktokConnected?'Reconectar TikTok':'Conectar TikTok';
  $('#connectBtn').title='A conexão abre em outra aba para não perder vídeo, legenda ou campos já preenchidos.';
  if(!s.tiktokConfigured||!s.geminiConfigured) setTimeout(()=>$('#settingsDialog').showModal(),300);
}
$('#loginBtn').onclick=async()=>{try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#loginPassword').value})});location.reload()}catch(e){toast(e.message,true)}};
$('#settingsBtn').onclick=()=>$('#settingsDialog').showModal();
$('#saveSettingsBtn').onclick=async e=>{e.preventDefault();try{await api('/api/settings',{method:'POST',body:JSON.stringify({brandName:$('#brandName').value,shopeeStoreUrl:$('#shopeeStoreUrl').value,geminiApiKey:$('#geminiApiKey').value,geminiModel:$('#geminiModel').value,tiktokClientKey:$('#tiktokClientKey').value,tiktokClientSecret:$('#tiktokClientSecret').value})});toast('Configuração salva.');$('#settingsDialog').close();await loadConfig();if(selectedFile)await analyze()}catch(err){toast(err.message,true)}};

async function loadCatalogStatus(){
  try{const c=await api('/api/catalog');$('#catalogStatus').textContent=c.count?`Catálogo carregado: ${c.count} produtos. Última atualização: ${c.importedAt?new Date(c.importedAt).toLocaleString('pt-BR'):'não informada'}.`:'Nenhum catálogo carregado ainda.';}catch{$('#catalogStatus').textContent='Não foi possível consultar o catálogo.'}
}
$('#importCatalogBtn').onclick=async()=>{
  const file=$('#catalogFile').files?.[0]; if(!file)return toast('Selecione a planilha de Informações básicas da Shopee.',true);
  const btn=$('#importCatalogBtn');btn.disabled=true;btn.textContent='IMPORTANDO...';
  try{const fd=new FormData();fd.append('catalog',file);const r=await api('/api/catalog/import',{method:'POST',body:fd});toast(`Catálogo atualizado: ${r.count} produtos.`);$('#catalogFile').value='';await loadCatalogStatus();}
  catch(e){toast(e.message,true)}finally{btn.disabled=false;btn.textContent='Atualizar catálogo'}
};

$('#chooseBtn').onclick=()=>$('#videoInput').click();$('#changeBtn').onclick=()=>$('#videoInput').click();
const dz=$('#dropzone');['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>{const f=e.dataTransfer.files?.[0];if(f)selectVideo(f)});$('#videoInput').onchange=e=>{const f=e.target.files?.[0];if(f)selectVideo(f)};
async function selectVideo(file){
  if(!file.type.startsWith('video/'))return toast('Selecione um arquivo de vídeo.',true);
  selectedFile=file; generated=null;frames=[];$('#fileName').textContent=file.name;$('#preview').src=URL.createObjectURL(file);$('#dropzone').classList.add('hidden');$('#workArea').classList.remove('hidden');$('#aiStatus').textContent='Lendo o vídeo...';
  try{await new Promise((resolve,reject)=>{const v=$('#preview');v.onloadedmetadata=()=>{duration=v.duration||0;resolve()};v.onerror=reject});frames=await extractFrames($('#preview'),[.15,.5,.85]);await loadCreator();await analyze()}catch(e){toast('Não consegui analisar o vídeo: '+e.message,true);$('#aiStatus').textContent='Falha na análise.'}
}
async function extractFrames(video,points){
  const out=[];for(const p of points){const t=Math.max(0,Math.min(video.duration-.05,video.duration*p));await new Promise((resolve,reject)=>{const done=()=>{video.removeEventListener('seeked',done);resolve()};video.addEventListener('seeked',done,{once:true});video.currentTime=t;setTimeout(()=>reject(new Error('Tempo esgotado ao capturar frames.')),6000)});const c=document.createElement('canvas');const max=720,scale=Math.min(1,max/video.videoWidth);c.width=Math.max(1,Math.round(video.videoWidth*scale));c.height=Math.max(1,Math.round(video.videoHeight*scale));c.getContext('2d').drawImage(video,0,0,c.width,c.height);out.push(c.toDataURL('image/jpeg',.72))}video.currentTime=0;return out;
}
async function analyze(){
  if(!selectedFile)return;$('#aiStatus').textContent='Analisando produto e criando a publicação...';$('#regenerateBtn').disabled=true;
  try{generated=await api('/api/ai/generate',{method:'POST',body:JSON.stringify({filename:selectedFile.name,images:frames})});fillGenerated();$('#aiStatus').textContent=generated.confidence==='ai'?'Pronto: conteúdo criado automaticamente pela IA.':'Pronto: modo básico usado. Configure a chave da IA para análise visual.'}
  catch(e){toast(e.message,true);$('#aiStatus').textContent='Não foi possível gerar o conteúdo.'}finally{$('#regenerateBtn').disabled=false}
}
function fillGenerated(){
  $('#product').value=generated.product||'';$('#shopeeUrl').value=generated.shopeeUrl||'';$('#title').value=generated.title||'';$('#description').value=generated.description||'';$('#cta').value=generated.cta||'';$('#hashtags').value=(generated.hashtags||[]).join(' ');
  if(generated.catalogMatch) toast(`Produto vinculado ao catálogo: ${generated.catalogMatch.name}`);
  captionManual=false;updateCaption(true);saveDraft();
}

function currentMeta(){return{product:$('#product').value.trim(),shopeeUrl:$('#shopeeUrl').value.trim(),title:$('#title').value.trim(),description:$('#description').value.trim(),cta:$('#cta').value.trim(),hashtags:$('#hashtags').value.trim().split(/\s+/).filter(x=>x.startsWith('#'))}}
function productEmoji(m={}){const t=`${m.product||''} ${m.title||''} ${m.description||''}`.toLowerCase();if(/avental|mini chef|chef|cozinha infantil/.test(t))return'👩‍🍳';if(/cozinha|panela|cafeteira|chaleira|frigideira|utens[ií]lio|assadeira|pote|galheteiro/.test(t))return'🍳';if(/brinqued|infantil|crian[cç]a|bonec|carrinho|pista|jogo/.test(t))return'🎁';if(/organiz|gaveta|prateleira|porta joia|armazen/.test(t))return'✨';if(/limp|mop|escova|pano|vassoura/.test(t))return'🧼';if(/luz|led|lumin[aá]ria|sensor/.test(t))return'💡';if(/beleza|maquiagem|pincel|joia|brinco/.test(t))return'💖';if(/fitness|balan[cç]a|treino|academia/.test(t))return'💪';return'✨'}
function cleanEmoji(t=''){return String(t||'').replace(/^\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u,'').trim()}
function buildAutoCaption(){if(!config)return'';const m=currentMeta(),e=productEmoji(m),parts=[];if(m.title)parts.push(`${e} ${cleanEmoji(m.title)}`);if(m.description)parts.push(`📝 ${cleanEmoji(m.description)}`);if(m.cta)parts.push(`🛍️ ${cleanEmoji(m.cta)}`);if(m.hashtags.length)parts.push(m.hashtags.join(' '));return parts.filter(Boolean).join('\n\n').slice(0,2200)}
function updateCaption(force=false){if(!config)return;if(captionManual&&!force)return;$('#captionPreview').value=buildAutoCaption()}
function restoreGeneratedCaption(){captionManual=false;updateCaption(true);saveDraft();toast('Legenda restaurada a partir dos campos gerados.')}
$('#captionPreview').addEventListener('input',()=>{captionManual=true;saveDraft()});
$('#restoreCaptionBtn').onclick=restoreGeneratedCaption;
$('#copyCaptionBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('#captionPreview').value.trim());toast('Legenda copiada. Cole no TikTok ao finalizar o rascunho.')}catch{toast('Não foi possível copiar automaticamente. Selecione a legenda e use Ctrl+C.',true)}};
['product','shopeeUrl','title','description','cta','hashtags'].forEach(id=>$('#'+id).addEventListener('input',()=>{updateCaption(false);saveDraft()}));
['privacy','disableComment','disableDuet','disableStitch','isAigc'].forEach(id=>$('#'+id)?.addEventListener('change',saveDraft));
$('#connectBtn').addEventListener('click',()=>saveDraft());
$('#regenerateBtn').onclick=analyze;
async function loadCreator(){
  if(!config?.tiktokConnected)return;
  try{const c=await api('/api/creator');const p=$('#privacy');p.innerHTML='';for(const x of(c.privacy_level_options||['SELF_ONLY'])){const o=document.createElement('option');o.value=x;o.textContent={PUBLIC_TO_EVERYONE:'Público',MUTUAL_FOLLOW_FRIENDS:'Amigos',FOLLOWER_OF_CREATOR:'Seguidores',SELF_ONLY:'Somente eu'}[x]||x;p.appendChild(o)} if((c.privacy_level_options||[]).includes(config.settings.defaultPrivacy))p.value=config.settings.defaultPrivacy;}catch(e){toast(e.message,true)}
}
$('#publishBtn').onclick=async()=>{
  if(!selectedFile)return toast('Escolha um vídeo.',true);if(!generated)return toast('Aguarde a geração da publicação.',true);if(!config.tiktokConnected)return toast('Conecte sua conta TikTok primeiro.',true);
  const b=$('#publishBtn');b.disabled=true;b.textContent='ENVIANDO RASCUNHO...';
  try{
    const fd=new FormData();fd.append('video',selectedFile);fd.append('meta',JSON.stringify(currentMeta()));fd.append('caption',$('#captionPreview').value.trim());fd.append('duration',String(duration||0));
    const r=await api('/api/upload-draft',{method:'POST',body:fd});
    toast('Rascunho enviado. Abra o TikTok e toque na notificação da caixa de entrada para concluir.');
    try{await navigator.clipboard.writeText($('#captionPreview').value.trim())}catch{}
    await loadHistory();resetVideo();
  }catch(e){toast(e.message,true)}finally{b.disabled=false;b.textContent='ENVIAR RASCUNHO AO TIKTOK'}
};
function resetVideo(){selectedFile=null;frames=[];generated=null;captionManual=false;clearDraft();$('#preview').removeAttribute('src');$('#workArea').classList.add('hidden');$('#dropzone').classList.remove('hidden');$('#videoInput').value=''}
async function loadHistory(){try{const h=await api('/api/history');$('#history').innerHTML=h.length?h.slice(0,10).map(x=>`<div class="history-item"><div><b>${esc(x.product||x.filename)}</b><br><small>${new Date(x.createdAt).toLocaleString('pt-BR')}</small></div><div><small>${esc(x.status||'PROCESSING')}</small></div></div>`).join(''):'<p class="small">Nenhuma publicação ainda.</p>'}catch{}}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
const q=new URLSearchParams(location.search);if(q.get('error'))toast(q.get('error'),true);if(q.get('tiktok')==='connected')toast('TikTok conectado com sucesso. Você pode fechar esta aba e voltar ao vídeo anterior.');
window.addEventListener('focus',async()=>{try{if(!$('#app').classList.contains('hidden')){await loadConfig();await loadCreator();}}catch{}});

async function loadRemoteVideo(candidate,product){
  const status=$('#wedropStatus');
  try{
    status.textContent='Baixando vídeo da galeria…';
    const r=await fetch('/api/wedrop/video?url='+encodeURIComponent(candidate.url));
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Falha ao baixar o vídeo.')}
    const blob=await r.blob();
    const ext=(blob.type.includes('webm')?'webm':blob.type.includes('quicktime')?'mov':'mp4');
    const baseName=(product?.name||product?.sku||'wedrop').replace(/[\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
    const file=new File([blob],`${baseName}.${ext}`,{type:blob.type||'video/mp4'});
    status.textContent='Vídeo carregado. Extraindo frames e analisando o produto…';
    await selectVideo(file);
    if(product?.shopeeUrl && !$('#shopeeUrl').value) $('#shopeeUrl').value=product.shopeeUrl;
    saveDraft();
    status.textContent='Vídeo carregado e analisado. Revise a publicação abaixo.';
    window.scrollTo({top:document.querySelector('.upload-card').offsetTop-12,behavior:'smooth'});
  }catch(e){toast(e.message,true);status.textContent=e.message}
}
function renderWedropAttempts(data){
  const box=$('#wedropAttempts'), list=data.gallery?.attempts||[]; box.innerHTML='';
  if(!list.length){box.classList.add('hidden');return}
  box.classList.remove('hidden');
  box.innerHTML='<b>Tentativas automáticas</b>'+list.map((x,i)=>`<div class="attempt-row"><span>${i+1}. ${esc(x.query)}</span><small>${x.matches?`✅ ${x.matches} resultado(s)`:`sem resultado · similaridade ${Math.round((x.bestScore||0)*100)}%`}</small></div>`).join('');
}
async function rememberWedropSearch(sku,query){
  if(!sku||!query)return; try{await api('/api/wedrop/alias',{method:'POST',body:JSON.stringify({sku,query})})}catch{}
}
function renderWedropResults(data){
  const box=$('#wedropResults'), status=$('#wedropStatus'); box.innerHTML='';
  const p=data.product||{};
  if(p.name && !$('#wedropQuery').value.trim()) $('#wedropQuery').value=p.name;
  renderWedropAttempts(data);
  status.innerHTML=`<b>${esc(data.sku)}</b>${p.name?' · '+esc(p.name):''}<br>${esc(data.gallery?.diagnostic||'')}`;
  const list=data.gallery?.candidates||[];
  if(list.length){
    box.classList.remove('hidden');
    list.forEach((c,i)=>{
      const el=document.createElement('div');el.className='video-result';
      el.innerHTML=`<div><b>Vídeo ${i+1}</b><small>${esc((c.label||p.name||data.sku).slice(0,150))}</small><small>Busca: ${esc(c.matchQuery||data.gallery?.bestQuery||'')}</small></div><button class="primary">USAR ESTE VÍDEO</button>`;
      el.querySelector('button').onclick=async()=>{await rememberWedropSearch(data.sku,c.matchQuery||data.gallery?.bestQuery);loadRemoteVideo(c,p)}; box.appendChild(el);
    });
  }else{
    box.classList.remove('hidden');
    const el=document.createElement('div');el.className='video-result fallback';
    const suggested=data.gallery?.attempts?.at(-1)?.query||p.name||data.sku;
    el.innerHTML=`<div><b>Nenhum vídeo confirmado automaticamente</b><small>Você pode apagar algumas palavras do final no campo “Busca manual” e tentar novamente.</small><small>Última tentativa: ${esc(suggested)}</small></div><a class="primary linkbtn" target="_blank" rel="noopener" href="${esc(data.gallery?.galleryUrl||'https://drive-vid-gallery.lovable.app/')}">ABRIR GALERIA</a>`;
    box.appendChild(el);
  }
}
async function searchWedrop(manual=false){
  const sku=$('#wedropSku').value.trim(); if(!sku)return toast('Digite a SKU WeDrop.',true);
  const q=manual?$('#wedropQuery').value.trim():'';
  const b=manual?$('#wedropManualBtn'):$('#wedropSearchBtn');b.disabled=true;b.textContent='BUSCANDO…';$('#wedropStatus').textContent=manual?'Tentando o nome informado…':'Buscando pelo título completo e encurtando automaticamente se necessário…';
  try{const d=await api('/api/wedrop/lookup?sku='+encodeURIComponent(sku)+(q?'&q='+encodeURIComponent(q):''));renderWedropResults(d)}catch(e){toast(e.message,true);$('#wedropStatus').textContent=e.message}finally{b.disabled=false;b.textContent=manual?'TENTAR ESTA BUSCA':'BUSCAR VÍDEO'}
}
$('#wedropSearchBtn')?.addEventListener('click',()=>searchWedrop(false));
$('#wedropManualBtn')?.addEventListener('click',()=>searchWedrop(true));
$('#wedropSku')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchWedrop(false)});

$('#wedropQuery')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchWedrop(true)});

boot();
