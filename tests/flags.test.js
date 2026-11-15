// tests/flags.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFlags, isOn } from '../src/lib/flags.js';

const flagFile = fileURLToPath(new URL('../config/feature-flags.json', import.meta.url));

test('the bank-statement-import flag ships off', () => {
  assert.equal(isOn(loadFlags(flagFile), 'bank-statement-import'), false);
});

test('isOn is true only for a flag set to true', () => {
  assert.equal(isOn({ 'bank-statement-import': true }, 'bank-statement-import'), true);
  assert.equal(isOn({ 'bank-statement-import': false }, 'bank-statement-import'), false);
  assert.equal(isOn({ 'bank-statement-import': 'yes' }, 'bank-statement-import'), false);
  assert.equal(isOn({}, 'bank-statement-import'), false);
});

test('a missing flag file means every flag is off', () => {
  assert.deepEqual(loadFlags('config/no-such-file.json'), {});
});

test('a flag file that is not JSON is an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flags-'));
  const file = path.join(dir, 'flags.json');
  fs.writeFileSync(file, '{ not json');
  try {
    assert.throws(() => loadFlags(file), SyntaxError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
