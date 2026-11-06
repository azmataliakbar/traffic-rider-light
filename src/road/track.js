/**
 * Infinite winding highway. The centreline offset (x, metres) and height (y, metres) are
 * analytic functions of the distance z (metres), so the road never ends and has no seams.
 * Curves come from the centreline; hills come from the height.
 */
export const SEGMENT = 10; // metres per road segment
export const ROAD_HALF = 4.5; // road half-width, metres (three 3 m lanes)
export const LANES = Object.freeze([-3, 0, 3]); // lane centres relative to the centreline
export const LANE_WIDTH = 3;

const CURVE = Object.freeze([
  { a: 2.2, f: 0.0012, p: 0.7 },
  { a: 1.4, f: 0.0031, p: 2.1 },
  { a: 0.6, f: 0.0073, p: 0.3 },
]);
const HILL = Object.freeze([
  { a: 2.5, f: 0.0009, p: 1.3 },
  { a: 1.0, f: 0.0026, p: 0.0 },
]);

export function centreX(z) {
  let x = 0;
  for (const c of CURVE) x += c.a * Math.sin(c.f * z + c.p);
  return x;
}

export function groundY(z) {
  let y = 0;
  for (const h of HILL) y += h.a * Math.sin(h.f * z + h.p);
  return y;
}

/** Lateral bike position must stay on the road. Returns the clamped position and whether it was clamped. */
export function clampToRoad(x, margin = 0) {
  const limit = ROAD_HALF - margin;
  const clamped = Math.max(-limit, Math.min(limit, x));
  return { x: clamped, off: clamped !== x };
}
