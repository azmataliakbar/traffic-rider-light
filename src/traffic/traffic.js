/**
 * Traffic: slower cars in the three lanes ahead of the bike.
 * Collision is a box test in (lateral, distance) space. A pass is a car crossing the bike's
 * position: a close call when the lateral gap is small and the bike is above 100 km/h,
 * otherwise a normal overtake.
 */
import { LANES } from '../road/track.js';
import { createRng } from '../physics/rng.js';
import { BIKE } from '../physics/bike.js';

export const CAR = Object.freeze({ width: 1.8, length: 4.2 });
export const CLOSE_CALL_GAP = 0.8; // metres between the bike and car edges
export const CLOSE_CALL_SPEED = 100 / 3.6; // 100 km/h in m/s
const SPAWN_AHEAD_MIN = 180;
const SPAWN_AHEAD_MAX = 520;
const CULL_BEHIND = 80;
const MIN_GAP_IN_LANE = 32; // metres between cars in one lane
const TARGET_CARS = 9;

export const CAR_COLOURS = Object.freeze(['#ff2d95', '#ffd44a', '#b8ff3b', '#ff8a3d', '#7a5cff', '#f2f6ff']);

export function createTraffic(seed) {
  return { cars: [], rng: createRng((seed ^ 0x5bd1e995) >>> 0), nextId: 1 };
}

function spawnCar(traffic, playerZ) {
  const r = traffic.rng;
  const laneIndex = Math.floor(r() * LANES.length);
  const lane = LANES[laneIndex];
  const z = playerZ + SPAWN_AHEAD_MIN + r() * (SPAWN_AHEAD_MAX - SPAWN_AHEAD_MIN);
  // Keep cars in a lane apart so they do not appear stacked.
  const blocked = traffic.cars.some((c) => c.lane === lane && Math.abs(c.z - z) < MIN_GAP_IN_LANE);
  if (blocked) return null;
  return {
    id: traffic.nextId++,
    lane,
    z,
    speed: 14 + r() * 10, // m/s, slower than the bike's cruising speed
    colour: CAR_COLOURS[Math.floor(r() * CAR_COLOURS.length)],
    prevDz: z - playerZ,
    resolved: false,
  };
}

/**
 * Advance cars, spawn and cull, and report passes against the bike.
 * bike: {x, speed}. playerZ: bike distance along the road (metres).
 * Returns {traffic, events, crashed}. events are {kind: 'overtake' | 'closeCall', speed, id}.
 */
export function stepTraffic(traffic, bike, playerZ, dt) {
  const events = [];
  let crashed = false;
  const cars = [];

  for (const car of traffic.cars) {
    const moved = { ...car, z: car.z + car.speed * dt };
    const dz = moved.z - playerZ;
    const lateralCentres = Math.abs(moved.lane - bike.x);
    const halfSum = (CAR.width + BIKE.halfWidth * 2) / 2;

    // Collision: the car's box overlaps the bike's box in both axes.
    if (Math.abs(dz) < (CAR.length + 1.8) / 2 && lateralCentres < halfSum) {
      crashed = true;
    }

    // Pass: the car was ahead and is now behind the bike.
    if (!moved.resolved && moved.prevDz > 0 && dz <= 0) {
      moved.resolved = true;
      const gap = lateralCentres - halfSum;
      const close = gap < CLOSE_CALL_GAP && bike.speed >= CLOSE_CALL_SPEED;
      events.push({ kind: close ? 'closeCall' : 'overtake', speed: bike.speed, id: car.id });
    }
    moved.prevDz = dz;

    if (moved.z - playerZ > -CULL_BEHIND) cars.push(moved);
  }

  traffic.cars = cars;

  let attempts = 0;
  while (traffic.cars.length < TARGET_CARS && attempts < 6) {
    attempts += 1;
    const car = spawnCar(traffic, playerZ);
    if (car) traffic.cars.push(car);
  }

  return { traffic, events, crashed };
}
