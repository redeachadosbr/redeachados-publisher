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
  const navLinks = [...document.querySelectorAll('.nav-link')];
  function updateNav() {
    const target = ['#channels', '#activity'].includes(location.hash) ? location.hash : '#create';
    navLinks.forEach(link => {
      const active = link.getAttribute('href') === target;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('hashchange', updateNav);
  byId('loginPassword').addEventListener('keydown', event => {if (event.key === 'Enter') byId('loginBtn').click()});
  updateCounts();
  updateNav();
})();
