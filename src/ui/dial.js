/** Draws a neon dashboard dial (270 degree sweep) onto a canvas. */
const START = (135 * Math.PI) / 180;
const SWEEP = (270 * Math.PI) / 180;

export function drawDial(canvas, { value, max, label, color = '#00f5ff' }) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
  const size = canvas.clientWidth || 140;
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  const frac = Math.min(1, Math.max(0, value / max));

  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.07;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, START, START + SWEEP);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, r, START, START + SWEEP * frac);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const angle = START + SWEEP * frac;
  ctx.strokeStyle = '#ff2d95';
  ctx.lineWidth = size * 0.025;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * r * 0.85, cy + Math.sin(angle) * r * 0.85);
  ctx.stroke();

  ctx.fillStyle = '#f2f6ff';
  ctx.font = `700 ${Math.round(size * 0.16)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(value)), cx, cy + size * 0.12);
  ctx.fillStyle = '#9aa6c7';
  ctx.font = `600 ${Math.round(size * 0.09)}px system-ui, sans-serif`;
  ctx.fillText(label, cx, cy - size * 0.2);
}
