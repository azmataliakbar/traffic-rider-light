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

  /**
   * First-person handlebar and instrument cluster. The bars tilt with the lean; the glass pod
   * between the grips holds a speed meter (km/h), an RPM meter, and the gear.
   */
  function drawHandlebar(run, time, info = {}) {
    const bike = run.bike;
    const lean = bike.lean;
    const kmh = bike.speed * 3.6;
    const rpm = info.rpm ?? 1000;
    const gear = info.gear ?? 0;
    const cx = W / 2;
    const pivotY = H * (W < 600 ? 0.76 : 0.8); // raised on narrow screens so the pod stays inside the arena
    const barHalf = Math.min(W * 0.46, 330);
    const tilt = lean * 0.55; // bar sways with the steering lean
    const barEnd = (side) => [cx + side * barHalf * Math.cos(tilt), pivotY - side * barHalf * Math.sin(tilt) * 0.6];
    const thick = Math.max(7, W * 0.022);

    // Headlight cone into the road
    const beam = ctx.createLinearGradient(0, pivotY, 0, H * 0.45);
    beam.addColorStop(0, 'rgba(255, 246, 194, 0.18)');
    beam.addColorStop(1, 'rgba(255, 246, 194, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.03, pivotY - H * 0.1);
    ctx.lineTo(cx + W * 0.03, pivotY - H * 0.1);
    ctx.lineTo(cx + W * 0.3, H * 0.45);
    ctx.lineTo(cx - W * 0.3, H * 0.45);
    ctx.closePath();
    ctx.fill();

    // Handlebar: a single bar across the bottom, with a riser at each side
    const L = barEnd(-1);
    const R = barEnd(1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(L[0], L[1]);
    ctx.quadraticCurveTo(cx, pivotY + H * 0.05, R[0], R[1]);
    ctx.strokeStyle = '#1d1640';
    ctx.lineWidth = thick + 4;
    ctx.stroke();
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = Math.max(2, thick * 0.35);
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Grips, with a glowing lime ring
    for (const [gx, gy, dir] of [[L[0], L[1], -1], [R[0], R[1], 1]]) {
      const gw = thick * 1.9;
      const gh = Math.max(40, H * 0.13);
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(dir * 0.12 + tilt * dir * 0.3);
      ctx.fillStyle = '#0c0820';
      ctx.beginPath();
      ctx.roundRect?.(-gw / 2, -gh / 2, gw, gh, gw / 2) ?? ctx.rect(-gw / 2, -gh / 2, gw, gh);
      ctx.fill();
      ctx.strokeStyle = LIME;
      ctx.lineWidth = 2;
      ctx.shadowColor = LIME;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Instrument pod between the grips
    // Narrow screens get a wider, taller pod so the two gauges and their text have room
    const narrow = W < 600;
    // Wide screens get a larger pod and larger text
    const pw = narrow ? Math.min(W * 0.92, 340) : Math.min(W * 0.5, 380);
    const ph = narrow ? Math.min(H * 0.42, 170) : Math.min(H * 0.4, 200);
    const px = cx - pw / 2;
    const py = pivotY - ph * 0.62;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect?.(px, py, pw, ph, 18) ?? ctx.rect(px, py, pw, ph);
    const glass = ctx.createLinearGradient(0, py, 0, py + ph);
    glass.addColorStop(0, 'rgba(40, 20, 70, 0.92)');
    glass.addColorStop(1, 'rgba(10, 4, 26, 0.95)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Gauge sits in the lower part of the pod; the label row and gear chip stay above the arcs
    const gaugeR = Math.min(pw * 0.22, ph * 0.36);
    const gaugeY = py + ph * 0.62;
    const gauge = (gx, value, max, label, colour, unit, big) => {
      const START = Math.PI * 0.75;
      const SWEEP = Math.PI * 1.5;
      const frac = Math.min(1, Math.max(0, value / max));
      // Track
      ctx.beginPath();
      ctx.arc(gx, gaugeY, gaugeR, START, START + SWEEP);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = gaugeR * 0.16;
      ctx.stroke();
      // Value arc, with a red zone above 85%
      ctx.beginPath();
      ctx.arc(gx, gaugeY, gaugeR, START, START + SWEEP * frac);
      ctx.strokeStyle = colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 14;
      ctx.lineWidth = gaugeR * 0.16;
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Ticks
      for (let t = 0; t <= 10; t += 1) {
        const a = START + (SWEEP * t) / 10;
        const r1 = gaugeR * 0.78;
        const r2 = gaugeR * (t % 5 === 0 ? 0.62 : 0.68);
        ctx.beginPath();
        ctx.moveTo(gx + Math.cos(a) * r1, gaugeY + Math.sin(a) * r1);
        ctx.lineTo(gx + Math.cos(a) * r2, gaugeY + Math.sin(a) * r2);
        ctx.strokeStyle = 'rgba(242, 246, 255, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // Needle
      const na = START + SWEEP * frac;
      ctx.beginPath();
      ctx.moveTo(gx, gaugeY);
      ctx.lineTo(gx + Math.cos(na) * gaugeR * 0.72, gaugeY + Math.sin(na) * gaugeR * 0.72);
      ctx.strokeStyle = MAGENTA;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = MAGENTA;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(gx, gaugeY, gaugeR * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = '#f2f6ff';
      ctx.fill();
      // Readout
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f2f6ff';
      ctx.font = `800 ${Math.round(gaugeR * (big ? 0.5 : 0.44))}px system-ui, sans-serif`;
      ctx.fillText(String(Math.round(value)), gx, gaugeY + gaugeR * 0.52); // below the needle hub
      ctx.fillStyle = '#9aa6c7';
      ctx.font = `600 ${Math.max(10, Math.round(gaugeR * 0.2))}px system-ui, sans-serif`;
      ctx.fillText(unit, gx, gaugeY + gaugeR * 0.86);
      ctx.fillStyle = colour;
      ctx.font = `700 ${Math.max(11, Math.round(gaugeR * 0.22))}px system-ui, sans-serif`;
      ctx.fillText(label, gx, py + ph * 0.13); // label row, above the arc
    };

    gauge(px + pw * 0.27, kmh, 300, 'SPEED', CYAN, 'km/h', true);
    gauge(px + pw * 0.73, rpm / 1000, 10, 'RPM', MAGENTA, '×1000', false);

    // Gear chip in the centre of the pod
    const gw = Math.max(34, pw * 0.14);
    const gh = Math.max(24, ph * 0.2);
    ctx.beginPath();
    ctx.roundRect?.(cx - gw / 2, py + ph * 0.08, gw, gh, 8) ?? ctx.rect(cx - gw / 2, py + ph * 0.08, gw, gh);
    ctx.fillStyle = 'rgba(184, 255, 59, 0.12)';
    ctx.fill();
    ctx.strokeStyle = LIME;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = LIME;
    ctx.font = `800 ${Math.round(gh * 0.6)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gear === 0 ? 'N' : String(gear), cx, py + ph * 0.08 + gh / 2);
    void time;
  }

  function draw(run, time = performance.now() / 1000, info = {}) {
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cam = makeCamera(run.z, run.bike.x);
    ctx.fillStyle = '#05030f';
    ctx.fillRect(0, 0, W, H);
    drawSky(cam);
    drawRoad(cam);
    drawTraffic(cam, run.traffic);
    drawHandlebar(run, time, info);
  }

  return { resize, draw };
}
