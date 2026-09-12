import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';

function hashRefresh(token:string){
  return createHash('sha256').update(token).digest('hex');
}

export async function registerAuthSessionRoutes(app:FastifyInstance,pool:Pool,jwtSecret:string){
  app.get('/api/auth/session',async(request,reply)=>{
    const access=request.cookies.access_token;
    if(access){
      try{
        const decoded=jwt.verify(access,jwtSecret) as jwt.JwtPayload;
        if(typeof decoded.sub==='string'){
          const row=(await pool.query(`SELECT id,email,role,opd_id,active FROM users WHERE id=$1 LIMIT 1`,[decoded.sub])).rows[0];
          if(row?.active){
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
    reply.setCookie('access_token',token,{httpOnly:true,secure:process.env.COOKIE_SECURE==='true',sameSite:'lax',path:'/'});
    return {user,restored:true};
  });
}
