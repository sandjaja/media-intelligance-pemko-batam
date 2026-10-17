import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {createHmac} from 'node:crypto';
const limits:Record<string,{ip:number;account:number}>={
 '/api/auth/login':{ip:100,account:10},
 '/api/auth/forgot-password':{ip:5,account:3},
 '/api/auth/reset-password':{ip:10,account:0},
};
export async function claimAuthAttempt(pool:Pool,input:{path:string;ip:string;email?:string;secret:string}){
 const limit=limits[input.path];if(!limit)return true;
 const hash=(s:string)=>createHmac('sha256',input.secret).update(s).digest('hex');
 const ipKey=hash(input.path+':ip:'+input.ip),accountKey=input.email&&limit.account?hash(input.path+':account:'+input.email.trim().toLowerCase()):null;
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const key of [ipKey,...(accountKey?[accountKey]:[])].sort())await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
  const counts=(await client.query(`SELECT COUNT(*) FILTER(WHERE metadata->>'ipKey'=$1)::int ip_count,COUNT(*) FILTER(WHERE metadata->>'accountKey'=$2)::int account_count FROM audit_logs WHERE action='AUTH_ATTEMPT' AND created_at>now()-interval '15 minutes' AND (metadata->>'ipKey'=$1 OR metadata->>'accountKey'=$2)`,[ipKey,accountKey])).rows[0];
  if(Number(counts?.ip_count)>=limit.ip||accountKey&&Number(counts?.account_count)>=limit.account){await client.query('ROLLBACK');return false;}
  await client.query(`INSERT INTO audit_logs(action,metadata) VALUES('AUTH_ATTEMPT',$1::jsonb)`,[JSON.stringify({ipKey,accountKey})]);
  await client.query('COMMIT');return true;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export function installAuthAttemptLimit(app:FastifyInstance,pool:Pool,secret:string){
 app.addHook('preHandler',async(request,reply)=>{
  const path=request.url.split('?')[0];if(request.method!=='POST'||!limits[path])return;
  try{
   const email=typeof (request.body as any)?.email==='string'?String((request.body as any).email).slice(0,200):undefined;
   if(!await claimAuthAttempt(pool,{path,ip:request.ip,email,secret}))return reply.header('retry-after','900').code(429).send({error:'AUTH_RATE_LIMITED',message:'Terlalu banyak percobaan. Coba kembali setelah 15 menit.'});
  }catch{return reply.code(503).send({error:'AUTH_CHECK_UNAVAILABLE'});}
 });
}
