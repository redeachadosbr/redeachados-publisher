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
