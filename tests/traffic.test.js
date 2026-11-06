import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTraffic, stepTraffic, CAR, CLOSE_CALL_SPEED } from '../src/traffic/traffic.js';
import { BIKE } from '../src/physics/bike.js';

const DT = 1 / 120;
const HALF_SUM = (CAR.width + BIKE.halfWidth * 2) / 2;

function oneCar(overrides) {
  return { id: 1, lane: 0, z: 500, speed: 0, colour: '#fff', prevDz: 10, resolved: false, ...overrides };
}

function withCars(cars) {
  return { ...createTraffic(1), cars };
}

test('a car in the bike’s box is a collision', () => {
  const res = stepTraffic(withCars([oneCar({ z: 500 })]), { x: 0, speed: 20 }, 500, DT);
  assert.equal(res.crashed, true);
});

test('a car in another lane is not a collision', () => {
  const res = stepTraffic(withCars([oneCar({ lane: 3, z: 500 })]), { x: 0, speed: 20 }, 500, DT);
  assert.equal(res.crashed, false);
});

test('a close pass above 100 km/h is a close call', () => {
  const car = oneCar({ lane: HALF_SUM + 0.3, z: 500, prevDz: 0.5 });
  const res = stepTraffic(withCars([car]), { x: 0, speed: CLOSE_CALL_SPEED + 2 }, 500.6, DT);
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].kind, 'closeCall');
});

test('a close pass below 100 km/h is only an overtake', () => {
  const car = oneCar({ lane: HALF_SUM + 0.3, z: 500, prevDz: 0.5 });
  const res = stepTraffic(withCars([car]), { x: 0, speed: 20 }, 500.6, DT);
  assert.equal(res.events[0].kind, 'overtake');
});

test('a wide pass above 100 km/h is an overtake, not a close call', () => {
  const car = oneCar({ lane: HALF_SUM + 3, z: 500, prevDz: 0.5 });
  const res = stepTraffic(withCars([car]), { x: 0, speed: CLOSE_CALL_SPEED + 5 }, 500.6, DT);
  assert.equal(res.events[0].kind, 'overtake');
});

test('each car is only counted once', () => {
  let res = stepTraffic(withCars([oneCar({ lane: HALF_SUM + 3, z: 500, prevDz: 0.5 })]), { x: 0, speed: 20 }, 500.6, DT);
  res = stepTraffic(res.traffic, { x: 0, speed: 20 }, 502, DT);
  assert.equal(res.events.length, 0);
});

test('traffic is spawned ahead and kept near its target count', () => {
  let traffic = createTraffic(42);
  let z = 0;
  for (let i = 0; i < 120 * 5; i += 1) {
    const res = stepTraffic(traffic, { x: 0, speed: 20 }, z, DT);
    traffic = res.traffic;
    z += 20 * DT;
  }
  assert.ok(traffic.cars.length >= 5 && traffic.cars.length <= 9, `count ${traffic.cars.length}`);
  for (const c of traffic.cars) assert.ok(c.z > z - 80, 'cars far behind are culled');
});
