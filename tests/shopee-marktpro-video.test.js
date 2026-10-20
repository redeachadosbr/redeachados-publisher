import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreCandidate,normalizeText} from '../shopeeMarktPro.js';
import {inspect,parseConfirmPage} from '../shopeeMarktProTransport.js';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');

test('pesquisa do MarktPro reaproveitada e ordenação textual reconhece mochila',()=>{
 const q='Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios';
 assert.equal(normalizeText('Mochíla Cónstrutor'),'mochila construtor');
 assert.ok(scoreCandidate(q,'Super Mochila Construtor 3 em 1 com Ferramentas e Acessórios')>.94);
 assert.ok(scoreCandidate(q,'Cafeteira Italiana 300ml')<.2);
});
test('Google Drive transport nunca aceita URL ou ID de vídeo arbitrário',async()=>{
 await assert.rejects(inspect('http://somewhere.mp4'),/Identificador de vídeo inválido/);
 await assert.rejects(inspect('../abc1234'),/Identificador de vídeo inválido/);
 const htmlPage='<form method="GET" action="https://evil.example.com/download"><input name="id" value="abcdefghij"/></form>';
 assert.equal(parseConfirmPage(htmlPage,'https://drive.google.com/','abcdefghij'),null);
});
test('busca, prévia e seleção no backend exigem autenticação e SKU verificada',()=>{
 for(const route of ['search','stream'])
  assert.match(server,new RegExp("app\\.get\\('/api/shopee/optimizer/video/marktpro/"+route+"',mustLogin,requireWeDropAdmin"));
 assert.match(server,/app\.post\('\/api\/shopee\/optimizer\/video\/marktpro\/select'/);
 assert.match(server,/verifiedSameOrigin\(req\)/);
 assert.match(server,/checkedManualVideoIdentity\(req\)/);
 assert.match(server,/marktProCandidateFor/);
 assert.match(server,/normalizeManualVideo\(Buffer\.concat\(buffers,bytes\)\)/);
 assert.match(server,/importShopeeManualVideo/);
});
test('UI mostra candidatos e importação manual sem excesso de comandos',()=>{
 for(const id of ['optimizerVideoMarketStatus','optimizerVideoMarketResults','optimizerVideoFile',
  'optimizerVideoPreview','optimizerVideoStatus']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.doesNotMatch(html,/id="optimizerVideoRefresh"/);
 assert.match(html,/Não encontrou\? Importar arquivo manualmente/);
 assert.match(app,/optimizerVideoFindMarket\(\)/);
 assert.match(app,/queueMicrotask\(\(\)=>\$\('#optimizerVideoUpload'\)\?\.click\(\)\)/);
 assert.match(app,/Usar este vídeo/);
 assert.match(html,/\/app\.js\?v=1\.20\.26-marketpro/);
});
