import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apiUrl } from '../frontend/src/api-base.js';

test('api base stays same-origin unless it is public https', () => {
  assert.equal(apiUrl('', '/api/cases'), '/api/cases');
  assert.equal(apiUrl('https://lydia.example/', '/api/relay/tasks'), 'https://lydia.example/api/relay/tasks');
  for (const base of ['http://lydia.example', 'https://127.0.0.1:4318', 'https://localhost', 'https://10.0.0.8', 'https://192.168.1.20', 'https://user:secret@lydia.example']) {
    assert.throws(() => apiUrl(base, '/api/relay/tasks'), /https|本机|凭据/);
  }
  assert.throws(() => apiUrl('https://lydia.example', 'https://evil.example/api'), /路径/);
});

test('frontend source does not embed relay secrets', async () => {
  const files = ['api-base.js', 'api.js', 'RemoteApp.jsx', 'main.jsx', 'App.jsx'];
  const source = (await Promise.all(files.map(file => readFile(new URL('../frontend/src/' + file, import.meta.url), 'utf8')))).join('\n');
  assert.equal(source.includes('LYDIA_COORDINATION_DATABASE_URL'), false);
  assert.equal(source.includes('LYDIA_RELAY_BOOTSTRAP_TOKEN'), false);
  assert.equal(source.includes('LYDIA_OWNER_PASSWORD'), false);
  assert.equal(/ld_[A-Za-z0-9_-]{20,}/.test(source), false);
});
