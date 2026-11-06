/**
 * Keyboard and on-screen pads write into one input state, so both work together.
 * Each pointer is tracked by pointerId, so several pads can be held at once.
 */

export const KEY_CONTROLS = Object.freeze({
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
});

const CONTROLS = Object.freeze(['up', 'down', 'left', 'right']);

export function createInput({ target = globalThis, pads = [] } = {}) {
  const keys = new Set();
  const pointers = new Map(); // pointerId -> control
  const cleanups = [];

  const on = (el, type, fn) => {
    el.addEventListener(type, fn);
    cleanups.push(() => el.removeEventListener(type, fn));
  };

  const refreshPads = () => {
    for (const el of pads) {
      el.classList.toggle('is-active', [...pointers.values()].includes(el.dataset.control));
    }
  };

  on(target, 'keydown', (e) => {
    if (!KEY_CONTROLS[e.code]) return;
    e.preventDefault();
    keys.add(e.code);
  });
  on(target, 'keyup', (e) => keys.delete(e.code));
  on(target, 'blur', () => {
    keys.clear();
    pointers.clear();
    refreshPads();
  });

  for (const el of pads) {
    const control = el.dataset.control;
    const press = (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, control);
      refreshPads();
    };
    const release = (e) => {
      pointers.delete(e.pointerId);
      refreshPads();
    };
    on(el, 'pointerdown', press);
    on(el, 'pointerup', release);
    on(el, 'pointercancel', release);
    on(el, 'lostpointercapture', release);
    on(el, 'contextmenu', (e) => e.preventDefault());
  }

  const held = (control) => {
    for (const code of keys) if (KEY_CONTROLS[code] === control) return true;
    for (const c of pointers.values()) if (c === control) return true;
    return false;
  };

  return {
    /** {up, down, left, right} booleans for the bike. */
    state() {
      const s = {};
      for (const c of CONTROLS) s[c] = held(c);
      return s;
    },
    destroy() {
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}
