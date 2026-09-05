import 'dotenv/config';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { ingestEnabledSources } from './ingestion.js';

const env = {
  port: Number(process.env.PORT ?? 8080), databaseUrl: process.env.DATABASE_URL ?? '', jwtSecret: process.env.JWT_SECRET ?? '',
  accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m', refreshDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 7),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', cookieSecure: process.env.COOKIE_SECURE === 'true'
};
if (!env.databaseUrl || !env.jwtSecret) throw new Error('DATABASE_URL and JWT_SECRET are required');
const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });
const app = Fastify({ logger: true });
await app.register(helmet); await app.register(cors, { origin: env.corsOrigin, credentials: true }); await app.register(cookie); await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
const authSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
type AuthUser = { id: string; email: string; role: 'admin'|'operator'|'viewer'; opdId: string | null };
declare module 'fastify' { interface FastifyRequest { user?: AuthUser } }
function accessToken(user: AuthUser) { return jwt.sign({ sub:user.id,email:user.email,role:user.role,opdId:user.opdId }, env.jwtSecret, { expiresIn: env.accessTtl as jwt.SignOptions['expiresIn'] }); }
function hashRefresh(token:string) { return createHash('sha256').update(token).digest('hex'); }
async function requireAuth(request:FastifyRequest, reply:FastifyReply) {
  const token=request.cookies.access_token; if(!token) return reply.code(401).send({error:'UNAUTHENTICATED'});
  try { const decoded=jwt.verify(token,env.jwtSecret) as jwt.JwtPayload; if(typeof decoded.sub!=='string'||!['admin','operator','viewer'].includes(String(decoded.role))) throw new Error('invalid'); request.user={id:decoded.sub,email:String(decoded.email),role:decoded.role as AuthUser['role'],opdId:decoded.opdId?String(decoded.opdId):null}; }
  catch { return reply.code(401).send({error:'INVALID_ACCESS_TOKEN'}); }
}
function requireRole(...roles:AuthUser['role'][]) { return async (request:FastifyRequest,reply:FastifyReply)=>{ if(!request.user||!roles.includes(request.user.role)) return reply.code(403).send({error:'FORBIDDEN'}); }; }

app.get('/health', async()=>({ok:true,service:'media-intelligence-api'}));
app.post('/api/auth/login',async(request,reply)=>{
  const parsed=authSchema.safeParse(request.body); if(!parsed.success) return reply.code(400).send({error:'INVALID_REQUEST'});
  const row=(await pool.query(`SELECT id,email,password_hash,role,opd_id,active FROM users WHERE lower(email)=lower($1) LIMIT 1`,[parsed.data.email])).rows[0];
  if(!row||!row.active||!(await argon2.verify(row.password_hash,parsed.data.password))) return reply.code(401).send({error:'INVALID_CREDENTIALS'});
  const user:AuthUser={id:String(row.id),email:row.email,role:row.role,opdId:row.opd_id==null?null:String(row.opd_id)};
  const refresh=randomBytes(48).toString('base64url'); const expires=new Date(Date.now()+env.refreshDays*86400000);
  await pool.query(`INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,$3)`,[user.id,hashRefresh(refresh),expires]);
  reply.setCookie('access_token',accessToken(user),{httpOnly:true,secure:env.cookieSecure,sameSite:'lax',path:'/'}); reply.setCookie('refresh_token',refresh,{httpOnly:true,secure:env.cookieSecure,sameSite:'lax',path:'/api/auth'});
  return {user};
});
app.post('/api/auth/refresh',async(request,reply)=>{
  const old=request.cookies.refresh_token; if(!old) return reply.code(401).send({error:'NO_REFRESH_TOKEN'});
  const row=(await pool.query(`SELECT rt.id,u.id user_id,u.email,u.role,u.opd_id,rt.expires_at FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=$1 AND rt.revoked_at IS NULL AND u.active=true LIMIT 1`,[hashRefresh(old)])).rows[0];
  if(!row||new Date(row.expires_at)<=new Date()) return reply.code(401).send({error:'INVALID_REFRESH_TOKEN'});
  await pool.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1`,[row.id]); const user:AuthUser={id:String(row.user_id),email:row.email,role:row.role,opdId:row.opd_id==null?null:String(row.opd_id)};
  const refresh=randomBytes(48).toString('base64url'); await pool.query(`INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES($1,$2,$3)`,[user.id,hashRefresh(refresh),new Date(Date.now()+env.refreshDays*86400000)]);
  reply.setCookie('access_token',accessToken(user),{httpOnly:true,secure:env.cookieSecure,sameSite:'lax',path:'/'}); reply.setCookie('refresh_token',refresh,{httpOnly:true,secure:env.cookieSecure,sameSite:'lax',path:'/api/auth'}); return {ok:true};
});
app.post('/api/auth/logout',async(request,reply)=>{const token=request.cookies.refresh_token;if(token) await pool.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL`,[hashRefresh(token)]);reply.clearCookie('access_token',{path:'/'});reply.clearCookie('refresh_token',{path:'/api/auth'});return{ok:true};});
app.get('/api/me',{preHandler:requireAuth},async request=>({user:request.user}));

