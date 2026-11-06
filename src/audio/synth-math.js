/**
 * Pure audio maths for the motorbike. No browser APIs, so every value here can be tested.
 * The browser graph (bike-engine.js) uses these same maps, and renderEngine() below is a
 * JavaScript mirror of that graph, used to check loudness and clipping offline.
 */

export const WHEEL_RADIUS = 0.3; // metres
export const GEAR_COUNT = 6;
export const IDLE_RPM = 1000;
export const REDLINE_RPM = 10000;
const TARGET_RPM = 8500; // rpm at the speed where each gear tops out
/** Speed (m/s) where each gear tops out: gear 1..6. Top gear reaches the bike's top speed. */
export const GEAR_TOP_MPS = Object.freeze([10, 18, 28, 40, 55, 78]);
const DOWN_FRACTION = 0.8;
const RPM_PER_MPS = 60 / (2 * Math.PI * WHEEL_RADIUS);
export const GEAR_RATIOS = Object.freeze(GEAR_TOP_MPS.map((v) => TARGET_RPM / (RPM_PER_MPS * v)));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const STOP_SPEED = 0.3; // m/s below which the dashboard shows 0

/** What the dashboard shows: 0 when stopped, otherwise 1..6. */
export function displayGear(speed, gearIndex) {
  return Math.abs(speed) < STOP_SPEED ? 0 : gearIndex + 1;
}

export function gearIndexFor(speed, current = 0) {
  let g = clamp(current, 0, GEAR_COUNT - 1);
  while (g < GEAR_COUNT - 1 && speed > GEAR_TOP_MPS[g]) g += 1;
  while (g > 0 && speed < GEAR_TOP_MPS[g - 1] * DOWN_FRACTION) g -= 1;
  return g;
}

export function rpmFor(speed, gearIndex) {
  const rpm = Math.abs(speed) * RPM_PER_MPS * GEAR_RATIOS[clamp(gearIndex, 0, GEAR_COUNT - 1)];
  return clamp(rpm, IDLE_RPM, REDLINE_RPM);
}

/** Fundamental pitch of the engine (Hz). Throttle warps it up slightly. */
export function engineHz(rpm, throttle) {
  const t = clamp((rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM), 0, 1);
  return (45 + t * 230) * (1 + 0.06 * clamp(throttle, 0, 1));
}

/** Exhaust resonance (Hz): deeper at idle, opening up under throttle. */
export function exhaustHz(throttle) {
  return 105 + 25 * clamp(throttle, 0, 1);
}

/**
 * Everything the synth needs for one moment. Gains are relative; the master volume
 * and compressor set the final level.
 */
export function engineParams({ speed = 0, throttle = 0, gearIndex = 0, shifting = 0, closeCall = 0 }) {
  const rpm = rpmFor(speed, gearIndex);
  const thr = clamp(throttle, 0, 1);
  const t = (rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM);
  // A gear change dips the pitch and level briefly; a close call surges them.
  const dip = clamp(shifting, 0, 1);
  const surge = clamp(closeCall, 0, 1);
  return {
    rpm,
    hz: engineHz(rpm, thr) * (1 - 0.12 * dip) * (1 + 0.1 * surge),
    exhaustHz: exhaustHz(thr),
    lowpassHz: 500 + thr * 3000 + t * 1200,
    engineGain: clamp((0.35 + 0.35 * thr + 0.1 * t) * (1 - 0.35 * dip) * (1 + 0.2 * surge), 0, 0.9),
    exhaustGain: clamp(0.2 + 0.35 * thr, 0, 0.6),
  };
}

/** Master gain from the volume slider (0..1). Keeps headroom under full scale. */
export function masterGain(volume, muted = false) {
  return muted ? 0 : clamp(volume, 0, 1) * 0.95;
}

export function rmsOfSamples(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

export function peakOf(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  return peak;
}

/** One-pole lowpass coefficient for a cutoff (Hz) at a sample rate. */
function lowpassCoef(cutoff, sampleRate) {
  return 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
}

/**
 * JavaScript mirror of the engine graph: sawtooth and square voices through a lowpass,
 * plus an exhaust resonance, through the master gain. Returns Float32Array samples.
 * Constant params for the whole duration (used for loudness checks).
 */
export function renderEngine(params, seconds, sampleRate = 44100, volume = 0.9) {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  let phaseSaw = 0;
  let phaseSq = 0;
  let phaseEx = 0;
  let lp = 0;
  const aLp = lowpassCoef(params.lowpassHz, sampleRate);
  const aEx = lowpassCoef(params.exhaustHz * 1.5, sampleRate);
  let ex = 0;
  const master = masterGain(volume);
  for (let i = 0; i < n; i += 1) {
    const dtPhase = params.hz / sampleRate;
    phaseSaw = (phaseSaw + dtPhase) % 1;
    phaseSq = (phaseSq + dtPhase * 1.005) % 1;
    phaseEx = (phaseEx + params.exhaustHz / sampleRate) % 1;
    const saw = 2 * phaseSaw - 1;
    const square = phaseSq < 0.5 ? 1 : -1;
    const voice = 0.6 * saw + 0.25 * square;
    lp += aLp * (voice - lp);
    const exhaustWave = Math.sin(2 * Math.PI * phaseEx);
    ex += aEx * (exhaustWave - ex);
    const mixed = params.engineGain * lp + params.exhaustGain * ex;
    out[i] = mixed * master;
  }
  return out;
}
