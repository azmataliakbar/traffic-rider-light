import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScore, applyPass, tickMultiplier, distancePoints, moneyFor, MAX_MULT, POINTS } from '../src/scoring/score.js';
import {
  gearIndexFor,
  displayGear,
  rpmFor,
  engineHz,
  engineParams,
  renderEngine,
  rmsOfSamples,
  peakOf,
  masterGain,
  GEAR_COUNT,
  GEAR_TOP_MPS,
  IDLE_RPM,
  REDLINE_RPM,
} from '../src/audio/synth-math.js';

// Scoring

test('an overtake scores 50 times the multiplier, a close call 150 times', () => {
  let s = createScore();
  s = applyPass(s, { kind: 'overtake' }, 0);
  assert.equal(s.points, Math.round(POINTS.overtake * 1.5));
  let c = createScore();
  c = applyPass(c, { kind: 'closeCall' }, 0);
  assert.equal(c.points, Math.round(POINTS.closeCall * 1.5));
  assert.equal(c.closeCalls, 1);
});

test('the multiplier builds with passes and is capped', () => {
  let s = createScore();
  for (let i = 0; i < 20; i += 1) s = applyPass(s, { kind: 'overtake' }, i * 0.1);
  assert.equal(s.multiplier, MAX_MULT);
  assert.equal(s.bestMultiplier, MAX_MULT);
});

test('the multiplier resets after a quiet spell', () => {
  let s = applyPass(createScore(), { kind: 'overtake' }, 0);
  s = applyPass(s, { kind: 'overtake' }, 1);
  assert.equal(tickMultiplier(s, 2).multiplier, s.multiplier);
  assert.equal(tickMultiplier(s, 10).multiplier, 1);
});

test('distance is one point per metre and money is one per ten points', () => {
  assert.equal(distancePoints(123.9), 123);
  assert.equal(distancePoints(-5), 0);
  assert.equal(moneyFor(1234), 123);
});

// Gears

test('the gearbox climbs to sixth gear as the bike speeds up, and back down', () => {
  let g = 0;
  for (let v = 0; v <= 78; v += 0.5) g = gearIndexFor(v, g);
  assert.equal(g, GEAR_COUNT - 1);
  assert.equal(gearIndexFor(50, GEAR_COUNT - 1), GEAR_COUNT - 1); // above the 44 m/s downshift point
  assert.ok(gearIndexFor(30, GEAR_COUNT - 1) < GEAR_COUNT - 1); // below it
});

test('the dashboard shows 0 when stopped and 1..6 when moving', () => {
  assert.equal(displayGear(0, 0), 0);
  assert.equal(displayGear(2, 0), 1);
  assert.equal(displayGear(78, GEAR_COUNT - 1), GEAR_COUNT);
});

test('RPM stays in range and is near the target at each gear top speed', () => {
  for (let i = 0; i < GEAR_COUNT; i += 1) {
    const rpm = rpmFor(GEAR_TOP_MPS[i], i);
    assert.ok(Math.abs(rpm - 8500) < 1, `gear ${i + 1} rpm ${rpm}`);
  }
  assert.equal(rpmFor(0, 0), IDLE_RPM);
  assert.equal(rpmFor(500, 0), REDLINE_RPM);
});

test('pitch rises with RPM and with throttle', () => {
  assert.ok(engineHz(2000, 0) < engineHz(6000, 0));
  assert.ok(engineHz(6000, 0) < engineHz(6000, 1));
});

test('a close call surges the engine and a gear change dips it', () => {
  const base = engineParams({ speed: 30, throttle: 0.5, gearIndex: 2 });
  const surge = engineParams({ speed: 30, throttle: 0.5, gearIndex: 2, closeCall: 1 });
  const dip = engineParams({ speed: 30, throttle: 0.5, gearIndex: 2, shifting: 1 });
  assert.ok(surge.engineGain > base.engineGain);
  assert.ok(dip.hz < base.hz);
});

// Loudness

test('full throttle is loud: RMS above -12 dBFS, and peaks stay under full scale', () => {
  const samples = renderEngine(engineParams({ speed: 45, throttle: 1, gearIndex: 3 }), 1.0);
  const rms = rmsOfSamples(samples);
  assert.ok(rms > 0.25, `rms ${rms}`);
  assert.ok(20 * Math.log10(rms) > -12, `rms dB ${20 * Math.log10(rms)}`);
  assert.ok(peakOf(samples) < 1, `peak ${peakOf(samples)}`);
});

test('the engine is louder at full throttle than at idle', () => {
  const idle = rmsOfSamples(renderEngine(engineParams({ speed: 0, throttle: 0, gearIndex: 0 }), 0.5));
  const full = rmsOfSamples(renderEngine(engineParams({ speed: 45, throttle: 1, gearIndex: 3 }), 0.5));
  assert.ok(full > idle * 1.5);
});

test('the master gain follows the volume and mute, with headroom under 1', () => {
  assert.equal(masterGain(0), 0);
  assert.equal(masterGain(1, true), 0);
  assert.ok(masterGain(1) < 1);
  assert.equal(masterGain(3), masterGain(1));
});