app.get('/api/opd',{preHandler:requireAuth},async request=>{ const {rows}=await pool.query(`SELECT id,code,name,active FROM opd WHERE active=true ORDER BY name`); return {data:rows}; });
const filterOpd=(user:AuthUser|undefined,requested?:string)=> user?.role==='admin'?requested:requested??user?.opdId;
app.get('/api/articles',{preHandler:requireAuth},async(request,reply)=>{
  const q=z.object({opdId:z.string().regex(/^\d+$/).optional(),from:z.string().optional(),to:z.string().optional(),limit:z.coerce.number().int().min(1).max(100).default(25)}).safeParse(request.query); if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});
  const opdId=filterOpd(request.user,q.data.opdId); const params:unknown[]=[]; const where:string[]=[];
  if(opdId){params.push(opdId);where.push(`a.opd_id=$${params.length}`);} if(q.data.from){params.push(q.data.from);where.push(`a.published_at >= $${params.length}`);} if(q.data.to){params.push(q.data.to);where.push(`a.published_at < $${params.length}`);} params.push(q.data.limit);
  const {rows}=await pool.query(`SELECT a.id,a.title,a.url,a.published_at,a.sentiment,a.importance_score,a.impact_score,a.velocity_score,a.is_highlight,a.summary,ms.name source_name FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.published_at DESC NULLS LAST LIMIT $${params.length}`,params); return {data:rows};
});
app.get('/api/highlights',{preHandler:requireAuth},async(request,reply)=>{ const q=z.object({opdId:z.string().regex(/^\d+$/).optional(),limit:z.coerce.number().int().min(1).max(50).default(10)}).safeParse(request.query);if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});const opdId=filterOpd(request.user,q.data.opdId);const params:unknown[]=[];let where='WHERE a.is_highlight=true';if(opdId){params.push(opdId);where+=` AND a.opd_id=$${params.length}`;}params.push(q.data.limit);const {rows}=await pool.query(`SELECT a.id,a.title,a.url,a.published_at,a.sentiment,a.importance_score,a.impact_score,a.velocity_score,ms.name source_name FROM articles a LEFT JOIN media_sources ms ON ms.id=a.source_id ${where} ORDER BY a.importance_score DESC,a.published_at DESC NULLS LAST LIMIT $${params.length}`,params);return{data:rows};});
app.get('/api/dashboard',{preHandler:requireAuth},async(request,reply)=>{const q=z.object({opdId:z.string().regex(/^\d+$/).optional()}).safeParse(request.query);if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});const opdId=filterOpd(request.user,q.data.opdId);const params:unknown[]=[];const filter=opdId?(params.push(opdId),`WHERE opd_id=$1`):'';const {rows}=await pool.query(`SELECT COUNT(*)::int total_articles,COUNT(*) FILTER(WHERE is_highlight)::int highlights,COUNT(*) FILTER(WHERE sentiment='negative')::int negative,COUNT(*) FILTER(WHERE importance_score>=80)::int critical FROM articles ${filter}`,params);return{metrics:rows[0]};});
app.get('/api/ingestion/status',{preHandler:requireAuth},async()=>{const {rows}=await pool.query(`SELECT COUNT(*)::int sources,COUNT(*) FILTER(WHERE active=true)::int active_sources,COUNT(*) FILTER(WHERE active=true AND url IS NOT NULL)::int feed_sources FROM media_sources`);return{status:rows[0]};});
app.post('/api/ingestion/run',{preHandler:[requireAuth,requireRole('admin','operator')]},async()=>({results:await ingestEnabledSources(pool)}));

app.setErrorHandler((error,_request,reply)=>{app.log.error(error);return reply.code(error.statusCode??500).send({error:'INTERNAL_SERVER_ERROR'});});
app.addHook('onClose',async()=>pool.end()); await app.listen({port:env.port,host:'0.0.0.0'});
