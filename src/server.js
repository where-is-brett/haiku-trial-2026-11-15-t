// src/server.js
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createTable, importRows, findTransaction, categoryFor } from './lib/store.js';
import { loadFlags, isOn } from './lib/flags.js';
import { readStatement, StatementError } from './lib/statement.js';
import { readUpload, UploadError } from './lib/upload.js';
import { listMonths } from './lib/months.js';
import { CATEGORIES } from './lib/categories.js';
import { formatCents } from './lib/money.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Port and database path from the environment, with the defaults.
export function configFromEnv(env) {
  return {
    port: Number(env.PORT ?? 3000),
    dbPath: env.LEDGER_DB ?? 'ledger.db',
  };
}

function page(body) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Spending tracker</title></head>
<body>
<main>
<h1>Spending tracker</h1>
${body}
</main>
</body>
</html>
`;
}

// Escapes text for HTML, so a stored value is shown as written.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The edit page for the id in idText: { status, body }, body a full page.
function editPage(db, idText) {
  const row = /^\d+$/.test(idText ?? '') ? findTransaction(db, Number(idText)) : undefined;
  if (!row) return { status: 404, body: page('<p>No transaction with that id</p>') };

  const current = categoryFor(row);
  const options = CATEGORIES.map(
    (c) => `<option value="${c.key}"${c.key === current ? ' selected' : ''}>${escapeHtml(c.label)}</option>`,
  ).join('\n');
  const body = `<h2>Edit transaction</h2>
<p>${escapeHtml(row.date)} ${escapeHtml(row.description)} ${formatCents(row.cents)}</p>
<form method="post" action="/edit">
<input type="hidden" name="id" value="${row.id}">
<label for="category">Category</label>
<select name="category" id="category">
${options}
</select>
<button type="submit">Save</button>
</form>`;
  return { status: 200, body: page(body) };
}

// Reads an uploaded statement and stores its rows; answers with the page to show.
async function importStatement(req, db) {
  try {
    const text = await readUpload(req, { maxBytes: MAX_UPLOAD_BYTES });
    const rows = readStatement(text);
    const { added, skipped } = importRows(db, rows);
    return { status: 200, body: `<p>Added ${added}, skipped ${skipped}</p>` };
  } catch (error) {
    if (error instanceof UploadError) return { status: error.status, body: `<p>${error.message}</p>` };
    if (error instanceof StatementError) return { status: 400, body: `<p>${error.message}</p>` };
    throw error;
  }
}

// The server, not yet listening.
export function createApp({ db, flags }) {
  createTable(db);

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      const { n } = db.prepare('SELECT COUNT(*) AS n FROM transactions').get();
      let body = n === 0 ? '<p>Nothing imported yet</p>' : `<p>${n} transactions imported</p>`;
      if (isOn(flags, 'bank-statement-import')) {
        const months = listMonths(db);
        if (months.length > 0) {
          const items = months.map((m) => `<li><a href="/month?m=${m}">${m}</a></li>`).join('\n');
          body += `\n<ul>\n${items}\n</ul>`;
        }
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page(body));
      return;
    }
    if (url.pathname === '/import' && req.method === 'GET' && isOn(flags, 'bank-statement-import')) {
      const body = `<h2>Import a bank statement</h2>
<p>Upload a statement</p>
<form method="post" action="/import" enctype="multipart/form-data">
<input type="file" name="statement">
<button type="submit">Import</button>
</form>`;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page(body));
      return;
    }
    if (url.pathname === '/edit' && req.method === 'GET' && isOn(flags, 'edit-category')) {
      const { status, body } = editPage(db, url.searchParams.get('id'));
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }
    if (url.pathname === '/import' && req.method === 'POST' && isOn(flags, 'bank-statement-import')) {
      importStatement(req, db).then(
        ({ status, body }) => {
          const headers = { 'content-type': 'text/html; charset=utf-8' };
          // A refused oversized body is left unread, so the connection closes after it.
          if (status === 413) headers.connection = 'close';
          res.writeHead(status, headers);
          res.end(page(body));
        },
        () => {
          res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Server error');
        },
      );
      return;
    }
    res.writeHead(404,{ 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
}

function main() {
  const { port, dbPath } = configFromEnv(process.env);
  const flagsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'feature-flags.json');
  const db = new DatabaseSync(dbPath);
  const server = createApp({ db, flags: loadFlags(flagsPath) });
  server.listen(port, () => {
    console.log(`listening on ${server.address().port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
