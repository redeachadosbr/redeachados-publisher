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
