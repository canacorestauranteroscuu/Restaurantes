#!/usr/bin/env node
/**
 * Cada categoría en restaurants-data debe filtrarse vía chip fijo o menú «Más».
 * Ejecutar: node scripts/test_category_filters.mjs
 */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { console, globalThis: null };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  readFileSync(join(root, 'site/assets/restaurants-data.js'), 'utf8') +
    '\nglobalThis.__restaurants = restaurants;',
  sandbox
);
vm.runInContext(
  readFileSync(join(root, 'site/assets/restaurant-core.js'), 'utf8') +
    '\nglobalThis.__more = moreFilterCategories;\n' +
    'globalThis.__home = HOME_CHIP_CATEGORY_KEYS;\n' +
    'globalThis.__labels = CATEGORY_LABELS;',
  sandbox
);

const restaurants = sandbox.__restaurants;
const moreFilterCategories = sandbox.__more;
const HOME_CHIP_CATEGORY_KEYS = sandbox.__home;
const CATEGORY_LABELS = sandbox.__labels;

const inData = new Set();
for (const r of restaurants) {
  for (const c of r.categories) inData.add(c);
}

const more = moreFilterCategories();
const reachable = new Set([...HOME_CHIP_CATEGORY_KEYS, ...more]);

for (const cat of inData) {
  assert.ok(reachable.has(cat), `category "${cat}" not reachable from chips or Más menu`);
}

assert.ok(more.includes('Eventos'), 'Eventos should be in Más menu');
assert.ok(more.includes('Área de niños'), 'Área de niños should be in Más menu');
assert.ok(more.includes('Otro'), 'Otro should be in Más menu');
assert.equal(more[more.length - 1], 'Otro', 'Otro must be last in Más menu');

for (const cat of HOME_CHIP_CATEGORY_KEYS) {
  assert.ok(inData.has(cat) || restaurants.some((r) => r.categories.includes(cat)), cat);
  assert.ok(!more.includes(cat), `${cat} must not appear in Más menu`);
}

// Orden: conteo desc (Bar 6 >= Pastelería 1)
const idxBar = more.indexOf('Bar');
const idxPast = more.indexOf('Pastelería');
if (idxBar >= 0 && idxPast >= 0) assert.ok(idxBar < idxPast);

for (const cat of more) {
  const label = CATEGORY_LABELS[cat] || cat;
  assert.ok(label.length > 0);
}

console.log('test_category_filters.mjs: OK', { moreCount: more.length, categoriesInData: inData.size });