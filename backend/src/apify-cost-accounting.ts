/**
 * Pure Apify cost accounting primitives. This module does not execute Actors
 * or write to the database. Future execution must reserve estimated cost
 * atomically in a persistent ledger before starting a billable Actor.
 */
export type ApifyCostEntry={
  runId:string;
  actorId:string;
  startedAt:string;
  costUsd:number;
  status:'SUCCEEDED'|'FAILED'|'RUNNING';
};
export type ApifyMonthlyUsage={
  month:string;
  spentUsd:number;
  runningCostUsd:number;
  completedRuns:number;
  runningRuns:number;
};
const validAmount=(n:number)=>Number.isFinite(n)&&n>=0;
export function apifyMonthUtc(date:Date):string{
 if(Number.isNaN(date.getTime()))throw new Error('INVALID_APIFY_DATE');
 return date.toISOString().slice(0,7);
}
export function summarizeApifyUsage(entries:ApifyCostEntry[],month:string):ApifyMonthlyUsage{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('INVALID_APIFY_MONTH');
 const ids=new Set<string>();let spentUsd=0,runningCostUsd=0,completedRuns=0,runningRuns=0;
 for(const e of entries){
  if(!e.runId||!e.actorId||ids.has(e.runId))throw new Error('INVALID_APIFY_LEDGER_ENTRY');
  ids.add(e.runId);
  if(!validAmount(e.costUsd)||Number.isNaN(Date.parse(e.startedAt)))throw new Error('INVALID_APIFY_LEDGER_ENTRY');
  if(e.startedAt.slice(0,7)!==month)continue;
  if(e.status==='RUNNING'){runningCostUsd+=e.costUsd;runningRuns++}
  else if(e.status==='SUCCEEDED'||e.status==='FAILED'){spentUsd+=e.costUsd;completedRuns++}
  else throw new Error('INVALID_APIFY_LEDGER_STATUS');
 }
 return{month,spentUsd,runningCostUsd,completedRuns,runningRuns};
}
