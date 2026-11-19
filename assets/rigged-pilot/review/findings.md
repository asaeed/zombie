# Rigged Motion Trial: QA Findings

## Scope and Decision

The soldier/walker comparison is a review-only animation-method trial. It is not registered as a game skin. Existing Brushwork paintings, the approved directional walks, simulation and save state remain unchanged. The material colors, costume, proportions and tiny-size silhouettes do not reproduce the selected painted appearance. Do not expand this model to the roster or ship it as final art on technical success alone.

The base skinned model and library motion are artist-authored CC0 assets. Three.js retargeting, local arm constraints, equipment and PNG baking run locally. No Blender install, paid service, new image-generation call or independent visual-review model was used.

The user now finds the rigged trials much better. That feedback supports continuing the motion method, not installing the blockout appearance as a final skin. Rifle motion, grip contact, improved idle and walking clearance have positive feedback. The latest change retains the rifle on the soldier's back during gathering.

## Carry Attachment Correction

- Static world-space wrist targets previously counteracted torso motion, leaving the carried gun fixed in space. Idle/walk now use an immutable rest-relative torso transform to move the rifle as one attached object.
- Prop-local grip landmarks and hand-local palm offsets produce both wrist positions and orientations. Wrist origins are no longer treated as the grip surface. Independent hand-weighted mesh bounds put the palm center near local Y 0.0634, consistent with the chosen 0.06 landmark.
- The first revised low carry pose overreached the support arm in some walk samples. A slightly higher carry position keeps both palms in contact through the full stride without stretching or accepting a clamped hand. Current maximum palm error is below 0.0000001 model units.
- `soldier-weapon-witness.png` isolates the actual rendered rifle. Browser decoding shows movement in every idle/walk facing, no clipping, and continuous loop seams. This distinguishes attachment motion from unrelated body-pixel changes.
- `carry-validation.json` retains historical before/after decoded RGBA for the walking correction: its 384 soldier idle/shoot/gather and 384 walker cells were unchanged. Gathering appearance subsequently changes only to add the stowed rifle below. Eight-facing enlarged grip grids cover the carry cycles; native/enlarged, normal/slow and stepped playback remain available at the review link.

## Left Support-Arm Clearance

The initial elbow-only correction improved idle, which the user now accepts, but walking still merged into the torso. Prior joint-position regressions and visual review missed actual sleeve penetration. The walking support arm was near full extension and inherited upper/lower-arm roll from the unconstrained source walk; its wrist orientation also left little elbow freedom. Moving the pole alone was insufficient.

That correction changed only soldier walk. The left wrist cups around the fore-end while preserving the same palm contact. Left clavicle/upper/lower-arm roll starts from immutable bind orientation, the clavicle protracts slightly, and the walking elbow uses an outward/forward pole. Idle, rifle motion and right-arm solve remain untouched. All 128 walk samples were visually inspected in even/odd eight-facing enlarged grids, with selected before/after poses. Rear-view occlusion remains natural; a hidden arm is not rendered through the body.

`arm-clearance.json` confirms exact right-arm joints, palm target and rifle positions, plus byte-identical isolated rifle pixels. `mesh-clearance.json` replays emitted poses onto the source skin: 417 sleeve/hand vertices against a 501-vertex core torso convex hull and posed vest box. The rejected baseline intersects these volumes; a first wrist-only candidate still failed internally. The final 16-pose cycle has zero sampled intersections and positive vest clearance. Reconstruction error is below 0.000001 model units. Source and output hashes prevent stale evidence. This excludes the naturally connected shoulder seam and is not triangle collision, projected visibility or automatic anatomy approval. The user now approves this walking correction.

## Back-Mounted Rifle During Gathering

Previously the rifle was hidden during gathering. It now uses a diagonal back attachment driven by the animated torso's immutable rest delta. No hand targets, working limbs, body proportions or source motion are changed. It bends and turns with the torso and is naturally occluded in front views, rather than forced to show through the body. Idle, walk and shooting attachment logic stays unchanged.

`back-validation.json` confirms exact decoded RGBA for all 384 soldier idle/walk/shoot and 384 walker cells; all 128 gathering hand/boot records and the idle/walk rifle-only PNG are also unchanged. `soldier-back-witness.png` isolates the rendered stowed rifle: all 128 poses are nonblank/unclipped, move with the body and have continuous seams. The even/odd gathering grids were visually inspected across all eight facings, with selected before/after samples and native-size served views. This change supplies a stowed pose, not a new equip/stow transition. The new back attachment awaits user feedback.

## Caught Internally and Corrected

- Mutable retarget offsets leaked the last action's pose into subsequent clips. Offsets now use immutable rest records.
- Endpoint reach alone left open or incorrectly oriented weapon grips. Initial wrist orientation and finger flexion improved them, but did not resolve carry attachment or palm placement; the carry-specific correction above supersedes that limitation.
- Tight frame padding clipped 137 frames. Enlarged cells preserve approximately 96px bodies and 21.28 CSS px presentation; all 896 final cells are nonblank and unclipped.
- An imported boxing attack read as a defensive pose, not a monster reaching forward. Replaced with a forward constraint envelope, raised hands and upper-body lean.
- The rifle originally jumped from low carry into aim. It now raises, holds aim/recoils and lowers with smooth transitions over 16 samples.
- Equipment pouches now follow the moving vest rather than staying fixed in space.
- Programmatic playback changed the actor without synchronizing the unit menu. Controls now follow review state.
- A long-lived resized browser produced a tiled mobile screenshot. A fresh mobile context and actual canvas-pixel checks verify the served responsive layout; the captured result was visually inspected.

## Evidence

- `validation.json`: 896 decoded frames, zero blank/edge failures, 16 distinct walk frames in each of eight genuine rendered directions, all 16 observed during playback, stepping/slow controls, eight nonblank mobile canvases, no page errors, 38 original game/art files hash-identical.
- `game-regression.json`: existing 4,616-frame full skin audit; native scale/filtering, pause, save restoration, pack switching, gathering 20 supplies and delivery, source-free Pages export; no browser errors.
- `node --test tests/*.test.mjs`: 128 tests pass, including eleven narrow trial, attachment, support-elbow, source-skin and stowed-equipment contracts. These are not automated aesthetic approval.
- Complete 16-frame strips are exported for all seven sequences and eight directions, with painted baseline above trial frames. Seven peak grids expose every direction at native and enlarged size. Manual review covered those grids, cardinal and selected diagonal full cycles, source bind shape, forward attacks, rifle raise/recovery and mobile presentation. The untouched roster was not newly anatomy-reviewed. Full exported coverage is not a claim that every one of the 56 combinations has been manually approved.

## Remaining Gates

- Match Brushwork's recognizable proportions, palette, costume and painted material detail before proposing an installed replacement. This trial uses a thinner base figure and simplified equipment.
- Review full state transitions in an actual game scene once appearance passes; isolated clip playback does not establish integration acceptance.
- Whole-roster expansion and specialized animations remain unbuilt in this method.
- Existing painted gather-arm duplication and screen-axis attack limitations are diagnosed but not repaired in the live assets by this trial.
- A separate critical pass by the same agent is not independent review. The motion method, rifle/grip repair, idle and walking clearance have positive user feedback; latest back attachment and final appearance still need user review.

Review: http://127.0.0.1:8787/docs/art-directions/rigged-motion.html
