# Move a transaction to another category, slice 1: The edit page stores a category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/edit?id=<id>` shows a transaction and a `Category` select; saving stores the category and returns to that transaction's month, `/month?m=YYYY-MM`. The category is kept on re-import.

**Architecture:** A nullable `category` column on `transactions`, added to new and existing databases. `importRows` sets it on rows it adds, using `categoryOf`. Two flagged routes in `createApp`, `GET /edit` and `POST /edit`, use small store functions for reading and setting a row. Behind the `edit-category` flag, which is off.

**Tech Stack:** Node 22.13+, built-in `node:sqlite` and `node:test`, global `fetch`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "Goals", "Anti-goals", "Constraints" and "The calls made here", and slice 1 of the `wheelhouse-slices` block. Slice 2 (the month page's links and totals) is a separate plan.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- The `transactions` table gets a `category` column holding a category key, or NULL. Rows stored before this change stay NULL and are not backfilled.
- Dates are stored ISO (`2026-08-31`), as the table has them today.
- The select's label is `Category`; its options are the keys in `CATEGORIES` order, with `other` last; it opens on the transaction's current category.
- A saved move redirects to `/month?m=` with the transaction's own month.
- A POST with a category that is not a key gets a plain error and stores nothing. An unknown id gets a plain error page.
- The flag is `edit-category`, off in `config/feature-flags.json`. With it off, `/edit` answers `404 Not found`, as `/import` does.
- Not changed: the rules in `src/lib/categories.js` (only an export is added), `src/lib/dates.js`, `src/lib/money.js`, `src/lib/statement.js`, `src/lib/upload.js`.

## Review Focus

1. A description with HTML in it (`<b>Shop</b> & co`) shows escaped on `/edit`, never as markup. Test: `edit.test.js` "the description is shown escaped".
2. A row with a NULL stored category opens its select on its shop's category (`categoryOf`), not on `other`. Test: `edit.test.js` "the select opens on the stored category, else the shop's".
3. A malformed id (`abc`, `1.5`, `1abc`, or none) on GET or POST gets the error page and a 404, never a 500, and stores nothing. Test: `edit.test.js` "an unknown or malformed id gets the error page".
4. A POST with no `category` field is refused as a bad category, not stored as an empty string. Test: `edit.test.js` "a missing category is refused".
5. The redirect month follows the row's own date across a year boundary: a `2025-12-31` row goes to `/month?m=2025-12`. Test: `edit.test.js` "the redirect uses the row's own month across a year boundary".

Notes on the choices behind these (the plan decides them; none changes what users see beyond the spec):
- **Month from an ISO date.** `monthOf` in `src/lib/dates.js` parses `DD/MM/YYYY` and would throw on a stored `2026-08-31`. The redirect uses `date.slice(0, 7)`, as `listMonths` does. `dates.js` is not changed.
- **Schema on existing databases.** `CREATE TABLE IF NOT EXISTS` does not add a column to a table that already exists, so `createTable` also adds it when `PRAGMA table_info` lacks it. This only adds a nullable column; no row is changed. It is the schema change the approved design already names.
- **Check order on POST.** The id is checked first (unknown id: 404), then the category (bad category: 400).
- **Redirect target before slice 2.** `/month` is served only once the month-page branch merges and its flag is on, so the redirect lands on the 404 until then. Slice 1's test checks the `Location` header only.

---

## File Structure

- Modify: `src/lib/categories.js` (add `isCategoryKey`)
- Modify: `src/lib/store.js` (the column and its migration, `importRows` sets the category, `findTransaction`, `setCategory`, `categoryFor`)
- Modify: `src/server.js` (`escapeHtml`, `readForm`, the `GET /edit` and `POST /edit` branches, the page and save helpers)
- Modify: `config/feature-flags.json` (add `"edit-category": false`)
- Modify: `tests/store.test.js` (store tests added)
- Create: `tests/edit.test.js` (route tests)

---

### Task 1: The category column, and the store functions

**Files:**
- Modify: `src/lib/categories.js`
- Modify: `src/lib/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: `CATEGORIES` and `categoryOf` from `src/lib/categories.js`.
- Produces:
  - `isCategoryKey(key: string) -> boolean` (`src/lib/categories.js`): true when `key` is one of `CATEGORIES`' keys.
  - `createTable(db)` (unchanged signature): the table has `category TEXT`; a table without the column gains it.
  - `importRows(db, rows)` (unchanged signature): an added row gets `category = categoryOf(description)`; a skipped row is not touched.
  - `findTransaction(db, id: number) -> { id, date, description, cents, category } | undefined` (`src/lib/store.js`): `category` is the stored key or `null`.
  - `setCategory(db, id: number, key: string) -> void` (`src/lib/store.js`): stores `key` on that row. The caller has checked the key and the row.
  - `categoryFor(row) -> string` (`src/lib/store.js`): `row.category` when it is set, else `categoryOf(row.description)`. Slice 2's month page uses it too.

- [ ] **Step 1: Write the failing tests**

Add to `tests/store.test.js`, importing `setCategory` from `../src/lib/store.js`:

```js
test('an imported row gets the category its shop name gives', () => {
  const db = newDb();
  importRows(db, [row('2026-08-02', 'Greenbarrow Fresh', -4500), row('2026-08-03', 'Unknown Shop', -100)]);
  const categories = db.prepare('SELECT category FROM transactions ORDER BY id').all().map((r) => r.category);
  assert.deepEqual(categories, ['groceries', 'other']);
});

test("a re-import keeps a moved row's category", () => {
  const db = newDb();
  const rows = [row('2026-08-02', 'Greenbarrow Fresh', -4500)];
  importRows(db, rows);
  setCategory(db, 1, 'dining');
  assert.deepEqual(importRows(db, rows), { added: 0, skipped: 1 });
  assert.equal(db.prepare('SELECT category FROM transactions WHERE id = 1').get().category, 'dining');
});

test('a table made before the column existed gains it, and its rows have no category', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE transactions (id INTEGER PRIMARY KEY, date TEXT, description TEXT, cents INTEGER)');
  db.exec("INSERT INTO transactions (date, description, cents) VALUES ('2026-08-02', 'Greenbarrow Fresh', -4500)");
  createTable(db);
  assert.equal(db.prepare('SELECT category FROM transactions').get().category, null);
  assert.deepEqual(importRows(db, [row('2026-08-02', 'Greenbarrow Fresh', -4500)]), { added: 0, skipped: 1 });
});
```

Also add to `tests/categories.test.js`: `isCategoryKey('dining')` is true, `isCategoryKey('eating_out')` and `isCategoryKey('')` are false.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/store.test.js tests/categories.test.js`
Expected: FAIL, `setCategory` and `isCategoryKey` are not exported, and the category assertions get `undefined`.

