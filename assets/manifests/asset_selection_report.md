# V0 Asset Selection Report

## Scope

This curation keeps only the minimum subset needed for a single small outdoor combat arena with readable combat feedback, simple reward UI, placeholder weapon support, and a narrow runtime character set.

## Selected

### Environment

Selected from `Medieval Village MegaKit [Standard]`:

- 1 ground tile set: uneven brick floor.
- 4 blocker/cover shapes: crate, two wooden fence variants, uneven brick wall.
- 3 thematic readability pieces: metal fence, stone arch, plaster-and-wood wall.

Reason:

- These pieces are modular, low-chaos, and sufficient to build one compact arena with cover, line-of-sight breaks, and medieval atmosphere.
- Runtime files were taken from the pack's `glTF` export, then normalized into deterministic names with shared material textures placed in `assets/game/environment/arena_outdoor/materials/`.

### Weapons

Selected from `KayKit Fantasy Weapons Bits 1.0 FREE`:

- 22 melee models
- 9 ranged models
- 1 shared texture used by the whole curated weapon set

Reason:

- The new KayKit source is purpose-built for weapon props and exposes lightweight runtime `gltf` files with a single shared texture.
- The full runtime weapon model set was curated because the pack is already narrowly scoped, coherent, and inexpensive compared with the previous FBX placeholders.
- This replaces the earlier `Items`-based placeholders and resolves the previous standalone bow gap.

### Characters

Selected as an explicit exception from:

- `Sword and Shield Pack`
- `Pro Longbow Pack`
- `Pro Melee Axe Pack`

Curated subset:

- 3 rigged body FBX files
- 20 animation FBX clips total

Coverage:

- leader / tank-disruptor: sword-and-shield body with idle, run, attack, block, cast, hit, death
- ranged companion / ranged enemy: archer body with idle, run, draw, attack, release, hit, death
- melee companion / melee chaser: axe body with idle, run, two attacks, guard, hit

Reason:

- The prototype needs actual characters and combat motion to run, and you explicitly approved violating the minimum-subset goal for character assets.
- Even with that exception, the curation still avoids wholesale import and keeps only the smallest practical clip set per body.

### VFX

Selected from `Super Pixel Effects Gigapack`:

- 2 hit effects
- 4 spell-use effects
- 4 status/downed/revive/warning effects

Reason:

- Only a tiny set of free, readable spritesheet effects was copied.
- Effects were chosen to cover melee hit feedback, cast start, projectile placeholder, two spell impacts, buff status, downed/revive, and warning marker.

### UI

Selected from `kenney_ui_pack` plus 4 item preview icons:

- frames for hotbar slots, bars, toggles, and order buttons
- 2 panel surfaces
- a tiny icon set for confirm/cancel/basic slot/reward emphasis
- 3 combat markers
- 4 reward icons from the `Items` previews

Reason:

- One consistent theme was kept instead of copying multiple color variants.
- The pack does not contain dedicated RPG panel kits, so a few generic button/panel textures were reused as the minimum V0 surfaces.

### Audio

Selected from `kenney_impact_sounds`:

- 4 combat impacts
- 1 spell-impact surrogate
- 3 UI surrogates

Reason:

- The pack is impact-focused, not UI-focused.
- Confirm/cancel/level-up sounds are therefore pragmatic surrogates, not semantically perfect UI cues.

## Excluded

- Entire raw pack folders.
- All archives, previews, screenshots, demo scenes, and bulk format variants not needed for runtime.
- OBJ and FBX weapon format duplicates from the KayKit pack.
- Duplicate Brightdawn texture variants.
- Extra weapon maps such as emissive, height, and metallic textures that do not materially improve V0 readability.
- Hundreds of VFX variants and all unnecessary color/style duplicates.
- Most of the Kenney UI theme permutations.
- Most of the Kenney impact sound near-duplicates.

## Gaps And Blockers

- Character runtime files remain FBX because no `glb` or `gltf` equivalents were available locally for the selected rigs and animation clips.
- The axe-based character subset does not currently include a matched death clip in the selected minimal slice, so downed handling for that rig may need either clip reuse testing or a later asset pass.

## Result

The repo now contains a documented, renamed, minimal V0 asset subset under `assets/game/` plus manifest files under `assets/manifests/`. The selection is intentionally conservative to keep browser prototype weight and repo bloat under control.
