// Rede Achados BR — controle global da largura do menu lateral.
(()=>{
 'use strict';
 const button=document.getElementById('sidebarCollapse');
 const sidebar=document.getElementById('appSidebar');
 if(!button||!sidebar)return;
 const KEY='redeachadosbr:sidebar-collapsed:v1';
 let collapsed=false;
 try{collapsed=window.localStorage.getItem(KEY)==='1';}catch{}
 const isDesktop=()=>window.matchMedia?window.matchMedia('(min-width:981px)').matches:true;
 // Ao recolher textos, os títulos de navegação continuam acessíveis por tooltip e leitor de tela.
 for(const node of sidebar.querySelectorAll('.nav-link,.sidebar-reports>summary')){
  const name=node.querySelector('.nav-name')?.textContent?.trim();
  if(name){
   if(!node.hasAttribute('title'))node.title=name;
   if(!node.hasAttribute('aria-label'))node.setAttribute('aria-label',name);
  }
 }
 const paint=()=>{
  document.body.classList.toggle('sidebar-collapsed',collapsed);
  button.setAttribute('aria-pressed',String(collapsed));
  const label=collapsed?'Expandir menu lateral':'Recolher menu lateral';
  button.setAttribute('aria-label',label);
  button.title=label;
 };
 button.addEventListener('click',()=>{
  if(!isDesktop())return; // No celular, o botão de menu existente controla a gaveta.
  collapsed=!collapsed;
  try{window.localStorage.setItem(KEY,collapsed?'1':'0');}catch{}
  paint();
 });
 paint();
})();
