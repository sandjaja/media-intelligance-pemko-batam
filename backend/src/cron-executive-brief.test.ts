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

import handler, { createExecutiveBriefCronHandler } from './cron-executive-brief.js';
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
    end(body: string) { output.status = (this as { statusCode: number }).statusCode; output.body = JSON.parse(body); },
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

test('HTTP: authorized GET returns 200 dry-run with injected pool and no AI call', async () => {
  const previousSecret = process.env.CRON_SECRET;
  const previousDatabase = process.env.DATABASE_URL;
  process.env.CRON_SECRET = 'test-secret-only';
  process.env.DATABASE_URL = 'postgresql://mock-only';
  let closed = false;
  let executions = 0;
  try {
    const injected = createExecutiveBriefCronHandler({
      createPool: () => ({
        query: async () => { throw new Error('UNEXPECTED_DB_QUERY'); },
        end: async () => { closed = true; },
      }) as never,
      runDryRun: async () => {
        executions++;
        return { date: '2026-10-17', status: 'disabled', dry_run: true };
      },
    });
    const request = { method: 'GET', headers: { authorization: 'Bearer test-secret-only' } } as unknown as IncomingMessage;
    let status = 200;
    let payload: Record<string, unknown> = {};
    const response = {
      statusCode: 200,
      setHeader() {},
      end(body: string) { status = response.statusCode; payload = JSON.parse(body); },
    } as unknown as ServerResponse & { statusCode: number };
    await injected(request, response);
    assert.equal(status, 200);
    assert.equal(executions, 1);
    assert.equal(closed, true);
    assert.equal((payload.data as { dry_run: boolean }).dry_run, true);
    assert.equal(payload.scheduler_connected, false);
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousSecret;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
  }
});
