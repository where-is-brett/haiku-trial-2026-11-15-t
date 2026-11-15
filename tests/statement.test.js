// tests/statement.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { readStatement, StatementError } from '../src/lib/statement.js';

const H = 'Date,Description,Amount\n';

test('brackets are money out, minus signs are money out, commas group thousands', () => {
  const rows = readStatement(`${H}19/08/2026,Marlowe,(40.00)\n25/08/2026,Payroll,-2100.00\n01/09/2026,Pay,"1,234.50"\n`);
  assert.deepEqual(rows.map((r) => r.cents), [-4000, -210000, 123450]);
});

test('brackets with a comma group are money out', () => {
  assert.equal(readStatement(`${H}01/09/2026,Rent,"(1,234.50)"\n`)[0].cents, -123450);
});

test('a date is read as ISO, and a leap day is checked', () => {
  assert.equal(readStatement(`${H}29/02/2028,X,1.00\n`)[0].date, '2028-02-29');
  assert.throws(() => readStatement(`${H}29/02/2026,X,1.00\n`), /Line 2: date/);
  assert.throws(() => readStatement(`${H}31/02/2026,X,1.00\n`), /Line 2: date/);
});

test('a file that is not a statement is refused with a plain error', () => {
  assert.throws(() => readStatement('Name,Total\nA,1\n'), (e) => e instanceof StatementError && /Not a bank statement/.test(e.message));
  assert.throws(() => readStatement(''), /Not a bank statement/);
});

test('a header-only file is refused, not read as zero rows', () => {
  assert.throws(() => readStatement(H), (e) => e instanceof StatementError && e.line === null && /no transactions/.test(e.message));
});

test('one bad row refuses the whole text and names its line', () => {
  const bad = `${H}02/08/2026,A,1.00\n03/08/2026,B\n`;
  assert.throws(() => readStatement(bad), (e) => e instanceof StatementError && e.line === 3 && /Line 3: needs three fields/.test(e.message));
});

test('a blank description is a bad row', () => {
  assert.throws(() => readStatement(`${H}02/08/2026,   ,1.00\n`), /Line 2: description is empty/);
});

test('an amount with more than two decimals is refused, not rounded', () => {
  assert.throws(() => readStatement(`${H}02/08/2026,A,12.345\n`), /Line 2: amount/);
});

test('CRLF line endings and quoted commas are read correctly', () => {
  const rows = readStatement('Date,Description,Amount\r\n02/08/2026,"Skyline, Broadband",8.58\r\n');
  assert.deepEqual(rows, [{ line: 2, date: '2026-08-02', description: 'Skyline, Broadband', cents: 858 }]);
});

test('a doubled quote inside a quoted field is one quote', () => {
  assert.equal(readStatement(`${H}02/08/2026,"Say ""hi"", Ltd",1.00\n`)[0].description, 'Say "hi", Ltd');
});

test('blank lines in the middle and at the end are skipped, and no final newline is fine', () => {
  const rows = readStatement(`${H}02/08/2026,A,1.00\n\n   \n03/08/2026,B,2.00`);
  assert.deepEqual(rows.map((r) => r.line), [2, 5]);
});

test('the sample statement reads as 128 rows', () => {
  const text = fs.readFileSync(fileURLToPath(new URL('../data/sample-statement.csv', import.meta.url)), 'utf8');
  assert.equal(readStatement(text).length, 128);
});

test('text after a closing quote is refused, not joined into the field', () => {
  assert.throws(() => readStatement(`${H}02/08/2026,A,"1"2.5\n`), (e) => e instanceof StatementError && e.line === 2 && /Line 2: unexpected text after a closing quote/.test(e.message));
  assert.throws(() => readStatement(`${H}02/08/2026,"Joe's "Pizza" shop",1.00\n`), (e) => e instanceof StatementError && e.line === 2 && /Line 2: unexpected text after a closing quote/.test(e.message));
});

test('spaces after a closing quote, before the comma, are allowed', () => {
  assert.equal(readStatement(`${H}02/08/2026,"A" ,1.00\n`)[0].description, 'A');
});
