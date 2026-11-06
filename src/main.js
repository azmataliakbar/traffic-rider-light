/**
 * Bootstrap: wires the run, loop, renderer, input, bike engine, garage, router, and UI together.
 * Every change to saved data goes through the command router.
 */
import { createRun, stepRun, runSummary, runPoints, UPGRADES } from './game/run.js';
import { MODES } from './traffic/traffic.js';
import { createGameLoop } from './engine/loop.js';
import { createRoadRenderer } from './render/road-render.js';
import { createInput } from './input/input.js';
import { createBikeEngine } from './audio/bike-engine.js';
import { createGameCommands } from './router/commands.js';
import { createGarage, createHighScores, safeLocalStorage, upgradeCost } from './storage/save.js';
import { drawDial } from './ui/dial.js';
import { randomSeed } from './physics/rng.js';
import { kmh } from './physics/bike.js';

const FIXED_DT = 1 / 120;
const $ = (selector) => document.querySelector(selector);

const dom = {
  frame: $('#arena-frame'),
  canvas: $('#arena'),
  overlay: $('#overlay'),
  panels: { menu: $('#panel-menu'), paused: $('#panel-paused'), result: $('#panel-result') },
  upgradeButtons: [...document.querySelectorAll('[data-upgrade]')],
  money: $('#menu-money'),
  hudSpeed: $('#hud-speed'),
  hudMult: $('#hud-mult'),
  hudMode: $('#hud-mode'),
  difficultyButtons: [...document.querySelectorAll('[data-difficulty]')],
  dashMode: $('#dash-mode'),
  hudTime: $('#hud-time'),
  hudPoints: $('#hud-points'),
  hudDist: $('#hud-dist'),
  dashSpeed: $('#dash-speed'),
  dashMult: $('#dash-mult'),
  dashTime: $('#dash-time'),
  dashPoints: $('#dash-points'),
  dashBest: $('#dash-best'),
  leaderboard: $('#leaderboard'),
  soundStatus: $('#sound-status'),
  soundButton: $('#btn-sound'),
  volume: $('#volume'),
  pauseButton: $('#btn-pause'),
  resultTitle: $('#result-title'),
  resultSummary: $('#result-summary'),
  nameInput: $('#player-name'),
  saveButton: $('#btn-save'),
  saveStatus: $('#save-status'),
  pads: [...document.querySelectorAll('[data-control]')],
  dialSpeed: $('#dial-speed'),
  dialRpm: $('#dial-rpm'),
};

const storage = safeLocalStorage();
const garage = createGarage(storage);
const highScores = createHighScores(storage);
const renderer = createRoadRenderer(dom.canvas);
const input = createInput({ pads: dom.pads });
const engine = createBikeEngine();

/** @type {'menu' | 'running' | 'paused' | 'result'} */
let mode = 'menu';
let run = null;
let chosenDifficulty = 'easy';
let lastResult = null;
let runSaved = false;
let bestPoints = 0;
let lastEventId = null;
let hudKey = '';

const session = {
  start({ seed, difficulty } = {}) {
    if (difficulty) chosenDifficulty = difficulty;
    beginRun(seed ?? randomSeed(), chosenDifficulty);
    return { seed: run.seed };
  },
};
const commands = createGameCommands({ session, garage, highScores });

function dispatch(name, payload) {
  const result = commands.dispatch(name, payload);
  if (!result.ok) console.warn(`[${name}] ${result.error.code}: ${result.error.message}`);
  return result;
}

function showPanel(name) {
  dom.overlay.hidden = !name;
  for (const [key, el] of Object.entries(dom.panels)) el.hidden = key !== name;
}

function beginRun(seed, difficulty) {
  run = createRun({ seed, difficulty, upgrades: garage.get().upgrades });
  runSaved = false;
  lastEventId = null;
  mode = 'running';
  renderer.resize();
  showPanel(null);
}

function startRun() {
  dispatch('game.start', { difficulty: chosenDifficulty });
  engine.start().catch(() => {});
}

function openMenu() {
  mode = 'menu';
  run = createRun({ seed: randomSeed(), difficulty: chosenDifficulty, upgrades: garage.get().upgrades }); // attract view, not stepped
  showPanel('menu');
  refreshMenu();
}

function pause() {
  if (mode !== 'running') return;
  mode = 'paused';
  showPanel('paused');
}

function resume() {
  if (mode !== 'paused') return;
  mode = 'running';
  showPanel(null);
}

function finishRun() {
  mode = 'result';
  lastResult = runSummary(run);
  bestPoints = Math.max(bestPoints, lastResult.points);
  dom.resultTitle.textContent = 'Crash!';
  dom.resultSummary.innerHTML = '';
  const lines = [
    `${MODES[lastResult.difficulty].label} mode · ${lastResult.points} points`,
    `${lastResult.distance} m · ${lastResult.overtakes} overtakes · ${lastResult.closeCalls} close calls`,
    `Best multiplier ×${lastResult.bestMultiplier.toFixed(1)}`,
    `Earned ${lastResult.money} money`,
  ];
  for (const text of lines) {
    const p = document.createElement('p');
    p.textContent = text;
    dom.resultSummary.append(p);
  }
  dom.saveButton.disabled = false;
  dom.saveButton.textContent = 'Save score and bank money';
  dom.saveStatus.textContent = '';
  showPanel('result');
  refreshLeaderboard();
}

