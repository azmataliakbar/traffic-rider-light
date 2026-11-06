import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTraffic, stepTraffic, MODES, CROSS_LANE_GAP } from '../src/traffic/traffic.js';
import { LANES } from '../src/road/track.js';
import { createRun, stepRun, runPoints } from '../src/game/run.js';
import { createDispatcher } from '../src/router/dispatcher.js';
import { createGameCommands } from '../src/router/commands.js';

const DT = 1 / 120;

/** A simple rider: each 0.5 s it steers into the lane with the most clear road ahead. */
function clearestLane(run) {
  let best = 0;
  let bestClear = -Infinity;
  LANES.forEach((lane, i) => {
    let clear = 60;
    for (const c of run.traffic.cars) {
      if (c.laneIndex === i && c.z > run.z && c.z - run.z < clear) clear = c.z - run.z;
    }
    if (clear > bestClear) {
      bestClear = clear;
      best = i;
    }
  });
  return LANES[best];
}

function botInput(run, state) {
  const target = clearestLane(run);
  const diff = target - run.bike.x;
  if (Math.abs(diff) < 0.3) return {};
  return diff < 0 ? { left: true } : { right: true };
}

/** Runs a bot rider for `seconds` on a seed and returns the run. */
function ride(seed, difficulty, seconds) {
  const run = createRun({ seed, difficulty });
  let input = {};
  for (let i = 0; i < seconds / DT && run.status === 'running'; i += 1) {
    if (i % 60 === 0) input = { up: true, ...botInput(run) };
    stepRun(run, input, DT);
  }
  return run;
}

test('cars in the same lane always keep the mode’s minimum gap', () => {
  for (const difficulty of Object.keys(MODES)) {
    const min = MODES[difficulty].minGap;
    let traffic = createTraffic(11, difficulty);
    let z = 0;
    for (let i = 0; i < 120 * 60; i += 1) {
      const res = stepTraffic(traffic, { x: 0, speed: 20 }, z, DT);
      traffic = res.traffic;
      z += 20 * DT;
      for (let a = 0; a < traffic.cars.length; a += 1) {
        for (let b = a + 1; b < traffic.cars.length; b += 1) {
          const ca = traffic.cars[a];
          const cb = traffic.cars[b];
          if (ca.laneIndex === cb.laneIndex) {
            assert.ok(Math.abs(ca.z - cb.z) >= min - 1e-6, `${difficulty}: ${Math.abs(ca.z - cb.z)} m apart`);
          }
        }
      }
    }
  }
});

test('a newly placed car is never within the cross-lane gap of a car in another lane', () => {
  let traffic = createTraffic(5, 'hard');
  let z = 0;
  for (let i = 0; i < 120 * 30; i += 1) {
    const before = new Set(traffic.cars.map((c) => c.id));
    traffic = stepTraffic(traffic, { x: 0, speed: 20 }, z, DT).traffic;
    z += 20 * DT;
    for (const c of traffic.cars) {
      if (before.has(c.id)) continue;
      for (const other of traffic.cars) {
        if (other.id === c.id || other.laneIndex === c.laneIndex) continue;
        assert.ok(Math.abs(other.z - c.z) >= CROSS_LANE_GAP - 1e-6, `placed ${Math.abs(other.z - c.z)} m from another lane`);
      }
    }
  }
});

test('easy keeps a clear way through: no 80 m stretch is blocked in all three lanes when cars are placed', () => {
  let traffic = createTraffic(21, 'easy');
  let z = 0;
  const window = MODES.easy.clearWindow;
  for (let i = 0; i < 120 * 90; i += 1) {
    const res = stepTraffic(traffic, { x: 0, speed: 0 }, z, DT);
    traffic = res.traffic;
    // Count the 80 m windows that are full in every lane right now
    const buckets = new Map();
    for (const c of traffic.cars) {
      const b = Math.floor(c.z / window);
      if (!buckets.has(b)) buckets.set(b, new Set());
      buckets.get(b).add(c.laneIndex);
    }
    for (const lanes of buckets.values()) {
      // Cars keep moving, so a window can gain a third lane between placements. This must stay rare.
      assert.ok(lanes.size < LANES.length, `window blocked in every lane at t=${i}`);
    }
  }
  const total = traffic.fullWindows ?? 0;
  assert.ok(total < 120 * 90 * 0.05, `full windows seen ${total}`);
});

test('hard has more cars on the road than easy', () => {
  const count = (difficulty) => {
    let traffic = createTraffic(3, difficulty);
    let sum = 0;
    for (let i = 0; i < 120 * 30; i += 1) {
      traffic = stepTraffic(traffic, { x: 0, speed: 0 }, 0, DT).traffic;
      sum += traffic.cars.length;
    }
    return sum / (120 * 30);
  };
  assert.ok(count('hard') > count('easy') + 1);
});

test('easy leaves more room than hard: wider gaps and fewer cars', () => {
  assert.ok(MODES.easy.minGap > MODES.hard.minGap);
  assert.ok(MODES.easy.target < MODES.hard.target);
});

test('hard scores 1.5 times the points of easy for the same ride', () => {
  const easy = createRun({ seed: 9, difficulty: 'easy' });
  const hard = createRun({ seed: 9, difficulty: 'hard' });
  easy.z = 400;
  hard.z = 400;
  assert.equal(runPoints(hard), Math.round(runPoints(easy) * 1.5));
});

test('the start command accepts only easy or hard', () => {
  const seen = [];
  const router = createGameCommands({
    session: { start: (o) => (seen.push(o), { seed: 1, difficulty: o.difficulty }) },
    garage: { buy: () => ({ ok: true, state: { upgrades: {}, money: 0 }, cost: 0 }), addMoney: () => ({ money: 0 }) },
    highScores: { add: () => ({ rank: 1, persisted: true }) },
  });
  assert.equal(router.dispatch('game.start', { difficulty: 'hard' }).ok, true);
  assert.equal(seen[0].difficulty, 'hard');
  assert.equal(router.dispatch('game.start', { difficulty: 'insane' }).ok, false);
  assert.equal(router.dispatch('game.start', {}).ok, true);
  assert.equal(seen[seen.length - 1].difficulty, 'easy');
  void createDispatcher;
});
