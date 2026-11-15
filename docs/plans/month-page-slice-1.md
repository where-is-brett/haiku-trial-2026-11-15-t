# Month page, slice 1: Totals by category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/month?m=YYYY-MM` shows one row per category that has transactions in that month, each with its total, a grand total row, and links to the months either side. A malformed `m` gets a plain error. A month with no transactions shows `No transactions this month` and still has the links. The page is behind the `month-page` feature flag, which stays off.

**Architecture:** Three small units. `src/lib/dates.js` gets `monthOf` reading the stored ISO date as well as `DD/MM/YYYY`. `src/lib/month.js` holds the pure logic: validating `m`, shifting months, and summing transactions by category with income counted negative. `src/month-page.js` turns a request into a status, a content type and a body. `src/server.js` gets one route, guarded by the flag. Slice 2 (the change from last month) builds on `monthTotals` without changing its shape.

**Tech Stack:** Node 22.13+, built-in `node:sqlite` (`DatabaseSync`), built-in `node:test`, `node:assert/strict`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "Goals", "Constraints" (the stored-date `monthOf`, integer cents, stored sign), "The totals, as they are to be built", "Calls made here" (empty month, row order), "Decided by the director" (the month of a stored date; income counted negative in the grand total), and slice 1 of the `wheelhouse-slices` block.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- Money is integer cents; a total is written with `formatCents` from `src/lib/money.js` (`1234.50`, `-40.00`, `0.00`).
- A transaction's month is `monthOf(stored date)`. The page filters in JavaScript on that call, as the approved document asks.
- Stored sign follows decision A: money out positive, money back negative. Income rows count as negative in totals whatever their stored sign: the counted value of an income row is `-Math.abs(cents)`.
- `src/lib/store.js`, `src/lib/statement.js`, `src/lib/money.js` and `src/lib/categories.js` are not changed in this slice.
- `src/server.js` is changed in Task 4 only. The `bank-statement-import` piece also edits `src/server.js`; see "Dependency" below.
- The existing `DD/MM/YYYY` behaviour of `parseDate` and `monthOf` does not change.

## Dependency

Task 4 edits `src/server.js`, which the `bank-statement-import` piece 3 also edits (it adds the `/import` page and the home page month links). Tasks 1 to 3 touch no shared file and can be built as soon as this plan is recorded. Task 4 is built only after that piece's pull request has merged, from `origin/HEAD`: check the pull request is still open first, then `wait-for --pr <number>`.

## Review Focus

1. The total cells carry `data-category` set to the key and `data-total` set to a plain decimal, for every row.
2. The grand total cell has `data-category="all"`, and it counts money back and income as negative: the fixture in Task 3 gives `-2951.80`.
3. A transaction dated `2026-08-31` is in August; one dated `2026-09-01` is not in August (no leak into the next month).
4. A malformed `m` (`2026-8`, `2026-13`, empty, missing) gets status 400 and a plain text body.
5. Previous and next links use the month before and after `m`, across a year boundary too.
6. The flag is off by default: with `month-page` off, `/month` returns the same 404 as any unknown path.

Each line above gets its test: Task 1 for the dates, Task 2 for the arithmetic and the months, Task 3 for the page (points 1 to 5), Task 4 for point 6.

---

## File Structure

- Modify: `src/lib/dates.js` (`monthOf` reads `YYYY-MM-DD` too)
- Create: `src/lib/month.js` (`isMonth`, `shiftMonth`, `monthTotals`)
- Create: `src/month-page.js` (`monthPage(db, url)` returns `{ status, type, body }`)
- Modify: `config/feature-flags.json` (adds `"month-page": false`)
- Modify: `src/server.js` (Task 4 only)
- Create: `tests/dates.test.js`, `tests/month.test.js`, `tests/month-page.test.js`

---

### Task 1: `monthOf` reads a stored date

**Files:**
- Modify: `src/lib/dates.js`
- Test: `tests/dates.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `monthOf(text) -> 'YYYY-MM'` for either `DD/MM/YYYY` or `YYYY-MM-DD`. `parseDate` is unchanged.

- [ ] **Step 1: Write the failing tests**

```js
// tests/dates.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthOf } from '../src/lib/dates.js';

test('monthOf reads a stored ISO date', () => {
  assert.equal(monthOf('2026-08-31'), '2026-08');
  assert.equal(monthOf('2026-09-01'), '2026-09');
});

