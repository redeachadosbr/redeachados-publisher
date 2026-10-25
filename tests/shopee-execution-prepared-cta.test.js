import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/optimizer-execution-progress.css',import.meta.url),'utf8');
test('CTA real aparece dentro do cartão de progresso de SKU preparada',()=>{
 const card=html.slice(html.indexOf('class="optimizer-exec-progress-card"'),html.indexOf('id="optimizerExecutionIssue"'));
 assert.match(card,/id="optimizerExecutionNextActionTitle"/);
 assert.match(card,/id="optimizerExecutionNextActionDescription"/);
 assert.match(card,/id="optimizerExecutionLaunch"/);
 assert(card.indexOf('id="optimizerExecutionLaunch"')<card.indexOf('id="optimizerExecutionBar"'));
 assert(!html.slice(html.indexOf('id="optimizerExecutionTracker"'),html.indexOf('class="optimizer-exec-product"')).includes('id="optimizerExecutionLaunch"'));
 assert.match(css,/optimizer-exec-resume-bar\[hidden\]/);
});
test('sem autorização a barra diz o motivo e não chama API automaticamente',()=>{
 assert.match(js,/0% significa aguardando sua autorização/);
 assert.match(js,/Falta conferir o desconto da etapa 08/);
 assert.match(js,/Execução bloqueada — corrigir pendências/);
 assert.match(js,/resumeBar\.hidden=!\['prepared','blocked'\]\.includes\(progress\.state\)/);
 assert.match(js,/optimizerExecutionLaunch'\)\?\.addEventListener\?\.\('click',\(\)=>void optimizerExecuteApproved\(false\)\)/);
 assert.match(js,/confirmati[oó]n:'EXECUTAR '\+p\.sku/);
});
