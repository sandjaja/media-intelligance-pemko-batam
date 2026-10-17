import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Pool} from 'pg';
import {createHash,randomBytes} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {loadAuthorizationContext,hasPermission,type AuthorizationContext} from './rbac.js';
import {createDisplayDataReader} from './viewer-display-data.js';
export const TV_COOKIE='mi_tv_device';
export const TV_LIFETIME_SECONDS=30*24*60*60;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const cookieOptions=()=>({httpOnly:true,secure:process.env.COOKIE_SECURE==='true'||process.env.VERCEL==='1'||process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/api/tv'});
export const isDisplayViewer=(u:AuthorizationContext)=>u.active&&u.legacyRole==='viewer'&&u.roles.length===1&&u.roles[0]==='viewer'&&!u.opdId&&!u.districtId;
export async function registerViewerDisplayRoutes(app:FastifyInstance,pool:Pool,secret:string,readData=createDisplayDataReader(pool)){
 const normalUser=async(r:FastifyRequest)=>{
  try{const d=jwt.verify(r.cookies.access_token||'',secret) as jwt.JwtPayload;return typeof d.sub==='string'?await loadAuthorizationContext(pool,d.sub):null;}catch{return null;}
 };
 const organization=async()=>{const rows=(await pool.query('SELECT id FROM organizations WHERE active=true ORDER BY id LIMIT 2')).rows;return rows.length===1?String(rows[0].id):null;};
 const sameOrigin=(r:FastifyRequest)=>{try{return !r.headers.origin||new URL(r.headers.origin).host===r.headers.host;}catch{return false;}};
 const device=async(r:FastifyRequest)=>{
  const token=r.cookies[TV_COOKIE];if(!token||!/^[A-Za-z0-9_-]{64}$/.test(token))return null;
  const row=(await pool.query(`SELECT d.id,d.user_id,d.organization_id,d.name,d.expires_at FROM viewer_display_devices d JOIN organizations o ON o.id=d.organization_id AND o.active=true WHERE d.token_hash=$1 AND d.revoked_at IS NULL AND d.expires_at>now()`,[hash(token)])).rows[0];
  if(!row)return null;
  const user=await loadAuthorizationContext(pool,String(row.user_id));if(!user||!isDisplayViewer(user)){await pool.query('UPDATE viewer_display_devices SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1',[row.id]);return null;}return row;
 };
 const admin=async(r:FastifyRequest)=>{const u=await normalUser(r);return u?.active&&hasPermission(u,'platform.admin')?u:null;};
 app.addHook('onSend',async(r,p,payload)=>{if(r.url.startsWith('/api/tv/')||r.url.startsWith('/api/admin/tv-devices'))p.header('Cache-Control','no-store');return payload;});
 app.post('/api/tv/devices',async(r,p)=>{
  const user=await normalUser(r);if(!user)return p.code(401).send({error:'UNAUTHENTICATED'});
  if(!isDisplayViewer(user))return p.code(403).send({error:'GLOBAL_VIEWER_REQUIRED'});
  if(!sameOrigin(r))return p.code(403).send({error:'ORIGIN_NOT_ALLOWED'});
  const body=z.object({name:z.string().trim().min(1).max(80)}).strict().safeParse(r.body);
  if(!body.success)return p.code(400).send({error:'INVALID_DISPLAY_NAME'});
  const org=await organization();if(!org)return p.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
  const token=randomBytes(48).toString('base64url'),expires=new Date(Date.now()+TV_LIFETIME_SECONDS*1000);
  const client=await pool.connect();let row:any;
  try{
   await client.query('BEGIN');
   if(r.cookies[TV_COOKIE])await client.query('UPDATE viewer_display_devices SET revoked_at=now() WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL',[hash(r.cookies[TV_COOKIE]),user.id]);
   row=(await client.query('INSERT INTO viewer_display_devices(user_id,organization_id,name,token_hash,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id,name,expires_at',[user.id,org,body.data.name,hash(token),expires])).rows[0];
   await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'TV_DEVICE_CREATED',$2::jsonb)`,[user.id,JSON.stringify({deviceId:String(row.id),name:body.data.name})]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  p.setCookie(TV_COOKIE,token,{...cookieOptions(),maxAge:TV_LIFETIME_SECONDS});return p.code(201).send({data:row});
 });
 app.get('/api/tv/session',async(r,p)=>{const d=await device(r);if(!d)return p.code(401).send({error:'DISPLAY_ACCESS_EXPIRED'});return{data:{name:d.name,expiresAt:d.expires_at}};});
 app.get('/api/tv/data',async(r,p)=>{
  const d=await device(r);if(!d)return p.code(401).send({error:'DISPLAY_ACCESS_EXPIRED'});
  const data=await readData(String(d.organization_id));
  await pool.query("UPDATE viewer_display_devices SET last_seen_at=now() WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at<now()-interval '5 minutes')",[d.id]);
  return{data,device:{name:d.name,expiresAt:d.expires_at}};
 });
 app.delete('/api/tv/device',async(r,p)=>{
  if(!sameOrigin(r))return p.code(403).send({error:'ORIGIN_NOT_ALLOWED'});
  const token=r.cookies[TV_COOKIE];if(token)await pool.query('UPDATE viewer_display_devices SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',[hash(token)]);
  p.clearCookie(TV_COOKIE,cookieOptions());return{ok:true};
 });
 app.get('/api/admin/tv-devices',async(r,p)=>{
  if(!await admin(r))return p.code(403).send({error:'FORBIDDEN'});
  const org=await organization();if(!org)return p.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
  return{data:(await pool.query(`SELECT d.id,d.name,d.created_at,d.expires_at,d.revoked_at,d.last_seen_at,u.email FROM viewer_display_devices d JOIN users u ON u.id=d.user_id WHERE d.organization_id=$1 ORDER BY d.created_at DESC LIMIT 100`,[org])).rows};
 });
 app.post('/api/admin/tv-devices/:id/revoke',async(r,p)=>{
  const user=await admin(r);if(!user)return p.code(403).send({error:'FORBIDDEN'});
  if(!sameOrigin(r))return p.code(403).send({error:'ORIGIN_NOT_ALLOWED'});
  const id=z.string().regex(/^\d+$/).safeParse((r.params as any).id);if(!id.success)return p.code(400).send({error:'INVALID_DEVICE'});
  const org=await organization();if(!org)return p.code(409).send({error:'ORGANIZATION_UNRESOLVED'});
  const row=(await pool.query('UPDATE viewer_display_devices SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND organization_id=$2 RETURNING id',[id.data,org])).rows[0];
  if(!row)return p.code(404).send({error:'DEVICE_NOT_FOUND'});
  await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'TV_DEVICE_REVOKED',$2::jsonb)`,[user.id,JSON.stringify({deviceId:id.data})]);return{ok:true};
 });
}
