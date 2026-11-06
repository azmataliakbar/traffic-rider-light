/**
 * Browser engine: the Web Audio graph for the motorbike.
 *   sawtooth + square -> lowpass ---\
 *   exhaust sine (resonant) --------> mix -> master -> compressor -> analyser -> speakers
 * The maths comes from synth-math.js, so it matches the tested mirror.
 */
import { gearIndexFor, displayGear, rpmFor, engineParams, masterGain } from './synth-math.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createBikeEngine({ AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  let ctx = null;
  let nodes = null;
  let gearIndex = 0;
  let volume = 0.9;
  let muted = false;
  let shiftLevel = 0; // 1 at a gear change, decays
  let surgeLevel = 0; // 1 at a close call, decays

  function build() {
    ctx = new AudioCtor();
    const master = ctx.createGain();
    master.gain.value = masterGain(volume, muted);
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 4;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    master.connect(compressor).connect(analyser).connect(ctx.destination);

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    const square = ctx.createOscillator();
    square.type = 'square';
    const sawLevel = ctx.createGain();
    sawLevel.gain.value = 0.6;
    const squareLevel = ctx.createGain();
    squareLevel.gain.value = 0.25;
    const voices = ctx.createGain();
    saw.connect(sawLevel).connect(voices);
    square.connect(squareLevel).connect(voices);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = 1.2;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    voices.connect(lowpass).connect(engineGain).connect(master);

    // Exhaust: a resonant bandpass around the exhaust note, driven by a sine
    const exhaustOsc = ctx.createOscillator();
    exhaustOsc.type = 'sine';
    const exhaustBand = ctx.createBiquadFilter();
    exhaustBand.type = 'bandpass';
    exhaustBand.Q.value = 4;
    const exhaustGain = ctx.createGain();
    exhaustGain.gain.value = 0;
    exhaustOsc.connect(exhaustBand).connect(exhaustGain).connect(master);

    saw.start();
    square.start();
    exhaustOsc.start();
    nodes = { master, analyser, saw, square, lowpass, engineGain, exhaustOsc, exhaustBand, exhaustGain };
  }

  function apply(params) {
    const t = ctx.currentTime;
    nodes.saw.frequency.setTargetAtTime(params.hz, t, 0.03);
    nodes.square.frequency.setTargetAtTime(params.hz * 1.005, t, 0.03);
    nodes.lowpass.frequency.setTargetAtTime(params.lowpassHz, t, 0.08);
    nodes.engineGain.gain.setTargetAtTime(params.engineGain, t, 0.05);
    nodes.exhaustOsc.frequency.setTargetAtTime(params.exhaustHz, t, 0.05);
    nodes.exhaustBand.frequency.setTargetAtTime(params.exhaustHz * 1.5, t, 0.05);
    nodes.exhaustGain.gain.setTargetAtTime(params.exhaustGain, t, 0.05);
  }

  function burst(duration, fromHz, toHz, gain) {
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.5;
    filter.frequency.setValueAtTime(fromHz, t);
    filter.frequency.exponentialRampToValueAtTime(toHz, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(env).connect(nodes.master);
    src.start(t);
  }

  return {
    get supported() {
      return !!AudioCtor;
    },
    get state() {
      return ctx ? ctx.state : 'none';
    },
    get running() {
      return !!ctx && ctx.state === 'running';
    },
    /** Call from a user gesture. Returns true when audio is running. */
    async start() {
      if (!AudioCtor) return false;
      if (!ctx) build();
      if (ctx.state !== 'running') {
        try {
          await ctx.resume();
        } catch {
          return false;
        }
      }
      return ctx.state === 'running';
    },
    setVolume(v) {
      volume = clamp(v, 0, 1);
      if (nodes) nodes.master.gain.setTargetAtTime(masterGain(volume, muted), ctx.currentTime, 0.05);
    },
    get volume() {
      return volume;
    },
    setMuted(value) {
      muted = !!value;
      if (nodes) nodes.master.gain.setTargetAtTime(masterGain(volume, muted), ctx.currentTime, 0.05);
    },
    get muted() {
      return muted;
    },
    /** Call every frame. Returns the dashboard values: gear 0..6 (0 when stopped), rpm. */
    update({ speed = 0, throttle = 0 } = {}) {
      const previous = gearIndex;
      gearIndex = gearIndexFor(speed, gearIndex);
      const shifted = gearIndex !== previous ? 1 : 0;
      shiftLevel = Math.max(shifted, shiftLevel * 0.85);
      surgeLevel *= 0.9;
      const params = engineParams({ speed, throttle, gearIndex, shifting: shiftLevel, closeCall: surgeLevel });
      if (nodes) apply(params);
      return { gear: displayGear(speed, gearIndex), rpm: rpmFor(speed, gearIndex), shifted: !!shifted };
    },
    /** A close call: wind burst and a short surge in the engine. */
    closeCall() {
      surgeLevel = 1;
      if (!nodes || ctx.state !== 'running') return;
      burst(0.5, 1200, 4000, 0.5);
    },
    /** A crash: heavy low thump and a noise burst. */
    crash() {
      if (!nodes || ctx.state !== 'running') return;
      burst(0.9, 900, 60, 1);
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.6);
      env.gain.setValueAtTime(1, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      osc.connect(env).connect(nodes.master);
      osc.start(t);
      osc.stop(t + 0.75);
    },
    /** Output level (RMS, 0..1). */
    level() {
      if (!nodes) return 0;
      const bytes = new Uint8Array(nodes.analyser.fftSize);
      nodes.analyser.getByteTimeDomainData(bytes);
      let sum = 0;
      for (let i = 0; i < bytes.length; i += 1) {
        const v = (bytes[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / bytes.length);
    },
  };
}
