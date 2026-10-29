import {isAuthorized,reply} from "../lib/auth.mjs";
export const config={path:"/api/history"};
export default async function handler(req) {
  if(!isAuthorized(req))return reply({ok:false,error:"LOGIN_REQUIRED"},401);
  if(req.method!=="POST")return reply({ok:false,error:"Método inválido"},405);
  const url=process.env.GOOGLE_SCRIPT_URL,secret=process.env.GOOGLE_HISTORY_SECRET;
  if(!url||!secret||!/^https:\/\/script\.google\.com\/macros\/s\//.test(url))
   return reply({ok:false,error:"Histórico Google Drive não configurado no Netlify."},503);
  let body;
  try {
    const raw=await req.text();if(raw.length>1900000)return reply({ok:false,error:"Pacote de histórico muito grande."},413);
    body=JSON.parse(raw);
  } catch {return reply({ok:false,error:"Dados inválidos."},400)}
  if(!["read","merge"].includes(body.action))return reply({ok:false,error:"Ação não permitida."},400);
  const payload={action:body.action,secret};
  if(body.action==="merge"){payload.state=body.state||{};payload.deleted=body.deleted||{}}
  try {
    const response=await fetch(url,{method:"POST",redirect:"follow",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
    const text=await response.text();
    let obj;try{obj=JSON.parse(text)}catch{return reply({ok:false,error:"O Google Apps Script não retornou JSON. Verifique publicação e permissões."},502)}
    if(!response.ok||obj.ok===false)return reply({ok:false,error:String(obj.error||"Falha no Drive").slice(0,350)},502);
    return reply(obj);
  } catch(e) {return reply({ok:false,error:"Não foi possível acessar o Google Drive: "+String(e.message||e).slice(0,180)},502)}
}
