import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('Monitor de envios mantém os IDs e usa o novo layout da referência sem dados fictícios',()=>{
  const start=html.indexOf('id="tab-alerts"');
  const end=html.indexOf('id="tab-ads"',start);
  const monitor=html.slice(start,end);
  assert.ok(start>0&&end>start);
  for(const id of [
    'checkOrdersBtn','checkOrdersLabel','enableBrowserAlertsBtn','browserAlertsLabel',
    'monitorStatus','monitorHeadline','monitorStatusDetail','monitorSystemHealth','monitorHealthDetail',
    'monitorPendingCount','monitorCriticalCount','monitorUnreadCount','monitorLastRun',
    'monitorPendingBody','monitorEmpty','monitorFilterSummary','monitorAlerts',
    'monitorShowAllAlerts','monitorHistory','monitorLastAttempt','monitorLastSuccessAudit',
    'monitorScannedCount','monitorLastNewAlerts','monitorLastError',
    'monitorStateRunning','monitorStateInterval','monitorStatePanel','monitorStateBrowser']){
    assert.equal((monitor.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  for(const name of ['all','today','critical','soon']){
    assert.match(monitor,new RegExp('data-monitor-filter="'+name+'"'));
  }
  assert.equal((monitor.match(/data-monitor-shortcut="/g)||[]).length,4);
  assert.match(monitor,/Não informado pela Shopee|Prazos oficiais|prazos oficiais/);
  assert.match(css,/body\.view-alerts/);
  assert.match(css,/\.monitor-main-grid/);
  assert.match(js,/classList\?\.toggle\?\.\('view-alerts',name==='alerts'\)/);
});
test('filtros de prazo respeitam classificação oficial e não escondem vencidos do Hoje',()=>{
  const from=js.indexOf('function monitorRiskFilter(order,filter){');
  const end=js.indexOf('function monitorSetActiveIndicator(',from);
  const script=js.slice(from,end)+'\nthis.testFilter=monitorRiskFilter;';
  const scope={};runInNewContext(script,scope);
  for(const risk of ['overdue','critical','urgent','today'])
    assert.equal(scope.testFilter({risk},'today'),true,risk);
  for(const risk of ['soon','normal','unknown'])
    assert.equal(scope.testFilter({risk},'today'),false,risk);
  assert.equal(scope.testFilter({risk:'overdue'},'critical'),true);
  assert.equal(scope.testFilter({risk:'urgent'},'critical'),false);
  assert.equal(scope.testFilter({risk:'soon'},'soon'),true);
  assert.equal(scope.testFilter({risk:'unknown'},'all'),true);
});
test('monitor usa os endpoints existentes, sem inventar sincronização, avisos ou permissão',()=>{
  assert.match(server,/app\.get\('\/api\/shopee\/monitor'/);
  assert.match(server,/app\.post\('\/api\/shopee\/monitor\/check-now'/);
  assert.match(server,/app\.post\('\/api\/shopee\/monitor\/read'/);
  assert.match(js,/await json\('\/api\/shopee\/monitor'\)/);
  assert.match(js,/status\.health\|\|\{\}/);
  assert.match(js,/monitorDataLoaded=false/);
  assert.match(js,/monitorShowEmpty\('Consulta indisponível'/);
  assert.match(js,/Notification\.permission==='granted'/);
  assert.match(js,/Notification\.requestPermission\(\)/);
  assert.match(js,/monitorSetActiveIndicator\('#monitorStateInterval',healthy\?'ok'/);
  assert.match(html,/app\.js\?v=1\.19\.3/);
});
