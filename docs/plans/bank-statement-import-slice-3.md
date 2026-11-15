# Bank statement import, slice 3: The /import page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The director uploads a statement on `/import` and reads `Added n, skipped n`, or a plain error that adds nothing. The port and database path come from `PORT` and `LEDGER_DB`, and `:memory:` works. The page is behind the `bank-statement-import` flag, which is off.

**Architecture:** `src/server.js` becomes an app factory, `createApp({ db, flags })`, so tests can run it on `:memory:` with a flags object. The upload is read with a size cap into a buffer, then parsed with the built-in `Response.formData()`. The file goes through `readStatement` (slice 1) and `importRows` (slice 2). `src/lib/upload.js` holds the body reading and the size cap.

**Tech Stack:** Node 22.13+, built-in `node:http`, `node:sqlite`, `node:test`, global `fetch`, `FormData`, `Blob`, `Response`. No new dependency.

**Spec:** `.wheelhouse/feature/approved.md`, sections "Goals" (the `/import` page, file field named `statement`, `Added n, skipped n`, plain error, port and database from `PORT` and `LEDGER_DB`), "Anti-goals", "How it gets built" items 8 (5 MB limit, refused with a plain error before anything is read), 9 (multipart parsed with the built-in `Request.formData()`), 10 (flag; `/import` returns 404 while off), and slice 3 of the `wheelhouse-slices` block.

## Global Constraints

- Node 22.13 or later; built-in modules only; `package.json` gains no dependency.
- The upload field is named `statement`. The upload limit is 5 MB (5 × 1024 × 1024 bytes) for the whole request body.
- While the flag is off, `/import` (GET and POST) returns 404 with the same body as any other unknown path, and a POST stores nothing.
- `npm start` still runs the server on `PORT` (default 3000) with `LEDGER_DB` (default `ledger.db`).
- Exact user-visible text: the page contains `Upload a statement`; a successful POST shows `Added <n>, skipped <n>`; a refused file shows its plain error. The two new messages below are ruled in this plan and asked of the director.
- `src/lib/statement.js`, `src/lib/store.js`, `src/lib/money.js`, `src/lib/dates.js` and `src/lib/flags.js` are used as they are.

## Messages (ruled, see the director question)

- Upload larger than 5 MB: `The file is larger than 5 MB`, status 413.
- No statement file in the upload, or the body is not a form upload: `Choose a statement file`, status 400.
- A file that is not a statement or has a bad row: the message from `readStatement` as it is (`Not a bank statement: ...` or `Line <n>: ...`), status 400.
- Success: `Added <n>, skipped <n>`, status 200.

## Review Focus

1. An upload whose body is exactly 5 MB is accepted; one byte more is refused with the 413 message and nothing is stored.
2. A statement with one bad row, posted whole, is refused with its line number, and no row from it is stored.
3. A POST with no `statement` field, or a plain-text body, shows `Choose a statement file` and does not crash the server.
4. With the flag off, GET and POST to `/import` return 404, and a POST stores nothing.
5. A POST of the sample file a second time shows `Added 0, skipped 128` and the transaction count stays 128.

Each line above gets its test in the task that owns the code.

---

## File Structure

