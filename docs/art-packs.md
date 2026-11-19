# Art Packs

The renderer switches complete graphics packs without replacing the Game, actors, selection, camera or saved simulation. Sculpted Pixel remains the default. Brushwork Tactics is a separate playable painted candidate, and Classic selects the original procedural renderer for comparison. The twelve original art-direction boards remain concept references; Brushwork now also has its own runtime assets.

## Select a Pack

Open the in-game menu and choose Graphics. The menu stays paused during loading. The last successful choice is stored separately as `dead-zone-rts:art-pack`; restarting or clearing game saves does not reset it. `?artPack=sculpted` and `?artPack=classic` override that preference. Existing `artPilot` inspection URLs retain their behavior.

## Rigged Tactics

The accepted soldier/walker rigged motion strategy now supplies a full optional animated roster:

- Play: `http://127.0.0.1:8787/?artPack=rigged`
- Whole outpost: `http://127.0.0.1:8787/docs/art-directions/rigged-full-world.html`
- Eight-direction native/enlarged animation comparison: `http://127.0.0.1:8787/docs/art-directions/rigged-full-sprites.html`
- Runtime: `assets/rigged-full/manifest.json`
- Rebuild: `node tools/rigged-full/bake.mjs`; partial rebuild: `--only=builder,medic`
- Rebuild world to a staging directory: `node tools/rigged-full/bake-world.mjs --output=/private/tmp/rigged-world`; inspect `world.json` and PNGs, then merge object/terrain records into the runtime manifest and install its `world/` directory. Fresh character bakes retain the installed high-density world.
- Verify: `node tools/rigged-full/verify.mjs --baseline=/path/to/before-hashes.json`
- Startup/visibility/compass/SUV checks: `node tools/rigged-full/check-runtime.mjs`
- Warm-cache ordinary-reload/failure-recovery checks: `node tools/rigged-full/check-cache-reload.mjs`
- Standalone warmed render profile: `node tools/rigged-full/profile-runtime.mjs` (render-only game comparison; do not run other QA browsers concurrently)
- Complete directional grids: `node tools/rigged-full/capture.mjs`; optional role arguments, `--phase=even|odd|both`, `--output=/path/to/evidence`
- Saved evidence: `assets/rigged-full/validation.json` and `review/`

Generated review screenshots, frame grids and standalone HTML snapshots were cleaned up on 2026-11-12. Runtime artwork, linked preview pages, rebuild sources and regression baselines remain. Retained JSON reports record historical measurements; screenshot paths inside those reports may refer to removed captures. The Rigged verification and capture commands above create fresh evidence in temporary directories.

Seventeen humanoids cover all seven survivors, seven zombie types and three ordinary-zombie variants. Eight genuine model rotations, 16-frame walks and each required attack/work action total 6,600 runtime cells, including the retained vehicle. Approved soldier and walker PNGs and cell rectangles are exact copies of the rigged trial. Direction labels now reverse the baker's turn order once to match actual screen-space movement, without mirroring pixels or changing the already-correct north/south views. Source skinned mesh and artist-authored animations are CC0; licenses remain in `assets/rigged-pilot/source/`. Three.js is a production tool only: the game still draws PNG atlases with Canvas 2D.

New roles use immutable rest-relative retargeting, authored whole-body clips, palm-relative gun contacts and per-role props. Carried guns follow the moving torso; soldier/scout/sniper stow their guns on their backs during gathering. Builders work with their tool-bearing hand, medics retain their cross and kit, heavies swing a broad melee weapon with planted legs, and torchbearers thrust their lit torch. Runners use a low, fast crouched gait; brutes/bosses use slower, broader silhouettes. Regular zombies stay grey with lighter grey lower clothing and cap/dress/missing-arm variations. Special markers are bright green, amber, magenta and cyan, with front/rear visibility checked from decoded pixels.

