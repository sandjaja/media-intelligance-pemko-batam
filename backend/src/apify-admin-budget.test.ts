import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import {loadApifyAdminBudget} from './apify-admin-budget.js';
function mock(rows:{budget:unknown}[]){return{query:async()=>({rows})} as unknown as Pool;}
test('reads dynamically saved Admin budget',async()=>{
 assert.equal(await loadApifyAdminBudget(mock([{budget:'3.75'}])),3.75);
});
test('missing, invalid or ambiguous Admin budget fails closed',async()=>{
 for(const rows of [[],[{budget:null}],[{budget:'oops'}],[{budget:'0'}],[{budget:'6'}],[{budget:'4'},{budget:'3'}]])
  assert.equal(await loadApifyAdminBudget(mock(rows)),null);
});
