import fs from 'node:fs';
import path from 'node:path';

function envText(name){return String(process.env[name]||'').trim();}

function supabaseConfig(){
  const url=envText('SUPABASE_URL').replace(/\/$/,'');
  const key=envText('SUPABASE_SECRET_KEY')||envText('SUPABASE_SERVICE_ROLE_KEY');
  return {url,key,configured:Boolean(url&&key)};
}

function headers(cfg,prefer=''){
  const h={apikey:cfg.key,'Content-Type':'application/json',Accept:'application/json'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(cfg.key))h.Authorization=`Bearer ${cfg.key}`;
  if(prefer)h.Prefer=prefer;
  return h;
}

async function request(url,options,label){
  const r=await fetch(url,options);
  const text=await r.text();
  if(!r.ok)throw new Error(`${label} HTTP ${r.status}${text?': '+text.slice(0,350):''}`);
  if(!text)return null;
  try{return JSON.parse(text);}catch{return text;}
}

export function createAuthStore({localFile}={}){
  const cfg=supabaseConfig();
  const file=localFile||path.join(process.cwd(),'data','shopee-auth.json');

  function loadLocal(){
    try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}
  }
  function saveLocal(auth){
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,JSON.stringify(auth,null,2));
  }

  async function loadRemote(){
    if(!cfg.configured)return null;
    const url=`${cfg.url}/rest/v1/shopee_auth?id=eq.primary&select=*`;
    const rows=await request(url,{headers:headers(cfg)},'Supabase shopee_auth leitura');
    if(!Array.isArray(rows)||!rows.length)return null;
    const row=rows[0];
    return {
      shopId:Number(row.shop_id||0),
      shopIds:Array.isArray(row.shop_ids)?row.shop_ids.map(Number).filter(Boolean):[],
      accessToken:String(row.access_token||''),
      refreshToken:String(row.refresh_token||''),
      expiresAt:Number(row.expires_at||0),
      connectedAt:row.connected_at||null,
      lastRefreshAt:row.last_refresh_at||null,
      mode:row.mode||'sandbox',
      partnerId:Number(row.partner_id||0)
    };
  }

  async function saveRemote(auth){
    if(!cfg.configured)return false;
    const row={
      id:'primary',
      shop_id:Number(auth.shopId||0),
      shop_ids:Array.isArray(auth.shopIds)?auth.shopIds:[],
      access_token:String(auth.accessToken||''),
      refresh_token:String(auth.refreshToken||''),
      expires_at:Number(auth.expiresAt||0),
      connected_at:auth.connectedAt||new Date().toISOString(),
      last_refresh_at:auth.lastRefreshAt||null,
      mode:String(auth.mode||'sandbox'),
      partner_id:Number(auth.partnerId||0),
      updated_at:new Date().toISOString()
    };
    const url=`${cfg.url}/rest/v1/shopee_auth?on_conflict=id`;
    await request(url,{
      method:'POST',
      headers:headers(cfg,'resolution=merge-duplicates,return=minimal'),
      body:JSON.stringify([row])
    },'Supabase shopee_auth gravação');
    return true;
  }

  return {
    configured:cfg.configured,
    async load(){
      if(cfg.configured){
        const remote=await loadRemote();
        if(remote)return remote;
        const local=loadLocal();
        if(local){
          await saveRemote(local);
          return local;
        }
        return null;
      }
      return loadLocal();
    },
    async save(auth){
      saveLocal(auth);
      if(cfg.configured)await saveRemote(auth);
      return auth;
    },
    status(){return {backend:cfg.configured?'supabase+local-backup':'local-ephemeral',supabaseConfigured:cfg.configured};}
  };
}
