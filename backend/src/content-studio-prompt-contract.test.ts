import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./phase5-strategy-routes.ts', import.meta.url), 'utf8');

test('Content Studio keeps database base prompt as an addition to existing production instructions', () => {
  assert.match(source, /task_code='content_studio_prompting'/);
  assert.match(source, /\.\.\.\(basicPrompt\?\[/);
  assert.match(source, /\.\.\.lines\]\.join\('\\n'\)/);
  assert.match(source, /GUARDRAIL WAJIB/);
  assert.match(source, /SUPPORTING SOURCES/);
  assert.match(source, /OFFICIAL ASSETS/);
});

test('Preparing a Content Studio prompt does not invoke a model or consume tokens', () => {
  const start = source.indexOf("const basicPromptRow=await pool.query(\"SELECT prompt_text,version FROM ai_humas_task_prompts WHERE task_code='content_studio_prompting'");
  const end = source.indexOf("app.get('/api/phase6/content-projects/:id/sources'", start);
  assert.ok(start >= 0 && end > start);
  const preparation = source.slice(start, end);
  assert.match(preparation, /executionMode:'PROMPT_ONLY'/);
  assert.match(preparation, /executionReady:false/);
  assert.doesNotMatch(preparation, /executeConfiguredAi\(|generateContent|invokeAiProvider\(/);
});

test('Content Studio fails closed when the database base prompt is missing', () => {
  assert.match(source, /AI_CONTENT_STUDIO_BASE_PROMPT_NOT_CONFIGURED/);
  assert.doesNotMatch(source, /task_code='content_studio_prompting' LIMIT 1"\)\.catch\(/);
});
