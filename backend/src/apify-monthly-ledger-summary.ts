import type {Pool} from 'pg';

/** Read-only, conservative monthly commitments. Never creates ledger rows.
 * Missing ledger, duplicate tenant scope or query failure => null (fail closed).
 */
export async function loadApifyMonthlyLedgerCommitment(pool:Pool,now:Date=new Date()):Promise<number|null>{
 if(Number.isNaN(now.getTime()))return null;
 const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
 try{
  const {rows}=await pool.query(`
   SELECT COALESCE(SUM(
    GREATEST(reserved_usd,COALESCE(actual_usd,0))
   ),0)::text AS committed
   FROM apify_usage_ledger
   WHERE started_at >= $1 AND started_at < $2`,[start,end]);
  if(rows.length!==1)return null;
  const amount=Number(rows[0]?.committed);
  return Number.isFinite(amount)&&amount>=0?amount:null;
 }catch{return null}
}