Following user approval, Rigged Tactics humanoids display 20% larger and its SUV 2.5 times larger than their original pack sizes. `tools/rigged-full/catalog.mjs` owns idempotent presentation/facing/vehicle-grounding corrections; humanoid source frames, anchors, model proportions and timing are unchanged. SUV selection and overlays follow its artwork size without changing collision rules; its anchor now follows the wheel plane rather than the lowest front tire. Supersampled shading, high-quality filtering and one fixed measured envelope per actor support smooth edges without per-frame recentering. Existing high-resolution buildings and the white SUV atlas are retained. Trees, bushes, rocks and three supply caches are copied directly from native original source paintings into `assets/rigged-full/world/`, with unchanged logical size and ground anchor. Quiet two-color terrain now has 256x128 source cells at the same 64x32 logical footprint. Older packs and the Sculpted Pixel default remain unchanged. Switching uses the existing Graphics menu and leaves the saved simulation intact.

The shared game renderer caches terrain/fog at viewport pixel density, invalidating on camera, zoom, viewport, pack, tile and visibility changes. It culls offscreen scenery and actors while retaining partially visible tall sprites. Outpost startup waits for the selected decoded pack, so there is no temporary fallback-art flash; old pilot images only load for explicit pilot URLs. Paused, hidden and offscreen previews do not animate. The sprite inspector reuses its backing canvases and draws only visible direction panels; its comparison strip is static. Historical preview pages are not embedded or running in these pages. A top-right isometric compass matches wave map axes (South is lower-left), highlights incoming sides and reserves notification space. Narrow game headers use compact rows.

Warm-browser inspection found that an older cached loader rejected the new terrain with `Incomplete terrain: grass/0`, silently leaving the outpost on Classic graphics. The game and shared outpost pages now version their runtime scripts together (`20261010-rigged-world-r2`); registry/manifest requests revalidate while decoded packs remain cached in memory for switching. Failed outpost startup shows the loading error without drawing a misleading older skin, and the pack selector can recover. The regression check reproduces the old fixed-density validator under long-lived HTTP caching, then proves an ordinary reload draws actual Rigged assets without clearing the browser cache. It also checks a failed manifest, selection recovery and mobile layout. Evidence is in `assets/rigged-full/review/cache-reload/`; all 158 tests and the existing startup/visibility checks passed, and the new skin was visually confirmed in the user's cached Chrome session. Gameplay saves and artwork were not changed by this correction.

Internal visual inspection caught and repaired working-hand ownership, heavy attack leg motion, compounded runner posture, buried medic identity art and hidden rear special markers. Complete action playback and directional frame exports support review; neither is an automatic aesthetic judge. The user accepted the delivered roster on 2026-10-10; future changes still require review. This is same-agent inspection, not independent-model review. Equip/stow transition clips are not authored. Local only; no commit, push or public deployment was performed.

## Brushwork Tactics

### Complete Layered Skin

The approved filtered, quieter-bob 16-frame soldier/walker walks now extend into an optional full skin:

- Play: `http://127.0.0.1:8787/?artPack=brushwork-layered`
- Full outpost comparison: `http://127.0.0.1:8787/docs/art-directions/brushwork-full-world.html`
- Native/enlarged eight-facing inspector: `http://127.0.0.1:8787/docs/art-directions/brushwork-full-sprites.html`
- Sources and exact prompts: `assets/brushwork-full/source/generation.json`
- Runtime: `assets/brushwork-full/manifest.json`
- Rebuild: `node tools/brushwork-full/bake.mjs --output=/private/tmp/brushwork-full-rebuild`
- Verify: `node tools/brushwork-full/verify.mjs`
- Evidence: `assets/brushwork-full/{validation,motion-audit}.json` and `review/`

All seven player roles, seven zombie types, three ordinary-zombie variants and the vehicle are covered. Matching painted buildings (eight), supply caches (three), scenery (three), vehicle and quiet two-tone terrain (48 tiles) are deliberately reused from the original Brushwork world instead of changing its established architecture. Fog, fire, flares, projectiles, damage overlays, shadows and HUD remain shared gameplay rendering. Sculpted Pixel, original Brushwork and Classic remain available; gameplay and saves are unchanged.

The new image-generated masters provide complete torso/pelvis, separate near/far arms and near/far legs. Rigid overlapping thigh/shin/boot layers, periodic soft-reach IK, dedicated weapon/work-arm articulation and fixed palette/shading replace the original flattened-texture bending. Five genuine painted facings (S/SE/E/NE/N) supply three mirrored left facings (SW/W/NW). Approved r5 soldier/walker walks are retained in their seven supplied/mirrored facings; front walks and non-walk actions use the new components. Cap/dress variants have distinct generated torsos; one-arm omits the far arm. Fast runner and slow brute/boss cadences remain distinct. Non-walk actions keep leg joints fixed.

