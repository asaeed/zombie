# Brushwork Source Repair R2

Local candidate installed on 2026-10-09. User motion acceptance is pending.

## Repairs

- Builder: replacement S/SE/E/NE/N near/far leg paintings, with authored hip/knee/ankle landmarks. The old E far boot points left while the character faces right; both replacement E boots point right. Left facings remain explicit mirrors.
- Soldier S idle/walk: integrated two-handed ready upper body. Other seven walking directions remain pixel-identical to the preserved baseline.
- Soldier/scout/sniper shoot: complete aimed upper-body paintings with both hands attached to the rifle, using restrained recoil and planted legs. The first new sniper N drawing aimed NE and was rejected; a separate straight rear drawing replaces it. Register to the cap rather than the raised barrel.
- Atlas packing: render shooting into local cell coordinates before copying into the atlas to eliminate position-dependent edge rounding on stationary feet.

No gameplay, world artwork, unrelated character atlases or other skins changed. Before-images are in `before/`; prompts, raw sources and rejected-pose provenance are in `../source/repair-r2/`.

## Review

`http://127.0.0.1:8787/docs/art-directions/brushwork-full-sprites.html`

The inspector displays synchronized Before/Now, enlarged and native-size views, frame stepping, day/night and complete cycle selection for every facing. The full `*-all.png` strips expose every frame, not just sampled peaks. `controls/` records the actual installed comparison viewer. `art-audit.json` covers every roster action's playback; `installed-audit.json` adds independent preserved-clip checks against served final assets.

Manually inspected replacement sources, full repaired action strips and served comparisons, focusing on toe/heel direction, shoulder/hand ownership, aiming, knee direction, foot lanes and transitions. These are targeted visual checks; no claim that every untouched character is now aesthetically acceptable.

## Verification

- `node --test tests/*.test.mjs`: 117 pass, zero failures.
- 4,616 runtime frames: nonblank and unclipped.
- 748 protected soldier/scout/sniper frames: exact decoded RGBA matches.
- Every shooting lower-body pixel: identical across frames in all eight directions for all three gun roles.
- Comparison toggle and all eight filmstrip directions pass; mobile resize constraint prevents transient overflow.
- Served game: correct scale/filtering, all actor/object types, pause, atomic skin switching, refresh/save restoration, full capacity-20 gather/delivery and source-free Pages export pass. No browser errors.
- 33 existing gameplay and unrelated art files remain SHA-256 identical.
- Sprite skill YAML and linked resources validated. Its bundled Python validator lacked PyYAML; Ruby's YAML parser provided the structural validation.

`served-game/validation.json` contains the complete behavior report. No commit, push or external publication was performed.
