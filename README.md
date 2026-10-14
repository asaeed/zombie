# Dead Zone RTS

**Play the game:** [Dead Zone RTS on GitHub Pages](https://asaeed.github.io/zombie/)

Browser zombie-survival RTS. Vanilla JS + Canvas 2D, no build step, no
dependencies — open `index.html` in a browser (or `python3 -m http.server`
and open localhost) and play.

## GitHub Pages

The public site is published from the `gh-pages` branch root. [Source code](https://github.com/asaeed/zombie)
is public. Publishing uses a runtime-only snapshot, excluding
source-art masters, review documents, tools, tests, and dependencies.

Run `node tools/build-pages.mjs` to create a fresh export in a temporary
directory, or pass an empty output directory explicitly. Commit the exported
files to `gh-pages` to deploy an update; local source changes do not publish
automatically. `release.json` identifies the exact exported content.

Fresh browsers use Rigged Tactics graphics. Other skins remain available in
the game menu, and an existing saved graphics choice is preserved.

Saves remain in this browser's local storage. The hosted site has separate
save data from localhost; existing local saves are not transferred.

## Controls
- Left click / drag: select units · selected unit + cache click: auto-gather
- Right click: move / attack / gather / dump cargo / repair
- Build: `W`all, `T`ower, `B`arracks, `D`epot, `L`ight tower, clinic (`K`), mechanics bay (`M`) · one placement per selection · Esc: cancel · Del: sell
- `A` + click: attack-move · `S`: stop · `R`: builder repair · `H`: select idle units
- `1–9`: control groups (`Shift+digit` assigns, double-tap centers)
- Barracks: click for training (`Z`/`X`/`C`/`V`/`Q`/`E`/`Y`) · right-click sets rally point
- Mechanics bay: select and press `U` or use its production button to build an armored truck
- Armored truck: select and right-click ground to drive; right-click it with units selected to board (four seats); `E` or Unload to disembark
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
  over time, become moving light sources, and can ignite zombies in near contact
- A clinic unlocks medic training at the barracks. Medics automatically move
  to heal wounded units nearby, then return to their previous station
- A mechanics bay unlocks snipers, heavies, and torchbearers at the barracks.
  Snipers prioritize special zombies at long range; heavies cleave several
  zombies with each melee swing; torchbearers ignite enemies at short range
  and provide mobile light at night
- The mechanics bay builds four-seat armored trucks. Armed passengers fire from
  the vehicle while its hull takes incoming damage; if destroyed, they exit
  unharmed. Heavies cannot swing and medics cannot heal while aboard
- Intact buildings and walls block zombie movement, including diagonal gaps
  where two wall corners meet
- Builders automatically move to and repair damaged buildings nearby; repairs
  are slower now, at one repair tick per second, and builders return to their
  previous station afterward
- Survival is endless now: waves keep escalating until the HQ falls
- Wave 4 brings spitters that lob acid over walls; wave 6 adds exploders
  whose shot-down blast is wider and loses damage with distance; wave 8 adds screamers that speed nearby zombies
  and shriek to wake dormant guards only when a human unit comes close.
  The first boss brute arrives on wave 10, then two on wave 15, three on
  wave 20, and so on. Bosses hit hard and resist tower fire. Zombie HP
  stays fixed by type; later waves add more enemies instead
- Each wave attacks from a marked map edge (two edges from wave 6 onward).
  The HUD and minimap warn you 20 seconds before the wave begins
- The game autosaves to this browser every few seconds and restores on refresh.
  The menu also has three local save slots for manual save points

## Architecture
- Simulation runs on a square 80×80 tile grid in world coordinates
  (`js/game.js`, `js/entities.js`, `js/pathfinding.js`) — unchanged by rendering
- Rendering is true 2:1 isometric. ALL iso math lives in `worldToScreen` /
  `screenToWorld` in `js/utils.js`; renderer and input route through them
- Tests: `node --test tests/*.test.mjs`
- The default game now uses reference-generated Sculpted Pixel art for all
  seven player roles, seven zombie types, three additional grey walker
  appearances, eight buildings, resource caches, the white SUV, and forest
  terrain/props. Animation uses an articulated 2D texture rig, not live 3D.
  All actors now render at half their previous size, around 21 body pixels
  for ordinary humans/walkers at zoom 1, with unchanged foot anchors and
  gameplay ranges. Ground uses at most two subtle shades per material.
  Attack/work clips use planted legs and action-specific arm ownership;
  walk/shoot clips retain their existing animation.
- Full-scene review: `docs/art-directions/sculpted-world.html`; individual
  action/facing inspector: `docs/art-directions/sculpted-pixel-sprites.html`.
  Rebuild the expanded set with `node tools/sculpted-pixel/bake-world.mjs`;
  browser-check with `node tools/sculpted-pixel/verify-world.mjs` while the
  local server is running. Generated sources and exact prompts are retained
  in `assets/sculpted-pixel/source/`; runtime assets and validation are in
  `assets/sculpted-pixel/world/`. New artwork remains open to user refinement.
- New complete Brushwork cutout skin: `?artPack=brushwork-layered`, with
  all player/zombie roles, generated torso/limb components, 16-frame walks,
  role-specific work/combat clips and high-quality edge filtering. Matching
  painted world art and quiet terrain are retained; older skins remain
  available in menu Graphics. Review `docs/art-directions/brushwork-full-world.html`
  and `brushwork-full-sprites.html`; recipe/evidence in `docs/art-packs.md`.
- `?artPilot=off` retains the earlier game art. Saved simulation state and
  pathfinding are unchanged; forest decorations are nonblocking cosmetic art.
- Opt-in sprite comparison: `?artPilot=diorama`, `?artPilot=pixel`, or
  `?artPilot=horror` renders a sniper and one regular walker appearance.
  `?artPilot=1` remains an alias for diorama. `npm install && npm run art:bake`
  regenerates all three independently authored directional animation sets;
  these older studies remain available separately from the default world art.

## Project docs
- Design spec: `docs/superpowers/specs/2026-07-13-overhaul-design.md`
- Threat and the clinic/mechanics expansion are in place; the remaining
  planned structures and final art/polish are still open
- Visual mockups: `docs/mockups/visual-directions.html`
- Visual review (art directions and favicon options): `docs/art-directions/review.html`
- Five native-grid sprite options: `docs/art-directions/native-sprite-options.html`
- Zombie cast and animation review: `docs/art-directions/zombie-lineup.html`
- Three zombie redesign directions: `docs/art-directions/zombie-directions.html`
- Six whole-game art directions (structures, units, zombies, and motion poses): `docs/art-directions/whole-game-directions.html`
- Selected voxel-diorama art direction and comparisons: `docs/art-directions/pixel-diorama-directions.html`
- Sprite-sheet animation pilot: `docs/art-directions/sprite-sheet-pilot.html`
- Phase-7 art direction notes: `docs/art-directions/README.md`
- Current Sculpted Pixel scene: `docs/art-directions/sculpted-world.html`
- Complete sprite roster: `docs/art-directions/sculpted-pixel-sprites.html`
