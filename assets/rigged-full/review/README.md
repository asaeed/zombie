# Full Rigged Roster Review

Local optional pack `rigged` / Rigged Tactics. Accepted soldier/walker pilot images and clips are copied exactly. The user accepted the delivered roster on 2026-10-10. Subsequent display-only enlargement keeps humanoid frames unchanged at 1.2x presentation size and the retained SUV at 2.5x; future art/motion changes still require review.

## Retained evidence

Generated PNG captures and standalone HTML review snapshots were removed during the 2026-11-12 asset cleanup. JSON measurements, hashes and regression-test baselines remain. The screenshot folders described below are historical; use `node tools/rigged-full/verify.mjs` and `node tools/rigged-full/capture.mjs` to generate new captures in temporary directories. Current inspectors remain at `docs/art-directions/rigged-full-sprites.html` and `docs/art-directions/rigged-full-world.html`.

- `../validation.json`: final served browser audit, every action's complete playback, all 6,600 decoded cells, marker coverage, actual game scales/filtering, switching, saved selection/cargo, pause, capacity-20 gathering, export and zero browser errors.
- `atlas-audit.json`: decoded alpha, clipping, walk uniqueness and minimum neon pixels by special/action/facing.
- `served/`: desktop/mobile sprite inspector, day/night world, actual game and gathering screenshots.
- `cycles/`: every role/action/facing/frame in complementary even/odd grids. Eight-frame idle and the one-frame directional vehicle use `all` grids. Cell dimensions follow the actor's motion envelope so the review itself cannot clip raised equipment.
- `preservation.json`: hashes of the 41 starting gameplay/old-art files; final browser audit verifies they are unchanged.
- `asset-hashes.json`: fingerprints of final manifest, new atlases and production modules. Rerun the audit after any asset change.
- `resize/`: fresh display-size verification and served screenshots after the 1.2x humanoid / 2.5x SUV change; the original evidence above remains the pre-resize production record.

## Critical Pass

Same-agent inspection, not independent-model review. Manually inspected eight-facing walk phase grids for all new roles and variants, with additional complementary phases for the builder, scout, medic, heavy and runner. Inspected work/attack/gather grids for the tool roles, rifle users, ordinary variants and specials, plus actual day/night/native/mobile rendering. The automated playback observer covers all action phases; that does not independently judge anatomy or seamlessness.

Internal repairs before delivery:

- Builder repair tool follows the actual working left hand.
- Heavy swing retains the authored upper-body arc with planted hips, knees and feet instead of the source clip's lifted lower body.
- Runner keeps authored crouch articulation without doubled hunch or upright-walker hand constraints.
- Medic chest cross sits outside the source mesh and reads as a clean plus.
- Special markers remain visible from behind; a decoded-pixel check exposed hidden boss markers and the geometry was corrected.
- New gun users inherit the approved moving torso attachment, palm contacts and walking support-arm clearance; gathering uses the approved back attachment.
- Mobile screenshot capture waits for viewport reflow; fresh DPR-1/2 checks confirmed the responsive inspector.

## Limits

The CC0 source model has simpler costume/detail than the earlier painted concept. Equip/stow transition animations are not authored. Existing buildings, caches, terrain, props and white SUV are retained, not new art. The game remains a Canvas PNG renderer; Three.js is only used to bake the sprites. Legacy mobile gameplay HUD density is outside this sprite change. No commit, push or GitHub Pages publication was performed.
