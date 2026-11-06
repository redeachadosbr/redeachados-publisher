import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/curvas-premium.css',import.meta.url),'utf8');
const start=html.indexOf('<section class="tabpane" id="tab-curves"');
const end=html.indexOf('<section class="tabpane" id="tab-kits"',start);
const page=html.slice(start,end);
test('visual premium isolado da página Curvas A/B, sem alterar a lógica',()=>{
 assert.ok(start>=0&&end>start);
 assert.match(html,/curvas-ab\.css\?v=/);
 assert.match(html,/curvas-premium\.css\?v=/);
 assert.match(css,/#tab-curves \.curve-integration-grid/);
 assert.match(css,/@container\(max-width:690px\)/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/curve-mini-chart/);
 assert.match(page,/class="curve-filters curve-chrome-filters"/);
 assert.match(page,/class="curve-panel-title"/);
 assert.match(page,/class="curve-chrome-symbol"/);
 assert.match(page,/class="curve-mini-chart"/);
});
test('todas as funções e pontos de integração existentes permanecem',()=>{
 const ids=['curveCategory','curveLimit','curveKeyword','curveSearchForm',
  'curveSourceStatus','curveTestSources','curveFeaturedLink',
  'curveChromeStatus','curveChromeDownload','curveChromeStart','curveNotice',
  'curveStats','curveResults','curveResultsMeta','curveContinueSearch'];
 for(const id of ids)assert.match(page,new RegExp('id="'+id+'"'),id);
 assert.match(html,/\/curvas-ab\.js\?v=/);
 assert.match(html,/\/curvas-chrome\.js\?v=/);
 assert.ok(page.includes('role="status"'));
 assert.ok(page.includes('aria-live="polite"'));
});
test('estrutura da tela fecha as seções antes da próxima aba',()=>{
 assert.ok(page.includes('class="curve-search-panel curve-chrome-unified"'));
 assert.ok(page.indexOf('id="curveSearchForm"')<page.indexOf('class="curve-technical-diagnostics"'));
 assert.ok(page.indexOf('class="curve-technical-diagnostics"')<page.indexOf('class="curve-help"'));
 assert.ok(page.indexOf('class="curve-help"')<page.indexOf('id="curveResults"'));
});
