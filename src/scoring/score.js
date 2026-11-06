/**
 * Scoring. Pure functions.
 *   distance: 1 point per metre
 *   overtake: 50 x multiplier
 *   close call (passing within 0.8 m above 100 km/h): 150 x multiplier
 * The multiplier rises by 0.5 per pass (to MAX_MULT) and resets after 4 s without one.
 * Money is 1 coin per 10 points, and buys upgrades.
 */
export const MAX_MULT = 5;
export const MULT_TIMEOUT = 4; // seconds
export const POINTS = Object.freeze({ overtake: 50, closeCall: 150, perMetre: 1 });

export function createScore() {
  return { points: 0, multiplier: 1, lastEventAt: -Infinity, overtakes: 0, closeCalls: 0, bestMultiplier: 1 };
}

/** Drops the multiplier back to 1 when the timeout has passed without a pass. */
export function tickMultiplier(score, time) {
  if (score.multiplier > 1 && time - score.lastEventAt > MULT_TIMEOUT) {
    return { ...score, multiplier: 1 };
  }
  return score;
}

export function applyPass(score, event, time) {
  const current = tickMultiplier(score, time);
  const multiplier = Math.min(MAX_MULT, current.multiplier + 0.5);
  const isClose = event.kind === 'closeCall';
  const base = isClose ? POINTS.closeCall : POINTS.overtake;
  return {
    ...current,
    multiplier,
    lastEventAt: time,
    points: current.points + Math.round(base * multiplier),
    overtakes: current.overtakes + (isClose ? 0 : 1),
    closeCalls: current.closeCalls + (isClose ? 1 : 0),
    bestMultiplier: Math.max(current.bestMultiplier, multiplier),
  };
}

/** Distance points: call with the metres travelled so far. */
export function distancePoints(metres) {
  return Math.floor(Math.max(0, metres)) * POINTS.perMetre;
}

export function moneyFor(points) {
  return Math.floor(points / 10);
}
