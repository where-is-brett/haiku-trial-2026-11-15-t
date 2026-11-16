# Month export, slice 1: The /export CSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/export?m=YYYY-MM` sends `spending-YYYY-MM.csv`, with the header `Date,Description,Amount,Category` and one row per transaction of that month, or a plain error and no file for a bad `m`. Behind the `month-export` flag, off by default.

**Architecture:** One new pure module, `src/lib/export.js`, holds the CSV rules (quoting, the month check, the category label) and `exportCsv(db, month)`, which reads the month's rows from the `transactions` table. `src/server.js` gets one route that checks the flag and the `m` parameter and sends the text. The month of a row is `substr(date, 1, 7)`, the same rule `listMonths` in `src/lib/months.js` uses.

**Tech Stack:** Node 22.13+, built-in `node:test`, `node:assert/strict`, `node:sqlite`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "Goals", "Anti-goals", "Constraints", "The calls made here" and slice 1 of its `wheelhouse-slices` block.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- `formatCents` in `src/lib/money.js` and `listMonths` in `src/lib/months.js` are used as they are; their signatures and behaviour do not change.
- The header row is exactly `Date,Description,Amount,Category`.
- Line endings are `\r\n`, after every line including the last.
- Amounts are plain decimals, two places, no thousands separator, with the stored sign, except income (Task 2).
- Rows are in date order, then id.
- The file is named `spending-YYYY-MM.csv`.
- A bad `m` is a plain error and no file. Nothing about the month page changes (slice 2).
- The `month-export` flag is `false` in `config/feature-flags.json`; with the flag off, `/export` answers 404 like any unknown path.

## Review Focus

