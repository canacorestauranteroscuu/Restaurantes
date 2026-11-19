#!/usr/bin/env node
/**
 * Prueba fixMidnight, inRanges overnight y conteos «Abierto ahora».
 * Ejecutar: node scripts/test_midnight_hours.mjs
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const THU = 4;

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

function toMinsHM(str) {
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
  return mil ? parseInt(mil[1], 10) * 60 + parseInt(mil[2], 10) : null;
}

function inRanges(h, mins, overnightOnly) {
  if (!h || h === 'Cerrado') return false;
  for (const range of h.split(',').map((s) => s.trim())) {
    const parts = range.split('–').map((s) => s.trim());
    if (parts.length < 2) continue;
    const open = toMinsHM(parts[0]);
    let close = toMinsHM(parts[1]);
    if (open === null || close === null) continue;
    if (close <= open) close += 24 * 60;
    if (overnightOnly && close <= 24 * 60) continue;
    if (mins >= open && mins < close) return true;
  }
  return false;
}

function todayHoursFor(r, dayIndex) {
  const h = r.hours && r.hours[DAYS[dayIndex]];
  return h ? fixMidnight(h) : null;
}

function isOpenNowAt(r, dayIndex, hour, minute) {
  const mins = hour * 60 + minute;
  const yRaw = r.hours && r.hours[DAYS[(dayIndex + 6) % 7]];
  return (
    inRanges(todayHoursFor(r, dayIndex), mins, false) ||
    inRanges(yRaw ? fixMidnight(yRaw) : null, mins + 24 * 60, true)
  );
}

function formatHM24(str) {
  const m = toMinsHM(str);
  if (m === null) return str;
  const h = Math.floor(m / 60) % 24;
  const mi = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

function overnightCloseAt(r, dayIndex, hour, minute) {
  const mins = hour * 60 + minute;
  const yRaw = r.hours && r.hours[DAYS[(dayIndex + 6) % 7]];
  const yH = yRaw ? fixMidnight(yRaw) : null;
  if (!yH || yH === 'Cerrado') return null;
  for (const range of yH.split(',').map((s) => s.trim())) {
    const parts = range.split('–').map((s) => s.trim());
    if (parts.length < 2) continue;
    let open = toMinsHM(parts[0]);
    let close = toMinsHM(parts[1]);
    if (open === null || close === null) continue;
    if (close <= open) close += 24 * 60;
    if (close <= 24 * 60) continue;
    const virtualMins = mins + 24 * 60;
    if (virtualMins >= open && virtualMins < close) return parts[1];
  }
  return null;
}

function hoyHorarioAt(r, dayIndex, hour, minute) {
  const mins = hour * 60 + minute;
  const h = todayHoursFor(r, dayIndex);
  if (inRanges(h, mins, false) && h && h !== 'Cerrado') return 'Hoy ' + to24(h);
  const closeLbl = overnightCloseAt(r, dayIndex, hour, minute);
  if (closeLbl) return `Abierto hasta ${formatHM24(closeLbl)}`;
  if (!h) return 'Horario no disponible';
  if (h === 'Cerrado') return 'Hoy cerrado';
  return 'Hoy ' + to24(h);
}

function to24(s) {
  return s
    .replace(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi, (m, h, mi, ap) => {
      let hh = parseInt(h, 10) % 12;
      if (ap.toUpperCase() === 'PM') hh += 12;
      if (parseInt(h, 10) === 12 && ap.toUpperCase() === 'AM') hh = 0;
      if (parseInt(h, 10) === 12 && ap.toUpperCase() === 'PM') hh = 12;
      return `${String(hh).padStart(2, '0')}:${mi}`;
    })
    .replace(/\s*–\s*/g, '–');
}

/** Lógica anterior (solo horario de hoy, sin tramo overnight de ayer) */
function isOpenLegacyAt(r, dayIndex, hour, minute) {
  const h = todayHoursFor(r, dayIndex);
  if (!h || h === 'Cerrado') return false;
  return inRanges(h, hour * 60 + minute, false);
}

const sandbox = { restaurants: [] };
vm.createContext(sandbox);
vm.runInNewContext(
  readFileSync(join(root, 'site/assets/restaurants-data.js'), 'utf8') + ';this.restaurants=restaurants',
  sandbox
);
const restaurants = sandbox.restaurants;

function countAt(dayIndex, hour, minute, fn) {
  let n = 0;
  for (const r of restaurants) if (fn(r, dayIndex, hour, minute)) n++;
  return n;
}

const legacy0010 = countAt(THU, 0, 10, isOpenLegacyAt);
const open0010 = countAt(THU, 0, 10, isOpenNowAt);
const legacy0230 = countAt(THU, 2, 30, isOpenLegacyAt);
const open0230 = countAt(THU, 2, 30, isOpenNowAt);

assert.equal(legacy0010, 0, 'jueves 00:10 legacy: ninguno abierto sin overnight');
assert.equal(open0010, 5, 'jueves 00:10 con overnight de ayer');
assert.equal(countAt(THU, 1, 0, isOpenLegacyAt), 0);
assert.equal(countAt(THU, 1, 0, isOpenNowAt), 4, 'jueves 01:00 overnight');
assert.equal(open0230, legacy0230, 'jueves 02:30: mismos (tramos 01:30 ya cerraron)');
assert.ok(open0010 > legacy0010, '00:10 debe ganar lugares que cruzan medianoche');

const bolivar = restaurants.find((r) => r.name === 'Casa Cervecera Bolivar');
assert.ok(bolivar, 'Casa Cervecera Bolivar en datos');
assert.equal(isOpenNowAt(bolivar, THU, 0, 10), true, 'Bolivar abierto jueves 00:10');
const bolivarHorario = hoyHorarioAt(bolivar, THU, 0, 10);
assert.equal(bolivarHorario, 'Abierto hasta 01:30', 'hoyHorario coherente overnight');
assert.notEqual(bolivarHorario, 'Hoy cerrado');

for (const [h, m, label] of [
  [9, 0, '09:00'],
  [13, 0, '13:00'],
  [21, 0, '21:00'],
  [8, 0, '08:00'],
]) {
  const leg = countAt(THU, h, m, isOpenLegacyAt);
  const neu = countAt(THU, h, m, isOpenNowAt);
  assert.equal(neu, leg, `jueves ${label}: conteo nuevo = legacy (${neu} vs ${leg})`);
}

const dataSrc = readFileSync(join(root, 'site/assets/restaurants-data.js'), 'utf8');
const fixedCount = [...dataSrc.matchAll(/PM\s*[–-]\s*12:00\s*PM/gi)].length;
assert.ok(fixedCount >= 20, `rangos PM–12:00 PM en JSON (got ${fixedCount})`);

console.log(
  JSON.stringify(
    {
      ok: true,
      fixMidnightCases: cases.length,
      pmMidnightRanges: fixedCount,
      thursday: {
        '00:10': { legacy: legacy0010, withOvernight: open0010 },
        '01:00': { legacy: 0, withOvernight: 4 },
        '02:30': { legacy: legacy0230, withOvernight: open0230 },
        '08:00': countAt(THU, 8, 0, isOpenNowAt),
        '09:00': countAt(THU, 9, 0, isOpenNowAt),
        '13:00': countAt(THU, 13, 0, isOpenNowAt),
        '21:00': countAt(THU, 21, 0, isOpenNowAt),
      },
    },
    null,
    2
  )
);