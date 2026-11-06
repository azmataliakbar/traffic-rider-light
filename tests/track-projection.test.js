import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centreX, groundY, ROAD_HALF, LANES } from '../src/road/track.js';
import { makeCamera, project, projectRoad, visibleSegments, NEAR_CLIP, DRAW_SEGMENTS } from '../src/road/projection.js';

test('the road is continuous and deterministic', () => {
  let prev = centreX(0);
  for (let z = 0.5; z < 3000; z += 0.5) {
    const x = centreX(z);
    assert.ok(Math.abs(x - prev) < 0.5, `curve jump at z=${z}`);
    prev = x;
  }
  assert.equal(groundY(1234.5), groundY(1234.5));
});

test('the road has three lanes inside the road edges', () => {
  assert.equal(LANES.length, 3);
  for (const lane of LANES) assert.ok(Math.abs(lane) < ROAD_HALF);
});

test('points further away project closer to the horizon', () => {
  const cam = makeCamera(0, 0);
  const near = projectRoad(cam, 0, 20, 800, 500);
  const far = projectRoad(cam, 0, 200, 800, 500);
  const horizon = 500 * 0.42;
  assert.ok(Math.abs(far.y - horizon) < Math.abs(near.y - horizon));
  assert.ok(far.scale < near.scale);
});

test('a lateral offset moves the point right', () => {
  const cam = makeCamera(0, 0);
  const left = projectRoad(cam, -2, 30, 800, 500);
  const right = projectRoad(cam, 2, 30, 800, 500);
  assert.ok(right.x > left.x);
});

test('points behind the near plane are not projected', () => {
  const cam = makeCamera(100, 0);
  assert.equal(project(cam, 0, 0, 100 + NEAR_CLIP / 2, 800, 500), null);
});

test('visible segments start just ahead of the camera and cover the draw distance', () => {
  const cam = makeCamera(1234, 0);
  const segs = visibleSegments(cam);
  assert.equal(segs.length, DRAW_SEGMENTS);
  assert.ok(segs[0] <= cam.z && segs[0] + 10 > cam.z, "first segment contains the camera");
  for (let i = 1; i < segs.length; i += 1) assert.ok(segs[i] > segs[i - 1]);
});
