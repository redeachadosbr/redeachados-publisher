import { createHmac, timingSafeEqual } from "node:crypto";
const COOKIE = "rede_ads_sid";
const TTL = 7 * 24 * 60 * 60 * 1000;
const SECRET = () => process.env.SESSION_SECRET || "";
function mac(s) { return createHmac("sha256", SECRET()).update(s).digest("base64url"); }
function safeEqual(a,b) { const x=Buffer.from(String(a)), y=Buffer.from(String(b)); return x.length===y.length && timingSafeEqual(x,y); }
export function configurationReady() { return Boolean(process.env.APP_ACCESS_PASSWORD && SECRET().length>=32); }
export function verifyPassword(value) { return configurationReady() && safeEqual(value, process.env.APP_ACCESS_PASSWORD); }
export function issueCookie() {
  const data=String(Date.now()+TTL);
  return COOKIE+"="+encodeURIComponent(data+"."+mac(data))+"; Path=/; Max-Age="+Math.floor(TTL/1000)+"; HttpOnly; Secure; SameSite=Lax";
}
export function expireCookie() { return COOKIE+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"; }
export function isAuthorized(req) {
  if(!configurationReady())return false;
  const raw=(req.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));
  if(!raw)return false;
  const token=decodeURIComponent(raw.slice(COOKIE.length+1));
  const parts=token.split(".");
  return parts.length===2 && /^\d{13}$/.test(parts[0]) && Number(parts[0])>Date.now() && safeEqual(parts[1],mac(parts[0]));
}
export function reply(payload,status=200,headers={}) {
  return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});
}
