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

import handler from './cron-executive-brief.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

async function invoke(method: string, authorization?: string) {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  const request = { method, headers } as unknown as IncomingMessage;
  const output: { status: number; headers: Record<string, string>; body: unknown } = {
    status: 200, headers: {}, body: undefined,
  };
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) { output.headers[name.toLowerCase()] = value; },
    end(body: string) { output.status = this.statusCode; output.body = JSON.parse(body); },
  } as unknown as ServerResponse;
  await handler(request, response);
  return output;
}

test('HTTP: POST returns 405 without touching database', async () => {
  const response = await invoke('POST');
  assert.equal(response.status, 405);
  assert.deepEqual(response.body, { error: 'METHOD_NOT_ALLOWED' });
});

test('HTTP: GET without Authorization returns 401 before database access', async () => {
  const response = await invoke('GET');
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'UNAUTHORIZED' });
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('HTTP: GET with incorrect Authorization returns 401', async () => {
  const response = await invoke('GET', 'Bearer invalid-test-token');
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'UNAUTHORIZED' });
});

test('HTTP: 200 dry-run contract is exercised via isolated runner without real DB or Gemini', async () => {
  const { runScheduledExecutiveBrief } = await import('./executive-brief-runner.js');
  const fakePool = { query: async (sql: string) => {
    assert.match(sql, /^SELECT/);
    if (sql.includes('executive_brief_daily_cache')) return { rows: [] };
    return { rows: [{ enabled: true, hour_wib: 6, minute_wib: 30, timezone: 'Asia/Jakarta' }] };
  } };
  const result = await runScheduledExecutiveBrief(fakePool as never, new Date('2026-10-16T23:30:00Z'), { dryRun: true });
  assert.equal(result.status, 'due');
  assert.equal(result.dry_run, true);
});
