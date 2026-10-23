import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMedicine } from './medicines.js';

const line = (name: string) => `123\t${name}\t1\t2\t3\t\tUNKNOWN\t\t20240101\t`;

test('splits brand, generic, strength, form and route', () => {
  const m = parseMedicine(line('Safedox (cefpodoxime) 200 mg film-coated oral tablet'))!;
  assert.deepEqual([m.brand, m.generic, m.strength, m.form, m.route], ['Safedox', 'cefpodoxime', '200 mg', 'film-coated oral tablet', 'Oral']);
});

test('combination products keep every strength', () => {
  const m = parseMedicine(line('Cefpod CV (cefpodoxime and clavulanic acid) 200 mg + 125 mg oral tablet'))!;
  assert.equal(m.strength, '200 mg + 125 mg');
  assert.equal(m.generic, 'cefpodoxime and clavulanic acid');
});

test('injections map to a route and per-volume strengths survive', () => {
  const m = parseMedicine(line('Narish (amikacin sulfate) 500 mg/2 mL solution for injection'))!;
  assert.equal(m.route, 'Intravenous');
  assert.match(m.strength, /500 mg/);
});

test('a row with no id or name is skipped', () => {
  assert.equal(parseMedicine('\t\t'), null);
});
