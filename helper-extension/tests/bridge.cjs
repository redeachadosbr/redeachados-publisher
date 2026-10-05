const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../publisher-bridge.js'),'utf8');
function harness(fetch){
  let listener;const calls=[];
  const context=vm.createContext({console,location:{origin:'https://redeachados-ml-publisher.onrender.com'},AbortController,setTimeout,clearTimeout,
    fetch:async(...args)=>{calls.push(args);return fetch(...args);},chrome:{runtime:{id:'test-extension',onMessage:{addListener:fn=>listener=fn}}}});
  context.window=context;context.top=context;vm.runInContext(code,context);
  const request=(msg={type:'RA_CONFIRM_PRODUCT',itemId:'MLB7218285156'},sender={id:'test-extension'})=>new Promise(resolve=>{const keep=listener(msg,sender,resolve);if(keep!==true)resolve(undefined);});
  return {request,calls};
}
function response(data,{status=200,type='application/json'}={}){return {ok:status>=200&&status<300,status,headers:{get:()=>type},json:async()=>data};}
test('bridge uses only the authenticated same-origin confirmation endpoint and expected MLB',async()=>{
  const h=harness(async()=>response({ok:true,confirmed:true,status:'active',catalogListing:false,verifyProductPending:false}));
  const result=await h.request();
  assert.equal(result.confirmed,true);assert.equal(result.itemId,'MLB7218285156');
  assert.equal(h.calls.length,1);const [url,options]=h.calls[0];
  assert.equal(url,'/api/catalog-guard/product-verification/confirm');assert.equal(options.credentials,'same-origin');
  assert.deepEqual(JSON.parse(options.body),{itemId:'MLB7218285156'});
});
test('bridge rejects foreign senders and malformed item IDs without an API request',async()=>{
  const h=harness(()=>{throw Error('Must not call');});
  await h.request(undefined,{id:'another-extension'});
  const invalid=await h.request({type:'RA_CONFIRM_PRODUCT',itemId:'https://arbitrary.example'});
  assert.equal(invalid.ok,false);assert.equal(h.calls.length,0);
});
test('expired Publisher session and HTML login page cannot confirm completion',async()=>{
  for(const options of [{status:401},{status:403},{status:200,type:'text/html'}]){
    const h=harness(async()=>response({},options));const result=await h.request();
    assert.equal(result.ok,false);assert.notEqual(result.confirmed,true);
  }
});
test('API failure and network errors are returned as unconfirmed retryable failures',async()=>{
  for(const operation of [async()=>response({error:'Mercado Livre indisponível'},{status:502}),async()=>{throw Error('Network error');}]){
    const result=await harness(operation).request();assert.equal(result.ok,false);assert.notEqual(result.confirmed,true);
  }
});
