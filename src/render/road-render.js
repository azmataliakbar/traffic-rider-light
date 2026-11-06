/**
 * First-person pseudo-3D renderer. Draws the sky and skyline, the road segments (far to
 * near), the traffic, and the bike cockpit with its headlight.
 */
import { SEGMENT, ROAD_HALF, LANE_WIDTH } from '../road/track.js';
import { makeCamera, projectRoad, visibleSegments, NEAR_CLIP, DRAW_SEGMENTS } from '../road/projection.js';
import { CAR } from '../traffic/traffic.js';

const CYAN = '#00f5ff';
const MAGENTA = '#ff2d95';
const LIME = '#b8ff3b';
const FOG = '#2a0b3a';
const GRASS_ALT = ['#0e2b3a', '#123446'];
const ROAD_ALT = ['#1d1738', '#241c45'];

/** Stable pseudo-random value in [0, 1) from an integer key. */
function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createRoadRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
  }

  function quad(points, fill) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawSky(cam) {
    const horizon = H * 0.42;
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, '#07031a');
    g.addColorStop(0.7, '#2a0b3a');
    g.addColorStop(1, '#5a1450');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, horizon + 2);

    // Sun with neon stripes, centred at the horizon
    const sunR = Math.min(W, H) * 0.16;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, horizon);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, horizon - sunR, 0, horizon);
    sun.addColorStop(0, '#ffd44a');
    sun.addColorStop(1, '#ff2d95');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(W / 2, horizon, sunR, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#2a0b3a';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(W / 2 - sunR, horizon - sunR * 0.1 - i * sunR * 0.2, sunR * 2, sunR * 0.05 + i * 1.5);
    ctx.restore();

    // Skyline: buildings scroll with distance so the city passes by
    const scroll = Math.floor(cam.z / 60);
    const bw = W / 16;
    for (let i = -1; i < 17; i += 1) {
      const key = i + scroll;
      const bh = (0.08 + hash01(key) * 0.2) * H;
      ctx.fillStyle = hash01(key + 99) > 0.5 ? 'rgba(20, 8, 44, 0.95)' : 'rgba(14, 6, 32, 0.95)';
      ctx.fillRect(i * bw, horizon - bh, bw + 1, bh + 1);
      if (hash01(key + 7) > 0.55) {
        ctx.fillStyle = hash01(key + 3) > 0.5 ? 'rgba(0, 245, 255, 0.8)' : 'rgba(255, 45, 149, 0.8)';
        ctx.fillRect(i * bw + bw * 0.3, horizon - bh * 0.7, 2, 3);
      }
    }
  }

  function drawRoad(cam) {
    const segs = visibleSegments(cam);
    // Far to near, so nearer segments overlap farther ones
    for (let k = segs.length - 1; k >= 0; k -= 1) {
      // Clip the segment nearest the camera so the road reaches the bottom of the screen
      const z1 = segs[k] + SEGMENT;
      const z0 = Math.max(segs[k], cam.z + NEAR_CLIP);
      if (z1 <= z0) continue;
      const idx = Math.round(segs[k] / SEGMENT);
      const alt = idx % 2;
      const p = (u, z) => projectRoad(cam, u, z, W, H);
      const a0 = p(-ROAD_HALF, z0);
      const a1 = p(ROAD_HALF, z0);
      const b0 = p(-ROAD_HALF, z1);
      const b1 = p(ROAD_HALF, z1);
      if (!a0 || !a1 || !b0 || !b1) continue;

      // Grass bands on both sides of the road
      const gl0 = p(-60, z0);
      const gl1 = p(-60, z1);
      const gr0 = p(60, z0);
      const gr1 = p(60, z1);
      if (gl0 && gl1) quad([[0, gl0.y], [a0.x, a0.y], [b0.x, b0.y], [0, gl1.y]], GRASS_ALT[alt]);
      if (gr0 && gr1) quad([[W, gr0.y], [a1.x, a1.y], [b1.x, b1.y], [W, gr1.y]], GRASS_ALT[alt]);

      // Asphalt
      quad([[a0.x, a0.y], [a1.x, a1.y], [b1.x, b1.y], [b0.x, b0.y]], ROAD_ALT[alt]);

      // Lane markings: dashed white lines between the three lanes
      for (const u of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
        if (alt === 0) {
          const m0 = p(u, z0);
          const m1 = p(u, z1);
          if (m0 && m1) {
            ctx.beginPath();
            ctx.moveTo(m0.x, m0.y);
            ctx.lineTo(m1.x, m1.y);
            ctx.strokeStyle = 'rgba(214, 222, 255, 0.55)';
            ctx.lineWidth = Math.min(6, Math.max(1, m0.scale * 0.12));
            ctx.stroke();
          }
        }
      }

      // Neon road edges and rumble stripes
      for (const [u, col] of [[-ROAD_HALF, CYAN], [ROAD_HALF, MAGENTA]]) {
        const e0 = p(u, z0);
        const e1 = p(u, z1);
        if (!e0 || !e1) continue;
        ctx.beginPath();
        ctx.moveTo(e0.x, e0.y);
        ctx.lineTo(e1.x, e1.y);
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.min(8, Math.max(1.5, e0.scale * 0.22));
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Distance fog: segments fade into the horizon colour
      const depth = (k + 1) / DRAW_SEGMENTS;
      if (depth > 0.5) {
        ctx.globalAlpha = (depth - 0.5) * 1.6;
        quad([[0, a0.y], [W, a0.y], [W, b0.y], [0, b0.y]], FOG);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawCar(cam, car) {
    const p = projectRoad(cam, car.lane, car.z, W, H);
    if (!p) return;
    const s = p.scale;
    const w = CAR.width * s;
    const h = 1.35 * s;
    const x = p.x - w / 2;
    const y = p.y - h;
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w * 0.55, Math.max(1, s * 0.12), 0, 0, Math.PI * 2);
    ctx.fill();
    // Body
    ctx.fillStyle = car.colour;
    ctx.fillRect(x, y + h * 0.35, w, h * 0.65);
    // Cabin
    ctx.fillStyle = 'rgba(20, 10, 40, 0.85)';
    ctx.fillRect(x + w * 0.15, y, w * 0.7, h * 0.4);
    // Tail lights
    ctx.fillStyle = '#ff3b3b';
    ctx.shadowColor = '#ff3b3b';
    ctx.shadowBlur = 8;
    ctx.fillRect(x + w * 0.04, y + h * 0.6, w * 0.2, Math.max(1, h * 0.1));
    ctx.fillRect(x + w * 0.76, y + h * 0.6, w * 0.2, Math.max(1, h * 0.1));
    ctx.shadowBlur = 0;
  }

  function drawTraffic(cam, traffic) {
    const visible = traffic.cars
      .filter((c) => c.z - cam.z > NEAR_CLIP && c.z - cam.z < DRAW_SEGMENTS * SEGMENT)
      .sort((a, b) => b.z - a.z);
    for (const car of visible) drawCar(cam, car);
  }

  function drawCockpit(run) {
    const bike = run.bike;
    const s = Math.min(1, W / 900);
    const cx = W / 2;
    const base = H * 0.97;
    // Headlight beam
    const beam = ctx.createLinearGradient(0, base, 0, H * 0.45);
    beam.addColorStop(0, 'rgba(255, 246, 194, 0.20)');
    beam.addColorStop(1, 'rgba(255, 246, 194, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx - 40 * s, base);
    ctx.lineTo(cx + 40 * s, base);
    ctx.lineTo(cx + 260 * s, H * 0.45);
    ctx.lineTo(cx - 260 * s, H * 0.45);
    ctx.closePath();
    ctx.fill();

    // Handlebars rotate with the lean
    const rot = bike.lean;
    const hb = (dx, dy) => [cx + Math.cos(rot) * dx - Math.sin(rot) * dy, base - H * 0.12 + Math.sin(rot) * dx + Math.cos(rot) * dy];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2350';
    ctx.lineWidth = 12 * s;
    ctx.beginPath();
    ctx.moveTo(...hb(-150 * s, 0));
    ctx.lineTo(...hb(150 * s, 0));
    ctx.stroke();
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3 * s;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Headlight and mirrors
    ctx.fillStyle = '#fff6c2';
    ctx.shadowColor = '#fff6c2';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, base - H * 0.2, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = LIME;
    ctx.fillRect(cx - 170 * s, base - H * 0.19, 24 * s, 4 * s);
    ctx.fillRect(cx + 146 * s, base - H * 0.19, 24 * s, 4 * s);
  }

  function draw(run, time = performance.now() / 1000) {
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cam = makeCamera(run.z, run.bike.x);
    ctx.fillStyle = '#05030f';
    ctx.fillRect(0, 0, W, H);
    drawSky(cam);
    drawRoad(cam);
    drawTraffic(cam, run.traffic);
    drawCockpit(run);
  }

  return { resize, draw };
}
