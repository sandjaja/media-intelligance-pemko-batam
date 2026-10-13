import assert from 'node:assert/strict';
import test from 'node:test';
import {parseApifyUsdBalance} from './apify-provider-balance.js';
test('does not mistake successful account lookup for confirmed USD balance',()=>{
 assert.equal(parseApifyUsdBalance({data:{id:'account',plan:'free'}}),null);
 assert.equal(parseApifyUsdBalance({data:{usageCredits:5}}),null);
 assert.equal(parseApifyUsdBalance({data:{availableBalanceUsd:'5'}}),null);
 assert.equal(parseApifyUsdBalance({data:{availableBalanceUsd:-1}}),null);
});
test('accepts only explicit finite nonnegative USD balance',()=>{
 assert.equal(parseApifyUsdBalance({data:{availableBalanceUsd:1.25}}),1.25);
 assert.equal(parseApifyUsdBalance({data:{availableBalanceUsd:0}}),0);
});
