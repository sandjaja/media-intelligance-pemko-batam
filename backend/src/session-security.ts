import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import jwt from 'jsonwebtoken';
import {createHash} from 'node:crypto';
import {loadAuthorizationContext,type AuthorizationContext} from './rbac.js';
export const SESSION_IDLE_MS=15*60*1000;
export const sessionHash=(token:string)=>createHash('sha256').update(token).digest('hex');
declare module 'fastify' {interface FastifyRequest {sessionAuth?:AuthorizationContext}}

// Existing refresh grants store the server-side idle deadline; no schema migration.
export async function readRefreshSession(pool:Pool,token:string,now=Date.now()){
 if(!/^[A-Za-z0-9_-]{64}$/.test(token))return null;
 const row=(await pool.query(`SELECT rt.id session_id,rt.user_id,rt.expires_at,rt.created_at,u.email,u.role,u.opd_id FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=$1 AND rt.revoked_at IS NULL AND u.active=true AND rt.expires_at>now() LIMIT 1`,[sessionHash(token)])).rows[0];
 if(!row)return null;
 const expiry=new Date(row.expires_at).getTime(),created=new Date(row.created_at).getTime();
 const absolute=created+Math.max(1,Number(process.env.REFRESH_TOKEN_DAYS)||7)*86400000;
 // Pre-hardening grants had multi-day idle deadlines. Require a fresh login once.
 if(!Number.isFinite(expiry)||!Number.isFinite(created)||expiry<=now||expiry>now+SESSION_IDLE_MS+5000||absolute<=now)return null;
 if(expiry<now+SESSION_IDLE_MS-60000){
  const touched=await pool.query(`UPDATE refresh_tokens SET expires_at=LEAST($2::timestamptz,created_at+($3*interval '1 day')) WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING id`,[row.session_id,new Date(now+SESSION_IDLE_MS),Math.max(1,Number(process.env.REFRESH_TOKEN_DAYS)||7)]);
  if(!touched.rows.length)return null;
 }
 return row;
}
export function sessionAccessToken(row:any,refresh:string,secret:string){
 return jwt.sign({sub:String(row.user_id),email:row.email,role:row.role,opdId:row.opd_id==null?null:String(row.opd_id),sid:sessionHash(refresh),sessionVersion:1},secret,{expiresIn:(process.env.ACCESS_TOKEN_TTL||'15m') as jwt.SignOptions['expiresIn']});
}
export function installSessionGuard(app:FastifyInstance,pool:Pool,secret:string){
 app.addHook('preValidation',async(request,reply)=>{
  const path=request.url.split('?')[0];
  if(!path.startsWith('/api/')||['/api/branding/active','/api/auth/login','/api/auth/logout','/api/auth/session','/api/auth/refresh','/api/auth/forgot-password','/api/auth/reset-password','/api/tv/data','/api/tv/session','/api/tv/device'].includes(path))return;
  // Public machine endpoints retain their dedicated secret/grant checks. Normal
  // routes still require their route guard if the access cookie is absent.
  if(!request.cookies.access_token)return;
  let decoded:jwt.JwtPayload;
  try{decoded=jwt.verify(request.cookies.access_token,secret,{algorithms:['HS256']}) as jwt.JwtPayload;}catch{return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'});}
  const refresh=request.cookies.refresh_token||'';
  if(typeof decoded.sub!=='string'||decoded.sessionVersion!==1||decoded.sid!==sessionHash(refresh))return reply.code(401).send({error:'SESSION_EXPIRED'});
  const row=await readRefreshSession(pool,refresh);
  if(!row||String(row.user_id)!==decoded.sub)return reply.code(401).send({error:'SESSION_EXPIRED'});
  const ctx=await loadAuthorizationContext(pool,decoded.sub);
  if(!ctx?.active)return reply.code(401).send({error:'ACCOUNT_INACTIVE'});
  request.sessionAuth=ctx;
  // Older route modules decode legacy claims. Supply only current DB values.
  request.cookies.access_token=sessionAccessToken({user_id:ctx.id,email:ctx.email,role:ctx.legacyRole,opd_id:ctx.opdId},refresh,secret);
 });
}
