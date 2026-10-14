import type {Pool} from 'pg';

/** Atomically reserve a bounded amount in the shared Apify monthly ledger.
 * Uses a transaction-scoped advisory lock so concurrent scheduler/manual runs
 * cannot independently spend the same remaining budget. Does not run Actors.
 */
export async function reserveApifyCost(pool:Pool,input:{
 reservationKey:string;actorId:string;platform:'instagram'|'tiktok';
 estimatedUsd:number;monthlyBudgetUsd:number;providerBalanceUsd:number;
 now?:Date;
}):Promise<{reserved:boolean;reason:string;remainingUsd:number|null}>{
 const {reservationKey,actorId,platform,estimatedUsd,monthlyBudgetUsd,providerBalanceUsd}=input;
 if(!reservationKey||!actorId||!['instagram','tiktok'].includes(platform)||![estimatedUsd,monthlyBudgetUsd,providerBalanceUsd].every(n=>Number.isFinite(n)&&n>=0))
  return{reserved:false,reason:'APIFY_INVALID_RESERVATION_INPUT',remainingUsd:null};
 if(estimatedUsd===0)return{reserved:false,reason:'APIFY_ESTIMATE_REQUIRED',remainingUsd:null};
 const now=input.now??new Date();
 if(Number.isNaN(now.getTime()))return{reserved:false,reason:'APIFY_INVALID_RESERVATION_DATE',remainingUsd:null};
 const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const nextMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('apify_usage_ledger_monthly_budget'))");
  const {rows}=await client.query(`
   SELECT COALESCE(SUM(CASE WHEN status IN ('RESERVED','RUNNING','UNKNOWN')
     THEN GREATEST(reserved_usd,COALESCE(actual_usd,0))
     ELSE GREATEST(COALESCE(actual_usd,reserved_usd),reserved_usd) END),0)::text AS committed
   FROM apify_usage_ledger
   WHERE started_at >= $1 AND started_at < $2`,[monthStart,nextMonth]);
  const committed=Number(rows[0]?.committed);
  if(!Number.isFinite(committed))throw new Error('APIFY_LEDGER_INVALID_TOTAL');
  // Provider headroom may be stale between independent manual/scheduler runs.
 // Deduct this month's local commitments as a conservative allowance buffer.
 const remaining=Math.max(0,Math.min(monthlyBudgetUsd-committed,providerBalanceUsd-committed));
  if(estimatedUsd>remaining){await client.query('ROLLBACK');return{reserved:false,reason:'APIFY_BUDGET_EXCEEDED',remainingUsd:remaining}}
  const inserted=await client.query(`INSERT INTO apify_usage_ledger
   (reservation_key,actor_id,platform,status,reserved_usd,started_at)
   VALUES ($1,$2,$3,'RESERVED',$4,$5)
   ON CONFLICT (reservation_key) DO NOTHING RETURNING id`,
   [reservationKey,actorId,platform,estimatedUsd,now]);
  if(!inserted.rowCount){await client.query('ROLLBACK');return{reserved:false,reason:'APIFY_DUPLICATE_RESERVATION',remainingUsd:remaining}}
  await client.query('COMMIT');
  return{reserved:true,reason:'APIFY_RESERVED',remainingUsd:remaining-estimatedUsd};
 }catch(error){
  try{await client.query('ROLLBACK')}catch{}
  throw error;
 }finally{client.release()}
}
