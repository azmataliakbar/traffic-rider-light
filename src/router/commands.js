/**
 * Game commands:
 *   game.start         {seed?}                   start a run with the saved upgrades
 *   game.buyUpgrades   {upgrade}                 spend money on the next upgrade level
 *   game.saveHighScore {score, distance, money, name?}
 *                                                record a finished run and credit its money
 * The session, garage, and high-score store are injected, so the router is testable with fakes.
 */
import { createDispatcher, ValidationError } from './dispatcher.js';
import { UPGRADES } from '../game/run.js';

const isCount = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

export function createGameCommands({ session, garage, highScores }) {
  const dispatcher = createDispatcher();

  dispatcher.register('game.start', (p) => {
    if (p.seed !== undefined && !isCount(p.seed, 2147483647)) {
      throw new ValidationError('seed must be an integer from 0 to 2147483647');
    }
    return session.start({ seed: p.seed });
  });

  dispatcher.register('game.buyUpgrades', (p) => {
    if (!Object.hasOwn(UPGRADES, p.upgrade)) {
      throw new ValidationError(`upgrade must be one of ${Object.keys(UPGRADES).join(', ')}`);
    }
    const result = garage.buy(p.upgrade);
    if (!result.ok) throw new ValidationError(result.reason === 'MAXED' ? 'Upgrade is already at maximum' : `Not enough money (need ${result.cost})`);
    return { upgrades: result.state.upgrades, money: result.state.money, cost: result.cost };
  });

  dispatcher.register('game.saveHighScore', (p) => {
    if (!isCount(p.score, 100_000_000)) throw new ValidationError('score must be an integer from 0 to 100000000');
    if (!isCount(p.distance ?? 0, 1_000_000)) throw new ValidationError('distance must be an integer from 0 to 1000000');
    if (!isCount(p.money ?? 0, 1_000_000)) throw new ValidationError('money must be an integer from 0 to 1000000');
    let name = 'PLAYER';
    if (p.name !== undefined) {
      if (typeof p.name !== 'string') throw new ValidationError('name must be a string');
      name = p.name.trim().slice(0, 12) || 'PLAYER';
    }
    const credit = garage.addMoney(p.money ?? 0);
    const rank = highScores.add({ name, score: p.score, distance: p.distance ?? 0 });
    return { ...rank, money: credit.money };
  });

  return dispatcher;
}