1. A description with a line break is quoted, so one transaction can't split across two lines of the file.
2. `2026-13` and `2026-00` are a plain error, not an empty file: they match the shape but not a real month.
3. `m` given twice (`?m=2026-08&m=2026-09`) gets the plain error, not a file for one of the two months.
4. A zero amount is written `0.00`, never `-0.00`, including an income row at zero.
5. An income row already stored negative (the sample's `Brightwave Payroll`, `-2112.90`) is written `-2112.90`, not flipped to positive.

Each line above gets its test in the task that owns it: 1 in Task 1, 2, 4 and 5 in Task 2, 3 in Task 3.

---

### Task 1: CSV field quoting and the month check

**Files:**
- Create: `src/lib/export.js`
- Test: `tests/export.test.js`

**Interfaces:**
- Consumes: `CATEGORIES` and `categoryOf` from `src/lib/categories.js` (existing).
- Produces:
  - `csvField(text: string) -> string`: the text as one CSV field.
  - `isMonth(text: string | null) -> boolean`: true only for `YYYY-MM` naming a real month, 01 to 12.
  - `categoryLabel(description: string) -> string`: the label the month page shows for the row, from `categoryOf`. Edit-category replaces this body later; callers use only this name.

- [ ] **Step 1: Write the failing tests**

```js
// tests/export.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvField, isMonth, categoryLabel } from '../src/lib/export.js';

test('a field with a comma, a double quote or a line break is quoted, quotes doubled', () => {
  assert.equal(csvField('Pasta, Pizza & Co'), '"Pasta, Pizza & Co"');
  assert.equal(csvField('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvField('Line one\nLine two'), '"Line one\nLine two"');
  assert.equal(csvField('Eating out'), 'Eating out');
});

test('isMonth accepts YYYY-MM for months 01 to 12 only', () => {
  assert.equal(isMonth('2026-08'), true);
  assert.equal(isMonth('2026-12'), true);
  for (const bad of ['2026-13', '2026-00', '2026-8', '2026-08-01', '26-08', '', null]) {
    assert.equal(isMonth(bad), false, bad);
  }
});

test('categoryLabel gives the label the month page shows, not the key', () => {
  assert.equal(categoryLabel('Pasta, Pizza & Co'), 'Eating out');
  assert.equal(categoryLabel('Unknown Shop'), 'Other');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/export.test.js`
Expected: FAIL, with "Cannot find module" for `src/lib/export.js`.

- [ ] **Step 3: Implement `csvField`, `isMonth` and `categoryLabel` in `src/lib/export.js`**

Quote when the text holds a comma, a double quote, `\r` or `\n`; double each inner quote. `isMonth` tests `^\d{4}-(0[1-9]|1[0-2])$` and answers false for null. `categoryLabel` finds the entry in `CATEGORIES` whose key is `categoryOf(description)`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/export.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export.js tests/export.test.js
git commit -m "feat: add CSV quoting and the month check for the export"
```

---

### Task 2: The month's CSV text

**Files:**
- Modify: `src/lib/export.js`
- Test: `tests/export.test.js`

**Interfaces:**
- Consumes: `csvField`, `categoryLabel` from Task 1; `formatCents(cents: number) -> string` from `src/lib/money.js`; `createTable(db)` from `src/lib/store.js` in tests.
- Produces: `exportCsv(db: DatabaseSync, month: string) -> string`, the whole file text, with `\r\n` line endings and the header row first. A month with no rows gives the header row only.

- [ ] **Step 1: Write the failing tests**

Add to `tests/export.test.js`. A helper `withRows(rows)` at the top of the file creates a `:memory:` database, calls `createTable`, and inserts each `[date, description, cents]`.

```js
test('the header, then the month rows in date order then id, with the stored sign', () => {
  const db = withRows([
    ['2026-08-05', 'Pasta, Pizza & Co', 4250],
    ['2026-08-02', 'Pennywhistle Market', 10152],
    ['2026-08-05', 'Brightwave Payroll', -211290],
    ['2026-08-09', 'Hollis Insurance', -12350],
    ['2026-09-01', 'Lowtide Grocers', 580],
  ]);
  assert.equal(
    exportCsv(db, '2026-08'),
    'Date,Description,Amount,Category\r\n'
      + '2026-08-02,Pennywhistle Market,101.52,Groceries\r\n'
      + '2026-08-05,"Pasta, Pizza & Co",42.50,Eating out\r\n'
      + '2026-08-05,Brightwave Payroll,-2112.90,Income\r\n'
      + '2026-08-09,Hollis Insurance,-123.50,Bills\r\n',
  );
});

test('an income row is written negative, and a zero amount is 0.00', () => {
  const db = withRows([
    ['2026-08-03', 'Tidepool Interest', 320],
    ['2026-08-04', 'Brightwave Payroll', -211290],
    ['2026-08-06', 'Pennywhistle Market', 0],
    ['2026-08-07', 'Oakridge Dividends', 0],
  ]);
  const lines = exportCsv(db, '2026-08').split('\r\n');
  assert.equal(lines[1], '2026-08-03,Tidepool Interest,-3.20,Income');
  assert.equal(lines[2], '2026-08-04,Brightwave Payroll,-2112.90,Income');
  assert.equal(lines[3], '2026-08-06,Pennywhistle Market,0.00,Groceries');
  assert.equal(lines[4], '2026-08-07,Oakridge Dividends,0.00,Income');
});

test('a month with no transactions gives the header row only', () => {
  const db = withRows([['2026-09-01', 'Lowtide Grocers', 580]]);
  assert.equal(exportCsv(db, '2026-08'), 'Date,Description,Amount,Category\r\n');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/export.test.js`
Expected: FAIL, `exportCsv is not a function` (not yet exported).

- [ ] **Step 3: Implement `exportCsv(db, month)` in `src/lib/export.js`**

Query `SELECT id, date, description, cents FROM transactions WHERE substr(date, 1, 7) = ? ORDER BY date, id`. For each row, the amount is `categoryOf(description) === 'income' ? -Math.abs(cents) : cents`, formatted with `formatCents`. Join fields with `,` and lines with `\r\n`, header first, a trailing `\r\n` after the last line. The description goes through `csvField`; the category through `categoryLabel`.

Assumption to record in the report (not decided here): the approved doc says an income row is written negative "the same way the month totals count it". The month totals are not on this branch yet, so `-Math.abs` is the reading used until month-page merges and shows how totals count income.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/export.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export.js tests/export.test.js
git commit -m "feat: build a month's transactions as CSV text"
```

---

### Task 3: The `/export` route behind the flag

**Files:**
- Modify: `src/server.js` (add the route before the final 404 in `createApp`)
- Modify: `config/feature-flags.json` (add `"month-export": false`)
- Test: `tests/export.test.js`

**Interfaces:**
- Consumes: `exportCsv`, `isMonth` from Tasks 1 and 2; `isOn(flags, name)` from `src/lib/flags.js`.
- Produces: `GET /export?m=YYYY-MM`, answering:
  - flag off: 404, as any unknown path.
  - `m` missing, given twice, or not `isMonth`: 400, `text/plain; charset=utf-8`, body `m must be a month as YYYY-MM`, no `content-disposition`.
  - otherwise 200, `content-type: text/csv; charset=utf-8`, `content-disposition: attachment; filename="spending-YYYY-MM.csv"`, body from `exportCsv`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/export.test.js`. Each test starts the app with `createApp({ db, flags })` on port 0 and closes it in `finally`, as `tests/server.test.js` does.

- With the flag off (`flags: {}`), `GET /export?m=2026-08` answers 404.
- With the flag on (`flags: { 'month-export': true }`) and one `2026-08` row: status 200, `content-type` `text/csv; charset=utf-8`, `content-disposition` `attachment; filename="spending-2026-08.csv"`, body equal to `exportCsv(db, '2026-08')`.
- A bad `m` gives 400 with no file: `2026-13`, `2026-8`, an empty value, a missing `m`, and `?m=2026-08&m=2026-09`. Each has `content-type` `text/plain; charset=utf-8`, no `content-disposition`, and body `m must be a month as YYYY-MM`.
- An empty month (`m=2026-08`, no 2026-08 rows): status 200, body `Date,Description,Amount,Category\r\n`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/export.test.js`
Expected: FAIL. The flag-on tests get 404 instead of 200 because the route does not exist yet.

- [ ] **Step 3: Add the route in `src/server.js` and the flag in `config/feature-flags.json`**

In `createApp`, before the final `404`, add a branch for `/export` on `GET` when `isOn(flags, 'month-export')`. Read `url.searchParams.getAll('m')`. If it does not have exactly one value, or that value fails `isMonth`, write the 400 described above and return. Otherwise write the 200 with the two headers and `res.end(exportCsv(db, m))`. Add `import { exportCsv, isMonth } from './lib/export.js';` with the other imports.

In `config/feature-flags.json`, add `"month-export": false` after `"bank-statement-import": false`, keeping the file's format.

- [ ] **Step 4: Run the tests to verify they pass, then the whole suite**

Run: `node --test tests/export.test.js`
Expected: PASS.

Run: `npm test`
Expected: PASS, the existing 54 tests plus the new ones, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/server.js config/feature-flags.json tests/export.test.js
git commit -m "feat: serve the month as a CSV download behind the month-export flag"
```

---

## Verification

Before the slice is called done: `npm test` passes in this worktree, and the test names in `tests/export.test.js` cover each done line of slice 1 (header and rows, quoting and sign, empty month, bad `m`, file name). The report's `tests` says which files ran: `tests/export.test.js` and the full `npm test`.
