/**
 * Traffic: cars in the three lanes ahead of the bike.
 *
 * Spacing rules (per mode):
 *  - Each lane has one speed for the whole run, so cars in a lane keep the same gap.
 *  - New cars are placed only where they keep at least `minGap` metres from the car ahead
 *    and behind in their lane, and at least CROSS_LANE_GAP metres from cars in other lanes.
 *  - Easy: a window of `clearWindow` metres may never have all three lanes occupied, so the
 *    rider always has a way through. Hard skips this rule and has more cars.
 *
 * Collision is a box test in (lateral, distance) space. A pass is a car crossing the bike:
 * a close call when the lateral gap is small and the bike is above 100 km/h, otherwise an overtake.
 */
import { LANES } from '../road/track.js';
import { createRng } from '../physics/rng.js';
import { BIKE } from '../physics/bike.js';

export const CAR = Object.freeze({ width: 1.8, length: 4.2 });
export const CLOSE_CALL_GAP = 0.8; // metres between the bike and car edges
export const CLOSE_CALL_SPEED = 100 / 3.6; // 100 km/h in m/s
export const CROSS_LANE_GAP = 12; // metres between cars in different lanes at spawn
const SPAWN_AHEAD_MIN = 180;
const SPAWN_AHEAD_MAX = 520;
const CULL_BEHIND = 80;

export const MODES = Object.freeze({
  easy: Object.freeze({ label: 'Easy', minGap: 100, speed: [12, 18], target: 6, clearWindow: 80, scoreMult: 1 }),
  hard: Object.freeze({ label: 'Hard', minGap: 50, speed: [16, 26], target: 9, clearWindow: 0, scoreMult: 1.5 }),
});

export const CAR_COLOURS = Object.freeze(['#ff2d95', '#ffd44a', '#b8ff3b', '#ff8a3d', '#7a5cff', '#f2f6ff']);

export function createTraffic(seed, difficulty = 'easy') {
  const mode = MODES[difficulty];
  if (!mode) throw new RangeError(`Unknown difficulty: ${difficulty}`);
  const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
  // One speed per lane for the whole run
  const laneSpeed = LANES.map(() => mode.speed[0] + rng() * (mode.speed[1] - mode.speed[0]));
  return { difficulty, mode, laneSpeed, cars: [], rng, nextId: 1 };
}

/** True when a new car at (laneIndex, z) keeps every spacing rule. */
export function spacingOk(traffic, laneIndex, z) {
  const { mode } = traffic;
  for (const c of traffic.cars) {
    const sameLane = c.laneIndex === laneIndex;
    const gap = Math.abs(c.z - z);
    if (sameLane && gap < mode.minGap) return false;
    if (!sameLane && gap < CROSS_LANE_GAP) return false;
  }
  if (mode.clearWindow > 0) {
    const bucket = Math.floor(z / mode.clearWindow);
    const lanes = new Set([laneIndex]);
    for (const c of traffic.cars) {
      if (Math.floor(c.z / mode.clearWindow) === bucket) lanes.add(c.laneIndex);
    }
    if (lanes.size >= LANES.length) return false; // would block every lane in this window
  }
  return true;
}

function spawnCar(traffic, playerZ) {
  const r = traffic.rng;
  const laneIndex = Math.floor(r() * LANES.length);
  const z = playerZ + SPAWN_AHEAD_MIN + r() * (SPAWN_AHEAD_MAX - SPAWN_AHEAD_MIN);
  if (!spacingOk(traffic, laneIndex, z)) return null;
  return {
    id: traffic.nextId++,
    laneIndex,
    lane: LANES[laneIndex],
    z,
    speed: traffic.laneSpeed[laneIndex],
    colour: CAR_COLOURS[Math.floor(r() * CAR_COLOURS.length)],
    prevDz: z - playerZ,
    resolved: false,
  };
}

/**
 * Easy only: keeps a clear way through. If an 80 m stretch ever holds cars in all three lanes
 * (cars keep moving, so this can happen after placement), the car farthest from the bike in
 * that stretch is removed. Removal happens far away, where cars are small on screen.
 */
export function enforceClearWindows(traffic, playerZ) {
  const W = traffic.mode.clearWindow;
  if (!(W > 0)) return traffic;
  let changed = true;
  while (changed) {
    changed = false;
    const groups = new Map();
    for (const c of traffic.cars) {
      const b = Math.floor(c.z / W);
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b).push(c);
    }
    for (const list of groups.values()) {
      if (new Set(list.map((c) => c.laneIndex)).size >= LANES.length) {
        const farthest = list.reduce((a, c) => (Math.abs(c.z - playerZ) > Math.abs(a.z - playerZ) ? c : a));
        traffic.cars = traffic.cars.filter((c) => c.id !== farthest.id);
        changed = true;
        break;
      }
    }
  }
  return traffic;
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
  enforceClearWindows(traffic, playerZ);

  let attempts = 0;
  while (traffic.cars.length < traffic.mode.target && attempts < 8) {
    attempts += 1;
    const car = spawnCar(traffic, playerZ);
    if (car) traffic.cars.push(car);
  }

  return { traffic, events, crashed };
}