function saveRun() {
  const result = dispatch('game.saveHighScore', {
    score: lastResult.points,
    distance: lastResult.distance,
    money: lastResult.money,
    difficulty: lastResult.difficulty,
    name: dom.nameInput.value,
  });
  if (!result.ok) {
    dom.saveStatus.textContent = 'Could not save.';
    return;
  }
  const { rank, persisted } = result.data;
  dom.saveButton.disabled = true;
  if (rank === 0) dom.saveStatus.textContent = `Money banked. Not in the top 10, so the score was not kept.`;
  else if (persisted) dom.saveStatus.textContent = `Saved at rank #${rank}. Money banked.`;
  else dom.saveStatus.textContent = `Rank #${rank}, but storage is unavailable so it will not persist.`;
  refreshMenu();
  refreshLeaderboard();
}

function refreshMenu() {
  for (const btn of dom.difficultyButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.difficulty === chosenDifficulty));
  }
  const g = garage.get();
  dom.money.textContent = `Money: ${g.money}`;
  for (const btn of dom.upgradeButtons) {
    const key = btn.dataset.upgrade;
    const level = g.upgrades[key] ?? 0;
    const max = level >= 5;
    btn.disabled = max || g.money < upgradeCost(level);
    btn.textContent = max
      ? `${UPGRADES[key].label} MAX`
      : `${UPGRADES[key].label} ${level}/5 · ${upgradeCost(level)}`;
  }
}

function buyUpgrade(upgrade) {
  dispatch('game.buyUpgrades', { upgrade });
  refreshMenu();
}

function refreshLeaderboard() {
  const entries = highScores.list();
  bestPoints = Math.max(bestPoints, entries[0]?.score ?? 0);
  const items = entries.map((e, i) => {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${i + 1}. ${e.name}`;
    const score = document.createElement('span');
    score.textContent = `${e.score} pts`;
    li.append(name, score);
    return li;
  });
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No scores yet';
    items.push(empty);
  }
  dom.leaderboard.replaceChildren(...items);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateHud() {
  if (!run) return;
  const speed = Math.round(kmh(run.bike.speed));
  const points = runPoints(run);
  const mult = `×${run.score.multiplier.toFixed(1)}`;
  const time = formatTime(run.time);
  const key = `${speed}|${mult}|${time}|${points}|${Math.floor(run.z)}|${bestPoints}`;
  if (key === hudKey) return;
  hudKey = key;
  dom.hudSpeed.textContent = speed;
  dom.hudMult.textContent = mult;
  dom.hudMode.textContent = MODES[run.difficulty].label;
  dom.dashMode.textContent = MODES[run.difficulty].label;
  dom.hudTime.textContent = time;
  dom.hudPoints.textContent = points;
  dom.hudDist.textContent = Math.floor(run.z);
  dom.dashSpeed.textContent = `${speed} km/h`;
  dom.dashMult.textContent = mult;
  dom.dashTime.textContent = time;
  dom.dashPoints.textContent = points;
  dom.dashBest.textContent = bestPoints;
}

function updateSoundStatus() {
  const blocked = engine.supported && !engine.muted && !engine.running;
  dom.soundStatus.hidden = !blocked;
  dom.soundButton.textContent = engine.muted ? 'Unmute' : 'Mute';
}

async function enableSound() {
  if (!engine.supported) return;
  engine.setMuted(false);
  await engine.start();
  updateSoundStatus();
}

function toggleMute() {
  if (engine.muted) enableSound();
  else {
    engine.setMuted(true);
    updateSoundStatus();
  }
}

const loop = createGameLoop({
  fixedDt: FIXED_DT,
  update(dt) {
    if (mode !== 'running') return;
    stepRun(run, input.state(), dt);
    const ev = run.lastEvent;
    if (ev && ev.id !== lastEventId) {
      lastEventId = ev.id;
      if (ev.kind === 'closeCall') engine.closeCall();
    }
    if (run.status === 'crashed') {
      engine.crash();
      finishRun();
    }
  },
  render() {
    const moving = mode === 'running' && run;
    const speed = moving ? run.bike.speed : 0;
    const throttle = moving && input.state().up ? 1 : 0;
    const info = engine.update({ speed, throttle });
    if (run) renderer.draw(run, undefined, info);
    if (dom.dialSpeed.offsetParent !== null) {
      drawDial(dom.dialSpeed, { value: kmh(speed), max: 300, label: 'KM/H' });
      drawDial(dom.dialRpm, { value: info.rpm / 100, max: 100, label: 'RPM ×100', color: '#ff2d95' });
    }
    updateHud();
    updateSoundStatus();
  },
});

// Wiring
dom.upgradeButtons.forEach((btn) => btn.addEventListener('click', () => buyUpgrade(btn.dataset.upgrade)));
dom.difficultyButtons.forEach((btn) =>
  btn.addEventListener('click', () => {
    chosenDifficulty = btn.dataset.difficulty;
    refreshMenu();
    if (mode === 'menu') openMenu();
  }),
);
$('#btn-start').addEventListener('click', startRun);
$('#btn-again').addEventListener('click', startRun);
$('#btn-menu-result').addEventListener('click', openMenu);
$('#btn-resume').addEventListener('click', resume);
$('#btn-menu-paused').addEventListener('click', openMenu);
dom.saveButton.addEventListener('click', saveRun);
dom.pauseButton.addEventListener('click', () => (mode === 'running' ? pause() : resume()));
dom.soundButton.addEventListener('click', toggleMute);
dom.soundStatus.addEventListener('click', enableSound);
dom.volume.addEventListener('input', () => engine.setVolume(Number(dom.volume.value) / 100));

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (mode === 'running') pause();
    else if (mode === 'paused') resume();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

new ResizeObserver(() => renderer.resize()).observe(dom.frame);
renderer.resize();
refreshLeaderboard();
openMenu();
loop.start();
