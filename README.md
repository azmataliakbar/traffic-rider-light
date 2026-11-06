# Neon Traffic Rider (Light Pseudo-3D Edition)

A first-person motorbike ride down a winding night highway. Weave through traffic, chase close calls above 100 km/h, and spend your money on upgrades.

## Run

Double-click `start.bat`, or run:

```bash
npm start          # serves http://localhost:8081
npm test           # runs the unit tests (Node 18+)
```

Open http://localhost:8081. ES modules need HTTP, so opening `index.html` directly from disk won't work.

## Controls

- Keyboard: `↑` / `W` gas, `↓` / `S` brake, `←` / `→` (or `A` / `D`) steer. `P` or `Esc` pauses.
- Touch: on phones, steering pads on the left and GAS and BRAKE on the right, at the bottom of the screen.

## Scoring

- Distance: 1 point per metre.
- Overtake: 50 points × multiplier.
- Close call (passing within 0.8 m of a car above 100 km/h): 150 points × multiplier.
- The multiplier rises by 0.5 per pass, up to ×5, and resets after 4 seconds without a pass.
- Money: 1 per 10 points. Spend it on the Grip and Acceleration upgrades (up to level 5).
- Money is banked when you press **Save score and bank money** on the result card. Money from a run you don't save is lost.

## Layout

- 270px and up: first-person view with the touch pads at the bottom.
- Laptops: a wide dashboard with speed and RPM dials, the multiplier, the mission time, and the top-10 board.

## Architecture

| Area | Files | Notes |
|------|-------|-------|
| Road | `src/road/track.js` | Curves and hills from analytic sine sums. Infinite, no seams. |
| Projection | `src/road/projection.js` | Pseudo-3D: `screenX = W/2 + f·(X−camX)/depth`, horizon moves with the camera. |
| Bike | `src/physics/bike.js` | Speed, acceleration, braking, steering with grip, and verge drag. |
| Traffic | `src/traffic/traffic.js` | Lane traffic, box collisions, overtakes and close calls. |
| Scoring | `src/scoring/score.js` | Points, multiplier, money. |
| Engine sound | `src/audio/synth-math.js`, `bike-engine.js` | Sawtooth and square oscillators, lowpass, exhaust resonance, gear dips and close-call surges. The maths is tested offline. |
| Render | `src/render/road-render.js` | Sky and skyline, road segments far to near, traffic, cockpit with headlight. |
| Commands | `src/router/commands.js` | `game.start`, `game.buyUpgrades`, `game.saveHighScore`. |
| Storage | `src/storage/save.js` | localStorage under the namespace `trl.v1.`. |

## Notes

- The sound level is checked offline in the tests (about −8 dBFS RMS at full throttle). The browser output is also set louder by a compressor and a volume slider. Please check the level on your own speakers.
- The title is an original name, and the game uses no third-party assets.
