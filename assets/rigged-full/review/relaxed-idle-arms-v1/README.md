# Relaxed standing arms

Heavy: lower the weapon-side elbow by directing the idle arm bend down in the animated chest frame. Preserve the existing palm target, club grip, body pose and breathing cycle.

Torchbearer: use the relaxed left-arm pose from the authored `Idle_Loop` while standing. Keep the existing torch-holding right arm and the rest of `Idle_Torch_Loop`.

Production uses the existing Three.js rig bake in `tools/rigged-full/build.mjs`; model and animation licenses remain in `assets/rigged-pilot/source`. Sizes, atlas geometry, pivots, clip cadence, facings and death animations are unchanged.

The implementation agent reviewed before/after contact sheets in all eight facings and the actual game renderer. Decoded pixels are identical in all 512 non-idle Heavy frames and 384 non-idle Torchbearer frames, covering walking, attacking and gathering. Their non-idle pose measurements and every other character record remain identical. Regression checks verify a lowered idle Heavy elbow and a hanging free Torchbearer forearm.

The audit also records the related sniper night-combat check: the previously hidden Spitter becomes visible inside firing range, the sniper returns fire, and the sniper survives while the attacker dies. This is an isolated local test, with all external browser requests blocked.