Each humanoid has 16 walk frames, four idle frames and its required eight-frame strike / twelve-frame work clips. Compact 128x128 cells, foot anchor 64,116 and 96 body pixels retain the same logical unit sizes; ordinary bodies are still 21.28px at zoom 1. This source/atlas density supports zoom and DPR filtering without enlarging the actors. The new skin alone opts into enabled/high-quality Canvas sampling; older packs retain their sampling. The inspector uses DPR-aware backing canvases and automatic CSS sampling.

Tests cover complete coverage, frame selection, fixed bones/feet, periodic motion, provenance, mirror ownership and per-pack quality defaults. Browser checks cover all 4,616 nonblank/unclipped frames, all 16 walk phases for 17 humanoids, day/night and mobile review layouts, actual game scales/sampling, gathering to capacity, menu pause, atomic switching, save/selection/cargo restore and export completeness. Technical checks do not replace user review of every new character/action. Local only; no commit, push or Pages publication was performed.

### Original Pack

- Play: `http://127.0.0.1:8787/?artPack=brushwork`
- Outpost comparison: `http://127.0.0.1:8787/docs/art-directions/brushwork-world.html?artPack=brushwork`
- Directional animation inspector: `http://127.0.0.1:8787/docs/art-directions/brushwork-sprites.html`
- Sharpness and drawn-frame comparison: `http://127.0.0.1:8787/docs/art-directions/brushwork-motion.html`
- Sources and exact prompts: `assets/brushwork/source/generation.json`
- Runtime pack: `assets/brushwork/manifest.json`
- Rebuild: `node tools/brushwork/bake.mjs --output=/private/tmp/brushwork-rebuild`
- Verify: `node tools/brushwork/verify.mjs`

All 18 actors, 14 structures/caches/props and 48 terrain tiles are supplied independently. Ordinary bodies retain their ~21px height; role colors and relative brute/runner/SUV sizes are preserved. Structures use pale concrete and teal steel, ordinary zombies stay grey, and special zombies keep fixed neon identifiers. Terrain is deliberately quieter than the concept: two close colors per material, sparse broad patches, no grain or dithering. Original Sculpted Pixel images are untouched.

The included image-generation tool produced new painted sources from the approved Brushwork concept; its model name is not exposed. Soldier/walker walks use painted contact and passing sources with joint-aligned inbetweens. Other actors use modest baked texture articulation. Separate survivor work and strike sources supply hands-free gathering and raised weapons without stretching knees. This remains a first-pass animation candidate, not individually painted frames for every action. Eight-facing sources and user-facing motion controls make future per-unit refinement possible without changing gameplay.

Production corrections are recorded with the assets: equal-cell cropping clipped generated layouts, so extraction now follows connected silhouettes; blended source paintings produced ghosts, so each frame uses one joint-aligned painting; a touching work sheet was regenerated with wider gutters. Source spacing and alpha are audited instead of trusting the prompt. The original sources and rejected work sheet are preserved. The new pack is available locally, not automatically published to GitHub Pages.

### Sharpness and Drawn Motion Pilot

User review rejected the candidate's blur and texture-bent motion. The sharper baseline retains 76 body pixels in 128px-high cells instead of 57 in 96px cells, preserves the same ~21px screen footprint, and uses nearest sampling in the game and inspector. The main/lighting canvases now render at device-pixel density (capped at 2) with unchanged CSS-sized camera, selection and HUD coordinates. This improves rendering sharpness; it does not turn the texture rigs into new paintings.

The comparison now defaults to Scout Reference, Before Alignment, and Aligned Drawn. Original filtered and sharp mesh references remain selectable. Each soldier/walker pilot has eight separately drawn southeast walk poses; targeted single-frame edits replaced sheet halves that repeated the same leading leg. The user prefers these drawn poses but reported positional jumps. Packaging retains common source scales, then translates each painting onto a stable head reference instead of centering its changing feet/weapon bounds. It never bends, morphs or crossfades the image. `tools/brushwork/alignment.mjs` measures the uppermost head silhouette for these ordinary characters; raised weapons, horns and other silhouettes need their own inspected landmarks, not this heuristic blindly applied.

