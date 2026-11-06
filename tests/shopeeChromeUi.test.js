import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('botão abre lote de pesquisas Shopee no Chrome e envia para cruzamento WeDrop',()=>{
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const other=readFileSync(new URL('../public/curvas-ab.js',import.meta.url),'utf8');
 assert.match(page,/id="curveChromeStart"/);
 assert.match(page,/chrome-extension\.zip/);
 assert.match(page,/curvas-chrome\.js/);
 assert.match(ui,/RA_CURVE_CHROME_PROBE/);
 assert.match(ui,/RA_CURVE_CHROME_START/);
 assert.match(ui,/RA_CURVE_CHROME_RESULT/);
 assert.match(ui,/chrome-plan/);
 assert.match(ui,/chrome-import/);
 assert.match(other,/showChromeResults/);
});

test('pesquisa continua entre lotes até 10 SKUs e demonstra 3 concorrentes reais',()=>{
 const code=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/curvas-ab.js',import.meta.url),'utf8');
 assert.match(code,/s\.found>=s\.selected\.limit/);
 assert.match(code,/s\.scanned>=MAX_SEARCHES_PER_RUN/);
 assert.match(code,/NO_MONTHLY_LIMIT/);
 assert.match(ui,/row\.monthlyCompetitors/);
 assert.match(ui,/mínimo 3 lojas/);
});

test('exige a extensão Shopee Chrome 1.1.0 para leitura aprimorada',()=>{
 const code=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../chrome-extension-shopee/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.version,'1.1.1');
 assert.match(code,/parts\[1\]>=1/);
});

test('filtro único categoria, quantidade e nome só inicia pesquisa Chrome',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const start=html.indexOf('id="tab-curves"'),stop=html.indexOf('id="tab-kits"',start);
 const page=html.slice(start,stop);
 const bridge=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const old=readFileSync(new URL('../public/curvas-ab.js',import.meta.url),'utf8');
 for(const id of ['curveCategory','curveLimit','curveKeyword','curveChromeStart'])
  assert.match(page,new RegExp('id="'+id+'"'));
 for(const id of ['curveType','curveSearchBtn','curveConfirmedOnly'])
  assert.doesNotMatch(page,new RegExp('id="'+id+'"'));
 assert.match(page,/class="curve-chrome-unified"/);
 assert.match(bridge,/form\.addEventListener\('submit'/);
 assert.match(bridge,/curve:'ALL'/);
 assert.match(bridge,/verifiedOnly:true/);
 assert.doesNotMatch(old,/form\.addEventListener\('submit',search/);
});
