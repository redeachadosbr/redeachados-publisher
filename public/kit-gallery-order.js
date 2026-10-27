// Galeria de kits — posicionamento determinístico e nomes de downloads do ChatGPT.
// Este módulo não acessa a aba do ChatGPT nem a API e pode ser testado isoladamente.
export function kitImageFilenameSlot(name){
 const value=String(name||'');
 const expressions=[
  /(?:^|[^\da-z])(?:imagem|image|img|foto|photo|slot|posicao|posição)[\s._-]*0?([1-9])(?=[^\d]|$)/i,
  /(?:^|[^\d])0?([1-9])[\s._-]*(?:de|of|a|\/)[\s._-]*0?9(?=[^\d]|$)/i,
  /(?:^|[^\d])0?([1-9])[\s._-]*-[\s._-]*0?9(?=[^\d]|$)/i
 ];
 for(const regex of expressions){
  const match=regex.exec(value);
  if(match)return Number(match[1]);
 }
 return null;
}
export function kitImageNextSlot(occupied,preferred=null){
 const taken=new Set(occupied||[]);
 if(Number.isInteger(preferred)&&preferred>=1&&preferred<=9&&!taken.has(preferred))return preferred;
 for(let slot=1;slot<=9;slot++)if(!taken.has(slot))return slot;
 return null;
}
export function kitPlanImageImports(files,occupiedSlots=[]){
 const occupied=new Set(occupiedSlots),steps=[];
 const sorted=[...files].sort((a,b)=>{
  const x=kitImageFilenameSlot(a.name),y=kitImageFilenameSlot(b.name);
  if(x!==null&&y!==null&&x!==y)return x-y;
  if(x!==null&&y===null)return -1;
  if(x===null&&y!==null)return 1;
  if(Number.isFinite(a.lastModified)&&Number.isFinite(b.lastModified)&&a.lastModified!==b.lastModified)
   return a.lastModified-b.lastModified;
  return String(a.name||'').localeCompare(String(b.name||''),'pt-BR',{numeric:true});
 });
 for(const file of sorted){
  const slot=kitImageNextSlot(occupied,kitImageFilenameSlot(file.name));
  if(slot===null){steps.push({file,slot:null});continue;}
  occupied.add(slot);steps.push({file,slot});
 }
 return steps;
}
export function kitMoveImage(existing,from,to){
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||from>9||to<1||to>9)
  throw Error('Posições de imagens precisam estar entre 1 e 9.');
 const state=new Map(existing);
 if(!state.has(from))throw Error('A posição de origem não contém imagem.');
 if(from===to)return state;
 const first=state.get(from),second=state.get(to);
 state.set(to,first);
 if(second===undefined)state.delete(from);
 else state.set(from,second);
 return state;
}
