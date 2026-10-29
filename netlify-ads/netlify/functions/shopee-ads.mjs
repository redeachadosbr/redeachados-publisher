import {isAuthorized,reply} from "../lib/auth.mjs";
export const config={path:"/api/shopee/ads/overview"};
export default async function handler(req) {
  if(!isAuthorized(req))return reply({ok:false,error:"LOGIN_REQUIRED"},401);
  if(req.method!=="GET")return reply({ok:false,error:"Método inválido"},405);
  const password=process.env.RENDER_APP_PASSWORD;
  const base=(process.env.RENDER_SHOPEE_URL||"https://redeachados-shopee.onrender.com").replace(/\/$/,"");
  if(!password)return reply({ok:false,error:"Configure RENDER_APP_PASSWORD no Netlify para consultar Ads. A versão do Render continua disponível."},503);
  const qs=new URL(req.url).searchParams;
  const a=qs.get("start_date"),b=qs.get("end_date");
  if(!/^20\d\d-\d\d-\d\d$/.test(a||"")||!/^20\d\d-\d\d-\d\d$/.test(b||""))
    return reply({ok:false,error:"Datas inválidas."},400);
  try {
    const login=await fetch(base+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password}),redirect:"manual",signal:AbortSignal.timeout(12000)});
    if(!login.ok)return reply({ok:false,error:"Não foi possível autenticar no Render; confirme RENDER_APP_PASSWORD."},502);
    const cookie=(login.headers.get("set-cookie")||"").split(";")[0];
    if(!cookie.startsWith("connect.sid="))return reply({ok:false,error:"O Render não retornou sessão autenticada."},502);
    const result=await fetch(base+"/api/shopee/ads/overview?start_date="+encodeURIComponent(a)+"&end_date="+encodeURIComponent(b),
      {headers:{Cookie:cookie,Accept:"application/json"},signal:AbortSignal.timeout(25000)});
    const body=await result.text();let data;try{data=JSON.parse(body)}catch{return reply({ok:false,error:"Resposta não JSON da API Shopee."},502)}
    return reply(data,result.ok?200:502);
  }catch(e){return reply({ok:false,error:"Falha ao ler Ads no Render: "+String(e.message||e).slice(0,180)},502)}
}
