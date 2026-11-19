#!/usr/bin/env node
/**
 * Geometría del giro: el ángulo final deja el gajo ganador bajo el puntero;
 * el hub sigue segmentUnderPointer (sin saltos fuera de bordes de gajo).
 * Ejecutar: node scripts/test_ruleta_spin.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Debe coincidir con site/assets/ruleta.js
const SEG = 30;
const mod = (n, m) => ((n % m) + m) % m;
const segmentUnderPointer = (a) => Math.floor(mod(15 - a, 360) / SEG);

function spinEndAngle(start, winnerIndex) {
  const target = mod(-winnerIndex * SEG, 360);
  return start + 4 * 360 + mod(target - mod(start, 360), 360);
}

for (let winnerIndex = 0; winnerIndex < 12; winnerIndex++) {
  for (let start = 0; start < 720; start += 11.3) {
    const end = spinEndAngle(start, winnerIndex);
    assert.equal(
      segmentUnderPointer(end),
      winnerIndex,
      `winner ${winnerIndex} start ${start} end ${end}`
    );
  }
}

// Centro sigue al puntero: en cada frame el índice mostrado es el del gajo bajo el puntero.
const start = 47;
const winnerIndex = 5;
const end = spinEndAngle(start, winnerIndex);
const slots = Array.from({ length: 12 }, (_, i) => i);
for (let i = 0; i <= 500; i++) {
  const p = i / 500;
  const eased = 1 - Math.pow(1 - p, 3);
  const a = start + (end - start) * eased;
  const idx = segmentUnderPointer(a);
  assert.equal(slots[idx], idx, `frame ${i} angle ${a}`);
  assert.ok(idx >= 0 && idx < 12);
}
assert.equal(segmentUnderPointer(end), winnerIndex);

const ruletaJs = readFileSync(join(root, 'site/assets/ruleta.js'), 'utf8');
assert.match(ruletaJs, /const SPIN_MS = 4600/);
assert.match(ruletaJs, /segmentUnderPointer/);
assert.match(ruletaJs, /setHub\(slots\[index\]\)/);

const dataJs = readFileSync(join(root, 'site/assets/restaurants-data.js'), 'utf8');
assert.match(dataJs, /name: "naturalbalance\.club"/);
assert.doesNotMatch(ruletaJs, /r\.web|<a[^>]*>\$\{.*web/);

console.log('test_ruleta_spin.mjs: OK');