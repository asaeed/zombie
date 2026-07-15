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

## Gameplay
- Supplies come from scavenging: search the wrecked cars, cabins and bins
  scattered across the map (walk a unit onto one; contents are unknown until
  searched), then haul the loot back to the HQ or a depot to bank it
- Farther caches are richer — and more likely to be guarded by dormant
  zombies that wake on proximity or gunfire. Units drop their cargo when
  they die; the bundle stays where it fell until someone recovers it
- Fog of war: the map starts dark. Scout to find caches; explored ground
  stays on the map, but zombies are only visible where you have vision
- Depots are your storage: each holds 250 supplies, and banking stops when
  storage is full — build more depots to grow the stockpile (your starting
  supplies exceed the cap; spend them down or expand). Depots also serve as
  drop-off points for long hauls
- Kills score points but pay nothing; each cleared wave pays a small bonus
  (always banked, even over cap); repairs cost supplies

## Architecture
- Simulation runs on a square 80×80 tile grid in world coordinates
  (`js/game.js`, `js/entities.js`, `js/pathfinding.js`) — unchanged by rendering
- Rendering is true 2:1 isometric. ALL iso math lives in `worldToScreen` /
  `screenToWorld` in `js/utils.js`; renderer and input route through them
- Tests: `node tests/transforms.test.mjs`

## Project docs
- Design spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md`
- Current plan: `docs/superpowers/plans/2026-07-15-phase3-economy.md`
  (phase 3 of 7 — scavenging economy; phases 1-2 complete)
- Visual mockups: `docs/mockups/visual-directions.html`
