const $=s=>document.querySelector(s);
let config=null, selectedFile=null, selectedRemoteVideo=null, duration=0, frames=[], generated=null;

const DRAFT_KEY='redeachados_publisher_draft_v550';
let captionManual=false;
let commentManual=false;
let instagramManual=false;
function saveDraft(){
  try{
    const data={
      product:$('#product')?.value||'', shopeeUrl:$('#shopeeUrl')?.value||'', title:$('#title')?.value||'',
      description:$('#description')?.value||'', cta:$('#cta')?.value||'', hashtags:$('#hashtags')?.value||'',
      privacy:$('#privacy')?.value||'SELF_ONLY', disableComment:Boolean($('#disableComment')?.checked),
      disableDuet:Boolean($('#disableDuet')?.checked), disableStitch:Boolean($('#disableStitch')?.checked),
      isAigc:Boolean($('#isAigc')?.checked), caption:$('#captionPreview')?.value||'', captionManual:Boolean(captionManual), purchaseComment:$('#purchaseComment')?.value||'', commentManual:Boolean(commentManual), instagramCaption:$('#instagramCaption')?.value||'', instagramDescription:generated?.instagramDescription||'', instagramManual:Boolean(instagramManual),
      dmEnabled:Boolean($('#dmEnabled')?.checked), dmKeyword:$('#dmKeyword')?.value||'QUERO', publicReplyEnabled:Boolean($('#publicReplyEnabled')?.checked), createMetaAd:Boolean($('#createMetaAd')?.checked), metaAdStatus:$('#metaAdStatus')?.value||'PAUSED', savedAt:Date.now()
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
    if($('#dmEnabled')&&d.dmEnabled!==undefined) $('#dmEnabled').checked=Boolean(d.dmEnabled);
    if($('#dmKeyword')&&d.dmKeyword) $('#dmKeyword').value=d.dmKeyword;
    if($('#publicReplyEnabled')&&d.publicReplyEnabled!==undefined) $('#publicReplyEnabled').checked=Boolean(d.publicReplyEnabled);
    if($('#createMetaAd')&&d.createMetaAd!==undefined) $('#createMetaAd').checked=Boolean(d.createMetaAd);
    if($('#metaAdStatus')&&d.metaAdStatus) $('#metaAdStatus').value=d.metaAdStatus;
    captionManual=Boolean(d.captionManual);
    commentManual=Boolean(d.commentManual);
    instagramManual=Boolean(d.instagramManual);
    if(d.product||d.title||d.description||d.cta||d.hashtags){ generated={...(generated||{}),product:d.product||'',shopeeUrl:d.shopeeUrl||'',title:d.title||'',description:d.description||'',cta:d.cta||'',hashtags:String(d.hashtags||'').split(/\s+/).filter(x=>x.startsWith('#')),instagramDescription:d.instagramDescription||''}; }
    if(captionManual && d.caption && $('#captionPreview')) $('#captionPreview').value=d.caption; else updateCaption(true);
    if(commentManual && d.purchaseComment && $('#purchaseComment')) $('#purchaseComment').value=d.purchaseComment; else updatePurchaseComment(true);
    if(instagramManual && d.instagramCaption && $('#instagramCaption')) $('#instagramCaption').value=d.instagramCaption; else updateInstagramCaption(true);
  }catch{}
}
function clearDraft(){try{localStorage.removeItem(DRAFT_KEY)}catch{}}

function toast(msg,err=false){const d=document.createElement('div');d.className='toast'+(err?' err':'');d.textContent=msg;$('#toast').appendChild(d);setTimeout(()=>d.remove(),5000)}
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{...(opt.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const error=new Error(d.error||'Erro inesperado.');error.data=d;error.status=r.status;throw error;}return d}
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
$('#saveSettingsBtn').onclick=async e=>{e.preventDefault();try{await api('/api/settings',{method:'POST',body:JSON.stringify({brandName:$('#brandName').value,shopeeStoreUrl:$('#shopeeStoreUrl').value,geminiApiKey:$('#geminiApiKey').value,geminiModel:$('#geminiModel').value,tiktokClientKey:$('#tiktokClientKey').value,tiktokClientSecret:$('#tiktokClientSecret').value,instagramAccessToken:$('#instagramAccessToken')?.value||'',instagramUserId:$('#instagramUserId')?.value||'',metaGraphVersion:$('#metaGraphVersion')?.value||'v26.0',instagramDmEnabled:Boolean($('#instagramDmEnabled')?.checked),instagramDmKeyword:$('#instagramDmKeyword')?.value||'QUERO',instagramDmTemplate:$('#instagramDmTemplate')?.value||'',instagramPublicReplyEnabled:Boolean($('#instagramPublicReplyEnabled')?.checked),instagramPublicReplyTemplate:$('#instagramPublicReplyTemplate')?.value||'',metaPageId:$('#metaPageId')?.value||'',metaAdAccountId:$('#metaAdAccountId')?.value||'',metaAdSetId:$('#metaAdSetId')?.value||'',metaAdsAccessToken:$('#metaAdsAccessToken')?.value||'',metaWebhookVerifyToken:$('#metaWebhookVerifyToken')?.value||'',metaCreateAdDefault:Boolean($('#metaCreateAdDefault')?.checked),metaAdDefaultStatus:$('#metaAdDefaultStatus')?.value||'PAUSED'})});toast('Configuração salva.');$('#settingsDialog').close();await loadConfig();if(selectedFile)await analyze()}catch(err){toast(err.message,true)}};

async function loadCatalogStatus(){
  try{const c=await api('/api/catalog');$('#catalogStatus').textContent=c.count?`Catálogo carregado: ${c.count} produtos · ${c.variationSkuCount||0} SKUs adicionais/variações. ${c.duplicateSkuCount?`${c.duplicateSkuCount} SKUs aparecem em mais de um anúncio; a busca pedirá sua escolha. `:''}Última importação: ${c.importedAt?new Date(c.importedAt).toLocaleString('pt-BR'):'não informada'}.`:'Nenhum catálogo carregado ainda.';}catch{$('#catalogStatus').textContent='Não foi possível consultar o catálogo.'}
}
$('#importCatalogBtn').onclick=async()=>{
  const file=$('#catalogFile').files?.[0]; if(!file)return toast('Selecione a planilha de Informações básicas da Shopee.',true);
  const btn=$('#importCatalogBtn');btn.disabled=true;btn.textContent='IMPORTANDO...';
  try{const fd=new FormData();fd.append('catalog',file);const r=await api('/api/catalog/import',{method:'POST',body:fd});toast(`Catálogo atualizado: ${r.count} produtos.`);$('#catalogFile').value='';await loadCatalogStatus();}
  catch(e){toast(e.message,true)}finally{btn.disabled=false;btn.textContent='Atualizar catálogo'}
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
  selectedRemoteVideo=null; selectedFile=file; generated=null;frames=[];$('#fileName').textContent=file.name;$('#preview').src=URL.createObjectURL(file);$('#dropzone').classList.add('hidden');$('#workArea').classList.remove('hidden');$('#aiStatus').textContent='Lendo o vídeo...';
  try{await new Promise((resolve,reject)=>{const v=$('#preview');v.onloadedmetadata=()=>{duration=v.duration||0;resolve()};v.onerror=reject});frames=await extractFrames($('#preview'),[.15,.5,.85]);await loadCreator();await analyze()}catch(e){toast('Não consegui analisar o vídeo: '+e.message,true);$('#aiStatus').textContent='Falha na análise.'}
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

function currentMeta(){return{product:$('#product').value.trim(),shopeeUrl:$('#shopeeUrl').value.trim(),title:$('#title').value.trim(),description:$('#description').value.trim(),cta:$('#cta').value.trim(),hashtags:$('#hashtags').value.trim().split(/\s+/).filter(x=>x.startsWith('#'))}}
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
    if(status)status.textContent=d.dmConfigured?`✅ Direct automático pronto · ${d.rules} Reel(s) monitorado(s) · ${d.sent} link(s) enviado(s).`:'⚠️ Falta configurar o Webhook/Verify Token para o Direct automático.';
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
  return {product:$('#product')?.value.trim()||'',shopeeUrl:$('#shopeeUrl')?.value.trim()||'',dmEnabled:Boolean($('#dmEnabled')?.checked),dmKeyword:$('#dmKeyword')?.value.trim()||'QUERO',publicReplyEnabled:Boolean($('#publicReplyEnabled')?.checked),createAd:Boolean($('#createMetaAd')?.checked),adStatus:$('#metaAdStatus')?.value||'PAUSED'};
}
function describeInstagramResult(r){
  const bits=['Reel publicado no Instagram ✅'];
  if(r?.commerce?.dmEnabled)bits.push(`Direct “${r.commerce.keyword||'QUERO'}” ativado`);
  if(r?.commerce?.ad?.adId)bits.push(`anúncio ${r.commerce.ad.status==='ACTIVE'?'ativo':'criado pausado para revisão'}`);
  if(r?.commerce?.warning)bits.push(r.commerce.warning);
  return bits.join(' · ');
}

async function loadInstagramStatus(){
  const el=$('#instagramConnectionText'); if(!el)return;
  try{const d=await api('/api/instagram/status');if(!d.configured){el.textContent='Configure o token da Meta em Configurações.';return;}if(d.connected){el.textContent=`Conectado: @${d.username||'redeachadosbr'}`;}else el.textContent='Token configurado, mas a Meta recusou a conexão: '+(d.error||'verifique o token.');}catch(e){el.textContent=e.message;}
}
async function publishInstagram(){
  if(!selectedFile&&!selectedRemoteVideo)return toast('Escolha um vídeo.',true);if(!generated)return toast('Aguarde a geração da publicação.',true);if(!config?.settings?.instagramConfigured)return toast('Abra Configurações e informe um novo token de acesso da Meta.',true);
  const caption=$('#instagramCaption')?.value.trim()||''; if(!caption)return toast('A legenda do Instagram está vazia.',true);
  const commerce=instagramCommercePayload();if((commerce.dmEnabled||commerce.createAd)&&!commerce.shopeeUrl)return toast('Informe o Link do produto Shopee para ativar Direct ou anúncio com compra.',true);
  const b=$('#instagramPublishBtn');b.disabled=true;b.textContent='PUBLICANDO REEL...';
  try{
    let r;
    if(selectedRemoteVideo){r=await api('/api/instagram/publish-remote',{method:'POST',body:JSON.stringify({remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop',caption,...commerce})});}
    else{const fd=new FormData();fd.append('video',selectedFile);fd.append('caption',caption);for(const [k,v] of Object.entries(commerce))fd.append(k,String(v));r=await api('/api/instagram/publish',{method:'POST',body:fd});}
    if(r.pending){toast('Instagram ainda está processando. O Direct/anúncio serão associados assim que o Reel finalizar.');await new Promise(x=>setTimeout(x,8000));const f=await api('/api/instagram/finalize',{method:'POST',body:JSON.stringify({creationId:r.creationId})});if(f.pending)toast('O Reel continua processando. Tente publicar novamente em alguns segundos.',true);else{toast(describeInstagramResult(f));if(f.commerce?.adError)toast('Reel publicado, mas Meta Ads: '+f.commerce.adError,true);}}
    else{toast(describeInstagramResult(r));if(r.commerce?.adError)toast('Reel publicado, mas Meta Ads: '+r.commerce.adError,true);}
    await loadHistory();await loadInstagramCommerceStatus();
  }catch(e){toast('Instagram: '+e.message,true);}finally{b.disabled=false;b.textContent='📸 PUBLICAR REEL NO INSTAGRAM';}
}
$('#instagramPublishBtn')?.addEventListener('click',publishInstagram);

$('#restoreCaptionBtn').onclick=restoreGeneratedCaption;
$('#copyCaptionBtn').onclick=async()=>{try{await navigator.clipboard.writeText($('#captionPreview').value.trim());toast('Legenda copiada. Cole no TikTok ao finalizar o rascunho.')}catch{toast('Não foi possível copiar automaticamente. Selecione a legenda e use Ctrl+C.',true)}};
['product','shopeeUrl','title','description','cta','hashtags'].forEach(id=>$('#'+id).addEventListener('input',()=>{updateCaption(false);updatePurchaseComment(false);updateInstagramCaption(false);saveDraft()}));
['dmKeyword'].forEach(id=>$('#'+id)?.addEventListener('input',()=>{instagramManual=false;updateInstagramCaption(true);saveDraft()}));
['dmEnabled','publicReplyEnabled','createMetaAd','metaAdStatus'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{if(id==='dmEnabled'){instagramManual=false;updateInstagramCaption(true)}saveDraft()}));
['privacy','disableComment','disableDuet','disableStitch','isAigc'].forEach(id=>$('#'+id)?.addEventListener('change',saveDraft));
$('#connectBtn').addEventListener('click',()=>saveDraft());
$('#regenerateBtn').onclick=analyze;
async function loadCreator(){
  if(!config?.tiktokConnected)return;
  try{const c=await api('/api/creator');const p=$('#privacy');p.innerHTML='';for(const x of(c.privacy_level_options||['SELF_ONLY'])){const o=document.createElement('option');o.value=x;o.textContent={PUBLIC_TO_EVERYONE:'Público',MUTUAL_FOLLOW_FRIENDS:'Amigos',FOLLOWER_OF_CREATOR:'Seguidores',SELF_ONLY:'Somente eu'}[x]||x;p.appendChild(o)} if((c.privacy_level_options||[]).includes(config.settings.defaultPrivacy))p.value=config.settings.defaultPrivacy;}catch(e){toast(e.message,true)}
}
$('#publishBtn').onclick=async()=>{
  if(!selectedFile&&!selectedRemoteVideo)return toast('Escolha um vídeo.',true);if(!generated)return toast('Aguarde a geração da publicação.',true);if(!config.tiktokConnected)return toast('Conecte sua conta TikTok primeiro.',true);
  const b=$('#publishBtn');b.disabled=true;b.textContent='ENVIANDO RASCUNHO...';
  try{
    let r;
    if(selectedRemoteVideo?.id){
      r=await api('/api/upload-draft-remote',{method:'POST',body:JSON.stringify({remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop',meta:currentMeta(),caption:$('#captionPreview').value.trim(),duration:Number(duration||0)})});
    }else{
      const fd=new FormData();fd.append('video',selectedFile);fd.append('meta',JSON.stringify(currentMeta()));fd.append('caption',$('#captionPreview').value.trim());fd.append('duration',String(duration||0));
      r=await api('/api/upload-draft',{method:'POST',body:fd});
    }
    toast('Rascunho enviado. Abra o TikTok e toque na notificação da caixa de entrada para concluir.');
    try{await navigator.clipboard.writeText($('#captionPreview').value.trim())}catch{}
    await loadHistory();resetVideo();
  }catch(e){toast(e.message,true)}finally{b.disabled=false;b.textContent='ENVIAR RASCUNHO AO TIKTOK'}
};
function resetVideo(){selectedFile=null;selectedRemoteVideo=null;frames=[];generated=null;captionManual=false;commentManual=false;instagramManual=false;clearDraft();$('#preview').removeAttribute('src');$('#workArea').classList.add('hidden');$('#dropzone').classList.remove('hidden');$('#videoInput').value=''}
async function loadHistory(){try{const h=await api('/api/history');$('#history').innerHTML=h.length?h.slice(0,10).map(x=>`<div class="history-item"><div><b>${esc(x.product||x.filename)}</b><br><small>${new Date(x.createdAt).toLocaleString('pt-BR')}</small></div><div><small>${esc(x.status||'PROCESSING')}</small></div></div>`).join(''):'<p class="small">Nenhuma publicação ainda.</p>'}catch{}}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
const q=new URLSearchParams(location.search);if(q.get('error'))toast(q.get('error'),true);if(q.get('tiktok')==='connected')toast('TikTok conectado com sucesso. Você pode fechar esta aba e voltar ao vídeo anterior.');
window.addEventListener('focus',async()=>{try{if(!$('#app').classList.contains('hidden')){await loadConfig();await loadCreator();}}catch{}});

async function loadRemoteVideo(candidate,product){
  const status=$('#wedropStatus');
  try{
    if(!candidate?.id) throw new Error('O vídeo selecionado não possui ID do Google Drive.');
    selectedFile=null;
    selectedRemoteVideo={id:candidate.id,title:candidate.title||product?.name||product?.sku||'Vídeo WeDrop'};
    generated=null; frames=[];
    const src='/api/wedrop/video?id='+encodeURIComponent(candidate.id)+'&v=546';
    $('#fileName').textContent=selectedRemoteVideo.title;
    const preview=$('#preview');
    preview.pause(); preview.removeAttribute('src'); preview.load();
    preview.src=src; preview.preload='metadata'; preview.playsInline=true;
    $('#dropzone').classList.add('hidden');$('#workArea').classList.remove('hidden');
    status.textContent='Carregando vídeo pelo servidor para compatibilidade com iPhone…';
    $('#aiStatus').textContent='Lendo o vídeo…';
    await new Promise((resolve,reject)=>{
      const ok=()=>{cleanup();duration=preview.duration||0;resolve()};
      const bad=()=>{cleanup();reject(new Error('Load Failed: o iPhone não conseguiu abrir o fluxo de vídeo.'))};
      const cleanup=()=>{preview.removeEventListener('loadedmetadata',ok);preview.removeEventListener('error',bad)};
      preview.addEventListener('loadedmetadata',ok,{once:true});preview.addEventListener('error',bad,{once:true});
      preview.load();setTimeout(()=>{cleanup();reject(new Error('Tempo esgotado ao carregar o vídeo no iPhone.'))},20000);
    });
    if(product?.shopeeUrl && !$('#shopeeUrl').value) $('#shopeeUrl').value=product.shopeeUrl;
    $('#aiStatus').textContent='Analisando o vídeo no servidor…';
    generated=await api('/api/ai/generate-remote',{method:'POST',body:JSON.stringify({remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop.mp4',duration:Number(duration||0)})});
    fillGenerated();
    $('#aiStatus').textContent=generated.confidence==='ai'?'Pronto: conteúdo criado automaticamente pela IA.':'Pronto: modo básico usado. Configure a chave da IA para análise visual.';
    await loadCreator();
    saveDraft();
    status.textContent='Vídeo carregado pelo servidor e analisado. Ao enviar ao TikTok, o arquivo será transferido diretamente pelo Render — sem baixar o vídeo inteiro no iPhone.';
    window.scrollTo({top:document.querySelector('.upload-card').offsetTop-12,behavior:'smooth'});
  }catch(e){selectedRemoteVideo=null;toast(e.message,true);status.textContent=e.message}
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
  status.innerHTML=`<b>${esc(data.sku)}</b>${p.name?' · '+esc(p.name):''}${p.matchType==='variation'?'<br>SKU de variação reconhecido no catálogo.':''}<br>${esc(data.gallery?.diagnostic||'')}`;
  const list=data.gallery?.candidates||[];
  if(list.length){
    box.classList.remove('hidden');
    list.forEach((c,i)=>{
      const el=document.createElement('div');el.className='video-result';
      el.innerHTML=`<div><b>Vídeo ${i+1}</b><small>${esc((c.title||c.label||p.name||data.sku).slice(0,170))}</small>${c.durationMs?`<small>Duração: ${(c.durationMs/1000).toFixed(1)}s</small>`:''}<small>Compatibilidade: ${Math.round((c.score||0)*100)}% · Busca: ${esc(c.matchQuery||data.gallery?.bestQuery||'')}</small></div><button class="primary">USAR ESTE VÍDEO</button>`;
      el.querySelector('button').onclick=async()=>{await rememberWedropSearch(data.sku,c.matchQuery||data.gallery?.bestQuery);loadRemoteVideo(c,p)}; box.appendChild(el);
    });
  }else{
    box.classList.remove('hidden');
    const el=document.createElement('div');el.className='video-result fallback';
    const suggested=data.gallery?.attempts?.at(-1)?.query||p.name||data.sku;
    const helper=(data.gallery?.attempts||[]).find(x=>/\s/.test(x.query)&&x.query.split(/\s+/).length===2)?.query || suggested;
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

boot();
