import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, runSummary, upgradeMods } from '../src/game/run.js';
import { createDispatcher, ErrorCode } from '../src/router/dispatcher.js';
import { createGameCommands } from '../src/router/commands.js';
import {
  createGarage,
  createHighScores,
  upgradeCost,
  PROFILE_KEY,
  HIGHSCORE_KEY,
  MAX_ENTRIES,
} from '../src/storage/save.js';

const DT = 1 / 120;

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('a run is reproducible and driving straight eventually crashes into traffic', () => {
  const a = createRun({ seed: 7 });
  const b = createRun({ seed: 7 });
  for (let i = 0; i < 120 * 30; i += 1) {
    stepRun(a, { up: true }, DT);
    stepRun(b, { up: true }, DT);
  }
  assert.equal(a.z, b.z);
  assert.equal(a.status, b.status);
  assert.equal(a.status, 'crashed');
});

test('stepping a crashed run does nothing', () => {
  const run = createRun({ seed: 3 });
  run.status = 'crashed';
  const z = run.z;
  stepRun(run, { up: true }, DT);
  assert.equal(run.z, z);
});

test('upgrade levels become multipliers', () => {
  const m = upgradeMods({ grip: 2, acceleration: 3 });
  assert.ok(Math.abs(m.gripMult - 1.24) < 1e-9);
  assert.ok(Math.abs(m.accelMult - 1.3) < 1e-9);
  assert.deepEqual(upgradeMods({}), { gripMult: 1, accelMult: 1 });
});

test('the run summary converts points to money', () => {
  const run = createRun({ seed: 1 });
  run.z = 500;
  const s = runSummary(run);
  assert.equal(s.distance, 500);
  assert.equal(s.points, 500);
  assert.equal(s.money, 50);
});

test('garage: buying an upgrade spends money and raises the level', () => {
  const storage = memoryStorage();
  const g = createGarage(storage);
  g.addMoney(200);
  const r = g.buy('grip');
  assert.equal(r.ok, true);
  assert.equal(r.cost, upgradeCost(0));
  assert.equal(g.get().money, 200 - upgradeCost(0));
  assert.equal(g.get().upgrades.grip, 1);
});

test('garage: refuses when money is short or the upgrade is maxed', () => {
  const g = createGarage(memoryStorage());
  assert.equal(g.buy('grip').reason, 'NOT_ENOUGH_MONEY');
  g.addMoney(1_000_000);
  for (let i = 0; i < 5; i += 1) assert.equal(g.buy('acceleration').ok, true);
  assert.equal(g.buy('acceleration').reason, 'MAXED');
});

test('the garage and high scores use the trl.v1 namespace', () => {
  assert.ok(PROFILE_KEY.startsWith('trl.v1.'));
  assert.ok(HIGHSCORE_KEY.startsWith('trl.v1.'));
  assert.notEqual(PROFILE_KEY, 'hcl.v1.profile');
});

test('high scores are sorted by score, capped at ten, and misses are not stored', () => {
  const hs = createHighScores(memoryStorage());
  for (let i = 1; i <= MAX_ENTRIES + 2; i += 1) hs.add({ name: `P${i}`, score: i * 10, distance: i }, i);
  const list = hs.list();
  assert.equal(list.length, MAX_ENTRIES);
  for (let i = 1; i < list.length; i += 1) assert.ok(list[i - 1].score >= list[i].score);
  assert.deepEqual(hs.add({ name: 'low', score: 1, distance: 1 }, 99), { rank: 0, persisted: false });
});

test('corrupt storage reads as empty and nothing is persisted without storage', () => {
  const storage = memoryStorage();
  storage.setItem(PROFILE_KEY, '{bad');
  assert.equal(createGarage(storage).get().money, 0);
  assert.deepEqual(createHighScores(null).list(), []);
});

function commandsWithFakes() {
  const garage = createGarage(memoryStorage());
  const highScores = createHighScores(memoryStorage());
  const session = { start: (o) => ({ seed: o.seed ?? 1 }) };
  return { garage, highScores, router: createGameCommands({ session, garage, highScores }) };
}

test('game.start returns a seed and rejects a bad one', () => {
  const { router } = commandsWithFakes();
  assert.equal(router.dispatch('game.start', { seed: 9 }).data.seed, 9);
  assert.equal(router.dispatch('game.start', { seed: -2 }).error.code, ErrorCode.INVALID_PAYLOAD);
});

test('game.buyUpgrades validates the name and reports money errors', () => {
  const { garage, router } = commandsWithFakes();
  assert.equal(router.dispatch('game.buyUpgrades', { upgrade: 'horn' }).error.code, ErrorCode.INVALID_PAYLOAD);
  const poor = router.dispatch('game.buyUpgrades', { upgrade: 'grip' });
  assert.equal(poor.error.code, ErrorCode.INVALID_PAYLOAD);
  assert.match(poor.error.message, /Not enough money/);
  garage.addMoney(500);
  const ok = router.dispatch('game.buyUpgrades', { upgrade: 'grip' });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.upgrades.grip, 1);
});

test('game.saveHighScore records the score and banks the money', () => {
  const { garage, highScores, router } = commandsWithFakes();
  const r = router.dispatch('game.saveHighScore', { score: 320, distance: 210, money: 32, name: '  Rider  ' });
  assert.equal(r.ok, true);
  assert.equal(r.data.rank, 1);
  assert.equal(garage.get().money, 32);
  assert.equal(highScores.list()[0].name, 'Rider');
  assert.equal(router.dispatch('game.saveHighScore', { score: -1 }).error.code, ErrorCode.INVALID_PAYLOAD);
});

test('the dispatcher reports unknown commands and never throws', () => {
  const d = createDispatcher();
  assert.equal(d.dispatch('game.fly', {}).error.code, ErrorCode.UNKNOWN_COMMAND);
  d.register('boom', () => {
    throw new Error('kaput');
  });
  assert.equal(d.dispatch('boom', {}).error.code, ErrorCode.HANDLER_FAILED);
});
