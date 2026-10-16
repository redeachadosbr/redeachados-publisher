import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveMonitorHealth} from '../monitorHealth.js';

const now=Date.parse('2026-10-16T06:00:00.000Z');
const time=(minutesAgo)=>new Date(now-minutesAgo*60_000).toISOString();
test('saudável quando último sucesso foi há menos de 12 minutos',()=>{
  const result=deriveMonitorHealth({last_success_at:time(5),last_started_at:time(5)},{now,expectedIntervalMinutes:5});
  assert.equal(result.state,'healthy');
  assert.equal(result.minutesSinceSuccess,5);
});
test('avisa que monitor está atrasado se Render suspendeu',()=>{
  const result=deriveMonitorHealth({last_success_at:time(16),last_started_at:time(16)},{now,expectedIntervalMinutes:5});
  assert.equal(result.state,'stale');
  assert.match(result.reason,/Render pode ter suspendido/);
});
test('erros recentes não devem ser ocultados por sincronização antiga',()=>{
  const result=deriveMonitorHealth({
    last_success_at:time(5),last_started_at:time(2),last_error:'Shopee API indisponível'
  },{now});
  assert.equal(result.state,'failed');
  assert.match(result.reason,/Shopee API/);
});
test('sem primeira sincronização informa ausência de verificação',()=>{
  assert.equal(deriveMonitorHealth(null,{now}).state,'never');
  const failure=deriveMonitorHealth({last_error:'Timeout'}, {now});
  assert.equal(failure.state,'failed');
});
test('último registro inválido não é considerado saudável',()=>{
  const result=deriveMonitorHealth({last_success_at:'inválido'},{now});
  assert.equal(result.state,'failed');
});
