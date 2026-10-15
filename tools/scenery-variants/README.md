# Scenery Variants

Each existing tree, bush and rock now has two additional authored silhouettes. The original sprites, placement density, gameplay and collision rules remain unchanged.

The artwork was made with the included `image_gen.imagegen` tool using each original prop as its style, palette, camera and lighting reference. The tool did not expose its model identity. Exact accepted prompts and rejected-candidate notes are in `production.json`; original generated paintings are in `source/`.

The baker extracts faint alpha matte pixels using the existing 96/255 threshold, registers the lower contact region, and performs one high-quality reduction to six source pixels per CSS pixel. Night artwork uses the existing `nightColor` pass with identical geometry and alpha. Runtime chooses a variant from a stable tile-coordinate hash, independently of scenery eligibility. No extra animation or per-instance texture is created.

```sh
node tools/scenery-variants/bake.mjs
node tools/scenery-variants/bake.mjs --only=pine-2,bush-2
node tools/scenery-variants/check.mjs http://127.0.0.1:8787/ --output=/private/tmp/scenery-review
node --test tests/scenery-variants.test.mjs tests/art-loading.test.mjs tests/night-world.test.mjs
```

The tools require the same local Playwright/Chrome setup as the other asset-production tools. `CHROME_PATH` can override the browser executable. The baker also accepts `MODULE_ROOT` for a staged checkout that shares the main checkout's `node_modules`.

The sparse tree and spreading low bush were rejected after the first review. Their replacements are a dense younger pine at roughly 60% of the adult height and a rounded two-lobed bush. The other approved variations are unchanged. The sample map is at `docs/art-directions/scenery-map.html`; it uses actual runtime artwork and rendering, includes all nine variants, and never reads or writes game saves.

Visual review covered all nine props at native and enlarged sizes against day/night backgrounds, plus the actual served map at desktop/mobile sizes, 0.5x/1x/2x zoom and day/dusk/night. Silhouettes, palette, root contact, sharpness and consistency were reviewed by the producing agent, not an independent model. The initial spreading shrub and its halo-retaining edit were rejected and replaced with a fresh clean source.

Automated checks cover source fingerprints, dimensions, anchors, distinct images, deterministic balanced selection, unchanged scenery positions, complete preload/retry behavior, identical day/night alpha and aligned intermediate blends. These checks do not replace aesthetic review. The Pages export includes only final day/night sprites and runtime metadata, not source paintings, prompts or production tools.
