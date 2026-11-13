# Display-Only Resize Verification

2026-10-10 follow-up to the user-approved Rigged Tactics roster. Humanoids are 1.2x and the retained SUV 2.5x their original presentation sizes. Source geometry, all 17 humanoid PNGs, every clip, pivot, cadence, world art and other packs remain unchanged. SUV hit width, selection/shadow ellipse and health-bar width follow its presentation factor; gameplay collision radius does not change.

- `validation.json` / `atlas-audit.json`: fresh served verifier covers all 6,600 decoded cells, all action playback phases, actual destination scales/filtering, menu pause, atomic pack switching, saved selection/cargo, refresh, gathering to 20/delivery of 20, source-free export and zero browser errors. Fifty-six protected files remain exact, including all 17 new atlases and 39 untouched starting files. Input and renderer are excluded from this preservation count because their SUV presentation surfaces intentionally changed.
- `resize-validation.json`: real mouse click outside the old SUV hit width selects the enlarged vehicle; actual draw destinations reconstruct the original foot pivot for both soldier and SUV; physical SUV radius is unchanged.
- `preserved-hashes.json`: fingerprints checked by the fresh verifier.
- `current-asset-hashes.json`: current metadata/atlas/tool/runtime fingerprints. The parent `asset-hashes.json` remains the historical pre-resize production record.
- Saved desktop/mobile, day/night, crowded game and selected-vehicle screenshots document the resized display. Same-agent visual inspection, not independent-model review.

All 137 regression tests pass. The sprite-animation skill validator and local reference links pass. No new artwork or motion was generated, and no commit, push or publication was performed.
