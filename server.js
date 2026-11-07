import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const DIR=path.dirname(fileURLToPath(import.meta.url));
const KEY=process.env.GEMINI_API_KEY, PASSWORD=process.env.APP_PASSWORD;
const MODEL=process.env.GEMINI_MODEL||'gemini-3.8-flash';
const PORT=process.env.PORT||3000;
if(!KEY||!PASSWORD){console.error('Configura GEMINI_API_KEY y APP_PASSWORD como variables privadas.');process.exit(1)}
const SYSTEM=`Eres el asistente de Eliseo SERVER, experto en reparar y hacer root a teléfonos (Android y iPhone) y computadoras (Windows, Linux y Mac). Explicas paso a paso, con lenguaje simple y respuestas breves. Antes de cualquier proceso de root, desbloqueo de bootloader o cambio de sistema, avisas de hacer copia de seguridad, de que puede anular la garantía y de que hay riesgo de dejar el equipo inservible. Pides modelo exacto y versión del sistema si hacen falta. Solo ayudas con dispositivos propios, nunca con equipos robados o para saltar bloqueos de cuentas ajenas. Respondes siempre en el idioma del usuario.`;
const hits=[];
function auth(req){const h=req.headers.authorization||'';if(!h.startsWith('Basic '))return false;const text=Buffer.from(h.slice(6),'base64').toString('utf8'),i=text.indexOf(':');if(i<0)return false;const got=Buffer.from(text.slice(i+1)),want=Buffer.from(PASSWORD);return got.length===want.length&&timingSafeEqual(got,want)}
function err(res,status,msg){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({error:msg}))}
async function chat(req,res){
 const now=Date.now();while(hits.length&&hits[0]<now-60000)hits.shift();if(hits.length>=15)return err(res,429,'Demasiados mensajes. Espera un momento.');hits.push(now);
 let body='';for await(const chunk of req){body+=chunk;if(body.length>200000)return err(res,413,'Mensaje demasiado largo.')}
 let messages;try{messages=JSON.parse(body).messages}catch{return err(res,400,'Mensaje inválido.')}
 if(!Array.isArray(messages))return err(res,400,'Conversación inválida.');
 messages=messages.slice(-30).filter(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'&&m.content.trim()).map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content.slice(0,4000)}]}));
 while(messages.length&&messages[0].role!=='user')messages.shift();if(!messages.length||messages.at(-1).role!=='user')return err(res,400,'Conversación inválida.');
 try{
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(MODEL)+':generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':KEY},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:messages,generationConfig:{maxOutputTokens:2048}}),signal:AbortSignal.timeout(90000)});
  if(!r.ok){console.error('Gemini:',r.status);if(r.status===429)return err(res,429,'Se alcanzó un límite de Google. Espera o revisa tu cuota.');return err(res,502,'No se pudo conectar con Gemini. Revisa la clave y el modelo en Render.')}
  const result=await r.json();const text=(result.candidates?.[0]?.content?.parts||[]).filter(p=>typeof p.text==='string'&&!p.thought).map(p=>p.text).join('');
  if(!text)return err(res,502,'Gemini no devolvió texto. Intenta con otra pregunta.');
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(text);
 }catch(e){console.error('Error:',e.message);if(!res.headersSent)err(res,502,'No se pudo conectar con Gemini. Intenta otra vez.');else res.end()}
}
http.createServer((req,res)=>{
 if(!auth(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Eliseo SERVER", charset="UTF-8"','cache-control':'no-store'});return res.end('Acceso protegido')}
 if(req.method==='POST'&&req.url==='/api/chat'){chat(req,res).catch(e=>{console.error(e.message);if(!res.headersSent)err(res,500,'Error del servidor.');else res.end()});return}
 if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});fs.createReadStream(path.join(DIR,'index.html')).pipe(res);return}res.writeHead(404);res.end();
}).listen(PORT,'0.0.0.0',()=>console.log('Eliseo SERVER listo'));
