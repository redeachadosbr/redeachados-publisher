(() => {
  'use strict';
  if (window.top !== window || location.origin !== 'https://redeachados-ml-publisher.onrender.com') return;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || sender.tab || message?.type !== 'RA_CONFIRM_PRODUCT') return;
    if (!/^MLB\d+$/.test(message.itemId || '')) { respond({ok: false, error: 'Anúncio inválido.'}); return; }
    (async () => {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
      try {
        // Reuse the Publisher's same-origin session. Never read or forward its cookies/tokens.
        const response = await fetch('/api/catalog-guard/product-verification/confirm', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
          headers: {'content-type': 'application/json'}, body: JSON.stringify({itemId: message.itemId})
        });
        if (response.status === 401 || response.status === 403) throw new Error('Entre novamente no Publisher para conferir a pendência.');
        if (!String(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Abra a aba do Publisher e confirme que está conectado.');
        const data = await response.json();
        if (!response.ok || data.ok !== true) throw new Error(data.error || 'O Publisher não conseguiu consultar o Mercado Livre.');
        respond({ok: true, itemId: message.itemId, confirmed: data.confirmed === true,
          ignored: data.ignored === true, status: data.status, catalogListing: data.catalogListing,
          verifyProductPending: data.verifyProductPending, message: String(data.message || '').slice(0, 600)});
      } catch (error) {
        respond({ok: false, itemId: message.itemId, error: error.name === 'AbortError' ? 'A consulta demorou. Vou conferir novamente automaticamente.' : String(error.message || error)});
      } finally { clearTimeout(timer); }
    })();
    return true;
  });
})();
