import {isAuthorized,reply} from "../lib/auth.mjs";
export const config={path:"/api/shopee/finance/orders"};
// Ponte de leitura autenticada, sem dados financeiros armazenados no Netlify.
export default async function handler(req){
 if(!isAuthorized(req))return reply({ok:false,error:"LOGIN_REQUIRED"},401);
 if(req.method!=="GET")return reply({ok:false,error:"Método não permitido."},405);
 const password=process.env.RENDER_APP_PASSWORD;
 const base=(process.env.RENDER_SHOPEE_URL||"https://redeachados-shopee.onrender.com").replace(/\/$/,"");
 if(!password)return reply({ok:false,error:"A credencial do Render não está configurada no Netlify."},503);
 const qs=new URL(req.url).searchParams,start=qs.get("start"),end=qs.get("end");
 if(!/^20\d\d-\d\d-\d\d$/.test(start||"")||!/^20\d\d-\d\d-\d\d$/.test(end||"")||
  start>end)return reply({ok:false,error:"Período inválido."},400);
 const days=Math.round((Date.parse(end+"T12:00:00Z")-Date.parse(start+"T12:00:00Z"))/86400000)+1;
 if(!Number.isInteger(days)||days<1||days>30)
  return reply({ok:false,error:"Consulte até 30 dias por vez."},400);
 try{
  const login=await fetch(base+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({password}),redirect:"manual",signal:AbortSignal.timeout(12000)});
  if(!login.ok)return reply({ok:false,error:"A autenticação do serviço financeiro não foi confirmada."},502);
  const cookie=(login.headers.get("set-cookie")||"").split(";")[0];
  if(!cookie.startsWith("connect.sid="))return reply({ok:false,error:"Sessão financeira indisponível."},502);
  const result=await fetch(base+"/api/shopee/finance/orders?start="+encodeURIComponent(start)+"&end="+encodeURIComponent(end),{
   headers:{Cookie:cookie,Accept:"application/json"},signal:AbortSignal.timeout(45000)});
  const raw=await result.text();
  let data;try{data=JSON.parse(raw)}catch{return reply({ok:false,error:"Serviço financeiro não retornou JSON."},502)}
  if(!result.ok)return reply({ok:false,error:String(data.error||"Consulta financeira indisponível.").slice(0,210),
   category:data.category||null},result.status===403?403:502);
  return reply(data,200);
 }catch(e){
  return reply({ok:false,error:"Não foi possível consultar os repasses: "+String(e.message||e).slice(0,150)},502);
 }
}