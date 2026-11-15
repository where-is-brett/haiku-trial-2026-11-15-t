# Bank statement import, slice 1: Read a statement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CSV text becomes rows of date, description and cents, or a plain error that adds nothing. Also creates the `bank-statement-import` feature flag, off, with its reader.

**Architecture:** Two small pure modules with no database access: `src/lib/statement.js` reads CSV text into rows and refuses the whole text on the first bad line; `src/lib/flags.js` reads `config/feature-flags.json` and answers whether a named flag is on. Nothing calls them yet; slices 2 and 3 do.

**Tech Stack:** Node 22.13+, built-in `node:test`, `node:assert/strict`, `node:fs`, `node:url`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "Goals", "Anti-goals", "Constraints", "How it gets built" (items 1 to 4, 6 is slice 2, 10 and 11) and slice 1 of the `wheelhouse-slices` block.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- `parseAmount` in `src/lib/money.js` and `parseDate` in `src/lib/dates.js` are used as they are; their signatures and behaviour do not change.
- Money is whole cents; money going out is negative.
- Dates are ISO `YYYY-MM-DD` once read.
- A bad row refuses the whole text. Nothing is returned for a text that has any bad row.

## Review Focus

1. `(1,234.50)` is read as `-123450`: brackets with a comma group.
2. A quoted description with a comma and a doubled quote (`"Say ""hi"", Ltd"`) keeps both as text.
3. Trailing blank lines, a blank line in the middle, and no newline at the end: every data row is still read.
4. `29/02/2026` is refused (not a leap year); `29/02/2028` is accepted.
5. An amount with more than two decimals (`12.345`) is refused, not rounded to cents.

Each line above gets its test in the task that owns it (Task 2).

---

## File Structure

- Create: `config/feature-flags.json` (the flag file; holds `"bank-statement-import": false`)
- Create: `src/lib/flags.js` (reads the flag file, answers `isOn`)
- Create: `tests/flags.test.js`
- Create: `src/lib/statement.js` (reads CSV text into rows, owns `StatementError`)
- Create: `tests/statement.test.js`

Existing files are not modified.

---

### Task 1: Feature flag reader and flag file

**Files:**
- Create: `config/feature-flags.json`
- Create: `src/lib/flags.js`
- Test: `tests/flags.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `loadFlags(path: string) -> Record<string, boolean>`: parses the JSON file at `path`. A missing file returns `{}` (every flag off). Invalid JSON throws.
  - `isOn(flags: Record<string, boolean>, name: string) -> boolean`: `true` only when `flags[name] === true`.

- [ ] **Step 1: Write the failing test**

```js
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
```

The test writes its bad fixture under `os.tmpdir()` and removes it afterwards; no fixture file is added to the repo.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flags.test.js`
Expected: FAIL with "Cannot find module" for `src/lib/flags.js`.

- [ ] **Step 3: Implement the flag file and reader**

Create `config/feature-flags.json` with exactly:

```json
{
  "bank-statement-import": false
}
```

In `src/lib/flags.js`, export `loadFlags` and `isOn` with the signatures above. `loadFlags` checks the file exists with `fs.existsSync`, returns `{}` when it does not, and otherwise returns `JSON.parse(fs.readFileSync(path, 'utf8'))`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flags.test.js`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add config/feature-flags.json src/lib/flags.js tests/flags.test.js
git commit -m "feat: add bank-statement-import feature flag, off"
```

---

### Task 2: Read a statement into rows

**Files:**
- Create: `src/lib/statement.js`
- Test: `tests/statement.test.js`

**Interfaces:**
- Consumes: `parseAmount(text: string) -> number` (cents) from `src/lib/money.js`; `parseDate(text: string) -> string` (ISO) from `src/lib/dates.js`.
- Produces:
  - `readStatement(text: string) -> Array<{ line: number, date: string, description: string, cents: number }>`. `line` is the 1-based physical line number in `text`. Blank lines produce no row.
  - `class StatementError extends Error` with `line: number | null`. `line` is `null` for a file-level refusal (not a statement, no transactions).

Messages (plain, user-facing later in slice 3; exact copy here):
- Header refused: `Not a bank statement: the first line must be Date,Description,Amount`, `line` 1 (or the first non-blank line's number).
- No data rows: `The statement has no transactions`, `line` null.
- Bad row: `Line <n>: <reason>`, where `<reason>` is one of `needs three fields`, `date must be DD/MM/YYYY`, `description is empty`, `amount is not a number`, `unclosed quote`.

- [ ] **Step 1: Write the failing tests**

```js
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
  assert.deepEqual(rows.map((r) => r.line), [2, 4]);
});

test('the sample statement reads as 128 rows', () => {
  const text = fs.readFileSync(fileURLToPath(new URL('../data/sample-statement.csv', import.meta.url)), 'utf8');
  assert.equal(readStatement(text).length, 128);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/statement.test.js`
Expected: FAIL with "Cannot find module" for `src/lib/statement.js`.

- [ ] **Step 3: Implement `readStatement` and `StatementError` in `src/lib/statement.js`**

Algorithm, in order:
1. Split `text` on `/\r?\n/`. Keep each line's 1-based index.
2. The first non-blank line is the header. Split it into fields with the quote-aware splitter below, trim each field, and compare to `['Date', 'Description', 'Amount']`. Any difference, or no non-blank line at all, throws `StatementError` with the "Not a bank statement" message.
3. Every later line that is blank after trimming is skipped.
4. Quote-aware splitter: walk the characters. `"` opens a quoted field when it starts the field; inside a quoted field `""` is one `"`, a lone `"` closes it; a comma outside quotes ends the field. An unclosed quote at end of line is a bad row (`unclosed quote`). Do not span lines.
5. A line with other than three fields is a bad row (`needs three fields`).
6. Date: trimmed field must match `/^(\d{2})\/(\d{2})\/(\d{4})$/` and the day must not exceed the days in that month for that year (leap years included, computed with `new Date(Date.UTC(y, m, 0)).getUTCDate()`). Otherwise bad row (`date must be DD/MM/YYYY`). Only then call `parseDate`.
7. Description: trimmed; empty is a bad row (`description is empty`).
8. Amount: trimmed. If it matches `/^\((.*)\)$/`, replace it with `-` plus the inner text. The result must match `/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/`; otherwise bad row (`amount is not a number`). Strip the commas, then `cents = parseAmount(stripped)`.
9. Each good line becomes `{ line, date, description, cents }`. The first bad line throws (no partial return). If no rows are collected after the header, throw `StatementError` with `line` null and the "no transactions" message.

Use `StatementError` with a `line` property for every thrown error. Do not change `money.js` or `dates.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/statement.test.js`
Expected: all eleven tests PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: the existing `tests/smoke.test.js` and both new files PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/statement.js tests/statement.test.js
git commit -m "feat: read bank statement CSV text into rows"
```

---

## Self-review notes

- Spec coverage: slice 1 done items map to Task 2 tests (brackets and minus, not a statement, one bad row names its line, CRLF and quoted commas). Flag file and reader (How it gets built item 10) are Task 1. Items 2, 3, 4, 11 of "How it gets built" are the rules in Task 2 step 6 to 8.
- Types: `readStatement` returns `{ line, date, description, cents }`; `StatementError.line` is `number | null`. Slice 2 consumes these names.
- No placeholders: every rule has its regex or its message.
