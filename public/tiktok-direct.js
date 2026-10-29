/* REDE ACHADOS BR Publisher — TikTok Direct Post (manual, explicit consent). */
/* Isolado do fluxo estável de rascunhos. */
(() => {
  'use strict';
  const el = (id) => document.getElementById(id);
  const openBtn = el('directPostBtn');
  const dialog = el('tiktokDirectDialog');
  if (!openBtn || !dialog) return;

  const submit = el('directSubmit');
  const statusButton = el('directCheckStatus');
  let sending = false;
  let creatorLoaded = false;
  let selectedFingerprint = '';
  let latestPublishId = '';

  const LAST_KEY = 'redeachados_tiktok_direct_last_v1';
  const privacyNames = {
    SELF_ONLY: 'Somente eu — privado',
    PUBLIC_TO_EVERYONE: 'Todos — público',
    MUTUAL_FOLLOW_FRIENDS: 'Amigos que me seguem',
    FOLLOWER_OF_CREATOR: 'Meus seguidores'
  };
  const setStatus = (message, error = false) => {
    const node = el('directStatus');
    node.textContent = message;
    node.dataset.error = error ? 'true' : 'false';
  };
  const fingerprint = () => currentTikTokVideoFingerprint();
  const hasMedia = () => Boolean(selectedRemoteVideo?.id || selectedFile);
  const availablePrivacy = () => el('directPrivacy').value !== '';
  const disclosureSelected = () => el('directBrandOrganic').checked || el('directBrandContent').checked;

  function updateSubmitAvailability(){
    submit.disabled = sending || !creatorLoaded || !availablePrivacy() ||
      !el('directConsent').checked || !disclosureSelected() || !hasMedia();
  }
  ['directPrivacy','directConsent','directBrandOrganic','directBrandContent'].forEach(id => {
    el(id).addEventListener('change', updateSubmitAvailability);
  });

  const closeDialog = () => {
    el('directVideoPreview').pause();
    dialog.close();
  };
  el('directClose').addEventListener('click', closeDialog);
  dialog.addEventListener('close', () => {
    try { el('directVideoPreview').pause(); } catch {}
  });

  function fillPrivacy(info){
    const select = el('directPrivacy');
    select.replaceChildren();
    const initial = new Option('Selecione a privacidade...', '');
    select.add(initial);
    const validOptions = ['SELF_ONLY','PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','FOLLOWER_OF_CREATOR'];
    const choices = Array.isArray(info.privacy_level_options) ? info.privacy_level_options : [];
    for(const value of choices){
      if(validOptions.includes(value)) select.add(new Option(privacyNames[value], value));
    }
    select.value = '';
    if(select.options.length < 2) throw new Error('TikTok não retornou opções de privacidade para publicação.');
  }
  function fillInteractions(info){
    const configMap = [
      ['directDisableComment','comment_disabled'],
      ['directDisableDuet','duet_disabled'],
      ['directDisableStitch','stitch_disabled']
    ];
    for(const [id,key] of configMap){
      const node = el(id);
      const forced = info[key] === true;
      node.checked = forced;
      node.disabled = forced;
      node.title = forced ? 'Esta interação já está desativada nas configurações do TikTok' : '';
    }
  }
  function restoreLast(){
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
      if(last?.fingerprint === selectedFingerprint && last?.publishId){
        latestPublishId = last.publishId;
        statusButton.hidden = false;
        setStatus('Há um envio anterior deste vídeo. Consulte o resultado antes de reenviar para evitar publicações duplicadas.');
      }
    } catch {}
  }

  openBtn.addEventListener('click', async () => {
    if(!hasMedia()){
      toast('Selecione primeiro um vídeo de produto.',true);
      return;
    }
    if(!config?.tiktokConnected){
      toast('Conecte ou reconecte sua conta TikTok em Canais de conexão.',true);
      location.hash = '#channels';
      return;
    }
    selectedFingerprint = fingerprint();
    latestPublishId = '';
    creatorLoaded = false;
    sending = false;
    submit.disabled = true;
    statusButton.hidden = true;
    el('directConsent').checked = false;
    el('directBrandOrganic').checked = true;
    el('directBrandContent').checked = false;
    el('directIsAigc').checked = Boolean(el('isAigc')?.checked);
    el('directCaption').value = el('captionPreview')?.value.trim() || '';
    el('directVideoLabel').textContent = selectedRemoteVideo?.title || selectedFile?.name || 'Vídeo selecionado';
    const preview = el('directVideoPreview');
    const original = el('preview');
    const url = original?.currentSrc || original?.src;
    if(url && /^(blob:|https?:)/.test(url)) {
      preview.src = url;
      preview.load();
    } else {
      preview.removeAttribute('src');
    }
    el('directCreator').textContent = 'Consultando a conta TikTok e as opções permitidas...';
    setStatus('Aguarde a verificação das opções da conta.');
    dialog.showModal();
    try {
      // A API exige dados atuais do criador antes de oferecer privacidade e opções de interação.
      const creator = await api('/api/creator');
      if(!dialog.open) return;
      fillPrivacy(creator);
      fillInteractions(creator);
      const label = String(creator.creator_nickname || creator.creator_username || 'Conta TikTok');
      el('directCreator').textContent = 'Conta conectada: ' + label;
      creatorLoaded = true;
      setStatus('Escolha a privacidade, confira a divulgação comercial e autorize o envio.');
      restoreLast();
    } catch(error) {
      creatorLoaded = false;
      el('directCreator').textContent = 'Não foi possível validar a conta TikTok.';
      setStatus('Verifique a conexão e a autorização video.publish no TikTok. ' + String(error?.message || ''), true);
    }
    updateSubmitAvailability();
  });

  async function checkStatus(){
    if(!latestPublishId) return;
    statusButton.disabled = true;
    setStatus('Consultando o processamento no TikTok...');
    try {
      const data = await api('/api/status/' + encodeURIComponent(latestPublishId), {method:'POST'});
      const result = String(data.status || 'UNKNOWN').toUpperCase();
      if(result === 'PUBLISH_COMPLETE'){
        setStatus('✓ Publicação confirmada pelo TikTok. A visibilidade depende da privacidade escolhida.');
      }else if(result === 'FAILED'){
        setStatus('TikTok recusou o envio: '+String(data.fail_reason||'Motivo indisponível.').slice(0,250), true);
      }else{
        setStatus('TikTok informa: ' + result + '. O processamento ainda não foi confirmado como concluído.');
      }
    }catch(error){
      setStatus('Não foi possível consultar o resultado: '+String(error?.message||error),true);
    }finally{
      statusButton.disabled=false;
    }
  }
  statusButton.addEventListener('click', checkStatus);

  submit.addEventListener('click', async () => {
    updateSubmitAvailability();
    if(submit.disabled) return;
    if(selectedFingerprint !== fingerprint()){
      setStatus('O vídeo selecionado mudou. Feche esta janela e revise o novo vídeo.',true);
      submit.disabled=true;
      return;
    }
    const caption = el('directCaption').value.trim();
    const privacy = el('directPrivacy').value;
    const consent = el('directConsent').checked;
    const brandOrganic = el('directBrandOrganic').checked;
    const brandContent = el('directBrandContent').checked;
    if(!consent||!privacy||!(brandOrganic||brandContent)){
      setStatus('Escolha a privacidade, indique o conteúdo comercial e marque a confirmação.',true);
      return;
    }
    try{
      const previous = JSON.parse(localStorage.getItem(LAST_KEY)||'null');
      if(previous?.fingerprint === selectedFingerprint && previous?.publishId){
        const repeat = window.confirm('Este vídeo já foi enviado ao TikTok. Deseja enviar outra publicação do mesmo vídeo?');
        if(!repeat)return;
      }
    }catch{}
    sending = true;
    updateSubmitAvailability();
    setStatus('Enviando o arquivo e iniciando a postagem direta no TikTok...');
    const values = {
      caption,privacy,explicitConsent:true,brandOrganic,brandContent,
      disableComment:el('directDisableComment').checked,
      disableDuet:el('directDisableDuet').checked,
      disableStitch:el('directDisableStitch').checked,
      isAigc:el('directIsAigc').checked,
      duration:Number(duration||0),
      meta:currentMeta()
    };
    try{
      let response;
      if(selectedRemoteVideo?.id){
        response = await api('/api/publish-remote',{
          method:'POST',
          body:JSON.stringify({...values,remoteVideoId:selectedRemoteVideo.id,filename:selectedRemoteVideo.title||'video-wedrop.mp4'})
        });
      }else if(selectedFile){
        const form = new FormData();
        form.append('video',selectedFile);
        form.append('meta',JSON.stringify(values.meta));
        for(const field of ['caption','privacy','explicitConsent','brandOrganic','brandContent',
          'disableComment','disableDuet','disableStitch','isAigc','duration']){
          form.append(field,String(values[field]));
        }
        response=await api('/api/publish',{method:'POST',body:form});
      }else{
        throw new Error('O vídeo não está mais selecionado. Selecione-o novamente.');
      }
      latestPublishId=String(response.publishId||'');
      if(!latestPublishId)throw new Error('TikTok não retornou o identificador da publicação.');
      try {
        localStorage.setItem(LAST_KEY,JSON.stringify({publishId:latestPublishId,
          fingerprint:selectedFingerprint,at:Date.now()}));
      }catch{}
      statusButton.hidden=false;
      setStatus('Arquivo transferido. O TikTok está processando a postagem. Clique em “Consultar resultado no TikTok”.');
      await loadHistory();
      saveDraft();
    }catch(error){
      const reason=String(error?.message||error);
      const advice=/scope_not_authorized|unaudited_client|permission|401|403/i.test(reason)
        ? ' Confira as permissões video.publish e a situação de auditoria do aplicativo no TikTok Developers.'
        : '';
      setStatus('Não foi possível publicar: '+reason+advice,true);
    }finally{
      sending=false;
      updateSubmitAvailability();
    }
  });
})();
