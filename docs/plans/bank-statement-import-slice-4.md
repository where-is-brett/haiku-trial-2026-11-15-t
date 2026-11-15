# Bank statement import, slice 4: Months on the home page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The home page lists each month that has transactions, newest first, each linking to `/month?m=YYYY-MM`. While the flag is off, the home page shows no month list.

**Architecture:** One query function, `listMonths(db)` in `src/lib/months.js`, returns the months that have transactions, newest first. The home page route in `src/server.js` renders them as links when the flag is on. The `/month` page itself is not built in this slice, so the links return 404 until it is built.

**Tech Stack:** Node 22.13+, built-in `node:sqlite`, `node:test`, global `fetch`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "Goals" (the home page lists each month, newest first, each linking to `/month?m=YYYY-MM`), "Non-goals" (the `/month` page itself is a separate piece), "How it gets built" items 10 (the flag hides the month list) and 11 (the query), and slice 4 of the `wheelhouse-slices` block.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- The month query is exactly `SELECT substr(date, 1, 7) AS month FROM transactions GROUP BY month ORDER BY month DESC`. Each link text and href uses that `YYYY-MM` value; the href is `/month?m=YYYY-MM`.
- While the flag is off, the home page shows no month list and no link to `/month`. The home page's existing text (`Nothing imported yet` or `<n> transactions imported`) is kept as it is.
- `src/lib/statement.js`, `src/lib/store.js`, `src/lib/money.js`, `src/lib/dates.js`, `src/lib/flags.js` and `src/lib/upload.js` are not changed.

## Review Focus

1. Months come back newest first across a year boundary (2026-01 after 2025-12, and 2026-12 first).
2. A month with transactions in only one row still appears once.
3. Months with no transactions do not appear (no empty month from a gap between months).
4. With the flag off, the home page contains no `/month?m=` text.
5. With the flag on and an empty database, the home page shows no month list and still shows `Nothing imported yet`.

Each line above gets its test in the task that owns the code.

---

## File Structure

- Create: `src/lib/months.js` (the query, `listMonths(db)`)
- Create: `tests/months.test.js`
- Modify: `src/server.js` (the home page branch only)
- Modify: `tests/import.test.js` or create `tests/home.test.js` (home page tests; choose one file and say which in the commit)

---

### Task 1: The month query

**Files:**
- Create: `src/lib/months.js`
- Test: `tests/months.test.js`

**Interfaces:**
- Consumes: an open `DatabaseSync` whose `transactions` table has the ISO `date` column (as `createTable` in `src/lib/store.js` makes it).
- Produces: `listMonths(db: DatabaseSync) -> string[]`: the `YYYY-MM` values from the query above, in that order. An empty table gives `[]`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/months.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable } from '../src/lib/store.js';
import { listMonths } from '../src/lib/months.js';

const withRows = (dates) => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  const insert = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  dates.forEach((date, i) => insert.run(date, `Row ${i}`, 100));
  return db;
};

test('an empty table has no months', () => {
  assert.deepEqual(listMonths(withRows([])), []);
});

test('months come back newest first across a year boundary', () => {
  const db = withRows(['2025-12-31', '2026-01-02', '2026-12-01', '2026-08-15']);
  assert.deepEqual(listMonths(db), ['2026-12', '2026-08', '2026-01', '2025-12']);
});

test('a month with many rows appears once, and a gap month does not appear', () => {
  const db = withRows(['2026-08-01', '2026-08-02', '2026-08-30', '2026-10-05']);
  assert.deepEqual(listMonths(db), ['2026-10', '2026-08']);
});

test('the sample statement months are the three months it covers', () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  db.exec("INSERT INTO transactions (date, description, cents) VALUES ('2026-08-02', 'A', 1), ('2026-09-05', 'B', 2), ('2026-10-31', 'C', 3)");
  assert.deepEqual(listMonths(db), ['2026-10', '2026-09', '2026-08']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/months.test.js`
Expected: FAIL with "Cannot find module" for `src/lib/months.js`.

- [ ] **Step 3: Implement `listMonths` in `src/lib/months.js`**

Prepare the query from Global Constraints, run `.all()`, and map each row to its `month` value.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/months.test.js`
Expected: all four tests PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/months.js tests/months.test.js
git commit -m "feat: list the months that have transactions, newest first"
```

---

### Task 2: The month list on the home page, behind the flag

**Files:**
- Modify: `src/server.js` (the `/` branch only)
- Test: `tests/home.test.js` (new file; the home page tests live here)

**Interfaces:**
- Consumes: `listMonths(db)` from Task 1; `isOn(flags, 'bank-statement-import')` from `src/lib/flags.js`; `createApp({ db, flags })` from slice 3.
- Produces: the home page. While the flag is on, after the existing count line, it renders an unordered list with one item per month: `<li><a href="/month?m=YYYY-MM">YYYY-MM</a></li>`, in the order `listMonths` returns, and only when there is at least one month. While the flag is off, the page is exactly what it is now.

- [ ] **Step 1: Write the failing tests**

```js
// tests/home.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createTable } from '../src/lib/store.js';
import { createApp } from '../src/server.js';

const serve = async (flags, dates = []) => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  const insert = db.prepare('INSERT INTO transactions (date, description, cents) VALUES (?, ?, ?)');
  dates.forEach((date, i) => insert.run(date, `Row ${i}`, 100));
  const server = createApp({ db, flags });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://localhost:${server.address().port}` };
};

test('with the flag on, the months are listed newest first with links', async () => {
  const { server, base } = await serve({ 'bank-statement-import': true }, ['2026-08-02', '2026-10-31']);
  try {
    const body = await (await fetch(`${base}/`)).text();
    assert.match(body, /<a href="\/month\?m=2026-10">2026-10<\/a>[\s\S]*<a href="\/month\?m=2026-08">2026-08<\/a>/);
  } finally {
    server.close();
  }
});

test('with the flag off, the home page has no month list', async () => {
  const { server, base } = await serve({ 'bank-statement-import': false }, ['2026-08-02']);
  try {
    const body = await (await fetch(`${base}/`)).text();
    assert.doesNotMatch(body, /\/month\?m=/);
    assert.match(body, /1 transactions imported/);
  } finally {
    server.close();
  }
});

test('with the flag on and no transactions, the home page shows Nothing imported yet and no list', async () => {
  const { server, base } = await serve({ 'bank-statement-import': true }, []);
  try {
    const body = await (await fetch(`${base}/`)).text();
    assert.match(body, /Nothing imported yet/);
    assert.doesNotMatch(body, /\/month\?m=/);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/home.test.js`
Expected: FAIL: the flag-on test finds no month links.

- [ ] **Step 3: Implement the list in the `/` branch of `createApp`**

Call `listMonths(db)` only when `isOn(flags, 'bank-statement-import')` is true and the month array is not empty. Build the list markup as described in Interfaces, after the existing count line.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/home.test.js`
Expected: all three tests PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/server.js tests/home.test.js
git commit -m "feat: list each month with transactions on the home page, behind the flag"
```

---

## Self-review notes

- Spec coverage: slice 4 done items map to Task 2 (the flag-on list shows 2026-08 for the sample months; the links; newest first) and Task 1 (the query). Item 10 of "How it gets built" (the flag hides the month list) is Task 2's flag-off test. Item 11 is Task 1's query.
- Types: `listMonths(db) -> string[]`; the home page is the only consumer.
- The `/month` page is out of scope; its links return 404 until the separate piece is built, as the approved design says.
