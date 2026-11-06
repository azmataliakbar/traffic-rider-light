/**
 * requestAnimationFrame loop with a fixed-timestep accumulator. Physics advances in equal
 * steps regardless of refresh rate (60, 120, or 144 Hz). Rendering runs once per display frame.
 */

/** Pure accumulator math, separated for testing. Caps long frames and steps per frame. */
export function advance(accumulator, frameSec, fixedDt = 1 / 240, maxFrame = 0.1, maxSteps = 16) {
  let acc = accumulator + Math.min(Math.max(frameSec, 0), maxFrame);
  let steps = 0;
  while (acc >= fixedDt && steps < maxSteps) {
    acc -= fixedDt;
    steps += 1;
  }
  if (steps === maxSteps) acc = Math.min(acc, fixedDt);
  return { steps, accumulator: acc };
}

export function createGameLoop({
  update,
  render,
  fixedDt = 1 / 240,
  maxFrame = 0.1,
  requestFrame = (cb) => globalThis.requestAnimationFrame(cb),
  cancelFrame = (id) => globalThis.cancelAnimationFrame(id),
}) {
  let accumulator = 0;
  let last = null;
  let handle = null;
  let running = false;

  function frame(timestamp) {
    if (!running) return;
    const frameSec = last === null ? 0 : (timestamp - last) / 1000;
    last = timestamp;
    const result = advance(accumulator, frameSec, fixedDt, maxFrame);
    accumulator = result.accumulator;
    for (let i = 0; i < result.steps; i += 1) update(fixedDt);
    render(timestamp);
    handle = requestFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = null;
      handle = requestFrame(frame);
    },
    stop() {
      running = false;
      if (handle !== null) cancelFrame(handle);
      handle = null;
    },
    get running() {
      return running;
    },
  };
}
