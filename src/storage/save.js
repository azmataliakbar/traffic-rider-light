/**
 * Local garage and high scores under the namespace "trl.v1.". Every storage access is guarded.
 */
import { UPGRADES, UPGRADE_MAX } from '../game/run.js';

export const NAMESPACE = 'trl.v1';
export const PROFILE_KEY = `${NAMESPACE}.profile`;
export const HIGHSCORE_KEY = `${NAMESPACE}.highscores`;
export const SCHEMA_VERSION = 1;
export const MAX_ENTRIES = 10;
export const NAME_MAX = 12;
const MAX_MONEY = 1_000_000_000;

export function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readVersioned(storage, key) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? 'null');
    return parsed && parsed.v === SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function writeVersioned(storage, key, body) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ v: SCHEMA_VERSION, ...body }));
    return true;
  } catch {
    return false;
  }
}

/** Cost of the next level of an upgrade. */
export function upgradeCost(level) {
  return 50 * (level + 1);
}

export function createGarage(storage = null) {
  const read = () => {
    const p = readVersioned(storage, PROFILE_KEY);
    const money = Number.isInteger(p?.money) && p.money >= 0 ? Math.min(p.money, MAX_MONEY) : 0;
    const levels = {};
    for (const key of Object.keys(UPGRADES)) {
      const v = p?.upgrades?.[key];
      levels[key] = Number.isInteger(v) && v >= 0 ? Math.min(UPGRADE_MAX, v) : 0;
    }
    return { money, upgrades: levels };
  };
  const save = (state) => writeVersioned(storage, PROFILE_KEY, state);

  return {
    get: read,
    addMoney(amount) {
      const state = read();
      state.money = Math.min(MAX_MONEY, state.money + amount);
      return { ...state, persisted: save(state) };
    },
    /** Buys the next level of an upgrade. Returns {ok, state, reason}. */
    buy(upgrade) {
      const state = read();
      const level = state.upgrades[upgrade] ?? 0;
      if (level >= UPGRADE_MAX) return { ok: false, reason: 'MAXED', state };
      const cost = upgradeCost(level);
      if (state.money < cost) return { ok: false, reason: 'NOT_ENOUGH_MONEY', state, cost };
      state.money -= cost;
      state.upgrades[upgrade] = level + 1;
      save(state);
      return { ok: true, state, cost };
    },
  };
}

export function sanitizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.score) && e.score >= 0)
    .map((e) => ({
      name: e.name.slice(0, NAME_MAX),
      score: Math.floor(e.score),
      distance: Number.isFinite(e.distance) ? Math.floor(e.distance) : 0,
      at: Number.isFinite(e.at) ? e.at : 0,
    }))
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX_ENTRIES);
}

export function createHighScores(storage = null) {
  const read = () => sanitizeEntries(readVersioned(storage, HIGHSCORE_KEY)?.entries);
  return {
    list: read,
    /** Returns {rank, persisted}. rank is 0 when the score misses the top list. */
    add({ name, score, distance }, now = Date.now()) {
      const existing = read();
      const s = Math.floor(score);
      const rank = existing.filter((e) => e.score >= s).length + 1;
      if (rank > MAX_ENTRIES) return { rank: 0, persisted: false };
      const entries = sanitizeEntries([
        ...existing,
        { name: name || 'PLAYER', score: s, distance: Math.floor(distance ?? 0), at: now },
      ]);
      return { rank, persisted: writeVersioned(storage, HIGHSCORE_KEY, { entries }) };
    },
  };
}
