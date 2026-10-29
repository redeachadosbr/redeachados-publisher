import {configurationReady,verifyPassword,issueCookie,expireCookie,isAuthorized,reply} from "../lib/auth.mjs";
export const config={path:"/api/access"};
export default async function handler(req) {
  if(!configurationReady())return reply({ok:false,error:"Configure APP_ACCESS_PASSWORD e SESSION_SECRET no Netlify."},503);
  if(req.method==="GET")return reply({ok:true,authenticated:isAuthorized(req)});
  if(req.method==="DELETE")return reply({ok:true},200,{"Set-Cookie":expireCookie()});
  if(req.method!=="POST")return reply({ok:false,error:"Método inválido"},405);
  let body={};try{body=await req.json()}catch{return reply({ok:false,error:"JSON inválido"},400)}
  if(!verifyPassword(String(body.password||"")))return reply({ok:false,error:"Senha incorreta"},401);
  return reply({ok:true,authenticated:true},200,{"Set-Cookie":issueCookie()});
}
