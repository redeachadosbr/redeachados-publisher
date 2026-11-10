/* Leitor XLSX local: usa APIs nativas do navegador, sem enviar planilhas a terceiros.
   Suporta XML de planilhas .xlsx (ZIP com método Store ou Deflate).
   Não avalia fórmulas nem executa macros, scripts ou links do arquivo. */
(()=>{
 "use strict";
 const dec=new TextDecoder("utf-8");
 const u16=(v,o)=>v.getUint16(o,true),u32=(v,o)=>v.getUint32(o,true);
 function xml(text){
  if(text.includes("<!DOCTYPE")||text.includes("<!ENTITY"))throw Error("XML de planilha não permitido.");
  const doc=new DOMParser().parseFromString(text,"application/xml");
  if(doc.getElementsByTagName("parsererror").length)throw Error("XML inválido na planilha.");
  return doc;
 }
 const elements=(node,name)=>Array.from(node.getElementsByTagName("*")).filter(x=>x.localName===name);
 const first=(node,name)=>elements(node,name)[0]||null;
 async function read(file,{maxBytes=12_000_000,maxRows=15000}={}){
  if(!file||file.size>maxBytes||!/\.xlsx$/i.test(file.name))throw Error("Selecione um arquivo .xlsx de até 12 MB.");
  if(typeof DecompressionStream!=="function")throw Error("Navegador sem suporte à leitura XLSX. Atualize o Chrome.");
  const data=new Uint8Array(await file.arrayBuffer()),view=new DataView(data.buffer);
  let end=-1;
  for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(u32(view,i)===0x06054b50){end=i;break}
  if(end<0)throw Error("Planilha XLSX/ZIP inválida.");
  let pos=u32(view,end+16),count=u16(view,end+10),entries=new Map();
  if(count>15000)throw Error("Arquivo XLSX possui entradas demais.");
  for(let i=0;i<count;i++){
   if(u32(view,pos)!==0x02014b50)throw Error("Índice XLSX corrompido.");
   const method=u16(view,pos+10),packed=u32(view,pos+20),size=u32(view,pos+24),
    nlen=u16(view,pos+28),extra=u16(view,pos+30),comment=u16(view,pos+32),off=u32(view,pos+42);
   const name=dec.decode(data.subarray(pos+46,pos+46+nlen));
   if(name.includes("..")||name.startsWith("/"))throw Error("Caminho ZIP não permitido.");
   if(size>36_000_000||packed>12_000_000)throw Error("Componente XLSX maior que o limite.");
   entries.set(name,{method,packed,size,off});
   pos+=46+nlen+extra+comment;
  }
  async function fileText(name){
   const ent=entries.get(name);
   if(!ent)return "";
   const o=ent.off;if(u32(view,o)!==0x04034b50)throw Error("Entrada XLSX inválida.");
   const start=o+30+u16(view,o+26)+u16(view,o+28);
   const chunk=data.slice(start,start+ent.packed);
   if(start+ent.packed>data.length)throw Error("Componente XLSX truncado.");
   if(ent.method===0)return dec.decode(chunk);
   if(ent.method!==8)throw Error("Compactação XLSX não suportada.");
   const stream=new Blob([chunk]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
   const ab=await new Response(stream).arrayBuffer();
   if(ab.byteLength>36_000_000)throw Error("Planilha descompactada grande demais.");
   return dec.decode(ab);
  }
  const workbook=await fileText("xl/workbook.xml");
  if(!workbook)throw Error("Pasta de trabalho XLSX não encontrada.");
  const wb=xml(workbook),sheets=elements(wb,"sheet"),main=sheets[0];
  if(!main)throw Error("Arquivo sem aba de dados.");
  const rid=main.getAttribute("r:id")||main.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
  const rels=xml(await fileText("xl/_rels/workbook.xml.rels"));
  const relation=elements(rels,"Relationship").find(x=>x.getAttribute("Id")===rid);
  const target=relation?.getAttribute("Target")||"worksheets/sheet1.xml";
  let sheetName=target.startsWith("/")?target.slice(1):target.startsWith("xl/")?target:"xl/"+target;
  sheetName=sheetName.replace(/^xl\/\.\//,"xl/");
  if(!sheetName.startsWith("xl/worksheets/")||sheetName.includes(".."))throw Error("Aba XLSX com caminho inválido.");
  const sx=await fileText(sheetName);
  if(!sx)throw Error("Não foi possível localizar a primeira aba do arquivo.");
  const shared=await fileText("xl/sharedStrings.xml");
  const strings=shared?elements(xml(shared),"si").map(si=>elements(si,"t").map(t=>t.textContent||"").join("")):[];
  const sheet=xml(sx),result=[];
  const rows=elements(first(sheet,"sheetData")||sheet,"row");
  if(rows.length>maxRows)throw Error("A planilha tem mais de "+maxRows+" linhas.");
  for(const node of rows){
   const row=Number(node.getAttribute("r"))||result.length+1;
   if(row>maxRows)throw Error("Planilha excede o limite de linhas.");
   const vals=[];
   for(const c of elements(node,"c")){
    const ref=c.getAttribute("r")||"",letters=/^[A-Z]+/.exec(ref)?.[0]||"";
    let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;col--;
    if(col<0||col>=120)continue;
    const type=c.getAttribute("t")||"",value=first(c,"v")?.textContent||"";
    let cell=type==="s"?strings[Number(value)]??"":type==="inlineStr"?elements(c,"t").map(t=>t.textContent||"").join(""):value;
    if(type==="n"||(!type&&cell!=="")){const x=Number(cell);if(Number.isFinite(x))cell=x;}
    vals[col]=cell;
   }
   result[row-1]=vals;
  }
  return {sheet:main.getAttribute("name")||"",rows:result.map(row=>row||[])};
 }
 window.RedeXlsx={read};
})();