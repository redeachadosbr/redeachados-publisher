import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

const pages=[
  ['overview','inicio'],['products','produtos'],['optimizer','otimizacao'],['pricing','precificacao'],['discounts','descontos'],['orders','pedidos'],
  ['alerts','envios'],['ads','ads'],['wedrop','wedrop'],
  ['finance','financeiro'],['settings','configuracoes']
];
test('cada setor tem um item único no menu lateral e uma página independente',()=>{
  for(const [key,route] of pages){
    assert.match(index,new RegExp('data-tab="'+key+'" data-page="'+route+'"'));
    assert.match(index,new RegExp('id="tab-'+key+'"'));
    assert.match(app,new RegExp(key+":\\{slug:'"+route+"'"));
    assert.match(server,new RegExp("'"+route+"'"));
  }
  assert.equal((index.match(/class="tabpane(?: active)?" id="tab-/g)||[]).length,11);
  assert.match(index,/class="sidebar-nav"/);
  assert.match(index,/id="appSidebar"/);
  assert.match(index,/id="sidebarToggle"/);
  assert.match(index,/id="sidebarScrim"/);
  assert.doesNotMatch(index,/class="tabs"/);
});
test('financeiro fica fora do fornecedor e contém os botões e tabelas necessários',()=>{
  const start=index.indexOf('id="tab-wedrop"');
  const finance=index.indexOf('id="tab-finance"');
  const settings=index.indexOf('id="tab-settings"');
  assert.ok(start>=0&&finance>start&&settings>finance);
  const supplier=index.slice(start,finance),financePart=index.slice(finance,settings);
  assert.doesNotMatch(supplier,/id="shopeeFinancePanel"/);
  assert.doesNotMatch(supplier,/id="wedropFinancialResults"/);
  assert.match(financePart,/id="shopeeFinancePanel"/);
  assert.match(financePart,/id="shopeeFinanceLoad"/);
  assert.match(financePart,/id="wedropFinancialResults"/);
  assert.match(supplier,/id="wedropStoredCatalog"/);
  assert.match(supplier,/id="wedropSyncModelsBtn"/);
});
test('integração e diagnóstico técnico ficam somente nas configurações',()=>{
  const config=index.slice(index.indexOf('id="tab-settings"'));
  const dashboard=index.slice(index.indexOf('id="tab-overview"'),index.indexOf('id="tab-products"'));
  assert.match(config,/id="connectBtn"/);
  assert.match(config,/id="testBtn"/);
  assert.match(config,/id="signatureBtn"/);
  assert.match(config,/id="refreshBtn"/);
  assert.match(config,/id="output"/);
  assert.doesNotMatch(dashboard,/id="testBtn"/);
  assert.match(dashboard,/id="mConnection"/);
  assert.match(dashboard,/data-go="alerts"/);
});
test('IDs controlados pelo código existente permanecem únicos e presentes',()=>{
  const ids=[
    'monitorBadge','statusPill','connMeta','productsBody','catalogTotal','ordersBody',
    'monitorPendingBody','adsResultsBody','wedropFile','wedropStoredCatalog',
    'shopeeFinanceOrders','shopeeFinanceStatus','wedropCoverageBody','output'
  ];
  for(const id of ids){
    const occur=(index.match(new RegExp('id="'+id+'"','g'))||[]).length;
    assert.equal(occur,1,'ID '+id+' deve existir uma vez');
  }
  assert.match(index,/script src="\/app\.js\?v=\d+\.\d+\.\d+"/);
  assert.match(index,/stylesheet" href="\/style\.css\?v=\d+\.\d+\.\d+"/);
});
test('roteador suporta URLs próprias, refresh, voltar e avançar e atalhos',()=>{
  assert.match(app,/history\.pushState/);
  assert.match(app,/addEventListener\('popstate'/);
  assert.match(app,/location\.pathname/);
  assert.match(app,/document\.querySelectorAll\('\.nav-link\[data-tab\]'\)/);
  assert.match(app,/document\.querySelectorAll\('\[data-go\]'\)/);
  assert.match(app,/setTab\(currentPageFromUrl\(\),\{updateHistory:false,scroll:false\}\)/);
  assert.match(app,/aria-current/);
  assert.match(server,/app\.get\('\/app\/:section'/);
  assert.match(server,/res\.sendFile\(path\.join\(__dirname,'public','index\.html'\)\)/);
});
test('layout tem menu fixo, responsividade para mobile e tratamento acessível',()=>{
  assert.match(css,/grid-template-columns:260px minmax\(0,1fr\)/);
  assert.match(css,/@media\(max-width:980px\)/);
  assert.match(css,/\.sidebar-open \.app-sidebar/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(index,/aria-label="Menu principal"/);
  assert.match(index,/aria-controls="appSidebar"/);
  assert.match(index,/aria-current="page"/);
});

test('painel inicial integra o visual de referência com estados reais e atalhos funcionais',()=>{
 const home=index.slice(index.indexOf('id="tab-overview"'),index.indexOf('id="tab-optimizer"'));
 for(const id of ['dashboardRefreshStatus','dashboardLastChecked','heroConnectedLabel',
  'heroConnectedHint','heroEnvironmentLabel','heroApiLabel',
  'mConnection','mShop','mMode','mStorage']){
  assert.equal((home.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(home,/class="welcome-hero dashboard-hero-v2"/);
 assert.match(home,/class="dashboard-hero-logo"/);
 assert.equal((home.match(/class="dashboard-hero-status-card"/g)||[]).length,3);
 assert.equal((home.match(/class="kpi-tile interactive-tilt dashboard-kpi-/g)||[]).length,4);
 assert.equal((home.match(/class="shortcut interactive-tilt dashboard-shortcut-/g)||[]).length,4);
 assert.match(app,/classList\?\.toggle\?\.\('view-overview',name==='overview'\)/);
 assert.match(app,/heroConnectedLabel'\)\.textContent=connected\?/);
 assert.match(app,/dashboardLastChecked'\)\.textContent='Atualizado às '/);
 assert.match(app,/dashboardRefreshStatus'\)\?\.addEventListener\?\./);
 assert.match(css,/\.dashboard-hero-v2/);
 assert.match(css,/#tab-overview \.dashboard-metrics/);
 assert.match(css,/@media\(max-width:680px\)/);
});
