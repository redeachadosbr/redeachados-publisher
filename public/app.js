const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let products=[],status={},settings={},supplierCatalog={},opportunityScan={results:[]},variationGroups=[],kitSuggestions=[],accounting={summary:{total:{},products:[]},lines:[],daily:[]},promotionState={rows:[],campaigns:[],settings:{}},pricingAutoState={rows:[],settings:{}},adsState={rows:[],settings:{}},publicationReceipts=[],monitoring={rows:[],alerts:[],settings:{}},authState={authenticated:false},dailyOps={tasks:[],summary:{},settings:{}};
let adsUiFilter='all',adsUiSearch='',promoUiFilter='all';
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
let toastTimer=null,operationTimer=null;
function messageHasRealError(text=''){const low=String(text||'').toLowerCase();const counted=[...low.matchAll(/(\d+)\s+(?:com\s+)?(?:erro|erros|erro\(s\)|falha|falhas|falha\(s\)|pendência|pendências|pendência\(s\))/g)];if(counted.some(m=>Number(m[1])>0))return true;const scrubbed=low.replace(/\b0\s+(?:com\s+)?(?:erro|erros|erro\(s\)|falha|falhas|falha\(s\)|pendência|pendências|pendência\(s\))\b/g,'');return /(falh|erro|não foi possível|nao foi possivel)/i.test(scrubbed)}
function toast(m,duration=7000){const t=$('#toast');if(!t)return;const text=String(m||''),low=text.toLowerCase(),hasError=messageHasRealError(text),explicitOk=/^[\s✓✔✅]+/.test(text)||/\b(conclu[ií]d|sucesso|atualizad|salv[oa]|pronto|publicad|validado|confirmad)\b/i.test(text);if(/(analis|verific|sincron|carreg|envi|salv|gerand|procur|extraind|cotando|baixando|atualizando|process)/i.test(text)&&!explicitOk&&!hasError)setOperationStatus('busy','EXECUTANDO · AGUARDE',text);else if(explicitOk&&!hasError)setOperationStatus('done','CONCLUÍDO',text);else if(hasError)setOperationStatus('error','ERRO',text);t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),duration)}
function setOperationStatus(state,title,detail=''){const el=$('#operationStatus');if(!el)return;clearTimeout(operationTimer);el.className=`operationStatus ${state||'idle'}`;$('#operationStatusTitle').textContent=title||'Status';$('#operationStatusDetail').textContent=detail||'';if(state==='done'||state==='error')operationTimer=setTimeout(()=>{el.className='operationStatus idle';$('#operationStatusTitle').textContent='Pronto';$('#operationStatusDetail').textContent='Aguardando seu comando.'},9000)}
function operationStart(title,detail='Executando. Aguarde, o sistema está trabalhando...'){setOperationStatus('busy',title,detail);const m=$('#monitorCommandStatus');if(m){m.className='monitorCommandStatus busy';m.querySelector('b').textContent=title;m.querySelector('small').textContent=detail}}
function operationDone(title,detail='Concluído com sucesso.'){setOperationStatus('done',title,detail);const m=$('#monitorCommandStatus');if(m){m.className='monitorCommandStatus done';m.querySelector('b').textContent=title;m.querySelector('small').textContent=detail}}
function operationError(title,detail){setOperationStatus('error',title,detail||'Ocorreu um erro.');const m=$('#monitorCommandStatus');if(m){m.className='monitorCommandStatus error';m.querySelector('b').textContent=title;m.querySelector('small').textContent=detail||'Ocorreu um erro.'}}
function friendlyConnectionError(err,status=0){
  const raw=String(err?.message||err||'');
  if([502,503,504].includes(Number(status))||/connection terminated unexpectedly|failed to fetch|networkerror|load failed|econnreset|socket hang up/i.test(raw))return 'Servidor reiniciando ou reconectando ao banco de dados. Aguarde alguns segundos e tente novamente; seus dados continuam salvos no PostgreSQL.';
  return raw||'Não foi possível concluir a operação.';
}
let connectionWatchTimer=null,connectionBannerState='online';
const apiSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setConnectionBanner(state='online',detail=''){
  connectionBannerState=state;
  const el=$('#connectionResilience');if(!el)return;
  el.className=`connectionResilience ${state}`;
  const title=el.querySelector('b'),small=el.querySelector('small');
  if(state==='online'){title.textContent='Conexão protegida';small.textContent=detail||'PostgreSQL conectado pelo Connection Pool.';setTimeout(()=>{if(connectionBannerState==='online')el.classList.add('hidden')},2200)}
  else if(state==='reconnecting'){el.classList.remove('hidden');title.textContent='RECONECTANDO · AGUARDE';small.textContent=detail||'A sessão continua aberta. O sistema retomará automaticamente assim que o banco responder.'}
  else{el.classList.remove('hidden');title.textContent='CONEXÃO INSTÁVEL';small.textContent=detail||'Não repita comandos de gravação até a recuperação automática.'}
}
async function checkDatabaseConnection(){
  try{
    const r=await fetch('/health',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const h=await r.json(),db=h.database||{};
    if(!db.configured||h.databaseOperational!==false&&db.connected!==false){setConnectionBanner('online',db.latencyMs!=null?`PostgreSQL conectado · ${db.latencyMs} ms`:'PostgreSQL conectado pelo Connection Pool.');return true}
    setConnectionBanner('reconnecting','O PostgreSQL está reconectando. A tela permanece aberta e os comandos de gravação ficam protegidos.');return false;
  }catch(_){setConnectionBanner('reconnecting','Servidor momentaneamente inacessível. Mantendo a sessão e tentando reconectar automaticamente.');return false}
}
function startConnectionWatch(){clearInterval(connectionWatchTimer);checkDatabaseConnection();connectionWatchTimer=setInterval(checkDatabaseConnection,10000)}
async function api(url,opt={}){
  const method=String(opt.method||'GET').toUpperCase(),safeRead=['GET','HEAD','OPTIONS'].includes(method);
  const maxAttempts=safeRead?5:10;
  let lastErr;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    let r;
    try{r=await fetch(url,opt)}
    catch(err){
      lastErr=err;
      setConnectionBanner('reconnecting','A comunicação oscilou. Sua tela e sessão foram mantidas; tentando recuperar.');
      if(safeRead&&attempt<maxAttempts-1){await apiSleep(Math.min(4000,900*(attempt+1)));continue}
      const e=new Error(safeRead?friendlyConnectionError(err):'A conexão foi interrompida durante um comando de gravação. Não repita a ação imediatamente; o sistema vai reconectar e você deve conferir o resultado antes de tentar de novo.');
      e.code=safeRead?'NETWORK_RETRY_EXHAUSTED':'AMBIGUOUS_MUTATION';throw e;
    }
    const raw=await r.text();let d={};
    if(raw){try{d=JSON.parse(raw)}catch{const cleanRaw=raw.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();d={error:cleanRaw||`Resposta inválida do servidor (HTTP ${r.status})`};}}
    if(r.ok){if(connectionBannerState!=='online')setConnectionBanner('online','Conexão restabelecida. Operação retomada automaticamente.');return d;}
    // DB_RECONNECTING é devolvido antes da rota executar. Portanto é seguro repetir inclusive POST.
    if(r.status===503&&d?.retryable===true&&d?.safeToRetry===true&&attempt<maxAttempts-1){
      lastErr=new Error(d.error||'Banco reconectando.');
      setConnectionBanner('reconnecting',`Banco reconectando · tentativa ${attempt+1}/${maxAttempts}. Nenhuma alteração foi executada ainda.`);
      setOperationStatus('busy','RECONECTANDO · AGUARDE','O comando está protegido e será retomado automaticamente quando o PostgreSQL voltar.');
      await apiSleep(Math.min(5000,1000+attempt*600));continue;
    }
    if([502,504].includes(r.status)&&safeRead&&attempt<maxAttempts-1){
      setConnectionBanner('reconnecting','Servidor reiniciando. Mantendo a sessão e tentando novamente.');
      await apiSleep(Math.min(4000,1000*(attempt+1)));continue;
    }
    if(r.status===401&&d.loginRequired)showLogin({setupRequired:false});
    throw new Error(friendlyConnectionError(new Error(d.error||`Erro HTTP ${r.status}`),r.status));
  }
  throw lastErr||new Error('Não foi possível concluir após tentativas de reconexão.');
}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function pct(v){return `${Number(v||0).toFixed(2).replace('.',',')}%`}
function stockAvailable(p){const st=String(p?.availability_status||'').toLowerCase();if(st==='unavailable')return false;if(st==='available')return !(p?.stock_quantity_known===true&&Number(p.stock||0)<=0);return Number(p?.stock||0)>0}
function stockDisplay(p){if(p?.ml_item_id&&p?.ml_available_quantity!=null&&Number.isFinite(Number(p.ml_available_quantity)))return `ML · ${Number(p.ml_available_quantity)} un.`;const st=String(p?.availability_status||'').toLowerCase();if(st==='available')return p?.stock_quantity_known?`DISPONÍVEL · ${Number(p.stock||0)}`:'DISPONÍVEL';if(st==='unavailable')return 'INDISPONÍVEL';return Number(p?.stock||0)>0?String(Number(p.stock||0)):'NÃO INFORMADO'}
function setGroupOpen(group,open){if(!group)return;group.classList.toggle('open',open);const toggle=group.querySelector('.navGroupToggle');if(toggle)toggle.setAttribute('aria-expanded',open?'true':'false')}
function closeAllGroups(except=null){$$('.navGroup').forEach(g=>{if(g!==except)setGroupOpen(g,false)})}
function revealGroupForView(view){const item=$(`.sidebar nav button[data-view="${view}"]`);const group=item?.closest('.navGroup');if(group){closeAllGroups(group);setGroupOpen(group,true)}else closeAllGroups()}
function nav(view){$$('.view').forEach(x=>x.classList.toggle('active',x.id===view));$$('.sidebar nav button[data-view]').forEach(x=>{const on=x.dataset.view===view;x.classList.toggle('active',on);if(on)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});revealGroupForView(view);const titles={daily:'Rotina do dia',dashboard:'Visão geral',accounting:'Contabilidade & Rentabilidade',supplier:'Catálogo WeDrop',opportunities:'Analisador de produtos',variations:'Variações automáticas',kits:'Gerador de Kits',import:'Importar SKUs',products:'Produtos',images:'Fotos IA',commercial:'Inteligência Comercial',videos:'Vídeos MarketPro',pricing:'Precificação e lucro',publish:'Publicação em massa',promos:'Promoções',ads:'ADS Automático',logistics:'Flex & Frete',monitor:'Monitor 24/7',publicationResult:'Resumo pós-publicação',ops:'Central IA Operacional',history:'Histórico',settings:'Configurações'};$('#pageTitle').textContent=titles[view]||'Publisher Pro';if(view==='daily')loadDailyOps();if(view==='history')loadJobs();if(view==='settings')loadOperators();if(view==='accounting')loadAccounting();if(view==='supplier')loadSupplierCatalog();if(view==='pricing'){renderPricing();loadPricingAutomation();}if(view==='publish'){renderPublish();setTimeout(()=>quietSyncPublishedStatus(),120);}if(view==='images')renderImageStudio();if(view==='commercial'){renderCommercial();loadCommercialContext();}if(view==='videos')renderVideos();if(view==='opportunities')loadOpportunities();if(view==='variations')loadVariations();if(view==='kits')loadKits();if(view==='promos')loadPromotions();if(view==='ads')loadAds();if(view==='monitor')loadMonitoring();if(view==='ops')loadOpsOverview();if(view==='publicationResult')loadPublicationReceipts();if(view==='dashboard')renderResumeWork();renderPipelineNav(view);applyWorkflowFocus(view);if(typeof guideMaybeForView==='function')guideMaybeForView(view)}

function setLoginStatus(text,state=''){const el=$('#loginStatus');if(!el)return;el.textContent=text;el.className=`loginStatus ${state||''}`}
function showLogin(info={}){
  authState={...authState,...info,authenticated:false};document.body.classList.add('loginMode');const screen=$('#loginScreen');if(screen)screen.hidden=false;
  const setup=Boolean(info.setupRequired);$('#loginTitle').textContent=setup?'Primeiro acesso ao Publisher':'Acesse sua operação';$('#loginSubtitle').textContent=setup?'Crie o primeiro operador administrador. Depois disso, cada acesso ficará registrado para organizar a rotina diária.':'Entre para iniciar a rotina guiada do dia, monitorar anúncios e acompanhar o desempenho da conta.';
  if($('#setupNameWrap'))$('#setupNameWrap').hidden=!setup;if($('#setupCodeWrap'))$('#setupCodeWrap').hidden=!(setup&&info.setupCodeRequired);if($('#loginSubmit'))$('#loginSubmit').textContent=setup?'Criar operador e entrar':'Entrar no sistema';if($('#loginMlState'))$('#loginMlState').textContent=info.mlConnected?'Mercado Livre · conexão encontrada':'Mercado Livre · conexão será validada após o login';setLoginStatus(setup?'Primeiro acesso: defina o operador administrador.':'Aguardando acesso.');
}
function showApp(info={}){
  authState={...authState,...info,authenticated:true};document.body.classList.remove('loginMode');if($('#loginScreen'))$('#loginScreen').hidden=true;const op=authState.operator||{};const b=$('#operatorBadge');if(b){b.querySelector('b').textContent=op.name||op.username||'Operador';b.querySelector('small').textContent=op.loginAt?`Entrou ${new Date(op.loginAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:'Sessão ativa';}
  startConnectionWatch();
}
async function authBootstrap(){
  try{const r=await fetch('/api/auth/status');const raw=await r.text();let info={};try{info=raw?JSON.parse(raw):{}}catch{info={error:raw}}if(!r.ok)throw new Error(friendlyConnectionError(new Error(info.error||`Erro HTTP ${r.status}`),r.status));authState=info;if(!info.authenticated){showLogin(info);return false;}showApp(info);return true;}catch(err){showLogin({setupRequired:false});setLoginStatus(friendlyConnectionError(err),'busy');return false;}
}
if($('#loginForm'))$('#loginForm').onsubmit=async e=>{e.preventDefault();const setup=Boolean(authState.setupRequired);const username=$('#loginUser').value.trim(),password=$('#loginPassword').value;try{setLoginStatus(setup?'Criando operador... aguarde.':'Entrando... aguarde.','busy');const url=setup?'/api/auth/setup':'/api/auth/login';const body=setup?{name:$('#setupName').value.trim(),username,password,setupCode:$('#setupCode')?.value||''}:{username,password};let r;try{r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}catch(netErr){throw new Error(friendlyConnectionError(netErr));}const raw=await r.text();let d={};try{d=raw?JSON.parse(raw):{}}catch{d={error:raw}}if(!r.ok)throw new Error(friendlyConnectionError(new Error(d.error||'Falha no acesso.'),r.status));authState={authenticated:true,operator:d.operator,loginEventId:d.operator?.loginEventId};showApp(authState);setLoginStatus('Acesso liberado.','done');await initializePublisher({fromLogin:true});}catch(err){setLoginStatus(err.message,'error')}};
if($('#logoutBtn'))$('#logoutBtn').onclick=async()=>{try{await fetch('/api/auth/logout',{method:'POST'});}catch(_){}sessionStorage.removeItem('ra_daily_login_event');location.href='/';};


let guideCoachContext=null,guideCoachMinimized=false,lastDailyBackgroundState={},catalogVerifyPollTimer=null,catalogVerifyPollBusy=false;
let publishQuietSyncAt=0,publishQuietSyncBusy=false;
function guidePopupsEnabled(){return dailyOps?.settings?.dailyGuidePopupsEnabled!==false}
function saoPauloHour(){try{return Number(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',hour12:false}).format(new Date()).replace(/\D/g,''))||0}catch(_){return new Date().getHours()}}
function timeGreeting(){const h=saoPauloHour();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}
function guideGreeting(){const op=authState.operator||{},name=op.name||op.username||'operador';return `${timeGreeting()}, ${name}`}
function guideTaskWhy(t={}){
  if(t.kind==='account')return 'A conta do Mercado Livre é a fonte principal. Uma SKU nova pode ter sido criada fora do Publisher e ainda assim precisa entrar em todas as conferências.';
  if(t.kind==='catalogVerify')return 'O próprio objetivo de qualidade do Mercado Livre está mostrando “Verificar produto”. O Publisher só cria esta tarefa quando esse texto aparece no /performance; anúncios inativos ou sem estoque ficam fora da fila. Com o Helper Chrome, o fluxo é executado automaticamente e validado novamente no Mercado Livre.';
  if(t.kind==='quality')return t.legacy?'Esta é uma SKU antiga. O sistema tenta resolver usando primeiro o catálogo WeDrop e depois dados confiáveis do Mercado Livre.':'A rotina de qualidade mostra somente o que precisa ser corrigido no anúncio.';
  if(t.kind==='alert')return 'Este ponto foi encontrado na análise real da conta. Resolver primeiro evita que um problema de anúncio, margem, ADS ou disponibilidade continue prejudicando a operação.';
  if(t.kind==='growth')return 'Com a operação protegida, ampliar o catálogo com qualidade aumenta as chances de gerar novas vendas sem abandonar os anúncios já publicados.';
  if(String(t.key||'').includes('ads'))return 'ADS precisa ser acompanhado junto com venda e margem. Gastar sem retorno reduz diretamente o lucro da operação.';
  if(t.promoAction==='apply-safe')return 'A promoção atual está perto do fim, mas desta vez existe uma próxima oferta segura para a mesma SKU. O Publisher já comparou preço, lucro e margem; você não precisa procurar campanhas em outra tela.';
  if(String(t.key||'').includes('promo'))return 'Promoção e desconto podem melhorar conversão, mas só devem exigir sua atenção quando houver uma decisão realmente executável e segura.';
  if(String(t.key||'').includes('quality'))return 'A qualidade oficial do anúncio influencia a competitividade. Pendências de conteúdo, fotos ou atributos precisam ser tratadas antes de escalar tráfego.';
  if(String(t.key||'').includes('sales')||String(t.key||'').includes('close'))return 'O operador precisa saber cedo onde houve venda, lucro ou prejuízo para corrigir preço e investimento antes que o problema se acumule.';
  if(String(t.key||'').includes('conversion'))return 'Anúncio parado ou com tráfego sem venda exige diagnóstico de preço, frete, capa, título, promoção e ADS antes de aumentar investimento.';
  return 'Esta etapa faz parte do controle diário necessário para manter a conta organizada, saudável e com decisões baseadas nos dados reais do Mercado Livre.';
}
function guideTaskInstruction(t={}){
  if(t.kind==='account')return 'O sistema já encontrou essas SKUs diretamente no Mercado Livre. Abra a revisão, confira a identificação e confirme a etapa; elas já entram automaticamente nas auditorias seguintes.';
  if(t.kind==='catalogVerify')return 'Clique em “Resolver automaticamente”. O Publisher abre esta SKU no Mercado Livre e o Helper executa “Verificar produto” → “Não encontro meu produto” → confirmar → informar a diferença → enviar. Depois o Publisher relê /performance e só libera a próxima ação quando o objetivo desaparecer.';
  if(t.kind==='quality')return `${t.detail||'CORRIGIR QUALIDADE'}. Clique em “Corrigir agora”. O Publisher mostrará o plano antes de alterar qualquer coisa; se não encontrar dado confiável, a etapa ficará marcada como MANUAL.`;
  if(t.promoAction==='apply-safe')return `${t.solution||'Existe uma promoção segura pronta para esta SKU.'} Clique em “Aplicar e validar”. O Publisher faz a adesão, relê o Mercado Livre e só então libera a próxima ação.`;
  if(t.alertId)return `${t.solution||'Execute a correção recomendada.'} Use o botão abaixo; o sistema executará o que for seguro e validará novamente antes de retirar o alerta da fila.`;
  if(t.view)return `${t.solution||stepHelpText(t.view)} Clique em “Ir para a etapa”. O sistema abrirá o menu correto e continuará acompanhando você até a validação.`;
  return t.solution||'Siga a orientação desta etapa e depois clique em validar.';
}
function guideSetStatus(state='ready',title='PRONTO',detail='Aguardando sua ação.'){
  const box=$('#guideCoachStatus');if(!box)return;if(guideCoachContext){guideCoachContext.status=state;guideCoachContext.statusTitle=title;guideCoachContext.statusDetail=detail;}box.className=`guideCoachStatus ${state}`;$('#guideCoachStatusTitle').textContent=title;$('#guideCoachStatusDetail').textContent=detail;const coach=$('#guideCoach');if(coach){coach.classList.toggle('busy',state==='busy');coach.classList.toggle('done',state==='done');coach.classList.toggle('error',state==='error')}
}
async function guideRecord(type,extra={}){try{await fetch('/api/guide/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,...extra})})}catch(_){}}
function guideConversationSections({why=true,instruction=true,label='Agora vamos fazer'}={}){
  const whyBox=$('#guideCoachWhy')?.closest('.guideCoachWhy'),instructionBox=$('#guideCoachInstruction')?.closest('.guideCoachInstruction'),bubbleLabel=$('#guideCoach')?.querySelector('.guideBubbleLabel');
  if(whyBox)whyBox.hidden=!why;if(instructionBox)instructionBox.hidden=!instruction;if(bubbleLabel)bubbleLabel.textContent=label;
}
function guideOpenShell({welcome=false}={}){const c=$('#guideCoach'),b=$('#guideCoachBackdrop'),bubble=$('#guideCoachBubble');if(!c)return;c.hidden=false;c.classList.toggle('welcome',Boolean(welcome));c.classList.remove('evidenceMode');if(b)b.hidden=!welcome;if(bubble)bubble.hidden=true;guideCoachMinimized=false;guideConversationSections({why:true,instruction:true,label:'Agora vamos fazer'})}
function guideMinimize(){const c=$('#guideCoach'),b=$('#guideCoachBackdrop'),bubble=$('#guideCoachBubble');if(c)c.hidden=true;if(b)b.hidden=true;if(bubble){bubble.hidden=false;$('#guideCoachBubbleText').textContent=guideCoachContext?.bubble||'Há uma próxima ação'}guideCoachMinimized=true}
function guideRestore(){const c=$('#guideCoach');if(!c)return;guideOpenShell({welcome:false});guideSetStatus(guideCoachContext?.status||'ready',guideCoachContext?.statusTitle||'PRONTO',guideCoachContext?.statusDetail||'Aguardando sua ação.')}
window.guideMinimize=guideMinimize;window.guideRestore=guideRestore;
if($('#guideCoachMinimize'))$('#guideCoachMinimize').onclick=guideMinimize;if($('#guideCoachLater'))$('#guideCoachLater').onclick=guideMinimize;if($('#guideCoachBubble'))$('#guideCoachBubble').onclick=guideRestore;if($('#guideCoachBackdrop'))$('#guideCoachBackdrop').onclick=()=>guideMinimize();
function guidePromoCandidateHtml(t={}){
  const p=t.promoCandidate||{};if(!p.rowId)return '';
  const price=p.promoPrice>0&&p.originalPrice>0?`${money(p.originalPrice)} → ${money(p.promoPrice)}`:(p.promoPrice>0?money(p.promoPrice):'—');
  return `<small>DECISÃO JÁ CALCULADA PARA ESTA SKU</small><div class="guidePromoDecision"><div class="guidePromoDecisionHead"><div><span>PRÓXIMA OFERTA SEGURA</span><b>${esc(p.name||p.typeLabel||'Oferta do Mercado Livre')}</b></div><strong>${Number(p.projectedMargin||0).toFixed(1).replace('.',',')}% margem</strong></div><div class="guidePromoDecisionMetrics"><div><small>PREÇO</small><b>${esc(price)}</b></div><div><small>DESCONTO</small><b>${Number(p.discountPct||0).toFixed(1).replace('.',',')}%</b></div><div><small>LUCRO PROJETADO</small><b>${money(p.projectedProfit||0)}</b></div></div><p>Não precisa procurar outra SKU nem escolher campanha manualmente. O botão abaixo aplica exatamente esta oferta e valida o resultado no Mercado Livre.</p></div>`;
}
async function dailyResolvePromotionTask(task={}){
  const key=String(task.key||''),itemId=String(task.itemId||task.promoCandidate?.itemId||task.commercialIssue?.itemId||''),rowId=String(task.promoCandidate?.rowId||'');
  if(!itemId){guideShowResult('error','Não consegui identificar a SKU da promoção','O item do Mercado Livre não foi localizado nesta tarefa. Atualize a rotina e tente novamente.');return;}
  try{
    guideShowBusy(`Resolvendo promoção · ${task.sku||task.promoCandidate?.sku||itemId}`,'Atualizando a oferta desta SKU, aplicando somente se continuar segura e validando no Mercado Livre.');
    operationStart('Resolvendo promoção da rotina','Consultando somente esta SKU. O Publisher não aplicará nenhuma oferta que esteja fora da margem configurada.');
    const d=await api('/api/promotions/routine/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({itemId,rowId})});
    promotionState=d.promotions||promotionState;
    if(!d.resolved)throw new Error(d.message||'A promoção não pôde ser resolvida.');
    if(key){dailyOps=await api('/api/daily-ops/task/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});renderDailyOps();}
    const title=d.action==='applied'?'Promoção aplicada e validada':d.action==='already-scheduled'?'Próxima promoção já estava programada':'Nenhuma promoção segura para aplicar';
    operationDone(title,d.message||'Etapa resolvida.');
    guideShowResolvedOutcome({title,detail:d.message||'Etapa resolvida sem exigir outra ação manual.',statusDetail:d.action==='applied'?'Mercado Livre relido após a aplicação.':'Nenhuma ação insegura foi executada.'});
  }catch(e){operationError('Falha ao resolver promoção',e.message);guideShowResult('error','Não consegui resolver esta promoção',e.message);toast(e.message,10000)}
}
window.dailyResolvePromotionTask=dailyResolvePromotionTask;
function guideRenderTask(t,{welcome=false,mode='daily',index=0,total=1,cycle='',product=null}={}){
  if(!guidePopupsEnabled())return;guideResetPlan();guideCoachContext={mode,taskKey:t?.key||'',task:t,productId:product?.id||'',view:t?.view||'',bubble:t?.title||'Há uma próxima ação',status:'ready',statusTitle:'PRONTO',statusDetail:'Aguardando sua ação.'};guideOpenShell({welcome});
  const op=authState.operator||{};$('#guideCoachGreeting').textContent=mode==='daily'?guideGreeting(cycle):`SKU ${product?.sku||''} · fluxo guiado`;$('#guideCoachCycle').textContent=mode==='daily'?`ROTINA ${String(dailyOps?.cycle?.label||cycle||'ATUAL').toUpperCase()}`:'FLUXO DE PUBLICAÇÃO';$('#guideCoachStep').textContent=`Etapa ${Math.min(index+1,total)} de ${Math.max(total,1)}`;$('#guideCoachProgressBar').style.width=`${Math.round(Math.min(index+1,total)/Math.max(total,1)*100)}%`;
  $('#guideCoachTitle').textContent=t?.title||'Próxima ação';$('#guideCoachDetail').textContent=t?.detail||'';$('#guideCoachWhy').textContent=mode==='daily'?guideTaskWhy(t):guideProductWhy(t?.view,product);$('#guideCoachInstruction').textContent=mode==='daily'?guideTaskInstruction(t):guideProductInstruction(t?.view,product);$('#guideCoachOperator').textContent=`Operador: ${op.name||op.username||'—'}`;$('#guideCoachNextHint').textContent=mode==='daily'?'O próximo passo só é liberado depois da validação.':'O sistema acompanhará esta SKU até a publicação.';
  const primary=$('#guideCoachPrimary'),validate=$('#guideCoachValidate'),promoDirect=mode==='daily'&&t?.promoAction==='apply-safe';
  primary.hidden=false;validate.hidden=mode!=='daily'||Boolean(t?.autoComplete)||Boolean(t?.alertId)||promoDirect;primary.textContent=promoDirect?'Aplicar e validar':t?.alertId?'Corrigir agora':mode==='daily'?(t?.cta||'Ir para a etapa'):'Mostrar onde trabalhar';
  primary.onclick=()=>{if(mode==='daily'){if(promoDirect)return dailyResolvePromotionTask(t);if(t?.manualAction==='catalog-product-verification')return dailyCatalogVerify(String(t.itemId||''),encodeURIComponent(t?.key||''));if(t?.alertId)return dailyFixAlert(encodeURIComponent(t.alertId),encodeURIComponent(t.key));return dailyOpenTask(t?.view||'dashboard',encodeURIComponent(t?.key||''));}if(product){setWorkflowFocus(product.id,t?.view||'products',t?.title||'Próxima etapa');nav(t?.view||'products');setTimeout(()=>guideHighlightViewTarget(t?.view||'products',product),220)}};
  validate.onclick=()=>dailyCompleteTask(encodeURIComponent(t?.key||''));
  if(promoDirect){const box=$('#guideCoachPlan');box.hidden=false;box.innerHTML=guidePromoCandidateHtml(t);$('#guideCoachNextHint').textContent='Depois da validação, esta SKU sai da etapa e a próxima ação aparece automaticamente.';guideSetStatus('ready','DECISÃO PRONTA','A próxima promoção segura desta mesma SKU já foi calculada.');}
  else guideSetStatus('ready','PRONTO',welcome?'A rotina foi preparada. Comece por esta etapa.':'Execute a orientação abaixo e depois valide a conclusão.');
  guideRecord(mode==='daily'?'daily-guide-open':'product-guide-open',{taskKey:t?.key||'',view:t?.view||'',sku:t?.sku||product?.sku||''});
}
function guideAllClearHtml(){
  const sum=dailyOps.summary||{},bg=lastDailyBackgroundState||{},inventory=Number(sum.inventoryCount||sum.monitored||0),adsAlerts=Number(sum.adsProblemCount||0),adsActive=Number(sum.adsActive||0),commercial=Number(sum.commercialCorrections||0),quality=Number(sum.qualityBelow||0),errors=Number(bg.errors||0),net=Number(sum.net||0);
  const adsText=adsAlerts?`${adsAlerts} alerta(s) de ADS detectado(s) e colocado(s) na fila automaticamente`:`${adsActive} anúncio(s) com ADS ativo · nenhum alerta de desperdício/ROAS/margem pendente`;
  const resultText=net<0?`Resultado após ADS está negativo em ${money(net)}.`:`Resultado após ADS: ${money(net)}.`;
  return `<small>RESUMO AUTOMÁTICO DA VARREDURA</small><div class="guidePlanSteps"><div class="guidePlanStep guideExecutionDone"><i>✓</i><div><b>Conta conferida</b><p>${inventory} anúncio(s) na conta.</p></div></div><div class="guidePlanStep ${adsAlerts?'':'guideExecutionDone'}"><i>${adsAlerts?'!':'✓'}</i><div><b>ADS</b><p>${esc(adsText)}</p></div></div><div class="guidePlanStep ${net<0?'guideExecutionFail':'guideExecutionDone'}"><i>${net<0?'!':'✓'}</i><div><b>Resultado financeiro</b><p>${esc(resultText)}</p></div></div><div class="guidePlanStep ${commercial?'':'guideExecutionDone'}"><i>${commercial?'!':'✓'}</i><div><b>Preço, promoções e margem</b><p>${commercial?`${commercial} correção(ões) comercial(is) ainda identificada(s).`:'Sem correção comercial pendente na fila.'}</p></div></div><div class="guidePlanStep ${quality?'':'guideExecutionDone'}"><i>${quality?'!':'✓'}</i><div><b>Qualidade</b><p>${quality?`${quality} anúncio(s) ainda com ação de qualidade identificada.`:'Nenhuma correção de qualidade pendente na fila.'}</p></div></div>${errors?`<div class="guidePlanStep guideExecutionFail"><i>!</i><div><b>Consultas que precisam repetir</b><p>${errors} falha(s) de consulta na auditoria de fundo.</p></div></div>`:''}</div>`;
}
function guideShowDailyTask({welcome=false}={}){
  if(!guidePopupsEnabled())return;
  const tasks=dailyOps.tasks||[],key=dailyOps.nextTaskKey||'',idx=tasks.findIndex(t=>String(t.key)===String(key));
  if(idx<0&&lastDailyBackgroundState?.running){guideShowBackgroundProgress(lastDailyBackgroundState,{welcome});return;}
  if(idx<0){
    guideCoachContext={mode:'daily',bubble:'Rotina em dia',status:'done',statusTitle:'ROTINA CONCLUÍDA',statusDetail:'Nenhuma ação obrigatória pendente agora.'};guideOpenShell({welcome});guideConversationSections({why:false,instruction:false,label:'Resultado da rotina'});
    $('#guideCoachGreeting').textContent=guideGreeting(dailyOps?.cycle?.cycle);$('#guideCoachCycle').textContent='ROTINA EM DIA';$('#guideCoachStep').textContent='100% conferido';$('#guideCoachProgressBar').style.width='100%';
    $('#guideCoachTitle').textContent='Varredura concluída · nenhuma ação obrigatória pendente';$('#guideCoachDetail').textContent='O sistema terminou as conferências disponíveis e não encontrou outra correção que dependa de você neste momento.';
    const box=$('#guideCoachPlan');box.hidden=false;box.innerHTML=guideAllClearHtml();
    $('#guideCoachPrimary').hidden=false;$('#guideCoachPrimary').textContent='Rever conta agora';$('#guideCoachPrimary').onclick=()=>runDailyCycle({automatic:false,welcome:false});$('#guideCoachValidate').hidden=true;
    $('#guideCoachNextHint').textContent='Se surgir nova pendência, ela entra automaticamente na fila.';guideSetStatus('done','ROTINA CONCLUÍDA','Tudo que está disponível para conferência foi processado.');return;
  }
  guideRenderTask(tasks[idx],{welcome,mode:'daily',index:idx,total:tasks.length,cycle:dailyOps.cycle?.cycle||''});
}
async function guideAdvanceAfterResolution(){
  try{
    guideSetStatus('busy','ORGANIZANDO PRÓXIMA AÇÃO','Atualizando a fila com o resultado que acabou de ser validado.');
    await loadDailyOps();
    let st={};try{st=await api('/api/daily-ops/run-status');renderDailyBackground(st.background||{})}catch(_){}
    if(dailyOps.nextTaskKey){guideShowDailyTask({welcome:false});return;}
    if(st.background?.running){guideShowBackgroundProgress(st.background,{welcome:false});pollDailyBackground();return;}
    guideShowDailyTask({welcome:false});
  }catch(e){guideShowResult('error','Não consegui atualizar a próxima ação',e.message)}
}
function guideShowResolvedOutcome({title='Correção concluída',detail='',filled=[],score=null,statusDetail='Validado no Mercado Livre.'}={}){
  if(!guidePopupsEnabled())return;
  guideCoachContext={...(guideCoachContext||{}),mode:'resolved',bubble:'Correção concluída',status:'done',statusTitle:'CONCLUÍDO',statusDetail};guideResetPlan();guideOpenShell({welcome:false});guideConversationSections({why:false,instruction:false,label:'Resultado'});
  $('#guideCoachCycle').textContent='RESULTADO DA CORREÇÃO';$('#guideCoachStep').textContent='Resolvido';$('#guideCoachTitle').textContent=title;$('#guideCoachDetail').textContent=detail||statusDetail;
  const box=$('#guideCoachPlan');box.hidden=false;box.innerHTML=`<small>RESULTADO VALIDADO</small>${guideFilledFieldRows(filled)}<div class="guidePlanSteps"><div class="guidePlanStep guideExecutionDone"><i>✓</i><div><b>Resolvido</b><p>${esc(detail||statusDetail)}</p>${score!=null?`<em>Qualidade atual no Mercado Livre: ${Math.round(Number(score))}/100</em>`:''}</div></div></div>`;
  $('#guideCoachPrimary').hidden=false;$('#guideCoachPrimary').textContent='Continuar para próxima ação';$('#guideCoachPrimary').onclick=guideAdvanceAfterResolution;$('#guideCoachValidate').hidden=true;$('#guideCoachNextHint').textContent='Ao continuar, a fila é atualizada e o próximo item aparece automaticamente.';guideSetStatus('done','CONCLUÍDO',statusDetail);
}
function guideShowBusy(title,detail='Executando. Aguarde...'){if(!guidePopupsEnabled())return;guideResetPlan();guideOpenShell({welcome:false});$('#guideCoachTitle').textContent=title;$('#guideCoachDetail').textContent=detail;$('#guideCoachWhy').textContent='O sistema está processando dados e não precisa de outra ação do operador neste momento.';$('#guideCoachInstruction').textContent='Aguarde a validação terminar. O próximo passo aparecerá automaticamente.';$('#guideCoachPrimary').hidden=true;$('#guideCoachValidate').hidden=true;guideSetStatus('busy','EXECUTANDO · AGUARDE',detail)}
function guideShowResult(state,title,detail){
  if(!guidePopupsEnabled())return;guideOpenShell({welcome:false});$('#guideCoachTitle').textContent=title;$('#guideCoachDetail').textContent=detail||'';$('#guideCoachPrimary').hidden=false;$('#guideCoachValidate').hidden=true;
  if(state==='done'){guideConversationSections({why:false,instruction:false,label:'Resultado'});$('#guideCoachPrimary').textContent='Continuar para próxima ação';$('#guideCoachPrimary').onclick=guideAdvanceAfterResolution;guideSetStatus('done','CONCLUÍDO',detail||'Concluído.');}
  else{$('#guideCoachPrimary').textContent='Ver próxima ação';$('#guideCoachPrimary').onclick=()=>guideShowDailyTask();guideSetStatus(state,'ERRO',detail||'');}
}
function guideOperationalPlan(stage='',percent=0){
  const value=String(stage||'').toLowerCase(),p=Number(percent||0);
  const steps=[
    ['1','Conta e estoque','Ler todos os anúncios diretamente no Mercado Livre'],
    ['2','ADS','Conferir campanhas, desempenho e pontos de atenção'],
    ['3','Promoções e preço','Conferir promoção ativa, desconto, preço e margem'],
    ['4','Qualidade','Conferir título, fotos, vídeo e características'],
    ['5','Fechamento','Organizar a próxima ação e o resultado da operação']
  ];
  let current=0;
  if(value.includes('ads'))current=1;else if(value.includes('preço')||value.includes('promo')||value.includes('desconto'))current=2;else if(value.includes('qualidade'))current=3;else if(value.includes('resultado')||value.includes('catálogo')||value.includes('conclu')||p>=90)current=4;
  return `<small>ORDEM DA CONFERÊNCIA</small><div class="guideOpsPlan">${steps.map((x,i)=>`<div class="guideOpsPlanRow ${i<current?'done':i===current?'current':'waiting'}"><i>${i<current?'✓':x[0]}</i><div><b>${esc(x[1])}</b><small>${esc(x[2])}</small></div></div>`).join('')}</div>`;
}
function guideShowScanProgress(st={}, {welcome=false}={}){
  if(!guidePopupsEnabled())return;
  const pct=Math.max(1,Math.min(100,Number(st.percent||1))),stage=st.stage||'Conta e estoque';
  guideCoachContext={mode:'scan',bubble:`Verificando: ${stage}`,status:'busy',statusTitle:'VERIFICANDO CONTA',statusDetail:st.message||'Lendo o Mercado Livre diretamente.'};
  guideOpenShell({welcome});
  $('#guideCoachGreeting').textContent=guideGreeting();$('#guideCoachCycle').textContent='ABERTURA DA OPERAÇÃO';$('#guideCoachStep').textContent=`${pct}% concluído`;$('#guideCoachProgressBar').style.width=`${pct}%`;
  $('#guideCoachTitle').textContent=`Agora: ${stage}`;$('#guideCoachDetail').textContent=st.message||'Estou lendo sua conta diretamente no Mercado Livre para organizar a primeira ação.';
  $('#guideCoachWhy').textContent='A planilha local não limita esta conferência. Entram anúncios antigos, novos e SKUs publicadas diretamente pelo WeDrop ou pelo Mercado Livre.';
  $('#guideCoachInstruction').textContent='Você não precisa procurar nada agora. Assim que eu encontrar a primeira ação necessária, vou mostrar o que fazer e pedir sua confirmação antes de qualquer alteração remota.';
  const box=$('#guideCoachPlan');box.hidden=false;box.innerHTML=guideOperationalPlan(stage,pct);
  const primary=$('#guideCoachPrimary');primary.hidden=false;primary.textContent='Minimizar e continuar trabalhando';primary.onclick=guideMinimize;$('#guideCoachValidate').hidden=true;
  $('#guideCoachOperator').textContent=`Operador: ${authState.operator?.name||authState.operator?.username||'—'}`;$('#guideCoachNextHint').textContent='Depois: ADS → promoções/preço → qualidade → fechamento.';
  guideSetStatus('busy','VERIFICANDO CONTA',st.message||'Lendo o Mercado Livre diretamente.');
}
function guideShowBackgroundProgress(bg={}, {welcome=false}={}){
  if(!guidePopupsEnabled()||!bg?.running)return;
  const pct=Math.max(1,Math.min(99,Number(bg.percent||1))),stage=bg.stage||'Auditoria da conta',done=Number(bg.done||0),total=Number(bg.total||0);
  guideCoachContext={mode:'background',bubble:`${stage}${total?` · ${done}/${total}`:''}`,status:'busy',statusTitle:'CONFERINDO EM SEGUNDO PLANO',statusDetail:bg.message||''};guideOpenShell({welcome});
  $('#guideCoachGreeting').textContent=guideGreeting();$('#guideCoachCycle').textContent='AUDITORIA DA CONTA';$('#guideCoachStep').textContent=total?`${done}/${total} anúncios`:`${pct}%`;$('#guideCoachProgressBar').style.width=`${pct}%`;
  $('#guideCoachTitle').textContent=`Agora: ${stage}`;$('#guideCoachDetail').textContent=bg.message||'Continuo conferindo a conta enquanto você trabalha.';
  $('#guideCoachWhy').textContent='As ações já encontradas são liberadas imediatamente; você não precisa esperar o restante da conta terminar.';
  $('#guideCoachInstruction').textContent=`Até agora: ${Number(bg.issues||0)} ponto(s) para atenção e ${Number(bg.errors||0)} falha(s) de consulta. Quando houver uma ação para você, ela será mostrada separadamente.`;
  const box=$('#guideCoachPlan');box.hidden=false;box.innerHTML=guideOperationalPlan(stage,pct);
  const primary=$('#guideCoachPrimary');primary.hidden=false;primary.textContent='Minimizar e continuar trabalhando';primary.onclick=guideMinimize;$('#guideCoachValidate').hidden=true;
  $('#guideCoachOperator').textContent=`Operador: ${authState.operator?.name||authState.operator?.username||'—'}`;$('#guideCoachNextHint').textContent='A auditoria não bloqueia seu trabalho.';guideSetStatus('busy','CONFERINDO EM SEGUNDO PLANO',bg.message||'');
}
function guideResetPlan(){const el=$('#guideCoachPlan');if(el){el.hidden=true;el.innerHTML=''}}
function correctionPlanHtml(plan={}){const b=plan.before||{},pairs=[['Status',b.status],['Estoque ML',b.stock!=null?`${b.stock} un.`:'—'],['Estoque esperado',b.stockExpected!=null?`${b.stockExpected} un.`:'—'],['Fonte estoque',b.stockSource],['Preço',b.price!=null?money(b.price):'—'],['Qualidade',b.quality!=null?`${Math.round(Number(b.quality))}%`:'—']].filter(x=>x[1]!==undefined&&x[1]!==null&&x[1]!==''&&x[1]!=='—');return `<small>CORREÇÕES QUE SERÃO EXECUTADAS</small>${pairs.length?`<div class="guidePlanBefore">${pairs.map(x=>`<span><b>${esc(x[0])}:</b> ${esc(x[1])}</span>`).join('')}</div>`:''}<div class="guidePlanSteps">${(plan.actions||[]).map((a,i)=>`<div class="guidePlanStep"><i>${i+1}</i><div><b>${esc(a.step||`Etapa ${i+1}`)}</b><p>${esc(a.detail||'')}</p>${a.verify?`<em>Como conferir: ${esc(a.verify)}</em>`:''}</div></div>`).join('')}</div>`}
function guideShowCorrectionPlan(plan,onExecute){if(!guidePopupsEnabled()){if(confirm((plan.actions||[]).map(a=>`${a.step}: ${a.detail}`).join('\n\n')))onExecute?.();return;}guideCoachContext={...(guideCoachContext||{}),mode:'correction-plan',bubble:`Correções da SKU ${plan.sku||''}`};guideOpenShell({welcome:false});$('#guideCoachTitle').textContent=`Antes de corrigir · ${plan.sku||plan.itemId||'SKU'}`;$('#guideCoachDetail').textContent=plan.diagnosis||'O sistema encontrou uma pendência e preparou as ações abaixo.';$('#guideCoachWhy').textContent='Você verá exatamente o que o Publisher pretende alterar e como cada etapa será conferida depois.';$('#guideCoachInstruction').textContent='Revise o plano abaixo. Nada será alterado até você clicar em “Executar estas correções”.';const box=$('#guideCoachPlan');box.hidden=false;box.innerHTML=correctionPlanHtml(plan);const primary=$('#guideCoachPrimary');primary.hidden=false;primary.textContent='Executar estas correções';primary.onclick=()=>onExecute?.();$('#guideCoachValidate').hidden=true;guideSetStatus('ready','PLANO PRONTO',`${(plan.actions||[]).length} ação(ões) preparada(s). Nenhuma alteração executada ainda.`)}
function guideManualFieldControl(x={}){
  const id=String(x.id||''),name=x.name||id||'Campo técnico',current=String(x.currentValue||'').trim(),suggestion=String(x?.supplierAssist?.found?x.supplierAssist.value:'').trim(),seed=current||suggestion,values=Array.isArray(x.values)?x.values.filter(v=>String(v?.name||'').trim()):[];
  if(values.length){
    const hasSeed=seed&&values.some(v=>String(v.name||'').trim()===seed);
    return `<select class="guideManualAttrInput" data-manual-attr-id="${esc(id)}" data-manual-attr-name="${esc(name)}"><option value="">Selecione o valor correto</option>${hasSeed?'':seed?`<option value="${esc(seed)}" selected>${esc(seed)}${suggestion&&!current?' · WeDrop':''}</option>`:''}${values.map(v=>`<option value="${esc(v.name)}" ${String(v.name||'').trim()===seed?'selected':''}>${esc(v.name)}</option>`).join('')}</select>`;
  }
  return `<input class="guideManualAttrInput" data-manual-attr-id="${esc(id)}" data-manual-attr-name="${esc(name)}" value="${esc(seed)}" placeholder="Digite somente o valor">`;
}
function guideMissingFieldRows(verification={}){
  const exact=Array.isArray(verification.missing)?verification.missing:[],manual=Array.isArray(verification.manualFields)?verification.manualFields:[],missing=exact.length?exact:manual;
  if(!missing.length){
    const open=verification.editUrl?`<a class="btn ghost mini guideOpenMl" href="${esc(verification.editUrl)}" target="_blank" rel="noopener">Abrir este anúncio no Mercado Livre</a>`:'';
    return `<div class="guideMissingEmpty"><b>O Mercado Livre não informou qual campo está pendente.</b><span>Não vou inventar um dado. Abra a própria SKU, veja o nome do campo e volte para preencher.</span>${open}</div>`;
  }
  const mode=verification.manualFieldMode||missing[0]?.manualFieldMode||'exact';
  const intro=mode==='candidate'?'O Mercado Livre informou apenas “CARACTERÍSTICAS”. O Publisher já cruzou a ficha oficial com o catálogo WeDrop e mostra abaixo somente o próximo campo provável.':mode==='required'?'O Mercado Livre confirmou que estes campos ainda estão vazios. O Publisher consultou a WeDrop antes de pedir qualquer informação manual.':'Este é o campo apontado pelo Mercado Livre. O Publisher consultou primeiro o catálogo WeDrop.';
  const cards=missing.map((x,idx)=>{
    const name=x.name||x.id||'Campo técnico',current=String(x.currentValue||'').trim(),id=String(x.id||''),units=[x.default_unit,...(Array.isArray(x.allowed_units)?x.allowed_units:[])].filter(Boolean),unitText=[...new Set(units)].slice(0,6).join(', '),assist=x.supplierAssist||{},supplierFound=assist.found&&assist.value,source=x.source==='catalog_quality'?'Mercado Livre · qualidade':x.source==='performance'?'Mercado Livre · performance':x.source==='performance_fallback'?'Ficha oficial da categoria':'Ficha técnica oficial';
    const supplierBox=supplierFound
      ?`<div class="guideSupplierHit"><span>✓ ENCONTRADO NA WEDROP</span><b>${esc(assist.value)}</b><small>${esc(assist.source||'Catálogo WeDrop')}${assist.matchedColumn?` · coluna ${esc(assist.matchedColumn)}`:''}</small></div>`
      :`<div class="guideSupplierMiss"><span>WEDROP CONSULTADA</span><b>Este dado não foi encontrado com segurança</b><small>${esc(assist.note||'O Publisher não vai usar outro campo parecido nem inventar um valor.')}</small></div>`;
    return `<div class="guideFieldCard ${supplierFound?'hasSupplier':'needsManual'}"><div class="guideFieldCardHead"><div><small>${missing.length>1?`CAMPO ${idx+1} DE ${missing.length}`:'CAMPO A PREENCHER'}</small><b>${esc(name)}</b></div><span class="guideFieldState ${supplierFound?'auto':'manual'}">${supplierFound?'WeDrop encontrada':'Precisa confirmar'}</span></div>${supplierBox}<label class="guideManualAttrLabel"><span>Valor que será enviado ao Mercado Livre</span>${guideManualFieldControl(x)}</label>${unitText?`<div class="guideUnitHint">Formato aceito: <b>${esc(unitText)}</b></div>`:''}<details class="guideFieldTech"><summary>Ver detalhes técnicos</summary><div><span>ID Mercado Livre</span><b>${esc(id)}</b></div><div><span>Origem da pendência</span><b>${esc(source)}</b></div>${current?`<div><span>Valor atual</span><b>${esc(current)}</b></div>`:''}${x.section?`<div><span>Seção</span><b>${esc(x.section)}</b></div>`:''}</details></div>`;
  }).join('');
  return `<div class="guideMissingFields"><div class="guideFieldIntro"><div><small>O QUE REALMENTE FALTA</small><b>${missing.length===1?'1 campo pendente':`${missing.length} campos pendentes`}</b><span>${esc(intro)}</span></div>${verification.editUrl?`<a class="btn ghost mini guideOpenMl" href="${esc(verification.editUrl)}" target="_blank" rel="noopener">Abrir esta SKU no ML</a>`:''}</div>${cards}</div>`;
}
window.guideSetManualAttr=(encodedId,value)=>{const id=decodeURIComponent(encodedId||'');const input=[...document.querySelectorAll('.guideManualAttrInput')].find(x=>String(x.dataset.manualAttrId||'')===id);if(input){input.value=value;input.focus()}};
function guideManualValues(){const out={};document.querySelectorAll('.guideManualAttrInput').forEach(input=>{const id=String(input.dataset.manualAttrId||'').trim(),value=String(input.value||'').trim();if(id&&value)out[id]=value});return out}

function guideFilledFieldRows(rows=[]){
  if(!Array.isArray(rows)||!rows.length)return '';
  return `<div class="guideEvidenceFilled"><small>O QUE CONSEGUI PREENCHER</small>${rows.map(x=>`<div><b>${esc(x.name||x.id||'Campo')}</b><span>${esc(x.value||'')}</span>${x.source?`<em>${esc(x.source)}</em>`:''}</div>`).join('')}</div>`;
}
let guideOcrWorkerPromise=null,guideOcrCleanupTimer=null;
function guideOcrProgress(m={}){
  const pct=Math.max(0,Math.min(100,Math.round(Number(m.progress||0)*100))),status=String(m.status||'').replace(/_/g,' ');
  const detail=status?`${status}${pct?` · ${pct}%`:''}`:`OCR local${pct?` · ${pct}%`:''}`;
  guideSetStatus('busy','LENDO PRINT LOCALMENTE',detail);
}
async function guideGetOcrWorker(){
  if(!guideOcrWorkerPromise){
    guideOcrWorkerPromise=(async()=>{
      const response=await fetch('/health/ocr',{cache:'no-store'});
      const type=response.headers.get('content-type')||'';
      if(!type.includes('application/json'))throw new Error('O servidor ainda não disponibiliza o diagnóstico OCR da V1.8.76. Aguarde o deploy terminar e recarregue a página.');
      const health=await response.json();
      if(!response.ok||!health.ready)throw new Error(`A instalação do OCR está incompleta: ${(health.issues||[]).join(' · ')||'arquivos indisponíveis'}. Confira o log do deploy.`);
      if(!window.Tesseract?.createWorker)throw new Error('O script do leitor OCR não carregou. Recarregue a página após o deploy da V1.8.76.');
      return window.Tesseract.createWorker(['por','eng'],1,{
        workerPath:health.paths.worker,
        corePath:health.paths.core,
        langPath:health.paths.languages,
        workerBlobURL:false,
        logger:guideOcrProgress,
        errorHandler:e=>console.warn('[OCR]',e)
      });
    })().catch(e=>{guideOcrWorkerPromise=null;throw e});
  }
  return guideOcrWorkerPromise;
}
function guideScheduleOcrCleanup(){
  clearTimeout(guideOcrCleanupTimer);guideOcrCleanupTimer=setTimeout(async()=>{const p=guideOcrWorkerPromise;guideOcrWorkerPromise=null;if(!p)return;try{const w=await p;await w.terminate()}catch(_){}},180000);
}
async function guideReadPrintLocal(file){
  if(!file)return '';
  clearTimeout(guideOcrCleanupTimer);
  guideSetStatus('busy','LENDO PRINT LOCALMENTE','Preparando OCR no seu navegador. O print não será enviado para a OpenAI.');
  const worker=await guideGetOcrWorker();
  try{
    const out=await worker.recognize(file,{rotateAuto:true});
    const text=String(out?.data?.text||'').replace(/\r/g,'').trim();
    if(!text)throw new Error('O OCR não encontrou texto legível no print. Tente um recorte mais nítido ou cole as especificações em texto.');
    guideScheduleOcrCleanup();
    return text;
  }catch(e){guideScheduleOcrCleanup();throw e}
}
let guideEvidencePastedFile=null,guideEvidenceSubmitting=false;
function guideEvidenceSetFile(file){
  if(!file||!String(file.type||'').startsWith('image/'))return false;
  guideEvidencePastedFile=file;
  const input=$('#guideAttributeEvidenceFile');
  if(input){try{const dt=new DataTransfer();dt.items.add(file);input.files=dt.files}catch(_){} }
  const label=$('#guideEvidenceFileName');if(label)label.textContent=`Print selecionado: ${file.name||'imagem colada'}`;
  const zone=$('#guideEvidencePasteZone');if(zone)zone.classList.add('hasFile');
  return true;
}
function bindGuideEvidenceInput(){
  const zone=$('#guideEvidencePasteZone'),input=$('#guideAttributeEvidenceFile'),text=$('#guideAttributeEvidenceText');
  if(!zone)return;
  guideEvidencePastedFile=null;
  const handlePaste=e=>{const items=[...(e.clipboardData?.items||[])],img=items.find(x=>x.kind==='file'&&String(x.type||'').startsWith('image/'));if(!img)return;const file=img.getAsFile();if(file&&guideEvidenceSetFile(file)){e.preventDefault();toast('Print colado. Clique em “Extrair, preencher e conferir”.',4000)}};
  zone.addEventListener('paste',handlePaste);text?.addEventListener('paste',handlePaste);
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drag')});zone.addEventListener('dragleave',()=>zone.classList.remove('drag'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drag');const file=[...(e.dataTransfer?.files||[])].find(x=>String(x.type||'').startsWith('image/'));if(file)guideEvidenceSetFile(file)});
  input?.addEventListener('change',()=>{const file=input.files?.[0];if(file)guideEvidenceSetFile(file)});
}
function guideAttributeEvidenceHtml(alertId,key,verification={},filled=[]){
  const fields=(Array.isArray(verification.missing)&&verification.missing.length)?verification.missing:(Array.isArray(verification.manualFields)?verification.manualFields:[]),hasFields=fields.length>0;
  const supplierCount=fields.filter(x=>x?.supplierAssist?.found).length;
  const headline=hasFields?(supplierCount?`${supplierCount} dado(s) já localizado(s) na WeDrop`:'Preciso de uma informação que não está segura no catálogo'):'Preciso identificar qual característica o Mercado Livre está exigindo';
  return `<div class="guideEvidenceBox" data-evidence-form="1"><div class="guideEvidenceHeader"><small>FICHA TÉCNICA</small><b>${esc(headline)}</b><span>${supplierCount?'O valor localizado já está pré-preenchido. Confira e salve; o Publisher valida no Mercado Livre.':'A tela mostra somente o que falta. Nada de procurar em várias telas.'}</span></div>${guideMissingFieldRows(verification)}${guideFilledFieldRows(filled)}<button class="btn primary guideEvidenceExecute" type="button" onclick="submitGuideAttributeEvidence('${encodeURIComponent(alertId)}','${encodeURIComponent(key)}')">${supplierCount?'Confirmar valor e validar no Mercado Livre':'Salvar e validar no Mercado Livre'}</button><details class="guideEvidenceAdvanced"><summary>Não encontrou o valor? Usar print ou texto como apoio</summary><div class="guideEvidenceAdvancedBody"><p>Use somente se o dado realmente não estiver no catálogo WeDrop. O OCR é local e serve para ajudar a identificar o valor.</p><div id="guideEvidencePasteZone" class="guideEvidencePasteZone" tabindex="0"><strong>Cole um print com Ctrl+V</strong><span>ou arraste a imagem para esta área</span><label class="guideEvidenceFile"><input id="guideAttributeEvidenceFile" type="file" accept="image/png,image/jpeg,image/webp"><span>Selecionar print</span></label><em id="guideEvidenceFileName">Nenhum print selecionado</em></div><textarea id="guideAttributeEvidenceText" class="guideEvidenceText" placeholder="Cole aqui a especificação, por exemplo: Altura: 35 cm"></textarea><label class="guideEvidenceSource"><span>Fonte da informação</span><select id="guideAttributeEvidenceSource"><option value="wedrop">WeDrop</option><option value="fabricante">Fabricante</option><option value="mercado_livre">Mercado Livre</option><option value="operador">Informado manualmente</option></select></label></div></details></div>`;
}
function guideShowExecution(plan,d,{alertId='',key=''}={}){
  if(!guidePopupsEnabled())return;
  const verification=d.details?.attributeVerification||{},missing=Array.isArray(verification.missing)?verification.missing:[],applied=d.details?.legacyAttributeRepair?.attributes||d.details?.attributeRepair?.attributes||d.details?.attributes||[];
  if(d.resolved){
    guideShowResolvedOutcome({title:'Correção executada e conferida',detail:d.message||'A correção foi validada e saiu da fila.',filled:applied,score:verification.scoreAfter,statusDetail:'Resultado validado no Mercado Livre.'});
    return;
  }
  guideOpenShell({welcome:false});
  const needsEvidence=Boolean(verification&&verification.complete===false&&(missing.length||d.details?.evidenceRequest?.required)),attributeDone=Boolean(d.details?.attributeResolved);
  $('#guideCoach')?.classList.toggle('evidenceMode',needsEvidence);
  $('#guideCoachTitle').textContent=needsEvidence?'Só falta confirmar este dado':attributeDone?'Características concluídas · próxima causa encontrada':'Correção executada · ainda há pendência';
  $('#guideCoachDetail').textContent=d.message||'';
  $('#guideCoachWhy').textContent=needsEvidence?'Ainda falta uma informação factual para concluir esta correção.':attributeDone?'A etapa de CARACTERÍSTICAS já foi encerrada. Se houver outra causa de qualidade, ela será tratada como uma nova ação; a correção concluída não volta para a fila.':'A correção ainda depende de uma validação específica antes de sair da fila.';
  $('#guideCoachInstruction').textContent=needsEvidence?'Preencha diretamente o campo mostrado abaixo. Print/texto fica apenas como apoio; depois o Publisher salva e valida novamente no Mercado Livre.':attributeDone?'Clique em “Atualizar e ver próxima ação”. O Publisher já atualizou esta SKU e mostrará somente a próxima causa real ou seguirá para a próxima SKU.':'Siga somente a pendência indicada abaixo. O sistema não marcará como concluído enquanto faltar validação.';
  const rows=d.details?.execution||[],box=$('#guideCoachPlan');box.hidden=false;
  box.innerHTML=`<small>RESULTADO DA EXECUÇÃO</small><div class="guidePlanSteps">${rows.length?rows.map((x,i)=>`<div class="guidePlanStep ${String(x.status).includes('FEITO')?'guideExecutionDone':String(x.status).includes('FALH')?'guideExecutionFail':''}"><i>${i+1}</i><div><b>${esc(x.step||'Correção')} · ${esc(x.status||'')}</b><p>${esc(x.detail||'')}</p></div></div>`).join(''):`<div class="guidePlanStep"><i>!</i><div><b>Processado</b><p>${esc(d.message||'Ação processada.')}</p></div></div>`}</div>${guideFilledFieldRows(applied)}${needsEvidence?guideAttributeEvidenceHtml(alertId,key,verification,applied):missing.length?`<div class="guideEvidenceBox"><small>CAMPOS QUE AINDA FALTAM</small>${guideMissingFieldRows(verification)}</div>`:''}`;
  $('#guideCoachPrimary').hidden=needsEvidence;$('#guideCoachPrimary').textContent='Atualizar e ver próxima ação';$('#guideCoachPrimary').onclick=guideAdvanceAfterResolution;$('#guideCoachValidate').hidden=true;
  guideSetStatus('ready',needsEvidence?'PRECISO DE UMA INFORMAÇÃO':attributeDone?'CARACTERÍSTICAS CONCLUÍDAS':'REVISÃO NECESSÁRIA',d.message||'');
  if(needsEvidence)setTimeout(bindGuideEvidenceInput,0);
}
function guideOfferAttributeEvidence(alertId,key,verification={},filled=[]){
  if(!guidePopupsEnabled())return;guideOpenShell({welcome:false});$('#guideCoach')?.classList.add('evidenceMode');const box=$('#guideCoachPlan');box.hidden=false;
  box.querySelectorAll('[data-evidence-form="1"]').forEach(x=>x.remove());box.insertAdjacentHTML('beforeend',guideAttributeEvidenceHtml(alertId,key,verification,filled));
  $('#guideCoachTitle').textContent='Só falta confirmar este dado';$('#guideCoachInstruction').textContent='O Publisher consultou primeiro a WeDrop. Se encontrou o valor, ele já aparece preenchido abaixo; caso contrário, informe somente o dado que falta.';
  $('#guideCoachPrimary').hidden=true;$('#guideCoachValidate').hidden=true;guideSetStatus('ready','PRECISO DE UMA INFORMAÇÃO','A ficha técnica ainda não está completa.');setTimeout(bindGuideEvidenceInput,0);
}
window.submitGuideAttributeEvidence=async(encodedAlert,encodedKey)=>{
  if(guideEvidenceSubmitting)return;
  const alertId=decodeURIComponent(encodedAlert||''),key=decodeURIComponent(encodedKey||''),input=$('#guideAttributeEvidenceFile'),file=input?.files?.[0]||guideEvidencePastedFile,typedText=$('#guideAttributeEvidenceText')?.value||'',manualValues=guideManualValues(),evidenceSource=$('#guideAttributeEvidenceSource')?.value||'operador';
  if(!file&&!typedText.trim()&&!Object.keys(manualValues).length)return toast('Digite o valor do campo pendente, cole um print com Ctrl+V ou cole a informação do produto.',7000);
  guideEvidenceSubmitting=true;
  let stage=file?'ocr':'apply';
  try{
    let ocrText='';
    if(file){
      ocrText=await guideReadPrintLocal(file);
      const preview=ocrText.length>500?`${ocrText.slice(0,500)}…`:ocrText;
      const box=$('#guideCoachPlan');if(box){const old=box.querySelector('[data-ocr-preview="1"]');old?.remove();box.insertAdjacentHTML('beforeend',`<div class="guideEvidenceFilled" data-ocr-preview="1"><small>TEXTO LIDO LOCALMENTE DO PRINT</small><div><span>${esc(preview)}</span><em>OCR local · sem OpenAI API</em></div></div>`)}
    }
    const combined=[typedText.trim(),ocrText.trim(),...Object.entries(manualValues).map(([id,value])=>`${id}: ${value}`)].filter(Boolean).join('\n');
    if(!combined)throw new Error('Não encontrei informação utilizável. Digite o valor do campo, tente outro print ou cole as especificações em texto.');
    stage='apply';
    guideSetStatus('busy','PREENCHENDO E VALIDANDO','Salvando o campo e relendo a ficha técnica diretamente no Mercado Livre.');
    const fd=new FormData();fd.append('alertId',alertId);fd.append('text',typedText);fd.append('ocrText',ocrText);fd.append('manualValues',JSON.stringify(manualValues));fd.append('evidenceSource',evidenceSource);fd.append('extractionMode',file?'local_ocr':'manual_or_text');
    const d=await api('/api/monitoring/quality/attribute-evidence',{method:'POST',body:fd});const v=d.verification||{},filled=d.filled||d.attributes||[];
    if(d.attributeResolved){
      await loadDailyOps();renderDailyOps();
      guideShowResolvedOutcome({title:'Características preenchidas e validadas',detail:'O campo informado foi salvo e confirmado no Mercado Livre. Esta correção saiu da fila.',filled,statusDetail:'Campo salvo e ficha técnica relida com sucesso.'});
      return;
    }
    const box=$('#guideCoachPlan');if(box)box.innerHTML=`<small>RESULTADO DA CORREÇÃO</small>${guideFilledFieldRows(filled)}<div class="guidePlanSteps"><div class="guidePlanStep ${v.complete?'guideExecutionDone':''}"><i>${v.complete?'✓':'!'}</i><div><b>${v.complete?'Ficha técnica preenchida':'Ainda faltam dados'}</b><p>${esc(d.message||'')}</p>${d.ocr?.matched?.length?`<em>Leitura reconheceu ${d.ocr.matched.length} campo(s) com correspondência segura.</em>`:''}${v.scoreAfter!=null?`<em>Qualidade Mercado Livre: ${Math.round(Number(v.scoreAfter))}/100</em>`:''}</div></div></div>`;
    if(d.needsEvidence||v.missing?.length||v.performanceAttributesPending){guideSetStatus('ready','AINDA FALTA DADO',d.message||'Ainda existem campos pendentes.');guideOfferAttributeEvidence(alertId,key,v,filled);return;}
    guideConversationSections({why:false,instruction:false,label:'Resultado'});
    guideSetStatus('ready','AGUARDANDO RECÁLCULO',d.message||'O campo foi salvo; o Mercado Livre ainda está recalculando a qualidade.');
    $('#guideCoachPrimary').hidden=false;$('#guideCoachPrimary').textContent='Atualizar validação e continuar';$('#guideCoachPrimary').onclick=guideAdvanceAfterResolution;
    $('#guideCoachValidate').hidden=true;$('#guideCoachNextHint').textContent='O Publisher atualizará a fila antes de mostrar a próxima ação.';
  }catch(e){
    const raw=String(e?.message||e||'');
    const assetFail=/importScripts|failed to load|NetworkError|tesseract-core|worker\.min|traineddata/i.test(raw);
    const msg=stage==='ocr'&&assetFail?`Falha ao carregar um arquivo do OCR. Confira /health/ocr e o log do deploy. Detalhe: ${raw.slice(0,700)}`:raw;
    guideSetStatus('error',stage==='ocr'?'OCR LOCAL NÃO CONCLUIU':'PREENCHIMENTO NÃO CONCLUIU',msg);
    toast(msg,10000)
  }finally{guideEvidenceSubmitting=false}
};
function guideProductWhy(view,p){return ({products:'Dados corretos e ficha técnica completa evitam bloqueios e são a base do SEO, frete e qualidade do anúncio.',images:'A capa e as imagens influenciam clique e confiança. As 9 fotos precisam ser fiéis ao produto e aprovadas antes da publicação.',commercial:'Preço, frete, tarifa, margem e catálogo precisam ser calculados juntos para vender sem destruir o lucro.',videos:'Vídeo correto pode melhorar entendimento e conversão, mas precisa corresponder exatamente à SKU.',pricing:'A faixa final precisa preservar margem considerando tarifa, frete, promoção e ADS antes de subir o anúncio.',publish:'A publicação só deve acontecer depois que todas as travas de qualidade, logística e preço estiverem validadas.'})[view]||'Esta etapa prepara a SKU para avançar com segurança até a publicação.'}
function guideProductInstruction(view,p){return ({products:'Revise a ficha indicada pelo sistema, corrija o que estiver pendente e salve. Quando ficar válida, o Publisher levará você para a próxima etapa.',images:'Gere ou envie as imagens, aprove uma a uma e mantenha exatamente o mesmo produto em todos os slots.',commercial:'Execute a análise automática. Confirme que frete, tarifa, preço bruto, margem e catálogo ficaram validados.',videos:'Associe o vídeo correto ou conclua a revisão manual. Depois o sistema libera a próxima etapa.',pricing:'Confira a recomendação final e valide o preço que será usado na publicação.',publish:'Faça a validação final. Depois da publicação, confira o Resumo pós-publicação por SKU.'})[view]||stepHelpText(view)}
function guideShowProductFlow(p,view,{welcome=false}={}){if(!guidePopupsEnabled()||!p)return;const stages=PIPELINE_FLOW.filter(x=>['products','images','commercial','videos','pricing','publish'].includes(x.view)),idx=Math.max(0,stages.findIndex(x=>x.view===view));const task={key:`product:${p.id}:${view}`,view,title:`SKU ${p.sku||''} · ${workflowViewLabel(view)}`,detail:stepHelpText(view),cta:'Mostrar onde trabalhar'};guideRenderTask(task,{welcome,mode:'product',index:idx,total:stages.length,product:p});setTimeout(()=>guideHighlightViewTarget(view,p),180)}
function guideHighlightViewTarget(view,p){document.querySelectorAll('.guideTargetPulse').forEach(x=>x.classList.remove('guideTargetPulse'));let target=null;if(view==='products')target=document.querySelector(`[data-product-id="${CSS.escape(String(p.id))}"]`)||$('#products .panel');else if(view==='images')target=document.querySelector(`[data-product-id="${CSS.escape(String(p.id))}"]`)||$('#imageStudio');else if(view==='commercial')target=document.querySelector(`[data-product-id="${CSS.escape(String(p.id))}"]`)||$('#commercial');else target=document.getElementById(view)?.querySelector('.panel, .productCard, .pageIntro');if(target){target.classList.add('guideTargetPulse');target.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>target.classList.remove('guideTargetPulse'),4500)}}
function guideMaybeForView(view){if(!guidePopupsEnabled()||view==='daily'||$('#completionModal')?.classList.contains('show'))return;const f=readWorkflowFocus();if(!f||f.view!==view)return;const p=products.find(x=>String(x.id)===String(f.productId));if(!p)return;if(guideCoachContext?.mode==='product'&&guideCoachContext?.productId===String(p.id)&&guideCoachContext?.view===view&&!guideCoachMinimized)return;setTimeout(()=>guideShowProductFlow(p,view),140)}
function dailyCycleLabel(c){return ({morning:'Manhã · abertura da operação',afternoon:'Tarde · desempenho e conversão',evening:'Final do dia · fechamento e prioridades'})[c]||'Rotina atual'}
function dailyTaskIcon(t){if(t.kind==='account')return 'ML';if(t.kind==='catalogVerify')return '🧩';if(t.kind==='quality')return '🛠️';if(t.kind==='commercial')return '💲';if(t.kind==='alert')return '⚠️';if(t.kind==='ok')return '✅';if(t.kind==='review')return '🔎';if(t.kind==='growth')return '📈';return 'ℹ️'}
function dailyTaskAction(t,locked=false){
  if(t.completed||t.autoComplete)return `<button class="btn ghost" disabled>Concluído</button>`;
  if(locked)return `<button class="btn ghost" disabled>Aguardando etapa anterior</button>`;
  if(t.manualAction==='catalog-product-verification')return `<button class="btn primary" onclick="dailyCatalogVerify('${esc(t.itemId||'')}','${encodeURIComponent(t.key)}')">${esc(t.cta||'Resolver automaticamente')}</button>`;
  if(t.alertId)return `<button class="btn primary" onclick="dailyFixAlert('${encodeURIComponent(t.alertId)}','${encodeURIComponent(t.key)}')">${esc(t.cta||'Corrigir')}</button>`;
  return `<div class="dailyTaskButtons"><button class="btn ${t.priority<=2?'primary':'ghost'}" onclick="dailyOpenTask('${esc(t.view||'dashboard')}','${encodeURIComponent(t.key)}')">${esc(t.cta||'Abrir e executar')}</button><button class="btn ghost mini" onclick="dailyCompleteTask('${encodeURIComponent(t.key)}')">Concluir etapa</button></div>`;
}

function dailyQualityBody(t,tag){
  const actions=Array.isArray(t.qualityActions)?t.qualityActions:[];
  const chips=actions.length?actions.map(x=>`<strong>CORRIGIR ${esc(String(x).toUpperCase())}</strong>`).join(''):`<strong>ATUALIZAR ANÁLISE</strong>`;
  return `<div class="dailyTaskBody dailyQualityBody"><span>${esc(tag)}</span><b>${esc(t.title)}</b><div class="dailyQualityActions">${chips}</div>${t.legacy?`<small>SKU ANTIGA · WEDROP + MERCADO LIVRE</small>`:''}</div>`;
}
function dailyStandardBody(t,tag){return `<div class="dailyTaskBody"><span>${tag}</span><b>${esc(t.title)}</b><p>${esc(t.detail||'')}</p>${t.solution?`<em><strong>Solução:</strong> ${esc(t.solution)}</em>`:''}</div>`}

function renderDailyOps(){
  if(!$('#dailyTasks'))return;const s=dailyOps.settings||{},ci=dailyOps.cycle||{},sum=dailyOps.summary||{},op=authState.operator||{},statuses=dailyOps.cycleStatuses||{};
  if($('#dailyGreeting'))$('#dailyGreeting').textContent=`${timeGreeting()}, ${op.name||op.username||'operador'}`;
  if($('#dailyLead'))$('#dailyLead').textContent=`Você entrou às ${op.loginAt?new Date(op.loginAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—'}. Não precisa procurar menus: siga somente a próxima ação indicada pelo sistema.`;
  $('#dailyMorningLabel').textContent=s.dailyMorningTime||'08:00';$('#dailyAfternoonLabel').textContent=s.dailyAfternoonTime||'14:00';$('#dailyEveningLabel').textContent=s.dailyEveningTime||'18:30';
  if($('#dailyMorningTime'))$('#dailyMorningTime').value=s.dailyMorningTime||'08:00';if($('#dailyAfternoonTime'))$('#dailyAfternoonTime').value=s.dailyAfternoonTime||'14:00';if($('#dailyEveningTime'))$('#dailyEveningTime').value=s.dailyEveningTime||'18:30';if($('#dailyNewProductGoal'))$('#dailyNewProductGoal').value=Number(s.dailyNewProductGoal??2);if($('#dailyNewProductStretchGoal'))$('#dailyNewProductStretchGoal').value=Number(s.dailyNewProductStretchGoal??5);if($('#dailyGuidePopupsEnabled'))$('#dailyGuidePopupsEnabled').checked=s.dailyGuidePopupsEnabled!==false;
  for(const c of ['morning','afternoon','evening']){const el=$(`#dailySchedule_${c}`);if(!el)continue;el.classList.toggle('done',Boolean(statuses[c]?.completed));el.classList.toggle('current',ci.cycle===c);const st=el.querySelector('.dailyScheduleState');if(st)st.textContent=statuses[c]?.completed?'✓ concluído':ci.cycle===c?'em andamento':'programado';}
  $('#dailyCycleEyebrow').textContent=`ABERTURA AUTOMÁTICA · ${String(ci.label||'ATUAL').toUpperCase()}${ci.overdue?' · CICLO PENDENTE':''}`;$('#dailyCycleTitle').textContent='O sistema confere a conta e libera uma ação por vez';$('#dailyCycleDescription').textContent='Fonte principal: Mercado Livre. Ordem guiada: conta/estoque → ADS → promoções/preço → qualidade → fechamento. A planilha local não limita a varredura.';
  $('#dailyMonitored').textContent=Number(sum.inventoryCount||sum.monitored||0);if($('#dailyInventoryHint'))$('#dailyInventoryHint').textContent=`fonte: Mercado Livre · ${Number(sum.externalAccountItems||0)} fora do Publisher${Number(sum.newAccountItems||0)?` · ${Number(sum.newAccountItems||0)} nova(s)`:''}`;$('#dailyPending').textContent=Number(dailyOps.corePendingCount||0);$('#dailyCritical').textContent=Number(sum.critical||0);if($('#dailyOutOfStock'))$('#dailyOutOfStock').textContent=Number(sum.inactiveOutOfStock??sum.waitingStock??0);if($('#dailyCommercialReviewed'))$('#dailyCommercialReviewed').textContent=`${Number(sum.commercialReviewed||0)}/${Number(sum.commercialTotal||0)}`;if($('#dailyCommercialIssues'))$('#dailyCommercialIssues').textContent=`${Number(sum.commercialCorrections||0)} correção(ões) · ${Number(sum.commercialErrors||0)} falha(s) de consulta`;$('#dailyNet').textContent=money(sum.net||0);$('#dailyAdsSpend').textContent=`ADS ${money(sum.adsSpend||0)} · ${Number(sum.adsActive||0)} ativo(s) · ${Number(sum.adsProblemCount||0)} alerta(s)`;
  if($('#dailyPublishedToday'))$('#dailyPublishedToday').textContent=`${Number(sum.publishedToday||0)}/${Number(sum.newProductGoal||0)}`;if($('#dailyProductGoalHint'))$('#dailyProductGoalHint').textContent=`meta aceleração ${Number(sum.newProductStretchGoal||0)}/dia`;
  const tasks=dailyOps.tasks||[],done=tasks.filter(t=>t.completed||t.autoComplete).length;$('#dailyProgressText').textContent=`${done}/${tasks.length} etapas registradas`;
  if($('#dailyCoreStatus'))$('#dailyCoreStatus').textContent=dailyOps.coreComplete?'✓ Rotina obrigatória em dia · agora foque em crescimento':'Siga uma etapa por vez · o restante fica bloqueado';
  const activeKey=dailyOps.nextTaskKey||'';const activeIndex=tasks.findIndex(t=>String(t.key)===String(activeKey));
  if($('#dailyNextAction')){const t=activeIndex>=0?tasks[activeIndex]:null;$('#dailyNextAction').innerHTML=t?`<span>PRÓXIMA AÇÃO</span><b>${esc(t.title)}</b><small>${esc(t.detail||'')}</small>`:`<span>ROTINA EM DIA</span><b>Nenhuma ação pendente neste momento</b><small>O monitor continua acompanhando a conta em segundo plano.</small>`;}
  $('#dailyTasks').innerHTML=tasks.length?tasks.map((t,i)=>{const complete=t.completed||t.autoComplete;const locked=!complete&&activeIndex>=0&&i!==activeIndex;const tag=t.kind==='account'?'CONTA MERCADO LIVRE':t.kind==='catalogVerify'?'MERCADO LIVRE · VERIFICAR PRODUTO':t.kind==='quality'?(t.qualityBand==='critical'?'QUALIDADE · PRIORIDADE CRÍTICA':'QUALIDADE · MELHORIA'):t.kind==='commercial'?'COMERCIAL · CORREÇÃO NECESSÁRIA':t.kind==='alert'?'AÇÃO PRIORITÁRIA':t.kind==='review'?'REVISÃO DO PERÍODO':t.kind==='growth'?'CRESCIMENTO DO CATÁLOGO':t.kind==='ok'?'OPERAÇÃO ESTÁVEL':'ACOMPANHAMENTO';const body=t.kind==='quality'?dailyQualityBody(t,tag):dailyStandardBody(t,tag);return `<div class="dailyTask ${t.kind==='quality'?'dailyQualityTask':''} ${complete?'done':''} ${locked?'locked':''} ${i===activeIndex?'activeStep':''} priority${Math.min(7,Number(t.priority||4))}"><div class="dailyTaskIndex">${complete?'✓':i+1}</div><div class="dailyTaskIcon">${dailyTaskIcon(t)}</div>${body}<div class="dailyTaskAction">${dailyTaskAction(t,locked)}</div></div>`}).join(''):'<div class="emptyMini">Nenhuma tarefa gerada para este período.</div>';
}
async function loadDailyOps(){try{dailyOps=await api('/api/daily-ops');renderDailyOps()}catch(e){toast(e.message)}}
function renderDailyBackground(bg={}){
  lastDailyBackgroundState={...bg};
  const panel=$('#dailyBackgroundPanel');if(!panel)return;const total=Number(bg.total||0),done=Number(bg.done||0),pct=Math.max(0,Math.min(100,Number(bg.percent||0)));
  $('#dailyBackgroundProgress').textContent=total?`${done}/${total}`:'0/0';$('#dailyBackgroundBarFill').style.width=`${pct}%`;$('#dailyBackgroundStage').textContent=bg.stage||'Aguardando';$('#dailyBackgroundIssues').textContent=`${Number(bg.issues||0)} correção(ões)`;$('#dailyBackgroundErrors').textContent=`${Number(bg.errors||0)} falha(s)`;
  if(bg.status==='running'){$('#dailyBackgroundTitle').textContent=`Conferindo a conta em segundo plano · ${pct}%`;$('#dailyBackgroundMessage').textContent=bg.message||'Você pode continuar trabalhando normalmente.';panel.classList.add('running');panel.classList.remove('done','error');}
  else if(bg.status==='done'){$('#dailyBackgroundTitle').textContent='Auditoria de fundo concluída';$('#dailyBackgroundMessage').textContent=bg.message||'A fila já contém somente o que exige sua atenção.';panel.classList.add('done');panel.classList.remove('running','error');}
  else if(bg.status==='error'){$('#dailyBackgroundTitle').textContent='Auditoria de fundo interrompida';$('#dailyBackgroundMessage').textContent=bg.message||'Ações já encontradas continuam disponíveis; a auditoria pode ser repetida depois.';panel.classList.add('error');panel.classList.remove('running','done');}
  else{$('#dailyBackgroundTitle').textContent='Nenhuma auditoria longa em execução';$('#dailyBackgroundMessage').textContent='As ações conhecidas ficam disponíveis imediatamente. O restante da conta é conferido em lotes.';panel.classList.remove('running','done','error');}
}
let dailyBackgroundPollTimer=null,lastBackgroundDone=-1;
async function pollDailyBackground(){
  clearInterval(dailyBackgroundPollTimer);let lastTaskKey=dailyOps.nextTaskKey||'';
  const tick=async()=>{try{
    const st=await api('/api/daily-ops/run-status'),bg=st.background||{};renderDailyBackground(bg);
    if(Number(bg.done||0)!==lastBackgroundDone){
      lastBackgroundDone=Number(bg.done||0);await loadDailyOps();const next=dailyOps.nextTaskKey||'';
      if(next&&next!==lastTaskKey){lastTaskKey=next;if(!guideCoachMinimized&&!['resolved','catalog-verify'].includes(guideCoachContext?.mode||''))guideShowDailyTask({welcome:false});}
      else if(!next&&!guideCoachMinimized&&(guideCoachContext?.mode==='background'||!guideCoachContext))guideShowBackgroundProgress(bg,{welcome:false});
    }
    if(!bg.running){clearInterval(dailyBackgroundPollTimer);if(bg.status==='done'){await loadDailyOps();if(!dailyOps.nextTaskKey&&!guideCoachMinimized&&!['resolved','catalog-verify'].includes(guideCoachContext?.mode||''))guideShowDailyTask({welcome:false});toast(`Auditoria da conta concluída: ${Number(bg.issues||0)} ponto(s) para atenção.`,7000);}return;}
  }catch(e){console.warn('Falha ao consultar auditoria de fundo:',e.message)}};
  await tick();dailyBackgroundPollTimer=setInterval(tick,4000);dailyBackgroundPollTimer.unref?.();
}

let dailyRunPollTimer=null;
async function pollDailyRoutine({welcome=false,automatic=false}={}){
  clearInterval(dailyRunPollTimer);let finished=false,first=true;
  const tick=async()=>{try{const st=await api('/api/daily-ops/run-status');renderDailyBackground(st.background||{});
    if(st.status==='running'){operationStart(`Conferindo conta · ${st.stage||'processando'}`,`${Number(st.percent||0)}% · ${st.message||'Preparando sua próxima ação.'}`);guideShowScanProgress(st,{welcome:welcome&&first});first=false;return;}
    if(['ready','done'].includes(st.status)){finished=true;clearInterval(dailyRunPollTimer);await loadDailyOps();const msg=`Conta sincronizada: ${Number(dailyOps.summary?.inventoryCount||0)} anúncio(s) encontrados. ${dailyOps.corePendingCount||0} ação(ões) aguardam sua atenção.`;const btn=$('#runDailyCycle');if(btn)btn.textContent='Rever conta agora';operationDone('Abertura concluída',msg);if(!automatic)toast(`✓ ${msg}`,7000);if(st.background?.running)pollDailyBackground();setTimeout(()=>guideShowDailyTask({welcome:welcome||automatic}),180);return;}
    if(st.status==='error'){finished=true;clearInterval(dailyRunPollTimer);const btn=$('#runDailyCycle');if(btn)btn.textContent='Rever conta agora';operationError('Falha na abertura da operação',st.error||st.message||'Falha ao atualizar a conta.');guideShowResult('error','Não consegui concluir a conferência',st.error||st.message||'Tente novamente.');}
  }catch(e){console.warn('Falha ao consultar rotina rápida:',e.message)}};
  await tick();if(!finished){dailyRunPollTimer=setInterval(tick,1800);dailyRunPollTimer.unref?.();}
}
async function runDailyCycle({automatic=false,welcome=false}={}){
  try{
    const intro={status:'running',percent:1,stage:'Conta e estoque',message:'Estou lendo todos os anúncios diretamente no Mercado Livre. Depois vou conferir ADS, promoções/preço e qualidade.'};
    operationStart(automatic?'Abertura automática da operação':'Revisando sua conta','Lendo Mercado Livre diretamente. Nenhuma alteração remota será feita sem sua confirmação.');guideShowScanProgress(intro,{welcome:welcome||automatic});
    const d=await api('/api/daily-ops/run',{method:'POST'});if(!automatic)toast(d.reused?'A conferência da conta já estava em andamento.':'Conferência da conta iniciada.',5000);pollDailyRoutine({welcome:welcome||automatic,automatic});
  }catch(e){operationError('Falha ao atualizar rotina',e.message);guideShowResult('error','Não foi possível conferir a conta',e.message);toast(e.message,10000)}
}
function stopCatalogVerifyPoll(){if(catalogVerifyPollTimer){clearInterval(catalogVerifyPollTimer);catalogVerifyPollTimer=null}catalogVerifyPollBusy=false}
window.dailyCatalogVerify=(itemId,encodedKey)=>{
  const key=decodeURIComponent(encodedKey||'');
  // V1.8.76: abre a lista oficial filtrada; o Helper localiza a SKU e usa o link real de edição gerado pelo Mercado Livre.
  // foi aberta pelo Publisher para executar SOMENTE o fluxo “Verificar produto”.
  const url=`/api/ml/open-edit?itemId=${encodeURIComponent(itemId)}&auto=verify-product`;
  stopCatalogVerifyPoll();
  const opened=window.open(url,'_blank','noopener');
  guideCoachContext={...(guideCoachContext||{}),mode:'catalog-verify',taskKey:key,bubble:'Verificar produto no Mercado Livre',catalogAutomationOpenedAt:Date.now()};
  guideOpenShell({welcome:false});
  $('#guideCoachTitle').textContent='Verificar produto · localização segura';
  $('#guideCoachDetail').textContent=`SKU/Anúncio ${itemId}. Esta tarefa só apareceu porque o próprio /performance do Mercado Livre mostrou o objetivo “Verificar produto”. Anúncios inativos ou sem estoque ficam fora desta fila.`;
  $('#guideCoachWhy').textContent='A Central do Mercado Livre usa uma rota de edição OMNI com identificadores internos que não podem ser montados pelo Publisher. Para evitar a página 404, abrimos a lista oficial filtrada pelo MLB; o Helper localiza exatamente esta SKU e clica no link real criado pelo próprio Mercado Livre.';
  $('#guideCoachInstruction').textContent='Com o Helper V1.2 instalado, apenas acompanhe: ele localiza esta SKU na lista → abre o anúncio pelo link real da Central → “Verificar produto” → “Não encontro meu produto” → confirma → preenche a diferença → “Enviar”. Se não localizar exatamente a SKU, ele para sem clicar em outro anúncio.';
  const box=$('#guideCoachPlan');box.hidden=false;box.innerHTML=`<small>AUTOMAÇÃO DO HELPER CHROME</small><div class="guidePlanSteps"><div class="guidePlanStep"><i>1</i><div><b>Localizar a SKU exata</b><p>Usa MLB/SKU na lista oficial e abre o link real da Central.</p></div></div><div class="guidePlanStep"><i>2</i><div><b>Verificar produto → Não encontro meu produto</b><p>Não seleciona nenhum produto sugerido.</p></div></div><div class="guidePlanStep"><i>3</i><div><b>Confirmar e enviar diferença</b><p>Preenche uma justificativa simples e envia.</p></div></div><div class="guidePlanStep guideExecutionDone"><i>↻</i><div><b>Validação automática</b><p>O Publisher relê /performance. Só conclui quando “Verificar produto” realmente sumir.</p></div></div></div>`;
  $('#guideCoachPrimary').hidden=Boolean(opened);$('#guideCoachPrimary').textContent=opened?'Automação aberta em 1 aba':'Popup bloqueado · abrir 1 aba';$('#guideCoachPrimary').disabled=Boolean(opened);$('#guideCoachPrimary').onclick=()=>{if($('#guideCoachPrimary').disabled)return;const w=window.open(url,'_blank','noopener');if(w){$('#guideCoachPrimary').textContent='Automação aberta em 1 aba';$('#guideCoachPrimary').disabled=true;$('#guideCoachPrimary').hidden=true;}};
  $('#guideCoachValidate').hidden=false;$('#guideCoachValidate').textContent='Conferir agora';$('#guideCoachValidate').onclick=()=>dailyCatalogVerifyConfirm(itemId,encodeURIComponent(key),{silent:false});
  $('#guideCoachNextHint').textContent='Não marque a tarefa manualmente. Quando o Mercado Livre retirar o objetivo “Verificar produto”, esta SKU sai da fila sozinha e a próxima é liberada.';
  guideSetStatus('ready','AUTOMAÇÃO SEGURA · 1 ABA','O Helper usa trava de aba única e limite de ações. Se algo sair do esperado, ele para em vez de repetir cliques.');
  catalogVerifyPollTimer=setInterval(()=>dailyCatalogVerifyConfirm(itemId,encodeURIComponent(key),{silent:true}),6000);
};
window.dailyCatalogVerifyConfirm=async(itemId,encodedKey,{silent=false}={})=>{
  const key=decodeURIComponent(encodedKey||'');if(catalogVerifyPollBusy)return;
  catalogVerifyPollBusy=true;
  try{
    if(!silent)guideSetStatus('busy','VALIDANDO NO MERCADO LIVRE','Relendo status do anúncio e situação de catálogo.');
    const d=await api('/api/catalog-guard/product-verification/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({itemId})});
    if(!d.confirmed){if(!silent){guideSetStatus('ready','AINDA AGUARDANDO',d.message||'O Mercado Livre ainda não confirmou a alteração.');$('#guideCoachDetail').textContent=d.message||'';}return;}
    stopCatalogVerifyPoll();
    if(key){dailyOps=await api('/api/daily-ops/task/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});renderDailyOps();}else{await loadDailyOps();renderDailyOps();}
    guideShowResolvedOutcome({title:'Verificar produto concluído',detail:d.ignored?(d.message||'Anúncio retirado desta fila porque está sem estoque/inativo.'):'O Mercado Livre retirou o objetivo “Verificar produto” da qualidade desta SKU. A pendência foi eliminada e a próxima ação será liberada.',statusDetail:'Resultado confirmado pela releitura do /performance.'});
  }catch(e){if(!silent){guideSetStatus('error','NÃO CONSEGUI VALIDAR',e.message);toast(e.message,10000)}}
  finally{catalogVerifyPollBusy=false}
};
window.dailyOpenTask=async(view,encodedKey)=>{
  const key=decodeURIComponent(encodedKey||''),task=(dailyOps.tasks||[]).find(t=>String(t.key)===String(key));
  if(task?.promoAction==='apply-safe')return dailyResolvePromotionTask(task);
  if(view)nav(view);guideCoachContext={...(guideCoachContext||{}),mode:'daily-action',taskKey:key,task,view,bubble:task?.title||'Etapa em andamento'};
  guideSetStatus('ready','ETAPA ABERTA',task?.detail||'Execute a ação indicada e depois valide.');$('#guideCoachTitle').textContent=task?.title||'Etapa aberta';$('#guideCoachDetail').textContent=task?.detail||'';$('#guideCoachWhy').textContent=guideTaskWhy(task||{});$('#guideCoachInstruction').textContent=guideTaskInstruction(task||{});$('#guideCoachPrimary').textContent='Ir para a tela';$('#guideCoachPrimary').onclick=()=>{if(view)nav(view);guideMinimize()};$('#guideCoachValidate').hidden=false;$('#guideCoachValidate').onclick=()=>dailyCompleteTask(encodeURIComponent(key));guideRecord('daily-task-open',{taskKey:key,view});
};
window.dailyCompleteTask=async encodedKey=>{
  const key=decodeURIComponent(encodedKey||''),oldCycle=dailyOps.cycle?.cycle;
  try{
    guideShowBusy('Validando esta etapa','Registrando operador, horário e atualizando a fila.');
    operationStart('Validando conclusão da etapa','AGUARDE · registrando o operador, horário e atualizando o fluxo do dia.');
    dailyOps=await api('/api/daily-ops/task/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});renderDailyOps();
    const advanced=oldCycle&&dailyOps.cycle?.cycle&&oldCycle!==dailyOps.cycle.cycle;
    if(advanced){
      const msg=`A rotina de ${oldCycle==='morning'?'manhã':oldCycle==='afternoon'?'tarde':'fechamento'} ficou em dia. Vou preparar automaticamente a próxima rotina.`;
      operationDone('Ciclo concluído',msg);guideShowResolvedOutcome({title:'Ciclo concluído',detail:msg,statusDetail:'Período concluído e registrado.'});
      await loadDailyOps();toast('Novo período disponível. O sistema fará a próxima conferência automaticamente.',8000);setTimeout(()=>runDailyCycle({automatic:true,welcome:false}),500);
    }else{
      const msg=dailyOps.coreComplete?'Rotina obrigatória em dia. O sistema vai conferir se ainda existe alguma ação de crescimento ou auditoria em andamento.':'Etapa concluída. A fila foi atualizada e a próxima ação já pode ser exibida.';
      operationDone('Etapa concluída',msg);guideShowResolvedOutcome({title:'Etapa concluída',detail:msg,statusDetail:'Conclusão registrada.'});
    }
  }catch(e){operationError('Falha ao concluir tarefa',e.message);guideShowResult('error','Falha ao validar a etapa',e.message)}
};
window.dailyFixAlert=async(encodedAlert,encodedKey)=>{const alertId=decodeURIComponent(encodedAlert||''),key=decodeURIComponent(encodedKey||'');try{const r=await api(`/api/monitoring/fix/plan?alertId=${encodeURIComponent(alertId)}`);guideShowCorrectionPlan(r.plan,()=>dailyExecuteAlertFix(alertId,key,r.plan));}catch(e){operationError('Falha ao preparar correção',e.message);guideShowResult('error','Falha ao preparar correção',e.message)}};
async function dailyExecuteAlertFix(alertId,key,plan){try{guideShowBusy(`Executando correções · ${plan?.sku||''}`,'Aplicando somente as correções exibidas no plano e validando cada ação diretamente.');operationStart('Corrigindo tarefa da rotina','Executando o plano aprovado. A tela não ficará presa aguardando a varredura completa.');const d=await api('/api/monitoring/fix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({alertId,confirm:true})});monitoring=d.monitoring||monitoring;if(d.resolved){dailyOps=await api('/api/daily-ops/task/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});renderDailyOps();operationDone('Correção validada',d.message||'Problema resolvido e retirado da fila.');guideShowExecution(plan,d,{alertId,key});}else{operationDone('Correção encaminhada',d.message||'Ainda exige revisão guiada.');if(d.details?.attributeResolved){await loadDailyOps();renderDailyOps();}guideShowExecution(plan,d,{alertId,key});const verification=d.details?.attributeVerification,evidenceNeeded=Boolean((verification?.missing||[]).length||d.details?.evidenceRequest?.required);if(evidenceNeeded){guideOfferAttributeEvidence(alertId,key,verification,d.details?.legacyAttributeRepair?.attributes||d.details?.attributeRepair?.attributes||[]);return;}if(d.details?.attributeResolved)return;if(d.route?.view){const pp=products.find(x=>String(x.sku)===String(d.route.sku||''));if(pp)setTimeout(()=>{nav(d.route.view);guideShowProductFlow(pp,d.route.view)},1600)}}}catch(e){operationError('Falha na correção',e.message);guideShowResult('error','Falha na correção',e.message);toast(e.message,10000)}};

if($('#runDailyCycle'))$('#runDailyCycle').onclick=()=>runDailyCycle();if($('#refreshDailyCycle'))$('#refreshDailyCycle').onclick=()=>loadDailyOps();if($('#saveDailyTimes'))$('#saveDailyTimes').onclick=async()=>{try{operationStart('Salvando horários','Aguarde...');const body={dailyGuideEnabled:true,dailyGuidePopupsEnabled:Boolean($('#dailyGuidePopupsEnabled')?.checked),dailyMorningTime:$('#dailyMorningTime').value,dailyAfternoonTime:$('#dailyAfternoonTime').value,dailyEveningTime:$('#dailyEveningTime').value,dailyNewProductGoal:Number($('#dailyNewProductGoal')?.value||2),dailyNewProductStretchGoal:Number($('#dailyNewProductStretchGoal')?.value||5),dailyTimezone:'America/Sao_Paulo'};await api('/api/daily-ops/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});await loadDailyOps();operationDone('Horários salvos','A rotina diária usará os novos horários.');toast('Horários da rotina salvos.')}catch(e){operationError('Falha ao salvar horários',e.message)}};

$$('.sidebar nav button[data-view]').forEach(b=>b.onclick=()=>{nav(b.dataset.view);closeMobileMenu()});
$$('.navGroupToggle').forEach(t=>t.onclick=e=>{
  e.preventDefault();
  const g=t.closest('.navGroup');
  if(desktopHoverNav()){
    closeAllGroups(g);
    setGroupOpen(g,true);
    g.dataset.pinned='1';
    $$('.navGroup').forEach(x=>{if(x!==g)delete x.dataset.pinned});
    return;
  }
  const open=g.classList.contains('open');
  closeAllGroups(open?null:g);
  setGroupOpen(g,!open);
});
const desktopHoverNav=()=>window.matchMedia('(hover:hover) and (pointer:fine) and (min-width:701px)').matches;
$$('.navGroup').forEach(g=>{
  g.addEventListener('mouseenter',()=>{
    if(!desktopHoverNav())return;
    closeAllGroups(g);
    setGroupOpen(g,true);
  });
  g.addEventListener('mouseleave',()=>{
    if(!desktopHoverNav())return;
    if(g.dataset.pinned==='1')return;
    const active=g.querySelector('.navSubmenu button.active');
    if(!active){
      setGroupOpen(g,false);
      const pinned=$('.navGroup[data-pinned="1"]');
      const current=$('.sidebar nav button[data-view].active');
      const currentGroup=current?.closest('.navGroup');
      const restore=pinned||currentGroup;
      if(restore&&restore!==g)setGroupOpen(restore,true);
    }
  });
});
function closeMobileMenu(){const s=$('#mainSidebar'),bd=$('#sidebarBackdrop'),t=$('#mobileMenuToggle');if(!s)return;s.classList.remove('open');bd?.classList.remove('show');t?.setAttribute('aria-expanded','false')}
function openMobileMenu(){const s=$('#mainSidebar'),bd=$('#sidebarBackdrop'),t=$('#mobileMenuToggle');if(!s)return;s.classList.add('open');bd?.classList.add('show');t?.setAttribute('aria-expanded','true')}
if($('#mobileMenuToggle'))$('#mobileMenuToggle').onclick=()=>$('#mainSidebar')?.classList.contains('open')?closeMobileMenu():openMobileMenu();if($('#sidebarBackdrop'))$('#sidebarBackdrop').onclick=closeMobileMenu;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileMenu()});

let operatorUsers=[];
function renderOperators(){const el=$('#operatorsList');if(!el)return;if(authState.operator?.role!=='admin'){el.innerHTML='<div class="emptyMini">Somente administradores podem gerenciar operadores.</div>';const btn=$('#createOperator');if(btn)btn.disabled=true;return;}el.innerHTML=operatorUsers.length?operatorUsers.map(u=>`<div class="operatorRow"><div><b>${esc(u.name||u.username)}</b><span>@${esc(u.username)} · ${esc(u.role==='admin'?'Administrador':'Operador')}</span><small>${u.lastLoginAt?`Último acesso ${new Date(u.lastLoginAt).toLocaleString('pt-BR')}`:'Ainda não acessou'}</small></div><span class="pill ${u.active?'good':'neutral'}">${u.active?'ATIVO':'INATIVO'}</span><button class="btn ghost mini" ${String(u.id)===String(authState.operator?.id)?'disabled':''} onclick="toggleOperator('${encodeURIComponent(u.id)}')">${u.active?'Desativar':'Ativar'}</button></div>`).join(''):'<div class="emptyMini">Nenhum operador cadastrado.</div>'}
async function loadOperators(){if(!$('#operatorsList'))return;try{if(authState.operator?.role!=='admin'){renderOperators();return;}const d=await api('/api/auth/users');operatorUsers=d.users||[];renderOperators()}catch(e){toast(e.message)}}
if($('#createOperator'))$('#createOperator').onclick=async()=>{try{operationStart('Criando operador','Aguarde enquanto o acesso é protegido e salvo.');const body={name:$('#newOperatorName').value.trim(),username:$('#newOperatorUser').value.trim(),password:$('#newOperatorPassword').value,role:$('#newOperatorRole').value};await api('/api/auth/users',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});$('#newOperatorName').value='';$('#newOperatorUser').value='';$('#newOperatorPassword').value='';await loadOperators();operationDone('Operador criado','O novo login já pode ser usado.')}catch(e){operationError('Falha ao criar operador',e.message)}};
window.toggleOperator=async encoded=>{try{const id=decodeURIComponent(encoded||'');operationStart('Atualizando operador','Aguarde...');await api(`/api/auth/users/${encodeURIComponent(id)}/toggle`,{method:'POST'});await loadOperators();operationDone('Acesso atualizado','Alteração concluída.')}catch(e){operationError('Falha ao atualizar operador',e.message)}};
async function loadStatus(){status=await api('/api/status');const b=$('#mlBadge');b.textContent=status.connected?`Conectado · ${status.user?.nickname||status.user?.id}`:'Mercado Livre não conectado';b.className=`badge ${status.connected?'ok':'neutral'}`;$('#connectionCard').innerHTML=status.connected?`<b>Conta conectada</b><br>${esc(status.user?.nickname||'')}<br><span class="muted">ID ${esc(status.user?.id||'')} · Site ${esc(status.site)}</span>`:`<b>Conexão pendente</b><br><span class="muted">Configure Client ID/Secret no Render e autorize a conta administradora.</span>`;$('#settingsStatus').innerHTML=status.connected?`<p><span class="pill good">CONECTADO</span> ${esc(status.user?.nickname||'')}</p>`:`<p><span class="pill warn">PENDENTE</span> Mercado Livre não conectado.</p>`;if($('#aiConfigStatus'))$('#aiConfigStatus').innerHTML=status.imageAIConfigured?`<p><span class="pill good">API CONFIGURADA</span> Modo automático disponível</p><p><span class="pill good">MANUAL DISPONÍVEL</span> ChatGPT Plus + upload também pode ser usado</p>`:`<p><span class="pill warn">API NÃO CONFIGURADA</span> Modo automático indisponível</p><p><span class="pill good">MANUAL DISPONÍVEL</span> Você pode usar ChatGPT Plus + upload sem API</p>`;if($('#imageAiStatus'))$('#imageAiStatus').textContent=status.imageAIConfigured?`Automático disponível · disparo após importação ${status.autoGenerateImages?'permitido':'desligado'} · manual sempre disponível`:'Manual disponível · configure OPENAI_API_KEY apenas se quiser o automático.';if($('#imageModeLabel'))$('#imageModeLabel').textContent=(status.imageGenerationMode||'manual')==='auto'?'Automático via API':'Manual via ChatGPT Plus';if(status.supplierCatalog) supplierCatalog=status.supplierCatalog;if($('#livePublishSetting'))$('#livePublishSetting').innerHTML=status.livePublish?`<div class="notice"><span class="pill good">ATIVA</span> Publicação real habilitada no Mercado Livre.</div>`:`<div class="warning"><span class="pill warn">DESATIVADA</span> O sistema só valida/simula. No Render defina <code>ML_LIVE_PUBLISH_ENABLED=true</code>.</div>`;if(status.persistence&&!status.persistence.durable&&$('#settingsStatus'))$('#settingsStatus').innerHTML+=`<div class="warning miniWarning"><b>Persistência:</b> ${esc(status.persistence.warning||'Configure DATABASE_URL no Render para persistência definitiva.')}</div>`;}
async function loadSupplierCatalog(){
  try{
    supplierCatalog=await api('/api/supplier-catalog/status');
    const el=$('#supplierStatus'); if(!el)return;
    if(!supplierCatalog.configured){el.innerHTML='<span class="pill warn">NÃO CADASTRADO</span><p>Envie o Excel mestre do fornecedor. Depois disso a rotina pode funcionar somente por SKU.</p>';return;}
    const m=supplierCatalog.meta||{};
    const f=supplierCatalog.freshness||{};
    el.innerHTML=`<span class="pill good">SALVO NO POSTGRESQL</span><h3>${Number(supplierCatalog.count||0).toLocaleString('pt-BR')} produtos</h3><p><b>Fonte:</b> ${esc(m.sourceName||'Catálogo mestre WeDrop')}<br><b>Aba:</b> ${esc(m.sheetName||'—')}<br><b>Última atualização:</b> ${m.uploadedAt?new Date(m.uploadedAt).toLocaleString('pt-BR'):'—'}<br><b>Tempo desde a atualização:</b> ${f.ageHours==null?'—':`${f.ageHours}h`} <span class="muted">(informativo; o catálogo não expira)</span><br><b>Grupos de variação:</b> ${supplierCatalog.variationGroups||0}</p><div class="notice miniWarning"><b>Catálogo permanente:</b> não precisa importar novamente ao entrar no sistema ou após deploy. Quando houver produtos novos ou alterações na WeDrop, use <b>Adicionar/Atualizar produtos</b>; SKUs antigas continuam salvas.</div>${supplierCatalog.remoteRefreshConfigured?'<div class="sourceBadge">Fonte remota configurada · atualização automática só ocorre se habilitada nas configurações</div>':'<div class="sourceBadge">✓ Catálogo persistido no banco · atualização manual somente quando houver produto novo ou dado alterado</div>'}${supplierCatalog.persistent?'':'<div class="warning miniWarning"><b>Atenção:</b> PostgreSQL não detectado; a persistência definitiva exige DATABASE_URL.</div>'}<div class="catalogSamples">${(supplierCatalog.sample||[]).map(x=>`<span>${esc(x.sku)} · ${esc(String(x.availability_status||'').toLowerCase()==='available'?'Disponível':String(x.availability_status||'').toLowerCase()==='unavailable'?'Indisponível':`estoque ${Number(x.stock||0)}`)} · ${esc(x.product||'sem nome')}</span>`).join('')}</div>`;
    const rb=$('#supplierRemoteRefreshBtn');if(rb)rb.hidden=!supplierCatalog.remoteRefreshConfigured;
  }catch(e){if($('#supplierStatus'))$('#supplierStatus').innerHTML=`<span class="pill warn">ERRO</span><p>${esc(e.message)}</p>`}
}
function validateSupplierFile(f){
  if(!f)return 'Selecione o Excel do fornecedor.';
  const max=100*1024*1024;
  if(f.size>max)return `Arquivo muito grande (${(f.size/1024/1024).toFixed(1)} MB). Limite atual: 100 MB.`;
  if(!/\.(xlsx|xls|csv)$/i.test(f.name||''))return 'Formato não suportado. Use XLSX, XLS ou CSV.';
  return '';
}
if($('#supplierFile'))$('#supplierFile').addEventListener('change',()=>{const f=$('#supplierFile')?.files?.[0];const label=$('label[for="supplierFile"] span');if(label&&f)label.textContent=`${f.name} · ${(f.size/1024/1024).toFixed(1)} MB`;});
if($('#supplierUploadBtn'))$('#supplierUploadBtn').onclick=async()=>{
  const f=$('#supplierFile')?.files?.[0]; const vf=validateSupplierFile(f); if(vf)return toast(vf);
  const fd=new FormData();fd.append('file',f);
  try{toast('Lendo catálogo e identificando as SKUs...');const d=await api('/api/supplier-catalog/upload',{method:'POST',body:fd});toast(`${d.productCount} produtos cadastrados no catálogo mestre.`);await Promise.all([loadSupplierCatalog(),loadStatus()]);}
  catch(e){toast(e.message)}
};
if($('#supplierUpdateBtn'))$('#supplierUpdateBtn').onclick=async()=>{const f=$('#supplierFile')?.files?.[0];const vf=validateSupplierFile(f);if(vf)return toast(vf);const fd=new FormData();fd.append('file',f);fd.append('mode','merge');try{operationStart('Atualizando catálogo mestre','Comparando as SKUs novas com o catálogo já salvo. Nenhum produto antigo será apagado.');const d=await api('/api/supplier-catalog/update',{method:'POST',body:fd});operationDone('Catálogo atualizado',`${d.stats?.added||0} nova(s) · ${d.stats?.updated||0} atualizada(s) · ${d.stats?.unchanged||0} sem mudança · ${d.stats?.total||0} no total.`);toast(`Catálogo permanente: +${d.stats?.added||0} nova(s), ${d.stats?.updated||0} atualizada(s), ${d.stats?.total||0} no total.`);await Promise.all([loadSupplierCatalog(),loadProducts()]);}catch(e){toast(e.message)}};
if($('#supplierRemoteRefreshBtn'))$('#supplierRemoteRefreshBtn').onclick=async()=>{try{toast('Baixando catálogo WeDrop atualizado...');const d=await api('/api/supplier-catalog/refresh-remote',{method:'POST'});toast(`Catálogo mestre atualizado: ${d.count||0} SKUs · +${d.added||0} novas · ${d.updated||0} atualizadas.`);await Promise.all([loadSupplierCatalog(),loadProducts()]);}catch(e){toast(e.message)}};
if($('#supplierReconcileBtn'))$('#supplierReconcileBtn').onclick=async()=>{try{const d=await api('/api/supplier-catalog/reconcile',{method:'POST'});await loadProducts();toast(`${d.found} produto(s) atualizados pelo catálogo; ${d.missing} sem correspondência.`)}catch(e){toast(e.message)}};
if($('#skuImportBtn'))$('#skuImportBtn').onclick=async()=>{
  const skus=$('#skuText')?.value||''; if(!skus.trim())return toast('Cole uma ou mais SKUs.');
  try{toast('Procurando SKUs no catálogo do fornecedor...');const d=await api('/api/import/skus',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({skus})});const msg=`${d.found} encontrada(s) · ${d.missing} não encontrada(s) · ${d.guards?.alreadyPublished||0} já publicada(s) · ${d.guards?.outOfStock||0} sem estoque.`;if($('#skuImportResult'))$('#skuImportResult').innerHTML=`<b>${d.count} SKU(s) processadas.</b><br>${msg}${d.missingSkus?.length?`<br><span class="warnText">Não encontradas: ${esc(d.missingSkus.join(', '))}</span>`:''}`;await loadProducts();const firstSku=String(skus).split(/[\n,;\s]+/).map(x=>x.trim()).filter(Boolean)[0]||'';const guided=products.find(x=>String(x.sku||'').toLowerCase()===firstSku.toLowerCase())||resumeCandidate();if(guided){setWorkflowFocus(guided.id,'products','Revisar dados da SKU');try{sessionStorage.setItem('ra_product_guide_enabled','1')}catch(_){}}nav('products');toast(msg);if(guided)setTimeout(()=>guideShowProductFlow(guided,'products',{welcome:true}),280)}catch(e){toast(e.message)}
};
const PRODUCT_BACKUP_KEY='ra-ml-publisher-products-v188';
let productRecoveryAttempted=false;
function compactBackupProduct(p){
  const c={...p};
  if(c.commercialAnalysis){const a={...c.commercialAnalysis};a.scenarios=(a.scenarios||[]).map(x=>{const y={...x};delete y.listingRaw;delete y.shippingRaw;return y});a.thresholdScenarios=(a.thresholdScenarios||[]).map(x=>{const y={...x};delete y.listingRaw;delete y.shippingRaw;return y});delete a.bestSellers;c.commercialAnalysis=a;}
  if(c.marketOpportunity){const m={...c.marketOpportunity};delete m.raw;delete m.items;c.marketOpportunity=m;}
  return c;
}
function saveProductBrowserBackup(rows){
  if(!rows?.length)return;
  try{localStorage.setItem(PRODUCT_BACKUP_KEY,JSON.stringify({version:'1.8.76',savedAt:new Date().toISOString(),products:rows.map(compactBackupProduct)}));}
  catch(_){try{const essential=rows.map(p=>({id:p.id,sku:p.sku,product:p.product,cost:p.cost,price:p.price,status:p.status,createdAt:p.createdAt,updatedAt:p.updatedAt,description:p.description,descriptionLocked:p.descriptionLocked,manualAttributes:p.manualAttributes,manualSaleTerms:p.manualSaleTerms,attributeValues:p.attributeValues,seoTitle:p.seoTitle,seoModel:p.seoModel,seoModelExpanded:p.seoModelExpanded,seoResearch:p.seoResearch,imageStudio:p.imageStudio,generatedImages:p.generatedImages,videoReviewed:p.videoReviewed,marketproVideo:p.marketproVideo,video_url:p.video_url,commercialAnalysis:p.commercialAnalysis?{...p.commercialAnalysis,scenarios:[]} : null,priceRecommendation:p.priceRecommendation,adsRecommendation:p.adsRecommendation,marketOpportunity:p.marketOpportunity,publicationAudit:p.publicationAudit,technicalCoverage:p.technicalCoverage,readiness:p.readiness,quality:p.quality,ml_item_id:p.ml_item_id,user_product_id:p.user_product_id,publishedAt:p.publishedAt,listing_type_id:p.listing_type_id}));localStorage.setItem(PRODUCT_BACKUP_KEY,JSON.stringify({version:'1.8.76',savedAt:new Date().toISOString(),products:essential,compact:true}));}catch(__){}}
}
function readProductBrowserBackup(){try{const d=JSON.parse(localStorage.getItem(PRODUCT_BACKUP_KEY)||'null');return Array.isArray(d?.products)?d:null}catch{return null}}
async function loadProducts(){
  let serverProducts=await api('/api/products');
  if(!serverProducts.length&&!productRecoveryAttempted){
    productRecoveryAttempted=true;const backup=readProductBrowserBackup();
    if(backup?.products?.length){try{toast(`Servidor sem produtos. Recuperando ${backup.products.length} SKU(s) do backup local...`);await api('/api/state/restore-products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({products:backup.products})});serverProducts=await api('/api/products');toast(`${serverProducts.length} SKU(s) recuperadas sem perder o progresso salvo.`)}catch(e){toast(`Backup local encontrado, mas a recuperação falhou: ${e.message}`)}}
  }
  products=serverProducts;if(products.length)saveProductBrowserBackup(products);renderTable();renderKPIs();renderPricing();renderPublish();renderImageStudio();renderCommercial();renderVideos();
}
function guardBlocked(p){if(p?.ml_item_id)return false;return !stockAvailable(p)||Boolean(p.publicationGuard?.blocked)}
function publishedStateLabel(p){return p?.publicationState?.label||(p?.ml_status==='active'?'PUBLICADO E ATIVO':p?.ml_item_id?'PUBLICADO':'')}
function guardLabel(p){if(p?.ml_item_id)return publishedStateLabel(p);const c=String(p.publicationGuard?.code||'');if(c==='CATALOG_STALE')return 'CATÁLOGO MESTRE SALVO';if(c==='CATALOG_MISSING')return 'CATÁLOGO WEDROP AUSENTE';if(c==='OUT_OF_STOCK')return String(p?.availability_status||'').toLowerCase()==='unavailable'?'SKU INDISPONÍVEL':'SKU SEM ESTOQUE';if(c.startsWith('ALREADY_PUBLISHED'))return 'SKU JÁ PUBLICADA';return p.publicationGuard?.label||''}
function catalogVerifiedForPublish(p){return ['optional','optional_no_match'].includes(String(p?.catalogPolicy?.status||''))}
function isReady(p){if(p?.ml_item_id)return false;return !guardBlocked(p)&&catalogVerifiedForPublish(p)&&Boolean(p.readiness?.ready)}
function renderKPIs(){const ready=products.filter(isReady).length,review=products.length-ready,pub=products.filter(p=>p.status==='publicado').length;$('#kProducts').textContent=products.length;$('#kReady').textContent=ready;$('#kReview').textContent=review;$('#kPublished').textContent=pub;renderResumeWork()}

function catalogStateClass(p){
  const st=String(p.catalogPolicy?.status||'unknown');
  if(['catalog_required','catalog_only'].includes(st))return 'danger';
  if(st==='optional')return 'good';
  return 'warn';
}
function categoryLabel(p){return p.category_name||p.category_id||'Pendente';}
function isGenericProductName(v){
  const s=String(v||'').trim().toLowerCase();
  return !s||s.length<5||['importado','produto','item','sem nome','não informado','nao informado'].includes(s);
}
function freightFieldsComplete(p){return Boolean(Number(p?.height_cm)>0&&Number(p?.width_cm)>0&&Number(p?.length_cm)>0&&Number(p?.weight_g)>0)}
function freightSignature(p){return [Number(p?.height_cm)||0,Number(p?.width_cm)||0,Number(p?.length_cm)||0,Number(p?.weight_g)||0].join('|')}
function productNextSteps(p){
  const steps=[];const add=(step)=>{if(!steps.some(x=>x.view===step.view&&x.label===step.label))steps.push(step)};
  if(isGenericProductName(p.product))add({view:'supplier',label:'Atualizar nome/dados no Catálogo WeDrop',level:'danger'});
  if(!p.category_id)add({view:'products',label:'Categoria ainda não identificada — revise os dados do produto',level:'danger'});
  else if((p.technicalCoverage?.requiredMissing||[]).length)add({view:'products',label:`Completar ficha técnica obrigatória (${p.technicalCoverage.requiredFilled||0}/${p.technicalCoverage.requiredTotal||0})`,level:'danger'});
  if(!freightFieldsComplete(p))add({view:'products',label:'Informar altura, largura, comprimento e peso para o frete',level:'danger'});
  if(['unknown','unverified'].includes(String(p.catalogPolicy?.status||'')))add({view:'commercial',label:'Validar categoria e política de catálogo',level:'warn'});
  if((p.imageStudio?.approvedCount||0)<9)add({view:'images',label:'Gerar e aprovar as 9 fotos IA',level:'normal'});
  if(!p.commercialAnalysis?.bestScenario||p.commercialAnalysis?.shippingComplete===false||p.commercialAnalysis?.shippingStale===true)add({view:'commercial',label:'Atualizar preço e cotação de frete',level:'normal'});
  if(!(p.marketproVideo?.id||p.videoReviewed||p.video_url))add({view:'videos',label:'Selecionar vídeo MarketPro ou marcar como revisado',level:'normal'});
  if(Number(pricingRec(p)?.grossUploadPrice||p.price||0)<=0)add({view:'pricing',label:'Definir preço de venda',level:'warn'});
  if(!steps.length)add({view:'publish',label:'Produto completo — revisar publicação',level:'good'});
  return steps;
}
const WORKFLOW_FOCUS_KEY='ra_ml_workflow_focus_v1_8_19';

const PIPELINE_FLOW=[
  {view:'supplier',label:'Catálogo'},
  {view:'import',label:'Importar SKU'},
  {view:'products',label:'Dados'},
  {view:'images',label:'Fotos'},
  {view:'commercial',label:'Preço'},
  {view:'videos',label:'Vídeo'},
  {view:'pricing',label:'Precificação'},
  {view:'publish',label:'Publicar'}
];
function pipelineContextProduct(){
  const f=readWorkflowFocus?.();
  if(f?.productId){const p=products.find(x=>String(x.id)===String(f.productId));if(p)return p;}
  return resumeCandidate?.()||products.find(p=>p.status!=='publicado')||products[0]||null;
}
function pipelineMove(currentView,direction){
  const i=PIPELINE_FLOW.findIndex(x=>x.view===currentView);if(i<0)return;
  const ni=i+(direction<0?-1:1);
  if(ni<0){nav('dashboard');return;}
  if(ni>=PIPELINE_FLOW.length){nav('publish');return;}
  const target=PIPELINE_FLOW[ni],p=pipelineContextProduct();
  if(p&&['products','images','commercial','videos','pricing','publish'].includes(target.view))setWorkflowFocus(p.id,target.view,target.label);
  nav(target.view);
  toast(direction<0?`Voltando para ${target.label}. Você pode corrigir e depois continuar normalmente.`:`Avançando para ${target.label}.`);
}
window.pipelineBack=view=>pipelineMove(view,-1);
window.pipelineNext=view=>pipelineMove(view,1);
function renderPipelineNav(view){
  document.querySelectorAll('.pipelineStageNav').forEach(x=>x.remove());
  const i=PIPELINE_FLOW.findIndex(x=>x.view===view);if(i<0)return;
  const section=document.getElementById(view);if(!section)return;
  const prev=i>0?PIPELINE_FLOW[i-1]:null,next=i<PIPELINE_FLOW.length-1?PIPELINE_FLOW[i+1]:null;
  const el=document.createElement('div');el.className='pipelineStageNav';
  el.innerHTML=`<button class="stageBack" type="button" onclick="${prev?`pipelineBack('${view}')`:`nav('dashboard')`}"><span>←</span><div><small>${prev?'ETAPA ANTERIOR':'INÍCIO'}</small><b>${prev?esc(prev.label):'Dashboard'}</b></div></button><div class="stagePosition"><small>FLUXO DE PUBLICAÇÃO</small><b>${i+1} de ${PIPELINE_FLOW.length} · ${esc(PIPELINE_FLOW[i].label)}</b></div>${next?`<button class="stageNext" type="button" onclick="pipelineNext('${view}')"><div><small>PRÓXIMA ETAPA</small><b>${esc(next.label)}</b></div><span>→</span></button>`:`<button class="stageNext done" type="button" onclick="nav('dashboard')"><div><small>FLUXO</small><b>Voltar ao Dashboard</b></div><span>⌂</span></button>`}`;
  const intro=section.querySelector('.pageIntro');
  if(intro)intro.insertAdjacentElement('afterend',el);else section.prepend(el);
}
function workflowViewLabel(view){return({supplier:'Catálogo WeDrop',products:'Produtos',images:'Fotos IA',commercial:'Inteligência Comercial',videos:'Vídeos MarketPro',pricing:'Precificação',publish:'Publicação'})[view]||view}
function workflowStages(p){
  const cov=p.technicalCoverage||clientTechnicalCoverage(p);
  const dataReady=!isGenericProductName(p.product)&&Boolean(p.category_id)&&!(cov.requiredMissing||[]).length;
  return [
    {key:'products',label:'Dados',done:dataReady},
    {key:'images',label:'Fotos',done:(p.imageStudio?.approvedCount||0)>=9},
    {key:'commercial',label:'Preço',done:Boolean(p.commercialAnalysis?.bestScenario)},
    {key:'videos',label:'Vídeo',done:Boolean(p.marketproVideo?.id||p.videoReviewed||p.video_url)},
    {key:'publish',label:'Publicar',done:Boolean(p.status==='publicado'||isReady(p))}
  ];
}
function workflowTimelineHtml(p,currentView='commercial'){
  return `<div class="workflowLane">${workflowStages(p).map(s=>`<span class="${s.done?'done':''} ${s.key===currentView?'current':''}"><i></i><b>${esc(s.label)}</b></span>`).join('')}</div>`;
}
function nextWorkflowStep(p,currentView){return productNextSteps(p).find(step=>step.view!==currentView)||null}
function stepHelpText(view){return({products:'Revise a categoria e complete os campos obrigatórios desta SKU.',images:'Gere e aprove as 9 imagens para liberar a publicação.',commercial:'O sistema calcula preço, frete e reserva de campanhas automaticamente.',videos:'Associe o vídeo correto ou marque a revisão manual desta SKU.',pricing:'Confira a faixa final de preço antes de publicar.',publish:'A SKU já está pronta. Faça a validação final e publique.'})[view]||'Siga para a próxima etapa desta SKU.'}

function resumeCandidate(){
  const pending=products.filter(p=>p.status!=='publicado'&&productNextSteps(p).length);
  if(!pending.length)return null;
  return pending.slice().sort((a,b)=>{
    const ad=new Date(a.updatedAt||a.createdAt||0).getTime()||0,bd=new Date(b.updatedAt||b.createdAt||0).getTime()||0;
    if(bd!==ad)return bd-ad;
    const ap=workflowStages(a).filter(x=>x.done).length,bp=workflowStages(b).filter(x=>x.done).length;
    return bp-ap;
  })[0];
}
function resumeProgress(p){
  const s=workflowStages(p),done=s.filter(x=>x.done).length,total=s.length;
  return {done,total,pct:Math.round(done/Math.max(1,total)*100)};
}
function renderResumeWork(){
  const el=$('#resumeWorkCard');if(!el)return;
  const p=resumeCandidate();
  if(!p){el.hidden=true;el.innerHTML='';return;}
  const step=productNextSteps(p)[0]||{view:'publish',label:'Revisar publicação'};
  const pr=resumeProgress(p),updated=p.updatedAt||p.createdAt;
  const when=updated?new Date(updated).toLocaleString('pt-BR'):'salvo no banco';
  el.hidden=false;
  el.innerHTML=`<article class="resumeWorkInner"><div class="resumeWorkIcon">↪</div><div class="resumeWorkCopy"><span class="eyebrow">CONTINUAR ONDE PAROU</span><h3>SKU ${esc(p.sku||'sem SKU')} · ${esc(p.seoTitle||p.product||'Produto em andamento')}</h3><p><b>Próxima etapa:</b> ${esc(step.label)}. ${esc(stepHelpText(step.view))}</p><div class="resumeMeta"><span>${pr.done}/${pr.total} etapas concluídas</span><span>Última atualização: ${esc(when)}</span></div><div class="resumeProgress"><i style="width:${pr.pct}%"></i></div></div><div class="resumeWorkActions"><button class="btn primary" onclick="resumeProduct('${esc(p.id)}')">Continuar esta SKU</button><button class="btn ghost" onclick="nav('products')">Ver fila</button></div></article>`;
}
window.resumeProduct=id=>{
  const p=products.find(x=>String(x.id)===String(id));
  if(!p)return toast('A SKU não está mais disponível na fila.');
  const step=productNextSteps(p)[0]||{view:'publish',label:'Revisar publicação'};
  setWorkflowFocus(p.id,step.view,step.label);try{sessionStorage.setItem('ra_product_guide_enabled','1')}catch(_){}
  nav(step.view);
  toast(`Retomando SKU ${p.sku||''}: ${step.label}.`);setTimeout(()=>guideShowProductFlow(p,step.view,{welcome:true}),220);
};
function workflowHintHtml(p,currentView='commercial'){
  const next=nextWorkflowStep(p,currentView);
  if(!next)return '';
  return `<div class="nextWorkflowBox"><div><small>PRÓXIMA ETAPA GUIADA</small><b>${esc(next.label)}</b><span>${esc(stepHelpText(next.view))}</span></div><button class="btn ghost" onclick="goToNextStep('${esc(p.id)}','${esc(currentView)}')">Ir agora</button></div>`;
}
function setWorkflowFocus(productId,view,label=''){
  const p=products.find(x=>String(x.id)===String(productId));
  try{sessionStorage.setItem(WORKFLOW_FOCUS_KEY,JSON.stringify({productId:String(productId),sku:p?.sku||'',view,label,at:Date.now()}))}catch(_){}
}
function readWorkflowFocus(){try{return JSON.parse(sessionStorage.getItem(WORKFLOW_FOCUS_KEY)||'null')}catch(_){return null}}
function clearWorkflowFocus(){try{sessionStorage.removeItem(WORKFLOW_FOCUS_KEY)}catch(_){} }
function applyWorkflowFocus(view){
  const focus=readWorkflowFocus();
  if(!focus||focus.view!==view)return;
  if(Date.now()-Number(focus.at||0)>120000){clearWorkflowFocus();return;}
  if(view==='products'&&focus.sku&&$('#search')){$('#search').value=focus.sku;renderTable();}
  let attempts=0;
  const findAndFocus=()=>{
    attempts++;
    const target=document.querySelector(`[data-product-id="${CSS.escape(String(focus.productId))}"]`);
    if(!target){if(attempts<12)setTimeout(findAndFocus,120);else{clearWorkflowFocus();toast(`SKU ${focus.sku||''}: etapa aberta. Localize o produto nesta tela.`)}return;}
    document.querySelectorAll('.workflowFocus').forEach(x=>x.classList.remove('workflowFocus'));
    target.classList.add('workflowFocus');
    target.scrollIntoView({behavior:'smooth',block:'center'});
    const badge=document.createElement('div');badge.className='workflowFocusBadge';badge.textContent=`SKU ${focus.sku||''} · continue aqui`;
    const badgeHost=target.tagName==='TR'?(target.firstElementChild||target):target;badgeHost.appendChild(badge);
    setTimeout(()=>{target.classList.remove('workflowFocus');badge.remove()},4200);
    clearWorkflowFocus();
  };
  setTimeout(findAndFocus,80);
}
function workflowStageDone(p,view){
  if(view==='products')return auditFor(p).ready;
  if(view==='images')return (p.imageStudio?.approvedCount||0)>=9;
  if(view==='commercial')return Boolean(p.commercialAnalysis?.bestScenario);
  if(view==='videos')return Boolean(p.marketproVideo?.id||p.videoReviewed||p.video_url);
  if(view==='pricing')return Number(pricingRec(p)?.grossUploadPrice||p.price||0)>0;
  if(view==='publish')return p.status==='publicado';
  return false;
}
window.goToNextStep=(id,currentView='commercial')=>{
  const p=products.find(x=>String(x.id)===String(id));
  if(!p)return;
  const next=nextWorkflowStep(p,currentView);
  if(!next)return toast('Não existe próxima etapa pendente para esta SKU agora.');
  setWorkflowFocus(id,next.view,next.label);
  nav(next.view);
  toast(`SKU ${p.sku||''}: indo para ${workflowViewLabel(next.view)}.`);setTimeout(()=>guideShowProductFlow(p,next.view),220);
};
function guideAfterAction(id,currentView='commercial',baseMessage='Etapa concluída.'){
  const p=products.find(x=>String(x.id)===String(id));
  if(!p)return toast(baseMessage);
  const next=nextWorkflowStep(p,currentView);
  if(workflowStageDone(p,currentView)&&next){
    setWorkflowFocus(id,next.view,next.label);
    nav(next.view);setTimeout(()=>guideShowProductFlow(p,next.view),220);
    return toast(`${baseMessage} Próxima etapa: ${workflowViewLabel(next.view)}.`);
  }
  if(workflowStageDone(p,currentView)&&currentView!=='publish'&&isReady(p)){
    setWorkflowFocus(id,'publish','Validar publicação');
    nav('publish');setTimeout(()=>guideShowProductFlow(p,'publish'),220);
    return toast(`${baseMessage} SKU pronta — indo para Publicação.`);
  }
  toast(baseMessage);
}
function ensureCompletionModal(){
  let modal=$('#completionModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='completionModal';
  modal.className='completionModal';
  modal.innerHTML=`<div class="completionBackdrop" data-close-completion></div><article class="completionDialog" role="dialog" aria-modal="true" aria-labelledby="completionTitle"><button class="completionClose" type="button" data-close-completion aria-label="Fechar">×</button><div id="completionBody"></div></article>`;
  document.body.appendChild(modal);
  modal.addEventListener('click',e=>{if(e.target.matches('[data-close-completion]'))closeCompletionModal()});
  return modal;
}
function closeCompletionModal(){ensureCompletionModal().classList.remove('show')}
window.closeCompletionModal=closeCompletionModal;
function openCompletionLoading(p){
  const modal=ensureCompletionModal(),body=$('#completionBody');
  body.innerHTML=`<span class="eyebrow">COMPLETANDO SKU ${esc(p?.sku||'')}</span><h2 id="completionTitle">Pesquisando dados confiáveis, categoria, SEO e atributos...</h2><div class="completionLoader"><i></i><span>Consultando catálogo oficial e anúncios comparáveis do Mercado Livre. Dados ambíguos não serão preenchidos automaticamente.</span></div>`;
  modal.classList.add('show');
}
function fieldChange(before,after,label,getter){
  const a=getter(before),b=getter(after);
  const changed=String(a??'')!==String(b??'');
  return `<div class="completionField ${changed?'changed':''}"><small>${esc(label)}</small><b>${esc(b||'—')}</b>${changed?`<span>Atualizado</span>`:'<span>Sem alteração</span>'}</div>`;
}
function clientTechnicalCoverage(p){
  const all=(p.technicalAttributes?.length?p.technicalAttributes:(p.requiredAttributes||[])).filter(a=>a?.id);
  const values={...(p.attributeValues||{}),...(p.manualAttributes||{})};
  const valueFor=a=>String(values[a.id]??(['MODEL'].includes(a.id)?(p.seoModelExpanded||p.seoModel||p.model||''):a.id==='BRAND'?(p.brand||''):a.id==='GTIN'?(p.gtin||''):'')).trim();
  const filled=a=>valueFor(a).length>0;
  const required=all.filter(a=>a.required===true||(p.requiredAttributes||[]).some(r=>r.id===a.id));
  const rf=required.filter(filled).length, af=all.filter(filled).length;
  const sale=(p.saleTerms||[]).filter(a=>a?.id),saleVals={...(p.saleTermValues||{}),...(p.manualSaleTerms||{})};
  const saleReq=sale.filter(a=>a.required===true),saleFilled=sale.filter(a=>String(saleVals[a.id]??'').trim()).length,saleReqFilled=saleReq.filter(a=>String(saleVals[a.id]??'').trim()).length;
  return {requiredTotal:required.length,requiredFilled:rf,requiredMissing:required.filter(a=>!filled(a)).map(a=>({id:a.id,name:a.name||a.id,section:a.attribute_group_name||'Ficha técnica'})),requiredPercent:required.length?Math.round(rf/required.length*100):100,total:all.length,filled:af,fullPercent:all.length?Math.round(af/all.length*100):100,saleTermsTotal:sale.length,saleTermsFilled:saleFilled,saleTermsRequired:saleReq.length,saleTermsRequiredFilled:saleReqFilled,saleTermsMissing:saleReq.filter(a=>!String(saleVals[a.id]??'').trim()).map(a=>({id:a.id,name:a.name||a.id,section:'Condições de venda'}))};
}
function auditFor(p){
  if(p.publicationAudit?.missing)return p.publicationAudit;
  const cov=p.technicalCoverage||clientTechnicalCoverage(p),missing=[];
  if(!p.category_id)missing.push({id:'CATEGORY',name:'Categoria Mercado Livre',section:'Identidade do anúncio'});
  missing.push(...(cov.requiredMissing||[]),...(cov.saleTermsMissing||[]));
  if(!String(p.description||'').trim())missing.push({id:'DESCRIPTION',name:'Descrição',section:'Descrição'});
  return {ready:missing.length===0,count:missing.length,missing};
}
function fieldBadges({required=false,source='',missing=false}={}){
  const parts=[];
  parts.push(`<span class="fieldTag ${required?'required':'recommended'}">${required?'Obrigatório':'Recomendado'}</span>`);
  if(missing)parts.push('<span class="fieldTag needs">Precisa de você</span>');
  else if(source&&String(source).toLowerCase()!=='manual')parts.push('<span class="fieldTag auto">Preenchido automaticamente</span>');
  else if(String(source).toLowerCase()==='manual')parts.push('<span class="fieldTag manual">Preenchido por você</span>');
  return parts.join('');
}
function controlForAttribute(a,val,dataAttr){
  const opts=(a.values||[]).slice(0,100);
  if(opts.length)return `<select ${dataAttr}><option value="">Selecionar...</option>${opts.map(o=>{const ov=o.name||o.id||'';return `<option value="${esc(ov)}" ${String(val)===String(ov)?'selected':''}>${esc(ov)}</option>`}).join('')}</select>`;
  if(String(a.value_type||'').toLowerCase()==='boolean')return `<select ${dataAttr}><option value="">Selecionar...</option><option value="Sim" ${String(val)==='Sim'?'selected':''}>Sim</option><option value="Não" ${String(val)==='Não'?'selected':''}>Não</option></select>`;
  const unit=a.default_unit||a.allowed_units?.[0]?.name||a.allowed_units?.[0]?.id||'';
  return `<input ${dataAttr} value="${esc(val)}" placeholder="${esc(a.name||a.id)}${unit?` (${esc(unit)})`:''}">`;
}
function technicalAttrField(p,a,{required=false}={}){
  const val=p.manualAttributes?.[a.id]??p.attributeValues?.[a.id]??(a.id==='MODEL'?(p.seoModelExpanded||p.seoModel||p.model||''):a.id==='BRAND'?(p.brand||''):a.id==='GTIN'?(p.gtin||''):'');
  const source=p.attributeSources?.[a.id]||(val?'Mercado Livre / fornecedor':'');
  const missing=required&&!String(val||'').trim();
  return `<label class="techAttr ${missing?'missing':''}" data-field-id="${esc(a.id)}"><span class="techAttrHead"><b>${esc(a.name||a.id)}</b><span class="fieldTags">${fieldBadges({required,source,missing})}</span></span>${controlForAttribute(a,val,`data-attr-id="${esc(a.id)}"`)}${source?`<small class="fieldSource">Fonte: ${esc(source)}</small>`:''}${missing?'<small class="missingText">Falta preencher para publicar</small>':''}</label>`;
}
function saleTermField(p,a){
  const val=p.manualSaleTerms?.[a.id]??p.saleTermValues?.[a.id]??'';const required=Boolean(a.required),missing=required&&!String(val||'').trim();
  return `<label class="techAttr ${missing?'missing':''}" data-field-id="${esc(a.id)}"><span class="techAttrHead"><b>${esc(a.name||a.id)}</b><span class="fieldTags">${fieldBadges({required,source:val?'Mercado Livre / salvo':'',missing})}</span></span>${controlForAttribute(a,val,`data-sale-id="${esc(a.id)}"`)}${missing?'<small class="missingText">Falta preencher para publicar</small>':''}</label>`;
}
function auditPanel(p){
  const audit=auditFor(p),missing=audit.missing||[];
  if(!missing.length)return `<div class="publishAudit ok"><div><b>✓ Dados desta etapa prontos</b><span>Não há campo obrigatório oculto. Você pode avançar quando quiser.</span></div></div>`;
  return `<div class="publishAudit danger"><div><b>Faltam ${missing.length} campo(s) antes da publicação</b><span>O sistema agora mostra exatamente o que falta — nada fica escondido.</span></div><div class="auditMissingList">${missing.map(x=>`<button type="button" onclick="focusMissingField('${esc(x.id)}')"><strong>${esc(x.name)}</strong><small>${esc(x.section||'Ficha técnica')}</small></button>`).join('')}</div></div>`;
}
window.focusMissingField=id=>{const root=$('#completionBody');let el=root?.querySelector(`[data-field-id="${CSS.escape(String(id))}"]`);if(!el&&id==='CATEGORY')el=$('#resolveCategory')?.closest('label');if(!el&&id==='SEO_TITLE')el=$('#resolveSeoTitle')?.closest('label');if(!el&&id==='SEO_MODEL')el=$('#resolveSeoModel')?.closest('label');if(!el&&id==='DESCRIPTION')el=$('#resolveDescription')?.closest('.descriptionEditor');if(el){if(el.tagName==='DETAILS')el.open=true;el.closest('details')&&(el.closest('details').open=true);el.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>el.querySelector?.('input,select,textarea')?.focus?.(),250)}};
function resolutionPanel(p){
  const alternatives=(p.categoryValidation?.alternatives||[]).filter(x=>x.category_id);
  const catOptions=[p.category_id?`<option value="${esc(p.category_id)}" selected>${esc(p.category_name||p.category_id)}</option>`:'<option value="">Selecionar categoria sugerida...</option>',...alternatives.filter(x=>x.category_id!==p.category_id).map(x=>`<option value="${esc(x.category_id)}">${esc(x.category_name||x.category_id)}${x.score!=null?` · ${Math.round(Number(x.score)*100)}%`:''}</option>`)].join('');
  const primary=(p.seoKeywordsPrimary||[]).slice(0,14), secondary=(p.seoKeywordsSecondary||[]).slice(0,18);
  const market=(p.seoAnalysis?.marketTerms||[]).slice(0,8).map(x=>x.term||x), trends=(p.seoAnalysis?.trendTerms||[]).slice(0,8).map(x=>x.term||x), seasonal=(p.seoAnalysis?.seasonalTerms||[]).slice(0,6);
  const all=(p.technicalAttributes?.length?p.technicalAttributes:(p.requiredAttributes||[])).filter(a=>!['SELLER_SKU','GTIN','BRAND','MODEL'].includes(a.id));
  const required=all.filter(a=>a.required===true||(p.requiredAttributes||[]).some(r=>r.id===a.id)).slice(0,100);
  const optional=all.filter(a=>!required.some(r=>r.id===a.id)).slice(0,140);
  const cov=p.technicalCoverage||clientTechnicalCoverage(p), sale=(p.saleTerms||[]).slice(0,80);
  const reqHtml=required.length?`<div class="requiredAttrBox"><div class="requiredTitle"><div><b>Características principais / obrigatórias</b><span>Ficha específica desta categoria do Mercado Livre.</span></div><strong class="coverageBadge ${cov.requiredPercent===100?'ok':'pending'}">${cov.requiredFilled}/${cov.requiredTotal} · ${cov.requiredPercent}%</strong></div><div class="requiredGrid">${required.map(a=>technicalAttrField(p,a,{required:true})).join('')}</div></div>`:'<div class="requiredAttrBox"><b>Nenhum atributo obrigatório adicional retornado para esta categoria.</b></div>';
  const optionalHtml=optional.length?`<details class="technicalMore" ${cov.requiredPercent===100&&cov.fullPercent<100?'open':''}><summary><span><b>Características secundárias / ficha técnica completa</b><small>Os campos são carregados dinamicamente para a categoria deste produto — não existe ficha padrão única.</small></span><strong>${cov.filled}/${cov.total} · ${cov.fullPercent}%</strong></summary><div class="technicalMoreTools"><span>Preencha o máximo possível. Campos automáticos mostram a origem; campos sem confirmação ficam como “Precisa de você”.</span><input type="search" placeholder="Filtrar: INMETRO, idade, medidas, material..." oninput="filterTechAttrs(this.value)"></div><div class="requiredGrid technicalGrid">${optional.map(a=>technicalAttrField(p,a,{required:false})).join('')}</div></details>`:'';
  const saleHtml=sale.length?`<details class="technicalMore saleTerms"><summary><span><b>Condições de venda exigidas pela categoria</b><small>Campos internos/gerenciados pelo Mercado Livre são filtrados automaticamente.</small></span><strong>${Number(cov.saleTermsRequiredFilled||0)}/${Number(cov.saleTermsRequired||0)} obrigatórios</strong></summary><div class="requiredGrid technicalGrid">${sale.map(a=>saleTermField(p,a)).join('')}</div></details>`:'';
  const buttonLabel=cov.requiredPercent===100&&auditFor(p).ready?'Salvar e continuar':'Salvar e verificar pendências';
  const modelLimit=Number(p.modelMaxLength||120);
  return `<section class="resolvePanel">
    <div class="resolveHead"><div><span class="eyebrow">RESOLVER PENDÊNCIAS + SEO + FICHA TÉCNICA</span><h3>Corrigir aqui, sem sair desta tela</h3></div><span class="pill ${p.category_id?'good':'warn'}">${p.category_id?'CATEGORIA IDENTIFICADA':'PRECISA REVISAR'}</span></div>
    ${auditPanel(p)}
    <div class="techCoverageBar"><div><span>OBRIGATÓRIOS</span><b>${cov.requiredPercent}%</b><i><u style="width:${cov.requiredPercent}%"></u></i></div><div><span>FICHA AMPLIADA</span><b>${cov.fullPercent}%</b><i><u style="width:${cov.fullPercent}%"></u></i></div></div>
    <div class="resolveGrid">
      <label>Nome real do produto<input id="resolveProduct" value="${esc(p.product||'')}" placeholder="Nome correto do produto"></label>
      <label>GTIN / EAN<input id="resolveGtin" value="${esc(p.gtin||'')}" placeholder="EAN/GTIN"></label>
      <label>Marca<input id="resolveBrand" value="${esc(p.brand||'')}" placeholder="Marca"></label>
      <label>Modelo factual<input id="resolveModel" value="${esc(p.model||'')}" placeholder="Modelo real do fabricante, se existir"></label>
      <label class="span2" data-field-id="CATEGORY">Categoria Mercado Livre<select id="resolveCategory">${catOptions}</select></label>
      <div class="span2 freightDataBox"><div class="freightDataHead"><div><small>FRETE / LOGÍSTICA</small><b>Medidas e peso usados na cotação</b></div><span class="pill ${p.height_cm&&p.width_cm&&p.length_cm&&p.weight_g?'good':'warn'}">${p.height_cm&&p.width_cm&&p.length_cm&&p.weight_g?'COMPLETO':'PENDENTE'}</span></div><div class="freightFields"><label>Altura (cm)<input id="resolveHeight" inputmode="decimal" value="${esc(p.height_cm||'')}"></label><label>Largura (cm)<input id="resolveWidth" inputmode="decimal" value="${esc(p.width_cm||'')}"></label><label>Comprimento (cm)<input id="resolveLength" inputmode="decimal" value="${esc(p.length_cm||'')}"></label><label>Peso (g)<input id="resolveWeight" inputmode="numeric" value="${esc(p.weight_g||'')}"></label></div><p>Esses campos são independentes da ficha técnica do Mercado Livre. Mesmo com a ficha em 100%, o frete só é calculado quando estas quatro informações estiverem preenchidas.</p></div>
      <label class="span2">Título SEO principal <small>palavras principais · limite ${Number(p.titleMaxLength||60)} caracteres</small><input id="resolveSeoTitle" maxlength="${Number(p.titleMaxLength||60)}" value="${esc(p.seoTitle||'')}"></label>
      <label class="span2 seoSecondaryField">Busca 2 estratégica / SEO <small>até ${modelLimit} caracteres · termos de busca que NÃO repetem o título + sazonalidade relevante</small><input id="resolveSeoModel" maxlength="${modelLimit}" value="${esc(p.seoModelExpanded||p.seoModel||'')}"><span class="seoRule">Prioridade: intenção real de compra → sazonalidade ativa → tendências da categoria → termos recorrentes em vários anúncios equivalentes. Marcas concorrentes, material solto e ruído técnico são descartados. Este campo NÃO substitui o Modelo factual do fabricante.</span></label>
    </div>
    <div class="keywordAudit"><div><small>PALAVRAS PRINCIPAIS</small><p>${primary.length?primary.map(x=>`<span>${esc(x)}</span>`).join(''):'<em>serão calculadas após identificar o produto</em>'}</p></div><div><small>BUSCA 2 ESTRATÉGICA / SEO</small><p>${secondary.length?secondary.map(x=>`<span>${esc(x)}</span>`).join(''):'<em>será calculada sem repetir o título</em>'}</p></div>${seasonal.length?`<div><small>SAZONALIDADE ATIVA</small><p>${seasonal.map(x=>`<span>${esc(x)}</span>`).join('')}</p></div>`:''}${market.length?`<div><small>TERMOS RECORRENTES NO MERCADO</small><p>${market.map(x=>`<span>${esc(x)}</span>`).join('')}</p></div>`:''}${trends.length?`<div><small>TENDÊNCIAS DA CATEGORIA</small><p>${trends.map(x=>`<span>${esc(x)}</span>`).join('')}</p></div>`:''}</div>
    <div class="supplierCapture supplierCaptureVision"><div class="supplierCaptureTop"><div><span class="eyebrow">WEDROP · CAPTURA INTELIGENTE</span><h4>Enviar print + descrição e preencher automaticamente</h4><p>Tire um print da WeDrop mostrando <b>medidas, peso, especificações e itens inclusos</b>. Você também pode colar a descrição. O sistema cruza as duas fontes, extrai somente dados visíveis e preenche a ficha e os campos de frete.</p></div><span class="pill ${status.imageAIConfigured?'good':'warn'}">${status.imageAIConfigured?'LEITURA DE IMAGEM ATIVA':'IMAGEM EXIGE OPENAI_API_KEY'}</span></div><div class="supplierVisionGrid"><label class="supplierImageDrop"><input id="supplierDetailImage" type="file" accept="image/png,image/jpeg,image/webp" onchange="previewSupplierImage(this)"><span>📷</span><b>Adicionar print da WeDrop</b><small>PNG, JPG ou WEBP · prefira a área com medidas e peso</small><img id="supplierImagePreview" alt="Prévia do print WeDrop"></label><div class="supplierTextSide"><textarea id="supplierDetailText" placeholder="Cole aqui também a descrição / especificações da página da WeDrop..."></textarea><div class="supplierButtons"><button class="btn ghost" type="button" onclick="readSupplierClipboard()">Ler área de transferência</button><button class="btn primary" type="button" onclick="extractSupplierVision('${esc(p.id)}')">Extrair dados WeDrop · imagem + texto</button><button class="btn ghost" type="button" onclick="parseSupplierDetails('${esc(p.id)}')">Somente texto</button></div></div></div>${p.supplierDetailCapture?.fields?.length?`<div class="supplierFoundBox"><b>Última captura WeDrop</b><span>${esc(p.supplierDetailCapture.fields.join(' · '))}</span>${p.supplierDetailCapture.shippingDimensionsSource?`<small>Medidas para frete: ${esc(p.supplierDetailCapture.shippingDimensionsSource)}</small>`:''}</div>`:''}</div>
    ${reqHtml}${optionalHtml}${saleHtml}
    <div class="listingProfileBox"><b>Configurações do anúncio</b><label>Condição<select id="resolveCondition"><option value="new" ${(p.listingProfile?.condition||'new')==='new'?'selected':''}>Novo</option><option value="used" ${p.listingProfile?.condition==='used'?'selected':''}>Usado</option></select></label><label class="checkLine"><input id="resolveLocalPickup" type="checkbox" ${p.listingProfile?.local_pick_up?'checked':''}> Oferecer retirada pessoal</label></div>
    <div class="descriptionEditor" data-field-id="DESCRIPTION"><div class="descriptionHead"><div><b>Descrição definitiva do anúncio</b><span>${p.descriptionLocked?'Salva por você · não será reescrita nas novas pesquisas':'Gerada automaticamente com dados confirmados · ao salvar fica protegida'}</span></div><span class="fieldTag ${p.descriptionLocked?'manual':'auto'}">${p.descriptionLocked?'Protegida':'Automática'}</span></div><textarea id="resolveDescription">${esc(p.description||'')}</textarea><div class="descriptionActions"><small>Deve vir pronta com: Sobre o produto · Por que comprar · Benefícios · Especificações · Itens inclusos · CTA. O botão abaixo é apenas para refazer, não deveria ser necessário no fluxo normal.</small><button type="button" class="btn ghost" onclick="saveResolution('${esc(p.id)}',true)">Regenerar descrição otimizada</button></div></div>
    <div class="resolveActions"><button class="btn primary" type="button" onclick="saveResolution('${esc(p.id)}')">${buttonLabel}</button></div>
  </section>`;
}
window.filterTechAttrs=(value)=>{const q=String(value||'').toLowerCase().trim();document.querySelectorAll('#completionBody .technicalGrid .techAttr').forEach(el=>{el.style.display=!q||el.textContent.toLowerCase().includes(q)?'':'none'})};
window.openTechnicalDetails=()=>{const d=document.querySelector('#completionBody .technicalMore');if(d){d.open=true;d.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>d.querySelector('input,select')?.focus(),250)}};
function nextViewAfterTechnical(p){const step=productNextSteps(p).find(x=>x.view!=='products');return step?.view||'images';}
window.readSupplierClipboard=async()=>{try{const text=await navigator.clipboard.readText();if(!text.trim())return toast('A área de transferência está vazia.');$('#supplierDetailText').value=text;toast('Texto da WeDrop colado. Agora clique em Extrair dados WeDrop.')}catch(e){toast('O navegador não permitiu ler automaticamente. Cole o texto manualmente no campo.')}};
window.previewSupplierImage=input=>{const file=input?.files?.[0],img=$('#supplierImagePreview');if(!img)return;if(!file){img.removeAttribute('src');img.classList.remove('show');return;}const url=URL.createObjectURL(file);img.src=url;img.classList.add('show');};
window.extractSupplierVision=async id=>{try{const file=$('#supplierDetailImage')?.files?.[0],text=$('#supplierDetailText')?.value||'';if(!file&&text.trim().length<30)return toast('Adicione um print da WeDrop ou cole a descrição/especificações.');const fd=new FormData();if(file)fd.append('image',file);fd.append('text',text);toast(file?'Lendo o print e cruzando com a descrição da WeDrop...':'Extraindo dados da descrição WeDrop...');const out=await api(`/api/products/${id}/supplier-details/vision`,{method:'POST',body:fd});await loadProducts();let fresh=products.find(x=>String(x.id)===String(id))||out.product;const dims=[fresh.height_cm&&`${fresh.height_cm}cm`,fresh.width_cm&&`${fresh.width_cm}cm`,fresh.length_cm&&`${fresh.length_cm}cm`].filter(Boolean).join(' × ');showCompletionResult(fresh,fresh);toast(`WeDrop lida: ${out.found?.length||0} dado(s).${dims?` Frete ${dims} · ${fresh.weight_g||'?'}g.`:''}`);if(freightFieldsComplete(fresh)){toast(`Medidas completas (${dims}) e peso ${fresh.weight_g} g encontrados. Atualizando a cotação de frete automaticamente...`);try{await api(`/api/products/${encodeURIComponent(id)}/commercial-analyze?sku=${encodeURIComponent(fresh.sku||'')}`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await loadProducts();fresh=products.find(x=>String(x.id)===String(id))||fresh;showCompletionResult(fresh,fresh);toast(fresh.commercialAnalysis?.shippingComplete?'Dados WeDrop salvos e cotação de frete atualizada com sucesso.':'Dados WeDrop salvos. As medidas estão completas, mas o Mercado Livre ainda não retornou uma cotação de frete válida.');}catch(err){toast(`Dados WeDrop salvos. Não consegui atualizar o frete agora: ${err.message}`)}}setTimeout(()=>document.querySelector('#completionBody .freightDataBox')?.scrollIntoView({behavior:'smooth',block:'center'}),250);}catch(e){toast(e.message)}};
window.parseSupplierDetails=async id=>{try{const text=$('#supplierDetailText')?.value||'';if(text.trim().length<30)return toast('Cole primeiro a área de especificações da WeDrop.');toast('Extraindo dados técnicos do fornecedor...');const out=await api(`/api/products/${id}/supplier-details/parse`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});await loadProducts();const fresh=products.find(x=>x.id===id)||out.product;showCompletionResult(fresh,fresh);toast(`WeDrop: ${out.found?.length||0} informação(ões) reconhecida(s) e reaplicadas à ficha.`)}catch(e){toast(e.message)}};
function collectResolutionBody(regenerateDescription=false){
  const attributes={};document.querySelectorAll('#completionBody [data-attr-id]').forEach(el=>{attributes[el.dataset.attrId]=el.value||''});
  const saleTerms={};document.querySelectorAll('#completionBody [data-sale-id]').forEach(el=>{saleTerms[el.dataset.saleId]=el.value||''});
  const body={product:$('#resolveProduct')?.value||'',gtin:$('#resolveGtin')?.value||'',brand:$('#resolveBrand')?.value||'',model:$('#resolveModel')?.value||'',category_id:$('#resolveCategory')?.value||'',seoTitle:$('#resolveSeoTitle')?.value||'',seoModelExpanded:$('#resolveSeoModel')?.value||'',height_cm:$('#resolveHeight')?.value||'',width_cm:$('#resolveWidth')?.value||'',length_cm:$('#resolveLength')?.value||'',weight_g:$('#resolveWeight')?.value||'',attributes,saleTerms,listingProfile:{condition:$('#resolveCondition')?.value||'new',local_pick_up:Boolean($('#resolveLocalPickup')?.checked)}};
  if(regenerateDescription)body.regenerateDescription=true;else body.description=$('#resolveDescription')?.value||'';
  return body;
}
window.saveResolution=async(id,regenerateDescription=false)=>{
  const before=products.find(x=>String(x.id)===String(id));
  const beforeFreight=freightSignature(before||{});
  const body=collectResolutionBody(regenerateDescription);
  try{
    toast(regenerateDescription?'Regenerando a descrição com os dados confirmados...':'Salvando dados e verificando automaticamente o frete...');
    const out=await api(`/api/products/${id}/resolve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    await loadProducts();let fresh=products.find(x=>String(x.id)===String(id))||out;
    if(regenerateDescription){showCompletionResult(out,fresh);toast('Descrição otimizada regenerada e mantida na tela para sua revisão. Clique em Salvar quando estiver aprovada.');setTimeout(()=>{const el=$('#resolveDescription');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.focus();}},180);return;}
    const freightChanged=beforeFreight!==freightSignature(fresh);
    if(freightFieldsComplete(fresh)&&(freightChanged||fresh.commercialAnalysis?.shippingComplete!==true||fresh.commercialAnalysis?.shippingStale===true)){
      toast(`Medidas e peso confirmados (${fresh.height_cm} × ${fresh.width_cm} × ${fresh.length_cm} cm · ${fresh.weight_g} g). Cotando frete automaticamente...`);
      try{await api(`/api/products/${encodeURIComponent(id)}/commercial-analyze?sku=${encodeURIComponent(fresh.sku||'')}`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await loadProducts();fresh=products.find(x=>String(x.id)===String(id))||fresh;toast(fresh.commercialAnalysis?.shippingComplete?'Frete atualizado com sucesso. Preço, lucro e margem foram recalculados.':'Medidas e peso foram salvos, mas o Mercado Livre ainda não retornou uma cotação de frete válida.');}catch(err){toast(`Medidas e peso foram salvos. A cotação automática falhou: ${err.message}`)}
    }
    const cov=fresh.technicalCoverage||clientTechnicalCoverage(fresh),audit=auditFor(fresh);
    if(audit.ready&&cov.requiredPercent===100&&cov.fullPercent===100){const nextView=nextViewAfterTechnical(fresh);setWorkflowFocus(id,nextView,'Próxima etapa');toast(`Dados salvos. Próxima etapa: ${workflowViewLabel(nextView)}.`);closeCompletionModal();setTimeout(()=>{nav(nextView);guideShowProductFlow(fresh,nextView)},450);return;}
    showCompletionResult(out,fresh);
    if(!audit.ready){const names=(audit.missing||[]).slice(0,4).map(x=>x.name).join(', ');toast(`Salvo. Ainda falta: ${names||'ver campos destacados'}.`);setTimeout(()=>{const first=audit.missing?.[0];if(first)focusMissingField(first.id)},140);}else if(cov.fullPercent<100)toast(`Obrigatórios concluídos. Ficha complementar em ${cov.fullPercent}%. Complete mais ou avance.`);else toast('Dados salvos com sucesso.');
  }catch(e){toast(e.message)}
};

function showCompletionResult(before,p){
  const modal=ensureCompletionModal(),body=$('#completionBody');
  const steps=productNextSteps(p);
  const catStatus=String(p.catalogPolicy?.status||'unknown');
  const warnings=[...(p.enrichmentWarnings||[])];
  if(catStatus==='unknown')warnings.push('Domínio/categoria ainda não permitiu validar a política de catálogo.');
  if(!p.category_id)warnings.push('Categoria não foi identificada. O anúncio continua bloqueado para revisão.');
  body.innerHTML=`
    <span class="eyebrow">RESULTADO DO COMPLETAR</span>
    <h2 id="completionTitle">SKU ${esc(p.sku||'')} · ${esc(p.product||'Produto')}</h2>
    <div class="completionSummary">
      <div><small>Qualidade</small><strong>${Number(p.quality?.score||0)}%</strong></div>
      <div><small>Categoria</small><strong>${esc(categoryLabel(p))}</strong></div>
      <div><small>Catálogo</small><strong class="${catalogStateClass(p)}Text">${esc(catStatus.toUpperCase())}</strong></div>
      <div><small>Ficha técnica</small><strong>${Number((p.technicalCoverage||clientTechnicalCoverage(p)).requiredPercent||0)}% obrigatórios</strong></div>
    </div>
    ${p.researchEvidence?`<div class="completionWarnings researchEvidence"><b>Pesquisa automática Mercado Livre · confiança ${Number(p.researchEvidence.score||0)}%</b><span>Fonte: ${esc(p.researchEvidence.source||'Mercado Livre')} ${p.researchEvidence.id?`· ${esc(p.researchEvidence.id)}`:''}</span><span>Preenchido automaticamente: ${esc((p.researchFilledFields||[]).join(', ')||'nenhum campo')}</span><span>${esc((p.researchEvidence.reasons||[]).join(' · '))}</span></div>`:'<div class="completionWarnings"><b>Pesquisa automática</b><span>Nenhuma correspondência com confiança suficiente. O sistema manteve os campos em aberto em vez de inventar dados.</span></div>'}
    <div class="completionFields">
      ${fieldChange(before,p,'Título SEO',x=>x.seoTitle||x.product)}
      ${fieldChange(before,p,'Modelo SEO',x=>x.seoModelExpanded||x.seoModel||x.model)}
      ${fieldChange(before,p,'Categoria',x=>x.category_name||x.category_id)}
      ${fieldChange(before,p,'Domínio',x=>x.domain_id)}
    </div>
    ${warnings.length?`<div class="completionWarnings"><b>Atenção</b>${[...new Set(warnings)].map(w=>`<span>• ${esc(w)}</span>`).join('')}</div>`:''}
    ${resolutionPanel(p)}
    ${(()=>{const c=p.technicalCoverage||clientTechnicalCoverage(p),a=auditFor(p);if(!a.ready)return `<div class="techDecision danger"><b>Ainda não pode avançar</b><span>Faltam ${a.count||0} campo(s): ${esc((a.missing||[]).slice(0,5).map(x=>x.name).join(', '))}. Clique no nome da pendência acima para ir direto ao campo.</span></div>`;if(c.fullPercent<100)return `<div class="techDecision good"><b>Obrigatórios concluídos</b><span>A ficha complementar está em ${c.fullPercent}%. Você pode completar mais informações para maximizar a qualidade ou avançar agora.</span><div><button class="btn ghost" type="button" onclick="openTechnicalDetails()">Completar ficha técnica até 100%</button><button class="btn primary" type="button" data-next-view="${esc(nextViewAfterTechnical(p))}">Avançar para próxima etapa</button></div></div>`;return `<div class="techDecision good"><b>Dados obrigatórios e ficha técnica 100% concluídos</b><span>Não existe campo obrigatório escondido. O próximo salvamento avança automaticamente.</span></div>`})()}
    <div class="completionNext"><h3>Próximas etapas depois dos dados/SEO</h3>${steps.map((s,i)=>`<button type="button" class="completionStep ${s.level||''}" data-next-view="${esc(s.view)}"><b>${i+1}</b><span>${esc(s.label)}</span><strong>→</strong></button>`).join('')}</div>
    <div class="completionActions"><button class="btn ghost" type="button" onclick="closeCompletionModal()">Fechar</button></div>`;
  body.querySelectorAll('[data-next-view]').forEach(btn=>btn.onclick=()=>{setWorkflowFocus(p.id,btn.dataset.nextView,btn.textContent||'Próxima etapa');closeCompletionModal();nav(btn.dataset.nextView)});
  modal.classList.add('show');
}
function showCompletionError(p,e){
  const modal=ensureCompletionModal(),body=$('#completionBody');
  body.innerHTML=`<span class="eyebrow">ERRO AO COMPLETAR</span><h2 id="completionTitle">SKU ${esc(p?.sku||'')}</h2><div class="completionWarnings"><b>Não foi possível concluir</b><span>${esc(e.message||e)}</span></div><div class="completionActions"><button class="btn ghost" type="button" onclick="closeCompletionModal()">Fechar</button></div>`;
  modal.classList.add('show');
}
function renderTable(){
  const q=($('#search')?.value||'').toLowerCase();
  const rows=products.filter(p=>`${p.sku} ${p.product}`.toLowerCase().includes(q));
  $('#productsTable').innerHTML=`<table><thead><tr><th>SKU</th><th>Produto</th><th>Estoque</th><th>Proteção</th><th>Catálogo</th><th>Fotos</th><th>Qualidade</th><th>Custo</th><th>Preço</th><th>Vídeo</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows.map(p=>{
    const gl=guardLabel(p),catStatus=String(p.catalogPolicy?.status||'unknown');
    return `<tr data-product-id="${esc(p.id)}" class="${guardBlocked(p)?'guardBlockedRow':''}">
      <td><b>${esc(p.sku||'—')}</b></td>
      <td>
        <b>${esc(p.seoTitle||p.product||'—')}</b>
        <div class="muted">Categoria: ${esc(categoryLabel(p))}</div>
        <div class="muted">Modelo SEO / busca 2: ${esc(p.seoModelExpanded||p.seoModel||p.model||'—')}</div>${p.seoKeywordsPrimary?.length?`<div class="seoMini">SEO: ${esc(p.seoKeywordsPrimary.slice(0,6).join(' · '))}</div>`:''}
        <div class="sourceBadge ${p.catalogMatch?.found?'':'missing'}">${p.catalogMatch?.found?'✓ dados do fornecedor':'⚠ sem correspondência no fornecedor'}</div>
        ${isGenericProductName(p.product)?'<div class="sourceBadge missing">⚠ nome do produto genérico — revisar catálogo</div>':''}
      </td>
      <td><span class="pill ${stockAvailable(p)?'good':'danger'}">${esc(stockDisplay(p))}</span></td>
      <td>${gl?`<span class="pill danger guardAlert">${esc(gl)}</span>${p.publicationGuard?.existingItems?.length?`<small>${esc(p.publicationGuard.existingItems.join(', '))}</small>`:''}`:'<span class="pill good">LIBERADA</span>'}</td>
      <td><span class="pill ${catalogStateClass(p)}">${esc(catStatus)}</span></td>
      <td><span class="pill ${(p.imageStudio?.approvedCount||0)>=9?'good':''}">${p.imageStudio?.approvedCount||0}/9</span></td>
      <td><div class="quality"><i style="width:${p.quality?.score||0}%"></i></div><small>${p.quality?.score||0}%</small></td>
      <td>${money(p.cost)}</td>
      <td>${money(pricingRec(p)?.grossUploadPrice||p.price)}</td>
      <td>${p.marketproVideo?.id?'✅ MarketPro':p.videoReviewed?'✅ revisado':'⚠ pendente'}</td>
      <td>${(()=>{const a=auditFor(p);const first=a.missing?.[0];return `<span class="pill ${isReady(p)?'good':guardBlocked(p)?'danger':'warn'}">${isReady(p)?'PRONTO':gl||'REVISAR'}</span>${!guardBlocked(p)&&first?`<small class="missingMini">Falta: ${esc(first.name)}${a.count>1?` +${a.count-1}`:''}</small>`:''}`})()}</td>
      <td><button class="mini completeBtn" onclick="enrich('${p.id}',this)" ${guardBlocked(p)?'disabled':''}>${auditFor(p).ready?'Revisar dados':'Completar dados'}</button></td>
    </tr>`}).join('')}</tbody></table>`;
}
window.enrich=async(id,btn)=>{
  const before=products.find(x=>x.id===id);
  if(!before)return toast('Produto não encontrado.');
  const oldText=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent='Completando...'}
  openCompletionLoading(before);
  try{
    await api(`/api/products/${id}/enrich`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    await loadProducts();
    const after=products.find(x=>x.id===id)||before;
    showCompletionResult(before,after);
    toast(`SKU ${after.sku||''} atualizada. Veja o resumo e os próximos passos.`);
  }catch(e){
    showCompletionError(before,e);
    toast(e.message);
  }finally{
    if(btn&&btn.isConnected){btn.disabled=false;btn.textContent=oldText||'Completar dados'}
  }
};
if($('#enrichAll'))$('#enrichAll').onclick=async()=>{
  const q=($('#search')?.value||'').toLowerCase();
  const visible=products.filter(p=>`${p.sku} ${p.product}`.toLowerCase().includes(q)).filter(p=>!guardBlocked(p)).slice(0,10);
  if(!visible.length)return toast('Nenhum produto liberado visível para completar.');
  let ok=0,fail=0;
  for(const p of visible){
    try{await api(`/api/products/${p.id}/enrich`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});ok++}catch{fail++}
  }
  await loadProducts();
  toast(`${ok} produto(s) completados${fail?` · ${fail} com erro`:''}.`);
};
async function loadSettings(){
  settings=await api('/api/settings');
  ['taxRate','commercialTaxRate'].forEach(id=>{if($('#'+id))$('#'+id).value=settings.taxRate||0});
  ['targetMargin','commercialTargetMargin'].forEach(id=>{if($('#'+id))$('#'+id).value=settings.targetMargin||18});
  if($('#commercialCampaignReserve'))$('#commercialCampaignReserve').value=settings.pricingCampaignReservePct??10;
  if($('#pricingCampaignReservePct'))$('#pricingCampaignReservePct').value=settings.pricingCampaignReservePct??10;
  if($('#freeShippingThreshold'))$('#freeShippingThreshold').value=settings.freeShippingThreshold||79;
  if($('#imageGenerationMode'))$('#imageGenerationMode').value=settings.imageGenerationMode||'manual';
  if($('#primaryWarehouseStoreId'))$('#primaryWarehouseStoreId').value=settings.primaryWarehouseStoreId||'';
  loadWarehouseStatus().catch(()=>{});
  if($('#imageModeLabel'))$('#imageModeLabel').textContent=(settings.imageGenerationMode||'manual')==='auto'?'Automático via API':'Manual via ChatGPT Plus';
  if($('#pricingMinMargin'))$('#pricingMinMargin').value=settings.pricingMinMargin??10;if($('#pricingRule'))$('#pricingRule').value=settings.pricingRule||'INT_EXT';if($('#autoPricingEnabled'))$('#autoPricingEnabled').checked=Boolean(settings.autoPricingEnabled);
  if($('#adsCampaignName'))$('#adsCampaignName').value=settings.adsCampaignName||'Rede Achados BR - Automático';if($('#adsDailyBudget'))$('#adsDailyBudget').value=settings.adsDailyBudget||0;if($('#adsTargetRoas'))$('#adsTargetRoas').value=settings.adsTargetRoas||6;if($('#adsMinMargin'))$('#adsMinMargin').value=settings.adsMinMargin??10;if($('#adsPrePriceReservePct'))$('#adsPrePriceReservePct').value=settings.adsPrePriceReservePct??5;if($('#adsAttributionDays'))$('#adsAttributionDays').value=settings.adsAttributionDays??14;if($('#adsMinClicksBeforePause'))$('#adsMinClicksBeforePause').value=settings.adsMinClicksBeforePause??30;if($('#adsMaxProducts'))$('#adsMaxProducts').value=settings.adsMaxProducts||20;if($('#autoAdsEnabled'))$('#autoAdsEnabled').checked=Boolean(settings.autoAdsEnabled);
}
async function saveSettings(fromCommercial=false){
  const tax=$(fromCommercial?'#commercialTaxRate':'#taxRate'),margin=$(fromCommercial?'#commercialTargetMargin':'#targetMargin');
  const body={taxRate:tax?.value??settings.taxRate??0,targetMargin:margin?.value??settings.targetMargin??18,primaryWarehouseStoreId:$('#primaryWarehouseStoreId')?.value??settings.primaryWarehouseStoreId??''};
  if(fromCommercial)Object.assign(body,{freeShippingThreshold:$('#freeShippingThreshold')?.value??settings.freeShippingThreshold??79,pricingCampaignReservePct:$('#commercialCampaignReserve')?.value??settings.pricingCampaignReservePct??10,requireVideoReview:true});
  settings=await api('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});await loadSettings();toast('Padrões automáticos salvos.');
}
if($('#saveSettings'))$('#saveSettings').onclick=()=>saveSettings(false);if($('#saveCommercialSettings'))$('#saveCommercialSettings').onclick=()=>saveSettings(true);if($('#saveImageMode'))$('#saveImageMode').onclick=async()=>{try{const mode=$('#imageGenerationMode').value;settings=await api('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({imageGenerationMode:mode})});status.imageGenerationMode=mode;if($('#imageModeLabel'))$('#imageModeLabel').textContent=mode==='auto'?'Automático via API':'Manual via ChatGPT Plus';toast(mode==='auto'?'Modo automático definido como padrão.':'Modo manual via ChatGPT Plus definido como padrão.')}catch(e){toast(e.message)}};
function imageSlotHtml(x,slot,pid){
  const n=String(slot).padStart(2,'0');
  const dragAttrs=`data-image-slot="${slot}" data-product-id="${esc(pid)}" ondragover="imageSlotDragOver(event)" ondragleave="imageSlotDragLeave(event)" ondrop="imageSlotDrop(event,'${esc(pid)}',${slot})"`;
  if(!x)return`<div class="imageSlot pending imageDropTarget" ${dragAttrs}><div class="dragSlotHint">Solte uma foto aqui</div><b>${n}</b><span>Aguardando</span><div class="slotActions"><button class="mini" onclick="uploadManualSlot('${pid}',${slot})">Enviar foto</button></div></div>`;
  const cls=x.status==='approved'?'approved':x.status==='review'?'review':x.status==='blocked'||x.status==='error'?'error':'pending';
  const manual=x.source==='manual-chatgpt-plus';
  const fidelity=x.status==='approved'?(manual?'Aprovada manualmente':`Fidelidade ${x.fidelity?.score||'—'}%`):esc(x.error||x.status);
  return`<div class="imageSlot ${cls} imageDraggable" draggable="true" ${dragAttrs} ondragstart="imageSlotDragStart(event,'${esc(pid)}',${slot})" ondragend="imageSlotDragEnd(event)"><div class="dragHandle" title="Clique e arraste para trocar de posição">↕ <span>Arraste para trocar posição</span></div>${x.path?`<img src="${x.path}" alt="Foto ${slot}" loading="lazy" draggable="false">`:`<div class="slotBlank">${n}</div>`}<div class="slotMeta"><b>Posição ${n}</b><span>${esc(x.title||x.status)}</span><small>${fidelity}${manual?' · ChatGPT Plus/upload':''}</small></div><div class="slotActions">${manual&&x.status!=='approved'?`<button class="mini approve" onclick="approveManualSlot('${pid}',${slot})">Aprovar</button>`:''}<button class="mini" onclick="uploadManualSlot('${pid}',${slot})">Trocar</button>${manual?`<button class="mini dangerMini" onclick="deleteManualSlot('${pid}',${slot})">Excluir</button>`:''}</div></div>`;
}
function renderImageStudio(){
  const el=$('#imageStudioCards');if(!el)return;
  el.innerHTML=products.length?products.map(p=>{
    const items=p.imageStudio?.items||[],approved=p.imageStudio?.approvedCount||0,st=p.imageStudio?.status||'pending';
    const manualCount=items.filter(x=>x.source==='manual-chatgpt-plus'&&x.path).length;
    return`<article data-product-id="${esc(p.id)}" class="imageProduct ${guardBlocked(p)?'productBlocked':''}"><div class="imageProductHead"><div><span class="eyebrow">${esc(p.sku||'SEM SKU')}</span><h3>${esc(p.seoTitle||p.product||'Produto')}</h3><p class="muted">${(p.images||[]).length} referência(s) · Embalagem ${p.packaging_image_url?'OK':'pendente'} · ${approved}/9 aprovadas · ${manualCount} manual(is)</p>${guardBlocked(p)?`<span class="pill danger">${esc(guardLabel(p))}</span>`:''}</div><div class="imageHeadActions"><span class="pill ${approved===9?'good':st==='error'?'warn':''}">${esc(st)}</span><button class="btn primary" onclick="generateImages('${p.id}')" ${guardBlocked(p)||!status.imageAIConfigured?'disabled':''}>⚡ Automático</button><button class="btn ghost" onclick="copyImagePrompts('${p.id}')">✦ Copiar prompts</button><button class="btn ghost" onclick="uploadManualBatch('${p.id}')">Enviar 9 fotos</button>${manualCount?`<button class="btn ghost" onclick="approveAllManual('${p.id}')">Aprovar enviadas</button>`:''}</div></div><div class="manualHint"><b>Manual com ChatGPT Plus:</b> copie os prompts, gere as imagens no ChatGPT e envie aqui. Para envio em lote, prefira arquivos nomeados <b>01</b> a <b>09</b>. <strong class="dragInstruction">Para reorganizar, clique e arraste uma foto sobre outra: as duas trocam de posição.</strong></div><div class="imageGrid">${[1,2,3,4,5,6,7,8,9].map(n=>imageSlotHtml(items.find(x=>x.slot===n),n,p.id)).join('')}</div></article>`;
  }).join(''):'<article class="panel">Importe produtos com fotos de referência primeiro.</article>';
}
window.generateImages=async id=>{try{if(!status.imageAIConfigured)return toast('Modo automático exige OPENAI_API_KEY. Use o modo manual com ChatGPT Plus ou configure a API.');await api(`/api/products/${id}/images/generate`,{method:'POST'});toast('Produto entrou na fila automática das 9 fotos.');await loadProducts();pollImages()}catch(e){toast(e.message)}};
if($('#generateAllImages'))$('#generateAllImages').onclick=async()=>{try{if(!status.imageAIConfigured)return toast('Modo automático exige OPENAI_API_KEY.');const d=await api('/api/images/generate-all',{method:'POST'});toast(`${d.queued} produto(s) entraram na fila automática.`);pollImages()}catch(e){toast(e.message)}};
window.copyImagePrompts=async id=>{try{const d=await api(`/api/products/${id}/images/manual-prompts`);await navigator.clipboard.writeText(d.prompts);toast('Prompts das 9 fotos copiados. Cole no ChatGPT Plus e gere as imagens.')}catch(e){toast(e.message)}};
function pickImages({multiple=false}={}){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=multiple;input.onchange=()=>resolve([...input.files]);input.click()})}

let imageDragState=null;
window.imageSlotDragStart=(event,pid,slot)=>{
  imageDragState={pid:String(pid),slot:Number(slot)};
  event.currentTarget?.classList.add('dragging');
  try{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',JSON.stringify(imageDragState));}catch(_){}
};
window.imageSlotDragOver=(event)=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';event.currentTarget?.classList.add('dragOver')};
window.imageSlotDragLeave=(event)=>{event.currentTarget?.classList.remove('dragOver')};
window.imageSlotDragEnd=(event)=>{event.currentTarget?.classList.remove('dragging');document.querySelectorAll('.imageSlot.dragOver').forEach(x=>x.classList.remove('dragOver'))};
window.imageSlotDrop=async(event,pid,toSlot)=>{
  event.preventDefault();event.currentTarget?.classList.remove('dragOver');
  let state=imageDragState;
  if(!state){try{state=JSON.parse(event.dataTransfer?.getData('text/plain')||'null')}catch(_){}}
  if(!state||String(state.pid)!==String(pid))return toast('Só é possível trocar fotos dentro da mesma SKU.');
  const fromSlot=Number(state.slot),target=Number(toSlot);imageDragState=null;
  if(!fromSlot||!target||fromSlot===target)return;
  try{
    toast(`Trocando posições ${String(fromSlot).padStart(2,'0')} ↔ ${String(target).padStart(2,'0')}...`);
    const d=await api(`/api/products/${encodeURIComponent(pid)}/images/swap`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fromSlot,toSlot:target})});
    await loadProducts();
    toast(d.movedOnly?`Foto movida para a posição ${String(target).padStart(2,'0')}.`:`Fotos ${String(fromSlot).padStart(2,'0')} e ${String(target).padStart(2,'0')} trocaram de posição.`);
  }catch(e){toast(e.message)}
};
async function sendManualFiles(id,files,slots=[]){if(!files?.length)return;const fd=new FormData();files.slice(0,9).forEach(f=>fd.append('files',f));if(slots.length)fd.append('slots',slots.join(','));toast('Enviando imagens manuais...');const d=await api(`/api/products/${id}/images/manual`,{method:'POST',body:fd});await loadProducts();toast(`${d.saved} imagem(ns) enviada(s). Revise e aprove antes de publicar.`)}
window.uploadManualSlot=async(id,slot)=>{try{const files=await pickImages();if(files.length)await sendManualFiles(id,files,[slot])}catch(e){toast(e.message)}};
window.uploadManualBatch=async id=>{try{const files=await pickImages({multiple:true});if(!files.length)return;if(files.length>9)return toast('Selecione no máximo 9 imagens.');await sendManualFiles(id,files)}catch(e){toast(e.message)}};
window.approveManualSlot=async(id,slot)=>{try{await api(`/api/products/${id}/images/manual/approve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slots:[slot]})});await loadProducts();guideAfterAction(id,'images',`Foto ${String(slot).padStart(2,'0')} aprovada manualmente.`)}catch(e){toast(e.message)}};
window.approveAllManual=async id=>{try{if(!confirm('Aprovar todas as imagens manuais enviadas para este produto? Confirme somente se o produto está fiel à referência.'))return;const d=await api(`/api/products/${id}/images/manual/approve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({all:true})});await loadProducts();guideAfterAction(id,'images',`${d.approvedCount}/9 fotos aprovadas.`)}catch(e){toast(e.message)}};
window.deleteManualSlot=async(id,slot)=>{try{if(!confirm(`Excluir a foto ${String(slot).padStart(2,'0')}?`))return;await api(`/api/products/${id}/images/manual/${slot}`,{method:'DELETE'});await loadProducts();toast('Foto removida.')}catch(e){toast(e.message)}};
let imagePoll=null;function pollImages(){clearInterval(imagePoll);let rounds=0;imagePoll=setInterval(async()=>{rounds++;try{await loadProducts();const busy=products.some(p=>['queued','generating'].includes(p.imageStudio?.status));if(!busy||rounds>120)clearInterval(imagePoll)}catch{}},5000)}
let commercialContext=null;
async function loadCommercialContext(){
  try{
    commercialContext=await api('/api/commercial/context');
    const o=commercialContext?.origin||{}; const statusEl=$('#commercialOriginStatus'), sourceEl=$('#commercialOriginSource');
    if(statusEl)statusEl.textContent=o.zipCode?String(o.zipCode).replace(/(\d{5})(\d{3})/,'$1-$2'):'Não localizado';
    if(sourceEl)sourceEl.textContent=o.zipCode?`${o.source}${o.addressLine?` · ${o.addressLine}`:''}`:'O sistema não encontrou CEP no catálogo nem na conta. Configure WEDROP_ORIGIN_ZIP_CODE uma única vez no Render.';
  }catch(e){
    if($('#commercialOriginStatus'))$('#commercialOriginStatus').textContent='Não localizado';
    if($('#commercialOriginSource'))$('#commercialOriginSource').textContent='Não foi possível consultar a origem automática agora.';
  }
}
function scenarioBadge(s){if(!s)return'<span class="pill warn">pendente</span>';return`<span class="pill good">${s.name} · ${money(s.price)} · lucro ${money(s.profit)}</span>`}
function logisticName(t){return({drop_off:'Mercado Envios / Drop off',xd_drop_off:'Mercado Envios Places',cross_docking:'Coleta Mercado Livre',self_service:'Envios Flex',fulfillment:'Mercado Envios Full',default:'Logística padrão',custom:'Envio personalizado'})[t]||t||'Automática'}
function pricingRec(p){const r=p?.priceRecommendation||p?.commercialAnalysis?.pricingRecommendation||null;if(typeof r==='number')return{grossUploadPrice:r,minimumSalePrice:r,campaignPrice:r,targetMargin:settings.targetMargin||18,campaignReservePct:0,adsReservePct:0,sourceCost:p?.cost||0};return r}
function adsPotentialForProduct(p){return p.adsRecommendation||p.commercialAnalysis?.adsRecommendation||null}
function clampVisual(v,min=0,max=100){const n=Number(v||0);return Math.max(min,Math.min(max,Number.isFinite(n)?n:0))}
function commercialDecisionFor(p,sc,rec,pot,targetMargin){
  const analysis=p?.commercialAnalysis||{};
  const profit=Number(sc?.profit||0),margin=Number(sc?.margin||0),target=Number(targetMargin||rec?.targetMargin||18);
  const next=nextWorkflowStep(p,'commercial');
  if(!rec||!sc)return{tone:'review',icon:'!',label:'Revisar antes de publicar',text:'A análise comercial ainda não fechou preço, taxas, frete e lucro do cenário recomendado.',detail:'Execute a análise automática para concluir a decisão.',action:'reanalyze'};
  if(p?.catalogPolicy?.blocked)return{tone:'review',icon:'!',label:'Revisar catálogo antes de publicar',text:'A política de catálogo desta SKU exige revisão antes da publicação.',detail:p.catalogPolicy?.reason||'Revise a categoria e a política de catálogo.',action:'reanalyze'};
  if(['unknown','unverified',''].includes(String(p?.catalogPolicy?.status||'')))return{tone:'review',icon:'!',label:'Catálogo ainda não validado',text:'Preço, fotos e vídeo podem estar prontos, mas a validação de catálogo ainda não foi concluída.',detail:'A publicação final fica bloqueada até o Mercado Livre confirmar a estratégia de catálogo. Use Reanalisar agora após a nova tentativa de validação.',action:'reanalyze'};
  if(profit<=0||margin<target)return{tone:'review',icon:'!',label:'Revisar antes de publicar',text:`O cenário atual projeta ${money(profit)} de lucro e ${pct(margin)} de margem, abaixo da proteção configurada.`,detail:`Meta de margem: ${pct(target)}. Recalcule o preço ou ajuste a estratégia.`,action:'reanalyze'};
  if(isReady(p))return{tone:'publish',icon:'✓',label:'Pode publicar',text:`Preço, margem e lucro estão protegidos. Lucro estimado ${money(profit)} com margem de ${pct(margin)}.`,detail:'A SKU está liberada para a validação final de publicação.',action:'publish'};
  if(pot?.eligible)return{tone:'ads',icon:'↗',label:'Boa para ADS',text:`O cenário comercial está saudável e o potencial de ADS foi aprovado em ${Number(pot.score||0)}/100.`,detail:`ROAS sugerido ${Number(pot.recommendedRoas||0).toFixed(2)}x · orçamento ${money(pot.recommendedDailyBudget)}/dia. ${next?`Próxima etapa: ${next.label}.`:''}`,action:'next'};
  return{tone:'advance',icon:'→',label:'Pode avançar',text:`A precificação está protegida com ${money(profit)} de lucro estimado e ${pct(margin)} de margem.`,detail:next?`Continue pela próxima etapa: ${next.label}.`:'Continue a revisão final da SKU.',action:'next'};
}
function decisionActionHtml(p,d){
  if(d.action==='reanalyze')return `<button class="decisionBtn" onclick="commercialAnalyze('${esc(p.id)}','${esc(p.sku||'')}')">Reanalisar agora</button>`;
  if(d.action==='publish')return `<button class="decisionBtn" onclick="goToNextStep('${esc(p.id)}','commercial')">Ir para publicação</button>`;
  if(d.action==='next'&&nextWorkflowStep(p,'commercial'))return `<button class="decisionBtn" onclick="goToNextStep('${esc(p.id)}','commercial')">Continuar fluxo</button>`;
  return '';
}
function triggerCommercialRecalcPulse(id){
  const el=document.querySelector(`[data-product-id="${CSS.escape(String(id))}"] .pricePremiumShowcase`);
  if(!el)return;
  el.classList.remove('priceRecalcPulse');void el.offsetWidth;el.classList.add('priceRecalcPulse');
  clearTimeout(el._recalcTimer);el._recalcTimer=setTimeout(()=>el.classList.remove('priceRecalcPulse'),760);
}

function catalogPolicyNotice(policy){
  const reason=String(policy?.reason||'').trim();
  if(/PA_UNAUTHORIZED_RESULT_FROM_POLICIES|At least one policy returned UNAUTHORIZED|PolicyAgent/i.test(reason)){
    return `<div class="catalogPermissionNotice"><div class="catalogPermissionIcon">!</div><div><b>Validação de catálogo pendente por permissão da API</b><span>O Mercado Livre recusou esta consulta por autorização da aplicação. Isso não significa que o produto ou a categoria estejam errados. Revise a permissão funcional correspondente no DevCenter e reconecte a conta.</span></div></div>`;
  }
  return `<p class="muted">${esc(reason||'A análise validará catálogo e domínio automaticamente.')}</p>`;
}
function renderCommercial(){
  const el=$('#commercialCards');if(!el)return;
  el.innerHTML=products.length?products.map(p=>{
    const a=p.commercialAnalysis,rec=pricingRec(p),pot=adsPotentialForProduct(p),season=(p.seoResearch?.seasonal||a?.seasonal||[]).map(x=>`${x.name} (${x.days}d)`).join(' · '),origin=a?.origin,logRows=(a?.logisticsComparison||[]).filter(x=>x.available).slice(0,4),margin=Number(rec?.targetMargin||a?.targetMargin||settings.targetMargin||18);
    const sc=a?.recommendedScenario||a?.bestScenario||null;
    const listingLabel=sc?.listingType==='gold_pro'?'Premium':sc?.listingType==='gold_special'?'Clássico':'Automático';
    const totalImpact=Number(sc?(Number(sc.fee||0)+Number(sc.shipping||0)):0);
    const netProfit=Number(sc?.profit||0),netMargin=Number(sc?.margin||0);
    const profitTone=sc?(netProfit>=0?'positive':'negative'):'neutral';
    const marginTone=sc?(netMargin>=margin?'positive':'warning'):'neutral';
    const profitRate=sc&&Number(rec?.grossUploadPrice)>0?(netProfit/Number(rec.grossUploadPrice))*100:0;
    const profitFill=clampVisual(profitRate*2.5),marginFill=clampVisual((netMargin/70)*100),marginTarget=clampVisual((margin/70)*100);
    const decision=commercialDecisionFor(p,sc,rec,pot,margin);
    const catalogClass=p.catalogPolicy?.blocked?'danger':['optional','optional_no_match'].includes(p.catalogPolicy?.status)?'good':'warn';
    const adsClass=pot?.eligible?'good':pot?'warn':'neutral';
    return `<article data-product-id="${esc(p.id)}" class="productCard commercialCard">
      <div class="cardTop"><div><span class="eyebrow">${esc(p.sku||'SEM SKU')}</span><h3>${esc(p.seoTitle||p.product||p.sku)}</h3></div><span class="pill ${catalogClass}">CATÁLOGO ${esc((p.catalogPolicy?.status||'pendente').toUpperCase())}</span></div>
      ${catalogPolicyNotice(p.catalogPolicy)}
      ${workflowTimelineHtml(p,'commercial')}
      ${rec?`<div class="pricePremiumShowcase"><div class="priceMainCard gross"><span class="mainPriceIcon">ML</span><small>PREÇO BRUTO PARA SUBIR</small><strong id="preview-gross-${p.id}">${money(rec.grossUploadPrice)}</strong><span class="lead">Preço sugerido para subir no Mercado Livre com proteção de margem, reserva para campanha e espaço para estratégias comerciais.</span><div class="priceBadgeRow"><span class="metricBadge premium">${esc(listingLabel)}</span><span class="metricBadge blue">Campanha ${pct(rec.campaignReservePct)}</span><span class="metricBadge ${Number(rec.adsReservePct)>0?'gold':'muted'}">ADS ${pct(rec.adsReservePct)}</span></div></div><div class="priceMetricGrid"><div class="priceMetricCard cost"><span class="metricIcon">R$</span><small>CUSTO WEDROP</small><b>${money(rec.sourceCost||p.cost)}</b><span>Base oficial do fornecedor usada no cálculo</span></div><div class="priceMetricCard safe"><span class="metricIcon">✓</span><small>PREÇO MÍNIMO PROTEGIDO</small><b id="preview-min-${p.id}">${money(rec.minimumSalePrice)}</b><span>Protege a operação com meta de ${pct(rec.targetMargin)}</span></div><div class="priceMetricCard campaign"><span class="metricIcon">↘</span><small>PREÇO APÓS RESERVA</small><b id="preview-campaign-${p.id}">${money(rec.campaignPrice)}</b><span>Faixa pensada para oferta relâmpago e campanha</span></div><div class="priceMetricCard profit ${profitTone}"><span class="metricIcon">↗</span><small>LUCRO LÍQUIDO ESTIMADO</small><b>${sc?money(netProfit):'Aguardando'}</b><span>${sc?'Cenário recomendado com taxas e frete já considerados':'Disponível após análise completa do cenário'}</span><div class="metricProgress"><i style="width:${profitFill}%"></i></div><em>${sc?`${pct(profitRate)} do preço bruto`:'Aguardando cenário'}</em></div><div class="priceMetricCard margin ${marginTone}"><span class="metricIcon">%</span><small>MARGEM ESTIMADA</small><b id="metric-margin-${p.id}">${sc?pct(netMargin):pct(rec.targetMargin)}</b><span>${sc?`Meta ${pct(rec.targetMargin)} · leitura rápida da saúde da SKU`:`Meta comercial ${pct(rec.targetMargin)}`}</span><div class="metricProgress marginProgress"><i style="width:${marginFill}%"></i><u style="left:${marginTarget}%"></u></div><em>${sc?`${netMargin>=margin?'Meta atingida':'Abaixo da meta'} · alvo ${pct(margin)}`:'Meta comercial'}</em></div><div class="priceMetricCard fee"><span class="metricIcon">∑</span><small>TAXAS + FRETE</small><b>${sc?money(totalImpact):'Aguardando'}</b><span>${sc?`${money(sc.fee||0)} em taxas · ${money(sc.shipping||0)} em frete`:'Cotação exibida quando o cenário estiver fechado'}</span></div></div></div>`:`<div class="autoPricePending"><b>Preço ainda não calculado.</b><span>O sistema usará o custo ${money(p.cost)} da SKU — não é necessário preencher um preço.</span></div>`}
      <div class="commercialDecision ${decision.tone}"><div class="decisionIcon">${decision.icon}</div><div class="decisionCopy"><small>DECISÃO RECOMENDADA PELA IA COMERCIAL</small><strong>${esc(decision.label)}</strong><p>${esc(decision.text)}</p><span>${esc(decision.detail)}</span></div>${decisionActionHtml(p,decision)}</div>
      <div class="intelGrid"><div><small>ADS / IA DE MERCADO</small>${pot?`<span class="pill ${adsClass}">${esc(pot.label)} · ${Number(pot.score||0)}/100</span><b>${pot.eligible?`ROAS ${Number(pot.recommendedRoas||0).toFixed(2)}x · ${money(pot.recommendedDailyBudget)}/dia`:'Sem reserva/ativação prioritária'}</b>`:'<b>será decidido automaticamente</b>'}</div><div><small>SAZONALIDADE</small><b>${esc(season||'Nenhuma janela forte nos próximos 45 dias')}</b></div><div><small>LOGÍSTICA</small><b>${esc(a?.logisticLabel||'automática')}</b><span>${a?.shippingComplete?'frete cotado com dimensões reais':'dimensões/frete ainda pendentes'}</span></div><div><small>ORIGEM AUTOMÁTICA</small><b>${origin?.zipCode?esc(String(origin.zipCode).replace(/(\d{5})(\d{3})/,'$1-$2')):'automática'}</b><span>${esc(origin?.source||'será localizada na análise')}</span></div></div>
      ${logRows.length?`<div class="logisticsCompare"><small>MODALIDADES TESTADAS AUTOMATICAMENTE</small>${logRows.map(x=>`<span class="${x.selected?'selected':''}"><b>${esc(x.label||logisticName(x.type))}</b>${x.best?` · lucro ${money(x.best.profit)} · margem ${pct(x.best.margin)} · frete ${money(x.best.shipping)}`:' · sem cotação válida'}</span>`).join('')}</div>`:''}
      ${rec?`<details class="marginInspector"><summary>Verificar margem manualmente (opcional)</summary><div class="marginSliderHead"><b>Margem desejada</b><strong id="margin-value-${p.id}">${margin.toFixed(0)}%</strong></div><input class="marginSlider" id="margin-${p.id}" type="range" min="5" max="70" step="1" value="${margin}" oninput="previewMargin('${p.id}',this.value)" onchange="repriceMargin('${p.id}','${esc(p.sku||'')}',this.value)"><div class="marginScale"><span>5%</span><span>70%</span></div><p class="muted">Ao soltar a barra, a SKU é recalculada e, se esta etapa ficar pronta, você será levado automaticamente para a próxima fase.</p></details>`:''}
      ${workflowHintHtml(p,'commercial')}
      <div class="commercialActionRow"><button class="btn primary wide" onclick="commercialAnalyze('${p.id}','${esc(p.sku||'')}')">${a?'Reanalisar tudo automaticamente':'Analisar e precificar automaticamente'}</button>${nextWorkflowStep(p,'commercial')?`<button class="btn ghost wide" onclick="goToNextStep('${p.id}','commercial')">Ir para próxima etapa</button>`:''}</div>
    </article>`;
  }).join(''):'<article class="panel">Importe produtos primeiro.</article>';
}
window.previewMargin=(id,value)=>{const p=products.find(x=>String(x.id)===String(id));const rec=pricingRec(p);if(!rec)return;const m=Math.max(5,Math.min(70,Number(value||rec.targetMargin||18))),old=Math.max(.01,Number(rec.targetMargin||18)),min=Math.max(Number(rec.sourceCost||p?.cost||0)+.01,Number(rec.minimumSalePrice||0)*(1+(m-old)/100)),reserve=Math.max(0,Math.min(60,Number(rec.campaignReservePct||0))),gross=min/Math.max(.05,1-reserve/100);const mv=$(`#margin-value-${CSS.escape(id)}`),mi=$(`#preview-min-${CSS.escape(id)}`),gr=$(`#preview-gross-${CSS.escape(id)}`),cp=$(`#preview-campaign-${CSS.escape(id)}`);if(mv)mv.textContent=`${m.toFixed(0)}%`;if(mi)mi.textContent=money(min);if(gr)gr.textContent=money(gross);if(cp)cp.textContent=money(gross*(1-reserve/100));triggerCommercialRecalcPulse(id);};
window.repriceMargin=async(id,sku,value)=>{await window.commercialAnalyze(id,sku,Number(value));};
window.commercialAnalyze=async(id,sku='',margin=null)=>{try{toast('Analisando mercado, potencial de ADS, tarifas, frete e preço bruto automaticamente...');const body={};if(margin!=null)body.margin=Number(margin);await api(`/api/products/${encodeURIComponent(id)}/commercial-analyze?sku=${encodeURIComponent(sku||'')}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});await loadProducts();setTimeout(()=>triggerCommercialRecalcPulse(id),60);guideAfterAction(id,'commercial','Inteligência comercial concluída: preço mínimo, preço bruto e ADS atualizados.')}catch(e){toast(e.message)}};
if($('#analyzeAllCommercial'))$('#analyzeAllCommercial').onclick=async()=>{try{toast('Analisando automaticamente os primeiros 5 SKUs...');const d=await api('/api/commercial/analyze-all',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({limit:5})});await loadProducts();const errors=d.result.filter(x=>!x.ok).length;toast(`${d.count} analisado(s); ${errors} com pendência.`)}catch(e){toast(e.message)}};
function renderPricing(){if(!$('#pricingCards'))return;$('#pricingCards').innerHTML=products.length?products.map(p=>{const a=p.commercialAnalysis,rec=pricingRec(p),pot=adsPotentialForProduct(p);return`<article data-product-id="${esc(p.id)}" class="productCard pricingProductCard"><span class="eyebrow">${esc(p.sku||'SEM SKU')}</span><h3>${esc(p.seoTitle||p.product||p.sku)}</h3><div class="meta">Custo fornecedor ${money(p.cost)}${p.price?` · preço atual ${money(p.price)}`:''}</div>${rec?`<div class="pricingNumbers"><div><small>PISO / VENDA PROTEGIDA</small><strong>${money(rec.minimumSalePrice)}</strong><span>margem ${pct(rec.targetMargin)}</span></div><div class="gross"><small>SUBIR NO MERCADO LIVRE</small><strong>${money(rec.grossUploadPrice)}</strong><span>${pct(rec.campaignReservePct)} reservados para campanhas</span></div><div><small>ADS</small><strong>${Number(rec.adsReservePct)>0?pct(rec.adsReservePct):'0%'}</strong><span>${pot?.eligible?`${esc(pot.label)} · ROAS ${Number(pot.recommendedRoas||0).toFixed(2)}x`:'não priorizado agora'}</span></div><div><small>FRETE / LISTAGEM</small><strong>${esc(rec.listingType==='gold_pro'?'Premium':'Clássico')}</strong><span>frete vendedor ${money(rec.shipping)}</span></div></div>`:'<p class="muted">Ainda não analisado. O preço será calculado automaticamente pelo custo WeDrop.</p>'}<button class="btn ghost wide" onclick="commercialAnalyze('${p.id}','${esc(p.sku||'')}')">Calcular / atualizar preço automático</button></article>`}).join(''):'<article class="panel">Importe produtos primeiro.</article>'}
function pricingStatusClass(r){const s=String(r?.status||'').toUpperCase();return s==='ACTIVE'?'good':s==='ERROR'||s==='BLOCKED'?'danger':s==='NOT_ELIGIBLE'?'warn':'neutral'}
function renderPricingAutomation(){const el=$('#pricingAutoTable');if(!el)return;const rows=pricingAutoState.rows||[];if($('#pricingAutoLastScan'))$('#pricingAutoLastScan').textContent=pricingAutoState.lastScanAt?`Atualizado ${new Date(pricingAutoState.lastScanAt).toLocaleString('pt-BR')}`:'Ainda não analisado';el.innerHTML=rows.length?`<table><thead><tr><th>SKU</th><th>Preço atual</th><th>Piso protegido</th><th>Teto testado</th><th>Regra</th><th>Status</th><th>Motivo</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.sku||'—')}</b><small>${esc(r.product||'')}</small></td><td>${money(r.currentPrice)}</td><td><b>${r.plan?.minPrice?money(r.plan.minPrice):'—'}</b><small>margem ≥ ${pct(r.plan?.minMargin||0)}</small></td><td>${r.plan?.maxPrice?money(r.plan.maxPrice):'—'}</td><td>${esc(r.ruleId||'—')}</td><td><span class="pill ${pricingStatusClass(r)}">${esc(r.status||r.action||'—')}</span></td><td><small>${esc(r.reason||r.plan?.reason||r.error||'Faixa segura calculada.')}</small></td></tr>`).join('')}</tbody></table>`:'<div class="emptyMini">Clique em <b>Analisar preços publicados</b> para calcular as faixas seguras e verificar a automatização oficial do Mercado Livre.</div>'}
async function loadPricingAutomation(){try{pricingAutoState=await api('/api/pricing-automation');const ps=pricingAutoState.settings||{};if($('#pricingMinMargin'))$('#pricingMinMargin').value=ps.pricingMinMargin??10;if($('#pricingCampaignReservePct'))$('#pricingCampaignReservePct').value=ps.pricingCampaignReservePct??10;if($('#pricingRule'))$('#pricingRule').value=ps.pricingRule||'INT_EXT';if($('#autoPricingEnabled'))$('#autoPricingEnabled').checked=Boolean(ps.autoPricingEnabled);renderPricingAutomation()}catch(e){toast(e.message)}}
if($('#savePricingAuto'))$('#savePricingAuto').onclick=async()=>{try{const body={pricingMinMargin:$('#pricingMinMargin').value,pricingCampaignReservePct:$('#pricingCampaignReservePct').value,pricingRule:$('#pricingRule').value,autoPricingEnabled:$('#autoPricingEnabled').checked};await api('/api/pricing-automation/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});settings={...settings,...body};if($('#commercialCampaignReserve'))$('#commercialCampaignReserve').value=body.pricingCampaignReservePct;toast(body.autoPricingEnabled?'Precificação automática segura ativada.':'Regras de precificação salvas.');await loadPricingAutomation()}catch(e){toast(e.message)}};
if($('#scanPricingAuto'))$('#scanPricingAuto').onclick=async()=>{try{toast('Calculando piso/teto por SKU e consultando as regras oficiais do Mercado Livre...');pricingAutoState=await api('/api/pricing-automation/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({autoApply:false})});renderPricingAutomation();toast(`${pricingAutoState.rows?.length||0} anúncio(s) analisado(s).`)}catch(e){toast(e.message)}};
if($('#applyPricingAuto'))$('#applyPricingAuto').onclick=async()=>{if(!confirm('Aplicar/atualizar as faixas de preço seguras nos anúncios aptos do Mercado Livre?'))return;try{const d=await api('/api/pricing-automation/apply',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});toast(`${d.applied?.length||0} automatização(ões) aplicada(s); ${d.errors?.length||0} erro(s).`);await loadPricingAutomation()}catch(e){toast(e.message)}};
function adsStatusClass(r){const a=r?.action||r?.decision?.action||'';return a==='PAUSE'||a==='BLOCK'?'danger':a==='ACTIVATE'||a==='PREPARED'||r?.plan?.active?'good':a==='KEEP'?'good':'warn'}
function adsPlanInput(id,suffix){return $(`#ads-${suffix}-${CSS.escape(String(id))}`)}
function adsMetric(m,...keys){for(const k of keys){const v=Number(m?.[k]);if(Number.isFinite(v))return v}return 0}
function adsRowIsAlert(r){return ['PAUSE','BLOCK','EXTERNAL'].includes(String(r?.action||''))||Boolean(r?.error)}
function adsRowMatchesFilter(r){const pot=r.potential||r.plan?.potential||{};if(adsUiFilter==='potential')return Boolean(pot.eligible);if(adsUiFilter==='active')return Boolean(r.plan?.active);if(adsUiFilter==='selected')return Boolean(r.plan?.selected);if(adsUiFilter==='alert')return adsRowIsAlert(r);return true}
function persistedSelectedAdsIds(){return [...new Set((adsState.rows||[]).filter(r=>Boolean(r.plan?.selected)).map(r=>String(r.productId||'')).filter(Boolean))]}
function refreshAdsSelectionUi(){const count=persistedSelectedAdsIds().length;if($('#adsKeep'))$('#adsKeep').textContent=count;const btn=$('#publishSelectedAds');if(btn)btn.textContent=count?`▶ Publicar ${count} ADS selecionado${count===1?'':'s'}`:'▶ Publicar ADS selecionados';return count}
function adsScoreClass(score){return Number(score)>=75?'high':Number(score)>=55?'medium':'low'}
window.setAdsFilter=filter=>{adsUiFilter=filter||'all';$$('.adsFilter').forEach(b=>b.classList.toggle('active',b.dataset.adsFilter===adsUiFilter));renderAds()};
function adsDecisionIcon(action){return ['PAUSE','BLOCK','EXTERNAL'].includes(String(action||''))?'!':['ACTIVATE','PREPARED'].includes(String(action||''))?'↗':['KEEP'].includes(String(action||''))?'✓':'•'}
function renderAds(){
  const rows=adsState.rows||[],s=adsState.settings||{};
  if($('#adsCampaignName'))$('#adsCampaignName').value=s.adsCampaignName||'Rede Achados BR - Automático';if($('#adsDailyBudget'))$('#adsDailyBudget').value=s.adsDailyBudget||0;if($('#adsTargetRoas'))$('#adsTargetRoas').value=s.adsTargetRoas||6;if($('#adsMinMargin'))$('#adsMinMargin').value=s.adsMinMargin??10;if($('#adsPrePriceReservePct'))$('#adsPrePriceReservePct').value=s.adsPrePriceReservePct??5;if($('#adsAttributionDays'))$('#adsAttributionDays').value=s.adsAttributionDays??14;if($('#adsMinClicksBeforePause'))$('#adsMinClicksBeforePause').value=s.adsMinClicksBeforePause??30;if($('#adsMaxProducts'))$('#adsMaxProducts').value=s.adsMaxProducts||20;if($('#autoAdsEnabled'))$('#autoAdsEnabled').checked=Boolean(s.autoAdsEnabled);
  if($('#adsLastScan'))$('#adsLastScan').textContent=adsState.lastScanAt?`Atualizado ${new Date(adsState.lastScanAt).toLocaleString('pt-BR')}`:'Ainda não sincronizado com Product Ads';
  const eligibleRows=rows.filter(r=>r.potential?.eligible||r.plan?.potential?.eligible),selectedRows=rows.filter(r=>r.plan?.selected),alertRows=rows.filter(adsRowIsAlert),activeRows=rows.filter(r=>r.plan?.active);const totalSpend=rows.reduce((a,r)=>a+adsMetric(r.metrics,'cost'),0);
  if($('#adsAnalyzed'))$('#adsAnalyzed').textContent=rows.length;if($('#adsActivate'))$('#adsActivate').textContent=eligibleRows.length;if($('#adsPause'))$('#adsPause').textContent=alertRows.length;if($('#adsActiveCount'))$('#adsActiveCount').textContent=activeRows.length;if($('#adsSpendTotal'))$('#adsSpendTotal').textContent=money(totalSpend);refreshAdsSelectionUi();
  const headline=$('#adsDecisionHeadline'),detail=$('#adsDecisionDetail');if(headline&&detail){if(alertRows.length){headline.textContent=`${alertRows.length} SKU(s) precisam de atenção`;detail.textContent='A IA encontrou limites, ROAS insuficiente, campanha externa ou bloqueio. Priorize os cartões marcados em alerta.'}else if(eligibleRows.length){headline.textContent=`${eligibleRows.length} SKU(s) com potencial de ADS`;detail.textContent=selectedRows.length?`${selectedRows.length} já selecionada(s). Revise orçamento e ROAS individual antes de ativar.`:'Use “Selecionar potenciais” para preparar o lote e revise cada recomendação.'}else{headline.textContent='Nenhuma SKU deve receber investimento agora';detail.textContent='O motor está protegendo margem e evitando gastar onde não há evidência suficiente de retorno.'}}
  const perm=$('#adsPermissionAlert');if(perm){if(adsState.permissionOk===false){perm.classList.add('dangerBox');perm.innerHTML=`<b>Publicidade sem permissão:</b> ${esc(adsState.permissionMessage||'habilite Publicidade em Leitura e escrita no DevCenter e reconecte o Mercado Livre.')}`}else{perm.classList.remove('dangerBox');perm.innerHTML=`<b>Product Ads conectado:</b> ${adsState.advertiser?`advertiser <b>${esc(adsState.advertiser.advertiser_id)}</b> disponível para análise e gestão.`:'os potenciais já podem ser preparados; atualize a análise para confirmar a conexão com o Mercado Livre.'}`}}
  const el=$('#adsTable');if(!el)return;
  const q=adsUiSearch.trim().toLowerCase();const visible=rows.filter(r=>adsRowMatchesFilter(r)&&(!q||`${r.sku||''} ${r.product||''} ${r.itemId||''}`.toLowerCase().includes(q)));
  $$('.adsFilter').forEach(b=>b.classList.toggle('active',b.dataset.adsFilter===adsUiFilter));
  el.innerHTML=visible.length?visible.map(r=>{const plan=r.plan||{},pot=r.potential||plan.potential||{},m=r.metrics||{},eco=pot.economics||r.decision?.economics||{},eligible=Boolean(pot.eligible),id=esc(r.productId),score=Math.round(Number(pot.score||0)),roas=adsMetric(m,'roas'),cost=adsMetric(m,'cost'),clicks=Math.round(adsMetric(m,'clicks')),impressions=Math.round(adsMetric(m,'prints','impressions')),units=Math.round(adsMetric(m,'advertising_items_quantity','units_quantity','sales')),ctr=impressions>0?clicks/impressions*100:adsMetric(m,'ctr'),risk=adsRowIsAlert(r),selected=Boolean(plan.selected),active=Boolean(plan.active),action=String(r.action||r.decision?.action||'');return `<article class="adsSkuCard ${active?'active':''} ${risk?'risk':''} ${selected?'selected':''}" data-ads-card="${id}">
    <div class="adsSkuTop">
      <label class="adsSelectToggle" title="Selecionar esta SKU"><input class="adsSelect" data-product-id="${id}" id="ads-sel-${id}" type="checkbox" ${selected?'checked':''} ${eligible?'':'disabled'} onchange="saveAdsPlan('${id}')"><span></span></label>
      <div class="adsSkuIdentity"><span class="eyebrow">${esc(r.sku||'SEM SKU')}</span><h4>${esc(r.product||'Produto')}</h4><small>${r.itemId?esc(r.itemId):'ainda sem item_id publicado'}</small></div>
      <div class="adsScore ${adsScoreClass(score)}" style="--score:${Math.max(0,Math.min(100,score))}"><div><strong>${score}</strong><small>/100</small></div><span>potencial</span></div>
    </div>
    <div class="adsSkuBadges"><span class="pill ${eligible?'good':'warn'}">${esc(pot.label||'ANÁLISE PENDENTE')}</span><span class="pill ${adsStatusClass(r)}">${esc(r.status||r.decision?.label||'PRÉ-CONFIGURADO')}</span>${active?'<span class="pill good">ADS ATIVO</span>':''}${r.campaignName?`<span class="tagTiny">${esc(r.campaignName)}</span>`:''}</div>
    <div class="adsMetricStrip">
      <div><small>ROAS atual</small><strong class="${roas>0&&roas<Number(plan.roasTarget||pot.recommendedRoas||0)?'negative':'positive'}">${roas.toFixed(2)}x</strong><span>alvo ${Number(plan.roasTarget||pot.recommendedRoas||s.adsTargetRoas||6).toFixed(2)}x</span></div>
      <div><small>Gasto</small><strong>${money(cost)}</strong><span>${clicks} cliques</span></div>
      <div><small>CTR</small><strong>${Number(ctr||0).toFixed(2)}%</strong><span>${impressions} impressões</span></div>
      <div><small>Vendas Ads</small><strong>${units}</strong><span>atribuídas</span></div>
    </div>
    <div class="adsRecommendation ${risk?'risk':'safe'}"><span class="adsRecommendationIcon">${adsDecisionIcon(action)}</span><div><small>DECISÃO DA IA</small><b>${esc(r.decision?.label||r.status||'Aguardando análise')}</b><p>${esc(r.decision?.reason||r.error||pot.reason||'Sem recomendação adicional.')}</p></div></div>
    <div class="adsEconomyLine"><span><b>${money(eco.price||0)}</b><small>preço analisado</small></span><span><b>${money(pot.maxAdsSpend||eco.maxAdsSpend||0)}</b><small>espaço p/ ADS</small></span><span><b>${pct(pot.maxAcosPct||eco.maxAcosPct||0)}</b><small>ACOS máximo</small></span><span><b>${money(plan.dailyBudget||pot.recommendedDailyBudget||0)}</b><small>orçamento/dia</small></span></div>
    <details class="adsSkuControls"><summary><span>Configuração individual</span><small>Ajustar ROAS, orçamento e limites</small></summary><div class="adsControlFields">
      <label>ROAS alvo<input id="ads-roas-${id}" class="adsInlineInput" type="number" min="1" max="35" step="0.1" value="${Number(plan.roasTarget||pot.recommendedRoas||s.adsTargetRoas||6).toFixed(2)}" onchange="saveAdsPlan('${id}')"><small>Sugerido ${Number(pot.recommendedRoas||0).toFixed(2)}x</small></label>
      <label>Orçamento/dia<input id="ads-daily-${id}" class="adsInlineInput" type="number" min="0" step="0.01" value="${Number(plan.dailyBudget||pot.recommendedDailyBudget||0).toFixed(2)}" onchange="saveAdsPlan('${id}')"><small>Sugerido ${money(pot.recommendedDailyBudget||0)}</small></label>
      <label>Data limite<span class="adsLimitToggle"><input id="ads-endinf-${id}" type="checkbox" ${plan.unlimitedEnd!==false?'checked':''} onchange="toggleAdsPlanControls('${id}');saveAdsPlan('${id}')"> sem limite</span><input id="ads-end-${id}" class="adsInlineInput" type="date" value="${esc(plan.endDate||'')}" ${plan.unlimitedEnd!==false?'disabled':''} onchange="saveAdsPlan('${id}')"></label>
      <label>Orçamento total<span class="adsLimitToggle"><input id="ads-budgetinf-${id}" type="checkbox" ${plan.unlimitedBudget!==false?'checked':''} onchange="toggleAdsPlanControls('${id}');saveAdsPlan('${id}')"> sem limite</span><input id="ads-total-${id}" class="adsInlineInput" type="number" min="0" step="0.01" value="${Number(plan.totalBudget||0).toFixed(2)}" ${plan.unlimitedBudget!==false?'disabled':''} onchange="saveAdsPlan('${id}')"></label>
    </div></details>
  </article>`}).join(''):`<div class="adsEmptyState"><span>◎</span><h3>Nenhuma SKU neste filtro</h3><p>${rows.length?'Troque o filtro ou a busca para visualizar os demais produtos.':'Depois da Inteligência Comercial, os produtos com potencial de ADS aparecem aqui automaticamente.'}</p></div>`;
}
if($('#adsSkuSearch')){$('#adsSkuSearch').value=adsUiSearch;$('#adsSkuSearch').addEventListener('input',e=>{adsUiSearch=String(e.target.value||'');renderAds()})}
$$('.adsFilter').forEach(b=>b.addEventListener('click',()=>setAdsFilter(b.dataset.adsFilter||'all')));
window.toggleAdsPlanControls=id=>{const endInf=adsPlanInput(id,'endinf'),end=adsPlanInput(id,'end'),budgetInf=adsPlanInput(id,'budgetinf'),total=adsPlanInput(id,'total');if(end)end.disabled=Boolean(endInf?.checked);if(total)total.disabled=Boolean(budgetInf?.checked)};
window.saveAdsPlan=async id=>{try{const row=(adsState.rows||[]).find(r=>String(r.productId)===String(id));const body={sku:row?.sku||'',selected:Boolean(adsPlanInput(id,'sel')?.checked),roasTarget:adsPlanInput(id,'roas')?.value,dailyBudget:adsPlanInput(id,'daily')?.value,unlimitedEnd:Boolean(adsPlanInput(id,'endinf')?.checked),endDate:adsPlanInput(id,'end')?.value||'',unlimitedBudget:Boolean(adsPlanInput(id,'budgetinf')?.checked),totalBudget:adsPlanInput(id,'total')?.value||0};if(row)row.plan={...(row.plan||{}),selected:body.selected};refreshAdsSelectionUi();const d=await api(`/api/ads/plan/${encodeURIComponent(id)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(row)row.plan=d.plan;refreshAdsSelectionUi();}catch(e){toast(e.message)}};
async function loadAds(){try{adsState=await api('/api/ads');renderAds()}catch(e){toast(e.message)}}
if($('#saveAdsSettings'))$('#saveAdsSettings').onclick=async()=>{try{operationStart('Salvando regras de ADS','EXECUTANDO · atualizando proteção de margem, ROAS e limites.');const body={adsCampaignName:$('#adsCampaignName')?.value||'Rede Achados BR - Automático',adsDailyBudget:$('#adsDailyBudget')?.value||0,adsTargetRoas:$('#adsTargetRoas')?.value||6,adsMinMargin:$('#adsMinMargin')?.value||10,adsPrePriceReservePct:$('#adsPrePriceReservePct')?.value||5,adsAttributionDays:$('#adsAttributionDays')?.value||14,adsMinClicksBeforePause:$('#adsMinClicksBeforePause')?.value||30,adsMaxProducts:$('#adsMaxProducts')?.value||20,autoAdsEnabled:Boolean($('#autoAdsEnabled')?.checked)};await api('/api/ads/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});settings={...settings,...body};await loadAds();operationDone('Regras de ADS salvas',body.autoAdsEnabled?'Gestão automática segura ativada para campanhas do Publisher.':'Configurações atualizadas.');toast('✓ Regras de ADS salvas.',9000)}catch(e){operationError('Falha ao salvar ADS',e.message);toast(e.message,10000)}};
if($('#scanAds'))$('#scanAds').onclick=async()=>{try{operationStart('Analisando Product Ads','EXECUTANDO · cruzando métricas reais, margem e potencial de cada SKU. Aguarde...');adsState=await api('/api/ads/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({autoApply:false})});renderAds();const msg=`${adsState.rows?.length||0} SKU(s) analisadas · ${(adsState.rows||[]).filter(r=>r.potential?.eligible||r.plan?.potential?.eligible).length} potencial(is).`;operationDone('Análise Product Ads concluída',msg);toast(`✓ ${msg}`,9000)}catch(e){operationError('Falha na análise Product Ads',e.message);toast(e.message,10000)}};
if($('#selectPotentialAds'))$('#selectPotentialAds').onclick=async()=>{try{operationStart('Selecionando potenciais','EXECUTANDO · preparando somente as SKUs aprovadas pelo motor de margem.');await api('/api/ads/plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({selectPotential:true})});await loadAds();operationDone('Potenciais selecionados',`${(adsState.rows||[]).filter(r=>r.plan?.selected).length} SKU(s) prontas para revisão final.`);toast('✓ Potenciais selecionados. Revise ROAS e orçamento antes de publicar.',9000)}catch(e){operationError('Falha ao selecionar potenciais',e.message);toast(e.message,10000)}};
if($('#publishSelectedAds'))$('#publishSelectedAds').onclick=async()=>{let ids=persistedSelectedAdsIds();if(!ids.length){try{adsState=await api('/api/ads');renderAds();ids=persistedSelectedAdsIds()}catch{}}if(!ids.length)return toast('Nenhum ADS está selecionado no servidor. Use “Selecionar potenciais” ou marque uma SKU e aguarde aparecer em “Selecionadas”.',10000);if(!confirm(`Publicar/ativar ${ids.length} ADS selecionado(s) com ROAS e orçamento individuais?`))return;try{operationStart('Publicando ADS selecionados',`EXECUTANDO · usando a seleção salva no servidor para ${ids.length} campanha(s). Aguarde...`);const d=await api('/api/ads/publish-selected',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productIds:ids})});adsState=d;renderAds();const firstError=(d.publishResults||[]).find(x=>!x.ok)?.error;const msg=`${d.published||0} ADS ativado(s) · ${d.failed||0} pendência(s)${firstError?` · ${firstError}`:''}`;operationDone('Publicação de ADS concluída',msg);toast(`✓ ${msg}`,10000)}catch(e){operationError('Falha ao publicar ADS',e.message);toast(e.message,10000)}};
if($('#runAds'))$('#runAds').onclick=async()=>{if(!confirm('Executar agora a gestão dos ADS que já foram ativados pelo Publisher? Limites de data/orçamento e ROAS serão respeitados.'))return;try{operationStart('Gerenciando ADS ativos','EXECUTANDO · conferindo ROAS, gasto, limites e necessidade de pausar/manter.');adsState=await api('/api/ads/run',{method:'POST'});renderAds();operationDone('Gestão de ADS concluída','Campanhas do Publisher foram reavaliadas pelas regras atuais.');toast('✓ Gestão dos ADS ativos concluída.',9000)}catch(e){operationError('Falha na gestão dos ADS',e.message);toast(e.message,10000)}};
window.analyze=window.commercialAnalyze;
let videoResults={};
function videoSourceFor(p){if(p.marketproVideo?.id)return `/api/marketpro/video?id=${encodeURIComponent(p.marketproVideo.id)}`;return p.video_url||''}
function videoTitleFor(p){const raw=String(p.product||'').trim();const generic=!raw||['importado','importudo','produto','item'].includes(raw.toLowerCase());return generic?(p.seoTitle||p.model||p.sku||raw):(p.product||p.seoTitle||p.model||p.sku||'')}
function renderVideos(){
  const el=$('#videoCards');if(!el)return;
  el.innerHTML=products.length?products.map(p=>{
    const r=videoResults[p.id], selectedSrc=videoSourceFor(p), query=videoTitleFor(p);
    const selected=p.marketproVideo?.id?'MARKETPRO':p.video_url?'VÍDEO MANUAL/FORNECEDOR':'PENDENTE';
    const selectedClass=selectedSrc?'good':'warn';
    return `<article data-product-id="${esc(p.id)}" class="productCard videoCard"><div class="cardTop"><div><span class="eyebrow">${esc(p.sku||'SEM SKU')}</span><h3>${esc(p.product||p.seoTitle||p.sku)}</h3></div><span class="pill ${selectedClass}">${selected}</span></div>
      ${selectedSrc?`<video controls playsinline preload="metadata" src="${esc(selectedSrc)}"></video><p class="muted">${esc(p.marketproVideo?.title||p.manualVideo?.name||'Vídeo já associado ao produto')}</p>`:''}
      <div class="videoReference"><div><b>Referência WeDrop</b><small>${(p.images||[]).length?`${p.images.length} foto(s) disponível(is) para conferir o produto`:'Sem foto de referência — revisão visual automática indisponível'}</small></div>${p.images?.[0]?`<img src="${esc(p.images[0])}" alt="Referência do produto">`:''}</div>
      <label class="videoSearchLabel">Título usado na busca</label><div class="videoSearch"><input id="vq-${p.id}" value="${esc(query)}" placeholder="Nome do produto"><button class="btn primary" onclick="searchVideo('${p.id}')">Buscar automaticamente</button></div>
      <p class="muted">O MarketPro começa pelo título completo e reduz os termos progressivamente até localizar opções. Variantes incompatíveis de cor/voltagem são descartadas.</p>
      <div id="vr-${p.id}" class="videoResults">${r?videoResultHtml(p,r):''}</div>
      <div class="manualVideoBox"><div><b>Não encontrou o vídeo correto?</b><small>Envie um MP4/MOV manualmente. Ele ficará associado a esta SKU e marcado como revisado.</small></div><div class="manualVideoActions"><input id="vu-${p.id}" type="file" accept="video/mp4,video/quicktime,.mp4,.mov"><button class="btn ghost" onclick="uploadManualVideo('${p.id}')">Importar vídeo manual</button></div></div>
      <button class="mini" onclick="markVideoReviewed('${p.id}',true)">Continuar sem vídeo (revisado manualmente)</button></article>`
  }).join(''):'<article class="panel">Importe produtos primeiro.</article>'
}
function videoResultHtml(p,r){
  if(!r.candidates?.length)return`<p class="muted">${esc(r.diagnostic||'Nenhum vídeo encontrado.')}</p>`;
  const all=r.candidates||[], visible=(r.visualValidated?all.filter(v=>v.visual?.match!==false):all).slice(0,3), discarded=r.visualValidated?all.filter(v=>v.visual?.match===false).length:0;
  const attempts=(r.attempts||[]).slice(0,6).map(x=>esc(x.query)).join(' → ');
  return `<div class="videoSearchSummary"><b>${visible.length} melhor(es) opção(ões)</b><span>Busca usada: ${esc(r.bestQuery||'')}</span>${attempts?`<small>Tentativas: ${attempts}</small>`:''}${r.visualValidated?`<span class="pill ${discarded?'warn':'good'}">IA visual: ${discarded} descartado(s)</span>`:`${status.videoVisualAIConfigured&&p.images?.length?`<button class="mini" onclick="visualValidateVideos('${p.id}')">Comparar com foto WeDrop por IA</button>`:''}`}</div>`+
    (visible.length?visible.map((v,i)=>`<div class="videoCandidate videoCandidateRich"><video controls playsinline preload="metadata" src="/api/marketpro/video?id=${encodeURIComponent(v.id)}"></video><div class="videoCandidateInfo"><b>${i+1}. ${esc(v.title)}</b><small>Compatibilidade textual ${Math.round((v.score||0)*100)}%${v.durationMs?` · ${(v.durationMs/1000).toFixed(0)}s`:''}</small>${v.variantReasons?.length?`<small>${esc(v.variantReasons.join(' · '))}</small>`:''}${v.visual?`<span class="pill ${v.visual.match?'good':'danger'}">FOTO REFERÊNCIA ${Math.round(v.visual.visualScore||0)}% · ${v.visual.match?'COMPATÍVEL':'DESCARTADO'}</span><small>${esc(v.visual.reason||'')}</small>`:''}<button class="btn primary" onclick="selectVideoEncoded('${encodeURIComponent(p.id)}','${encodeURIComponent(v.id)}','${encodeURIComponent(v.title)}',${Number(v.score||0)})">Usar este vídeo</button></div></div>`).join(''):'<div class="warning dangerBox"><b>Nenhum vídeo passou na conferência visual.</b> Use o upload manual ou refaça a busca.</div>');
}
function waitVideoEvent(el,event,timeout=12000){return new Promise((resolve,reject)=>{let done=false;const end=(ok,e)=>{if(done)return;done=true;clearTimeout(t);el.removeEventListener(event,on);ok?resolve(e):reject(e instanceof Error?e:new Error('Falha ao carregar vídeo.'))};const on=e=>end(true,e);el.addEventListener(event,on,{once:true});const t=setTimeout(()=>end(false,new Error('Tempo esgotado ao capturar frame do vídeo.')),timeout);el.addEventListener('error',()=>end(false,new Error('Não foi possível abrir o vídeo para análise.')),{once:true})})}
async function captureMarketProFrame(vid){
  const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=`/api/marketpro/video?id=${encodeURIComponent(vid)}`;v.style.cssText='position:fixed;left:-9999px;width:2px;height:2px';document.body.appendChild(v);
  try{await waitVideoEvent(v,'loadedmetadata');const target=Number.isFinite(v.duration)&&v.duration>1?Math.min(Math.max(.4,v.duration*.18),2):.5;if(target>0){v.currentTime=target;await waitVideoEvent(v,'seeked')}else await waitVideoEvent(v,'loadeddata');const w=v.videoWidth||640,h=v.videoHeight||640,scale=Math.min(1,520/Math.max(w,h)),cw=Math.max(1,Math.round(w*scale)),ch=Math.max(1,Math.round(h*scale));const c=document.createElement('canvas');c.width=cw;c.height=ch;c.getContext('2d').drawImage(v,0,0,cw,ch);return c.toDataURL('image/jpeg',.72)}finally{v.pause();v.removeAttribute('src');v.load();v.remove()}
}
window.visualValidateVideos=async id=>{try{const r=videoResults[id];if(!r?.candidates?.length)return toast('Faça a busca no MarketPro primeiro.');if(!status.videoVisualAIConfigured)return toast('Configure OPENAI_API_KEY para usar a comparação visual automática.');toast('Comparando os vídeos com a foto de referência WeDrop...');const top=r.candidates.slice(0,4),frames=[];for(const v of top){try{frames.push({id:v.id,title:v.title,frame:await captureMarketProFrame(v.id)})}catch{}}if(!frames.length)throw new Error('Não foi possível capturar os frames dos vídeos.');const d=await api(`/api/products/${id}/video/visual-match`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({candidates:frames})});const map=new Map((d.results||[]).map(x=>[String(x.id),x]));r.candidates=r.candidates.map(v=>({...v,visual:map.get(String(v.id))||v.visual})).sort((a,b)=>Number(Boolean(b.visual?.match))-Number(Boolean(a.visual?.match))||(Number(b.visual?.visualScore||0)-Number(a.visual?.visualScore||0))||(b.score-a.score));r.visualValidated=true;videoResults[id]=r;renderVideos();toast(`${r.candidates.filter(v=>v.visual?.match).length} vídeo(s) compatível(is) com a foto de referência.`)}catch(e){toast(e.message)}};
window.searchVideo=async id=>{try{const q=$(`#vq-${CSS.escape(id)}`)?.value||'';toast('Buscando e filtrando vídeos no MarketPro...');const r=await api(`/api/products/${id}/video/search?q=${encodeURIComponent(q)}`);videoResults[id]=r;renderVideos();toast(`${r.candidates?.length||0} opção(ões) encontrada(s).`);const p=products.find(x=>x.id===id);if(status.videoVisualAIConfigured&&p?.images?.length&&r.candidates?.length)await visualValidateVideos(id)}catch(e){toast(e.message)}};
window.uploadManualVideo=async id=>{try{const f=$(`#vu-${CSS.escape(id)}`)?.files?.[0];if(!f)return toast('Selecione um MP4 ou MOV.');if(f.size>180*1024*1024)return toast('Vídeo acima de 180 MB.');const fd=new FormData();fd.append('video',f);toast('Enviando vídeo manual...');await api(`/api/products/${id}/video/upload`,{method:'POST',body:fd});await loadProducts();guideAfterAction(id,'videos','Vídeo manual associado à SKU e marcado como revisado.')}catch(e){toast(e.message)}};
window.selectVideoEncoded=(id,vid,title,score)=>selectVideo(decodeURIComponent(id),decodeURIComponent(vid),decodeURIComponent(title),score);
async function selectVideo(id,vid,title,score){try{await api(`/api/products/${id}/video/select`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:vid,title,score})});await loadProducts();guideAfterAction(id,'videos','Vídeo selecionado e salvo no SKU.')}catch(e){toast(e.message)}}
window.markVideoReviewed=async(id,reviewed)=>{try{await api(`/api/products/${id}/video/review`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reviewed})});await loadProducts();guideAfterAction(id,'videos','Revisão de vídeo atualizada.')}catch(e){toast(e.message)}};

function postPublishStepMeta(key){
  return ({pictures:{label:'Fotos',icon:'🖼️'},description:{label:'Descrição',icon:'📝'},stock:{label:'Estoque',icon:'📦'},flex:{label:'Flex',icon:'🚚'},promotion:{label:'Promoção / desconto',icon:'🏷️'},video:{label:'Vídeo / Clips',icon:'🎬'},remote:{label:'Reconciliação remota',icon:'✅'}})[key]||{label:key,icon:'•'};
}
function postPublishTone(status){
  status=String(status||'PENDING').toUpperCase();
  if(status==='DONE')return'good';
  if(status==='ERROR')return'danger';
  if(status==='MANUAL'||status==='ACTION_REQUIRED')return'warn';
  if(status==='RUNNING')return'running';
  if(status==='WAITING')return'waiting';
  if(status==='SKIPPED')return'neutral';
  return'pending';
}
function postPublishStatusLabel(status){
  return ({DONE:'OK',ERROR:'ERRO',MANUAL:'AÇÃO MANUAL',ACTION_REQUIRED:'AÇÃO MANUAL',RUNNING:'EXECUTANDO',WAITING:'AGUARDANDO',SKIPPED:'NÃO APLICÁVEL',PENDING:'PENDENTE'})[String(status||'PENDING').toUpperCase()]||String(status||'PENDENTE');
}
function postPublishPlanHtml(p){
  const plan=p?.postPublishCorrectionPlan;if(!plan)return'';
  const actions=Array.isArray(plan.actions)?plan.actions:[],checks=Array.isArray(plan.checks)?plan.checks:[];
  const rows=actions.map((a,i)=>`<div class="postTechRow"><b>${i+1}. ${esc(a.label||a.type||'Ação')}</b><span>${esc(a.reason||'')}</span></div>`).join('');
  const okRows=checks.slice(0,10).map(c=>`<div class="postTechRow ok"><b>✓ ${esc(c.label||'Verificado')}</b></div>`).join('');
  return `<details class="postTechnicalDetails"><summary>Ver detalhes técnicos</summary><div class="postTechnicalBody">${plan.remoteStock?`<div class="postTechRow ok"><b>Estoque no Mercado Livre: ${Number(plan.remoteStock.quantity||0)} un.</b><span>${esc(plan.remoteStock.source||'Mercado Livre')}</span></div>`:''}${rows}${okRows}</div></details>`;
}
function postPublishManualAction(p,steps,plan){
  const planActions=Array.isArray(plan?.actions)?plan.actions:[];
  const stepAction=(key)=>{const st=steps?.[key];return st&&['MANUAL','ERROR'].includes(String(st.status||'').toUpperCase())?{type:key,label:postPublishStepMeta(key).label,reason:st.message||'',editUrl:st.editUrl||'',mediaUrl:st.mediaUrl||'',canConfirm:Boolean(st.canConfirm),status:st.status}:null};
  const priority=['pictures','stock','description','video','flex','promotion'];
  for(const key of priority){const a=stepAction(key);if(a)return a;}
  const manual=planActions.find(a=>a.manual)||planActions.find(a=>a.type==='video');
  return manual||null;
}
function postPublishAutoAction(p,steps,plan){
  const actions=Array.isArray(plan?.actions)?plan.actions:[];
  return actions.find(a=>a.remoteWrite&&!a.manual)||null;
}
function postPublishActionHtml(p,action){
  if(!action)return'';
  const type=String(action.type||'').toLowerCase();
  const editUrl=action.editUrl||'';
  const mediaUrl=action.mediaUrl||'';
  if(type==='video')return `<div class="postNextAction manual"><div class="postNextIcon">🎬</div><div class="postNextContent"><small>1 AÇÃO PARA VOCÊ</small><h5>Anexar o Clip desta SKU</h5><p>O anúncio já está publicado. O vídeo está preparado; falta apenas anexá-lo no Mercado Livre.</p><div class="postNextButtons">${editUrl?`<a class="btn primary" href="${esc(editUrl)}" target="_blank" rel="noopener">1. Abrir esta SKU em Alterar → Clips</a>`:''}${mediaUrl?`<a class="btn ghost" href="${esc(mediaUrl)}" target="_blank" rel="noopener">2. Abrir vídeo preparado</a>`:''}<button class="btn ghost" onclick="confirmClip('${esc(p.id)}')">3. Já anexei · confirmar</button></div></div></div>`;
  if(type==='flex')return `<div class="postNextAction manual"><div class="postNextIcon">🚚</div><div class="postNextContent"><small>AÇÃO PARA VOCÊ</small><h5>Revisar Flex desta SKU</h5><p>${esc(action.reason||'O Publisher não conseguiu concluir o Flex automaticamente.')}</p><div class="postNextButtons">${editUrl?`<a class="btn primary" href="${esc(editUrl)}" target="_blank" rel="noopener">Abrir esta SKU e revisar envio/Flex</a>`:''}<button class="btn ghost" onclick="runPostPublish('${esc(p.id)}',false)">Verificar novamente</button></div></div></div>`;
  if(type==='stock')return `<div class="postNextAction manual"><div class="postNextIcon">📦</div><div class="postNextContent"><small>AÇÃO PARA VOCÊ</small><h5>Conferir estoque desta SKU</h5><p>${esc(action.reason||'O estoque exige uma confirmação manual.')}</p><div class="postNextButtons">${editUrl?`<a class="btn primary" href="${esc(editUrl)}" target="_blank" rel="noopener">Abrir esta SKU no Mercado Livre</a>`:''}<button class="btn ghost" onclick="refreshRemoteStock('${esc(p.id)}')">Reler estoque</button></div></div></div>`;
  if(type==='pictures')return `<div class="postNextAction danger"><div class="postNextIcon">🖼️</div><div class="postNextContent"><small>CORREÇÃO NECESSÁRIA</small><h5>Fotos precisam ser sincronizadas</h5><p>${esc(action.reason||'O Mercado Livre não confirmou todas as fotos.')}</p><div class="postNextButtons"><button class="btn primary" onclick="runPostPublish('${esc(p.id)}',true)">Corrigir fotos automaticamente</button></div></div></div>`;
  if(type==='description')return `<div class="postNextAction danger"><div class="postNextIcon">📝</div><div class="postNextContent"><small>CORREÇÃO NECESSÁRIA</small><h5>Descrição precisa ser sincronizada</h5><p>${esc(action.reason||'A descrição ainda não foi confirmada.')}</p><div class="postNextButtons"><button class="btn primary" onclick="runPostPublish('${esc(p.id)}',false)">Sincronizar descrição</button></div></div></div>`;
  if(type==='promotion')return `<div class="postNextAction manual"><div class="postNextIcon">🏷️</div><div class="postNextContent"><small>OPÇÃO COMERCIAL</small><h5>Promoção desta SKU</h5><p>${esc(action.reason||'Nenhuma promoção segura foi aplicada automaticamente.')}</p><div class="postNextButtons"><button class="btn primary" onclick="nav('promos')">Ver promoções seguras</button></div></div></div>`;
  return `<div class="postNextAction manual"><div class="postNextIcon">⚠️</div><div class="postNextContent"><small>AÇÃO NECESSÁRIA</small><h5>${esc(action.label||'Revisar esta SKU')}</h5><p>${esc(action.reason||'Existe uma pendência que precisa de confirmação.')}</p>${editUrl?`<div class="postNextButtons"><a class="btn primary" href="${esc(editUrl)}" target="_blank" rel="noopener">Abrir esta SKU no Mercado Livre</a></div>`:''}</div></div>`;
}
function postPublishPipelineHtml(p){
  if(!p?.ml_item_id)return'';
  const pipe=p.postPublishPipeline||{},steps=pipe.steps||{},plan=p.postPublishCorrectionPlan||{};
  const active=String(p.ml_status||pipe.remote?.status||'').toLowerCase()==='active'||p.publicationState?.code==='ACTIVE';
  const mlStock=p.ml_available_quantity!=null&&Number.isFinite(Number(p.ml_available_quantity))?Number(p.ml_available_quantity):steps.stock?.marketRemote??steps.stock?.remote;
  const manual=postPublishManualAction(p,steps,plan),auto=postPublishAutoAction(p,steps,plan);
  const publishedAt=p.publishedAt?new Date(p.publishedAt).toLocaleString('pt-BR'):'data não informada';
  const essentialError=['pictures','description','stock'].some(k=>String(steps[k]?.status||'').toUpperCase()==='ERROR');
  let main='';
  if(active&&!essentialError){
    main=`<div class="postResolved"><div class="postResolvedIcon">✓</div><div><small>PUBLICAÇÃO ENCERRADA</small><h4>Anúncio publicado e ativo</h4><p>${esc(p.ml_item_id)} · estoque ${mlStock!=null?`${Number(mlStock)} un.`:'confirmando'} · publicado ${esc(publishedAt)}</p></div></div>`;
  }else if(active){
    main=`<div class="postResolved warn"><div class="postResolvedIcon">!</div><div><small>ANÚNCIO ATIVO</small><h4>Publicado, mas existe uma correção técnica</h4><p>O anúncio não será publicado novamente. O Publisher vai atuar somente na pendência abaixo.</p></div></div>`;
  }else{
    main=`<div class="postResolved wait"><div class="postResolvedIcon">…</div><div><small>MERCADO LIVRE</small><h4>${esc(p.publicationState?.label||'Anúncio já criado · aguardando status')}</h4><p>${esc(p.publicationState?.message||'O Publisher continuará relendo o status sem criar outro anúncio.')}</p></div></div>`;
  }
  let next='';
  const nextParts=[];
  if(auto)nextParts.push(`<div class="postNextAction auto"><div class="postNextIcon">⚙️</div><div class="postNextContent"><small>O PUBLISHER RESOLVE</small><h5>${esc(auto.label||'Correção automática disponível')}</h5><p>${esc(auto.reason||'O sistema pode executar e validar esta correção no Mercado Livre.')}</p><div class="postNextButtons"><button class="btn primary" onclick="runPostPublish('${esc(p.id)}',false)">Resolver automaticamente</button></div></div></div>`);
  if(manual)nextParts.push(postPublishActionHtml(p,manual));
  if(nextParts.length)next=nextParts.join('');
  else if(active)next=`<div class="postNothingPending"><b>✓ Nada bloqueando esta publicação.</b><span>Esta SKU sai da fila de publicação. Monitor 24/7, ADS e promoções seguem em suas rotinas próprias.</span></div>`;
  else next=`<div class="postNothingPending waiting"><b>Aguardando somente o Mercado Livre.</b><span>Não publique novamente. Use “Sincronizar agora” para reler o status.</span></div>`;
  return `<section class="postPublishCompact">${main}${next}<div class="postCompactFooter"><a class="mini" href="${esc(p.ml_permalink||`https://produto.mercadolivre.com.br/${encodeURIComponent(p.ml_item_id)}`)}" target="_blank" rel="noopener">Abrir anúncio</a><button class="mini" onclick="syncPublishedProduct('${esc(p.id)}')">Sincronizar agora</button></div>${postPublishPlanHtml(p)}</section>`;
}

window.confirmClip=async id=>{try{if(!confirm('Confirme somente depois de enviar o Clip no anúncio do Mercado Livre. Marcar esta etapa como concluída?'))return;const d=await api(`/api/products/${id}/post-publish/clip-confirm`,{method:'POST'});await loadProducts();renderPublish();toast('Clip confirmado. A pendência de vídeo foi encerrada e a SKU foi atualizada.',9000)}catch(e){toast(e.message,10000)}};
async function loadWarehouseStatus(){const box=$('#warehouseStatus');if(!box)return;try{const d=await api('/api/warehouses');if(!d.warehouseManagement){box.innerHTML='<span class="pill good">ESTOQUE PADRÃO</span><small>Esta conta ainda usa available_quantity no anúncio.</small>';return;}const rows=d.stores||[];box.innerHTML=`<span class="pill ${rows.length?'good':'danger'}">WAREHOUSE MANAGEMENT</span><small>${rows.length} depósito(s) ativo(s) encontrado(s).</small>${rows.map(x=>`<button class="mini" onclick="setPrimaryWarehouse('${esc(x.store_id)}')">${esc(x.description||x.store_id)} · ${esc(x.store_id)}${String(d.preferredStoreId)===String(x.store_id)?' ✓':''}</button>`).join('')}`;}catch(e){box.innerHTML=`<span class="pill warn">DEPÓSITOS NÃO CONSULTADOS</span><small>${esc(e.message)}</small>`}}
window.setPrimaryWarehouse=async storeId=>{try{settings=await api('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({primaryWarehouseStoreId:storeId})});if($('#primaryWarehouseStoreId'))$('#primaryWarehouseStoreId').value=storeId;await loadWarehouseStatus();toast(`Depósito principal ${storeId} salvo.`)}catch(e){toast(e.message)}};

async function quietSyncPublishedStatus(){
  if(publishQuietSyncBusy||Date.now()-publishQuietSyncAt<120000)return;
  const candidates=products.filter(p=>p.ml_item_id).slice(0,3);
  const queueCandidates=products.filter(p=>!p.ml_item_id).slice(0,10);
  if(!candidates.length&&!queueCandidates.length)return;
  publishQuietSyncBusy=true;publishQuietSyncAt=Date.now();
  try{
    if(queueCandidates.length){try{await api('/api/publication-guards/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:queueCandidates.map(p=>p.id),remote:true})});}catch(_){ }}
    const refreshed=await api('/api/products');products=refreshed;
    const publishedNow=products.filter(p=>p.ml_item_id).slice(0,3);
    for(const p of publishedNow){
      try{await api(`/api/products/${p.id}/reconcile-publication`,{method:'POST'});}catch(_){ }
    }
    const fresh=await api('/api/products');products=fresh;if(products.length)saveProductBrowserBackup(products);renderPublish();renderKPIs();
  }finally{publishQuietSyncBusy=false;}
}
window.syncPublishedProduct=async id=>{try{
  const p=products.find(x=>String(x.id)===String(id));
  operationStart('Sincronizando esta SKU',`Relendo o anúncio ${p?.ml_item_id||p?.sku||''} diretamente no Mercado Livre. Nenhum novo anúncio será criado.`);
  const d=await api(`/api/products/${id}/reconcile-publication`,{method:'POST'});
  await loadProducts();
  const cur=products.find(x=>String(x.id)===String(id));
  const active=String(cur?.ml_status||'').toLowerCase()==='active'||cur?.publicationState?.code==='ACTIVE';
  operationDone(active?'Anúncio identificado e ativo':'Status atualizado',active?`SKU ${cur?.sku||''} já publicada como ${cur?.ml_item_id||''}. O Publisher não vai republicar; mostrará somente a próxima pendência real.`:(cur?.publicationState?.message||'Estado do anúncio atualizado.'));
  toast(active?'PUBLICADO E ATIVO · status sincronizado.':'Status do anúncio sincronizado.',9000);
}catch(e){operationError('Falha ao sincronizar anúncio',e.message);toast(e.message,10000)}};

window.refreshRemoteStock=async id=>{try{
  const p=products.find(x=>String(x.id)===String(id));
  operationStart('Consultando estoque no Mercado Livre',`Lendo o estoque remoto da SKU ${p?.sku||''}. Esta ação não altera o estoque no ML.`);
  const d=await api(`/api/products/${id}/remote-stock/refresh`,{method:'POST'});
  await loadProducts();renderPublish();
  operationDone('Estoque atualizado',`Mercado Livre retornou ${Number(d.quantity||0)} unidade(s). Fonte: ${d.source||'Mercado Livre'}.`);
  toast(`Estoque ML atualizado: ${Number(d.quantity||0)} unidade(s).`,9000);
}catch(e){operationError('Falha ao consultar estoque',e.message);toast(e.message,10000)}};

window.runPostPublish=async(id,forcePictures=false)=>{try{
  let p=products.find(x=>String(x.id)===String(id));
  operationStart('Resolvendo esta SKU',`Consultando o Mercado Livre e executando somente correções automáticas seguras da SKU ${p?.sku||''}.`);
  const preview=await api(`/api/products/${id}/post-publish/plan`);
  await loadProducts();p=products.find(x=>String(x.id)===String(id))||p;
  const actions=Array.isArray(preview?.plan?.actions)?preview.plan.actions:[];
  const autoActions=actions.filter(a=>a.remoteWrite&&!a.manual);
  const manualActions=actions.filter(a=>a.manual);
  if(!autoActions.length){
    renderPublish();
    if(manualActions.length){
      operationDone('Anúncio publicado · sua próxima ação está abaixo',`${manualActions[0].label}. Use o botão direto da SKU; não precisa procurar em outros menus.`);
      toast('Ação manual localizada e mostrada diretamente na SKU.',9000);
    }else{
      operationDone('Tudo certo nesta SKU','Nenhuma correção automática necessária. O anúncio permanece publicado e ativo.');
      toast('Nenhuma correção necessária nesta SKU.',8000);
    }
    return;
  }
  operationStart('Corrigindo automaticamente',`${autoActions.map(a=>a.label).join(' · ')}. O Publisher valida o resultado no Mercado Livre antes de encerrar.`);
  const d=await api(`/api/products/${id}/post-publish/run`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:true,forcePictures:Boolean(forcePictures),forceStock:false})});
  await loadProducts();p=products.find(x=>String(x.id)===String(id))||p;
  const active=String(p?.ml_status||'').toLowerCase()==='active'||p?.publicationState?.code==='ACTIVE';
  const steps=d?.pipeline?.steps||{};
  const manual=Object.values(steps).find(st=>String(st?.status||'').toUpperCase()==='MANUAL');
  if(active){
    operationDone(manual?'Anúncio ativo · falta somente uma ação manual':'Anúncio publicado e ativo',manual?(manual.message||'Use a ação direta exibida na SKU.'):'As correções automáticas foram concluídas. Esta SKU saiu da fila de publicação.');
    toast(manual?'PUBLICADO E ATIVO · há uma ação manual objetiva abaixo.':'PUBLICADO E ATIVO · finalização concluída.',10000);
  }else{
    operationDone('Anúncio já criado · aguardando Mercado Livre',p?.publicationState?.message||'O Publisher continuará relendo o status. Não publique novamente.');
    toast('Anúncio já criado · aguardando apenas o status do Mercado Livre.',10000);
  }
  renderPublish();
}catch(e){operationError('Falha ao resolver publicação',e.message);toast(e.message,10000)}};

function publishPendingLabel(p){if(p?.ml_item_id)return publishedStateLabel(p)||'PUBLICADO';if(isReady(p))return 'PRONTO';if(guardBlocked(p))return guardLabel(p)||'BLOQUEADO';const rs=p.readiness?.reasons||[];if(rs.some(x=>/frete|altura|largura|comprimento|peso/i.test(x)))return 'PENDENTE FRETE';if(rs.some(x=>/catálogo|catalogo/i.test(x)))return 'PENDENTE CATÁLOGO';return 'PENDENTE'}
function renderPublish(){if(!$('#publishList'))return;const live=Boolean(status?.livePublish);if($('#publishModeBanner')){$('#publishModeBanner').className=live?'notice':'warning';$('#publishModeBanner').innerHTML=live?`✅ <b>PUBLICAÇÃO REAL ATIVA:</b> o botão final criará o anúncio no Mercado Livre após sua confirmação.`:`⚠ <b>MODO DE VALIDAÇÃO:</b> o botão abaixo <u>não publica</u>. Para publicar de verdade, no Render defina <code>ML_LIVE_PUBLISH_ENABLED=true</code> e redeploy.`}const published=products.filter(p=>p.ml_item_id),queue=products.filter(p=>!p.ml_item_id),blocked=queue.filter(p=>guardBlocked(p)),out=blocked.filter(p=>guardLabel(p)==='SKU SEM ESTOQUE').length,dup=blocked.filter(p=>guardLabel(p)==='SKU JÁ PUBLICADA').length;if($('#publishGuardSummary'))$('#publishGuardSummary').innerHTML=`<div><b>${queue.length}</b><span>SKUs na fila</span></div><div><b>${published.length}</b><span>já publicadas</span></div><div class="dangerBox"><b>${out}</b><span>SKU SEM ESTOQUE</span></div><div><b>${queue.filter(isReady).length}</b><span>liberadas</span></div>`;const displayProducts=[...queue,...published];$('#publishList').innerHTML=displayProducts.length?displayProducts.map(p=>{const isPublished=Boolean(p.ml_item_id);const reasons=isPublished?[]:[...(p.readiness?.reasons||[])];const gl=guardLabel(p);if(!isPublished&&guardBlocked(p)&&gl&&!reasons.includes(gl))reasons.unshift(gl);const b=p.commercialAnalysis?.recommendedScenario||p.commercialAnalysis?.bestScenario;const label=publishPendingLabel(p),labelClass=isPublished?(p.publicationState?.code==='ACTIVE'?'good':'warn'):(isReady(p)?'good':guardBlocked(p)?'danger':'warn');const needsFreight=!isPublished&&reasons.some(x=>/frete|altura|largura|comprimento|peso/i.test(x));const actionLabel=live?'PUBLICAR NO MERCADO LIVRE':'VALIDAR — NÃO PUBLICA';const itemLink=p.ml_permalink||(`https://produto.mercadolivre.com.br/${encodeURIComponent(p.ml_item_id||'')}`);return`<article data-product-id="${esc(p.id)}" class="productCard ${!isPublished&&guardBlocked(p)?'productBlocked':''}"><div class="cardTop"><div><span class="eyebrow">${esc(p.sku||'SEM SKU')}</span><h3>${esc(p.seoTitle||p.product)}</h3></div><span class="pill ${labelClass}">${esc(label)}</span></div><div class="meta">${isPublished?`${esc(p.ml_item_id||'')} · ${String(p.ml_status||'').toLowerCase()==='active'?'ativo no Mercado Livre':'status '+esc(p.ml_status||'em atualização')} · estoque ${p.ml_available_quantity!=null?Number(p.ml_available_quantity):Number(p.stock||0)} un.`:`${stockDisplay(p)} · Fotos ${p.imageStudio?.approvedCount||0}/9 · Qualidade ${p.quality?.score||0}% · ${esc(p.category_id||'categoria pendente')} · ${b?`${b.name} ${money(b.price)}`:'preço não analisado'}`}</div>${isPublished?`${postPublishPipelineHtml(p)}`:`${p.publicationGuard?.existingItems?.length?`<div class="guardExisting">Anúncio existente: ${p.publicationGuard.existingItems.map(esc).join(', ')}</div>${p.publicationGuard.existingItems.length===1?`<button class="btn primary wide" onclick="adoptExistingPublication('${esc(p.id)}')">VINCULAR ESTE ANÚNCIO E FINALIZAR SKU</button>`:''}`:''}${reasons.length?`<div class="blockedReasons">${reasons.map(x=>`<span>• ${esc(x)}</span>`).join('')}</div>`:''}${needsFreight?`<button class="btn ghost wide" onclick="setWorkflowFocus('${esc(p.id)}','products','Corrigir medidas e peso');nav('products')">Corrigir medidas/peso e recalcular frete</button>`:''}<button class="btn ${live?'primary':'ghost'} wide" onclick="publishOne('${p.id}')" ${isReady(p)?'':'disabled'}>${actionLabel}</button>${isReady(p)&&!live?`<small class="publishSimulationNote">Este botão apenas valida o payload. Nenhum anúncio será criado.</small>`:''}`}</article>`}).join(''):'<article class="panel">Importe produtos primeiro.</article>'}
window.publishOne=async id=>{try{const p=products.find(x=>String(x.id)===String(id));if(p?.ml_item_id){toast(`SKU já publicada: ${p.ml_item_id}. Atualizando status...`);await scanPublicationGuards();return;}const live=Boolean(status?.livePublish);if(live){const ok=confirm(`PUBLICAÇÃO REAL

SKU: ${p?.sku||''}
Produto: ${p?.seoTitle||p?.product||''}

Ao confirmar, o anúncio será criado no Mercado Livre. Deseja continuar?`);if(!ok)return;}guideShowBusy(live?'Publicando SKU no Mercado Livre':'Validando publicação em modo seguro',live?`EXECUTANDO · enviando o anúncio real${p?.sku?` da ${p.sku}`:''} ao Mercado Livre.`:`AGUARDE · conferindo dados, preço, frete, catálogo e payload final${p?.sku?` da ${p.sku}`:''}. Nenhum anúncio será criado.`);const d=await api(`/api/products/${id}/publish`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({confirm_live:live})});const state=d.publicationState||{};const waiting=state.code==='WAITING_PICTURES'||state.code==='UNDER_REVIEW'||state.code==='INACTIVE'||state.code==='PAUSED';if(d.mode==='simulation')toast('VALIDAÇÃO CONCLUÍDA — produto NÃO publicado. Ative o modo real para criar o anúncio.');else if(d.reconciled)toast(`Anúncio já existia e foi vinculado: ${d.created?.id||''} · ${state.label||'status atualizado'}`);else toast(`Produto publicado no Mercado Livre: ${d.created?.id||''}${state.label?` · ${state.label}`:''}`);await loadProducts();if(d.receipt){publicationReceipts=[d.receipt,...publicationReceipts.filter(x=>String(x.itemId||x.productId)!==String(d.receipt.itemId||d.receipt.productId))];nav('publicationResult');renderPublicationReceipts(d.receipt);}if(d.mode!=='simulation'){setTimeout(()=>{runPostPublish(id,false)},1800);guideOpenShell({welcome:true});$('#guideCoachGreeting').textContent=`SKU ${d.receipt?.sku||p?.sku||''} · publicação`;$('#guideCoachCycle').textContent='PUBLICAÇÃO';$('#guideCoachStep').textContent=waiting?'Aguardando Mercado Livre':'Concluída';$('#guideCoachProgressBar').style.width=waiting?'92%':'100%';$('#guideCoachTitle').textContent=waiting?(state.label||'Publicado · aguardando revisão'):(d.reconciled?'Anúncio localizado e vinculado':'SKU publicada no Mercado Livre');$('#guideCoachDetail').textContent=state.message||(waiting?'O anúncio foi criado, mas ainda não está ativo. O Monitor 24/7 continuará acompanhando o status.':'O anúncio foi criado e está pronto para acompanhamento.');$('#guideCoachWhy').textContent=waiting?'Não vamos publicar novamente. O Mercado Livre precisa concluir o processamento/revisão do anúncio.':'A publicação foi confirmada pelo Mercado Livre e vinculada à SKU local.';$('#guideCoachInstruction').textContent=waiting?'Aguarde a validação automática do Mercado Livre. Se a imagem falhar, o sistema deverá abrir uma correção de fotos; se for aprovada, o anúncio muda para ATIVO automaticamente.':'Confira o anúncio e siga a rotina do dia.';$('#guideCoachPrimary').hidden=false;$('#guideCoachPrimary').textContent=waiting?'Abrir Monitor 24/7':'Voltar à Rotina do dia';$('#guideCoachPrimary').onclick=()=>waiting?nav('monitor'):(nav('daily'),loadDailyOps().then(()=>guideShowDailyTask()));$('#guideCoachValidate').hidden=true;guideSetStatus(waiting?'waiting':'done',waiting?'AGUARDANDO ML':'CONCLUÍDO',state.label||'Anúncio criado no Mercado Livre.');}else{guideShowResult('waiting','Validação concluída — NÃO PUBLICADO','Somente validação. Publicação real desativada.')}}catch(e){guideShowResult('error','Falha na publicação',e.message);toast(e.message)}};
async function scanPublicationGuards(){guideShowBusy('Verificando SKUs e estoque no Mercado Livre','EXECUTANDO · consultando anúncios existentes, vinculando MLBs e lendo o estoque remoto.');try{toast('Consultando o Mercado Livre, vinculando anúncios existentes e lendo o estoque remoto...');const d=await api('/api/publication-guards/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({remote:true})});await loadProducts();renderPublish();const msg=`${d.count} verificadas · ${d.alreadyPublished} já publicadas · ${d.reconciled||0} vinculada(s) agora · ${d.outOfStock} sem estoque.`;toast(msg);guideShowResult('done','Verificação concluída',msg)}catch(e){guideShowResult('error','Falha ao verificar SKUs e estoque',e.message);toast(e.message,10000)}}
window.adoptExistingPublication=async id=>{guideShowBusy('Vinculando anúncio existente','EXECUTANDO · confirmando o MLB localizado na sua conta e retirando a SKU da fila de publicação.');try{const d=await api(`/api/products/${id}/adopt-existing`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await loadProducts();renderPublish();const detail=d.partial?`MLB ${d.itemId} vinculado. A leitura remota será repetida automaticamente${d.error?`: ${d.error}`:''}.`:`MLB ${d.itemId} vinculado${d.remoteStock!=null?` · estoque ML ${d.remoteStock} un.`:''}.`;guideShowResult(d.partial?'waiting':'done',d.partial?'SKU vinculada · aguardando leitura ML':'SKU vinculada e retirada da fila',detail);toast(detail,10000);if(!d.partial)setTimeout(()=>runPostPublish(id,false),500)}catch(e){guideShowResult('error','Falha ao vincular anúncio existente',e.message);toast(e.message,10000)}};
if($('#scanPublicationGuards'))$('#scanPublicationGuards').onclick=scanPublicationGuards;
function receiptModeLabel(r){return r?.mode==='simulation'?'SIMULAÇÃO · NÃO PUBLICADO':'PUBLICADO'}
function yesNo(v){return v?'Sim':'Não'}
function receiptCard(r,hero=false){if(!r)return '';return `<article class="publicationReceipt ${hero?'heroReceipt':''}"><div class="receiptHead"><div><span class="eyebrow">${esc(receiptModeLabel(r))}</span><h3>${esc(r.sku||'SEM SKU')} · ${esc(r.title||'')}</h3><small>${r.itemId&&r.itemId!=='SIMULACAO'?`Anúncio ${esc(r.itemId)} · `:''}${new Date(r.createdAt).toLocaleString('pt-BR')}</small></div><span class="pill ${r.mode==='live'?'good':'warn'}">${esc(receiptModeLabel(r))}</span></div><div class="receiptGrid"><div><small>SKU</small><b>${esc(r.sku||'—')}</b></div><div><small>Valor custo WeDrop</small><b>${money(r.supplierCost)}</b></div><div class="receiptStrong"><small>Valor bruto que subiu</small><b>${money(r.grossUploadPrice)}</b></div><div><small>Valor do anúncio</small><b>${money(r.listingPrice)}</b></div><div><small>Valor com desconto</small><b>${Number(r.discountPrice)>0?money(r.discountPrice):'Sem desconto ativo'}</b></div><div><small>Frete grátis</small><b>${yesNo(r.freeShipping)}</b></div><div><small>Condição de venda</small><b>${esc(r.listingLabel||r.listingType||'—')}</b></div><div><small>Envio Flex</small><b>${yesNo(r.flex)}</b><span>${esc(r.logisticType||'')}</span></div><div><small>Tarifa ML</small><b>${money(r.saleFee)}</b><span>${r.apiValidated?.fee?'API ML ✓':'estimativa'}</span></div><div><small>Frete vendedor</small><b>${money(r.sellerShipping)}</b><span>${r.apiValidated?.shipping?'API ML ✓':'estimativa'}</span></div><div><small>ADS gasto até agora</small><b>${money(r.adsSpendToDate)}</b><span>Product Ads por SKU</span></div></div><div class="receiptMoney"><div><small>VALOR A RECEBER MERCADO PAGO</small><strong>${money(r.mpReceivableEstimate)}</strong><span>Estimado por venda até existir pedido/pagamento real</span></div><div><small>VALOR LÍQUIDO DESCONTADO WEDROP</small><strong>${money(r.netAfterWedropEstimate)}</strong><span>Recebível estimado menos custo WeDrop</span></div><div class="${Number(r.estimatedFinalNet)<0?'lossReceipt':''}"><small>RESULTADO ESTIMADO APÓS IMPOSTOS + ADS</small><strong>${money(r.estimatedFinalNet)}</strong><span>A Contabilidade confirma o resultado real depois das vendas</span></div></div><p class="receiptNote">${esc(r.note||'')}</p></article>`}
function renderPublicationReceipts(focus=null){const rows=publicationReceipts||[];const hero=focus||rows[0];if($('#publicationReceiptHero'))$('#publicationReceiptHero').innerHTML=hero?receiptCard(hero,true):'<article class="panel emptyMini">Nenhuma publicação validada/publicada ainda.</article>';if($('#publicationReceiptList'))$('#publicationReceiptList').innerHTML=rows.length?rows.map(r=>receiptCard(r,false)).join(''):'<div class="emptyMini">O resumo aparecerá aqui logo após validar/publicar uma SKU.</div>'}
window.loadPublicationReceipts=async()=>{try{const d=await api('/api/publication-receipts');publicationReceipts=d.rows||[];renderPublicationReceipts()}catch(e){toast(e.message)}};
function monitorMetric(m,...keys){for(const k of keys){if(m?.[k]!=null)return Number(m[k]||0);if(m?.[String(k).toUpperCase()]!=null)return Number(m[String(k).toUpperCase()]||0)}return 0}
function qualityBand(score){const q=Number(score);if(!Number.isFinite(q))return 'na';if(q>=90)return 'excellent';if(q>=70)return 'good';if(q>=50)return 'warn';return 'bad'}
function qualityVisual(r){const q=Number.isFinite(Number(r?.qualityScore))?Math.max(0,Math.min(100,Math.round(Number(r.qualityScore)))):null;if(q==null)return '<div class="qualityMl na"><span>—</span><small>não disponível</small></div>';const band=qualityBand(q),pending=(r.qualityPending||[]).length,level=esc(r.qualityLevel||'');return `<div class="qualityMl ${band}" title="Fonte: ${esc(r.qualitySource||'Mercado Livre /performance')}"><div class="qualityMlTop"><strong>${q}%</strong><span>${level||'Qualidade ML'}</span></div><div class="qualityMlTrack"><i style="width:${q}%"></i></div><small>${pending?`${pending} melhoria(s) pendente(s)`:'sem pendências retornadas'}${r.qualityCalculatedAt?` · ${new Date(r.qualityCalculatedAt).toLocaleString('pt-BR')}`:''}</small></div>`}
function qualityPlanHtml(a){const p=a?.qualityPlan;if(!p)return'';const auto=(p.auto||[]).map(x=>esc(x.label)).filter(Boolean),guided=(p.guided||[]).map(x=>esc(x.label)).filter(Boolean),risks=(p.risks||[]).map(esc).filter(Boolean);return `<div class="monitorQualityPlan">${auto.length?`<div class="auto"><b>✓ Automático:</b> ${auto.join(' · ')}</div>`:''}${guided.length?`<div class="guided"><b>Orientação:</b> ${guided.join(' · ')}</div>`:''}${risks.length?`<div class="risk"><b>Risco:</b> ${risks.join(' ')}</div>`:''}${p.republicationCandidate?'<div class="guided"><b>Plano B:</b> se as pendências estruturais não puderem ser corrigidas e o item continuar sem vendas, preparar uma nova publicação completa antes de encerrar a antiga.</div>':''}</div>`}
function auditStatusInfo(row){const st=String(row?.status||'').toLowerCase();if(row?.confirmed||['confirmed','success','resolvido','protected'].includes(st))return{cls:'good',label:'CONFIRMADO'};if(['failed','error','erro'].includes(st))return{cls:'danger',label:'FALHOU'};if(['manual_required','review','revisar'].includes(st))return{cls:'warn',label:'AÇÃO MANUAL'};if(['applied_unverified','partial','parcial'].includes(st))return{cls:'warn',label:'AGUARDANDO CONFIRMAÇÃO'};return{cls:'neutral',label:(st||'INFO').toUpperCase()}}
function auditActionLabel(v){const m={PAUSE_OPTIONAL_CATALOG_BOOST:'Pausar catálogo opcional automático',PRODUCT_VERIFICATION_REQUIRED:'Verificar produto',PRODUCT_VERIFICATION_CONFIRMED:'Verificar produto concluído',CATALOG_OPTIONAL_READY_FOROPTIN:'Catálogo opcional elegível',CATALOG_MANDATORY_PROTECTED:'Catálogo obrigatório preservado',CATALOG_BOOST_DETECTED:'Catálogo automático detectado',CATALOG_GUARD_RUN:'Busca por Verificar produto',QUALIDADE_BAIXA:'Correção de Qualidade ML',ITEM_STATUS:'Correção de status',FRETE_MUDOU:'Reprecificação por frete',PRECO_MUDOU:'Revisão de preço',ANUNCIO_PARADO:'Otimização de anúncio parado',SEM_PROMOCAO:'Correção de promoção',PROMO_TERMINANDO:'Renovação de promoção',ADS_SEM_VENDA:'Correção de ADS',ROAS_BAIXO:'Correção de ROAS'};return m[String(v||'')]||String(v||'Ação')}
function auditJsonSummary(obj){if(!obj)return'';const pairs=Object.entries(obj).filter(([,v])=>v!==null&&v!==undefined&&v!=='').slice(0,6);return pairs.map(([k,v])=>`${esc(k)}: <b>${esc(typeof v==='object'?JSON.stringify(v):v)}</b>`).join(' · ')}
function auditLinksHtml(row){const l=row?.links||{},btn=[];if(l.publicUrl)btn.push(`<a class="mini auditLink public" href="${esc(l.publicUrl)}" target="_blank" rel="noopener noreferrer">Ver anúncio</a>`);const resolved=l.resolveEditUrl||(row?.itemId?`/api/ml/open-edit?itemId=${encodeURIComponent(row.itemId)}`:'');if(resolved)btn.push(`<a class="mini auditLink edit" href="${esc(resolved)}" target="_blank" rel="noopener noreferrer">Editar / conferir no ML</a>`);else if(l.editUrl)btn.push(`<a class="mini auditLink edit" href="${esc(l.editUrl)}" target="_blank" rel="noopener noreferrer">Editar / conferir no ML</a>`);if(l.listUrl)btn.push(`<a class="mini auditLink list" href="${esc(l.listUrl)}" target="_blank" rel="noopener noreferrer">Localizar na Central ML</a>`);return btn.join('')}
function renderOperationAudit(){const hiddenPassiveCatalog=new Set(['CATALOG_OPTIONAL_READY_FOROPTIN','CATALOG_MANDATORY_PROTECTED']);const all=[...(monitoring?.auditTrail||[])].filter(r=>!hiddenPassiveCatalog.has(String(r?.action||'')));const f=$('#auditFilter')?.value||'all';const filtered=all.filter(r=>f==='all'||f==='catalog'&&r.category==='catalog'||f==='monitor'&&r.category==='monitor'||f==='confirmed'&&Boolean(r.confirmed)||f==='failed'&&['failed','error'].includes(String(r.status||'').toLowerCase())||f==='pending'&&!r.confirmed&&!['failed','error'].includes(String(r.status||'').toLowerCase()));const confirmed=all.filter(r=>r.confirmed).length,failed=all.filter(r=>['failed','error'].includes(String(r.status||'').toLowerCase())).length,pending=all.length-confirmed-failed;if($('#auditConfirmed'))$('#auditConfirmed').textContent=confirmed;if($('#auditPending'))$('#auditPending').textContent=pending;if($('#auditFailed'))$('#auditFailed').textContent=failed;const box=$('#operationAuditList');if(!box)return;box.innerHTML=filtered.length?filtered.slice(0,100).map(r=>{const st=auditStatusInfo(r),before=auditJsonSummary(r.before),after=auditJsonSummary(r.after),verify=r.verification||{};return `<article class="auditEntry ${st.cls}"><div class="auditEntryHead"><div><span class="pill ${st.cls}">${st.label}</span><strong>${esc(auditActionLabel(r.action))}</strong><small>${esc(r.sku||'')}${r.itemId?` · ${esc(r.itemId)}`:''}</small></div><time>${r.at?new Date(r.at).toLocaleString('pt-BR'):''}</time></div>${r.title?`<h4>${esc(r.title)}</h4>`:''}<p>${esc(r.message||'')}</p>${r.reason?`<p class="auditReason"><b>Motivo:</b> ${esc(r.reason)}</p>`:''}${before||after?`<div class="auditBeforeAfter">${before?`<div><small>ANTES</small><span>${before}</span></div>`:''}${after?`<div><small>DEPOIS</small><span>${after}</span></div>`:''}</div>`:''}<div class="auditVerification"><span>${verify.remoteConfirmed?'✓ estado remoto confirmado':verify.manualActionRequired?'↗ ação manual necessária':'⏳ confirmação/observação pendente'}</span>${verify.error?`<small>${esc(verify.error)}</small>`:''}</div><div class="auditLinks">${auditLinksHtml(r)}</div></article>`}).join(''):'<div class="emptyMini">Nenhum registro nesse filtro.</div>'}
function renderCatalogGuard(){const g=monitoring?.catalogGuard||{},s=monitoring?.settings||{},verify=(g.productVerificationRequired||[]).filter(x=>String(x.status||'').toLowerCase()==='active'&&Number(x.availableQuantity||0)>0);if($('#catalogAutoGuardEnabled'))$('#catalogAutoGuardEnabled').checked=s.catalogAutoGuardEnabled!==false;if($('#catalogDailyCheckTime'))$('#catalogDailyCheckTime').value=s.catalogDailyCheckTime||'08:15';if($('#catalogAutoPauseBoostedOptional'))$('#catalogAutoPauseBoostedOptional').checked=s.catalogAutoPauseBoostedOptional!==false;if($('#catalogGuardBadge')){$('#catalogGuardBadge').textContent=s.catalogAutoGuardEnabled===false?'DESATIVADA':'ATIVA';$('#catalogGuardBadge').className=`pill ${s.catalogAutoGuardEnabled===false?'neutral':'good'}`;}if($('#catalogOptionalCount'))$('#catalogOptionalCount').textContent=verify.length;if($('#catalogMandatoryCount'))$('#catalogMandatoryCount').textContent=Number(g.ignoredNoStockCount||0);if($('#catalogBoostCount'))$('#catalogBoostCount').textContent=Number(g.ignoredInactiveCount||0);if($('#catalogActionsCount'))$('#catalogActionsCount').textContent=(g.actions||[]).length;const box=$('#catalogGuardStatus');if(box){const errs=(g.errors||[]).length,noStock=Number(g.ignoredNoStockCount||0),inactive=Number(g.ignoredInactiveCount||0);box.className=`catalogGuardStatus ${errs?'attention':''}`;box.innerHTML=g.lastRunAt?`<b>Última busca: ${new Date(g.lastRunAt).toLocaleString('pt-BR')} · ${verify.length} SKU(s) para “Verificar produto”</b><span>${verify.length?'Essas são as únicas SKUs que entram na fila. ':'Nenhuma SKU exige “Verificar produto” neste momento. '}${noStock?`${noStock} anúncio(s) sem estoque foram ignorados. `:''}${inactive?`${inactive} anúncio(s) inativo(s) foram ignorados. `:''}${(g.actions||[]).length?`${(g.actions||[]).length} ação(ões) automática(s) executada(s). `:'Nenhuma alteração remota foi feita. '}${errs?`${errs} consulta(s) falharam e serão repetidas.`:'Conferência concluída.'}</span>`:'<b>Aguardando primeira busca.</b><span>O Publisher mostrará somente anúncios ativos, com estoque e com o objetivo real “Verificar produto”.</span>';}}
function showMonitorResolution(d,a){const box=$('#monitorLastResolution');if(!box)return;box.hidden=false;const ap=d?.details?.applied||[],guided=d?.details?.guided||[],risks=d?.details?.risks||[],rep=d?.details?.republicationAdvice||'';box.innerHTML=`<h4>${d.resolved?'✓':'↗'} ${esc(a?.sku||'SKU')} · resultado da correção</h4><p>${esc(d.message||'Análise concluída.')}</p>${ap.length?`<p><b>Aplicado:</b> ${ap.map(esc).join(' ')}</p>`:''}${guided.length?`<p><b>Ainda precisa:</b> ${guided.map(x=>`${esc(x.label)} — ${esc(x.reason)}`).join(' ')}</p>`:''}${risks.length?`<p><b>Risco evitado:</b> ${risks.map(esc).join(' ')}</p>`:''}${rep?`<p><b>Alternativa:</b> ${esc(rep)}</p>`:''}<div class="resolutionTags"><span>${d.changed?'ALTERAÇÃO ENVIADA':'SEM ALTERAÇÃO REMOTA'}</span><span>${d.resolved?'EM OBSERVAÇÃO/RESOLVIDO':'REVISÃO NECESSÁRIA'}</span></div>${d.links?`<div class="auditLinks">${auditLinksHtml({links:d.links})}</div>`:''}`;box.scrollIntoView({behavior:'smooth',block:'nearest'});}

function monitorProgressRender(job){const box=$('#monitorRunProgress');if(!box)return;if(!job){box.hidden=true;return;}box.hidden=false;const pct=Math.max(0,Math.min(100,Number(job.percent||0)));if($('#monitorProgressBar'))$('#monitorProgressBar').style.width=`${pct}%`;if($('#monitorProgressPct'))$('#monitorProgressPct').textContent=`${Math.round(pct)}%`;if($('#monitorProgressStage'))$('#monitorProgressStage').textContent=job.sku?`${job.stage||'Analisando'} · ${job.sku}`:(job.stage||'Analisando');if($('#monitorProgressMessage'))$('#monitorProgressMessage').textContent=job.message||'Executando análise.';if($('#monitorProgressCounts'))$('#monitorProgressCounts').textContent=job.total?`${job.completed||0} / ${job.total}${job.failed?` · ${job.failed} falha(s)`:''}`:'Preparando';if($('#monitorProgressHeartbeat')){const d=job.lastHeartbeatAt?new Date(job.lastHeartbeatAt):null;$('#monitorProgressHeartbeat').textContent=d?`Última atividade: ${d.toLocaleTimeString('pt-BR')} · processo ${job.status==='running'?'ativo':job.status}`:`Status: ${job.status||'aguardando'}`;}box.classList.toggle('done',job.status==='done');box.classList.toggle('error',job.status==='error')}
function monitorFixIsAutomatic(type){return ['ITEM_STATUS','FRETE_MUDOU','SEM_PROMOCAO','PROMO_TERMINANDO','ADS_SEM_VENDA','ROAS_BAIXO','ANUNCIO_PARADO','QUALIDADE_BAIXA'].includes(String(type||''))}
function monitorFixLabel(a){if(monitorFixIsAutomatic(a?.type))return 'Corrigir agora';if(['CTR_BAIXO','CVR_BAIXO','CONVERSAO_BAIXA','PRECO_MUDOU'].includes(String(a?.type||'')))return 'Corrigir / revisar';return 'Abrir correção'}
function renderMonitoring(){
  const severityRank={critical:0,warning:1,info:2};const alerts=[...(monitoring.alerts||[])].sort((a,b)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9)||String(a.sku||'').localeCompare(String(b.sku||'')));const rows=[...(monitoring.rows||[])].sort((a,b)=>{const ac=(a.alerts||[]).some(x=>x.severity==='critical')?0:(a.alerts||[]).length?1:2;const bc=(b.alerts||[]).some(x=>x.severity==='critical')?0:(b.alerts||[]).length?1:2;return ac-bc||String(a.sku||'').localeCompare(String(b.sku||''))});const s=monitoring.settings||{};
  if($('#monitorEnabled'))$('#monitorEnabled').checked=Boolean(s.monitoringEnabled);if($('#monitorInterval'))$('#monitorInterval').value=s.monitoringIntervalMinutes||15;if($('#monitorVisitDays'))$('#monitorVisitDays').value=s.monitoringVisitWindowDays||7;if($('#monitorPromoHours'))$('#monitorPromoHours').value=s.monitoringPromotionExpiryHours||24;if($('#monitorMinVisits'))$('#monitorMinVisits').value=s.monitoringMinVisits||50;if($('#monitorMinAdsClicks'))$('#monitorMinAdsClicks').value=s.monitoringMinAdsClicks||20;if($('#monitorDormantDays'))$('#monitorDormantDays').value=s.monitoringDormantDays||14;if($('#monitorDormantMaxVisits'))$('#monitorDormantMaxVisits').value=s.monitoringDormantMaxVisits??3;if($('#monitorQualityMinScore'))$('#monitorQualityMinScore').value=s.monitoringQualityMinScore||90;
  if($('#monitorWebhookUrl'))$('#monitorWebhookUrl').textContent=`${location.origin}/webhooks/mercadolivre`;
  if($('#monitorStatus'))$('#monitorStatus').textContent=monitoring.lastRunAt?`Última análise: ${new Date(monitoring.lastRunAt).toLocaleString('pt-BR')} · origem ${monitoring.source||'manual'}`:'Ainda não analisado.';
  if($('#monProducts'))$('#monProducts').textContent=rows.length;if($('#monCritical'))$('#monCritical').textContent=alerts.filter(a=>a.severity==='critical').length;if($('#monWarnings'))$('#monWarnings').textContent=alerts.filter(a=>['warning','info'].includes(a.severity)).length;if($('#monAdsSpend'))$('#monAdsSpend').textContent=money(rows.reduce((sum,r)=>sum+monitorMetric(r.ads,'cost'),0));const qualityRows=rows.filter(r=>Number.isFinite(Number(r.qualityScore)));const qualityAvg=qualityRows.length?Math.round(qualityRows.reduce((sum,r)=>sum+Number(r.qualityScore),0)/qualityRows.length):null;if($('#monQualityAvg')){$('#monQualityAvg').textContent=qualityAvg==null?'—':`${qualityAvg}%`;$('#monQualityAvg').className=qualityAvg==null?'':qualityBand(qualityAvg)};renderCatalogGuard();renderOperationAudit()
  if($('#monitorAlerts'))$('#monitorAlerts').innerHTML=alerts.length?alerts.map((a,i)=>`<div class="monitorAlert ${esc(a.severity)}" data-monitor-alert="${esc(a.id)}" data-monitor-sku="${esc(a.sku)}"><div class="monitorAlertBody"><div class="monitorAlertTop"><span class="pill ${a.severity==='critical'?'danger':a.severity==='warning'?'warn':'neutral'}">${esc(a.type)}</span><span class="monitorQueueNumber">#${i+1}</span></div><b>${esc(a.sku)} · ${esc(a.title)}</b><small class="monitorFullMessage">${esc(a.message)}</small>${a.solution?`<em class="monitorSolution"><b>Solução recomendada:</b> ${esc(a.solution)}</em>`:''}${a.type==='QUALIDADE_BAIXA'?qualityPlanHtml(a):''}</div><div class="monitorAlertActions"><span class="monitorActionName">${esc(a.action||'REVISAR')}</span><button class="btn ${monitorFixIsAutomatic(a.type)?'primary':'ghost'} monitorFixBtn" onclick="monitorFixAlert('${encodeURIComponent(a.id)}')">${monitorFixLabel(a)}</button></div></div>`).join(''):'<div class="emptyMini">Nenhum alerta operacional no último ciclo. Tudo que o monitor conseguiu validar está OK.</div>';
  if($('#monitorTable'))$('#monitorTable').innerHTML=rows.length?`<table><thead><tr><th>SKU</th><th>Status</th><th>Qualidade ML</th><th>Preço</th><th>Frete</th><th>Flex</th><th>Visitas</th><th>Vendas</th><th>Promoção</th><th>ADS</th><th>Saúde / ação</th></tr></thead><tbody>${rows.map(r=>{const ra=r.alerts||[],hasCritical=ra.some(a=>a.severity==='critical');const waiting=Boolean(r.waitingStock);const q=Number.isFinite(Number(r.qualityScore))?Math.round(Number(r.qualityScore)):null;return `<tr class="${waiting?'monitorWaitingStock':''}"><td><b>${esc(r.sku||'—')}</b><small>${esc(r.itemId||'')}</small></td><td>${waiting&&Number(r.stockExpected||0)>0?`<span class="pill danger">ESTOQUE DIVERGENTE · ML ${Number(r.availableQuantity||0)} / ESPERADO ${Number(r.stockExpected||0)}</span>`:waiting?'<span class="pill neutral">SEM ESTOQUE · FORA DA FILA</span>':`<span class="pill ${String(r.status).toLowerCase()==='active'?'good':'danger'}">${esc(r.status||'—')}</span>`}${Array.isArray(r.subStatus)&&r.subStatus.length?`<small>${esc(r.subStatus.join(', '))}</small>`:''}</td><td>${qualityVisual(r)}</td><td>${money(r.currentPrice)}${r.priceChanged?'<small class="negative">mudou</small>':''}</td><td>${money(r.shippingCost)}${r.shippingChanged?'<small class="negative">mudou</small>':''}</td><td>${yesNo(r.flex)}</td><td>${Number(r.visits||0)}<small>${r.visitWindowDays||7} dias${Number(r.dormantVisits||0)!==Number(r.visits||0)?` · ${Number(r.dormantVisits||0)} em ${r.dormantWindowDays||14}d`:''}</small></td><td>${Number(r.salesUnits||0)}<small>${Number(r.orders||0)} pedidos</small></td><td>${r.promotion?.noneActive?'<span class="pill warn">SEM PROMO</span>':`<span class="pill good">${Number(r.promotion?.activeCount||0)} ativa(s)</span>`}${r.promotion?.expiringSoon?'<small class="negative">terminando</small>':''}</td><td>${money(monitorMetric(r.ads,'cost'))}<small>${Math.round(monitorMetric(r.ads,'clicks'))} cliques · ROAS ${monitorMetric(r.ads,'roas').toFixed(2)}x</small></td><td class="monitorHealthCell">${waiting&&Number(r.stockExpected||0)>0?`<span class="pill danger">CORRIGIR ESTOQUE</span><small>Fonte ${esc(r.stockSource||'remota')} · esperado ${Number(r.stockExpected||0)} un.</small>`:waiting?'<span class="pill neutral">AGUARDANDO ESTOQUE</span><small>Fornecedor/local também está sem estoque.</small>':`<span class="pill ${hasCritical?'danger':ra.length?'warn':'good'}">${ra.length?`${ra.length} alerta(s)`:'OK'}</span>${ra.length?`<button class="mini monitorHealthBtn" onclick="focusMonitorAlerts('${encodeURIComponent(r.sku||r.itemId||'')}')">Ver e corrigir</button>`:'<small>Sem ação pendente</small>'}`}</td></tr>`}).join('')}</tbody></table>`:'<div class="emptyMini">Publique uma SKU e execute o monitor para começar.</div>';
}
window.focusMonitorAlerts=encoded=>{const sku=decodeURIComponent(encoded||'');let first=null;document.querySelectorAll('.monitorAlert').forEach(x=>{const hit=String(x.dataset.monitorSku||'')===String(sku);x.classList.toggle('monitorAlertFocus',hit);if(hit&&!first)first=x});if(first){first.scrollIntoView({behavior:'smooth',block:'center'});toast(`Alertas da SKU ${sku} destacados acima.`)}else toast(`Nenhum alerta atual para ${sku}.`)};
window.monitorFixAlert=async encoded=>{
  const alertId=decodeURIComponent(encoded||'');const a=(monitoring.alerts||[]).find(x=>String(x.id)===String(alertId));if(!a)return toast('Esse alerta já saiu da fila. Execute a análise novamente se necessário.');
  try{const r=await api(`/api/monitoring/fix/plan?alertId=${encodeURIComponent(alertId)}`);guideShowCorrectionPlan(r.plan,()=>monitorExecuteAlertFix(alertId,a));}
  catch(e){toast(`Não foi possível montar o plano: ${e.message}`,10000)}
};
async function monitorExecuteAlertFix(alertId,a){
  try{guideShowBusy(`Executando correções · ${a.sku}`,`Aplicando somente as etapas mostradas no plano da SKU ${a.sku}.`);operationStart(`Executando correção · ${a.sku}`,'Aplicando o plano aprovado e validando o resultado da própria ação.');const d=await api('/api/monitoring/fix',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({alertId,confirm:true})});monitoring=d.monitoring||monitoring;renderMonitoring();showMonitorResolution(d,a);guideShowExecution(null,d);if(d.resolved){operationDone(`✓ ${a.sku} concluído`,d.message||'Problema corrigido. A varredura completa continuará em segundo plano.');toast(`✓ ${a.sku}: ${d.message||'Problema corrigido.'}`,10000);}else{operationDone(`${a.sku} processado`,d.message||'Ainda exige revisão.');toast(`${a.sku}: ${d.message||'Ainda exige revisão.'}`,10000);if(d.route?.view&&d.route.view!=='monitor'){if(d.route.productId)setWorkflowFocus(d.route.productId,d.route.view,d.route.label||'Correção do monitor');nav(d.route.view);}}}
  catch(e){operationError(`Falha na correção · ${a.sku}`,e.message);guideShowResult('error','Falha na correção',e.message);toast(`ERRO · ${a.sku}: ${e.message}`,10000)}
}


async function runCatalogGuardNow(){try{operationStart('Buscando “Verificar produto”','EXECUTANDO · vou montar somente a fila realmente acionável. Anúncios sem estoque ou inativos serão ignorados.');toast('EXECUTANDO · procurando SKUs com “Verificar produto”...',7000);const d=await api('/api/catalog-guard/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({autoApply:true})});monitoring=await api('/api/monitoring');renderMonitoring();const g=d.guard||{},pending=(g.productVerificationRequired||[]).filter(x=>String(x.status||'').toLowerCase()==='active'&&Number(x.availableQuantity||0)>0).length,msg=`${pending} SKU(s) com “Verificar produto” · ${Number(g.ignoredNoStockCount||0)} sem estoque ignorada(s) · ${Number(g.ignoredInactiveCount||0)} inativa(s) ignorada(s).`;operationDone('Busca concluída',msg);toast(`✓ ${msg}`,10000)}catch(e){operationError('Falha ao buscar “Verificar produto”',e.message);toast(e.message,10000)}}
if($('#runCatalogGuard'))$('#runCatalogGuard').onclick=()=>runCatalogGuardNow();
if($('#saveCatalogGuard'))$('#saveCatalogGuard').onclick=async()=>{try{const body={catalogAutoGuardEnabled:$('#catalogAutoGuardEnabled').checked,catalogDailyCheckTime:$('#catalogDailyCheckTime').value,catalogAutoPauseBoostedOptional:$('#catalogAutoPauseBoostedOptional').checked};operationStart('Salvando proteção de catálogo','Persistindo política diária de não participar quando opcional.');await api('/api/catalog-guard/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});operationDone('Proteção salva',body.catalogAutoGuardEnabled?'Verificação diária ativada.':'Verificação diária desativada.');toast('Proteção de catálogo salva.');await loadMonitoring()}catch(e){operationError('Falha ao salvar proteção',e.message);toast(e.message)}};
if($('#openMlListings'))$('#openMlListings').onclick=()=>window.open('https://www.mercadolivre.com.br/anuncios/lista','_blank','noopener,noreferrer');if($('#auditFilter'))$('#auditFilter').onchange=()=>renderOperationAudit();if($('#refreshAudit'))$('#refreshAudit').onclick=async()=>{try{const d=await api('/api/monitoring/audit?limit=500');monitoring={...monitoring,auditTrail:d.rows||[]};renderOperationAudit();toast('Auditoria atualizada.')}catch(e){toast(e.message)}};

async function loadMonitoring(){try{monitoring=await api('/api/monitoring');renderMonitoring()}catch(e){toast(e.message)}}
if($('#saveMonitorSettings'))$('#saveMonitorSettings').onclick=async()=>{try{const body={monitoringEnabled:$('#monitorEnabled').checked,monitoringIntervalMinutes:$('#monitorInterval').value,monitoringVisitWindowDays:$('#monitorVisitDays').value,monitoringPromotionExpiryHours:$('#monitorPromoHours').value,monitoringMinVisits:$('#monitorMinVisits').value,monitoringMinAdsClicks:$('#monitorMinAdsClicks').value,monitoringDormantDays:$('#monitorDormantDays').value,monitoringDormantMaxVisits:$('#monitorDormantMaxVisits').value,monitoringQualityMinScore:$('#monitorQualityMinScore').value,catalogAutoGuardEnabled:$('#catalogAutoGuardEnabled')?.checked!==false,catalogDailyCheckTime:$('#catalogDailyCheckTime')?.value||'08:15',catalogAutoPauseBoostedOptional:$('#catalogAutoPauseBoostedOptional')?.checked!==false};operationStart('Salvando regras do Monitor','Aguarde enquanto as novas regras são persistidas.');await api('/api/monitoring/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});operationDone('Regras do Monitor salvas',body.monitoringEnabled?'Monitor periódico ativado.':'Configurações salvas.');toast(body.monitoringEnabled?'Monitor periódico ativado.':'Configurações do monitor salvas.');await loadMonitoring()}catch(e){operationError('Falha ao salvar Monitor',e.message);toast(e.message)}};
if($('#runMonitorNow'))$('#runMonitorNow').onclick=async()=>{try{const btn=$('#runMonitorNow');if(btn)btn.disabled=true;operationStart('Analisando todos os anúncios','EXECUTANDO · o progresso será mostrado em tempo real. Você pode acompanhar SKU, etapa, percentual e última atividade.');toast('EXECUTANDO · iniciando monitor em lotes...',7000);const start=await api('/api/monitoring/run/start',{method:'POST'});let job=start.job;monitorProgressRender(job);while(job&&job.status==='running'){await new Promise(r=>setTimeout(r,900));job=await api(`/api/monitoring/run/${encodeURIComponent(job.id)}`);monitorProgressRender(job)}if(!job)throw new Error('A execução do monitor perdeu o status.');if(job.status==='error')throw new Error(job.error||job.message||'Falha no monitor.');monitoring=await api('/api/monitoring');renderMonitoring();monitorProgressRender(job);const msg=`${monitoring.rows?.length||0} anúncio(s) verificados · ${monitoring.alerts?.length||0} alerta(s) · ${monitoring.errors?.length||0} falha(s) de consulta.`;operationDone('Análise concluída',msg);toast(`✓ ${msg}`,10000);if(btn)btn.disabled=false}catch(e){const btn=$('#runMonitorNow');if(btn)btn.disabled=false;operationError('Falha na análise',e.message);toast(e.message,10000)}};
async function loadJobs(){const [j,a]=await Promise.all([api('/api/jobs'),api('/api/monitoring/audit?limit=100')]);const audit=(a.rows||[]).map(r=>{const st=auditStatusInfo(r);return `<article class="historyAudit ${st.cls}"><b>${esc(auditActionLabel(r.action))}</b> · <span class="pill ${st.cls}">${st.label}</span><span class="muted"> · ${r.at?new Date(r.at).toLocaleString('pt-BR'):''}</span>${r.sku?` · SKU ${esc(r.sku)}`:''}<div>${esc(r.message||'')}</div><div class="auditLinks">${auditLinksHtml(r)}</div></article>`}).join('');const jobs=j.length?j.map(x=>`<article><b>${esc(x.type)}</b> · ${esc(x.status)}<span class="muted"> · ${new Date(x.at).toLocaleString('pt-BR')}</span>${x.sku?` · SKU ${esc(x.sku)}`:''}${x.error?`<div>${esc(x.error)}</div>`:''}</article>`).join(''):'<article>Nenhuma operação registrada.</article>';$('#jobs').innerHTML=`${audit?`<article class="historySectionTitle"><b>Auditoria confirmável</b><span>Alterações com links para conferência no Mercado Livre.</span></article>${audit}`:''}<article class="historySectionTitle"><b>Jobs técnicos</b></article>${jobs}`;}
async function loadOpportunities(){try{opportunityScan=await api('/api/opportunities');renderOpportunities()}catch(e){toast(e.message)}}
function oppProblem(x){if(x.error)return x.error;if(!Number(x.cost||0))return 'Sem custo no catálogo WeDrop';if(!Number(x.marketPrice||0))return 'Sem preço de mercado comparável';if(!Number(x.matchScore||0))return 'Correspondência fraca no Mercado Livre';return ''}
function renderOpportunities(){
  const el=$('#opportunityCards'),sum=$('#opportunitySummary');if(!el)return;const rs=opportunityScan.results||[];
  if(!opportunityScan.scannedAt&&!rs.length){if(sum)sum.innerHTML='';el.innerHTML='<article class="panel scannerEmpty"><b>Nenhuma análise executada ainda.</b><span>Clique em “Analisar 10 produtos”. Os resultados aparecerão aqui com checkbox para seleção.</span></article>';return;}
  const good=rs.filter(x=>Number(x.score||0)>=45&&Number(x.marketPrice||0)>0),high=rs.filter(x=>Number(x.score||0)>=65&&Number(x.marketPrice||0)>0),matched=rs.filter(x=>Number(x.marketPrice||0)>0),errors=rs.filter(x=>x.error);
  if(sum)sum.innerHTML=`<div><small>ANALISADOS</small><b>${rs.length}</b></div><div><small>COM MERCADO</small><b>${matched.length}</b></div><div><small>OPORTUNIDADES</small><b>${good.length}</b></div><div><small>ALTA OPORT.</small><b>${high.length}</b></div><div><small>SEM MATCH/ERRO</small><b>${rs.length-matched.length+errors.length}</b></div><div class="scannerRange"><small>FAIXA DO CATÁLOGO</small><b>${Number(opportunityScan.offset||0)+1}–${Number(opportunityScan.offset||0)+rs.length} de ${Number(opportunityScan.totalCatalog||rs.length)}</b></div>`;
  if(!rs.length){el.innerHTML='<article class="panel scannerEmpty"><b>A varredura terminou, mas nenhum resultado foi retornado.</b><span>Isso pode acontecer se o catálogo não tiver custo/nome suficiente ou se a API não encontrar equivalentes. Rode novamente ou verifique o Catálogo WeDrop.</span></article>';return;}
  el.innerHTML=`<div class="scannerTableWrap"><table class="scannerTable"><thead><tr><th>✓</th><th>SKU / Produto</th><th>Mercado comparável</th><th>Preço mercado</th><th>Custo</th><th>Lucro est.</th><th>Margem</th><th>Demanda / Curva</th><th>Score</th><th>Status</th></tr></thead><tbody>${rs.map(x=>{const problem=oppProblem(x);const status=x.status||(problem?'REVISAR':'MONITORAR');const cls=Number(x.score||0)>=65?'good':Number(x.score||0)>=45?'mid':problem?'bad':'neutral';return `<tr class="scannerRow ${cls}"><td><input type="checkbox" class="oppSelect" value="${esc(x.sku)}"></td><td><b>${esc(x.sku||'—')}</b><span>${esc(x.product||'Produto sem nome')}</span></td><td>${x.marketTitle?`<b>${esc(x.marketTitle)}</b><span>Match ${Math.round(Number(x.matchScore||0)*100)}%</span>`:`<span class="warnText">${esc(problem||'Sem correspondência')}</span>`}</td><td>${Number(x.marketPrice||0)>0?money(x.marketPrice):'—'}</td><td>${Number(x.cost||0)>0?money(x.cost):'—'}</td><td>${Number(x.estimatedProfit||0)?money(x.estimatedProfit):'—'}</td><td>${Number(x.estimatedMargin||0)?pct(x.estimatedMargin):'—'}</td><td><span class="curve ${x.curve?'curve'+x.curve:'curvePending'}">${x.curve?`CURVA ${x.curve}`:'30D PENDENTE'}</span><small>${esc(x.demandSignal||'Sem sinal')}</small></td><td><span class="scorePill">${Math.round(x.score||0)}</span></td><td><span class="scannerStatus ${cls}">${esc(status)}</span>${problem?`<small>${esc(problem)}</small>`:''}</td></tr>`}).join('')}</tbody></table></div>`;
}
async function runOpportunityScan(limit,offset=0){try{toast(`Analisando ${limit} produtos no Mercado Livre...`);opportunityScan=await api('/api/opportunities/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({limit,offset})});renderOpportunities();toast(`${opportunityScan.count||0} produtos analisados · ${opportunityScan.matchedCount||0} com mercado comparável.`)}catch(e){toast(e.message)}}
if($('#scan10'))$('#scan10').onclick=()=>runOpportunityScan(10,0);if($('#scan25'))$('#scan25').onclick=()=>runOpportunityScan(25,0);if($('#scanNext'))$('#scanNext').onclick=()=>runOpportunityScan(10,Number(opportunityScan.offset||0)+Number(opportunityScan.count||0));if($('#selectGoodOpp'))$('#selectGoodOpp').onclick=()=>{const good=new Set((opportunityScan.results||[]).filter(x=>Number(x.score||0)>=45&&Number(x.marketPrice||0)>0).map(x=>String(x.sku)));$$('.oppSelect').forEach(x=>x.checked=good.has(String(x.value)));toast(`${good.size} oportunidade(s) selecionada(s).`)};if($('#importSelectedOpp'))$('#importSelectedOpp').onclick=async()=>{const skus=$$('.oppSelect:checked').map(x=>x.value);if(!skus.length)return toast('Marque os produtos desejados na primeira coluna.');try{const d=await api('/api/opportunities/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({skus})});await loadProducts();toast(`${d.count} produtos do Scanner foram importados.`);nav('products')}catch(e){toast(e.message)}};
async function loadVariations(){try{const d=await api('/api/variations/groups');variationGroups=d.groups||[];renderVariations()}catch(e){toast(e.message)}}
function renderVariations(){const el=$('#variationGroups');if(!el)return;el.innerHTML=variationGroups.length?variationGroups.map(g=>`<article class="productCard"><div class="cardTop"><div><span class="eyebrow">${g.variants.length} VARIAÇÕES</span><h3>${esc(g.familyName)}</h3></div><span class="pill good">${Math.round((g.confidence||0)*100)}% confiança</span></div><p class="muted">Varia por: ${(g.attributes||[]).join(', ')}</p><div class="variantChips">${g.variants.map(v=>`<span>${esc(v.sku)} · ${esc(v.color||v.size||v.voltage||v.capacity||'variante')}</span>`).join('')}</div><button class="btn ghost wide" onclick="prepareVariation('${g.id}')">Preparar publicação automática</button></article>`).join(''):'<article class="panel">Nenhum grupo detectado ainda.</article>'}

function opsEsc(v){return esc(v==null?'':String(v))}
function opsVal(v){return typeof v==='number'?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v):opsEsc(v)}
function renderOpsAnswer(d){const el=$('#opsResult');if(!el)return;const metrics=(d.metrics||[]).length?`<div class="opsMetricGrid">${d.metrics.map(([k,v])=>`<div><small>${opsEsc(k)}</small><b>${opsVal(v)}</b></div>`).join('')}</div>`:'';const alerts=(d.alerts||[]).length?`<div class="opsBlock"><h3>Diagnóstico + solução</h3>${d.alerts.map(x=>`<div class="opsAlert ${opsEsc(x.severity||'info')}"><div><span class="pill ${x.severity==='critical'?'danger':x.severity==='warning'?'warn':'neutral'}">${opsEsc(x.type||'ALERTA')}</span><b>${opsEsc(x.title||'')}</b><p>${opsEsc(x.message||'')}</p><strong>Solução recomendada</strong><p>${opsEsc(x.solution||'Revisar a SKU e corrigir a causa antes de escalar.')}</p></div></div>`).join('')}</div>`:'';let rows='';if((d.rows||[]).length){const keys=[...new Set(d.rows.flatMap(x=>Object.keys(x||{})))].slice(0,8);rows=`<div class="opsBlock"><h3>Resultado</h3><div class="tableWrap"><table><thead><tr>${keys.map(k=>`<th>${opsEsc(k)}</th>`).join('')}</tr></thead><tbody>${d.rows.slice(0,100).map(r=>`<tr>${keys.map(k=>`<td>${typeof r[k]==='boolean'?(r[k]?'Sim':'Não'):opsVal(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`}const actions=(d.actions||[]).length?`<div class="opsActions">${d.actions.map((x,i)=>`<button class="btn ${i===0?'primary':'ghost'}" onclick='runOpsAction(${JSON.stringify(x).replace(/'/g,"&#39;")})'>${opsEsc(x.label||x.type)}</button>`).join('')}</div>`:'';el.innerHTML=`<div class="panelhead"><div><span class="eyebrow">RESPOSTA OPERACIONAL</span><h3>${opsEsc(d.title||'Central IA')}</h3></div><small>${d.generatedAt?new Date(d.generatedAt).toLocaleString('pt-BR'):''}</small></div><p class="opsSummary">${opsEsc(d.summary||'')}</p>${d.note?`<div class="warning miniWarning">${opsEsc(d.note)}</div>`:''}${metrics}${alerts}${rows}${actions}`}
async function loadOpsOverview(){try{const d=await api('/api/ops/overview');if($('#opsInventory'))$('#opsInventory').textContent=d.inventoryCount||0;if($('#opsCatalog'))$('#opsCatalog').textContent=d.catalogEligibleCount||0;if($('#opsAlerts'))$('#opsAlerts').textContent=d.alerts||0;if($('#opsProducts'))$('#opsProducts').textContent=d.products||0;}catch(e){toast(e.message)}}
async function askOps(question=null){const q=String(question||$('#opsQuestion')?.value||'').trim();if(!q)return toast('Digite uma pergunta sobre sua operação.');if($('#opsQuestion'))$('#opsQuestion').value=q;try{operationStart('Consultando a Central IA','EXECUTANDO · cruzando Publisher, Mercado Livre, ADS, promoções, contabilidade e monitor. Aguarde...');toast('EXECUTANDO · cruzando dados da operação. Aguarde...',9000);const d=await api('/api/ops/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question:q})});renderOpsAnswer(d);await loadOpsOverview();operationDone('Consulta concluída','Diagnóstico e solução disponíveis na tela.');toast('✓ Análise concluída com diagnóstico e solução.',10000)}catch(e){operationError('Falha na Central IA',e.message);toast(e.message,10000)}}
window.runOpsAction=async action=>{try{if(!action?.type)return;if(!confirm(`Executar esta ação?\n\n${action.label||action.type}`))return;operationStart('Executando ação confirmada','Aguarde enquanto o sistema aplica a ação e valida o resultado.');toast('EXECUTANDO ação confirmada. Aguarde...',9000);const d=await api('/api/ops/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(action)});operationDone('Ação concluída',d.message||'Ação concluída.');toast(d.message||'Ação concluída.',10000);await loadOpsOverview();if($('#opsQuestion')?.value)await askOps($('#opsQuestion').value)}catch(e){operationError('Falha na ação',e.message);toast(e.message,10000)}};
if($('#opsAsk'))$('#opsAsk').onclick=()=>askOps();$$('[data-ops-q]').forEach(b=>b.onclick=()=>askOps(b.dataset.opsQ));if($('#opsQuestion'))$('#opsQuestion').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')askOps()});

if($('#detectVariations'))$('#detectVariations').onclick=async()=>{try{const d=await api('/api/variations/detect',{method:'POST'});variationGroups=d.groups||[];renderVariations();toast(`${d.count} grupo(s) de variação detectados.`)}catch(e){toast(e.message)}};window.prepareVariation=async id=>{try{const d=await api(`/api/variations/${encodeURIComponent(id)}/prepare`,{method:'POST'});toast(`${d.preview.mode==='user_products'?'User Products':'Variações legadas'} · ${d.preview.variants.length} variantes preparadas.`)}catch(e){toast(e.message)}};
async function loadKits(){try{const d=await api('/api/kits/suggestions');kitSuggestions=d.items||[];renderKits()}catch(e){toast(e.message)}}
function renderKits(){const el=$('#kitCards');if(!el)return;el.innerHTML=kitSuggestions.length?kitSuggestions.map(k=>`<article class="productCard kitCard"><div class="cardTop"><div><span class="eyebrow">${esc(k.bucket||'KIT')}</span><h3>${k.components.map(x=>esc(x.product)).join(' + ')}</h3></div><span class="pill ${k.viable?'good':'warn'}">${k.viable?'VIÁVEL':'REVISAR'}</span></div><div class="intelGrid"><div><small>PREÇO KIT MERCADO</small><b>${money(k.marketKitPrice)}</b></div><div><small>LUCRO KIT</small><b>${money(k.scenario?.profit)}</b></div><div><small>GANHO VS INDIVIDUAL</small><b>${money(k.gain)}</b></div><div><small>MARGEM</small><b>${pct(k.scenario?.margin)}</b></div></div>${(k.risk||[]).length?`<div class="blockedReasons">${k.risk.map(r=>`<span>• ${esc(r)}</span>`).join('')}</div>`:''}<button class="btn primary wide" onclick="publishKit('${k.id}')" ${k.viable?'':'disabled'}>Validar kit virtual</button></article>`).join(''):'<article class="panel">Clique em <b>Gerar sugestões de kits</b>. O sistema só aprova combinações com margem e mercado compatíveis.</article>'}
if($('#generateKits'))$('#generateKits').onclick=async()=>{try{toast('Analisando combinações, preço, frete e margem...');const d=await api('/api/kits/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({limit:10})});kitSuggestions=d.items||[];renderKits();toast(`${d.count} sugestões avaliadas.`)}catch(e){toast(e.message)}};window.publishKit=async id=>{try{const d=await api(`/api/kits/${encodeURIComponent(id)}/publish`,{method:'POST'});toast(d.mode==='simulation'?'Kit validado em modo seguro.':'Kit publicado.')}catch(e){toast(e.message)}};



function persistedSelectedPromoIds(){return [...new Set((promotionState.rows||[]).filter(r=>Boolean(r.selected)&&Boolean(r.eligible)&&r.recommendation==='APTA'&&String(r.status||'').toLowerCase()==='candidate').map(r=>String(r.id||'')).filter(Boolean))]}
function refreshPromoSelectionUi(){const count=persistedSelectedPromoIds().length;const btn=$('#applySelectedPromos');if(btn)btn.textContent=count?`Aplicar ${count} promoção${count===1?'':'ões'} segura${count===1?'':'s'}`:'Aplicar selecionadas';return count}
async function persistPromoSelection(rowIds){promotionState=await api('/api/promotions/selection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rowIds})});renderPromotions();return promotionState}
window.savePromoSelection=async id=>{try{const row=(promotionState.rows||[]).find(r=>String(r.id)===String(id));if(!row)return;row.selected=Boolean($(`.promoSelect[value="${CSS.escape(String(id))}"]`)?.checked);refreshPromoSelectionUi();const ids=persistedSelectedPromoIds();promotionState=await api('/api/promotions/selection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rowIds:ids})});renderPromotions()}catch(e){toast(e.message)}};
function promoStatusClass(r){const rec=String(r?.recommendation||'').toUpperCase(),st=String(r?.status||'').toLowerCase();if(['ATIVA','PROGRAMADA','APLICADA','ENVIADA'].includes(rec)||['started','active','pending'].includes(st))return'good';if(rec==='APTA')return'good';if(rec==='NÃO ENTRAR')return'danger';return'warn'}
function promoDisplayState(r){const rec=String(r?.recommendation||'REVISAR').toUpperCase(),st=String(r?.status||'').toLowerCase();if(['started','active'].includes(st)||rec==='ATIVA')return{key:'active',label:'ATIVA',tone:'good',detail:'Ativa e confirmada no Mercado Livre.'};if(st==='pending'||rec==='PROGRAMADA')return{key:'active',label:'PROGRAMADA',tone:'good',detail:'Adesão confirmada; aguardando o início da campanha.'};if(['APLICADA','ENVIADA'].includes(rec)||st==='sent')return{key:'active',label:'ENVIADA',tone:'info',detail:'Solicitação aceita; confirmação final ainda em processamento.'};if(rec==='APTA')return{key:'safe',label:'SEGURA PARA APLICAR',tone:'safe',detail:r.reason||'Margem dentro das regras automáticas.'};if(rec==='NÃO ENTRAR')return{key:'blocked',label:'NÃO ENTRAR',tone:'danger',detail:r.reason||'A promoção compromete a margem.'};if(rec==='REVISAR')return{key:'blocked',label:'REVISAR',tone:'warn',detail:r.reason||'Exige revisão antes de aplicar.'};return{key:'other',label:rec||'MONITORAR',tone:'neutral',detail:r.reason||'Acompanhar status no Mercado Livre.'}}
function promoMoneyPair(r){const original=Number(r.originalPrice||0),promo=Number(r.promoPrice||0);if(promo>0&&original>0&&Math.abs(original-promo)>.009)return `<span>${money(original)}</span><b>→ ${money(promo)}</b>`;return `<b>${money(original||promo)}</b>`}
window.setPromoFilter=filter=>{promoUiFilter=['all','safe','active','blocked'].includes(filter)?filter:'all';renderPromotions()};
function renderPromotions(){
  const rows=promotionState.rows||[], settingsP=promotionState.settings||{};
  if($('#promoMinMargin'))$('#promoMinMargin').value=settingsP.promotionMinMargin??18;
  if($('#promoMaxDiscount'))$('#promoMaxDiscount').value=settingsP.promotionMaxDiscount??20;
  if($('#promoTargetDiscount'))$('#promoTargetDiscount').value=settingsP.promotionTargetDiscount??10;
  if($('#promoAutoEnabled'))$('#promoAutoEnabled').checked=Boolean(settingsP.autoPromotionsEnabled);
  if($('#promoLastScan'))$('#promoLastScan').textContent=promotionState.lastScanAt?`Atualizado ${new Date(promotionState.lastScanAt).toLocaleString('pt-BR')}`:'Ainda não verificado';
  const real=rows.filter(r=>r.type!=='NONE'),items=new Set(real.map(r=>r.itemId)),safe=real.filter(r=>promoDisplayState(r).key==='safe'),active=real.filter(r=>promoDisplayState(r).key==='active'),blocked=real.filter(r=>promoDisplayState(r).key==='blocked');
  if($('#pPromoItems'))$('#pPromoItems').textContent=items.size;if($('#pPromoSafe'))$('#pPromoSafe').textContent=safe.length;if($('#pPromoActive'))$('#pPromoActive').textContent=active.length;if($('#pPromoBlocked'))$('#pPromoBlocked').textContent=blocked.length;
  $$('[data-promo-filter]').forEach(b=>b.classList.toggle('active',b.dataset.promoFilter===promoUiFilter));
  const counts={all:real.length,safe:safe.length,active:active.length,blocked:blocked.length};$$('[data-promo-count]').forEach(x=>{x.textContent=String(counts[x.dataset.promoCount]||0)});
  const el=$('#promoTable');if(!el)return;
  if(!rows.length){el.innerHTML='<div class="emptyMini promoEmpty">Publique produtos e clique em <b>Verificar promoções agora</b>. O sistema consulta o Mercado Livre e calcula automaticamente o que é seguro.</div>';return;}
  const visible=real.filter(r=>promoUiFilter==='all'||promoDisplayState(r).key===promoUiFilter);
  if(!visible.length){el.innerHTML='<div class="emptyMini promoEmpty">Nenhuma promoção neste filtro.</div>';refreshPromoSelectionUi();return;}
  const groups=[];const byItem=new Map();for(const r of visible){const key=String(r.itemId||r.sku||'');if(!byItem.has(key)){const g={itemId:r.itemId,sku:r.sku,title:r.title,rows:[]};byItem.set(key,g);groups.push(g)}byItem.get(key).rows.push(r)}
  el.innerHTML=`<div class="promoProductList">${groups.map(g=>`<section class="promoProductCard"><header class="promoProductHeader"><div><span class="promoSku">${esc(g.sku||g.itemId||'SKU')}</span><h4>${esc(g.title||'Produto')}</h4></div><span class="promoOfferCount">${g.rows.length} ${g.rows.length===1?'opção':'opções'}</span></header><div class="promoOfferList">${g.rows.map(r=>{const state=promoDisplayState(r),canSelect=Boolean(r.eligible&&r.recommendation==='APTA'&&String(r.status||'').toLowerCase()==='candidate'),profit=Number(r.projectedProfit),margin=Number(r.projectedMargin),discount=Number(r.discountPct),support=Number(r.supportAmount||0);return `<article class="promoOfferCard ${state.tone}"><div class="promoOfferTop">${canSelect?`<label class="promoCheck" title="Selecionar promoção segura"><input type="checkbox" class="promoSelect" value="${esc(r.id)}" ${r.selected?'checked':''} onchange="savePromoSelection('${esc(r.id)}')"><span></span></label>`:'<span class="promoCheckSpacer"></span>'}<div class="promoOfferIdentity"><small>${esc(r.typeLabel||r.type||'PROMOÇÃO')}</small><b>${esc(r.name||r.promotionId||'Oferta do Mercado Livre')}</b></div><div class="promoState ${state.tone}"><b>${esc(state.label)}</b><small>${esc(state.detail)}</small></div></div><div class="promoMetricGrid"><div><small>PREÇO</small><div class="promoPricePair">${promoMoneyPair(r)}</div></div><div><small>DESCONTO</small><b>${discount>0?pct(discount):'—'}</b></div><div><small>LUCRO PROJETADO</small><b class="${Number.isFinite(profit)&&profit<0?'negative':'positive'}">${r.projectedProfit!=null?money(profit):'—'}</b></div><div><small>MARGEM PROJETADA</small><b class="${Number.isFinite(margin)&&margin<Number(settingsP.promotionMinMargin??18)?'negative':'positive'}">${r.projectedMargin!=null?pct(margin):'—'}</b></div></div>${support>0?`<div class="promoSupport">Apoio Mercado Livre: <b>${money(support)}</b></div>`:''}${canSelect?'<div class="promoSafeHint">✓ Dentro das regras automáticas. Marque para aplicar.</div>':''}</article>`}).join('')}</div></section>`).join('')}</div>`;refreshPromoSelectionUi();
}
async function loadPromotions(){try{promotionState=await api('/api/promotions');renderPromotions();const now=new Date(),end=new Date(Date.now()+7*86400000);if($('#sellerCampaignStart')&&!$('#sellerCampaignStart').value)$('#sellerCampaignStart').value=new Date(now-now.getTimezoneOffset()*60000).toISOString().slice(0,16);if($('#sellerCampaignFinish')&&!$('#sellerCampaignFinish').value)$('#sellerCampaignFinish').value=new Date(end-end.getTimezoneOffset()*60000).toISOString().slice(0,16)}catch(e){toast(e.message)}}
if($('#scanPromotions'))$('#scanPromotions').onclick=async()=>{try{operationStart('Verificando promoções','Consultando campanhas do Mercado Livre e recalculando margem SKU por SKU.');promotionState=await api('/api/promotions/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({autoApply:false})});renderPromotions();const count=(promotionState.rows||[]).filter(x=>x.type!=='NONE').length;operationDone('Promoções verificadas',`${count} oportunidade${count===1?'':'s'} analisada${count===1?'':'s'}.`);toast(`✓ ${count} oportunidade${count===1?'':'s'} analisada${count===1?'':'s'}.`)}catch(e){operationError('Falha ao verificar promoções',e.message);toast(e.message)}};
if($('#selectSafePromos'))$('#selectSafePromos').onclick=async()=>{try{operationStart('Selecionando promoções seguras','Salvando somente oportunidades que respeitam margem e desconto máximos.');promotionState=await api('/api/promotions/selection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({selectEligible:true})});renderPromotions();const count=refreshPromoSelectionUi();operationDone('Promoções seguras selecionadas',`${count} promoção${count===1?'':'ões'} pronta${count===1?'':'s'} para aplicar.`);toast(`✓ ${count} promoção${count===1?'':'ões'} segura${count===1?'':'s'} selecionada${count===1?'':'s'}.`)}catch(e){operationError('Falha ao selecionar promoções',e.message);toast(e.message)}};
if($('#applySelectedPromos'))$('#applySelectedPromos').onclick=async()=>{let rowIds=persistedSelectedPromoIds();if(!rowIds.length){try{promotionState=await api('/api/promotions');renderPromotions();rowIds=persistedSelectedPromoIds()}catch{}}if(!rowIds.length)return toast('Nenhuma promoção segura está selecionada. Use “Selecionar aptas” ou marque uma oportunidade segura.',10000);if(!confirm(`Aplicar ${rowIds.length} promoção(ões) segura(s) no Mercado Livre?`))return;try{operationStart('Aplicando promoções','Enviando a adesão e confirmando o status diretamente no Mercado Livre.');const d=await api('/api/promotions/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rowIds})});promotionState=d.promotions||await api('/api/promotions');renderPromotions();const ok=d.applied?.length||0,errors=d.errors?.length||0,confirmed=(d.applied||[]).filter(x=>x.verification?.confirmed).length,waiting=Math.max(0,ok-confirmed);let msg=`${ok} promoção${ok===1?'':'ões'} enviada${ok===1?'':'s'}`;if(confirmed)msg+=` · ${confirmed} confirmada${confirmed===1?'':'s'} no ML`;if(waiting)msg+=` · ${waiting} aguardando confirmação`;if(errors){msg+=` · ${errors} com falha`;operationError('Aplicação concluída com pendência',msg);toast(`⚠ ${msg}`,10000)}else{operationDone('Promoções aplicadas com sucesso',msg);toast(`✓ ${msg}`,10000)}}catch(e){operationError('Falha ao aplicar promoções',e.message);toast(e.message)}};
if($('#savePromoRules'))$('#savePromoRules').onclick=async()=>{try{const body={promotionMinMargin:$('#promoMinMargin').value,promotionMaxDiscount:$('#promoMaxDiscount').value,promotionTargetDiscount:$('#promoTargetDiscount').value,autoPromotionsEnabled:$('#promoAutoEnabled').checked};await api('/api/promotions/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});operationDone('Regras de promoção salvas',body.autoPromotionsEnabled?'Automação segura ativada.':'Regras atualizadas; automação permanece manual.');toast(`✓ ${body.autoPromotionsEnabled?'Automação segura ativada':'Regras de promoção salvas'}.`);await loadPromotions()}catch(e){operationError('Falha ao salvar regras',e.message);toast(e.message)}};
if($('#createSellerCampaign'))$('#createSellerCampaign').onclick=async()=>{const body={name:$('#sellerCampaignName').value,start_date:$('#sellerCampaignStart').value,finish_date:$('#sellerCampaignFinish').value,targetDiscount:$('#sellerCampaignDiscount').value};if(!body.name.trim())return toast('Informe o nome da campanha.');if(!confirm('Criar esta campanha do vendedor no Mercado Livre?'))return;try{operationStart('Criando campanha','Enviando a campanha ao Mercado Livre.');const d=await api('/api/promotions/seller-campaign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});operationDone('Campanha criada',d.created?.id?`ID ${d.created.id}. Agora faça uma nova verificação para encontrar candidatos.`:'Campanha criada. Faça uma nova verificação para encontrar candidatos.');toast('✓ Campanha criada no Mercado Livre.');await loadPromotions()}catch(e){operationError('Falha ao criar campanha',e.message);toast(e.message)}};

function resizeCanvas(c){const dpr=window.devicePixelRatio||1,w=c.clientWidth||600,h=Number(c.getAttribute('height')||220);c.width=Math.max(1,Math.round(w*dpr));c.height=Math.round(h*dpr);const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w,h}}
function drawDailyChart(rows){const c=$('#accountingDailyChart');if(!c)return;const {ctx,w,h}=resizeCanvas(c);ctx.clearRect(0,0,w,h);const pad={l:46,r:14,t:16,b:34},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b;if(!rows?.length){ctx.fillStyle='#8a9087';ctx.font='12px Manrope';ctx.fillText('Sincronize as vendas para gerar o gráfico.',16,35);return}const max=Math.max(1,...rows.flatMap(x=>[Number(x.gross||0),Math.max(0,Number(x.net||0))]));ctx.strokeStyle='#e2e5dd';ctx.lineWidth=1;for(let i=0;i<5;i++){const y=pad.t+ih*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}const x=i=>pad.l+(rows.length===1?iw/2:iw*i/(rows.length-1)),y=v=>pad.t+ih-(Math.max(0,v)/max)*ih;function line(key,stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2.2;ctx.beginPath();rows.forEach((r,i)=>{const px=x(i),py=y(Number(r[key]||0));i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.stroke()}line('gross','#b69227');line('net','#376d48');ctx.fillStyle='#667067';ctx.font='10px Manrope';const step=Math.max(1,Math.ceil(rows.length/6));rows.forEach((r,i)=>{if(i%step===0||i===rows.length-1)ctx.fillText(String(r.date||'').slice(5),x(i)-13,h-10)});ctx.fillStyle='#b69227';ctx.fillRect(pad.l,2,12,3);ctx.fillStyle='#586058';ctx.fillText('Bruto',pad.l+18,7);ctx.fillStyle='#376d48';ctx.fillRect(pad.l+80,2,12,3);ctx.fillStyle='#586058';ctx.fillText('Lucro',pad.l+98,7)}
function drawCostChart(total){const c=$('#accountingCostChart');if(!c)return;const {ctx,w,h}=resizeCanvas(c);ctx.clearRect(0,0,w,h);const adsValue=total.adsActualAvailable?Number(total.adsActual||0):Number(total.ads||0);const data=[['Tarifas ML',Number(total.fees||0)],['Frete',Number(total.shipping||0)],['Produto',Number(total.cogs||0)],['Impostos',Number(total.tax||0)],[total.adsActualAvailable?'ADS real':'ADS estim.',adsValue]].filter(x=>x[1]>0);if(!data.length){ctx.fillStyle='#8a9087';ctx.font='12px Manrope';ctx.fillText('Sem custos sincronizados ainda.',16,35);return}const max=Math.max(...data.map(x=>x[1]),1),pad=18,labelW=82,barW=Math.max(80,w-labelW-100);ctx.font='11px Manrope';data.forEach((d,i)=>{const y=pad+i*36;ctx.fillStyle='#596259';ctx.fillText(d[0],8,y+14);ctx.fillStyle='#eef0ea';ctx.fillRect(labelW,y,barW,17);ctx.fillStyle='#b69227';ctx.fillRect(labelW,y,barW*d[1]/max,17);ctx.fillStyle='#333b34';ctx.fillText(money(d[1]),labelW+barW+8,y+13)})}
function renderAccounting(){
  const t=accounting.summary?.total||{},rows=accounting.summary?.products||[];
  const adsActualAvailable=Boolean(t.adsActualAvailable),hasCostFlag=typeof t.costDataComplete==='boolean',costComplete=hasCostFlag?t.costDataComplete:(Number(t.units||0)===0||Number(t.cogs||0)>0),unknownCostUnits=Number(t.unknownCostUnits||(!costComplete?Number(t.units||0):0)),costCoverage=t.costCoveragePct!=null?Number(t.costCoveragePct):(costComplete?100:0);
  const adsUsed=adsActualAvailable?Number(t.adsActual||0):Number(t.ads||0);
  const result=adsActualAvailable&&t.netAfterAdsActual!=null?Number(t.netAfterAdsActual||0):Number(t.net||0);
  const margin=adsActualAvailable&&t.marginAfterAdsActual!=null?Number(t.marginAfterAdsActual||0):Number(t.margin||0);
  if($('#aUnits'))$('#aUnits').textContent=Number(t.units||0).toLocaleString('pt-BR');
  if($('#aOrders'))$('#aOrders').textContent=`${Number(accounting.orderCount||t.orders||0).toLocaleString('pt-BR')} pedidos`;
  if($('#aGross'))$('#aGross').textContent=money(t.gross);
  if($('#aFees'))$('#aFees').textContent=money(t.fees);
  if($('#aShipping'))$('#aShipping').textContent=money(t.shipping);
  if($('#aReceivable'))$('#aReceivable').textContent=money(t.receivable);
  if($('#aCogs'))$('#aCogs').textContent=money(t.cogs);
  if($('#aCostCoverage'))$('#aCostCoverage').textContent=`cobertura de custo ${pct(costCoverage)}`;
  if($('#aAds'))$('#aAds').textContent=money(adsUsed);
  if($('#aAdsSource'))$('#aAdsSource').textContent=adsActualAvailable?'Product Ads sincronizado':'estimativa pela configuração';
  if($('#aNet')){$('#aNet').textContent=money(result);$('#aNet').classList.toggle('negative',result<0)}
  if($('#aMargin'))$('#aMargin').textContent=`${pct(margin)} margem · impostos ${money(t.tax||0)}`;
  const netLabel=$('#aNetLabel'),netStatus=$('#aNetStatus'),warn=$('#accountingDataWarning');
  if(!costComplete){if(netLabel)netLabel.textContent='Lucro provisório';if(netStatus){netStatus.textContent=`⚠ ${unknownCostUnits} unid. sem custo WeDrop`;netStatus.className='financeStatus warn'}if(warn){warn.className='warning financeError';warn.innerHTML=`<b>Resultado incompleto:</b> ${unknownCostUnits} unidade(s) vendida(s) estão sem custo WeDrop identificado. O recebível está correto, mas o lucro fica superestimado até o custo dessas SKUs ser localizado.`}}
  else if(!adsActualAvailable){if(netLabel)netLabel.textContent='Lucro estimado';if(netStatus){netStatus.textContent='ADS ainda estimado';netStatus.className='financeStatus estimate'}if(warn){warn.className='warning';warn.innerHTML='<b>Resultado estimado:</b> custos WeDrop foram localizados, mas o Product Ads ainda não foi sincronizado. O sistema usa a reserva/estimativa de ADS até receber o gasto real.'}}
  else{if(netLabel)netLabel.textContent='Lucro líquido calculado';if(netStatus){netStatus.textContent='✓ custo WeDrop + ADS real considerados';netStatus.className='financeStatus good'}if(warn){warn.className='warning financeOk';warn.innerHTML='<b>Conciliação:</b> recebível usa tarifa/frete de Orders/Shipments; custo do produto vem da SKU WeDrop; ADS usa Product Ads sincronizado. Impostos continuam calculados pela alíquota configurada.'}}
  if($('#accountingSyncStatus'))$('#accountingSyncStatus').textContent=accounting.lastSyncAt?`Atualizado ${new Date(accounting.lastSyncAt).toLocaleString('pt-BR')} · ${accounting.range?.days||30} dias`:'Ainda não sincronizado';
  drawDailyChart(accounting.daily||[]);drawCostChart(t);
  const losses=(accounting.lines||[]).filter(x=>Number(x.netProfit)<0).sort((a,b)=>a.netProfit-b.netProfit).slice(0,10);if($('#lossAlerts'))$('#lossAlerts').innerHTML=losses.length?losses.map(x=>`<div class="accountingAlert"><div><b>${esc(x.sku||x.itemId||'Venda')}</b><span>${esc(x.title||'')}</span></div><strong>${money(x.netProfit)}</strong><small>${esc(x.diagnosis?.primary||'Margem negativa')} · Pedido ${esc(x.orderId)}</small></div>`).join(''):'<div class="emptyMini">Nenhuma venda com prejuízo no período sincronizado.</div>';
  if($('#costDrivers'))$('#costDrivers').innerHTML=`<div class="driver"><span>Frete grátis</span><b>${Number(t.freeShippingSales||0)} venda(s)</b><small>${money(t.shipping||0)} em frete total</small></div><div class="driver"><span>Flex</span><b>${Number(t.flexSales||0)} venda(s)</b><small>compare margem com outras logísticas</small></div><div class="driver"><span>Premium</span><b>${Number(t.premiumSales||0)} venda(s)</b><small>revisar ganho versus comissão</small></div><div class="driver ${unknownCostUnits>0?'danger':''}"><span>Custo WeDrop</span><b>${unknownCostUnits>0?`${unknownCostUnits} unid. sem custo`:'100% localizado'}</b><small>${unknownCostUnits>0?'corrigir antes de tratar o lucro como final':'base de custo completa'}</small></div>`;
  if($('#accountingTable'))$('#accountingTable').innerHTML=`<table><thead><tr><th>SKU / Produto</th><th>Unid.</th><th>Bruto</th><th>Recebível MP</th><th>Tarifas</th><th>Frete</th><th>Custo WeDrop</th><th>ADS</th><th>Lucro antes ADS real</th><th>Lucro final</th><th>Margem</th><th>Ponto equilíbrio</th><th>Alertas</th></tr></thead><tbody>${rows.map(x=>{const rowAds=x.adsActual!=null?x.adsActual:x.ads;const rowFinal=x.netAfterAdsActual!=null?x.netAfterAdsActual:x.net;const rowMargin=x.marginAfterAdsActual!=null?x.marginAfterAdsActual:x.margin;return`<tr class="${Number(rowFinal)<0?'lossRow':''}"><td><b>${esc(x.sku||x.itemId||'—')}</b><div class="muted">${esc(x.title||'')}</div></td><td>${Number(x.units||0)}</td><td>${money(x.gross)}</td><td>${money(x.receivable)}</td><td>${money(x.fees)}</td><td>${money(x.shipping)}</td><td>${money(x.cogs)}${Number(x.unknownCostUnits||0)>0?`<div class="costMissing">⚠ ${Number(x.unknownCostUnits)} unid. sem custo</div>`:''}</td><td>${money(rowAds)}<div class="muted">${x.adsActual!=null?'real':'estim.'}</div></td><td><b class="${Number(x.net)<0?'negative':'positive'}">${money(x.net)}</b></td><td><b class="${Number(rowFinal)<0?'negative':'positive'}">${money(rowFinal)}</b>${Number(x.unknownCostUnits||0)>0?'<div class="muted">provisório</div>':''}</td><td>${pct(rowMargin)}</td><td>${money(x.breakEvenUnit)}</td><td><span class="pill ${x.lossSales?'danger':'good'}">${x.lossSales?`${x.lossSales} prejuízo`:'OK'}</span>${Number(x.unknownCostUnits||0)>0?'<span class="tagTiny">Custo faltando</span>':''}${x.flexSales?'<span class="tagTiny">Flex</span>':''}${x.premiumSales?'<span class="tagTiny">Premium</span>':''}${x.freeShippingSales?'<span class="tagTiny">Frete grátis</span>':''}</td></tr>`}).join('')}</tbody></table>`;
}
async function loadAccounting(){try{accounting=await api('/api/accounting');renderAccounting()}catch(e){toast(e.message)}}
async function syncAccounting(days){try{toast(`Sincronizando vendas dos últimos ${days} dias...`);accounting=await api('/api/accounting/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({days})});renderAccounting();toast(`${accounting.orderCount||0} pedidos sincronizados.`)}catch(e){toast(e.message)}}
if($('#syncAccounting30'))$('#syncAccounting30').onclick=()=>syncAccounting(30);if($('#syncAccounting7'))$('#syncAccounting7').onclick=()=>syncAccounting(7);if($('#syncAccounting90'))$('#syncAccounting90').onclick=()=>syncAccounting(90);
window.addEventListener('resize',()=>{if($('#accounting')?.classList.contains('active')){drawDailyChart(accounting.daily||[]);drawCostChart(accounting.summary?.total||{})}});

async function initializePublisher({fromLogin=false}={}){
  try{
    // Primeiro carrega somente o necessário para liberar a operação. Catálogo e contabilidade
    // entram depois, em segundo plano, evitando um login pesado e travado.
    await Promise.all([loadStatus(),loadProducts(),loadSettings(),loadDailyOps()]);
    lastDailyCycleSeen=dailyOps.cycle?.cycle||'';nav('daily');
    if(new URLSearchParams(location.search).get('connected'))toast('Mercado Livre conectado com sucesso.');
    const eventId=authState.operator?.loginEventId||'';if(eventId)sessionStorage.setItem('ra_daily_login_event',eventId);
    setTimeout(()=>{Promise.allSettled([loadSupplierCatalog(),loadAccounting()]);},350);
    try{const st=await api('/api/daily-ops/run-status');renderDailyBackground(st.background||{});if(st.running){pollDailyRoutine({welcome:true,automatic:true});}else{const k='ra_opening_scan_at',last=Number(sessionStorage.getItem(k)||0),fresh=Date.now()-last<4*60*1000;if(st.background?.running)pollDailyBackground();if(!fresh){sessionStorage.setItem(k,String(Date.now()));setTimeout(()=>runDailyCycle({automatic:true,welcome:true}),220);}else if(dailyOps.nextTaskKey)setTimeout(()=>guideShowDailyTask({welcome:true}),180);else if(st.background?.running)setTimeout(()=>guideShowBackgroundProgress(st.background,{welcome:true}),180);else setTimeout(()=>runDailyCycle({automatic:true,welcome:true}),220);}}catch(_){setTimeout(()=>guideShowDailyTask({welcome:true}),180);}
    startDailyDueWatcher();
  }catch(e){toast(e.message)}
}
let dailyDueTimer=null,lastDailyCycleSeen='';
function startDailyDueWatcher(){
  clearInterval(dailyDueTimer);
  dailyDueTimer=setInterval(async()=>{
    if(!authState.authenticated)return;
    try{
      const d=await api('/api/daily-ops'),c=d.cycle?.cycle||'';
      if(lastDailyCycleSeen&&c!==lastDailyCycleSeen){toast(`Nova rotina disponível: ${dailyCycleLabel(c)}. Vou conferir a conta automaticamente.`,8000);dailyOps=d;renderDailyOps();setTimeout(()=>runDailyCycle({automatic:true,welcome:false}),180);}
      else{dailyOps=d;renderDailyOps();}
      lastDailyCycleSeen=c;
    }catch(_){}
  },5*60*1000);
}
(async()=>{try{const ok=await authBootstrap();if(ok)await initializePublisher();}catch(e){showLogin(authState);setLoginStatus(e.message,'error')}})();
