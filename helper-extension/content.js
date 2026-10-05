(() => {
  'use strict';
  if (window.top !== window) return;
  const REASON = 'Solicito manter este anúncio tradicional, sem vinculação a um produto de catálogo.';
  const BANNER_ID = 'ra-ml-helper-banner';
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const visible = el => {
    if (!el?.isConnected || el.closest(`#${BANNER_ID},[hidden],[inert],[aria-hidden="true"]`)) return false;
    const style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  };
  const enabled = el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const onscreen = el => {
    if (!enabled(el)) return false;
    const r = el.getBoundingClientRect();
    if (![r.top, r.bottom, r.left, r.right].every(Number.isFinite)) return true;
    return r.bottom >= 0 && r.right >= 0 && r.top <= (globalThis.innerHeight || document.documentElement.clientHeight || 100000) && r.left <= (globalThis.innerWidth || document.documentElement.clientWidth || 100000);
  };
  const text = el => norm(el?.innerText || el?.textContent || '');
  const labelsOf = el => [text(el), norm(el?.getAttribute?.('aria-label')), norm(el?.getAttribute?.('title')), norm(el?.value)].filter(Boolean);
  const labelMatch = (value, wanted, loose = false) => value === wanted || (loose && value.includes(wanted) && value.length <= wanted.length + 80);
  function pageText() {
    const clone = document.body?.cloneNode(true);
    clone?.querySelectorAll(`#${BANNER_ID},script,style,[hidden],[aria-hidden="true"]`).forEach(el => el.remove());
    return text(clone);
  }
  function controls(labels, root = document, loose = false) {
    const names = labels.map(norm), results = [];
    const selectors = ['button,a,[role="button"],input[type="button"],input[type="submit"],[onclick],[tabindex]', 'span,div,p'];
    for (const selector of selectors) {
      for (const el of root.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        const matched = labelsOf(el).some(value => names.some(name => labelMatch(value, name, loose)));
        if (!matched) continue;
        const parent = el.closest('button,a,[role="button"],[onclick],[tabindex]');
        const target = parent && visible(parent) ? parent : el;
        if (results.some(other => other === target || other.contains?.(target))) continue;
        if (target.matches?.('span,div,p') && [...(target.children || [])].some(child => visible(child) && labelsOf(child).some(value => names.some(name => labelMatch(value, name, loose))))) continue;
        results.push(target);
      }
    }
    return results;
  }
  const preferred = items => items.find(onscreen) || items.find(enabled) || null;
  const control = (labels, root, loose = false) => preferred(controls(labels, root, loose));
  function tokenIn(value, token) {
    return !!token && new RegExp(`(^|[^a-z0-9])${escapeRegex(norm(token))}($|[^a-z0-9])`, 'i').test(norm(value));
  }
  function hasIdentity(el, state) {
    const value = text(el);
    const itemNumber = state.itemId.replace(/^MLB/, '');
    return tokenIn(value, state.itemId) || tokenIn(value, itemNumber) || tokenIn(value, state.sku) || tokenIn(value, state.userProductId);
  }
  function singleListing(el, state) {
    const value = text(el), number = state.itemId.replace(/^MLB/, '');
    const ids = value.match(/(?:#\s*|mlb)\d{8,}/g) || [];
    if (ids.some(id => id.replace(/\D/g, '') !== number)) return false;
    const skus = [...value.matchAll(/\bsku\s*:?\s*([a-z0-9][a-z0-9._-]*)/g)].map(match => match[1]);
    return !state.sku || skus.every(sku => sku === norm(state.sku));
  }
  function routeMatches(state) {
    const parts = location.pathname.toUpperCase().split('/').filter(Boolean);
    return parts.includes(state.itemId) || (state.userProductId && parts.includes(state.userProductId));
  }
  function trustedEditPage(state) {
    if (!/\/anuncios\/[^/]+\/modificar(?:\/|$)/i.test(location.pathname)) return false;
    // The owner tab is already bound to this run. Mercado Livre can rewrite MLB -> MLBU
    // and can keep responsive duplicate controls in the DOM. On the edit route, once the
    // exact listing was opened by this run, the Verify action is safe to resolve by page state.
    return routeMatches(state) || !!state.actions.edit || state.stage === 'opening-item';
  }
  function catalogFlowPage(state) {
    if (!/\/publicar\/catalogo(?:\/|$)/i.test(location.pathname)) return false;
    return routeMatches(state) || !!state.actions.verify || ['verify-clicked','different-clicked','not-found-clicked','confirmed','filled','sending'].includes(state.stage);
  }
  function targetDifferent() {
    const direct = control(['Não, é diferente', 'Não é diferente'], document, true);
    if (direct) return direct;
    const candidates = document.querySelectorAll('button,a,[role="button"],[onclick],[tabindex],span,div');
    for (const el of candidates) {
      if (!visible(el)) continue;
      const label = labelsOf(el).join(' ');
      if (/^nao[,!.]?\s+e\s+diferente\b/.test(label) || /\bnao[,!.]?\s+e\s+diferente\b/.test(label)) return el.closest('button,a,[role="button"],[onclick],[tabindex]') || el;
    }
    return null;
  }
  function targetVerify(state) {
    const buttons = controls(['Verificar produto'], document, true).filter(enabled);
    // On an exact listings table, identity still wins and protects against another SKU.
    for (const button of buttons) {
      for (let node = button.parentElement; node && node !== document.body; node = node.parentElement) {
        if (hasIdentity(node, state) && singleListing(node, state)) return button;
      }
    }
    // Once this run has opened the dedicated edit page, there is only one listing in scope.
    // ML often leaves responsive duplicate copies of the same CTA in the DOM; prefer the one
    // actually on screen instead of requiring buttons.length === 1.
    if (trustedEditPage(state)) return preferred(buttons);
    return null;
  }
  function targetEdit(state) {
    for (const a of document.querySelectorAll('a[href]')) {
      if (!enabled(a) || !/\/modificar(?:\/|$|\?)/i.test(a.href)) continue;
      for (let node = a; node && node !== document.body; node = node.parentElement) {
        if (hasIdentity(node, state)) {
          // A wrapper holding multiple listings is not a target row.
          if (singleListing(node, state)) return a;
          break;
        }
      }
    }
    return null;
  }
  function refusalModal() {
    const matches = el => {
      const t = text(el);
      return t.includes('nao encontrou seu produto') && t.includes('sem competir');
    };
    for (const el of document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"],.andes-modal')) {
      if (visible(el) && matches(el) && control(['Continuar'], el, true)) return el;
    }
    for (const el of document.querySelectorAll('h1,h2,h3,p,span,div')) {
      if (!visible(el) || text(el) !== 'nao encontrou seu produto?') continue;
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        if (matches(node) && controls(['Continuar'], node, true).length === 1) return node;
      }
    }
    return null;
  }
  const rpc = payload => new Promise(resolve => {
    try { chrome.runtime.sendMessage(payload, result => { const error = chrome.runtime.lastError; resolve(error ? {ok: false, reason: error.message} : result || {ok: false}); }); }
    catch (error) { resolve({ok: false, reason: String(error.message || error)}); }
  });
  let banner, lastBanner = '', currentRun = '', busy = false, timer;
  function show(title, detail, tone = 'run') {
    const signature = `${title}|${detail}|${tone}`;
    if (signature === lastBanner && banner?.isConnected) return;
    lastBanner = signature;
    if (!banner?.isConnected) {
      banner = document.createElement('aside'); banner.id = BANNER_ID;
      banner.style.cssText = 'position:fixed;right:16px;top:16px;z-index:2147483647;width:min(360px,calc(100vw - 64px));color:white;border:2px solid #ffe600;border-radius:14px;box-shadow:0 6px 24px #0004;padding:14px;font:14px/1.4 Arial,sans-serif;';
      document.documentElement.appendChild(banner);
    }
    banner.style.background = tone === 'ok' ? '#116844' : tone === 'error' ? '#8e2f2f' : '#102a56';
    banner.replaceChildren();
    for (const [value, bold] of [['Rede Achados BR · Helper V1.6.1', true], [title, true], [detail, false]]) {
      const el = document.createElement('div'); el.textContent = value; el.style.marginBottom = '5px'; if (bold) el.style.fontWeight = '700'; banner.appendChild(el);
    }
    if (currentRun && tone !== 'ok' && title !== 'Automação parada') {
      const button = document.createElement('button'); button.textContent = 'PARAR automação';
      button.style.cssText = 'margin-top:6px;padding:6px 10px;border:1px solid white;border-radius:7px;background:transparent;color:white;cursor:pointer';
      button.onclick = async () => { await rpc({type: 'RA_STOP', runId: currentRun}); show('Automação parada', 'Nenhum novo clique será feito.', 'error'); };
      banner.appendChild(button);
    }
  }
  function nativeSet(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  function click(el) {
    if (!enabled(el)) return;
    el.scrollIntoView({block: 'center', inline: 'center'});
    // Preserve ML's own URL and handler. Anchors stay in the current tab where possible.
    const anchor = el.closest('a[href]'); if (anchor) anchor.target = '_self';
    el.click();
  }
  async function action(state, name, detail, operation) {
    const reserved = await rpc({type: 'RA_ACTION', runId: state.runId, action: name});
    if (!reserved.ok) return false;
    // A stop or handoff queued during the reservation must prevent the DOM action.
    const latest = await rpc({type: 'RA_GET', runId: state.runId});
    if (!latest.granted || latest.state?.status !== 'running') return false;
    show('Executando', detail);
    operation();
    return true;
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const result = await rpc({type: 'RA_GET', runId: currentRun || undefined});
      if (result.queued) {
        currentRun = result.requestRunId;
        show('Conferindo a etapa anterior', `${result.previousItemId}: ${result.message} A próxima SKU será liberada automaticamente.`);
        return;
      }
      if (result.retired) {
        show(result.remoteConfirmed ? 'Anterior conferida · sequência liberada' : 'Execução anterior encerrada', result.remoteConfirmed ? `${result.itemId}: conclusão confirmada no Mercado Livre. A próxima solicitação segue na outra aba.` : `${result.itemId}: a pendência foi preservada no Publisher.`, result.remoteConfirmed ? 'ok' : 'error');
        return;
      }
      if (!result.granted || !result.state) return;
      const state = result.state; currentRun = state.runId;
      if (state.status === 'checking' || state.status === 'awaiting-confirmation') {
        show(state.status === 'checking' ? 'Conferindo a pendência' : 'Conferindo a conclusão', [state.previousNotice, state.checkMessage].filter(Boolean).join(' '));
        return;
      }
      if (state.status === 'finished') { show(state.remoteConfirmed ? 'Conclusão confirmada no Mercado Livre' : 'Conferindo a conclusão', state.remoteConfirmed ? 'A pendência foi retirada da fila. A próxima solicitação será liberada automaticamente.' : 'Conferindo o resultado no Publisher antes de liberar a próxima SKU.', state.remoteConfirmed ? 'ok' : 'run'); return; }
      if (state.status !== 'running') { show('Automação parada', state.error || 'Inicie novamente pelo Publisher.', 'error'); return; }
      if (Date.now() - state.lastActionAt < 1100) return;
      const content = pageText();
      if (content.includes('nao foi possivel encontrar esta pagina')) {
        await rpc({type: 'RA_STOP', runId: state.runId, reason: 'A rota retornou página não encontrada. Nenhuma outra aba será aberta.'}); return;
      }
      // The supplied recording proves this is the expected refusal result, not an HTTP error.
      const traditionalResult = content.includes('nao foi possivel verificar seu produto de catalogo') && content.includes('anuncio tradicional') && (content.includes('continuara vendendo') || content.includes('continuar vendendo')) && content.includes('normalmente');
      if (state.actions.send && traditionalResult) {
        const back = control(['Ir para anúncios', 'Ir para os anúncios'], document, true);
        if (back && !state.actions.return) await action(state, 'return', 'Resposta recebida: anúncio tradicional mantido. Voltando aos anúncios.', () => click(back));
        return;
      }
      if (state.responseConfirmed && state.actions.return && !catalogFlowPage(state) && /\/anuncios(?:\/|$)/i.test(location.pathname)) {
        await rpc({type: 'RA_FINISH', runId: state.runId}); schedule(); return;
      }
      if (catalogFlowPage(state)) {
        const fields = [...document.querySelectorAll('textarea')].filter(visible);
        if ((content.includes('digite as principais diferencas') || content.includes('produto se diferencia') || content.includes('principais diferencas')) && fields.length === 1 && !state.actions.send) {
          const field = fields[0];
          if (!field.value.trim()) {
            if (!state.actions.fill) await action(state, 'fill', 'Preenchendo o pedido de manter o anúncio tradicional.', () => nativeSet(field, REASON));
            return;
          }
          const send = control(['Enviar'], document, true);
          if (send) await action(state, 'send', 'Enviando uma vez e aguardando a resposta do Mercado Livre.', () => click(send));
          return;
        }
        const modal = refusalModal();
        if (modal && !state.actions.continue) {
          await action(state, 'continue', 'Confirmando “Continuar” somente na janela “Não encontrou seu produto?”.', () => click(control(['Continuar'], modal, true))); return;
        }
        const different = targetDifferent();
        if (different && !state.actions.different && !state.actions.decline && !state.actions.continue && !state.actions.send) {
          await action(state, 'different', 'Selecionando sempre “Não, é diferente”.', () => click(different)); return;
        }
        const decline = control(['Não encontro meu produto', 'Não encontrei meu produto'], document, true);
        if (decline && !state.actions.decline && !state.actions.continue && !state.actions.send) {
          await action(state, 'decline', 'Prosseguindo com “Não encontro meu produto” quando esta etapa aparecer.', () => click(decline)); return;
        }
      }
      if (!state.actions.verify && !state.actions.send && !catalogFlowPage(state)) {
        const verify = targetVerify(state);
        if (verify) { await action(state, 'verify', `SKU ${state.sku || state.itemId} localizada. Abrindo “Verificar produto”.`, () => click(verify)); return; }
        const edit = !state.actions.edit && targetEdit(state);
        if (edit) { await action(state, 'edit', 'Abrindo o link de edição da SKU correta.', () => click(edit)); return; }
        if (!state.actions.search && !state.actions.edit && /\/anuncios(?:\/|$)/i.test(location.pathname)) {
          const input = [...document.querySelectorAll('input')].find(el => visible(el) && /busc|pesquis|sku|anuncio|anúncio/.test(norm(`${el.placeholder} ${el.getAttribute('aria-label')} ${el.getAttribute('role')} ${el.type === 'search' ? 'buscar' : ''}`)));
          if (input && norm(input.value) !== norm(state.itemId)) {
            await action(state, 'search', `Localizando somente ${state.itemId}.`, () => {
              nativeSet(input, state.itemId); input.focus();
              input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));
              input.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));
            }); return;
          }
        }
      }
      const age = Date.now() - (state.lastActionAt || state.startedAt);
      if (age > 20000) {
        const step = {locate: 'localizar o botão na SKU correta', 'opening-item': 'localizar e clicar em “Verificar produto”', 'verify-clicked': 'abrir os produtos sugeridos', 'different-clicked': 'seguir após “Não, é diferente”', 'not-found-clicked': 'abrir a confirmação “Não encontrou seu produto?”', confirmed: 'abrir o campo “Digite as principais diferenças”', filled: 'habilitar “Enviar”', sending: 'aguardar a resposta final do Mercado Livre', returning: 'retornar ao anúncio e confirmar no Publisher'}[state.stage] || state.stage;
        show('Aguardando Mercado Livre', `Etapa: ${step}. SKU ${state.sku || state.itemId}. O clique anterior não será repetido.`);
      } else if (!state.lastActionAt) show('Localizando a SKU', `Procurando ${state.sku || state.itemId} na página.`, 'run');
    } catch (error) {
      await rpc({type: 'RA_STOP', runId: currentRun, reason: String(error?.message || error)});
      show('Automação parada', String(error?.message || error), 'error');
    } finally { busy = false; }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(tick, 150); }
  async function start() {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('ra-auto-verify-product') === '1') {
      const marker = {runId: hash.get('ra-run') || `${hash.get('ra-item')}-${Date.now()}`, itemId: hash.get('ra-item') || '', sku: hash.get('ra-sku') || '', userProductId: hash.get('ra-up') || '', title: hash.get('ra-title') || ''};
      const result = await rpc({type: 'RA_BEGIN', marker});
      if (!result.ok) { show('Não foi possível iniciar', 'Abra a SKU pelo botão “Resolver automaticamente” do Publisher.', 'error'); return; }
      if (result.granted || result.queued) currentRun = result.state?.runId || result.requestRunId || marker.runId;
      if (result.queued) show('Conferindo a etapa anterior', `${result.previousItemId}: a conclusão será conferida antes de liberar esta SKU.`);
    }
    const observer = new MutationObserver(records => { if (records.some(record => !banner?.contains(record.target) && record.target !== banner)) schedule(); });
    observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'class', 'href', 'hidden']});
    setInterval(tick, 1200); tick();
  }
  start();
})();
