# Dead Zone RTS

Browser zombie-survival RTS. Vanilla JS + Canvas 2D, no build step, no
dependencies — open `index.html` in a browser (or `python3 -m http.server`
and open localhost) and play.

## Controls
- Left click / drag: select units · Right click: move / attack / repair
- Build: `W`all, `T`ower, `B`arracks, `D`epot · Esc: cancel · Del: sell
- `A` + click: attack-move · `S`: stop · `R`: builder repair · `H`: select idle units
- `1–9`: control groups (`Shift+digit` assigns, double-tap centers)
- Barracks: click → train panel (`Z`/`X`/`C`) · right-click sets rally point
- Camera: wheel zoom · middle-drag / arrows / minimap click: pan
- Click a screen edge to arm auto-scroll; moving off the edge stops it
- `Space`: jump to HQ · `F1–F4`: bookmarks (`Shift+F` sets) · `N`: latest alert
- Game over / victory: click PLAY AGAIN or press Enter

## Architecture
- Simulation runs on a square 80×80 tile grid in world coordinates
  (`js/game.js`, `js/entities.js`, `js/pathfinding.js`) — unchanged by rendering
- Rendering is true 2:1 isometric. ALL iso math lives in `worldToScreen` /
  `screenToWorld` in `js/utils.js`; renderer and input route through them
- Tests: `node tests/transforms.test.mjs`

## Project docs
- Design spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md`
- Current plan: `docs/superpowers/plans/2026-07-13-phase1-iso-foundation.md`
  (phase 1 of 7 — iso foundation)
- Visual mockups: `docs/mockups/visual-directions.html`
