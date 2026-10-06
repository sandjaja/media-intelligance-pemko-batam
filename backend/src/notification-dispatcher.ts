import type { Pool } from 'pg';
import { decryptIntegrationCredential } from './integration-credentials.js';

export async function dispatchPendingTelegramNotifications(pool:Pool,limit=20){
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
function escapeHtml(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
