# Month page, slice 2: Change from last month Implementation Plan

Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each category row and the grand total row of `/month?m=YYYY-MM` show the change from the month before, as a plain decimal in a `data-change` cell. A category with no transactions this month, but some last month, appears with a total of `0.00` and a change equal to minus last month's total. A category new this month has a change equal to its whole total. The flag `month-page` stays off.

**Architecture:** Slice 1's `monthTotals` keeps its shape. A new pure function `withChanges(current, previous)` in `src/lib/month.js` joins two months' totals into one row per category in either month, in `CATEGORIES` order, each with its change. `src/month-page.js` totals last month with the same `monthTotals`, joins the two, and adds a change column. The route and the flag are unchanged.

**Tech Stack:** Node 22.13+, built-in `node:sqlite`, built-in `node:test`, `node:assert/strict`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "The change, as it is to be built", "Calls made here" (new category, vanished category, categories with no rows in either month do not appear, row order), and slice 2 of the `wheelhouse-slices` block.

**Depends on:** slice 1's pull request (#11) merging. This plan is written on top of slice 1's code, and is built only after that merge, from `origin/HEAD`.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- Money is integer cents; every decimal, including each `data-change`, is written with `formatCents` from `src/lib/money.js`. A change is written as a plain decimal with no plus sign (`-59.79`, `18.00`).
- The change is this month's total minus last month's total, per row and for the grand total.
- `src/lib/money.js`, `src/lib/categories.js`, `src/lib/dates.js` and `src/lib/store.js` are not changed in this slice.
- The empty-month rule is unchanged: a month with no transactions shows `No transactions this month` and the links, with no table, even if last month had transactions.
- `monthTotals` keeps its return shape: `{ rows, totalCents, count }`.

## Review Focus

