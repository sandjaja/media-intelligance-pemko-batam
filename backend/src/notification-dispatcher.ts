import type { Pool } from 'pg';
import { decryptIntegrationCredential } from './integration-credentials.js';
import nodemailer from 'nodemailer';

export async function dispatchPendingTelegramNotifications(pool:Pool,limit=20){
 await recoverStaleProcessing(pool,'TELEGRAM');
 const channel=(await pool.query(`SELECT credential_ciphertext FROM notification_channels WHERE code='TELEGRAM' AND status='ACTIVE' LIMIT 1`)).rows[0];
 if(!channel?.credential_ciphertext)return{processed:0,sent:0,failed:0};
 let botToken='';try{botToken=String(JSON.parse(decryptIntegrationCredential(channel.credential_ciphertext)).botToken||'');}catch{return{processed:0,sent:0,failed:0};}
 if(!botToken)return{processed:0,sent:0,failed:0};
 const {rows}=await pool.query(`SELECT d.id,d.title_snapshot,d.message_snapshot,u.chat_id FROM notification_deliveries d JOIN user_notification_channels u ON u.user_id=d.user_id AND u.channel='TELEGRAM' AND u.enabled=true AND u.verified_at IS NOT NULL WHERE d.channel='TELEGRAM' AND d.status IN ('PENDING','FAILED') AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=NOW()) AND u.chat_id IS NOT NULL ORDER BY d.created_at ASC LIMIT $1`,[Math.max(1,Math.min(100,limit))]);
 let sent=0,failed=0;
 for(const row of rows){
  const claimed=await pool.query(`UPDATE notification_deliveries SET status='PROCESSING',attempt_count=attempt_count+1,last_attempt_at=NOW(),updated_at=NOW() WHERE id=$1 AND status IN ('PENDING','FAILED') RETURNING attempt_count`,[row.id]);if(!claimed.rowCount)continue;
  try{const text=[row.title_snapshot?'<b>'+escapeHtml(String(row.title_snapshot))+'</b>':'',escapeHtml(String(row.message_snapshot||''))].filter(Boolean).join('\n\n');const r=await fetch('https://api.telegram.org/bot'+encodeURIComponent(botToken)+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:String(row.chat_id),text,parse_mode:'HTML'}),signal:AbortSignal.timeout(10000)});const data:any=await r.json().catch(()=>null);if(!r.ok||!data?.ok)throw new Error(String(data?.description||('HTTP '+r.status)));await pool.query(`UPDATE notification_deliveries SET status='SENT',sent_at=NOW(),last_error=NULL,next_attempt_at=NULL,updated_at=NOW() WHERE id=$1`,[row.id]);sent++;}catch(error:any){const attempt=Number(claimed.rows[0]?.attempt_count||1),minutes=Math.min(60,Math.pow(2,Math.min(5,attempt)));await pool.query(`UPDATE notification_deliveries SET status='FAILED',last_error=$2,next_attempt_at=NOW()+($3::text||' minutes')::interval,updated_at=NOW() WHERE id=$1`,[row.id,String(error?.message||'Telegram send failed').slice(0,300),String(minutes)]);failed++;}
 }
 return{processed:rows.length,sent,failed};
}
async function recoverStaleProcessing(pool:Pool,channel:'EMAIL'|'TELEGRAM'){
 await pool.query(`UPDATE notification_deliveries SET status='FAILED',last_error=COALESCE(last_error,'Pengiriman terputus sebelum selesai.'),next_attempt_at=NOW(),updated_at=NOW() WHERE channel=$1 AND status='PROCESSING' AND last_attempt_at<NOW()-INTERVAL '5 minutes'`,[channel]);
}
function escapeHtml(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

export async function dispatchPendingEmailNotifications(pool:Pool,limit=20){
 await recoverStaleProcessing(pool,'EMAIL');
 const channel=(await pool.query(`SELECT credential_ciphertext,settings FROM notification_channels WHERE code='EMAIL' AND status='ACTIVE' LIMIT 1`)).rows[0];
 if(!channel?.credential_ciphertext)return{processed:0,sent:0,failed:0};
 let password='';try{password=String(JSON.parse(decryptIntegrationCredential(channel.credential_ciphertext)).password||'');}catch{return{processed:0,sent:0,failed:0};}
 const s=channel.settings||{};if(!s.host||!s.port||!s.fromEmail||!password)return{processed:0,sent:0,failed:0};
 const transport=nodemailer.createTransport({host:String(s.host),port:Number(s.port),secure:Boolean(s.secure),auth:s.username?{user:String(s.username),pass:password}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
 const {rows}=await pool.query(`SELECT d.id,d.title_snapshot,d.message_snapshot,u.email FROM notification_deliveries d JOIN users u ON u.id=d.user_id AND u.active=true WHERE d.channel='EMAIL' AND d.status IN ('PENDING','FAILED') AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=NOW()) ORDER BY d.created_at ASC LIMIT $1`,[Math.max(1,Math.min(100,limit))]);
 let sent=0,failed=0;
 for(const row of rows){const claimed=await pool.query(`UPDATE notification_deliveries SET status='PROCESSING',attempt_count=attempt_count+1,last_attempt_at=NOW(),updated_at=NOW() WHERE id=$1 AND status IN ('PENDING','FAILED') RETURNING attempt_count`,[row.id]);if(!claimed.rowCount)continue;try{await transport.sendMail({from:{name:String(s.fromName||'Media Intelligence Pemko Batam'),address:String(s.fromEmail)},to:String(row.email),subject:String(row.title_snapshot||'Media Intelligence Pemko Batam'),text:String(row.message_snapshot||''),html:'<p>'+escapeHtml(String(row.message_snapshot||'')).replace(/\n/g,'<br>')+'</p>'});await pool.query(`UPDATE notification_deliveries SET status='SENT',sent_at=NOW(),last_error=NULL,next_attempt_at=NULL,updated_at=NOW() WHERE id=$1`,[row.id]);sent++;}catch(error:any){const attempt=Number(claimed.rows[0]?.attempt_count||1),minutes=Math.min(60,Math.pow(2,Math.min(5,attempt)));await pool.query(`UPDATE notification_deliveries SET status='FAILED',last_error=$2,next_attempt_at=NOW()+($3::text||' minutes')::interval,updated_at=NOW() WHERE id=$1`,[row.id,String(error?.message||'Email send failed').replace(/(pass(word)?|auth)=?[^ ]*/gi,'credential').slice(0,300),String(minutes)]);failed++;}}
 transport.close();return{processed:rows.length,sent,failed};
}
export async function dispatchPendingNotifications(pool:Pool,limit=20){const [telegram,email]=await Promise.all([dispatchPendingTelegramNotifications(pool,limit),dispatchPendingEmailNotifications(pool,limit)]);return{telegram,email};}
