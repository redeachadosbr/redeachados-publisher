import {projectOrder,buildOrderEvents,sortPending,actionable} from './orderAlerts.js';
import {deriveMonitorHealth} from './monitorHealth.js';

function envText(k){return String(process.env[k]||'').trim();}
function config(){
  const url=envText('SUPABASE_URL').replace(/\/$/,'');
  const key=envText('SUPABASE_SECRET_KEY')||envText('SUPABASE_SERVICE_ROLE_KEY');
  return {url,key,configured:Boolean(url&&key)};
}
function requestHeaders(key,prefer){
  const h={apikey:key,Accept:'application/json','Content-Type':'application/json'};
  if(/^eyJ[A-Za-z0-9_-]*\./.test(key))h.Authorization='Bearer '+key;
  if(prefer)h.Prefer=prefer;
  return h;
}
async function db(path,{method='GET',body,prefer}={}){
  const c=config();
  if(!c.configured)throw new Error('Supabase não configurado: monitor desativado para evitar perda de histórico.');
  const response=await fetch(c.url+'/rest/v1/'+path,{
    method,headers:requestHeaders(c.key,prefer),
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error('Banco do monitor Shopee HTTP '+response.status);
  const raw=await response.text();
  return raw?JSON.parse(raw):[];
}
async function readRun(shopId){
  const rows=await db('shopee_monitor_runs?shop_id=eq.'+shopId+'&select=*&limit=1');
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function writeRun(shopId,patch){
  const prior=await readRun(shopId)||{};
  const row={...prior,...patch,shop_id:shopId,updated_at:new Date().toISOString()};
  await db('shopee_monitor_runs?on_conflict=shop_id',{
    method:'POST',body:[row],prefer:'resolution=merge-duplicates,return=minimal'
  });
}
function limit(value,defaultValue=50,max=100){return Math.min(max,Math.max(1,Number(value)||defaultValue));}
async function readLatest(shopId){
  return db('shopee_order_watch?shop_id=eq.'+shopId+'&select=*&order=last_seen_at.desc&limit=1000');
}
async function readPending(shopId){
  const blocked='UNPAID,SHIPPED,TO_CONFIRM_RECEIVE,COMPLETED,DELIVERED,CANCELLED,IN_CANCEL';
  return db('shopee_order_watch?shop_id=eq.'+shopId+
    '&order_status=not.in.('+blocked+')&select=*&order=ship_by_date.asc.nullslast&limit=500');
}
async function readRecentAlerts(shopId,n=80){
  return db('shopee_order_alerts?shop_id=eq.'+shopId+
    '&select=alert_key,order_sn,event_type,severity,title,message,ship_by_date,created_at,read_at,telegram_delivered_at,telegram_error'+
    '&order=created_at.desc&limit='+limit(n,80,200));
}
async function writeSnapshot(shopId,current){
  const row={
    shop_id:shopId,order_sn:current.order_sn,order_status:current.order_status,
    create_time:current.create_time,pay_time:current.pay_time,
    ship_by_date:current.ship_by_date,pickup_done_time:current.pickup_done_time,
    last_seen_at:new Date().toISOString()
  };
  await db('shopee_order_watch?on_conflict=shop_id,order_sn',{method:'POST',body:[row],prefer:'resolution=merge-duplicates,return=minimal'});
}
async function persistAlert(shopId,event){
  const row={...event,alert_key:shopId+':'+event.alert_key,shop_id:shopId};
  const saved=await db('shopee_order_alerts?on_conflict=alert_key',{method:'POST',body:[row],prefer:'resolution=ignore-duplicates,return=representation'});
  return Array.isArray(saved)&&saved.length===1?saved[0]:null;
}
async function sendTelegram(event){
  // Somente painel/navegador por padrão. Um canal externo nunca é habilitado implicitamente.
  if(envText('SHOPEE_ALERT_CHANNEL')!=='telegram')return {configured:false};
  const token=envText('SHOPEE_ALERT_TELEGRAM_BOT_TOKEN');
  const chatId=envText('SHOPEE_ALERT_TELEGRAM_CHAT_ID');
  if(!token||!chatId)return {configured:false};
  const message='📦 REDE ACHADOS BR — SHOPEE\n'+event.title+'\n'+event.message+
    '\nConfira o pedido na Central do Vendedor.';
  try{
    const r=await fetch('https://api.telegram.org/bot'+encodeURIComponent(token)+'/sendMessage',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:chatId,text:message,disable_web_page_preview:true}),
      signal:AbortSignal.timeout(8000)
    });
    if(!r.ok)throw Error('HTTP '+r.status);
    return {configured:true,delivered:true};
  }catch{
    return {configured:true,delivered:false,error:'Falha de envio Telegram; verifique bot e chat ID nas variáveis do Render.'};
  }
}
async function updateDelivery(rowKey,outcome){
  if(!outcome.configured)return;
  await db('shopee_order_alerts?alert_key=eq.'+encodeURIComponent(rowKey),{
    method:'PATCH',
    body:outcome.delivered?{telegram_delivered_at:new Date().toISOString(),telegram_error:null}:{telegram_error:outcome.error},
    prefer:'return=minimal'
  });
}
async function collectLists(cfg,auth,callApi,bootstrap){
  const now=Math.floor(Date.now()/1000);
  const queries=bootstrap
    ?[{time_range_field:'create_time',time_from:now-15*86400,time_to:now}]
    :[
      {time_range_field:'update_time',time_from:now-2*86400,time_to:now},
      {time_range_field:'create_time',time_from:now-2*86400,time_to:now}
    ];
  const rows=new Map();
  for(const q of queries){
    let cursor='';
    for(let page=0;page<30;page++){
      const data=await callApi(cfg,{
        path:'/api/v2/order/get_order_list',
        accessToken:auth.accessToken,shopId:auth.shopId,
        query:{...q,page_size:100,cursor,response_optional_fields:'order_status'}
      });
      const response=data.response||{};
      for(const x of response.order_list||[]){
        const sn=String(x.order_sn||'');
        if(sn)rows.set(sn,x);
      }
      if(!response.more)break;
      if(!response.next_cursor||String(response.next_cursor)===cursor)
        throw Error('Paginação de pedidos Shopee não avançou.');
      if(page===29)throw Error('Limite de 3000 pedidos por consulta; sincronização incompleta, ajuste a janela.');
      cursor=String(response.next_cursor);
    }
  }
  return rows;
}
export function createShopeeOrderMonitor({getAuth,callApi,intervalMs=300000}){
  let working=false;
  let previousRun=null;
  let successfulRun=null;
  let lastError=null;
  let ordersScanned=0;
  let alertsCreated=0;
  let interval=null;
  const enabled=envText('SHOPEE_ORDER_MONITOR_ENABLED')!=='false';
  const ready=()=>enabled&&config().configured;
  async function check(){
    if(!ready())throw Error('Monitor desativado ou Supabase indisponível.');
    if(working)return {busy:true,lastSuccessAt:successfulRun};
    working=true;
    previousRun=new Date().toISOString();
    let shopId=null;
    try{
      const {cfg,auth}=await getAuth();
      if(cfg.mode!=='live')throw Error('O monitor exige conexão Shopee LIVE.');
      shopId=Number(auth.shopId);
      await writeRun(shopId,{last_started_at:previousRun,last_error:null});
      const existing=await readLatest(shopId);
      const snapshot=new Map(existing.map(o=>[o.order_sn,o]));
      const bootstrap=existing.length===0;
      const current=await collectLists(cfg,auth,callApi,bootstrap);
      // Reconsultar os pendentes antigos mesmo sem update recente, para evitar
      // não detectar mudanças e permitir alertas por passagem de tempo.
      for(const saved of await readPending(shopId)){
        if(saved.order_sn&&!current.has(saved.order_sn))
          current.set(saved.order_sn,{order_sn:saved.order_sn,order_status:saved.order_status});
        if(!snapshot.has(saved.order_sn))snapshot.set(saved.order_sn,saved);
      }
      const entries=[...current.values()];
      let created=0;
      const nowSeconds=Math.floor(Date.now()/1000);
      for(let i=0;i<entries.length;i+=50){
        const batch=entries.slice(i,i+50);
        const detail=await callApi(cfg,{
          path:'/api/v2/order/get_order_detail',
          accessToken:auth.accessToken,shopId:auth.shopId,
          query:{order_sn_list:batch.map(x=>x.order_sn).join(',')}
        });
        const detailMap=new Map((detail.response?.order_list||[]).map(x=>[String(x.order_sn),x]));
        for(const item of batch){
          const detailed=detailMap.get(String(item.order_sn));
          if(!detailed)throw Error('Sem detalhes Shopee para pedido '+item.order_sn+'. Monitoramento parcial interrompido.');
          const order=projectOrder(detailed,item);
          const prior=snapshot.get(order.order_sn)||null;
          // Gerar e deduplicar eventos antes da gravação da foto atual.
          const events=buildOrderEvents(prior,order,{nowSeconds,bootstrap});
          for(const e of events){
            const alert=await persistAlert(shopId,e);
            if(!alert)continue;
            created++;
            const delivery=await sendTelegram(alert);
            await updateDelivery(alert.alert_key,delivery);
          }
          await writeSnapshot(shopId,order);
        }
      }
      ordersScanned=entries.length;
      alertsCreated=created;
      successfulRun=new Date().toISOString();
      await writeRun(shopId,{
        last_success_at:successfulRun,last_error:null,last_error_at:null,
        scanned_count:ordersScanned,new_alerts_count:created
      });
      lastError=null;
      return {ok:true,scanned:ordersScanned,newAlerts:created,lastSuccessAt:successfulRun};
    }catch(error){
      lastError=String(error.message||error).slice(0,250);
      if(shopId){
        try{await writeRun(shopId,{last_error:lastError,last_error_at:new Date().toISOString()});}
        catch(dbError){console.warn('Shopee heartbeat falhou:',String(dbError.message||dbError).slice(0,100));}
      }
      throw error;
    }finally{working=false;}
  }
  function status(){
    return {
      enabled:ready(),working,intervalMinutes:Math.round(intervalMs/60000),
      lastAttemptAt:previousRun,lastSuccessAt:successfulRun,lastError,
      scannedInLastRun:ordersScanned,newAlertsLastRun:alertsCreated,
      telegramConfigured:envText('SHOPEE_ALERT_CHANNEL')==='telegram'&&Boolean(envText('SHOPEE_ALERT_TELEGRAM_BOT_TOKEN')&&envText('SHOPEE_ALERT_TELEGRAM_CHAT_ID')),
      alertChannel:envText('SHOPEE_ALERT_CHANNEL')==='telegram'?'telegram':'panel-browser',
      deliveryNote:'Avisos limitados ao painel e navegador aberto. Monitoramento periódico depende de o Render estar ativo.'
    };
  }
  async function dashboard(){
    const {auth}=await getAuth();
    const shopId=Number(auth.shopId);
    const [pending,alerts,run]=await Promise.all([readPending(shopId),readRecentAlerts(shopId),readRun(shopId)]);
    const health=deriveMonitorHealth(run,{expectedIntervalMinutes:Math.round(intervalMs/60000)});
    const rows=sortPending(pending.map(p=>({
      order_sn:p.order_sn,order_status:p.order_status,create_time:p.create_time,
      ship_by_date:p.ship_by_date,pay_time:p.pay_time,pickup_done_time:p.pickup_done_time
    })));
    const state=status();
    return {status:{
      ...state,
      lastSuccessAt:health.lastSuccessAt||state.lastSuccessAt,
      lastAttemptAt:health.lastAttemptAt||state.lastAttemptAt,
      health
    },pending:rows,alerts,unread:alerts.filter(a=>!a.read_at).length};
  }
  async function markRead(shopId,alertKey){
    if(typeof alertKey!=='string'||alertKey.length>200||!alertKey.startsWith(shopId+':'))
      throw Error('Alerta inválido.');
    await db('shopee_order_alerts?alert_key=eq.'+encodeURIComponent(alertKey)+'&shop_id=eq.'+shopId,{
      method:'PATCH',body:{read_at:new Date().toISOString()},prefer:'return=minimal'
    });
    return {ok:true};
  }
  function start(){
    if(interval||!ready())return;
    const trigger=()=>check().catch(err=>console.warn('Shopee monitor:',String(err.message||err).slice(0,150)));
    // Execução após o servidor iniciar; prossegue periodicamente enquanto ativo.
    setTimeout(trigger,12000).unref?.();
    interval=setInterval(trigger,intervalMs);
    interval.unref?.();
  }
  return {check,dashboard,markRead,start,status};
}
