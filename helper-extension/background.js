'use strict';

const LOCK_KEY='ra_ml_helper_single_tab_lock_v12';
const LOCK_TTL=10*60*1000;

function getLock(){
  return new Promise(resolve=>chrome.storage.local.get([LOCK_KEY],o=>resolve(o?.[LOCK_KEY]||null)));
}
function setLock(lock){
  return new Promise(resolve=>chrome.storage.local.set({[LOCK_KEY]:lock},resolve));
}
function clearLock(){
  return new Promise(resolve=>chrome.storage.local.remove([LOCK_KEY],resolve));
}

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  (async()=>{
    const tabId=sender?.tab?.id;
    if(!tabId){sendResponse({ok:false,granted:false,reason:'no-tab'});return;}
    const now=Date.now();
    if(msg?.type==='RA_RELEASE'){
      const lock=await getLock();
      if(!lock||!msg.runId||lock.runId===msg.runId)await clearLock();
      sendResponse({ok:true,released:true});return;
    }
    if(msg?.type==='RA_BEGIN'){
      const lock={runId:String(msg.runId||''),itemId:String(msg.itemId||''),tabId,updatedAt:now,expiresAt:now+LOCK_TTL};
      await setLock(lock);sendResponse({ok:true,granted:true,tabId});return;
    }
    if(msg?.type==='RA_CLAIM'){
      let lock=await getLock();
      if(lock&&Number(lock.expiresAt||0)<=now){await clearLock();lock=null;}
      if(!lock){
        lock={runId:String(msg.runId||''),itemId:String(msg.itemId||''),tabId,updatedAt:now,expiresAt:now+LOCK_TTL};
        await setLock(lock);sendResponse({ok:true,granted:true,tabId,reason:'new-lock'});return;
      }
      if(String(lock.runId)!==String(msg.runId||'')){
        sendResponse({ok:true,granted:false,reason:'other-run-active'});return;
      }
      if(Number(lock.tabId)===Number(tabId)){
        lock={...lock,updatedAt:now,expiresAt:now+LOCK_TTL};await setLock(lock);
        sendResponse({ok:true,granted:true,tabId,reason:'owner'});return;
      }
      const opener=sender?.tab?.openerTabId;
      if(opener!=null&&Number(opener)===Number(lock.tabId)){
        lock={...lock,tabId,updatedAt:now,expiresAt:now+LOCK_TTL};await setLock(lock);
        sendResponse({ok:true,granted:true,tabId,reason:'handoff'});return;
      }
      sendResponse({ok:true,granted:false,reason:'single-tab-protection'});return;
    }
    sendResponse({ok:false,granted:false,reason:'unknown-message'});
  })().catch(e=>sendResponse({ok:false,granted:false,reason:String(e?.message||e)}));
  return true;
});
