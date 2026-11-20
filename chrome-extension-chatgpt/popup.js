'use strict';
const state=document.getElementById('state');
async function refresh(){
 const result=await chrome.runtime.sendMessage({kind:'RA_STATUS_REQUEST'});
 const j=result?.job;
 const labels={active:'Em execução',paused:'Pausado',awaiting_upload:'Aguardando confirmação do Manager',done:'Concluído',error:'Pausado com erro'};
 state.textContent=j?'SKU '+j.sku+' · '+j.completed+'/9 salvas\n'+(labels[j.status]||j.status):'Nenhuma execução iniciada.';
}
document.getElementById('stop').onclick=async()=>{
 const result=await chrome.runtime.sendMessage({kind:'RA_PAUSE_ALL'});
 if(result?.ok)await refresh();else state.textContent=result?.error||'Nenhuma execução ativa.';
};
document.getElementById('open').onclick=()=>chrome.runtime.sendMessage({kind:'RA_SHOW_RUNNER'}).catch(e=>{state.textContent=e.message;});
void refresh().catch(e=>{state.textContent=e.message;});

const MANAGER='https://redeachados-shopee.onrender.com/app/otimizacao';
document.getElementById('connect').onclick=async()=>{
 const button=document.getElementById('connect');
 button.disabled=true;state.textContent='Verificando acesso ao Shopee Manager...';
 try{
  const tabs=await chrome.tabs.query({url:'https://redeachados-shopee.onrender.com/*'});
  const target=tabs.find(t=>t.active)||tabs[0];
  if(!target){
   await chrome.tabs.create({url:MANAGER,active:true});
   state.textContent='Shopee Manager aberto. A Ponte será injetada automaticamente ao carregar. Se não aparecer, abra este menu e clique novamente em Conectar.';
   return;
  }
  // Ação explicitamente solicitada pelo usuário no popup, em origem permitida.
  // Não acessar credenciais, dados pessoais ou outras abas.
  await chrome.scripting.executeScript({target:{tabId:target.id},files:['site-bridge.js']});
  await chrome.scripting.executeScript({target:{tabId:target.id},func:()=>{
   window.postMessage({kind:'RA_EXTENSION_PROBE'},location.origin);
  }});
  state.textContent='Ponte reconectada à aba do Manager. Volte à aba e clique em Gerar / continuar da imagem pendente.';
  await chrome.tabs.update(target.id,{active:true});
 }catch(e){
  state.textContent='O Chrome bloqueou a conexão: '+String(e.message||e)+'. Em chrome://extensions → Ponte ChatGPT → Detalhes → Acesso a sites, permita redeachados-shopee.onrender.com e tente novamente.';
 }finally{button.disabled=false;}
};
