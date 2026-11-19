#!/usr/bin/env node
/**
 * Prueba fixMidnight / todayHours (medianoche «12:00 PM» tras apertura PM).
 * Ejecutar: node scripts/test_midnight_hours.mjs
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fixMidnight(h) {
  return h.replace(/(\d{1,2}:\d{2}\s*PM)\s*–\s*12:00\s*PM/gi, (m, open) => `${open} – 12:00 AM`);
}

const cases = [
  ['6:00 PM – 12:00 PM', '6:00 PM – 12:00 AM'],
  ['1:00 PM – 12:00 PM', '1:00 PM – 12:00 AM'],
  ['12:00 PM – 12:00 PM', '12:00 PM – 12:00 AM'],
  ['6:00 AM – 12:00 PM', '6:00 AM – 12:00 PM'],
  ['10:00 AM – 9:00 PM', '10:00 AM – 9:00 PM'],
  ['Cerrado', 'Cerrado'],
];
for (const [input, expected] of cases) {
  assert.equal(fixMidnight(input), expected, `fixMidnight(${input})`);
}

function toMins(str) {
  const ampm = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (ampm) {
    let hr = parseInt(ampm[1], 10);
    const mn = parseInt(ampm[2], 10);
    const ap = ampm[3].toUpperCase();
    if (ap === 'PM' && hr !== 12) hr += 12;
    if (ap === 'AM' && hr === 12) hr = 0;
    return hr * 60 + mn;
  }
  const mil = str.match(/(\d+):(\d+)/);
  if (mil) return parseInt(mil[1], 10) * 60 + parseInt(mil[2], 10);
  return null;
}

function isOpenAt(hoursStr, nowMins) {
  if (!hoursStr || hoursStr === 'Cerrado') return false;
  const ranges = hoursStr.split(',').map((s) => s.trim());
  for (const range of ranges) {
    const parts = range.split('–').map((s) => s.trim());
    if (parts.length < 2) continue;
    const open = toMins(parts[0]);
    let close = toMins(parts[1]);
    if (open === null || close === null) continue;
    if (close < open) close += 24 * 60;
    if (nowMins >= open && nowMins < close) return true;
  }
  return false;
}

const bad = '6:00 PM – 12:00 PM';
const good = fixMidnight(bad);
assert.equal(good, '6:00 PM – 12:00 AM');
const ninePm = 21 * 60;
const eightAm = 8 * 60;
assert.equal(isOpenAt(bad, ninePm), true, 'jueves 21:00: abierto con horario mal escrito');
assert.equal(isOpenAt(good, ninePm), true, 'jueves 21:00: abierto tras fix');
assert.equal(isOpenAt(bad, eightAm), false, 'jueves 08:00: cerrado (medianoche mal no abre de madrugada)');
assert.equal(isOpenAt(good, eightAm), false, 'jueves 08:00: cerrado tras fix');

const dataSrc = readFileSync(join(root, 'site/assets/restaurants-data.js'), 'utf8');
let fixedCount = 0;
for (const m of dataSrc.matchAll(/PM\s*[–-]\s*12:00\s*PM/gi)) fixedCount++;
assert.ok(fixedCount >= 20, `se esperaban muchos rangos PM–12:00 PM en el JSON (got ${fixedCount})`);

// Conteo documentado para QA (jueves 08:00 simulado)
function countOpenThursday(useFix) {
  const sandbox = { restaurants: [] };
  vm.createContext(sandbox);
  vm.runInNewContext(
    readFileSync(join(root, 'site/assets/restaurants-data.js'), 'utf8') + ';this.restaurants=restaurants',
    sandbox
  );
  let n = 0;
  for (const r of sandbox.restaurants) {
    let h = r.hours && r.hours.Thursday;
    if (!h) continue;
    if (useFix) h = fixMidnight(h);
    if (isOpenAt(h, eightAm)) n++;
  }
  return n;
}
const before8 = countOpenThursday(false);
const after8 = countOpenThursday(true);

console.log(
  'test_midnight_hours.mjs: OK (' +
    cases.length +
    ' casos, ' +
    fixedCount +
    ' rangos PM–12:00 PM en JSON; jueves 08:00 Chihuahua sim.: ' +
    before8 +
    ' → ' +
    after8 +
    ' abiertos)'
);