- [ ] **Step 3: Implement**

- `src/lib/categories.js`: `export function isCategoryKey(key)` returns `CATEGORIES.some((c) => c.key === key)`.
- `src/lib/store.js`:
  - `createTable` keeps its `CREATE TABLE IF NOT EXISTS`, now with `category TEXT` in it. Then it reads `PRAGMA table_info(transactions)` and runs `ALTER TABLE transactions ADD COLUMN category TEXT` only when no column is named `category`.
  - `importRows`: the INSERT names the `category` column, and its value is `categoryOf(description)`, using the trimmed description. Nothing else in the loop changes.
  - `findTransaction`, `setCategory` and `categoryFor` as in Interfaces. `findTransaction` is a `SELECT id, date, description, cents, category ... WHERE id = ?` that returns `.get()`'s result, or `undefined`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/store.test.js tests/categories.test.js`
Expected: PASS, and every test in the two files passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/categories.js src/lib/store.js tests/store.test.js tests/categories.test.js
git commit -m "feat: store a category on each transaction, kept on re-import"
```

---

### Task 2: The edit page, behind the flag

**Files:**
- Modify: `config/feature-flags.json`
- Modify: `src/server.js`
- Test: `tests/edit.test.js`

**Interfaces:**
- Consumes: `findTransaction`, `categoryFor` and `setCategory` (Task 1); `CATEGORIES` and `isCategoryKey` (Task 1); `formatCents` from `src/lib/money.js`; `isOn` from `src/lib/flags.js`.
- Produces: `GET /edit?id=<id>` in `createApp`. With the flag on, it answers 200 with the page, or 404 with the error page for an unknown or malformed id. With the flag off it answers the existing `404 Not found`.

- [ ] **Step 1: Write the failing tests**

`tests/edit.test.js`, with the same `serve(flags)` helper as `tests/import.test.js` and a `seed(db, ...)` that calls `importRows`, so row 1 is the first seeded row:

```js
test('the edit page shows the transaction and a Category select in CATEGORIES order', async () => {
  // seed row 1: '2026-08-02', 'Greenbarrow Fresh', -4500; flags { 'edit-category': true }
  // GET /edit?id=1
  // assert status 200
  // assert body matches /<input type="hidden" name="id" value="1">/
  // assert body matches /<label[^>]*>Category<\/label>/ and /<select name="category"/
  // assert the option values, in order, equal CATEGORIES.map((c) => c.key)
});

