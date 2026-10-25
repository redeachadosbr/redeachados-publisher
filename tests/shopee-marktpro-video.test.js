import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreCandidate,normalizeText,load,search,MARKTPRO_GALLERY_URL} from '../shopeeMarktPro.js';
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

test('catalogo real informado pelo lojista usa packvideoswedrop e encontra a bicicleta 2392',async()=>{
 const originalFetch=globalThis.fetch;
 const requests=[];
 try{
  globalThis.fetch=async(url)=>{
   const target=String(url);requests.push(target);
   if(target===MARKTPRO_GALLERY_URL)return {
    ok:true,status:200,url:target,text:async()=>'<html><script type="module" src="/assets/index-2026.js"></script></html>'
   };
   if(target===MARKTPRO_GALLERY_URL+'assets/index-2026.js')return {
    ok:true,status:200,url:target,
    text:async()=>'[{"id":"1BxVideoDriveId_EXEMPLO_12345678","title":"Bicicleta Infantil Moto Cross Aro 16 - Rosa","duration_ms":27000,"category":"Infantil & Brinquedos"},{"id":"1BxVideoDriveId_Cozinha_12345678","title":"Cafeteira Italiana 300 ml","duration_ms":19000}]'
   };
   throw Error('Consulta fora do dominio autorizado: '+target);
  };
  assert.equal(MARKTPRO_GALLERY_URL,'https://packvideoswedrop.lovable.app/');
  const catalog=await load(true);
  assert.equal(catalog.records.length,2);
  const found=await search('Bicicleta Infantil Moto Cross Aro 16 - Rosa');
  assert.equal(found.candidates.length,1);
  assert.equal(found.candidates[0].title,'Bicicleta Infantil Moto Cross Aro 16 - Rosa');
  assert.equal(found.inventoryCount,2);
  assert(requests.every(v=>v.startsWith(MARKTPRO_GALLERY_URL)));
  assert(!requests.some(v=>v.includes('drive-vid-gallery.lovable.app')));
 }finally{globalThis.fetch=originalFetch;}
});
test('URL na interface abre apenas a galeria WeDrop correta',()=>{
 assert.match(app,/https:\/\/packvideoswedrop\.lovable\.app\//);
 assert.doesNotMatch(app,/https:\/\/drive-vid-gallery\.lovable\.app\//);
 assert.match(server,/marktProCandidateFor/);
});
