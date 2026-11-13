# Warm-Cache Reload Check

Run `node tools/rigged-full/check-cache-reload.mjs` from the repository root.

The fixture uses a real HTTP server and one browser cache. It first serves a loader with the previous fixed-density terrain validator, reproducing `Incomplete terrain: grass/0`. Updated HTML then points to the new versioned loader. Ordinary reloads must render actual Rigged assets in both the game and outpost, without clearing the cache. The loader itself remains normally cacheable.

The check also makes the manifest unavailable, verifies a visible error with no fallback scene, recovers by switching packs, and checks the mobile viewport. `validation.json` records the assertions and actual draw sources; screenshots show the successful reloads. These are runtime/cache checks, not a new animation or aesthetic approval.

The user's existing Chrome cache was separately checked through the native browser UI: the outpost displayed Rigged Tactics and the current raster units and buildings after the fix. No game save was modified.