test('the select opens on the stored category, else the shop\'s', async () => {
  // row 1 'Greenbarrow Fresh' has no stored category: body contains '<option value="groceries" selected>'
  // setCategory(db, 1, 'dining'): body contains '<option value="dining" selected>' and no 'selected' on groceries
});

test('the description is shown escaped', async () => {
  // seed '<b>Shop</b> & co': body contains '&lt;b&gt;Shop&lt;/b&gt; &amp; co' and not '<b>Shop'
});

test('an unknown or malformed id gets the error page', async () => {
  // for id=999, id=abc, id=1.5, id=1abc and no id: status 404, body contains 'No transaction with that id'
});

test('with the flag off, /edit is not found', async () => {
  // serve({}) and GET /edit?id=1: status 404, body 'Not found'
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/edit.test.js`
Expected: FAIL, every `/edit` request answers `404 Not found`.

- [ ] **Step 3: Implement**

- `config/feature-flags.json`: add `"edit-category": false`.
- `src/server.js`:
  - `escapeHtml(text)` replaces `& < > " '` with their entities. Every value the page prints goes through it.
  - `GET /edit`, in the `createApp` handler and behind `isOn(flags, 'edit-category')`. A small `editPage(db, idText)` returns `{ status, body }`:
    - The id must match `/^\d+$/` and `findTransaction` must find it. Otherwise: `404`, `page('<p>No transaction with that id</p>')`.
    - Otherwise: `200`, a `<h2>Edit transaction</h2>`, a paragraph with the stored date, the escaped description and `formatCents(cents)`, then `<form method="post" action="/edit">` with `<input type="hidden" name="id" value="<id>">`, `<label for="category">Category</label>`, and `<select id="category" name="category">`. Its options come from `CATEGORIES`, in order, each `<option value="<key>">` with the label, and the one whose key is `categoryFor(row)` gets ` selected`. Then `<button type="submit">Save</button>`.
  - Respond with `text/html; charset=utf-8`, the same as the other pages.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/edit.test.js`
Expected: PASS, all five tests.

- [ ] **Step 5: Commit**

```bash
git add config/feature-flags.json src/server.js tests/edit.test.js
git commit -m "feat: the edit page shows a transaction's category, behind the flag"
```

---

### Task 3: Saving a category

**Files:**
- Modify: `src/server.js`
- Test: `tests/edit.test.js`

**Interfaces:**
- Consumes: `findTransaction`, `setCategory` (Task 1); `isCategoryKey` (Task 1); `UploadError` from `src/lib/upload.js` (its `status` is the response code); `editPage` (Task 2).
- Produces: `POST /edit` in `createApp`, behind the same flag. It answers:
  - `303` with `Location: /month?m=YYYY-MM` (the row's own month, `date.slice(0, 7)`) after storing the key;
  - `400` with the plain message `Choose a category from the list` when `category` is missing or not a key, storing nothing;
  - `404` with `No transaction with that id` for an unknown or malformed id, storing nothing;
  - `413` with `The form is larger than 4 KB` for a body over 4 KB, with `connection: close`, storing nothing;
  - `404 Not found` with the flag off.

- [ ] **Step 1: Write the failing tests**

Add to `tests/edit.test.js`. The POST sends `new URLSearchParams({ id, category })` as its body, with `content-type: application/x-www-form-urlencoded`, and `redirect: 'manual'`, so the 303 is seen rather than followed.

```js
test('saving a category stores it and redirects to the transaction\'s month', async () => {
  // seed row 1: '2026-08-02'; POST id=1&category=dining
  // assert status 303, location header '/month?m=2026-08', and the stored category 'dining'
});

test('the redirect uses the row\'s own month across a year boundary', async () => {
  // seed '2025-12-31'; POST id=1&category=bills; location '/month?m=2025-12'
});

test('a category that is not a key is refused and stores nothing', async () => {
  // POST category=eating_out: status 400, body contains 'Choose a category from the list', stored category still null
});

test('a missing category is refused', async () => {
  // POST with only id=1: status 400, stored category still null
});

test('an unknown id on save gets the error page and stores nothing', async () => {
  // POST id=999&category=dining: status 404, body 'No transaction with that id', count of rows with category 'dining' is 0
});

test('a body over 4 KB is refused with 413', async () => {
  // POST a body of 5000 bytes ('x' filler plus id=1&category=dining): status 413, stored category still null
});

test('with the flag off, a POST to /edit is not found', async () => {
  // serve({}), POST id=1&category=dining: status 404, body 'Not found'
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/edit.test.js`
Expected: FAIL, the new POST tests get `404 Not found` and nothing is stored.

- [ ] **Step 3: Implement**

- `readForm(req, { maxBytes })` in `src/server.js`: collects the body the way `readBody` does in `src/lib/upload.js` (chunks counted as they arrive). Past `maxBytes` it stops reading and throws `new UploadError('The form is larger than 4 KB', 413)`, and the handler sets `connection: close` on that 413, as the `/import` branch does. Returns the body as text.
- `saveCategory(db, text)` in `src/server.js` returns `{ status, body }` or `{ status: 303, location }`:
  1. `new URLSearchParams(text)`; read `id` and `category`.
  2. An `id` that fails `/^\d+$/`, or a `findTransaction` miss: `404`, `No transaction with that id`.
  3. A `category` that `isCategoryKey` rejects (including a missing field): `400`, `Choose a category from the list`.
  4. Otherwise `setCategory(db, row.id, category)` and `{ status: 303, location: `/month?m=${row.date.slice(0, 7)}` }`.
- The `POST /edit` branch in `createApp`, behind `isOn(flags, 'edit-category')`, mirrors the `/import` POST branch: `readForm`, then `saveCategory`, then write the status, with `location` for a 303 and the page wrapper for the rest. A `UploadError` from `readForm` answers with its `status`. Any other error answers `500 Server error`, as `/import` does.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/edit.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Run the whole suite and check the size of the change**

Run: `npm test`
Expected: every test passes. The 54 existing tests, plus the new store, categories and edit tests, all pass, with `# fail 0`.

Run: `git diff --stat origin/HEAD...HEAD`
Expected: under about 600 changed lines for the slice.

- [ ] **Step 6: Commit**

```bash
git add src/server.js tests/edit.test.js
git commit -m "feat: saving a category on the edit page stores it and returns to the month"
```
