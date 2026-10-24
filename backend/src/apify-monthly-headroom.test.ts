import assert from 'node:assert/strict';
import test from 'node:test';
import {parseApifyMonthlyHeadroom} from './apify-monthly-headroom.js';
test('computes monthly account usage headroom from documented limits response',()=>{
 assert.equal(parseApifyMonthlyHeadroom({data:{limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:1.75}}}),3.25);
 assert.equal(parseApifyMonthlyHeadroom({data:{limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:6}}}),0);
});
test('rejects absent, invalid or string-valued provider usage fields',()=>{
 for(const payload of [{data:{id:'ok'}},{data:{limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:'2'}}},{data:{limits:{maxMonthlyUsageUsd:5},current:{monthlyUsageUsd:-1}}},null])
  assert.equal(parseApifyMonthlyHeadroom(payload),null);
});
