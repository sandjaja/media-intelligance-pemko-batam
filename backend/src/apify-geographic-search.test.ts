import assert from 'node:assert/strict';
import test from 'node:test';
import {buildGeographicSearchPlan} from './apify-geographic-search.js';
import type {OrganizationMediaScope} from './organization-media-scope.js';
const scope={organizationId:1,organizationName:'Pemko Batam',cityName:'Batam',governmentAliases:[],districts:['Sekupang','Batu Aji'],villages:['Tanjung Riau'],areaAliases:['Batam Center'],actors:[]} satisfies OrganizationMediaScope;
test('builds geographic discovery terms from tenant scope, not hardcoded locations',()=>{
 const plan=buildGeographicSearchPlan(scope);
 assert.deepEqual(plan.queries,['Batam','Sekupang Batam','Batu Aji Batam','Tanjung Riau Batam','Batam Center Batam']);
 assert.equal(plan.organizationId,1);
 assert.equal(plan.queries.includes('Sekupang'),false);
});
test('fails closed when city identity is unavailable',()=>{
 assert.throws(()=>buildGeographicSearchPlan({...scope,cityName:null}),/APIFY_CITY_SCOPE_UNAVAILABLE/);
});
