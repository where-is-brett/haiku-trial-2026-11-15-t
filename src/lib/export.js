// src/lib/export.js

import { CATEGORIES, categoryOf } from './categories.js';

// Quotes a text as one CSV field when it holds a comma, a double quote or a
// line break, doubling any double quote inside it.
export function csvField(text) {
  const value = String(text);
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// True only for YYYY-MM naming a real month, 01 to 12.
export function isMonth(text) {
  if (text === null || text === undefined) {
    return false;
  }
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(text));
}

// The label the month page shows for a description's category.
export function categoryLabel(description) {
  const key = categoryOf(description);
  const entry = CATEGORIES.find((category) => category.key === key);
  return entry.label;
}
