# Bank statement import, slice 2: Store rows and skip duplicates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rows read from a statement are stored once. A repeated import adds nothing. The counts say how many were added and how many skipped. A failure part-way stores nothing from that file.

**Architecture:** One module, `src/lib/store.js`, that takes an open `node:sqlite` database and a list of rows (the shape `readStatement` returns from slice 1) and writes them in one SQLite transaction. Duplicates are found by comparing against the stored rows on date, description and cents; each stored row can match at most one row in the file. Nothing calls the module yet; slice 3 wires it to `/import`.

**Tech Stack:** Node 22.13+, built-in `node:sqlite` (`DatabaseSync`), built-in `node:test`, `node:assert/strict`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "Goals" (rows skipped when they match a stored row), "Anti-goals" (no half-imported file; no duplicate stored twice), "Constraints" (existing `transactions` table kept as it is), "How it gets built" items 6 (duplicates), 7 (one transaction), and the decided point on two identical rows in one file, and slice 2 of the `wheelhouse-slices` block.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- The existing `transactions` table (`id`, `date`, `description`, `cents`) keeps its definition. Dates are ISO `YYYY-MM-DD`; money is integer cents.
- `src/lib/money.js`, `src/lib/dates.js`, `src/lib/statement.js` and `src/server.js` are not changed in this slice.
- Two identical rows in one file are both kept when none is stored. A row that appears twice in the file and once in the table adds one.

## Review Focus

1. The same file imported twice: the second import adds nothing and skips every row.
2. A file with two identical rows (same date, description and amount) and nothing stored: both are added.
3. A file with a row that is already stored once and appears twice in the file: one is added, one is skipped.
4. A failure part-way through the inserts: the table keeps exactly the rows it had before the call.
5. Same date and description but a different amount: not a duplicate; added.

Each line above gets its test in the task that owns the code (Task 1 for 1, 2, 3 and 5; Task 2 for 4).

---

## File Structure

- Create: `src/lib/store.js` (creates the table if asked, stores rows once, returns counts)
- Create: `tests/store.test.js`

Existing files are not modified.

---

### Task 1: Store rows once and count them

**Files:**
- Create: `src/lib/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: rows of shape `{ date: string, description: string, cents: number }` (the `readStatement` row shape from slice 1; the `line` property is ignored here).
- Produces:
  - `createTable(db: DatabaseSync) -> void`: runs `CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, date TEXT, description TEXT, cents INTEGER)`, the same definition `src/server.js` uses.
  - `importRows(db: DatabaseSync, rows: Array<{ date, description, cents }>) -> { added: number, skipped: number }`: stores the rows that are not already stored, and returns the counts. Descriptions are trimmed before comparing and storing.

Matching rule (ruled, from the approved design): keep a count per key (date, trimmed description, cents), starting at the number of rows already stored with that key. For each file row in order: if the key's count is above zero, decrement it and skip the row; otherwise insert the row, count it as added, and leave the key's count at zero. So two identical rows with nothing stored are both added (the second one finds the count at zero and inserts), and a second import of the same file adds nothing (every row finds a count above zero).

- [ ] **Step 1: Write the failing tests**

```js
// tests/store.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTable, importRows } from '../src/lib/store.js';
import { readStatement } from '../src/lib/statement.js';

const row = (date, description, cents) => ({ date, description, cents });
const newDb = () => {
  const db = new DatabaseSync(':memory:');
  createTable(db);
  return db;
};
const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;

test('the same rows imported twice are added once', () => {
  const db = newDb();
  const rows = [row('2026-08-02', 'Skyline Broadband REF 0617', 858), row('2026-08-03', 'Hollis Insurance', -12350)];
  assert.deepEqual(importRows(db, rows), { added: 2, skipped: 0 });
  assert.deepEqual(importRows(db, rows), { added: 0, skipped: 2 });
  assert.equal(count(db), 2);
});

test('a row stored once and present twice in the file adds one and skips one', () => {
  const db = newDb();
  importRows(db, [row('2026-08-02', 'Kestrel Coffee Bar', 650)]);
  const again = [row('2026-08-02', 'Kestrel Coffee Bar', 650), row('2026-08-02', 'Kestrel Coffee Bar', 650)];
  assert.deepEqual(importRows(db, again), { added: 1, skipped: 1 });
  assert.equal(count(db), 2);
});

