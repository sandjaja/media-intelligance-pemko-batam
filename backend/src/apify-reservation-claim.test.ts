import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {claimApifyReservation} from './apify-reservation-claim.js';
const base={reservationKey:'manual:tiktok:1',actorId:'clockworks/tiktok-scraper',platform:'tiktok' as const,claimId:'claim:abcdefgh1234'};
test('claim requires one conditional update with RESERVED and no run id',async()=>{
 let sql='',args:unknown[]=[];
 const pool={query:async(q:string,p:unknown[])=>{sql=q;args=p;return{rows:[{reserved_usd:'0.500000'}]}}} as unknown as Pool;
 const result=await claimApifyReservation(pool,base);
 assert.equal(result.claimed,true);
 assert.equal(result.reservedUsd,0.5);
 assert.match(sql,/status='RESERVED' AND run_id IS NULL/);
 assert.match(sql,/status='RUNNING'/);
 assert.deepEqual(args,[base.reservationKey,base.actorId,'tiktok',base.claimId]);
});
test('duplicate claims and malformed claim ids fail closed',async()=>{
 const pool={query:async()=>({rows:[]})} as unknown as Pool;
 assert.equal((await claimApifyReservation(pool,base)).claimed,false);
 assert.equal((await claimApifyReservation(pool,{...base,claimId:'bad'})).reason,'APIFY_CLAIM_INVALID');
});
