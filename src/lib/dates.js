// src/lib/dates.js

// '31/08/2026' becomes '2026-08-31'.
export function parseDate(text) {
  const [day, month, year] = String(text).trim().split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Reads both '31/08/2026' and a stored '2026-08-31'; each becomes '2026-08'.
export function monthOf(text) {
  const value = String(text).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return parseDate(text).slice(0, 7);
}