test('two identical rows in one file with nothing stored are both added', () => {
  const db = newDb();
  const twice = [row('2026-08-02', 'Kestrel Coffee Bar', 650), row('2026-08-02', 'Kestrel Coffee Bar', 650)];
  assert.deepEqual(importRows(db, twice), { added: 2, skipped: 0 });
  assert.deepEqual(importRows(db, twice), { added: 0, skipped: 2 });
  assert.equal(count(db), 2);
});

test('same date and description with a different amount is not a duplicate', () => {
  const db = newDb();
  importRows(db, [row('2026-08-02', 'Kestrel Coffee Bar', 650)]);
  assert.deepEqual(importRows(db, [row('2026-08-02', 'Kestrel Coffee Bar', 700)]), { added: 1, skipped: 0 });
  assert.equal(count(db), 2);
});

test('descriptions are trimmed before they are stored and compared', () => {
  const db = newDb();
  importRows(db, [row('2026-08-02', '  Kestrel Coffee Bar ', 650)]);
  assert.deepEqual(importRows(db, [row('2026-08-02', 'Kestrel Coffee Bar', 650)]), { added: 0, skipped: 1 });
  assert.equal(db.prepare('SELECT description FROM transactions').get().description, 'Kestrel Coffee Bar');
});

test('the sample statement imports as 128 added, then 128 skipped', () => {
  const text = fs.readFileSync(fileURLToPath(new URL('../data/sample-statement.csv', import.meta.url)), 'utf8');
  const rows = readStatement(text).map(({ date, description, cents }) => ({ date, description, cents }));
  const db = newDb();
  assert.deepEqual(importRows(db, rows), { added: 128, skipped: 0 });
  assert.deepEqual(importRows(db, rows), { added: 0, skipped: 128 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store.test.js`
Expected: FAIL with "Cannot find module" for `src/lib/store.js`.

- [ ] **Step 3: Implement `createTable` and `importRows` in `src/lib/store.js`**

`importRows` runs its work through a helper that counts stored matches with a prepared `SELECT COUNT(*)` on date, description and cents, and inserts with a prepared `INSERT`. It tracks, per key, how many matches it has already used in this call, and checks that count before each decision. The transaction handling is Task 2; in this task, run the loop without a transaction wrapper.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/store.test.js`
Expected: all six tests PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.js tests/store.test.js
git commit -m "feat: store statement rows once and count added and skipped"
```

---

### Task 2: A failure part-way stores nothing

**Files:**
- Modify: `src/lib/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: `importRows` and `createTable` from Task 1.
- Produces: no new names. `importRows` now runs all its inserts inside one SQLite transaction.

- [ ] **Step 1: Write the failing test**

Add to `tests/store.test.js`. A test-only trigger makes one specific insert fail:

```js
test('a failure part-way stores nothing from that file', () => {
  const db = newDb();
  importRows(db, [row('2026-08-01', 'Before', 100)]);
  db.exec("CREATE TRIGGER fail_on_boom BEFORE INSERT ON transactions WHEN NEW.description = 'BOOM' BEGIN SELECT RAISE(ABORT, 'boom'); END;");
  const file = [row('2026-08-02', 'First', 200), row('2026-08-03', 'BOOM', 300), row('2026-08-04', 'Last', 400)];
  assert.throws(() => importRows(db, file), /boom/);
  assert.equal(count(db), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/store.test.js`
Expected: FAIL: the count is 2 (the first row was stored before the failure).

- [ ] **Step 3: Wrap the work in one transaction**

In `importRows`, run `BEGIN` before the loop, `COMMIT` after it, and on any thrown error run `ROLLBACK` and rethrow. Use `db.exec` for the three statements.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/store.test.js`
Expected: all seven tests PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.js tests/store.test.js
git commit -m "feat: store a statement's rows in one transaction"
```

---

## Self-review notes

- Spec coverage: slice 2 done items map to Task 1 (same rows twice; counts) and Task 2 (failure part-way). The two-identical-rows decision is Task 1's test. Anti-goals: no duplicate stored twice (Task 1), no half-import (Task 2).
- Types: `importRows` returns `{ added, skipped }`; slice 3 consumes that name and the `readStatement` row shape.
