import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {createHash,randomBytes} from 'node:crypto';
import argon2 from 'argon2';
import nodemailer from 'nodemailer';
import {z} from 'zod';
import {decryptIntegrationCredential} from './integration-credentials.js';

const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const generic={ok:true,message:'Jika akun terdaftar, tautan reset password akan dikirim ke email akun. Periksa kotak masuk dan folder spam. Jika email tidak diterima, hubungi Administrator.'};

// Never build a reset link from the public request Host/Origin headers.
export function passwordResetBaseUrl(env:NodeJS.ProcessEnv=process.env){
 const raw=env.VERCEL_ENV==='preview'&&env.VERCEL_URL?'https://'+env.VERCEL_URL:env.PUBLIC_APP_URL||env.CORS_ORIGIN;
 if(!raw)throw Error('RESET_APP_URL_NOT_CONFIGURED');
 const url=new URL(raw);
 if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('RESET_APP_URL_INVALID');
 return url.origin;
}

export async function sendPasswordResetEmail(pool:Pool,to:string,link:string){
 const row=(await pool.query(`SELECT settings,credential_ciphertext,status,last_test_status FROM notification_channels WHERE code='EMAIL' LIMIT 1`)).rows[0];
 if(row?.status!=='ACTIVE'||row.last_test_status!=='SUCCESS'||!row.credential_ciphertext)throw Error('RESET_EMAIL_NOT_READY');
 const settings=row.settings||{},secret=JSON.parse(decryptIntegrationCredential(row.credential_ciphertext));
 if(!settings.host||!settings.port||!settings.fromEmail||!secret.password)throw Error('RESET_EMAIL_NOT_CONFIGURED');
 const transport=nodemailer.createTransport({host:String(settings.host),port:Number(settings.port),secure:Boolean(settings.secure),auth:settings.username?{user:String(settings.username),pass:String(secret.password)}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
 try{
  const info=await transport.sendMail({from:{name:String(settings.fromName||'Media Intelligence Pemko Batam'),address:String(settings.fromEmail)},to,subject:'Reset password — Media Intelligence',text:`Permintaan reset password akun Media Intelligence Anda.\n\nBuka tautan ini untuk membuat password baru:\n${link}\n\nTautan berlaku 30 menit dan hanya bisa digunakan sekali. Jika Anda tidak meminta reset, abaikan email ini. Password Anda belum berubah.`});
  if(info.rejected?.length||!info.accepted?.length)throw Error('RESET_EMAIL_REJECTED');
 }finally{transport.close();}
}

type Options={send?:(to:string,link:string)=>Promise<void>;baseUrl?:()=>string};
export async function registerPasswordResetRoutes(app:FastifyInstance,pool:Pool,options:Options={}){
 const send=options.send||((to,link)=>sendPasswordResetEmail(pool,to,link));
 const base=options.baseUrl||(()=>passwordResetBaseUrl());
 app.post('/api/auth/forgot-password',{config:{rateLimit:{max:5,timeWindow:'15 minutes'}}},async(request,reply)=>{
  reply.header('cache-control','no-store');
  const parsed=z.object({email:z.string().trim().email().max(200)}).safeParse(request.body);
  if(!parsed.success)return generic;
  const work=async()=>{
  const client=await pool.connect();let tokenId:string|undefined,userId:string|undefined,to='',link='';
  try{
   await client.query('BEGIN');
   // Serialize requests per account, including from different IPs/instances.
   const user=(await client.query(`SELECT id,email,password_hash FROM users WHERE lower(email)=lower($1) AND active=true FOR UPDATE`,[parsed.data.email])).rows[0];
   if(!user){await client.query('ROLLBACK');return generic;}
   userId=String(user.id);to=user.email;
   const recent=await client.query(`SELECT id FROM password_reset_email_tokens WHERE user_id=$1 AND created_at>now()-interval '5 minutes' LIMIT 1`,[userId]);
   if(recent.rows.length){await client.query('ROLLBACK');return generic;}
   const token=randomBytes(48).toString('base64url');
   link=base()+'/reset-password.html#token='+token;
   await client.query(`UPDATE password_reset_email_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`,[userId]);
   tokenId=String((await client.query(`INSERT INTO password_reset_email_tokens(user_id,token_hash,password_fingerprint,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes') RETURNING id`,[userId,digest(token),digest(user.password_hash)])).rows[0].id);
   await client.query('COMMIT');
  }catch{
   await client.query('ROLLBACK');
   request.log.error({event:'PASSWORD_RESET_PREPARATION_FAILED'},'Password reset belum tersedia');
   return generic;
  }finally{client.release();}
  try{
   await send(to,link);
   await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PASSWORD_RESET_EMAIL_SENT','{}'::jsonb)`,[userId]);
  }catch{
   // Failed delivery is visible in the existing notification history.
   await pool.query(`UPDATE password_reset_email_tokens SET used_at=now() WHERE id=$1`,[tokenId]);
   await pool.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PASSWORD_RESET_EMAIL_FAILED','{}'::jsonb)`,[userId]);
   request.log.error({event:'PASSWORD_RESET_EMAIL_FAILED'},'Pengiriman reset gagal; lihat riwayat Notifikasi Administrator');
  }
  return generic;
  };
  // SMTP is transactional work: do not return before delivery and its audit
  // finish. A detached loopback task can outlive the serverless invocation.
  try{return await work();}catch{
   request.log.error({event:'PASSWORD_RESET_PROCESS_FAILED'},'Pemulihan email belum tersedia');
   return generic;
  }
 });
 app.post('/api/auth/reset-password',{config:{rateLimit:{max:10,timeWindow:'15 minutes'}}},async(request,reply)=>{
  reply.header('cache-control','no-store');
  const parsed=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{64}$/),password:z.string().min(8).max(200)}).safeParse(request.body);
  if(!parsed.success)return reply.code(400).send({error:'INVALID_PASSWORD_RESET'});
  const passwordHash=await argon2.hash(parsed.data.password,{type:argon2.argon2id});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   // Lock the user first, as in issuance, to avoid a lock inversion with token rows.
   const user=(await client.query(`SELECT u.id,u.password_hash FROM users u JOIN password_reset_email_tokens t ON t.user_id=u.id WHERE t.token_hash=$1 AND u.active=true FOR UPDATE OF u`,[digest(parsed.data.token)])).rows[0];
   const token=user?(await client.query(`SELECT id,user_id FROM password_reset_email_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() AND password_fingerprint=$2 FOR UPDATE`,[digest(parsed.data.token),digest(user.password_hash)])).rows[0]:null;
   if(!token){await client.query('ROLLBACK');return reply.code(400).send({error:'RESET_LINK_INVALID_OR_EXPIRED'});}
   await client.query(`UPDATE users SET password_hash=$2 WHERE id=$1`,[user.id,passwordHash]);
   await client.query(`UPDATE password_reset_email_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`,[user.id]);
   await client.query(`UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`,[user.id]);
   await client.query(`UPDATE viewer_display_devices SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`,[user.id]);
   await client.query(`UPDATE password_reset_requests SET status='COMPLETED',resolved_at=now() WHERE user_id=$1 AND status='PENDING'`,[user.id]);
   await client.query(`INSERT INTO audit_logs(user_id,action,metadata) VALUES($1,'PASSWORD_RESET_BY_EMAIL','{}'::jsonb)`,[user.id]);
   await client.query('COMMIT');
   reply.clearCookie('access_token',{path:'/'});reply.clearCookie('refresh_token',{path:'/'});reply.clearCookie('refresh_token',{path:'/api/auth'});
   return {ok:true};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 });
}
