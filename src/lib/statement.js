// src/lib/statement.js
import { parseAmount } from './money.js';
import { parseDate } from './dates.js';

const HEADER = ['Date', 'Description', 'Amount'];
const DATE_SHAPE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const AMOUNT_SHAPE = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;
const REFUND_SHAPE = /\bREF(UND)?\b/i;

// Raised for a text that cannot be read. `line` is the 1-based line number,
// or null for a file-level refusal.
export class StatementError extends Error {
  constructor(message, line) {
    super(message);
    this.name = 'StatementError';
    this.line = line;
  }
}

// Reads bank statement CSV text into rows. A bad row refuses the whole text.
export function readStatement(text) {
  const lines = String(text).split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== '');
  const notStatement = (line) => new StatementError(
    'Not a bank statement: the first line must be Date,Description,Amount',
    line,
  );
  if (headerIndex === -1) throw notStatement(1);

  let header;
  try {
    header = splitFields(lines[headerIndex]).map((field) => field.trim());
  } catch {
    throw notStatement(headerIndex + 1);
  }
  if (header.length !== HEADER.length || header.some((field, i) => field !== HEADER[i])) {
    throw notStatement(headerIndex + 1);
  }

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '') continue;
    rows.push(readRow(lines[i], i + 1));
  }
  if (rows.length === 0) {
    throw new StatementError('The statement has no transactions', null);
  }
  return rows;
}

// Reads one data line, or throws a StatementError naming the line.
function readRow(raw, line) {
  const fail = (reason) => new StatementError(`Line ${line}: ${reason}`, line);

  let fields;
  try {
    fields = splitFields(raw);
  } catch (error) {
    throw fail(error.message);
  }
  if (fields.length !== 3) throw fail('needs three fields');

  const [dateText, descriptionText, amountText] = fields.map((field) => field.trim());

  if (!isRealDate(dateText)) throw fail('date must be DD/MM/YYYY');
  const date = parseDate(dateText);

  if (descriptionText === '') throw fail('description is empty');

  const amountDigits = amountText.replace(/^\((.*)\)$/, '-$1');
  if (!AMOUNT_SHAPE.test(amountDigits)) throw fail('amount is not a number');
  const parsed = parseAmount(amountDigits.replace(/,/g, ''));
  // A refund written without a sign or brackets is money back, not spending.
  const cents = REFUND_SHAPE.test(descriptionText) && parsed > 0 ? -parsed : parsed;

  return { line, date, description: descriptionText, cents: cents === 0 ? 0 : cents };
}

// True when the text is DD/MM/YYYY and names a day that exists in that month.
function isRealDate(text) {
  const match = DATE_SHAPE.exec(text);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Splits one line on commas outside quotes. A quote opens a field only at its
// start; inside a quoted field "" is one quote and a lone quote closes it.
// Throws if the line ends inside a quoted field.
function splitFields(line) {
  const fields = [];
  let field = '';
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push(field);
      break;
    }
    const ch = line[i];
    if (ch === ',') {
      fields.push(field);
      field = '';
      i += 1;
    } else if (ch === '"' && field === '') {
      i += 1;
      let closed = false;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            closed = true;
            i += 1;
            break;
          }
        } else {
          field += line[i];
          i += 1;
        }
      }
      if (!closed) throw new Error('unclosed quote');
      let next = i;
      while (line[next] === ' ') next += 1;
      if (next < line.length && line[next] !== ',') {
        throw new Error('unexpected text after a closing quote');
      }
      i = next;
    } else {
      field += ch;
      i += 1;
    }
  }
  return fields;
}
