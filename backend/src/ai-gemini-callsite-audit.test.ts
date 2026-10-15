import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const directCallers = [
  'intelligence.ts',
  'ask-intelligence-core.ts',
  'phase3-outcome-routes.ts',
  'phase5-strategy-routes.ts',
  'issue-linkage-context-matcher.ts',
  'issue-response-coverage.ts',
  'issue-dynamic-claim-extractor.ts',
];

test('direct Gemini analysis call sites use database configuration and shared quota', () => {
  for (const filename of directCallers) {
    const source = readFileSync(new URL('./' + filename, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /process\.env\.GEMINI_API_KEY/, filename + ' must not use environment credentials');
    assert.doesNotMatch(source, /process\.env\.GEMINI_MODEL/, filename + ' must not use environment model');
    assert.match(source, /reserveGeminiDailyRequest|reserveGeminiDailyQuota|prepareGeminiRequest/, filename + ' must reserve quota');
  }
});

test('provider adapter keeps OpenAI and Gemini API hosts distinct', () => {
  const source = readFileSync(new URL('./ai-provider-adapters.ts', import.meta.url), 'utf8');
  assert.match(source, /api\.openai\.com\/v1\/responses/);
  assert.match(source, /generativelanguage\.googleapis\.com/);
  assert.match(source, /api\.anthropic\.com\/v1\/messages/);
});
