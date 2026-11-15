// tests/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configFromEnv, createApp } from '../src/server.js';

test('the port and database path come from the environment, with defaults', () => {
  assert.deepEqual(configFromEnv({}), { port: 3000, dbPath: 'ledger.db' });
  assert.deepEqual(configFromEnv({ PORT: '8080', LEDGER_DB: ':memory:' }), { port: 8080, dbPath: ':memory:' });
});

test(':memory: works and the home page answers', async () => {
  const server = createApp({ db: new DatabaseSync(':memory:'), flags: {} });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Nothing imported yet/);
  } finally {
    server.close();
  }
});

test('the server starts from its entry point and answers the home page', async () => {
  const entry = fileURLToPath(new URL('../src/server.js', import.meta.url));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env: { ...process.env, PORT: '0', LEDGER_DB: ':memory:' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      let stdout = '';
      const timer = setTimeout(() => {
        reject(new Error(`no "listening on" line within 10 seconds; stdout: ${JSON.stringify(stdout)}; stderr: ${JSON.stringify(stderr)}`));
      }, 10000);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited with code ${code} before listening; stdout: ${JSON.stringify(stdout)}; stderr: ${JSON.stringify(stderr)}`));
      });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        const match = stdout.match(/listening on (\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
    });
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Nothing imported yet/);
  } finally {
    child.kill();
    await exited;
  }
});
