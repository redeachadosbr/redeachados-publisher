import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getStoredWeDropCostCount,parseSupabaseExactCount} from '../wedropCosts.js';

test('content-range Supabase informa a quantidade real de custos já salvos',()=>{
  assert.equal(parseSupabaseExactCount('0-0/5339'),5339);
  assert.equal(parseSupabaseExactCount('*/0'),0);
  assert.equal(parseSupabaseExactCount('0-0/*'),null);
  assert.equal(parseSupabaseExactCount(''),null);
  assert.equal(parseSupabaseExactCount(null),null);
});
test('consulta no Supabase exige loja e interpreta contagem sem baixar todos os custos',async()=>{
  const prevFetch=globalThis.fetch;
  const env={...process.env};
  process.env.SUPABASE_URL='https://demo.supabase.co';
  process.env.SUPABASE_SECRET_KEY='sb_secret_dummy';
  try{
    globalThis.fetch=async(url,options)=>{
      assert.match(url,/shopee_wedrop_costs\?shop_id=eq\.852701218/);
      assert.match(url,/limit=1/);
      assert.equal(options.headers.Prefer,'count=exact');
      assert.equal(options.headers.apikey,'sb_secret_dummy');
      return new Response('[{"supplier_sku":"ABC"}]',{
        status:200,headers:{'content-range':'0-0/5339'}
      });
    };
    assert.equal(await getStoredWeDropCostCount(852701218),5339);
    await assert.rejects(()=>getStoredWeDropCostCount(-1),/Shop ID inválido/);
  }finally{
    globalThis.fetch=prevFetch;
    process.env=env;
  }
});
test('interface apresenta arquivo salvo como principal e nova versão em seção opcional',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(html,/id="wedropStoredCatalog"/);
  assert.match(html,/id="wedropStoredName"/);
  assert.match(html,/id="wedropStoredSummary"/);
  assert.match(html,/id="wedropUseStoredBtn"/);
  assert.match(html,/id="wedropUploadDetails"/);
  assert.match(html,/Enviar nova versão do CSV/);
  assert.doesNotMatch(html,/Aguardando um CSV\. Ao selecionar/);
  assert.match(html,/id="wedropFile"/);
  const first=html.indexOf('id="wedropStoredCatalog"');
  const upload=html.indexOf('id="wedropFile"');
  assert.ok(first>=0&&upload>first,'Fonte salva deve aparecer acima do envio opcional.');
});
test('painel decide vínculo com dados persistentes da loja, não com File input',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(app,/status\.catalogStored===true&&Number\(status\.storedCosts\)>0/);
  assert.match(app,/wdNum\(status\.storedCosts\)/);
  assert.match(app,/id="wedropUseStoredBtn"|#wedropUseStoredBtn/);
  assert.match(app,/await refreshWeDropCoverage\(\)/);
  assert.match(app,/\$\('#wedropUploadDetails'\)\.open=true/);
  assert.match(server,/getStoredWeDropCostCount\(auth\.shopId\)/);
  assert.match(server,/catalogStored:storedCosts>0/);
  assert.match(server,/rawCsvStored:false/);
});
test('falha ao consultar fonte não redefine indevidamente o catálogo como vazio',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const start=app.indexOf('async function loadWeDropSourceState()');
  const end=app.indexOf("$('#wedropUseStoredBtn').onclick",start);
  const code=app.slice(start,end);
  const catchBlock=code.slice(code.indexOf('}catch(error)'));
  assert.match(catchBlock,/não foram apagados/);
  assert.doesNotMatch(catchBlock,/wedropStoredCatalog'\)\.hidden=true/);
});
