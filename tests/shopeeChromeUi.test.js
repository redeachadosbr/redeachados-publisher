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

test('pesquisa continua até a quantidade solicitada, sem limite fixo de 60 buscas',()=>{
 const code=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/curvas-ab.js',import.meta.url),'utf8');
 assert.match(code,/s\.found>=s\.selected\.limit/);
 assert.doesNotMatch(code,/MAX_SEARCHES_PER_RUN/);
 assert.match(code,/s\.targetReached=true/);
 assert.doesNotMatch(code,/NO_MONTHLY_LIMIT/);
 assert.match(ui,/row\.monthlyCompetitors/);
 assert.match(ui,/mínimo 2 lojas/);
});

test('exige a extensão Shopee Chrome 1.2.0 para pesquisas sem novas abas',()=>{
 const code=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../chrome-extension-shopee/manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.version,'1.2.3');
 assert.match(code,/parts\[1\]>2/);
 assert.match(code,/Number\(parts\[2\]\|\|0\)>=3/);
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
 assert.match(page,/class="curve-search-panel curve-chrome-unified"/);
 assert.match(bridge,/form\.addEventListener\('submit'/);
 assert.match(bridge,/curve:'ALL'/);
 assert.match(bridge,/verifiedOnly:true/);
 assert.doesNotMatch(old,/form\.addEventListener\('submit',search/);
});

test('a Ponte Chrome reutiliza janela minimizada e expõe etapas, andamento e cancelamento',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const background=read('../chrome-extension-shopee/background.js');
 const manager=read('../chrome-extension-shopee/manager.js');
 const page=read('../public/index.html');
 const chromeUi=read('../public/curvas-chrome.js');
 assert.match(background,/chrome\.windows\.create\(\{url,focused:false,state:'minimized'/);
 assert.match(background,/restoreResearchWindow\(managerTab,nonce\)/);
 assert.match(background,/chrome\.storage\.session\.set/);
 assert.match(background,/chrome\.tabs\.update\(tab\.id,\{url\}\)/);
 assert.match(background,/chrome\.windows\.remove\(session\.windowId\)/);
 assert.doesNotMatch(background,/chrome\.tabs\.create\(/);
 assert.match(background,/RA_CURVE_CHROME_STEP/);
 assert.match(manager,/RA_CURVE_BROWSER_CANCEL/);
 assert.match(manager,/RA_CURVE_BROWSER_CLOSE/);
 assert.match(chromeUi,/RA_CURVE_CHROME_STEP/);
 assert.match(chromeUi,/RA_CURVE_CHROME_CANCEL/);
 for(const id of ['curveChromeProgress','curveChromeStage','curveChromeCounters',
  'curveChromeProgressBar','curveChromeActivity','curveChromeCancel'])
  assert.match(page,new RegExp('id="'+id+'"'));
});

test('final da pesquisa apresenta categoria, total pesquisado, retornos e viáveis para Ads',()=>{
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const source=readFileSync(new URL('../shopeeChromeCurves.js',import.meta.url),'utf8');
 for(const id of ['curveChromeFinalReport','curveChromeSummaryCategory','curveChromeSummaryStatus',
  'curveChromeSummaryScanned','curveChromeSummaryMatched','curveChromeSummaryViable',
  'curveChromeSummaryExcluded','curveChromeSummaryDetail'])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(ui,/function finishReport/);
 assert.match(ui,/s\.searchedSkuIds/);
 assert.match(ui,/s\.matchedSkuIds/);
 assert.match(ui,/s\.viableSkuIds/);
 assert.match(ui,/finishReport\(s,/);
 assert.match(source,/matchedSkuIds:rows\.map/);
 assert.match(source,/viableSkuIds:qualified\.map/);
 assert.match(source,/searchedSkus:task\.skus/);
});

test('relatório da Ponte conta SKUs tentadas em consultas incompletas sem pular lote',()=>{
 const ui=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../shopeeChromeCurves.js',import.meta.url),'utf8');
 assert.match(backend,/skuCount:job\.skus\.length,skus:job\.skus/);
 assert.match(ui,/attemptedSkuIds:new Set\(\)/);
 assert.match(ui,/const searched=s\.attemptedSkuIds\.size/);
 assert.match(ui,/for\(const sku of job\?\.skus\|\|\[\]\)s\.attemptedSkuIds\.add/);
 assert.match(ui,/if\(s\.blocked\)offset=0/);
});

test('consulta incompleta não bloqueia outras SKUs e mensagem informa erro recuperável',()=>{
 const bg=readFileSync(new URL('../chrome-extension-shopee/background.js',import.meta.url),'utf8');
 const bridge=readFileSync(new URL('../chrome-extension-shopee/manager.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 assert.match(bg,/recoverable:incomplete&&!hardStop/);
 assert.match(bg,/if\(hardStop\)break/);
 assert.match(bg,/if\(incomplete\)await stage/);
 assert.match(bg,/blocked:true/);
 assert.match(bridge,/recoverable:Boolean\(msg\.recoverable\)/);
 assert.match(bridge,/warning:String\(msg\.warning\|\|''\)/);
 assert.match(ui,/if\(m\.recoverable\)/);
 assert.doesNotMatch(ui,/MAX_SEARCHES_PER_RUN/);
 assert.doesNotMatch(ui,/NO_MONTHLY_LIMIT/);
});

test('botão usa versão instalada no manifesto e consulta versão real no servidor',()=>{
 const page=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const code=readFileSync(new URL('../public/curvas-chrome.js',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../chrome-extension-shopee/manifest.json',import.meta.url),'utf8'));
 assert.match(page,new RegExp('Baixar extensão '+manifest.version.replace(/\./g,'\\.')));
 assert.doesNotMatch(page,/Baixar extensão 1\.2\.2/);
 assert.match(page,/vendas mensais em 2 a 5 lojas/);
 assert.match(page,/média de 2 a 10 anúncios equivalentes/);
 assert.match(code,/chrome-extension-version/);
 assert.match(code,/Baixar extensão.*version/);
 assert.match(code,/Requer 1\.2\.3/);
 assert.match(code,/Verificando Ponte Chrome 1\.2\.3/);
});
