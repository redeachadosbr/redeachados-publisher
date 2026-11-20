import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/optimizer-image-studio.js',import.meta.url),'utf8');
test('toolbar conserva botão e download ao mover painel avançado fora do DOM',()=>{
 const elements=new Map();
 class Node{
  constructor(){this.children=[];this.dataset={};this.classList={add(){}};this.listeners={};}
  append(...nodes){for(const node of nodes){if(node.parent)node.parent.children=node.parent.children.filter(x=>x!==node);node.parent=this;this.children.push(node);}}
  setAttribute(){}
  addEventListener(name,fn){this.listeners[name]=fn;}
  querySelector(selector){const item=elements.get(selector);for(let n=item;n;n=n.parent)if(n===this)return item;return null;}
 }
 const body=new Node();
 const make=(selector,parent=body)=>{const node=new Node();elements.set(selector,node);parent.append(node);return node;};
 const panel=make('#optimizerImagesPanel'),layout=make('.optimizer-commercial-layout',panel);
 const main=make('.optimizer-commercial-main',layout),aside=make('.optimizer-commercial-rework',layout);
 make('.optimizer-commercial-gallery-section',layout);make('.optimizer-commercial-heading',main);
 const auto=make('#optimizerChatgptAuto',main),reset=make('#optimizerChatgptStartOver',main),download=make('#optimizerBridgeDownload',main);
 make('#optimizerImageCorrectionSlot',aside).value='1';make('.optimizer-image-rework',aside);
 let clicks=0;reset.addEventListener('click',()=>clicks++);
 const context=vm.createContext({document:{querySelector:s=>body.querySelector(s),createElement:()=>new Node()},window:{}});
 vm.runInContext(source.slice(0,source.indexOf(" const workspace=el("))+'globalThis.toolbar=toolbar;})();',context);
 assert.equal(reset.parent,context.toolbar);
 assert.equal(download.parent,context.toolbar);
 assert.equal(auto.parent,context.toolbar);
 reset.listeners.click();assert.equal(clicks,1,'o listener original permanece conectado');
});
