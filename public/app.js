const $=s=>document.querySelector(s);
async function json(url,opt={}){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d;}
async function boot(){
  const a=await json('/api/auth-state');
  if(a.locked&&!a.loggedIn){$('#login').classList.remove('hidden');return;}
  $('#app').classList.remove('hidden');loadStatus();
}
async function loadStatus(){
  try{
    const s=await json('/api/shopee/status');
    $('#connTitle').textContent=s.connected?'Shopee conectada':'Shopee ainda não conectada';
    $('#connMeta').textContent=`Ambiente: ${s.mode} · Partner ID: ${s.partnerId||'-'} · Shop ID: ${s.shopId||'-'}`;
  }catch(e){$('#connTitle').textContent='Erro de configuração';$('#connMeta').textContent=e.message;}
}
$('#loginBtn').onclick=async()=>{try{await json('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#password').value})});$('#login').classList.add('hidden');$('#app').classList.remove('hidden');loadStatus();}catch(e){$('#loginMsg').textContent=e.message;}};
$('#connectBtn').onclick=()=>location.href='/auth/shopee/start';
$('#testBtn').onclick=async()=>{try{$('#output').textContent=JSON.stringify(await json('/api/shopee/test-shop'),null,2);}catch(e){$('#output').textContent=e.message;}};
$('#refreshBtn').onclick=async()=>{try{$('#output').textContent=JSON.stringify(await json('/api/shopee/refresh',{method:'POST'}),null,2);loadStatus();}catch(e){$('#output').textContent=e.message;}};
boot();