Independent decoded-atlas measurements at native game size reduced the maximum head-position step from 1.24 to 0.044 CSS pixels for soldier and 1.064 to zero for walker, including last-to-first transitions. All sixteen poses retain their leg motion, padding and 21.28px displayed body height. The scout's unchanged twelve-frame cycle plays in full; the comparison clock no longer quantizes it to eight steps. Optional anchor guides and frame stepping expose the registration, and `before-*` files preserve the previous pilot.

The pilot is **not a complete pack or a gameplay replacement**. Color, head shape and equipment details still drift across the loop; aligned playback awaits review before expanding remaining directions/actions. This registration repair is verified independently of appearance approval and does not promote the whole method as a proven seamless animation recipe.

Pilot sources and prompts: `assets/brushwork/source/drawn-pilot/{generation,frames}.json`. Atlas/metadata: `assets/brushwork/motion-pilot/`. Rebuild with `node tools/brushwork/bake-drawn.mjs --output=/private/tmp/drawn-rebuild`; check with `node tools/brushwork/verify-drawn.mjs`. Evidence: `assets/brushwork/sharpness-validation.json` and `assets/brushwork/motion-pilot/validation.json`. The public export excludes these unregistered pilot sources and comparison files. No publishing occurred.

### Twelve-Pose Directional Walk Review

Earlier review: `http://127.0.0.1:8787/docs/art-directions/brushwork-walk-r2.html`. The user liked the registered pilot but flagged changing colors, stepped transitions, an exaggerated walk, and missing directional evidence. This version supplies twelve separately generated poses each for soldier/walker in four actual facings: SE, E, NE, N. These cover front-quarter, profile, rear-quarter and direct-back views without mirrored front art. Soldier defaults to 16 FPS and walker to 12 FPS, keeping cycle durations close to the preceding eight-pose loops. FPS, auto-turn, native/enlarged views, frame stepping, day/night and palette A/B remain available.

The successful scout's actual twelve-frame cycles are the motion references, rather than schematic high-knee guides. Generated sheets keep the same identity master throughout, with restrained steps and low foot lift. Two early broad/half-sheet trials still flattened or repeated the intended leg progression and are retained as rejected candidates. The new sources contain translucent studio matte despite the transparency request; a source-specific alpha cutoff removes this during silhouette extraction. This cutoff is not a generic setting for translucent assets.

`tools/brushwork/palette.mjs` calibrates soldier blue cloth to one shared hue/saturation and lightness distribution, without changing warm skin/equipment or alpha. The ordinary walker uses a neutral-grey shared luminance distribution. Original drawings and registered ungraded atlases remain intact for comparison. Root alignment uses a stable head landmark and source-cell origin; the changing lowest foot does not control horizontal registration. Common source scale, 240 atlas body pixels and the existing 21.28px displayed height are retained; no mesh warps or crossfades supply these poses.

All 96 cells are nonblank/unclipped with twelve unique frames per actor/facing and maximum measured root steps of 0.044 CSS pixels. Shared material lightness ranges fall below 0.001 on a 0-1 scale across each loop. These are packaging/color diagnostics, not approval of perfect timing or anatomy. Some pose increments remain uneven, and the rear-quarter soldier carries its rifle higher than the front views. The remaining four facings and non-walk actions are not supplied. This remains an unregistered review, not a gameplay replacement; current packs, scout, saves and public deployment are unchanged.

Sources/exact prompts: `assets/brushwork/source/drawn-r2/generation.json`. Atlases, ungraded comparisons and validation: `assets/brushwork/motion-r2/`. Rebuild with `node tools/brushwork/bake-drawn-r2.mjs --output=/private/tmp/walk-r2-rebuild`; verify with `node tools/brushwork/verify-drawn-r2.mjs`. Five focused palette/contract tests extend the suite to 92 passing tests.

### Layered Walk Repair

The user rejected the twelve-painting result as a jittery breakdance. Frame inspection confirmed repeated crouch/recovery poses, unstable limb shapes and inadequate gait progression; registering the head and matching color distributions had not made it an acceptable animation. The rejected review remains at `docs/art-directions/brushwork-walk-r2.html` with its original sources/atlases intact.

