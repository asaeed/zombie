# Dead Zone RTS

Browser zombie-survival RTS. Vanilla JS + Canvas 2D, no build step, no
dependencies — open `index.html` in a browser (or `python3 -m http.server`
and open localhost) and play.

## Controls
- Left click / drag: select units · selected unit + cache click: auto-gather
- Right click: move / attack / gather / dump cargo / repair
- Build: `W`all, `T`ower, `B`arracks, `D`epot, `L`ight tower · one placement per selection · Esc: cancel · Del: sell
- `A` + click: attack-move · `S`: stop · `R`: builder repair · `H`: select idle units
- `1–9`: control groups (`Shift+digit` assigns, double-tap centers)
- Barracks: click → train panel (`Z`/`X`/`C`/`V`) · right-click sets rally point
- `F` + click: throw a signal flare (50 supplies, 60s cooldown) — lights terrain, lures the horde, wakes sleepers, and ignites nearby zombies
- Camera: wheel zoom · middle-drag / arrows / minimap click: pan
- Click a screen edge to arm auto-scroll; moving off the edge stops it
- `Space`: jump to HQ · `F1–F4`: bookmarks (`Shift+F` sets) · `N`: latest alert
- Menu: top-right `MENU` button for pause, save/load slots, and restart

## Gameplay
- Supplies come from scavenging: search the wrecked cars, cabins and bins
  scattered across the map (walk a unit onto one; contents are unknown until
  searched), then haul the loot back to the HQ or a depot to bank it. A selected
  unit ordered onto a cache will fill from nearby caches when it runs dry,
  then keep shuttling until that area is exhausted.
  Loading and unloading takes time; cargo makes units move and fire more slowly
- Right-click a dropped supply bundle to recover every dropped bundle in that
  area until the unit is full, then it will return to unload
- Farther caches are richer — and more likely to be guarded by dormant
  zombies that wake on proximity or gunfire. Units drop their cargo when
  they die; the bundle stays where it fell until someone recovers it
- Fog of war: the map starts dark. Scout to find caches; explored ground
  stays on the map, but zombies are only visible where you have vision
- The HQ stores 500 supplies, each depot adds 250 more, and banking stops when
  storage is full. Right-click the HQ or a depot with a carrying unit selected
  to send it home to dump cargo
- Kills score points but pay nothing; each cleared wave pays a small bonus
  (always banked, even over cap); repairs cost supplies
- Night falls every 3 minutes (2 minutes long): vision shrinks to flashlight
  range and your defenders can only shoot zombies that are LIT. Light towers
  (60 supplies, no weapon) push the lit perimeter outward — keep the camp lit
  or your towers go silent right when the horde arrives
- Flares are temporary fire sources: nearby zombies catch fire, take damage
  over time, and become moving light sources while burning
- Barracks can train medics (`V`) who automatically move to and heal wounded
  friendly units nearby, then return to their previous station
- Builders automatically move to and repair damaged buildings nearby; repairs
  are slower now, at one repair tick per second, and builders return to their
  previous station afterward
- Survival is endless now: waves keep escalating until the HQ falls
- The game autosaves to this browser every few seconds and restores on refresh.
  The menu also has three local save slots for manual save points

## Architecture
- Simulation runs on a square 80×80 tile grid in world coordinates
  (`js/game.js`, `js/entities.js`, `js/pathfinding.js`) — unchanged by rendering
- Rendering is true 2:1 isometric. ALL iso math lives in `worldToScreen` /
  `screenToWorld` in `js/utils.js`; renderer and input route through them
- Tests: `node tests/transforms.test.mjs`, `node tests/gathering.test.mjs`,
  and `node tests/support-return.test.mjs`

## Project docs
- Design spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md`
- Current plan: `docs/superpowers/plans/2026-07-16-phase4-light.md`
  (phase 4 of 7 — light & dark; phases 1–3 complete)
- Visual mockups: `docs/mockups/visual-directions.html`
