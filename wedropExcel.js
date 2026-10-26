// Conversão pontual de planilhas Excel WeDrop para o mesmo CSV validado pelo Motor Matriz.
// Não grava preços nem reinterpreta cabeçalhos: o importador existente continua
// responsável por validar SKU, custo, duplicidades, NCM e CEST.
import * as XLSX from '@stackline/xlsx';
import {MAX_CSV_CHARS,MAX_CSV_ROWS,identifyWeDropLayout} from './wedropCsv.js';
export const MAX_EXCEL_BYTES=4_000_000;
const MAX_EXCEL_COLUMNS=100;
const MAX_SHEETS=12;
const MAX_ROWS=MAX_CSV_ROWS+1;
function csvCell(value){
 const s=String(value??'');
 return /[;"\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
export function excelBufferToWeDropCsv(buffer,{fileName='catalogo.xlsx',purpose='catalog'}={}){
 if(!['catalog','availability'].includes(purpose))throw Error('Objetivo de importação inválido.');
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_EXCEL_BYTES)
  throw Error('Planilha Excel inválida ou acima de 4 MB.');
 const name=String(fileName||'').trim();
 if(!/\.xlsx?$/i.test(name))throw Error('O arquivo deve ser .xlsx ou .xls.');
 const isXlsx=buffer[0]===0x50&&buffer[1]===0x4B;
 const isXls=buffer.subarray(0,8).equals(Buffer.from([0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1]));
 if(!isXlsx&&!isXls)throw Error('O arquivo não contém uma planilha Excel válida.');
 if(/\.xlsx$/i.test(name)&&!isXlsx||/\.xls$/i.test(name)&&!isXls)
  throw Error('A extensão não corresponde ao formato real do Excel.');
 let workbook;
 try{workbook=XLSX.read(buffer,{type:'buffer',sheetRows:MAX_ROWS+2,
    bookVBA:false,bookProps:false});}
 catch{throw Error('Não foi possível ler o Excel. Confirme que não está corrompido ou protegido por senha.');}
 const candidates=[];
 for(const sheetName of (workbook.SheetNames||[]).slice(0,MAX_SHEETS)){
  const sheet=workbook.Sheets[sheetName];
  if(!sheet)continue;
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:false});
  if(!Array.isArray(rows)||rows.length<2)continue;
  const header=rows[0].map(cell=>String(cell??'').trim());
  if(header.length<2||header.length>MAX_EXCEL_COLUMNS)continue;
  if(!header.some(cell=>cell.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()==='sku'))continue;
  const layout=identifyWeDropLayout(header);
  const folded=header.map(h=>h.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\s_-]+/g,' ').trim());
  const availabilityHeaders=new Set(['disponibilidade','disponibilidade de estoque',
   'status estoque','status de estoque','situacao do estoque','estoque disponivel','estoque']);
  const matchesStock=folded.filter(x=>x==='sku').length===1&&
   folded.filter(x=>availabilityHeaders.has(x)).length===1;
  candidates.push({sheetName,rows,recognized:layout.recognized,matchesStock});
 }
 if(!candidates.length)throw Error('Nenhuma aba do Excel possui cabeçalho SKU e linhas de produtos. Confira a planilha.');
 const recognized=purpose==='availability'?
  candidates.filter(x=>x.matchesStock):candidates.filter(x=>x.recognized);
 if(recognized.length>1)throw Error('Há mais de uma aba com dados compatíveis. Mantenha uma única aba de '+(purpose==='availability'?'estoque':'catálogo')+' por arquivo.');
 if(purpose==='availability'&&!recognized.length)
  throw Error('Nenhuma aba do Excel contém SKU e Disponibilidade (DISPONÍVEL/INDISPONÍVEL).');
 const picked=recognized[0]||candidates[0];
 if(picked.rows.length>MAX_ROWS)throw Error('Excel acima de 15.000 linhas. Divida a planilha.');
 let csv='';
 const width=picked.rows[0].length;
 for(const row of picked.rows){
  if(!Array.isArray(row)||row.length>MAX_EXCEL_COLUMNS)throw Error('Planilha Excel com colunas demais.');
  // Completar células vazias respeitando posição de cada coluna.
  const cells=Array.from({length:width},(_,i)=>csvCell(row[i]));
  csv+=cells.join(';')+'\r\n';
  if(csv.length>MAX_CSV_CHARS)throw Error('Conteúdo Excel excede os 4 MB permitidos para importação.');
 }
 return {csv,sheetName:picked.sheetName,rows:picked.rows.length-1,
   recognizedLayout:picked.recognized,format:isXlsx?'xlsx':'xls'};
}
export function convertWeDropExcelBase64(base64,fileName,{purpose='catalog'}={}){
 if(typeof base64!=='string'||base64.length>Math.ceil(MAX_EXCEL_BYTES*4/3)+20||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
  throw Error('Conteúdo Excel inválido ou acima de 4 MB.');
 return excelBufferToWeDropCsv(Buffer.from(base64,'base64'),{fileName,purpose});
}