The default `docs/art-directions/brushwork-walk.html` now compares scout / rejected drawn baseline / layered walk. New built-in `image_gen` sheets provide complete upper bodies and separate near/far legs for SE/E/NE/N. Exact prompts and original tool paths: `assets/brushwork/source/layered-r3/generation.json`. Torso, hands and equipment no longer get repainted each frame. Overlapping thigh/shin/boot layers use rigid rotations and a periodic stance/swing path with continuous contact velocity and constant bone lengths. A soft IK reach limit removes a near-extension knee snap found by the first motion audit. Initial manual cuts from flattened art were discarded because they left hip holes, boot fragments and clipped hands.

The candidate retains 240 atlas body pixels / 256x320 cells / 21.28 CSS pixels. Thirty-two poses per actor/facing run at 32 FPS for soldier and 26 FPS for walker. The inspector has a 32-frame timeline, adjustable FPS, auto-turn, native/enlarged day/night views, ground anchors and contact/bone overlays. Reference cycles retain all their frames. `assets/brushwork/motion-r3/validation.json` records 256 nonblank/unclipped unique cells, identical upper-body pixels throughout each loop, maximum joint increments below 0.5 CSS pixels including wrap, complete observed playback, DPR-1/DPR-2 mobile layout and zero browser errors. Ninety-six tests pass. These checks support the repair, not user approval of a final art style or whole roster.

Rebuild: `node tools/brushwork/bake-layered-walk.mjs --output=/private/tmp/layered-walk`. Verify: `node tools/brushwork/verify-layered-walk.mjs`. Assets: `assets/brushwork/motion-r3/`. Four remaining facings and non-walk actions are not supplied; the upper body is intentionally quiet/static. The candidate is unregistered; playable packs, scout, gameplay saves and public deployment are unchanged.

### Sixteen-Frame Tuning Trial

The user favored the 32-frame layered result as "so much better", then requested fewer frames and more movement. Its unchanged artwork/metadata remain in `assets/brushwork/motion-r3/`; its original inspector is preserved at `docs/art-directions/brushwork-walk-r3.html`. The default `brushwork-walk.html` now compares scout / approved 32-frame / revised 16-frame.

`motion-r4/` reuses the same generated components, increasing soldier stride/lift 18/6 -> 22/8 atlas pixels and walker 14/4 -> 17/6. Foreshortened rear steps increase 6/3 -> 7.5/4. Playback is 16/13 FPS so cycle durations stay one second / 1.23 seconds. A small twice-per-cycle body bob (soldier +/-2px, walker +/-1.6px) translates the torso and hips together while the foot trajectory remains ground-relative. Painting, 240px body density, 256x320 cells, anchor 128,300 and 21.28 CSS px display height are unchanged. Atlas width halves to 4096px.

`motion-r4/validation.json` covers all 128 unique nonblank/unclipped frames, observed 16-frame playback, frame stepping, auto-turn, native/night and DPR-1/DPR-2 mobile views. Measured head span is about 0.355 native CSS px, with residual drift after accounting for bob below 0.074px. Six focused rig tests extend the suite to 98 passing tests. Settings are recorded in `motion-r4/recipe.json`; this is a tuning trial, not gameplay integration or approval of all remaining facings/actions. Current game/saves/deployment are unchanged.

### Quieter Bob, More Foot Movement

The user favored the 16-frame result and requested a small refinement. It is retained at `brushwork-walk-r4.html`; the default `brushwork-walk.html` now compares scout / previous 16-frame / refined 16-frame. `motion-r5/` reuses the paintings and palette unchanged, reduces soldier/walker bob 25% to +/-1.5/1.2 atlas pixels, and increases stride to 24/18.5 and lift to 9/6.5 (rear 8.2/4.4). Sixteen frames at 16/13 FPS preserve pacing and size. Measured head span is 0.266/0.177 native CSS px, residual <0.05px and joint increments <1.20px including wrap; ankle travel increases across all four facings. All 128 cells and complete served playback pass the audit, with 98 passing tests and zero page errors. `motion-r5/{recipe,validation}.json` retains settings/evidence. Still a review candidate, not a gameplay replacement or a published pack.

### Filtered Edge Comparison

