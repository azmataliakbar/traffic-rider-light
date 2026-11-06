/**
 * Pseudo-3D projection. A world point (X, Y, Z) in metres maps to the screen with a fixed
 * focal length f (pixels) and the camera at (camX, camY, camZ):
 *   screenX = W/2 + f * (X - camX) / (Z - camZ)
 *   screenY = horizonY - f * (Y - camY) / (Z - camZ)
 * Distance shrinks objects, and the horizon moves with the camera height and the ground.
 */
import { centreX, groundY, SEGMENT } from './track.js';

export const NEAR_CLIP = 1.5; // metres; anything closer is not projected
export const CAMERA_HEIGHT = 1.2; // metres above the road surface
export const DRAW_SEGMENTS = 46; // segments drawn ahead (about 460 m)

/** Camera state from the bike. bikeX is lateral, relative to the centreline. */
export function makeCamera(distance, bikeX) {
  return {
    z: distance,
    x: centreX(distance) + bikeX,
    y: groundY(distance) + CAMERA_HEIGHT,
  };
}

/** Projects a point. Returns null when the point is behind the near clip plane. */
export function project(cam, X, Y, Z, W, H) {
  const dz = Z - cam.z;
  if (dz < NEAR_CLIP) return null;
  const f = H * 0.9;
  const horizonY = H * 0.42;
  return {
    x: W / 2 + (f * (X - cam.x)) / dz,
    y: horizonY - (f * (Y - cam.y)) / dz,
    scale: f / dz, // pixels per metre at this depth
  };
}

/** Projects a point on the road: lateral offset u (metres from the centreline) at distance z. */
export function projectRoad(cam, u, z, W, H) {
  return project(cam, centreX(z) + u, groundY(z), z, W, H);
}

/** Segment boundaries to draw, from the nearest visible one outward. */
export function visibleSegments(cam) {
  const first = Math.floor(cam.z / SEGMENT); // the segment the camera is in, so nothing ahead is skipped
  const out = [];
  for (let i = 0; i < DRAW_SEGMENTS; i += 1) out.push((first + i) * SEGMENT);
  return out; // each entry is the near edge z of a segment; the far edge is z + SEGMENT
}

