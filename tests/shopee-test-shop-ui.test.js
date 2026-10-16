import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function createPage(testResponse){
  const nodes=new Map();
  function element(){
    return {
      textContent:'',hidden:false,disabled:false,dataset:{},value:'',
      children:[],
      classList:{toggle(){},remove(){},add(){}},
      replaceChildren(){this.children=[];},
      append(...children){this.children.push(...children);},
      appendChild(child){this.children.push(child);return child;},
      setAttribute(name,value){this[name]=String(value);}
    };
  }
  function node(sel){if(!nodes.has(sel))nodes.set(sel,element());return nodes.get(sel);}
  const document={
    querySelector:node,
    querySelectorAll:()=>[],
    createElement:()=>element()
  };
  let calls=0;
  const fetch=async(url)=>{
    if(url==='/api/auth-state')return new Response(JSON.stringify({locked:false,loggedIn:true}),{status:200});
    if(url==='/api/shopee/status')return new Response(JSON.stringify({
      connected:true,configured:true,mode:'live',partnerId:2047694,shopId:852701218,
      apiHost:'https://partner.shopeemobile.com',storage:{supabaseConfigured:true}
    }),{status:200});
    if(url==='/api/shopee/test-shop'){calls++;return testResponse(calls);}
    throw new Error('Requisição inesperada '+url);
  };
  const context={document,fetch,Response,Date,AbortSignal,URLSearchParams,location:{href:''},console};
  const script=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  runInNewContext(script,context,{filename:'app.js'});
  return {node,get calls(){return calls;}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('Testar loja mostra carregamento e dados reais sem abrir diagnostico',async()=>{
  let resolveResponse;
  const page=createPage(()=>new Promise(resolve=>resolveResponse=resolve));
  await settle();
  const start=page.node('#testBtn').onclick();
  assert.equal(page.node('#testBtn').disabled,true);
  assert.equal(page.node('#testBtn').textContent,'Testando...');
  assert.equal(page.node('#shopTestNotice').hidden,false);
  assert.equal(page.node('#shopTestNotice').dataset.state,'loading');
  resolveResponse(new Response(JSON.stringify({ok:true,shopId:852701218,response:{shop_name:'Rede Achados BR',region:'BR'}}),{status:200}));
  await start;
  const banner=page.node('#shopTestNotice');
  assert.equal(banner.dataset.state,'success');
  assert.match(banner.children[0].textContent,/sucesso/);
  assert.match(banner.children[1].textContent,/852701218/);
  assert.match(banner.children[1].textContent,/Rede Achados BR/);
  assert.equal(page.node('#testBtn').disabled,false);
  assert.equal(page.node('#retryTestBtn').hidden,false);
});
test('Erro da API aparece na tela e botao repetir faz nova consulta',async()=>{
  let count=0;
  const page=createPage(()=>++count===1
    ?new Response(JSON.stringify({error:'error_permission: access denied request_id:123'}),{status:400})
    :new Response(JSON.stringify({ok:true,shopId:852701218,response:{shop_name:'Rede Achados BR'}}),{status:200}));
  await settle();
  await page.node('#testBtn').onclick();
  const notice=page.node('#shopTestNotice');
  assert.equal(notice.dataset.state,'error');
  assert.match(notice.children[1].textContent,/permission|denied/);
  assert.equal(page.node('#retryTestBtn').hidden,false);
  await page.node('#retryTestBtn').onclick();
  assert.equal(notice.dataset.state,'success');
  assert.equal(page.calls,2);
  assert.equal(page.node('#testBtn').disabled,false);
});