The user then reported animated edge flicker. `brushwork-walk.html` now compares scout / Pixel / Smooth using identical r5 sheets, phases, scale and anchors; `brushwork-walk-r5.html` retains the preceding motion-only comparison. Smooth defaults to high-quality Canvas image filtering and CSS automatic sampling, with Pixel as a reversible control. No blur filter, frame crossfade, atlas rebake or timing change is used. At native size, quiet-body temporal alpha curvature falls 24-71% at DPR 1 and 46-61% at DPR 2 across both actors and all four facings. This is a shimmer proxy, not a guarantee of zero flicker or accepted appearance. `motion-r5/sampling-validation.json` and `review-sampling/` preserve browser/evidence checks, including identical Pixel A/B canvases, all 16 playback frames, mobile DPR 1/2 and zero page errors. All 98 tests pass; gameplay/runtime pack filtering remains unchanged.

## Add a Production Pack

1. Create an asset directory and a version-1 manifest using `assets/sculpted-pixel/world/manifest.json` as the engine contract. Image paths resolve relative to the manifest and must stay inside this site's `assets/` directory.
2. Supply all 18 character IDs, all 14 static object IDs, eight facings, and each role's required clips. Characters define cell dimensions, foot anchor, body height, render scale, walk stride and strike action. SUV requires its directional idle frames only. Builder needs repair, medic needs heal, and survivors need gather. Bodies should retain the current ~21px ordinary-unit height unless separately approved.
3. Static images define source width, height and proportional foot anchor. Optional `displaySize` preserves logical CSS size when source density increases. The loader builds source-density alpha masks, so clicking and obscuration use the displayed silhouette. Preserve gameplay footprints when drawing the source art.
4. Terrain supplies 48 frame rectangles: grass/dirt/water, variants 0-15, plus a six-digit `baseColors` value for each material. Source cells are 64x32 times optional integer `resolutionScale` (1-8, default 1); the logical world footprint remains 64x32. Keep each material nearly flat and quiet; increased density must not add grain or dithering. Shorelines, selection, fog, fire and other gameplay effects remain shared renderer overlays.
5. Set optional top-level `imageSmoothing: true` for smooth cutout/rendered packs; omitted/false uses nearest-neighbor. Optional `imageSmoothingQuality` accepts `low`, `medium` or `high`, defaulting to the existing low quality. Both settings apply to actors, structures, props, build ghosts and terrain together.
6. Add `{ "id": "new-style", "label": "New Style", "manifest": "assets/new-style/manifest.json" }` to `assets/art-packs/registry.json`. Only finished packs belong in this registry. `tools/build-pages.mjs` exports every registered runtime pack, but not art concepts, production sources or review documents.

Loading validates role/action coverage and image bounds, decodes every image, then commits the whole pack atomically. Failed packs leave the prior graphics and preference intact. Loaded packs are cached for quick A/B switching; an older request cannot replace a newer choice. No game-save schema changes are required. Existing `sculptedActor`/`sculptedObject` helper names are compatibility APIs; they now resolve the active raster pack regardless of its art style.

## Review and Production

`http://127.0.0.1:8787/docs/art-directions/next-directions.html` presents twelve image-generated concept boards, including scene context and pose studies. Revision 2 replaces A/C/F, retains B/D/E/G/H unchanged, and adds two dark directions (I/J) plus two other media (K/L). Retired options and original images are preserved. Exact prompts, original image paths, actual dimensions and rejected medium-drift attempts are in `next-directions.json`. Use the built-in image-generation tool; the underlying model identity is not disclosed and no separately billed API was used.

These boards establish visual direction only. The lower rows are not verified sprite atlases or seamless animations. Ground noise and pose coverage still require production cleanup. After a direction is chosen, build one soldier and walker with eight-view masters, articulated walk/work/attack poses and explicit foot anchors; verify them at native game size before producing a full replacement pack. Coarse pixel concepts are not proof of a 24-32px native production grid: enforce that grid when drawing and packaging the actual assets.

Run `node --test tests/*.test.mjs` and `node tools/verify-art-packs.mjs` with the local server running. The browser check covers desktop/mobile concept reviews, menu pause, switching, refresh preference, saved selection/cargo restoration and an intentionally failed load; it writes screenshots and a report to a fresh temporary directory. `docs/art-directions/next-validation.json` records this iteration. The default assets themselves are unchanged.
