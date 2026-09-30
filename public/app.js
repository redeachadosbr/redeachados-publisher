const $=s=>document.querySelector(s);
let config=null, selectedFile=null, selectedRemoteVideo=null, duration=0, frames=[], generated=null, preparedStoryFile=null, preparedStoryVideoId='';
let previewObjectUrl='';

const DRAFT_KEY='redeachados_publisher_draft_v552';
const DRAFT_DB='redeachados_publisher_media_v5516';
const DRAFT_DB_VERSION=1;
const DRAFT_VIDEO_STORE='videos';
const DRAFT_VIDEO_KEY='current-manual-video';
const TIKTOK_AUTH_CHANNEL='redeachados_tiktok_auth_v1';
const TIKTOK_AUTH_EVENT_KEY='redeachados_tiktok_auth_event_v1';
let captionManual=false;
let commentManual=false;
let instagramManual=false;
let tiktokAuthInvalid=false;
let activeDraftSku='';
let tiktokAuthChannel=null;

function socialButtonMarkup(platform,state='idle'){
  const isTikTok=platform==='tiktok', isStory=platform==='story';
  const icon=isTikTok?'i-tiktok':'i-instagram';
  const labels=isTikTok?{
    idle:['Enviar rascunho ao TikTok','Finalize a publicação no aplicativo'],
    loading:['Enviando rascunho...','Aguarde a transferência do vídeo'],
    success:['Rascunho enviado','Abra o TikTok para finalizar'],
    reconnect:['Reconectar TikTok','Autorização inválida ou expirada']
  }:isStory?{
    idle:['Publicar Story automático','API oficial · sem adesivo de link'],
    loading:['Publicando Story...','Aguarde a confirmação da Meta'],
    success:['Story publicado','Sem adesivo de link']
  }:{
    idle:['Publicar Reel no Instagram','Publicação automática do Reel'],
    loading:['Publicando Reel...','Aguarde a confirmação da Meta'],
    success:['Reel publicado','Automação associada ao Reel']
  };
  const [title,subtitle]=labels[state]||labels.idle;
  const spinner=state==='loading'?'<span class="button-spinner" aria-hidden="true"></span>':`<svg class="icon social-button-icon"><use href="#${icon}"/></svg>`;
  return `${spinner}<span class="social-button-copy"><b>${title}</b><small>${subtitle}</small></span>`;
}
function setSocialButton(platform,state='idle'){
  const b=$(platform==='tiktok'?'#publishBtn':platform==='story'?'#instagramStoryPublishBtn':'#instagramPublishBtn'); if(!b)return;
  b.dataset.state=state;b.innerHTML=socialButtonMarkup(platform,state);
  if(platform==='tiktok'&&state==='reconnect') b.classList.add('needs-reconnect'); else b.classList.remove('needs-reconnect');
}
function syncTikTokPublishState(){
  const invalidFromUrl=/tiktok/i.test(new URLSearchParams(location.search).get('error')||'')&&/(inválid|expirad)/i.test(new URLSearchParams(location.search).get('error')||'');
  tiktokAuthInvalid=tiktokAuthInvalid||invalidFromUrl;
  if(!config?.tiktokConnected||tiktokAuthInvalid){setSocialButton('tiktok','reconnect');return false;}
  setSocialButton('tiktok','idle');return true;
}
function openDraftDb(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('IndexedDB indisponível neste navegador.'));
    const req=indexedDB.open(DRAFT_DB,DRAFT_DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DRAFT_VIDEO_STORE))db.createObjectStore(DRAFT_VIDEO_STORE)};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Não foi possível abrir o armazenamento local do vídeo.'));
  });
}
async function persistManualVideo(file){
  if(!file)return;
  const db=await openDraftDb();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(DRAFT_VIDEO_STORE,'readwrite');
      tx.objectStore(DRAFT_VIDEO_STORE).put({file,name:file.name,type:file.type,size:file.size,lastModified:file.lastModified,savedAt:Date.now()},DRAFT_VIDEO_KEY);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Falha ao salvar vídeo local.'));tx.onabort=()=>reject(tx.error||new Error('Armazenamento do vídeo foi interrompido.'));
    });
  }finally{db.close()}
}
async function getStoredManualVideo(){
  try{
    const db=await openDraftDb();
    try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DRAFT_VIDEO_STORE,'readonly');const req=tx.objectStore(DRAFT_VIDEO_STORE).get(DRAFT_VIDEO_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
    finally{db.close()}
  }catch{return null}
}
async function deleteStoredManualVideo(){
  try{
    const db=await openDraftDb();
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(DRAFT_VIDEO_STORE,'readwrite');tx.objectStore(DRAFT_VIDEO_STORE).delete(DRAFT_VIDEO_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
    finally{db.close()}
  }catch{}
}
function safeRemoteVideoSnapshot(){
  if(!selectedRemoteVideo?.id)return null;
  return {
    id:String(selectedRemoteVideo.id),title:String(selectedRemoteVideo.title||''),catalogProductId:String(selectedRemoteVideo.catalogProductId||''),
    catalogSku:String(selectedRemoteVideo.catalogSku||''),catalogProductName:String(selectedRemoteVideo.catalogProductName||''),catalogProductUrl:String(selectedRemoteVideo.catalogProductUrl||'')
  };
}
function saveDraft(){
  try{
    const data={
      draftVersion:2,activeSku:activeDraftSku||selectedRemoteVideo?.catalogSku||'',wedropSku:$('#wedropSku')?.value||'',wedropQuery:$('#wedropQuery')?.value||'',
      mediaType:selectedRemoteVideo?.id?'remote':selectedFile?'manual':'',selectedRemoteVideo:safeRemoteVideoSnapshot(),
      manualVideo:selectedFile?{name:selectedFile.name,type:selectedFile.type,size:selectedFile.size,lastModified:selectedFile.lastModified}:null,duration:Number(duration||0),
      product:$('#product')?.value||'', shopeeUrl:$('#shopeeUrl')?.value||'', title:$('#title')?.value||'',
      description:$('#description')?.value||'', cta:$('#cta')?.value||'', hashtags:$('#hashtags')?.value||'',
      privacy:$('#privacy')?.value||'SELF_ONLY', disableComment:Boolean($('#disableComment')?.checked),
      disableDuet:Boolean($('#disableDuet')?.checked), disableStitch:Boolean($('#disableStitch')?.checked),
      isAigc:Boolean($('#isAigc')?.checked), caption:$('#captionPreview')?.value||'', captionManual:Boolean(captionManual), purchaseComment:$('#purchaseComment')?.value||'', commentManual:Boolean(commentManual), instagramCaption:$('#instagramCaption')?.value||'', instagramDescription:generated?.instagramDescription||'', instagramManual:Boolean(instagramManual),
      generatedSnapshot:generated?{confidence:generated.confidence||'',instagramDescription:generated.instagramDescription||'',catalogMatch:generated.catalogMatch||null}:null,
      dmEnabled:Boolean($('#dmEnabled')?.checked), dmKeyword:$('#dmKeyword')?.value||'QUERO', publicReplyEnabled:Boolean($('#publicReplyEnabled')?.checked), createMetaAd:Boolean($('#createMetaAd')?.checked), metaAdStatus:$('#metaAdStatus')?.value||'PAUSED', savedAt:Date.now()
    };
    localStorage.setItem(DRAFT_KEY,JSON.stringify(data));
  }catch{}
}
function readDraft(){try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'null')}catch{return null}}
function setPreviewObjectUrl(file){
  if(previewObjectUrl){try{URL.revokeObjectURL(previewObjectUrl)}catch{}previewObjectUrl=''}
  previewObjectUrl=URL.createObjectURL(file);$('#preview').src=previewObjectUrl;
}
function showDraftWorkspace(filename='Vídeo restaurado'){
  $('#fileName').textContent=filename;$('#dropzone').classList.add('hidden');$('#workArea').classList.remove('hidden');
}
async function waitForVideoMetadata(video,timeout=12000){
  if(video.readyState>=1)return;
  await new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',ok);video.removeEventListener('error',bad)};const ok=()=>{cleanup();resolve()};const bad=()=>{cleanup();reject(new Error('Não foi possível abrir o vídeo salvo.'))};video.addEventListener('loadedmetadata',ok,{once:true});video.addEventListener('error',bad,{once:true});timer=setTimeout(()=>{cleanup();reject(new Error('Tempo esgotado ao restaurar o vídeo.'))},timeout);video.load()});
}
async function restoreDraftMedia(d){
  const preview=$('#preview');
  if(d.mediaType==='remote'&&d.selectedRemoteVideo?.id){
    selectedFile=null;selectedRemoteVideo={...d.selectedRemoteVideo};duration=Number(d.duration||0);showDraftWorkspace(selectedRemoteVideo.title||'Vídeo WeDrop');
    try{
      $('#aiStatus').textContent='Restaurando vídeo do rascunho…';
      const prepared=await api('/api/wedrop/prepare',{method:'POST',body:JSON.stringify({remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop.mp4'})});
      preview.src=prepared.streamUrl;preview.preload='metadata';preview.playsInline=true;await waitForVideoMetadata(preview);duration=preview.duration||duration||Number(prepared.duration||0);
      $('#aiStatus').textContent='Rascunho restaurado. Vídeo, textos e campos preservados.';
    }catch(e){$('#aiStatus').textContent='Rascunho restaurado. O vídeo remoto será carregado novamente quando necessário.';}
    return true;
  }
  if(d.mediaType==='manual'||d.manualVideo){
    const record=await getStoredManualVideo();const raw=record?.file;
    if(raw){
      const file=raw instanceof File?raw:new File([raw],record.name||d.manualVideo?.name||'video.mp4',{type:record.type||d.manualVideo?.type||raw.type||'video/mp4',lastModified:record.lastModified||d.manualVideo?.lastModified||Date.now()});
      selectedRemoteVideo=null;selectedFile=file;duration=Number(d.duration||0);showDraftWorkspace(file.name);setPreviewObjectUrl(file);
      try{await waitForVideoMetadata(preview);duration=preview.duration||duration}catch{}
      $('#aiStatus').textContent='Rascunho restaurado. Vídeo, textos e campos preservados.';
      return true;
    }
  }
  return false;
}
async function restoreDraft(){
  const d=readDraft(); if(!d)return;
  activeDraftSku=String(d.activeSku||d.selectedRemoteVideo?.catalogSku||d.wedropSku||'').trim();
  if($('#wedropSku'))$('#wedropSku').value=d.wedropSku||activeDraftSku||'';
  if($('#wedropQuery'))$('#wedropQuery').value=d.wedropQuery||'';
  if(d.selectedRemoteVideo?.id)selectedRemoteVideo={...d.selectedRemoteVideo};
  for(const id of ['product','shopeeUrl','title','description','cta','hashtags']) if(d[id]!==undefined && $('#'+id)) $('#'+id).value=d[id]||'';
  if(d.privacy && $('#privacy')) $('#privacy').value=d.privacy;
  if($('#disableComment')) $('#disableComment').checked=Boolean(d.disableComment);
  if($('#disableDuet')) $('#disableDuet').checked=Boolean(d.disableDuet);
  if($('#disableStitch')) $('#disableStitch').checked=Boolean(d.disableStitch);
  if($('#isAigc')) $('#isAigc').checked=Boolean(d.isAigc);
  if($('#dmEnabled')&&d.dmEnabled!==undefined) $('#dmEnabled').checked=Boolean(d.dmEnabled);
  if($('#dmKeyword')&&d.dmKeyword) $('#dmKeyword').value=d.dmKeyword;
  if($('#publicReplyEnabled')&&d.publicReplyEnabled!==undefined) $('#publicReplyEnabled').checked=Boolean(d.publicReplyEnabled);
  if($('#createMetaAd')&&d.createMetaAd!==undefined) $('#createMetaAd').checked=Boolean(d.createMetaAd);
  if($('#metaAdStatus')&&d.metaAdStatus) $('#metaAdStatus').value=d.metaAdStatus;
  captionManual=Boolean(d.captionManual);commentManual=Boolean(d.commentManual);instagramManual=Boolean(d.instagramManual);
  if(d.product||d.title||d.description||d.cta||d.hashtags){generated={...(d.generatedSnapshot||{}),product:d.product||'',shopeeUrl:d.shopeeUrl||'',title:d.title||'',description:d.description||'',cta:d.cta||'',hashtags:String(d.hashtags||'').split(/\s+/).filter(x=>x.startsWith('#')),instagramDescription:d.instagramDescription||d.generatedSnapshot?.instagramDescription||''};}
  if(captionManual && d.caption && $('#captionPreview')) $('#captionPreview').value=d.caption; else updateCaption(true);
  if(commentManual && d.purchaseComment && $('#purchaseComment')) $('#purchaseComment').value=d.purchaseComment; else updatePurchaseComment(true);
  if(instagramManual && d.instagramCaption && $('#instagramCaption')) $('#instagramCaption').value=d.instagramCaption; else updateInstagramCaption(true);
  const restoredMedia=await restoreDraftMedia(d);
  if(!restoredMedia&&(d.product||d.title||d.description||d.caption)){
    $('#workArea').classList.remove('hidden');$('#aiStatus').textContent='Textos restaurados. Selecione novamente o vídeo para publicar.';
  }
}
function clearDraft(){try{localStorage.removeItem(DRAFT_KEY)}catch{}deleteStoredManualVideo().catch(()=>{})}
function hasPublicationData(){
  return Boolean(selectedFile||selectedRemoteVideo||generated||['product','shopeeUrl','title','description','cta','hashtags','captionPreview','purchaseComment','instagramCaption'].some(id=>String($('#'+id)?.value||'').trim()));
}
function normalizeSku(value=''){return String(value||'').trim().toUpperCase()}
function activeToastSurface(){
  const dialogs=[...document.querySelectorAll('dialog[open]')];
  return dialogs.at(-1)||document.body;
}
function syncToastHost(){
  const host=$('#toast'); if(!host)return null;
  // A notificação sempre pertence à tela atualmente visível.
  // Quando há um <dialog> aberto, o host entra dentro dele para participar
  // da mesma top-layer do navegador; assim nenhum aviso fica atrás do modal.
  try{
    if(typeof host.hidePopover==='function'&&host.matches(':popover-open'))host.hidePopover();
  }catch{}
  host.removeAttribute('popover');
  const surface=activeToastSurface();
  if(host.parentElement!==surface)surface.appendChild(host);
  host.classList.toggle('toast-in-dialog',surface.tagName==='DIALOG');
  return host;
}
function toastHost(){return syncToastHost()}
function closeToastHostIfEmpty(host){
  if(!host||host.childElementCount)return;
  syncToastHost();
}
function watchToastSurface(){
  const dialogs=[...document.querySelectorAll('dialog')];
  const observer=new MutationObserver(()=>queueMicrotask(syncToastHost));
  dialogs.forEach(dialog=>{
    observer.observe(dialog,{attributes:true,attributeFilter:['open']});
    dialog.addEventListener('close',()=>queueMicrotask(syncToastHost));
    dialog.addEventListener('cancel',()=>queueMicrotask(syncToastHost));
  });
  window.addEventListener('resize',()=>{if($('#toast')?.childElementCount)syncToastHost()});
  syncToastHost();
}
watchToastSurface();
function toast(msg,err=false){
  const host=toastHost(); if(!host)return;
  const d=document.createElement('div');d.className='toast'+(err?' err':'');d.textContent=msg;d.setAttribute('role',err?'alert':'status');host.appendChild(d);
  const ttl=err?8000:5200;
  setTimeout(()=>{d.remove();closeToastHostIfEmpty(host)},ttl);
}
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{...(opt.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const error=new Error(d.error||'Erro inesperado.');error.data=d;error.status=r.status;throw error;}return d}
async function boot(){
  const a=await api('/api/auth-state');
  if(a.locked&&!a.loggedIn){$('#loginScreen').classList.remove('hidden');return}
  $('#app').classList.remove('hidden'); initTikTokAuthBridge(); await loadConfig(); await restoreDraft(); await loadHistory();
}
async function loadConfig(){
  config=await api('/api/config');
  const s=config.settings;
  $('#brandName').value=s.brandName||'REDEACHADOS BR';$('#shopeeStoreUrl').value=s.shopeeStoreUrl||'';$('#geminiModel').value=s.geminiModel||'gemini-3.5-flash-lite';$('#redirectUri').value=config.redirectUri;
  $('#geminiApiKey').placeholder=s.geminiConfigured?'Configurado ✓ — deixe em branco para manter':'Cole a chave aqui';
  $('#tiktokClientKey').placeholder=s.tiktokConfigured?'Configurado ✓ — deixe em branco para manter':'Client Key do TikTok';
  $('#tiktokClientSecret').placeholder=s.tiktokConfigured?'Configurado ✓ — deixe em branco para manter':'Client Secret do TikTok';
  await loadCatalogStatus();
  const authError=new URLSearchParams(location.search).get('error')||'';
  const urlTikTokInvalid=/tiktok/i.test(authError)&&/(inválid|expirad)/i.test(authError);
  if(urlTikTokInvalid)tiktokAuthInvalid=true;
  $('#connectionText').textContent=tiktokAuthInvalid?'Autorização expirada. Reconecte o TikTok para voltar a enviar rascunhos.':(config.tiktokConnected?'Conta conectada e pronta para enviar rascunhos.':'Conta ainda não conectada.');
  $('#connectBtn').textContent=(config.tiktokConnected||tiktokAuthInvalid)?'Reconectar TikTok':'Conectar TikTok';
  syncTikTokPublishState();
  if($('#instagramUserId')) $('#instagramUserId').value=s.instagramUserId||'17841480462088551';
  if($('#metaGraphVersion')) $('#metaGraphVersion').value=s.metaGraphVersion||'v26.0';
  if($('#instagramAccessToken')) $('#instagramAccessToken').placeholder=s.instagramConfigured?'Configurado ✓ — deixe em branco para manter':'Cole um novo token de acesso da Meta';
  if($('#instagramWebhookUrl')) $('#instagramWebhookUrl').value=config.instagramWebhookUrl||'';
  if($('#instagramDmEnabled')) $('#instagramDmEnabled').checked=s.instagramDmEnabled!==false;
  if($('#instagramDmKeyword')) $('#instagramDmKeyword').value=s.instagramDmKeyword||'QUERO';
  if($('#instagramDmTemplate')) $('#instagramDmTemplate').value=s.instagramDmTemplate||'Oi! 👋 Aqui está o link do produto que você pediu: {link}';
  if($('#instagramPublicReplyEnabled')) $('#instagramPublicReplyEnabled').checked=s.instagramPublicReplyEnabled!==false;
  if($('#instagramPublicReplyTemplate')) $('#instagramPublicReplyTemplate').value=s.instagramPublicReplyTemplate||'Enviei o link no seu Direct ✅';
  if($('#metaPageId')) $('#metaPageId').value=s.metaPageId||'';
  if($('#metaAdAccountId')) $('#metaAdAccountId').value=s.metaAdAccountId||'';
  if($('#metaAdSetId')) $('#metaAdSetId').value=s.metaAdSetId||'';
  if($('#metaAdsAccessToken')) $('#metaAdsAccessToken').placeholder=s.metaAdsTokenConfigured?'Configurado ✓ — deixe em branco para manter':'Token com ads_management';
  if($('#metaWebhookVerifyToken')) $('#metaWebhookVerifyToken').placeholder=s.metaWebhookConfigured?'Configurado ✓ — deixe em branco para manter':'Crie um token secreto';
  if($('#metaCreateAdDefault')) $('#metaCreateAdDefault').checked=Boolean(s.metaCreateAdDefault);
  if($('#metaAdDefaultStatus')) $('#metaAdDefaultStatus').value=s.metaAdDefaultStatus||'PAUSED';
  if($('#dmEnabled')&&!localStorage.getItem(DRAFT_KEY)) $('#dmEnabled').checked=s.instagramDmEnabled!==false;
  if($('#dmKeyword')&&!localStorage.getItem(DRAFT_KEY)) $('#dmKeyword').value=s.instagramDmKeyword||'QUERO';
  if($('#publicReplyEnabled')&&!localStorage.getItem(DRAFT_KEY)) $('#publicReplyEnabled').checked=s.instagramPublicReplyEnabled!==false;
  if($('#createMetaAd')&&!localStorage.getItem(DRAFT_KEY)) $('#createMetaAd').checked=Boolean(s.metaCreateAdDefault);
  if($('#metaAdStatus')&&!localStorage.getItem(DRAFT_KEY)) $('#metaAdStatus').value=s.metaAdDefaultStatus||'PAUSED';
  loadInstagramStatus();
  loadInstagramTokenStatus();
  loadInstagramCommerceStatus();
  $('#connectBtn').title='A conexão abre em outra aba para não perder vídeo, legenda ou campos já preenchidos.';
  if(!s.tiktokConfigured||!s.geminiConfigured) setTimeout(()=>$('#settingsDialog').showModal(),300);
}
$('#loginBtn').onclick=async()=>{try{await api('/api/login',{method:'POST',body:JSON.stringify({password:$('#loginPassword').value})});location.reload()}catch(e){toast(e.message,true)}};
$('#settingsBtn').onclick=()=>$('#settingsDialog').showModal();
$('#saveSettingsBtn').onclick=async e=>{e.preventDefault();try{await api('/api/settings',{method:'POST',body:JSON.stringify({brandName:$('#brandName').value,shopeeStoreUrl:$('#shopeeStoreUrl').value,geminiApiKey:$('#geminiApiKey').value,geminiModel:$('#geminiModel').value,tiktokClientKey:$('#tiktokClientKey').value,tiktokClientSecret:$('#tiktokClientSecret').value,instagramAccessToken:$('#instagramAccessToken')?.value||'',instagramUserId:$('#instagramUserId')?.value||'',metaGraphVersion:$('#metaGraphVersion')?.value||'v26.0',instagramDmEnabled:Boolean($('#instagramDmEnabled')?.checked),instagramDmKeyword:$('#instagramDmKeyword')?.value||'QUERO',instagramDmTemplate:$('#instagramDmTemplate')?.value||'',instagramPublicReplyEnabled:Boolean($('#instagramPublicReplyEnabled')?.checked),instagramPublicReplyTemplate:$('#instagramPublicReplyTemplate')?.value||'',metaPageId:$('#metaPageId')?.value||'',metaAdAccountId:$('#metaAdAccountId')?.value||'',metaAdSetId:$('#metaAdSetId')?.value||'',metaAdsAccessToken:$('#metaAdsAccessToken')?.value||'',metaWebhookVerifyToken:$('#metaWebhookVerifyToken')?.value||'',metaCreateAdDefault:Boolean($('#metaCreateAdDefault')?.checked),metaAdDefaultStatus:$('#metaAdDefaultStatus')?.value||'PAUSED'})});$('#settingsDialog').close();toast('Configuração salva.');await loadConfig();if(selectedFile)await analyze()}catch(err){toast(err.message,true)}};

async function loadCatalogStatus(){
  try{const c=await api('/api/catalog');$('#catalogStatus').textContent=c.count?`Catálogo carregado: ${c.count} produtos · ${c.variationSkuCount||0} SKUs adicionais/variações. ${c.duplicateSkuCount?`${c.duplicateSkuCount} SKUs aparecem em mais de um anúncio; a busca pedirá sua escolha. `:''}Última importação: ${c.importedAt?new Date(c.importedAt).toLocaleString('pt-BR'):'não informada'}.`:'Nenhum catálogo carregado ainda.';}catch{$('#catalogStatus').textContent='Não foi possível consultar o catálogo.'}
}
function catalogImportMessage(message='',kind='info'){
  const el=$('#catalogImportNotice');if(!el)return;el.hidden=!message;el.textContent=message;el.className='status small catalog-import-notice '+kind;
}
$('#importCatalogBtn').onclick=async()=>{
  const file=$('#catalogFile').files?.[0]; if(!file){catalogImportMessage('⚠️ Selecione a planilha de Informações básicas exportada da Shopee.','error');return toast('Selecione a planilha de Informações básicas da Shopee.',true);}
  const btn=$('#importCatalogBtn');btn.disabled=true;btn.textContent='IMPORTANDO...';catalogImportMessage(`Lendo ${file.name}...`,'loading');
  try{
    const fd=new FormData();fd.append('catalog',file);const r=await api('/api/catalog/import',{method:'POST',body:fd});
    catalogImportMessage(`✅ Catálogo atualizado com ${r.count} produtos. Arquivo: ${r.sourceFile||file.name}.`,'success');
    toast(`Catálogo atualizado: ${r.count} produtos.`);$('#catalogFile').value='';await loadCatalogStatus();
  }
  catch(e){
    const detail=String(e.message||e);
    catalogImportMessage(`⚠️ ${detail} O catálogo que já estava salvo foi mantido e não foi alterado.`,'error');
    toast(detail,true);
  }finally{btn.disabled=false;btn.textContent='Atualizar catálogo'}
};

$('#saveSkuAliasBtn')?.addEventListener('click',async()=>{
  const button=$('#saveSkuAliasBtn');
  const productId=$('#skuAliasProductId').value.trim(), sku=$('#skuAliasValue').value.trim();
  if(!productId||!sku)return toast('Informe o ID do produto Shopee e a SKU da variação.',true);
  button.disabled=true;button.textContent='Salvando vínculo...';
  try{
    await api('/api/catalog/sku-alias',{method:'POST',body:JSON.stringify({productId,sku})});
    $('#skuAliasValue').value='';toast('SKU de variação vinculada ao produto.');await loadCatalogStatus();
  }catch(e){toast(e.message,true)}finally{button.disabled=false;button.textContent='Vincular SKU ao produto';}
});

$('#chooseBtn').onclick=()=>$('#videoInput').click();$('#changeBtn').onclick=()=>$('#videoInput').click();$('#manualUploadBtn')?.addEventListener('click',()=>$('#videoInput').click());
const dz=$('#dropzone');['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>{const f=e.dataTransfer.files?.[0];if(f)selectVideo(f)});$('#videoInput').onchange=e=>{const f=e.target.files?.[0];if(f)selectVideo(f)};
async function selectVideo(file){
  if(!file.type.startsWith('video/'))return toast('Selecione um arquivo de vídeo.',true);
  selectedRemoteVideo=null;preparedStoryFile=null;preparedStoryVideoId='';selectedFile=file;generated=null;frames=[];duration=0;showDraftWorkspace(file.name);setPreviewObjectUrl(file);$('#aiStatus').textContent='Salvando vídeo no rascunho local...';
  try{await persistManualVideo(file)}catch(e){toast('O vídeo foi selecionado, mas o navegador não conseguiu guardar uma cópia persistente. Evite atualizar a página até concluir esta publicação.',true)}
  saveDraft();
  try{
    $('#aiStatus').textContent='Lendo o vídeo...';
    await waitForVideoMetadata($('#preview'),20000);duration=$('#preview').duration||0;saveDraft();
    frames=await extractFrames($('#preview'),[.15,.5,.85]);await loadCreator();await analyze();saveDraft();
  }catch(e){toast('Não consegui analisar o vídeo: '+e.message,true);$('#aiStatus').textContent='Falha na análise. O rascunho foi preservado.';saveDraft()}
}
async function extractFrames(video,points){
  const out=[];for(const p of points){const t=Math.max(0,Math.min(video.duration-.05,video.duration*p));await new Promise((resolve,reject)=>{const done=()=>{video.removeEventListener('seeked',done);resolve()};video.addEventListener('seeked',done,{once:true});video.currentTime=t;setTimeout(()=>reject(new Error('Tempo esgotado ao capturar frames.')),6000)});const c=document.createElement('canvas');const max=720,scale=Math.min(1,max/video.videoWidth);c.width=Math.max(1,Math.round(video.videoWidth*scale));c.height=Math.max(1,Math.round(video.videoHeight*scale));c.getContext('2d').drawImage(video,0,0,c.width,c.height);out.push(c.toDataURL('image/jpeg',.72))}video.currentTime=0;return out;
}
async function analyze(){
  if(!selectedFile&&!selectedRemoteVideo)return;$('#aiStatus').textContent='Analisando produto e criando a publicação...';$('#regenerateBtn').disabled=true;
  try{generated=await api('/api/ai/generate',{method:'POST',body:JSON.stringify({filename:(selectedFile?.name||selectedRemoteVideo?.title||'video-wedrop.mp4'),images:frames})});fillGenerated();$('#aiStatus').textContent=generated.confidence==='ai'?'Pronto: conteúdo criado automaticamente pela IA.':'Pronto: modo básico usado. Configure a chave da IA para análise visual.'}
  catch(e){toast(e.message,true);$('#aiStatus').textContent='Não foi possível gerar o conteúdo.'}finally{$('#regenerateBtn').disabled=false}
}
function fillGenerated(){
  $('#product').value=generated.product||'';$('#shopeeUrl').value=generated.shopeeUrl||'';$('#title').value=generated.title||'';$('#description').value=generated.description||'';$('#cta').value=generated.cta||'';$('#hashtags').value=(generated.hashtags||[]).join(' ');
  if(generated.catalogMatch) toast(`Produto vinculado ao catálogo: ${generated.catalogMatch.name}`);
  captionManual=false;commentManual=false;instagramManual=false;updateCaption(true);updatePurchaseComment(true);updateInstagramCaption(true);saveDraft();
}

function currentMeta(){return{product:$('#product').value.trim(),shopeeUrl:selectedRemoteVideo?.catalogProductUrl||$('#shopeeUrl').value.trim(),title:$('#title').value.trim(),description:$('#description').value.trim(),cta:$('#cta').value.trim(),hashtags:$('#hashtags').value.trim().split(/\s+/).filter(x=>x.startsWith('#'))}}
function productEmoji(m={}){const t=`${m.product||''} ${m.title||''} ${m.description||''}`.toLowerCase();if(/avental|mini chef|chef|cozinha infantil/.test(t))return'👩‍🍳';if(/cozinha|panela|cafeteira|chaleira|frigideira|utens[ií]lio|assadeira|pote|galheteiro/.test(t))return'🍳';if(/brinqued|infantil|crian[cç]a|bonec|carrinho|pista|jogo/.test(t))return'🎁';if(/organiz|gaveta|prateleira|porta joia|armazen/.test(t))return'✨';if(/limp|mop|escova|pano|vassoura/.test(t))return'🧼';if(/luz|led|lumin[aá]ria|sensor/.test(t))return'💡';if(/beleza|maquiagem|pincel|joia|brinco/.test(t))return'💖';if(/fitness|balan[cç]a|treino|academia/.test(t))return'💪';return'✨'}
function cleanEmoji(t=''){return String(t||'').replace(/^\s*[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u,'').trim()}
function buildAutoCaption(){if(!config)return'';const m=currentMeta(),e=productEmoji(m),parts=[];if(m.title)parts.push(`${e} ${cleanEmoji(m.title)}`);if(m.description)parts.push(`📝 ${cleanEmoji(m.description)}`);if(m.cta)parts.push(`🛍️ ${cleanEmoji(m.cta)}`);const directLink=String(m.shopeeUrl||config?.settings?.shopeeStoreUrl||'').trim();if(directLink)parts.push(`🔗 ${directLink}`);if(m.hashtags.length)parts.push(m.hashtags.join(' '));return parts.filter(Boolean).join('\n\n').slice(0,2200)}
function updateCaption(force=false){if(!config)return;if(captionManual&&!force)return;$('#captionPreview').value=buildAutoCaption()}
function buildAutoPurchaseComment(){if(!config)return'';const m=currentMeta();const directLink=String(m.shopeeUrl||config?.settings?.shopeeStoreUrl||'').trim();const product=cleanEmoji(m.product||m.title||'').trim();if(!directLink)return product?`🛒 ${product}
Confira na REDE ACHADOS BR`:'🛒 Confira na REDE ACHADOS BR';return product?`🛒 ${product}
🔗 Comprar aqui: ${directLink}`:`🛒 Comprar aqui: ${directLink}`}
function updatePurchaseComment(force=false){if(!config)return;if(commentManual&&!force)return;const el=$('#purchaseComment');if(el)el.value=buildAutoPurchaseComment()}
function restoreGeneratedComment(){commentManual=false;updatePurchaseComment(true);saveDraft();toast('Comentário de compra restaurado.')}

function buildAutoInstagramCaption(){
  if(!config)return'';
  const m=currentMeta();
  const body=String(generated?.instagramDescription||'').trim();
  const directLink=String(m.shopeeUrl||config?.settings?.shopeeStoreUrl||'').trim();
  const parts=[];
  if(body) parts.push(body);
  else {
    if(m.title) parts.push(`${productEmoji(m)} ${cleanEmoji(m.title)}`);
    if(m.description) parts.push(cleanEmoji(m.description));
  }
  const cta=cleanEmoji(m.cta||'Garanta o seu na REDE ACHADOS BR');
  if(cta) parts.push(`👉 ${cta}`);
  const dmOn=Boolean($('#dmEnabled')?.checked), keyword=String($('#dmKeyword')?.value||config?.settings?.instagramDmKeyword||'QUERO').trim()||'QUERO';
  if(directLink&&dmOn) parts.push(`💬 Comente ${keyword.toUpperCase()} e receba o link de compra no Direct.`);
  else if(directLink) parts.push(`🔗 Link do Produto: ${directLink}`);
  if(m.hashtags.length) parts.push(m.hashtags.join(' '));
  return parts.filter(Boolean).join('\n\n').slice(0,2200);
}
function updateInstagramCaption(force=false){if(!config)return;if(instagramManual&&!force)return;const el=$('#instagramCaption');if(el)el.value=buildAutoInstagramCaption()}
function restoreInstagramCaption(){instagramManual=false;updateInstagramCaption(true);saveDraft();toast('Legenda completa do Instagram restaurada.')}

function restoreGeneratedCaption(){captionManual=false;commentManual=false;instagramManual=false;updateCaption(true);updatePurchaseComment(true);updateInstagramCaption(true);saveDraft();toast('Legenda restaurada a partir dos campos gerados.')}
$('#purchaseComment')?.addEventListener('input',()=>{commentManual=true;saveDraft()});
$('#instagramCaption')?.addEventListener('input',()=>{instagramManual=true;saveDraft()});
$('#restoreCommentBtn').onclick=restoreGeneratedComment;
$('#copyCommentBtn').onclick=async()=>{try{const text=$('#purchaseComment').value.trim();if(!text)throw new Error('empty');await navigator.clipboard.writeText(text);toast('Comentário de compra copiado. Cole no primeiro comentário do TikTok.')}catch{toast('Não foi possível copiar automaticamente. Selecione o comentário e copie manualmente.',true)}};
$('#restoreInstagramBtn')?.addEventListener('click',restoreInstagramCaption);
$('#copyInstagramBtn')?.addEventListener('click',async()=>{try{const text=$('#instagramCaption').value.trim();if(!text)throw new Error('empty');await navigator.clipboard.writeText(text);toast('Legenda do Instagram copiada.')}catch{toast('Não foi possível copiar automaticamente. Selecione a legenda e copie manualmente.',true)}});
$('#captionPreview').addEventListener('input',()=>{captionManual=true;saveDraft()});


function formatTokenExpiry(ts){
  if(!ts)return 'sem data de expiração informada';
  try{return new Date(Number(ts)*1000).toLocaleString('pt-BR');}catch{return 'data desconhecida'}
}
async function loadInstagramTokenStatus(){
  const el=$('#instagramTokenStatus'); if(!el)return;
  try{
    const d=await api('/api/instagram/token-status');
    if(!d.configured){el.textContent='Token do Instagram ainda não configurado.';return;}
    if(!d.automationConfigured){el.textContent='Token configurado. Para manutenção automática, adicione META_APP_ID e META_APP_SECRET no Render.';return;}
    if(d.valid===false){el.textContent='⚠️ Token inválido/expirado. Gere um novo token uma vez e salve; depois o Publisher fará a manutenção automática.';return;}
    el.textContent=`✅ Manutenção automática ativa · validade: ${formatTokenExpiry(d.expiresAt)}${d.managed?' · token gerenciado pelo Publisher':''}`;
  }catch(e){el.textContent='Não foi possível verificar o token: '+e.message;}
}
$('#maintainInstagramTokenBtn')?.addEventListener('click',async()=>{
  const b=$('#maintainInstagramTokenBtn');b.disabled=true;b.textContent='VERIFICANDO...';
  try{const d=await api('/api/instagram/token-maintain',{method:'POST',body:JSON.stringify({})});toast(d.message||'Token verificado.');await loadInstagramTokenStatus();await loadInstagramStatus();}
  catch(e){toast(e.message,true)}finally{b.disabled=false;b.textContent='🔄 Verificar / prolongar token agora';}
});


async function loadInstagramCommerceStatus(){
  const badge=$('#commerceReadyBadge'),inline=$('#metaAdsInlineStatus'),status=$('#instagramCommerceStatus'),ads=$('#metaAdsStatus');
  try{
    const d=await api('/api/instagram/commerce-status');
    if(status){
      if(!d.dmConfigured) status.textContent='⚠️ Falta configurar o acesso Meta/Direct automático.';
      else if(!d.supabaseConfigured) status.textContent=`⚠️ Meta pronta, mas falta SUPABASE_URL + SUPABASE_SECRET_KEY no Render para gravar os Reels em reel_links.`;
      else status.textContent=`✅ Direct automático + Supabase prontos · ${d.rules} Reel(s) locais · ${d.sent} link(s) enviados pelo fallback local.`;
    }
    if(inline)inline.textContent=d.adsConfigured?'✅ Meta Ads configurado. O anúncio usará o conjunto definido nas Configurações.':'Configure Page ID, Ad Account ID, Ad Set ID e token com ads_management.';
    if(ads)ads.textContent=d.adsConfigured?'Configuração preenchida. Use “Testar conexão” para validar conta e conjunto.':'Preencha os IDs da conta/conjunto e o acesso à Marketing API.';
    if(badge){badge.classList.remove('ready','partial');if(d.dmConfigured&&d.adsConfigured){badge.textContent='PRONTO';badge.classList.add('ready')}else if(d.dmConfigured||d.adsConfigured){badge.textContent='PARCIAL';badge.classList.add('partial')}else badge.textContent='CONFIGURAR';}
  }catch(e){if(status)status.textContent='Não foi possível verificar: '+e.message;if(badge)badge.textContent='VERIFICAR';}
}
$('#testMetaAdsBtn')?.addEventListener('click',async()=>{
  const b=$('#testMetaAdsBtn');b.disabled=true;b.textContent='TESTANDO...';
  try{const d=await api('/api/meta/ads/status');if(d.connected){$('#metaAdsStatus').textContent=`✅ ${d.account?.name||'Conta conectada'} · conjunto: ${d.adset?.name||d.adset?.id||'OK'} · ${d.adset?.effective_status||d.adset?.status||''}`;toast('Conexão com Meta Ads confirmada.')}else{throw new Error(d.error||'Não foi possível validar a conta.')}}catch(e){$('#metaAdsStatus').textContent='⚠️ '+e.message;toast(e.message,true)}finally{b.disabled=false;b.textContent='Testar conexão com Meta Ads';}
});
function instagramCommercePayload(){
  return {sku:selectedRemoteVideo?.catalogSku||$('#wedropSku')?.value.trim()||'',product:$('#product')?.value.trim()||'',shopeeUrl:selectedRemoteVideo?.catalogProductUrl||$('#shopeeUrl')?.value.trim()||'',dmEnabled:Boolean($('#dmEnabled')?.checked),dmKeyword:$('#dmKeyword')?.value.trim()||'QUERO',publicReplyEnabled:Boolean($('#publicReplyEnabled')?.checked),createAd:Boolean($('#createMetaAd')?.checked),adStatus:$('#metaAdStatus')?.value||'PAUSED'};
}
function describeInstagramResult(r){
  const bits=['Reel publicado no Instagram ✅'];
  if(r?.commerce?.dmEnabled)bits.push(`Direct “${r.commerce.keyword||'QUERO'}” ativado`);
  if(r?.commerce?.supabaseSync?.synced)bits.push('automação registrada no Supabase ✅');
  else if(r?.commerce?.supabaseSync?.configured===false)bits.push('⚠️ Supabase não configurado');
  else if(r?.commerce?.supabaseSync?.error)bits.push(`⚠️ Supabase: ${r.commerce.supabaseSync.error}`);
  if(r?.commerce?.ad?.adId)bits.push(`anúncio ${r.commerce.ad.status==='ACTIVE'?'ativo':'criado pausado para revisão'}`);
  if(r?.commerce?.warning&&!String(r.commerce.warning).includes(r?.commerce?.supabaseSync?.error||'___'))bits.push(r.commerce.warning);
  return bits.join(' · ');
}

async function loadInstagramStatus(){
  const el=$('#instagramConnectionText'); if(!el)return;
  try{const d=await api('/api/instagram/status');if(!d.configured){el.textContent='Configure o token da Meta em Configurações.';return;}if(d.connected){el.textContent=`Conectado: @${d.username||'redeachadosbr'}`;}else el.textContent='Token configurado, mas a Meta recusou a conexão: '+(d.error||'verifique o token.');}catch(e){el.textContent=e.message;}
}
async function publishInstagram(){
  if(!selectedFile&&!selectedRemoteVideo)return toast('Escolha um vídeo.',true);if(!generated)return toast('Aguarde a geração da publicação.',true);if(!config?.settings?.instagramConfigured){location.hash='#channels';return toast('Abra Canais de conexão e configure o Instagram / Meta.',true);}
  const caption=$('#instagramCaption')?.value.trim()||''; if(!caption)return toast('A legenda do Instagram está vazia.',true);
  const commerce=instagramCommercePayload();if((commerce.dmEnabled||commerce.createAd)&&!commerce.shopeeUrl)return toast('Informe o Link do produto Shopee para ativar Direct ou anúncio com compra.',true);
  const b=$('#instagramPublishBtn');b.disabled=true;setSocialButton('instagram','loading');
  try{
    let r;
    if(selectedRemoteVideo){r=await api('/api/instagram/publish-remote',{method:'POST',body:JSON.stringify({remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop',caption,...commerce})});}
    else{const fd=new FormData();fd.append('video',selectedFile);fd.append('caption',caption);for(const [k,v] of Object.entries(commerce))fd.append(k,String(v));r=await api('/api/instagram/publish',{method:'POST',body:fd});}
    if(r.pending){
      toast('Instagram ainda está processando. O Direct/anúncio serão associados assim que o Reel finalizar.');
      await new Promise(x=>setTimeout(x,8000));
      const f=await api('/api/instagram/finalize',{method:'POST',body:JSON.stringify({creationId:r.creationId})});
      if(f.pending)toast('O Reel continua processando. Tente publicar novamente em alguns segundos.',true);
      else{
        if(f.mediaId)try{localStorage.setItem('ra_last_instagram_media_id',String(f.mediaId));}catch{}
        toast(describeInstagramResult(f));
        if(f.commerce?.adError)toast('Reel publicado, mas Meta Ads: '+f.commerce.adError,true);
      }
    } else {
      if(r.mediaId)try{localStorage.setItem('ra_last_instagram_media_id',String(r.mediaId));}catch{}
      toast(describeInstagramResult(r));
      if(r.commerce?.adError)toast('Reel publicado, mas Meta Ads: '+r.commerce.adError,true);
    }
    await loadHistory();await loadInstagramCommerceStatus();
  }catch(e){toast('Instagram: '+e.message,true);}finally{b.disabled=false;setSocialButton('instagram','idle');}
}
$('#instagramPublishBtn')?.addEventListener('click',publishInstagram);

function storyProductLink(){return String(selectedRemoteVideo?.catalogProductUrl||$('#shopeeUrl')?.value||config?.settings?.shopeeStoreUrl||'').trim()}
async function copyStoryProductLink(){
  const link=storyProductLink();
  if(!link)return toast('Informe o link do produto Shopee antes de copiar.',true);
  const status=$('#storyStatus'),b=$('#prepareStoryBtn');
  if(b)b.disabled=true;
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(link);
    }else{
      const area=document.createElement('textarea');area.value=link;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
    }
    if(status)status.innerHTML='✅ <b>Link do produto copiado.</b> Cole no adesivo Link quando criar um Story manual no Instagram.';
    toast('Link da Shopee copiado.');
  }catch(e){
    if(status)status.textContent='⚠️ Não consegui copiar o link automaticamente.';
    toast('Não consegui copiar o link. Selecione o campo “Link do produto Shopee” e copie manualmente.',true);
  }finally{if(b)b.disabled=false;}
}
$('#prepareStoryBtn')?.addEventListener('click',copyStoryProductLink);

async function publishInstagramStory(){
  if(!selectedFile&&!selectedRemoteVideo)return toast('Escolha um vídeo.',true);if(!config?.settings?.instagramConfigured){location.hash='#channels';return toast('Abra Canais de conexão e configure o Instagram / Meta.',true);}
  const b=$('#instagramStoryPublishBtn'),status=$('#storyStatus');b.disabled=true;setSocialButton('story','loading');
  try{
    const meta=currentMeta();let r;
    if(selectedRemoteVideo){r=await api('/api/instagram/story/publish-remote',{method:'POST',body:JSON.stringify({remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop',product:meta.product,shopeeUrl:meta.shopeeUrl})});}
    else{const fd=new FormData();fd.append('video',selectedFile);fd.append('product',meta.product||'');fd.append('shopeeUrl',meta.shopeeUrl||'');r=await api('/api/instagram/story/publish',{method:'POST',body:fd});}
    if(r.pending){if(status)status.textContent='O Story ainda está processando na Meta…';await new Promise(x=>setTimeout(x,8000));r=await api('/api/instagram/story/finalize',{method:'POST',body:JSON.stringify({creationId:r.creationId})});}
    if(r.pending){if(status)status.textContent='⚠️ Story ainda processando. Tente novamente em alguns segundos.';toast('O Story continua processando na Meta.',true)}else{if(status)status.innerHTML='✅ Story publicado automaticamente. <b>Esse modo não adiciona adesivo de link.</b>';toast(r.message||'Story publicado no Instagram.');await loadHistory();}
  }catch(e){const msg=String(e.message||e);if(status)status.textContent='⚠️ '+msg;if(/business|creator|permission|permiss|unsupported|not supported/i.test(msg))toast('A Meta recusou o Story automático. Confirme se a conta é Instagram Business e se o token tem permissão de publicação.',true);else toast(msg,true)}finally{b.disabled=false;setSocialButton('story','idle');}
}
$('#instagramStoryPublishBtn')?.addEventListener('click',publishInstagramStory);

$('#syncLatestReelBtn')?.addEventListener('click',async()=>{
  const b=$('#syncLatestReelBtn');
  const commerce=instagramCommercePayload();
  if(!commerce.shopeeUrl)return toast('Informe o link do produto Shopee antes de sincronizar.',true);
  b.disabled=true;const original=b.textContent;b.textContent='Sincronizando...';
  try{
    let browserMediaId='';
    try{browserMediaId=localStorage.getItem('ra_last_instagram_media_id')||'';}catch{}
    const r=await api('/api/instagram/sync-latest-reel',{method:'POST',body:JSON.stringify({...commerce,mediaId:browserMediaId})});
    if(r?.supabaseSync?.synced)toast(`Último Reel sincronizado com o Supabase ✅ · Media ID ${r.mediaId}`);
    else toast('O Reel foi encontrado, mas o Supabase não confirmou a sincronização.',true);
    await loadInstagramCommerceStatus();
  }catch(e){toast('Sincronização: '+e.message,true)}finally{b.disabled=false;b.textContent=original;}
});

$('#restoreCaptionBtn').onclick=restoreGeneratedCaption;
$('#copyCaptionBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('#captionPreview').value.trim());toast('Legenda copiada. Cole no TikTok ao finalizar o rascunho.')}catch{toast('Não foi possível copiar automaticamente. Selecione a legenda e use Ctrl+C.',true)}};
['product','shopeeUrl','title','description','cta','hashtags'].forEach(id=>$('#'+id).addEventListener('input',()=>{updateCaption(false);updatePurchaseComment(false);updateInstagramCaption(false);saveDraft()}));
['dmKeyword'].forEach(id=>$('#'+id)?.addEventListener('input',()=>{instagramManual=false;updateInstagramCaption(true);saveDraft()}));
['dmEnabled','publicReplyEnabled','createMetaAd','metaAdStatus'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{if(id==='dmEnabled'){instagramManual=false;updateInstagramCaption(true)}saveDraft()}));
['privacy','disableComment','disableDuet','disableStitch','isAigc'].forEach(id=>$('#'+id)?.addEventListener('change',saveDraft));
$('#connectBtn').addEventListener('click',()=>{saveDraft();if(selectedFile)persistManualVideo(selectedFile).catch(()=>{});});
$('#regenerateBtn').onclick=analyze;
async function loadCreator(){
  if(!config?.tiktokConnected){syncTikTokPublishState();return;}
  try{const c=await api('/api/creator');tiktokAuthInvalid=false;syncTikTokPublishState();const p=$('#privacy'),previousPrivacy=p.value,options=c.privacy_level_options||['SELF_ONLY'];p.innerHTML='';for(const x of options){const o=document.createElement('option');o.value=x;o.textContent={PUBLIC_TO_EVERYONE:'Público',MUTUAL_FOLLOW_FRIENDS:'Amigos',FOLLOWER_OF_CREATOR:'Seguidores',SELF_ONLY:'Somente eu'}[x]||x;p.appendChild(o)} if(options.includes(previousPrivacy))p.value=previousPrivacy;else if(options.includes(config.settings.defaultPrivacy))p.value=config.settings.defaultPrivacy;saveDraft();}catch(e){if(/token|oauth|authoriz|expir|invalid/i.test(e.message||'')){tiktokAuthInvalid=true;syncTikTokPublishState();$('#connectionText').textContent='Autorização expirada. Reconecte o TikTok para voltar a enviar rascunhos.';}else toast(e.message,true)}
}
$('#publishBtn').onclick=async()=>{
  if(!selectedFile&&!selectedRemoteVideo)return toast('Escolha um vídeo.',true);if(!generated)return toast('Aguarde a geração da publicação.',true);
  if(!config.tiktokConnected||tiktokAuthInvalid){syncTikTokPublishState();location.hash='#channels';toast('Reconecte sua conta TikTok antes de enviar o rascunho.',true);setTimeout(()=>$('#connectBtn')?.focus(),120);return;}
  const b=$('#publishBtn');b.disabled=true;setSocialButton('tiktok','loading');
  try{
    let r;
    if(selectedRemoteVideo?.id){
      r=await api('/api/upload-draft-remote',{method:'POST',body:JSON.stringify({remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop',meta:currentMeta(),caption:$('#captionPreview').value.trim(),duration:Number(duration||0)})});
    }else{
      const fd=new FormData();fd.append('video',selectedFile);fd.append('meta',JSON.stringify(currentMeta()));fd.append('caption',$('#captionPreview').value.trim());fd.append('duration',String(duration||0));
      r=await api('/api/upload-draft',{method:'POST',body:fd});
    }
    setSocialButton('tiktok','success');
    toast('Rascunho enviado. Abra o TikTok e toque na notificação da caixa de entrada para concluir.');
    try{await navigator.clipboard.writeText($('#captionPreview').value.trim())}catch{}
    await loadHistory();saveDraft();setTimeout(()=>syncTikTokPublishState(),1400);
  }catch(e){if(/token|oauth|authoriz|expir|invalid/i.test(e.message||'')){tiktokAuthInvalid=true;syncTikTokPublishState();$('#connectionText').textContent='Autorização expirada. Reconecte o TikTok para voltar a enviar rascunhos.';}toast(e.message,true)}finally{b.disabled=false;if(!tiktokAuthInvalid)setTimeout(()=>setSocialButton('tiktok','idle'),1600)}
};
async function resetPublication({preserveSku='',preserveQuery='',silent=false}={}){
  selectedFile=null;selectedRemoteVideo=null;preparedStoryFile=null;preparedStoryVideoId='';frames=[];generated=null;duration=0;captionManual=false;commentManual=false;instagramManual=false;activeDraftSku=String(preserveSku||'').trim();
  if(previewObjectUrl){try{URL.revokeObjectURL(previewObjectUrl)}catch{}previewObjectUrl=''}
  clearDraft();await deleteStoredManualVideo();
  const preview=$('#preview');try{preview.pause()}catch{}preview.removeAttribute('src');try{preview.load()}catch{}
  $('#workArea').classList.add('hidden');$('#dropzone').classList.remove('hidden');$('#videoInput').value='';$('#fileName').textContent='';
  for(const id of ['product','shopeeUrl','title','description','cta','hashtags','captionPreview','purchaseComment','instagramCaption'])if($('#'+id))$('#'+id).value='';
  if($('#wedropSku'))$('#wedropSku').value=preserveSku||'';if($('#wedropQuery'))$('#wedropQuery').value=preserveQuery||'';
  if($('#wedropStatus'))$('#wedropStatus').textContent='';if($('#wedropResults')){$('#wedropResults').innerHTML='';$('#wedropResults').classList.add('hidden')}if($('#wedropAttempts')){$('#wedropAttempts').innerHTML='';$('#wedropAttempts').classList.add('hidden')}
  if($('#privacy'))$('#privacy').value=config?.settings?.defaultPrivacy||'SELF_ONLY';for(const id of ['disableComment','disableDuet','disableStitch','isAigc'])if($('#'+id))$('#'+id).checked=false;
  if($('#dmEnabled'))$('#dmEnabled').checked=config?.settings?.instagramDmEnabled!==false;if($('#dmKeyword'))$('#dmKeyword').value=config?.settings?.instagramDmKeyword||'QUERO';if($('#publicReplyEnabled'))$('#publicReplyEnabled').checked=config?.settings?.instagramPublicReplyEnabled!==false;if($('#createMetaAd'))$('#createMetaAd').checked=Boolean(config?.settings?.metaCreateAdDefault);if($('#metaAdStatus'))$('#metaAdStatus').value=config?.settings?.metaAdDefaultStatus||'PAUSED';
  if(preserveSku||preserveQuery)saveDraft();
  if(!silent)toast('Publicação limpa. Você pode iniciar uma nova SKU.');
}
async function prepareSkuDraft(sku,query=''){
  const next=String(sku||'').trim(),previous=String(activeDraftSku||selectedRemoteVideo?.catalogSku||'').trim();
  if(previous&&normalizeSku(previous)!==normalizeSku(next)&&hasPublicationData()){
    await resetPublication({preserveSku:next,preserveQuery:query,silent:true});
    toast(`Nova SKU ${next}: a publicação anterior foi limpa e um novo rascunho foi iniciado.`);
  }
  activeDraftSku=next;if($('#wedropSku'))$('#wedropSku').value=next;if(query&&$('#wedropQuery'))$('#wedropQuery').value=query;saveDraft();
}
async function loadHistory(){try{const h=await api('/api/history');$('#history').innerHTML=h.length?h.slice(0,10).map(x=>`<div class="history-item"><div><b>${esc(x.product||x.filename)}</b><br><small>${new Date(x.createdAt).toLocaleString('pt-BR')}</small></div><div><small>${esc(x.status||'PROCESSING')}</small></div></div>`).join(''):'<p class="small">Nenhuma publicação ainda.</p>'}catch{}}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
const q=new URLSearchParams(location.search);if(q.get('error')){toast(q.get('error'),true);if(/tiktok/i.test(q.get('error'))&&/(inválid|expirad)/i.test(q.get('error')))tiktokAuthInvalid=true;}if(q.get('tiktok')==='connected'){tiktokAuthInvalid=false;toast('TikTok conectado com sucesso. Você pode fechar esta aba e voltar ao vídeo anterior.');}
window.addEventListener('focus',async()=>{try{if(!$('#app').classList.contains('hidden')){await loadConfig();await loadCreator();}}catch{}});

async function loadRemoteVideo(candidate,product){
  const status=$('#wedropStatus');
  try{
    if(!candidate?.id) throw new Error('O vídeo selecionado não possui ID do Google Drive.');
    selectedFile=null;preparedStoryFile=null;preparedStoryVideoId='';await deleteStoredManualVideo();
    selectedRemoteVideo={id:candidate.id,title:candidate.title||product?.name||product?.sku||'Vídeo WeDrop',catalogProductId:product?.id||'',catalogSku:product?.sku||$('#wedropSku')?.value.trim()||'',catalogProductName:product?.name||'',catalogProductUrl:product?.shopeeUrl||''};
    activeDraftSku=selectedRemoteVideo.catalogSku||$('#wedropSku')?.value.trim()||activeDraftSku;
    if(previewObjectUrl){try{URL.revokeObjectURL(previewObjectUrl)}catch{}previewObjectUrl=''}
    generated=null;frames=[];saveDraft();
    $('#fileName').textContent=selectedRemoteVideo.title;
    const preview=$('#preview');
    preview.pause(); preview.removeAttribute('src'); preview.load();
    $('#dropzone').classList.add('hidden');$('#workArea').classList.remove('hidden');
    status.textContent='Preparando uma cópia temporária estável do vídeo…';
    $('#aiStatus').textContent='Preparando o vídeo…';
    const prepared=await api('/api/wedrop/prepare',{method:'POST',body:JSON.stringify({remoteVideoId:candidate.id,filename:selectedRemoteVideo.title||'video-wedrop.mp4'})});
    const src=prepared.streamUrl;
    preview.src=src; preview.preload='metadata'; preview.playsInline=true;
    if(Number(prepared.duration||0)>0) duration=Number(prepared.duration);
    status.textContent=prepared.cached?'Vídeo pronto. Usando a cópia temporária já preparada.':'Vídeo preparado no Render para reprodução e publicação estáveis.';
    $('#aiStatus').textContent='Lendo o vídeo preparado…';
    await new Promise((resolve,reject)=>{
      const ok=()=>{cleanup();duration=preview.duration||duration||Number(prepared.duration||0);resolve()};
      const bad=()=>{cleanup();reject(new Error('O navegador não conseguiu abrir a cópia preparada do vídeo. Tente selecionar o vídeo novamente.'))};
      const cleanup=()=>{preview.removeEventListener('loadedmetadata',ok);preview.removeEventListener('error',bad)};
      preview.addEventListener('loadedmetadata',ok,{once:true});preview.addEventListener('error',bad,{once:true});
      preview.load();setTimeout(()=>{cleanup();reject(new Error('Tempo esgotado ao abrir a cópia preparada do vídeo.'))},45000);
    });
    if(product?.shopeeUrl) $('#shopeeUrl').value=product.shopeeUrl;
    $('#aiStatus').textContent='Analisando o vídeo no servidor…';
    generated=await api('/api/ai/generate-remote',{method:'POST',body:JSON.stringify({remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop.mp4',duration:Number(duration||0),catalogProductId:selectedRemoteVideo.catalogProductId||'',catalogSku:selectedRemoteVideo.catalogSku||''})});
    // O produto escolhido pela SKU é autoritativo. A IA pode criar o texto, mas nunca trocar o anúncio/link.
    if(product?.name) generated.product=product.name;
    if(product?.shopeeUrl) generated.shopeeUrl=product.shopeeUrl;
    if(product?.id) generated.catalogMatch={id:product.id,sku:selectedRemoteVideo.catalogSku||product.sku||'',name:product.name,score:1,source:'sku-selected'};
    fillGenerated();
    $('#aiStatus').textContent=generated.confidence==='ai'?'Pronto: conteúdo criado automaticamente pela IA.':'Pronto: modo básico usado. Configure a chave da IA para análise visual.';
    await loadCreator();
    saveDraft();
    status.textContent='Vídeo preparado e analisado. Preview, Instagram e Story usam a mesma cópia temporária estável no Render.';
    window.scrollTo({top:document.querySelector('.upload-card').offsetTop-12,behavior:'smooth'});
  }catch(e){selectedRemoteVideo=null;toast(e.message,true);status.textContent=e.message}
}
function renderWedropAttempts(data){
  const box=$('#wedropAttempts'), list=data.gallery?.attempts||[]; box.innerHTML='';
  if(!list.length){box.classList.add('hidden');return}
  box.classList.remove('hidden');
  const totalMatches=list.reduce((sum,x)=>sum+Number(x.matches||0),0);
  box.innerHTML=`<div class="attempts-head"><span><svg class="icon"><use href="#i-bolt"/></svg><b>Busca automática concluída</b></span><small>${totalMatches} resultado${totalMatches===1?'':'s'} encontrado${totalMatches===1?'':'s'}</small></div><div class="attempts-list">${list.map((x,i)=>`<div class="attempt-row"><span class="attempt-index">${i+1}</span><span class="attempt-query">${esc(x.query)}</span><small class="${x.matches?'ok':'muted'}">${x.generic?'busca ampla demais':(x.matches?`${x.matches} resultado${x.matches===1?'':'s'}`:`similaridade ${Math.round((x.bestScore||0)*100)}%`)}</small></div>`).join('')}</div>`;
}
async function rememberWedropSearch(sku,query){
  if(!sku||!query)return; try{await api('/api/wedrop/alias',{method:'POST',body:JSON.stringify({sku,query})})}catch{}
}
function renderWedropResults(data){
  const box=$('#wedropResults'), status=$('#wedropStatus'); box.innerHTML='';
  const p=data.product||{};
  if(p.name && !$('#wedropQuery').value.trim()) $('#wedropQuery').value=p.name;
  renderWedropAttempts(data);
  status.innerHTML=`<b>${esc(data.sku)}</b>${p.name?' · '+esc(p.name):''}${p.matchType==='variation'?'<br>SKU de variação reconhecido no catálogo.':''}<br>${esc(data.gallery?.diagnostic||'')}`;
  const list=data.gallery?.candidates||[];
  if(list.length){
    box.classList.remove('hidden');
    const bestIndex=list.reduce((best,c,i,arr)=>Number(c.score||0)>Number(arr[best]?.score||0)?i:best,0);
    const closeOthers=current=>box.querySelectorAll('.video-result.expanded').forEach(card=>{if(card!==current){card.classList.remove('expanded');const toggle=card.querySelector('.video-result-toggle');const details=card.querySelector('.video-result-details');if(toggle)toggle.setAttribute('aria-expanded','false');if(details)details.hidden=true;}});
    list.forEach((c,i)=>{
      const title=String(c.title||c.label||p.name||data.sku);
      const score=Math.round((c.score||0)*100);
      const durationText=c.durationMs?`${(c.durationMs/1000).toFixed(1)}s`:'Duração não informada';
      const query=c.matchQuery||data.gallery?.bestQuery||'';
      const el=document.createElement('article');el.className='video-result compact'+(i===bestIndex?' best-result':'')+(i>=3?' extra-result hidden':'');
      const scoreClass=score>=85?'score-high':score>=65?'score-mid':'score-low';
      el.innerHTML=`<div class="video-result-summary"><button type="button" class="video-result-toggle" aria-expanded="false" aria-label="Ver detalhes do vídeo ${i+1}"><span class="video-rank">${String(i+1).padStart(2,'0')}</span><span class="video-result-copy"><span class="video-result-titleline"><b>Vídeo ${i+1}</b>${i===bestIndex?'<span class="best-badge">★ MELHOR OPÇÃO</span>':''}</span><span class="video-result-name">${esc(title.slice(0,92))}${title.length>92?'…':''}</span><span class="video-result-meta"><span class="meta-chip">${esc(durationText)}</span><span class="score-pill ${scoreClass}">${score}% compatível</span></span></span><span class="score-track" aria-hidden="true"><i style="width:${Math.max(4,Math.min(score,100))}%"></i></span><svg class="icon result-chevron" aria-hidden="true"><use href="#i-chevron-down"/></svg></button><button type="button" class="primary use-video-btn"><svg class="icon"><use href="#i-circle-check"/></svg><span>Selecionar</span></button></div><div class="video-result-details" hidden><div><span class="detail-label">Nome completo</span><p>${esc(title)}</p></div><div class="details-grid"><div><span class="detail-label">Duração</span><p>${esc(durationText)}</p></div><div><span class="detail-label">Compatibilidade</span><p>${score}%</p></div></div>${query?`<div><span class="detail-label">Busca utilizada</span><p>${esc(query)}</p></div>`:''}</div>`;
      const toggle=el.querySelector('.video-result-toggle'),details=el.querySelector('.video-result-details');
      toggle.onclick=()=>{const willOpen=!el.classList.contains('expanded');closeOthers(el);el.classList.toggle('expanded',willOpen);toggle.setAttribute('aria-expanded',String(willOpen));details.hidden=!willOpen;};
      el.querySelector('.use-video-btn').onclick=async()=>{await rememberWedropSearch(data.sku,query);box.querySelectorAll('.use-video-btn.selected').forEach(other=>{other.classList.remove('selected');other.innerHTML='<svg class="icon"><use href="#i-circle-check"/></svg><span>Selecionar</span>';});const btn=el.querySelector('.use-video-btn');btn.innerHTML='<svg class="icon"><use href="#i-check"/></svg><span>Selecionado</span>';btn.classList.add('selected');await loadRemoteVideo(c,p)};
      box.appendChild(el);
    });
    if(list.length>3){
      const more=document.createElement('button');more.type='button';more.className='video-results-more';more.dataset.expanded='false';more.textContent=`Ver mais ${list.length-3} vídeo${list.length-3===1?'':'s'}`;
      more.onclick=()=>{const expanded=more.dataset.expanded==='true';box.querySelectorAll('.extra-result').forEach(x=>x.classList.toggle('hidden',expanded));more.dataset.expanded=String(!expanded);more.textContent=expanded?`Ver mais ${list.length-3} vídeo${list.length-3===1?'':'s'}`:'Mostrar menos';};
      box.appendChild(more);
    }
  }else{
    box.classList.remove('hidden');
    const el=document.createElement('div');el.className='video-result fallback';
    const suggested=data.gallery?.attempts?.at(-1)?.query||p.name||data.sku;
    const helper=(data.gallery?.attempts||[]).find(x=>!x.generic&&/\s/.test(x.query)&&x.query.split(/\s+/).length>=2)?.query || suggested;
    el.innerHTML=`<div><b>Nenhum vídeo confirmado automaticamente</b><small>A galeria usa carregamento dinâmico. A busca assistida copia a expressão mais curta e abre a galeria.</small><small>Busca sugerida: <b>${esc(helper)}</b></small></div><button class="primary" type="button">COPIAR BUSCA + ABRIR GALERIA</button>`;
    el.querySelector('button').onclick=async()=>{
      try{await navigator.clipboard.writeText(helper); toast('Busca copiada: '+helper);}catch{}
      window.open(data.gallery?.galleryUrl||'https://drive-vid-gallery.lovable.app/','_blank','noopener');
      const q=$('#wedropQuery'); if(q) q.value=helper;
    };
    box.appendChild(el);
  }
}
function renderCatalogChoices(data,manual=false){
  const box=$('#wedropResults');box.innerHTML='';box.classList.remove('hidden');
  $('#wedropAttempts').classList.add('hidden');
  for(const product of data.candidates||[]){
    const row=document.createElement('div');row.className='video-result catalog-choice';
    row.innerHTML=`<div><b>${esc(product.name)}</b><small>ID Shopee: ${esc(product.id)} · SKU principal: ${esc(product.sku)}</small></div><button type="button" class="primary">Usar este anúncio</button>`;
    row.querySelector('button').onclick=()=>searchWedrop(manual,product.id);
    box.appendChild(row);
  }
}
async function searchWedrop(manual=false,productId=''){
  const sku=$('#wedropSku').value.trim(); if(!sku)return toast('Digite a SKU WeDrop.',true);
  const q=manual?$('#wedropQuery').value.trim():'';
  await prepareSkuDraft(sku,q);
  const b=manual?$('#wedropManualBtn'):$('#wedropSearchBtn');b.disabled=true;b.textContent='BUSCANDO…';$('#wedropStatus').textContent=manual?'Tentando o nome informado…':'Buscando pelo título completo e encurtando automaticamente se necessário…';
  try{const d=await api('/api/wedrop/lookup?sku='+encodeURIComponent(sku)+(q?'&q='+encodeURIComponent(q):'')+(productId?'&productId='+encodeURIComponent(productId):''));renderWedropResults(d)}
  catch(e){
    $('#wedropStatus').textContent=e.message;
    if(e.data?.code==='SKU_AMBIGUOUS')renderCatalogChoices(e.data,manual);
    else{toast(e.message,true);$('#wedropResults').classList.add('hidden');$('#wedropAttempts').classList.add('hidden');if(e.data?.code==='SKU_NOT_FOUND'){const details=document.querySelector('.manual-search');if(details)details.open=true;}}
  }finally{b.disabled=false;b.textContent=manual?'TENTAR ESTA BUSCA':'BUSCAR VÍDEO'}
}
$('#wedropSearchBtn')?.addEventListener('click',()=>searchWedrop(false));
$('#wedropManualBtn')?.addEventListener('click',()=>searchWedrop(true));
$('#wedropSku')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchWedrop(false)});

$('#wedropQuery')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchWedrop(true)});
['wedropSku','wedropQuery'].forEach(id=>$('#'+id)?.addEventListener('input',saveDraft));
$('#clearPublicationBtn')?.addEventListener('click',async()=>{
  if(!hasPublicationData()&&!String($('#wedropSku')?.value||'').trim())return toast('A publicação já está vazia.');
  if(!window.confirm('Deseja realmente apagar o rascunho desta publicação, incluindo o vídeo e todos os campos preenchidos?'))return;
  await resetPublication();
});
window.addEventListener('beforeunload',saveDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft()});

async function handleTikTokAuthEvent(payload={}){
  if(!payload||payload.source!=='redeachados-publisher-tiktok')return;
  if(payload.status==='connected'){
    tiktokAuthInvalid=false;
    try{await loadConfig();await loadCreator();$('#connectionText').textContent='Conta conectada e pronta para enviar rascunhos.';toast('TikTok conectado. Sua publicação continua exatamente como estava.');}
    catch(e){toast('TikTok conectado, mas não consegui atualizar o status automaticamente: '+e.message,true)}
  }else if(payload.status==='error'){
    tiktokAuthInvalid=true;syncTikTokPublishState();$('#connectionText').textContent='Não foi possível concluir a conexão do TikTok.';toast(payload.message||'Falha ao conectar o TikTok.',true);
  }
}
function initTikTokAuthBridge(){
  try{if('BroadcastChannel' in window){tiktokAuthChannel=new BroadcastChannel(TIKTOK_AUTH_CHANNEL);tiktokAuthChannel.onmessage=e=>handleTikTokAuthEvent(e.data)}}catch{}
  window.addEventListener('storage',e=>{if(e.key!==TIKTOK_AUTH_EVENT_KEY||!e.newValue)return;try{handleTikTokAuthEvent(JSON.parse(e.newValue))}catch{}});
  window.addEventListener('message',e=>{if(e.origin===location.origin)handleTikTokAuthEvent(e.data)});
}

boot();
