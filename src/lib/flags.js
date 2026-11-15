// src/lib/flags.js
import fs from 'node:fs';

// Reads the feature flag file. A missing file means every flag is off.
export function loadFlags(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// True only when the flag is set to true.
export function isOn(flags, name) {
  return flags[name] === true;
}
