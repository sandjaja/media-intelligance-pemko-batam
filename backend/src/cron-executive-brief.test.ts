import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedExecutiveBriefCron } from './cron-executive-brief.js';

test('Executive Brief cron rejects absent secret and absent Authorization', () => {
  assert.equal(isAuthorizedExecutiveBriefCron('GET', undefined, undefined), false);
  assert.equal(isAuthorizedExecutiveBriefCron('GET', 'Bearer token', undefined), false);
  assert.equal(isAuthorizedExecutiveBriefCron('GET', undefined, 'token'), false);
});

test('Executive Brief cron requires exact Bearer secret', () => {
  assert.equal(isAuthorizedExecutiveBriefCron('GET', 'Bearer wrong', 'token'), false);
  assert.equal(isAuthorizedExecutiveBriefCron('GET', 'token', 'token'), false);
  assert.equal(isAuthorizedExecutiveBriefCron('GET', 'Bearer token', 'token'), true);
});

test('Executive Brief cron does not allow mutation methods', () => {
  assert.equal(isAuthorizedExecutiveBriefCron('POST', 'Bearer token', 'token'), false);
  assert.equal(isAuthorizedExecutiveBriefCron('PUT', 'Bearer token', 'token'), false);
});
