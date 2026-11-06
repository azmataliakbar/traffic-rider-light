import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBike, stepBike, BIKE } from '../src/physics/bike.js';
import { ROAD_HALF } from '../src/road/track.js';

const DT = 1 / 120;

test('throttle accelerates the bike and it levels off near top speed', () => {
  let b = createBike();
  for (let i = 0; i < 120 * 40; i += 1) b = stepBike(b, { up: true }, DT);
  assert.ok(b.speed > 45, `speed ${b.speed}`);
  assert.ok(b.speed <= BIKE.maxSpeed + 1e-9);
});

test('brake slows the bike to a stop and never goes negative', () => {
  let b = { ...createBike(), speed: 30 };
  for (let i = 0; i < 120 * 10; i += 1) b = stepBike(b, { down: true }, DT);
  assert.equal(b.speed, 0);
});

test('steering needs speed to bite and moves the bike sideways', () => {
  let slow = createBike();
  slow = stepBike(slow, { left: true }, 0.5);
  let fast = { ...createBike(), speed: 30 };
  fast = stepBike(fast, { left: true }, 0.5);
  assert.ok(Math.abs(fast.x) > Math.abs(slow.x));
  assert.ok(fast.x < 0);
});

test('grip upgrades steer faster, and acceleration upgrades accelerate harder', () => {
  let base = { ...createBike(), speed: 30 };
  let gripped = base;
  for (let i = 0; i < 60; i += 1) {
    base = stepBike(base, { left: true }, DT);
    gripped = stepBike(gripped, { left: true }, DT, { gripMult: 1.5 });
  }
  assert.ok(Math.abs(gripped.x) > Math.abs(base.x));

  let plain = createBike();
  let boosted = createBike();
  for (let i = 0; i < 120; i += 1) {
    plain = stepBike(plain, { up: true }, DT);
    boosted = stepBike(boosted, { up: true }, DT, { accelMult: 1.4 });
  }
  assert.ok(boosted.speed > plain.speed);
});

test('steering onto the verge is detected and slows the bike, and the bike cannot leave the verge', () => {
  let b = { ...createBike(), speed: 30 };
  for (let i = 0; i < 120 * 3; i += 1) b = stepBike(b, { left: true }, DT);
  assert.equal(b.offroad, true);
  assert.ok(Math.abs(b.x) <= ROAD_HALF + 2 + 1e-9);
  assert.ok(b.speed < 30);
  assert.equal(createBike().offroad, false);

  let off = { ...createBike(), speed: 30, x: ROAD_HALF };
  off = stepBike(off, {}, 0.5);
  assert.equal(off.offroad, true);
  assert.ok(off.speed < 30);
});
