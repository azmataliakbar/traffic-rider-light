/**
 * Motorbike motion. Units: metres, seconds, m/s. Pure functions.
 *   speed: forward speed (m/s); lateral x: metres from the road centreline.
 * Upgrades scale acceleration (accelMult) and steering grip (gripMult).
 */
import { ROAD_HALF, clampToRoad } from '../road/track.js';

export const BIKE = Object.freeze({
  halfWidth: 0.4,
  maxSpeed: 78, // m/s, about 280 km/h
  accel: 6.5, // m/s^2 at standstill, tapering to zero at maxSpeed
  brake: 14, // m/s^2
  drag: 0.0008, // quadratic air drag, per (m/s)^2
  rolling: 0.15, // m/s^2
  steerRate: 2.6, // m/s of lateral speed at full steer, at speed
  steerLowSpeedFactor: 0.4, // steering authority at standstill
  offroadDrag: 0.9, // per second, speed kept per second while off the road
  leanMax: 0.35, // rad
});

export function createBike() {
  return { speed: 0, x: 0, lean: 0, offroad: false };
}

/** One physics step. input: {up, down, left, right} booleans. */
export function stepBike(bike, input, dt, mods = {}) {
  const accelMult = mods.accelMult ?? 1;
  const gripMult = mods.gripMult ?? 1;
  let { speed } = bike;

  const throttle = input.up ? 1 : 0;
  const brake = input.down ? 1 : 0;
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  // Forward acceleration: tapers towards top speed; drag and rolling resistance always act.
  const taper = Math.max(0, 1 - speed / BIKE.maxSpeed);
  let a = throttle * BIKE.accel * accelMult * taper;
  a -= brake * BIKE.brake;
  a -= BIKE.drag * speed * speed + (speed > 0 ? BIKE.rolling : 0);
  speed = Math.max(0, speed + a * dt);

  // Steering: needs some speed to bite. Grip upgrades widen the steering rate.
  const authority = BIKE.steerLowSpeedFactor + (1 - BIKE.steerLowSpeedFactor) * Math.min(1, speed / 20);
  const lateral = steer * BIKE.steerRate * gripMult * authority;
  let x = bike.x + lateral * dt;

  // The bike may run onto the verge (2 m past the road edge) and is slowed there.
  x = clampToRoad(x, -2).x;
  const offroad = Math.abs(x) > ROAD_HALF - BIKE.halfWidth + 0.01;
  if (offroad) speed *= Math.pow(BIKE.offroadDrag, dt);

  const leanTarget = -(steer * BIKE.leanMax) * Math.min(1, speed / 25);
  const lean = bike.lean + (leanTarget - bike.lean) * Math.min(1, dt * 6);

  return { ...bike, speed, x, lean, offroad };
}

export function kmh(speed) {
  return speed * 3.6;
}
