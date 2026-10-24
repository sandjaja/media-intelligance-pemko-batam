import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {loadApifyAccountHeadroom} from './apify-account-headroom.js';
function pool(rows:unknown[]){return{query:async()=>({rows})} as unknown as Pool;}
test('missing or ambiguous enabled Apify credentials do not trigger a network call',async()=>{
 const noFetch=(async()=>{throw Error('unexpected network call')}) as typeof fetch;
 assert.equal(await loadApifyAccountHeadroom(pool([]),noFetch),null);
 assert.equal(await loadApifyAccountHeadroom(pool([{},{}]),noFetch),null);
 assert.equal(await loadApifyAccountHeadroom(pool([{credential_ciphertext:null}]),noFetch),null);
});
test('invalid encrypted credential fails closed',async()=>{
 const noFetch=(async()=>{throw Error('unexpected network call')}) as typeof fetch;
 assert.equal(await loadApifyAccountHeadroom(pool([{credential_ciphertext:'not-a-valid-ciphertext'}]),noFetch),null);
});
