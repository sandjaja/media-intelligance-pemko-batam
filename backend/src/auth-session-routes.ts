import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';

function hashRefresh(token:string){
  return createHash('sha256').update(token).digest('hex');
}

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
  app.post('/api/auth/persist',async(request,reply)=>{
    const refresh=request.cookies.refresh_token;
    if(!refresh)return reply.code(401).send({error:'NO_REFRESH_TOKEN'});
    const row=(await pool.query(`SELECT rt.id,rt.expires_at FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=$1 AND rt.revoked_at IS NULL AND u.active=true LIMIT 1`,[hashRefresh(refresh)])).rows[0];
    if(!row||new Date(row.expires_at)<=new Date())return reply.code(401).send({error:'INVALID_REFRESH_TOKEN'});
    const remember=(request.body as any)?.rememberMe!==false;
    reply.setCookie('refresh_token',refresh,refreshCookieOptions(remember));
    const access=request.cookies.access_token;
    if(access)reply.setCookie('access_token',access,accessCookieOptions());
    reply.header('cache-control','no-store');
    return {ok:true,persisted:true};
  });

  app.get('/api/auth/session',async(request,reply)=>{
    reply.header('cache-control','no-store');
    const access=request.cookies.access_token;
    if(access){
      try{
        const decoded=jwt.verify(access,jwtSecret) as jwt.JwtPayload;
        if(typeof decoded.sub==='string'){
          const row=(await pool.query(`SELECT id,email,role,opd_id,active FROM users WHERE id=$1 LIMIT 1`,[decoded.sub])).rows[0];
          if(row?.active){
            const refresh=request.cookies.refresh_token;
            if(refresh)reply.setCookie('refresh_token',refresh,refreshCookieOptions(true));
            return {user:{id:String(row.id),email:row.email,role:row.role,opdId:row.opd_id==null?null:String(row.opd_id)},restored:false};
          }
        }
      }catch{}
    }

    const refresh=request.cookies.refresh_token;
    if(!refresh)return reply.code(401).send({error:'NO_SESSION'});
    const row=(await pool.query(`SELECT u.id,u.email,u.role,u.opd_id,u.active,rt.expires_at FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=$1 AND rt.revoked_at IS NULL AND u.active=true LIMIT 1`,[hashRefresh(refresh)])).rows[0];
    if(!row||new Date(row.expires_at)<=new Date())return reply.code(401).send({error:'INVALID_SESSION'});

    const user={id:String(row.id),email:row.email,role:row.role,opdId:row.opd_id==null?null:String(row.opd_id)};
    const token=jwt.sign({sub:user.id,email:user.email,role:user.role,opdId:user.opdId},jwtSecret,{expiresIn:(process.env.ACCESS_TOKEN_TTL??'15m') as jwt.SignOptions['expiresIn']});
    reply.setCookie('access_token',token,accessCookieOptions());
    reply.setCookie('refresh_token',refresh,refreshCookieOptions(true));
    return {user,restored:true};
  });
}
