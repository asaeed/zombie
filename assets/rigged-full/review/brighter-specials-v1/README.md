# Brighter special zombie bodies

Spitter uses an acid-green body (`0xb5de62`); Exploder uses a warm orange body and matching abdomen (`0xf0ab63`). Existing models, lower clothing, markers, movement and attack poses remain in place. Death sheets use the same body palettes.

Rendered from the existing rig and animation library through `tools/rigged-full/build.mjs` and `death.mjs`, using Three.js, the existing orthographic camera and lighting, and content-hashed PNG output. Source licenses remain in `assets/rigged-pilot/source/character-license.txt` and `animation-license.txt`.

Living atlas alpha channels are identical to their previous versions. Both characters retain all frame rectangles, facing calibration, scale, anchors, animation cadence and pose measurements. Death atlases retain their existing packing, pivot and timing; Spitter death frames were repacked into the original envelope after a one-pixel trim difference in the fresh render. Other character and world records are unchanged.

`palette-review.png` compares idle, walk, attack and death poses at three times game size. The implementation agent reviewed these and the served game in day/night lighting. `audit.json` records asset hashes, pixel comparisons and browser checks. All 342 regression tests passed.

Spitter has 78 HP (previously 65) and range 180 (previously 120). Exploder damage to buildings is capped at 150 on contact and 45 when shot down, so every full-health building survives one blast. Existing distance falloff and blast radii remain in place.
