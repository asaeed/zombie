# Rigged Motion Trial

Review-only soldier and walker prototype. The active game skin, approved painted walks, simulation and saves are not modified. The blockout costume and vertex-color materials are not a recreation of the approved Brushwork appearance.

## Sources

- Model: Quaternius Universal Base Characters, free Standard version, male base. https://quaternius.com/packs/universalbasecharacters.html
- Motion: Quaternius Universal Animation Library, free Standard version. https://quaternius.com/packs/universalanimationlibrary.html
- Both publisher downloads include CC0 licenses, retained under `source/`.
- `source/model.gltf` retains the original rigged geometry and bone hierarchy, removes texture references and uses untextured materials. Original character buffer is unchanged. Role material regions and blockout equipment are applied by the baker.
- Clips are retargeted with immutable rest-relative local quaternion offsets. Target bone lengths are retained. Arm targets and pole vectors are subject-local, solved before facing rotation. No screen-left/right mirroring.

## Reproduce

```sh
node tools/rigged-pilot/build.mjs
node --test tests/rigged-pilot.test.mjs
node tools/rigged-pilot/verify.mjs
```

Review: `/docs/art-directions/rigged-motion.html`. Browser review requires only baked PNGs and metadata, not WebGL or Three.js. Baking uses the project's existing Three.js/Playwright dependencies and local Chrome; no additional paid service or software install.

Source mesh height: about 1.82 world units. Orthographic elevation: 30 degrees. Bake: 640px render reduced once into 160px cells, approximately 96px body, 21.28 CSS px body at game scale. Foot-plane pivot: 80,136. Eight true rendered directions. Sixteen samples per sequence, with explicit per-action cadence and loop/endpoint sampling. Padding includes the forward-foot motion envelope.

## Acceptance

Technical checks are not aesthetic approval. `review/validation.json` records decoded pixel bounds, playback, controls and protected-file checks. Visual findings, failures and remaining gaps belong in `review/findings.md`. This trial is not registered as a runtime art pack and is not included in the public Pages export.
