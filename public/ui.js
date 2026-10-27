/* Presentation helpers only: no API calls, storage changes, or publishing logic. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  function selectTab(tab, focus = false) {
    const group = tab.closest('[data-tabs]');
    if (!group) return;
    group.querySelectorAll('[role="tab"]').forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = byId(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
    updateCounts();
    if (focus) tab.focus();
  }
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectTab(tab));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); selectTab(tabs[next], true); }
      });
    });
  });
  document.querySelectorAll('[data-open-settings]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = document.querySelector(`[aria-controls="${button.dataset.openSettings}"]`);
      if (tab) selectTab(tab);
      byId('settingsDialog').showModal();
      if (tab) tab.focus();
    });
  });
  function updateCounts() {
    document.querySelectorAll('[data-count-for]').forEach(counter => {
      const field = byId(counter.dataset.countFor);
      if (!field) return;
      const text = `${field.value.length.toLocaleString('pt-BR')} / ${field.maxLength.toLocaleString('pt-BR')}`;
      if (counter.textContent !== text) counter.textContent = text;
    });
  }
  document.addEventListener('input', updateCounts);
  document.addEventListener('click', () => queueMicrotask(updateCounts));
  // Generated values do not emit input; the existing analysis status signals completion.
  const statusObserver = new MutationObserver(updateCounts);
  statusObserver.observe(byId('aiStatus'), {childList:true, subtree:true, characterData:true});
  statusObserver.observe(byId('app'), {attributes:true, attributeFilter:['class']});
  const fileName = byId('fileName');
  new MutationObserver(() => {
    byId('selectedFileLabel').textContent = fileName.textContent || 'Pronto para revisar abaixo.';
    fileName.title = fileName.textContent;
  }).observe(fileName, {childList:true, subtree:true, characterData:true});
  // Layout de referência 2026-10-27: somente apresentação. Reutiliza os mesmos
  // elementos (e seus event handlers) de app.js; nunca clona formulários.
  function applyPublisherReferenceLayout() {
    const page = byId('create');
    if (!page || page.dataset.referenceApplied) return;
    page.dataset.referenceApplied = 'true';
    document.body.classList.add('reference-publisher-layout');

    const sidebarNav = document.querySelector('.sidebar .side-nav');
    const historyLink = sidebarNav?.querySelector('a[href="#activity"]');
    if (sidebarNav && historyLink) {
      const publicationLink = document.createElement('a');
      publicationLink.className = 'nav-link';
      publicationLink.href = '#publications';
      publicationLink.innerHTML = '<svg class="icon"><use href="#i-grid"/></svg><span>Publicações</span>';
      historyLink.before(publicationLink);
      const settingsLink = document.createElement('button');
      settingsLink.type = 'button';
      settingsLink.className = 'nav-link nav-settings-shortcut';
      settingsLink.innerHTML = '<svg class="icon"><use href="#i-settings"/></svg><span>Configurações</span>';
      settingsLink.addEventListener('click', () => byId('settingsBtn')?.click());
      sidebarNav.append(settingsLink);
    }

    const header = document.querySelector('.app-topbar');
    if (header) {
      const search = document.createElement('label');
      search.className = 'header-global-search';
      search.innerHTML = '<svg class="icon"><use href="#i-search"/></svg>' +
        '<input id="globalSkuSearch" aria-label="Buscar SKU para criar publicação" ' +
        'autocomplete="off" placeholder="Buscar SKU para criar publicação...">' +
        '<kbd>Ctrl + K</kbd>';
      const tools = document.createElement('div');
      tools.className = 'header-utilities';
      tools.innerHTML = '<details class="top-help"><summary aria-label="Ajuda sobre o Publisher" title="Ajuda">?</summary>' +
        '<div class="top-help-content"><b>Como usar o Publisher</b>' +
        '<p>Digite uma SKU na busca superior e pressione Enter. Escolha o vídeo, confira os textos e publique.</p>' +
        '<p>Legendas, Stories e opções de Direct continuam nas seções expansíveis.</p></div></details>' +
        '<button id="headerActivityBtn" class="top-icon-btn" type="button" title="Ver publicações e histórico" aria-label="Ver histórico"><svg class="icon"><use href="#i-clock"/></svg></button>' +
        '<details class="header-profile"><summary><span class="profile-monogram">RA</span><span>Administrador</span><svg class="icon"><use href="#i-chevron-down"/></svg></summary>' +
        '<div class="profile-menu"><a href="#channels">Canais de conexão</a>' +
        '<a href="#activity">Histórico</a><button type="button" id="profileSettingsBtn">Configurações</button></div></details>';
      header.append(search, tools);
      byId('headerActivityBtn')?.addEventListener('click', () => { location.hash = '#activity'; });
      byId('profileSettingsBtn')?.addEventListener('click', () => {
        tools.querySelector('.header-profile').open = false;
        byId('settingsBtn')?.click();
      });
      const quick = byId('globalSkuSearch');
      quick.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = quick.value.trim();
        if (!value) return;
        location.hash = '#create';
        byId('wedropSku').value = value;
        byId('wedropSku').dispatchEvent(new Event('input', { bubbles: true }));
        byId('wedropSearchBtn').click();
      });
      document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          if (document.querySelector('dialog[open]')) return;
          event.preventDefault();
          quick.focus();
          quick.select();
        }
      });
    }

    const hero = page.querySelector('.hero');
    if (hero) {
      const icon = document.createElement('span');
      icon.className = 'reference-hero-icon';
      icon.innerHTML = '<svg class="icon"><use href="#i-spark"/></svg>';
      hero.prepend(icon);
      const title = hero.querySelector('h1');
      const subtitle = hero.querySelector('p');
      if (title) title.textContent = 'Criar publicação';
      if (subtitle) subtitle.textContent =
        'Transforme seus produtos em conteúdos que vendem. Escolha o vídeo, edite os textos e publique nas suas redes sociais em poucos cliques.';
      const settings = byId('settingsBtn');
      const callout = hero.querySelector('.platform-tag');
      if (settings && callout) callout.before(settings);
      if (callout) {
        callout.innerHTML = '<span class="callout-bolt"><svg class="icon"><use href="#i-bolt"/></svg></span>' +
          '<span><b>Publicação simples e rápida</b><small>Crie, edite e publique em menos tempo.</small></span>';
      }
    }

    const sourceCard = page.querySelector('.manual-upload-card');
    const videoRow = page.querySelector('.editor-body .video-row');
    if (sourceCard && videoRow) {
      const shell = document.createElement('div');
      shell.className = 'reference-video-preview';
      sourceCard.prepend(shell);
      shell.append(videoRow);
      const meta = document.createElement('small');
      meta.className = 'reference-video-meta';
      meta.id = 'referenceVideoMeta';
      byId('fileName')?.after(meta);
      const updateVideoMeta = () => {
        const duration = byId('preview')?.duration;
        const selected = byId('videoInput')?.files?.[0];
        const parts = [];
        if (Number.isFinite(duration) && duration > 0)
          parts.push(Math.round(duration) + ' segundos');
        if (selected?.size) parts.push((selected.size / 1048576).toLocaleString('pt-BR', {maximumFractionDigits:1}) + ' MB');
        meta.textContent = parts.join(' · ');
      };
      byId('preview')?.addEventListener('loadedmetadata', updateVideoMeta);
      byId('videoInput')?.addEventListener('change', updateVideoMeta);
      new MutationObserver(updateVideoMeta).observe(byId('fileName'), {childList:true,characterData:true,subtree:true});
      updateVideoMeta();
    }

    const editor = page.querySelector('.editor-card');
    const workArea = byId('workArea');
    const caption = page.querySelector('.caption-section');
    if (workArea && caption) {
      const details = document.createElement('details');
      details.className = 'reference-caption-details';
      const summary = document.createElement('summary');
      summary.innerHTML = '<svg class="icon"><use href="#i-message"/></svg>' +
        '<span><b>Legendas completas, hashtags e comentário</b><small>Abra para editar ou copiar os textos de cada plataforma</small></span>' +
        '<svg class="icon disclosure-arrow"><use href="#i-chevron-down"/></svg>';
      details.append(summary, caption);
      workArea.insertBefore(details, workArea.querySelector('.options'));
    }
    if (editor) {
      const badge = document.createElement('span');
      badge.id = 'referenceAiBadge';
      badge.className = 'reference-ai-badge';
      badge.textContent = 'Preparando conteúdo...';
      editor.querySelector('.section-head')?.append(badge);
      const status = byId('aiStatus');
      const sync = () => {
        const content = status?.textContent || '';
        const ready = /Pronto|criado automaticamente|modo básico|restaurado/i.test(content);
        badge.classList.toggle('is-ready', ready);
        badge.textContent = ready ? (/IA|automátic/i.test(content) ? '✓ Conteúdo gerado pela IA' : '✓ Conteúdo pronto para editar') :
          (/falha|não foi possível/i.test(content) ? '⚠ Verifique a análise' : 'Preparando conteúdo...');
      };
      if (status) {
        new MutationObserver(sync).observe(status, {childList:true,subtree:true,characterData:true});
        sync();
      }
    }

    const publish = page.querySelector('.publish-area');
    if (editor && publish) {
      const card = document.createElement('section');
      card.className = 'card reference-sharing-card';
      card.setAttribute('aria-label', 'Etapa 3: compartilhar publicação');
      editor.after(card);
      card.append(publish);
      const advanced = document.createElement('details');
      advanced.className = 'reference-publish-extra';
      advanced.innerHTML = '<summary><svg class="icon"><use href="#i-instagram"/></svg>' +
        '<span>Mais opções: Stories, Direct e sincronização</span>' +
        '<svg class="icon disclosure-arrow"><use href="#i-chevron-down"/></svg></summary>';
      for (const selector of ['.story-box', '.sync-reel-row', '#draftModeInfo']) {
        const element = publish.querySelector(selector);
        if (element) advanced.append(element);
      }
      publish.append(advanced);
    }

    const heading = page.querySelector('.source-card .section-head');
    const clear = byId('clearPublicationBtn');
    if (heading && clear) clear.textContent = 'Limpar vídeo';
    const searchButton = byId('wedropSearchBtn');
    if (searchButton) searchButton.textContent = '⌕  Buscar vídeo';
  }
  applyPublisherReferenceLayout();

  const navLinks = [...document.querySelectorAll('.nav-link')];
  const pages = [...document.querySelectorAll('.app-page')];
  const pageTitles = {
    '#create':'Criar publicação',
    '#commerce':'Link clicável',
    '#channels':'Canais de conexão',
    '#activity':'Histórico',
    '#publications':'Publicações'
  };
  function updateNav() {
    const target = pageTitles[location.hash] ? location.hash : '#create';
    navLinks.forEach(link => {
      const active = link.getAttribute('href') === target;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    pages.forEach(page => {
      const active = `#${page.id}` === (target === '#publications' ? '#activity' : target);
      page.hidden = !active;
      page.classList.toggle('active-page', active);
    });
    const crumb = byId('breadcrumbCurrent');
    if (crumb) crumb.textContent = pageTitles[target];
    document.title = `${pageTitles[target]} · REDEACHADOS BR`;
    requestAnimationFrame(() => window.scrollTo({top:0,left:0,behavior:'auto'}));
  }
  window.addEventListener('hashchange', updateNav);
  const passwordToggle=byId('loginPasswordToggle');
  if(passwordToggle)passwordToggle.addEventListener('click',()=>{
    const password=byId('loginPassword');
    const showing=password.type==='password';
    password.type=showing?'text':'password';
    passwordToggle.setAttribute('aria-pressed',String(showing));
    passwordToggle.setAttribute('aria-label',showing?'Ocultar senha':'Mostrar senha');
    passwordToggle.title=showing?'Ocultar senha':'Mostrar senha';
    password.focus({preventScroll:true});
  });
  byId('loginPassword').addEventListener('keydown', event => {if (event.key === 'Enter') byId('loginBtn').click()});
  updateCounts();
  updateNav();
})();
