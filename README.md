# Dead Zone RTS

Browser zombie-survival RTS. Vanilla JS + Canvas 2D, no build step, no
dependencies — open `index.html` in a browser (or `python3 -m http.server`
and open localhost) and play.

## Controls
- Left click / drag: select units · Right click: move / attack / repair
- 1–4: build (wall, tower, barracks, depot) · Esc: cancel · Del: sell
- Click barracks → train panel (6/7/8) · R: builder repairs nearest
- Mouse wheel: zoom · Middle-drag / arrows / screen edges / minimap click: pan

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
