import assert from 'node:assert/strict';
import test from 'node:test';
import {isApifyPreviewTestConnection} from './apify-preview-test-guard.js';
const base={databaseUrl:'postgresql://tester:pass@ep-raspy-violet-ayau9ftu.c-5.us-east-2.aws.neon.tech/db?sslmode=require',expectedHost:'ep-raspy-violet-ayau9ftu.c-5.us-east-2.aws.neon.tech',previewFlag:'true'};
test('requires explicit matching Neon hostname and preview opt-in',()=>{
 assert.equal(isApifyPreviewTestConnection(base),true);
 assert.equal(isApifyPreviewTestConnection({...base,expectedHost:'ep-production.neon.tech'}),false);
 assert.equal(isApifyPreviewTestConnection({...base,previewFlag:'false'}),false);
 assert.equal(isApifyPreviewTestConnection({...base,expectedHost:undefined}),false);
 assert.equal(isApifyPreviewTestConnection({...base,databaseUrl:'postgresql://tester:pass@localhost/db'}),false);
});
