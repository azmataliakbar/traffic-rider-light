import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, createGameLoop } from '../src/engine/loop.js';

const DT = 1 / 240;

test('advance turns elapsed time into whole fixed steps and keeps the remainder', () => {
  const r = advance(0, 0.05, DT, 0.1);
  assert.equal(r.steps, 12);
  assert.ok(Math.abs(r.accumulator - (0.05 - 12 * DT)) < 1e-9);
});

test('sub-step frames produce no steps but accumulate', () => {
  const first = advance(0, DT / 2);
  assert.equal(first.steps, 0);
  assert.equal(advance(first.accumulator, DT / 2).steps, 1);
});

test('long frames (tab switches) are clamped', () => {
  const r = advance(0, 5, DT, 0.1, 16);
  assert.ok(r.steps <= 16);
  assert.ok(r.accumulator <= DT);
});

test('the loop calls update with the fixed step and render once per frame', () => {
  const updates = [];
  let renders = 0;
  let scheduled = null;
  const loop = createGameLoop({
    fixedDt: DT,
    update: (dt) => updates.push(dt),
    render: () => {
      renders += 1;
    },
    requestFrame: (cb) => {
      scheduled = cb;
      return 1;
    },
    cancelFrame: () => {},
  });
  loop.start();
  scheduled(1000);
  scheduled(1000 + 1000 / 60);
  assert.equal(renders, 2);
  assert.ok(updates.length >= 1);
  assert.ok(updates.every((dt) => dt === DT));
  loop.stop();
  assert.equal(loop.running, false);
});
