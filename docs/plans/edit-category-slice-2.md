# Move a transaction to another category, slice 2: The month page links to the edit page Implementation Plan

Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The month page lists that month's transactions, each linking to `/edit?id=<id>` while the `edit-category` flag is on, and a moved row counts in its new category's total.

**Architecture:** Totals take each row's category from `categoryFor` (the stored key, or `categoryOf` for a NULL row), so a move changes the total. The month page also lists the month's rows, filtered by `monthOf` as the totals are. The `/edit` links are shown only when `edit-category` is on. A shared `escapeHtml` moves to `src/lib/html.js` so the month page and the server can both use it.

**Tech Stack:** Node 22.13+, built-in `node:sqlite` and `node:test`, global `fetch`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "Goals" (the month page lists that month's transactions, each linking to `/edit?id=<id>`) and "The calls made here" (totals, a moved row counts in its new category), and slice 2 of the `wheelhouse-slices` block.

**Depends on:** slice 1 merged (the store functions `findTransaction`, `setCategory`, `categoryFor`, and the `category` column), and `feature/month-page` merged (`src/month-page.js`, `src/lib/month.js`, and the ISO-reading `monthOf` in `src/lib/dates.js`). Build on main after both merge.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- Totals use the row's category as `categoryFor(row)` gives it: the stored key, else `categoryOf(description)`. A moved row counts in its new category, and a row never moved keeps the category its shop name gives it.
- The month list shows the rows dated in `m`, by `monthOf(t.date) === m`, in `ORDER BY date, id` order. Each row shows its stored date, description, `formatCents(cents)` and its category label.
- A link is `<a href="/edit?id=<id>">Change category</a>`, and it is shown only when `edit-category` is on. With the flag off the list has no `/edit` text at all.
- Every printed description goes through `escapeHtml`. Dates, amounts and labels need none beyond it.
- Not changed: `src/lib/dates.js`, `src/lib/money.js`, `src/lib/categories.js` rules, the flag file's other entries.

## Review Focus

1. A moved row appears in its new category's total and not in its old one. Test: `month.test.js` "a moved row counts in its new category".
2. A row with a NULL stored category is counted under its `categoryOf` key (a Greenbarrow row under `groceries`, never under `other`). Test: `month.test.js` "a row with no stored category counts under its shop's category".
3. A description with HTML in it shows escaped in the month list. The month page's comment "nothing here needs escaping" no longer holds, and the test pins it. Test: `month-page.test.js` "a description in the month list is escaped".
4. The list shows only the requested month, including a row dated the last day of the month before (`2026-07-31` is not in `2026-08`). Test: `month-page.test.js` "the list shows only that month's rows".
5. With `edit-category` off, the month list has no `/edit` link, and the month still shows. Test: `month-page.test.js` "with edit-category off there are no edit links".

---

## File Structure

- Create: `src/lib/html.js` (`escapeHtml`, moved from `src/server.js`)
- Modify: `src/server.js` (imports `escapeHtml`; passes `flags` to `monthPage`)
- Modify: `src/lib/month.js` (`monthTotals` uses `categoryFor`; new `transactionsIn(transactions, m)`)
- Modify: `src/month-page.js` (selects `id` and `category`; renders the list; takes `flags`)
- Modify: `tests/month.test.js`, `tests/month-page.test.js`

---

### Task 1: Totals use the stored category

**Files:**
- Modify: `src/lib/month.js`, `src/month-page.js`
- Test: `tests/month.test.js`

**Interfaces:**
- Consumes: `categoryFor(row) -> string` from `src/lib/store.js` (slice 1).
- Produces: `monthTotals(transactions, m) -> { rows, totalCents, count }`, the same shape as now. Each transaction's key is `categoryFor(t)`, not `categoryOf(t.description)`. Income's sign rule is unchanged and keys on that same key.

- [ ] **Step 1: Write the failing tests**

Add to `tests/month.test.js`:

```js
test('a moved row counts in its new category and not its old one', () => {
  // { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500, category: 'dining' }
  // monthTotals([...], '2026-08'): rows has dining -4500 and no groceries row
});

test('a row with no stored category counts under its shop\'s category', () => {
  // { date: '2026-08-02', description: 'Greenbarrow Fresh', cents: -4500, category: null }
  // rows has groceries -4500, and no other row
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/month.test.js`
Expected: FAIL. The moved row still totals under `groceries`, and the test's `category` is ignored.

- [ ] **Step 3: Implement**

- `src/lib/month.js`: in `monthTotals`, the key is `categoryFor(t)` and the income test uses that key.
- `src/month-page.js`: `SELECT id, date, description, cents, category FROM transactions`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/month.test.js tests/month-page.test.js`
Expected: PASS. The existing month-page tests still pass, since a row with no `category` key falls back to `categoryOf`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/month.js src/month-page.js tests/month.test.js
git commit -m "feat: month totals count each row in its stored category"
```

---

### Task 2: The month list, with edit links behind the flag

**Files:**
- Create: `src/lib/html.js`
- Modify: `src/server.js`, `src/lib/month.js`, `src/month-page.js`
- Test: `tests/month-page.test.js`

**Interfaces:**
- Consumes: `categoryFor` (slice 1); `monthOf` (from the month-page branch); `formatCents`; `CATEGORIES`.
- Produces:
  - `escapeHtml(text: string) -> string` in `src/lib/html.js`. `src/server.js` imports it instead of defining it.
  - `transactionsIn(transactions, m) -> transaction[]` in `src/lib/month.js`: the rows whose `monthOf(date) === m`, in `date, id` order. `monthTotals` and the list both use it.
  - `monthPage(db, url, flags) -> { status, type, body }`. The server passes its `flags`. `editLinks` is `isOn(flags, 'edit-category')`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/month-page.test.js`, using `createApp` with a seeded database and `flags` of `{ 'month-page': true, 'edit-category': true }`:

```js
test('the month page lists that month\'s rows, each linking to /edit?id=<id>', async () => {
  // seed rows in 2026-08 and one on '2026-07-31'
  // GET /month?m=2026-08: contains the Aug rows, not the July row, and '<a href="/edit?id=1">Change category</a>'
});

test('a description in the month list is escaped', async () => {
  // seed '<b>Shop</b> & co' in 2026-08: body contains '&lt;b&gt;Shop&lt;/b&gt; &amp; co' and not '<b>Shop'
});

test('the list shows only that month\'s rows', async () => {
  // seed '2026-07-31' 'July Shop' and '2026-08-01' 'August Shop'; body contains 'August Shop' and not 'July Shop'
});

test('with edit-category off there are no edit links', async () => {
  // flags { 'month-page': true }: GET /month?m=2026-08 contains the Aug row and no '/edit?id='
});

test('the month list and total use the row\'s category', async () => {
  // seed one row, POST the row's id to /edit with category dining (edit-category on), then GET /month: the dining row appears
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/month-page.test.js`
Expected: FAIL. The month page has no transaction list and no edit links.

- [ ] **Step 3: Implement**

- `src/lib/html.js`: `escapeHtml`, moved verbatim from `src/server.js`. Update `src/server.js` to import it.
- `src/lib/month.js`: `transactionsIn`, and `monthTotals` builds on it.
- `src/month-page.js`: `monthPage(db, url, flags)`. It renders the totals table as now, then a table with a row per `transactionsIn` item: stored date, `escapeHtml(description)`, `formatCents(cents)`, the `CATEGORIES` label for `categoryFor(t)`, and the link cell only when `editLinks`. Replace the comment that says nothing needs escaping with one that says descriptions are escaped.
- `src/server.js`: the `/month` branch passes `flags`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/month-page.test.js tests/month.test.js`
Expected: PASS, all tests in both files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/html.js src/server.js src/lib/month.js src/month-page.js tests/month-page.test.js
git commit -m "feat: the month page lists its transactions, each linking to the edit page"
```

---

### Task 3: A move shows in the month total

**Files:**
- Test: `tests/month-page.test.js`

**Interfaces:**
- Consumes: the `/edit` POST (slice 1), the `/month` page (Tasks 1 and 2).
- Produces: no code. This task is the end-to-end test for done line 6 of the approved spec.

- [ ] **Step 1: Write the test**

```js
test('after a move, the month total moves the amount to the new category', async () => {
  // seed row 1: '2026-08-02', 'Greenbarrow Fresh', -4500, flags { 'month-page': true, 'edit-category': true }
  // GET /month?m=2026-08: the groceries cell data-total is -45.00
  // POST /edit id=1 category=dining (redirect manual)
  // GET /month?m=2026-08: the dining cell data-total is -45.00, and the groceries cell is not present
  // body contains 'Groceries' (the done contract's mustShow line for /month?m=2026-08)
});
```

- [ ] **Step 2: Run the test**

Run: `node --test tests/month-page.test.js`
Expected: PASS once Tasks 1 and 2 are in. If it fails, the failure is in those tasks, not here.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: every test passes, with `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add tests/month-page.test.js
git commit -m "test: a move shows in the month total"
```
