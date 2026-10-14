import type {Pool} from 'pg';
/** Verify that a completed provider run was recorded by our own paid-run
 * executor. A provider run ID alone is never sufficient authorization.
 * This is read-only and fails closed on duplicate or provisional claims.
 */
export async function verifyApifyLedgerRun(pool:Pool,input:{
 runId:string;actorId:'clockworks/tiktok-scraper'|'apify/instagram-scraper';
 platform:'tiktok'|'instagram';
}):Promise<void>{
 if(!/^[a-zA-Z0-9_-]{5,160}$/.test(input.runId))throw Error('APIFY_LEDGER_RUN_ID_INVALID');
 if((input.platform==='tiktok')!==(input.actorId==='clockworks/tiktok-scraper'))throw Error('APIFY_LEDGER_ACTOR_PLATFORM_MISMATCH');
 const {rows}=await pool.query(
  `SELECT reservation_key,actor_id,platform,status,run_id
   FROM apify_usage_ledger WHERE run_id=$1 LIMIT 2`,[input.runId]);
 if(rows.length!==1)throw Error('APIFY_LEDGER_RUN_NOT_UNIQUELY_AUTHORIZED');
 const row=rows[0] as Record<string,unknown>;
 if(row.run_id!==input.runId||row.actor_id!==input.actorId||row.platform!==input.platform||
    !['RUNNING','SUCCEEDED','COMPLETED'].includes(String(row.status))||
    typeof row.reservation_key!=='string'||!row.reservation_key.trim())
  throw Error('APIFY_LEDGER_RUN_NOT_AUTHORIZED');
}
