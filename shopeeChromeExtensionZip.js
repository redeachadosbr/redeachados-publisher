// ZIP instalado manualmente pelo Chrome (manifesto MV3), sem dependências externas.
import {readFileSync} from 'node:fs';
const folder=new URL('./chrome-extension-shopee/',import.meta.url);
const entries=['manifest.json','manager.js','background.js','visible-offers.js','README.md'];
function crc32(buf){
 let crc=0xffffffff;
 for(const byte of buf){
  crc^=byte;
  for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
export function chromeExtensionZip(){
 const locals=[],central=[];
 let offset=0;
 for(const file of entries){
  const name=Buffer.from('redeachados-shopee-chrome/'+file,'utf8');
  const bytes=readFileSync(new URL(file,folder));
  const hash=crc32(bytes);
  const l=Buffer.alloc(30);
  l.writeUInt32LE(0x04034b50,0);
  l.writeUInt16LE(20,4);
  l.writeUInt32LE(hash,14);
  l.writeUInt32LE(bytes.length,18);l.writeUInt32LE(bytes.length,22);
  l.writeUInt16LE(name.length,26);
  locals.push(l,name,bytes);
  const c=Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50,0);
  c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);
  c.writeUInt32LE(hash,16);
  c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);
  c.writeUInt16LE(name.length,28);
  c.writeUInt32LE(offset,42);
  central.push(c,name);
  offset+=l.length+name.length+bytes.length;
 }
 const centralSize=central.reduce((n,b)=>n+b.length,0);
 const e=Buffer.alloc(22);
 e.writeUInt32LE(0x06054b50,0);
 e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);
 e.writeUInt32LE(centralSize,12);e.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,...central,e]);
}
