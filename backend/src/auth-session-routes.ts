import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import {readRefreshSession,sessionAccessToken} from './session-security.js';

function secureCookie(){
  return process.env.COOKIE_SECURE==='true'||process.env.VERCEL==='1'||process.env.NODE_ENV==='production';
}

function refreshCookieOptions(remember=true){
  const days=Number(process.env.REFRESH_TOKEN_DAYS??7);
  return {
    httpOnly:true,
    secure:secureCookie(),
    sameSite:'lax' as const,
    path:'/',
    ...(remember?{maxAge:Math.max(1,days)*24*60*60}:{}),
  };
}

function accessCookieOptions(){
  return {httpOnly:true,secure:secureCookie(),sameSite:'lax' as const,path:'/'};
}

export async function registerAuthSessionRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  app.post('/api/auth/activity',async(request,reply)=>{if(!request.sessionAuth)return reply.code(401).send({error:'SESSION_EXPIRED'});reply.header('cache-control','no-store');return{ok:true};});
  app.post('/api/auth/persist',async(request,reply)=>{
    const refresh=request.cookies.refresh_token;
    if(!refresh)return reply.code(401).send({error:'NO_REFRESH_TOKEN'});
    const row=await readRefreshSession(pool,refresh);
    if(!row)return reply.code(401).send({error:'INVALID_REFRESH_TOKEN'});
    const remember=(request.body as any)?.rememberMe!==false;
    reply.setCookie('refresh_token',refresh,refreshCookieOptions(remember));
    const access=request.cookies.access_token;
    if(access)reply.setCookie('access_token',access,accessCookieOptions());
    reply.header('cache-control','no-store');
    return {ok:true,persisted:true};
  });

  app.get('/api/auth/session',async(request,reply)=>{
    reply.header('cache-control','private, no-store, max-age=0');
    try{
      // Old releases used /api/auth and / simultaneously. Cookie parsers may
      // choose the stale path cookie first; verify each supplied candidate.
      const candidates=[...new Set([request.cookies.refresh_token,...String(request.headers.cookie||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith('refresh_token=')).map(part=>part.slice('refresh_token='.length))])].filter((v):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{64}$/.test(v)).slice(0,5);
      if(!candidates.length)return reply.code(401).send({error:'NO_SESSION'});
      for(const refresh of candidates){
        const row=await readRefreshSession(pool,refresh);
        if(!row)continue;
        const user={id:String(row.user_id),email:row.email,role:row.role,opdId:row.opd_id==null?null:String(row.opd_id)};
        const token=sessionAccessToken(row,refresh,jwtSecret);
        reply.setCookie('access_token',token,accessCookieOptions());
        reply.clearCookie('refresh_token',{path:'/api/auth'});
        // Preserve the root cookie's browser lifetime; migrate only a legacy value.
        if(refresh!==request.cookies.refresh_token||candidates.length>1)reply.setCookie('refresh_token',refresh,refreshCookieOptions(false));
        return {user,restored:true};
      }
      return reply.code(401).send({error:'INVALID_SESSION'});
    }catch{
      return reply.code(503).send({error:'SESSION_CHECK_UNAVAILABLE'});
    }
  });
}