1. The change cell of every row carries `data-change` set to the plain decimal of this month minus last month, and the grand total change cell is the grand total minus last month's grand total.
2. A category new this month has a change equal to its whole total (last month's total is 0, not missing).
3. A category missing this month has a total of `0.00` and a change equal to minus last month's total, and it appears in the table.
4. A category with no transactions in either month does not appear.
5. The grand total change equals the sum of the row changes (every category key is in `CATEGORIES`, so nothing is dropped).
6. Last month is read with `shiftMonth(m, -1)`, across a year boundary too (`2027-01` reads `2026-12`).

Each line above gets its test: Task 1 for points 2 to 5 at the function level, Task 2 for points 1 to 3 and 6 on the page.

---

## File Structure

- Modify: `src/lib/month.js` (adds `withChanges`)
- Modify: `src/month-page.js` (totals last month, adds the change column)
- Modify: `tests/month.test.js` (adds the `withChanges` tests)
- Modify: `tests/month-page.test.js` (adds the change tests; updates two slice 1 expectations, see Task 2)

---

### Task 1: Join two months' totals with their changes

**Files:**
- Modify: `src/lib/month.js`
- Test: `tests/month.test.js`

**Interfaces:**
- Consumes: `monthTotals` (slice 1), `CATEGORIES` from `src/lib/categories.js`.
- Produces: `withChanges(current, previous) -> { rows, totalCents, totalChange, count }`.
  - `current` and `previous` are `monthTotals` results.
  - `rows` is `[{ key, label, cents, change }]` for each category in `current.rows` or `previous.rows`, in `CATEGORIES` order. `cents` is `0` when the category is missing this month. `change` is `cents - (previous cents or 0)`.
  - `totalCents` is `current.totalCents`. `totalChange` is `current.totalCents - previous.totalCents`. `count` is `current.count`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/month.test.js (added to the imports: withChanges)
import { isMonth, shiftMonth, monthTotals, withChanges } from '../src/lib/month.js';

test('withChanges gives each category its change from last month', () => {
  const current = monthTotals([t('2026-08-02', 'Greenbarrow Fresh', 4520)], '2026-08');
  const previous = monthTotals([t('2026-07-02', 'Greenbarrow Fresh', 9999)], '2026-07');
  assert.deepEqual(withChanges(current, previous), {
    rows: [{ key: 'groceries', label: 'Groceries', cents: 4520, change: -5479 }],
    totalCents: 4520,
    totalChange: -5479,
    count: 1,
  });
});

test('a category new this month has a change equal to its whole total', () => {
  const current = monthTotals([t('2026-08-09', 'Pasta, Pizza & Co', 1800)], '2026-08');
  const previous = monthTotals([], '2026-07');
  assert.deepEqual(withChanges(current, previous).rows, [
    { key: 'dining', label: 'Eating out', cents: 1800, change: 1800 },
  ]);
});

test('a category missing this month shows 0 and a change equal to minus last month', () => {
  const current = monthTotals([t('2026-08-02', 'Greenbarrow Fresh', 4520)], '2026-08');
  const previous = monthTotals([t('2026-07-12', 'Waverly Fuel Stop', 1250)], '2026-07');
  assert.deepEqual(withChanges(current, previous).rows, [
    { key: 'groceries', label: 'Groceries', cents: 4520, change: 4520 },
    { key: 'transport', label: 'Transport', cents: 0, change: -1250 },
  ]);
});

test('a category in neither month does not appear, and the rows follow category order', () => {
  const current = monthTotals([t('2026-08-01', 'Unknown Shop', 500), t('2026-08-02', 'Greenbarrow Fresh', 100)], '2026-08');
  const previous = monthTotals([t('2026-07-02', 'Waverly Fuel Stop', 200)], '2026-07');
  assert.deepEqual(
    withChanges(current, previous).rows.map((r) => r.key),
    ['groceries', 'transport', 'other'],
  );
});

test('the grand total change is this month minus last month, and equals the sum of the row changes', () => {
  const current = monthTotals([t('2026-08-02', 'Greenbarrow Fresh', 4520), t('2026-08-10', 'Brightwave Payroll', 300000)], '2026-08');
  const previous = monthTotals([t('2026-07-02', 'Greenbarrow Fresh', 9999)], '2026-07');
  const result = withChanges(current, previous);
  assert.equal(result.totalChange, current.totalCents - previous.totalCents);
  assert.equal(result.rows.reduce((sum, r) => sum + r.change, 0), result.totalChange);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/month.test.js`
Expected: FAIL with `withChanges is not a function` (or a SyntaxError on the missing export).

- [ ] **Step 3: Implement `withChanges` in `src/lib/month.js`**

Add after `monthTotals`, with a short comment:

```js
// Joins this month's totals with last month's: one row per category in either
// month, in CATEGORIES order, each with its change from the month before.
export function withChanges(current, previous) {
  const now = new Map(current.rows.map((r) => [r.key, r.cents]));
  const before = new Map(previous.rows.map((r) => [r.key, r.cents]));
  const rows = CATEGORIES.filter((c) => now.has(c.key) || before.has(c.key)).map((c) => {
    const cents = now.get(c.key) ?? 0;
    return { key: c.key, label: c.label, cents, change: cents - (before.get(c.key) ?? 0) };
  });
  return {
    rows,
    totalCents: current.totalCents,
    totalChange: current.totalCents - previous.totalCents,
    count: current.count,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/month.test.js`
Expected: all PASS (the seven slice 1 tests and the five new ones).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/month.js tests/month.test.js
git commit -m "feat: join two months' totals with the change from last month"
```

---

### Task 2: The change column on the page

**Files:**
- Modify: `src/month-page.js`
- Test: `tests/month-page.test.js`

**Interfaces:**
- Consumes: `withChanges` (Task 1), `monthTotals`, `shiftMonth`, `isMonth` (slice 1), `formatCents`.
- Produces: `monthPage(db, url)` unchanged in shape. The table gains a `Change` column.

Table shape for a month with transactions (the change cell follows each total cell):

```html
<table>
<thead><tr><th>Category</th><th>Total</th><th>Change</th></tr></thead>
<tbody>
<tr><td>Groceries</td><td data-category="groceries" data-total="40.20">40.20</td><td data-change="-59.79">-59.79</td></tr>
...
<tr><th>All categories</th><td data-category="all" data-total="-2951.80">-2951.80</td><td data-change="-3064.29">-3064.29</td></tr>
</tbody>
</table>
```

- [ ] **Step 1: Write the failing tests and update the two slice 1 expectations**

The fixture gains one July transaction in a category that has none in August (transport), so the vanished-category rule is exercised:

```js
// tests/month-page.test.js fixture: add after the 2026-07-31 line
add.run('2026-07-12', 'Waverly Fuel Stop', 1250);
```

With this fixture, August is unchanged, and July is groceries 99.99 plus transport 12.50 (total 112.49).

Two slice 1 expectations change, because a vanished category now appears (the approved document's rule):

- `a category with no transactions this month does not appear`: replace with `a category with no transactions in either month does not appear`, asserting `Bills` and `data-category="bills"` are absent. Transport is no longer absent (see below).
- `every total cell carries a category and a plain decimal`: the count changes from 4 to 5 (transport joins as a `0.00` row). The loop's regex is unchanged.

New tests:

```js
test('each category row carries its change from last month', () => {
  const { body } = get(fixture(), '2026-08');
  assert.match(body, /data-category="groceries" data-total="40\.20">40\.20<\/td><td data-change="-59\.79">/);
  assert.match(body, /data-category="dining" data-total="18\.00">18\.00<\/td><td data-change="18\.00">/);
  assert.match(body, /data-category="income" data-total="-3010\.00">-3010\.00<\/td><td data-change="-3010\.00">/);
});

test('a category missing this month shows 0.00 and minus last month as its change', () => {
  const { body } = get(fixture(), '2026-08');
  assert.match(body, /<td>Transport<\/td><td data-category="transport" data-total="0\.00">0\.00<\/td><td data-change="-12\.50">/);
});

test('the grand total change is this month minus last month', () => {
  const { body } = get(fixture(), '2026-08');
  assert.match(body, /data-category="all" data-total="-2951\.80">-2951\.80<\/td><td data-change="-3064\.29">/);
});

test('every change cell carries a plain decimal and there is one per row', () => {
  const { body } = get(fixture(), '2026-08');
  const cells = [...body.matchAll(/data-change="([^"]*)"/g)];
  assert.equal(cells.length, 5);
  for (const [, change] of cells) assert.match(change, /^-?\d+\.\d{2}$/);
});

test('the change crosses a year boundary', () => {
  const db = fixture();
  db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)').run('2026-12-03', 'Greenbarrow Fresh', 1000);
  db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)').run('2027-01-04', 'Greenbarrow Fresh', 2500);
  const { body } = get(db, '2027-01');
  assert.match(body, /data-category="groceries" data-total="25\.00">25\.00<\/td><td data-change="15\.00">/);
});
```

Check the arithmetic before running: July total is 9999 + 1250 = 11249; August total is -295180; the grand total change is -295180 - 11249 = -306429, shown `-3064.29`. Groceries change is 4020 - 9999 = -5979, shown `-59.79`. In the year test, December is 10.00 and January 25.00, so the change is 15.00.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/month-page.test.js`
Expected: FAIL: the new `data-change` expectations find no change cells; the year test finds no `data-change` either.

- [ ] **Step 3: Implement in `src/month-page.js`**

- Import `withChanges` alongside `isMonth, shiftMonth, monthTotals`.
- Replace the totals line with: total this month and last month, then join them:

```js
const transactions = db.prepare('SELECT date, description, cents FROM transactions').all();
const current = monthTotals(transactions, m);
const { rows, totalCents, totalChange, count } = withChanges(current, monthTotals(transactions, shiftMonth(m, -1)));
```

- Keep the empty-month branch on `count === 0`, unchanged.
- Add a `change` cell helper next to `cell`:

```js
const changeCell = (cents) => `<td data-change="${formatCents(cents)}">${formatCents(cents)}</td>`;
```

- Each category row becomes `<tr><td>${r.label}</td>${cell(r.key, r.cents)}${changeCell(r.change)}</tr>`.
- The grand total row becomes `<tr><th>All categories</th>${cell('all', totalCents)}${changeCell(totalChange)}</tr>`.
- The header becomes `<thead><tr><th>Category</th><th>Total</th><th>Change</th></tr></thead>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/month-page.test.js`
Expected: all PASS.

- [ ] **Step 5: Run the whole suite and the flag check**

Run: `npm test` (expected: 0 failures).

Then run the scratch check from slice 1 with the flag on: `node .wheelhouse/tmp/flag-check.mjs on 3917`. Expected: `/month?m=2026-08` is 200 with a `Change` header and `data-change` cells; `/month?m=2026-8` is 400. Then `node .wheelhouse/tmp/flag-check.mjs off 3918`: expected 404 for all four paths. Note that the flag-check seed has no July rows, so every change there equals the whole total; that is expected for that seed.

- [ ] **Step 6: Commit**

```bash
git add src/month-page.js tests/month-page.test.js
git commit -m "feat: month page shows the change from last month for each category and the total"
```

---

## Self-review notes

- Spec coverage: slice 2 done items map to Task 2 (change cells, new and missing categories, the year boundary) and Task 1 (the join's arithmetic, the rows, the grand total). The approved "Calls made here" are applied: new category change equals its whole total; vanished category shows `0.00` with minus last month's total; a category in neither month does not appear; order follows `CATEGORIES`.
- Changed expectations from slice 1 are listed in Task 2 and are intended by the approved document: the vanished rule replaces "no row for a category missing this month", which slice 1 left for this slice.
- Types: `withChanges` returns `{ rows, totalCents, totalChange, count }`; `monthTotals` is unchanged.
- The empty-month rule is unchanged and was decided in slice 1 (`q-month-page-1`: message only).
