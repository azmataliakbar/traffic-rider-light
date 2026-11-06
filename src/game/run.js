/**
 * One run: the bike, traffic, and score. stepRun is the only function that advances the game.
 * Deterministic for a seed, mode, and input sequence.
 */
import { createBike, stepBike } from '../physics/bike.js';
import { createTraffic, stepTraffic, MODES } from '../traffic/traffic.js';
import { createScore, applyPass, tickMultiplier, distancePoints, moneyFor } from '../scoring/score.js';
import { randomSeed } from '../physics/rng.js';

export const UPGRADE_MAX = 5;
export const UPGRADES = Object.freeze({
  grip: { label: 'Grip', perLevel: 0.12, key: 'gripMult' },
  acceleration: { label: 'Acceleration', perLevel: 0.1, key: 'accelMult' },
});
export const DIFFICULTY_NAMES = Object.freeze(Object.keys(MODES));

/** Multipliers from saved upgrade levels. */
export function upgradeMods(levels = {}) {
  return {
    gripMult: 1 + UPGRADES.grip.perLevel * (levels.grip ?? 0),
    accelMult: 1 + UPGRADES.acceleration.perLevel * (levels.acceleration ?? 0),
  };
}

export function createRun({ seed = randomSeed(), difficulty = 'easy', upgrades = {} } = {}) {
  if (!MODES[difficulty]) throw new RangeError(`Unknown difficulty: ${difficulty}`);
  return {
    seed,
    difficulty,
    mods: upgradeMods(upgrades),
    bike: createBike(),
    z: 0, // metres travelled
    time: 0,
    traffic: createTraffic(seed, difficulty),
    score: createScore(),
    status: 'running', // 'running' | 'crashed'
    lastEvent: null,
  };
}

export function stepRun(run, input, dt) {
  if (run.status !== 'running') return run;
  const bike = stepBike(run.bike, input, dt, run.mods);
  const z = run.z + bike.speed * dt;
  const time = run.time + dt;

  const result = stepTraffic(run.traffic, bike, z, dt);
  let score = tickMultiplier(run.score, time);
  for (const event of result.events) score = applyPass(score, event, time);

  run.bike = bike;
  run.z = z;
  run.time = time;
  run.traffic = result.traffic;
  run.score = score;
  run.lastEvent = result.events.length ? result.events[result.events.length - 1] : run.lastEvent;

  if (result.crashed) run.status = 'crashed';
  return run;
}

/** Points for the run so far: distance plus passes, times the mode's multiplier. */
export function runPoints(run) {
  const base = run.score.points + distancePoints(run.z);
  return Math.round(base * MODES[run.difficulty].scoreMult);
}

/** Summary used by the result card and the score commands. */
export function runSummary(run) {
  const points = runPoints(run);
  return {
    difficulty: run.difficulty,
    distance: Math.floor(run.z),
    points,
    money: moneyFor(points),
    overtakes: run.score.overtakes,
    closeCalls: run.score.closeCalls,
    bestMultiplier: run.score.bestMultiplier,
    time: run.time,
  };
}