test('monthOf still reads a DD/MM/YYYY date', () => {
  assert.equal(monthOf('31/08/2026'), '2026-08');
  assert.equal(monthOf('1/9/2026'), '2026-09');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dates.test.js`
Expected: FAIL on the ISO test: `monthOf('2026-08-31')` gives `2026-08`-shaped garbage (the split on `/` yields one part).

- [ ] **Step 3: Implement**

In `src/lib/dates.js`, `monthOf` returns `value.slice(0, 7)` when the trimmed text matches `/^\d{4}-\d{2}-\d{2}$/`, and otherwise `parseDate(text).slice(0, 7)` as now. Keep the comment above it, and extend it to say it reads both forms.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dates.test.js tests/smoke.test.js`
Expected: all PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dates.js tests/dates.test.js
git commit -m "feat: read a stored date's month in monthOf"
```

---

### Task 2: Month logic: validate, shift, total by category

**Files:**
- Create: `src/lib/month.js`
- Test: `tests/month.test.js`

**Interfaces:**
- Consumes: `monthOf` (Task 1); `CATEGORIES` and `categoryOf` from `src/lib/categories.js`.
- Produces:
  - `isMonth(text) -> boolean`: true only for `YYYY-MM` with month `01` to `12`.
  - `shiftMonth(m, delta) -> 'YYYY-MM'`: the month `delta` months from `m` (negative goes back), across year boundaries.
  - `monthTotals(transactions, m) -> { rows, totalCents, count }`: `transactions` are `{ date, description, cents }` (stored shape). `rows` is `[{ key, label, cents }]` for each category with at least one transaction in `m`, in `CATEGORIES` order (`other` last). `totalCents` is the sum of counted values over the month. `count` is the number of transactions in the month.
  - Counted value: `cents` as stored, except an income row (`categoryOf(description) === 'income'`) counts as `-Math.abs(cents)`. The income row's `cents` in `rows` is its counted value.

- [ ] **Step 1: Write the failing tests**

```js
// tests/month.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMonth, shiftMonth, monthTotals } from '../src/lib/month.js';

const t = (date, description, cents) => ({ date, description, cents });

test('isMonth accepts YYYY-MM with month 01 to 12 only', () => {
  assert.equal(isMonth('2026-08'), true);
  assert.equal(isMonth('2026-12'), true);
  assert.equal(isMonth('2026-8'), false);
  assert.equal(isMonth('2026-13'), false);
  assert.equal(isMonth('2026-00'), false);
  assert.equal(isMonth('2026-08-01'), false);
  assert.equal(isMonth(''), false);
  assert.equal(isMonth(undefined), false);
});

test('shiftMonth moves a month either way, across years', () => {
  assert.equal(shiftMonth('2026-08', -1), '2026-07');
  assert.equal(shiftMonth('2026-08', 1), '2026-09');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('monthTotals sums each category for the month, in category order', () => {
  const rows = [
    t('2026-08-02', 'Greenbarrow Fresh', 4520),
    t('2026-08-06', 'Greenbarrow Fresh', -500),
    t('2026-08-09', 'Pasta, Pizza & Co', 1800),
  ];
  assert.deepEqual(monthTotals(rows, '2026-08'), {
    rows: [
      { key: 'groceries', label: 'Groceries', cents: 4020 },
      { key: 'eating_out', label: 'Eating out', cents: 1800 },
    ],
    totalCents: 5820,
    count: 3,
  });
});

test('income counts as negative whatever its stored sign', () => {
  const rows = [t('2026-08-10', 'Brightwave Payroll', 300000), t('2026-08-11', 'Tidepool Interest', -1000)];
  const result = monthTotals(rows, '2026-08');
  assert.deepEqual(result.rows, [{ key: 'income', label: 'Income', cents: -301000 }]);
  assert.equal(result.totalCents, -301000);
});

test('a transaction outside the month is left out', () => {
  const rows = [t('2026-07-31', 'Greenbarrow Fresh', 9999), t('2026-08-31', 'Greenbarrow Fresh', 100), t('2026-09-01', 'Greenbarrow Fresh', 9999)];
  assert.deepEqual(monthTotals(rows, '2026-08'), {
    rows: [{ key: 'groceries', label: 'Groceries', cents: 100 }],
    totalCents: 100,
    count: 1,
  });
});

test('a month with no transactions has no rows and a count of zero', () => {
  assert.deepEqual(monthTotals([t('2026-07-31', 'Greenbarrow Fresh', 100)], '2026-08'), {
    rows: [],
    totalCents: 0,
    count: 0,
  });
});

test('other comes last, after the named categories', () => {
  const rows = [t('2026-08-01', 'Unknown Shop', 500), t('2026-08-02', 'Greenbarrow Fresh', 100)];
  assert.deepEqual(
    monthTotals(rows, '2026-08').rows.map((r) => r.key),
    ['groceries', 'other'],
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/month.test.js`
Expected: FAIL with "Cannot find module" for `src/lib/month.js`.

- [ ] **Step 3: Implement `src/lib/month.js`**

Write the three functions as specified above. `isMonth` uses `/^\d{4}-(0[1-9]|1[0-2])$/` on `String(text)`. `shiftMonth` converts to a month index `year * 12 + (month - 1) + delta`, then back, padding the month with `padStart(2, '0')`. `monthTotals` keeps a `Map` of key to counted sum, filters with `monthOf(t.date) === m`, and builds `rows` by filtering and mapping `CATEGORIES`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/month.test.js`
Expected: all seven PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/month.js tests/month.test.js
git commit -m "feat: sum a month's transactions by category"
```

---

### Task 3: The month page

**Files:**
- Create: `src/month-page.js`
- Test: `tests/month-page.test.js`

**Interfaces:**
- Consumes: `isMonth`, `shiftMonth`, `monthTotals` (Task 2); `formatCents` from `src/lib/money.js`; an open `DatabaseSync` with the `transactions` table.
- Produces: `monthPage(db, url) -> { status: number, type: string, body: string }`.
  - Reads `url.searchParams.get('m')`.
  - Invalid `m` (not `isMonth`): `{ status: 400, type: 'text/plain; charset=utf-8', body: 'Month must look like YYYY-MM' }`.
  - Valid `m`: `{ status: 200, type: 'text/html; charset=utf-8', body }`, where `body` is the page's inner HTML (no `<html>` shell; `server.js` wraps it with its `page()`).

HTML of the body, for a month with transactions:

```html
<h2>August 2026</h2>
<p><a href="/month?m=2026-07">Previous month</a> · <a href="/month?m=2026-09">Next month</a></p>
<table>
<thead><tr><th>Category</th><th>Total</th></tr></thead>
<tbody>
<tr><td>Groceries</td><td data-category="groceries" data-total="40.20">40.20</td></tr>
...
<tr><th>All categories</th><td data-category="all" data-total="-2951.80">-2951.80</td></tr>
</tbody>
</table>
```

For a month with no transactions, the body is the heading, the links, and `<p>No transactions this month</p>`, with no table.

The heading text: the month name in English and the year, from a fixed array of month names (`January`…`December`), so no locale dependency.

- [ ] **Step 1: Write the failing tests**

```js
// tests/month-page.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable } from '../src/lib/store.js';
import { monthPage } from '../src/month-page.js';

const fixture = () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  const add = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  add.run('2026-07-31', 'Greenbarrow Fresh', 9999);
  add.run('2026-08-02', 'Greenbarrow Fresh', 4520);
  add.run('2026-08-06', 'Greenbarrow Fresh', -500);
  add.run('2026-08-09', 'Pasta, Pizza & Co', 1800);
  add.run('2026-08-10', 'Brightwave Payroll', 300000);
  add.run('2026-08-11', 'Tidepool Interest', -1000);
  add.run('2026-09-01', 'Greenbarrow Fresh', 9999);
  return db;
};
const get = (db, m) => monthPage(db, new URL(`http://localhost/month?m=${m}`));

test('the month page shows each category total and the grand total', () => {
  const { status, type, body } = get(fixture(), '2026-08');
  assert.equal(status, 200);
  assert.equal(type, 'text/html; charset=utf-8');
  assert.match(body, /<td>Groceries<\/td><td data-category="groceries" data-total="40\.20">40\.20<\/td>/);
  assert.match(body, /data-category="eating_out" data-total="18\.00"/);
  assert.match(body, /data-category="income" data-total="-3010\.00"/);
  assert.match(body, /data-category="all" data-total="-2951\.80"/);
});

test('every total cell carries a category and a plain decimal', () => {
  const { body } = get(fixture(), '2026-08');
  const cells = [...body.matchAll(/data-category="([^"]+)" data-total="([^"]*)"/g)];
  assert.equal(cells.length, 4);
  for (const [, , total] of cells) assert.match(total, /^-?\d+\.\d{2}$/);
});

test('a category with no transactions this month does not appear', () => {
  const { body } = get(fixture(), '2026-08');
  assert.doesNotMatch(body, /data-category="transport"/);
  assert.doesNotMatch(body, /Transport/);
});

test('the month links go to the month before and after', () => {
  const { body } = get(fixture(), '2026-08');
  assert.match(body, /href="\/month\?m=2026-07"/);
  assert.match(body, /href="\/month\?m=2026-09"/);
});

test('a month with no transactions says so and still has the links', () => {
  const { status, body } = get(fixture(), '2026-03');
  assert.equal(status, 200);
  assert.match(body, /No transactions this month/);
  assert.doesNotMatch(body, /<table/);
  assert.match(body, /href="\/month\?m=2026-02"/);
  assert.match(body, /href="\/month\?m=2026-04"/);
});

test('the links cross a year boundary', () => {
  const { body } = get(fixture(), '2026-12');
  assert.match(body, /href="\/month\?m=2026-11"/);
  assert.match(body, /href="\/month\?m=2027-01"/);
});

test('a malformed m gets a plain error', () => {
  for (const bad of ['2026-8', '2026-13', '', 'august', '2026-08-01']) {
    const { status, type, body } = get(fixture(), bad);
    assert.equal(status, 400, bad);
    assert.equal(type, 'text/plain; charset=utf-8');
    assert.equal(body, 'Month must look like YYYY-MM');
  }
  const missing = monthPage(fixture(), new URL('http://localhost/month'));
  assert.equal(missing.status, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/month-page.test.js`
Expected: FAIL with "Cannot find module" for `src/month-page.js`.

- [ ] **Step 3: Implement `src/month-page.js`**

Read `m`, return the 400 for a bad one. Load `SELECT date, description, cents FROM transactions` and pass it to `monthTotals`. Build the body as in the HTML shape above, using `formatCents` for every decimal, and `shiftMonth` for the two links. Nothing from the user's input reaches the HTML except `m`, which has passed `isMonth`, so no escaping is needed; say so in a short comment.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/month-page.test.js`
Expected: all seven PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/month-page.js tests/month-page.test.js
git commit -m "feat: month page shows category totals and the grand total"
```

---

### Task 4: Route and flag

**Files:**
- Modify: `config/feature-flags.json` (adds `"month-page": false`)
- Modify: `src/server.js`
- No new test file: the flag check is covered by the run in Step 4.

**Interfaces:**
- Consumes: `monthPage` (Task 3); `loadFlags`, `isOn` from `src/lib/flags.js`.
- Produces: `GET /month` answers from `monthPage` when `month-page` is on, and falls through to the existing 404 when it is off.

**Precondition:** the `bank-statement-import` pull request that edits `src/server.js` has merged; this task starts from a rebase or merge of `origin/HEAD`. If that pull request is still open, run `wait-for --pr <number>` instead of starting this task.

- [ ] **Step 1: Add the flag**

`config/feature-flags.json` gains `"month-page": false` next to the existing key. Keep the file's formatting.

- [ ] **Step 2: Wire the route**

In `src/server.js`, load the flags once at start (use the same loading as `bank-statement-import` set up, if it has added one; otherwise `loadFlags` on `config/feature-flags.json` resolved from `import.meta.url`). Add a branch before the 404:

```js
if (url.pathname === '/month' && isOn(flags, 'month-page')) {
  const month = monthPage(db, url);
  res.writeHead(month.status, { 'content-type': month.type });
  res.end(month.type.startsWith('text/html') ? page(month.body) : month.body);
  return;
}
```

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 4: Check the flag by running the server**

Use a scratch database in `.wheelhouse/tmp/`, never `/tmp`:

```bash
LEDGER_DB=.wheelhouse/tmp/month-check.db PORT=3917 node src/server.js &
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3917/month?m=2026-08"
kill %1
```

Expected: `404` while the flag is off. Then set the flag to `true` in a temporary copy of the config, or in the run's config only, and expect `200` with the page; do not commit the flag on. Delete the scratch database afterwards.

- [ ] **Step 5: Commit**

```bash
git add config/feature-flags.json src/server.js
git commit -m "feat: route /month behind the month-page flag, off"
```

---

## Self-review notes

- Spec coverage: slice 1 done items map to Task 3 (the totals, the grand total, the empty month, the malformed `m`, `Groceries` shown in August 2026 on the real data) and Task 2 (income sign, the month boundary). The stored-date `monthOf` decision is Task 1. The flag and the route are Task 4.
- Calls made here, applied: empty month shows the text and links (no table); categories with no transactions in the month are left out, so vanished categories wait for slice 2; `other` last.
- Logged as own calls at build: the table's header and label wording (`Category`, `Total`, `All categories`) and the month heading wording; the strict `01`–`12` check in `isMonth`.
- Types: `monthPage` returns `{ status, type, body }`; `monthTotals` returns `{ rows, totalCents, count }`, which slice 2 extends by adding a change per row.