- Modify: `src/server.js` (app factory, `configFromEnv`, the `/import` routes; the home page is unchanged in this slice)
- Create: `src/lib/upload.js` (reads the request body under the cap and returns the `statement` file's text)
- Create: `tests/server.test.js` (config and home page)
- Create: `tests/import.test.js` (the `/import` page and upload)

---

### Task 1: App factory and environment config

**Files:**
- Modify: `src/server.js`
- Test: `tests/server.test.js`

**Interfaces:**
- Consumes: `createTable(db)` from `src/lib/store.js` (slice 2), `loadFlags(path)` from `src/lib/flags.js` (slice 1).
- Produces:
  - `configFromEnv(env: Record<string, string | undefined>) -> { port: number, dbPath: string }`: `port` is `Number(env.PORT ?? 3000)`, `dbPath` is `env.LEDGER_DB ?? 'ledger.db'`.
  - `createApp({ db: DatabaseSync, flags: Record<string, boolean> }) -> http.Server`: the server, not yet listening. It calls `createTable(db)` once. Its `/` route is the existing home page, unchanged. Unknown paths return the existing 404.
  - The module runs `main` only when it is the entry point: `import.meta.url === pathToFileURL(process.argv[1]).href`. Then it builds the db from `configFromEnv(process.env)`, the flags from `loadFlags('config/feature-flags.json')` (resolved from the module's own directory), calls `createApp`, and listens on the port, logging `listening on <port>` as the file does today.

- [ ] **Step 1: Write the failing tests**

```js
// tests/server.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { configFromEnv, createApp } from '../src/server.js';

test('the port and database path come from the environment, with defaults', () => {
  assert.deepEqual(configFromEnv({}), { port: 3000, dbPath: 'ledger.db' });
  assert.deepEqual(configFromEnv({ PORT: '8080', LEDGER_DB: ':memory:' }), { port: 8080, dbPath: ':memory:' });
});

test(':memory: works and the home page answers', async () => {
  const server = createApp({ db: new DatabaseSync(':memory:'), flags: {} });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Nothing imported yet/);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/server.test.js`
Expected: FAIL: `configFromEnv` and `createApp` are not exported.

- [ ] **Step 3: Refactor `src/server.js`**

Move the db creation and the `listen` call out of module scope and into the `main` block. Keep `page()` and the home-page body text exactly as they are. Export `configFromEnv` and `createApp` as in Interfaces.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/server.test.js`
Expected: both tests PASS.

- [ ] **Step 5: Check that `npm start` still runs**

Run: `PORT=0 LEDGER_DB=:memory: npm start` in the background, read the `listening on` line, then stop it.
Expected: a `listening on <port>` line and no error.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 7: Commit**

```bash
git add src/server.js tests/server.test.js
git commit -m "refactor: server as an app factory; port and database from the environment"
```

---

### Task 2: The /import page behind the flag

**Files:**
- Modify: `src/server.js`
- Test: `tests/import.test.js`

**Interfaces:**
- Consumes: `createApp({ db, flags })` from Task 1; `isOn(flags, name)` from `src/lib/flags.js`.
- Produces: the route `GET /import`. While `isOn(flags, 'bank-statement-import')` is false, it returns the 404 used for unknown paths. While it is true, it returns 200 with a page containing the text `Upload a statement` and a form with `method="post"`, `action="/import"`, `enctype="multipart/form-data"`, and `<input type="file" name="statement">`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/import.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/server.js';

const serve = async (flags) => {
  const db = new DatabaseSync(':memory:');
  const server = createApp({ db, flags });
  await new Promise((resolve) => server.listen(0, resolve));
  return { db, server, base: `http://localhost:${server.address().port}` };
};

test('GET /import shows the form when the flag is on', async () => {
  const { server, base } = await serve({ 'bank-statement-import': true });
  try {
    const res = await fetch(`${base}/import`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /Upload a statement/);
    assert.match(body, /<input type="file" name="statement">/);
    assert.match(body, /enctype="multipart\/form-data"/);
  } finally {
    server.close();
  }
});

test('GET /import is a 404 while the flag is off', async () => {
  const { server, base } = await serve({ 'bank-statement-import': false });
  try {
    const res = await fetch(`${base}/import`);
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'Not found');
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/import.test.js`
Expected: FAIL: the flag-on test gets 404.

- [ ] **Step 3: Add the route to `createApp`**

Add the `GET /import` branch before the 404. Read the flag with `isOn(flags, 'bank-statement-import')` on each request, so a test that changes the flags object sees the change. Use the existing `page()` helper for the body.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/import.test.js`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.js tests/import.test.js
git commit -m "feat: /import page behind the bank-statement-import flag"
```

---

### Task 3: Upload a statement and count it

**Files:**
- Create: `src/lib/upload.js`
- Modify: `src/server.js`
- Test: `tests/import.test.js`

**Interfaces:**
- Consumes: `readStatement(text)` and `StatementError` from `src/lib/statement.js`; `importRows(db, rows)` from `src/lib/store.js`; `isOn` from `src/lib/flags.js`.
- Produces:
  - `class UploadError extends Error` with `status: number` (413 for size, 400 for a missing or unreadable upload).
  - `readUpload(req: IncomingMessage, { maxBytes }) -> Promise<string>`: reads the body under `maxBytes` into a buffer, counting bytes as they arrive; above the cap it throws `UploadError('The file is larger than 5 MB', 413)` and stops reading. Then `new Response(buffer, { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData()`; a parse failure, or a missing or non-file `statement` field, throws `UploadError('Choose a statement file', 400)`. Otherwise it returns `await file.text()`.
  - Route `POST /import`: if the flag is off, the 404 from Task 2. Otherwise `text = await readUpload(req, { maxBytes: 5 * 1024 * 1024 })`, `rows = readStatement(text)`, `{ added, skipped } = importRows(db, rows)`, and 200 with `Added ${added}, skipped ${skipped}`. A `UploadError` or `StatementError` gives its status and the plain message on the page. Nothing is stored before `readStatement` has succeeded.

- [ ] **Step 1: Write the failing tests**

Add to `tests/import.test.js`. Build the uploads with `FormData` and `Blob`, post them with `fetch`:

```js
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const sample = fs.readFileSync(fileURLToPath(new URL('../data/sample-statement.csv', import.meta.url)), 'utf8');
const upload = (text, name = 'statement.csv') => {
  const form = new FormData();
  form.append('statement', new Blob([text]), name);
  return form;
};
const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;
```

Then these tests (each on its own `serve({ 'bank-statement-import': true })`, closing the server in `finally`):

- Posting `upload(sample)` returns 200 and a body containing `Added 128, skipped 0`; posting it again returns 200 with `Added 0, skipped 128`; the count is 128.
- Posting `upload('Name,Total\nA,1')` returns 400 with `Not a bank statement`, and the count stays 0.
- Posting a statement with one bad row in the middle (for example `02/08/2026,A,1.00` then `03/08/2026,B` then `04/08/2026,C,2.00`) returns 400 with `Line 3: needs three fields`, and the count stays 0.
- Posting a body of exactly 5 × 1024 × 1024 bytes returns 400 with `Not a bank statement` (accepted by size, refused by content); a body of 5 × 1024 × 1024 + 1 bytes returns 413 with `The file is larger than 5 MB`, and the count stays 0. Build the bodies as a `Buffer` with a multipart header and filler so the total length is exact; send them with `fetch` and `headers: { 'content-type': 'multipart/form-data; boundary=x' }`.
- Posting a plain-text body (no form) returns 400 with `Choose a statement file` and the server still answers a second request.
- Posting with the flag off returns 404 and stores nothing: use `serve({ 'bank-statement-import': false })`, post `upload(sample)`, and check `count(db) === 0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/import.test.js`
Expected: FAIL: POST `/import` gets 404 or 405.

- [ ] **Step 3: Implement `src/lib/upload.js` and the POST route**

Implement `readUpload` and `UploadError` as in Interfaces. Count the bytes in the `data` events; on the first chunk that takes the total over `maxBytes`, stop collecting, and reject with the 413 error. Add the POST branch to `createApp` as described.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/import.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/upload.js src/server.js tests/import.test.js
git commit -m "feat: upload a statement on /import and show added and skipped"
```

---

## Self-review notes

- Spec coverage: slice 3 done items map to Task 2 (the `Upload a statement` text, the flag) and Task 3 (`Added n, skipped n`, the plain error that adds nothing). The PORT, LEDGER_DB and `:memory:` item is Task 1. Items 8, 9 and 10 of "How it gets built" are Task 3 and Task 2.
- Types: `createApp({ db, flags })`, `configFromEnv(env)`, `readUpload(req, { maxBytes })`, `UploadError` with `status`. Slice 4 uses `createApp` and the flags object.
- The two new messages are ruled here; they are asked of the director before the build.
