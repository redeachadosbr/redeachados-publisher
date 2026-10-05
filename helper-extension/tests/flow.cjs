// Browser regression checks against synthetic pages based on the supplied recording.
// No request is sent to Mercado Livre: every page is fulfilled locally.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch (_) { ({chromium} = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright'))); }
const EXT = path.resolve(__dirname, '..');
const ORIGIN = 'https://vendedores.mercadolivre.com.br';
const PUBLISHER_ORIGIN = 'https://redeachados-ml-publisher.onrender.com';
const ITEM = 'MLB7218285156';
const CATALOG = '/publicar/catalogo/' + ITEM;
const BACK = '/anuncios/MLBU4369209785/modificar/bomni/variation/test';
const KEY = 'ra_ml_verify_product_auto_v4';
const css = '<style>body{font:18px Arial;margin:24px}article{padding:22px;margin:10px;border:1px solid #ccc}button,a,[onclick]{padding:12px;display:inline-block;cursor:pointer}textarea{width:500px;height:110px}#modal{position:fixed;inset:100px;background:white;border:3px solid #333;padding:40px;z-index:50}[hidden]{display:none!important}</style>';
function list(options) {
  const open = options.newTab ? `window.open('${CATALOG}', '_blank', 'noopener')` : `location.href='${CATALOG}'`;
  const verify = options.plainSpan ? '<div class="action"><span>Verificar produto</span></div>' : `<a target="_blank" href="${CATALOG}"><span>Verificar produto</span></a>`;
  const target = options.wrongOnly ? '' : `<article id="target"><section><div data-testid="item-number">#7218285156</div><div>SKU DF2524</div><h2>Mochila Infantil Blue Friend 13 Litros Escolar Acolchoada</h2></section><section class="status">${verify}</section></article>`;
  return css + `<h1>Anúncios</h1><input type="search" aria-label="Buscar anúncios" value="${ITEM}"><main><article id="wrong"><div>#72182851560</div><div>SKU DF25240</div><button>Verificar produto</button></article>${target}</main><script>
  document.querySelector('#wrong button').onclick=()=>observeTestEvent('WRONG_ITEM');
  const v=document.querySelector('#target .action, #target a');
  if(v)v.onclick=async e=>{e.preventDefault();await observeTestEvent('verify');${open}};
  </script>`;
}
function catalog(options) {
  const modalRole = options.unsemanticModal ? '' : 'role="dialog" aria-modal="true"';
  return css + `<h2>Mochila Infantil Blue Friend 13 Litros Escolar Acolchoada</h2><main id="choices">
  <h1>Verifique se o seu produto corresponde a algum do catálogo</h1><p>Produtos de catálogo sugeridos</p>
  <label><input type="radio" checked>PRODUTO SUGERIDO</label>
  <div style="height:1800px">Outros produtos</div><a id="decline">Não encontro meu produto</a><button id="accept">Continuar</button></main>
  <section id="differences" hidden><h1>Conte-nos em que o seu produto se diferencia do que sugerimos no catálogo</h1><h2>Digite as principais diferenças</h2><textarea></textarea><button id="send" disabled>Enviar</button></section>
  <script>
  const choices=document.getElementById('choices'), differences=document.getElementById('differences');
  document.getElementById('accept').onclick=()=>observeTestEvent('JOIN_CATALOG');
  document.getElementById('decline').onclick=async()=>{
    await observeTestEvent('decline');
    const modal=document.createElement('div'); modal.id='modal'; ${modalRole ? "modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');" : ''}
    modal.innerHTML='<h2>Não encontrou seu produto?</h2><p>Se continuar, você seguirá vendendo sem competir.</p><button id="modalContinue">Continuar</button><button>Buscar novamente</button>';
    document.body.appendChild(modal);
    document.getElementById('modalContinue').onclick=async()=>{await observeTestEvent('modal-continue');modal.remove();choices.hidden=true;differences.hidden=false;};
  };
  const field=document.querySelector('textarea'), send=document.getElementById('send');
  field.addEventListener('input',()=>{send.disabled=field.value.length<12;observeTestEvent('input');});
  send.onclick=async()=>{
    await observeTestEvent('send');await observeTestEvent('text:'+field.value);send.disabled=true;
    ${options.noResponse ? '' : `setTimeout(()=>{
      differences.hidden=true;
      const result=document.createElement('section');result.innerHTML='<h1>Não foi possível verificar seu produto de catálogo</h1><p>${options.genericError ? 'Ocorreu um problema. Tente novamente mais tarde.' : 'Como você não confirmou um produto de catálogo, no momento não pode competir para ser a primeira opção de compra. Você continuará vendendo com seu anúncio tradicional normalmente.'}</p><button id="eligible">Ir para elegíveis para competir</button><button id="back">Ir para anúncios</button>';
      document.body.appendChild(result);document.getElementById('eligible').onclick=()=>observeTestEvent('WRONG_RETURN');
      document.getElementById('back').onclick=async()=>{await observeTestEvent('return');location.href='${BACK}'};
    },${options.responseDelay || 1800});`}
  };
  </script>`;
}
async function until(fn, timeout = 25000) {
  const deadline = Date.now() + timeout;
  do { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
  throw new Error('Timed out waiting for expected browser state');
}
async function setup(options = {}) {
  const events = [], pageErrors = [];
  const context = await chromium.launchPersistentContext('', {channel:'chromium',headless:true,...(process.env.TEST_BROWSER_EXECUTABLE?{executablePath:process.env.TEST_BROWSER_EXECUTABLE}:{}),args:['--no-sandbox',`--disable-extensions-except=${EXT}`,`--load-extension=${EXT}`]});
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await context.exposeBinding('observeTestEvent', (_, event) => events.push(event));
  context.on('page', page => page.on('pageerror', e => pageErrors.push(e.message)));
  await context.route('**/*', route => {
    const u=new URL(route.request().url());
    if(u.origin===PUBLISHER_ORIGIN){
      if(u.pathname==='/api/catalog-guard/product-verification/confirm')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,confirmed:events.includes('return'),status:'active',catalogListing:false,verifyProductPending:!events.includes('return')})});
      return route.fulfill({status:200,contentType:'text/html',body:'<h1>Publisher local fixture</h1>'});
    }
    if(u.origin!==ORIGIN)return route.abort();
    let html=u.pathname===CATALOG?catalog(options):u.pathname===BACK?css+'<h1>Anúncio tradicional</h1><h2>Mochila Infantil Blue Friend 13 Litros Escolar Acolchoada</h2><p>SKU DF2524</p><p>Qualidade 75 · 2 objetivos para alcançar</p>':list(options);
    return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
  });
  const marker=new URLSearchParams({'ra-auto-verify-product':'1','ra-run':'test-'+Date.now()+'-'+Math.random(),'ra-item':ITEM,'ra-sku':'DF2524','ra-up':'MLBU4369209785','ra-title':'Mochila Infantil Blue Friend 13 Litros Escolar Acolchoada'});
  const publisherPage=await context.newPage();await publisherPage.goto(PUBLISHER_ORIGIN);
  const page=await context.newPage();
  const start=ORIGIN+'/anuncios?search='+ITEM+'#'+marker;
  const state=()=>worker.evaluate(async key=>(await chrome.storage.local.get(key))[key],KEY);
  await page.goto(start);
  return {context,worker,page,start,state,events,pageErrors};
}
function assertNoWrongActions(env) {
  assert.equal(env.events.filter(x=>/^(WRONG|JOIN)/.test(x)).length,0,env.events.join(', '));
  assert.deepEqual(env.pageErrors,[]);
}
test('full recorded sequence, non-semantic verify control, modal-only Continue and confirmed return', async t=>{
  const env=await setup({plainSpan:true}); t.after(()=>env.context.close());
  await until(async()=>(await env.state())?.status==='finished');
  assert.deepEqual(env.events.filter(x=>!x.startsWith('text:')&&x!=='input'),['verify','decline','modal-continue','send','return']);
  assert.match(env.events.find(x=>x.startsWith('text:')),/anúncio tradicional/);
  assertNoWrongActions(env);
});
test('native target=_blank anchor and non-semantic modal complete without duplicate clicks', async t=>{
  const env=await setup({unsemanticModal:true});t.after(()=>env.context.close());
  await until(async()=>(await env.state())?.status==='finished');
  for(const action of ['verify','decline','modal-continue','send','return'])assert.equal(env.events.filter(x=>x===action).length,1);
  assert.equal(env.context.pages().length,3); // Initial blank + Publisher + work tab.
  assertNoWrongActions(env);
});
test('new tab without opener takes ownership only for the expected catalog MLB', async t=>{
  const env=await setup({plainSpan:true,newTab:true});t.after(()=>env.context.close());
  await until(async()=>(await env.state())?.status==='finished');
  assert.ok((await env.state()).events.some(x=>x.event==='tab-handoff'));
  for(const action of ['verify','decline','modal-continue','send','return'])assert.equal(env.events.filter(x=>x===action).length,1);
  assertNoWrongActions(env);
});
test('search URL, helper banner and partial SKU/MLB do not authorize another listing', async t=>{
  const env=await setup({wrongOnly:true});t.after(()=>env.context.close());
  await until(async()=>(await env.state())?.status==='running');
  await new Promise(resolve=>setTimeout(resolve,2800));
  assert.deepEqual(env.events,[]);assert.deepEqual((await env.state()).actions,{});
  assertNoWrongActions(env);
});
test('sending without ML response is never treated as success, including after reload', async t=>{
  const env=await setup({noResponse:true});t.after(()=>env.context.close());
  await until(()=>env.events.includes('send'));
  await env.page.reload();await new Promise(resolve=>setTimeout(resolve,2800));
  assert.equal(env.events.filter(x=>x==='send').length,1);
  assert.equal((await env.state()).status,'running');assert.equal((await env.state()).responseConfirmed,false);
  assertNoWrongActions(env);
});
test('generic catalog error cannot be mistaken for confirmation of traditional sale', async t=>{
  const env=await setup({genericError:true});t.after(()=>env.context.close());
  await until(()=>env.events.includes('send'));await new Promise(resolve=>setTimeout(resolve,3200));
  assert.equal(env.events.includes('return'),false);assert.equal((await env.state()).responseConfirmed,false);
  assertNoWrongActions(env);
});
test('stop after sending prevents further clicks even when the response arrives', async t=>{
  const env=await setup({responseDelay:4000});t.after(()=>env.context.close());
  await until(()=>env.events.includes('send'));
  await env.page.locator('#ra-ml-helper-banner button').click();
  await until(async()=>(await env.state()).status==='stopped');
  await new Promise(resolve=>setTimeout(resolve,4700));
  assert.equal(env.events.includes('return'),false);assertNoWrongActions(env);
});
test('duplicate tabs cannot repeat a run; finished state survives reload', async t=>{
  const env=await setup({plainSpan:true});t.after(()=>env.context.close());
  const duplicate=await env.context.newPage();await duplicate.goto(env.start);
  await until(async()=>(await env.state())?.status==='finished');
  await env.page.reload();await new Promise(resolve=>setTimeout(resolve,1600));
  for(const action of ['verify','decline','modal-continue','send','return'])assert.equal(env.events.filter(x=>x===action).length,1);
  assert.equal((await env.state()).status,'finished');assertNoWrongActions(env);
});
