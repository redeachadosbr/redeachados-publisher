import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const logo=readFileSync(new URL('../public/brand-logo.svg',import.meta.url),'utf8');

test('logo original fornecida pela loja incorporada localmente e referenciada sem URLs remotas',()=>{
  assert.match(logo,/data:image\/webp;base64,/);
  const match=logo.match(/data:image\/webp;base64,([^"]+)/);
  assert.ok(match);
  const bytes=Buffer.from(match[1],'base64');
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.length,2684);
  assert.ok((html.match(/\/brand-logo\.svg/g)||[]).length>=4);
  assert.match(html,/rel="icon" type="image\/svg\+xml" href="\/brand-logo\.svg"/);
  assert.match(html,/class="shopee-integration-mark"/);
});

test('cards internos compactos têm links reais, sem indicadores falsos',()=>{
  const dashboard=html.slice(html.indexOf('id="tab-overview"'),html.indexOf('id="tab-products"'));
  const cards=[...dashboard.matchAll(/class="kpi-tile interactive-tilt dashboard-kpi-[^"]+" type="button" data-go="([^"]+)"/g)];
  assert.equal(cards.length,4);
  assert.deepEqual(cards.map(x=>x[1]),['settings','settings','settings','wedrop']);
  assert.equal((dashboard.match(/class="shortcut interactive-tilt dashboard-shortcut-[^"]+"/g)||[]).length,4);
  for(const id of ['mConnection','mShop','mMode','mStorage']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  }
  assert.doesNotMatch(dashboard,/\+\d+(\.\d+)?%/);
});

test('efeito de profundidade tem limites, hover e acessibilidade',()=>{
  assert.match(css,/--brand-blue:#0875e2/);
  assert.match(css,/--saas-orange:#ee4d2d/);
  assert.match(css,/min-height:122px/);
  assert.match(css,/min-height:138px/);
  assert.match(css,/perspective\(920px\)/);
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.kpi-tile:focus-visible/);
  assert.match(app,/enableCardMicroInteractions\(\)/);
  assert.match(app,/prefers-reduced-motion: reduce/);
  assert.match(app,/pointercancel/);
  assert.match(app,/Math\.max\(-1,Math\.min\(1,/);
  assert.match(app,/data-go/);
});

test('páginas e IDs das funções Shopee preservados',()=>{
  for(const id of ['tab-overview','tab-products','tab-orders','tab-alerts',
    'tab-ads','tab-wedrop','tab-finance','tab-settings','wedropStoredCatalog',
    'shopeeFinanceLoad','wedropCoverageBody','adsStart','loginBtn','testBtn']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.match(html,/style\.css\?v=\d+\.\d+\.\d+/);
  assert.match(html,/app\.js\?v=\d+\.\d+\.\d+/);
});
